const { app } = require("@azure/functions");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { computeTeacherAnalytics } = require("../lib/teacher-analytics-core");

function timestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

app.http("teacherAnalytics", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "teacher-analytics",
  handler: async request => {
    try {
      const auth = requireBuilderAuth(request);
      if (!auth.ok) return auth.response;

      const url = new URL(request.url);
      const requestedClassId = String(url.searchParams.get("classId") || "").trim();
      const requestedStudentId = String(url.searchParams.get("studentId") || "").trim();
      const fromMs = timestamp(url.searchParams.get("from"));
      const toMs = timestamp(url.searchParams.get("to"));

      const container = getContainer();
      const result = await computeTeacherAnalytics(container, {
        classId: requestedClassId,
        studentId: requestedStudentId,
        fromMs,
        toMs
      });

      return {
        status: 200,
        jsonBody: { ok: true, ...result }
      };
    } catch {
      return {
        status: 500,
        jsonBody: {
          ok: false,
          error: "تعذر جلب تحليلات المعلم حاليًا."
        }
      };
    }
  }
});
