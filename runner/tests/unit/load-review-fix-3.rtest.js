"use strict";
// Phase 17F-B10-A — Independent Review Fix 3 (PR #249, reviewed head 78114c3). FAIL-FIRST:
//   RF3-A RA1–RA6  a REMOTE (staging) CERT-E can evaluate Q-ADMISSION only from an EXPLICIT operator declaration of the Runner's
//                  maxPending (--runner-max-pending=N); the CERT-E catalog default (3) configures the LOCAL harness-owned Runner and
//                  must never be mistaken for a remote declaration. Without a declaration: officialMaxPending null, overAdmission
//                  null, Q-ADMISSION INCOMPLETE. With one: overAdmission = max(0, accepted − N) and Q-ADMISSION is evaluable.
//   RF3-B RB1–RB7  Q-ADMISSION evidence is validated: a step without an `official` object, a missing / NaN / Infinity / negative /
//                  string overAdmission → refused; null → legitimately not measured; a measured value is RE-DERIVED from
//                  official.accepted and officialMaxPending (derived value is authoritative; a stored 0 that disagrees → FAIL +
//                  contradiction).
//   RF3-C RP1–RP6  Q-P1 proves python, java AND csharp from the raw sample evidence (count ≥ 1, finite max ≤ 40 000 ms); a forged
//                  missing=[] / violations=[] cannot satisfy it; malformed sample shapes are refused.
//   RF3-D RE1–RE6  idempotency snapshots (applications non-negative integer, score null or finite) and recovery counts / limits
//                  (non-negative integers) are validated; malformed shapes are refused, measured failures FAIL.
// Fail-first on 78114c3: remote saturation evidence is always null, evalAdmission skips steps without `official`, evalP1 trusts
// `missing`, snapshots / recovery counts are not shape-checked, cli.js has no exported argument parser.
const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const L = require("../load/lib/index.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const noNet = () => { throw new Error("no remote network"); };
const okGates = () => L.evaluateGates({ practice: L.createPracticeAccumulator().summary(), official: L.createOfficialLedger().reconcile(), journal: { counts: { received: 0, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0 }, quarantined: 0, corrupt: 0, truncated: false }, responsive: true, governor: { ceilingExceeded: false } });
const Q = (scenarioId, target, evidence) => L.evaluateQualification({ scenarioId, target, correctness: okGates(), ...evidence });
const QE = (scenarioId, target, evidence) => L.buildReport({ target: { name: target, remote: target !== "local" }, buildSha: SHA, runnerSha: SHA, scenario: { id: scenarioId, config: { jobs: 1, concurrency: 1, languages: ["python"] } }, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1, gates: okGates(), ...evidence });
const step = (official, over = {}) => ({ offeredConcurrency: 8, runnerMaxConcurrency: 2, officialMaxPending: 3, practice: { offered: 0, completed: 0, busy: 0 }, official: { offered: 8, accepted: 3, busy: 5, overAdmission: 0, ...official }, ...over });
const freePort = () => new Promise((resolve, reject) => { const s = net.createServer(); s.on("error", reject); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const KEY2 = "test-only-rf3-staging-callback-key-0123456789abcdef";

/** A LOOPBACK STAGING REHEARSAL: the local stack plays the remote staging Runner; its official callbacks go to the HARNESS receiver. */
async function stagingRehearsal(params, { declare = true } = {}) {
  const port = await freePort();
  const stack = L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 3, maxActive: 1 }, callbackBaseUrl: "http://127.0.0.1:" + port, callbackKey: KEY2 });
  await stack.start();
  try {
    const env = { RUNNER_URL: stack.baseUrl, RUNNER_HMAC_KEY: stack.key, LOAD_CALLBACK_RECEIVER_PORT: String(port), LOAD_CALLBACK_HMAC_KEY: KEY2 };
    const r = await L.runScenario({ scenario: "CERT-E", target: "staging", env, buildSha: SHA, params: { jobs: 4, officialJobs: 8, casesPerJob: 1, settleTimeoutMs: 30000, ...(declare ? { runner: { maxPending: 3 } } : {}), ...params }, attachments: { journalStatus: stack.journalStatus() }, deps: { fetchImpl: globalThis.fetch } });
    assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
    return r.report;
  } finally { await stack.close(); }
}

// ── RF3-A remote CERT-E maxPending declaration ──────────────────────────────────────────────────────────────────────────
test("RA1 local CERT-E with the catalog default maxPending=3 keeps Q-ADMISSION measurable exactly as before (B10-F1 still detected)", async () => {
  const r = await L.runScenario({ scenario: "CERT-E", target: "local", env: {}, buildSha: SHA, deps: { fetchImpl: noNet } });
  assert.equal(r.ok, true);
  const s = r.report.saturation.steps[1];
  assert.equal(s.officialMaxPending, 3); assert.equal(s.maxPendingSource, "local-effective"); assert.ok(s.official.overAdmission > 0);
  assert.equal(r.report.correctness.verdict, "PASS"); assert.deepEqual(r.report.qualification.failed, ["Q-ADMISSION"]); assert.equal(r.report.verdict, "FAIL");
  assert.equal(r.report.scenario.config.runnerDeclared, null, "nothing was declared by an operator on local");
});
test("RA2 staging CERT-E with NO explicit --runner-max-pending: officialMaxPending null, overAdmission null, Q-ADMISSION INCOMPLETE", async () => {
  const rep = await stagingRehearsal({ concurrency: 8 }, { declare: false });
  for (const s of rep.saturation.steps) { assert.equal(s.officialMaxPending, null); assert.equal(s.official.overAdmission, null); assert.equal(s.maxPendingSource, null); }
  assert.ok(rep.qualification.notEvaluated.includes("Q-ADMISSION"), JSON.stringify(rep.qualification));
  assert.equal(rep.qualification.verdict, "INCOMPLETE"); assert.notEqual(rep.verdict, "PASS");
  assert.equal(rep.scenario.config.runnerDeclared, null);
});
test("RA3 staging CERT-E with declared maxPending=3 and 3 accepted (sequential arrivals) → Q-ADMISSION PASS", async () => {
  const rep = await stagingRehearsal({ concurrency: 1 });
  const s = rep.saturation.steps[1];
  assert.equal(s.officialMaxPending, 3); assert.equal(s.maxPendingSource, "operator-declared");
  assert.equal(s.official.accepted, 3); assert.equal(s.official.busy, 5); assert.equal(s.official.overAdmission, 0);
  assert.equal(rep.qualification.checks.find(c => c.id === "Q-ADMISSION").pass, true);
  assert.equal(rep.verdict, "PASS", JSON.stringify(rep.qualification) + JSON.stringify(rep.correctness.notEvaluated));
});
test("RA4 staging CERT-E with declared maxPending=3 and 8 accepted (concurrent arrivals) → Q-ADMISSION FAIL with 5 over", async () => {
  const rep = await stagingRehearsal({ concurrency: 8 });
  const s = rep.saturation.steps[1];
  assert.equal(s.officialMaxPending, 3); assert.equal(s.official.accepted, 8); assert.equal(s.official.overAdmission, 5);
  assert.deepEqual(rep.qualification.failed, ["Q-ADMISSION"]); assert.match(rep.qualification.checks.find(c => c.id === "Q-ADMISSION").detail, /5 over/);
  assert.equal(rep.correctness.verdict, "PASS"); assert.equal(rep.verdict, "FAIL");
});
test("RA5 the CERT-E catalog default (runner.maxPending = 3) is the LOCAL effective configuration, never a remote declaration", () => {
  const local = L.planScenario({ scenario: "CERT-E", target: "local", params: {} });
  assert.equal(local.config.runner.maxPending, 3, "the harness-owned local Runner is configured from the catalog default");
  assert.equal(local.config.runnerDeclared, null);
  const staging = L.planScenario({ scenario: "CERT-E", target: "staging", params: {} });
  assert.equal(staging.config.runnerDeclared, null, "no operator declaration");
  assert.equal(staging.config.runner, null, "a remote plan carries no effective Runner configuration — the harness does not own that Runner");
  const declared = L.planScenario({ scenario: "CERT-E", target: "staging", params: { runner: { maxPending: 3 } } });
  assert.deepEqual(declared.config.runnerDeclared, { maxPending: 3 });
  assert.equal(declared.config.runner, null);
});
test("RA6 the CLI preserves an explicit --runner-max-pending=3 into params.runner and the staging evidence", async () => {
  const cli = require("../load/cli.js");
  assert.deepEqual(cli.paramsFrom({ "runner-max-pending": "3" }), { runner: { maxPending: 3 } });
  assert.equal(cli.paramsFrom({}).runner, undefined);
  const rep = await stagingRehearsal({ concurrency: 1, ...cli.paramsFrom({ "runner-max-pending": "3", concurrency: "1" }) });
  assert.deepEqual(rep.scenario.config.runnerDeclared, { maxPending: 3 });
  assert.equal(rep.saturation.steps[1].officialMaxPending, 3); assert.equal(rep.saturation.steps[1].maxPendingSource, "operator-declared");
});

// ── RF3-B Q-ADMISSION evidence validation ───────────────────────────────────────────────────────────────────────────────
test("RB1 saturation.steps = [{}] is malformed → refused, never PASS", () => {
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [{}] } }), /admission/);
  assert.throws(() => QE("CERT-E", "local", { saturation: { steps: [{}] } }), /admission/);
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [step(), {}] } }), /admission/);
});
test("RB2 an official object without overAdmission is malformed → refused", () => {
  const s = step(); delete s.official.overAdmission;
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [s] } }), /admission/);
});
test("RB3 overAdmission = null is a legitimate 'not measured' → INCOMPLETE", () => {
  const q = Q("CERT-E", "staging", { saturation: { steps: [step({ overAdmission: null }, { officialMaxPending: null })] } });
  assert.equal(q.verdict, "INCOMPLETE"); assert.deepEqual(q.notEvaluated, ["Q-ADMISSION"]);
});
test("RB4 overAdmission = NaN / Infinity / -1 / '0' is malformed → refused", () => {
  for (const bad of [NaN, Infinity, -1, "0", 1.5, true]) assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [step({ overAdmission: bad })] } }), /admission/, String(bad));
  // a measured value needs the raw evidence it is derived from
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [step({ accepted: -1 })] } }), /admission/);
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [step({}, { officialMaxPending: 0 })] } }), /admission/);
  assert.throws(() => Q("CERT-E", "local", { saturation: { steps: [step({}, { officialMaxPending: "3" })] } }), /admission/);
});
test("RB5 accepted 8 with maxPending 3 but a stored overAdmission 0 → FAIL and the contradiction is recorded (derived 5 is authoritative)", () => {
  const q = Q("CERT-E", "local", { saturation: { steps: [step({ accepted: 8, busy: 0, overAdmission: 0 })] } });
  assert.equal(q.verdict, "FAIL"); assert.deepEqual(q.failed, ["Q-ADMISSION"]);
  assert.ok(q.contradictions.some(c => /Q-ADMISSION/.test(c) && /5/.test(c)), JSON.stringify(q.contradictions));
  assert.match(q.checks.find(c => c.id === "Q-ADMISSION").detail, /5 over/);
});
test("RB6 accepted 3 with maxPending 3 and overAdmission 0 → PASS", () => {
  assert.equal(Q("CERT-E", "local", { saturation: { steps: [step({ accepted: 3, overAdmission: 0 })] } }).verdict, "PASS");
  assert.equal(Q("CERT-E", "local", { saturation: { steps: [step({ offered: 0, accepted: 0, busy: 0, overAdmission: 0 })] } }).verdict, "PASS", "a practice-only saturation step admits nothing");
});
test("RB7 accepted 8 with maxPending 3 and overAdmission 5 → FAIL (consistent evidence, no contradiction)", () => {
  const q = Q("CERT-E", "local", { saturation: { steps: [step({ accepted: 8, busy: 0, overAdmission: 5 })] } });
  assert.equal(q.verdict, "FAIL"); assert.deepEqual(q.contradictions, []);
});

// ── RF3-C Q-P1 three-language sample authority ──────────────────────────────────────────────────────────────────────────
const p1 = over => ({ pass: true, violations: [], missing: [], ceilingMs: 40000, samples: { python: L.percentiles([9000]), java: L.percentiles([10700]), csharp: L.percentiles([10900]) }, ...over });
test("RP1 samples omit csharp while missing = [] → Q-P1 FAIL (derived from the samples, not from `missing`)", () => {
  const q = Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([9000]), java: L.percentiles([10700]) } }) });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-P1")); assert.match(q.checks[1].detail, /csharp/);
  assert.equal(Q("CERT-J", "local", { p1: p1({ samples: undefined }) }).verdict, "FAIL", "no samples at all = no language proven");
});
test("RP2 csharp count = 0 while missing = [] → FAIL", () => {
  const q = Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([9000]), java: L.percentiles([10700]), csharp: L.percentiles([]) } }) });
  assert.equal(q.verdict, "FAIL"); assert.match(q.checks[1].detail, /csharp/);
});
test("RP3 java max = 41 000 while violations = [] → FAIL", () => {
  const q = Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([9000]), java: L.percentiles([41000]), csharp: L.percentiles([10900]) } }) });
  assert.equal(q.verdict, "FAIL"); assert.match(q.checks[1].detail, /java/);
});
test("RP4 all three languages present with count ≥ 1 and max ≤ 40 000 → PASS", () => {
  assert.equal(Q("CERT-J", "local", { p1: p1() }).verdict, "PASS");
  assert.equal(Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([40000]), java: L.percentiles([1, 40000]), csharp: L.percentiles([5]) } }) }).verdict, "PASS", "exactly at the ceiling passes");
});
test("RP5 a malformed sample (string / NaN / Infinity max, non-object) is refused", () => {
  for (const bad of [{ count: 1, max: "9000" }, { count: 1, max: NaN }, { count: 1, max: Infinity }, { count: 1, max: -1 }, { count: "1", max: 9000 }, "fast", 42, null]) {
    assert.throws(() => Q("CERT-J", "local", { p1: p1({ samples: { python: L.percentiles([9000]), java: L.percentiles([10700]), csharp: bad } }) }), /P1/, JSON.stringify(bad));
  }
});
test("RP6 a stored summary pass = true that contradicts the raw sample failure is recorded as a contradiction", () => {
  const q = Q("CERT-J", "local", { p1: p1({ pass: true, samples: { python: L.percentiles([9000]), java: L.percentiles([41000]), csharp: L.percentiles([10900]) } }) });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.contradictions.some(c => /Q-P1/.test(c)), JSON.stringify(q.contradictions));
});

// ── RF3-D strict idempotency / recovery evidence shapes ─────────────────────────────────────────────────────────────────
const burst = idem => ({ count: 4, concurrency: 2, nearMax: false, bytesPerBody: 172, expectedAnswer: "applied", answers: { applied: 4 }, latency: L.percentiles([1, 2, 3, 4]), transportOk: true, idempotency: { redeliveryAnswer: "alreadyApplied", before: { state: "complete", score: 1, applications: 1 }, after: { state: "complete", score: 1, applications: 1 }, stateUnchanged: true, scoreUnchanged: true, applicationsUnchanged: true, pass: true, ...idem } });
const recovery = over => ({ accepted: 6, settled: true, complete: 6, retryable: 0, lost: 0, duplicateApplications: 0, executionsPerJobMax: 2, maxExecutionsAllowed: 2, reExecutedJobs: 1, resubmissionNeeded: false, pass: true, ...over });
test("RE1 idempotency snapshot with applications = -1 is refused", () => {
  assert.throws(() => Q("CERT-F", "local", { bursts: [burst({ before: { state: "complete", score: 1, applications: -1 }, after: { state: "complete", score: 1, applications: -1 } })] }), /idempotency/);
  assert.throws(() => Q("CERT-F", "local", { bursts: [burst({ after: { state: "complete", score: 1, applications: 1.5 } })] }), /idempotency/);
});
test("RE2 idempotency snapshot with score = Infinity (or NaN, or a string) is refused", () => {
  for (const bad of [Infinity, NaN, "1"]) assert.throws(() => Q("CERT-F", "local", { bursts: [burst({ before: { state: "complete", score: bad, applications: 1 } })] }), /idempotency/, String(bad));
  assert.equal(Q("CERT-F", "local", { bursts: [burst({ before: { state: "retryable", score: null, applications: 1 }, after: { state: "retryable", score: null, applications: 1 } })] }).verdict, "PASS", "a null score (technical outcome) is a legitimate value");
});
test("RE3 recovery executionsPerJobMax = -1 is refused (shape), while a legitimate over-execution FAILS", () => {
  assert.throws(() => L.recoveryVerdict(recovery({ executionsPerJobMax: -1 })), /recovery/);
  assert.throws(() => Q("CERT-G", "local", { recovery: recovery({ executionsPerJobMax: -2 }) }), /recovery/);
  assert.equal(Q("CERT-G", "local", { recovery: recovery({ executionsPerJobMax: 3 }) }).verdict, "FAIL");
});
test("RE4 recovery maxExecutionsAllowed = -1 (or 0, or a string) is refused", () => {
  for (const bad of [-1, 0, "2", 1.5]) assert.throws(() => L.recoveryVerdict(recovery({ maxExecutionsAllowed: bad })), /recovery/, String(bad));
});
test("RE5 recovery accepted = -1 (and other negative / non-integer counts) is refused", () => {
  assert.throws(() => L.recoveryVerdict(recovery({ accepted: -5 })), /recovery/);
  for (const k of ["lost", "duplicateApplications", "complete"]) assert.throws(() => L.recoveryVerdict(recovery({ [k]: -1 })), /recovery/, k);
  assert.throws(() => L.recoveryVerdict(recovery({ settled: "yes" })), /recovery/);
  assert.throws(() => L.recoveryVerdict(recovery({ resubmissionNeeded: 0 })), /recovery/);
  assert.throws(() => Q("CERT-G", "local", { recovery: recovery({ accepted: -1 }) }), /recovery/);
});
test("RE6 valid existing evidence remains PASS (idempotency, recovery, a real local CERT-G and CERT-F)", async () => {
  assert.equal(Q("CERT-F", "local", { bursts: [burst()] }).verdict, "PASS");
  assert.equal(Q("CERT-G", "local", { recovery: recovery() }).verdict, "PASS");
  assert.deepEqual(L.recoveryVerdict(recovery()), { pass: true, reasons: [] });
  for (const id of ["CERT-G", "CERT-F"]) { const r = await L.runScenario({ scenario: id, target: "local", env: {}, buildSha: SHA, params: id === "CERT-F" ? { jobs: 3, concurrency: 1 } : {}, deps: { fetchImpl: noNet } }); assert.equal(r.ok, true); assert.equal(r.report.verdict, "PASS", id); }
});
