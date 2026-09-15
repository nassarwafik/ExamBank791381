// Roadmap #24 — the ONE canonical, teacher/read-side CLASS-MEMBERSHIP predicate.
//
// "Is this student (still) a member of this class?" is a different question from "may this student log in?".
//   - `archived`  is the roster/history LIFECYCLE flag: an archived student has left the class roster and is
//                 excluded from teacher read surfaces (gradebook, item analysis, analytics, reports, trackers).
//   - `active`    is LOGIN ELIGIBILITY only (a "login-disabled" account, active:false + archived:false). A
//                 disabled student is STILL a class member: their gradebook row, pending reviews, historical
//                 results, item-analysis participation and analytics contribution must not disappear.
//
// Login/session authorization (student-auth requireActiveStudentSession, platform-login) deliberately keeps
// its own, stricter rule (active === false blocks access) — NEVER use this predicate for authentication.
// Mutation gates (manage-students) keep their own checks too; this helper is for READ population only.
//
// A user is a member when it exists, has role "student", is NOT archived, and belongs to exactly `classId`.
// `active` is intentionally NOT consulted.
function isStudentClassMember(student, classId) {
  if (!student || typeof student !== "object") return false;
  if (student.role !== "student") return false;
  if (student.archived === true) return false;
  return String(student.classId || "") === String(classId ?? "");
}

module.exports = { isStudentClassMember };
