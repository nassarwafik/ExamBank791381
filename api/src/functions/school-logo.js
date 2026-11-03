// Tadris+ P4-C — GET /api/school-logo?v=<n> → the logo of the CALLER's OWN school (image/webp), for the top of the teacher shell
// and the student portal (owner decision §19.8: the students of a school see its logo too).
//   a managed teacher → its account's school; a student (active, hardened session) → the school of the teacher who owns them.
// No parameter selects a school: there is nothing to enumerate and no other school's logo can be asked for. `?v=` only busts the
// browser cache. Anonymous / revoked → 401; no school or no logo → 404. The bytes are the ones the owner's upload produced
// through the safe image pipeline (sniffed, decoded, re-encoded); the answer can never become a document (nosniff + CSP sandbox).
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireTeacherSession } = require("../lib/teacher-session");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer } = require("../lib/platform-storage");
const { photoRecord, photoResponse } = require("../lib/profile-photo-store");
const { schoolForTeacher, schoolForStudent, logoPrefix } = require("../lib/schools");

const SAFE_HEADERS = Object.freeze({
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer"
});
const NONE = { status: 404, headers: { "Cache-Control": "no-store", ...SAFE_HEADERS }, jsonBody: { ok: false, code: "NO_SCHOOL_LOGO", error: "لا يوجد شعار." } };

async function handler(request, deps = {}, obs = null) {
  try {
    const containerOf = () => deps.container || (deps.getContainer || getContainer)();
    let school;
    const teacher = await requireTeacherSession(request, deps);
    if (teacher.ok) school = await schoolForTeacher(containerOf(), teacher.user, deps);
    else {
      const student = await requireActiveStudentSession(request, deps);
      if (!student.ok) return teacher.response && teacher.response.status === 503 ? teacher.response : student.response;
      school = await schoolForStudent(student.container || containerOf(), student.student, deps);
    }
    if (!school) return NONE;
    const record = photoRecord(school);
    if (!record) return NONE;
    const r = await photoResponse(containerOf(), record, logoPrefix(school.schoolId), deps, obs);
    if (r.status !== 200) return NONE;
    return { ...r, headers: { ...r.headers, ...SAFE_HEADERS } };
  } catch (e) {
    obs?.logError("school.logo.error", e);
    return { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" }, jsonBody: { ok: false, error: "تعذر تحميل الشعار حاليًا." } };
  }
}

app.http("schoolLogo", { methods: ["GET"], authLevel: "anonymous", route: "school-logo", handler: withObservability("school-logo", handler) });
module.exports = { handler };
