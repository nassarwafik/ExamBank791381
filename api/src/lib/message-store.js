// Phase 5C — Teacher/Student Messaging & Class Announcements: the storage authority.
//
// APPEND-ONLY, ONE BLOB PER MESSAGE. A conversation is never stored as one shared, repeatedly rewritten array:
//   platform/messages/direct/<studentId>/<messageId>.json         teacher ↔ ONE student (keyed by the student)
//   platform/messages/announcements/<classId>/<messageId>.json    teacher → ONE class (one-way)
// Every send is an independent CREATE-ONLY write (If-None-Match:"*"), so a teacher and a student sending at the same
// moment can never overwrite each other, there is no whole-thread CAS / lost update, history is immutable, and one
// failed send cannot corrupt older history. There is no edit / delete / unsend in Phase 5C.
//
// Message ids are generated HERE (server side): a 13-digit Date.now() prefix + cryptographic randomness, so blob
// names sort chronologically. A create collision regenerates the id and retries — an existing blob is NEVER
// overwritten. Nothing the browser sends (messageId, createdAt, sender*) is ever authority.
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
const SENDER_ROLES = new Set(["teacher", "student"]);
const MESSAGE_ID_RE = /^\d{13}-[a-f0-9]{16}$/;

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

/** Server-generated, chronologically sortable message id: <13-digit ms>-<16 hex chars of crypto randomness>. */
function generateMessageId(nowMs = Date.now(), randomBytes = crypto.randomBytes) {
  const ms = Math.max(0, Math.floor(Number(nowMs) || 0));
  return String(ms).padStart(13, "0").slice(-13) + "-" + randomBytes(8).toString("hex");
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

/**
 * Create-only write of ONE new message under `prefix`. `buildDoc(messageId, createdAt)` returns the full document.
 * A blob-name collision (If-None-Match conflict) regenerates the id and retries; an existing message is never
 * overwritten. Returns the stored document.
 */
// Last issued id timestamp in THIS process. Ids are ordered by their time prefix, so two sends within the same
// millisecond would otherwise order by their random suffix; issuing strictly increasing milliseconds per process keeps
// rapid consecutive sends (e.g. a teacher's quick follow-ups) in send order. Across instances, order is by clock.
let lastIssuedMs = 0;
function nextMonotonicMs(nowMs) {
  const ms = Math.max(Math.floor(Number(nowMs) || 0), lastIssuedMs + 1);
  lastIssuedMs = ms;
  return ms;
}

async function createMessage(container, prefix, buildDoc, deps = {}) {
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const now = deps.now || (() => Date.now());
  const newId = deps.generateMessageId || generateMessageId;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const ms = nextMonotonicMs(now());
    const messageId = newId(ms);
    const doc = buildDoc(messageId, new Date(ms).toISOString());
    try {
      await upload(container, prefix + messageId + ".json", doc, null);   // etag=null → create-only
      return doc;
    } catch (e) {
      if (!isConcurrencyConflict(e)) throw e;                             // only an id collision is retried
    }
  }
  throw new Error("Could not allocate a unique message id.");
}

function blobMessageId(name, prefix) {
  if (!name.startsWith(prefix) || !name.endsWith(".json")) return "";
  const id = name.slice(prefix.length, -".json".length);
  return MESSAGE_ID_RE.test(id) ? id : "";
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
 * The most recent `limit` messages under ONE prefix, oldest → newest. Lists names only, sorts them (ids are
 * chronological), downloads just the bounded tail. `expected` pins kind + studentId/classId for validation.
 */
async function listRecentMessages(container, prefix, expected, limit, deps = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const many = deps.downloadManyJson || downloadManyJson;
  const entries = [];
  for (const name of await list(container, prefix)) {
    const messageId = blobMessageId(name, prefix);
    if (messageId) entries.push({ name, messageId });
  }
  entries.sort((a, b) => (a.messageId < b.messageId ? -1 : a.messageId > b.messageId ? 1 : 0));
  const page = entries.slice(-limit);
  const docs = await many(container, page.map(e => e.name), getReadConcurrency());
  const out = [];
  for (let i = 0; i < page.length; i++) {
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: page[i].messageId });
    if (doc) out.push(doc);
  }
  return { messages: out, hasMore: entries.length > page.length };
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
  isSafeId, directPrefix, announcementPrefix, generateMessageId, normalizeMessageBody, clampLimit,
  createMessage, listRecentMessages, normalizeStoredMessage, messageView, studentDisplayName
};
