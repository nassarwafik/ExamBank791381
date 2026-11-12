const { normalizeClassStatus } = require("./class-lifecycle");
const { sharedClassEntries } = require("./class-membership");
const { getVisibleLearningModuleIds } = require("./class-learning-materials");

// Tadris+ P11-C — "the student's class" for everything a class OFFERS its students (learning materials, projects, games, the
// achievement feed): a student may be in more than one class (P11-A: the home class + the classes the owner added them to), so that
// question has more than one answer. ONE rule decides which class serves a given thing (docs/enterprise-shared-services-p11c.md):
//
//   the student's OPEN classes in order — the home class first, then the shared classes in the order they were added — and the
//   FIRST of them that has the thing (a course, a module, a project, a feed post …) is the class that serves it.
//
// So the home class is never overridden: what it offers stays exactly what the student had, and a shared class ADDS only what the
// home class does not offer. A class counts only while its document exists and is not archived.
//
// `load(name)` reads one stored JSON document (null when missing). A student who shares no class costs exactly the one home read the
// routes always made.
const CLASS_PREFIX = "platform/classes/";
const isArchived = classroom => !!classroom && normalizeClassStatus(classroom) === "archived";

/**
 * Every class of the student, read once:
 *   home    { classId, classroom | null, archived }             (classId "" when the student has no home class)
 *   shared  [{ classId, classroom, archived, addedAt }]         (only those whose document exists)
 *   open    [{ classId, classroom, home }]                      (not archived; home first)
 */
async function studentClasses(student, load) {
  const homeId = String((student && student.classId) || "").trim();
  const homeClassroom = homeId ? await load(CLASS_PREFIX + homeId + ".json") : null;
  const home = { classId: homeId, classroom: homeClassroom && typeof homeClassroom === "object" ? homeClassroom : null, archived: isArchived(homeClassroom) };
  const shared = [];
  for (const entry of sharedClassEntries(student)) {
    const classroom = await load(CLASS_PREFIX + entry.classId + ".json");
    if (!classroom || typeof classroom !== "object") continue;
    shared.push({ classId: entry.classId, classroom, archived: isArchived(classroom), addedAt: entry.addedAt });
  }
  const open = [];
  if (home.classroom && !home.archived) open.push({ classId: home.classId, classroom: home.classroom, home: true });
  for (const s of shared) if (!s.archived) open.push({ classId: s.classId, classroom: s.classroom, home: false });
  return { home, shared, open };
}

/** The open class that serves a thing: the first one for which `has(classroom)` holds, or null. */
function servingClass(classes, has) {
  return classes.open.find(c => has(c.classroom)) || null;
}

/**
 * For a route written around ONE classroom document (it refuses an archived one, then asks it for the thing): the classroom to give
 * it. The serving class when there is one; otherwise the home classroom, so the route answers exactly as it always did (archived,
 * not available, no class). A student who shares no class: the home classroom, one read.
 */
async function classroomServing(student, load, has) {
  const homeId = String((student && student.classId) || "").trim();
  if (!sharedClassEntries(student).length) return homeId ? load(CLASS_PREFIX + homeId + ".json") : null;
  const classes = await studentClasses(student, load);
  const serving = servingClass(classes, has);
  return serving ? serving.classroom : classes.home.classroom;
}

/**
 * The student AS A STUDENT OF `classroom`: the rules that ask "whose student is this?" (the services and games a teacher offers,
 * lib/access/student-services.js) read the student's owner stamp, which names the HOME teacher. For a shared class the teacher is
 * the class's own owner — never the home teacher's.
 */
function studentOfClass(student, classroom) {
  const subject = { ...student };
  delete subject.ownerId;
  if (classroom && typeof classroom.ownerId === "string" && classroom.ownerId) subject.ownerId = classroom.ownerId;
  return subject;
}

/** `has` for a learning course: the class offers it — attached AND with at least one module visible to its students. */
const offersCourse = courseId => classroom => getVisibleLearningModuleIds(classroom, courseId).length > 0;

module.exports = { studentClasses, servingClass, classroomServing, offersCourse, studentOfClass };
