const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { resolveTeacherDisplayName } = require("../lib/teacher-profile");
const { verifyBuilderToken } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");

// Roadmap #8 §12 — authoritative session introspection used by the frontend on startup/reload to validate
// a stored session before rendering an authenticated app. Never returns secrets/hashes. Always no-store.
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const UNAUTH = { status: 401, headers: NO_STORE, jsonBody: { ok: false, error: "Unauthorized" } };
// A 401 is a CONTRACT statement: "this session is definitively invalid — clear it." An internal/transient failure
// (storage outage, dependency exception, teacher-profile lookup throwing) is NOT a revocation and must never be
// reported as one, or a valid session gets destroyed by a passing gateway blip. Those return 503 with a generic
// body only — never the underlying error — so the frontend keeps the token and retries instead of logging out.
const SERVER_UNAVAILABLE = { status: 503, headers: NO_STORE, jsonBody: { ok: false, error: "Service Unavailable" } };

function isoFromExp(exp) {
  return Number.isInteger(exp) ? new Date(exp * 1000).toISOString() : "";
}

function readHeader(request, name) {
  try { return String(request.headers.get(name) || "").trim(); } catch { return ""; }
}
function bearer(request) {
  const h = readHeader(request, "authorization");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function handler(request, deps = {}, obs = null) {
  const verifyBuilder = deps.verifyBuilderToken || verifyBuilderToken;
  const requireStudent = deps.requireActiveStudentSession || requireActiveStudentSession;
  const studentDeps = { getContainer: deps.getContainer || getContainer, downloadJsonOrNull: deps.downloadJsonOrNull || downloadJsonOrNull, container: deps.container };

  // Teacher display name: the self-profile document (platform/teacher-profiles/<sub>.json) → configured fallback → "المعلم".
  const teacherResult = async payload => ({ status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "teacher", displayName: await resolveTeacherDisplayName(() => studentDeps.container || studentDeps.getContainer(), payload.sub, studentDeps), expiresAt: isoFromExp(payload.exp) } });
  const studentResult = sess => ({
    status: 200, headers: NO_STORE,
    jsonBody: { ok: true, role: "student", displayName: String(sess.student.displayName || ""), userCode: String(sess.student.code || ""), classId: String(sess.student.classId || ""), expiresAt: isoFromExp(sess.user.exp) }
  });

  try {
    const builderHeader = readHeader(request, "x-builder-token");
    const studentHeader = readHeader(request, "x-student-token") || readHeader(request, "x-platform-token");
    const authBearer = bearer(request);

    // PR#67 review §5 — an EXPLICIT role header is honored for that role ONLY (no cross-role fallthrough).
    // A Bearer-only token (used by the frontend boot probe for role recovery) tries teacher, then hardened
    // student, before returning 401.
    if (builderHeader) {
      const payload = verifyBuilder(builderHeader);
      if (payload) return await teacherResult(payload);
      obs?.logWarn("auth.session.rejected", { reason: "invalid_teacher_token" });
      return UNAUTH;
    }
    if (studentHeader) {
      const sess = await requireStudent(request, studentDeps);
      if (sess.ok) return studentResult(sess);
      obs?.logWarn("auth.session.rejected", { reason: "invalid_student_session" });
      return UNAUTH;
    }
    if (authBearer) {
      const teacher = verifyBuilder(authBearer);
      if (teacher) return await teacherResult(teacher);
      const sess = await requireStudent(request, studentDeps);
      if (sess.ok) return studentResult(sess);
    }
    obs?.logWarn("auth.session.rejected", { reason: "no_valid_credentials" });
    return UNAUTH;
  } catch (e) {
    // An UNEXPECTED failure reached here (storage/dependency exception, teacher-profile lookup throwing, etc.).
    // The clean auth negatives above all RETURN 401 explicitly and never throw — so an exception here is internal,
    // NOT a revocation. Report 503 (transient/unavailable) so the frontend preserves the session and retries.
    obs?.logError("auth.session.error", e);
    return SERVER_UNAVAILABLE;
  }
}

app.http("platformSession", { methods: ["GET"], authLevel: "anonymous", route: "platform-session", handler: withObservability("platform-session", handler) });
module.exports = { handler };
