"use strict";
// Phase 17F-B10-A — FAIL-FIRST tests of the Coding Load, Capacity & Certification Harness (runner/tests/load). node:test, no
// Docker, no network: every remote call goes through an injected fetch. LOAD1–LOAD25 are the contract the harness must satisfy
// BEFORE it may be used for qualification; the harness never redefines a Runner / API invariant, it only measures and gates.
// Fail-first on eb61b5d: runner/tests/load does not exist (every test below fails to load the module).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const LOAD = path.join(__dirname, "..", "load", "lib");
const L = () => require(path.join(LOAD, "index.js"));

const KEY = "test-only-load-runner-hmac-key-0123456789abcdef";          // TEST keys — never real secrets
const CB_KEY = "test-only-load-callback-hmac-key-fedcba987654321";
const SOURCE_CANARY = "CANARY_STUDENT_SOURCE_17FB10";
const STDIN_CANARY = "CANARY_HIDDEN_INPUT_17FB10";
const EXPECTED_CANARY = "CANARY_EXPECTED_OUTPUT_17FB10";
const BUILD_SHA = "0123456789abcdef0123456789abcdef01234567";
const neverFetch = () => { throw new Error("network must not be reached"); };
const remoteEnv = { RUNNER_URL: "https://runner.example.test", RUNNER_HMAC_KEY: KEY };

// ── target model (LOAD1, LOAD4, LOAD20) ─────────────────────────────────────────────────────────────────────────────────
test("LOAD1 production target REFUSES to start without the explicit operator acknowledgement (fail closed)", async () => {
  const { resolveTarget, PRODUCTION_ACK_ENV, PRODUCTION_ACK_VALUE, runScenario } = L();
  const noAck = resolveTarget({ target: "production", env: { ...remoteEnv } });
  assert.deepEqual([noAck.ok, noAck.code], [false, "PRODUCTION_NOT_ACKNOWLEDGED"]);
  const wrongAck = resolveTarget({ target: "production", env: { ...remoteEnv, [PRODUCTION_ACK_ENV]: "yes" } });
  assert.deepEqual([wrongAck.ok, wrongAck.code], [false, "PRODUCTION_NOT_ACKNOWLEDGED"]);
  // the whole run refuses too — and makes NO request while refusing
  const r = await runScenario({ scenario: "CERT-A", target: "production", env: { ...remoteEnv }, buildSha: BUILD_SHA, deps: { fetchImpl: neverFetch } });
  assert.deepEqual([r.ok, r.code], [false, "PRODUCTION_NOT_ACKNOWLEDGED"]);
  const acked = resolveTarget({ target: "production", env: { ...remoteEnv, [PRODUCTION_ACK_ENV]: PRODUCTION_ACK_VALUE } });
  assert.equal(acked.ok, true);
  assert.equal(acked.name, "production");
  assert.equal(acked.failClosed, true);
  assert.equal(JSON.stringify(acked).includes(KEY), false, "the key is never enumerable");
});

test("LOAD4 an unknown target is rejected; production needs https; staging / production need their configuration", () => {
  const { resolveTarget } = L();
  for (const t of ["prod", "PRODUCTION", "", undefined, null, "live", "dev"]) assert.equal(resolveTarget({ target: t, env: remoteEnv }).code, "UNKNOWN_TARGET", String(t));
  assert.equal(resolveTarget({ target: "staging", env: {} }).code, "TARGET_NOT_CONFIGURED");
  assert.equal(resolveTarget({ target: "staging", env: { RUNNER_URL: "https://staging.example.test" } }).code, "TARGET_NOT_CONFIGURED");
  assert.equal(resolveTarget({ target: "staging", env: remoteEnv }).ok, true);
  assert.equal(resolveTarget({ target: "production", env: { RUNNER_URL: "http://runner.example.test", RUNNER_HMAC_KEY: KEY, SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST: "I_UNDERSTAND" } }).code, "PRODUCTION_REQUIRES_HTTPS");
});

test("LOAD20 the local target runs a real (fake-sandbox) load with NO production credentials in the environment", async () => {
  const { runScenario } = L();
  const r = await runScenario({ scenario: "CERT-A", target: "local", env: {}, buildSha: BUILD_SHA, params: { jobs: 6, concurrency: 2 }, deps: { fetchImpl: neverFetch } });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
  assert.equal(r.report.target.name, "local");
  assert.equal(r.report.totals.offered, 6);
  assert.equal(r.report.totals.completed, 6);
  assert.equal(r.report.verdict, "PASS");
});

// ── safety ceilings (LOAD2, LOAD3) ──────────────────────────────────────────────────────────────────────────────────────
test("LOAD2 the hard maximum of total jobs is enforced at plan time AND at run time (hard stop, never exceeded)", async () => {
  const { planScenario, CEILINGS, createGovernor, runScenario } = L();
  const over = planScenario({ scenario: "CERT-D", target: "production", params: { jobs: CEILINGS.production.maxTotalJobs + 1, concurrency: 1 } });
  assert.deepEqual([over.ok, over.code], [false, "MAX_TOTAL_JOBS_EXCEEDED"]);
  const requested = planScenario({ scenario: "CERT-D", target: "local", params: { jobs: 4, concurrency: 1, ceilings: { maxTotalJobs: 3 } } });
  assert.deepEqual([requested.ok, requested.code], [false, "MAX_TOTAL_JOBS_EXCEEDED"]);
  const g = createGovernor({ maxTotalJobs: 3, maxConcurrency: 8, maxDurationMs: 60000, cooldownMs: 0 }, { now: () => 0 });
  assert.deepEqual([g.offer(), g.offer(), g.offer()], [true, true, true]);
  assert.equal(g.offer(), false);
  assert.equal(g.stopped().reason, "max-total-jobs");
  assert.equal(g.snapshot().ceilingExceeded, false);
  // a scenario cannot exceed the local ceiling even when asked nicely through parameters
  const r = await runScenario({ scenario: "CERT-D", target: "local", env: {}, buildSha: BUILD_SHA, params: { jobs: CEILINGS.local.maxTotalJobs + 1, concurrency: 1 }, deps: { fetchImpl: neverFetch } });
  assert.deepEqual([r.ok, r.code], [false, "MAX_TOTAL_JOBS_EXCEEDED"]);
});

test("LOAD3 the hard maximum concurrency is enforced: offered concurrency above the ceiling is refused, the pool never exceeds it", async () => {
  const { planScenario, CEILINGS, createGovernor, runPool } = L();
  const p = planScenario({ scenario: "CERT-D", target: "production", params: { jobs: 4, concurrency: CEILINGS.production.maxConcurrency + 1 } });
  assert.deepEqual([p.ok, p.code], [false, "MAX_CONCURRENCY_EXCEEDED"]);
  assert.ok(CEILINGS.production.maxConcurrency <= CEILINGS.staging.maxConcurrency);
  assert.ok(CEILINGS.production.maxTotalJobs < CEILINGS.staging.maxTotalJobs);
  assert.ok(CEILINGS.production.maxDurationMs <= CEILINGS.staging.maxDurationMs);
  const g = createGovernor({ maxTotalJobs: 100, maxConcurrency: 3, maxDurationMs: 60000, cooldownMs: 0 }, { now: () => 0 });
  let active = 0, peak = 0;
  await runPool(Array.from({ length: 12 }, (_, i) => i), 3, async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; }, g);
  assert.equal(peak, 3);
  assert.equal(g.snapshot().peakConcurrency, 3);
  assert.equal(g.snapshot().ceilingExceeded, false);
  assert.throws(() => createGovernor({ maxTotalJobs: 1, maxConcurrency: 0, maxDurationMs: 1, cooldownMs: 0 }), /concurrency/);
});

// ── report artifact hygiene (LOAD5, LOAD6, LOAD7) ───────────────────────────────────────────────────────────────────────
async function canaryRun() {
  const { runScenario } = L();
  const workload = { id: "X1", language: "python", kind: "success", source: "print(int(input()) * 2) # LOAD-KIND:success LOAD-FN:double " + SOURCE_CANARY, stdin: "21 " + STDIN_CANARY + "\n", cases: ["1 " + STDIN_CANARY + "\n", "2\n"], expectedOutputs: ["2 " + EXPECTED_CANARY, "4"], expect: { status: "success" }, limits: { timeMs: 2000, memoryMb: 128, outputBytes: 4096 } };
  const r = await runScenario({ scenario: "CERT-L", target: "local", env: {}, buildSha: BUILD_SHA, params: { jobs: 4, officialJobs: 2, concurrency: 2, workloads: [workload] }, deps: { fetchImpl: neverFetch } });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 500));
  assert.ok(r.report.totals.offered >= 6);
  return r;
}
test("LOAD5 student source is absent from the result artifact (JSON and Markdown)", async () => {
  const { toMarkdown } = L();
  const r = await canaryRun();
  const json = JSON.stringify(r.report), md = toMarkdown(r.report);
  assert.equal(json.includes(SOURCE_CANARY), false);
  assert.equal(md.includes(SOURCE_CANARY), false);
  assert.equal(/print\(int\(input\(\)\)/.test(json), false);
  assert.equal(JSON.stringify(r.report).includes("\"source\""), false, "no source field at all");
});
test("LOAD6 hidden test data (stdin, expected outputs) is absent from the result artifact", async () => {
  const { toMarkdown } = L();
  const r = await canaryRun();
  for (const text of [JSON.stringify(r.report), toMarkdown(r.report)]) {
    assert.equal(text.includes(STDIN_CANARY), false);
    assert.equal(text.includes(EXPECTED_CANARY), false);
    assert.equal(/"(stdin|expectedOutput|expectedOutputs|cases)"/.test(text), false);
  }
});
test("LOAD7 auth material (keys, signatures, auth headers, bearer tokens) is absent from the result artifact and the scan refuses it", async () => {
  const { toMarkdown, redactionScan, buildReport } = L();
  const r = await canaryRun();
  const json = JSON.stringify(r.report);
  for (const text of [json, toMarkdown(r.report)]) {
    assert.equal(text.includes(KEY), false); assert.equal(text.includes(CB_KEY), false);
    assert.equal(/x-sa-(runner|callback)-signature|v1=[0-9a-f]{64}|authorization|bearer /i.test(text), false);
  }
  assert.equal(/RUNNER_HMAC_KEY|SMARTASSESS_CALLBACK_HMAC_KEY/.test(json), false);
  // the scan is a guard, not a hope: a report smuggling any of these is REFUSED
  const bad = [{ key: "x" }, { signature: "v1=" + "a".repeat(64) }, { headers: { authorization: "Bearer abc" } }, { note: "RUNNER_HMAC_KEY=abc" }, { source: "print(1)" }, { stdin: "1" }, { expectedOutput: "x" }, { canary: SOURCE_CANARY }];
  for (const b of bad) assert.equal(redactionScan(b, { canaries: [SOURCE_CANARY] }).ok, false, JSON.stringify(b));
  assert.equal(redactionScan({ totals: { offered: 1 }, latency: { p50: 3 } }, { canaries: [SOURCE_CANARY] }).ok, true);
  assert.throws(() => buildReport({ ...r.report, attachments: { operator: { note: "token " + KEY } } }, { canaries: [KEY] }), /redaction/);
});

// ── aggregation (LOAD8, LOAD9, LOAD10, LOAD24) ──────────────────────────────────────────────────────────────────────────
test("LOAD8 p50 / p95 / p99 aggregation is deterministic (nearest rank over a sorted copy; input order is irrelevant)", () => {
  const { percentiles } = L();
  const a = percentiles([5, 1, 4, 2, 3, 10, 9, 8, 7, 6]);
  const b = percentiles([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { count: 10, min: 1, p50: 5, p90: 9, p95: 10, p99: 10, max: 10, mean: 5.5 });
  assert.deepEqual(percentiles(Array.from({ length: 100 }, (_, i) => i + 1)), { count: 100, min: 1, p50: 50, p90: 90, p95: 95, p99: 99, max: 100, mean: 50.5 });
  const input = [3, 1, 2];
  percentiles(input);
  assert.deepEqual(input, [3, 1, 2], "the input is not mutated");
});
test("LOAD24 percentiles behave for empty, one, two and large samples (never NaN, never undefined, never out of the sample)", () => {
  const { percentiles } = L();
  assert.deepEqual(percentiles([]), { count: 0, min: null, p50: null, p90: null, p95: null, p99: null, max: null, mean: null });
  assert.deepEqual(percentiles([7]), { count: 1, min: 7, p50: 7, p90: 7, p95: 7, p99: 7, max: 7, mean: 7 });
  assert.deepEqual(percentiles([7, 9]), { count: 2, min: 7, p50: 7, p90: 9, p95: 9, p99: 9, max: 9, mean: 8 });
  const big = Array.from({ length: 10007 }, (_, i) => (i * 7919) % 10007);
  const p = percentiles(big);
  assert.equal(p.count, 10007);
  for (const k of ["min", "p50", "p90", "p95", "p99", "max"]) { assert.ok(Number.isInteger(p[k]), k); assert.ok(big.includes(p[k]), k + " is a sample value"); }
  assert.ok(p.min <= p.p50 && p.p50 <= p.p90 && p.p90 <= p.p95 && p.p95 <= p.p99 && p.p99 <= p.max);
  assert.throws(() => percentiles([1, NaN]), /finite/);
  assert.throws(() => percentiles([1, "2"]), /finite/);
});
test("LOAD9 per-language accounting is correct (counts and timings are attributed to exactly one language and one outcome)", () => {
  const { createPracticeAccumulator } = L();
  const acc = createPracticeAccumulator();
  const rec = (language, status, ms, extra = {}) => acc.record({ language, httpStatus: 200, status, ms, workloadId: "w", ...extra });
  rec("python", "success", 10); rec("python", "timeout", 1200); rec("java", "success", 300); rec("java", "compile-error", 150); rec("csharp", "runtime-error", 90);
  acc.record({ language: "csharp", httpStatus: 503, code: "RUNNER_BUSY", ms: 2, workloadId: "w" });
  const s = acc.summary();
  assert.deepEqual([s.totals.offered, s.totals.completed, s.totals.busy, s.totals.failed], [6, 5, 1, 0]);
  assert.deepEqual(s.languages.python.outcomes, { success: 1, timeout: 1 });
  assert.deepEqual(s.languages.java.outcomes, { success: 1, "compile-error": 1 });
  assert.deepEqual(s.languages.csharp.outcomes, { "runtime-error": 1 });
  assert.equal(s.languages.csharp.busy, 1);
  assert.deepEqual([s.languages.python.latency.count, s.languages.java.latency.count, s.languages.csharp.latency.count], [2, 2, 1]);
  assert.equal(s.languages.python.latency.max, 1200);
  assert.equal(s.languages.java.latency.min, 150);
  assert.equal(Object.keys(s.languages).sort().join(","), "csharp,java,python");
  assert.equal(s.outcomes.success, 2);
  assert.equal(s.latency.count, 5, "busy answers are not latency samples of an execution");
  assert.throws(() => acc.record({ language: "ruby", httpStatus: 200, status: "success", ms: 1, workloadId: "w" }), /language/);
});
test("LOAD10 RUNNER_BUSY is counted separately from execution failures, rejections and network errors", () => {
  const { createPracticeAccumulator } = L();
  const acc = createPracticeAccumulator();
  acc.record({ language: "python", httpStatus: 503, code: "RUNNER_BUSY", ms: 1, workloadId: "w" });
  acc.record({ language: "python", httpStatus: 503, code: "RUNNER_BUSY", ms: 1, workloadId: "w" });
  acc.record({ language: "python", httpStatus: 200, status: "internal-error", ms: 5, workloadId: "w" });
  acc.record({ language: "python", httpStatus: 400, code: "REQUEST_INVALID", ms: 1, workloadId: "w" });
  acc.record({ language: "python", httpStatus: 0, error: "network", ms: 1, workloadId: "w" });
  acc.record({ language: "python", httpStatus: 200, status: "success", ms: 5, workloadId: "w" });
  const s = acc.summary();
  assert.equal(s.totals.busy, 2);
  assert.equal(s.totals.failed, 2, "internal-error + network error");
  assert.equal(s.totals.rejected, 1);
  assert.equal(s.totals.completed, 2, "an execution with a status is a completed request, including internal-error");
  assert.equal(s.totals.offered, 6);
  assert.equal(s.totals.busy + s.totals.rejected + s.totals.completed + s.totals.networkErrors, s.totals.offered, "every offered request lands in exactly one bucket");
});

// ── official accounting identity (LOAD11, LOAD12, LOAD16, LOAD22) ───────────────────────────────────────────────────────
function ledgerWith(n) {
  const { createOfficialLedger } = L();
  const led = createOfficialLedger();
  for (let i = 1; i <= n; i++) {
    const id = "cg_load" + String(i).padStart(18, "0");
    led.submitted(id, { language: "python", workloadId: "P1", cases: 2, actor: "student-01" });
    led.dispatched(id, { status: "accepted", httpStatus: 202, ms: 3 });
  }
  return led;
}
test("LOAD11 official accounting detects a MISSING job: accepted = complete + retryable + failed-terminal, no unexplained remainder", () => {
  const led = ledgerWith(3);
  const ids = led.jobIds();
  led.callbackReceived(ids[0], { outcome: "completed", ms: 50 }); led.acknowledged(ids[0], { answer: "applied", state: "complete" });
  led.callbackReceived(ids[1], { outcome: "failed", technicalCode: "RUNNER_INTERNAL", ms: 50 }); led.acknowledged(ids[1], { answer: "applied", state: "retryable" });
  // ids[2]: accepted, never heard of again
  const r = led.reconcile();
  assert.equal(r.accepted, 3);
  assert.deepEqual([r.complete, r.retryable, r.failedTerminal], [1, 1, 0]);
  assert.equal(r.remainder, 1);
  assert.deepEqual(r.lost, [ids[2]]);
  assert.equal(r.identityHolds, false);
  led.callbackReceived(ids[2], { outcome: "completed", ms: 70 }); led.acknowledged(ids[2], { answer: "applied", state: "complete" });
  const ok = led.reconcile();
  assert.deepEqual([ok.remainder, ok.lost.length, ok.identityHolds, ok.complete], [0, 0, true, 2]);
});
test("LOAD12 official accounting detects a DUPLICATE grade application (two 'applied' answers for one job)", () => {
  const led = ledgerWith(2);
  const [a, b] = led.jobIds();
  led.callbackReceived(a, { outcome: "completed", ms: 1 }); led.acknowledged(a, { answer: "applied", state: "complete" });
  led.callbackReceived(a, { outcome: "completed", ms: 1 }); led.acknowledged(a, { answer: "applied", state: "complete" });
  led.callbackReceived(b, { outcome: "completed", ms: 1 }); led.acknowledged(b, { answer: "applied", state: "complete" });
  const r = led.reconcile();
  assert.equal(r.duplicateApplications, 1);
  assert.deepEqual(r.duplicateApplied, [a]);
  assert.equal(r.complete, 2, "a duplicate application does not create a second complete job");
});
test("LOAD22 a duplicate callback answered alreadyApplied is recognised as IDEMPOTENT (counted as such, never as an application)", () => {
  const led = ledgerWith(1);
  const [a] = led.jobIds();
  led.callbackReceived(a, { outcome: "completed", ms: 1 }); led.acknowledged(a, { answer: "applied", state: "complete", score: 10 });
  led.callbackReceived(a, { outcome: "completed", ms: 1 }); led.acknowledged(a, { answer: "alreadyApplied", score: 10 });
  const r = led.reconcile();
  assert.equal(r.duplicateApplications, 0);
  assert.equal(r.duplicateCallbackAcks, 1);
  assert.equal(r.idempotencyViolations.length, 0);
  // the score must not move on a re-delivery
  led.callbackReceived(a, { outcome: "completed", ms: 1 }); led.acknowledged(a, { answer: "alreadyApplied", score: 11 });
  assert.deepEqual(led.reconcile().idempotencyViolations, [a]);
});
test("LOAD16 a KNOWN retryable state is never silently counted as complete, and a busy admission is explicit, not lost", () => {
  const { createOfficialLedger } = L();
  const led = createOfficialLedger();
  led.submitted("cg_load000000000000000001", { language: "java", workloadId: "J1", cases: 1, actor: "s" });
  led.dispatched("cg_load000000000000000001", { status: "busy", httpStatus: 503, ms: 1 });
  led.submitted("cg_load000000000000000002", { language: "java", workloadId: "J1", cases: 1, actor: "s" });
  led.dispatched("cg_load000000000000000002", { status: "accepted", httpStatus: 202, ms: 1 });
  led.callbackReceived("cg_load000000000000000002", { outcome: "failed", technicalCode: "SUITE_TIMEOUT", ms: 1 });
  led.acknowledged("cg_load000000000000000002", { answer: "applied", state: "retryable" });
  const r = led.reconcile();
  assert.deepEqual([r.offered, r.accepted, r.busy], [2, 1, 1]);
  assert.deepEqual([r.complete, r.retryable, r.failedTerminal, r.remainder], [0, 1, 0, 0]);
  assert.deepEqual(r.explicitRetryable.sort(), ["cg_load000000000000000002"]);
  assert.equal(r.identityHolds, true);
  assert.equal(r.lost.length, 0);
});

// ── journal consistency (LOAD13, LOAD14, LOAD15) ────────────────────────────────────────────────────────────────────────
const journal = over => ({ counts: { received: 0, running: 0, executed: 0, confirmed: 5, callback_failed: 0, superseded: 0, ...over }, quarantined: 0, corrupt: 0, truncated: false, ...(over && over.$ || {}) });
test("LOAD13 journal corruption (corrupt or quarantined records) fails the gate", () => {
  const { journalConsistency, evaluateGates } = L();
  assert.equal(journalConsistency(journal()).ok, true);
  assert.deepEqual(journalConsistency({ ...journal(), corrupt: 1 }).issues, ["corrupt-records"]);
  assert.deepEqual(journalConsistency({ ...journal(), quarantined: 2 }).issues, ["corrupt-records"]);
  const g = evaluateGates({ journal: { ...journal(), quarantined: 1 } });
  assert.equal(g.byId.G3.pass, false);
  assert.equal(g.correctnessPass, false);
});
test("LOAD14 owed callbacks (executed, never confirmed) and unexplained running / received fail the final-settlement gate", () => {
  const { journalConsistency, evaluateGates } = L();
  assert.deepEqual(journalConsistency(journal({ executed: 1 })).issues, ["owed-callbacks"]);
  assert.deepEqual(journalConsistency(journal({ running: 1 })).issues, ["unexplained-running"]);
  assert.deepEqual(journalConsistency(journal({ received: 2 })).issues, ["unexplained-received"]);
  assert.equal(evaluateGates({ journal: journal({ executed: 1 }) }).byId.G5.pass, false);
  // a scenario that intentionally leaves retryable work declares it — and the report says so explicitly
  const declared = journalConsistency(journal({ callback_failed: 1 }), { expected: { callback_failed: 1 } });
  assert.equal(declared.ok, true);
  assert.deepEqual(declared.declared, ["callback_failed:1"]);
});
test("LOAD15 callback_failed (parked) records fail the final-settlement gate unless explicitly declared", () => {
  const { journalConsistency, evaluateGates } = L();
  assert.deepEqual(journalConsistency(journal({ callback_failed: 1 })).issues, ["callback-failed"]);
  const g = evaluateGates({ journal: journal({ callback_failed: 1 }) });
  assert.equal(g.byId.G6.pass, false);
  assert.equal(g.verdict, "FAIL");
  assert.match(g.byId.G6.detail, /callback_failed/);
});

// ── report / reproducibility (LOAD17, LOAD18, LOAD23) ───────────────────────────────────────────────────────────────────
function minimalReportInput(over = {}) {
  const { createPracticeAccumulator, createOfficialLedger, evaluateGates } = L();
  const acc = createPracticeAccumulator();
  acc.record({ language: "python", httpStatus: 200, status: "success", ms: 10, workloadId: "P1" });
  const gates = evaluateGates({ practice: acc.summary(), official: createOfficialLedger().reconcile(), journal: journal(), responsive: true, governor: { ceilingExceeded: false } });
  return { target: { name: "local", remote: false }, buildSha: BUILD_SHA, runnerSha: BUILD_SHA, harnessVersion: "1.0.0", scenario: { id: "CERT-A", config: { jobs: 1, concurrency: 1, languages: ["python"], limits: { timeMs: 2000, memoryMb: 128, outputBytes: 4096 } } }, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 10, practice: acc.summary(), official: createOfficialLedger().reconcile(), gates, ...over };
}
test("LOAD17 a build SHA is REQUIRED in a qualification result (and must be a git object id)", () => {
  const { buildReport } = L();
  assert.throws(() => buildReport(minimalReportInput({ buildSha: undefined })), /buildSha/);
  assert.throws(() => buildReport(minimalReportInput({ buildSha: "" })), /buildSha/);
  assert.throws(() => buildReport(minimalReportInput({ buildSha: "main" })), /buildSha/);
  assert.throws(() => buildReport(minimalReportInput({ buildSha: "abc123" })), /buildSha/);
  const r = buildReport(minimalReportInput());
  assert.equal(r.buildSha, BUILD_SHA);
  assert.equal(r.runnerSha, BUILD_SHA);
  assert.equal(r.schemaVersion, 1);
});
test("LOAD18 the scenario configuration (id, concurrency, job count, language mix, limits, environment class, VM SKU) is recorded", () => {
  const { buildReport } = L();
  const r = buildReport(minimalReportInput({ vmSku: "Standard_D4s_v5" }));
  assert.equal(r.scenario.id, "CERT-A");
  assert.deepEqual(r.scenario.config.languages, ["python"]);
  assert.equal(r.scenario.config.concurrency, 1);
  assert.equal(r.scenario.config.jobs, 1);
  assert.deepEqual(r.scenario.config.limits, { timeMs: 2000, memoryMb: 128, outputBytes: 4096 });
  assert.equal(r.environmentClass, "local");
  assert.equal(r.vmSku, "Standard_D4s_v5");
  assert.equal(typeof r.harnessVersion, "string");
  assert.throws(() => buildReport(minimalReportInput({ scenario: { id: "CERT-A" } })), /scenario/);
  assert.equal(buildReport(minimalReportInput()).vmSku, null, "unknown SKU is recorded as unknown, never guessed");
});
test("LOAD23 the final report can NEVER claim PASS when a correctness gate failed (whatever the performance numbers say)", () => {
  const { buildReport, evaluateGates, createPracticeAccumulator, createOfficialLedger } = L();
  const acc = createPracticeAccumulator();
  for (let i = 0; i < 20; i++) acc.record({ language: "python", httpStatus: 200, status: "success", ms: 5, workloadId: "P1" });
  const led = createOfficialLedger();
  led.submitted("cg_load000000000000000009", { language: "python", workloadId: "P1", cases: 1, actor: "s" });
  led.dispatched("cg_load000000000000000009", { status: "accepted", httpStatus: 202, ms: 1 });          // lost: never called back
  const gates = evaluateGates({ practice: acc.summary(), official: led.reconcile(), journal: journal(), responsive: true, governor: { ceilingExceeded: false } });
  assert.equal(gates.byId.G1.pass, false);
  assert.equal(gates.verdict, "FAIL");
  const r = buildReport(minimalReportInput({ official: led.reconcile(), gates }));
  assert.equal(r.verdict, "FAIL");
  assert.equal(r.correctness.pass, false);
  assert.equal(r.performance.p50 !== undefined || r.performance.latency !== undefined, true, "performance is still reported, separately");
  // tampering with the verdict field is detected by the builder
  assert.throws(() => buildReport({ ...minimalReportInput({ official: led.reconcile(), gates }), verdict: "PASS" }), /verdict/);
  const allGood = evaluateGates({ practice: acc.summary(), official: createOfficialLedger().reconcile(), journal: journal(), responsive: true, governor: { ceilingExceeded: false } });
  assert.equal(allGood.verdict, "PASS");
  assert.equal(evaluateGates({ practice: acc.summary(), official: createOfficialLedger().reconcile(), journal: journal(), responsive: false, governor: { ceilingExceeded: false } }).byId.G7.pass, false);
  assert.equal(evaluateGates({ practice: acc.summary(), official: createOfficialLedger().reconcile(), journal: journal(), responsive: true, governor: { ceilingExceeded: true } }).byId.G8.pass, false);
});

// ── dry run / network isolation (LOAD19) ────────────────────────────────────────────────────────────────────────────────
test("LOAD19 a dry run never calls a network target — for every target class, including an acknowledged production", async () => {
  const { runScenario, PRODUCTION_ACK_ENV, PRODUCTION_ACK_VALUE, listScenarios } = L();
  let calls = 0;
  const spy = async () => { calls++; throw new Error("must not be called"); };
  for (const target of ["local", "staging", "production"]) {
    const env = target === "production" ? { ...remoteEnv, [PRODUCTION_ACK_ENV]: PRODUCTION_ACK_VALUE } : target === "staging" ? remoteEnv : {};
    for (const id of listScenarios().map(s => s.id)) {
      const r = await runScenario({ scenario: id, target, env, dryRun: true, buildSha: BUILD_SHA, deps: { fetchImpl: spy } });
      if (r.ok) { assert.equal(r.dryRun, true, id); assert.ok(r.plan.totals.jobs >= 1, id + " plans at least one job"); assert.equal(r.report, undefined, "a dry run produces a plan, never a qualification result"); }
      else assert.match(r.code, /^(TARGET_NOT_ALLOWED|PRODUCTION_OFFICIAL_DIRECT_REFUSED|MODE_NOT_SUPPORTED_ON_TARGET)$/, id + "@" + target + " → " + r.code);
    }
  }
  assert.equal(calls, 0);
  // the default invocation (no flags at all) is a dry run against local
  const d = await runScenario({ buildSha: BUILD_SHA, deps: { fetchImpl: spy } });
  assert.equal(d.ok, true); assert.equal(d.dryRun, true); assert.equal(d.target.name, "local");
  assert.equal(calls, 0);
});

// ── P1 regression (LOAD21) ──────────────────────────────────────────────────────────────────────────────────────────────
test("LOAD21 a P1 threshold regression (> 40 s end to end for Python / Java / C#) is detected and never averaged away", () => {
  const { p1Gate, P1_CEILING_MS } = L();
  assert.equal(P1_CEILING_MS, 40000);
  const ok = p1Gate({ python: [9000, 9100], java: [10700], csharp: [10900] });
  assert.deepEqual([ok.pass, ok.violations], [true, []]);
  const bad = p1Gate({ python: [9000], java: [1000, 40001], csharp: [10900] });
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.violations, [{ language: "java", ms: 40001, ceilingMs: 40000 }]);
  assert.equal(p1Gate({ python: [9000], java: [10700] }).pass, false, "a missing language is a failure, not a pass");
  assert.deepEqual(p1Gate({ python: [9000], java: [10700] }).missing, ["csharp"]);
  assert.equal(p1Gate({ python: [], java: [1], csharp: [1] }).pass, false);
});

// ── malformed scenarios (LOAD25) ────────────────────────────────────────────────────────────────────────────────────────
test("LOAD25 a zero-job or malformed scenario fails safely at plan time (never a PASS with nothing measured)", async () => {
  const { planScenario, runScenario } = L();
  assert.deepEqual([planScenario({ scenario: "CERT-D", target: "local", params: { jobs: 0, concurrency: 1 } }).ok, planScenario({ scenario: "CERT-D", target: "local", params: { jobs: 0, concurrency: 1 } }).code], [false, "SCENARIO_INVALID"]);
  for (const params of [{ jobs: -1 }, { jobs: 1.5 }, { jobs: "4" }, { concurrency: 0 }, { concurrency: -2 }, { languages: [] }, { languages: ["ruby"] }, { workloads: [] }, { workloads: [{ id: "bad" }] }, { officialJobs: -1 }, { casesPerJob: 0 }, { casesPerJob: 51 }]) {
    const p = planScenario({ scenario: "CERT-L", target: "local", params: { jobs: 2, concurrency: 1, ...params } });
    assert.equal(p.ok, false, JSON.stringify(params));
    assert.equal(p.code, "SCENARIO_INVALID", JSON.stringify(params));
  }
  assert.equal(planScenario({ scenario: "CERT-Z", target: "local", params: {} }).code, "UNKNOWN_SCENARIO");
  assert.equal(planScenario({ scenario: "", target: "local", params: {} }).code, "UNKNOWN_SCENARIO");
  const r = await runScenario({ scenario: "CERT-D", target: "local", env: {}, buildSha: BUILD_SHA, params: { jobs: 0 }, deps: { fetchImpl: neverFetch } });
  assert.deepEqual([r.ok, r.code], [false, "SCENARIO_INVALID"]);
  assert.equal(r.report, undefined);
});
