const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { hashSecret } = require("../lib/identity/password-hash");
const { checkPassword, passwordPolicyMessage } = require("../lib/identity/password-policy");
const { resolveInvitation, mutateTeacherAccount, deleteInvitationPointer, sha256Hex } = require("../lib/identity/teacher-accounts");

// Tadris+ P2-A2 — a teacher opens the owner's invitation (or reset) link and sets their own password (owner decision §19.3:
// «رابط دعوة»; the owner never sees the password). Route: POST /api/teacher-invitation/{inspect|accept}
//
//   inspect { token }            → { displayName, username, purpose, expiresAt } — only for a CURRENT, unexpired link
//   accept  { token, password }  → the password is stored (scrypt), the link is used up, the account becomes active;
//                                  on a reset every older session has already ended (authVersion was bumped by the owner)
//
// Public by design (the link is the credential), throttled per client, and an unusable link always answers the same 404.

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unusable = () => reply(404, { ok: false, code: "INVITATION_INVALID", error: "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من إدارة المنصة." });
const THROTTLE_ID = "teacher-invitation";

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || (action !== "inspect" && action !== "accept")) return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
  const token = String(body.token ?? "").trim();
  if (!token || token.length > 128 || String(body.password ?? "").length > 1024) return unusable();

  let container;
  try { container = (deps.getContainer || getContainer)(); } catch { return reply(503, { ok: false, code: "INVITATION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا." }, { "Retry-After": "5" }); }
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  try {
    let gate;
    try { gate = await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, THROTTLE_ID, clientId, deps, { globalFreeAttempts: 200, globalMaxCooldownSeconds: 60 }); }
    catch { return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": "5" }); }
    if (!gate.allowed) return reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(gate.retryAfterSeconds || 5) });

    const found = await resolveInvitation(container, token, nowMs);
    if (!found) return unusable();
    const { account, invitation } = found;

    if (action === "inspect") {
      return reply(200, { ok: true, displayName: account.displayName, username: account.username, purpose: invitation.purpose, expiresAt: new Date(Number(invitation.expiresAtMs)).toISOString() });
    }

    const policy = checkPassword(body.password, { role: "teacher", username: account.username });
    if (!policy.ok) return reply(400, { ok: false, code: "PASSWORD_" + policy.code, error: passwordPolicyMessage(policy) });
    const credential = await hashSecret(body.password, deps.hashParams ? { params: deps.hashParams } : {});
    const iso = new Date(nowMs).toISOString();
    const tokenHash = sha256Hex(token);
    let usedUp = false;
    try {
      await mutateTeacherAccount(container, account.accountId, a => {
        // Re-check under compare-and-set: the link must still be the current one (a concurrent accept or a newer link wins).
        if (!a.invitation || a.invitation.tokenHash !== tokenHash || !(Number(a.invitation.expiresAtMs) > nowMs) || a.status === "suspended") {
          const e = new Error("stale"); e.code = "INVITATION_STALE"; throw e;
        }
        return { ...a, credential, invitation: null, status: "active", passwordSetAt: iso, updatedAt: iso };
      });
    } catch (e) {
      if (e?.code === "INVITATION_STALE") usedUp = true; else throw e;
    }
    if (usedUp) return unusable();
    await deleteInvitationPointer(container, token);
    await (deps.clearLoginThrottle || clearLoginThrottle)(container, THROTTLE_ID, clientId, deps);
    await (deps.recordOwnerAuditEvent || recordOwnerAuditEvent)(container, { action: "teacher.invitation.accepted", targetType: "teacher-account", targetId: account.accountId, targetLabel: account.username, details: { purpose: invitation.purpose } });
    return reply(200, { ok: true, username: account.username });
  } catch (e) {
    obs?.logError("teacher.invitation.error", e, { action });
    return reply(503, { ok: false, code: "INVITATION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا." }, { "Retry-After": "5" });
  }
}

app.http("teacherInvitation", { methods: ["POST"], authLevel: "anonymous", route: "teacher-invitation/{action?}", handler: withObservability("teacher-invitation", handler) });
module.exports = { handler };
