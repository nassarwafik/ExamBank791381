// Phase 5C — Teacher/Student Messaging & Class Announcements: the storage authority.
//
// APPEND-ONLY, ONE BLOB PER MESSAGE. A conversation is never stored as one shared, repeatedly rewritten array:
//   platform/messages/direct/<studentId>/<messageId>.json         teacher ↔ ONE student (keyed by the student)
//   platform/messages/announcements/<classId>/<messageId>.json    teacher → ONE class (one-way)
// Every send is an independent CREATE-ONLY write (If-None-Match:"*"), so a teacher and a student sending at the same
// moment can never overwrite each other, there is no whole-thread CAS / lost update, history is immutable, and one
// failed send cannot corrupt older history. There is no edit / delete / unsend in Phase 5C.
//
// PUBLICATION ORDER (Phase 5D third review). A message id is assigned BY ITS PUBLICATION, not by a clock: each stream
// is a dense sequence of positions 1, 2, 3, … and a message is published by the create-only write (If-None-Match:"*")
// of the blob for the NEXT position. That single atomic write is both the commit and the ordering authority:
//   • a writer only attempts position p after observing p-1 exist (the listing max, or a create conflict at p-1),
//     so positions become visible strictly in order and the visible sequenced set is always a prefix 1..n;
//   • two concurrent writers race for the SAME blob name — exactly one wins, the other gets 409 and moves to p+1;
//   • there is no second write, so a crash leaves either a published message or nothing (never a half-state).
// A message that is slow to upload therefore cannot appear "below" a message published after it: if it loses the race
// it is published at a LATER position. Wall clocks (Date.now / per-process monotonic ms) are only the display time
// (createdAt) and never ordering authority — a process-local monotonic clock orders id ALLOCATION, not publication.
// The id keeps the public format "<13 digits>-<16 hex>": the 13 digits are the ORDER KEY SEQUENCE_KEY_BASE + position
// (above every legacy millisecond id) and the hex is a deterministic digest of (stream, position), so the blob name
// for a position is fixed (the create-only race is on the same name) and ids stay distinct across streams.
// LEGACY ids (Phase 5C, "<ms>-<random hex>", order key < SEQUENCE_KEY_BASE) stay readable and sort before every
// sequenced id; they are never written by this code. Nothing the browser sends (messageId, createdAt, sender*) is
// ever authority.
//
// Reads are always NARROW: one student's direct prefix or one class's announcement prefix — never a scan of all
// messages. Names are listed (cheap, no download), sorted, and only the bounded most-recent page is downloaded.
const crypto = require("crypto");
const { listBlobNames, downloadManyJson, uploadJsonConditional, isConcurrencyConflict, getReadConcurrency } = require("./platform-storage");

const MESSAGE_PREFIX = "platform/messages/";
const DIRECT_PREFIX = MESSAGE_PREFIX + "direct/";
const ANNOUNCEMENT_PREFIX = MESSAGE_PREFIX + "announcements/";
const MAX_BODY_LENGTH = 2000;
const DIRECT_HISTORY_LIMIT = 100;
const ANNOUNCEMENT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;
const MAX_CREATE_ATTEMPTS = 5;
// Unread LEGACY ids a page carries beyond its normal tail (the reader's oldest unread legacy frontier). Bounded so a
// long unread 5C history never turns a poll into a full-history download; the rest waits for a later page.
const LEGACY_UNREAD_PAGE_LIMIT = 100;
const SENDER_ROLES = new Set(["teacher", "student"]);
const MESSAGE_ID_RE = /^\d{13}-[a-f0-9]{16}$/;
// Order key of stream position 1 is SEQUENCE_KEY_BASE + 1. Every legacy millisecond id (< year 2255) sorts below it.
const SEQUENCE_KEY_BASE = 9000000000000;
const MAX_POSITION = 999999999999;

/** A storage-safe id segment (class ids / user ids are UUIDs). Anything else — "../", "/", "%", empty, oversized —
 *  is REJECTED (never rewritten, so two different ids can never map to the same prefix). */
function isSafeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function directPrefix(studentId) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  return DIRECT_PREFIX + studentId + "/";
}
function announcementPrefix(classId) {
  if (!isSafeId(classId)) throw new Error("Unsafe class id.");
  return ANNOUNCEMENT_PREFIX + classId + "/";
}

/** The id (and blob name) of stream position `position`: "<SEQUENCE_KEY_BASE + position>-<digest(stream, position)>". */
function sequencedMessageId(prefix, position) {
  if (!Number.isInteger(position) || position < 1 || position > MAX_POSITION) throw new Error("Invalid message position.");
  const digest = crypto.createHash("sha256").update("message-position\n" + prefix + "\n" + position).digest("hex");
  return String(SEQUENCE_KEY_BASE + position) + "-" + digest.slice(0, 16);
}

/** The stream position of a sequenced id under `prefix`; 0 for a legacy (millisecond) id; -1 when the id claims a
 *  sequenced order key but is not the canonical id of that position in THIS stream (never trusted). */
function messagePosition(id, prefix) {
  if (typeof id !== "string" || !MESSAGE_ID_RE.test(id)) return -1;
  const key = Number(id.slice(0, 13));
  if (key <= SEQUENCE_KEY_BASE) return key < SEQUENCE_KEY_BASE ? 0 : -1;
  const position = key - SEQUENCE_KEY_BASE;
  return sequencedMessageId(prefix, position) === id ? position : -1;
}

/** Plain-text body contract: a string; CRLF → LF; control characters (except newline/tab) removed; outer whitespace
 *  trimmed; internal text and newlines preserved; 1..MAX_BODY_LENGTH characters. Never HTML/Markdown-interpreted. */
function normalizeMessageBody(value) {
  if (typeof value !== "string") return { ok: false, error: "نص الرسالة مطلوب." };
  const body = value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!body) return { ok: false, error: "نص الرسالة مطلوب." };
  if (body.length > MAX_BODY_LENGTH) return { ok: false, error: "الرسالة طويلة جدًا (الحد الأقصى " + MAX_BODY_LENGTH + " حرف)." };
  return { ok: true, body };
}

/** A bounded page size: a missing/invalid value → the default; anything larger → MAX_HISTORY_LIMIT. */
function clampLimit(value, fallback) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, MAX_HISTORY_LIMIT);
}

/** Highest stream position visible in a listing (0 when the stream has no sequenced message yet). */
function maxListedPosition(names, prefix) {
  let max = 0;
  for (const name of names) {
    const id = blobMessageId(name, prefix);
    if (id) max = Math.max(max, messagePosition(id, prefix));
  }
  return max;
}

/**
 * PUBLISH one new message under `prefix` at the next stream position (see PUBLICATION ORDER above).
 * `buildDoc(messageId, createdAt)` returns the full document. The position is the listed maximum + 1; a create
 * conflict means another writer published that position first, so the next position is tried — an existing message is
 * never overwritten and a message is never published below one that became visible before it. Returns the document.
 */
async function createMessage(container, prefix, buildDoc, deps = {}) {
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const list = deps.listBlobNames || listBlobNames;
  const now = deps.now || (() => Date.now());
  let position = maxListedPosition(await list(container, prefix), prefix) + 1;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++, position++) {
    const messageId = sequencedMessageId(prefix, position);
    const doc = buildDoc(messageId, new Date(now()).toISOString());   // createdAt = display time only
    try {
      await upload(container, prefix + messageId + ".json", doc, null);   // etag=null → create-only = the commit
      return doc;
    } catch (e) {
      if (!isConcurrencyConflict(e)) throw e;                             // only "position already published" retries
    }
  }
  throw new Error("Could not publish the message (stream position contention).");
}

/**
 * The unread legacy ids a page can NOT carry: `legacyIds` ascending, unread per `isRead`, beyond the first
 * LEGACY_UNREAD_PAGE_LIMIT unread ones. A page omits exactly these (wherever they would otherwise appear), and an
 * acknowledgement may never newly cover one of them (message-read-state.js) — so a legacy boundary can only advance
 * over unread legacy messages a page has actually shown. Empty when every unread legacy id fits.
 */
function unreadLegacyOverflow(legacyIds, isRead) {
  const unread = legacyIds.filter(id => !isRead(id));
  return new Set(unread.slice(LEGACY_UNREAD_PAGE_LIMIT));
}

/** The message id of a stream blob name: a legacy id, or the CANONICAL id of a sequenced position; else "". */
function blobMessageId(name, prefix) {
  if (!name.startsWith(prefix) || !name.endsWith(".json")) return "";
  const id = name.slice(prefix.length, -".json".length);
  return messagePosition(id, prefix) >= 0 ? id : "";
}

/** A stored document is accepted only when it matches where it was read from; anything malformed is skipped. */
function normalizeStoredMessage(doc, expected) {
  if (!doc || typeof doc !== "object") return null;
  if (doc.kind !== expected.kind || doc.messageId !== expected.messageId) return null;
  if (expected.kind === "direct" && doc.studentId !== expected.studentId) return null;
  if (expected.kind === "announcement" && (doc.classId !== expected.classId || doc.senderRole !== "teacher")) return null;
  if (!SENDER_ROLES.has(doc.senderRole)) return null;
  if (typeof doc.body !== "string" || !doc.body) return null;
  return doc;
}

/**
 * The most recent `limit` messages under ONE prefix, oldest → newest (by id: legacy ids first), plus the reader's unread
 * legacy frontier and the newest legacy group (see below). Lists names only, sorts them, downloads just the bounded
 * page. `expected` pins kind + studentId/classId for validation. `options.isLegacyRead(id)` is the READER's legacy read
 * state (its marker); without it every legacy id counts as unread (fail-safe: nothing is ever skipped).
 */
async function listRecentMessages(container, prefix, expected, limit, deps = {}, options = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const many = deps.downloadManyJson || downloadManyJson;
  const entries = [];
  for (const name of await list(container, prefix)) {
    const messageId = blobMessageId(name, prefix);
    if (messageId) entries.push({ name, messageId });
  }
  entries.sort((a, b) => (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0));
  // Only the CONTIGUOUS published prefix 1..n is shown: a listing is not an atomic snapshot, so a position seen after
  // a gap (its predecessor was missed by this listing) waits for the next read — a reader can never be shown, and so
  // acknowledge, a position whose predecessor it did not see. Legacy ids are unaffected.
  let nextPosition = 1;
  const visible = entries.filter(e => {
    const position = messagePosition(e.messageId, prefix);
    if (position === 0) return true;
    if (position !== nextPosition) return false;
    nextPosition++;
    return true;
  });
  // LEGACY FRONTIER. Legacy ids sort before every sequenced id, so in a long stream legacy messages published late (by
  // a still-running Phase 5C writer, e.g. across a rollback) fall outside the tail. A legacy acknowledgement covers
  // every legacy id below it, so the page must never show a legacy id while hiding an UNREAD one below it:
  //   • the reader's unread legacy ids ride along oldest-first, up to LEGACY_UNREAD_PAGE_LIMIT;
  //   • unread legacy ids beyond that bound are omitted everywhere (tail and newest group included) — they stay
  //     unread and appear once the frontier before them has been acknowledged (a later page);
  //   • the newest legacy group rides along too (a late message stays visible after it was read); its unread ids
  //     obey the bound above, its read ids are always safe (they sit at or below the reader's boundary).
  // Display order (by id) and the sequenced tail are unchanged.
  const legacy = visible.filter(e => messagePosition(e.messageId, prefix) === 0);
  const isLegacyRead = typeof options.isLegacyRead === "function" ? options.isLegacyRead : () => false;
  const overflow = unreadLegacyOverflow(legacy.map(e => e.messageId), isLegacyRead);
  const chosen = new Set(visible.slice(-limit));
  const unread = legacy.filter(e => !isLegacyRead(e.messageId) && !overflow.has(e.messageId));
  for (const e of unread) chosen.add(e);
  const newestKey = legacy.length ? legacy[legacy.length - 1].messageId.slice(0, 13) : "";
  for (const e of legacy.filter(x => x.messageId.slice(0, 13) === newestKey).slice(-MAX_HISTORY_LIMIT)) chosen.add(e);
  const page = visible.filter(e => chosen.has(e) && !overflow.has(e.messageId));
  const docs = await many(container, page.map(e => e.name), getReadConcurrency());
  const out = [];
  for (let i = 0; i < page.length; i++) {
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: page[i].messageId });
    if (doc) out.push(doc);
  }
  return { messages: out, hasMore: visible.length > page.length };
}

/** The public view of a message. Never includes storage paths, sender ids or send-time class metadata unless the
 *  (teacher) caller explicitly asks for the conversation context. */
function messageView(doc, options = {}) {
  const view = {
    messageId: String(doc.messageId),
    kind: String(doc.kind),
    senderRole: String(doc.senderRole),
    senderDisplayName: String(doc.senderDisplayName || ""),
    body: String(doc.body),
    createdAt: String(doc.createdAt || "")
  };
  if (options.includeStudentId && doc.kind === "direct") view.studentId = String(doc.studentId);
  if (options.includeClassId && doc.kind === "announcement") view.classId = String(doc.classId);
  return view;
}

/** Server-derived student display name from the CURRENT student document. */
function studentDisplayName(student) {
  const name = String(student?.displayName || "").trim();
  if (name) return name;
  return [student?.firstName, student?.familyName].map(v => String(v || "").trim()).filter(Boolean).join(" ") || "طالب";
}

module.exports = {
  MESSAGE_PREFIX, DIRECT_PREFIX, ANNOUNCEMENT_PREFIX, MAX_BODY_LENGTH, DIRECT_HISTORY_LIMIT, ANNOUNCEMENT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT, MAX_CREATE_ATTEMPTS,
  isSafeId, directPrefix, announcementPrefix, sequencedMessageId, messagePosition, normalizeMessageBody, clampLimit,
  createMessage, listRecentMessages, normalizeStoredMessage, messageView, studentDisplayName,
  // Phase 5D — reused by the read-state store (message ids / stream listing), never duplicated there.
  MESSAGE_ID_RE, SEQUENCE_KEY_BASE, blobMessageId, LEGACY_UNREAD_PAGE_LIMIT, unreadLegacyOverflow
};
