"use strict";
// Phase 17F-B10-A — Independent Review Fix 2 (PR #249, reviewed head 8b6fe3a). FAIL-FIRST:
//   RF2-A QA1–QA4  the CERT-F / CERT-K requirement matrix reflects what is MEASURABLE: local (synthetic job really applied) requires
//                  Q-IDEMPOTENCY; staging / production (synthetic job cannot exist → UNKNOWN_JOB) are transport-only — staging
//                  CERT-F / CERT-K can PASS instead of being INCOMPLETE forever; no remote idempotency is ever claimed.
//   RF2-B AUTH1–4  the canonical qualification registry is the authority: scenario.config.qualification is reproducibility
//                  metadata that must EXACTLY match the canonical set (missing / extra / unknown / duplicate → the report is refused).
//   RF2-C AUTH5–6  an unknown scenario or target class fails CLOSED (refused, never PASS).
//   RF2-D EV1–EV9  every Q-check derives its result from the raw evidence; a stored summary boolean that contradicts the evidence
//                  gives FAIL and the contradiction is recorded (malformed certification metadata is refused instead).
// Fail-first on 8b6fe3a: staging requires Q-IDEMPOTENCY, metadata overrides the canon, unknown scenario → correctness only,
// checks trust p1.pass / transportOk / idempotency.pass / recovery.pass.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../load/lib/index.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const noNet = () => { throw new Error("no remote network"); };
const okGates = () => L.evaluateGates({ practice: L.createPracticeAccumulator().summary(), official: L.createOfficialLedger().reconcile(), journal: { counts: { received: 0, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0 }, quarantined: 0, corrupt: 0, truncated: false }, responsive: true, governor: { ceilingExceeded: false } });
const input = (scenarioId, target, over = {}) => ({ target: { name: target, remote: target !== "local" }, buildSha: SHA, runnerSha: SHA, scenario: { id: scenarioId, config: { jobs: 1, concurrency: 1, languages: ["python"] } }, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1, gates: okGates(), ...over });
const withQ = (scenarioId, target, qualification, over = {}) => { const i = input(scenarioId, target, over); i.scenario.config.qualification = qualification; return i; };
const burst = over => ({ count: 4, concurrency: 2, nearMax: false, bytesPerBody: 172, expectedAnswer: "unknown", answers: { unknown: 4 }, latency: L.percentiles([1, 2, 3, 4]), transportOk: true, ...over });
const idem = over => ({ redeliveryAnswer: "alreadyApplied", before: { state: "complete", score: 1, applications: 1 }, after: { state: "complete", score: 1, applications: 1 }, stateUnchanged: true, scoreUnchanged: true, applicationsUnchanged: true, pass: true, ...over });
const recovery = over => ({ accepted: 6, outstandingAtCrash: { received: 5, running: 1, executed: 0, confirmed: 0 }, recoveredAtRestart: { received: 5, interrupted: 1, executed: 0 }, corruptAtRestart: 0, settled: true, complete: 6, retryable: 0, lost: 0, duplicateApplications: 0, executionsPerJobMax: 2, maxExecutionsAllowed: 2, reExecutedJobs: 1, resubmissionNeeded: false, pass: true, ...over });
const p1 = over => ({ pass: true, violations: [], missing: [], ceilingMs: 40000, samples: { python: L.percentiles([9000]), java: L.percentiles([10700]), csharp: L.percentiles([10900]) }, ...over });
const Q = (scenarioId, target, evidence) => L.evaluateQualification({ scenarioId, target, correctness: okGates(), ...evidence });

// ── RF2-A requirement matrix ────────────────────────────────────────────────────────────────────────────────────────────
test("QA1 CERT-F on local requires Q-IDEMPOTENCY (the synthetic job IS applied by the local receiver)", async () => {
  assert.deepEqual(L.requiredChecksFor("CERT-F", "local").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS", "Q-IDEMPOTENCY"]);
  assert.deepEqual(L.requiredChecksFor("CERT-K", "local").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS", "Q-IDEMPOTENCY"]);
  const r = await L.runScenario({ scenario: "CERT-F", target: "local", env: {}, buildSha: SHA, params: { jobs: 3, concurrency: 1 }, deps: { fetchImpl: noNet } });
  assert.equal(r.ok, true); assert.equal(r.report.verdict, "PASS");
  assert.deepEqual(r.report.scenario.config.qualification.slice().sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS", "Q-IDEMPOTENCY"]);
  assert.equal(r.report.qualification.checks.find(c => c.id === "Q-IDEMPOTENCY").pass, true);
});
test("QA2 CERT-F on STAGING is transport-only (UNKNOWN_JOB expected) and can PASS — end to end against a loopback 'remote' Runner + callback endpoint", async () => {
  assert.deepEqual(L.requiredChecksFor("CERT-F", "staging").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  // the plan never requests an idempotent re-delivery on staging
  const plan = L.planScenario({ scenario: "CERT-F", target: "staging", params: {} });
  assert.equal(plan.ok, true); assert.equal(plan.steps[0].idempotency, false); assert.deepEqual(plan.config.qualification.sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  // evidence-level: all UNKNOWN_JOB answers qualify the transport; nothing about idempotency is required or claimed
  const q = Q("CERT-F", "staging", { bursts: [burst()] });
  assert.equal(q.verdict, "PASS", JSON.stringify(q)); assert.equal(q.checks.some(c => c.id === "Q-IDEMPOTENCY"), false);
  // end to end: the local stack plays the remote staging Runner and the remote SmartAssess callback endpoint (answers UNKNOWN_JOB)
  const stack = L.createLocalStack({ maxConcurrency: 2 });
  await stack.start();
  try {
    stack.receiver.setMode("unknown");
    const env = { RUNNER_URL: stack.baseUrl, RUNNER_HMAC_KEY: stack.key, SMARTASSESS_CALLBACK_BASE_URL: stack.callbackUrl, SMARTASSESS_CALLBACK_HMAC_KEY: stack.callbackKey };
    const r = await L.runScenario({ scenario: "CERT-F", target: "staging", env, buildSha: SHA, params: { jobs: 5, concurrency: 2 }, deps: { fetchImpl: globalThis.fetch } });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
    assert.equal(r.report.target.name, "staging");
    assert.deepEqual(r.report.callbacks[0].answers, { unknown: 5 }); assert.equal(r.report.callbacks[0].expectedAnswer, "unknown"); assert.equal(r.report.callbacks[0].idempotency, undefined);
    // the transport check PASSES and nothing idempotency-related is required; the only open item is correctness (G3/G5/G6 need the
    // operator's journal-status attachment on a remote target) → INCOMPLETE, never a hidden FAIL and never an impossible requirement
    assert.equal(r.report.qualification.checks.find(c => c.id === "Q-CALLBACK-TRANSPORT").pass, true);
    assert.deepEqual(r.report.qualification.failed, []);
    assert.deepEqual(r.report.qualification.notEvaluated, ["Q-CORRECTNESS"]);
    assert.equal(r.report.correctness.verdict, "INCOMPLETE");
    assert.equal(r.report.verdict, "INCOMPLETE");
    // with the operator's journal-status attachment the same staging run is a full PASS
    const r2 = await L.runScenario({ scenario: "CERT-F", target: "staging", env, buildSha: SHA, params: { jobs: 5, concurrency: 2 }, attachments: { journalStatus: stack.journalStatus() }, deps: { fetchImpl: globalThis.fetch } });
    assert.equal(r2.ok, true, JSON.stringify(r2).slice(0, 300));
    assert.equal(r2.report.verdict, "PASS", JSON.stringify(r2.report.qualification) + JSON.stringify(r2.report.correctness.failed) + JSON.stringify(r2.report.correctness.notEvaluated));
  } finally { await stack.close(); }
});
test("QA3 CERT-K on staging likewise never becomes permanently INCOMPLETE through an impossible idempotency requirement", () => {
  assert.deepEqual(L.requiredChecksFor("CERT-K", "staging").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  const plan = L.planScenario({ scenario: "CERT-K", target: "staging", params: {} });
  assert.equal(plan.ok, true); assert.equal(plan.steps[0].idempotency, false);
  const q = Q("CERT-K", "staging", { bursts: [burst({ count: 1, nearMax: true, answers: { unknown: 1 } })] });
  assert.equal(q.verdict, "PASS", JSON.stringify(q));
});
test("QA4 production keeps the transport-only synthetic UNKNOWN_JOB contract", () => {
  assert.deepEqual(L.requiredChecksFor("CERT-F", "production").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  assert.deepEqual(L.requiredChecksFor("CERT-K", "production").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  assert.equal(Q("CERT-F", "production", { bursts: [burst()] }).verdict, "PASS");
  assert.equal(Q("CERT-F", "production", { bursts: [burst({ answers: { applied: 4 }, transportOk: false })] }).verdict, "FAIL", "an applied answer on production would mean a real job was touched — never the contract");
});

// ── RF2-B canonical authority ───────────────────────────────────────────────────────────────────────────────────────────
test("AUTH1 CERT-J metadata that omits Q-P1 is refused (metadata can never weaken the canon)", () => {
  assert.throws(() => L.buildReport(withQ("CERT-J", "local", ["Q-CORRECTNESS"], { p1: p1({ pass: false, violations: [{ language: "java", ms: 41000, ceilingMs: 40000 }] }) })), /qualification/);
  assert.throws(() => L.buildReport(withQ("CERT-J", "local", ["Q-CORRECTNESS"], { p1: p1() })), /qualification/);
  // the canonical set as metadata is accepted, in any order
  const ok = L.buildReport(withQ("CERT-J", "local", ["Q-P1", "Q-CORRECTNESS"], { p1: p1() }));
  assert.equal(ok.verdict, "PASS");
});
test("AUTH2 CERT-E metadata that omits Q-ADMISSION is refused", () => {
  assert.throws(() => L.buildReport(withQ("CERT-E", "local", ["Q-CORRECTNESS"], { saturation: { steps: [{ official: { offered: 8, accepted: 8, busy: 0, overAdmission: 5 } }] } })), /qualification/);
});
test("AUTH3 metadata with an unknown check id is refused", () => {
  assert.throws(() => L.buildReport(withQ("CERT-A", "local", ["Q-CORRECTNESS", "Q-MAGIC"])), /qualification/);
  assert.throws(() => L.buildReport(withQ("CERT-J", "local", ["Q-CORRECTNESS", "Q-P1", "Q-EXTRA"], { p1: p1() })), /qualification/);
});
test("AUTH4 metadata with a duplicate check id is refused", () => {
  assert.throws(() => L.buildReport(withQ("CERT-A", "local", ["Q-CORRECTNESS", "Q-CORRECTNESS"])), /qualification/);
  assert.throws(() => L.buildReport(withQ("CERT-J", "local", ["Q-CORRECTNESS", "Q-P1", "Q-P1"], { p1: p1() })), /qualification/);
  assert.throws(() => L.buildReport(withQ("CERT-A", "local", "Q-CORRECTNESS")), /qualification/);
});
test("AUTH5 an unknown scenario id is refused everywhere — never a correctness-only PASS", () => {
  assert.throws(() => L.requiredChecksFor("CERT-Z", "local"), /scenario/);
  assert.throws(() => L.requiredChecksFor("", "local"), /scenario/);
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-Z", target: "local", correctness: okGates() }), /scenario/);
  assert.throws(() => L.buildReport(input("CERT-Z", "local")), /scenario/);
  assert.throws(() => L.buildReport(input("cert-a", "local")), /scenario/);
});
test("AUTH6 an unknown target / environment class is refused — accepted targets are exactly local, staging, production", () => {
  for (const t of ["dev", "prod", "PRODUCTION", "", "live"]) {
    assert.throws(() => L.requiredChecksFor("CERT-A", t), /target/, t);
    assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: t, correctness: okGates() }), /target/, t);
    assert.throws(() => L.buildReport(input("CERT-A", t)), /target/, t);
  }
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", correctness: okGates() }), /target/, "a missing target is never defaulted");
});

// ── RF2-D evidence-derived checks ───────────────────────────────────────────────────────────────────────────────────────
test("EV1 p1.pass = true but violations contain Java 41 000 ms → Q-P1 FAIL, contradiction recorded", () => {
  const q = Q("CERT-J", "local", { p1: p1({ pass: true, violations: [{ language: "java", ms: 41000, ceilingMs: 40000 }] }) });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-P1"));
  assert.ok(q.contradictions.some(c => /Q-P1/.test(c)), JSON.stringify(q.contradictions));
  assert.equal(L.buildReport(input("CERT-J", "local", { p1: p1({ pass: true, violations: [{ language: "java", ms: 41000, ceilingMs: 40000 }] }) })).verdict, "FAIL");
});
test("EV2 p1.pass = true but missing contains csharp → Q-P1 FAIL; a non-canonical ceiling or an over-ceiling per-language maximum also fails", () => {
  assert.equal(Q("CERT-J", "local", { p1: p1({ pass: true, missing: ["csharp"] }) }).verdict, "FAIL");
  assert.equal(Q("CERT-J", "local", { p1: p1({ ceilingMs: 60000 }) }).verdict, "FAIL", "a relaxed ceiling is not the canonical P1 ceiling");
  assert.equal(Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([9000]), java: L.percentiles([40001]), csharp: L.percentiles([9000]) } }) }).verdict, "FAIL", "a per-language maximum above the ceiling fails even with an empty violations list");
  assert.equal(Q("CERT-J", "local", { p1: p1() }).verdict, "PASS");
});
test("EV3 transportOk = true but answers { unknown: 3, applied: 1 } for count 4 expecting unknown → Q-CALLBACK-TRANSPORT FAIL", () => {
  const q = Q("CERT-F", "staging", { bursts: [burst({ answers: { unknown: 3, applied: 1 } })] });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-CALLBACK-TRANSPORT")); assert.ok(q.contradictions.length >= 1);
});
test("EV4 transportOk = true but the answer counts total 3 for count 4 → FAIL (a lost answer is a failed delivery)", () => {
  const q = Q("CERT-F", "staging", { bursts: [burst({ answers: { unknown: 3 } })] });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-CALLBACK-TRANSPORT"));
  assert.equal(Q("CERT-F", "staging", { bursts: [burst({ answers: { unknown: 5 } })] }).verdict, "FAIL", "more answers than deliveries is inconsistent evidence");
});
test("EV5 idempotency.pass = true but before.score ≠ after.score → Q-IDEMPOTENCY FAIL", () => {
  const q = Q("CERT-F", "local", { bursts: [burst({ expectedAnswer: "applied", answers: { applied: 4 }, idempotency: idem({ after: { state: "complete", score: 1001, applications: 1 } }) })] });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-IDEMPOTENCY")); assert.ok(q.contradictions.some(c => /Q-IDEMPOTENCY/.test(c)));
});
test("EV6 idempotency.pass = true but the application count changed (or the answer was `applied`, or a snapshot is missing) → FAIL", () => {
  const b = over => burst({ expectedAnswer: "applied", answers: { applied: 4 }, idempotency: idem(over) });
  assert.equal(Q("CERT-F", "local", { bursts: [b({ after: { state: "complete", score: 1, applications: 2 } })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "local", { bursts: [b({ redeliveryAnswer: "applied" })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "local", { bursts: [b({ before: null })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "local", { bursts: [b({ after: { state: "retryable", score: 1, applications: 1 } })] }).verdict, "FAIL");
});
test("EV7 recovery.pass = true but lost = 1 → Q-RECOVERY FAIL (one shared helper decides for the scenario and the check)", () => {
  const q = Q("CERT-G", "local", { recovery: recovery({ lost: 1 }) });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-RECOVERY")); assert.ok(q.contradictions.some(c => /Q-RECOVERY/.test(c)));
  assert.equal(L.recoveryVerdict(recovery({ lost: 1 })).pass, false);
  assert.equal(L.recoveryVerdict(recovery()).pass, true);
  assert.equal(L.recoveryVerdict(recovery({ duplicateApplications: 1 })).pass, false);
  assert.equal(L.recoveryVerdict(recovery({ resubmissionNeeded: true })).pass, false);
  assert.equal(L.recoveryVerdict(recovery({ executionsPerJobMax: 3 })).pass, false, "bounded re-execution: at most maxExecutionsAllowed per job");
  assert.equal(L.recoveryVerdict(recovery({ maxExecutionsAllowed: 99, executionsPerJobMax: 5 })).pass, false, "the allowance itself is bounded by the Runner's maxInterruptions policy");
});
test("EV8 recovery.pass = true but settled = false → FAIL", () => {
  const q = Q("CERT-G", "local", { recovery: recovery({ settled: false }) });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-RECOVERY"));
});
test("EV9 fully consistent evidence still PASSES for every scenario, and a real local CERT-G / CERT-E keep their verdicts", async () => {
  assert.equal(Q("CERT-J", "local", { p1: p1() }).verdict, "PASS");
  assert.equal(Q("CERT-F", "local", { bursts: [burst({ expectedAnswer: "applied", answers: { applied: 4 }, idempotency: idem() })] }).verdict, "PASS");
  assert.equal(Q("CERT-G", "local", { recovery: recovery() }).verdict, "PASS");
  assert.equal(Q("CERT-E", "local", { saturation: { steps: [{ officialMaxPending: 3, official: { offered: 8, accepted: 3, busy: 5, overAdmission: 0 } }] } }).verdict, "PASS");
  assert.equal(Q("CERT-A", "local", {}).verdict, "PASS");
  const g = await L.runScenario({ scenario: "CERT-G", target: "local", env: {}, buildSha: SHA, deps: { fetchImpl: noNet } });
  assert.equal(g.ok, true); assert.equal(g.report.verdict, "PASS"); assert.equal(g.report.recovery.maxExecutionsAllowed, 2); assert.deepEqual(g.report.qualification.contradictions, []);
  const e = await L.runScenario({ scenario: "CERT-E", target: "local", env: {}, buildSha: SHA, deps: { fetchImpl: noNet } });
  assert.equal(e.ok, true); assert.equal(e.report.correctness.verdict, "PASS"); assert.deepEqual(e.report.qualification.failed, ["Q-ADMISSION"]); assert.equal(e.report.verdict, "FAIL");
});
