const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict } = require("../lib/audit-log");
const { requireOwnerSession, NO_STORE } = require("../lib/identity/owner-session");
const { isTeacherAccountId } = require("../lib/identity/teacher-token");
const { readTeacherAccount } = require("../lib/identity/teacher-accounts");
const { tenantOf } = require("../lib/teacher-tenancy");
const { computeTeacherAnalytics, AnalyticsScopeError } = require("../lib/teacher-analytics-core");
const { computeTeacherProgress } = require("../lib/owner-teacher-progress");   // phase 4

// Owner Console — «لوحة البيانات» of ONE teacher (owner decisions of 2026-11-15: recorded in the owner's audit log without student
// data · student names shown · no step-up, read only · learning materials and projects follow in a later phase).
//
//   GET /api/owner-teacher-dashboard?accountId=<teacher account>[&classId=][&studentId=][&from=][&to=]
//     (owner session only)  → { ok, teacher: { accountId, username, displayName, status }, ...the teacher dashboard figures }
//   GET /api/owner-teacher-dashboard?accountId=<teacher account>&view=progress[&classId=]   (phase 4)
//     → { ok, teacher, learning: [per class × course: reading progress], projects: [per class × project: progress summary] }
//     from the SAME computations as the teacher's own reading-progress and project summaries (lib/owner-teacher-progress.js).
//
// The figures are computed by the SAME function as the teacher's own «لوحة المتابعة» (lib/teacher-analytics-core.js), with the SAME
// scope the teacher's own session has: the tenant of a managed session of that account (tenantOf — exactly what the teacher's
// requests use), so the owner sees what that teacher sees, never another teacher's class, student, assignment or submission. Every
// section is included (the owner is not bound by the teacher's widget entitlement). Read only: nothing is written but the audit
// record. An unknown or malformed account is a 404 / 400; a teacher or student token is refused (owner session required); every
// view is recorded STRICTLY before anything is served (a view that cannot be recorded is refused — fail closed, like D14). The
// record carries the account and the scope (global / class / student and the class id), never a student id, name or figure.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unavailable = () => reply(503, { ok: false, code: "OWNER_DASHBOARD_UNAVAILABLE", error: "تعذر تحميل لوحة بيانات المعلم حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

function queryParam(request, name) {
  try { if (request.query && typeof request.query.get === "function") return request.query.get(name) || ""; } catch { /* fall through */ }
  try { return new URL(String(request.url || ""), "http://localhost").searchParams.get(name) || ""; } catch { return ""; }
}
function timestamp(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** The scope a session of this teacher account has: the tenant of a MANAGED session (the only kind an account signs in with). */
function teacherScope(accountId) {
  return tenantOf({ am: "managed", sub: accountId });
}

async function handler(request, deps = {}, obs = null) {
  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  if (String(request.method || "GET").toUpperCase() !== "GET") return reply(405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "الطلب غير مدعوم." });
  const { owner, container } = auth;

  const accountId = String(queryParam(request, "accountId")).trim();
  if (!isTeacherAccountId(accountId)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
  const classId = String(queryParam(request, "classId")).trim();
  const studentId = String(queryParam(request, "studentId")).trim();
  const fromMs = timestamp(queryParam(request, "from"));
  const toMs = timestamp(queryParam(request, "to"));
  const view = String(queryParam(request, "view")).trim();
  if (view && view !== "progress") return reply(400, { ok: false, code: "VIEW_INVALID", error: "طلب غير صالح." });
  const tenant = teacherScope(accountId);
  if (!tenant) return unavailable();                                                // never an unscoped (whole-platform) answer

  try {
    const account = await (deps.readTeacherAccount || readTeacherAccount)(container, accountId);
    if (!account) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
    let result;
    if (view === "progress") {
      if (classId && !/^[A-Za-z0-9_-]{1,64}$/.test(classId)) return reply(400, { ok: false, code: "CLASS_ID_INVALID", error: "معرّف الصف غير صالح." });
      result = await (deps.computeTeacherProgress || computeTeacherProgress)(container, { tenant, classId }, deps);
    } else {
      const compute = deps.computeTeacherAnalytics || computeTeacherAnalytics;
      result = await compute(container, { classId, studentId, fromMs, toMs, tenant, assignments: true, shows: () => true });
    }
    const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;
    await audit(container, {
      actor: "owner:" + owner.accountId, action: "owner.teacher.dashboard.viewed", targetType: "teacher-account", targetId: accountId,
      targetLabel: String(account.username || accountId),
      details: { scope: view === "progress" ? "progress" : studentId ? "student" : classId ? "class" : "global", ...(classId ? { classId } : {}), ...(fromMs || toMs ? { from: fromMs ? new Date(fromMs).toISOString() : "", to: toMs ? new Date(toMs).toISOString() : "" } : {}) }
    });
    return reply(200, {
      ok: true,
      teacher: { accountId, username: String(account.username || ""), displayName: String(account.displayName || account.username || ""), status: String(account.status || "") },
      ...result
    });
  } catch (e) {
    // a rejected scope (a class or student outside this teacher's space, or unknown) is answered like the teacher's own route
    if (e instanceof AnalyticsScopeError) return reply(e.httpStatus, { ok: false, code: "SCOPE_REFUSED", error: e.message });
    obs?.logError?.("owner.teacher.dashboard.error", e);
    return unavailable();
  }
}

app.http("ownerTeacherDashboard", { methods: ["GET"], authLevel: "anonymous", route: "owner-teacher-dashboard", handler: withObservability("owner-teacher-dashboard", handler) });
module.exports = { handler, teacherScope };
