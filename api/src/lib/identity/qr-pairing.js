const { downloadJsonOrNull, mutateJsonWithRetry, uploadJsonConditional, isConcurrencyConflict } = require("../platform-storage");
const { clientIdFromRequest } = require("../login-throttle");
const {
  PAIRING_TTL_MS, POLL_INTERVAL_MS, pairingName, pollSecretHash, clientHash, startBucketName, validToken, timingSafeEqualHex,
  newPairing, wellFormed, validApproval, pairingState, evaluateStartBucket
} = require("./qr-login");

// Tadris+ QR-1 — the storage steps of a QR sign-in, shared by the two pairing namespaces (design docs/enterprise-qr-login-qr1.md):
//   teacher / student : routes qr-login + qr-login-approve,             pairings under platform/auth/qr-login/
//   platform owner    : routes owner-qr-login + owner-qr-login-approve, pairings under the owner's own prefix
// The namespaces never meet: a pairing started on one sign-in page can only be approved, polled and issued by that page's routes,
// so a teacher / student route never reads or writes owner storage, and an owner route never accepts a teacher / student session
// (the P1-A boundary). Each caller passes its `prefix`, its approver identity and its role issuers; nothing here knows a role.

const NO_STORE = { "Cache-Control": "no-store", "Pragma": "no-cache" };
const reply = (status, body, extra = {}) => ({ status, headers: { ...NO_STORE, ...extra }, jsonBody: body });
const unavailable = () => reply(503, { ok: false, code: "QR_LOGIN_UNAVAILABLE", error: "تعذر تنفيذ الطلب حاليًا. حاول مرة أخرى." }, { "Retry-After": "5" });
const notFound = () => reply(404, { ok: false, code: "NOT_FOUND", error: "غير موجود." });

// What the NEW device is told about a pairing that cannot yield a session (404 unknown / wrong secret, 410 otherwise).
const POLL_GONE = {
  used: ["QR_USED", "استُخدم هذا الرمز من قبل. اعرض رمزًا جديدًا."],
  denied: ["QR_DENIED", "رُفض طلب الدخول من الجهاز الآخر."],
  expired: ["QR_EXPIRED", "انتهت صلاحية الرمز. اعرض رمزًا جديدًا."],
  invalid: ["QR_INVALID", "رمز الدخول غير صالح. اعرض رمزًا جديدًا."]
};
// What the APPROVING device is told about a pairing that is no longer pending.
const APPROVER_GONE = {
  used: ["QR_USED", "استُخدم هذا الرمز من قبل."],
  denied: ["QR_DENIED", "أُغلق طلب الدخول هذا."],
  expired: ["QR_EXPIRED", "انتهت صلاحية الرمز. اطلب من الجهاز الآخر عرض رمز جديد."],
  approved: ["QR_ALREADY_APPROVED", "تمت الموافقة على هذا الطلب من قبل."],
  invalid: ["QR_INVALID", "رمز الدخول غير صالح."]
};
const goneFrom = table => state => { const [code, error] = table[state] || table.invalid; return reply(state === "invalid" ? 404 : 410, { ok: false, code, error }); };
const pollGone = goneFrom(POLL_GONE);
const approverGone = goneFrom(APPROVER_GONE);
const refusedAfterConsume = code => reply(401, { ok: false, code, error: "تعذر إكمال الدخول بالرمز. سجّل الدخول من جديد على الجهاز الآخر ثم أعد المحاولة." });
const MATCH_FAILED = () => reply(409, { ok: false, code: "QR_MATCH_FAILED", error: "الرقم لا يطابق الرقم الظاهر على الجهاز الآخر، فأُلغي الطلب. إن لم تكن أنت من طلب الدخول فتجاهل الأمر." });

/** A refusal raised by an issuer or a compare-and-set step; carries a code, never a secret. */
class Refusal extends Error { constructor(code) { super(code); this.refusal = code; } }
/** The pairing was no longer pending when a decision was written. */
class Closed extends Error { constructor(state) { super(state); this.state = state; } }

async function bodyOf(request) {
  try { const b = await request.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}
const headerOf = (request, name) => { try { return request.headers.get(name); } catch { return null; } };
/** Create-only write → true when created, false when the name already exists (other errors propagate). */
async function createOnly(container, name, value) {
  try { await uploadJsonConditional(container, name, value, null); return true; } catch (e) { if (isConcurrencyConflict(e)) return false; throw e; }
}
const dlOf = deps => deps.downloadJsonOrNull || downloadJsonOrNull;
const mutOf = deps => deps.mutateJsonWithRetry || mutateJsonWithRetry;

/** POST start — a new pairing in `prefix`; `qrPath` (a URL fragment, never sent to a server) is what the QR shows (budgeted per client address; fail closed: a storage error propagates → the route's 503). */
async function startPairing({ container, request, deps, nowMs, prefix, qrPathPrefix }) {
  const clientId = (deps.clientIdFromRequest || clientIdFromRequest)(request);
  let decision = null;
  await mutOf(deps)(container, startBucketName(clientId), current => { decision = evaluateStartBucket(current, nowMs); return decision.next; });
  if (!decision.allowed) return reply(429, { ok: false, code: "RATE_LIMITED", error: "طلبات كثيرة. حاول مرة أخرى بعد قليل." }, { "Retry-After": String(decision.retryAfterSeconds) });
  const { pairingToken, pollSecret, record } = newPairing({ nowMs, userAgent: headerOf(request, "user-agent"), clientId });
  if (!(await createOnly(container, pairingName(pairingToken, prefix), record))) return unavailable();
  return reply(200, {
    ok: true, pairingToken, qrPath: qrPathPrefix + pairingToken, pollSecret, matchCode: record.matchCode,
    expiresAt: new Date(record.expiresAtMs).toISOString(), expiresInSeconds: PAIRING_TTL_MS / 1000, pollIntervalMs: POLL_INTERVAL_MS
  });
}

/**
 * POST poll — pending, gone, or ONCE: the pairing is consumed FIRST (compare-and-set), then `issuers[approval.role]` re-checks the
 * approver and answers the session. A role this namespace does not issue is refused like a malformed approval.
 */
async function pollPairing({ container, request, deps, nowMs, prefix, issuers, obs }) {
  const body = await bodyOf(request);
  const token = body.pairingToken, secret = body.pollSecret;
  if (!validToken(token) || !validToken(secret)) return pollGone("invalid");
  const name = pairingName(token, prefix);
  const secretMatches = r => wellFormed(r) && timingSafeEqualHex(r.pollSecretHash, pollSecretHash(secret));
  const record = await dlOf(deps)(container, name);
  if (!secretMatches(record)) return pollGone("invalid");
  const state = pairingState(record, nowMs);
  if (state === "pending") return reply(200, { ok: true, status: "pending", expiresAt: new Date(record.expiresAtMs).toISOString(), pollIntervalMs: POLL_INTERVAL_MS });
  if (state !== "approved") return pollGone(state);

  // 1. consume first: whatever happens next, this pairing can never yield a session again.
  let consumed = null;
  try {
    await mutOf(deps)(container, name, current => {
      if (!secretMatches(current)) throw new Closed("invalid");
      const s = pairingState(current, nowMs);
      if (s !== "approved") throw new Closed(s);
      consumed = current;
      return { ...current, status: "consumed", consumedAtMs: nowMs };
    });
  } catch (e) {
    if (e instanceof Closed) return pollGone(e.state);
    throw e;
  }
  // 2. the approver is re-checked from storage by its role's issuer.
  const a = consumed.approval;
  const issue = validApproval(a) && Object.prototype.hasOwnProperty.call(issuers, a.role) ? issuers[a.role] : null;
  if (!issue) return refusedAfterConsume("QR_APPROVAL_INVALID");
  try {
    return await issue(a, consumed);
  } catch (e) {
    if (e instanceof Refusal) { obs?.logWarn?.("auth.qr.refused", { role: a.role, reason: e.refusal }); return refusedAfterConsume(e.refusal); }
    throw e;
  }
}

/** The approver's view of a pairing: { name, record } when it is pending, otherwise { response } (404 / 410). Reads only. */
async function pendingPairing({ container, deps, nowMs, prefix, token }) {
  if (!validToken(token)) return { response: approverGone("invalid") };
  const name = pairingName(token, prefix);
  const record = await dlOf(deps)(container, name);
  const state = pairingState(record, nowMs);
  if (state !== "pending") return { response: approverGone(state) };
  return { name, record };
}

/** inspect — what is asking, and the 3 numbers. Writes nothing. */
function inspectResponse({ record, request, deps, role }) {
  const sameNetwork = record.clientHash === clientHash((deps.clientIdFromRequest || clientIdFromRequest)(request));
  return reply(200, { ok: true, role, device: record.device, sameNetwork, matchOptions: record.matchOptions, createdAt: new Date(record.createdAtMs).toISOString(), expiresAt: new Date(record.expiresAtMs).toISOString() });
}

/** Whether the number the user picked is the one shown beside the QR. */
function numberMatches(record, picked) {
  const n = Number(picked);
  return Number.isInteger(n) && n === record.matchCode;
}

/**
 * Writes the approver's decision under compare-and-set: approved (bound to `approval`), or closed (`closedReason`). The pairing must
 * still be pending — a racing approval or an expiry in between answers 410 and writes nothing.
 */
async function decide({ container, deps, nowMs, name, record, approval, closedReason }) {
  try {
    await mutOf(deps)(container, name, current => {
      const s = pairingState(current, nowMs);
      if (s !== "pending") throw new Closed(s);
      if (current.matchCode !== record.matchCode) throw new Closed("invalid");
      return approval
        ? { ...current, status: "approved", approval, approvedAtMs: nowMs }
        : { ...current, status: "denied", closedReason };
    });
  } catch (e) {
    if (e instanceof Closed) return approverGone(e.state);
    throw e;
  }
  if (approval) return reply(200, { ok: true, status: "approved" });
  return closedReason === "MATCH_FAILED" ? MATCH_FAILED() : reply(200, { ok: true, status: "denied" });
}

module.exports = {
  NO_STORE, reply, unavailable, notFound, Refusal, bodyOf, startPairing, pollPairing, pendingPairing, inspectResponse, numberMatches, decide
};
