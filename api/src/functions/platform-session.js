const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { resolveTeacherDisplayName, resolveManagedTeacherDisplayName } = require("../lib/teacher-profile");
const { verifyBuilderToken } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { requireTeacherSession, sharedPasswordSession } = require("../lib/teacher-session");
const { ownerExists } = require("../lib/identity/owner-presence");

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
  const teacherResult = async payload => {
    const containerOf = () => studentDeps.container || studentDeps.getContainer();
    const displayName = payload.am === "managed"
      ? await resolveManagedTeacherDisplayName(containerOf, payload.sub, payload.displayName, studentDeps)   // P2-A2: own profile, else the account's name
      : await resolveTeacherDisplayName(containerOf, payload.sub, studentDeps);
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "teacher", displayName, expiresAt: isoFromExp(payload.exp) } };
  };
  const studentResult = sess => ({
    status: 200, headers: NO_STORE,
    jsonBody: { ok: true, role: "student", displayName: String(sess.student.displayName || ""), userCode: String(sess.student.code || ""), classId: String(sess.student.classId || ""), expiresAt: isoFromExp(sess.user.exp) }
  });

  // Tadris+ P2-A2 — a MANAGED teacher session (token v3) is valid only while its stored account is active and the session was
  // not ended: the same per-request check every teacher route uses. 401 = definitively ended; 503 = could not check (kept).
  const managedTeacher = async () => {
    const r = await requireTeacherSession(request, { requireBuilderAuth: () => ({ ok: false }), getContainer: studentDeps.getContainer, container: studentDeps.container, now: deps.now });
    if (r.ok) return { ok: true, response: await teacherResult(r.user) };
    return { ok: false, unavailable: r.response && r.response.status === 503 };
  };

  // Tadris+ P2-B (D6) — a shared-password session is valid only while no platform owner exists (lib/teacher-session.js): once the
  // owner exists the probe answers 401 so the app clears that session; the owner's existence unreadable → 503 (kept, retried).
  const sharedPasswordGate = async payload => {
    if (!sharedPasswordSession(payload)) return "open";
    try { return (await ownerExists(() => studentDeps.container || studentDeps.getContainer(), { downloadJsonOrNull: studentDeps.downloadJsonOrNull })) ? "closed" : "open"; } catch { return "unknown"; }
  };
  const teacherOrClosed = async payload => {
    const gate = await sharedPasswordGate(payload);
    if (gate === "unknown") return SERVER_UNAVAILABLE;
    if (gate === "closed") { obs?.logWarn("auth.session.rejected", { reason: "shared_password_closed" }); return UNAUTH; }
    return teacherResult(payload);
  };

  try {
    const builderHeader = readHeader(request, "x-builder-token");
    const studentHeader = readHeader(request, "x-student-token") || readHeader(request, "x-platform-token");
    const authBearer = bearer(request);

    // PR#67 review §5 — an EXPLICIT role header is honored for that role ONLY (no cross-role fallthrough).
    // A Bearer-only token (used by the frontend boot probe for role recovery) tries teacher, then hardened
    // student, before returning 401.
    if (builderHeader) {
      const payload = verifyBuilder(builderHeader);
      if (payload) return await teacherOrClosed(payload);
      const m = await managedTeacher();
      if (m.ok) return m.response;
      if (m.unavailable) return SERVER_UNAVAILABLE;
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
      if (teacher) return await teacherOrClosed(teacher);
      const m = await managedTeacher();
      if (m.ok) return m.response;
      if (m.unavailable) return SERVER_UNAVAILABLE;
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
