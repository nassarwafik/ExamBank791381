const { app } = require("@azure/functions");
const { withObservability } = require("../lib/observability");
const { recordOwnerAuditEventStrict, recordOwnerChange } = require("../lib/audit-log");
const { requireOwnerSession, stepUpDenial } = require("../lib/identity/owner-session");
const { validApproval } = require("../lib/identity/qr-login");
const { reply, unavailable, notFound, bodyOf, pendingPairing, inspectResponse, numberMatches, decide } = require("../lib/identity/qr-pairing");
const { OWNER_QR_PREFIX } = require("./owner-qr-login");

// Tadris+ QR-1 — the owner's SIGNED-IN device approves an owner sign-in on another device (design: docs/enterprise-qr-login-qr1.md).
// Route: POST /api/owner-qr-login-approve/{action}   (an owner session; anonymous → 401 before any storage access)
//
//   inspect { pairingToken }             → what is asking (fixed words), sameNetwork, 3 numbers. Read-only.
//   approve { pairingToken, matchCode }  → needs a RECENT STEP-UP (authenticator code within 10 minutes). The pending owner pairing
//                                          is bound to THIS owner session; a wrong number closes it. Recorded strictly before it
//                                          happens (P10-L): a failed audit write → 503 and nothing changes.
//   deny    { pairingToken }             → the pairing is closed («لست أنا»); an owner session is enough (no step-up), recorded.

async function handler(request, deps = {}, obs = null) {
  const auth = await requireOwnerSession(request, deps);
  if (!auth.ok) return auth.response;
  const { owner, session, container } = auth;
  const method = String(request.method || "POST").toUpperCase();
  const action = String(request.params?.action || "").toLowerCase();
  if (method !== "POST" || !["inspect", "approve", "deny"].includes(action)) return notFound();
  const nowMs = deps.now ? deps.now() : Date.now();
  const approval = { role: "owner", subject: owner.accountId, sid: session.sid, authVersion: owner.authVersion };
  if (!validApproval(approval)) return reply(403, { ok: false, code: "QR_ROLE_UNSUPPORTED", error: "لا يمكن الموافقة من هذه الجلسة." });
  if (action === "approve") { const denial = stepUpDenial(session, nowMs); if (denial) return denial; }
  const body = await bodyOf(request);
  try {
    const pending = await pendingPairing({ container, deps, nowMs, prefix: OWNER_QR_PREFIX, token: body.pairingToken });
    if (pending.response) return pending.response;
    const { name, record } = pending;
    if (action === "inspect") return inspectResponse({ record, request, deps, role: "owner" });

    const matched = action === "approve" && numberMatches(record, body.matchCode);
    const outcome = action === "deny" ? "denied" : matched ? "approved" : "match-failed";
    const closedReason = action === "deny" ? "USER_DENIED" : "MATCH_FAILED";
    const event = { actor: "owner:" + owner.accountId, action: "owner.qr-login." + outcome, targetType: "owner-account", targetId: owner.accountId, details: { device: record.device } };
    // A wrong number DOES change the pairing (it closes it), so it is not «not applied»: the 409 is carried out of the recorded change.
    const recorded = await recordOwnerChange(container, event, async () => {
      const r = await decide({ container, deps, nowMs, name, record, approval: matched ? approval : null, closedReason });
      return r.status === 409 ? { ...r, status: 200, closedOnMismatch: true } : r;
    }, { write: deps.recordOwnerAuditEvent || recordOwnerAuditEventStrict });
    obs?.logInfo?.("owner.qr." + outcome, { status: recorded.status });
    if (recorded && recorded.closedOnMismatch) { const { closedOnMismatch, ...rest } = recorded; return { ...rest, status: 409 }; }   // eslint-disable-line no-unused-vars
    return recorded;
  } catch (e) {
    obs?.logError?.("owner.qr.approve_error", e, { action });
    return unavailable();
  }
}

app.http("ownerQrLoginApprove", { methods: ["POST"], authLevel: "anonymous", route: "owner-qr-login-approve/{action?}", handler: withObservability("owner-qr-login-approve", handler) });
module.exports = { handler };
