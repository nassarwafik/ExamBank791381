const crypto = require("crypto");
const { getContainer, downloadJsonOrNull } = require("./platform-storage");

// Roadmap #8 — Auth / Session Hardening (student side).
const STUDENT_TOKEN_TTL_SECONDS = 12 * 60 * 60;   // student session lifetime (unchanged)
const CLOCK_SKEW_SECONDS = 120;
const TOKEN_VERSION = 2;
const PASSWORD_KEY_LENGTH = 64;
// v2 signing purpose (see builder-auth for the cross-role separation rationale). Legacy (pre-R8) student
// tokens signed "student-session\n"+payload with the raw secret; that scheme is kept for bounded migration.
const STUDENT_CONTEXT = "ExamBank791381:student-session:v2";

function getStudentSigningSecret() {
  return (
    process.env.STUDENT_SESSION_SECRET ||
    process.env.BUILDER_SESSION_SECRET ||
    process.env.BANK_SETUP_KEY ||
    ""
  );
}

function timingSafeEqualText(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue || ""), "utf8");
  const right = Buffer.from(String(rightValue || ""), "utf8");
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function normalizeStudentCode(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase();
}

function isValidStudentCode(value) {
  const normalized = normalizeStudentCode(value);
  return normalized.length >= 3 && normalized.length <= 40 && /^[A-Z0-9._-]+$/.test(normalized);
}

function studentCodeHash(value) {
  return crypto.createHash("sha256").update(normalizeStudentCode(value)).digest("hex");
}

// Server-authoritative student session version. Missing/invalid legacy value normalizes to 1. Incremented
// on every password reset/regeneration so previously issued tokens are revoked immediately.
function normalizeAuthVersion(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("base64")) {
  const passwordText = String(password || "");
  if (passwordText.length < 6) {
    throw new Error("Student password must contain at least 6 characters.");
  }
  const passwordHash = crypto.scryptSync(passwordText, salt, PASSWORD_KEY_LENGTH).toString("base64");
  return { salt, passwordHash };
}

function verifyPassword(password, salt, expectedHash) {
  try {
    const derived = crypto.scryptSync(String(password || ""), String(salt || ""), PASSWORD_KEY_LENGTH).toString("base64");
    return timingSafeEqualText(derived, expectedHash);
  } catch {
    return false;
  }
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded) {
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

function deriveRoleKey(secret, context) {
  return crypto.createHmac("sha256", secret).update(context).digest();
}

// Legacy (pre-R8) signature scheme.
function signStudentPayloadLegacy(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update("student-session\n" + encodedPayload).digest("base64url");
}

// v2 signature: role-derived key over the encoded payload.
function signStudentPayloadV2(encodedPayload, secret) {
  return crypto.createHmac("sha256", deriveRoleKey(secret, STUDENT_CONTEXT)).update(encodedPayload).digest("base64url");
}

function createStudentToken(student) {
  const secret = getStudentSigningSecret();
  if (!secret) {
    throw new Error("STUDENT_SESSION_SECRET, BUILDER_SESSION_SECRET or BANK_SETUP_KEY is not configured.");
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ver: TOKEN_VERSION,
    role: "student",
    sub: String(student.userId || ""),
    iat: now,
    exp: now + STUDENT_TOKEN_TTL_SECONDS,
    sv: normalizeAuthVersion(student.authVersion),
    // Display-only fields kept for backward compatibility. NEVER trusted for authorization — the current
    // persisted student document is authoritative (see requireActiveStudentSession).
    code: String(student.code || ""),
    name: String(student.displayName || ""),
    classId: String(student.classId || "")
  };
  const encoded = encodePayload(payload);
  const signature = signStudentPayloadV2(encoded, secret);
  return encoded + "." + signature;
}

function validateTemporalClaims(payload, ttlCapSeconds) {
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload !== "object") return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
  if (payload.exp <= payload.iat) return null;
  if (payload.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (payload.exp <= now - CLOCK_SKEW_SECONDS) return null;
  if (payload.exp - payload.iat > ttlCapSeconds + CLOCK_SKEW_SECONDS) return null;
  return payload;
}

function verifyStudentToken(token) {
  const secret = getStudentSigningSecret();
  if (!secret || !token || typeof token !== "string") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const [encoded, suppliedSignature] = parts;

  let payload = null;
  try {
    payload = decodePayload(encoded);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;

  // v2 student token.
  if (payload.ver === TOKEN_VERSION) {
    const expected = signStudentPayloadV2(encoded, secret);
    if (!timingSafeEqualText(suppliedSignature, expected)) return null;
    if (payload.role !== "student") return null;
    if (!validateTemporalClaims(payload, STUDENT_TOKEN_TTL_SECONDS)) return null;
    // PR#67 review §4 — a v2 token MUST carry an explicit integer sv >= 1. A missing / null / 0 / negative /
    // float / string sv is rejected outright (never silently normalized to 1); only LEGACY tokens with no
    // sv are allowed to normalize to 1 downstream.
    if (!Number.isInteger(payload.sv) || payload.sv < 1) return null;
    return payload;
  }

  // Legacy (pre-R8) student token: no `ver`, signed with the "student-session\n" scheme. Accepted only
  // within its ORIGINAL lifetime and only by THIS (student) verifier. It has no `sv`; the active-session
  // helper normalizes a missing sv to 1, so a password reset (authVersion bump) revokes it (§5).
  if (payload.ver === undefined) {
    const expectedLegacy = signStudentPayloadLegacy(encoded, secret);
    if (!timingSafeEqualText(suppliedSignature, expectedLegacy)) return null;
    if (payload.role !== "student") return null;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isInteger(payload.exp) || payload.exp <= now - CLOCK_SKEW_SECONDS) return null;
    if (Number.isInteger(payload.iat)) {
      if (payload.exp <= payload.iat) return null;
      if (payload.exp - payload.iat > STUDENT_TOKEN_TTL_SECONDS + CLOCK_SKEW_SECONDS) return null;
    }
    return { ...payload, ver: 1, role: "student", legacy: true };
  }

  return null;
}

function getStudentToken(request) {
  const customToken = String(
    request.headers.get("x-student-token") ||
    request.headers.get("x-platform-token") ||
    ""
  ).trim();
  if (customToken) {
    return customToken;
  }
  const authorization = String(request.headers.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

// Stateless token check only (signature + structure + expiry + role). Does NOT consult the current student
// document — endpoints must additionally use requireActiveStudentSession for revocation/active/version.
function requireStudentAuth(request) {
  const payload = verifyStudentToken(getStudentToken(request));
  if (!payload) {
    return { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };
  }
  return { ok: true, user: payload };
}

const UNAUTHORIZED = { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } };

// Hardened, server-authoritative student session check (§6/§7). Verifies the token AND loads the current
// student document, rejecting when the student is missing / inactive / archived, or when the token's
// session version (sv) no longer matches the student's current authVersion (immediate post-reset
// revocation). Returns { ok, user, student, container } so callers reuse the loaded document + container
// with no duplicate reads. `deps` (getContainer/downloadJsonOrNull/container) is the test seam.
async function requireActiveStudentSession(request, deps = {}) {
  const auth = (deps.requireStudentAuth || requireStudentAuth)(request);
  if (!auth.ok) return auth;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const container = deps.container || (deps.getContainer || getContainer)();
  const student = await dl(container, "platform/users/" + auth.user.sub + ".json");
  if (!student || student.active === false || student.archived === true) {
    return UNAUTHORIZED;
  }
  if (normalizeAuthVersion(auth.user.sv) !== normalizeAuthVersion(student.authVersion)) {
    return UNAUTHORIZED;
  }
  return { ok: true, user: auth.user, student, container };
}

function generateTemporaryPassword(length = 9) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let result = "";
  const bytes = crypto.randomBytes(Math.max(8, length));
  for (let index = 0; index < length; index += 1) {
    result += alphabet[bytes[index] % alphabet.length];
  }
  return result;
}

module.exports = {
  STUDENT_TOKEN_TTL_SECONDS,
  TOKEN_VERSION,
  CLOCK_SKEW_SECONDS,
  normalizeStudentCode,
  isValidStudentCode,
  studentCodeHash,
  normalizeAuthVersion,
  hashPassword,
  verifyPassword,
  createStudentToken,
  verifyStudentToken,
  requireStudentAuth,
  requireActiveStudentSession,
  generateTemporaryPassword
};
