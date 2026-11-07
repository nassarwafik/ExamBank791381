const crypto = require("crypto");

// Tadris+ QR-1 — sign in on a NEW device by scanning a QR code with a device that is ALREADY signed in (the WhatsApp Web pattern),
// for the three roles: platform owner, teacher and student. Design record: docs/enterprise-qr-login-qr1.md.
//
//   new device  POST start               → a PAIRING: pairingToken (in the QR) + pollSecret (stays in that browser) + a 2-digit
//                                           match number shown beside the QR
//   signed-in   POST inspect             → what is asking (browser / system / same network) + 3 numbers to choose from
//   device      POST approve             → the pairing is bound to THIS caller's identity (the number must match)
//               POST deny                → the pairing is closed
//   new device  POST poll                → pending … then, ONCE, an ordinary session of the approver's role
//
// Two namespaces with their own routes (storage steps: ./qr-pairing.js): teacher / student = qr-login + qr-login-approve; platform
// owner = owner-qr-login + owner-qr-login-approve (its own prefix, an owner session with a recent step-up approves).
// The QR never carries a credential: the pairing token alone neither polls nor signs in (the poll also needs pollSecret, which
// only the browser that started the pairing holds). Only SHA-256 hashes of both are stored. A pairing lives 90 seconds, is
// approved at most once, and is consumed BEFORE the session is issued (compare-and-set), so it can never yield two sessions.
// This module is pure (no storage, no clock): the routes own I/O, so every rule here is unit-testable.

// The teacher / student namespace. The owner's pairings live under the owner's own prefix, named by the owner routes only.
const PAIRING_PREFIX = "platform/auth/qr-login/";
const START_BUCKET_PREFIX = "platform/throttle/qr-start-";
const PAIRING_TTL_MS = 90 * 1000;
const POLL_INTERVAL_MS = 2000;
const SCHEMA_VERSION = 1;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;            // 32 random bytes, base64url
const ROLES = Object.freeze(["owner", "teacher", "student"]);
const STATUSES = Object.freeze(["pending", "approved", "denied", "consumed"]);

// Start budget per client address: a token bucket (the QR on the sign-in page refreshes about once a minute; a classroom behind one
// address shares the bucket). It bounds anonymous blob creation; it is not a credential check (a pairing grants nothing by itself).
const START_BUDGET = 120;
const START_WINDOW_SECONDS = 600;

const sha256Hex = t => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const pairingName = (token, prefix = PAIRING_PREFIX) => prefix + sha256Hex("qr-pairing|" + token) + ".json";
const pollSecretHash = secret => sha256Hex("qr-poll|" + secret);
/** The client address is never stored: only a hash, compared for the «same network» hint. */
const clientHash = clientId => sha256Hex("qr-client|" + String(clientId || "noip")).slice(0, 32);
const startBucketName = clientId => START_BUCKET_PREFIX + sha256Hex("qr-start|" + String(clientId || "noip")) + ".json";
const validToken = t => typeof t === "string" && TOKEN_RE.test(t);

function timingSafeEqualHex(a, b) {
  const x = Buffer.from(String(a || ""), "utf8"), y = Buffer.from(String(b || ""), "utf8");
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/**
 * A short, fixed-vocabulary description of the requesting browser (never the raw User-Agent: nothing the requester typed reaches the
 * approver's screen except one of these words).
 */
function deviceFromUserAgent(ua) {
  const s = String(ua || "").slice(0, 512);
  const os = /iPhone|iPad|iPod/.test(s) ? "iOS" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows"
    : /CrOS/.test(s) ? "ChromeOS" : /Mac OS X|Macintosh/.test(s) ? "macOS" : /Linux/.test(s) ? "Linux" : "unknown";
  const browser = /Edg\//.test(s) ? "Edge" : /OPR\/|Opera/.test(s) ? "Opera" : /SamsungBrowser/.test(s) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(s) ? "Firefox" : /Chrome\/|CriOS/.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "unknown";
  return { browser, os };
}

/** Three distinct 2-digit numbers, one of them `code`, in random order. */
function matchOptionsFor(code, randomInt = crypto.randomInt) {
  const set = new Set([code]);
  while (set.size < 3) set.add(randomInt(10, 100));
  const list = [...set];
  for (let i = list.length - 1; i > 0; i--) { const j = randomInt(0, i + 1); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

/** A new pairing at nowMs. → { pairingToken, pollSecret, record } (only the record is stored; it holds hashes only). */
function newPairing({ nowMs, userAgent, clientId }, { randomBytes = crypto.randomBytes, randomInt = crypto.randomInt } = {}) {
  const pairingToken = randomBytes(32).toString("base64url");
  const pollSecret = randomBytes(32).toString("base64url");
  const matchCode = randomInt(10, 100);
  const record = {
    schemaVersion: SCHEMA_VERSION, status: "pending", createdAtMs: nowMs, expiresAtMs: nowMs + PAIRING_TTL_MS,
    pollSecretHash: pollSecretHash(pollSecret), matchCode, matchOptions: matchOptionsFor(matchCode, randomInt),
    device: deviceFromUserAgent(userAgent), clientHash: clientHash(clientId),
    approval: null, approvedAtMs: null, closedReason: null, consumedAtMs: null
  };
  return { pairingToken, pollSecret, record };
}

/** Whether `r` is a well-formed stored pairing (anything else is treated as unknown: fail closed). */
function wellFormed(r) {
  return Boolean(r && typeof r === "object" && r.schemaVersion === SCHEMA_VERSION && STATUSES.includes(r.status)
    && Number.isFinite(r.createdAtMs) && Number.isFinite(r.expiresAtMs) && typeof r.pollSecretHash === "string"
    && Number.isInteger(r.matchCode) && Array.isArray(r.matchOptions));
}

/** The approval stored on a pairing must name one role and one subject; anything else is refused at poll. */
function validApproval(a) {
  if (!a || typeof a !== "object" || !ROLES.includes(a.role)) return false;
  if (typeof a.subject !== "string" || !a.subject || a.subject.length > 128) return false;
  if (!Number.isInteger(a.authVersion) || a.authVersion < 1) return false;
  if (a.role !== "student" && !(typeof a.sid === "string" && /^[a-f0-9]{32}$/.test(a.sid))) return false;
  return true;
}

/** The state of a pairing as the new device / the approver sees it at nowMs. */
function pairingState(r, nowMs) {
  if (!wellFormed(r)) return "invalid";
  if (r.status === "consumed") return "used";
  if (r.status === "denied") return "denied";
  if (!(r.expiresAtMs > nowMs)) return "expired";
  return r.status;                                   // "pending" | "approved"
}

/** PURE: the next start bucket and the decision for one start at nowMs. */
function evaluateStartBucket(current, nowMs) {
  const ratePerMs = START_BUDGET / (START_WINDOW_SECONDS * 1000);
  let tokens = START_BUDGET;
  if (current && Number.isFinite(current.tokens) && Number.isFinite(current.updatedAt)) {
    tokens = Math.min(START_BUDGET, Math.max(0, current.tokens) + Math.max(0, nowMs - current.updatedAt) * ratePerMs);
  }
  if (tokens >= 1) return { allowed: true, retryAfterSeconds: 0, next: { schemaVersion: 1, tokens: tokens - 1, updatedAt: nowMs } };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((1 - tokens) / ratePerMs / 1000)), next: { schemaVersion: 1, tokens, updatedAt: nowMs } };
}

module.exports = {
  PAIRING_PREFIX, START_BUCKET_PREFIX, PAIRING_TTL_MS, POLL_INTERVAL_MS, START_BUDGET, START_WINDOW_SECONDS, ROLES,
  pairingName, pollSecretHash, clientHash, startBucketName, validToken, timingSafeEqualHex, deviceFromUserAgent, matchOptionsFor,
  newPairing, wellFormed, validApproval, pairingState, evaluateStartBucket
};
