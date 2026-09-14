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

  try {
    const builderHeader = readHeader(request, "x-builder-token");
    const studentHeader = readHeader(request, "x-student-token") || readHeader(request, "x-platform-token");
    const authBearer = bearer(request);

    // Teacher path: explicit builder header, or a Bearer token that verifies as a teacher.
    if (builderHeader || (authBearer && !studentHeader)) {
      const payload = verifyBuilder(builderHeader || authBearer);
      if (payload) {
        return { status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "teacher", displayName: "المعلم", expiresAt: isoFromExp(payload.exp) } };
      }
      // Not a valid teacher token — if there is no student header either, fail; otherwise fall through.
      if (!studentHeader) return UNAUTH;
    }

    // Student path: hardened, server-authoritative (active/archived/authVersion checked; current doc wins).
    if (studentHeader || authBearer) {
      const sess = await requireStudent(request, studentDeps);
      if (sess.ok) {
        return {
          status: 200,
          headers: NO_STORE,
          jsonBody: {
            ok: true,
            role: "student",
            displayName: String(sess.student.displayName || ""),
            userCode: String(sess.student.code || ""),
            classId: String(sess.student.classId || ""),
            expiresAt: isoFromExp(sess.user.exp)
          }
        };
      }
    }

    return UNAUTH;
  } catch {
    return UNAUTH;
  }
}

app.http("platformSession", { methods: ["GET"], authLevel: "anonymous", route: "platform-session", handler });
module.exports = { handler };
