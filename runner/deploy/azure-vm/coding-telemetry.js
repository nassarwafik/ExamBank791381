"use strict";
// Phase 17F-B1 — BOUNDED, SAFE operational telemetry of the coding execution path. Local diagnostics only (no HTTP route, no new
// gateway surface, no process started): it combines
//   • the journal aggregate (journal-status.js — counts per state, utilization, callback backlog),
//   • the gateway's structured journald events, fed as TEXT LINES on stdin (`journalctl -u smartassess-runner -o cat --since …`),
//   • the recovery-freshness judgement (recovery-freshness.js --json), when supplied,
// into ONE record `runner.coding.telemetry` with a health classification: healthy · saturated · backlogged · degraded.
//
// PRIVACY CONTRACT. The aggregation reads exactly three fields of an event (`event`, `language`, `durationMs`) and copies NOTHING
// else: never student source, stdin, stdout / stderr, hidden expected outputs, cases, keys, tokens, signatures, headers, job ids,
// request ids, target refs, student ids. Languages are bucketed to the registry keys + "other"; the key set of the output is
// fixed; samples per bucket, lines per run, UTF-8 bytes per line and total input bytes are capped WHILE reading (stdin is a
// bounded stream, never buffered whole). assertSafe() re-checks every emitted record against that contract.
//     journalctl -u smartassess-runner -o cat --since -1h | sudo -u smartassess-runner node deploy/azure-vm/coding-telemetry.js \
//         --dir=/data/smartassess-runner [--recovery=/path/to/recovery-freshness.json] [--json]
// Exit: 0 healthy · 3 saturated / backlogged / degraded · 2 usage / unreadable journal.
const fs = require("node:fs");
const path = require("node:path");
const { LANGUAGES } = require("../../gateway/registry.js");
const { journalStatus } = require("./journal-status.js");

// BOUNDS (Review Fix 1): applied WHILE stdin is read — lines, UTF-8 BYTES per line, total input bytes — never after buffering.
const LIMITS = Object.freeze({ maxLines: 100000, maxLineBytes: 16384, maxInputBytes: 64 * 1024 * 1024, maxSamplesPerBucket: 10000 });
const LANGS = Object.freeze([...new Set(Object.values(LANGUAGES).map(e => e.key))]);
const LANG_BUCKETS = Object.freeze([...LANGS, "other"]);
// every key the output may contain (assertSafe refuses anything else) — bounded cardinality by construction
const ALLOWED_KEYS = new Set(["event", "schemaVersion", "generatedAt", "window", "lines", "parsed", "ignored", "malformed", "oversized", "inputBytes", "truncated", "journal", "counts", "received", "running", "executed", "confirmed", "callback_failed", "superseded", "total", "capacity", "utilizationPercent", "callbackBacklog", "oldestOwedCallbackMinutes", "quarantined", "corrupt", "lockHeld", "attention", "health", "state", "reasons", "queue", "pending", "active", "official", "accepted", "completed", "compileErrors", "outcomes", "practice", "busy", "total", "callbacks", "retries", "failed", "recovery", "interrupted", "resumed", "regenerated", "writeFailed", "auth", "unauthorized", "durations", "count", "minMs", "p50Ms", "maxMs", "ageMinutes", "maxAgeMin", "success", "timeout", "runtime-error", "compile-error", "output-limit", "internal-error", "wrong-output", "memory-limit", "killed", ...LANG_BUCKETS]);
const FORBIDDEN_KEYS = Object.freeze(["source", "stdin", "stdout", "stderr", "expected", "expectedOutput", "expectedStdout", "cases", "key", "keys", "token", "secret", "signature", "authorization", "headers", "body", "payload", "requestId", "jobId", "studentId", "targetRef", "gradingKey", "answer", "code", "sample", "note", "message", "url", "host", "path"]);
const SUSPICIOUS_VALUE = /[0-9a-f]{32,}|ghp_|github_pat_|Bearer|sha256=|cg_[A-Za-z0-9_-]{8,}|og_[0-9a-f]{8,}|\//i;

const bucketOf = lang => (LANGS.includes(lang) ? lang : "other");
const emptyDurations = () => Object.fromEntries(LANG_BUCKETS.map(l => [l, { count: 0, samples: [] }]));
/** `count` counts every completed event (one bounded integer); only the first maxSamplesPerBucket durations feed min / p50 / max. */
const summarize = b => {
  if (!b.samples.length) return { count: b.count, minMs: null, p50Ms: null, maxMs: null };
  const sorted = [...b.samples].sort((a, b) => a - b);
  return { count: b.count, minMs: sorted[0], p50Ms: sorted[Math.floor((sorted.length - 1) / 2)], maxMs: sorted[sorted.length - 1] };
};
const push = (b, v) => { b.count++; if (Number.isFinite(v) && v >= 0 && b.samples.length < LIMITS.maxSamplesPerBucket) b.samples.push(Math.floor(v)); };
const OUTCOME_KEYS = new Set(["success", "timeout", "runtime-error", "compile-error", "output-limit", "internal-error", "wrong-output", "memory-limit", "killed"]);

const withLimits = o => (o && typeof o === "object" ? Object.freeze({ ...LIMITS, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k in LIMITS && Number.isInteger(v) && v > 0)) }) : LIMITS);

/**
 * The ONE aggregator. Only `event`, `language`, `durationMs` (and the outcome COUNTS of runner.official.completed) are ever
 * read; unknown events are counted as ignored; malformed / oversized lines are counted, never propagated; nothing of a line is
 * retained once it has been fed. `feed(text)` takes ONE already-split line; the per-line bound is UTF-8 BYTES. Never throws.
 */
function createAggregator(opts) {
  const limits = withLimits(opts);
  const out = {
    window: { lines: 0, parsed: 0, ignored: 0, malformed: 0, oversized: 0, inputBytes: 0, truncated: false },
    official: { accepted: 0, completed: 0, compileErrors: 0, outcomes: {} },
    practice: { completed: 0 },
    busy: { official: 0, practice: 0, total: 0 },
    callbacks: { confirmed: 0, retries: 0, failed: 0 },
    recovery: { interrupted: 0, resumed: 0, regenerated: 0 },
    journal: { corrupt: 0, truncated: 0, writeFailed: 0 },
    auth: { unauthorized: 0 },
    durations: { official: emptyDurations(), practice: emptyDurations() }
  };
  const full = () => out.window.lines >= limits.maxLines;
  /** a line the reader already knows is over the byte bound (its bytes were discarded, never decoded) */
  const oversized = () => { out.window.lines++; out.window.malformed++; out.window.oversized++; };
  /** `bytes` is the line's UTF-8 byte length when the caller already measured it on the wire (stream reader); otherwise measured here. */
  const feed = (raw, bytes) => {
    out.window.lines++;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) { out.window.ignored++; return; }                                    // blank lines (trailing newline) are not malformed
    const n = Number.isInteger(bytes) ? bytes : Buffer.byteLength(text, "utf8");
    if (n > limits.maxLineBytes) { out.window.malformed++; out.window.oversized++; return; }
    let e;
    try { e = JSON.parse(text); } catch { out.window.malformed++; return; }
    if (!e || typeof e !== "object" || typeof e.event !== "string") { out.window.malformed++; return; }
    out.window.parsed++;
    const lang = bucketOf(e.language), ms = Number(e.durationMs);
    switch (e.event) {
      case "runner.official.accepted": out.official.accepted++; break;
      case "runner.official.completed":
        out.official.completed++;
        if (e.compile === "compile-error") out.official.compileErrors++;
        if (e.outcomes && typeof e.outcomes === "object") for (const [k, v] of Object.entries(e.outcomes)) if (OUTCOME_KEYS.has(k) && Number.isFinite(Number(v))) out.official.outcomes[k] = (out.official.outcomes[k] || 0) + Math.max(0, Math.floor(Number(v)));
        push(out.durations.official[lang], ms);
        break;
      case "runner.execute.completed": out.practice.completed++; push(out.durations.practice[lang], ms); break;
      case "runner.official.busy": out.busy.official++; out.busy.total++; break;
      case "runner.execute.busy": out.busy.practice++; out.busy.total++; break;
      case "coding.runner.callback.confirmed": case "runner.callback.delivered": out.callbacks.confirmed++; break;
      case "coding.runner.callback.retry": out.callbacks.retries++; break;
      case "coding.runner.callback.failed": out.callbacks.failed++; break;
      case "coding.runner.execution.interrupted": out.recovery.interrupted++; break;
      case "coding.runner.execution.resumed": out.recovery.resumed++; break;
      case "coding.runner.execution.regenerated": out.recovery.regenerated++; break;
      case "coding.runner.journal.corrupt": out.journal.corrupt++; break;
      case "coding.runner.journal.truncated": out.journal.truncated++; break;
      case "coding.runner.journal.write-failed": out.journal.writeFailed++; break;
      case "runner.request.unauthorized": out.auth.unauthorized++; break;
      default: out.window.ignored++;
    }
  };
  const finish = () => { for (const kind of ["official", "practice"]) for (const l of LANG_BUCKETS) out.durations[kind][l] = summarize(out.durations[kind][l]); return out; };
  return { limits, feed, oversized, full, truncate: () => { out.window.truncated = true; }, bytes: n => { out.window.inputBytes += n; }, finish };
}

/** Already-split lines (array / iterable of strings) → bounded aggregate. Truncated when MORE than maxLines were offered. */
function aggregateEvents(lines, opts) {
  const a = createAggregator(opts);
  for (const raw of lines || []) {
    if (a.full()) { a.truncate(); break; }
    if (typeof raw === "string") a.bytes(Buffer.byteLength(raw, "utf8") + 1);
    a.feed(raw);
  }
  return a.finish();
}

/**
 * Review Fix 1 — BOUNDED STREAM aggregation of stdin (or any Readable of Buffers / strings). Bytes are consumed chunk by chunk;
 * lines are split on "\n" at the BYTE level; a line is decoded only when its byte length is within maxLineBytes (an oversized
 * line's bytes are dropped as they arrive, never buffered); reading STOPS — the source is destroyed — at maxInputBytes or when
 * maxLines are consumed and more input exists; both mark window.truncated. At most maxLineBytes of carry-over is ever held.
 */
async function aggregateStream(readable, opts) {
  const a = createAggregator(opts);
  const { maxLineBytes, maxInputBytes } = a.limits;
  let carry = [], carryBytes = 0, oversize = false, stop = false, total = 0;
  const completeLine = (buf, start, end) => {               // one line whose bytes are buf[start, end) plus the carry-over
    if (oversize) { oversize = false; a.oversized(); carry = []; carryBytes = 0; return; }
    const n = carryBytes + (end - start);
    if (n > maxLineBytes) a.oversized();
    else a.feed((carry.length ? Buffer.concat([...carry, buf.subarray(start, end)]) : buf.subarray(start, end)).toString("utf8"), n);
    carry = []; carryBytes = 0;
  };
  const hold = (buf, start) => {                              // a partial line at the end of a chunk: keep at most maxLineBytes
    if (oversize || start >= buf.length) return;
    const n = buf.length - start;
    if (carryBytes + n > maxLineBytes) { oversize = true; carry = []; carryBytes = 0; return; }
    carry.push(Buffer.from(buf.subarray(start, buf.length))); carryBytes += n;
  };
  try {
    for await (const chunk of readable) {
      let buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      if (a.full()) { if (buf.length) { a.truncate(); stop = true; } break; }
      if (total + buf.length > maxInputBytes) { buf = buf.subarray(0, Math.max(0, maxInputBytes - total)); a.truncate(); stop = true; }
      total += buf.length; a.bytes(buf.length);
      let start = 0;
      for (;;) {
        const nl = buf.indexOf(10, start);
        if (nl === -1) { hold(buf, start); break; }
        completeLine(buf, start, nl);
        start = nl + 1;
        if (a.full()) { if (start < buf.length || carryBytes || oversize) { a.truncate(); stop = true; } break; }
      }
      if (stop) break;
    }
  } finally {
    if (stop && typeof readable.destroy === "function") readable.destroy();
  }
  // the tail after the last newline: a complete line only when the read ended naturally (a partial line cut by the ceiling is dropped)
  if (!stop) { if (oversize) a.oversized(); else if (carryBytes) completeLine(Buffer.alloc(0), 0, 0); }
  carry = []; oversize = false;
  return a.finish();
}

/** total / capacity as a whole percentage, 0 when the capacity is unknown, never above 100. */
const utilizationPercent = (total, capacity) => (Number.isFinite(capacity) && capacity > 0 && Number.isFinite(total) && total > 0 ? Math.min(100, Math.floor((total / capacity) * 100)) : 0);

/** The whole-system record: journal aggregate + event aggregate + recovery freshness → health { state, reasons }. */
function buildTelemetry({ journal, events, recovery, nowMs = Date.now() }) {
  const j = journal && typeof journal === "object" ? journal : {};
  const counts = j.counts && typeof j.counts === "object" ? j.counts : {};
  const n = k => (Number.isFinite(Number(counts[k])) ? Number(counts[k]) : 0);
  const total = Number.isFinite(Number(j.total)) ? Number(j.total) : 0, capacity = Number.isFinite(Number(j.capacity)) ? Number(j.capacity) : 0;
  const attention = Array.isArray(j.attention) ? j.attention.filter(x => typeof x === "string") : [];
  const ev = events && typeof events === "object" ? events : aggregateEvents([]);
  const rec = recovery && typeof recovery === "object" && ["FRESH", "STALE", "UNKNOWN"].includes(recovery.state) ? { state: recovery.state, ageMinutes: Number.isFinite(recovery.ageMinutes) ? recovery.ageMinutes : null } : { state: "UNKNOWN", ageMinutes: null };
  const reasons = [];
  let state = "healthy";
  const worsen = s => { const order = ["healthy", "saturated", "backlogged", "degraded"]; if (order.indexOf(s) > order.indexOf(state)) state = s; };
  if (ev.busy && ev.busy.total > 0) { reasons.push("runner-busy"); worsen("saturated"); }
  if (n("callback_failed") > 0 || attention.includes("parked-callbacks")) { reasons.push("parked-callbacks"); worsen("backlogged"); }
  if (attention.includes("executed-result-waiting")) { reasons.push("executed-result-waiting"); worsen("backlogged"); }
  if (ev.callbacks && ev.callbacks.failed > 0 && !reasons.includes("parked-callbacks")) { reasons.push("callback-failures"); worsen("backlogged"); }
  for (const a of ["corrupt-or-quarantined", "truncated", "journal-near-capacity"]) if (attention.includes(a)) { reasons.push(a); worsen("degraded"); }
  if ((Number(j.corrupt) || 0) > 0 && !reasons.includes("corrupt-or-quarantined")) { reasons.push("corrupt-or-quarantined"); worsen("degraded"); }
  if (ev.journal && (ev.journal.corrupt > 0 || ev.journal.writeFailed > 0)) { reasons.push("journal-events"); worsen("degraded"); }
  if (rec.state !== "FRESH") { reasons.push("recovery-" + rec.state.toLowerCase()); worsen("degraded"); }
  return {
    event: "runner.coding.telemetry", schemaVersion: 1, generatedAt: new Date(nowMs).toISOString(),
    journal: { counts: Object.fromEntries(["received", "running", "executed", "confirmed", "callback_failed", "superseded"].map(k => [k, n(k)])), total, capacity, utilizationPercent: Number.isFinite(Number(j.utilizationPercent)) ? Math.min(100, Math.max(0, Number(j.utilizationPercent))) : utilizationPercent(total, capacity), callbackBacklog: Number.isFinite(Number(j.callbackBacklog)) ? Number(j.callbackBacklog) : n("executed") + n("callback_failed"), oldestOwedCallbackMinutes: Number.isFinite(j.oldestOwedCallbackMinutes) ? j.oldestOwedCallbackMinutes : Number.isFinite(j.oldestExecutedMinutes) ? j.oldestExecutedMinutes : null, quarantined: Number(j.quarantined) || 0, corrupt: Number(j.corrupt) || 0, truncated: j.truncated === true, lockHeld: j.lockHeld === true, attention },
    queue: { pending: n("received"), active: n("running") },
    window: ev.window, official: ev.official, practice: ev.practice, busy: ev.busy, callbacks: ev.callbacks, recovery: rec, auth: ev.auth, durations: ev.durations,
    health: { state, reasons }
  };
}

/**
 * Review Fix 1 — a recovery-freshness result handed to the telemetry (`--recovery=<recovery-freshness.js --json output>`) must be
 * CURRENT. `checkedAt` (stamped by recovery-freshness.js) dates the verdict; the file's own age is added to ageMinutes and the
 * 240-min policy is re-applied. Missing / invalid / future checkedAt, or a verdict older than the policy window → UNKNOWN.
 */
function loadRecoveryResult(r, { nowMs = Date.now(), maxAgeMin = 240 } = {}) {
  const UNKNOWN = { state: "UNKNOWN", ageMinutes: null };
  if (!r || typeof r !== "object" || !["FRESH", "STALE", "UNKNOWN"].includes(r.state)) return UNKNOWN;
  const checked = typeof r.checkedAt === "string" ? Date.parse(r.checkedAt) : NaN;
  if (!Number.isFinite(checked) || checked > nowMs + 60000) return UNKNOWN;
  const fileAgeMin = Math.floor((nowMs - checked) / 60000);
  if (fileAgeMin > maxAgeMin) return UNKNOWN;
  if (r.state === "UNKNOWN" || !Number.isFinite(r.ageMinutes)) return UNKNOWN;
  const ageMinutes = Math.floor(r.ageMinutes) + fileAgeMin;
  return { state: ageMinutes > maxAgeMin ? "STALE" : r.state, ageMinutes };
}

/** Re-checks an emitted record against the privacy contract → { ok, violations: [...] }. */
function assertSafe(record) {
  const violations = [];
  const walk = (v, keyPath) => {
    if (violations.length > 20) return;
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, keyPath + "[" + i + "]")); return; }
    if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_KEYS.includes(k)) violations.push("forbidden key " + keyPath + "." + k);
        else if (!ALLOWED_KEYS.has(k)) violations.push("unknown key " + keyPath + "." + k);
        walk(x, keyPath + "." + k);
      }
      return;
    }
    if (typeof v === "string") {
      if (keyPath.endsWith(".attention") || /\.attention\[\d+\]$/.test(keyPath) || /\.reasons\[\d+\]$/.test(keyPath) || keyPath.endsWith(".state") || keyPath.endsWith(".event") || keyPath.endsWith(".generatedAt")) { if (v.length > 64 || SUSPICIOUS_VALUE.test(v)) violations.push("suspicious value at " + keyPath); return; }
      violations.push("free-text value at " + keyPath);
    }
  };
  walk(record, "$");
  return { ok: violations.length === 0, violations };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : ["bad", a]; }));
  const dir = typeof args.dir === "string" ? args.dir : process.env.RUNNER_JOURNAL_DIR;
  if (args.bad || !dir || !path.isAbsolute(dir)) { console.error("usage: journalctl -u smartassess-runner -o cat --since -1h | coding-telemetry.js --dir=/data/smartassess-runner [--recovery=/path/freshness.json] [--json]"); process.exit(2); }
  let journal;
  try { journal = journalStatus(dir); } catch { console.error("journal unreadable (run as the service user; is the disk mounted?)"); process.exit(2); }
  let recovery = null;
  if (typeof args.recovery === "string") { try { recovery = loadRecoveryResult(JSON.parse(fs.readFileSync(args.recovery, { encoding: "utf8", flag: "r" }).slice(0, 4096))); } catch { recovery = { state: "UNKNOWN", ageMinutes: null }; } }
  // stdin is consumed as a BOUNDED STREAM (maxLines · maxLineBytes · maxInputBytes applied while reading) — never read whole
  let events;
  try { events = process.stdin.isTTY ? aggregateEvents([]) : await aggregateStream(process.stdin); } catch { events = aggregateEvents([]); }
  const t = buildTelemetry({ journal, events, recovery });
  const safe = assertSafe(t);
  if (!safe.ok) { console.error("telemetry refused by the privacy self-check: " + safe.violations.join("; ")); process.exit(2); }
  if (args.json) console.log(JSON.stringify(t));
  else {
    console.log("health " + t.health.state.toUpperCase() + (t.health.reasons.length ? " (" + t.health.reasons.join(", ") + ")" : ""));
    console.log("journal " + t.journal.total + " / " + t.journal.capacity + " (" + t.journal.utilizationPercent + "%) · pending " + t.queue.pending + " · active " + t.queue.active + " · callback backlog " + t.journal.callbackBacklog + " (oldest owed " + (t.journal.oldestOwedCallbackMinutes === null ? "-" : t.journal.oldestOwedCallbackMinutes + " min") + ")");
    console.log("window " + t.window.lines + " lines · busy official " + t.busy.official + " practice " + t.busy.practice + " · callbacks confirmed " + t.callbacks.confirmed + " retries " + t.callbacks.retries + " failed " + t.callbacks.failed + " · unauthorized " + t.auth.unauthorized);
    for (const kind of ["official", "practice"]) console.log(kind + " durations: " + LANG_BUCKETS.map(l => { const d = t.durations[kind][l]; return l + " n=" + d.count + (d.count ? " p50=" + d.p50Ms + "ms max=" + d.maxMs + "ms" : ""); }).join(" · "));
    console.log("recovery " + t.recovery.state + (t.recovery.ageMinutes === null ? "" : " (" + t.recovery.ageMinutes + " min)"));
  }
  process.exit(t.health.state === "healthy" ? 0 : 3);
}

if (require.main === module) main().catch(() => process.exit(2));

module.exports = { LIMITS, LANG_BUCKETS, FORBIDDEN_KEYS, createAggregator, aggregateEvents, aggregateStream, loadRecoveryResult, buildTelemetry, assertSafe, utilizationPercent };
