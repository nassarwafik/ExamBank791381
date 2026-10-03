"use strict";
// FROZEN copy of the PRE-C2 (17F-B1, main d2ae703b8608d82c0f20b68be495eabf76a048a2) status logic — the "old server" and the "old
// client" of the mixed-version / rollback proofs of Phase 17F-C2 Review Fix 1. Copied VERBATIM from:
//   api/src/lib/coding/official-grading.js   studentCodingGradingStatus · autoGradingPending · overrideScoreOf · isObj
//                                            gradeableQuestion's version gate `(q.questionTypeVersion !== undefined && q.questionTypeVersion !== 1)`
//   api/src/lib/coding/grading-recovery.js   recoveryDecision (+ ACTIVE, retryBackoffMs, RECOVERY_POLICY, timeOf, automaticAttempts)
//   src/questionTypeCatalog.ts               effectiveQuestionTypeVersion over the pre-C2 catalog row coding@1
//   src/codingGradingStatus.ts               codingGradingStatusOf · isCodingGradingOpen · scoreWithheld (the B1 headline resolver)
// NEVER edit this file to make a test pass: it is the behaviour a cached B1 browser / a rolled-back API binary actually has.

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);

function overrideScoreOf(attempt, id) {
  const o = attempt && isObj(attempt.manualOverrides) ? attempt.manualOverrides[id] : null;
  if (!isObj(o) || o.score === undefined || o.score === null) return null;
  const n = Number(o.score);
  return Number.isFinite(n) ? n : null;
}

function studentCodingGradingStatus(attempt) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  if (!t) return undefined;
  let seen = false, exhausted = 0, best = 0;                          // best: 0 none · 1 queued · 2 processing · 3 retrying
  for (const [id, x] of Object.entries(t)) {
    if (!isObj(x)) continue;
    // Phase 17E-D (F3) — an OPEN target of a question the teacher has already marked manually cannot change the mark: it is
    // background evidence for the teacher only. The student never sees "automatic grading in progress" next to that mark.
    if (x.state !== "complete" && overrideScoreOf(attempt, id) !== null) continue;
    seen = true;
    if (x.state === "complete") continue;
    if (x.state === "retryable" && isObj(x.recovery) && x.recovery.exhausted === true) { exhausted++; continue; }
    best = Math.max(best, x.state === "retryable" ? 3 : x.state === "pending" ? 1 : 2);
  }
  if (!seen) return undefined;
  if (best) return ["", "queued", "processing", "retrying"][best];
  return exhausted ? "delayed" : "complete";
}

/** true while any official coding target of the attempt that can still change the mark is not complete (a boolean, nothing else). */
function autoGradingPending(attempt) {
  const t = attempt && attempt.codingGrading && isObj(attempt.codingGrading.targets) ? attempt.codingGrading.targets : null;
  return !!t && Object.entries(t).some(([id, x]) => x && x.state !== "complete" && overrideScoreOf(attempt, id) === null);   // 17E-D F3
}

/** The pre-C2 public projection of one stored attempt (student-submission.js pub / student-dashboard.js latestResult, B1). */
function publicProjection(attempt) {
  const c = studentCodingGradingStatus(attempt);
  return { ...(autoGradingPending(attempt) ? { autoGradingPending: true } : {}), ...(c ? { autoGradingStatus: c } : {}) };
}

/** The pre-C2 server's coding question version gate (gradeableQuestion / regradeTarget / teacherCodingEvidence): true = refused. */
const versionUnsupported = q => q.questionTypeVersion !== undefined && q.questionTypeVersion !== 1;

/** The pre-C2 catalog knew coding@1 ONLY; this is effectiveQuestionTypeVersion over that row (fail closed above the current version). */
function effectiveQuestionTypeVersion(storedVersion, d = { key: "coding", version: 1 }) {
  if (storedVersion === undefined) return 1;
  if (typeof storedVersion !== "number" || !Number.isInteger(storedVersion) || storedVersion < 1 || storedVersion > d.version) return undefined;
  return storedVersion;
}

// ── grading-recovery.js (pre-C2) ──────────────────────────────────────────────────────────────────────────────────────────────
const MIN = 60 * 1000;
const STALE_DISPATCHED_MS = 30 * MIN;
const RECOVERY_POLICY = Object.freeze({ pendingGraceMs: 2 * MIN, staleDispatchedMs: STALE_DISPATCHED_MS, maxAutomaticRecoveries: 8, backoffBaseMs: 5 * MIN, backoffCapMs: 60 * MIN });
const ACTIVE = new Set(["pending", "dispatched", "retryable"]);
const timeOf = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const automaticAttempts = rec => (isObj(rec) && Number.isInteger(rec.automaticAttempts) && rec.automaticAttempts >= 0 ? rec.automaticAttempts : 0);
function retryBackoffMs(n, policy = RECOVERY_POLICY) {
  const k = Number.isInteger(n) && n >= 0 ? Math.min(n, 16) : 0;
  return Math.min(policy.backoffCapMs, policy.backoffBaseMs * 2 ** k);
}
function recoveryDecision(target, nowMs, policy = RECOVERY_POLICY) {
  if (!isObj(target) || typeof target.state !== "string") return { eligible: false, reason: "invalid" };
  if (target.state === "complete") return { eligible: false, reason: "complete" };
  if (!ACTIVE.has(target.state)) return { eligible: false, reason: "not-active" };
  if (typeof target.jobId !== "string" || !target.jobId || !Number.isInteger(target.revision) || target.revision < 1) return { eligible: false, reason: "invalid" };
  const state = target.state, updated = timeOf(target.updatedAt), rec = isObj(target.recovery) ? target.recovery : {}, n = automaticAttempts(rec);
  let reason;
  if (state === "pending") { if (nowMs - updated < policy.pendingGraceMs) return { eligible: false, reason: "pending-grace", state }; reason = "pending-due"; }
  else if (state === "dispatched") { if (nowMs - updated <= policy.staleDispatchedMs) return { eligible: false, reason: "dispatched-fresh", state }; reason = "stale-dispatched"; }
  else { if (nowMs - Math.max(updated, timeOf(rec.lastAutomaticAttemptAt)) < retryBackoffMs(n, policy)) return { eligible: false, reason: "retryable-backoff", state }; reason = "retryable-due"; }
  if (n >= policy.maxAutomaticRecoveries) return { eligible: false, reason: "exhausted", state };
  return { eligible: true, state, reason };
}

// ── src/codingGradingStatus.ts (pre-C2 / B1 client) ───────────────────────────────────────────────────────────────────────────
const VALID = ["queued", "processing", "retrying", "delayed", "complete"];
function codingGradingStatusOf(result) {
  const v = result ? result.autoGradingStatus : undefined;
  return typeof v === "string" && VALID.includes(v) ? v : undefined;
}
const isCodingGradingOpen = s => !!s && s !== "complete";
function scoreWithheld(result) {
  if (!result || typeof result !== "object") return false;
  return isCodingGradingOpen(codingGradingStatusOf(result)) || result.autoGradingPending === true;
}
const PENDING_SCORE_DASH = "—";
/** The B1 result-page headline rule (StudentExamPage.tsx): `{withheld ? PENDING_SCORE_DASH : result.score} / {result.totalMarks}`. */
const headline = result => (scoreWithheld(result) ? PENDING_SCORE_DASH : String(result.score)) + " / " + String(result.totalMarks);

module.exports = { isObj, overrideScoreOf, studentCodingGradingStatus, autoGradingPending, publicProjection, versionUnsupported, effectiveQuestionTypeVersion, recoveryDecision, RECOVERY_POLICY, codingGradingStatusOf, isCodingGradingOpen, scoreWithheld, headline, PENDING_SCORE_DASH };
