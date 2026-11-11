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

// Tadris+ P11-A — ONE student account in MORE THAN ONE class (docs/enterprise-shared-enrollment-p11a.md).
//
// The HOME class stays `student.classId` (predicate above, unchanged: every surface that was not moved to shared classes keeps
// reading it). A class the owner ADDED the student to is a SHARED class: an entry of `student.sharedClasses`
// ({ classId, addedAt, addedBy }). The teacher of a shared class is the class document's own owner — never stored on the student.
//
//   sharedClassEntries(student)   the well-formed entries (safe id, not the home class, first occurrence only)
//   sharedClassIds(student)       their class ids
//   isStudentSharedIn(student, c) the student was ADDED to class c
//   isStudentInClass(student, c)  home member (not archived) OR added to c — the population of the surfaces that support
//                                 shared classes (roster, gradebook, review, progress; the student's own assignments)
//   studentClassIds(student)      every class of the student: the home class first, then the shared ones
//
// `archived` is the lifecycle of the HOME roster (set by the home teacher or the owner): it takes the student out of the home
// class's read population, as before, and never out of a shared class's gradebook — that teacher's rows and pending reviews must
// not disappear because another teacher archived the account (the rule of Roadmap #24 for `active`). Login eligibility is not
// decided here.
const SAFE_CLASS_ID = /^[A-Za-z0-9_-]{1,128}$/;
function sharedClassEntries(student) {
  if (!student || typeof student !== "object" || !Array.isArray(student.sharedClasses)) return [];
  const home = String(student.classId || "");
  const out = [], seen = new Set();
  for (const entry of student.sharedClasses) {
    if (!entry || typeof entry !== "object" || typeof entry.classId !== "string") continue;
    const id = entry.classId;
    if (!SAFE_CLASS_ID.test(id) || id === home || seen.has(id)) continue;
    seen.add(id);
    out.push({ classId: id, addedAt: String(entry.addedAt || ""), addedBy: String(entry.addedBy || "") });
  }
  return out;
}
function sharedClassIds(student) {
  return sharedClassEntries(student).map(entry => entry.classId);
}
function isStudentSharedIn(student, classId) {
  if (!student || typeof student !== "object" || student.role !== "student") return false;
  const id = String(classId ?? "");
  return !!id && sharedClassIds(student).includes(id);
}
function isStudentInClass(student, classId) {
  return isStudentClassMember(student, classId) || isStudentSharedIn(student, classId);
}
function studentClassIds(student) {
  if (!student || typeof student !== "object") return [];
  const home = String(student.classId || "");
  return [...(home ? [home] : []), ...sharedClassIds(student)];
}

module.exports = { isStudentClassMember, sharedClassEntries, sharedClassIds, isStudentSharedIn, isStudentInClass, studentClassIds };
