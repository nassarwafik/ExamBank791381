const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
// Phase 21G.0 — teacher tenancy: analytics cover only the teacher's own classes.
const { tenantOf } = require("../lib/teacher-tenancy");
const { getContainer } = require("../lib/platform-storage");
const { computeTeacherAnalytics, AnalyticsScopeError } = require("../lib/teacher-analytics-core");

function timestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

// `deps` is an optional dependency-injection seam for unit tests (production passes nothing, so the real
// implementations are used); `obs` is the request context withObservability passes as the third argument.
// Neither changes runtime behavior.
async function handler(request, deps = {}, obs = null) {
    try {
      const auth = (await requireTeacherSession(request, deps));
      if (!auth.ok) return auth.response;

      const url = new URL(request.url);
      const requestedClassId = String(url.searchParams.get("classId") || "").trim();
      const requestedStudentId = String(url.searchParams.get("studentId") || "").trim();
      const fromMs = timestamp(url.searchParams.get("from"));
      const toMs = timestamp(url.searchParams.get("to"));

      const container = deps.container || (deps.getContainer || getContainer)();
      const result = await computeTeacherAnalytics(container, {
        classId: requestedClassId,
        studentId: requestedStudentId,
        fromMs,
        toMs,
        tenant: tenantOf(auth.user)
      });

      return {
        status: 200,
        jsonBody: { ok: true, ...result }
      };
    } catch (e) {
      // Phase 8A: a rejected scope (student without class / unknown / not a member) is a safe, explicit client error.
      if (e instanceof AnalyticsScopeError) return { status: e.httpStatus, jsonBody: { ok: false, error: e.message } };
      obs?.logError("teacher.analytics.error", e);
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر جلب تحليلات المعلم حاليًا."
        }
      };
    }
}

app.http("teacherAnalytics", { methods: ["GET"], authLevel: "anonymous", route: "teacher-analytics", handler: withObservability("teacher-analytics", handler) });
module.exports = { handler };
