const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { getContainer, downloadJsonOrNull } = require("../lib/platform-storage");
const { recordOwnerAuditEventStrict } = require("../lib/audit-log");
const { OWNER_TOKEN_TTL_SECONDS, createOwnerToken } = require("../lib/identity/owner-session");
const { ownerSessionName, readOwnerAccount, createOnly, newSessionId } = require("../lib/identity/owner-store");
const { reply, unavailable, notFound, Refusal, startPairing, pollPairing } = require("../lib/identity/qr-pairing");

// Tadris+ QR-1 — the NEW device's side of the QR sign-in for the PLATFORM OWNER (design: docs/enterprise-qr-login-qr1.md).
// Route: POST /api/owner-qr-login/{action}. No session. The owner's pairings live under the owner's own prefix and are approved only
// by an owner session (owner-qr-login-approve), so a teacher / student pairing can never become an owner session (P1-A boundary).
//
//   start → a pairing valid 90 s: { pairingToken, qrPath ("#/owner-qr-login/<token>"), pollSecret, matchCode, … } (budgeted).
//   poll  { pairingToken, pollSecret } → pending | 410 / 404 | once approved: CONSUMED FIRST, then the approving owner session is
//         re-checked (still valid, owner active, same authVersion) → a NEW owner session WITHOUT step-up (`stepUpAtMs: null`):
//         every owner change on the new device asks for the authenticator code again. Recorded strictly BEFORE it exists.

const OWNER_QR_PREFIX = "platform/owner/qr-login/";

async function issueOwner(container, a, record, deps, obs, nowMs) {
  const [session, owner] = await Promise.all([(deps.downloadJsonOrNull || downloadJsonOrNull)(container, ownerSessionName(a.sid)), readOwnerAccount(container, a.subject)]);
  if (!session || session.sid !== a.sid || session.accountId !== a.subject || !(Number(session.expiresAtMs) > nowMs)) throw new Refusal("APPROVER_SESSION_ENDED");
  if (!owner || owner.status !== "active" || owner.authVersion !== session.authVersion || owner.authVersion !== a.authVersion) throw new Refusal("APPROVER_SESSION_ENDED");
  // Recorded BEFORE the session exists (an owner session never appears unrecorded); a failed write → 503, no session.
  await (deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict)(container, { actor: "owner:" + owner.accountId, action: "owner.login.succeeded", targetType: "owner-account", targetId: owner.accountId, details: { factor: "qr", device: record.device } });
  const sid = newSessionId();
  const created = await createOnly(container, ownerSessionName(sid), {
    schemaVersion: 1, sid, accountId: owner.accountId, authVersion: owner.authVersion,
    createdAtMs: nowMs, expiresAtMs: nowMs + OWNER_TOKEN_TTL_SECONDS * 1000, stepUpAtMs: null, factor: "qr"
  });
  if (!created) return unavailable();
  const { token } = createOwnerToken({ accountId: owner.accountId, sid, authVersion: owner.authVersion }, { nowMs, env: deps.env || process.env });
  obs?.logInfo?.("owner.login.succeeded", { factor: "qr" });
  return reply(200, { ok: true, role: "owner", token, expiresInSeconds: OWNER_TOKEN_TTL_SECONDS, owner: { accountId: owner.accountId, username: owner.username, displayName: owner.displayName } });
}

async function handler(request, deps = {}, obs = null) {
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || (action !== "start" && action !== "poll")) return notFound();
  const nowMs = deps.now ? deps.now() : Date.now();
  try {
    const container = deps.container || (deps.getContainer || getContainer)();
    if (action === "start") return await startPairing({ container, request, deps, nowMs, prefix: OWNER_QR_PREFIX, qrPathPrefix: "#/owner-qr-login/" });
    const issuers = { owner: (a, record) => issueOwner(container, a, record, deps, obs, nowMs) };
    return await pollPairing({ container, request, deps, nowMs, prefix: OWNER_QR_PREFIX, issuers, obs });
  } catch (e) {
    obs?.logError?.("owner.qr.error", e, { action });
    return unavailable();
  }
}

app.http("ownerQrLogin", { methods: ["POST"], authLevel: "anonymous", route: "owner-qr-login/{action?}", handler: withObservability("owner-qr-login", handler) });
module.exports = { handler, OWNER_QR_PREFIX };
