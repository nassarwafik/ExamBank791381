const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, uploadJson, listJson, deleteBlob } = require("../lib/platform-storage");
const { teacherPrefix, challengeDocName, summaryOf, validateChallengeInput, storedDoc, challengeFromDoc } = require("../lib/live-challenge-store");

// Live Challenge Generator API — the TEACHER-side authority for Phase 3B (challenge AUTHORING only, no live session).
//   GET  /api/game-live-challenge                 → this teacher's saved-challenge summaries (no question content)
//   POST /api/game-live-challenge/get             → { challengeId } load one full challenge definition (404 if absent)
//   POST /api/game-live-challenge/save            → { challenge } create/replace a challenge definition (server validates shape)
//   POST /api/game-live-challenge/delete          → { challengeId } remove a challenge
// Teacher auth via requireBuilderAuth (x-builder-token / Bearer). Challenges are teacher-owned content (they include
// answer keys) and are only ever returned under teacher auth — there is no student endpoint here, so the student
// preview (client-side, answer-stripped) remains the only student-facing path. No participant/session/multiplayer.
const BAD_REQUEST = { status: 400, jsonBody: { ok: false, error: "طلب غير صالح." } };

async function readBody(request) { try { return await request.json(); } catch { return {}; } }

async function handler(request, deps = {}, obs = null) {
  try {
    const sess = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!sess.ok) return sess.response;
    const teacherId = String(sess.user && sess.user.sub || "");
    if (!teacherId) return { status: 401, jsonBody: { ok: false, error: "Unauthorized" } };
    // Resolve storage only after auth (an unauthenticated caller never touches the container).
    const container = deps.container || (deps.getContainer || getContainer)();
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    const up = deps.uploadJson || uploadJson;
    const list = deps.listJson || listJson;
    const del = deps.deleteBlob || deleteBlob;
    const action = String(request.params?.action || "").trim().toLowerCase();
    const method = String(request.method || "GET").toUpperCase();
    const now = new Date().toISOString();

    if (method === "GET" && !action) {
      const docs = await list(container, teacherPrefix(teacherId));
      const challenges = docs.map(challengeFromDoc).filter(Boolean).map(summaryOf)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      return { status: 200, jsonBody: { ok: true, challenges } };
    }

    if (method === "POST" && action === "get") {
      const body = await readBody(request);
      if (!body || typeof body.challengeId !== "string" || !body.challengeId.trim()) return BAD_REQUEST;
      const doc = await dl(container, challengeDocName(teacherId, body.challengeId));
      const def = challengeFromDoc(doc);
      if (!def) return { status: 404, jsonBody: { ok: false, error: "not-found" } };
      return { status: 200, jsonBody: { ok: true, challenge: def } };
    }

    if (method === "POST" && (action === "save" || action === "restart")) {
      const body = await readBody(request);
      const v = validateChallengeInput(body && body.challenge);
      if (!v.ok) return BAD_REQUEST;
      const doc = storedDoc(v.def, now);
      await up(container, challengeDocName(teacherId, v.def.challengeId), doc);
      return { status: 200, jsonBody: { ok: true, challenge: doc.challenge, summary: summaryOf(doc.challenge) } };
    }

    if (method === "POST" && action === "delete") {
      const body = await readBody(request);
      if (!body || typeof body.challengeId !== "string" || !body.challengeId.trim()) return BAD_REQUEST;
      await del(container, challengeDocName(teacherId, body.challengeId));
      return { status: 200, jsonBody: { ok: true } };
    }

    return { status: 405, jsonBody: { ok: false, error: "Unsupported live-challenge request." } };
  } catch (e) {
    obs?.logError("game.live-challenge.error", e);
    return { status: 500, jsonBody: { ok: false, error: "تعذّر حفظ التحدّي حاليًا." } };
  }
}

app.http("gameLiveChallenge", { methods: ["GET", "POST"], authLevel: "anonymous", route: "game-live-challenge/{action?}", handler: withObservability("game-live-challenge", handler) });

module.exports = { handler };
