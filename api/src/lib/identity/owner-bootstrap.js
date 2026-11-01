const crypto = require("crypto");

// Tadris+ P1-A — configuration of the one-time owner bootstrap (owner decision D3).
//
// The owner generates a random token on their own computer (scripts/owner-bootstrap-token.mjs) and sets, themselves, in
// the Azure app settings:
//   OWNER_BOOTSTRAP_TOKEN_SHA256 — the SHA-256 (hex) of the token. The token itself is never stored on the server.
//   OWNER_BOOTSTRAP_EXPIRES_AT   — an ISO-8601 instant at most 24 hours ahead.
// The bootstrap route is open only while both are valid AND the create-only marker platform/owner/bootstrap.json does not
// exist. Once the first owner is created the marker closes the route for good, even if the settings are left in place.
// There is no default owner, no fixed password and no credential in the repository.

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_SKEW_MS = 5 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;          // 32 random bytes, base64url without padding
const HASH_RE = /^[a-f0-9]{64}$/;

/** Pure. → { state: "not-configured" | "misconfigured" | "expired" | "open", hash?, expiresAtMs? }. Never returns a value. */
function bootstrapConfig(env = process.env, nowMs = Date.now()) {
  const rawHash = String(env.OWNER_BOOTSTRAP_TOKEN_SHA256 || "").trim().toLowerCase();
  const rawExpiry = String(env.OWNER_BOOTSTRAP_EXPIRES_AT || "").trim();
  if (!rawHash && !rawExpiry) return { state: "not-configured" };
  if (!HASH_RE.test(rawHash) || !rawExpiry) return { state: "misconfigured" };
  const expiresAtMs = Date.parse(rawExpiry);
  if (!Number.isFinite(expiresAtMs)) return { state: "misconfigured" };
  if (expiresAtMs <= nowMs) return { state: "expired" };
  if (expiresAtMs - nowMs > MAX_WINDOW_MS + WINDOW_SKEW_MS) return { state: "misconfigured" };
  return { state: "open", hash: rawHash, expiresAtMs };
}

function sha256Hex(text) { return crypto.createHash("sha256").update(String(text), "utf8").digest("hex"); }

/** Constant-time comparison of SHA-256(token) with the configured hash. */
function bootstrapTokenMatches(token, hashHex) {
  const text = String(token ?? "").trim();
  if (!TOKEN_RE.test(text) || !HASH_RE.test(String(hashHex || ""))) return false;
  const left = Buffer.from(sha256Hex(text), "hex");
  const right = Buffer.from(String(hashHex), "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** For the operator script and tests: a fresh token and its hash. */
function generateBootstrapToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, sha256: sha256Hex(token) };
}

module.exports = { MAX_WINDOW_MS, TOKEN_RE, bootstrapConfig, bootstrapTokenMatches, generateBootstrapToken, sha256Hex };
