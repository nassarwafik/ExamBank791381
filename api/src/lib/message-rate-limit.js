// Messages hardening (M.1) — DISTRIBUTED send rate limit per sender, the same mechanism as the AI composer and coding-run
// limiters: a small JSON blob per sender mutated with the platform's ETag compare-and-set helper (process memory never
// trusted), the blob name a SHA-256 of role + identity (no identity in names). Two continuously refilling token buckets
// in ONE document: a short BURST window (flooding a thread) and a DAILY quota (slow, sustained abuse). Before this, one
// student could publish an unbounded number of messages — every thread read, every teacher badge and every send lists the
// whole stream, so a flood degraded the teacher's surfaces for everyone.
// The caller FAILS CLOSED on a storage error (no message is published): a send that cannot be accounted is refused.
const crypto = require("crypto");
const { mutateJsonWithRetry } = require("./platform-storage");

// Generous for real conversation, far below scripted flooding. Teachers write to many students and classes.
const SEND_LIMITS = Object.freeze({
  student: Object.freeze({ burst: 8, burstWindowSeconds: 60, daily: 150 }),
  teacher: Object.freeze({ burst: 30, burstWindowSeconds: 60, daily: 1000 })
});
const DAY_SECONDS = 24 * 60 * 60;
const PREFIX = "platform/throttle/messages-";
const bucketName = (role, senderId) => PREFIX + crypto.createHash("sha256").update("messages|" + role + "|" + String(senderId)).digest("hex") + ".json";

function refill(tokens, updatedAt, capacity, windowSeconds, nowMs) {
  const ratePerMs = capacity / (windowSeconds * 1000);
  if (!Number.isFinite(tokens) || !Number.isFinite(updatedAt)) return capacity;
  return Math.min(capacity, Math.max(0, tokens) + Math.max(0, nowMs - updatedAt) * ratePerMs);
}

/** PURE: the next bucket state and the decision for one send at nowMs. A refused send consumes nothing. */
function evaluateSendBucket(current, limits, nowMs) {
  const c = current && typeof current === "object" ? current : null;
  const burst = refill(c && c.burstTokens, c && c.updatedAt, limits.burst, limits.burstWindowSeconds, nowMs);
  const daily = refill(c && c.dailyTokens, c && c.updatedAt, limits.daily, DAY_SECONDS, nowMs);
  const next = { schemaVersion: 1, burstTokens: burst, dailyTokens: daily, updatedAt: nowMs };
  if (burst >= 1 && daily >= 1) return { allowed: true, retryAfterSeconds: 0, scope: "", next: { ...next, burstTokens: burst - 1, dailyTokens: daily - 1 } };
  const wait = (tokens, capacity, windowSeconds) => Math.max(1, Math.ceil((1 - tokens) / (capacity / (windowSeconds * 1000)) / 1000));
  const scope = daily < 1 ? "daily" : "burst";
  const retryAfterSeconds = scope === "daily" ? wait(daily, limits.daily, DAY_SECONDS) : wait(burst, limits.burst, limits.burstWindowSeconds);
  return { allowed: false, retryAfterSeconds, scope, next };
}

/** Reserves one send for (role, senderId). Resolves { allowed, retryAfterSeconds, scope }; rejects on storage failure. */
async function reserveMessageSend(container, role, senderId, deps = {}) {
  const limits = SEND_LIMITS[role];
  if (!limits || !senderId) throw new Error("Unknown message sender.");
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: false, retryAfterSeconds: limits.burstWindowSeconds, scope: "burst" };
  await mut(container, bucketName(role, senderId), current => {
    const r = evaluateSendBucket(current, limits, nowMs);
    decision = { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds, scope: r.scope };
    return r.next;
  });
  return decision;
}

/** The 429 response for a refused send (Retry-After = the real time until one send is available again). */
function rateLimitedResponse(decision) {
  const error = decision.scope === "daily"
    ? "وصلت إلى الحد اليومي لعدد الرسائل. حاول مرة أخرى لاحقًا."
    : "أرسلت رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.";
  return { status: 429, headers: { "Retry-After": String(decision.retryAfterSeconds) }, jsonBody: { ok: false, code: "RATE_LIMITED", error, retryAfterSeconds: decision.retryAfterSeconds } };
}

module.exports = { SEND_LIMITS, evaluateSendBucket, reserveMessageSend, rateLimitedResponse, bucketName };
