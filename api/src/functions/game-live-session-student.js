const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry } = require("../lib/platform-storage");
const { gradeQuestion } = require("../lib/assignment-grading");
const {
  sessionDocName, normalizeJoinCode, studentView, applyJoin, applyReady, applyAnswer, isParticipant, SessionError,
} = require("../lib/live-challenge-session-store");

// Live Challenge — STUDENT live-session API (Phase 4A lobby + Phase 4B live answer). Every action requires an ACTIVE
// student session (requireActiveStudentSession — token + current user doc: not archived, active, session version
// matches). The student id is ALWAYS derived from that session, never from the request body.
//   POST /api/game-live-session-student/join    { joinCode }                       → join the room I was listed in
//   POST /api/game-live-session-student/get     { joinCode }                       → my SAFE state (poll target)
//   POST /api/game-live-session-student/ready   { joinCode, ready }                → set/clear my OWN ready flag
//   POST /api/game-live-session-student/answer  { joinCode, roundVersion, response } → my ONE authoritative answer
// Security: a student may act ONLY on a room whose server-defined participant list already contains them (403
// otherwise) — the join code never adds an arbitrary student. The response NEVER contains the challenge snapshot or
// any answer key (studentView is question-free/answer-key-free by construction; a test asserts no key strings leak).
// The SERVER is the only academic authority: the current question and the grade come from the freshest server
// document + the CENTRAL grader (assignment-grading `gradeQuestion`); a client-provided score/correct is never trusted.

const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "لم يتم العثور على غرفة بهذا الرمز." } };
const FORBIDDEN = { status: 403, jsonBody: { ok: false, error: "لست ضمن هذه الغرفة." } };
const NOT_JOINED = { status: 403, jsonBody: { ok: false, code: "not-joined", error: "عليك الانضمام إلى الغرفة أولاً." } };
const CLOSED = { status: 409, jsonBody: { ok: false, error: "تم إغلاق هذه الغرفة." } };

// Structural (NOT academic) bounds on a submitted response — protect the session blob from unreasonable payloads
// BEFORE any storage mutation. This never grades; it only accepts the canonical Answer shapes the student exam
// runtime uses. Real grading is the central grader's job.
const MAX_RESPONSE_BYTES = 20000;
const MAX_ARRAY = 500;
const MAX_FIELDS = 500;
const MAX_PARTS = 200;
const RESPONSE_KINDS = new Set(["choice", "sequence", "table", "text", "fields", "compound"]);
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);
function validateResponse(resp, depth = 0) {
  if (depth > 3 || !isPlainObject(resp)) return false;
  const kind = resp.kind;
  if (typeof kind !== "string" || !RESPONSE_KINDS.has(kind)) return false;
  switch (kind) {
    case "choice": return Number.isInteger(resp.index);
    case "text": return typeof resp.value === "string";
    case "sequence": return Array.isArray(resp.values) && resp.values.length <= MAX_ARRAY && resp.values.every(v => typeof v === "string");
    case "table": return Array.isArray(resp.values) && resp.values.length <= MAX_ARRAY && resp.values.every(v => typeof v === "string" || typeof v === "boolean");
    case "fields": {
      if (!isPlainObject(resp.values)) return false;
      const keys = Object.keys(resp.values);
      if (keys.length > MAX_FIELDS) return false;
      return keys.every(k => { const v = resp.values[k]; return typeof v === "string" || typeof v === "boolean" || (Array.isArray(v) && v.length <= MAX_ARRAY && v.every(x => typeof x === "string")); });
    }
    case "compound": {
      if (!isPlainObject(resp.parts)) return false;
      const keys = Object.keys(resp.parts);
      return keys.length <= MAX_PARTS && keys.every(k => validateResponse(resp.parts[k], depth + 1));
    }
    default: return false;
  }
}
/** True when a response is a structurally valid, size-bounded canonical answer. */
function isAcceptableResponse(resp) {
  let sized;
  try { sized = JSON.stringify(resp); } catch { return false; }
  if (typeof sized !== "string" || sized.length > MAX_RESPONSE_BYTES) return false;
  return validateResponse(resp);
}

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

/** Map a domain SessionError code → HTTP response (with a machine-readable `code` for the new round-engine cases). */
function fromSessionError(e) {
  if (!e) return null;
  switch (e.code) {
    case "forbidden": return FORBIDDEN;
    case "not-joined": return NOT_JOINED;
    case "closed": return CLOSED;
    case "not-found": return NOT_FOUND;
    case "not-active": return { status: 409, jsonBody: { ok: false, code: e.code, error: "التحدّي ليس في جولة نشطة." } };
    case "stale-round": return { status: 409, jsonBody: { ok: false, code: e.code, error: "انتقلت الجولة — حدّث الصفحة." } };
    default: return null;
  }
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
      // The ready endpoint requires a STRICT boolean — "false" / 1 / {} / null / missing are rejected as 400 BEFORE any
      // mutation (never coerced to true), so a malformed payload can never flip a participant's ready flag.
      let ready;
      if (action === "ready") {
        if (typeof (body && body.ready) !== "boolean") return BAD_REQUEST;
        ready = body.ready;
      }
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

    if (action === "answer") {
      // roundVersion is a concurrency token (NOT academic authority): the answer is graded against the SERVER's
      // freshest current question, and rejected as stale if the round moved on. questionIndex/score/correct in the
      // body are ignored entirely.
      const roundVersion = body && body.roundVersion;
      if (!Number.isInteger(roundVersion)) return { status: 400, jsonBody: { ok: false, code: "bad-round", error: "طلب غير صالح." } };
      const response = body && body.response;
      if (!isAcceptableResponse(response)) return BAD_REQUEST;      // structural bound BEFORE any mutation
      try {
        const updated = await mutate(container, name, current => {
          if (!current) throw new SessionError("not-found");
          if (!isParticipant(current, studentId)) throw new SessionError("forbidden");
          // applyAnswer validates status/round/joined on the freshest doc, resolves the canonical current question,
          // and grades it with the CENTRAL grader (gradeQuestion). A duplicate for this round throws already-answered
          // (carrying the session) so we return idempotent success below WITHOUT a second write.
          return applyAnswer(current, studentId, roundVersion, response, q => gradeQuestion(q, response), now);
        });
        return { status: 200, jsonBody: { ok: true, session: studentView(updated, studentId) } };
      } catch (e) {
        if (e instanceof SessionError && e.code === "already-answered") {
          // Idempotent: the authoritative answer for this round already exists (a retry / double-tap). Return the
          // accepted state; the second (possibly different) payload never overwrites the first and NO blob is written.
          const session = e.session || await dl(container, name);
          return { status: 200, jsonBody: { ok: true, session: studentView(session, studentId) } };
        }
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
