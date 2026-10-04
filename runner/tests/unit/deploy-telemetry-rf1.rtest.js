"use strict";
// Phase 17F-B1 — Independent Review Fix 1 (node:test, no Docker, no secrets).
//   RF1 the telemetry CLI must consume stdin as a BOUNDED STREAM: no fs.readFileSync(0) of an arbitrarily large journalctl
//       stream; maxLines, a per-line UTF-8 BYTE bound and a total input-byte ceiling are applied WHILE reading, and the window is
//       marked truncated when a limit stops the read.                    RF1-A … RF1-F
//   RF2 oldestOwedCallbackMinutes covers executed AND callback_failed (parked) results; oldestExecutedMinutes stays legacy.  RF2-A … RF2-E
//   RF3 the runbook's monitoring / timer invocation must carry a current machine-readable recovery-freshness result; a telemetry
//       record without one is a valid DIAGNOSTIC (recovery UNKNOWN → degraded) and must be documented as such.          RF3 guard
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createJournal } = require("../../gateway/journal.js");
const { journalStatus } = require("../../deploy/azure-vm/journal-status.js");
const T = require("../../deploy/azure-vm/coding-telemetry.js");

const DEPLOY = path.join(__dirname, "..", "..", "deploy", "azure-vm");
const SOURCE = "print(open('/etc/passwd').read())  # STUDENT_SOURCE_MARKER", EXPECTED = "HIDDEN_EXPECTED_MARKER 16", TOKEN = "ghp_" + "Z".repeat(36);
const line = (event, fields) => JSON.stringify({ event, level: "info", ...fields });
const EVENTS = [
  line("runner.gateway.started", { host: "127.0.0.1", port: 8787 }),
  line("runner.official.accepted", { jobId: "cg_ABCDEFGHIJKLMNOPQRST", language: "python", cases: 3 }),
  line("runner.official.completed", { jobId: "cg_ABCDEFGHIJKLMNOPQRST", language: "python", compile: "none", cases: 3, outcomes: { success: 3 }, durationMs: 1200, note: "عربي — multibyte text in an ignored field" }),
  line("runner.official.completed", { jobId: "cg_ABCDEFGHIJKLMNOPQRST2", language: "java", compile: "compiled", cases: 50, outcomes: { success: 48, timeout: 2 }, durationMs: 9800 }),
  line("runner.execute.completed", { requestId: "og_0123456789abcdef01234567", language: "python", status: "success", durationMs: 350 }),
  line("runner.execute.busy", { requestId: "og_0123456789abcdef0123456c", active: 1 }),
  line("runner.official.busy", { jobId: "cg_ABCDEFGHIJKLMNOPQRST4", pending: 64 }),
  line("coding.runner.callback.confirmed", { jobId: "cg_ABCDEFGHIJKLMNOPQRST", attempts: 1 }),
  line("coding.runner.callback.failed", { jobId: "cg_ABCDEFGHIJKLMNOPQRST2", attempts: 8, status: 503 }),
  line("runner.request.unauthorized", { requestId: "og_0123456789abcdef0123456d", reason: "signature" }),
  "this is not json",
  ""
];
/** A Readable of Buffers whose chunk boundaries fall at arbitrary (odd) byte offsets — including inside multibyte characters. */
const chunked = (text, size) => { const buf = Buffer.from(text, "utf8"); const parts = []; for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size)); return Readable.from(parts); };
const strip = agg => JSON.parse(JSON.stringify(agg, (k, v) => (["inputBytes"].includes(k) ? undefined : v)));

test("RF1-A — a normal stream (odd chunk boundaries, multibyte text split across chunks) produces exactly the aggregate of aggregateEvents", async () => {
  assert.equal(typeof T.aggregateStream, "function", "a bounded stream aggregator is exported");
  const expected = T.aggregateEvents(EVENTS);
  for (const size of [1, 7, 64, 1024, 1 << 20]) {
    const got = await T.aggregateStream(chunked(EVENTS.join("\n") + "\n", size));
    assert.deepEqual(strip(got), strip(expected), "chunk size " + size);
  }
  // without a trailing newline the last line still counts; a lone trailing newline is one ignored blank line, as before
  const noTail = await T.aggregateStream(chunked(EVENTS.slice(0, -1).join("\n"), 13));
  assert.equal(noTail.window.lines, EVENTS.length - 1); assert.equal(noTail.practice.completed, 1); assert.equal(noTail.busy.total, 2);
  assert.equal(expected.window.truncated, false);
});

test("RF1-B / RF1-F — input beyond the total byte ceiling is not read, the window is marked truncated, and text after the ceiling can never reach the output", async () => {
  assert.ok(Number.isInteger(T.LIMITS.maxInputBytes) && T.LIMITS.maxInputBytes > 0, "an explicit total input ceiling exists");
  assert.ok(T.LIMITS.maxInputBytes >= T.LIMITS.maxLineBytes * 64, "the ceiling is large enough for a real journal window");
  assert.ok(T.LIMITS.maxInputBytes <= 256 * 1024 * 1024, "… and small enough to be a real memory bound");
  const good = line("runner.execute.completed", { requestId: "og_0123456789abcdef01234567", language: "python", status: "success", durationMs: 5 });
  const ceiling = 4096;
  const fits = Math.floor(ceiling / (good.length + 1));
  const before = Array(fits).fill(good);
  const poison = [line("runner.execute.completed", { language: "java", status: "success", durationMs: 7, source: SOURCE, expected: EXPECTED, headers: { authorization: "Bearer " + TOKEN } })];
  const after = Array(500).fill(poison[0]);
  let consumed = 0;
  const src = chunked([...before, ...poison, ...after].join("\n") + "\n", 97);
  src.on("data", c => { consumed += c.length; });
  const agg = await T.aggregateStream(src, { maxInputBytes: ceiling });
  assert.equal(agg.window.truncated, true, "the ceiling stopped the read");
  assert.ok(agg.window.inputBytes <= ceiling, "never more than the ceiling is accepted: " + agg.window.inputBytes);
  assert.ok(agg.window.lines <= fits, "no line beyond the ceiling is processed (" + agg.window.lines + " ≤ " + fits + ")");
  assert.equal(agg.durations.practice.java.count, 0, "the java poison line after the ceiling was never aggregated");
  assert.equal(agg.practice.completed, agg.window.lines - (agg.window.malformed || 0) - (agg.window.ignored || 0));
  const text = JSON.stringify(agg);
  for (const s of [SOURCE, "STUDENT_SOURCE_MARKER", EXPECTED, TOKEN, "Bearer", "authorization"]) assert.ok(!text.includes(s), "leak: " + s.slice(0, 24));
  assert.ok(consumed < (after.length * (poison[0].length + 1)) / 2, "the stream was stopped, not drained to the end (" + consumed + " bytes read)");
  assert.equal(T.assertSafe(T.buildTelemetry({ journal: {}, events: agg, recovery: null })).ok, true);
});

test("RF1-C — more than maxLines never processes more than maxLines (array API and stream API), and the window says so", async () => {
  const good = line("runner.execute.completed", { language: "python", status: "success", durationMs: 1 });
  const lines = Array(120).fill(good);
  const viaArray = T.aggregateEvents(lines, { maxLines: 50 });
  assert.equal(viaArray.window.lines, 50); assert.equal(viaArray.window.truncated, true); assert.equal(viaArray.durations.practice.python.count, 50);
  const viaStream = await T.aggregateStream(chunked(lines.join("\n") + "\n", 33), { maxLines: 50 });
  assert.equal(viaStream.window.lines, 50); assert.equal(viaStream.window.truncated, true); assert.equal(viaStream.durations.practice.python.count, 50);
  const exact = await T.aggregateStream(chunked(lines.slice(0, 50).join("\n") + "\n", 33), { maxLines: 50 });
  assert.equal(exact.window.lines, 50); assert.equal(exact.window.truncated, false, "exactly maxLines is not a truncation");
  // the default limits are the documented ones
  assert.equal(T.LIMITS.maxLines, 100000); assert.equal(T.LIMITS.maxLineBytes, 16384);
});

test("RF1-D — maxLineBytes is a UTF-8 BYTE bound: a multibyte line under the character limit but over the byte limit is bounded, never parsed", async () => {
  const pad = "ع".repeat(8300);                                                         // 8 300 chars = 16 600 bytes > 16 384
  const fat = line("runner.execute.completed", { language: "python", status: "success", durationMs: 9, pad });
  assert.ok(fat.length < T.LIMITS.maxLineBytes && Buffer.byteLength(fat, "utf8") > T.LIMITS.maxLineBytes, "fixture: under the char count, over the byte count");
  const thin = line("runner.execute.completed", { language: "python", status: "success", durationMs: 2 });
  for (const agg of [T.aggregateEvents([thin, fat, thin]), await T.aggregateStream(chunked([thin, fat, thin].join("\n") + "\n", 1000)), await T.aggregateStream(chunked([thin, fat, thin].join("\n") + "\n", 1 << 20))]) {
    assert.equal(agg.window.lines, 3);
    assert.equal(agg.practice.completed, 2, "only the two thin lines count");
    assert.equal(agg.window.malformed, 1, "the oversized line is counted as malformed");
    assert.equal(agg.window.oversized, 1, "… and reported as oversized");
    assert.equal(agg.durations.practice.python.count, 2);
  }
  // a line exactly at the byte bound is accepted
  const exact = line("runner.execute.completed", { language: "python", status: "success", durationMs: 3, pad: "x" });
  const fill = T.LIMITS.maxLineBytes - Buffer.byteLength(exact, "utf8");
  const atBound = line("runner.execute.completed", { language: "python", status: "success", durationMs: 3, pad: "x".repeat(fill + 1) });
  assert.equal(Buffer.byteLength(atBound, "utf8"), T.LIMITS.maxLineBytes);
  assert.equal((await T.aggregateStream(Readable.from([Buffer.from(atBound + "\n")]))).practice.completed, 1);
  // an oversized line with NO newline at the end of the input is bounded too (nothing is retained past the bound)
  const tail = await T.aggregateStream(chunked(thin + "\n" + fat, 500));
  assert.equal(tail.window.lines, 2); assert.equal(tail.window.oversized, 1); assert.equal(tail.practice.completed, 1);
});

test("RF1-E — the CLI has no unbounded stdin read: no fs.readFileSync(0 …) / readFileSync(process.stdin.fd) / full stdin string path", () => {
  const src = fs.readFileSync(path.join(DEPLOY, "coding-telemetry.js"), "utf8");
  assert.doesNotMatch(src, /readFileSync\(\s*0\b/, "fs.readFileSync(0) buffers all of stdin before any bound applies");
  assert.doesNotMatch(src, /readFileSync\(\s*process\.stdin/, "same, via process.stdin.fd");
  assert.doesNotMatch(src, /readFileSync\(\s*["']\/dev\/stdin/, "same, via /dev/stdin");
  assert.doesNotMatch(src, /stdin\.split\(/, "the whole-stdin string split is gone");
  assert.match(src, /aggregateStream\(\s*process\.stdin/, "the CLI feeds process.stdin to the bounded stream aggregator");
  assert.doesNotMatch(src, /child_process|spawn\(|execSync|net\.|http\.createServer|createServer\(/, "still no process, socket or endpoint");
});

// ─── RF2 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function journalWith(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-rf2-"));
  const j = createJournal({ dir });
  await j.open();
  const now = new Date().toISOString();
  const base = (jobId, state, extra = {}) => ({ schemaVersion: 1, jobId, payloadHash: "a".repeat(64), revision: null, targetRef: null, language: "python", state, generation: 1, interruptions: 0, receivedAt: now, startedAt: null, executedAt: null, updatedAt: now, outcome: null, technicalCode: null, resultHash: ["executed", "confirmed", "callback_failed"].includes(state) ? "b".repeat(64) : null, summary: null, callback: { attempts: 0, windowEnd: 8, rearms: 0, nextAt: null }, ...extra });
  let n = 0;
  for (const [state, extra] of records) await j.writeRecord(base("cg_rf2probe" + String(++n).padStart(10, "0"), state, extra));
  await j.close();
  return dir;
}
const minsAgo = m => new Date(Date.now() - m * 60000).toISOString();

test("RF2-A — only an executed record: oldestOwedCallbackMinutes == oldestExecutedMinutes; legacy fields unchanged", async () => {
  const s = journalStatus(await journalWith([["executed", { executedAt: minsAgo(60) }]]));
  assert.ok(s.oldestExecutedMinutes >= 59 && s.oldestExecutedMinutes <= 61);
  assert.equal(s.oldestOwedCallbackMinutes, s.oldestExecutedMinutes);
  assert.equal(s.owedCallback, 1); assert.equal(s.callbackBacklog, 1);
  assert.deepEqual(s.attention, ["executed-result-waiting"]);
});

test("RF2-B — only a callback_failed record: backlog > 0 AND a non-null owed age (the parked result is still owed)", async () => {
  const s = journalStatus(await journalWith([["callback_failed", { executedAt: minsAgo(30), updatedAt: minsAgo(5) }]]));
  assert.equal(s.callbackBacklog, 1);
  assert.equal(s.oldestExecutedMinutes, null, "legacy: no EXECUTED record");
  assert.ok(Number.isInteger(s.oldestOwedCallbackMinutes), "the parked result has an owed age");
  assert.ok(s.oldestOwedCallbackMinutes >= 29 && s.oldestOwedCallbackMinutes <= 31, "measured from executedAt (the original execution), not from the parking update: " + s.oldestOwedCallbackMinutes);
  assert.deepEqual(s.attention, ["parked-callbacks"], "attention semantics unchanged");
  // without executedAt the validated fallback is updatedAt
  const fb = journalStatus(await journalWith([["callback_failed", { executedAt: null, updatedAt: minsAgo(12) }]]));
  assert.ok(fb.oldestOwedCallbackMinutes >= 11 && fb.oldestOwedCallbackMinutes <= 13, "fallback updatedAt: " + fb.oldestOwedCallbackMinutes);
});

test("RF2-C — an OLDER callback_failed plus a NEWER executed: the owed age is the parked result's", async () => {
  const s = journalStatus(await journalWith([["callback_failed", { executedAt: minsAgo(120) }], ["executed", { executedAt: minsAgo(10) }]]));
  assert.ok(s.oldestExecutedMinutes >= 9 && s.oldestExecutedMinutes <= 11, "legacy field still measures executed only");
  assert.ok(s.oldestOwedCallbackMinutes >= 119 && s.oldestOwedCallbackMinutes <= 121, "owed age is the older parked result: " + s.oldestOwedCallbackMinutes);
  assert.equal(s.callbackBacklog, 2);
});

test("RF2-D — an OLDER executed plus a NEWER callback_failed: the owed age is the executed age", async () => {
  const s = journalStatus(await journalWith([["executed", { executedAt: minsAgo(90) }], ["callback_failed", { executedAt: minsAgo(3) }]]));
  assert.ok(s.oldestExecutedMinutes >= 89 && s.oldestExecutedMinutes <= 91);
  assert.equal(s.oldestOwedCallbackMinutes, s.oldestExecutedMinutes);
});

test("RF2-E — confirmed-only journal: no owed age, no backlog; and buildTelemetry carries the owed age (not the legacy one)", async () => {
  const s = journalStatus(await journalWith([["confirmed"], ["confirmed"], ["superseded"]]));
  assert.equal(s.oldestOwedCallbackMinutes, null); assert.equal(s.oldestExecutedMinutes, null); assert.equal(s.callbackBacklog, 0); assert.deepEqual(s.attention, []);
  const parked = journalStatus(await journalWith([["callback_failed", { executedAt: minsAgo(45) }]]));
  const t = T.buildTelemetry({ journal: parked, events: T.aggregateEvents([]), recovery: { state: "FRESH", ageMinutes: 1 } });
  assert.ok(t.journal.oldestOwedCallbackMinutes >= 44 && t.journal.oldestOwedCallbackMinutes <= 46, "telemetry reports the owed age of the parked result: " + t.journal.oldestOwedCallbackMinutes);
  assert.equal(t.journal.callbackBacklog, 1);
  assert.equal(t.health.state, "backlogged");
});

// ─── RF3 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("RF3 — runbook guard: every monitoring / timer invocation of coding-telemetry.js supplies --recovery=…; a diagnostic invocation without it is labelled as UNKNOWN / diagnostic", () => {
  const docs = ["README.md", "monitoring-checklist.md", "telemetry.md"].map(f => [f, fs.readFileSync(path.join(DEPLOY, f), "utf8")]);
  let invocations = 0, monitoring = 0, diagnostic = 0;
  for (const [f, text] of docs) {
    // backslash-continued shell lines are ONE invocation
    const logical = []; let acc = null;
    text.split("\n").forEach((l, i) => { if (acc) { acc.l += " " + l.trim(); } else acc = { l, i }; if (/\\\s*$/.test(l)) { acc.l = acc.l.replace(/\\\s*$/, ""); return; } logical.push(acc); acc = null; });
    if (acc) logical.push(acc);
    logical.forEach(({ l, i }) => {
      if (!/coding-telemetry\.js(\s|\\|$)/.test(l) || !/coding-telemetry\.js\s+(--|\\)|--dir=/.test(l + " ")) return;        // an invocation, not a mention
      invocations++;
      const where = f + ":" + (i + 1);
      const hasRecovery = /--recovery=\S+/.test(l);
      const diag = /UNKNOWN|diagnostic/i.test(l);
      if (/timer|cron|alert|mail|page|healthy|every \d+ min/i.test(l) || /--json/.test(l)) {
        monitoring++;
        assert.ok(hasRecovery, where + ": a monitoring / timer invocation of coding-telemetry.js MUST carry --recovery=<recovery-freshness.js --json result>, otherwise it can never be healthy: " + l.trim());
      } else {
        diagnostic++;
        assert.ok(hasRecovery || diag, where + ": an invocation without --recovery= must say it is a diagnostic whose recovery state is UNKNOWN: " + l.trim());
      }
    });
    // the two-step operator pipeline is documented: step 1 recovery-freshness.js --json, step 2 --recovery=<that file>
    if (f !== "README.md") { assert.match(text, /recovery-freshness\.js[^\n]*--json[^\n]*>/, f + " shows step 1 writing the freshness result"); assert.match(text, /--recovery=\S+/, f + " shows step 2 consuming it"); }
  }
  assert.ok(invocations >= 3, "the runbook documents the tool (" + invocations + " invocations)");
  assert.ok(monitoring >= 1, "at least one monitoring / timer invocation is documented");
  assert.ok(diagnostic >= 1, "at least one plain diagnostic invocation is documented");
  // no credential in any example
  for (const [, text] of docs) assert.doesNotMatch(text, /GITHUB_TOKEN=[^<\s$]/, "no token value in the docs");
});

test("RF3 — a recovery result handed to the telemetry must be CURRENT: a missing / stale checkedAt is UNKNOWN, the file's age is added, the 240-min policy decides", () => {
  assert.equal(typeof T.loadRecoveryResult, "function");
  const now = Date.parse("2026-10-03T12:00:00Z"), min = 60000;
  const at = m => new Date(now - m * min).toISOString();
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 100, checkedAt: at(10) }, { nowMs: now }), { state: "FRESH", ageMinutes: 110 });
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 220, checkedAt: at(30) }, { nowMs: now }), { state: "STALE", ageMinutes: 250 }, "a FRESH verdict that aged past the policy is STALE now");
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 5, checkedAt: at(300) }, { nowMs: now }), { state: "UNKNOWN", ageMinutes: null }, "a result older than the policy window proves nothing");
  assert.deepEqual(T.loadRecoveryResult({ state: "FRESH", ageMinutes: 5 }, { nowMs: now }), { state: "UNKNOWN", ageMinutes: null }, "no checkedAt → UNKNOWN");
  assert.deepEqual(T.loadRecoveryResult({ state: "STALE", ageMinutes: 400, checkedAt: at(1) }, { nowMs: now }), { state: "STALE", ageMinutes: 401 });
  assert.deepEqual(T.loadRecoveryResult({ state: "UNKNOWN", ageMinutes: null, checkedAt: at(1) }, { nowMs: now }), { state: "UNKNOWN", ageMinutes: null });
  for (const bad of [null, "x", { state: "FRESH", ageMinutes: 1, checkedAt: "garbage" }, { state: "fresh", ageMinutes: 1, checkedAt: at(1) }, { state: "FRESH", ageMinutes: 1, checkedAt: at(-30) }]) assert.deepEqual(T.loadRecoveryResult(bad, { nowMs: now }), { state: "UNKNOWN", ageMinutes: null }, JSON.stringify(bad));
  // recovery-freshness.js --json stamps checkedAt so step 2 can judge currency
  const F = require("../../deploy/azure-vm/recovery-freshness.js");
  const out = F.freshnessState({ lastSuccessAt: "2026-10-03T11:00:00Z" }, { nowMs: now, maxAgeMin: 240 });
  assert.equal(out.state, "FRESH");
  const src = fs.readFileSync(path.join(DEPLOY, "recovery-freshness.js"), "utf8");
  assert.match(src, /checkedAt/, "the JSON output carries checkedAt");
});
