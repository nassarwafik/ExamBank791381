const crypto = require("crypto");
const { getContainer, downloadJsonOrNull } = require("../platform-storage");
const { ACCOUNT_ID_RE, SESSION_ID_RE, ownerSessionName, readOwnerAccount } = require("./owner-store");

// Tadris+ P1-A — owner sessions (owner decision D5).
//
// Token: base64url(JSON payload) "." HMAC-SHA256 with a key derived for the OWNER context
//   ("ExamBank791381:owner-session:v1"), from OWNER_SESSION_SECRET || BUILDER_SESSION_SECRET || BANK_SETUP_KEY.
// The derived key differs from the teacher and student contexts, so an owner token never verifies as a teacher or student
// token and vice-versa, even when every role falls back to the same root secret.
//
// Claims: { ver: 1, role: "owner", sub: <accountId>, sid, av, iat, exp }. Lifetime: 2 hours, absolute (no refresh).
// The token alone is never enough. Every request also requires, read from storage:
//   - the server-side session document  platform/sessions/owners/<sid>.json  (logout deletes it),
//   - the owner account: status "active" and authVersion === av (revoke-all bumps it).
// Storage unavailable → 503 (fail closed), never "allowed".

const OWNER_CONTEXT = "ExamBank791381:owner-session:v1";
const OWNER_TOKEN_TTL_SECONDS = 2 * 60 * 60;
const CLOCK_SKEW_SECONDS = 120;
const STEP_UP_SECONDS = 10 * 60;      // sensitive actions need a second-factor check this recent
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };

function ownerSigningSecret(env = process.env) {
  return env.OWNER_SESSION_SECRET || env.BUILDER_SESSION_SECRET || env.BANK_SETUP_KEY || "";
}

function ownerKey(env) {
  const secret = ownerSigningSecret(env);
  if (!secret) throw new Error("No signing secret is configured for owner sessions.");
  return crypto.createHmac("sha256", secret).update(OWNER_CONTEXT).digest();
}

function createOwnerToken({ accountId, sid, authVersion }, { nowMs = Date.now(), env = process.env } = {}) {
  if (!ACCOUNT_ID_RE.test(String(accountId)) || !SESSION_ID_RE.test(String(sid))) throw new Error("Invalid owner session identity.");
  const av = Number(authVersion);
  if (!Number.isInteger(av) || av < 1) throw new Error("Invalid owner auth version.");
  const iat = Math.floor(nowMs / 1000);
  const payload = { ver: 1, role: "owner", sub: accountId, sid, av, iat, exp: iat + OWNER_TOKEN_TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", ownerKey(env)).update(encoded).digest("base64url");
  return { token: encoded + "." + signature, payload };
}

/** → payload or null. Signature, role, version, shapes and lifetime are all checked. */
function verifyOwnerToken(token, { nowMs = Date.now(), env = process.env } = {}) {
  try {
    const text = String(token || "");
    if (text.length > 2048) return null;
    const parts = text.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const [encoded, signature] = parts;
    const expected = crypto.createHmac("sha256", ownerKey(env)).update(encoded).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload || payload.ver !== 1 || payload.role !== "owner") return null;
    if (!ACCOUNT_ID_RE.test(String(payload.sub)) || !SESSION_ID_RE.test(String(payload.sid))) return null;
    if (!Number.isInteger(payload.av) || payload.av < 1) return null;
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null;
    if (payload.exp - payload.iat > OWNER_TOKEN_TTL_SECONDS) return null;
    const now = Math.floor(nowMs / 1000);
    if (payload.iat > now + CLOCK_SKEW_SECONDS) return null;
    if (payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

function ownerTokenFromRequest(request) {
  try {
    const direct = String(request.headers.get("x-owner-token") || "").trim();
    if (direct) return direct;
    const auth = String(request.headers.get("authorization") || "").trim();
    if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  } catch { /* headers absent */ }
  return "";
}

function deny(status, code, error) {
  return { ok: false, response: { status, headers: NO_STORE, jsonBody: { ok: false, code, error } } };
}

/**
 * Server-authoritative owner check for a request.
 * → { ok: true, owner, session, payload, container } or { ok: false, response }.
 */
async function requireOwnerSession(request, deps = {}) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const payload = verifyOwnerToken(ownerTokenFromRequest(request), { nowMs, env: deps.env || process.env });
  if (!payload) return deny(401, "OWNER_SESSION_REQUIRED", "يلزم تسجيل دخول مالك المنصة.");
  let container, session, owner;
  try {
    container = (deps.getContainer || getContainer)();
    [session, owner] = await Promise.all([
      downloadJsonOrNull(container, ownerSessionName(payload.sid)),
      readOwnerAccount(container, payload.sub)
    ]);
  } catch {
    return deny(503, "OWNER_SESSION_UNAVAILABLE", "تعذر التحقق من الجلسة حاليًا. حاول مرة أخرى.");
  }
  const revoked = () => deny(401, "OWNER_SESSION_REVOKED", "انتهت الجلسة. سجّل الدخول مرة أخرى.");
  if (!session || session.sid !== payload.sid || session.accountId !== payload.sub) return revoked();
  if (!(Number(session.expiresAtMs) > nowMs)) return revoked();
  if (session.authVersion !== payload.av) return revoked();
  if (!owner || owner.status !== "active" || owner.authVersion !== payload.av) return revoked();
  return { ok: true, owner, session, payload, container };
}

function stepUpValidUntilMs(session) {
  const at = Number(session?.stepUpAtMs);
  return Number.isFinite(at) && at > 0 ? at + STEP_UP_SECONDS * 1000 : 0;
}

/** null when the session has a recent second-factor check, otherwise a 403 STEP_UP_REQUIRED response. */
function stepUpDenial(session, nowMs = Date.now()) {
  if (stepUpValidUntilMs(session) > nowMs) return null;
  return { status: 403, headers: NO_STORE, jsonBody: { ok: false, code: "STEP_UP_REQUIRED", error: "هذا الإجراء يتطلب إدخال رمز التحقق مرة أخرى." } };
}

module.exports = {
  OWNER_CONTEXT, OWNER_TOKEN_TTL_SECONDS, CLOCK_SKEW_SECONDS, STEP_UP_SECONDS, NO_STORE,
  createOwnerToken, verifyOwnerToken, ownerTokenFromRequest, requireOwnerSession, stepUpValidUntilMs, stepUpDenial
};
