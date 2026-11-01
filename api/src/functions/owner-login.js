const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { hashSecret, verifySecret } = require("../lib/identity/password-hash");
const { verifyAndConsumeSecondFactor } = require("../lib/identity/owner-mfa");
const { validUsername, findOwnerByUsername, newSessionId, ownerSessionName, createOnly } = require("../lib/identity/owner-store");
const { createOwnerToken, OWNER_TOKEN_TTL_SECONDS, NO_STORE } = require("../lib/identity/owner-session");
const { remainingRecoveryCodes } = require("../lib/identity/recovery-codes");

// Tadris+ P1-A — platform-owner sign-in. Route: POST /api/owner-login  { username, password, code | recoveryCode }
//
// A SEPARATE endpoint: /api/platform-login (teachers, students) never authenticates an owner and this route never
// authenticates a teacher or student. All three factors arrive together; the answer to any failure is the same generic
// 401, so the response never reveals whether the username exists, the password matched, or only the code was wrong.
//
//   1. throttle (reserve-before-verify) on "owner:" + username, per client and globally
//   2. password check (scrypt; an unknown username costs the same work through a dummy record)
//   3. second factor, verified AND consumed under compare-and-set (a TOTP step or a recovery code is single-use)
//   4. a server-side session document is created (create-only), then a 2-hour owner token is signed
// Storage failures answer 503 (fail closed).

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const denied = () => reply(401, { ok: false, code: "OWNER_LOGIN_DENIED", error: "بيانات الدخول غير صحيحة." });

// Same-cost decoy for unknown usernames (computed once per parameter set, then cached).
const decoys = new Map();
async function decoyRecord(params) {
  const key = JSON.stringify(params || "default");
  if (!decoys.has(key)) decoys.set(key, hashSecret("decoy-" + Math.random().toString(36), params ? { params } : {}));
  return decoys.get(key);
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const env = deps.env || process.env;
  const audit = deps.recordOwnerAuditEvent || recordOwnerAuditEvent;
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

  const rawUser = String(body.username ?? ""), password = String(body.password ?? "");
  const code = String(body.code ?? "").replace(/\s/g, ""), recoveryCode = String(body.recoveryCode ?? "").trim();
  if (!rawUser || !password || (!code && !recoveryCode)) {
    return reply(400, { ok: false, code: "INVALID_INPUT", error: "اسم المستخدم وكلمة المرور ورمز التحقق مطلوبة." });
  }
  if (rawUser.length > 128 || password.length > 1024 || code.length > 16 || recoveryCode.length > 32) {
    return reply(400, { ok: false, code: "INVALID_INPUT", error: "بيانات الدخول غير صالحة." });
  }

  let container;
  try { container = (deps.getContainer || getContainer)(); } catch { return reply(503, { ok: false, code: "OWNER_AUTH_UNAVAILABLE", error: "تعذر تسجيل الدخول حاليًا." }, { "Retry-After": "5" }); }

  const username = validUsername(rawUser) || "invalid";
  const throttleId = "owner:" + username;
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  try {
    let gate;
    try { gate = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, throttleId, clientId, deps); }
    catch { return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": "5" }); }
    if (!gate.allowed) {
      obs?.logWarn("owner.login.throttled", { retryable: true });
      return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(gate.retryAfterSeconds || 5) });
    }

    const account = username === "invalid" ? null : await findOwnerByUsername(container, username);
    const record = account?.credential || await decoyRecord(deps.hashParams);
    const passwordOk = await verifySecret(password, record);
    if (!account || !passwordOk || account.status !== "active") {
      await audit(container, { action: "owner.login.failed", targetType: "owner-account", targetId: account?.accountId || "", details: { stage: "password" } });
      obs?.logWarn("owner.login.failed", { stage: "password" });
      return denied();
    }

    const factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code, recoveryCode }, { nowMs, env });
    if (!factor.ok) {
      await audit(container, { action: "owner.login.failed", targetType: "owner-account", targetId: account.accountId, details: { stage: "second-factor" } });
      obs?.logWarn("owner.login.failed", { stage: "second-factor" });
      return denied();
    }

    const fresh = factor.account;
    const sid = newSessionId();
    const expiresAtMs = nowMs + OWNER_TOKEN_TTL_SECONDS * 1000;
    const created = await createOnly(container, ownerSessionName(sid), {
      schemaVersion: 1, sid, accountId: fresh.accountId, authVersion: fresh.authVersion,
      createdAtMs: nowMs, expiresAtMs, stepUpAtMs: nowMs, factor: factor.method
    });
    if (!created) return reply(503, { ok: false, code: "OWNER_AUTH_UNAVAILABLE", error: "تعذر تسجيل الدخول حاليًا." }, { "Retry-After": "1" });
    const { token } = createOwnerToken({ accountId: fresh.accountId, sid, authVersion: fresh.authVersion }, { nowMs, env });

    await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);
    await audit(container, { actor: "owner:" + fresh.accountId, action: "owner.login.succeeded", targetType: "owner-account", targetId: fresh.accountId, details: { factor: factor.method } });
    obs?.logInfo("owner.login.succeeded", { factor: factor.method });
    return reply(200, {
      ok: true,
      token,
      expiresInSeconds: OWNER_TOKEN_TTL_SECONDS,
      owner: { accountId: fresh.accountId, username: fresh.username, displayName: fresh.displayName },
      recoveryCodesRemaining: remainingRecoveryCodes(fresh.mfa?.recoveryCodes)
    });
  } catch (e) {
    obs?.logError("owner.login.error", e, {});
    return reply(503, { ok: false, code: "OWNER_AUTH_UNAVAILABLE", error: "تعذر تسجيل الدخول حاليًا." }, { "Retry-After": "5" });
  }
}

app.http("ownerLogin", { methods: ["POST"], authLevel: "anonymous", route: "owner-login", handler: withObservability("owner-login", handler) });
module.exports = { handler };
