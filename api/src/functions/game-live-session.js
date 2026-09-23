const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, uploadJsonConditional, mutateJsonWithRetry, isConcurrencyConflict } = require("../lib/platform-storage");
const { challengeDocName, challengeFromDoc } = require("../lib/live-challenge-store");
const { normalizeClassStatus } = require("../lib/class-lifecycle");
const { isStudentClassMember } = require("../lib/class-membership");
const {
  sessionDocName, generateJoinCode, newSessionDoc, teacherView,
  applyClose, applyStart, applyNext, applyFinish, SessionError,
} = require("../lib/live-challenge-session-store");
// Phase 4D — persistent Top-3 recognition medals, recorded ONLY after a successful finish CAS (best-effort/secondary).
const { recordLiveChallengePodiumMedals } = require("../lib/live-challenge-recognition");

// Live Challenge — TEACHER live-session API (Phase 4A lobby + Phase 4B live round engine).
//   POST /api/game-live-session/create  { challengeId, classId, studentIds } → snapshot a saved challenge into a new
//                                        lobby with a random room code and the teacher's validated participant list
//   POST /api/game-live-session/get     { joinCode } → this teacher's runtime view (poll target), answer-key-free
//   POST /api/game-live-session/start   { joinCode } → lobby → active, first question live (roundVersion 1)
//   POST /api/game-live-session/next    { joinCode, roundVersion } → advance to the next question (concurrency-guarded)
//   POST /api/game-live-session/finish  { joinCode, roundVersion } → active → finished (only on the last question)
//   POST /api/game-live-session/close   { joinCode } → status → "closed" (idempotent; never deletes the blob)
// Teacher auth via requireBuilderAuth. Every read/mutation verifies session.teacherId === the authenticated teacher —
// a teacher can never reach another teacher's room by guessing its code (unknown / not-owned → 404, no existence leak).
// The challenge is SNAPSHOTTED server-side at create; later edits to the saved challenge never mutate a live session.
// Every state-changing action runs INSIDE mutateJsonWithRetry on the freshest document (ownership + status + round
// checks are all in the CAS callback), so a stale teacher tab can never double-advance or act on a foreign room.

const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const NOT_FOUND = { status: 404, jsonBody: { ok: false, error: "لم يتم العثور على هذه الغرفة." } };
const MAX_PARTICIPANTS = 300;
const MAX_CODE_ATTEMPTS = 8;

/** Thrown INSIDE an owner-gated CAS callback for an unknown or foreign room. mutateJsonWithRetry propagates a
 *  non-concurrency throw immediately WITHOUT writing, so the read-modify-write aborts with ZERO blob write: a
 *  nonexistent room is never materialized as an empty placeholder blob, and another teacher's room is never
 *  rewritten (byte-identical or not). The handler maps it to 404 — no existence leak between "unknown" and "not yours". */
class OwnedRoomAbort extends Error {
  constructor() { super("owned-room-abort"); this.name = "OwnedRoomAbort"; }
}

/** Map a domain SessionError (thrown by a store transition) → teacher HTTP response with a machine-readable `code`.
 *  Returns null for a non-SessionError so the caller can rethrow (→ 500). */
function fromTeacherSessionError(e) {
  if (!(e instanceof SessionError)) return null;
  const conflict = msg => ({ status: 409, jsonBody: { ok: false, code: e.code, error: msg } });
  switch (e.code) {
    case "empty-challenge": return { status: 400, jsonBody: { ok: false, code: e.code, error: "لا يحتوي التحدّي على أسئلة." } };
    case "no-participants": return { status: 400, jsonBody: { ok: false, code: e.code, error: "لا يوجد طلاب منضمّون لبدء التحدّي." } };
    case "not-lobby": return conflict("لا يمكن بدء هذه الغرفة في حالتها الحالية.");
    case "not-active": return conflict("التحدّي ليس في جولة نشطة.");
    case "stale-round": return conflict("انتقلت الجولة — حدّث الصفحة.");
    case "no-more-questions": return conflict("لا مزيد من الأسئلة.");
    case "not-last-question": return conflict("يجب الوصول إلى السؤال الأخير قبل الإنهاء.");
    default: return conflict("تعذّر تنفيذ العملية على الغرفة.");
  }
}

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

/** Run an owner-gated CAS mutation on the freshest document: ownership is enforced INSIDE the callback (unknown/foreign
 *  → OwnedRoomAbort → ZERO write → 404), and `apply(current)` is a store transition that may throw a domain
 *  SessionError (also ZERO write, mapped to a 4xx). */
async function mutateOwned(mutate, container, joinCode, teacherId, apply) {
  return await mutate(container, sessionDocName(joinCode), current => {
    if (!current || String(current.teacherId || "") !== teacherId) throw new OwnedRoomAbort();
    return apply(current);
  });
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
      // Phase 4D RECONCILIATION: for an OWNED FINISHED room, (re)record the Top-3 recognition medals best-effort here.
      // Because the medal ids are deterministic and the writes are create-only, this heals medals that failed to persist
      // at finish time (partial or full) WITHOUT ever duplicating an existing one — teacher recovery, post-finish polling
      // and reopen all become automatic reconciliation paths (no manual "repair" action, no second finish CAS). It is
      // owner-gated (loadOwned already returned 404 for an unknown/foreign room, so a foreign teacher never triggers it),
      // runs ONLY for status "finished" (never lobby/active/closed), and is fully SECONDARY: a failure is logged and
      // swallowed, GET still returns 200 with the finished session, and NO gameplay state is mutated (medals are a
      // separate feed write; the session document is untouched).
      if (session.status === "finished") {
        const record = deps.recordLiveChallengePodiumMedals || recordLiveChallengePodiumMedals;
        try { await record(container, session, deps); } catch (e) { obs?.logError("game.live-session.recognition", e); }
      }
      return { status: 200, jsonBody: { ok: true, session: teacherView(session) } };
    }

    // ── Phase 4B teacher round controls (start / next / finish) ──
    // Each is an owner-gated CAS mutation on the freshest document. Ownership abort → 404 (zero write); a domain
    // SessionError → the mapped 4xx (zero write). next/finish require a matching roundVersion so a stale tab can't
    // double-advance or finish the wrong round.
    if (method === "POST" && (action === "start" || action === "next" || action === "finish")) {
      const body = await readBody(request);
      const joinCode = String(body && body.joinCode || "").trim().toUpperCase();
      if (!joinCode) return BAD_REQUEST;
      let roundVersion;
      if (action !== "start") {
        roundVersion = body && body.roundVersion;
        if (!Number.isInteger(roundVersion)) return { status: 400, jsonBody: { ok: false, code: "bad-round", error: "طلب غير صالح." } };
      }
      try {
        const updated = await mutateOwned(mutate, container, joinCode, teacherId, current =>
          action === "start" ? applyStart(current, now)
            : action === "next" ? applyNext(current, roundVersion, now)
              : applyFinish(current, roundVersion, now));
        // Phase 4D: ONLY after the finish CAS actually succeeds and the session is authoritatively finished, persist the
        // Top-3 podium recognition medals. Recognition is SECONDARY and best-effort — an error here (including an
        // injected recorder failure) is logged and swallowed so a successful finish never becomes an HTTP failure and
        // the finished session is never rolled back. A stale/foreign/non-last/failed finish never reaches this point.
        if (action === "finish" && updated && updated.status === "finished") {
          const record = deps.recordLiveChallengePodiumMedals || recordLiveChallengePodiumMedals;
          try { await record(container, updated, deps); } catch (e) { obs?.logError("game.live-session.recognition", e); }
        }
        return { status: 200, jsonBody: { ok: true, session: teacherView(updated) } };
      } catch (e) {
        if (e instanceof OwnedRoomAbort) return NOT_FOUND;
        const mapped = fromTeacherSessionError(e);
        if (mapped) return mapped;
        throw e;
      }
    }

    if (method === "POST" && action === "close") {
      const body = await readBody(request);
      const joinCode = String(body && body.joinCode || "").trim().toUpperCase();
      if (!joinCode) return BAD_REQUEST;
      // Ownership is enforced INSIDE the CAS callback on the freshest document (never on a stale read). An unknown or
      // foreign room throws OwnedRoomAbort so NO write occurs: mutateJsonWithRetry never creates a placeholder `{}` blob
      // for a nonexistent room and never rewrites another teacher's room. Both map to 404 (no existence leak).
      try {
        const updated = await mutateOwned(mutate, container, joinCode, teacherId, current => applyClose(current, now));
        return { status: 200, jsonBody: { ok: true, session: teacherView(updated) } };
      } catch (e) {
        if (e instanceof OwnedRoomAbort) return NOT_FOUND;
        throw e;
      }
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
