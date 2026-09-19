const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { listLearningCourses } = require("../lib/learning-materials-registry");

// GET /api/learning-materials-catalog — the teacher's PUBLISHABLE catalog (production-approved courses and their
// releasable modules: id, title, order). Read straight from the server registry: no storage read, no page or
// lesson bodies, no answer keys, no PDF. The teacher UI fetches it once per workspace lifecycle.
// `deps` is the unit-test seam (production passes nothing).
async function handler(request, deps = {}, obs = null) {
  const authFn = deps.requireBuilderAuth || requireBuilderAuth;
  try {
    const auth = authFn(request);
    if (!auth.ok) return auth.response;
    return { status: 200, jsonBody: { ok: true, courses: listLearningCourses() } };
  } catch (e) {
    obs?.logError("learning-materials.catalog.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذر تحميل قائمة المواد التعليمية حاليًا." } };
  }
}

app.http("learningMaterialsCatalog", { methods: ["GET"], authLevel: "anonymous", route: "learning-materials-catalog", handler: withObservability("learning-materials-catalog", handler) });

module.exports = { handler };
