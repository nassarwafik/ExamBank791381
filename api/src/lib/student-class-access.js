const { normalizeClassStatus } = require("./class-lifecycle");
const { sharedClassIds } = require("./class-membership");

// Tadris+ P11-A — the ONE class check of the student's assignment routes (open, state / start / save / submit, practice run).
//
// A student reaches an assignment only through a class of THEIRS: the home class (`student.classId`, exactly as before) or a class the
// owner added the student to (`student.sharedClasses`, docs/enterprise-shared-enrollment-p11a.md). The assignment's OWN class decides
// whether it is open: an archived class is closed on its own and the student's other class keeps working.
//
//   → { assignment, classId, classroom }                 the student may go on (classroom: that class's document; null only for a
//                                                        home class whose document is missing — unchanged)
//   → { denied: "archived" }                             that class is archived — or, as before P11-A, the home class is archived
//                                                        and the student has no other class (answered before the assignment is read)
//   → { denied: "unavailable" }                          no such assignment for this account: missing, without a class (QA-18: two
//                                                        missing class ids never match), of a class the student is not in, or of a
//                                                        shared class whose document is gone
//
// `load(name)` reads one stored JSON document (null when missing). Fail closed: a read error throws to the caller's own handler.
const CLASS_PREFIX = "platform/classes/";
const archived = classroom => !!classroom && normalizeClassStatus(classroom) === "archived";

async function studentAssignmentAccess(student, load, loadAssignment) {
  const homeId = String((student && student.classId) || "");
  const homeClass = homeId ? await load(CLASS_PREFIX + homeId + ".json") : null;
  const shared = sharedClassIds(student);
  if (archived(homeClass) && !shared.length) return { denied: "archived" };
  const assignment = await loadAssignment();
  const classId = assignment && assignment.classId ? String(assignment.classId) : "";
  if (!assignment || !classId) return { denied: "unavailable" };
  if (classId === homeId) return archived(homeClass) ? { denied: "archived" } : { assignment, classId, classroom: homeClass };
  if (!shared.includes(classId)) return { denied: "unavailable" };
  const classroom = await load(CLASS_PREFIX + classId + ".json");
  if (!classroom) return { denied: "unavailable" };
  return archived(classroom) ? { denied: "archived" } : { assignment, classId, classroom };
}

module.exports = { studentAssignmentAccess };
