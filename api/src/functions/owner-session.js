const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { deleteBlob, mutateJsonWithRetry, listBlobNames, downloadManyJson } = require("../lib/platform-storage");
const { safeDevice } = require("../lib/identity/qr-login");   // Tadris+ QR-4
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent, recordOwnerAuditEventStrict, recordOwnerChange, recordOwnerChangeAtWrite } = require("../lib/audit-log");   // Tadris+ P10-L
const { verifyAndConsumeSecondFactor } = require("../lib/identity/owner-mfa");
const { ownerSessionName, mutateOwnerAccount, newSessionId, createOnly, OWNER_SESSION_PREFIX } = require("../lib/identity/owner-store");
const { requireOwnerSession, stepUpValidUntilMs, stepUpDenial, createOwnerToken, OWNER_TOKEN_TTL_SECONDS, NO_STORE } = require("../lib/identity/owner-session");
const { generateRecoveryCodes, remainingRecoveryCodes } = require("../lib/identity/recovery-codes");
const { hashSecret, verifySecret } = require("../lib/identity/password-hash");
const { checkPassword, passwordPolicyMessage } = require("../lib/identity/password-policy");
const { generateTotpSecret, verifyTotp, otpauthUri, base32Encode } = require("../lib/identity/totp");
const { sealSecret, openSecret } = require("../lib/identity/secret-box");
const { TOTP_PURPOSE } = require("../lib/identity/owner-mfa");

// Tadris+ P1-A — the owner's session. Route: /api/owner-session/{action?}   (every call needs a valid owner session)
//
//   GET                        → who is signed in, session expiry, step-up validity, recovery codes left
//   POST logout                → deletes this session document (the token stops working at once)
//   POST step-up  { code | recoveryCode }  → a fresh second-factor check for sensitive actions (valid 10 minutes)
//   POST revoke-all            (needs step-up) → authVersion + 1: every owner session on every device ends
//   POST recovery-codes        (needs step-up) → 10 new recovery codes, shown once; the old ones stop working
//   Tadris+ P10-C (closes security review O9; design docs/enterprise-owner-credentials-p10c.md, owner decisions §19.39) —
//   each needs step-up AND the current password, behind the per-account bucket "owner-credentials:<accountId>":
//   POST password      { currentPassword, newPassword } → the password changes
//   POST totp-begin    { currentPassword } → a NEW authenticator secret (shown once, sealed in mfa.pendingTotp for
//                       15 minutes); the old authenticator stays valid
//   POST totp-confirm  { code }  (from the NEW app; needs step-up, not the password) → the new authenticator replaces the old,
//                       10 new recovery codes (shown once) replace the old ones
//   After password / totp-confirm: authVersion + 1 ends every owner session, and THIS device gets a new session + token
//   (owner decision: other devices end, this one stays). If that new session cannot be created the change still stands and
//   the answer is { ok: true, signInAgain: true } — never access with the old credentials.
//   Tadris+ QR-4 — «الأجهزة المرتبطة» for the owner (design docs/enterprise-qr-login-qr4.md, owner request):
//   POST devices               → this owner's live sessions, newest first: { id (SHA-256 of the session id, never the id), via,
//                                device (fixed words), createdAt, expiresAt, current }. Reads only.
//   POST end-device { id }     (needs step-up) → that one session ends (its document is deleted: refused from the next request);
//                                recorded strictly BEFORE it happens (P10-L). 404 when it is not one of this owner's live sessions.

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const PENDING_TOTP_MS = 15 * 60 * 1000;
const TOTP_ISSUER = "Tadris+";
const CREDENTIALS_ACTIONS = new Set(["password", "totp-begin", "totp-confirm"]);
const sessionGone = () => { const e = new Error("gone"); e.code = "SESSION_GONE"; return e; };
const fail = code => { const e = new Error(code); e.code = code; return e; };
const unavailable = () => reply(503, { ok: false, code: "OWNER_SESSION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

function view(owner, session) {
  return {
    ok: true,
    owner: { accountId: owner.accountId, username: owner.username, displayName: owner.displayName },
    session: { expiresAt: new Date(Number(session.expiresAtMs)).toISOString(), stepUpValidUntil: stepUpValidUntilMs(session) ? new Date(stepUpValidUntilMs(session)).toISOString() : null },
    recoveryCodesRemaining: remainingRecoveryCodes(owner.mfa?.recoveryCodes)
  };
}

const crypto = require("crypto");
const ownerSessionHash = sid => crypto.createHash("sha256").update("tadris-owner-session|" + String(sid), "utf8").digest("hex");
/** Tadris+ QR-4 — this owner's LIVE sessions (same account, current authVersion, unexpired), newest first. */
async function liveOwnerSessions(container, owner, nowMs, deps) {
  const names = await (deps.listBlobNames || listBlobNames)(container, OWNER_SESSION_PREFIX);
  const docs = await (deps.downloadManyJson || downloadManyJson)(container, names);
  return docs
    .filter(d => d && d.accountId === owner.accountId && /^[a-f0-9]{32}$/.test(String(d.sid)) && d.authVersion === owner.authVersion && Number(d.expiresAtMs) > nowMs)
    .sort((a, b) => Number(b.createdAtMs) - Number(a.createdAtMs));
}
const deviceView = (d, currentSid) => ({
  id: ownerSessionHash(d.sid), via: d.factor === "qr" ? "qr" : "login", device: safeDevice(d.device),
  createdAt: new Date(Number(d.createdAtMs)).toISOString(), expiresAt: new Date(Number(d.expiresAtMs)).toISOString(), current: d.sid === currentSid
});

async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

/**
 * Tadris+ P10-C — THIS device keeps a session after its credentials changed: a new session document (new sid) at the new
 * authVersion, keeping the old session's step-up time (the change is not itself a new step-up), then a new token. The old
 * session document is deleted. → { token, expiresInSeconds } or null when the new session could not be created (the change
 * stands; the owner signs in again with the new credentials).
 */
async function reissueThisDevice(container, account, session, nowMs, env) {
  try {
    const sid = newSessionId();
    const created = await createOnly(container, ownerSessionName(sid), {
      schemaVersion: 1, sid, accountId: account.accountId, authVersion: account.authVersion,
      createdAtMs: nowMs, expiresAtMs: nowMs + OWNER_TOKEN_TTL_SECONDS * 1000, stepUpAtMs: Number(session.stepUpAtMs) || 0, factor: session.factor,
      device: safeDevice(session.device)   // Tadris+ QR-4 — the same device keeps its words
    });
    if (!created) return null;
    const { token } = createOwnerToken({ accountId: account.accountId, sid, authVersion: account.authVersion }, { nowMs, env });
    await deleteBlob(container, ownerSessionName(session.sid)).catch(() => {});
    return { token, expiresInSeconds: OWNER_TOKEN_TTL_SECONDS };
  } catch {
    return null;
  }
}

/** The account is still the one this session was issued for (a concurrent change, suspension or revoke-all ends it). */
function assertSameAccountState(current, session) {
  if (current.status !== "active" || current.authVersion !== session.authVersion) throw sessionGone();
}

async function changeCredentials(action, request, { owner, session, container, actor, auditBestEffort, write, nowMs, env, deps }) {
  const denial = stepUpDenial(session, nowMs);
  if (denial) return denial;
  const body = await readBody(request);
  const currentPassword = String(body.currentPassword ?? ""), newPassword = String(body.newPassword ?? "");
  const code = String(body.code ?? "").replace(/\s/g, "");
  if (currentPassword.length > 1024 || newPassword.length > 1024 || code.length > 16) return reply(400, { ok: false, code: "INVALID_INPUT", error: "بيانات غير صالحة." });
  if (action === "password" && (!currentPassword || !newPassword)) return reply(400, { ok: false, code: "INVALID_INPUT", error: "كلمة المرور الحالية والجديدة مطلوبتان." });
  if (action === "totp-begin" && !currentPassword) return reply(400, { ok: false, code: "INVALID_INPUT", error: "كلمة المرور الحالية مطلوبة." });
  if (action === "totp-confirm" && !code) return reply(400, { ok: false, code: "INVALID_INPUT", error: "رمز التحقق من التطبيق الجديد مطلوب." });

  const throttleId = "owner-credentials:" + owner.accountId;
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  const gate = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, throttleId, clientId, deps).catch(() => ({ allowed: false, retryAfterSeconds: 5 }));
  if (!gate.allowed) return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(gate.retryAfterSeconds || 5) });
  const cleared = () => (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);

  if (action !== "totp-confirm" && !(await verifySecret(currentPassword, owner.credential))) {
    await auditBestEffort(container, { actor, action: action === "password" ? "owner.password.change-failed" : "owner.totp.reenrol-failed", targetType: "owner-account", targetId: owner.accountId, details: { stage: "current-password" } });
    return reply(401, { ok: false, code: "CURRENT_PASSWORD_INVALID", error: "كلمة المرور الحالية غير صحيحة." });
  }

  if (action === "password") {
    const policy = checkPassword(newPassword, { role: "owner", username: owner.username });
    if (!policy.ok) return reply(400, { ok: false, code: "PASSWORD_" + policy.code, error: passwordPolicyMessage(policy) });
    if (await verifySecret(newPassword, owner.credential)) return reply(400, { ok: false, code: "PASSWORD_SAME", error: "كلمة المرور الجديدة يجب أن تختلف عن الحالية." });
    const credential = await hashSecret(newPassword, deps.hashParams ? { params: deps.hashParams } : {});
    const iso = new Date(nowMs).toISOString();
    // Tadris+ P10-L (O14) — recorded BEFORE the password changes: no record → 503 and the password stays as it was.
    return await recordOwnerChange(container, { actor, action: "owner.password.changed", targetType: "owner-account", targetId: owner.accountId }, async () => {
      const updated = await mutateOwnerAccount(container, owner.accountId, current => {
        assertSameAccountState(current, session);
        return { ...current, credential, authVersion: Number(current.authVersion) + 1, passwordChangedAt: iso, updatedAt: iso };
      });
      await cleared();
      const device = await reissueThisDevice(container, updated, session, nowMs, env);
      return reply(200, device ? { ok: true, ...device } : { ok: true, signInAgain: true });
    }, { write });
  }

  if (action === "totp-begin") {
    const secret = generateTotpSecret();
    const sealed = sealSecret(secret, { purpose: TOTP_PURPOSE, aad: owner.accountId, env });
    return await recordOwnerChange(container, { actor, action: "owner.totp.reenrol-started", targetType: "owner-account", targetId: owner.accountId }, async () => {
      await mutateOwnerAccount(container, owner.accountId, current => {
        assertSameAccountState(current, session);
        const mfa = current.mfa || {};
        return { ...current, mfa: { ...mfa, pendingTotp: { sealed, createdAtMs: nowMs, expiresAtMs: nowMs + PENDING_TOTP_MS } }, updatedAt: new Date(nowMs).toISOString() };
      });
      await cleared();
      return reply(200, {
        ok: true,
        totp: { issuer: TOTP_ISSUER, account: owner.username, secret: base32Encode(secret), uri: otpauthUri({ issuer: TOTP_ISSUER, account: owner.username, secret }) },
        expiresInSeconds: PENDING_TOTP_MS / 1000
      });
    }, { write });
  }

  // totp-confirm: the new authenticator is proved and swapped in, with new recovery codes, in ONE compare-and-set write
  // against the freshest account (a second, concurrent confirm finds pendingTotp gone).
  // Tadris+ P10-L (O14) — the code is checked inside that write's preparation, so the record is written at the write itself: a wrong
  // or expired code writes, and records, nothing; a record that cannot be written stops the swap (503).
  return await recordOwnerChangeAtWrite(container, { actor, action: "owner.totp.reenrolled", targetType: "owner-account", targetId: owner.accountId }, async guarded => {
  let fresh = null;
  let updated;
  try {
    updated = await mutateOwnerAccount(guarded, owner.accountId, current => {
      assertSameAccountState(current, session);
      const mfa = current.mfa || {};
      const pending = mfa.pendingTotp;
      if (!pending || !(Number(pending.expiresAtMs) > nowMs)) throw fail("TOTP_REENROL_NOT_STARTED");
      const secret = openSecret(pending.sealed, { purpose: TOTP_PURPOSE, aad: current.accountId, env });
      if (!secret) throw fail("TOTP_REENROL_NOT_STARTED");
      const result = verifyTotp(secret, code, { nowMs });
      if (!result.ok) throw fail("TOTP_INVALID");
      fresh = generateRecoveryCodes();
      const iso = new Date(nowMs).toISOString();
      const { pendingTotp: _done, ...rest } = mfa;
      return {
        ...current,
        mfa: { ...rest, totp: { sealed: pending.sealed, lastUsedStep: result.step, enrolledAt: iso }, recoveryCodes: fresh.records },
        authVersion: Number(current.authVersion) + 1,
        updatedAt: iso
      };
    });
  } catch (e) {
    if (e?.code === "TOTP_REENROL_NOT_STARTED") return reply(409, { ok: false, code: "TOTP_REENROL_NOT_STARTED", error: "انتهت مهلة ربط التطبيق الجديد. ابدأ من جديد." });
    if (e?.code === "TOTP_INVALID") {
      await auditBestEffort(container, { actor, action: "owner.totp.reenrol-failed", targetType: "owner-account", targetId: owner.accountId, details: { stage: "new-code" } });
      return reply(401, { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح. أدخل الرمز الذي يظهر في التطبيق الجديد." });
    }
    throw e;
  }
  await cleared();
  const device = await reissueThisDevice(container, updated, session, nowMs, env);
  return reply(200, device ? { ok: true, ...device, recoveryCodes: fresh.codes } : { ok: true, signInAgain: true, recoveryCodes: fresh.codes });
  }, { write });
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const env = deps.env || process.env;
  // Tadris+ P10-L (O14) — owner changes are recorded strictly BEFORE they happen (`write`); signing out, the recent step-up and failed
  // attempts stay best effort (owner decision §19.49: «صارم لكل تغيير، لا للدخول»).
  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;
  const auditBestEffort = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && (!action || action === "me")) return reply(200, view(owner, session));
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });

    if (action === "logout") {
      await deleteBlob(container, ownerSessionName(session.sid));
      await auditBestEffort(container, { actor, action: "owner.logout", targetType: "owner-session", targetId: owner.accountId });
      return reply(200, { ok: true });
    }

    if (action === "step-up") {
      let body = {};
      try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
      const code = String(body.code ?? "").replace(/\s/g, ""), recoveryCode = String(body.recoveryCode ?? "").trim();
      if ((!code && !recoveryCode) || code.length > 16 || recoveryCode.length > 32) return reply(400, { ok: false, code: "INVALID_INPUT", error: "رمز التحقق مطلوب." });
      const throttleId = "owner-step-up:" + owner.accountId;
      const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
      const gate = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, throttleId, clientId, deps).catch(() => ({ allowed: false, retryAfterSeconds: 5 }));
      if (!gate.allowed) return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(gate.retryAfterSeconds || 5) });
      const factor = await verifyAndConsumeSecondFactor(container, owner.accountId, { code, recoveryCode }, { nowMs, env });
      if (!factor.ok) {
        await auditBestEffort(container, { actor, action: "owner.step-up.failed", targetType: "owner-session", targetId: owner.accountId });
        return reply(401, { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح." });
      }
      const updated = await mutateJsonWithRetry(container, ownerSessionName(session.sid), current => {
        if (!current || current.sid !== session.sid) { const e = new Error("gone"); e.code = "SESSION_GONE"; throw e; }
        return { ...current, stepUpAtMs: nowMs };
      });
      await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);
      await auditBestEffort(container, { actor, action: "owner.step-up.succeeded", targetType: "owner-session", targetId: owner.accountId, details: { factor: factor.method } });
      return reply(200, view(factor.account, updated));
    }

    // Tadris+ QR-4 — «الأجهزة المرتبطة»: list (reads only) and end one (step-up, recorded first).
    if (action === "devices") {
      const live = await liveOwnerSessions(container, owner, nowMs, deps);
      return reply(200, { ok: true, role: "owner", devices: live.map(d => deviceView(d, session.sid)), untracked: false });
    }
    if (action === "end-device") {
      const denial = stepUpDenial(session, nowMs);
      if (denial) return denial;
      const body = await readBody(request);
      const id = String(body.id || "");
      if (!/^[a-f0-9]{64}$/.test(id)) return reply(404, { ok: false, code: "DEVICE_NOT_FOUND", error: "لم يعد هذا الجهاز مرتبطًا بحسابك." });
      const target = (await liveOwnerSessions(container, owner, nowMs, deps)).find(d => ownerSessionHash(d.sid) === id);
      if (!target) return reply(404, { ok: false, code: "DEVICE_NOT_FOUND", error: "لم يعد هذا الجهاز مرتبطًا بحسابك." });
      const current = target.sid === session.sid;
      return await recordOwnerChange(container, { actor, action: "owner.session.device-ended", targetType: "owner-session", targetId: owner.accountId, details: { current, device: safeDevice(target.device) } }, async () => {
        await deleteBlob(container, ownerSessionName(target.sid));
        return reply(200, { ok: true, ended: true, current });
      }, { write });
    }

    if (CREDENTIALS_ACTIONS.has(action)) return await changeCredentials(action, request, { owner, session, container, actor, auditBestEffort, write, nowMs, env, deps });

    if (action === "revoke-all" || action === "recovery-codes") {
      const denial = stepUpDenial(session, nowMs);
      if (denial) return denial;
      if (action === "revoke-all") {
        return await recordOwnerChange(container, { actor, action: "owner.sessions.revoked", targetType: "owner-account", targetId: owner.accountId }, async () => {
          await mutateOwnerAccount(container, owner.accountId, current => ({ ...current, authVersion: Number(current.authVersion) + 1, updatedAt: new Date(nowMs).toISOString() }));
          return reply(200, { ok: true });
        }, { write });
      }
      const fresh = generateRecoveryCodes();
      return await recordOwnerChange(container, { actor, action: "owner.recovery-codes.regenerated", targetType: "owner-account", targetId: owner.accountId }, async () => {
        await mutateOwnerAccount(container, owner.accountId, current => ({ ...current, mfa: { ...(current.mfa || {}), recoveryCodes: fresh.records }, updatedAt: new Date(nowMs).toISOString() }));
        return reply(200, { ok: true, recoveryCodes: fresh.codes });
      }, { write });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    if (e?.code === "SESSION_GONE" || e?.code === "OWNER_NOT_FOUND") return reply(401, { ok: false, code: "OWNER_SESSION_REVOKED", error: "انتهت الجلسة. سجّل الدخول مرة أخرى." });
    obs?.logError("owner.session.error", e, { action });
    return unavailable();
  }
}

app.http("ownerSession", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-session/{action?}", handler: withObservability("owner-session", handler) });
module.exports = { handler };
