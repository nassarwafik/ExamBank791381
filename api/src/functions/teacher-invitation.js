const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer } = require("../lib/platform-storage");
const { reserveLoginAttempt, clearLoginThrottle, clientIdFromRequest } = require("../lib/login-throttle");
const { recordOwnerAuditEvent } = require("../lib/audit-log");
const { hashSecret } = require("../lib/identity/password-hash");
const { checkPassword, passwordPolicyMessage } = require("../lib/identity/password-policy");
const { resolveInvitation, mutateTeacherAccount, deleteInvitationPointer, sha256Hex, trialEnded } = require("../lib/identity/teacher-accounts");

// Tadris+ P2-A2 — a teacher opens the owner's invitation (or reset) link and sets their own password (owner decision §19.3:
// «رابط دعوة»; the owner never sees the password). Route: POST /api/teacher-invitation/{inspect|accept}
//
//   inspect { token }            → { displayName, username, purpose, expiresAt } — only for a CURRENT, unexpired link
//   accept  { token, password }  → the password is stored (scrypt), the link is used up, the account becomes active;
//                                  on a reset every older session has already ended (authVersion was bumped by the owner)
//
// Public by design (the link is the credential); an unusable link always answers the same 404. Limits: see P10-G below.

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unusable = () => reply(404, { ok: false, code: "INVITATION_INVALID", error: "الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من إدارة المنصة." });
// Tadris+ P10-G (closes security review O7; design docs/enterprise-invitation-throttle-p10g.md, owner decision §19.44) — there is
// NO platform-wide invitation bucket any more (the old fixed id let 200 random links block every teacher's real link):
//   • a malformed link is a 404 with no storage work;
//   • an unknown / used / expired link counts on the SENDER's miss limit only (MISS_ID, per client as before);
//   • a valid, current link counts on ITS OWN limit (LINK_ID + sha256(link)), which only its holder can fill.
const LINK_FORMAT = /^[A-Za-z0-9_-]{43}$/;
const MISS_ID = "teacher-invitation-miss";
const LINK_ID = token => "teacher-invitation:" + sha256Hex(token);
const LINK_POLICY = Object.freeze({ globalFreeAttempts: 20, globalMaxCooldownSeconds: 60 });

async function handler(request, deps = {}, obs = null) {
  const nowMs = deps.now ? deps.now() : Date.now();
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || (action !== "inspect" && action !== "accept")) return reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });
  let body = {};
  try { const b = await request.json(); body = b && typeof b === "object" ? b : {}; } catch { body = {}; }
  const token = String(body.token ?? "").trim();
  if (!token || token.length > 128 || String(body.password ?? "").length > 1024) return unusable();
  if (!LINK_FORMAT.test(token)) return unusable();                       // P10-G — no storage work for a malformed link

  let container;
  try { container = (deps.getContainer || getContainer)(); } catch { return reply(503, { ok: false, code: "INVITATION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا." }, { "Retry-After": "5" }); }
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  try {
    const limited = seconds => reply(429, { ok: false, code: "RATE_LIMITED", error: "محاولات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(seconds || 5) });
    const reserve = async (id, policy) => {
      try { return await (deps.reserveLoginAttempt || reserveLoginAttempt)(container, id, clientId, deps, policy); }
      catch { return { allowed: false, retryAfterSeconds: 5 }; }
    };

    const found = await resolveInvitation(container, token, nowMs);
    if (!found) {
      const miss = await reserve(MISS_ID);                                  // the sender's own budget, never anyone else's
      return miss.allowed ? unusable() : limited(miss.retryAfterSeconds);
    }
    const throttleId = LINK_ID(token);
    const gate = await reserve(throttleId, LINK_POLICY);                     // this link's own budget
    if (!gate.allowed) return limited(gate.retryAfterSeconds);
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
        if (!a.invitation || a.invitation.tokenHash !== tokenHash || !(Number(a.invitation.expiresAtMs) > nowMs) || a.status === "suspended" || trialEnded(a, nowMs)) {
          const e = new Error("stale"); e.code = "INVITATION_STALE"; throw e;
        }
        return { ...a, credential, invitation: null, status: "active", passwordSetAt: iso, updatedAt: iso };
      });
    } catch (e) {
      if (e?.code === "INVITATION_STALE") usedUp = true; else throw e;
    }
    if (usedUp) return unusable();
    await deleteInvitationPointer(container, token);
    await (deps.clearLoginThrottle || clearLoginThrottle)(container, throttleId, clientId, deps);
    await (deps.recordOwnerAuditEvent || recordOwnerAuditEvent)(container, { action: "teacher.invitation.accepted", targetType: "teacher-account", targetId: account.accountId, targetLabel: account.username, details: { purpose: invitation.purpose } });
    return reply(200, { ok: true, username: account.username });
  } catch (e) {
    obs?.logError("teacher.invitation.error", e, { action });
    return reply(503, { ok: false, code: "INVITATION_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا." }, { "Retry-After": "5" });
  }
}

app.http("teacherInvitation", { methods: ["POST"], authLevel: "anonymous", route: "teacher-invitation/{action?}", handler: withObservability("teacher-invitation", handler) });
module.exports = { handler };
