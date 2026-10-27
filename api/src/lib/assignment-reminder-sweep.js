// D4 (item 8) — the AUTOMATIC assignment reminder (owner decision: 24 hours before the deadline, to every student who has not
// submitted). Run by the signed sweep route (functions/assignment-reminder-sweep.js), triggered hourly by
// .github/workflows/assignment-reminders.yml.
//
// Who gets one — the SAME rule as the teacher's manual «تذكير» (Phase 21G.7, functions/assignment-results.js remindStudents):
// a member of the assignment's class (not archived, not login-disabled), with NO attempt yet, for whom the assignment is open by the
// same timerState their own page uses (not closed, not scheduled), and whose EFFECTIVE deadline (a per-student extension included) is
// in the next 24 hours.
//
// Exactly once per student per deadline: a create-only marker (ETag If-None-Match:*) named by a SHA-256 of assignment, student and
// effective deadline reserves the reminder BEFORE it is sent. A retried or replayed sweep finds the marker and sends nothing; an
// EXTENDED deadline is a new deadline and gets its own reminder 24 hours before it. The reminder itself is the ordinary personal
// «assignment_reminder» event (the bell) — recordEventSafely pushes it to the student's devices (lib/event-push.js).
//
// Bounded: assignments whose base deadline is more than LOOKBACK_DAYS in the past are never considered (a per-student extension
// longer than that is not reminded automatically; the teacher's button still works), and at most MAX_REMINDERS_PER_RUN are reserved
// per run (the next hourly run continues).
const crypto = require("crypto");
const { listJson, downloadJsonOrNull, uploadJsonConditional, isConcurrencyConflict, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { normalizeAssignmentStatus } = require("./assignment-lifecycle");
const { isStudentClassMember } = require("./class-membership");
const { timerState } = require("./assignment-availability");
const { recordEventSafely } = require("./notification-events");

const AP = "platform/assignments/", UP = "platform/users/", SP = "platform/submissions/";
const MARKER_PREFIX = "platform/reminders/auto/";
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 14;
const MAX_REMINDERS_PER_RUN = 500;

const markerName = (assignmentId, studentId, dueIso) => MARKER_PREFIX + crypto.createHash("sha256").update("auto-reminder|" + assignmentId + "|" + studentId + "|" + dueIso).digest("hex") + ".json";
const emptySubmission = (a, u) => ({ schemaVersion: 1, assignmentId: String(a.assignmentId || ""), studentId: String(u.userId || ""), classId: a.classId, allowedAttempts: null, draftAnswers: {}, attempts: [], activeAttempt: null });

/** PURE: whether this student should get the automatic reminder now; returns the effective deadline (ISO) or "". */
function reminderDue(a, submission, nowMs) {
  const attempts = submission && Array.isArray(submission.attempts) ? submission.attempts : [];
  if (attempts.length > 0) return "";
  const ts = timerState(a, submission, nowMs);
  if (ts.isClosed || ts.availability === "scheduled") return "";
  const dueIso = String(ts.effectiveDueAt || a.dueAt || "");
  const due = Date.parse(dueIso);
  if (!Number.isFinite(due) || due <= nowMs || due - nowMs > REMINDER_LEAD_MS) return "";
  return new Date(due).toISOString();
}

/** One sweep. Never throws for one student's failure; a listing failure throws (the route answers 503 and the next run retries). */
async function runReminderSweep(container, { nowMs = Date.now(), deps = {}, obs = null, maxReminders = MAX_REMINDERS_PER_RUN } = {}) {
  const ls = deps.listJson || listJson, dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const record = deps.recordEventSafely || recordEventSafely;
  const out = { assignments: 0, considered: 0, reminded: 0, alreadySent: 0, failed: 0, truncated: false };
  const floor = nowMs - LOOKBACK_DAYS * 86400000;
  const assignments = (await ls(container, AP)).filter(a => {
    if (!a || normalizeAssignmentStatus(a) !== "published" || !a.classId || !a.assignmentId) return false;
    const due = Date.parse(String(a.dueAt || ""));
    return Number.isFinite(due) && due >= floor;
  });
  out.assignments = assignments.length;
  if (!assignments.length) return out;
  const users = (await ls(container, UP)).filter(u => u && u.role === "student" && u.archived !== true && u.active !== false);
  let reserved = 0;
  for (const a of assignments) {
    const id = String(a.assignmentId);
    const members = users.filter(u => isStudentClassMember(u, a.classId));
    const subs = await mapConcurrent(members, getReadConcurrency(), u => dl(container, SP + id + "/" + u.userId + ".json").catch(() => undefined));
    for (let i = 0; i < members.length; i++) {
      if (subs[i] === undefined) { out.failed++; continue; }                       // unreadable submission → never guess; next run retries
      const u = members[i], dueIso = reminderDue(a, subs[i] || emptySubmission(a, u), nowMs);
      if (!dueIso) continue;
      out.considered++;
      if (reserved >= maxReminders) { out.truncated = true; continue; }
      try {
        await upload(container, markerName(id, String(u.userId), dueIso), { schemaVersion: 1, kind: "auto-reminder", dueAt: dueIso, reservedAt: new Date(nowMs).toISOString() });
      } catch (e) {
        if (isConcurrencyConflict(e)) { out.alreadySent++; continue; }
        out.failed++; continue;
      }
      reserved++;
      const r = await record(container, { scope: "student", studentId: String(u.userId), type: "assignment_reminder", dedupeKey: "auto-reminder:" + id + ":" + u.userId + ":" + dueIso, data: { assignmentId: id, assignmentTitle: String(a.title || ""), dueAt: dueIso } }, deps, obs);
      if (r && (r.recorded || r.duplicate)) out.reminded++; else out.failed++;
    }
  }
  return out;
}

module.exports = { REMINDER_LEAD_MS, LOOKBACK_DAYS, MAX_REMINDERS_PER_RUN, MARKER_PREFIX, markerName, reminderDue, runReminderSweep };
