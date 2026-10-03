"use strict";
// Phase 17F-B10-A — Independent Review Fix 1: SCENARIO QUALIFICATION. Correctness (gates.js, G1–G11) answers "did the platform
// behave correctly"; qualification answers "did THIS scenario meet its own pass rule". The top-level verdict of a report is the
// qualification verdict: correctness PASS + every required scenario check PASS. A required check that failed makes the run FAIL
// whatever the averages say; a required check that was not measured makes it INCOMPLETE — never PASS. Performance stays reported
// separately; a check here never masquerades as a correctness gate.
//   Q-CORRECTNESS          every scenario: the correctness verdict (gates.js) is PASS
//   Q-P1                   CERT-J: performance.p1.pass (every language ≤ 40 s, no missing language)
//   Q-CALLBACK-TRANSPORT   CERT-F / CERT-K: every callback burst reached the target and every answer matched the target contract
//                          (local / staging receiver → applied; production synthetic job → UNKNOWN_JOB "unknown")
//   Q-IDEMPOTENCY          CERT-F / CERT-K when the plan requested an idempotent re-delivery: alreadyApplied, state / score /
//                          application count unchanged (snapshot BEFORE vs AFTER the re-delivery)
//   Q-RECOVERY             CERT-G: recovery.pass
//   Q-ADMISSION            CERT-E: every saturation step respected the Runner's admission bound — official.overAdmission = 0
//                          (the current Runner fails this under concurrent arrivals: finding B10-F1; the acceptance rule does not
//                          change when B3 fixes official.js — the same scenario then turns PASS)
const TITLES = Object.freeze({
  "Q-CORRECTNESS": "correctness gates G1–G11 PASS",
  "Q-P1": "P1 regression: every language ≤ 40 000 ms end to end",
  "Q-CALLBACK-TRANSPORT": "callback transport: every burst delivered, every answer as the target contract expects",
  "Q-IDEMPOTENCY": "idempotent re-delivery: alreadyApplied, state / score / application count unchanged",
  "Q-RECOVERY": "recovery under load: every accepted job settled, applied once, no resubmission",
  "Q-ADMISSION": "admission control: every saturation step respected the Runner's bound (official.overAdmission = 0)"
});
/** The scenario-specific checks of each scenario (Q-CORRECTNESS is always required). A function receives the target name. */
const SCENARIO_CHECKS = Object.freeze({
  "CERT-A": [], "CERT-B": [], "CERT-C": [], "CERT-D": [], "CERT-H": [], "CERT-I": [], "CERT-L": [],
  "CERT-E": ["Q-ADMISSION"],
  "CERT-F": target => (target === "production" ? ["Q-CALLBACK-TRANSPORT"] : ["Q-CALLBACK-TRANSPORT", "Q-IDEMPOTENCY"]),
  "CERT-G": ["Q-RECOVERY"],
  "CERT-J": ["Q-P1"],
  "CERT-K": target => (target === "production" ? ["Q-CALLBACK-TRANSPORT"] : ["Q-CALLBACK-TRANSPORT", "Q-IDEMPOTENCY"])
});

/** The required check ids of a scenario on a target (unknown scenario → correctness only, so nothing is ever skipped by a typo). */
function requiredChecksFor(scenarioId, target) {
  const extra = SCENARIO_CHECKS[scenarioId];
  const list = typeof extra === "function" ? extra(target) : Array.isArray(extra) ? extra : [];
  return ["Q-CORRECTNESS", ...list];
}

const check = (id, pass, detail) => ({ id, title: TITLES[id], required: true, evaluated: pass !== null, pass, detail });

/**
 * evaluateQualification({ scenarioId, target, correctness, required?, p1?, bursts?, recovery?, saturation? })
 * → { required, checks, failed, notEvaluated, pass, verdict: "PASS" | "FAIL" | "INCOMPLETE" }
 */
function evaluateQualification({ scenarioId, target = "local", correctness, required, p1, bursts, recovery, saturation } = {}) {
  const ids = Array.isArray(required) && required.length ? required.slice() : requiredChecksFor(scenarioId, target);
  if (!ids.includes("Q-CORRECTNESS")) ids.unshift("Q-CORRECTNESS");
  const checks = [];
  for (const id of ids) {
    if (id === "Q-CORRECTNESS") {
      checks.push(correctness && typeof correctness.verdict === "string" ? check(id, correctness.verdict === "PASS" ? true : correctness.verdict === "FAIL" ? false : null, "correctness " + correctness.verdict + (correctness.failed && correctness.failed.length ? " (" + correctness.failed.join(", ") + ")" : "") + (correctness.notEvaluated && correctness.notEvaluated.length ? " not evaluated: " + correctness.notEvaluated.join(", ") : "")) : check(id, null, "no correctness result"));
    } else if (id === "Q-P1") {
      checks.push(p1 && typeof p1.pass === "boolean" ? check(id, p1.pass, p1.pass ? "every language within " + p1.ceilingMs + " ms" : (p1.violations || []).map(v => v.language + " " + v.ms + " ms > " + v.ceilingMs).concat((p1.missing || []).map(l => l + " not measured")).join("; ")) : check(id, null, "P1 not measured"));
    } else if (id === "Q-CALLBACK-TRANSPORT") {
      const list = Array.isArray(bursts) ? bursts : [];
      checks.push(list.length ? check(id, list.every(b => b && b.transportOk === true), list.map(b => "expected " + b.expectedAnswer + ", answers " + JSON.stringify(b.answers || {})).join("; ")) : check(id, null, "no callback burst measured"));
    } else if (id === "Q-IDEMPOTENCY") {
      const list = (Array.isArray(bursts) ? bursts : []).filter(b => b && b.idempotency);
      checks.push(list.length ? check(id, list.every(b => b.idempotency.pass === true), list.map(b => "re-delivery " + b.idempotency.redeliveryAnswer + ", state " + (b.idempotency.stateUnchanged ? "unchanged" : "CHANGED") + ", score " + (b.idempotency.scoreUnchanged ? "unchanged" : "CHANGED") + ", applications " + (b.idempotency.applicationsUnchanged ? "unchanged" : "CHANGED")).join("; ")) : check(id, null, "no idempotent re-delivery measured"));
    } else if (id === "Q-RECOVERY") {
      checks.push(recovery && typeof recovery.pass === "boolean" ? check(id, recovery.pass, "settled " + recovery.settled + ", complete " + recovery.complete + ", lost " + recovery.lost + ", duplicate applications " + recovery.duplicateApplications + ", max executions per job " + recovery.executionsPerJobMax) : check(id, null, "recovery not measured"));
    } else if (id === "Q-ADMISSION") {
      const steps = saturation && Array.isArray(saturation.steps) ? saturation.steps : [];
      const measured = steps.filter(s => s && s.official && typeof s.official.overAdmission === "number");
      const unmeasured = steps.filter(s => s && s.official && s.official.overAdmission === null);
      if (!steps.length || unmeasured.length) checks.push(check(id, null, steps.length ? "the Runner's maxPending is unknown for " + unmeasured.length + " step(s) (declare it with --runner-max-pending)" : "no saturation step measured"));
      else { const over = measured.filter(s => s.official.overAdmission > 0); checks.push(check(id, over.length === 0, over.length ? "B10-F1 over-admission: " + over.map(s => s.official.accepted + " accepted with maxPending " + (s.officialMaxPending === undefined ? "?" : s.officialMaxPending) + " (" + s.official.overAdmission + " over)").join("; ") : "every saturation step within the admission bound")); }
    } else checks.push(check(id, null, "unknown check"));
  }
  const failed = checks.filter(c => c.evaluated && c.pass === false).map(c => c.id);
  const notEvaluated = checks.filter(c => !c.evaluated).map(c => c.id);
  const pass = failed.length === 0 && notEvaluated.length === 0;
  const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";
  return { required: ids, checks, failed, notEvaluated, pass, verdict };
}

module.exports = { TITLES: Object.freeze({ ...TITLES }), SCENARIO_CHECKS, requiredChecksFor, evaluateQualification };
