// Phase 20F — DISTRIBUTED rate limit for the AI Full Exam Composer, per teacher: a token bucket of AI_COMPOSER_BUDGET provider calls
// refilling continuously over AI_COMPOSER_WINDOW_SECONDS (40 calls / 10 minutes — one full exam needs a plan, one call per section and a
// few bounded repairs). Same mechanism as the coding-run limiter (Phase 17B): a small JSON blob mutated with the platform's ETag
// compare-and-set helper, the blob name a SHA-256 of the teacher identity (no identity in names), process memory never trusted. The caller
// fails CLOSED on any storage error (no provider call). Retry-After is the real time until one token is available.
const crypto = require("crypto");
const { mutateJsonWithRetry } = require("./platform-storage");

const AI_COMPOSER_BUDGET = 40;
const AI_COMPOSER_WINDOW_SECONDS = 600;
const PREFIX = "platform/throttle/ai-composer-";
const bucketName = teacherId => PREFIX + crypto.createHash("sha256").update("ai-composer|" + String(teacherId)).digest("hex") + ".json";

/** PURE: the next bucket state and the decision for one provider call at nowMs. */
function evaluateComposerBucket(current, nowMs) {
  const ratePerMs = AI_COMPOSER_BUDGET / (AI_COMPOSER_WINDOW_SECONDS * 1000);
  let tokens = AI_COMPOSER_BUDGET;
  if (current && Number.isFinite(current.tokens) && Number.isFinite(current.updatedAt)) {
    const elapsed = Math.max(0, nowMs - current.updatedAt);
    tokens = Math.min(AI_COMPOSER_BUDGET, Math.max(0, current.tokens) + elapsed * ratePerMs);
  }
  if (tokens >= 1) return { allowed: true, retryAfterSeconds: 0, next: { schemaVersion: 1, tokens: tokens - 1, updatedAt: nowMs } };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / ratePerMs / 1000)), next: { schemaVersion: 1, tokens, updatedAt: nowMs } };
}

/** Reserves one provider call for the teacher. Resolves { allowed, retryAfterSeconds }; rejects on storage failure. */
async function reserveComposerCall(container, teacherId, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: false, retryAfterSeconds: AI_COMPOSER_WINDOW_SECONDS };
  await mut(container, bucketName(teacherId), current => {
    const r = evaluateComposerBucket(current, nowMs);
    decision = { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds };
    return r.next;
  });
  return decision;
}

module.exports = { AI_COMPOSER_BUDGET, AI_COMPOSER_WINDOW_SECONDS, evaluateComposerBucket, reserveComposerCall };
