const crypto = require("crypto");
const net = require("net");
const { downloadJsonOrNull, mutateJsonWithRetry, deleteBlob } = require("./platform-storage");

// Roadmap #8 §10 + PR#67 reviews — cross-instance login throttling with a correct recovery state machine.
//
// State lives in Azure Blob, mutated with optimistic concurrency (mutateJsonWithRetry), so many Function
// instances share one authoritative count. Every attempt is COUNTED (reserved) BEFORE password
// verification, so a simultaneous burst cannot all reach verify. Crucially, the throttle RECOVERS: after a
// cooldown expires, exactly ONE probe is allowed through to verification; a correct probe clears the state,
// a wrong probe escalates the next (bounded) cooldown. Retry-After is therefore truthful. There is no
// permanent lockout — the counter also decays after a quiet window, and a crashed probe self-recovers via
// the next cooldown cycle.
//
// Two buckets are consulted per attempt: a tight identifier+client bucket AND a looser identifier-only
// GLOBAL bucket (so rotating/spoofing the client IP cannot buy unlimited guesses). The global bucket is NOT
// consumed when the per-IP bucket already rejected the request.
const THROTTLE_PREFIX = "platform/throttle/login-";
const PER_IP_FREE_ATTEMPTS = 5;      // free attempts per identifier+client before the first cooldown
const GLOBAL_FREE_ATTEMPTS = 20;     // higher ceiling for the identifier-only bucket (defeats IP rotation)
const BASE_COOLDOWN_SECONDS = 5;
const MAX_COOLDOWN_SECONDS = 900;    // 15 min cap (never permanent)
const DECAY_SECONDS = 3600;          // a quiet hour resets the counter entirely

// Only a syntactically valid IP (Node's net.isIP, strict) is ever trusted as the client id.
function isValidIp(value) {
  const s = String(value || "").trim();
  if (!s || s.length > 45) return false;
  return net.isIP(s) !== 0;
}

const normId = v => String(v || "").normalize("NFKC").trim().toLowerCase();

function throttleName(identifier, clientId) {
  const material = normId(identifier) + "|" + String(clientId || "noip");
  return THROTTLE_PREFIX + crypto.createHash("sha256").update(material).digest("hex") + ".json";
}

// Escalating, capped cooldown by level (1 => 5s, 2 => 10s, 3 => 20s, ... capped at 15 min).
function cooldownForLevel(level) {
  if (level <= 0) return 0;
  return Math.min(MAX_COOLDOWN_SECONDS, Math.round(BASE_COOLDOWN_SECONDS * Math.pow(2, level - 1)));
}

// Atomically decide whether ONE attempt may proceed to verification, updating the bucket state machine.
// Returns { allowed, retryAfterSeconds }. State fields: attempts (in the current window), blockedUntil
// (cooldown end, ms), level (escalation counter), lastAt (for decay).
async function reserveBucket(container, bucketName, freeAttempts, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let decision = { allowed: true, retryAfterSeconds: 0 };
  await mut(container, bucketName, current => {
    const decayed = !current || !Number(current.lastAt) || nowMs - Number(current.lastAt) > DECAY_SECONDS * 1000;
    const state = decayed
      ? { attempts: 0, blockedUntil: 0, level: 0, lastAt: nowMs }
      : { attempts: Number(current.attempts || 0), blockedUntil: Number(current.blockedUntil || 0), level: Number(current.level || 0), lastAt: Number(current.lastAt || 0) };

    // (1) Active cooldown: deny WITHOUT extending it or counting the attempt (§A: no counter/cooldown bump).
    if (state.blockedUntil > nowMs) {
      decision = { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((state.blockedUntil - nowMs) / 1000)) };
      return state;
    }
    // (2) Cooldown just expired: open a fresh probe window (reset the attempt counter; keep the escalation
    // level so the NEXT cooldown is longer). Exactly one probe is admitted per post-cooldown window because
    // the effective free band drops to 1 once any cooldown has occurred (level > 0).
    if (state.blockedUntil > 0) { state.attempts = 0; state.blockedUntil = 0; }

    const band = state.level === 0 ? freeAttempts : 1;
    state.attempts += 1;
    state.lastAt = nowMs;

    if (state.attempts > band) {
      state.level += 1;
      const cd = cooldownForLevel(state.level);
      state.blockedUntil = nowMs + cd * 1000;
      decision = { allowed: false, retryAfterSeconds: cd };
      return state;
    }
    decision = { allowed: true, retryAfterSeconds: 0 };
    return state;
  });
  return decision;
}

// Reserve the identifier+client bucket first; only if it allows do we also consult (and consume) the
// identifier-only global bucket (§A: a request already rejected per-IP must not spend the global budget).
async function reserveLoginAttempt(container, identifier, clientId, deps = {}) {
  const perIp = await reserveBucket(container, throttleName(identifier, clientId), PER_IP_FREE_ATTEMPTS, deps);
  if (!perIp.allowed) return { allowed: false, retryAfterSeconds: perIp.retryAfterSeconds };
  const global = await reserveBucket(container, throttleName(identifier, "__global__"), GLOBAL_FREE_ATTEMPTS, deps);
  if (!global.allowed) return { allowed: false, retryAfterSeconds: global.retryAfterSeconds };
  return { allowed: true, retryAfterSeconds: 0 };
}

// Non-mutating peek across both buckets.
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

// A successful login clears BOTH buckets (resets the counter and the escalation level).
async function clearLoginThrottle(container, identifier, clientId, deps = {}) {
  const del = deps.deleteBlob || deleteBlob;
  await del(container, throttleName(identifier, clientId));
  await del(container, throttleName(identifier, "__global__"));
}

// Trustworthy-ish client address. Azure Static Web Apps / Functions front door sets x-forwarded-for
// (client = first hop) and x-azure-clientip. Only a syntactically valid IP is trusted; otherwise "noip"
// (so the identifier-only global bucket still bounds brute force when the address is absent/spoofed).
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
  cooldownForLevel,
  reserveBucket,
  reserveLoginAttempt,
  checkLoginThrottle,
  clearLoginThrottle,
  clientIdFromRequest
};
