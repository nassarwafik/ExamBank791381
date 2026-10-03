"use strict";
// Phase 17F-B1 — bounded, SAFE operational telemetry of the coding execution path — node:test, no Docker, no secrets.
// Built from what already exists on the host: the journal diagnostics (journal-status.js), the gateway's structured journald
// events (fed as text lines — this tool never spawns a process) and the recovery-freshness judgement. It exposes counts,
// percentages and duration aggregates only; it can never contain student source, stdin, stdout/stderr, hidden tests, keys,
// signatures, headers, job ids, request ids, target refs or any person identifier.
//   TEL1 no source code     TEL2 no hidden-test input / output     TEL3 no keys / tokens / signatures / headers
//   TEL4 bounded cardinality (fixed key set, registry languages + "other", bounded samples)
//   TEL5 journal health counts unchanged + utilization / backlog added      TEL6 callback_failed + owed callbacks observable
//   TEL7 recovery freshness FRESH / STALE / UNKNOWN (request failure)       TEL8 RUNNER_BUSY observable without payloads
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createJournal, JOURNAL_LIMITS } = require("../../gateway/journal.js");
const { journalStatus } = require("../../deploy/azure-vm/journal-status.js");
const freshness = require("../../deploy/azure-vm/recovery-freshness.js");

const SECRET_KEY = "k".repeat(64), SIGNATURE = "sha256=" + "a".repeat(64), TOKEN = "ghp_" + "Z".repeat(36);
const SOURCE = "print(open('/etc/passwd').read())  # STUDENT_SOURCE_MARKER", STDIN = "HIDDEN_STDIN_MARKER 7 9", EXPECTED = "HIDDEN_EXPECTED_MARKER 16", STDOUT = "STUDENT_STDOUT_MARKER", STDERR = "Traceback STUDENT_STDERR_MARKER";
const JOB = "cg_" + "ABCDEFGHIJKLMNOPQRST", REQ = "og_" + "0123456789abcdef01234567";
const line = (event, fields) => JSON.stringify({ event, level: "info", ...fields });
/** Gateway journald lines of a busy hour — including ADVERSARIAL lines that carry everything telemetry must never repeat. */
const EVENTS = [
  line("runner.gateway.started", { host: "127.0.0.1", port: 8787 }),
  line("runner.official.accepted", { jobId: JOB, language: "python", cases: 3, source: SOURCE, headers: { authorization: "Bearer " + TOKEN } }),   // adversarial: verbose accepted line
  line("runner.official.accepted", { jobId: JOB + "2", language: "java", cases: 50 }),
  line("coding.runner.execution.started", { jobId: JOB, language: "python", generation: 1 }),
  line("runner.official.completed", { jobId: JOB, language: "python", compile: "none", cases: 3, outcomes: { success: 3 }, durationMs: 1200 }),
  line("runner.official.completed", { jobId: JOB + "2", language: "java", compile: "compiled", cases: 50, outcomes: { success: 48, timeout: 2 }, durationMs: 9800 }),
  line("runner.official.completed", { jobId: JOB + "3", language: "csharp", compile: "compile-error", cases: 0, outcomes: {}, durationMs: 4100 }),
  line("runner.execute.completed", { requestId: REQ, language: "python", status: "success", durationMs: 350, source: SOURCE, stdin: STDIN, expected: EXPECTED, stdout: STDOUT, stderr: STDERR, cases: [{ stdout: STDOUT, expected: EXPECTED }] }),   // adversarial: verbose practice line
  line("runner.execute.completed", { requestId: REQ + "b", language: "java", status: "timeout", durationMs: 12000 }),
  line("runner.execute.busy", { requestId: REQ + "c", active: 1 }),
  line("runner.official.busy", { jobId: JOB + "4", pending: 64, body: { source: SOURCE, key: SECRET_KEY } }),   // adversarial: refused request echoed
  line("runner.official.busy", { jobId: JOB + "5", reason: "journal-full" }),
  line("coding.runner.callback.confirmed", { jobId: JOB, attempts: 1, confirmedAs: "applied" }),
  line("coding.runner.callback.retry", { jobId: JOB + "2", attempt: 1, status: 503, errorClass: "http-5xx", nextInMs: 2000 }),
  line("coding.runner.callback.failed", { jobId: JOB + "2", attempts: 8, status: 503, errorClass: "http-5xx", reason: "window-exhausted", body: { signature: SIGNATURE, cases: [{ expected: EXPECTED }] } }),   // adversarial: callback body echoed
  line("runner.request.unauthorized", { requestId: REQ + "d", reason: "signature" }),
  line("coding.runner.execution.interrupted", { jobId: JOB + "6", interruptions: 1 }),
  line("coding.runner.execution.resumed", { jobId: JOB + "6" }),
  line("coding.runner.journal.corrupt", { jobId: JOB + "7", reason: "schema" }),
  // adversarial: a (hypothetical, forbidden) verbose line and a malformed line — neither may leak or crash the aggregation
  line("runner.official.completed", { jobId: JOB + "8", language: "python", durationMs: 50, source: SOURCE, stdin: STDIN, expected: EXPECTED, stdout: STDOUT, stderr: STDERR, key: SECRET_KEY, headers: { authorization: "Bearer " + TOKEN, "x-sa-runner-signature": SIGNATURE }, cases: [{ token: "c1", stdout: STDOUT, expected: EXPECTED }], studentId: "student-42", targetRef: "a1/s1/1/q1" }),
  line("runner.execute.completed", { requestId: REQ + "e", language: "../../etc/passwd", status: "success", durationMs: 10 }),
  "this is not json",
  ""
];
const SENSITIVE = [SOURCE, "STUDENT_SOURCE_MARKER", STDIN, "HIDDEN_STDIN_MARKER", EXPECTED, "HIDDEN_EXPECTED_MARKER", STDOUT, STDERR, SECRET_KEY, SIGNATURE, TOKEN, "Bearer", "authorization", "x-sa-runner-signature", JOB, REQ, "student-42", "a1/s1/1/q1", "/etc/passwd"];

async function journalWith(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-telemetry-"));
  const j = createJournal({ dir });
  await j.open();
  const base = (jobId, state, extra = {}) => ({ schemaVersion: 1, jobId, payloadHash: "a".repeat(64), revision: null, targetRef: null, language: "python", state, generation: 1, interruptions: 0, receivedAt: new Date().toISOString(), startedAt: null, executedAt: null, updatedAt: new Date().toISOString(), outcome: null, technicalCode: null, resultHash: ["executed", "confirmed", "callback_failed"].includes(state) ? "b".repeat(64) : null, summary: null, callback: { attempts: 0, windowEnd: 8, rearms: 0, nextAt: null }, ...extra });
  let n = 0;
  for (const [state, extra] of records) await j.writeRecord(base("cg_telemetryprobe" + String(++n).padStart(6, "0"), state, extra));
  await j.close();
  return dir;
}
const hourAgo = () => new Date(Date.now() - 60 * 60000).toISOString();

test("TEL5 — journal health: every 17F-A1 count / flag is unchanged, and utilization + callback backlog are added", async () => {
  const dir = await journalWith([["received"], ["running"], ["executed", { executedAt: hourAgo() }], ["confirmed"], ["confirmed"], ["callback_failed"], ["superseded"]]);
  const s = journalStatus(dir);
  assert.deepEqual(s.counts, { received: 1, running: 1, executed: 1, confirmed: 2, callback_failed: 1, superseded: 1 });
  assert.equal(s.total, 7); assert.equal(s.capacity, JOURNAL_LIMITS.maxRecords); assert.equal(s.live, 2); assert.equal(s.owedCallback, 1);
  assert.ok(s.oldestExecutedMinutes >= 59); assert.equal(s.quarantined, 0); assert.equal(s.corrupt, 0); assert.equal(s.truncated, false); assert.equal(typeof s.lockHeld, "boolean");
  // B1 additions (compatible: nothing removed, nothing renamed)
  assert.equal(s.utilizationPercent, Math.floor(7 / JOURNAL_LIMITS.maxRecords * 100));
  assert.equal(s.callbackBacklog, 2, "executed (owed) + callback_failed (parked)");
  assert.equal(s.oldestOwedCallbackMinutes, s.oldestExecutedMinutes);
  assert.equal(s.health, "attention");
  const healthy = journalStatus(await journalWith([["confirmed"], ["confirmed"]]));
  assert.deepEqual([healthy.health, healthy.callbackBacklog, healthy.utilizationPercent, healthy.attention], ["ok", 0, 0, []]);
  const text = JSON.stringify(s);
  assert.ok(!/cg_telemetryprobe/.test(text), "no job id is ever printed");
});

test("TEL6 — callback_failed and owed-callback conditions are observable in the aggregate (attention + backlog + health)", async () => {
  const s = journalStatus(await journalWith([["executed", { executedAt: hourAgo() }], ["callback_failed"]]), { maxExecutedAgeMin: 15 });
  assert.deepEqual([...s.attention].sort(), ["executed-result-waiting", "parked-callbacks"]);
  assert.equal(s.callbackBacklog, 2);
  const fresh = journalStatus(await journalWith([["executed", { executedAt: new Date().toISOString() }]]), { maxExecutedAgeMin: 15 });
  assert.deepEqual(fresh.attention, [], "a result executed moments ago is not yet an attention item");
  assert.equal(fresh.callbackBacklog, 1, "but it is still counted as backlog");
});

test("TEL7 — recovery freshness is machine-readable: FRESH / STALE / UNKNOWN (API or request failure), fail-closed", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const fresh = freshness.judge({ lastSuccessAt: "2026-10-03T10:00:00Z" }, { nowMs: now, maxAgeMin: 240 });
  assert.deepEqual(fresh, { state: "FRESH", fresh: true, ageMinutes: 120, lastSuccessAt: "2026-10-03T10:00:00Z" });
  const stale = freshness.judge({ lastSuccessAt: "2026-10-03T07:00:00Z" }, { nowMs: now, maxAgeMin: 240 });
  assert.equal(stale.state, "STALE"); assert.equal(stale.fresh, false); assert.equal(stale.ageMinutes, 300);
  assert.deepEqual(freshness.judge({ lastSuccessAt: null }, { nowMs: now }), { state: "STALE", fresh: false, ageMinutes: null, lastSuccessAt: null });
  for (const r of [{ error: "GitHub API HTTP 403" }, { error: "request failed" }, null, undefined, "garbage"]) {
    const u = freshness.freshnessState(r, { nowMs: now, maxAgeMin: 240 });
    assert.equal(u.state, "UNKNOWN", JSON.stringify(r));
    assert.equal(u.fresh, false, "an unknown freshness is never FRESH");
    assert.equal(u.ageMinutes, null);
  }
  assert.equal(freshness.freshnessState({ lastSuccessAt: "2026-10-03T11:30:00Z" }, { nowMs: now, maxAgeMin: 240 }).state, "FRESH");
  assert.equal(freshness.freshnessState({ lastSuccessAt: "2026-10-03T07:00:00Z" }, { nowMs: now, maxAgeMin: 240 }).state, "STALE");
  assert.equal(freshness.DEFAULT_MAX_AGE_MIN, 240, "the pilot policy is unchanged");
});

test("TEL1 / TEL2 / TEL3 — aggregated telemetry never contains source, hidden stdin / expected output, stdout / stderr, keys, tokens, signatures, headers, job / request ids or person identifiers", () => {
  const T = require("../../deploy/azure-vm/coding-telemetry.js");
  const agg = T.aggregateEvents(EVENTS);
  const text = JSON.stringify(agg);
  for (const s of SENSITIVE) assert.ok(!text.includes(s), "telemetry leaks: " + s.slice(0, 32));
  assert.equal(T.assertSafe(agg).ok, true, JSON.stringify(T.assertSafe(agg)));
  // the adversarial verbose line still COUNTS (as a python completion of 50 ms) — only its payload is dropped
  assert.equal(agg.durations.official.python.count, 2);
  assert.equal(agg.durations.official.python.minMs, 50);
  // and the self-check catches a leak if one ever appeared
  const poisoned = JSON.parse(JSON.stringify(agg)); poisoned.durations.official.python.sample = SOURCE;
  assert.equal(T.assertSafe(poisoned).ok, false);
  const poisoned2 = JSON.parse(JSON.stringify(agg)); poisoned2.busy.jobId = JOB;
  assert.equal(T.assertSafe(poisoned2).ok, false, "forbidden key");
  const poisoned3 = JSON.parse(JSON.stringify(agg)); poisoned3.callbacks.note = SECRET_KEY;
  assert.equal(T.assertSafe(poisoned3).ok, false, "long hex / key-like value");
});

test("TEL4 — bounded cardinality: a fixed key set, registry languages + 'other', unknown events ignored, samples capped, malformed lines counted not propagated", () => {
  const T = require("../../deploy/azure-vm/coding-telemetry.js");
  const agg = T.aggregateEvents(EVENTS);
  assert.deepEqual(Object.keys(agg).sort(), ["auth", "busy", "callbacks", "durations", "journal", "official", "practice", "recovery", "window"].sort());
  assert.deepEqual(Object.keys(agg.durations.official).sort(), ["csharp", "java", "other", "python"]);
  assert.deepEqual(Object.keys(agg.durations.practice).sort(), ["csharp", "java", "other", "python"]);
  assert.equal(agg.durations.practice.other.count, 1, "an unknown language is bucketed, never used as a key");
  assert.equal(agg.window.lines, EVENTS.length); assert.equal(agg.window.malformed, 1); assert.ok(agg.window.ignored >= 1);
  assert.deepEqual(agg.durations.official.java, { count: 1, minMs: 9800, p50Ms: 9800, maxMs: 9800 });
  assert.deepEqual(agg.durations.practice.java, { count: 1, minMs: 12000, p50Ms: 12000, maxMs: 12000 });
  assert.equal(agg.official.accepted, 2); assert.equal(agg.official.completed, 4); assert.equal(agg.official.compileErrors, 1);
  assert.deepEqual(agg.official.outcomes, { success: 51, timeout: 2 });
  assert.equal(agg.practice.completed, 3);
  // bounded: a flood of lines never grows memory beyond the sample cap and the line cap
  const flood = []; for (let i = 0; i < T.LIMITS.maxLines + 500; i++) flood.push(line("runner.execute.completed", { requestId: "og_" + i, language: "python", status: "success", durationMs: i % 1000 }));
  const big = T.aggregateEvents(flood);
  assert.equal(big.window.lines, T.LIMITS.maxLines); assert.equal(big.window.truncated, true);
  assert.equal(big.durations.practice.python.count, T.LIMITS.maxLines);
  assert.ok(big.durations.practice.python.p50Ms >= 0 && big.durations.practice.python.maxMs <= 999);
  assert.ok(T.LIMITS.maxSamplesPerBucket <= 10000);
});

test("TEL8 — RUNNER_BUSY is observable (official + practice refusals counted) without any request payload", () => {
  const T = require("../../deploy/azure-vm/coding-telemetry.js");
  const agg = T.aggregateEvents(EVENTS);
  assert.deepEqual(agg.busy, { official: 2, practice: 1, total: 3 });
  assert.deepEqual(agg.callbacks, { confirmed: 1, retries: 1, failed: 1 });
  assert.deepEqual(agg.recovery, { interrupted: 1, resumed: 1, regenerated: 0 });
  assert.deepEqual(agg.journal, { corrupt: 1, truncated: 0, writeFailed: 0 });
  assert.deepEqual(agg.auth, { unauthorized: 1 });
  assert.ok(!JSON.stringify(agg.busy).includes("og_") && !JSON.stringify(agg.busy).includes("cg_"));
});

test("health classification — healthy / saturated / backlogged / degraded from journal + events + freshness, with reasons", async () => {
  const T = require("../../deploy/azure-vm/coding-telemetry.js");
  const quiet = T.aggregateEvents([line("runner.official.completed", { jobId: JOB, language: "python", durationMs: 100 })]);
  const okJournal = journalStatus(await journalWith([["confirmed"]]));
  const fresh = { state: "FRESH", fresh: true, ageMinutes: 10, lastSuccessAt: "x" };
  const t = T.buildTelemetry({ journal: okJournal, events: quiet, recovery: fresh, nowMs: Date.now() });
  assert.equal(t.event, "runner.coding.telemetry"); assert.equal(t.schemaVersion, 1);
  assert.deepEqual(t.health, { state: "healthy", reasons: [] });
  assert.deepEqual(t.queue, { pending: 0, active: 0 });
  assert.equal(t.journal.utilizationPercent, 0); assert.equal(t.journal.callbackBacklog, 0);
  assert.equal(t.recovery.state, "FRESH");
  assert.equal(T.assertSafe(t).ok, true);
  // saturated: busy refusals in the window
  const sat = T.buildTelemetry({ journal: okJournal, events: T.aggregateEvents([line("runner.official.busy", { jobId: JOB, pending: 64 })]), recovery: fresh });
  assert.equal(sat.health.state, "saturated"); assert.deepEqual(sat.health.reasons, ["runner-busy"]);
  // backlogged: parked / owed callbacks dominate saturation
  const back = T.buildTelemetry({ journal: journalStatus(await journalWith([["callback_failed"], ["executed", { executedAt: hourAgo() }]])), events: sat.events ? quiet : T.aggregateEvents([line("runner.official.busy", { jobId: JOB })]), recovery: fresh });
  assert.equal(back.health.state, "backlogged");
  assert.ok(back.health.reasons.includes("parked-callbacks") && back.health.reasons.includes("executed-result-waiting"));
  assert.ok(back.health.reasons.includes("runner-busy"), "every reason is listed, the worst state wins");
  // degraded: corrupt journal, stale or unknown recovery, near capacity
  const deg = T.buildTelemetry({ journal: { ...okJournal, corrupt: 1, attention: ["corrupt-or-quarantined"], health: "attention" }, events: quiet, recovery: fresh });
  assert.equal(deg.health.state, "degraded"); assert.ok(deg.health.reasons.includes("corrupt-or-quarantined"));
  assert.equal(T.buildTelemetry({ journal: okJournal, events: quiet, recovery: { state: "STALE", fresh: false, ageMinutes: 400 } }).health.state, "degraded");
  assert.equal(T.buildTelemetry({ journal: okJournal, events: quiet, recovery: { state: "UNKNOWN", fresh: false, ageMinutes: null } }).health.state, "degraded", "an unknown recovery state is never treated as healthy");
  assert.deepEqual(T.buildTelemetry({ journal: okJournal, events: quiet, recovery: null }).recovery, { state: "UNKNOWN", ageMinutes: null }, "no freshness input → UNKNOWN, never FRESH");
  const near = journalStatus(await journalWith([["confirmed"]])); near.total = Math.ceil(JOURNAL_LIMITS.maxRecords * 0.85); near.utilizationPercent = 85; near.attention = ["journal-near-capacity"]; near.health = "attention";
  assert.equal(T.buildTelemetry({ journal: near, events: quiet, recovery: fresh }).health.state, "degraded");
});

test("journal utilization never divides by zero / never exceeds 100 and the capacity is the gateway's own limit", async () => {
  const T = require("../../deploy/azure-vm/coding-telemetry.js");
  const s = journalStatus(await journalWith([]));
  assert.equal(s.utilizationPercent, 0); assert.equal(s.capacity, JOURNAL_LIMITS.maxRecords);
  const t = T.buildTelemetry({ journal: { ...s, total: s.capacity + 5, utilizationPercent: 100 }, events: T.aggregateEvents([]), recovery: null });
  assert.equal(t.journal.utilizationPercent, 100);
  assert.equal(T.utilizationPercent(5, 0), 0); assert.equal(T.utilizationPercent(1030, 1024), 100); assert.equal(T.utilizationPercent(512, 1024), 50); assert.equal(T.utilizationPercent(7, 1024), 0);
});
