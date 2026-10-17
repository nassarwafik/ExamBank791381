// Messages hardening (M.1) — IDEMPOTENT SENDS. A browser may resend the same message (a network retry, a proxy replay,
// a timeout while the server was still publishing — the teacher send waits up to the push budget). Without a key every
// retry published another copy. The client now sends an opaque `clientMessageId` per composed message, reused on every
// retry of that message; the server keeps ONE claim document per (sender role, sender, stream, clientMessageId):
//   platform/messages/send-keys/<sha256(...)>.json   { state: "pending", claimedAt } → { state: "sent", messageId, sentAt }
// The claim is a CREATE-ONLY write, so of two concurrent requests with the same key exactly one publishes; the other
// gets the published message back (replay) or, while the first is still in flight, a retryable 409. A pending claim
// older than PENDING_TTL_MS (its request died between claim and publish) may be taken over with an ETag CAS. A request
// without a key keeps the previous behaviour (no claim, every request publishes).
const crypto = require("crypto");
const { uploadJsonConditional, downloadJsonWithEtagOrNull, deleteBlobConditional, isConcurrencyConflict } = require("./platform-storage");

const SEND_KEY_PREFIX = "platform/messages/send-keys/";
const CLIENT_MESSAGE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const PENDING_TTL_MS = 30 * 1000;
const MESSAGE_ID_RE = /^\d{13}-[a-f0-9]{16}$/;

/** A usable client key, or "" (absent / malformed keys simply disable idempotency for that request). */
function parseClientMessageId(value) {
  return typeof value === "string" && CLIENT_MESSAGE_ID_RE.test(value) ? value : "";
}

function sendKeyName({ role, senderId, streamPrefix, clientMessageId }) {
  const digest = crypto.createHash("sha256").update(["send-key", role, String(senderId), streamPrefix, clientMessageId].join("\n")).digest("hex");
  return SEND_KEY_PREFIX + digest + ".json";
}

/**
 * Claims the key. Resolves one of:
 *   { status: "new", name, etag }        this request publishes (then finalizeSendKey / releaseSendKey)
 *   { status: "replay", messageId }      the message was already published by an earlier request with this key
 *   { status: "pending" }                an earlier request with this key is still publishing (retryable)
 */
async function claimSendKey(container, key, deps = {}) {
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const read = deps.downloadJsonWithEtagOrNull || downloadJsonWithEtagOrNull;
  const nowMs = deps.now ? deps.now() : Date.now();
  const name = sendKeyName(key);
  const pending = { schemaVersion: 1, state: "pending", claimedAt: new Date(nowMs).toISOString() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return { status: "new", name, etag: await upload(container, name, pending, null) }; }
    catch (e) { if (!isConcurrencyConflict(e)) throw e; }
    const { value, etag } = await read(container, name);
    if (!value) continue;                                                  // released meanwhile → claim again
    if (value.state === "sent" && MESSAGE_ID_RE.test(String(value.messageId || ""))) return { status: "replay", messageId: String(value.messageId) };
    const claimedMs = Date.parse(String(value.claimedAt || ""));
    if (Number.isFinite(claimedMs) && nowMs - claimedMs < PENDING_TTL_MS) return { status: "pending" };
    try { return { status: "new", name, etag: await upload(container, name, pending, etag) }; }   // stale claim: take over
    catch (e) { if (isConcurrencyConflict(e)) return { status: "pending" }; throw e; }
  }
  return { status: "pending" };
}

/** Records the published message on the claim (best-effort: a failure only weakens a later retry's replay). */
async function finalizeSendKey(container, claim, messageId, deps = {}) {
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const nowMs = deps.now ? deps.now() : Date.now();
  try { await upload(container, claim.name, { schemaVersion: 1, state: "sent", messageId, sentAt: new Date(nowMs).toISOString() }, claim.etag); }
  catch { /* best-effort */ }
}

/** Removes an unused claim (the send was refused or failed before publishing) so a retry with the same key can publish. */
async function releaseSendKey(container, claim, deps = {}) {
  const del = deps.deleteBlobConditional || deleteBlobConditional;
  try { await del(container, claim.name, claim.etag); } catch { /* best-effort: it expires after PENDING_TTL_MS */ }
}

const SEND_IN_PROGRESS = { status: 409, jsonBody: { ok: false, code: "SEND_IN_PROGRESS", error: "الرسالة قيد الإرسال بالفعل. انتظر لحظة ثم حدّث المحادثة." } };

module.exports = { SEND_KEY_PREFIX, CLIENT_MESSAGE_ID_RE, PENDING_TTL_MS, parseClientMessageId, sendKeyName, claimSendKey, finalizeSendKey, releaseSendKey, SEND_IN_PROGRESS };
