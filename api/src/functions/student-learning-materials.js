const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { buildStudentLearningMaterials } = require("../lib/class-learning-materials");
const { classAllowedCourses } = require("../lib/access/course-access");   // Tadris+ P5-A

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
