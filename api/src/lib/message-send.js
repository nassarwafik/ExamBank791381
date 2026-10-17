// Messages hardening (M.1) — the ONE guarded publication path shared by the teacher and student send actions:
//   1. idempotency: an optional clientMessageId is claimed first (message-send-key.js) — a retry of a message that was
//      already published returns THAT message (no second copy, no second rate-limit token, no second push / audit);
//   2. rate limit: one token from the sender's burst + daily buckets (message-rate-limit.js), fail-closed;
//   3. publication: createMessage (append-only, create-only position write, message-store.js);
//   4. the claim records the published id (or is released when nothing was published, so a retry can succeed).
// Every authorization / send-state decision stays in the route BEFORE this call; this module never decides who may send.
const { downloadJsonOrNull } = require("./platform-storage");
const { createMessage, normalizeStoredMessage } = require("./message-store");
const { reserveMessageSend, rateLimitedResponse } = require("./message-rate-limit");
const { parseClientMessageId, claimSendKey, finalizeSendKey, releaseSendKey, SEND_IN_PROGRESS } = require("./message-send-key");

/**
 * Resolves { response } (a ready 409 / 429 answer — nothing published) or { doc, replay } (the published message;
 * replay:true when an earlier request with the same clientMessageId published it). Storage failures reject.
 */
async function publishGuarded(container, { role, senderId, streamPrefix, expected, clientMessageId, buildDoc }, deps = {}) {
  const key = parseClientMessageId(clientMessageId);
  let claim = null;
  if (key) {
    const c = await (deps.claimSendKey || claimSendKey)(container, { role, senderId, streamPrefix, clientMessageId: key }, deps);
    if (c.status === "pending") return { response: SEND_IN_PROGRESS };
    if (c.status === "replay") {
      const stored = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, streamPrefix + c.messageId + ".json").catch(() => null);
      const doc = normalizeStoredMessage(stored, { ...expected, messageId: c.messageId });
      return doc ? { doc, replay: true } : { response: SEND_IN_PROGRESS };
    }
    claim = c;
  }
  try {
    const decision = await (deps.reserveMessageSend || reserveMessageSend)(container, role, senderId, deps);
    if (!decision.allowed) {
      if (claim) await releaseSendKey(container, claim, deps);
      return { response: rateLimitedResponse(decision) };
    }
    const doc = await createMessage(container, streamPrefix, buildDoc, deps);
    if (claim) await finalizeSendKey(container, claim, doc.messageId, deps);
    return { doc, replay: false };
  } catch (e) {
    if (claim) await releaseSendKey(container, claim, deps);
    throw e;
  }
}

/** Every messages response is private, per-user and live: never stored by a browser or proxy cache. */
function noStore(response) {
  if (!response || typeof response !== "object") return response;
  return { ...response, headers: { ...(response.headers || {}), "Cache-Control": "no-store" } };
}

module.exports = { publishGuarded, noStore };
