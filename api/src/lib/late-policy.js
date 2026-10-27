// D5 (item 10, owner decision) — an assignment's OPTIONAL late-submission policy: after the due date the teacher may keep the
// assignment open for a late window, and a late attempt loses a FIXED percentage of its score. Off by default: an assignment without
// the field (every assignment stored before D5) closes at its due date exactly as before.
//
//   assignment.latePolicy = { windowHours: 1..336, deductionPercent: 0..90 }
//
//  - The window starts at each student's EFFECTIVE due date (a per-student extension moves it too) and closes windowHours later.
//    Inside it the assignment is open (start / save / submit) and reports inLateWindow; after it, it is closed.
//  - An attempt is LATE when it ENDED after the student's effective due date (submit time, or the authoritative end of a timed-out /
//    strict-exit / teacher-ended attempt). The policy in force at that moment is stamped on the attempt (attempt.late), so a later
//    change of the policy never rewrites a result that already exists.
//  - The deduction is applied to the attempt's score wherever the score is (re)computed — when the attempt is created and in the
//    one canonical rebuild (attempt-grade-rebuild.js) — so every reader of the stored score sees the same number. rawScore keeps the
//    mark before the deduction and latePenalty the marks deducted. Marks still awaiting review are not deducted until they are
//    awarded (the rebuild re-applies the deduction then). The teacher may waive it for one attempt (attempt.late.waived).
//  - The cap of 90 % keeps the policy a deduction, never a manufactured zero (AGENTS.md §10).
const LATE_WINDOW_HOURS_MAX = 336;      // 14 days
const LATE_DEDUCTION_MAX = 90;

const round = n => Number(Number(n || 0).toFixed(2));
const toMs = v => { if (!v) return 0; const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };

/** A stored policy, or null when absent / malformed (a malformed value never opens a closed assignment). */
function normalizeLatePolicy(v) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const h = v.windowHours, d = v.deductionPercent;
  if (!Number.isInteger(h) || h < 1 || h > LATE_WINDOW_HOURS_MAX) return null;
  if (!Number.isInteger(d) || d < 0 || d > LATE_DEDUCTION_MAX) return null;
  return { windowHours: h, deductionPercent: d };
}
const latePolicyOf = assignment => normalizeLatePolicy(assignment && assignment.latePolicy);
const lateWindowMs = assignment => { const p = latePolicyOf(assignment); return p ? p.windowHours * 3600000 : 0; };

/**
 * Validates a teacher's requested policy (create / setlatepolicy). null / undefined / false → disabled.
 * → { ok: true, value: policy | null } | { ok: false, error }
 */
function parseLatePolicyInput(v) {
  if (v === undefined || v === null || v === false) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false, error: "إعداد التسليم المتأخر غير صالح." };
  const h = Number(v.windowHours), d = Number(v.deductionPercent);
  if (!Number.isInteger(h) || h < 1 || h > LATE_WINDOW_HOURS_MAX) return { ok: false, error: "مدة قبول التسليم المتأخر يجب أن تكون بين ساعة و14 يومًا." };
  if (!Number.isInteger(d) || d < 0 || d > LATE_DEDUCTION_MAX) return { ok: false, error: "نسبة خصم التأخير يجب أن تكون بين 0 و" + LATE_DEDUCTION_MAX + "٪." };
  return { ok: true, value: { windowHours: h, deductionPercent: d } };
}

/** The late stamp for an attempt that ended at endedAtMs, or null when it is on time (or no policy applies). */
function lateStamp(assignment, dueMs, endedAtMs) {
  const p = latePolicyOf(assignment);
  if (!p || !dueMs || !endedAtMs || endedAtMs <= dueMs) return null;          // now === due is still on time
  return { minutesLate: Math.max(1, Math.ceil((endedAtMs - dueMs) / 60000)), deductionPercent: p.deductionPercent };
}

/** A well-formed stamp on a stored attempt, or null. */
function lateOf(attempt) {
  const l = attempt && attempt.late;
  if (!l || typeof l !== "object") return null;
  const d = Number(l.deductionPercent);
  if (!Number.isFinite(d)) return null;
  return { minutesLate: Math.max(0, Number(l.minutesLate) || 0), deductionPercent: Math.min(LATE_DEDUCTION_MAX, Math.max(0, d)), waived: l.waived === true };
}

/**
 * Applies the late deduction to an attempt whose score / totalMarks were JUST computed (raw). Mutates and returns the attempt.
 * Must never be called twice on the same raw score: the creators call it once, and the rebuild recomputes the raw score first.
 */
function applyLateDeduction(attempt) {
  const late = lateOf(attempt);
  if (!late) { delete attempt.rawScore; delete attempt.latePenalty; return attempt; }
  const raw = round(attempt.score);
  const factor = late.waived ? 1 : 1 - late.deductionPercent / 100;
  attempt.rawScore = raw;
  attempt.score = round(raw * factor);
  attempt.latePenalty = round(raw - attempt.score);
  attempt.percentage = attempt.totalMarks ? round(attempt.score / attempt.totalMarks * 100) : 0;
  return attempt;
}

/** Stamps (when late) and applies the deduction on a freshly created attempt. */
function stampLateAttempt(attempt, assignment, dueMs, endedAtMs) {
  const stamp = lateStamp(assignment, dueMs, endedAtMs);
  if (stamp) attempt.late = stamp;
  return applyLateDeduction(attempt);
}

/** The description of an attempt's lateness WITHOUT any mark (null when on time); the marks are lateMarks(). */
function lateInfo(attempt) {
  const late = lateOf(attempt);
  return late ? { minutesLate: late.minutesLate, deductionPercent: late.deductionPercent, waived: late.waived } : null;
}
/** The mark-bearing late fields of a late attempt ({} when on time) — withheld with the score before results are released. */
function lateMarks(attempt) {
  if (!lateOf(attempt)) return {};
  return { rawScore: round(attempt.rawScore !== undefined ? attempt.rawScore : attempt.score), latePenalty: round(attempt.latePenalty) };
}

module.exports = {
  LATE_WINDOW_HOURS_MAX, LATE_DEDUCTION_MAX, normalizeLatePolicy, latePolicyOf, lateWindowMs, parseLatePolicyInput,
  lateStamp, lateOf, applyLateDeduction, stampLateAttempt, lateInfo, lateMarks, toMs
};
