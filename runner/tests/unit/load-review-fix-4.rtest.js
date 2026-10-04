"use strict";
// Phase 17F-B10-A — Independent Review Fix 4 (PR #249, reviewed head 332c210). FAIL-FIRST:
//   RF4-A CT1–CT7  the EXPECTED callback answer of a synthetic burst comes from the TARGET CONTRACT (local → applied, staging /
//                  production → unknown), never from the burst's own stored `expectedAnswer`; a stored value that disagrees FAILS
//                  Q-CALLBACK-TRANSPORT with a recorded contradiction, a missing / non-string value is refused.
//   RF4-B ID1–ID4  on LOCAL, EVERY callback burst of CERT-F / CERT-K must carry idempotency evidence — a burst that omits it can
//                  never be covered by another burst that has it; staging / production require no idempotency (nothing is applied).
//   RF4-C CG1–CG10 Q-CORRECTNESS and the report's `correctness` object are DERIVED from the raw canonical gate set G1–G11
//                  (normalizeCorrectness, the ONE authority shared by evaluateGates, evaluateQualification and buildReport): a
//                  stored verdict / pass / failed / notEvaluated summary is reproducibility data only — a contradiction is
//                  recorded and the raw gates win; a missing, duplicate or unknown gate id or an inconsistent evaluated / pass
//                  pair is REFUSED; a bare summary without gates can never claim Q-CORRECTNESS.
//   RF4-D RT1–RT3  a report built by buildReport is accepted again by buildReport (revalidation) with the SAME correctness and
//                  qualification verdicts — no dependence on stale summary fields.
// Fail-first on 332c210: evalTransport trusts b.expectedAnswer, evalIdempotency filters the bursts that carry evidence,
// evaluateQualification trusts correctness.verdict, gatesFromCorrectness never validates the gate set, no normalizeCorrectness.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../load/lib/index.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const noNet = () => { throw new Error("no remote network"); };
const okGates = () => L.evaluateGates({ practice: L.createPracticeAccumulator().summary(), official: L.createOfficialLedger().reconcile(), journal: { counts: { received: 0, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0 }, quarantined: 0, corrupt: 0, truncated: false }, responsive: true, governor: { ceilingExceeded: false } });
/** Patches ONE raw gate entry while leaving every stored summary (verdict, failed, notEvaluated, correctnessPass) untouched. */
const withGate = (c, id, patch) => ({ ...c, gates: c.gates.map(g => (g.id === id ? { ...g, ...patch } : g)) });
const Q = (scenarioId, target, evidence) => L.evaluateQualification({ scenarioId, target, correctness: okGates(), ...evidence });
const input = (scenarioId, target, over = {}) => ({ target: { name: target, remote: target !== "local" }, buildSha: SHA, runnerSha: SHA, scenario: { id: scenarioId, config: { jobs: 1, concurrency: 1, languages: ["python"] } }, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1, gates: okGates(), ...over });
const idem = over => ({ redeliveryAnswer: "alreadyApplied", before: { state: "complete", score: 1, applications: 1 }, after: { state: "complete", score: 1, applications: 1 }, stateUnchanged: true, scoreUnchanged: true, applicationsUnchanged: true, pass: true, ...over });
const burst = over => ({ count: 4, concurrency: 2, nearMax: false, bytesPerBody: 172, expectedAnswer: "unknown", answers: { unknown: 4 }, latency: L.percentiles([1, 2, 3, 4]), transportOk: true, ...over });
const localBurst = over => burst({ expectedAnswer: "applied", answers: { applied: 4 }, idempotency: idem(), ...over });
const checkOf = (q, id) => q.checks.find(c => c.id === id);
const p1ok = () => ({ pass: true, violations: [], missing: [], ceilingMs: 40000, samples: { python: { count: 3, max: 100 }, java: { count: 3, max: 200 }, csharp: { count: 3, max: 300 } } });

// ── RF4-A the callback expected answer is the TARGET contract ───────────────────────────────────────────────────────────
test("CT0 the canonical contract is exported and the harness derives its synthetic expectation from it", async () => {
  assert.deepEqual(L.CALLBACK_CONTRACT, { local: "applied", staging: "unknown", production: "unknown" });
  const r = await L.runScenario({ scenario: "CERT-F", target: "local", env: {}, buildSha: SHA, params: { jobs: 6, concurrency: 2 }, deps: { fetchImpl: noNet } });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  for (const b of r.report.callbacks) assert.equal(b.expectedAnswer, "applied");
  assert.equal(r.report.verdict, "PASS", JSON.stringify(r.report.qualification));
});
test("CT1 CERT-F production: stored expectedAnswer=applied with answers applied=4 → FAIL + contradiction (the contract is unknown)", () => {
  const q = Q("CERT-F", "production", { bursts: [burst({ expectedAnswer: "applied", answers: { applied: 4 } })] });
  assert.equal(q.verdict, "FAIL"); assert.deepEqual(q.failed, ["Q-CALLBACK-TRANSPORT"]);
  assert.ok(q.contradictions.some(c => /expectedAnswer.*applied.*unknown|contract/.test(c)), JSON.stringify(q.contradictions));
  assert.match(checkOf(q, "Q-CALLBACK-TRANSPORT").contradiction, /applied/);
  // through the builder as well: a report can never PASS on it
  const rep = L.buildReport(input("CERT-F", "production", { callbacks: [burst({ expectedAnswer: "applied", answers: { applied: 4 } })] }));
  assert.equal(rep.verdict, "FAIL"); assert.ok(rep.qualification.contradictions.length >= 1);
});
test("CT2 CERT-F staging: stored expectedAnswer=applied → FAIL (even with applied answers)", () => {
  const q = Q("CERT-F", "staging", { bursts: [burst({ expectedAnswer: "applied", answers: { applied: 4 } })] });
  assert.equal(q.verdict, "FAIL"); assert.deepEqual(q.failed, ["Q-CALLBACK-TRANSPORT"]);
  assert.equal(Q("CERT-K", "staging", { bursts: [burst({ count: 1, nearMax: true, expectedAnswer: "applied", answers: { applied: 1 } })] }).verdict, "FAIL");
});
test("CT3 CERT-F local: stored expectedAnswer=unknown → FAIL (the local receiver applies; the contract is applied)", () => {
  const q = Q("CERT-F", "local", { bursts: [localBurst({ expectedAnswer: "unknown", answers: { unknown: 4 } })] });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-CALLBACK-TRANSPORT"), JSON.stringify(q.failed));
  assert.ok(q.contradictions.some(c => /unknown/.test(c) && /applied/.test(c)), JSON.stringify(q.contradictions));
});
test("CT4 local applied contract passes (expectedAnswer applied, answers applied = count)", () => {
  const q = Q("CERT-F", "local", { bursts: [localBurst()] });
  assert.equal(q.verdict, "PASS", JSON.stringify(q)); assert.deepEqual(q.contradictions, []);
  assert.equal(Q("CERT-K", "local", { bursts: [localBurst({ count: 1, nearMax: true, answers: { applied: 1 } })] }).verdict, "PASS");
});
test("CT5 staging / production unknown contract passes", () => {
  for (const t of ["staging", "production"]) {
    const q = Q("CERT-F", t, { bursts: [burst()] });
    assert.equal(q.verdict, "PASS", t + " " + JSON.stringify(q)); assert.deepEqual(q.contradictions, []);
    assert.equal(Q("CERT-K", t, { bursts: [burst({ count: 1, nearMax: true, answers: { unknown: 1 } })] }).verdict, "PASS", t);
  }
});
test("CT6 the correct expectedAnswer with wrong answer counts still fails", () => {
  assert.equal(Q("CERT-F", "production", { bursts: [burst({ answers: { unknown: 3, applied: 1 } })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "production", { bursts: [burst({ answers: { applied: 4 } })] }).verdict, "FAIL", "applied on production means a real job was touched");
  assert.equal(Q("CERT-F", "staging", { bursts: [burst({ answers: { unknown: 3 } })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "local", { bursts: [localBurst({ answers: { applied: 3, unknown: 1 } })] }).verdict, "FAIL");
  assert.equal(Q("CERT-F", "local", { bursts: [localBurst({ answers: { unknown: 4 } })] }).verdict, "FAIL");
});
test("CT7 a missing / non-string stored expectedAnswer is malformed evidence → refused", () => {
  const b = burst(); delete b.expectedAnswer;
  assert.throws(() => Q("CERT-F", "production", { bursts: [b] }), /callback/);
  assert.throws(() => Q("CERT-F", "production", { bursts: [burst({ expectedAnswer: 7 })] }), /callback/);
  assert.throws(() => Q("CERT-F", "production", { bursts: [burst({ expectedAnswer: null })] }), /callback/);
  assert.throws(() => Q("CERT-F", "local", { bursts: [localBurst({ expectedAnswer: ["applied"] })] }), /callback/);
  assert.throws(() => L.buildReport(input("CERT-F", "production", { callbacks: [b] })), /callback/);
});

// ── RF4-B every LOCAL burst carries idempotency evidence ────────────────────────────────────────────────────────────────
test("ID1 local CERT-F with one valid burst and one burst missing idempotency → Q-IDEMPOTENCY never PASS", () => {
  const without = localBurst(); delete without.idempotency;
  const q = Q("CERT-F", "local", { bursts: [localBurst(), without] });
  assert.notEqual(q.verdict, "PASS"); assert.ok(q.failed.includes("Q-IDEMPOTENCY"), JSON.stringify(q));
  assert.match(checkOf(q, "Q-IDEMPOTENCY").detail, /no idempotency evidence/);
  assert.notEqual(Q("CERT-F", "local", { bursts: [without, localBurst()] }).verdict, "PASS", "order does not matter");
  assert.notEqual(Q("CERT-F", "local", { bursts: [localBurst(), localBurst({ idempotency: null })] }).verdict, "PASS", "null is not evidence");
  assert.notEqual(Q("CERT-K", "local", { bursts: [localBurst({ count: 1, nearMax: true, answers: { applied: 1 } }), without] }).verdict, "PASS");
  assert.notEqual(L.buildReport(input("CERT-F", "local", { callbacks: [localBurst(), without] })).verdict, "PASS");
});
test("ID2 every local burst carries valid idempotency evidence → PASS", () => {
  const q = Q("CERT-F", "local", { bursts: [localBurst(), localBurst({ count: 2, answers: { applied: 2 } }), localBurst({ count: 1, nearMax: true, answers: { applied: 1 } })] });
  assert.equal(q.verdict, "PASS", JSON.stringify(q)); assert.deepEqual(q.contradictions, []);
});
test("ID3 one local burst with a score / application drift → FAIL", () => {
  assert.deepEqual(Q("CERT-F", "local", { bursts: [localBurst(), localBurst({ idempotency: idem({ after: { state: "complete", score: 1001, applications: 1 } }) })] }).failed, ["Q-IDEMPOTENCY"]);
  assert.deepEqual(Q("CERT-F", "local", { bursts: [localBurst({ idempotency: idem({ after: { state: "complete", score: 1, applications: 2 } }) }), localBurst()] }).failed, ["Q-IDEMPOTENCY"]);
  assert.deepEqual(Q("CERT-F", "local", { bursts: [localBurst(), localBurst({ idempotency: idem({ redeliveryAnswer: "applied" }) })] }).failed, ["Q-IDEMPOTENCY"]);
});
test("ID4 staging / production do not require idempotency evidence (and none is fabricated)", () => {
  for (const t of ["staging", "production"]) {
    const q = Q("CERT-F", t, { bursts: [burst(), burst({ count: 2, answers: { unknown: 2 } })] });
    assert.equal(q.verdict, "PASS", t); assert.ok(!q.required.includes("Q-IDEMPOTENCY")); assert.ok(!q.checks.some(c => c.id === "Q-IDEMPOTENCY"));
  }
  assert.equal(Q("CERT-F", "local", { bursts: [] }).verdict, "INCOMPLETE", "no burst at all: not measured, never PASS");
});

// ── RF4-C Q-CORRECTNESS derives from the raw canonical gate set ─────────────────────────────────────────────────────────
test("CG1 raw G2 fails while the stored verdict says PASS → Q-CORRECTNESS FAIL, contradiction recorded, report verdict cannot PASS", () => {
  const c = withGate(okGates(), "G2", { pass: false });
  assert.equal(c.verdict, "PASS", "the fixture keeps the stale stored summary");
  const q = L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c });
  assert.equal(q.verdict, "FAIL"); assert.deepEqual(q.failed, ["Q-CORRECTNESS"]);
  assert.ok(q.contradictions.some(x => /verdict PASS/.test(x)), JSON.stringify(q.contradictions));
  assert.match(checkOf(q, "Q-CORRECTNESS").detail, /G2/);
  for (const over of [{ gates: c }, { gates: undefined, correctness: c }]) {
    const rep = L.buildReport(input("CERT-A", "local", over));
    assert.equal(rep.verdict, "FAIL"); assert.equal(rep.correctness.verdict, "FAIL"); assert.equal(rep.correctness.pass, false); assert.deepEqual(rep.correctness.failed, ["G2"]);
    assert.ok(rep.qualification.contradictions.some(x => /verdict PASS/.test(x)), JSON.stringify(rep.qualification.contradictions));
    assert.ok(Array.isArray(rep.correctness.contradictions) && rep.correctness.contradictions.length >= 1);
  }
});
test("CG2 raw G2 fails while stored failed=[] and correctnessPass=true (no stored verdict) → raw gate evidence wins", () => {
  const c = withGate(okGates(), "G2", { pass: false }); delete c.verdict;
  assert.deepEqual(c.failed, []); assert.equal(c.correctnessPass, true);
  const q = L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.contradictions.length >= 1, "the stale failed / correctnessPass summaries are recorded");
  const rep = L.buildReport(input("CERT-A", "local", { gates: c }));
  assert.equal(rep.verdict, "FAIL"); assert.deepEqual(rep.correctness.failed, ["G2"]); assert.equal(rep.correctness.pass, false);
  // the report form of the summary (`pass`) is a summary too
  const asReport = { ...withGate(okGates(), "G2", { pass: false }), pass: true, verdict: "PASS" }; delete asReport.correctnessPass;
  assert.equal(L.buildReport(input("CERT-A", "local", { gates: undefined, correctness: asReport })).verdict, "FAIL");
});
test("CG3 a missing canonical gate (G5) → refused", () => {
  const c = okGates(); c.gates = c.gates.filter(g => g.id !== "G5");
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c }), /G5/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: c })), /G5/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: undefined, correctness: c })), /G5/);
  assert.throws(() => L.normalizeCorrectness({ gates: [] }), /G1/);
});
test("CG4 a duplicate gate id (G3 twice) → refused", () => {
  const c = okGates(); c.gates = [...c.gates, { ...c.gates.find(g => g.id === "G3") }];
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c }), /duplicate/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: c })), /duplicate/);
  const c2 = okGates(); c2.gates = c2.gates.map(g => (g.id === "G4" ? { ...g, id: "G3" } : g));
  assert.throws(() => L.normalizeCorrectness(c2), /duplicate|G4/);
});
test("CG5 an unknown gate id (G12) → refused", () => {
  const c = okGates(); c.gates = [...c.gates, { id: "G12", title: "made up", evaluated: true, pass: true, detail: "" }];
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c }), /G12/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: c })), /G12/);
  const c2 = okGates(); c2.gates = c2.gates.map(g => (g.id === "G11" ? { ...g, id: "g11" } : g));
  assert.throws(() => L.normalizeCorrectness(c2), /g11|G11/);
});
test("CG6 evaluated=true with pass=null → refused", () => {
  const c = withGate(okGates(), "G7", { evaluated: true, pass: null });
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c }), /G7/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: c })), /G7/);
  assert.throws(() => L.normalizeCorrectness(withGate(okGates(), "G7", { evaluated: true, pass: "true" })), /G7/);
  assert.throws(() => L.normalizeCorrectness(withGate(okGates(), "G7", { evaluated: "yes", pass: true })), /G7/);
});
test("CG7 evaluated=false with pass=true → refused", () => {
  const c = withGate(okGates(), "G7", { evaluated: false, pass: true });
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c }), /G7/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: c })), /G7/);
  assert.throws(() => L.normalizeCorrectness(withGate(okGates(), "G7", { evaluated: false, pass: false })), /G7/);
});
test("CG8 every canonical gate G1–G11 valid and passing → correctness PASS", () => {
  const n = L.normalizeCorrectness(okGates());
  assert.deepEqual(n.gates.map(g => g.id), [...L.GATE_IDS]);
  assert.equal(n.verdict, "PASS"); assert.equal(n.pass, true); assert.equal(n.correctnessPass, true); assert.deepEqual(n.failed, []); assert.deepEqual(n.notEvaluated, []); assert.deepEqual(n.contradictions, []);
  const q = L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: okGates() });
  assert.equal(q.verdict, "PASS"); assert.equal(checkOf(q, "Q-CORRECTNESS").pass, true);
  const rep = L.buildReport(input("CERT-A", "local"));
  assert.equal(rep.verdict, "PASS"); assert.equal(rep.correctness.verdict, "PASS"); assert.deepEqual(rep.correctness.contradictions, []);
  assert.equal(L.evaluateGates({}).verdict, "INCOMPLETE", "evaluateGates goes through the same authority");
});
test("CG9 one canonical gate not evaluated → correctness INCOMPLETE, Q-CORRECTNESS not evaluated, never PASS", () => {
  const c = withGate(okGates(), "G7", { evaluated: false, pass: null });
  const q = L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: c });
  assert.equal(q.verdict, "INCOMPLETE"); assert.deepEqual(q.notEvaluated, ["Q-CORRECTNESS"]);
  const rep = L.buildReport(input("CERT-A", "local", { gates: c }));
  assert.equal(rep.verdict, "INCOMPLETE"); assert.equal(rep.correctness.verdict, "INCOMPLETE"); assert.deepEqual(rep.correctness.notEvaluated, ["G7"]);
});
test("CG10 a failed canonical gate gives a top-level FAIL even when every scenario-specific check passes", () => {
  const c = withGate(okGates(), "G4", { pass: false });
  const q = L.evaluateQualification({ scenarioId: "CERT-J", target: "local", correctness: c, p1: p1ok() });
  assert.equal(checkOf(q, "Q-P1").pass, true); assert.deepEqual(q.failed, ["Q-CORRECTNESS"]); assert.equal(q.verdict, "FAIL");
  const rep = L.buildReport(input("CERT-F", "local", { gates: c, callbacks: [localBurst()] }));
  assert.equal(rep.verdict, "FAIL"); assert.deepEqual(rep.qualification.failed, ["Q-CORRECTNESS"]);
});
test("CG11 a bare summary without raw gates can never claim Q-CORRECTNESS (direct evaluateQualification bypass closed)", () => {
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: { verdict: "PASS" } }), /gate/);
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: { verdict: "PASS", gates: "G1-G11" } }), /gate/);
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local" }), /correctness|gate/);
  assert.throws(() => L.evaluateQualification({ scenarioId: "CERT-A", target: "local", correctness: null }), /correctness|gate/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: undefined, correctness: { verdict: "PASS", pass: true, failed: [], notEvaluated: [] } })), /gate/);
  assert.throws(() => L.buildReport(input("CERT-A", "local", { gates: undefined })), /gate/);
});

// ── RF4-D revalidation round trip ───────────────────────────────────────────────────────────────────────────────────────
const sameVerdicts = (a, b) => { assert.deepEqual(b.correctness, a.correctness); assert.equal(b.qualification.verdict, a.qualification.verdict); assert.deepEqual(b.qualification.failed, a.qualification.failed); assert.deepEqual(b.qualification.notEvaluated, a.qualification.notEvaluated); assert.equal(b.verdict, a.verdict); };
test("RT1 a PASS report (CERT-J with P1 evidence) is accepted again by buildReport with identical correctness / qualification", () => {
  const r1 = L.buildReport(input("CERT-J", "local", { p1: p1ok() }));
  assert.equal(r1.verdict, "PASS");
  const r2 = L.buildReport(r1);
  sameVerdicts(r1, r2);
  assert.deepEqual(r2.qualification.required, r1.qualification.required); assert.deepEqual(r2.scenario.config, r1.scenario.config);
  const r3 = L.buildReport(r2); sameVerdicts(r1, r3);
});
test("RT2 a FAIL / INCOMPLETE report round-trips with the same verdict and keeps its recorded contradiction", () => {
  const failed = L.buildReport(input("CERT-A", "local", { gates: withGate(okGates(), "G2", { pass: false }) }));
  assert.equal(failed.verdict, "FAIL"); assert.ok(failed.correctness.contradictions.length >= 1);
  const again = L.buildReport(failed);
  sameVerdicts(failed, again); assert.ok(again.correctness.contradictions.length >= 1, "a recorded contradiction is never dropped by a revalidation");
  const inc = L.buildReport(input("CERT-E", "local", { gates: withGate(okGates(), "G7", { evaluated: false, pass: null }) }));
  assert.equal(inc.verdict, "INCOMPLETE"); sameVerdicts(inc, L.buildReport(inc));
  // the stored report-level verdict is still checked against the recomputed qualification
  assert.throws(() => L.buildReport({ ...failed, verdict: "PASS" }), /verdict/);
});
test("RT3 real local reports (CERT-F with bursts and idempotency, CERT-E on the B3 Runner with Q-ADMISSION PASS) revalidate identically — the post-B3 PASS survives the round-trip", async () => {
  for (const [scenario, params] of [["CERT-F", { jobs: 6, concurrency: 2 }], ["CERT-E", {}]]) {
    const r = await L.runScenario({ scenario, target: "local", env: {}, buildSha: SHA, params, deps: { fetchImpl: noNet } });
    assert.equal(r.ok, true, scenario);
    const again = L.buildReport(r.report);
    sameVerdicts(r.report, again);
    assert.deepEqual(again.callbacks, r.report.callbacks); assert.deepEqual(again.saturation, r.report.saturation);
    assert.deepEqual(again.qualification.contradictions, r.report.qualification.contradictions); assert.deepEqual(again.performance, r.report.performance);
    if (scenario === "CERT-E") { const qa = x => x.qualification.checks.find(c => c.id === "Q-ADMISSION"); assert.equal(qa(r.report).pass, true, "B3: Q-ADMISSION passes on the measured evidence"); assert.deepEqual(qa(again), qa(r.report)); assert.equal(again.verdict, "PASS"); }
  }
});
