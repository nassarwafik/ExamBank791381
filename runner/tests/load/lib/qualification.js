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
//   Q-CALLBACK-TRANSPORT   CERT-F / CERT-K: for every burst Σ answers = count AND answers[CALLBACK_CONTRACT[target]] = count (no other
//                          bucket); the stored expectedAnswer must equal the target contract (else FAIL + contradiction)
//   Q-IDEMPOTENCY          CERT-F / CERT-K on LOCAL only (the local receiver really applies the synthetic job): EVERY burst carries
//                          idempotency evidence; re-delivery answered alreadyApplied, both snapshots present, state / score /
//                          application count identical
//   Q-RECOVERY             CERT-G: recoveryVerdict() — settled, lost 0, duplicate applications 0, no resubmission, bounded re-execution
//   Q-ADMISSION            CERT-E: every saturation step has official.overAdmission = 0 (B10-F1 fails this on the current Runner)
//
// Requirement matrix for CERT-F / CERT-K (what is MEASURABLE under the current architecture — never a claim beyond it):
//   local       Q-CORRECTNESS, Q-CALLBACK-TRANSPORT, Q-IDEMPOTENCY   (synthetic job applied by the harness receiver)
//   staging     Q-CORRECTNESS, Q-CALLBACK-TRANSPORT                  (synthetic job cannot exist at the SmartAssess endpoint → UNKNOWN_JOB,
//   production  Q-CORRECTNESS, Q-CALLBACK-TRANSPORT                   nothing is applied, so no idempotency is measured or claimed)
// A future real staging prepared-job test may add a separate idempotency qualification; this phase does not fabricate one.
//
// Independent Review Fix 4: (RF4-A) the EXPECTED answer of a synthetic callback burst is the TARGET CONTRACT (CALLBACK_CONTRACT below),
// never the burst's own stored `expectedAnswer` — a stored value that disagrees FAILS Q-CALLBACK-TRANSPORT with a recorded
// contradiction; (RF4-B) on local EVERY burst must carry idempotency evidence, a burst without it fails Q-IDEMPOTENCY and is never
// covered by another burst; (RF4-C) Q-CORRECTNESS derives from the raw canonical gate set through normalizeCorrectness() (gates.js),
// the ONE correctness authority shared with buildReport — a stored correctness summary can never claim PASS.
const { P1_CEILING_MS, normalizeCorrectness } = require("./gates.js");
const { LANGUAGES: P1_LANGUAGES } = require("./metrics.js");                    // the canonical language registry: python, java, csharp
const { EXECUTION_POLICY } = require("../../../gateway/official.js");

const TARGETS = Object.freeze(["local", "staging", "production"]);
/** The canonical answer a SYNTHETIC callback must receive per target class: the harness receiver applies it on local; at the real
 *  SmartAssess endpoint (staging / production) the job cannot exist → UNKNOWN_JOB. The target class is the authority (RF4-A). */
const CALLBACK_CONTRACT = Object.freeze({ local: "applied", staging: "unknown", production: "unknown" });
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

/** ONE helper for the recovery invariant — used by the recovery scenario AND by Q-RECOVERY so the two can never drift.
 *  Malformed shapes (non-boolean flags, negative / non-integer counts, an invalid allowance) are REFUSED; a measured breach FAILS. */
function recoveryVerdict(rec) {
  const reasons = [];
  if (!rec || typeof rec !== "object" || Array.isArray(rec)) throw new QualificationError("malformed recovery evidence (not an object)");
  for (const k of ["accepted", "lost", "duplicateApplications", "executionsPerJobMax", "complete"]) if (!(Number.isInteger(rec[k]) && rec[k] >= 0)) throw new QualificationError("malformed recovery evidence: " + k + " must be a non-negative integer");
  for (const k of ["settled", "resubmissionNeeded"]) if (typeof rec[k] !== "boolean") throw new QualificationError("malformed recovery evidence: " + k + " must be a boolean");
  if (rec.maxExecutionsAllowed !== undefined && !(Number.isInteger(rec.maxExecutionsAllowed) && rec.maxExecutionsAllowed >= 1)) throw new QualificationError("malformed recovery evidence: maxExecutionsAllowed must be a positive integer");
  if (rec.settled !== true) reasons.push("not settled");
  if (rec.lost !== 0) reasons.push("lost " + rec.lost);
  if (rec.duplicateApplications !== 0) reasons.push("duplicate applications " + rec.duplicateApplications);
  if (rec.resubmissionNeeded !== false) reasons.push("resubmission needed");
  const allowed = Number.isInteger(rec.maxExecutionsAllowed) ? Math.min(rec.maxExecutionsAllowed, MAX_EXECUTIONS_BOUND) : MAX_EXECUTIONS_BOUND;
  if (rec.executionsPerJobMax > allowed) reasons.push("executions per job " + rec.executionsPerJobMax + " > allowed " + allowed);
  if (rec.accepted < 1) reasons.push("no accepted job");
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
  // Independent Review Fix 3 (RF3-C): every canonical language must be PROVEN by its raw sample summary (count ≥ 1, finite max ≤ the
  // ceiling) — `missing` / `violations` are stored summaries and cannot vouch for a language; a malformed sample is refused
  if (p1.samples !== undefined && p1.samples !== null && !isObj(p1.samples)) throw new QualificationError("malformed P1 evidence (samples must be an object)");
  const samples = isObj(p1.samples) ? p1.samples : {};
  for (const lang of P1_LANGUAGES) {
    const s = samples[lang];
    if (s === undefined) { reasons.push(lang + " has no sample evidence"); continue; }
    if (!isObj(s) || !Number.isInteger(s.count) || s.count < 0 || !(s.max === null || (typeof s.max === "number" && Number.isFinite(s.max) && s.max >= 0))) throw new QualificationError("malformed P1 sample evidence for " + lang + " (count must be an integer, max a finite non-negative number)");
    if (s.count < 1 || s.max === null) { reasons.push(lang + " has no sample (count 0)"); continue; }
    if (s.max > P1_CEILING_MS) reasons.push(lang + " maximum " + s.max + " ms > " + P1_CEILING_MS);
  }
  const derived = reasons.length === 0;
  const contradiction = summaryVs("Q-P1", p1.pass, derived);
  return check("Q-P1", derived && !contradiction, derived ? "every language within " + P1_CEILING_MS + " ms" : reasons.join("; "), contradiction);
}
function evalTransport(bursts, target) {
  if (!Array.isArray(bursts)) throw new QualificationError("malformed callback evidence (bursts must be an array)");
  if (!bursts.length) return check("Q-CALLBACK-TRANSPORT", null, "no callback burst measured");
  // RF4-A: the target class decides what every synthetic callback must have been answered; the stored expectedAnswer is
  // reproducibility evidence that must AGREE with the contract — it can never redefine it
  const expected = CALLBACK_CONTRACT[target];
  const details = [], contradictions = [];
  let derived = true;
  for (const b of bursts) {
    if (!isObj(b) || !nonNegInt(b.count) || b.count < 1 || typeof b.expectedAnswer !== "string" || !isObj(b.answers) || !Object.values(b.answers).every(nonNegInt)) throw new QualificationError("malformed callback burst evidence (count, expectedAnswer, answers)");
    if (b.expectedAnswer !== expected) { derived = false; contradictions.push("Q-CALLBACK-TRANSPORT: stored expectedAnswer " + JSON.stringify(b.expectedAnswer) + " contradicts the " + target + " target contract (" + expected + ")"); }
    const total = Object.values(b.answers).reduce((s, n) => s + n, 0);
    const ok = total === b.count && (b.answers[expected] || 0) === b.count;
    if (!ok) derived = false;
    details.push("count " + b.count + ", contract " + expected + ", answers " + JSON.stringify(b.answers) + (ok && b.expectedAnswer === expected ? "" : " ✗"));
    const c = summaryVs("Q-CALLBACK-TRANSPORT", b.transportOk, ok);
    if (c) contradictions.push(c);
  }
  return check("Q-CALLBACK-TRANSPORT", derived && !contradictions.length, details.join("; "), contradictions.join(" | ") || null);
}
function evalIdempotency(bursts) {
  if (!Array.isArray(bursts)) throw new QualificationError("malformed callback evidence (bursts must be an array)");
  if (!bursts.length) return check("Q-IDEMPOTENCY", null, "no idempotent re-delivery measured");
  const details = [], contradictions = [];
  let derived = true;
  // RF4-B: EVERY burst of a local CERT-F / CERT-K must carry its own idempotency evidence — a burst that omits it FAILS the check
  // and is never covered by another burst that has it (fail closed)
  for (const [n, b] of bursts.entries()) {
    if (!isObj(b)) throw new QualificationError("malformed callback burst evidence (not an object)");
    const i = b.idempotency;
    if (i === undefined || i === null) { derived = false; details.push("burst " + (n + 1) + " carries no idempotency evidence ✗"); continue; }
    if (!isObj(i) || typeof i.redeliveryAnswer !== "string") throw new QualificationError("malformed idempotency evidence");
    // RF3-D: a snapshot that is present must be well-formed (state string, score null or finite, applications a non-negative integer)
    for (const [name, s] of [["before", i.before], ["after", i.after]]) { if (s === null || s === undefined) continue; if (!isObj(s) || typeof s.state !== "string" || !(s.score === null || (typeof s.score === "number" && Number.isFinite(s.score))) || !nonNegInt(s.applications)) throw new QualificationError("malformed idempotency snapshot (" + name + ")"); }
    const snap = s => isObj(s);
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
  // Independent Review Fix 3 (RF3-B): every saturation step must carry an `official` evidence object; overAdmission null = legitimately
  // NOT measured (INCOMPLETE); a measured value must be a non-negative integer backed by official.accepted (non-negative integer) and
  // officialMaxPending (positive integer) and is RE-DERIVED — derivedOver = max(0, accepted − maxPending) is authoritative; a stored
  // value that disagrees FAILS with a recorded contradiction. Malformed shapes are refused.
  if (saturation === undefined || saturation === null) return check("Q-ADMISSION", null, "no saturation step measured");
  if (!isObj(saturation) || !Array.isArray(saturation.steps)) throw new QualificationError("malformed admission evidence (saturation.steps must be an array)");
  const steps = saturation.steps;
  if (!steps.length) return check("Q-ADMISSION", null, "no saturation step measured");
  const measured = [], contradictions = [];
  let unmeasured = 0;
  for (const s of steps) {
    if (!isObj(s) || !isObj(s.official)) throw new QualificationError("malformed admission evidence (a saturation step has no official evidence object)");
    const o = s.official;
    if (!Object.prototype.hasOwnProperty.call(o, "overAdmission")) throw new QualificationError("malformed admission evidence (official.overAdmission missing)");
    if (o.overAdmission === null) { unmeasured++; continue; }
    if (!nonNegInt(o.overAdmission)) throw new QualificationError("malformed admission evidence (official.overAdmission must be null or a non-negative integer)");
    if (!nonNegInt(o.accepted)) throw new QualificationError("malformed admission evidence (official.accepted must be a non-negative integer)");
    if (!(Number.isInteger(s.officialMaxPending) && s.officialMaxPending >= 1)) throw new QualificationError("malformed admission evidence (officialMaxPending must be a positive integer when overAdmission is measured)");
    const derived = Math.max(0, o.accepted - s.officialMaxPending);
    if (derived !== o.overAdmission) contradictions.push("Q-ADMISSION: stored overAdmission " + o.overAdmission + " contradicts the evidence (accepted " + o.accepted + " − maxPending " + s.officialMaxPending + " → derived " + derived + ")");
    measured.push({ accepted: o.accepted, maxPending: s.officialMaxPending, over: derived });
  }
  if (unmeasured) return check("Q-ADMISSION", null, "the Runner's maxPending is unknown for " + unmeasured + " step(s) (declare it with --runner-max-pending)");
  const over = measured.filter(m => m.over > 0);
  const detail = over.length ? "B10-F1 over-admission: " + over.map(m => m.accepted + " accepted with maxPending " + m.maxPending + " (" + m.over + " over)").join("; ") : "every saturation step within the admission bound";
  return check("Q-ADMISSION", over.length === 0 && !contradictions.length, detail, contradictions.join(" | ") || null);
}

/**
 * evaluateQualification({ scenarioId, target, correctness, p1?, bursts?, recovery?, saturation? })
 * → { required, checks, failed, notEvaluated, contradictions, pass, verdict: "PASS" | "FAIL" | "INCOMPLETE" }
 * Throws QualificationError on an unknown scenario / target or malformed evidence (the report is refused).
 */
function evaluateQualification({ scenarioId, target, correctness, p1, bursts, recovery, saturation } = {}) {
  const ids = requiredChecksFor(scenarioId, target);
  // RF4-C: the correctness evidence is normalized from its RAW gate entries by the one canonical authority (gates.js); a bare
  // summary (no gates), a missing / duplicate / unknown gate or an inconsistent pair is refused — the normalized object is returned
  // to the caller (buildReport) so no second derivation exists
  let normalized;
  try { normalized = normalizeCorrectness(correctness); } catch (e) { throw new QualificationError(String(e && e.message || e)); }
  const checks = [];
  for (const id of ids) {
    if (id === "Q-CORRECTNESS") {
      const c = normalized, derivedPass = c.verdict === "PASS" ? true : c.verdict === "FAIL" ? false : null;
      const contradiction = c.contradictions.length ? c.contradictions.join(" | ") : null;
      checks.push(check(id, derivedPass === null ? null : derivedPass && !contradiction, "correctness " + c.verdict + (c.failed.length ? " (" + c.failed.join(", ") + ")" : "") + (c.notEvaluated.length ? " not evaluated: " + c.notEvaluated.join(", ") : ""), contradiction));
    }
    else if (id === "Q-P1") checks.push(evalP1(p1));
    else if (id === "Q-CALLBACK-TRANSPORT") checks.push(evalTransport(bursts || [], target));
    else if (id === "Q-IDEMPOTENCY") checks.push(evalIdempotency(bursts || []));
    else if (id === "Q-RECOVERY") checks.push(evalRecovery(recovery));
    else if (id === "Q-ADMISSION") checks.push(evalAdmission(saturation));
  }
  const failed = checks.filter(c => c.evaluated && c.pass === false).map(c => c.id);
  const notEvaluated = checks.filter(c => !c.evaluated).map(c => c.id);
  const contradictions = checks.map(c => c.contradiction).filter(Boolean);
  const pass = failed.length === 0 && notEvaluated.length === 0;
  const verdict = failed.length ? "FAIL" : notEvaluated.length ? "INCOMPLETE" : "PASS";
  return { required: ids, checks, failed, notEvaluated, contradictions, pass, verdict, correctness: normalized };
}

module.exports = { TARGETS, CALLBACK_CONTRACT, TITLES: Object.freeze({ ...TITLES }), KNOWN_CHECKS, SCENARIO_CHECKS, MAX_EXECUTIONS_BOUND, QualificationError, requiredChecksFor, assertQualificationMetadata, recoveryVerdict, evaluateQualification };
