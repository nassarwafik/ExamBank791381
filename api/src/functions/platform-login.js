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
const { normalizeIdentityNumber } = require("../lib/roster-input");
// QA-19 — accounts are created with the CANONICAL identity (ASCII digits, a short value left-padded to 9: roster-input), but the
// login hashed the typed text as-is, so a student typing «١٢٣٤٥٦٧٨٩» (or Persian digits, separators, or the identity without its
// leading zero) was refused although it is the same identity. A code made only of digits (any of the three scripts) and group
// separators is also looked up in that canonical form when the exact code has no account. It can only ever reach the account of
// that very identity; the exact code is still tried first, so a legacy non-identity code keeps working unchanged.
const IDENTITY_LIKE = /^[\s0-9\u0660-\u0669\u06F0-\u06F9\-./]+$/;

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
    let authDocument = await dl(container, "platform/auth/" + studentCodeHash(normalizedCode) + ".json");
    if (!authDocument && IDENTITY_LIKE.test(userCode)) {
      const canonical = normalizeIdentityNumber(userCode);
      if (canonical && canonical !== normalizedCode) authDocument = await dl(container, "platform/auth/" + studentCodeHash(canonical) + ".json");
    }
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
    // QA-5 — the stamp is written only onto the student document as it is NOW. A student the teacher deleted (document gone),
    // archived or disabled while this login was in flight is refused: writing the pre-read copy back would resurrect a deleted
    // student in the roster and issue a 12-hour session.
    let stillValid = true;
    const REFUSED = Symbol("refused");
    let fresh;
    try {
      fresh = await mut(container, studentBlobName, current => {
        if (!current || current.active === false || current.archived === true) throw REFUSED;
        const base = current;
        if (normalizeAuthVersion(base.authVersion) !== boundVersion) { stillValid = false; return base; }
        base.lastLoginAt = new Date().toISOString();
        base.updatedAt = base.lastLoginAt;
        return base;
      }, storageObserver(obs, { operation: "login.lastLogin" }));
    } catch (e) {
      if (e !== REFUSED) throw e;
      stillValid = false;
    }
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
