// Classes & Students hardening — grading-safety guard for roster changes that REMOVE a student from a class's
// teacher read population.
//
// The gradebook, scoped review and grading routes select students through the canonical membership predicate
// (class-membership.isStudentClassMember: same classId AND not archived). Moving a student to another class, or
// archiving them, therefore hides every result of their CURRENT class from that class's gradebook — including a
// result still awaiting the teacher (gradingStatus "pendingReview": manual marks / unfinalized / coding hold) and an
// attempt that is still open. Nothing is zeroed, but the work can no longer be graded or ended from any teacher
// surface: an invisible "no answer". AGENTS.md §10 requires failing closed instead, so these operations are refused
// (409 PENDING_GRADING) until the teacher finishes that work. Login-disabling (active:false) keeps membership and is
// the safe alternative the message names.
//
// Read cost: one listing of assignment documents and one listing of submission NAMES per request (cached across the
// rows of a bulk action), then one download per existing submission of the student in their current class only.

const { listJson, listBlobNames, downloadManyJson } = require("./platform-storage");
const { deriveGradingStatus } = require("./grading-status");
const { activeAttemptOf } = require("./assignment-availability");
const { isReportableAssessment } = require("./assignment-lifecycle");

const ASSIGNMENT_PREFIX = "platform/assignments/";
const SUBMISSION_PREFIX = "platform/submissions/";

/** True when this submission still needs the teacher: an open attempt, or a latest result that is not final. */
function submissionNeedsTeacher(submission) {
  if (!submission || typeof submission !== "object") return false;
  if (activeAttemptOf(submission)) return true;
  const attempts = Array.isArray(submission.attempts) ? submission.attempts : [];
  const latest = attempts.length ? attempts[attempts.length - 1] : null;
  return latest ? deriveGradingStatus(latest) === "pendingReview" : false;
}

/** A per-request reader: assignment ids per class and the set of existing submission blob names, each read once. */
function createPendingGradingReader(container) {
  let assignmentsByClass = null;
  let submissionNames = null;
  async function load() {
    if (!assignmentsByClass) {
      assignmentsByClass = new Map();
      for (const a of await listJson(container, ASSIGNMENT_PREFIX)) {
        const id = String(a?.assignmentId || ""), classId = String(a?.classId || "");
        if (!id || !classId || !isReportableAssessment(a)) continue;
        if (!assignmentsByClass.has(classId)) assignmentsByClass.set(classId, []);
        assignmentsByClass.get(classId).push(id);
      }
    }
    if (!submissionNames) submissionNames = new Set(await listBlobNames(container, SUBMISSION_PREFIX));
  }
  /** Number of the student's submissions in `classId` that still need the teacher. */
  async function count(studentId, classId) {
    if (!studentId || !classId) return 0;
    await load();
    const names = (assignmentsByClass.get(String(classId)) || [])
      .map(id => SUBMISSION_PREFIX + id + "/" + studentId + ".json")
      .filter(name => submissionNames.has(name));
    if (!names.length) return 0;
    return (await downloadManyJson(container, names)).filter(submissionNeedsTeacher).length;
  }
  return { count };
}

function pendingGradingMessage(operation, pending) {
  const verb = operation === "archive" ? "أرشفة" : operation === "delete" ? "حذف" : "نقل";
  return "لا يمكن " + verb + " الطالب الآن: لديه " + pending + (pending === 1 ? " عمل" : " أعمال") +
    " بانتظار التصحيح أو محاولة مفتوحة في صفه الحالي، وستختفي من دفتر علامات الصف. أكمل التصحيح أو أنهِ المحاولة أولًا" +
    (operation === "archive" ? "، أو عطّل حساب الطالب بدل أرشفته." : operation === "delete" ? "، أو عطّل حساب الطالب بدل حذفه." : ".");
}

/** Phase S.1 — work of the class's CURRENT members still awaiting the teacher (former members' work is already outside
 *  the class's gradebook and never blocks): one shared reader, so the cost is the reader's listings plus each member's
 *  existing submissions in this class. */
async function pendingForClassMembers(reader, classId, memberIds) {
  let total = 0;
  for (const studentId of memberIds) total += await reader.count(String(studentId || ""), String(classId || ""));
  return total;
}

function pendingClassMessage(operation, pending) {
  const verb = operation === "graduateandarchive" ? "تخريج الصف وأرشفته" : "أرشفة الصف";
  return "لا يمكن " + verb + " الآن: لدى طلابه " + pending + (pending === 1 ? " عمل" : " أعمال") +
    " بانتظار التصحيح أو محاولات مفتوحة، وبعد الأرشفة لا يستطيع الطلاب تسليم محاولاتهم ولا تظهر في متابعة اليوم. أكمل التصحيح أو أنهِ المحاولات أولًا.";
}

module.exports = { submissionNeedsTeacher, createPendingGradingReader, pendingGradingMessage, pendingForClassMembers, pendingClassMessage };
