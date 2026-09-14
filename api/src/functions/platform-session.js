const { app } = require("@azure/functions");
const { verifyBuilderToken } = require("../lib/builder-auth");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");

// Roadmap #8 §12 — authoritative session introspection used by the frontend on startup/reload to validate
// a stored session before rendering an authenticated app. Never returns secrets/hashes. Always no-store.
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const UNAUTH = { status: 401, headers: NO_STORE, jsonBody: { ok: false, error: "Unauthorized" } };

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

async function handler(request, deps = {}) {
  const verifyBuilder = deps.verifyBuilderToken || verifyBuilderToken;
  const requireStudent = deps.requireActiveStudentSession || requireActiveStudentSession;
  const studentDeps = { getContainer: deps.getContainer || getContainer, downloadJsonOrNull: deps.downloadJsonOrNull || downloadJsonOrNull, container: deps.container };

  const teacherResult = payload => ({ status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "teacher", displayName: "المعلم", expiresAt: isoFromExp(payload.exp) } });
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
      return payload ? teacherResult(payload) : UNAUTH;
    }
    if (studentHeader) {
      const sess = await requireStudent(request, studentDeps);
      return sess.ok ? studentResult(sess) : UNAUTH;
    }
    if (authBearer) {
      const teacher = verifyBuilder(authBearer);
      if (teacher) return teacherResult(teacher);
      const sess = await requireStudent(request, studentDeps);
      if (sess.ok) return studentResult(sess);
    }
    return UNAUTH;
  } catch {
    return UNAUTH;
  }
}

app.http("platformSession", { methods: ["GET"], authLevel: "anonymous", route: "platform-session", handler });
module.exports = { handler };
