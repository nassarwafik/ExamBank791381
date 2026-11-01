const crypto = require("crypto");
const { getSigningSecret, getBuilderSessionVersion, getBearerToken, TOKEN_TTL_SECONDS, CLOCK_SKEW_SECONDS } = require("../builder-auth");

// Tadris+ P2-A2 — the session token of a MANAGED teacher account (created by the owner, owner decisions §19.3).
//
//   base64url(payload) "." HMAC-SHA256 with a key derived for the context "ExamBank791381:teacher-session:v3"
//   payload: { ver: 3, role: "teacher", sub: <accountId>, am: "managed", sid, av, iat, exp, sv }
//
// Same root secret and the same headers (x-builder-token / Bearer) as the existing teacher token, but a DIFFERENT context and
// version: builder-auth's verifyBuilderToken refuses it (it knows only v2 and legacy), so no synchronous check can ever accept a
// managed session. Only requireTeacherSession (lib/teacher-session.js) accepts it, and only after reading the account: status
// "active", authVersion === av, and the session id not revoked. BUILDER_SESSION_VERSION still revokes every teacher session.

const MANAGED_CONTEXT = "ExamBank791381:teacher-session:v3";
/** The ids the Owner Console issues for the teachers it creates ("t_" + 16 hex). */
const ACCOUNT_ID_RE = /^t_[a-f0-9]{16}$/;
const SESSION_ID_RE = /^[a-f0-9]{32}$/;
// Tadris+ P2-B — the ONE account the owner may create, once, for the workspace of the shared-password mode (owner decisions D6,
// D7): a fixed id, never a personal identity number and never what was typed at the old sign-in. It is not a console id, so it
// keeps that workspace's view of pre-tenancy data (teacher-tenancy.js); nothing else can be issued this id.
const LEGACY_TEACHER_ACCOUNT_ID = "t_legacy";

/** Whether `id` is a managed teacher account id: one the console issued, or the imported shared-password workspace. */
function isTeacherAccountId(id) {
  const s = String(id);
  return ACCOUNT_ID_RE.test(s) || s === LEGACY_TEACHER_ACCOUNT_ID;
}

function keyFor(secret) { return crypto.createHmac("sha256", secret).update(MANAGED_CONTEXT).digest(); }

function newTeacherSessionId() { return crypto.randomBytes(16).toString("hex"); }

function createManagedTeacherToken({ accountId, sid, authVersion }, { nowMs = Date.now() } = {}) {
  const secret = getSigningSecret();
  if (!secret) throw new Error("No teacher signing secret is configured.");
  if (!isTeacherAccountId(accountId) || !SESSION_ID_RE.test(String(sid))) throw new Error("Invalid managed teacher session identity.");
  const av = Number(authVersion);
  if (!Number.isInteger(av) || av < 1) throw new Error("Invalid teacher auth version.");
  const iat = Math.floor(nowMs / 1000);
  const payload = { ver: 3, role: "teacher", sub: accountId, am: "managed", sid, av, iat, exp: iat + TOKEN_TTL_SECONDS, sv: getBuilderSessionVersion() };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: encoded + "." + crypto.createHmac("sha256", keyFor(secret)).update(encoded).digest("base64url"), payload };
}

/** Signature, shape and lifetime only (no storage). → payload or null. */
function verifyManagedTeacherToken(token, { nowMs = Date.now() } = {}) {
  try {
    const secret = getSigningSecret();
    const text = String(token || "");
    if (!secret || !text || text.length > 2048) return null;
    const parts = text.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = crypto.createHmac("sha256", keyFor(secret)).update(parts[0]).digest();
    const given = Buffer.from(parts[1], "base64url");
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!p || p.ver !== 3 || p.role !== "teacher" || p.am !== "managed") return null;
    if (!isTeacherAccountId(p.sub) || !SESSION_ID_RE.test(String(p.sid))) return null;
    if (!Number.isInteger(p.av) || p.av < 1 || !Number.isInteger(p.iat) || !Number.isInteger(p.exp)) return null;
    const now = Math.floor(nowMs / 1000);
    if (p.exp - p.iat > TOKEN_TTL_SECONDS) return null;
    if (p.iat > now + CLOCK_SKEW_SECONDS || p.exp <= now) return null;
    if (String(p.sv || "") !== getBuilderSessionVersion()) return null;
    return p;
  } catch {
    return null;
  }
}

function managedTeacherClaim(request, opts) {
  try { return verifyManagedTeacherToken(getBearerToken(request), opts); } catch { return null; }
}

module.exports = { MANAGED_CONTEXT, ACCOUNT_ID_RE, SESSION_ID_RE, LEGACY_TEACHER_ACCOUNT_ID, isTeacherAccountId, newTeacherSessionId, createManagedTeacherToken, verifyManagedTeacherToken, managedTeacherClaim };
