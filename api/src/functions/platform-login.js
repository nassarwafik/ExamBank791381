const { app } = require("@azure/functions");
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
  createStudentToken
} = require("../lib/student-auth");
const {
  getContainer,
  downloadJsonOrNull,
  mutateJsonWithRetry
} = require("../lib/platform-storage");
const {
  checkLoginThrottle,
  recordLoginFailure,
  clearLoginThrottle,
  clientIdFromRequest
} = require("../lib/login-throttle");

// Auth responses must never be cached (§15).
const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
// One generic authentication error for EVERY failure mode (§16): wrong password, unknown code, inactive,
// archived, teacher-vs-student — all indistinguishable to the caller (no enumeration).
const GENERIC_AUTH_ERROR = "بيانات الدخول غير صحيحة.";

// DI seam for tests (production passes nothing → real implementations).
async function handler(request, deps = {}) {
  const getC = deps.getContainer || getContainer;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const validateBuilder = deps.validateBuilderCredentials || validateBuilderCredentials;
  const mkBuilderToken = deps.createBuilderToken || createBuilderToken;
  const mkStudentToken = deps.createStudentToken || createStudentToken;
  const verifyPw = deps.verifyPassword || verifyPassword;
  const throttleCheck = deps.checkLoginThrottle || checkLoginThrottle;
  const throttleFail = deps.recordLoginFailure || recordLoginFailure;
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

    // Throttle gate BEFORE any credential work (§10). Identifier is combined with the client address inside
    // the throttle key so one actor cannot lock a victim's account globally.
    const gate = await throttleCheck(container, userCode, clientId, deps);
    if (!gate.allowed) {
      return {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(gate.retryAfterSeconds) },
        jsonBody: { ok: false, error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }
      };
    }

    // Teacher credentials.
    let isTeacher = false;
    try { isTeacher = validateBuilder(userCode, password); } catch { isTeacher = false; }
    if (isTeacher) {
      await throttleClear(container, userCode, clientId, deps);
      const token = mkBuilderToken(userCode);
      return {
        status: 200,
        headers: NO_STORE,
        jsonBody: { ok: true, role: "teacher", token, userCode, displayName: "المعلم", expiresInSeconds: TOKEN_TTL_SECONDS }
      };
    }

    // Student credentials.
    const normalizedCode = normalizeStudentCode(userCode);
    const authDocument = await dl(container, "platform/auth/" + studentCodeHash(normalizedCode) + ".json");
    const studentBlobName = authDocument ? "platform/users/" + authDocument.userId + ".json" : "";
    const student = studentBlobName ? await dl(container, studentBlobName) : null;

    const credentialsOk = !!(
      authDocument &&
      authDocument.active !== false &&
      verifyPw(password, authDocument.salt, authDocument.passwordHash) &&
      student &&
      student.active !== false &&
      student.archived !== true
    );

    if (!credentialsOk) {
      const failed = await throttleFail(container, userCode, clientId, deps);
      const headers = { ...NO_STORE };
      if (failed && failed.retryAfterSeconds > 0) headers["Retry-After"] = String(failed.retryAfterSeconds);
      return { status: 401, headers, jsonBody: { ok: false, error: GENERIC_AUTH_ERROR } };
    }

    // Optimistic read-modify-write of lastLogin so a login can never clobber a concurrent teacher/user
    // edit (§11). Only lastLoginAt/updatedAt are merged; every other field is preserved from the fresh doc.
    // The returned fresh doc (with current authVersion) is what the session token is minted from.
    const fresh = await mut(container, studentBlobName, current => {
      const base = current || student;
      base.lastLoginAt = new Date().toISOString();
      base.updatedAt = base.lastLoginAt;
      return base;
    });

    await throttleClear(container, userCode, clientId, deps);
    const token = mkStudentToken(fresh);
    return {
      status: 200,
      headers: NO_STORE,
      jsonBody: { ok: true, role: "student", token, userCode: fresh.code, displayName: fresh.displayName, expiresInSeconds: STUDENT_TOKEN_TTL_SECONDS }
    };
  } catch {
    return { status: 500, headers: NO_STORE, jsonBody: { ok: false, error: "تعذر تسجيل الدخول حاليًا." } };
  }
}

app.http("platformLogin", { methods: ["POST"], authLevel: "anonymous", route: "platform-login", handler });
module.exports = { handler };
