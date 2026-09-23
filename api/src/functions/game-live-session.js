const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, uploadJsonConditional, mutateJsonWithRetry, isConcurrencyConflict } = require("../lib/platform-storage");
const { challengeDocName, challengeFromDoc } = require("../lib/live-challenge-store");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isStudentClassMember } = require("../lib/class-membership");
const {
  sessionDocName, generateJoinCode, newSessionDoc, teacherView, applyClose, SessionError,
} = require("../lib/live-challenge-session-store");

// Live Challenge — TEACHER live-session API (Phase 4A: lobby only, no question/answer/score/leaderboard).
//   POST /api/game-live-session/create  { challengeId, classId, studentIds } → snapshot a saved challenge into a new
//                                        lobby with a random room code and the teacher's validated participant list
//   POST /api/game-live-session/get     { joinCode } → this teacher's lobby (poll target), answer-key-free
//   POST /api/game-live-session/close   { joinCode } → status → "closed" (idempotent; never deletes the blob)
// Teacher auth via requireBuilderAuth. Every read/mutation verifies session.teacherId === the authenticated teacher —
// a teacher can never reach another teacher's room by guessing its code (unknown / not-owned → 404, no existence leak).
// The challenge is SNAPSHOTTED server-side at create; later edits to the saved challenge never mutate a live session.

const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "لم يتم العثور على هذه الغرفة." } };
const MAX_PARTICIPANTS = 300;
const MAX_CODE_ATTEMPTS = 8;

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

/** De-duplicate + trim a list of ids (order preserved). */
function normalizeIds(raw) {
  const out = [], seen = new Set();
  for (const v of Array.isArray(raw) ? raw : []) {
    const id = String(v == null ? "" : v).trim();
    if (id && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Create the session blob under a random room code, protected against collision by create-only conditional writes
 *  (If-None-Match). A colliding code NEVER overwrites an existing session — a fresh code is generated and retried. */
async function createWithUniqueCode(container, buildDoc, up, gen = generateJoinCode) {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const joinCode = gen();
    const doc = buildDoc(joinCode);
    try {
      await up(container, sessionDocName(joinCode), doc, null);   // etag null → create-only (If-None-Match:*)
      return doc;
    } catch (e) {
      if (isConcurrencyConflict(e)) continue;                     // code already taken → try another
      throw e;
    }
  }
  const err = new Error("could not allocate a unique room code");
  err.code = "code-exhausted";
  throw err;
}

async function handleCreate(request, teacherId, container, deps, now) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const up = deps.uploadJsonConditional || uploadJsonConditional;
  const body = await readBody(request);
  const challengeId = String(body && body.challengeId || "").trim();
  const classId = String(body && body.classId || "").trim();
  if (!challengeId || !classId) return BAD_REQUEST;
  const studentIds = normalizeIds(body && body.studentIds);
  if (studentIds.length === 0) return { status: 400, jsonBody: { ok: false, error: "اختر طالبًا واحدًا على الأقل." } };
  if (studentIds.length > MAX_PARTICIPANTS) return { status: 400, jsonBody: { ok: false, error: "عدد الطلاب أكبر من الحد المسموح." } };

  // 1) The challenge must be THIS teacher's saved challenge (owned content, loaded server-side — the browser never
  //    supplies the snapshot as authority).
  const challenge = challengeFromDoc(await dl(container, challengeDocName(teacherId, challengeId)));
  if (!challenge) return { status: 404, jsonBody: { ok: false, error: "لم يتم العثور على التحدّي." } };

  // 2) The class must exist and be active (not archived).
  const classroom = await dl(container, "platform/classes/" + classId + ".json");
  if (!classroom || normalizeClassStatus(classroom) === "archived") {
    return { status: 400, jsonBody: { ok: false, error: "هذا الصف غير متاح." } };
  }

  // 3) Every selected student is validated against the AUTHORITATIVE user document (never classroom.studentIds). For a
  //    LIVE game a participant must be a member of exactly this class (role student, not archived) AND currently able
  //    to log in (active !== false, since the live student endpoint requires an active session). An invalid selection
  //    is an explicit 400 — never silently dropped.
  const participants = [];
  for (const studentId of studentIds) {
    const user = await dl(container, "platform/users/" + studentId + ".json");
    if (!isStudentClassMember(user, classId) || user.active === false) {
      return { status: 400, jsonBody: { ok: false, error: "أحد الطلاب المختارين غير صالح لهذه الغرفة." } };
    }
    participants.push({ studentId: String(user.userId || studentId), displayName: String(user.displayName || "") });
  }

  // 4) Snapshot the challenge server-side and create the lobby under a unique code.
  const doc = await createWithUniqueCode(container, joinCode => newSessionDoc({
    joinCode, teacherId, challengeId, challengeTitle: challenge.title, classId, participants, challengeSnapshot: challenge, now,
  }), up);
  return { status: 200, jsonBody: { ok: true, session: teacherView(doc) } };
}

async function loadOwned(container, dl, joinCode, teacherId) {
  const session = await dl(container, sessionDocName(joinCode));
  if (!session || String(session.teacherId || "") !== teacherId) return null;   // unknown OR not owned → indistinguishable
  return session;
}

async function handler(request, deps = {}, obs = null) {
  try {
    const sess = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!sess.ok) return sess.response;
    const teacherId = String(sess.user && sess.user.sub || "");
    if (!teacherId) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const container = deps.container || (deps.getContainer || getContainer)();
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    const now = new Date().toISOString();

    if (method === "POST" && action === "create") {
      return await handleCreate(request, teacherId, container, deps, now);
    }

    if (method === "POST" && action === "get") {
      const body = await readBody(request);
      const joinCode = String(body && body.joinCode || "").trim().toUpperCase();
      if (!joinCode) return BAD_REQUEST;
      const session = await loadOwned(container, dl, joinCode, teacherId);
      if (!session) return NOT_FOUND;
      return { status: 200, jsonBody: { ok: true, session: teacherView(session) } };
    }

    if (method === "POST" && action === "close") {
      const body = await readBody(request);
      const joinCode = String(body && body.joinCode || "").trim().toUpperCase();
      if (!joinCode) return BAD_REQUEST;
      // Ownership is enforced INSIDE the CAS callback on the freshest document (never on a stale read).
      let forbidden = false;
      const updated = await mutate(container, sessionDocName(joinCode), current => {
        if (!current || String(current.teacherId || "") !== teacherId) { forbidden = true; return current || {}; }
        return applyClose(current, now);
      });
      if (forbidden) return NOT_FOUND;
      return { status: 200, jsonBody: { ok: true, session: teacherView(updated) } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported live-session request." } };
  } catch (e) {
    if (e instanceof SessionError) return { status: 409, jsonBody: { ok: false, error: "تعذّر تنفيذ العملية على الغرفة." } };
    obs?.logError("game.live-session.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر تنفيذ العملية حاليًا." } };
  }
}

app.http("gameLiveSession", { methods: ["POST"], authLevel: "anonymous", route: "game-live-session/{action?}", handler: withObservability("game-live-session", handler) });

module.exports = { handler, createWithUniqueCode };
