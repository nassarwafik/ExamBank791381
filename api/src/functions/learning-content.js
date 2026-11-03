const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
const { requireActiveStudentSession } = require("../lib/student-auth");
const { downloadJsonOrNull, getContainer } = require("../lib/platform-storage");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { classCanSeeLearningModule } = require("../lib/class-learning-materials");
const { loadModuleBody } = require("../lib/learning-content");
const { logReadCost } = require("../lib/read-cost-log");
const { deliveryCopy } = require("../lib/content-assets");   // Tadris+ P5-C
const { teacherCourseDecision, classCourseDecision, courseRefusal } = require("../lib/access/course-access");   // Tadris+ P5-A

// Phase L.6a — GET /api/learning-content/{courseId}/{moduleId}: ONE module body of a learning book, the only way the app reads one.
//   • a student (session token) receives it only while its module is published to the student's PERSISTED class (never a claim
//     in the token): an archived class, a course not attached or a hidden module is refused, before anything is read;
//   • a teacher (builder token) receives any module of a course they may use (the teacher library previews the whole course).
//     Tadris+ P5-A — a course archived by the owner, or outside the teacher's entitlement (while enforcing), is refused: the
//     former «any module of any course» bypass is closed; the same course decision applies to the student's class's teacher;
//   • anyone else is refused.
// The answer carries a strong ETag and `private, no-cache`: a browser may keep the body, but must ask again on every open, so the
// gate runs every time (a 304 is sent only after the gate passed) and a module hidden later is refused at the next open.
const CLASS_PREFIX = "platform/classes/";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "هذه الوحدة غير موجودة." } };
const ARCHIVED = { status: 403, jsonBody: { ok: false, error: "هذا الصف مؤرشف وانتهت السنة الدراسية." } };
const UNAVAILABLE = { status: 403, jsonBody: { ok: false, error: "هذه الوحدة غير متاحة لصفك بعد." } };
const containerOf = deps => deps.container || (deps.getContainer || getContainer)();
const CACHE_HEADERS = { "Cache-Control": "private, no-cache", Vary: "Authorization, x-student-token, x-builder-token" };

async function handler(request, deps = {}, obs = null) {
  try {
    if (String(request.method || "GET").toUpperCase() !== "GET") return { status: 405, jsonBody: { ok: false, error: "Unsupported learning-content request." } };
    const courseId = String(request.params?.courseId || "").trim();
    const moduleId = String(request.params?.moduleId || "").trim();

    // Who is asking: a teacher, else an active student session, else refused.
    const builder = (await requireTeacherSession(request, deps));
    if (builder.ok) {
      const capabilityDenial = await requireCapability(builder, "learning-content.js", "*", deps, obs);   // Tadris+ P3-B
      if (capabilityDenial) return capabilityDenial;
      if (!ID.test(courseId) || !ID.test(moduleId)) return NOT_FOUND;
      const course = await teacherCourseDecision(containerOf(deps), builder.user, courseId, deps);   // Tadris+ P5-A
      if (!course.ok) return course.code === "COURSE_UNKNOWN" ? NOT_FOUND : courseRefusal(course, { teacher: true });
    }
    let classDocs = 0;
    if (!builder.ok) {
      const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
      if (!sess.ok) return sess.response;
      if (!ID.test(courseId) || !ID.test(moduleId)) return NOT_FOUND;
      const classId = String(sess.student?.classId || "").trim();
      const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
      const classroom = classId ? await dl(sess.container, CLASS_PREFIX + classId + ".json") : null;
      classDocs = classId ? 1 : 0;
      if (classroom && normalizeClassStatus(classroom) === "archived") return ARCHIVED;
      // (a module is visible only within an attached course, so this one check also refuses a course that is not attached)
      if (!classroom || !classCanSeeLearningModule(classroom, courseId, moduleId)) return UNAVAILABLE;
      const course = await classCourseDecision(sess.container, classroom, courseId, deps);           // Tadris+ P5-A
      if (!course.ok) return courseRefusal(course);
    }

    const stored = loadModuleBody(courseId, moduleId);
    if (!stored) return NOT_FOUND;
    // Tadris+ P5-C (S7, D10): the module's drawings are delivered as this window's signed URLs (its own ETag per window).
    const signed = deliveryCopy(stored.module, stored.etag, (deps.nowMs || Date.now)());
    const body = { module: signed.value, etag: signed.etag };
    logReadCost(obs, "learning.content.read_cost", { classDocs });
    const ifNoneMatch = String(request.headers?.get?.("if-none-match") || "");
    if (ifNoneMatch && ifNoneMatch.split(",").map(t => t.trim()).includes(body.etag)) return { status: 304, headers: { ...CACHE_HEADERS, ETag: body.etag } };
    return { status: 200, headers: { ...CACHE_HEADERS, ETag: body.etag }, jsonBody: { ok: true, courseId, module: body.module } };
  } catch (e) {
    obs?.logError?.("learning.content.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل هذه الوحدة حاليًا." } };
  }
}

app.http("learningContent", { methods: ["GET"], authLevel: "anonymous", route: "learning-content/{courseId}/{moduleId}", handler: withObservability("learning-content", handler) });

module.exports = { handler };
