// Phase 17C — OFFICIAL automatic coding grading routes.
//     POST /api/coding/grade-callback   the Coding Runner Gateway reports RAW evidence of one official job (SA-CODING-CALLBACK-1,
//                                       its own HMAC key). The body never carries a score; SmartAssess compares + weights +
//                                       scores on the server (lib/coding/official-grading.js). Order of checks: unsigned (401)
//                                       → callback key configured AND different from the runner request key — compared on the
//                                       raw secrets, whatever the runner URL / kill switch say (else 503, fail closed) →
//                                       signature over the exact body (401)
//                                       → strict body shape (400) → job / revision / grading key authority (404 / 409) →
//                                       idempotent apply.
//     POST /api/coding/regrade          teacher-only: { action: "retry" | "force", assignmentId, studentId, attemptNumber,
//                                       questionId } — identifiers ONLY (any other field is refused). retry re-dispatches the same
//                                       revision; force starts a new, audited revision from the stored answer and the snapshot.
// Neither route ever executes code, and neither logs source, stdin, stdout, stderr, hidden tests or keys.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { verifyCallbackRequest } = require("../lib/coding/callback-protocol");
const { resolveCallbackKey } = require("../lib/coding/hmac-key-separation");
const { validateCallbackBody, applyOfficialCallback, regradeTarget } = require("../lib/coding/official-grading");

const CALLBACK_MAX_BYTES = 8 * 1024 * 1024;
const REGRADE_MAX_CHARS = 4096;
const REGRADE_KEYS = ["action", "assignmentId", "attemptNumber", "questionId", "studentId"];
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody) => ({ status, headers: NO_STORE, jsonBody });

async function readText(request, maxBytes) {
  let text;
  try { text = typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return null; }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) return null;
  return text;
}

async function callbackHandler(request, deps = {}, obs = null) {
  try {
    const env = deps.env || process.env;
    // An unsigned request is refused as unauthenticated whatever the configuration (it is never a public route).
    if (!request.headers || typeof request.headers.get !== "function" || !request.headers.get("x-sa-callback-signature")) { obs?.logWarn?.("coding.autoGrade.callback.unauthorized", { reason: "unsigned" }); return reply(401, { ok: false, code: "UNAUTHORIZED" }); }
    const key = resolveCallbackKey(env);   // Review Fix 1: null when missing / weak / equal to the runner request key
    if (!key) { obs?.logWarn?.("coding.autoGrade.callback.refused", { reason: "not-configured" }); return reply(503, { ok: false, code: "GRADING_UNAVAILABLE" }); }
    const text = await readText(request, CALLBACK_MAX_BYTES);
    if (text === null) { obs?.logWarn?.("coding.autoGrade.callback.refused", { reason: "body" }); return reply(400, { ok: false, code: "REQUEST_INVALID" }); }
    const auth = verifyCallbackRequest({ key, headers: request.headers, body: Buffer.from(text, "utf8"), nowMs: deps.now ? deps.now() : Date.now() });
    if (!auth.ok) { obs?.logWarn?.("coding.autoGrade.callback.unauthorized", { reason: auth.reason }); return reply(401, { ok: false, code: "UNAUTHORIZED" }); }
    let body;
    try { body = JSON.parse(text); } catch { return reply(400, { ok: false, code: "REQUEST_INVALID" }); }
    if (!validateCallbackBody(body)) { obs?.logWarn?.("coding.autoGrade.callback.refused", { reason: "invalid" }); return reply(400, { ok: false, code: "REQUEST_INVALID" }); }
    const container = (deps.getContainer || getContainer)();
    const r = await applyOfficialCallback(container, body, deps, obs);
    return reply(r.status, r.body);
  } catch (e) {
    obs?.logError?.("coding.autoGrade.callback.error", e);
    return reply(500, { ok: false, code: "INTERNAL" });
  }
}

async function regradeHandler(request, deps = {}, obs = null) {
  try {
    const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!auth.ok) return auth.response;
    const text = await readText(request, REGRADE_MAX_CHARS);
    let b = null;
    try { b = text === null ? null : JSON.parse(text); } catch { b = null; }
    const keys = b && typeof b === "object" && !Array.isArray(b) ? Object.keys(b).sort() : [];
    if (keys.length !== REGRADE_KEYS.length || !keys.every((k, i) => k === REGRADE_KEYS[i])) return reply(400, { ok: false, code: "REQUEST_INVALID" });
    if ((b.action !== "retry" && b.action !== "force") || typeof b.assignmentId !== "string" || !SAFE_ID.test(b.assignmentId) || typeof b.studentId !== "string" || !SAFE_ID.test(b.studentId) || typeof b.questionId !== "string" || !SAFE_ID.test(b.questionId) || !Number.isInteger(b.attemptNumber) || b.attemptNumber < 1) {
      return reply(400, { ok: false, code: "REQUEST_INVALID" });
    }
    const container = (deps.getContainer || getContainer)();
    const r = await regradeTarget(container, { assignmentId: b.assignmentId, studentId: b.studentId, attemptNumber: b.attemptNumber, questionId: b.questionId, action: b.action, actor: auth.user && auth.user.sub }, deps, obs);
    if (r.status !== 200) return reply(r.status, { ok: false, code: r.code });
    obs?.logInfo?.("coding.autoGrade.regrade.requested", { action: b.action, state: r.state, revision: r.revision });
    return reply(200, { ok: true, state: r.state, revision: r.revision });
  } catch (e) {
    obs?.logError?.("coding.autoGrade.regrade.error", e);
    return reply(500, { ok: false, code: "INTERNAL" });
  }
}

app.http("codingGradeCallback", { methods: ["POST"], authLevel: "anonymous", route: "coding/grade-callback", handler: withObservability("coding-grade-callback", callbackHandler) });
app.http("codingRegrade", { methods: ["POST"], authLevel: "anonymous", route: "coding/regrade", handler: withObservability("coding-regrade", regradeHandler) });

module.exports = { callbackHandler, regradeHandler };
