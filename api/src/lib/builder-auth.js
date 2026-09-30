const crypto = require("crypto");
const { parseBuilderUsers, configuredPasswordFor, getBuilderAccount } = require("./builder-users");

// Roadmap #8 — Auth / Session Hardening (teacher / builder side).
const TOKEN_TTL_SECONDS = 8 * 60 * 60;          // teacher session lifetime (unchanged)
const CLOCK_SKEW_SECONDS = 120;                 // tolerate small client/server clock drift
const TOKEN_VERSION = 2;
// Explicit signing purpose. The v2 signing KEY is derived from the shared secret + this context, so a
// teacher token can never validate against the student context (and vice-versa) even when both roles fall
// back to the same BANK_SETUP_KEY. Legacy (pre-R8) tokens signed the raw payload with the secret directly.
const TEACHER_CONTEXT = "ExamBank791381:teacher-session:v2";

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSigningSecret() {
  return (
    process.env.BUILDER_SESSION_SECRET ||
    process.env.BANK_SETUP_KEY ||
    ""
  );
}

function getBuilderPassword() {
  return (
    process.env.BUILDER_PASSWORD ||
    process.env.BANK_SETUP_KEY ||
    ""
  );
}

// Server-authoritative builder session version. Bumping BUILDER_SESSION_VERSION invalidates every existing
// teacher session with no code change. Missing => "1" (backward compatible; env var is NOT required).
function getBuilderSessionVersion() {
  const raw = String(process.env.BUILDER_SESSION_VERSION || "1").trim();
  return raw || "1";
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

// Per-role signing key derived from the shared secret and an explicit purpose context (§4).
function deriveRoleKey(secret, context) {
  return crypto.createHmac("sha256", secret).update(context).digest();
}

function signPayload(encodedPayload, secret) {
  // Legacy (pre-R8) signature: raw secret over the encoded payload.
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function signPayloadV2(encodedPayload, secret) {
  return crypto.createHmac("sha256", deriveRoleKey(secret, TEACHER_CONTEXT)).update(encodedPayload).digest("base64url");
}

function createSignedAssetParams(blobName, ttlSeconds = 15 * 60) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured");
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const message = `asset\n${exp}\n${String(blobName || "")}`;
  const sig = crypto.createHmac("sha256", secret).update(message).digest("base64url");
  return { exp, sig };
}

function verifySignedAssetParams(blobName, exp, suppliedSignature) {
  const secret = getSigningSecret();
  const expiry = Number(exp);
  if (
    !secret ||
    !blobName ||
    !Number.isFinite(expiry) ||
    expiry <= Math.floor(Date.now() / 1000) ||
    !suppliedSignature
  ) {
    return false;
  }
  const message = `asset\n${expiry}\n${String(blobName)}`;
  const expectedSignature = crypto.createHmac("sha256", secret).update(message).digest("base64url");
  return timingSafeEqualText(suppliedSignature, expectedSignature);
}

// Phase 14B Review Fix 1 — the teacher session is BOUND to the authentication mode / account directory that issued it.
// `am` ("legacy" | "multi-user") is a signed claim minted from the SERVER configuration at login (never from a request), so the
// client cannot change it. No token is ever minted while BUILDER_USERS is malformed, and a multi-user token is minted only for a
// subject that exists in the directory. Verification (bindSessionToConfiguration) then requires:
//   configuration legacy            → a legacy-issued session (`am` "legacy", or a pre-14B v2 / pre-R8 token without the claim);
//   configuration valid multi-user  → `am` === "multi-user" AND `sub` still present in BUILDER_USERS;
//   configuration malformed         → nothing is accepted (fail closed for EXISTING sessions, not only new logins).
// A legacy-issued token can therefore never become a server-owned identity after a cutover, a removed account loses its session
// at once, and BUILDER_SESSION_VERSION remains an additional global revocation on top — not the mechanism correctness relies on.
const AUTH_MODE_LEGACY = "legacy";
const AUTH_MODE_MULTI_USER = "multi-user";
function currentAuthMode(env = process.env) {
  const cfg = parseBuilderUsers(env);
  if (cfg.kind === "configured") return AUTH_MODE_MULTI_USER;
  if (cfg.kind === "legacy") return AUTH_MODE_LEGACY;
  return null;                                                                 // configuration-error
}
function bindSessionToConfiguration(payload) {
  const mode = currentAuthMode();
  if (mode === null) return null;                                              // malformed BUILDER_USERS: every teacher session fails closed
  const claim = payload.am;
  if (mode === AUTH_MODE_LEGACY) {
    return claim === undefined || claim === AUTH_MODE_LEGACY ? payload : null;  // compatibility: pre-14B tokens carry no claim
  }
  if (claim !== AUTH_MODE_MULTI_USER) return null;                             // a legacy-issued / unbound token is never a multi-user identity
  if (!getBuilderAccount(process.env, payload.sub)) return null;               // the account must still exist in the directory
  return payload;
}

function createBuilderToken(userCode) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured");
  }
  const mode = currentAuthMode();
  if (mode === null) throw new Error("BUILDER_USERS is malformed; no teacher session can be issued");
  const sub = String(userCode || "builder");
  if (mode === AUTH_MODE_MULTI_USER && !getBuilderAccount(process.env, sub)) throw new Error("Unknown builder account; no teacher session can be issued");
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ver: TOKEN_VERSION,
    role: "teacher",
    sub,
    am: mode,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    sv: getBuilderSessionVersion()
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayloadV2(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

// Shared structural checks for a decoded payload. Returns the payload or null. `ttlCapSeconds` bounds the
// maximum accepted lifetime so a forged/over-long token is rejected even if otherwise well-formed.
function validateTemporalClaims(payload, ttlCapSeconds) {
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload !== "object") return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
  if (payload.exp <= payload.iat) return null;
  if (payload.iat > now + CLOCK_SKEW_SECONDS) return null;                 // issued unreasonably in the future
  if (payload.exp <= now - CLOCK_SKEW_SECONDS) return null;               // expired (with small skew)
  if (payload.exp - payload.iat > ttlCapSeconds + CLOCK_SKEW_SECONDS) return null; // lifetime substantially over TTL
  return payload;
}

function verifyBuilderToken(token) {
  const secret = getSigningSecret();
  if (!secret || !token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [encodedPayload, suppliedSignature] = parts;

  let payload = null;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  // v2 token: strict validation + role/version separation.
  if (payload.ver === TOKEN_VERSION) {
    const expected = signPayloadV2(encodedPayload, secret);
    if (!timingSafeEqualText(suppliedSignature, expected)) return null;
    if (payload.role !== "teacher") return null;
    if (!validateTemporalClaims(payload, TOKEN_TTL_SECONDS)) return null;
    if (String(payload.sv || "") !== getBuilderSessionVersion()) return null;
    return bindSessionToConfiguration(payload);                                 // Review Fix 1: mode / directory binding
  }

  // Legacy (pre-R8) builder token: no `ver`, signed with the raw secret, payload {sub,iat,exp}. Bounded
  // migration ONLY while the deployment is still at the default session version "1": bumping
  // BUILDER_SESSION_VERSION away from "1" revokes ALL legacy teacher tokens (PR#67 review §C), honoring the
  // contract that a version bump invalidates every existing teacher session. Otherwise legacy tokens are
  // accepted within their ORIGINAL lifetime, only by THIS (builder) verifier — never cross-role.
  if (payload.ver === undefined) {
    if (getBuilderSessionVersion() !== "1") return null;
    if (currentAuthMode() !== AUTH_MODE_LEGACY) return null;                    // Review Fix 1: a pre-R8 token is a legacy-mode session only
    const expectedLegacy = signPayload(encodedPayload, secret);
    if (!timingSafeEqualText(suppliedSignature, expectedLegacy)) return null;
    if (payload.role !== undefined && payload.role !== "teacher") return null; // never accept a student payload
    // Legacy tokens predate iat validation; require at least a valid future exp and a sane lifetime.
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= now - CLOCK_SKEW_SECONDS) return null;
    if (Number.isInteger(payload.iat)) {
      if (payload.exp <= payload.iat) return null;
      if (payload.exp - payload.iat > TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null;
    }
    return { ver: 1, role: "teacher", sub: String(payload.sub || "builder"), iat: payload.iat, exp: payload.exp, legacy: true };
  }

  return null;
}

function getBearerToken(request) {
  const customToken = String(request.headers.get("x-builder-token") || "").trim();
  if (customToken) {
    return customToken;
  }
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function requireBuilderAuth(request) {
  const token = getBearerToken(request);
  const payload = verifyBuilderToken(token);
  if (!payload) {
    return { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };
  }
  return { ok: true, user: payload };
}

// Phase 14B — the authentication configuration state the login endpoints expose SAFELY (structure only, never a value):
// "legacy" (single shared builder password), "multi-user" (BUILDER_USERS) or "configuration-error" (a non-empty malformed
// BUILDER_USERS: every login is refused with 503 until an operator fixes it — never a silent fallback to the shared password).
function builderAuthConfigurationStatus(env = process.env) {
  const cfg = parseBuilderUsers(env);
  if (cfg.kind === "configured") return { mode: "multi-user", broken: false };
  if (cfg.kind === "configuration-error") return { mode: "configuration-error", broken: true, reason: cfg.reason };
  return { mode: "legacy", broken: false };
}

function validateBuilderCredentials(userCode, password) {
  const normalizedUserCode = String(userCode || "").trim();
  const passwordText = String(password || "");

  // Phase 14B — multi-user mode: the account's OWN server secret is the only accepted password. There is deliberately no
  // fallback to BUILDER_PASSWORD / BANK_SETUP_KEY / BUILDER_USER_CODE in this branch, an unknown account and a wrong
  // password are the same `false`, a missing / empty referenced secret refuses that account, and a malformed non-empty
  // BUILDER_USERS refuses everyone (fail closed).
  const accounts = parseBuilderUsers(process.env);
  if (accounts.kind !== "legacy") {
    if (accounts.kind !== "configured") return false;
    if (!normalizedUserCode || normalizedUserCode.length > 128 || passwordText.length > 512) return false;
    const secret = configuredPasswordFor(process.env, normalizedUserCode);
    if (!secret) return false;
    return timingSafeEqualText(passwordText, secret);
  }

  // Legacy single-teacher deployment (BUILDER_USERS absent / empty): unchanged.
  const configuredPassword = getBuilderPassword();
  const configuredUserCode = String(process.env.BUILDER_USER_CODE || "").trim();

  if (!configuredPassword) {
    throw new Error("BUILDER_PASSWORD or BANK_SETUP_KEY is not configured");
  }

  // Cheap bounds before any comparison work; also avoids pathological inputs. Generic failure (no
  // enumeration): an empty/oversized code or a code mismatch returns the same false as a wrong password.
  if (!normalizedUserCode || normalizedUserCode.length > 128 || passwordText.length > 512) {
    return false;
  }

  // When BUILDER_USER_CODE is configured, an exact server-side match is mandatory.
  if (configuredUserCode && normalizedUserCode !== configuredUserCode) {
    return false;
  }

  return timingSafeEqualText(passwordText, configuredPassword);
}

module.exports = {
  TOKEN_TTL_SECONDS,
  TOKEN_VERSION,
  CLOCK_SKEW_SECONDS,
  createBuilderToken,
  verifyBuilderToken,
  createSignedAssetParams,
  verifySignedAssetParams,
  requireBuilderAuth,
  validateBuilderCredentials,
  builderAuthConfigurationStatus,
  currentAuthMode,
  getBuilderSessionVersion
};
