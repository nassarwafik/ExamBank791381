// D3 (item 5) — DISTRIBUTED per-teacher rate limits for every AI route that had none. Same mechanism and fail-closed rule as the
// Phase 20F composer limiter (ai-composer-rate-limit.js, which keeps its own budget): a token bucket in a small JSON blob mutated with
// the platform's ETag compare-and-set helper, the blob name a SHA-256 of policy + teacher identity (no identity in names), process
// memory never trusted. A storage failure refuses the call (503, no provider call); an exhausted bucket answers 429 with the real
// Retry-After. The budgets stop a runaway client loop or a stolen session from running up the AI bill — they are far above what
// one teacher does by hand (every route here is one click per request; PDF import and batch classification are one request each).
//
// The wrapper sits at route REGISTRATION (app.http handler), so each handler body and its tests are unchanged. Unauthenticated
// requests pass straight to the handler, which answers its own 401 without touching the bucket. The inventory guard
// (api/tests/ai-rate-limit-d3.test.js) fails if a route that reaches an AI provider is registered without this wrapper.
const crypto = require("crypto");
const storage = require("./platform-storage");   // looked up at call time (the route inventory tests swap in a memory container)
const { requireBuilderAuth } = require("./builder-auth");
const { requireTeacherSession } = require("./teacher-session");
const { createRequestContext } = require("./observability");

const AI_RATE_POLICIES = Object.freeze({
  // Authoring, fixing, interpreting and analytics: one provider call (or a small bounded set) per click.
  "ai-general": Object.freeze({ budget: 120, windowSeconds: 600 }),
  // Whole-document jobs: a PDF import or a bank batch classification is ONE request that fans out to many provider calls.
  "ai-bulk": Object.freeze({ budget: 20, windowSeconds: 3600 }),
  // Image generation — the most expensive call per request.
  "ai-image": Object.freeze({ budget: 30, windowSeconds: 3600 })
});

const PREFIX = "platform/throttle/ai-";
const bucketName = (policy, teacherId) => PREFIX + policy + "-" + crypto.createHash("sha256").update("ai-rate|" + policy + "|" + String(teacherId)).digest("hex") + ".json";

function policyOf(name) {
  const p = AI_RATE_POLICIES[name];
  if (!p) throw new Error("unknown AI rate policy: " + name);
  return p;
}

/** PURE: the next bucket state and the decision for one request at nowMs under the named policy. */
function evaluateAiBucket(policyName, current, nowMs) {
  const { budget, windowSeconds } = policyOf(policyName);
  const ratePerMs = budget / (windowSeconds * 1000);
  let tokens = budget;
  if (current && Number.isFinite(current.tokens) && Number.isFinite(current.updatedAt)) {
    const elapsed = Math.max(0, nowMs - current.updatedAt);
    tokens = Math.min(budget, Math.max(0, current.tokens) + elapsed * ratePerMs);
  }
  if (tokens >= 1) return { allowed: true, retryAfterSeconds: 0, next: { schemaVersion: 1, tokens: tokens - 1, updatedAt: nowMs } };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / ratePerMs / 1000)), next: { schemaVersion: 1, tokens, updatedAt: nowMs } };
}

/** Reserves one request for the teacher under the policy. Resolves { allowed, retryAfterSeconds }; rejects on storage failure. */
async function reserveAiCall(container, policyName, teacherId, deps = {}) {
  policyOf(policyName);
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: false, retryAfterSeconds: policyOf(policyName).windowSeconds };
  await mut(container, bucketName(policyName, teacherId), current => {
    const r = evaluateAiBucket(policyName, current, nowMs);
    decision = { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds };
    return r.next;
  });
  return decision;
}

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * withAiRateLimit(route, policyName, innerHandler, deps?) → an Azure Functions handler.
 *   deps (tests only): { getContainer, reserve, mutateJsonWithRetry, now, requireBuilderAuth }
 */
function withAiRateLimit(route, policyName, innerHandler, deps = {}) {
  policyOf(policyName);
  const auth = deps.requireBuilderAuth || requireBuilderAuth;
  const reserve = deps.reserve || reserveAiCall;
  return async function aiRateLimitedHandler(request, ...rest) {
    // Tadris+ P2-A2 — keyed through the async teacher-session seam, so a MANAGED teacher (token v3) is rate-limited like any
    // other teacher (the synchronous check alone would not recognise the session and would skip the limiter).
    const session = await requireTeacherSession(request, { requireBuilderAuth: auth, getContainer: deps.getContainer });
    const observed = rest[1] && typeof rest[1].logWarn === "function" ? rest[1] : null;
    const log = (event, fields) => { try { (observed || createRequestContext(request, { route })).logWarn(event, { route, reason: policyName, ...fields }); } catch { /* logging never changes the answer */ } };
    const unavailable = () => ({ status: 503, headers: NO_STORE, jsonBody: { ok: false, code: "AI_UNAVAILABLE", error: "خدمة الذكاء الاصطناعي غير متاحة حاليًا." } });
    // Tadris+ P2-B — the session check itself may need storage (a managed account, or whether a platform owner exists for a
    // shared-password session). When it could not decide (503) the request is refused here, fail closed — never handed on.
    if (session && !session.ok && session.response && session.response.status === 503) { log("ai.rate_limit.unavailable", { outcome: "refused" }); return unavailable(); }
    if (!session || !session.ok) return innerHandler(request, ...rest);       // the handler answers its own 401
    let decision;
    try {
      const container = (deps.getContainer || storage.getContainer)();
      decision = await reserve(container, policyName, String((session.user && session.user.sub) || "teacher"), deps);
    } catch {
      log("ai.rate_limit.unavailable", { outcome: "refused" });
      return unavailable();
    }
    if (!decision || !decision.allowed) {
      const retryAfterSeconds = Math.max(1, Number(decision && decision.retryAfterSeconds) || 1);
      log("ai.rate_limited", { outcome: "throttled" });
      return { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfterSeconds) }, jsonBody: { ok: false, code: "RATE_LIMITED", error: "طلبات كثيرة للذكاء الاصطناعي خلال وقت قصير؛ أعد المحاولة بعد قليل.", retryAfterSeconds } };
    }
    return innerHandler(request, ...rest);
  };
}

module.exports = { AI_RATE_POLICIES, evaluateAiBucket, reserveAiCall, withAiRateLimit, bucketName };
