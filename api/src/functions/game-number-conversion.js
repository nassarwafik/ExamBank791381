const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireActiveStudentSession } = require("../lib/student-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry, StorageConflictError } = require("../lib/platform-storage");
const { gameDocName, normalizeGameDoc, publicActive, startAttempt, applyAnswer, isPath, isLevel } = require("../lib/number-conversion-store");

// Number Conversion Challenge API — the SERVER AUTHORITY for the Phase 2 solo game (FREE PLAY only). Routes:
//   GET  /api/game-number-conversion            → the caller's state: the active attempt (client-safe, NO answer key) + best record
//   POST /api/game-number-conversion/start      → { path, level, count? } start/replace a round (server snapshots the tasks)
//   POST /api/game-number-conversion/answer      → { taskId, bits[8] } the server grades, applies the hint/reveal policy, advances
//   POST /api/game-number-conversion/restart     → alias of start (a fresh round)
// The browser only ever receives the source display + direction; it submits its eight bits and the server grades
// here. Any client-sent correctness / score / best is ignored. No Strength, no medals, no teacher assignment — solo.
const CONFLICT_MESSAGE = "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى.";
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };

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
      if (!body || typeof body !== "object" || typeof body.taskId !== "string" || !Array.isArray(body.bits)) return BAD_REQUEST;
      // Only the eight bits are read; any client-sent "correct"/"score"/"best" is ignored.
      const bits = body.bits.map(b => (b === 1 || b === true ? 1 : 0));
      let outcome = null;
      try {
        await mut(container, name, current => {
          const res = applyAnswer(current, { taskId: body.taskId, bits, now });
          outcome = res.response;
          return res.doc;
        });
      } catch (e) {
        if (e instanceof StorageConflictError) return { status: 503, jsonBody: { ok: false, error: CONFLICT_MESSAGE } };
        throw e;
      }
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
