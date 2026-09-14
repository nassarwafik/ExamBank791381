const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const {
  TOKEN_TTL_SECONDS,
  createBuilderToken,
  validateBuilderCredentials
} = require("../lib/builder-auth");
const { getContainer } = require("../lib/platform-storage");
const {
  reserveLoginAttempt,
  clearLoginThrottle,
  clientIdFromRequest
} = require("../lib/login-throttle");

// Roadmap #8 §1 (PR#67 review) — the legacy builder-login endpoint now shares the SAME hardened,
// reserve-before-verify login throttle as platform-login, so it is no longer an unthrottled bypass of the
// brute-force protection. Behavior is otherwise unchanged (teacher-only credential login).
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };

// DI seam for tests (production passes nothing → real implementations). `obs` = optional observability ctx.
async function handler(request, deps = {}, obs = null) {
  const getC = deps.getContainer || getContainer;
  const validateBuilder = deps.validateBuilderCredentials || validateBuilderCredentials;
  const mkToken = deps.createBuilderToken || createBuilderToken;
  const reserve = deps.reserveLoginAttempt || reserveLoginAttempt;
  const throttleClear = deps.clearLoginThrottle || clearLoginThrottle;
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);

  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const userCode = String(body?.userCode || "").trim();
    const password = String(body?.password || "");
    if (!userCode || !password) {
      return { status: 400, headers: NO_STORE, jsonBody: { ok: false, error: "كود المستخدم وكلمة المرور مطلوبان." } };
    }
    if (userCode.length > 128 || password.length > 512) {
      return { status: 400, headers: NO_STORE, jsonBody: { ok: false, error: "بيانات الدخول غير صالحة." } };
    }

    const container = getC();

    // Reserve-before-verify (§2): count this attempt atomically before validating credentials.
    let gate;
    try {
      gate = await reserve(container, userCode, clientId, deps);
    } catch {
      obs?.logWarn("auth.login.throttled", { reason: "reserve_conflict", retryable: true, kind: "builder" });
      return { status: 429, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } };
    }
    if (!gate.allowed) {
      obs?.logWarn("auth.login.throttled", { reason: "rate_limited", retryable: true, kind: "builder" });
      return { status: 429, headers: { ...NO_STORE, "Retry-After": String(gate.retryAfterSeconds || 5) }, jsonBody: { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } };
    }

    let ok = false;
    try { ok = validateBuilder(userCode, password); } catch { ok = false; }
    if (!ok) {
      obs?.logWarn("auth.login.failed", { reason: "invalid_credentials", kind: "builder" });
      return { status: 401, headers: NO_STORE, jsonBody: { ok: false, error: "بيانات الدخول غير صحيحة." } };
    }

    await throttleClear(container, userCode, clientId, deps);
    const token = mkToken(userCode);
    obs?.logInfo("auth.login.succeeded", { role: "teacher", kind: "builder" });
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, token, userCode, expiresInSeconds: TOKEN_TTL_SECONDS } };
  } catch (e) {
    obs?.logError("auth.login.error", e, { kind: "builder" });
    return { status: 500, headers: NO_STORE, jsonBody: { ok: false, error: "تعذر تسجيل الدخول حاليًا." } };
  }
}

app.http("builderLogin", { methods: ["POST"], authLevel: "anonymous", route: "builder-login", handler: withObservability("builder-login", handler) });
module.exports = { handler };
