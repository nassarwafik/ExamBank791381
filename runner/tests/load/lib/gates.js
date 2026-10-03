"use strict";
// Phase 17F-B10-A — the PASS / FAIL CONTRACT. Ten machine-evaluable CORRECTNESS gates; performance (percentiles, throughput) is
// reported beside them and never decides a verdict. A gate whose input was not measured is "not evaluated" and the verdict is then
// INCOMPLETE — never PASS. Any evaluated gate that fails makes the verdict FAIL, whatever the averages say.
const { journalConsistency } = require("./accounting.js");

const P1_CEILING_MS = 40000;                     // Pilot Gate P1 (A2): end-to-end practice ≤ 40 s (SWA 45 s ceiling − 5 s margin)
const GATE_IDS = Object.freeze(["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"]);
const TITLES = Object.freeze({
  G1: "lost official jobs = 0", G2: "duplicate official grade application = 0", G3: "corrupt journal records = 0",
  G4: "hidden-test leakage = 0", G5: "unexpected callback backlog at final settlement = 0", G6: "unexpected callback failures = 0",
  G7: "Runner remains responsive after the saturation scenario", G8: "production safety ceiling never exceeded",
  G9: "accepted jobs settle or have an explicit known retryable state", G10: "no infrastructure failure becomes a final academic zero",
  G11: "observed outcomes match the workload expectations (status, output)"
});

const gate = (id, pass, detail) => ({ id, title: TITLES[id], evaluated: pass !== null, pass, detail });

/**
 * evaluateGates({ practice?, official?, journal?, journalExpected?, responsive?, governor?, leak? }) →
 *   { gates: [...], byId, correctnessPass, verdict: "PASS" | "FAIL" | "INCOMPLETE", notEvaluated: [...] }
 */
function evaluateGates({ practice, official, journal, journalExpected, responsive, governor, leak } = {}) {
  const gates = [];
  const J = journal ? journalConsistency(journal, { expected: journalExpected || {} }) : null;
  gates.push(official ? gate("G1", official.lost.length === 0, official.lost.length + " lost of " + official.accepted + " accepted") : gate("G1", null, "no official ledger"));
  gates.push(official ? gate("G2", official.duplicateApplications === 0 && official.idempotencyViolations.length === 0, official.duplicateApplications + " duplicate application(s), " + official.idempotencyViolations.length + " score drift(s), " + official.duplicateCallbackAcks + " idempotent alreadyApplied answer(s)") : gate("G2", null, "no official ledger"));
  gates.push(J ? gate("G3", J.corrupt === 0 && J.quarantined === 0, "corrupt " + J.corrupt + ", quarantined " + J.quarantined) : gate("G3", null, "no journal status"));
  const leaks = (official ? official.hiddenLeaks : 0) + (leak && Number.isFinite(leak.count) ? leak.count : 0) + (practice && Number.isFinite(practice.leaks) ? practice.leaks : 0);
  gates.push(official || leak || practice ? gate("G4", leaks === 0, leaks + " leak(s) observed in callback bodies / practice results") : gate("G4", null, "nothing observed"));
  gates.push(J ? gate("G5", !J.issues.includes("owed-callbacks") && !J.issues.includes("unexplained-running") && !J.issues.includes("unexplained-received"), "executed " + J.counts.executed + ", running " + J.counts.running + ", received " + J.counts.received + (J.declared.length ? " (declared: " + J.declared.join(", ") + ")" : "")) : gate("G5", null, "no journal status"));
  gates.push(J ? gate("G6", !J.issues.includes("callback-failed"), "callback_failed " + J.counts.callback_failed + (J.declared.some(d => d.startsWith("callback_failed")) ? " (declared)" : "")) : gate("G6", null, "no journal status"));
  gates.push(typeof responsive === "boolean" ? gate("G7", responsive, responsive ? "/healthz 200 after the run" : "the Runner did not answer /healthz after the run") : gate("G7", null, "responsiveness not probed"));
  gates.push(governor ? gate("G8", governor.ceilingExceeded === false, governor.ceilingExceeded ? "a safety ceiling was crossed" : "peak concurrency " + (governor.peakConcurrency === undefined ? "-" : governor.peakConcurrency) + ", stopped: " + (governor.stopped || "no")) : gate("G8", null, "no governor snapshot"));
  gates.push(official ? gate("G9", official.identityHolds, "accepted " + official.accepted + " = complete " + official.complete + " + retryable " + official.retryable + " + failed " + official.failedTerminal + " (remainder " + official.remainder + ")") : gate("G9", null, "no official ledger"));
  gates.push(official ? gate("G10", official.infrastructureZeroes.length === 0, official.infrastructureZeroes.length + " technical outcome(s) applied as a final zero") : gate("G10", null, "no official ledger"));
  const mism = (practice && Number.isFinite(practice.mismatches) ? practice.mismatches : 0) + (official && Number.isFinite(official.mismatches) ? official.mismatches : 0);
  gates.push(practice || official ? gate("G11", mism === 0, mism + " expectation mismatch(es)") : gate("G11", null, "nothing observed"));
  const byId = Object.fromEntries(gates.map(g => [g.id, g]));
  const failed = gates.filter(g => g.evaluated && g.pass === false).map(g => g.id);
  const notEvaluated = gates.filter(g => !g.evaluated).map(g => g.id);
  const correctnessPass = failed.length === 0 && notEvaluated.length === 0;
  const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";
  return { gates, byId, failed, notEvaluated, correctnessPass, verdict };
}

/** P1 regression: every sample of every language ≤ 40 s; a missing / empty language FAILS (nothing is assumed). */
function p1Gate(samplesByLanguage, ceilingMs = P1_CEILING_MS) {
  const violations = [], missing = [];
  for (const l of ["python", "java", "csharp"]) {
    const s = samplesByLanguage && Array.isArray(samplesByLanguage[l]) ? samplesByLanguage[l] : [];
    if (!s.length) { missing.push(l); continue; }
    for (const ms of s) if (!(Number.isFinite(ms) && ms <= ceilingMs)) violations.push({ language: l, ms, ceilingMs });
  }
  return { pass: violations.length === 0 && missing.length === 0, violations, missing, ceilingMs };
}

module.exports = { P1_CEILING_MS, GATE_IDS, TITLES, evaluateGates, p1Gate };
