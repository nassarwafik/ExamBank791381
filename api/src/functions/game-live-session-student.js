const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry } = require("../lib/platform-storage");
const {
  sessionDocName, normalizeJoinCode, studentView, applyJoin, applyReady, isParticipant, SessionError,
} = require("../lib/live-challenge-session-store");

// Live Challenge — STUDENT live-session API (Phase 4A: lobby only). Every action requires an ACTIVE student session
// (requireActiveStudentSession — token + current user doc: not archived, active, session version matches). The
// student id is ALWAYS derived from that session, never from the request body.
//   POST /api/game-live-session-student/join   { joinCode }          → join the room the teacher listed me in
//   POST /api/game-live-session-student/get    { joinCode }          → my SAFE lobby state (poll target)
//   POST /api/game-live-session-student/ready  { joinCode, ready }   → set/clear my OWN ready flag
// Security: a student may act ONLY on a room whose server-defined participant list already contains them (403
// otherwise) — the join code never adds an arbitrary student. The response NEVER contains the challenge snapshot or
// any answer key (studentView is question-free by construction; a test asserts no key strings leak).

const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "لم يتم العثور على غرفة بهذا الرمز." } };
const FORBIDDEN = { status: 403, jsonBody: { ok: false, error: "لست ضمن هذه الغرفة." } };
const CLOSED = { status: 409, jsonBody: { ok: false, error: "تم إغلاق هذه الغرفة." } };

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

/** Map a domain SessionError code → HTTP response. */
function fromSessionError(e) {
  if (e && e.code === "forbidden") return FORBIDDEN;
  if (e && e.code === "closed") return CLOSED;
  if (e && e.code === "not-found") return NOT_FOUND;
  return null;
}

async function handler(request, deps = {}, obs = null) {
  try {
    const auth = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!auth.ok) return auth.response;
    const studentId = String(auth.student && auth.student.userId || auth.user.sub || "");
    // Reuse the container the auth check already resolved (no duplicate getContainer).
    const container = deps.container || auth.container || (deps.getContainer || getContainer)();
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "POST").toUpperCase();
    const now = new Date().toISOString();
    if (method !== "POST") return { status: 405, jsonBody: { ok: false, error: "Unsupported live-session request." } };

    const body = await readBody(request);
    const joinCode = normalizeJoinCode(body && body.joinCode);
    if (!joinCode) return BAD_REQUEST;
    const name = sessionDocName(joinCode);

    if (action === "get") {
      const session = await dl(container, name);
      if (!session) return NOT_FOUND;
      if (!isParticipant(session, studentId)) return FORBIDDEN;    // never confirm room contents to a non-member
      return { status: 200, jsonBody: { ok: true, session: studentView(session, studentId) } };
    }

    if (action === "join" || action === "ready") {
      const ready = action === "ready" ? body.ready !== false : undefined;   // ready endpoint: default true, explicit false clears
      try {
        const updated = await mutate(container, name, current => {
          if (!current) throw new SessionError("not-found");
          // A non-participant is forbidden regardless of the action (the code alone never grants access).
          if (!isParticipant(current, studentId)) throw new SessionError("forbidden");
          return action === "join" ? applyJoin(current, studentId, now) : applyReady(current, studentId, ready, now);
        });
        return { status: 200, jsonBody: { ok: true, session: studentView(updated, studentId) } };
      } catch (e) {
        const mapped = fromSessionError(e);
        if (mapped) return mapped;
        throw e;
      }
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported live-session request." } };
  } catch (e) {
    obs?.logError("game.live-session-student.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر تنفيذ العملية حاليًا." } };
  }
}

app.http("gameLiveSessionStudent", { methods: ["POST"], authLevel: "anonymous", route: "game-live-session-student/{action?}", handler: withObservability("game-live-session-student", handler) });

module.exports = { handler };
