const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer, downloadJsonOrNull, uploadJson, deleteBlob } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { hashSecret } = require("../lib/identity/password-hash");
const { checkPassword, passwordPolicyMessage } = require("../lib/identity/password-policy");
const { generateTotpSecret, verifyTotp, otpauthUri, base32Encode } = require("../lib/identity/totp");
const { sealSecret, openSecret } = require("../lib/identity/secret-box");
const { generateRecoveryCodes } = require("../lib/identity/recovery-codes");
const { TOTP_PURPOSE } = require("../lib/identity/owner-mfa");
const { bootstrapConfig, bootstrapTokenMatches } = require("../lib/identity/owner-bootstrap");
const {
  BOOTSTRAP_MARKER, BOOTSTRAP_PENDING, validUsername, newOwnerAccountId, ownerAccountName, usernameReservationName,
  readOwnerAccount, createOnly
} = require("../lib/identity/owner-store");
const { NO_STORE } = require("../lib/identity/owner-session");

// Tadris+ P1-A — one-time creation of the first platform owner (owner decision D3). Route: /api/owner-bootstrap/{action?}
//
//   GET                → { state }  "completed" | "open" | "unavailable"   (no secret, no account detail)
//   POST begin         { token, username, displayName, password }
//                      → the TOTP secret to enrol in an authenticator app (shown once), valid 15 minutes
//   POST confirm       { token, code }   (code = the 6 digits the app now shows)
//                      → the owner account is created; the 10 recovery codes are returned ONCE
//
// Guarantees:
//   - The route is open only while OWNER_BOOTSTRAP_TOKEN_SHA256 / OWNER_BOOTSTRAP_EXPIRES_AT are valid (≤ 24 h window).
//   - The create-only marker platform/owner/bootstrap.json is the commit point: once it exists every call answers 410,
//     including a second, concurrent confirm. A confirm interrupted after the marker resumes with the same pending owner.
//   - The owner is created only after proving possession of the token AND of the enrolled authenticator.
//   - Every attempt is throttled; the response never says which check failed.

const PENDING_TTL_MS = 15 * 60 * 1000;
const ISSUER = "Tadris+";
const THROTTLE_ID = "owner-bootstrap";

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const gone = () => reply(410, { ok: false, code: "BOOTSTRAP_COMPLETED", error: "تم تأسيس حساب مالك المنصة مسبقًا. هذا المسار مغلق نهائيًا." });
const unavailable = () => reply(404, { ok: false, code: "BOOTSTRAP_UNAVAILABLE", error: "تأسيس حساب المالك غير متاح حاليًا." });
const badToken = () => reply(401, { ok: false, code: "BOOTSTRAP_DENIED", error: "رمز التأسيس غير صحيح أو انتهت صلاحيته." });
const storageDown = () => reply(503, { ok: false, code: "BOOTSTRAP_STORAGE_UNAVAILABLE", error: "تعذر الوصول إلى التخزين حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });
const throttled = seconds => reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(seconds || 5) });

async function readBody(request) {
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

async function gate(container, request, deps) {
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  try {
    const g = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, THROTTLE_ID, clientId, deps);
    return g.allowed ? { ok: true, clientId } : { ok: false, response: throttled(g.retryAfterSeconds) };
  } catch {
    return { ok: false, response: throttled(5) };
  }
}

async function handleGet(container, env, nowMs) {
  const marker = await downloadJsonOrNull(container, BOOTSTRAP_MARKER);
  if (marker) {
    const settingsStillSet = Boolean(env.OWNER_BOOTSTRAP_TOKEN_SHA256 || env.OWNER_BOOTSTRAP_EXPIRES_AT);
    return reply(200, { ok: true, state: "completed", removeBootstrapSettings: settingsStillSet });
  }
  return reply(200, { ok: true, state: bootstrapConfig(env, nowMs).state === "open" ? "open" : "unavailable" });
}

async function handleBegin(container, request, body, deps, env, nowMs) {
  const g = await gate(container, request, deps);
  if (!g.ok) return g.response;
  const cfg = bootstrapConfig(env, nowMs);
  if (!bootstrapTokenMatches(body.token, cfg.hash)) return badToken();

  const username = validUsername(body.username);
  if (!username) return reply(400, { ok: false, code: "USERNAME_INVALID", error: "اسم المستخدم: 3–64 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ - ، ولا يكون أرقامًا فقط." });
  const displayName = String(body.displayName ?? "").trim().replace(/\s+/g, " ");
  if (!displayName || [...displayName].length > 60) return reply(400, { ok: false, code: "DISPLAY_NAME_INVALID", error: "اسم العرض مطلوب (60 حرفًا على الأكثر)." });
  const policy = checkPassword(body.password, { role: "owner", username });
  if (!policy.ok) return reply(400, { ok: false, code: "PASSWORD_" + policy.code, error: passwordPolicyMessage(policy) });

  const reservation = await downloadJsonOrNull(container, usernameReservationName(username));
  if (reservation) return reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. اختر اسمًا آخر." });

  const accountId = newOwnerAccountId();
  const credential = await hashSecret(body.password, deps.hashParams ? { params: deps.hashParams } : {});
  const secret = generateTotpSecret();
  await uploadJson(container, BOOTSTRAP_PENDING, {
    schemaVersion: 1,
    accountId,
    username,
    displayName,
    credential,
    totp: sealSecret(secret, { purpose: TOTP_PURPOSE, aad: accountId, env }),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + PENDING_TTL_MS
  });
  await (deps.clearLoginThrottle || clearLoginThrottle)(container, THROTTLE_ID, g.clientId, deps);
  return reply(200, {
    ok: true,
    totp: { issuer: ISSUER, account: username, secret: base32Encode(secret), uri: otpauthUri({ issuer: ISSUER, account: username, secret }) },
    expiresInSeconds: PENDING_TTL_MS / 1000
  });
}

async function handleConfirm(container, request, body, deps, env, nowMs) {
  const g = await gate(container, request, deps);
  if (!g.ok) return g.response;
  const cfg = bootstrapConfig(env, nowMs);
  if (!bootstrapTokenMatches(body.token, cfg.hash)) return badToken();

  const [marker, pending] = await Promise.all([downloadJsonOrNull(container, BOOTSTRAP_MARKER), downloadJsonOrNull(container, BOOTSTRAP_PENDING)]);
  // Resume only the interrupted completion of THIS pending owner (marker written, account not yet).
  if (marker && !(pending && marker.accountId === pending.accountId && !(await readOwnerAccount(container, marker.accountId)))) return gone();
  if (!pending || !(Number(pending.expiresAtMs) > nowMs)) {
    return reply(409, { ok: false, code: "BOOTSTRAP_NOT_STARTED", error: "انتهت مهلة الإعداد. ابدأ من جديد." });
  }
  const secret = openSecret(pending.totp, { purpose: TOTP_PURPOSE, aad: pending.accountId, env });
  if (!secret) return reply(409, { ok: false, code: "BOOTSTRAP_NOT_STARTED", error: "انتهت مهلة الإعداد. ابدأ من جديد." });
  const totp = verifyTotp(secret, body.code, { nowMs });
  if (!totp.ok) return reply(401, { ok: false, code: "TOTP_INVALID", error: "رمز التحقق غير صحيح. تأكد من وقت الجهاز وأعد المحاولة." });

  const reservationName = usernameReservationName(pending.username);
  const existingReservation = await downloadJsonOrNull(container, reservationName);
  if (existingReservation && existingReservation.accountId !== pending.accountId) {
    return reply(409, { ok: false, code: "USERNAME_TAKEN", error: "اسم المستخدم مستخدم. ابدأ من جديد باسم آخر." });
  }

  // Commit point.
  if (!marker) {
    const created = await createOnly(container, BOOTSTRAP_MARKER, { schemaVersion: 1, accountId: pending.accountId, completedAtMs: nowMs });
    if (!created) {
      const winner = await downloadJsonOrNull(container, BOOTSTRAP_MARKER);
      if (!winner || winner.accountId !== pending.accountId) return gone();
    }
  }
  if (!existingReservation) {
    await createOnly(container, reservationName, { schemaVersion: 1, accountId: pending.accountId, role: "owner", username: pending.username, createdAtMs: nowMs });
  }

  const recovery = generateRecoveryCodes();
  const iso = new Date(nowMs).toISOString();
  const account = {
    schemaVersion: 1,
    accountId: pending.accountId,
    role: "owner",
    organizationId: "default",
    username: pending.username,
    displayName: pending.displayName,
    status: "active",
    credential: pending.credential,
    mfa: { totp: { sealed: pending.totp, lastUsedStep: totp.step, enrolledAt: iso }, recoveryCodes: recovery.records },
    authVersion: 1,
    createdAt: iso,
    createdBy: "bootstrap",
    updatedAt: iso
  };
  const created = await createOnly(container, ownerAccountName(pending.accountId), account);
  if (!created) return gone();                     // a concurrent confirm finished first and showed the codes
  await deleteBlob(container, BOOTSTRAP_PENDING);
  await (deps.clearLoginThrottle || clearLoginThrottle)(container, THROTTLE_ID, g.clientId, deps);
  await (deps.recordOwnerAuditEvent || recordOwnerAuditEvent)(container, {
    actor: "owner:" + pending.accountId, action: "owner.bootstrap.completed", targetType: "owner-account", targetId: pending.accountId
  });
  return reply(201, {
    ok: true,
    owner: { accountId: pending.accountId, username: pending.username, displayName: pending.displayName },
    recoveryCodes: recovery.codes
  });
}

// DI seam for tests (production passes nothing → real implementations; Azure's InvocationContext carries none of these keys).
async function handler(request, deps = {}, obs = null) {
  const env = deps.env || process.env;
  const nowMs = deps.now ? deps.now() : Date.now();
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  let container;
  try { container = (deps.getContainer || getContainer)(); } catch { return storageDown(); }
  try {
    if (method === "GET") return await handleGet(container, env, nowMs);
    if (method !== "POST" || (action !== "begin" && action !== "confirm")) return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    // The marker closes the route before any other work, even when the settings are still valid.
    if (await downloadJsonOrNull(container, BOOTSTRAP_MARKER) && action === "begin") return gone();
    if (bootstrapConfig(env, nowMs).state !== "open") return unavailable();
    const body = await readBody(request);
    if (String(body.token ?? "").length > 128 || String(body.password ?? "").length > 1024 || String(body.username ?? "").length > 128 || String(body.displayName ?? "").length > 256) {
      return reply(400, { ok: false, code: "INVALID_INPUT", error: "بيانات غير صالحة." });
    }
    return action === "begin"
      ? await handleBegin(container, request, body, deps, env, nowMs)
      : await handleConfirm(container, request, body, deps, env, nowMs);
  } catch (e) {
    obs?.logError("owner.bootstrap.error", e, { action });
    return storageDown();
  }
}

app.http("ownerBootstrap", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-bootstrap/{action?}", handler: withObservability("owner-bootstrap", handler) });
module.exports = { handler, PENDING_TTL_MS };
