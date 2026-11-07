const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { deviceFromUserAgent } = require("../lib/identity/qr-login");   // Tadris+ QR-4
const { getContainer } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { hashSecret, verifySecret } = require("../lib/identity/password-hash");
const { verifyAndConsumeSecondFactor } = require("../lib/identity/owner-mfa");
const { validUsername, findOwnerByUsername, newSessionId, ownerSessionName, createOnly } = require("../lib/identity/owner-store");
const { createOwnerToken, OWNER_TOKEN_TTL_SECONDS, NO_STORE } = require("../lib/identity/owner-session");
const { remainingRecoveryCodes } = require("../lib/identity/recovery-codes");
const { ownerPasswordGate } = require("../lib/identity/heavy-check-gate");

// Tadris+ P1-A — platform-owner sign-in. Route: POST /api/owner-login  { username, password, code | recoveryCode }
//
// A SEPARATE endpoint: /api/platform-login (teachers, students) never authenticates an owner and this route never
// authenticates a teacher or student. All three factors arrive together; the answer to any failure is the same generic
// 401, so the response never reveals whether the username exists, the password matched, or only the code was wrong.
//
//   1. throttle (reserve-before-verify) on "owner:" + username, per client and globally. P10-D: while it refuses, only a
//      correct authenticator code (current step, consumed) followed by the correct password gets through (O2)
//   2. password check (scrypt; an unknown username costs the same work through a dummy record)
//   3. second factor, verified AND consumed under compare-and-set (a TOTP step or a recovery code is single-use)
//   4. a server-side session document is created (create-only), then a 2-hour owner token is signed
// Storage failures answer 503 (fail closed).

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
// Tadris+ P1-B — the owner's username-wide bucket is a bounded delay (≤ 2 minutes), not a lockout: the owner also needs TOTP,
// so failing on purpose can no longer keep the owner out for 15 minutes. The per-address bucket keeps the full escalation.
const OWNER_THROTTLE_POLICY = Object.freeze({ globalFreeAttempts: 10, globalMaxCooldownSeconds: 120 });
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
  // Tadris+ P10-E (closes security review O3) — at most 2 heavy password checks (scrypt, ~128 MiB each) run at once on this
  // instance (owner decision §19.41). The normal path takes a slot before its password check; with no slot free the request
  // takes the code-first path below, which costs an HMAC and no scrypt until a correct code. `release` is idempotent and is
  // always called in `finally`.
  const heavy = deps.heavyCheckGate || ownerPasswordGate;
  let release = null;
  try {
    let gate;
    // P10-E — a FAILED reservation (the limit's lease busy under a flood, a transient error) is a refusal like any other, so it
    // takes the code-first path too (it used to answer 429 before it, reopening O2). Storage that is really down fails there
    // on the account read → 503.
    try { gate = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, throttleId, clientId, deps, OWNER_THROTTLE_POLICY); }
    catch { gate = { allowed: false, retryAfterSeconds: 5 }; }
    if (gate.allowed) release = heavy.tryAcquire();
    let account, factor, via = "";
    if (!gate.allowed || !release) {
      // Tadris+ P10-D (closes security review O2) — a flooded limit never keeps the owner out. While the limit refuses, an
      // attempt carrying an AUTHENTICATOR code (never a recovery code: owner decision §19.40) is checked code-FIRST: the code
      // (the current step only) is verified and consumed, then the password is checked once. A wrong code, an unknown or
      // inactive username, or a recovery code gets the very same 429 as before, and nothing is consumed. No password work
      // happens before a correct code, so a flood buys no password guesses and no scrypt.
      const throttled = () => {
        obs?.logWarn("owner.login.throttled", { retryable: true });
        return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(gate.retryAfterSeconds || 5) });
      };
      if (!code || recoveryCode) return throttled();
      account = username === "invalid" ? null : await findOwnerByUsername(container, username);
      if (!account || account.status !== "active") return throttled();
      factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code }, { nowMs, env, windowSteps: 0 });
      if (!factor.ok) return throttled();
      // P10-E — the one password check after a correct code also runs inside the cap: wait briefly for a slot.
      release = await heavy.acquire(Number.isFinite(deps.heavyCheckWaitMs) ? deps.heavyCheckWaitMs : 2000);
      if (!release) return reply(503, { ok: false, code: "OWNER_AUTH_BUSY", error: "الخادم مشغول. حاول مرة أخرى بعد لحظات." }, { "Retry-After": "2" });
      const passwordOk = await verifySecret(password, account.credential);
      release();
      if (!passwordOk) {
        await audit(container, { action: "owner.login.failed", targetType: "owner-account", targetId: account.accountId, details: { stage: "password-after-code" } });
        obs?.logWarn("owner.login.failed", { stage: "password-after-code" });
        return denied();
      }
      via = "throttle-bypass";
    } else {
      account = username === "invalid" ? null : await findOwnerByUsername(container, username);
      const record = account?.credential || await decoyRecord(deps.hashParams);
      const passwordOk = await verifySecret(password, record);
      release();
      if (!account || !passwordOk || account.status !== "active") {
        await audit(container, { action: "owner.login.failed", targetType: "owner-account", targetId: account?.accountId || "", details: { stage: "password" } });
        obs?.logWarn("owner.login.failed", { stage: "password" });
        return denied();
      }

      factor = await verifyAndConsumeSecondFactor(container, account.accountId, { code, recoveryCode }, { nowMs, env });
      if (!factor.ok) {
        await audit(container, { action: "owner.login.failed", targetType: "owner-account", targetId: account.accountId, details: { stage: "second-factor" } });
        obs?.logWarn("owner.login.failed", { stage: "second-factor" });
        return denied();
      }
    }

    const fresh = factor.account;
    const sid = newSessionId();
    const expiresAtMs = nowMs + OWNER_TOKEN_TTL_SECONDS * 1000;
    const created = await createOnly(container, ownerSessionName(sid), {
      schemaVersion: 1, sid, accountId: fresh.accountId, authVersion: fresh.authVersion,
      createdAtMs: nowMs, expiresAtMs, stepUpAtMs: nowMs, factor: factor.method,
      // Tadris+ QR-4 — the device words this sign-in saw (fixed vocabulary), for «الأجهزة المرتبطة»
      device: deviceFromUserAgent(request.headers && typeof request.headers.get === "function" ? request.headers.get("user-agent") : "")
    });
    if (!created) return reply(503, { ok: false, code: "OWNER_AUTH_UNAVAILABLE", error: "تعذر تسجيل الدخول حاليًا." }, { "Retry-After": "1" });
    const { token } = createOwnerToken({ accountId: fresh.accountId, sid, authVersion: fresh.authVersion }, { nowMs, env });

    await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);
    await audit(container, { actor: "owner:" + fresh.accountId, action: "owner.login.succeeded", targetType: "owner-account", targetId: fresh.accountId, details: via ? { factor: factor.method, via } : { factor: factor.method } });
    obs?.logInfo("owner.login.succeeded", via ? { factor: factor.method, via } : { factor: factor.method });
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
  } finally {
    if (release) release();          // P10-E — never leave a heavy-check slot held (idempotent)
  }
}

app.http("ownerLogin", { methods: ["POST"], authLevel: "anonymous", route: "owner-login", handler: withObservability("owner-login", handler) });
module.exports = { handler, OWNER_THROTTLE_POLICY };
