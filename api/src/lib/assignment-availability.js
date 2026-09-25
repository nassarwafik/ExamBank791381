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

// The effective due date for THIS student. Per-student dueAtOverride is EXTENSION-ONLY by contract, so the
// effective deadline is the LATER of the (valid) assignment dueAt and the (valid) override — NOT a blind
// `override || dueAt`. Consequences (Phase 5A):
//   • a class-wide dueAt extension raises EVERY student's effective deadline (global 15 / override 12 → 15),
//     so extending the class can never be silently undercut by an older, shorter override;
//   • a longer per-student accommodation still wins (global 15 / override 18 → 18);
//   • no override (or an invalid one) → the global dueAt (global 15 / none → 15);
//   • no global (or an invalid one) → the override;
//   • malformed values parse to 0 (toMs) and never throw — the safe/fail-open string is preserved.
function effectiveDueAt(assignment, submission) {
  const globalDue = (assignment && assignment.dueAt) || "";
  const override = (submission && submission.dueAtOverride) || "";
  const gMs = toMs(globalDue);
  const oMs = toMs(override);
  if (gMs && oMs) return oMs > gMs ? override : globalDue;   // both valid → the later timestamp wins
  if (oMs) return override;                                  // only the override is a valid timestamp
  return globalDue;                                          // only the global, or neither (safe string)
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
// ── B2A: unified attempt lifecycle ───────────────────────────────────────────
// New assignments carry attemptModelVersion:2 (see manage-assignments). Version >= 2 means the server
// requires an EXPLICIT startAttempt even for UNTIMED assignments (opening != starting). Assignments
// missing the flag are LEGACY (version 0) and keep the exact historical untimed behavior — there is NO
// bulk migration and old documents must load unchanged.
function attemptModelVersion(assignment) {
  const n = Number(assignment && assignment.attemptModelVersion);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}
// ── Phase 7A: assignment-level attempt POLICY ────────────────────────────────
// ONE canonical field on the assignment document, chosen by the teacher at creation:
//   "continuous" — today's behaviour exactly: the student may leave and return; a timed countdown keeps running.
//   "strict"     — once the attempt is running, leaving the exam page ends it (finalizeIntegrityExit).
//   "pausable"   — the student may explicitly «حفظ مؤقت والخروج»: the attempt is paused server-side (the timed budget
//                  stops) and later resumed (resumeAttempt) as the SAME attempt with the SAME answers and the
//                  remaining budget only. The assignment due date always stays a hard cap.
// Strict/pausable assignments are created on attemptModelVersion 3 (they need the per-attempt epoch below).
// A missing/invalid policy — and ANY assignment below model 3 — is "continuous": no bulk migration, old documents
// behave exactly as before.
const ATTEMPT_POLICIES = ["continuous", "strict", "pausable"];
function normalizeAttemptPolicy(value) {
  return ATTEMPT_POLICIES.includes(value) ? value : "continuous";
}
function attemptPolicyOf(assignment) {
  return attemptModelVersion(assignment) >= 3 ? normalizeAttemptPolicy(assignment && assignment.attemptPolicy) : "continuous";
}
// Model-3 attempt EPOCH: a server-authoritative generation INSIDE one attempt. startAttempt sets 1; every lifecycle
// boundary (pause, resume) increments it, so running epochs are odd and paused epochs even. A write composed under an
// older epoch (e.g. an autosave sent before a pause that lands after the resume) carries the same attemptNumber and
// startedAt as the live attempt — only the epoch tells it apart, so model-3 writes must assert it. Missing/invalid → 1.
function attemptEpochOf(active) {
  const n = Number(active && active.attemptEpoch);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
function isPausedAttempt(active) {
  return !!active && active.status === "paused";
}

// Whether this assignment requires a server-authoritative startAttempt before questions/writes.
// TIMED (any version) always requires start (B1). UNTIMED requires start only for version >= 2.
function requiresServerStart(assignment) {
  return isTimedAssignment(assignment) || attemptModelVersion(assignment) >= 2;
}
// The persisted activeAttempt, only if well-formed (has startedAt). B1 timed attempts always carry a
// truthy endsAt; a B2A UNTIMED v2 attempt has endsAt "" (no deadline), so endsAt is NOT required here.
// Legacy/missing/malformed => null.
function activeAttemptOf(submission) {
  const aa = submission && submission.activeAttempt;
  return aa && aa.startedAt ? aa : null;
}
// Normalize a completed attempt's end reason. New attempts persist endReason explicitly; a legacy
// attempt missing it maps timedOut===true => "timedOut", otherwise "submitted". PURE — never mutates.
function normalizeEndReason(attempt) {
  // Phase 7A adds "integrityExit" (a strict attempt ended because the student left the exam page).
  if (attempt && (attempt.endReason === "submitted" || attempt.endReason === "timedOut" || attempt.endReason === "integrityExit")) return attempt.endReason;
  return attempt && attempt.timedOut === true ? "timedOut" : "submitted";
}
// Derived lifecycle status: "notStarted" | "started" | "draft" | "paused" | "submitted" | "timedOut" | "integrityExit".
// An ACTIVE attempt ALWAYS wins over a historical completed result (B1 rule #15: attempt 2 active while
// attempt 1 completed => "started"/"draft"). This is a DISPLAY value only — canStartAttempt / canWrite /
// attemptExpired remain the authoritative authorization gates (it must never be the sole gate).
function deriveAttemptStatus(submission) {
  const active = activeAttemptOf(submission);
  if (active) return isPausedAttempt(active) ? "paused" : active.status === "draft" ? "draft" : "started";
  const attempts = Array.isArray(submission && submission.attempts) ? submission.attempts : [];
  if (!attempts.length) return "notStarted";
  const reason = normalizeEndReason(attempts[attempts.length - 1]);
  return reason === "timedOut" || reason === "integrityExit" ? reason : "submitted";
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
  const modelVersion = attemptModelVersion(assignment);
  const requiresStart = timed || modelVersion >= 2;   // UNTIMED v2 also needs an explicit start
  const active = activeAttemptOf(submission);
  const dueMs = base.dueMs;
  // Phase 7A — a PAUSED model-3 attempt: its duration clock is stopped (the remaining budget is stored in
  // pausedRemainingMs), it can never be written, and only the assignment due date can expire it.
  const paused = isPausedAttempt(active);
  // Resolve the authoritative TIMED deadline. Prefer the stored endsAt; if it is missing/invalid on a
  // TIMED attempt, DERIVE it from the server-stamped startedAt + durationMinutes (B2A: a timed attempt
  // must NEVER become deadline-less just because endsAt got lost — this preserves the original start
  // instant and never restarts the timer). If even startedAt is unparseable, the deadline is
  // unresolvable and the timed attempt fails closed (treated as expired, never writable).
  // UNTIMED attempts carry endsAt "" by design (no deadline) and are unaffected by all of this.
  // Phase 7A: after a resume, runEndsAt (resume instant + the remaining budget) is the running duration deadline;
  // the ORIGINAL endsAt stays untouched for audit. Attempts that were never paused have no runEndsAt.
  let endsMs = active ? (toMs(active.runEndsAt) || toMs(active.endsAt)) : 0;
  let timedDeadlineUnresolvable = false;
  if (timed && active && !endsMs) {
    const startMs = toMs(active.startedAt);
    if (startMs) endsMs = startMs + durationMinutes * 60000;   // derived duration deadline (no restart)
    else timedDeadlineUnresolvable = true;                     // corrupt timed attempt => fail closed
  }
  // B2B: a teacher may EXTEND an active timed attempt. activeAttempt.extendedEndsAt, when a valid,
  // strictly-LATER timestamp, replaces the duration deadline; the original endsAt is preserved untouched
  // for audit and is never shortened. The extension only applies to a resolvable timed deadline.
  let durationEndMs = endsMs;
  if (timed && active && !timedDeadlineUnresolvable) {
    const extendedMs = toMs(active.extendedEndsAt);
    if (extendedMs && extendedMs > durationEndMs) durationEndMs = extendedMs;
  }
  // Effective attempt end = min(teacher duration deadline, current effective due date). If the due date
  // is absent (0), the duration deadline stands alone. Only a TIMED attempt has a duration deadline.
  // A paused attempt has no running deadline; once the due date has passed, the due date is its end.
  const effEndsMs = paused
    ? (dueMs && dueMs < nowMs ? dueMs : 0)
    : (timed && active && durationEndMs ? (dueMs ? Math.min(durationEndMs, dueMs) : durationEndMs) : 0);
  // Boundary: now === effEndsMs is STILL valid; strictly after is expired (mirrors dueAt semantics).
  // A TIMED attempt with an unresolvable deadline is expired (fail closed). UNTIMED attempts (timed
  // false) NEVER expire by time.
  const attemptExpired = paused
    ? (!!dueMs && dueMs < nowMs)                              // paused: the stopped clock never runs out; the due date does
    : timed && !!active
      ? (timedDeadlineUnresolvable || (!!effEndsMs && effEndsMs < nowMs))
      : false;
  // May begin a NEW attempt: requiresStart AND open AND attempts remain AND none currently active.
  // The attempt-limit check belongs HERE (admitting a new attempt), not on an already-started one.
  const canStartAttempt = requiresStart && base.published && base.availability === "open"
    && base.attemptsUsed < base.allowedAttempts && !active;
  // May saveDraft/submit NOW. TIMED: live, non-expired active. UNTIMED v2: an active attempt is
  // required (opening != starting) — but once it exists it is ALREADY ADMITTED, so a later
  // maxAttempts reduction must NOT retroactively cancel it (the limit was enforced at start time).
  // UNTIMED legacy: exact historical canAttempt (no start needed).
  const canWrite = paused
    ? false                                                    // resume first — a paused attempt accepts no writes
    : timed
      ? (base.published && base.availability === "open" && !!active && !attemptExpired)
      : (modelVersion >= 2
          ? (base.published && base.availability === "open" && !!active)
          : base.canAttempt);
  return {
    ...base,
    durationMinutes,
    timed,
    attemptModelVersion: modelVersion,
    attemptPolicy: attemptPolicyOf(assignment),
    requiresStart,
    activeAttempt: active ? {
      attemptNumber: active.attemptNumber,
      startedAt: String(active.startedAt),
      endsAt: String(active.endsAt || ""),                     // ORIGINAL duration end (never overwritten)
      extendedEndsAt: String(active.extendedEndsAt || ""),     // B2B teacher extension (or "")
      status: paused ? "paused" : active.status === "draft" ? "draft" : "started",
      lastSavedAt: String(active.lastSavedAt || ""),
      // Phase 7A (model 3 only — model 2 / legacy shapes are unchanged).
      ...(modelVersion >= 3 ? {
        attemptEpoch: attemptEpochOf(active),
        pauseCount: Math.max(0, Number(active.pauseCount) || 0),
        pausedAt: paused ? String(active.pausedAt || "") : "",
        pausedRemainingMs: paused && timed ? Math.max(0, Number(active.pausedRemainingMs) || 0) : null,
        runEndsAt: String(active.runEndsAt || "")
      } : {})
    } : null,
    attemptStatus: deriveAttemptStatus(submission),
    // The authoritative (unclipped) timed duration deadline in effect: extendedEndsAt when later than the
    // original/derived end, else the original. "" when there is no timed active attempt. This is what a
    // teacher extension must strictly exceed, and what the UI shows as the current attempt end.
    attemptDurationEndsAt: (timed && active && durationEndMs && !paused) ? new Date(durationEndMs).toISOString() : "",
    effectiveAttemptEndsAt: effEndsMs ? new Date(effEndsMs).toISOString() : "",
    attemptExpired,
    canStartAttempt,
    canWrite
  };
}

// Rejection (or null) for a teacher extendActiveAttempt action. PURE — validates that this is a TIMED
// assignment with a live-or-expired-but-not-finalized active attempt, and that newEndsAt is a valid
// timestamp STRICTLY LATER than the current authoritative duration deadline (extension can never shorten
// the student's timer). Does NOT block on availability/expiry: reviving an expired-but-not-finalized
// attempt is intentional (B2B #11). Returns { status, error } or null when allowed.
function extendRejection(assignment, submission, newEndsAt, nowMs = Date.now()) {
  const st = timerState(assignment, submission, nowMs);
  if (!st.timed) return { status: 400, error: "لا يمكن تمديد وقت محاولة في واجب غير مؤقت." };
  if (!st.activeAttempt) return { status: 409, error: "لا توجد محاولة نشطة قابلة للتمديد." };
  // Phase 7A: a paused attempt's clock is stopped (its remaining budget is stored, not an absolute end), so an absolute
  // extension has no meaning until the student resumes. Rejected — never silently converted into hidden extra time.
  if (st.activeAttempt.status === "paused") return { status: 409, error: "المحاولة متوقفة مؤقتًا. يمكن تمديد وقتها بعد أن يستأنفها الطالب." };
  // Fail closed (B2B blocker-2): if the timed attempt has no resolvable authoritative duration deadline
  // (corrupt startedAt AND missing/invalid endsAt — timerState reports "" here and ignores extendedEndsAt),
  // an extension would report success but establish no usable timer. Reject instead of pretending.
  if (!st.attemptDurationEndsAt) return { status: 409, error: "لا يمكن تمديد المحاولة لأن وقتها الأصلي غير قابل للتحقق." };
  const newMs = toMs(newEndsAt);
  if (!newMs) return { status: 400, error: "وقت الانتهاء الجديد غير صالح." };
  const currentEndMs = toMs(st.attemptDurationEndsAt);
  if (currentEndMs && newMs <= currentEndMs) {
    return { status: 400, error: "يجب أن يكون وقت الانتهاء الجديد بعد النهاية الحالية للمحاولة." };
  }
  return null;
}

// Rejection (or null) for a startAttempt action. Idempotent case (an active, non-expired attempt
// already exists) returns null — the handler returns the SAME startedAt/endsAt without restarting.
function startRejection(assignment, submission, nowMs = Date.now()) {
  const st = timerState(assignment, submission, nowMs);
  // Only TIMED (any version) or UNTIMED v2 assignments have a server startAttempt. Legacy untimed
  // assignments never require a start, so an explicit startAttempt on them is a client error.
  if (!st.requiresStart) return { status: 400, error: "لا يتطلب هذا الواجب بدء محاولة." };
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (st.availability === "closed") return { status: 409, error: "انتهى موعد التسليم." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (st.activeAttempt) {
    // An expired active attempt must be finalized first; a live one is idempotently returned.
    if (st.attemptExpired) return { status: 409, error: "انتهى وقت المحاولة." };
    // Phase 7A: a paused attempt is continued ONLY through resumeAttempt (never restarted by a start).
    if (st.activeAttempt.status === "paused") return { status: 409, error: "لديك محاولة محفوظة مؤقتًا. اضغط «متابعة المحاولة» لاستكمالها." };
    return null;
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
  if (st.activeAttempt && st.activeAttempt.status === "paused") return { status: 409, error: "المحاولة محفوظة مؤقتًا. تابع المحاولة أولًا." };
  if (st.timed) {
    if (!st.activeAttempt) return { status: 409, error: "ابدأ المحاولة أولاً." };
    if (st.attemptExpired) return { status: 409, error: "انتهى وقت المحاولة." };
    return null;
  }
  // UNTIMED v2: an ALREADY-STARTED active attempt is admitted — it may finish (saveDraft/submit) even if
  // maxAttempts was later reduced below its number (the limit is enforced only when STARTING). With no
  // active attempt, the student must start first — unless no attempts remain at all.
  if (st.attemptModelVersion >= 2) {
    if (st.activeAttempt) return null;
    if (st.attemptsUsed >= st.allowedAttempts) {
      return { status: 409, error: action === "submit" ? "لا توجد محاولة إضافية متاحة." : "لا توجد محاولة متاحة للحفظ." };
    }
    return { status: 409, error: "ابدأ المحاولة أولاً." };
  }
  // UNTIMED legacy: exact historical behavior — no server start needed.
  return actionRejection(assignment, submission, action, nowMs);
}

// ── Phase 7A lifecycle rejections (pure) ─────────────────────────────────────
// Pause: a PAUSABLE model-3 assignment with a live (running, non-expired, writable) active attempt. The handler adds the
// identity + epoch checks and the idempotent "already paused by this very request" case.
function pauseRejection(assignment, submission, nowMs = Date.now()) {
  if (attemptPolicyOf(assignment) !== "pausable") return { status: 400, error: "لا يسمح هذا الواجب بالحفظ المؤقت." };
  const st = timerState(assignment, submission, nowMs);
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (st.availability === "closed") return { status: 409, error: "انتهى موعد التسليم." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (!st.activeAttempt) return { status: 409, error: "لا توجد محاولة نشطة." };
  if (st.activeAttempt.status === "paused") return null;      // the handler decides: idempotent retry vs stale request
  if (st.attemptExpired) return { status: 409, error: "انتهى وقت المحاولة." };
  if (!st.canWrite) return { status: 409, error: "لا يمكن حفظ المحاولة الآن." };
  return null;
}
// Resume: a PAUSABLE model-3 assignment whose active attempt is paused, while the assignment is still open (the due date
// is a hard cap — a resume after it is refused and the paused attempt is then closed like any expired attempt).
function resumeRejection(assignment, submission, nowMs = Date.now()) {
  if (attemptPolicyOf(assignment) !== "pausable") return { status: 400, error: "لا يسمح هذا الواجب بالحفظ المؤقت." };
  const st = timerState(assignment, submission, nowMs);
  if (st.availability === "scheduled") return { status: 403, error: "الواجب لم يُفتح بعد." };
  if (!st.published) return { status: 403, error: "الواجب غير متاح." };
  if (!st.activeAttempt) return { status: 409, error: "لا توجد محاولة محفوظة لاستكمالها." };
  if (st.activeAttempt.status !== "paused") return null;      // the handler decides: idempotent retry vs stale request
  if (st.availability === "closed" || st.attemptExpired) return { status: 409, error: "انتهى موعد التسليم." };
  return null;
}

module.exports = {
  ATTEMPT_POLICIES, normalizeAttemptPolicy, attemptPolicyOf, attemptEpochOf, isPausedAttempt, pauseRejection, resumeRejection,
  toMs, effectiveDueAt, getAssignmentAvailability, attemptState, actionRejection,
  normalizeDurationMinutes, isTimedAssignment, activeAttemptOf, timerState, startRejection, writeRejection,
  attemptModelVersion, requiresServerStart, normalizeEndReason, deriveAttemptStatus, extendRejection
};
