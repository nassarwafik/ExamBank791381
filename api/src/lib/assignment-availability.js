// Single authoritative, PURE server-side helper for assignment open/close availability.
//
// Before this existed, student-dashboard, student-assignment and student-submission each computed
// timing on their own and student-submission FORGOT to check openAt — so a save/submit could land
// before the assignment officially opened. This module is now the sole source of truth for
// scheduled/open/closed, and every student endpoint uses it so the three always agree.
//
// Boundary semantics are preserved EXACTLY from the original dashboard implementation:
//   - now  <  openAt              => "scheduled"   (now === openAt is OPEN)
//   - openAt <= now <= dueAt      => "open"        (now === dueAt is still OPEN)
//   - now  >  effectiveDueAt      => "closed"
// Effective due date = submission.dueAtOverride (per-student override) || assignment.dueAt.
//
// Pure: never reads storage, never calls Date.now() unless the caller omits nowMs. Fully testable.

// Parse an ISO date to epoch ms; empty/invalid → 0 (treated as "no constraint", so a missing or
// malformed openAt/dueAt never falsely schedules or closes an assignment, and never throws).
function toMs(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

// The effective due date for THIS student: a per-student dueAtOverride wins over the assignment dueAt.
function effectiveDueAt(assignment, submission) {
  if (submission && submission.dueAtOverride) return submission.dueAtOverride;
  return (assignment && assignment.dueAt) || "";
}

// The authoritative availability of an assignment for one student at a given instant.
function getAssignmentAvailability(assignment, submission, nowMs = Date.now()) {
  const a = assignment || {};
  const openAt = a.openAt || "";
  const due = effectiveDueAt(a, submission);
  const openMs = toMs(openAt);
  const dueMs = toMs(due);
  const isBeforeOpen = !!openMs && openMs > nowMs;                 // now === openAt is OPEN
  const isClosed = !isBeforeOpen && !!dueMs && dueMs < nowMs;      // now === dueAt is still OPEN
  const availability = isBeforeOpen ? "scheduled" : (isClosed ? "closed" : "open");
  return { availability, openAt: String(openAt || ""), effectiveDueAt: String(due || ""), openMs, dueMs, isBeforeOpen, isClosed };
}

// Attempt/limit state combined with availability. canAttempt requires: published AND currently open AND
// attempts remaining. Mirrors (and unifies) the previous per-endpoint logic.
function attemptState(assignment, submission, nowMs = Date.now()) {
  const a = assignment || {};
  const attempts = Array.isArray(submission && submission.attempts) ? submission.attempts : [];
  const base = Math.max(1, Number(a.maxAttempts || 1));
  const allowedAttempts = Math.max(base, Number((submission && submission.allowedAttempts) || 0));
  const av = getAssignmentAvailability(a, submission, nowMs);
  const published = a.status === "published";
  const canAttempt = published && av.availability === "open" && attempts.length < allowedAttempts;
  return { ...av, published, attemptsUsed: attempts.length, allowedAttempts, canAttempt };
}

// The authoritative rejection (if any) for a student write action (saveDraft/submit). Returns null when
// the action is allowed, otherwise { status, error } with the correct Arabic message. Checked BEFORE any
// grading/mutation, and the same logic backstops the atomic mutation to defeat races.
function actionRejection(assignment, submission, action, nowMs = Date.now()) {
  const st = attemptState(assignment, submission, nowMs);
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (st.availability === "closed") return { status: 409, error: "انتهى موعد التسليم." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (st.attemptsUsed >= st.allowedAttempts) {
    return { status: 409, error: action === "submit" ? "لا توجد محاولة إضافية متاحة." : "لا توجد محاولة متاحة للحفظ." };
  }
  return null;
}

// ── Server-authoritative per-attempt timer (B1) ──────────────────────────────
// A TIMED assignment carries a positive durationMinutes. When a student starts, the server stamps an
// activeAttempt { attemptNumber, startedAt, endsAt } where endsAt = startedAt + durationMinutes (server
// time only). The EFFECTIVE deadline is min(endsAt, current effectiveDueAt) — so a per-student
// dueAtOverride can extend a student up to (but never beyond) the original duration deadline, and can
// clip it shorter, exactly like the existing dueAt semantics. Everything here is pure and takes nowMs.

// Runtime normalizer (lenient): null/0/invalid/<1 => 0 (untimed). Creation-time VALIDATION (1..1440,
// reject invalid) lives in manage-assignments — this only decides how a stored assignment behaves.
function normalizeDurationMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}
function isTimedAssignment(assignment) {
  return normalizeDurationMinutes(assignment && assignment.durationMinutes) > 0;
}
// The persisted activeAttempt, only if well-formed (has startedAt + endsAt). Legacy/missing => null.
function activeAttemptOf(submission) {
  const aa = submission && submission.activeAttempt;
  return aa && aa.startedAt && aa.endsAt ? aa : null;
}

// Full timer + attempt state for one student at nowMs. Extends attemptState() with timer fields.
//  - canAttempt   : UNCHANGED historical meaning (published && open && completed attempts < allowed).
//  - canStartAttempt : timed only — may begin a NEW attempt (open, attempts remain, no active attempt).
//  - canWrite     : may saveDraft/submit NOW (timed: active && not expired && open; untimed: canAttempt).
// canWrite and canStartAttempt are deliberately separate so "can start" and "can save" are never one
// ambiguous boolean.
function timerState(assignment, submission, nowMs = Date.now()) {
  const base = attemptState(assignment, submission, nowMs);
  const durationMinutes = normalizeDurationMinutes(assignment && assignment.durationMinutes);
  const timed = durationMinutes > 0;
  const active = activeAttemptOf(submission);
  const endsMs = active ? toMs(active.endsAt) : 0;
  const dueMs = base.dueMs;
  // Effective attempt end = min(duration deadline, current effective due date). If the due date is
  // absent (0), the duration deadline stands alone.
  const effEndsMs = timed && active ? (dueMs ? Math.min(endsMs, dueMs) : endsMs) : 0;
  // Boundary: now === effEndsMs is STILL valid; strictly after is expired (mirrors dueAt semantics).
  const attemptExpired = timed && !!active ? (!!effEndsMs && effEndsMs < nowMs) : false;
  const canStartAttempt = timed && base.published && base.availability === "open"
    && base.attemptsUsed < base.allowedAttempts && !active;
  const canWrite = timed
    ? (base.published && base.availability === "open" && !!active && !attemptExpired)
    : base.canAttempt;
  return {
    ...base,
    durationMinutes,
    timed,
    activeAttempt: active ? { attemptNumber: active.attemptNumber, startedAt: String(active.startedAt), endsAt: String(active.endsAt) } : null,
    effectiveAttemptEndsAt: effEndsMs ? new Date(effEndsMs).toISOString() : "",
    attemptExpired,
    canStartAttempt,
    canWrite
  };
}

// Rejection (or null) for a startAttempt action. Idempotent case (an active, non-expired attempt
// already exists) returns null — the handler returns the SAME startedAt/endsAt without restarting.
function startRejection(assignment, submission, nowMs = Date.now()) {
  const st = timerState(assignment, submission, nowMs);
  if (!st.timed) return { status: 400, error: "لا يتطلب هذا الواجب بدء محاولة مؤقتة." };
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (st.availability === "closed") return { status: 409, error: "انتهى موعد التسليم." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (st.activeAttempt) {
    // An expired active attempt must be finalized first; a live one is idempotently returned.
    return st.attemptExpired ? { status: 409, error: "انتهى وقت المحاولة." } : null;
  }
  if (st.attemptsUsed >= st.allowedAttempts) return { status: 409, error: "لا توجد محاولة إضافية متاحة." };
  return null;
}

// Rejection (or null) for a write action (saveDraft/submit). Timed assignments require a live active
// attempt; untimed assignments keep the exact previous actionRejection behavior.
function writeRejection(assignment, submission, action, nowMs = Date.now()) {
  const st = timerState(assignment, submission, nowMs);
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (st.availability === "closed") return { status: 409, error: "انتهى موعد التسليم." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (st.timed) {
    if (!st.activeAttempt) return { status: 409, error: "ابدأ المحاولة أولاً." };
    if (st.attemptExpired) return { status: 409, error: "انتهى وقت المحاولة." };
    return null;
  }
  return actionRejection(assignment, submission, action, nowMs);
}

module.exports = {
  toMs, effectiveDueAt, getAssignmentAvailability, attemptState, actionRejection,
  normalizeDurationMinutes, isTimedAssignment, activeAttemptOf, timerState, startRejection, writeRejection
};
