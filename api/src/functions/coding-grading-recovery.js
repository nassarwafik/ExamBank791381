// Phase 17D-A — coding grading RELIABILITY routes (HTTP only: Azure SWA managed Functions have no timer / queue triggers).
//     POST /api/coding/grading-sweep   the GitHub Actions scheduler (.github/workflows/coding-grading-recovery.yml) triggers ONE
//                                      bounded recovery sweep (lib/coding/grading-recovery.js). SA-CODING-SWEEP-1 HMAC under its
//                                      OWN key CODING_GRADING_SWEEP_HMAC_KEY. Order of checks, all BEFORE any storage access:
//                                      unsigned (401) → key configured AND separated from the runner + callback keys on the raw
//                                      secrets (else 503 SWEEP_UNAVAILABLE) → bounded body (400) → HMAC (401) → timestamp (401)
//                                      → body exactly {"version":1} (400) → lease (409 SWEEP_BUSY) → engine (200, aggregates).
//     POST /api/coding/bulk-retry      teacher-only: { assignmentId } — re-dispatch every pending / retryable / stale coding
//                                      target of the assignment at the SAME revision (bounded; hasMore). Identifiers only.
// Neither route executes code, computes a grade outside the Phase 17C applier, or returns / logs a student, job id, grading key,
// source or hidden test.
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { requireBuilderAuth } = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const { resolveSweepKey } = require("../lib/coding/hmac-key-separation");
const { verifySweepRequest, SWEEP_HEADERS } = require("../lib/coding/sweep-protocol");
const { runCodingGradingRecoverySweep, bulkRetryAssignment } = require("../lib/coding/grading-recovery");

const SWEEP_MAX_BYTES = 1024;
const BULK_MAX_CHARS = 1024;
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const NO_STORE = { "Cache-Control": "no-store" };
const reply = (status, jsonBody) => ({ status, headers: NO_STORE, jsonBody });

async function readText(request, maxBytes) {
  let text;
  try { text = typeof request.text === "function" ? await request.text() : JSON.stringify(await request.json()); } catch { return null; }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > maxBytes) return null;
  return text;
}
const exactKeys = (b, keys) => !!b && typeof b === "object" && !Array.isArray(b) && Object.keys(b).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(b, k));

async function sweepHandler(request, deps = {}, obs = null) {
  try {
    const env = deps.env || process.env;
    if (!request.headers || typeof request.headers.get !== "function" || !request.headers.get(SWEEP_HEADERS.signature)) { obs?.logWarn?.("coding.autoGrade.recovery.unauthorized", { reason: "unsigned" }); return reply(401, { ok: false, code: "UNAUTHORIZED" }); }
    const key = resolveSweepKey(env);
    if (!key) { obs?.logWarn?.("coding.autoGrade.recovery.refused", { reason: "not-configured" }); return reply(503, { ok: false, code: "SWEEP_UNAVAILABLE" }); }
    const text = await readText(request, SWEEP_MAX_BYTES);
    if (text === null) { obs?.logWarn?.("coding.autoGrade.recovery.refused", { reason: "body" }); return reply(400, { ok: false, code: "REQUEST_INVALID" }); }
    const auth = verifySweepRequest({ key, headers: request.headers, body: Buffer.from(text, "utf8"), nowMs: deps.now ? deps.now() : Date.now() });
    if (!auth.ok) { obs?.logWarn?.("coding.autoGrade.recovery.unauthorized", { reason: auth.reason }); return reply(401, { ok: false, code: "UNAUTHORIZED" }); }
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!exactKeys(body, ["version"]) || body.version !== 1) { obs?.logWarn?.("coding.autoGrade.recovery.refused", { reason: "invalid" }); return reply(400, { ok: false, code: "REQUEST_INVALID" }); }
    const container = (deps.getContainer || getContainer)();
    const r = await runCodingGradingRecoverySweep(container, { requestId: auth.requestId, obs }, deps);
    if (r.status === "busy") return reply(409, { ok: false, code: "SWEEP_BUSY" });
    return reply(200, r);
  } catch {
    obs?.logWarn?.("coding.autoGrade.recovery.error", { stage: "handler" });
    return reply(500, { ok: false, code: "INTERNAL" });
  }
}

async function bulkRetryHandler(request, deps = {}, obs = null) {
  try {
    const auth = (deps.requireBuilderAuth || requireBuilderAuth)(request);
    if (!auth.ok) return auth.response;
    const text = await readText(request, BULK_MAX_CHARS);
    let b = null;
    try { b = text === null ? null : JSON.parse(text); } catch { b = null; }
    if (!exactKeys(b, ["assignmentId"]) || typeof b.assignmentId !== "string" || !SAFE_ID.test(b.assignmentId) || b.assignmentId.includes("..")) return reply(400, { ok: false, code: "REQUEST_INVALID" });
    const container = (deps.getContainer || getContainer)();
    const r = await bulkRetryAssignment(container, { assignmentId: b.assignmentId, actor: auth.user && auth.user.sub }, deps, obs);
    if (r.status !== 200) return reply(r.status, { ok: false, code: r.code });
    return reply(200, { ok: true, scheduled: r.scheduled, dispatched: r.dispatched, retryable: r.retryable, hasMore: r.hasMore });
  } catch {
    obs?.logWarn?.("coding.autoGrade.bulkRetry.error", { stage: "handler" });
    return reply(500, { ok: false, code: "INTERNAL" });
  }
}

app.http("codingGradingSweep", { methods: ["POST"], authLevel: "anonymous", route: "coding/grading-sweep", handler: withObservability("coding-grading-sweep", sweepHandler) });
app.http("codingBulkRetry", { methods: ["POST"], authLevel: "anonymous", route: "coding/bulk-retry", handler: withObservability("coding-bulk-retry", bulkRetryHandler) });

module.exports = { sweepHandler, bulkRetryHandler };
