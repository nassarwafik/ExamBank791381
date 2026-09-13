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

module.exports = { toMs, effectiveDueAt, getAssignmentAvailability, attemptState, actionRejection };
