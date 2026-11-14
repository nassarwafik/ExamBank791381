// Which class serves each project for one student — the ONE resolution the student project routes share (the tracker and,
// since Phase F2, the exam form). Derived only from the student's own document and their classes; nothing from a request.
//
// The student's classes in serving order (Tadris+ P11-C, lib/student-classes.js): the OPEN classes — the home class first, then
// the classes the owner added the student to — and LAST an archived home class, whose projects stay a readable record wherever
// no open class runs the same project. A project code is served by the FIRST class that runs it.
const { downloadJsonOrNull } = require("../platform-storage");
const { getSupportedClassProgramCodes } = require("./class-programs");
const { sharedClassEntries } = require("../class-membership");
const { studentClasses } = require("../student-classes");

const CLASS_PREFIX = "platform/classes/";

async function resolveStudentProjectClasses(container, student) {
  const classList = [];
  if (sharedClassEntries(student).length) {
    const classes = await studentClasses(student, name => downloadJsonOrNull(container, name));
    for (const c of classes.open) classList.push({ classId: c.classId, classroom: c.classroom });
    if (classes.home.classroom && classes.home.archived) classList.push({ classId: classes.home.classId, classroom: classes.home.classroom });
  } else {
    const homeId = student.classId;
    const homeClassroom = homeId ? await downloadJsonOrNull(container, CLASS_PREFIX + homeId + ".json") : null;
    if (homeClassroom) classList.push({ classId: homeId, classroom: homeClassroom });
  }
  const servedBy = new Map();                                   // project code → the class that serves it
  for (const c of classList) for (const code of getSupportedClassProgramCodes(c.classroom)) if (!servedBy.has(code)) servedBy.set(code, c);
  return { classList, servedBy };
}

module.exports = { resolveStudentProjectClasses };
