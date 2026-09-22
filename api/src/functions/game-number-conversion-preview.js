const { app } = require("@azure/functions");
const crypto = require("crypto");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { publicActive, startAttempt, applyAnswer, isPath, isLevel, INVALID_ANSWER_FORMAT } = require("../lib/number-conversion-store");
const { isValidBits } = require("../lib/number-conversion");
const { defaultPreviewKey, sealPreview, openPreview, MAX_CONTINUATION_LENGTH } = require("../lib/number-conversion-preview");

// Number Conversion Challenge — TEACHER PREVIEW API (teacher/builder auth; STATELESS and NON-persistent). Routes:
//   POST /api/game-number-conversion-preview/start    → { path, level } a fresh server-seeded round (client-safe state + sealed continuation)
//   POST /api/game-number-conversion-preview/restart  → alias of start (a fresh round)
//   POST /api/game-number-conversion-preview/answer   → { taskId, bits[8], answer, continuation } graded by the SAME store rules
// It runs the exact student engine (startAttempt / applyAnswer / publicActive) on a round rebuilt from the sealed
// continuation, so hints, reveals, format errors and results behave identically — but it has NO storage dependency:
// no student document, no best record, no result/audit blob, no Strength, no medals. Never a student session.
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };
const UNAVAILABLE = { status: 503, jsonBody: { ok: false, error: "معاينة اللعبة غير متاحة حاليًا." } };
const MAX_ANSWER_LENGTH = 32;

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

async function handler(request, deps = {}, obs = null) {
  try {
    const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!auth.ok) return auth.response;
    const sub = String(auth.user && auth.user.sub || "");
    if (!sub) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    const key = deps.previewKey || defaultPreviewKey();
    if (!key) return UNAVAILABLE;
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    const now = new Date().toISOString();

    if (method === "POST" && (action === "start" || action === "restart")) {
      const body = await readBody(request);
      if (!body || typeof body !== "object") return BAD_REQUEST;
      if (body.path != null && !isPath(body.path)) return BAD_REQUEST;
      if (body.level != null && !isLevel(body.level)) return BAD_REQUEST;
      const path = isPath(body.path) ? String(body.path) : "mixed";
      const level = isLevel(body.level) ? String(body.level) : "guided";
      // A FRESH server seed for every deliberate start/retry (the attempt id is separate, so the seed never leaves the server).
      const doc = startAttempt(null, { path, level, seed: crypto.randomUUID(), attemptId: crypto.randomUUID(), now });
      return { status: 200, jsonBody: { ok: true, active: publicActive(doc.active), best: null, continuation: sealPreview(doc.active, { sub, key }) } };
    }

    if (method === "POST" && action === "answer") {
      const body = await readBody(request);
      if (!body || typeof body !== "object" || typeof body.taskId !== "string" || !isValidBits(body.bits)
        || typeof body.answer !== "string" || body.answer.length > MAX_ANSWER_LENGTH) return BAD_REQUEST;
      if (body.continuation != null && (typeof body.continuation !== "string" || body.continuation.length > MAX_CONTINUATION_LENGTH)) return BAD_REQUEST;
      const opened = body.continuation ? openPreview(body.continuation, { sub, key, now }) : { ok: false };
      // No / expired / foreign / tampered continuation → there is no preview round to answer (the client returns home).
      if (!opened.ok) return { status: 409, jsonBody: { ok: false, error: "no-active-attempt" } };
      const res = applyAnswer(opened.doc, { taskId: body.taskId, bits: body.bits, answer: body.answer, now });
      const outcome = res.response;
      // Format error: nothing changed → no new continuation (the client keeps its current one, its board and its text).
      if (outcome.error === INVALID_ANSWER_FORMAT) return { status: 422, jsonBody: outcome };
      if (outcome.ok === false) return { status: 409, jsonBody: outcome };
      const active = res.doc.active;
      // `best: null` — the store's in-memory best-record merge is discarded: a preview never has a best record.
      return { status: 200, jsonBody: { ...outcome, best: null, continuation: active ? sealPreview(active, { sub, key }) : null } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported number-conversion preview request." } };
  } catch (e) {
    obs?.logError("game.number-conversion-preview.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر تشغيل معاينة اللعبة حاليًا." } };
  }
}

app.http("gameNumberConversionPreview", { methods: ["POST"], authLevel: "anonymous", route: "game-number-conversion-preview/{action?}", handler: withObservability("game-number-conversion-preview", handler) });

module.exports = { handler };
