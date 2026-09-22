const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { gameDocName, normalizeGameDoc, publicActive, startAttempt, applyAnswer, isPath, isLevel, INVALID_ANSWER_FORMAT } = require("../lib/number-conversion-store");
const { isValidBits } = require("../lib/number-conversion");

// Number Conversion Challenge API — the SERVER AUTHORITY for the Phase 2 solo game (FREE PLAY only). Routes:
//   GET  /api/game-number-conversion            → the caller's state: the active attempt (client-safe, NO answer key) + best record
//   POST /api/game-number-conversion/start      → { path, level, count? } start/replace a round (server snapshots the tasks)
//   POST /api/game-number-conversion/answer      → { taskId, bits[8], answer } the server grades the TEXT answer, applies the hint/reveal policy
//   POST /api/game-number-conversion/restart     → alias of start (a fresh round)
// The browser only ever receives the source display + direction; it submits its working bits + typed final answer and
// the server grades the answer here. Any client-sent correctness / score / best is ignored. No Strength, no medals, no teacher assignment — solo.
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const MAX_ANSWER_LENGTH = 32;
/** Thrown inside the mutate callback to skip the write when an answer changes nothing. */
class NoChange extends Error {}

function stateBody(doc) {
  const n = normalizeGameDoc(doc);
  return { ok: true, active: publicActive(n.active), best: n.best };
}

async function handler(request, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  try {
    const sess = await (deps.requireActiveStudentSession || requireActiveStudentSession)(request, deps);
    if (!sess.ok) return sess.response;
    const studentId = String(sess.student && sess.student.userId || "");
    if (!studentId) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const container = sess.container;
    const name = gameDocName(studentId);
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    const now = new Date().toISOString();

    // ── state ──
    if (method === "GET" && !action) {
      const doc = await dl(container, name);
      return { status: 200, jsonBody: stateBody(doc) };
    }

    if (method === "POST" && (action === "start" || action === "restart")) {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      if (!body || typeof body !== "object") return BAD_REQUEST;
      // A supplied path/level MUST be valid — an explicitly invalid value is a 400, never a silent fallback.
      if (body.path != null && !isPath(body.path)) return BAD_REQUEST;
      if (body.level != null && !isLevel(body.level)) return BAD_REQUEST;
      const path = isPath(body.path) ? String(body.path) : "mixed";
      const level = isLevel(body.level) ? String(body.level) : "guided";
      const attemptId = crypto.randomUUID();
      let finalDoc = null;
      try {
        await mut(container, name, current => {
          finalDoc = startAttempt(current, { path, level, seed: attemptId, attemptId, now });
          return finalDoc;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
      return { status: 200, jsonBody: stateBody(finalDoc) };
    }

    if (method === "POST" && action === "answer") {
      let body = {};
      try { body = await request.json(); } catch { body = {}; }
      // STRICT contract: taskId string, bits = exactly eight 0/1 numbers (the student's WORKING board, used for hints),
      // answer = the typed FINAL answer string (the grading authority). A malformed payload is rejected BEFORE any
      // mutation. Any client-sent "correct"/"score"/"best" is ignored (server is the authority).
      if (!body || typeof body !== "object" || typeof body.taskId !== "string" || !isValidBits(body.bits)
        || typeof body.answer !== "string" || body.answer.length > MAX_ANSWER_LENGTH) return BAD_REQUEST;
      let outcome = null;
      try {
        await mut(container, name, current => {
          const res = applyAnswer(current, { taskId: body.taskId, bits: body.bits, answer: body.answer, now });
          outcome = res.response;
          // Nothing to record (format error, stale task, no attempt) → abort the write entirely: attempt state and the
          // stored document stay byte-for-byte as they were.
          if (!res.changed) throw new NoChange();
          return res.doc;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        if (!(e instanceof NoChange)) throw e;
      }
      // A malformed final answer is a FORMAT error, not a conflict: 422 so the client keeps its task/board/answer and
      // shows the message — it must not resync.
      if (outcome && outcome.error === INVALID_ANSWER_FORMAT) return { status: 422, jsonBody: { ...outcome } };
      if (!outcome || outcome.ok === false) {
        // no active attempt / stale-or-completed task → 409 so the client resyncs from GET state
        return { status: 409, jsonBody: { ...(outcome || { ok: false, error: "conflict" }) } };
      }
      return { status: 200, jsonBody: outcome };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported number-conversion request." } };
  } catch (e) {
    obs?.logError("game.number-conversion.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر تشغيل اللعبة حاليًا." } };
  }
}

app.http("gameNumberConversion", { methods: ["GET", "POST"], authLevel: "anonymous", route: "game-number-conversion/{action?}", handler: withObservability("game-number-conversion", handler) });

module.exports = { handler };
