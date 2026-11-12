const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { buildStudentLearningMaterials } = require("../lib/class-learning-materials");
const { classAllowedCourses } = require("../lib/access/course-access");   // Tadris+ P5-A
const { sharedClassEntries } = require("../lib/class-membership");
const { studentClasses } = require("../lib/student-classes");   // Tadris+ P11-C

const CLASS_PREFIX = "platform/classes/";

// GET /api/student-learning-materials — the learning materials a student may open RIGHT NOW.
//
// Authority chain (server-side, default-deny):
//   requireActiveStudentSession → the CURRENT persisted student document → student.classId (never the token's
//   classId, never a query parameter, never anything the browser sends) → the CURRENT class document → class
//   lifecycle → normalized learningMaterials ∩ server publication registry → safe catalog.
//
// Storage path: the session's one user read + ONE class document read. No classroom/student scans, no per-module
// blobs, no module bodies (bodies remain frontend code-split chunks the Reader loads only when opened).
// A course attached with nothing published, an unknown/stale stored id, a skeleton module: all simply absent.
// `deps` is the unit-test seam (production passes nothing).
async function handler(request, deps = {}, obs = null) {
  const ras = deps.requireActiveStudentSession || requireActiveStudentSession;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try {
    const sess = await ras(request, deps);
    if (!sess.ok) return sess.response;
    const student = sess.student;
    // Tadris+ P11-C — a student who is also in a class of another teacher: the materials of every OPEN class of theirs. A course is
    // listed once, from the first class that offers it (home first — lib/student-classes.js, the rule every learning route uses), and
    // only when THAT class's teacher may use it (P5-A). Refused, as before, only when no class of the student is open.
    if (sharedClassEntries(student).length) {
      const classes = await studentClasses(student, name => dl(sess.container, name));
      if (!classes.open.length) return classes.home.archived ? { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } } : { status: 200, jsonBody: { ok: true, materials: [] } };
      const listed = [], served = new Set();
      for (const c of classes.open) {
        const offered = buildStudentLearningMaterials(c.classroom).filter(m => !served.has(m.courseId));
        offered.forEach(m => served.add(m.courseId));
        const allowed = new Set(await classAllowedCourses(sess.container, c.classroom, offered.map(m => m.courseId), deps));
        listed.push(...offered.filter(m => allowed.has(m.courseId)));
      }
      return { status: 200, jsonBody: { ok: true, materials: listed } };
    }
    const classId = String(student?.classId || "").trim();
    if (!classId) return { status: 200, jsonBody: { ok: true, materials: [] } };
    const classroom = await dl(sess.container, CLASS_PREFIX + classId + ".json");
    if (!classroom) return { status: 200, jsonBody: { ok: true, materials: [] } };
    // Same lifecycle rule as the student dashboard: an archived class exposes nothing (no weaker path).
    if (normalizeClassStatus(classroom) === "archived") return { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
    // Tadris+ P5-A — only courses published in the catalog and within the class's teacher's entitlement (D15: a suspended
    // teacher's released materials stay listed).
    const materials = buildStudentLearningMaterials(classroom);
    const allowed = new Set(await classAllowedCourses(sess.container, classroom, materials.map(m => m.courseId), deps));
    return { status: 200, jsonBody: { ok: true, materials: materials.filter(m => allowed.has(m.courseId)) } };
  } catch (e) {
    obs?.logError("student.learning-materials.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل موادك التعليمية حاليًا." } };
  }
}

app.http("studentLearningMaterials", { methods: ["GET"], authLevel: "anonymous", route: "student-learning-materials", handler: withObservability("student-learning-materials", handler) });

module.exports = { handler };
