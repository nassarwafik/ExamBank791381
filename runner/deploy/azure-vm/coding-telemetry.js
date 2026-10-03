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
// fixed; samples per bucket and lines per run are capped. assertSafe() re-checks every emitted record against that contract.
//     journalctl -u smartassess-runner -o cat --since -1h | sudo -u smartassess-runner node deploy/azure-vm/coding-telemetry.js \
//         --dir=/data/smartassess-runner [--recovery=/path/to/recovery-freshness.json] [--json]
// Exit: 0 healthy · 3 saturated / backlogged / degraded · 2 usage / unreadable journal.
const fs = require("node:fs");
const path = require("node:path");
const { LANGUAGES } = require("../../gateway/registry.js");
const { journalStatus } = require("./journal-status.js");

const LIMITS = Object.freeze({ maxLines: 100000, maxLineBytes: 16384, maxSamplesPerBucket: 10000 });
const LANGS = Object.freeze([...new Set(Object.values(LANGUAGES).map(e => e.key))]);
const LANG_BUCKETS = Object.freeze([...LANGS, "other"]);
// every key the output may contain (assertSafe refuses anything else) — bounded cardinality by construction
const ALLOWED_KEYS = new Set(["event", "schemaVersion", "generatedAt", "window", "lines", "parsed", "ignored", "malformed", "truncated", "journal", "counts", "received", "running", "executed", "confirmed", "callback_failed", "superseded", "total", "capacity", "utilizationPercent", "callbackBacklog", "oldestOwedCallbackMinutes", "quarantined", "corrupt", "lockHeld", "attention", "health", "state", "reasons", "queue", "pending", "active", "official", "accepted", "completed", "compileErrors", "outcomes", "practice", "busy", "total", "callbacks", "retries", "failed", "recovery", "interrupted", "resumed", "regenerated", "writeFailed", "auth", "unauthorized", "durations", "count", "minMs", "p50Ms", "maxMs", "ageMinutes", "maxAgeMin", "success", "timeout", "runtime-error", "compile-error", "output-limit", "internal-error", "wrong-output", "memory-limit", "killed", ...LANG_BUCKETS]);
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

/**
 * Gateway journald lines (strings, iterable) → bounded aggregate. Only `event`, `language`, `durationMs` (and the outcome
 * COUNTS of runner.official.completed) are ever read; unknown events are counted as ignored; malformed lines are counted, never
 * propagated. Never throws.
 */
function aggregateEvents(lines) {
  const out = {
    window: { lines: 0, parsed: 0, ignored: 0, malformed: 0, truncated: false },
    official: { accepted: 0, completed: 0, compileErrors: 0, outcomes: {} },
    practice: { completed: 0 },
    busy: { official: 0, practice: 0, total: 0 },
    callbacks: { confirmed: 0, retries: 0, failed: 0 },
    recovery: { interrupted: 0, resumed: 0, regenerated: 0 },
    journal: { corrupt: 0, truncated: 0, writeFailed: 0 },
    auth: { unauthorized: 0 },
    durations: { official: emptyDurations(), practice: emptyDurations() }
  };
  for (const raw of lines || []) {
    if (out.window.lines >= LIMITS.maxLines) { out.window.truncated = true; break; }
    out.window.lines++;
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) { out.window.ignored++; continue; }                       // blank lines (trailing newline) are not malformed
    if (text.length > LIMITS.maxLineBytes) { out.window.malformed++; continue; }
    let e;
    try { e = JSON.parse(text); } catch { out.window.malformed++; continue; }
    if (!e || typeof e !== "object" || typeof e.event !== "string") { out.window.malformed++; continue; }
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
  }
  for (const kind of ["official", "practice"]) for (const l of LANG_BUCKETS) out.durations[kind][l] = summarize(out.durations[kind][l]);
  return out;
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
    journal: { counts: Object.fromEntries(["received", "running", "executed", "confirmed", "callback_failed", "superseded"].map(k => [k, n(k)])), total, capacity, utilizationPercent: Number.isFinite(Number(j.utilizationPercent)) ? Math.min(100, Math.max(0, Number(j.utilizationPercent))) : utilizationPercent(total, capacity), callbackBacklog: Number.isFinite(Number(j.callbackBacklog)) ? Number(j.callbackBacklog) : n("executed") + n("callback_failed"), oldestOwedCallbackMinutes: Number.isFinite(j.oldestExecutedMinutes) ? j.oldestExecutedMinutes : null, quarantined: Number(j.quarantined) || 0, corrupt: Number(j.corrupt) || 0, truncated: j.truncated === true, lockHeld: j.lockHeld === true, attention },
    queue: { pending: n("received"), active: n("running") },
    window: ev.window, official: ev.official, practice: ev.practice, busy: ev.busy, callbacks: ev.callbacks, recovery: rec, auth: ev.auth, durations: ev.durations,
    health: { state, reasons }
  };
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

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : ["bad", a]; }));
  const dir = typeof args.dir === "string" ? args.dir : process.env.RUNNER_JOURNAL_DIR;
  if (args.bad || !dir || !path.isAbsolute(dir)) { console.error("usage: journalctl -u smartassess-runner -o cat --since -1h | coding-telemetry.js --dir=/data/smartassess-runner [--recovery=/path/freshness.json] [--json]"); process.exit(2); }
  let journal;
  try { journal = journalStatus(dir); } catch { console.error("journal unreadable (run as the service user; is the disk mounted?)"); process.exit(2); }
  let recovery = null;
  if (typeof args.recovery === "string") { try { const r = JSON.parse(fs.readFileSync(args.recovery, "utf8")); recovery = { state: r.state, ageMinutes: r.ageMinutes }; } catch { recovery = { state: "UNKNOWN", ageMinutes: null }; } }
  let stdin = "";
  try { if (!process.stdin.isTTY) stdin = fs.readFileSync(0, "utf8"); } catch { stdin = ""; }
  const t = buildTelemetry({ journal, events: aggregateEvents(stdin ? stdin.split("\n") : []), recovery });
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

if (require.main === module) main();

module.exports = { LIMITS, LANG_BUCKETS, FORBIDDEN_KEYS, aggregateEvents, buildTelemetry, assertSafe, utilizationPercent };
