const crypto = require("crypto");
const { downloadJsonOrNull, mutateJsonWithRetry, deleteBlob } = require("./platform-storage");

// Roadmap #8 §10 + PR#67 review §2/§7 — cross-instance login throttling.
//
// State lives in Azure Blob, mutated with optimistic concurrency (mutateJsonWithRetry), so many Function
// instances share one authoritative failure count. The attempt is COUNTED (reserved) BEFORE any password
// verification, so a burst of simultaneous guesses for the same identity cannot all slip past a stale
// pre-check and reach the (expensive, information-bearing) verify step. There is NO permanent lockout:
// cooldowns escalate but are capped, and the counter decays after a quiet window.
//
// Two buckets are reserved on every attempt (§7): an identifier+client-address bucket (tight, so a single
// actor throttles fast) AND an identifier-only GLOBAL bucket (looser, so rotating/spoofing the client IP
// cannot buy unlimited guesses against one account). Either bucket blocking rejects the attempt.
const THROTTLE_PREFIX = "platform/throttle/login-";
const PER_IP_FREE_ATTEMPTS = 5;      // failures allowed per identifier+client before a cooldown
const GLOBAL_FREE_ATTEMPTS = 20;     // higher ceiling for the identifier-only bucket (defeats IP rotation)
const BASE_COOLDOWN_SECONDS = 5;
const MAX_COOLDOWN_SECONDS = 900;    // 15 min cap (never permanent)
const DECAY_SECONDS = 3600;          // a quiet hour resets the counter

// Basic syntactic IP validation (§7). Only a syntactically valid address is ever used as the client id;
// anything else (missing, garbage, attacker-chosen junk) collapses to "noip" so it cannot create an
// unbounded set of distinct per-IP buckets.
function isValidIp(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 45) return false;
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) return m.slice(1).every(o => { const n = Number(o); return n >= 0 && n <= 255 && String(n) === o; }); // no leading zeros, 0..255
  // IPv6 (loose but bounded): only hex groups and colons, at least one colon.
  if (/^[0-9a-fA-F:]+$/.test(s) && s.includes(":") && s.length >= 3) return true;
  return false;
}

const normId = v => String(v || "").normalize("NFKC").trim().toLowerCase();

function throttleName(identifier, clientId) {
  const material = normId(identifier) + "|" + String(clientId || "noip");
  return THROTTLE_PREFIX + crypto.createHash("sha256").update(material).digest("hex") + ".json";
}

function cooldownForAttempts(attempts, freeAttempts) {
  if (attempts <= freeAttempts) return 0;
  const over = attempts - freeAttempts;
  return Math.min(MAX_COOLDOWN_SECONDS, Math.round(BASE_COOLDOWN_SECONDS * Math.pow(2, over - 1)));
}

// Atomically reserve (count) one attempt in a single bucket BEFORE credential verification. If the bucket
// is already in a cooldown, nothing new is counted and the attempt is rejected. Otherwise the counter is
// incremented; if it now exceeds the free band a cooldown is armed and the attempt is rejected too. Returns
// { allowed, retryAfterSeconds }. Under heavy same-key contention the ETag-CAS retry budget may reject some
// writers with a conflict — callers treat that as "throttled / try again" (fail-closed), never as allowed.
async function reserveBucket(container, bucketName, freeAttempts, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: true, retryAfterSeconds: 0 };
  await mut(container, bucketName, current => {
    const fresh = current && Number(current.lastAt) && nowMs - Number(current.lastAt) <= DECAY_SECONDS * 1000;
    const state = fresh ? { ...current } : { attempts: 0, firstAt: nowMs, blockedUntil: 0 };
    if (Number(state.blockedUntil) > nowMs) {
      decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((Number(state.blockedUntil) - nowMs) / 1000)) };
      return state; // unchanged (still blocked)
    }
    state.attempts = Number(state.attempts || 0) + 1;
    state.lastAt = nowMs;
    const cooldown = cooldownForAttempts(state.attempts, freeAttempts);
    if (cooldown > 0) {
      state.blockedUntil = nowMs + cooldown * 1000;
      decision = { allowed: false, retryAfterSeconds: cooldown };
    } else {
      decision = { allowed: true, retryAfterSeconds: 0 };
    }
    return state;
  });
  return decision;
}

// Reserve BOTH the identifier+client bucket and the identifier-only global bucket. Allowed only if BOTH
// allow; the returned retryAfter is the larger of any cooldown. A CAS conflict from either reserve throws
// and is caught by the caller as fail-closed (throttled).
async function reserveLoginAttempt(container, identifier, clientId, deps = {}) {
  const perIp = await reserveBucket(container, throttleName(identifier, clientId), PER_IP_FREE_ATTEMPTS, deps);
  const global = await reserveBucket(container, throttleName(identifier, "__global__"), GLOBAL_FREE_ATTEMPTS, deps);
  const allowed = perIp.allowed && global.allowed;
  return { allowed, retryAfterSeconds: Math.max(perIp.retryAfterSeconds, global.retryAfterSeconds) };
}

// Non-mutating pre-check retained for callers that only want to peek (both buckets).
async function checkLoginThrottle(container, identifier, clientId, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const nowMs = deps.now ? deps.now() : Date.now();
  for (const name of [throttleName(identifier, clientId), throttleName(identifier, "__global__")]) {
    const state = await dl(container, name);
    if (state && Number(state.blockedUntil) > nowMs) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((Number(state.blockedUntil) - nowMs) / 1000)) };
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// Clears BOTH throttle buckets after a successful login.
async function clearLoginThrottle(container, identifier, clientId, deps = {}) {
  const del = deps.deleteBlob || deleteBlob;
  await del(container, throttleName(identifier, clientId));
  await del(container, throttleName(identifier, "__global__"));
}

// Trustworthy-ish client address (§7). Azure Static Web Apps / Functions front door sets x-forwarded-for
// (client = first hop) and x-azure-clientip. Only a SYNTACTICALLY VALID IP is trusted; otherwise "noip"
// (so the identifier-only global bucket still bounds brute force even if the address is absent/spoofed).
function clientIdFromRequest(request) {
  try {
    const xff = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (isValidIp(xff)) return xff;
    const azure = String(request.headers.get("x-azure-clientip") || "").trim();
    if (isValidIp(azure)) return azure;
  } catch { /* headers absent in tests */ }
  return "noip";
}

module.exports = {
  THROTTLE_PREFIX,
  PER_IP_FREE_ATTEMPTS,
  GLOBAL_FREE_ATTEMPTS,
  BASE_COOLDOWN_SECONDS,
  MAX_COOLDOWN_SECONDS,
  DECAY_SECONDS,
  isValidIp,
  throttleName,
  cooldownForAttempts,
  reserveBucket,
  reserveLoginAttempt,
  checkLoginThrottle,
  clearLoginThrottle,
  clientIdFromRequest
};
