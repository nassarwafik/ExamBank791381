// Messages M.5 — EDIT and DELETE of a published message, and the teacher's MODERATION delete.
//
// RULES (the server is the only authority; the view's editableUntil / deletableUntil / canDelete are display hints):
//   • edit   — only the message's own sender (same role AND same sender id), only within EDIT_WINDOW_MS of its
//              createdAt (the server's publication time), only while the sender may still send in that stream, and
//              never a deleted message. The new text passes the same normalizeMessageBody contract as a send and costs
//              one token of the sender's rate limit. An identical text is a no-op (no write).
//   • delete — a STUDENT deletes only their own message, within the same window, while they may still send.
//              A TEACHER deletes their own messages and every STUDENT message of a conversation they may open, at any
//              time and whatever the student's / class's state (moderation: an abusive message must be removable from an
//              archived conversation too). A teacher never deletes another teacher's message. Deleting a deleted message
//              is an idempotent success.
// STORAGE. The ONE message blob is rewritten in place by ETag compare-and-set (mutateJsonWithRetry): the decision is
// re-taken on the freshest version inside every attempt, so an edit can never resurrect a message deleted meanwhile and
// two edits never interleave. The blob is never removed (its stream position stays published — see message-store.js),
// and the id, order key, kind, owner, sender and createdAt never change. A delete leaves a TOMBSTONE whose former text
// (and any edit time) is erased from storage. A missing / malformed document or a non-canonical id is "not found";
// nothing is ever created.
const { mutateJsonWithRetry } = require("./platform-storage");
const { normalizeStoredMessage, normalizeMessageBody, messagePosition, MESSAGE_ID_RE } = require("./message-store");

/** How long after publication the sender may edit (and a student may delete) a message. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

class MessageChangeError extends Error {
  constructor(status, code, message) { super(message); this.name = "MessageChangeError"; this.status = status; this.code = code; }
}
class NoChange extends Error { constructor(doc) { super("no-change"); this.name = "NoChange"; this.doc = doc; } }

const MSG = {
  notFound: "الرسالة غير موجودة.",
  notOwnEdit: "لا يمكنك تعديل هذه الرسالة.",
  notOwnDelete: "لا يمكنك حذف هذه الرسالة.",
  editClosed: "انتهت مهلة تعديل الرسالة (15 دقيقة من إرسالها).",
  deleteClosed: "انتهت مهلة حذف الرسالة (15 دقيقة من إرسالها).",
  deleted: "هذه الرسالة محذوفة ولا يمكن تعديلها.",
  readOnly: "المحادثة متاحة للقراءة فقط."
};

/** The ISO deadline of a message's edit window; "" when its createdAt is unusable (then nothing is ever editable). */
function windowEnd(doc) {
  const t = Date.parse(String(doc && doc.createdAt || ""));
  return Number.isFinite(t) ? new Date(t + EDIT_WINDOW_MS).toISOString() : "";
}
function withinWindow(doc, now) {
  const end = windowEnd(doc);
  return !!end && now <= Date.parse(end);
}
/** Whether `actor` ({ role, id }) is the message's own sender. */
function isOwn(doc, actor) {
  return doc.senderRole === actor.role && String(doc.senderId || "") === String(actor.id || "");
}

/**
 * What `actor` may do with `doc` right now — the SAME rules as editDecision / deleteDecision, as view hints:
 * { editableUntil?, deletableUntil?, canDelete? }. `canSend`: whether the actor may still send in this stream.
 */
function messageActions(doc, actor, { canSend, now = Date.now() } = {}) {
  if (!doc || doc.deleted === true) return {};
  const out = {};
  const own = isOwn(doc, actor);
  const open = withinWindow(doc, now);
  if (own && canSend && open) out.editableUntil = windowEnd(doc);
  if (actor.role === "teacher" && (own || doc.senderRole === "student")) out.canDelete = true;
  else if (actor.role === "student" && own && canSend && open) { out.canDelete = true; out.deletableUntil = windowEnd(doc); }
  return out;
}

/** The edited document, null for a no-op (same text), or a MessageChangeError. */
function editDecision(doc, actor, body, { canSend, now }) {
  if (doc.deleted === true) throw new MessageChangeError(409, "MESSAGE_DELETED", MSG.deleted);
  if (!isOwn(doc, actor)) throw new MessageChangeError(403, "NOT_OWN_MESSAGE", MSG.notOwnEdit);
  if (!canSend) throw new MessageChangeError(403, "READ_ONLY", MSG.readOnly);
  if (!withinWindow(doc, now)) throw new MessageChangeError(403, "EDIT_WINDOW_CLOSED", MSG.editClosed);
  if (doc.body === body) return null;
  return { ...doc, body, editedAt: new Date(now).toISOString() };
}

/** The tombstone, null when already deleted (idempotent), or a MessageChangeError. */
function deleteDecision(doc, actor, { canSend, now }) {
  if (doc.deleted === true) return null;
  const own = isOwn(doc, actor);
  if (actor.role === "teacher") {
    if (!own && doc.senderRole !== "student") throw new MessageChangeError(403, "NOT_OWN_MESSAGE", MSG.notOwnDelete);
  } else {
    if (!own) throw new MessageChangeError(403, "NOT_OWN_MESSAGE", MSG.notOwnDelete);
    if (!canSend) throw new MessageChangeError(403, "READ_ONLY", MSG.readOnly);
    if (!withinWindow(doc, now)) throw new MessageChangeError(403, "DELETE_WINDOW_CLOSED", MSG.deleteClosed);
  }
  const { body: _body, editedAt: _editedAt, ...rest } = doc;
  return { ...rest, body: "", deleted: true, deletedAt: new Date(now).toISOString(), deletedByRole: actor.role };
}

/** Resolves the message's blob name, or throws "not found" for anything that is not a canonical id of this stream. */
function messageBlobName(streamPrefix, messageId) {
  const id = typeof messageId === "string" ? messageId : "";
  if (!MESSAGE_ID_RE.test(id) || messagePosition(id, streamPrefix) < 0) throw new MessageChangeError(404, "MESSAGE_NOT_FOUND", MSG.notFound);
  return streamPrefix + id + ".json";
}

/**
 * Apply `decide(currentDoc)` to ONE message by compare-and-set. Resolves { doc, changed } — `doc` is the stored
 * (validated) document after the call. Rejects with MessageChangeError (404 / 403 / 409) or a storage error.
 */
async function changeMessage(container, { streamPrefix, expected, messageId, decide }, deps = {}) {
  const name = messageBlobName(streamPrefix, messageId);
  const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  try {
    const written = await mutate(container, name, async current => {
      const doc = normalizeStoredMessage(current, { ...expected, messageId });
      if (!doc) throw new MessageChangeError(404, "MESSAGE_NOT_FOUND", MSG.notFound);
      const next = await decide(doc);
      if (!next) throw new NoChange(doc);
      return next;
    });
    return { doc: written, changed: true };
  } catch (e) {
    if (e instanceof NoChange) return { doc: e.doc, changed: false };
    throw e;
  }
}

/**
 * EDIT: validates the text, takes one rate-limit token (only when the text actually changes the current version), then
 * the CAS. `reserve()` resolves the limiter decision ({ allowed, … }); a refusal rejects with { rateLimited }.
 */
async function editMessage(container, { streamPrefix, expected, messageId, actor, body, canSend, reserve }, deps = {}) {
  const text = normalizeMessageBody(body);
  if (!text.ok) throw new MessageChangeError(400, "INVALID_BODY", text.error);
  const now = () => (deps.now ? deps.now() : Date.now());
  let reserved = false;
  return changeMessage(container, {
    streamPrefix, expected, messageId,
    decide: async doc => {
      const next = editDecision(doc, actor, text.body, { canSend, now: now() });
      if (next && !reserved && reserve) {
        const decision = await reserve();
        if (!decision.allowed) { const e = new MessageChangeError(429, "RATE_LIMITED", ""); e.rateLimit = decision; throw e; }
        reserved = true;                                                // a CAS retry never takes a second token
      }
      return next;
    }
  }, deps);
}

/** DELETE (own message, or the teacher's moderation delete of a student message). */
async function deleteMessage(container, { streamPrefix, expected, messageId, actor, canSend }, deps = {}) {
  const now = () => (deps.now ? deps.now() : Date.now());
  return changeMessage(container, { streamPrefix, expected, messageId, decide: doc => deleteDecision(doc, actor, { canSend, now: now() }) }, deps);
}

module.exports = {
  EDIT_WINDOW_MS, MessageChangeError, windowEnd, withinWindow, isOwn, messageActions, editDecision, deleteDecision,
  changeMessage, editMessage, deleteMessage
};
