"use strict";
// Phase 17F-B10-A — SCENARIO QUALIFICATION (Independent Review Fix 1, hardened by Independent Review Fix 2).
// Correctness (gates.js, G1–G11) answers "did the platform behave correctly"; qualification answers "did THIS scenario meet its own
// pass rule". The top-level verdict of a report is the qualification verdict: correctness PASS + every required scenario check PASS.
// A required check that failed → FAIL whatever the averages say; a required check that was not measured → INCOMPLETE, never PASS.
//
// AUTHORITY (RF2-B / RF2-C): the CANONICAL registry below is the only source of the required checks, derived from the scenario id and
// the target class. `scenario.config.qualification` in a report is reproducibility METADATA: it must match the canon exactly or the
// report is refused (report.js). An unknown scenario or an unknown target class is refused — it can never downgrade to
// "correctness only". The accepted target classes are exactly local, staging, production.
//
// EVIDENCE (RF2-D): every check derives its result from the RAW evidence, never from a stored summary boolean (`p1.pass`,
// `transportOk`, `idempotency.pass`, `recovery.pass`). When a summary contradicts its evidence the check FAILS and the contradiction is
// recorded (`contradictions[]`); malformed certification evidence (wrong shapes) is REFUSED (thrown) — a measured failure is a FAIL,
// corrupt metadata is an error, never a silent optimistic choice.
//
//   Q-CORRECTNESS          every scenario: the correctness verdict (gates.js) is PASS
//   Q-P1                   CERT-J: violations empty, missing empty, canonical ceiling (40 000 ms), every per-language maximum ≤ ceiling
//   Q-CALLBACK-TRANSPORT   CERT-F / CERT-K: for every burst Σ answers = count AND answers[expectedAnswer] = count (no other bucket)
//   Q-IDEMPOTENCY          CERT-F / CERT-K on LOCAL only (the local receiver really applies the synthetic job): re-delivery answered
//                          alreadyApplied, both snapshots present, state / score / application count identical
//   Q-RECOVERY             CERT-G: recoveryVerdict() — settled, lost 0, duplicate applications 0, no resubmission, bounded re-execution
//   Q-ADMISSION            CERT-E: every saturation step has official.overAdmission = 0 (B10-F1 fails this on the current Runner)
//
// Requirement matrix for CERT-F / CERT-K (what is MEASURABLE under the current architecture — never a claim beyond it):
//   local       Q-CORRECTNESS, Q-CALLBACK-TRANSPORT, Q-IDEMPOTENCY   (synthetic job applied by the harness receiver)
//   staging     Q-CORRECTNESS, Q-CALLBACK-TRANSPORT                  (synthetic job cannot exist at the SmartAssess endpoint → UNKNOWN_JOB,
//   production  Q-CORRECTNESS, Q-CALLBACK-TRANSPORT                   nothing is applied, so no idempotency is measured or claimed)
// A future real staging prepared-job test may add a separate idempotency qualification; this phase does not fabricate one.
const { P1_CEILING_MS } = require("./gates.js");
const { EXECUTION_POLICY } = require("../../../gateway/official.js");

const TARGETS = Object.freeze(["local", "staging", "production"]);
const TITLES = Object.freeze({
  "Q-CORRECTNESS": "correctness gates G1–G11 PASS",
  "Q-P1": "P1 regression: every language ≤ 40 000 ms end to end",
  "Q-CALLBACK-TRANSPORT": "callback transport: every burst delivered, every answer as the target contract expects",
  "Q-IDEMPOTENCY": "idempotent re-delivery: alreadyApplied, state / score / application count unchanged",
  "Q-RECOVERY": "recovery under load: every accepted job settled, applied once, no resubmission, bounded re-execution",
  "Q-ADMISSION": "admission control: every saturation step respected the Runner's bound (official.overAdmission = 0)"
});
const KNOWN_CHECKS = Object.freeze(Object.keys(TITLES));
const TRANSPORT_ONLY = ["Q-CALLBACK-TRANSPORT"], TRANSPORT_AND_IDEMPOTENCY = ["Q-CALLBACK-TRANSPORT", "Q-IDEMPOTENCY"];
/** The canonical registry: scenario id → required checks beyond Q-CORRECTNESS (a function receives the target class). */
const SCENARIO_CHECKS = Object.freeze({
  "CERT-A": [], "CERT-B": [], "CERT-C": [], "CERT-D": [], "CERT-H": [], "CERT-I": [], "CERT-L": [],
  "CERT-E": ["Q-ADMISSION"],
  "CERT-F": target => (target === "local" ? TRANSPORT_AND_IDEMPOTENCY : TRANSPORT_ONLY),
  "CERT-G": ["Q-RECOVERY"],
  "CERT-J": ["Q-P1"],
  "CERT-K": target => (target === "local" ? TRANSPORT_AND_IDEMPOTENCY : TRANSPORT_ONLY)
});
/** The maximum physical executions of one job the recovery scenario may observe: the first run plus the Runner's own bound on re-runs. */
const MAX_EXECUTIONS_BOUND = 1 + EXECUTION_POLICY.maxInterruptions;

class QualificationError extends Error { constructor(message) { super("qualification: " + message); this.name = "QualificationError"; } }

function assertTarget(target) { if (typeof target !== "string" || !TARGETS.includes(target)) throw new QualificationError("unknown target class " + JSON.stringify(target) + " (accepted: " + TARGETS.join(", ") + ")"); }
/** The canonical required check ids of a scenario on a target class. Unknown scenario / target → refused (fail closed). */
function requiredChecksFor(scenarioId, target) {
  assertTarget(target);
  if (typeof scenarioId !== "string" || !Object.prototype.hasOwnProperty.call(SCENARIO_CHECKS, scenarioId)) throw new QualificationError("unknown scenario " + JSON.stringify(scenarioId));
  const extra = SCENARIO_CHECKS[scenarioId];
  return ["Q-CORRECTNESS", ...(typeof extra === "function" ? extra(target) : extra)];
}
/** Validates reproducibility metadata against the canon: an array, known ids only, no duplicates, EXACTLY the canonical set. */
function assertQualificationMetadata(metadata, scenarioId, target) {
  const canon = requiredChecksFor(scenarioId, target);
  if (!Array.isArray(metadata)) throw new QualificationError("scenario.config.qualification must be an array");
  if (metadata.some(id => typeof id !== "string" || !KNOWN_CHECKS.includes(id))) throw new QualificationError("scenario.config.qualification names an unknown check (" + metadata.filter(id => !KNOWN_CHECKS.includes(id)).join(", ") + ")");
  if (new Set(metadata).size !== metadata.length) throw new QualificationError("scenario.config.qualification contains a duplicate check");
  const a = metadata.slice().sort().join(","), b = canon.slice().sort().join(",");
  if (a !== b) throw new QualificationError("scenario.config.qualification [" + a + "] does not match the canonical requirements of " + scenarioId + " on " + target + " [" + b + "]");
  return canon;
}

/** ONE helper for the recovery invariant — used by the recovery scenario AND by Q-RECOVERY so the two can never drift. */
function recoveryVerdict(rec) {
  const reasons = [];
  if (!rec || typeof rec !== "object") return { pass: false, reasons: ["no recovery evidence"] };
  if (rec.settled !== true) reasons.push("not settled");
  if (rec.lost !== 0) reasons.push("lost " + rec.lost);
  if (rec.duplicateApplications !== 0) reasons.push("duplicate applications " + rec.duplicateApplications);
  if (rec.resubmissionNeeded !== false) reasons.push("resubmission needed");
  const allowed = Number.isInteger(rec.maxExecutionsAllowed) ? Math.min(rec.maxExecutionsAllowed, MAX_EXECUTIONS_BOUND) : MAX_EXECUTIONS_BOUND;
  if (!Number.isInteger(rec.executionsPerJobMax) || rec.executionsPerJobMax > allowed) reasons.push("executions per job " + rec.executionsPerJobMax + " > allowed " + allowed);
  if (!Number.isInteger(rec.accepted) || rec.accepted < 1) reasons.push("no accepted job");
  return { pass: reasons.length === 0, reasons };
}

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const nonNegInt = v => Number.isInteger(v) && v >= 0;
const check = (id, pass, detail, contradiction = null) => ({ id, title: TITLES[id], required: true, evaluated: pass !== null, pass, detail, contradiction });
const summaryVs = (id, summary, derived) => (typeof summary === "boolean" && summary !== derived ? id + ": stored summary pass=" + summary + " contradicts the evidence (derived " + derived + ")" : null);

function evalP1(p1) {
  if (p1 === undefined || p1 === null) return check("Q-P1", null, "P1 not measured");
  if (!isObj(p1) || !Array.isArray(p1.violations) || !Array.isArray(p1.missing)) throw new QualificationError("malformed P1 evidence (violations / missing must be arrays)");
  const reasons = [];
  if (p1.ceilingMs !== P1_CEILING_MS) reasons.push("ceiling " + p1.ceilingMs + " ms is not the canonical " + P1_CEILING_MS + " ms");
  for (const v of p1.violations) reasons.push((v && v.language) + " " + (v && v.ms) + " ms > " + P1_CEILING_MS);
  for (const l of p1.missing) reasons.push(l + " not measured");
  if (isObj(p1.samples)) for (const [lang, s] of Object.entries(p1.samples)) { if (isObj(s) && typeof s.max === "number" && s.max > P1_CEILING_MS) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS); }
  const derived = reasons.length === 0;
  const contradiction = summaryVs("Q-P1", p1.pass, derived);
  return check("Q-P1", derived && !contradiction, derived ? "every language within " + P1_CEILING_MS + " ms" : reasons.join("; "), contradiction);
}
function evalTransport(bursts) {
  if (!Array.isArray(bursts)) throw new QualificationError("malformed callback evidence (bursts must be an array)");
  if (!bursts.length) return check("Q-CALLBACK-TRANSPORT", null, "no callback burst measured");
  const details = [], contradictions = [];
  let derived = true;
  for (const b of bursts) {
    if (!isObj(b) || !nonNegInt(b.count) || b.count < 1 || typeof b.expectedAnswer !== "string" || !isObj(b.answers) || !Object.values(b.answers).every(nonNegInt)) throw new QualificationError("malformed callback burst evidence (count, expectedAnswer, answers)");
    const total = Object.values(b.answers).reduce((s, n) => s + n, 0);
    const ok = total === b.count && (b.answers[b.expectedAnswer] || 0) === b.count;
    if (!ok) derived = false;
    details.push("count " + b.count + ", expected " + b.expectedAnswer + ", answers " + JSON.stringify(b.answers) + (ok ? "" : " ✗"));
    const c = summaryVs("Q-CALLBACK-TRANSPORT", b.transportOk, ok);
    if (c) contradictions.push(c);
  }
  return check("Q-CALLBACK-TRANSPORT", derived && !contradictions.length, details.join("; "), contradictions.join(" | ") || null);
}
function evalIdempotency(bursts) {
  if (!Array.isArray(bursts)) throw new QualificationError("malformed callback evidence (bursts must be an array)");
  const list = bursts.filter(b => isObj(b) && b.idempotency !== undefined && b.idempotency !== null);
  if (!list.length) return check("Q-IDEMPOTENCY", null, "no idempotent re-delivery measured");
  const details = [], contradictions = [];
  let derived = true;
  for (const b of list) {
    const i = b.idempotency;
    if (!isObj(i) || typeof i.redeliveryAnswer !== "string") throw new QualificationError("malformed idempotency evidence");
    const snap = s => isObj(s) && typeof s.state === "string" && (typeof s.score === "number" || s.score === null) && Number.isInteger(s.applications);
    const ok = i.redeliveryAnswer === "alreadyApplied" && snap(i.before) && snap(i.after) && i.before.state === i.after.state && i.before.score === i.after.score && i.before.applications === i.after.applications;
    if (!ok) derived = false;
    details.push("re-delivery " + i.redeliveryAnswer + ", before " + JSON.stringify(i.before) + ", after " + JSON.stringify(i.after) + (ok ? "" : " ✗"));
    const c = summaryVs("Q-IDEMPOTENCY", i.pass, ok);
    if (c) contradictions.push(c);
  }
  return check("Q-IDEMPOTENCY", derived && !contradictions.length, details.join("; "), contradictions.join(" | ") || null);
}
function evalRecovery(rec) {
  if (rec === undefined || rec === null) return check("Q-RECOVERY", null, "recovery not measured");
  if (!isObj(rec)) throw new QualificationError("malformed recovery evidence");
  const v = recoveryVerdict(rec);
  const contradiction = summaryVs("Q-RECOVERY", rec.pass, v.pass);
  return check("Q-RECOVERY", v.pass && !contradiction, v.pass ? "settled, lost 0, duplicate applications 0, no resubmission, executions per job ≤ " + Math.min(Number.isInteger(rec.maxExecutionsAllowed) ? rec.maxExecutionsAllowed : MAX_EXECUTIONS_BOUND, MAX_EXECUTIONS_BOUND) : v.reasons.join("; "), contradiction);
}
function evalAdmission(saturation) {
  const steps = saturation && Array.isArray(saturation.steps) ? saturation.steps : [];
  const measured = steps.filter(s => s && s.official && typeof s.official.overAdmission === "number");
  const unmeasured = steps.filter(s => s && s.official && s.official.overAdmission === null);
  if (!steps.length || unmeasured.length) return check("Q-ADMISSION", null, steps.length ? "the Runner's maxPending is unknown for " + unmeasured.length + " step(s) (declare it with --runner-max-pending)" : "no saturation step measured");
  const over = measured.filter(s => s.official.overAdmission > 0);
  return check("Q-ADMISSION", over.length === 0, over.length ? "B10-F1 over-admission: " + over.map(s => s.official.accepted + " accepted with maxPending " + (s.officialMaxPending === undefined ? "?" : s.officialMaxPending) + " (" + s.official.overAdmission + " over)").join("; ") : "every saturation step within the admission bound");
}

/**
 * evaluateQualification({ scenarioId, target, correctness, p1?, bursts?, recovery?, saturation? })
 * → { required, checks, failed, notEvaluated, contradictions, pass, verdict: "PASS" | "FAIL" | "INCOMPLETE" }
 * Throws QualificationError on an unknown scenario / target or malformed evidence (the report is refused).
 */
function evaluateQualification({ scenarioId, target, correctness, p1, bursts, recovery, saturation } = {}) {
  const ids = requiredChecksFor(scenarioId, target);
  const checks = [];
  for (const id of ids) {
    if (id === "Q-CORRECTNESS") checks.push(correctness && typeof correctness.verdict === "string" ? check(id, correctness.verdict === "PASS" ? true : correctness.verdict === "FAIL" ? false : null, "correctness " + correctness.verdict + (correctness.failed && correctness.failed.length ? " (" + correctness.failed.join(", ") + ")" : "") + (correctness.notEvaluated && correctness.notEvaluated.length ? " not evaluated: " + correctness.notEvaluated.join(", ") : "")) : check(id, null, "no correctness result"));
    else if (id === "Q-P1") checks.push(evalP1(p1));
    else if (id === "Q-CALLBACK-TRANSPORT") checks.push(evalTransport(bursts || []));
    else if (id === "Q-IDEMPOTENCY") checks.push(evalIdempotency(bursts || []));
    else if (id === "Q-RECOVERY") checks.push(evalRecovery(recovery));
    else if (id === "Q-ADMISSION") checks.push(evalAdmission(saturation));
  }
  const failed = checks.filter(c => c.evaluated && c.pass === false).map(c => c.id);
  const notEvaluated = checks.filter(c => !c.evaluated).map(c => c.id);
  const contradictions = checks.map(c => c.contradiction).filter(Boolean);
  const pass = failed.length === 0 && notEvaluated.length === 0;
  const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";
  return { required: ids, checks, failed, notEvaluated, contradictions, pass, verdict };
}

module.exports = { TARGETS, TITLES: Object.freeze({ ...TITLES }), KNOWN_CHECKS, SCENARIO_CHECKS, MAX_EXECUTIONS_BOUND, QualificationError, requiredChecksFor, assertQualificationMetadata, recoveryVerdict, evaluateQualification };
