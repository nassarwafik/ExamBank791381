const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { deleteBlob, mutateJsonWithRetry } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { verifyAndConsumeSecondFactor } = require("../lib/identity/owner-mfa");
const { ownerSessionName, mutateOwnerAccount } = require("../lib/identity/owner-store");
const { requireOwnerSession, stepUpValidUntilMs, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { generateRecoveryCodes, remainingRecoveryCodes } = require("../lib/identity/recovery-codes");

// Tadris+ P1-A — the owner's session. Route: /api/owner-session/{action?}   (every call needs a valid owner session)
//
//   GET                        → who is signed in, session expiry, step-up validity, recovery codes left
//   POST logout                → deletes this session document (the token stops working at once)
//   POST step-up  { code | recoveryCode }  → a fresh second-factor check for sensitive actions (valid 10 minutes)
//   POST revoke-all            (needs step-up) → authVersion + 1: every owner session on every device ends
//   POST recovery-codes        (needs step-up) → 10 new recovery codes, shown once; the old ones stop working

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unavailable = () => reply(503, { ok: false, code: "OWNER_SESSION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

function view(owner, session) {
  return {
    ok: true,
    owner: { accountId: owner.accountId, username: owner.username, displayName: owner.displayName },
    session: { expiresAt: new Date(Number(session.expiresAtMs)).toISOString(), stepUpValidUntil: stepUpValidUntilMs(session) ? new Date(stepUpValidUntilMs(session)).toISOString() : null },
    recoveryCodesRemaining: remainingRecoveryCodes(owner.mfa?.recoveryCodes)
  };
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const env = deps.env || process.env;
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
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
      await audit(container, { actor, action: "owner.logout", targetType: "owner-session", targetId: owner.accountId });
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
        await audit(container, { actor, action: "owner.step-up.failed", targetType: "owner-session", targetId: owner.accountId });
        return reply(401, { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح." });
      }
      const updated = await mutateJsonWithRetry(container, ownerSessionName(session.sid), current => {
        if (!current || current.sid !== session.sid) { const e = new Error("gone"); e.code = "SESSION_GONE"; throw e; }
        return { ...current, stepUpAtMs: nowMs };
      });
      await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);
      await audit(container, { actor, action: "owner.step-up.succeeded", targetType: "owner-session", targetId: owner.accountId, details: { factor: factor.method } });
      return reply(200, view(factor.account, updated));
    }

    if (action === "revoke-all" || action === "recovery-codes") {
      const denial = stepUpDenial(session, nowMs);
      if (denial) return denial;
      if (action === "revoke-all") {
        await mutateOwnerAccount(container, owner.accountId, current => ({ ...current, authVersion: Number(current.authVersion) + 1, updatedAt: new Date(nowMs).toISOString() }));
        await audit(container, { actor, action: "owner.sessions.revoked", targetType: "owner-account", targetId: owner.accountId });
        return reply(200, { ok: true });
      }
      const fresh = generateRecoveryCodes();
      await mutateOwnerAccount(container, owner.accountId, current => ({ ...current, mfa: { ...(current.mfa || {}), recoveryCodes: fresh.records }, updatedAt: new Date(nowMs).toISOString() }));
      await audit(container, { actor, action: "owner.recovery-codes.regenerated", targetType: "owner-account", targetId: owner.accountId });
      return reply(200, { ok: true, recoveryCodes: fresh.codes });
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
