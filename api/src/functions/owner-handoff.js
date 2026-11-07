const crypto = require("crypto");
const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordOwnerChange, recordAuditEvent } = require("../lib/audit-log");   // Tadris+ P10-L
const { requireOwnerSession, stepUpDenial, NO_STORE } = require("../lib/identity/owner-session");
const { ownerSessionName, readOwnerAccount, mutateOwnerAccount, createOnly } = require("../lib/identity/owner-store");
const { isTeacherAccountId, createManagedTeacherToken, newTeacherSessionId } = require("../lib/identity/teacher-token");
const { readTeacherAccount, mutateTeacherAccount, withTeacherSession, trialEnded } = require("../lib/identity/teacher-accounts");
const { TOKEN_TTL_SECONDS } = require("../lib/builder-auth");
const { getContainer, downloadJsonOrNull, mutateJsonWithRetry } = require("../lib/platform-storage");
const { deviceFromUserAgent } = require("../lib/identity/qr-login");   // Tadris+ QR-3 — the device words of the new session

// Tadris+ P4-D — owner decision D19 (blueprint §19.4): «الانتقال إلى مساحة المعلم الخاصة بي». The owner is also a teacher; their
// classes and students belong to their TEACHER account, which stays a separate account. Route: /api/owner-handoff/{action?}
//
//   GET                 (owner session)            → { linked: { accountId, username, displayName, status, usable, reason } | null }
//   POST link           (owner session + step-up)  { accountId | null } → links the owner to ONE teacher account (or unlinks);
//                                                    stored as `linkedTeacherAccountId` on the owner account; audited
//   POST issue          (owner session + step-up)  → a ONE-TIME handoff ticket, valid 60 seconds, bound to THIS owner session and
//                                                    to the linked account; only its SHA-256 is stored; returned once as
//                                                    `handoffPath` ("#/handoff/<token>": a URL fragment, never sent to a server)
//   POST redeem         (NO session: the ticket is the credential) { token }
//                       → the ticket is consumed FIRST (compare-and-set: a second use, even concurrent, is refused), then
//                         re-checked: not expired; the owner session that issued it still valid (not signed out, not revoked,
//                         same authVersion, owner active); the owner still linked to that account; the teacher account active,
//                         with a password, its trial not ended. → an ORDINARY teacher session for the linked account (a v3
//                         token with its own session id). It carries NO owner capability; the owner session is untouched, and
//                         signing out of either never ends the other. Audited on both sides.
// Every refusal of a redeem is the same generic 401 for the reader (with a code), so a ticket reveals nothing about the accounts.

const HANDOFF_PREFIX = "platform/owner/handoffs/";
const HANDOFF_TTL_MS = 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const sha256Hex = t => crypto.createHash("sha256").update(String(t), "utf8").digest("hex");
const handoffName = token => HANDOFF_PREFIX + sha256Hex(token) + ".json";

const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const REDEEM_REFUSED = code => reply(401, { ok: false, code, error: "رابط الانتقال غير صالح أو انتهت صلاحيته. ارجع إلى لوحة المالك واضغط «الانتقال إلى مساحة المعلم» مرة أخرى." });
const unavailable = () => reply(503, { ok: false, code: "OWNER_HANDOFF_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });

/** Whether a teacher account can receive a session now, and if not why (a code). */
function teacherUsability(account, nowMs) {
  if (!account) return { usable: false, reason: "TEACHER_NOT_FOUND" };
  if (account.status === "suspended") return { usable: false, reason: "TEACHER_SUSPENDED" };
  if (account.status !== "active" || !account.credential) return { usable: false, reason: "TEACHER_NOT_ACTIVE" };
  if (trialEnded(account, nowMs)) return { usable: false, reason: "TEACHER_TRIAL_ENDED" };
  return { usable: true, reason: null };
}
const USABILITY_MESSAGE = {
  TEACHER_NOT_FOUND: "حساب المعلم المرتبط غير موجود.",
  TEACHER_SUSPENDED: "حساب المعلم المرتبط موقوف. أعد تفعيله أولًا.",
  TEACHER_NOT_ACTIVE: "حساب المعلم المرتبط لم تُوضع له كلمة مرور بعد. افتح رابط الدعوة وضع كلمة المرور أولًا.",
  TEACHER_TRIAL_ENDED: "انتهت الفترة التجريبية لحساب المعلم المرتبط."
};

async function linkedView(container, owner, nowMs) {
  const id = isTeacherAccountId(owner.linkedTeacherAccountId) ? owner.linkedTeacherAccountId : null;
  if (!id) return null;
  const account = await readTeacherAccount(container, id);
  const u = teacherUsability(account, nowMs);
  return { accountId: id, username: account ? account.username : "", displayName: account ? account.displayName : "", status: account ? account.status : "missing", usable: u.usable, reason: u.reason };
}

async function redeem(request, deps, obs, nowMs) {
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
  const token = String(body.token || "");
  if (!TOKEN_RE.test(token)) return REDEEM_REFUSED("HANDOFF_INVALID");
  const container = deps.container || (deps.getContainer || getContainer)();
  // 1. consume first: whatever happens next, this ticket can never be used again.
  let state = "ok", ticket = null;
  try {
    await mutateJsonWithRetry(container, handoffName(token), current => {
      if (!current || current.schemaVersion !== 1) { const e = new Error("HANDOFF_INVALID"); e.code = "HANDOFF_INVALID"; throw e; }
      ticket = current;
      if (current.usedAtMs) { state = "HANDOFF_USED"; return current; }
      state = Number(current.expiresAtMs) > nowMs ? "ok" : "HANDOFF_EXPIRED";
      return { ...current, usedAtMs: nowMs };
    });
  } catch (e) {
    if (e && e.code === "HANDOFF_INVALID") return REDEEM_REFUSED("HANDOFF_INVALID");
    throw e;
  }
  if (state !== "ok") return REDEEM_REFUSED(state);
  // 2. the owner session that issued it is still valid, and the owner is still linked to that account.
  const [session, owner] = await Promise.all([downloadJsonOrNull(container, ownerSessionName(ticket.ownerSid)), readOwnerAccount(container, ticket.ownerId)]);
  if (!session || session.sid !== ticket.ownerSid || session.accountId !== ticket.ownerId || !(Number(session.expiresAtMs) > nowMs)) return REDEEM_REFUSED("OWNER_SESSION_ENDED");
  if (!owner || owner.status !== "active" || owner.authVersion !== session.authVersion || owner.authVersion !== ticket.ownerAuthVersion) return REDEEM_REFUSED("OWNER_SESSION_ENDED");
  if (owner.linkedTeacherAccountId !== ticket.accountId) return REDEEM_REFUSED("HANDOFF_LINK_REMOVED");
  // 3. the teacher account can receive a session now.
  const account = await readTeacherAccount(container, ticket.accountId);
  const u = teacherUsability(account, nowMs);
  if (!u.usable) return REDEEM_REFUSED(u.reason);
  // 4. an ORDINARY teacher session of its own (no owner claim at all).
  // Tadris+ P10-A — recorded in the account BEFORE the token is given (an unrecorded session is refused on every request).
  const sid = newTeacherSessionId();
  const { token: teacherToken, payload } = createManagedTeacherToken({ accountId: account.accountId, sid, authVersion: account.authVersion }, { nowMs });
  try {
    await mutateTeacherAccount(container, account.accountId, a => ({ ...withTeacherSession(a, { sid, expiresAtMs: payload.exp * 1000, nowMs, via: "owner-handoff", device: deviceFromUserAgent(request.headers && typeof request.headers.get === "function" ? request.headers.get("user-agent") : "") }), lastLoginAt: new Date(nowMs).toISOString() }));
  } catch { return reply(503, { ok: false, code: "TEACHER_SESSION_UNAVAILABLE", error: "تعذر فتح صفحة المعلم حاليًا. حاول مرة أخرى بعد قليل." }); }
  await (deps.recordAuditEvent || recordAuditEvent)(container, { actor: account.accountId, action: "teacher.session.from-owner", targetType: "teacher-account", targetId: account.accountId, targetLabel: account.username, details: { ownerId: ticket.ownerId } });
  obs?.logInfo?.("auth.login.succeeded", { role: "teacher", kind: "owner-handoff" });
  return reply(200, { ok: true, role: "teacher", token: teacherToken, userCode: account.username, displayName: account.displayName, expiresInSeconds: TOKEN_TTL_SECONDS });
}

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const write = deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict;   // Tadris+ P10-L: every owner change is recorded BEFORE it happens
  const method = String(request.method || "GET").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();

  try {
    // The redeem runs in the NEW tab, which never holds the owner's token: the one-time ticket is its only credential.
    if (method === "POST" && action === "redeem") return await redeem(request, deps, obs, nowMs);
  } catch (e) {
    obs?.logError("owner.handoff.redeem_error", e);
    return unavailable();
  }

  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const actor = "owner:" + owner.accountId;

  try {
    if (method === "GET" && !action) return reply(200, { ok: true, linked: await linkedView(container, owner, nowMs) });
    if (method !== "POST") return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
    const denial = stepUpDenial(session, nowMs);
    if (denial) return denial;
    let body = {};
    try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }

    if (action === "link") {
      const wanted = body.accountId === null || body.accountId === "" ? null : String(body.accountId || "");
      if (wanted !== null && !isTeacherAccountId(wanted)) return reply(400, { ok: false, code: "ACCOUNT_ID_INVALID", error: "معرّف الحساب غير صالح." });
      if (wanted !== null && !(await readTeacherAccount(container, wanted))) return reply(404, { ok: false, code: "TEACHER_NOT_FOUND", error: "حساب المعلم غير موجود." });
      const previous = isTeacherAccountId(owner.linkedTeacherAccountId) ? owner.linkedTeacherAccountId : null;
      return await recordOwnerChange(container, { actor, action: wanted ? "owner.teacher-link.set" : "owner.teacher-link.cleared", targetType: "teacher-account", targetId: wanted || previous || "", details: { from: previous, to: wanted } }, async () => {
        const next = await mutateOwnerAccount(container, owner.accountId, o => ({ ...o, linkedTeacherAccountId: wanted }));
        return reply(200, { ok: true, linked: await linkedView(container, next, nowMs) });
      }, { write });
    }

    if (action === "issue") {
      const linked = await linkedView(container, owner, nowMs);
      if (!linked) return reply(409, { ok: false, code: "HANDOFF_NOT_LINKED", error: "لم تربط حسابك بحساب معلم بعد." });
      if (!linked.usable) return reply(409, { ok: false, code: linked.reason, error: USABILITY_MESSAGE[linked.reason] || "لا يمكن فتح مساحة المعلم الآن." });
      const token = crypto.randomBytes(32).toString("base64url");
      const ticket = { schemaVersion: 1, ownerId: owner.accountId, ownerSid: session.sid, ownerAuthVersion: owner.authVersion, accountId: linked.accountId, createdAtMs: nowMs, expiresAtMs: nowMs + HANDOFF_TTL_MS, usedAtMs: null };
      // the owner opening a teacher's workspace is recorded BEFORE the ticket exists (like opening a conversation, D14)
      return await recordOwnerChange(container, { actor, action: "owner.teacher-handoff.issued", targetType: "teacher-account", targetId: linked.accountId, targetLabel: linked.username, details: { expiresAt: new Date(ticket.expiresAtMs).toISOString() } }, async () => {
        if (!(await createOnly(container, handoffName(token), ticket))) return unavailable();
        return reply(200, { ok: true, handoffPath: "#/handoff/" + token, expiresAt: new Date(ticket.expiresAtMs).toISOString() });
      }, { write });
    }

    return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  } catch (e) {
    obs?.logError("owner.handoff.error", e, { action });
    return unavailable();
  }
}

app.http("ownerHandoff", { methods: ["GET", "POST"], authLevel: "anonymous", route: "owner-handoff/{action?}", handler: withObservability("owner-handoff", handler) });
module.exports = { handler, HANDOFF_PREFIX, HANDOFF_TTL_MS, handoffName };
