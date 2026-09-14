const crypto = require("crypto");

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

function createBuilderToken(userCode) {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error("BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ver: TOKEN_VERSION,
    role: "teacher",
    sub: String(userCode || "builder"),
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
    return payload;
  }

  // Legacy (pre-R8) builder token: no `ver`, signed with the raw secret, payload {sub,iat,exp}. Accepted
  // only within its ORIGINAL lifetime and only by THIS (builder) verifier — never cross-role. It carries
  // no session version, so a BUILDER_SESSION_VERSION bump does not revoke it; it expires naturally (≤8h).
  if (payload.ver === undefined) {
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

function validateBuilderCredentials(userCode, password) {
  const configuredPassword = getBuilderPassword();
  const configuredUserCode = String(process.env.BUILDER_USER_CODE || "").trim();

  if (!configuredPassword) {
    throw new Error("BUILDER_PASSWORD or BANK_SETUP_KEY is not configured");
  }

  const normalizedUserCode = String(userCode || "").trim();
  const passwordText = String(password || "");

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
  getBuilderSessionVersion
};
