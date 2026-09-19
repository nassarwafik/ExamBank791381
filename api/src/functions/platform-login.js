const { app } = require("@azure/functions");
const { withObservability, storageObserver } = require("../lib/observability");
const {
  TOKEN_TTL_SECONDS,
  createBuilderToken,
  validateBuilderCredentials
} = require("../lib/builder-auth");
const {
  STUDENT_TOKEN_TTL_SECONDS,
  normalizeStudentCode,
  studentCodeHash,
  verifyPassword,
  createStudentToken,
  normalizeAuthVersion
} = require("../lib/student-auth");
const {
  getContainer,
  downloadJsonOrNull,
  mutateJsonWithRetry
} = require("../lib/platform-storage");
const {
  reserveLoginAttempt,
  clearLoginThrottle,
  clientIdFromRequest
} = require("../lib/login-throttle");
// The canonical teacher display-name authority (profile document → configured fallback → «المعلم»), shared with
// platform-session. It MUST be required here: the teacher branch below calls it after valid credentials are
// accepted, and a missing import turns every successful teacher login into a 500 (hotfix regression test:
// api/tests/platform-login-teacher.test.js).
const { resolveTeacherDisplayName } = require("../lib/teacher-profile");

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const GENERIC_AUTH_ERROR = "بيانات الدخول غير صحيحة.";

// DI seam for tests (production passes nothing → real implementations). `obs` is an optional observability
// context injected by the withObservability wrapper (absent when a test calls the bare handler).
async function handler(request, deps = {}, obs = null) {
  const getC = deps.getContainer || getContainer;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const validateBuilder = deps.validateBuilderCredentials || validateBuilderCredentials;
  const mkBuilderToken = deps.createBuilderToken || createBuilderToken;
  const mkStudentToken = deps.createStudentToken || createStudentToken;
  const verifyPw = deps.verifyPassword || verifyPassword;
  const reserve = deps.reserveLoginAttempt || reserveLoginAttempt;
  const throttleClear = deps.clearLoginThrottle || clearLoginThrottle;
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);

  try {
    let body = {};
    try { body = await request.json(); } catch { body = {}; }

    const userCode = String(body?.userCode || "").trim();
    const password = String(body?.password || "");
    if (!userCode || !password) {
      return { status: 400, headers: NO_STORE, jsonBody: { ok: false, error: "كود المستخدم / رقم الهوية وكلمة المرور مطلوبان." } };
    }
    if (userCode.length > 128 || password.length > 512) {
      return { status: 400, headers: NO_STORE, jsonBody: { ok: false, error: "بيانات الدخول غير صالحة." } };
    }

    const container = getC();

    // Reserve-before-verify (§2): COUNT this attempt atomically BEFORE any password work. A burst of
    // simultaneous guesses is serialized by optimistic concurrency; once the free band is exhausted (or the
    // identifier-only global bucket trips), further attempts are rejected here and never reach verify. A CAS
    // conflict under heavy contention is treated as fail-closed (throttled), never as a free pass.
    let gate;
    try {
      gate = await reserve(container, userCode, clientId, deps);
    } catch {
      obs?.logWarn("auth.login.throttled", { reason: "reserve_conflict", retryable: true });
      return { status: 429, headers: { ...NO_STORE, "Retry-After": "5" }, jsonBody: { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } };
    }
    if (!gate.allowed) {
      obs?.logWarn("auth.login.throttled", { reason: "rate_limited", retryable: true });
      return { status: 429, headers: { ...NO_STORE, "Retry-After": String(gate.retryAfterSeconds || 5) }, jsonBody: { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." } };
    }

    // Teacher credentials.
    let isTeacher = false;
    try { isTeacher = validateBuilder(userCode, password); } catch { isTeacher = false; }
    if (isTeacher) {
      await throttleClear(container, userCode, clientId, deps);
      const token = mkBuilderToken(userCode);
      obs?.logInfo("auth.login.succeeded", { role: "teacher" });
      return { status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "teacher", token, userCode, displayName: await resolveTeacherDisplayName(container, userCode, deps), expiresInSeconds: TOKEN_TTL_SECONDS } };
    }

    // Student credentials — bind password verification to the credential version (§3).
    const normalizedCode = normalizeStudentCode(userCode);
    const authDocument = await dl(container, "platform/auth/" + studentCodeHash(normalizedCode) + ".json");
    const studentBlobName = authDocument ? "platform/users/" + authDocument.userId + ".json" : "";
    const student = studentBlobName ? await dl(container, studentBlobName) : null;
    const boundVersion = normalizeAuthVersion(authDocument && authDocument.authVersion);

    const credentialsOk = !!(
      authDocument &&
      authDocument.active !== false &&
      verifyPw(password, authDocument.salt, authDocument.passwordHash) &&
      student &&
      student.active !== false &&
      student.archived !== true &&
      // Fail-closed consistency: the auth document and the student document must agree on the credential
      // version. During a reset window (student bumped, auth not yet, or vice-versa) they disagree and login
      // is refused rather than issuing a session against a half-applied credential change.
      boundVersion === normalizeAuthVersion(student.authVersion)
    );

    if (!credentialsOk) {
      // The attempt was already counted at reserve; just return the single generic error (no enumeration).
      obs?.logWarn("auth.login.failed", { reason: "invalid_credentials" });
      return { status: 401, headers: NO_STORE, jsonBody: { ok: false, error: GENERIC_AUTH_ERROR } };
    }

    // Optimistic read-modify-write of lastLogin (§11) that ALSO re-validates the credential version under
    // the lock (§3): if a concurrent reset bumped the student's authVersion since we verified the password,
    // do not stamp the login and fail closed — the old password must not yield a fresh post-reset session.
    let stillValid = true;
    const fresh = await mut(container, studentBlobName, current => {
      const base = current || student;
      if (normalizeAuthVersion(base.authVersion) !== boundVersion) { stillValid = false; return base; }
      base.lastLoginAt = new Date().toISOString();
      base.updatedAt = base.lastLoginAt;
      return base;
    }, storageObserver(obs, { operation: "login.lastLogin" }));
    if (!stillValid) {
      return { status: 401, headers: NO_STORE, jsonBody: { ok: false, error: GENERIC_AUTH_ERROR } };
    }

    await throttleClear(container, userCode, clientId, deps);
    const token = mkStudentToken(fresh);            // sv = fresh.authVersion === boundVersion (verified)
    obs?.logInfo("auth.login.succeeded", { role: "student" });
    return { status: 200, headers: NO_STORE, jsonBody: { ok: true, role: "student", token, userCode: fresh.code, displayName: fresh.displayName, expiresInSeconds: STUDENT_TOKEN_TTL_SECONDS } };
  } catch (e) {
    obs?.logError("auth.login.error", e);
    return { status: 500, headers: NO_STORE, jsonBody: { ok: false, error: "تعذر تسجيل الدخول حاليًا." } };
  }
}

app.http("platformLogin", { methods: ["POST"], authLevel: "anonymous", route: "platform-login", handler: withObservability("platform-login", handler) });
module.exports = { handler };
