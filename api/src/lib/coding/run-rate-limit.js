// Phase 17B — DISTRIBUTED rate limit for practice runs, per student + assignment: a token bucket of CODING_RUN_BUDGET runs that
// refills continuously over CODING_RUN_WINDOW_SECONDS (20 runs / 5 minutes). The bucket is a small JSON blob mutated with the
// platform's optimistic-concurrency helper (ETag compare-and-set, retried on conflict), so every Function instance shares ONE
// authoritative count — process memory is never trusted. The blob name is a SHA-256 of the pair (no identity in names).
// The caller treats any storage failure as FAIL CLOSED (no run). Retry-After is the real time until one token is available.
const crypto = require("crypto");
const { mutateJsonWithRetry } = require("../platform-storage");

const CODING_RUN_BUDGET = 20;
const CODING_RUN_WINDOW_SECONDS = 300;
const PREFIX = "platform/throttle/coding-run-";

const bucketName = (studentId, assignmentId) => PREFIX + crypto.createHash("sha256").update(String(studentId) + "|" + String(assignmentId)).digest("hex") + ".json";

/** PURE: the next bucket state and the decision for one run attempt at nowMs. */
function evaluateRunBucket(current, nowMs) {
  const ratePerMs = CODING_RUN_BUDGET / (CODING_RUN_WINDOW_SECONDS * 1000);
  let tokens = CODING_RUN_BUDGET;
  if (current && Number.isFinite(current.tokens) && Number.isFinite(current.updatedAt)) {
    const elapsed = Math.max(0, nowMs - current.updatedAt);                      // a clock behind another instance never refills
    tokens = Math.min(CODING_RUN_BUDGET, Math.max(0, current.tokens) + elapsed * ratePerMs);
  }
  if (tokens >= 1) return { allowed: true, retryAfterSeconds: 0, next: { schemaVersion: 1, tokens: tokens - 1, updatedAt: nowMs } };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / ratePerMs / 1000)), next: { schemaVersion: 1, tokens, updatedAt: nowMs } };
}

/** Reserves one run for (studentId, assignmentId). Resolves { allowed, retryAfterSeconds }; rejects on storage failure. */
async function reserveCodingRun(container, { studentId, assignmentId }, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: false, retryAfterSeconds: CODING_RUN_WINDOW_SECONDS };
  await mut(container, bucketName(studentId, assignmentId), current => {
    const r = evaluateRunBucket(current, nowMs);
    decision = { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds };
    return r.next;
  });
  return decision;
}

module.exports = { CODING_RUN_BUDGET, CODING_RUN_WINDOW_SECONDS, evaluateRunBucket, reserveCodingRun };
