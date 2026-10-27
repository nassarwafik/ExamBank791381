// D4 (item 8) — a Web Push for the assignment events of the student notification center (lib/notification-events.js). Before D4 only
// a teacher's direct message reached the student's device; a new assignment, a deadline extension, the teacher's «تذكير» or a released
// result waited until the student happened to open the app.
//
// Rules (the Phase 6B message rules, extended):
//  - Best effort, after the event is recorded: nothing here throws to the caller, and the caller bounds it in time
//    (notifyWithTimeout). The event in the bell is the source of truth; a lost push loses nothing.
//  - FIXED, generic text per event type (push-notify ASSIGNMENT_NOTIFICATIONS): never a title, a mark, a note or a name.
//  - Visibility is re-checked at send time, like the notification center does at read time: the assignment must exist and be
//    PUBLISHED; each recipient must still be a member of the assignment's class (and not login-disabled); a review is pushed only
//    when it made the mark FINAL and the assignment's results are RELEASED (the bell hides it until then too).
//  - Push off (VAPID not configured) → returns before any storage read, so a deployment without push pays nothing.
const { listJson, downloadJsonOrNull, mapConcurrent } = require("./platform-storage");
const { pushConfig, notifyStudentOfAssignmentEvent, ASSIGNMENT_NOTIFICATIONS } = require("./push-notify");
const { normalizeAssignmentStatus } = require("./assignment-lifecycle");
const { isStudentClassMember } = require("./class-membership");
const { resultsReleased } = require("./results-release");

const AP = "platform/assignments/", UP = "platform/users/", SP = "platform/submissions/";
const SEND_CONCURRENCY = 8;
const PUSH_EVENT_TYPES = Object.freeze(Object.keys(ASSIGNMENT_NOTIFICATIONS));

const recipientOk = (u, classId) => isStudentClassMember(u, classId) && u.active !== false;

async function sendAll(container, studentIds, type, deps, log) {
  const summary = { status: "sent", recipients: studentIds.length, delivered: 0 };
  const notify = deps.notifyStudentOfAssignmentEvent || notifyStudentOfAssignmentEvent;
  const results = await mapConcurrent(studentIds, SEND_CONCURRENCY, id => notify(container, id, type, deps, log).catch(() => null));
  for (const r of results) summary.delivered += r && r.delivered ? r.delivered : 0;
  return summary;
}

/**
 * The push for one RECORDED event `{ scope, classId?, studentId?, type, data }`. Never throws.
 * → { status: "skipped" | "unconfigured" | "hidden" | "sent" | "error", recipients?, delivered? }
 */
async function pushForEvent(container, event, deps = {}, log = null) {
  try {
    if (!event || !PUSH_EVENT_TYPES.includes(event.type)) return { status: "skipped" };
    if (!(deps.pushConfig || pushConfig)().available) return { status: "unconfigured" };
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const assignmentId = String((event.data && event.data.assignmentId) || "");
    const a = assignmentId ? await dl(container, AP + assignmentId + ".json") : null;
    if (!a || normalizeAssignmentStatus(a) !== "published") return { status: "hidden" };
    const classId = String(a.classId || "");
    if (event.type === "assignment_reviewed" && !(event.data && event.data.finalized === true && resultsReleased(a, (deps.now || Date.now)()))) return { status: "hidden" };
    let recipients;
    if (event.scope === "student") {
      const u = await dl(container, UP + String(event.studentId || "") + ".json");
      recipients = recipientOk(u, classId) ? [String(u.userId)] : [];
    } else if (event.scope === "class" && String(event.classId || "") === classId) {
      recipients = (await (deps.listJson || listJson)(container, UP)).filter(u => recipientOk(u, classId)).map(u => String(u.userId));
    } else return { status: "hidden" };
    if (!recipients.length) return { status: "sent", recipients: 0, delivered: 0 };
    return await sendAll(container, recipients, event.type, deps, log);
  } catch (e) {
    try { log?.logWarn?.("push.event.failed", { kind: String(event && event.type || ""), errorClass: e && e.name ? String(e.name) : "Error" }); } catch { /* best effort */ }
    return { status: "error" };
  }
}

/**
 * D4 — the teacher RELEASED an assignment's results (manual release): one «نتيجة جديدة» push to each class member who has a
 * submitted attempt. Same guards as pushForEvent (published, member, push configured). Never throws.
 */
async function pushResultsReleased(container, assignment, deps = {}, log = null) {
  try {
    if (!(deps.pushConfig || pushConfig)().available) return { status: "unconfigured" };
    if (!assignment || normalizeAssignmentStatus(assignment) !== "published" || !resultsReleased(assignment, (deps.now || Date.now)())) return { status: "hidden" };
    const classId = String(assignment.classId || ""), id = String(assignment.assignmentId || "");
    const members = (await (deps.listJson || listJson)(container, UP)).filter(u => recipientOk(u, classId));
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const subs = await mapConcurrent(members, SEND_CONCURRENCY, u => dl(container, SP + id + "/" + u.userId + ".json").catch(() => null));
    const withAttempts = members.filter((u, i) => subs[i] && Array.isArray(subs[i].attempts) && subs[i].attempts.length > 0).map(u => String(u.userId));
    if (!withAttempts.length) return { status: "sent", recipients: 0, delivered: 0 };
    return await sendAll(container, withAttempts, "assignment_reviewed", deps, log);
  } catch (e) {
    try { log?.logWarn?.("push.event.failed", { kind: "results_released", errorClass: e && e.name ? String(e.name) : "Error" }); } catch { /* best effort */ }
    return { status: "error" };
  }
}

module.exports = { PUSH_EVENT_TYPES, pushForEvent, pushResultsReleased };
