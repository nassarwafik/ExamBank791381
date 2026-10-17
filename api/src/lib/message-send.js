// Messages hardening (M.1) — the ONE guarded publication path shared by the teacher and student send actions:
//   1. idempotency: an optional clientMessageId is claimed first (message-send-key.js) — a retry of a message that was
//      already published returns THAT message (no second copy, no second rate-limit token, no second push / audit);
//   2. rate limit: one token from the sender's burst + daily buckets (message-rate-limit.js), fail-closed;
//   3. publication: createMessage (append-only, create-only position write, message-store.js);
//   4. the claim records the published id (or is released when nothing was published, so a retry can succeed).
// M.3 — publication is stamped with the claim's digest: a create whose response was lost, an ambiguous failure (the
// claim is then kept) and a stale claim taken over all resolve to the ONE message already published (createMessage /
// findPublishedByStamp), never to a second copy.
// Every authorization / send-state decision stays in the route BEFORE this call; this module never decides who may send.
const { downloadJsonOrNull } = require("./platform-storage");
const { createMessage, findPublishedByStamp, normalizeStoredMessage } = require("./message-store");
const { reserveMessageSend, rateLimitedResponse } = require("./message-rate-limit");
const { parseClientMessageId, claimSendKey, claimStamp, finalizeSendKey, releaseSendKey, SEND_IN_PROGRESS } = require("./message-send-key");

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
  const publishNonce = claim ? claimStamp(claim) : undefined;
  try {
    // M.3 — a stale claim taken over: its request may have published and died before recording it (or its response was
    // lost). That message is replayed, never published a second time.
    if (claim && claim.takeover) {
      const earlier = await findPublishedByStamp(container, streamPrefix, expected, publishNonce, deps);
      if (earlier) {
        await finalizeSendKey(container, claim, earlier.messageId, deps);
        return { doc: earlier, replay: true };
      }
    }
    const decision = await (deps.reserveMessageSend || reserveMessageSend)(container, role, senderId, deps);
    if (!decision.allowed) {
      if (claim) await releaseSendKey(container, claim, deps);
      return { response: rateLimitedResponse(decision) };
    }
    const doc = await createMessage(container, streamPrefix, buildDoc, deps, { publishNonce });
    if (claim) await finalizeSendKey(container, claim, doc.messageId, deps);
    return { doc, replay: false };
  } catch (e) {
    // An AMBIGUOUS publication failure (the write may have committed) keeps the claim pending: a retry within the TTL
    // waits (409), a later one takes it over and replays the message if it was published. Anything else released.
    if (claim && !e.publishAmbiguous) await releaseSendKey(container, claim, deps);
    throw e;
  }
}

/** Every messages response is private, per-user and live: never stored by a browser or proxy cache. */
function noStore(response) {
  if (!response || typeof response !== "object") return response;
  return { ...response, headers: { ...(response.headers || {}), "Cache-Control": "no-store" } };
}

module.exports = { publishGuarded, noStore };
