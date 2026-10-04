"use strict";
// Phase 17F-B10-A — LOCAL LOAD EVIDENCE: every catalog scenario executed against the in-process local stack (real gateway, real
// durable queue, real journal, real callback deliverer; deterministic fake sandbox). node:test, no Docker, no network beyond
// loopback. These are the harness's own qualification: each mode (practice, official, mixed, callback burst, recovery,
// saturation) produces a PASS report with the accounting identity intact — and the harness DETECTS the admission behaviour it
// was built to measure (SC5: concurrent official arrivals and RUNNER_OFFICIAL_MAX_PENDING — finding B10-F1, measured as 8 accepted of
// 8 with maxPending 3 before Phase B3 and CLOSED BY B3 (main d236a75): the SAME scenario and acceptance rule now measure 3 / 5 / 0).
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../load/lib/index.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const run = (scenario, params = {}) => L.runScenario({ scenario, target: "local", env: {}, buildSha: SHA, params, deps: { fetchImpl: () => { throw new Error("no remote network in the local stack"); } } });
const pass = (r, label) => { assert.equal(r.ok, true, label + ": " + JSON.stringify(r).slice(0, 300)); assert.equal(r.report.verdict, "PASS", label + ": " + JSON.stringify(r.report.correctness.gates.filter(g => g.pass !== true))); return r.report; };
const clean = j => { assert.equal(j.ok, true, JSON.stringify(j)); assert.deepEqual([j.counts.received, j.counts.running, j.counts.executed, j.counts.callback_failed, j.corrupt, j.quarantined], [0, 0, 0, 0, 0, 0]); };

test("SC1 CERT-A practice correctness: 14 workloads, every outcome as expected, per-language latency recorded", async () => {
  const rep = pass(await run("CERT-A"), "CERT-A");
  assert.deepEqual([rep.totals.offered, rep.totals.completed, rep.totals.busy, rep.totals.mismatches], [14, 14, 0, 0]);
  assert.deepEqual(rep.languages.python.outcomes, { success: 2, timeout: 1, "runtime-error": 1 });
  assert.deepEqual(rep.languages.java.outcomes, { success: 2, "compile-error": 1, "runtime-error": 1, timeout: 1 });
  assert.deepEqual(rep.languages.csharp.outcomes, { success: 2, "compile-error": 1, "runtime-error": 1, timeout: 1 });
  assert.ok(rep.performance.latency.p95 >= rep.performance.latency.p50);
  assert.equal(rep.buildSha, SHA); assert.equal(rep.environmentClass, "local");
  clean(rep.journal);
});
test("SC2 CERT-B official grading correctness: accepted = complete + retryable + failed, graded once, hidden cases never leak", async () => {
  const rep = pass(await run("CERT-B"), "CERT-B");
  const o = rep.official;
  assert.deepEqual([o.offered, o.accepted, o.complete, o.retryable, o.failedTerminal, o.remainder, o.lost.length], [14, 14, 14, 0, 0, 0, 0]);
  assert.deepEqual([o.duplicateApplications, o.hiddenLeaks, o.mismatches, o.infrastructureZeroes.length], [0, 0, 0, 0]);
  assert.ok(o.timing.callback.count === 14 && o.timing.endToEnd.p99 >= o.timing.endToEnd.p50);
  assert.deepEqual(Object.keys(o.byLanguage).sort(), ["csharp", "java", "python"]);
  clean(rep.journal);
  assert.equal(JSON.stringify(rep).includes("LOAD-KIND"), false, "no source marker in the report");
});
test("SC3 CERT-C failure modes: compile error / runtime error / timeout in practice AND official, no internal-error", async () => {
  const rep = pass(await run("CERT-C"), "CERT-C");
  assert.equal(rep.practice.outcomes["internal-error"], undefined);
  assert.equal(rep.practice.outcomes["compile-error"], 2); assert.equal(rep.practice.outcomes.timeout, 3); assert.equal(rep.practice.outcomes["runtime-error"], 3);
  assert.equal(rep.official.complete, 8);
  assert.ok(rep.performance.latencyByOutcome.timeout.count === 3);
});
test("SC4 CERT-D concurrency ladder: RUNNER_BUSY appears only above the Runner limit; every request lands in one bucket", async () => {
  const rep = pass(await run("CERT-D", { jobs: 6, levels: [1, 2, 4, 8], runner: { maxConcurrency: 2 } }), "CERT-D");
  assert.equal(rep.totals.offered, 24);
  assert.equal(rep.totals.busy + rep.totals.completed + rep.totals.rejected + rep.totals.networkErrors, 24);
  assert.ok(rep.totals.busy >= 1, "levels 4 and 8 exceed a Runner limit of 2");
  const steps = JSON.parse(rep.notes.find(n => n.startsWith("steps: ")).slice(7));
  assert.deepEqual(steps.map(s => s.level), [1, 2, 4, 8]);
  assert.equal(steps[0].practice.busy, 0, "no busy at concurrency 1"); assert.equal(steps[1].practice.busy, 0, "no busy at the limit");
  assert.deepEqual(rep.scenario.config.levels, [1, 2, 4, 8]);
});
test("SC5 CERT-E saturation: safe refusal for practice, peak sandboxes ≤ limit, Runner responsive; the official burst is MEASURED and, with B3 in the Runner, respects maxPending (B10-F1 closed) — the unchanged qualification PASSES", async () => {
  const r = await run("CERT-E");
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const rep = r.report;
  // Independent Review Fix 1 measured the known product defect here (qualification FAIL on Q-ADMISSION: 8 accepted with maxPending 3);
  // B3 (atomic admission, main d236a75) fixed official.js and the SAME scenario, with the SAME acceptance rule, turns PASS.
  assert.equal(rep.correctness.verdict, "PASS", JSON.stringify(rep.correctness.failed));
  assert.equal(rep.qualification.verdict, "PASS"); assert.deepEqual(rep.qualification.failed, []); assert.equal(rep.verdict, "PASS");
  const [prac, off] = rep.saturation.steps;
  assert.equal(prac.runnerMaxConcurrency, 2); assert.equal(prac.offeredConcurrency, 8);
  assert.ok(prac.practice.busy >= 1, "practice saturation must refuse"); assert.ok(prac.peakActiveSandboxes <= 2, "no uncontrolled sandbox growth");
  assert.equal(prac.practice.offered, prac.practice.busy + prac.practice.completed);
  assert.equal(rep.correctness.gates.find(g => g.id === "G7").pass, true);
  assert.equal(off.officialMaxPending, 3);
  assert.equal(off.official.offered, off.official.accepted + off.official.busy, "every official submission is accounted (busy is explicit, never lost)");
  assert.deepEqual([off.official.offered, off.official.accepted, off.official.busy, off.official.overAdmission], [8, 3, 5, 0], "B3: 8 concurrent official arrivals with maxPending 3 → 3 accepted, 5 busy, 0 over (B10-F1 closed)");
  assert.ok(!rep.notes.some(n => n.startsWith("B10-F1 observed")), "nothing to report: the bound held");
  assert.match(rep.qualification.checks.find(c => c.id === "Q-ADMISSION").detail, /within the admission bound/);
  assert.equal(rep.official.lost.length, 0); assert.equal(rep.official.remainder, 0);
  clean(rep.journal);
});
test("SC5b finding B10-F1 CLOSED BY B3: the official admission bound holds for SEQUENTIAL arrivals AND for CONCURRENT arrivals (3 accepted / 5 busy of 8 with maxPending 3; before B3 the concurrent burst measured 8 accepted)", async () => {
  const mk = () => L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 3, maxActive: 1 }, profile: { python: { compileMs: 0, runMs: 300, cpuMs: 300, timeoutMs: 300 } } });
  const job = (tag, i) => ({ jobId: "cg_f1" + tag + String(i).padStart(18, "0"), language: "python", languageVersion: 1, source: L.BY_ID.P1.source, cases: [{ token: "c01", stdin: "1\n" }], limits: { timeMs: 3000, memoryMb: 128, outputBytes: 17408 } });
  const seq = mk(); await seq.start();
  const cs = L.createRunnerClient({ baseUrl: seq.baseUrl, key: seq.key, fetchImpl: globalThis.fetch });
  const sequential = []; for (let i = 0; i < 8; i++) sequential.push((await cs.submitOfficial(job("s", i))).status);
  await seq.idle(); await seq.close();
  assert.deepEqual(sequential, ["accepted", "accepted", "accepted", "busy", "busy", "busy", "busy", "busy"]);
  const con = mk(); await con.start();
  const cc = L.createRunnerClient({ baseUrl: con.baseUrl, key: con.key, fetchImpl: globalThis.fetch });
  const concurrent = (await Promise.all(Array.from({ length: 8 }, (_, i) => cc.submitOfficial(job("c", i))))).map(r => r.status);
  await con.idle(); const j = con.journalStatus(); await con.close();
  const accepted = concurrent.filter(s => s === "accepted").length;
  assert.equal(accepted + concurrent.filter(s => s === "busy").length, 8);
  assert.equal(accepted, 3, "B3: exactly maxPending concurrent arrivals are admitted (pre-B3 this measured 8)");
  assert.equal(concurrent.filter(s => s === "busy").length, 5, "the other five are refused with RUNNER_BUSY, never lost");
  // every ACCEPTED job is journaled, executed once and confirmed; before B3 the over-admission measured here was a bounds violation
  // (RUNNER_OFFICIAL_MAX_PENDING, L1 / B1), not a correctness failure — the harness reported the number instead of hiding it
  assert.equal(j.counts.confirmed, accepted); assert.equal(j.counts.callback_failed + j.counts.executed + j.counts.running, 0);
  console.log("B10-F1 (closed by B3) characterisation: sequential accepted 3 / 8; concurrent accepted " + accepted + " / 8 with RUNNER_OFFICIAL_MAX_PENDING=3");
});
test("SC6 CERT-F callback burst + idempotency: every callback applied once, re-delivery alreadyApplied, score unchanged", async () => {
  const r = await run("CERT-F", { jobs: 30, concurrency: 6 });
  const rep = pass(r, "CERT-F");
  assert.deepEqual(r.bursts[0].answers, { applied: 30 }); assert.equal(r.bursts[0].transportOk, true);
  assert.deepEqual([r.bursts[0].idempotency.redeliveryAnswer, r.bursts[0].idempotency.scoreUnchanged, r.bursts[0].idempotency.pass], ["alreadyApplied", true, true]);
  assert.equal(rep.official.duplicateCallbackAcks, 1); assert.equal(rep.official.duplicateApplications, 0);
  assert.equal(r.bursts[0].latency.count, 30);
});
test("SC7 CERT-G recovery under load: crash with work outstanding → restart → every job settles, applied once, bounded re-execution", async () => {
  const rep = pass(await run("CERT-G"), "CERT-G");
  const rc = rep.recovery;
  assert.equal(rc.accepted, 6);
  assert.ok(rc.outstandingAtCrash.running + rc.outstandingAtCrash.received >= 1, "work was outstanding when the gateway died");
  assert.equal(rc.recoveredAtRestart.received + rc.recoveredAtRestart.interrupted + rc.recoveredAtRestart.executed, rc.outstandingAtCrash.received + rc.outstandingAtCrash.running + rc.outstandingAtCrash.executed);
  assert.deepEqual([rc.settled, rc.complete, rc.lost, rc.duplicateApplications, rc.resubmissionNeeded, rc.pass], [true, 6, 0, 0, false, true]);
  assert.ok(rc.executionsPerJobMax <= 2, "an interrupted job is re-run at most once here (maxInterruptions 2)");
  clean(rep.journal);
});
test("SC8 CERT-H journal consistency after an official batch: clean final state", async () => {
  const rep = pass(await run("CERT-H"), "CERT-H");
  clean(rep.journal); assert.equal(rep.journal.counts.confirmed, 10);
});
test("SC9 CERT-I fairness is MEASURED (per-actor latency, single requester vs burst) and never claimed", async () => {
  const rep = pass(await run("CERT-I"), "CERT-I");
  for (const k of ["F1", "F2", "F3", "F4"]) { assert.ok(rep.fairness[k], k); assert.match(rep.fairness[k].note, /no fairness guarantee/); }
  assert.ok(rep.fairness.F1.singleRequesterMs !== null || rep.fairness.F1.singleRequesterBusy > 0, "the single requester is observed (served or refused)");
  assert.ok(rep.fairness.F1.burstP50Ms > 0);
  assert.ok(Object.keys(rep.practice.actors).length >= 3);
});
test("SC10 CERT-J P1 regression gate on the local stack: three languages measured, verdict separate from correctness", async () => {
  const rep = pass(await run("CERT-J", { jobs: 6 }), "CERT-J");
  assert.equal(rep.performance.p1.pass, true); assert.deepEqual(rep.performance.p1.missing, []);
  for (const l of ["python", "java", "csharp"]) assert.equal(rep.performance.p1.samples[l].count, 2);
  assert.equal(rep.performance.p1.ceilingMs, 40000);
});
test("SC11 CERT-K P2 regression: near-max synthetic body (≈ 6.45 MB) accepted, real 50-case job graded once, re-delivery alreadyApplied", async () => {
  const r = await run("CERT-K");
  const rep = pass(r, "CERT-K");
  assert.equal(r.bursts[0].nearMax, true); assert.ok(r.bursts[0].bytesPerBody > 6 * 1024 * 1024); assert.deepEqual(r.bursts[0].answers, { applied: 1 });
  assert.equal(rep.official.accepted, 2); assert.equal(rep.official.complete, 2); assert.equal(rep.official.duplicateCallbackAcks, 1); assert.equal(rep.official.mismatches, 0);
  assert.equal(rep.scenario.config.casesPerJob, 50);
});
test("SC12 CERT-L final mixed workload: students × languages × practice + official, every job settles, journal clean", async () => {
  const rep = pass(await run("CERT-L", { jobs: 30, officialJobs: 15, casesPerJob: 3, concurrency: 6, students: 10, runner: { maxConcurrency: 6, maxPending: 32, maxActive: 2 } }), "CERT-L");
  assert.deepEqual([rep.totals.offered, rep.totals.completed, rep.totals.lost, rep.totals.busy], [45, 45, 0, 0]);
  assert.equal(rep.official.accepted, 15); assert.equal(rep.official.remainder, 0);
  assert.ok(Object.keys(rep.practice.actors).length === 10);
  clean(rep.journal);
  const md = L.toMarkdown(rep);
  assert.match(md, /Verdict: PASS/); assert.match(md, /remainder \*\*0\*\*/);
});
test("SC13 a parked callback (receiver down) is reported — the final-settlement gate FAILS unless the scenario declared it", async () => {
  const stack = L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 8, maxActive: 1 }, callbackPolicy: { baseMs: 5, capMs: 20, maxAttemptsPerWindow: 2, maxRearms: 1, concurrency: 2 } });
  await stack.start();
  stack.receiver.setMode("fail");
  const c = L.createRunnerClient({ baseUrl: stack.baseUrl, key: stack.key, fetchImpl: globalThis.fetch });
  assert.equal((await c.submitOfficial({ jobId: "cg_parked000000000000001", language: "python", languageVersion: 1, source: L.BY_ID.P1.source, cases: [{ token: "c01", stdin: "1\n" }], limits: { timeMs: 3000, memoryMb: 128, outputBytes: 17408 } })).status, "accepted");
  for (let i = 0; i < 400 && stack.journalStatus().counts.callback_failed === 0; i++) await new Promise(r => setTimeout(r, 25));
  const j = stack.journalStatus();
  await stack.close();
  assert.equal(j.counts.callback_failed, 1);
  assert.equal(L.evaluateGates({ journal: j }).byId.G6.pass, false);
  const declared = L.evaluateGates({ journal: j, journalExpected: { callback_failed: 1 } });
  assert.equal(declared.byId.G6.pass, true); assert.match(declared.byId.G6.detail, /declared/);
});
test("SC14 infrastructure failure never becomes a zero: a technical outcome is applied as retryable and G10 holds", async () => {
  const stack = L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 8, maxActive: 1 } });
  const orig = stack.sandbox.runOfficialSuite.bind(stack.sandbox);
  stack.sandbox.runOfficialSuite = async () => { throw new Error("docker daemon gone (simulated)"); };
  await stack.start();
  const c = L.createRunnerClient({ baseUrl: stack.baseUrl, key: stack.key, fetchImpl: globalThis.fetch });
  assert.equal((await c.submitOfficial({ jobId: "cg_infra0000000000000001", language: "python", languageVersion: 1, source: L.BY_ID.P1.source, cases: [{ token: "c01", stdin: "1\n" }], limits: { timeMs: 3000, memoryMb: 128, outputBytes: 17408 } })).status, "accepted");
  for (let i = 0; i < 400 && !stack.receiver.applied.size; i++) await new Promise(r => setTimeout(r, 25));
  const applied = stack.receiver.applied.get("cg_infra0000000000000001");
  await stack.close(); void orig;
  assert.equal(applied.state, "retryable"); assert.equal(applied.score, null);
  const led = L.createOfficialLedger();
  led.submitted("cg_infra0000000000000001", { language: "python", workloadId: "P1", cases: 1 }); led.dispatched("cg_infra0000000000000001", { status: "accepted", httpStatus: 202, ms: 1 });
  led.callbackReceived("cg_infra0000000000000001", { outcome: "failed", technicalCode: "RUNNER_INTERNAL", ms: 1 }); led.acknowledged("cg_infra0000000000000001", { answer: "applied", state: "retryable" });
  const g = L.evaluateGates({ official: led.reconcile() });
  assert.equal(g.byId.G10.pass, true); assert.equal(g.byId.G9.pass, true);
  // and a receiver that DID zero it would be caught
  const bad = L.createOfficialLedger();
  bad.submitted("cg_infra0000000000000002", { language: "python", workloadId: "P1", cases: 1 }); bad.dispatched("cg_infra0000000000000002", { status: "accepted", httpStatus: 202, ms: 1 });
  bad.callbackReceived("cg_infra0000000000000002", { outcome: "failed", technicalCode: "RUNNER_INTERNAL", ms: 1 }); bad.acknowledged("cg_infra0000000000000002", { answer: "applied", state: "complete", score: 0 });
  assert.equal(L.evaluateGates({ official: bad.reconcile() }).byId.G10.pass, false);
});
