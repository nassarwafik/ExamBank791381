const crypto = require("crypto");
const { downloadJsonOrNull, mutateJsonWithRetry, deleteBlob } = require("./platform-storage");

// Roadmap #8 §10 — cross-instance login throttling. State lives in Azure Blob (one small doc per
// identifier+client), mutated with optimistic concurrency (mutateJsonWithRetry), so many Function
// instances share one authoritative failure count — an in-memory Map could never do this. There is NO
// permanent lockout: cooldowns escalate but are capped and the counter decays after a quiet window.
const THROTTLE_PREFIX = "platform/throttle/login-";
const FREE_ATTEMPTS = 5;          // failures allowed before any cooldown
const BASE_COOLDOWN_SECONDS = 5;  // first throttled cooldown
const MAX_COOLDOWN_SECONDS = 900; // 15 min cap (never permanent)
const DECAY_SECONDS = 3600;       // a quiet hour resets the failure counter

// Blob name derived from a hash of the (normalized identifier + client id). The raw identifier/IP and the
// password are NEVER stored — only counters and timestamps. Combining identifier WITH the client address
// means one attacker cannot globally lock a victim's account from afar (§10).
function throttleName(identifier, clientId) {
  const material = String(identifier || "").normalize("NFKC").trim().toLowerCase() + "|" + String(clientId || "noip");
  return THROTTLE_PREFIX + crypto.createHash("sha256").update(material).digest("hex") + ".json";
}

function cooldownForFailures(fails) {
  if (fails <= FREE_ATTEMPTS) return 0;
  const over = fails - FREE_ATTEMPTS;                       // 1,2,3,...
  const seconds = BASE_COOLDOWN_SECONDS * Math.pow(2, over - 1);
  return Math.min(MAX_COOLDOWN_SECONDS, Math.round(seconds));
}

// Non-mutating pre-check: is this identifier+client currently in a cooldown window?
// Returns { allowed, retryAfterSeconds }.
async function checkLoginThrottle(container, identifier, clientId, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const nowMs = deps.now ? deps.now() : Date.now();
  const state = await dl(container, throttleName(identifier, clientId));
  if (state && Number(state.blockedUntil) > nowMs) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((Number(state.blockedUntil) - nowMs) / 1000)) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

// Records a failed attempt under optimistic concurrency. Returns { retryAfterSeconds } (0 while still in
// the free band). Concurrent failures each retry the CAS, so simultaneous requests cannot bypass the count.
async function recordLoginFailure(container, identifier, clientId, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const nowMs = deps.now ? deps.now() : Date.now();
  let retryAfterSeconds = 0;
  await mut(container, throttleName(identifier, clientId), current => {
    // Decay: a quiet window since the last failure resets the counter (no permanent memory of old failures).
    let fails = 0;
    if (current && Number(current.lastFailAt) && nowMs - Number(current.lastFailAt) <= DECAY_SECONDS * 1000) {
      fails = Number(current.fails) || 0;
    }
    fails += 1;
    const cooldown = cooldownForFailures(fails);
    retryAfterSeconds = cooldown;
    return {
      fails,
      firstFailAt: current && Number(current.firstFailAt) ? Number(current.firstFailAt) : nowMs,
      lastFailAt: nowMs,
      blockedUntil: cooldown > 0 ? nowMs + cooldown * 1000 : 0
    };
  });
  return { retryAfterSeconds };
}

// Clears throttle state after a successful login for this identifier+client.
async function clearLoginThrottle(container, identifier, clientId, deps = {}) {
  const del = deps.deleteBlob || deleteBlob;
  await del(container, throttleName(identifier, clientId));
}

// Best-effort trustworthy-ish client address from proxy headers. Azure Static Web Apps / Functions front
// door sets x-forwarded-for (client is the FIRST hop). Falls back to "noip" (documented) when absent.
function clientIdFromRequest(request) {
  try {
    const xff = String(request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (xff) return xff;
    const real = String(request.headers.get("x-azure-clientip") || request.headers.get("x-client-ip") || "").trim();
    if (real) return real;
  } catch { /* headers may be absent in tests */ }
  return "noip";
}

module.exports = {
  THROTTLE_PREFIX,
  FREE_ATTEMPTS,
  BASE_COOLDOWN_SECONDS,
  MAX_COOLDOWN_SECONDS,
  DECAY_SECONDS,
  throttleName,
  cooldownForFailures,
  checkLoginThrottle,
  recordLoginFailure,
  clearLoginThrottle,
  clientIdFromRequest
};
