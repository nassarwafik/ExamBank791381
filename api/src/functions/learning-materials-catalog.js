const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");   // Tadris+ P3-B
const { listLearningCourses } = require("../lib/learning-materials-registry");
const { getContainer } = require("../lib/platform-storage");
const { teacherAllowedCourses } = require("../lib/access/course-access");   // Tadris+ P5-A

// GET /api/learning-materials-catalog — the teacher's PUBLISHABLE catalog (production-approved courses and their
// releasable modules: id, title, order), from the server registry: no page or lesson bodies, no answer keys, no PDF. The teacher
// UI fetches it once per workspace lifecycle. Tadris+ P5-A — only the courses this teacher may use now: published in the owner's
// catalog and within the teacher's entitlement (while enforcing). Same shape as before.
// `deps` is the unit-test seam (production passes nothing).
async function handler(request, deps = {}, obs = null) {
  const authFn = requireTeacherSession;
  try {
    const auth = await authFn(request, deps);
    if (!auth.ok) return auth.response;
    const capabilityDenial = await requireCapability(auth, "learning-materials-catalog.js", "*", deps, obs);   // Tadris+ P3-B
    if (capabilityDenial) return capabilityDenial;
    const all = listLearningCourses();
    const allowed = new Set(await teacherAllowedCourses(deps.container || (deps.getContainer || getContainer)(), auth.user, all.map(c => c.courseId), deps));
    return { status: 200, jsonBody: { ok: true, courses: all.filter(c => allowed.has(c.courseId)) } };
  } catch (e) {
    obs?.logError("learning-materials.catalog.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل قائمة المواد التعليمية حاليًا." } };
  }
}

app.http("learningMaterialsCatalog", { methods: ["GET"], authLevel: "anonymous", route: "learning-materials-catalog", handler: withObservability("learning-materials-catalog", handler) });

module.exports = { handler };
