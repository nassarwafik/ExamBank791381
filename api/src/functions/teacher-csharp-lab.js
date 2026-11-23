// Teacher C# lab, phase V1 (docs/enterprise-csharp-visual-lab-plan.md; AGENTS.md §10 «Teacher C# lab») — the ONE thing the lab needs
// from the server: the book's own classes for a course, so a program in the teacher's browser compiles against the same Stack<T> /
// Queue<T> / Node<T> / BinNode<T> the book prints and the Runner appends (course-library.js).
//     GET /api/teacher-tools/csharp-lab?courseId=<id>  → { ok, courseId, library }   (library = "" for a course without classes)
// WHO: a TEACHER session only (a student token is refused by requireTeacherSession, as is no token), with learning.course.view, and
// the course in the teacher's entitlement (teacherCourseDecision: published in the owner's catalog). The lab itself is presentation:
// the reader offers it to a teacher only; this route is where the book's content is guarded. The classes are course content, so they
// are never a public static file of the lab (/csharp-lab/ holds the compiler only).
// NOTHING else: no code is received, nothing runs here, nothing is stored or logged but the outcome code.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireCapability } = require("../lib/access/require-capability");
const { getContainer } = require("../lib/platform-storage");
const { teacherCourseDecision, courseRefusal } = require("../lib/access/course-access");
const { libraryText } = require("../lib/course-library");

const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NO_STORE = { "Cache-Control": "no-store" };

async function handler(request, deps = {}, obs = null) {
  try {
    const auth = await requireTeacherSession(request, deps);
    if (!auth.ok) return auth.response;
    const capabilityDenial = await requireCapability(auth, "teacher-csharp-lab.js", "*", deps, obs);
    if (capabilityDenial) return capabilityDenial;
    const courseId = String((request.query && typeof request.query.get === "function" ? request.query.get("courseId") : "") || "").trim();
    if (!COURSE_ID.test(courseId)) return { status: 400, headers: NO_STORE, jsonBody: { ok: false, code: "REQUEST_INVALID", error: "طلب غير صالح." } };
    const container = deps.container || (deps.getContainer || getContainer)();
    const course = await teacherCourseDecision(container, auth.user, courseId, deps);
    if (!course.ok) { obs?.logWarn("teacher-csharp-lab.refused", { code: course.code }); return courseRefusal(course, { teacher: true }); }
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, courseId, library: libraryText(courseId) } };
  } catch (e) {
    obs?.logError("teacher-csharp-lab.error", e);
    return { status: 500, headers: NO_STORE, jsonBody: { ok: false, code: "LAB_UNAVAILABLE", error: "تعذّر تحميل مختبر C# حاليًا." } };
  }
}

app.http("teacherCsharpLab", { methods: ["GET"], authLevel: "anonymous", route: "teacher-tools/csharp-lab", handler: withObservability("teacher-csharp-lab", handler) });
module.exports = { handler };
