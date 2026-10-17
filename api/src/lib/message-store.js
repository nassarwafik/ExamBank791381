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
const { listBlobNames, downloadJsonOrNull, uploadJsonConditional, isConcurrencyConflict, getReadConcurrency, mapConcurrent } = require("./platform-storage");

const MESSAGE_PREFIX = "platform/messages/";
const DIRECT_PREFIX = MESSAGE_PREFIX + "direct/";
const ANNOUNCEMENT_PREFIX = MESSAGE_PREFIX + "announcements/";
const MAX_BODY_LENGTH = 2000;
const DIRECT_HISTORY_LIMIT = 100;
const ANNOUNCEMENT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;
const MAX_CREATE_ATTEMPTS = 5;
// The reader's unread legacy FRONTIER (see scanLegacyFrontier): at most LEGACY_UNREAD_PAGE_LIMIT unread legacy messages
// the reader must acknowledge ride along beyond a page's normal tail, and at most LEGACY_FRONTIER_SCAN_LIMIT unread
// legacy candidates are classified per request — so a long unread 5C history never turns a poll into a full-history
// download; the rest waits for a later page.
const LEGACY_UNREAD_PAGE_LIMIT = 100;
const LEGACY_FRONTIER_SCAN_LIMIT = 400;
const LEGACY_FRONTIER_BATCH = 50;
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

// Messages hardening (M.1) — characters that are never message text: C0/C1 controls (newline and tab are kept), bidi
// embeddings / overrides / isolates (U+202A–202E, U+2066–2069: they can visually reorder a mixed Arabic/Latin line —
// spoofing), zero-width space, word joiners / invisible operators (U+2060–2064) and the BOM. ZWNJ / ZWJ (legitimate in
// Arabic-script orthography) and the LRM / RLM marks (punctuation placement, no reordering of other text) are kept.
// Lone surrogates are dropped. A body made only of such characters is empty and rejected.
// M.3 (audit) — also: the soft hyphen, the Mongolian vowel separator, interlinear annotation marks (U+FFF9–FFFB), Unicode
// TAG characters (U+E0000–E007F, invisible "ASCII smuggling") and the blank FILLER letters (Hangul fillers U+115F /
// U+1160 / U+3164 / U+FFA0, the blank Braille pattern U+2800) that render as nothing — a body made only of them was
// accepted as a "non-empty" message. Line / paragraph separators (U+2028 / U+2029) become ordinary new lines.
function isStrippedCodePoint(cp) {
  return (cp <= 0x08) || cp === 0x0B || cp === 0x0C || (cp >= 0x0E && cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F) ||
    cp === 0x00AD || cp === 0x115F || cp === 0x1160 || cp === 0x180E ||
    cp === 0x200B || (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2060 && cp <= 0x2064) || (cp >= 0x2066 && cp <= 0x2069) ||
    cp === 0x2800 || cp === 0x3164 || cp === 0xFEFF || cp === 0xFFA0 || (cp >= 0xFFF9 && cp <= 0xFFFB) ||
    (cp >= 0xD800 && cp <= 0xDFFF) || (cp >= 0xE0000 && cp <= 0xE007F);
}
// Anything this far above the limit is rejected before any per-character work (a multi-MB body is never scanned).
const MAX_RAW_BODY_LENGTH = MAX_BODY_LENGTH * 4;

/** Plain-text body contract: a string; CRLF / CR / U+2028 / U+2029 → LF; Unicode NFC; invisible / control / bidi-override characters removed
 *  (see isStrippedCodePoint); outer whitespace trimmed; internal text and newlines preserved; 1..MAX_BODY_LENGTH
 *  characters (UTF-16 units, the same unit as the composer's maxLength). Never HTML/Markdown-interpreted. */
function normalizeMessageBody(value) {
  if (typeof value !== "string") return { ok: false, error: "نص الرسالة مطلوب." };
  const tooLong = { ok: false, error: "الرسالة طويلة جدًا (الحد الأقصى " + MAX_BODY_LENGTH + " حرف)." };
  if (value.length > MAX_RAW_BODY_LENGTH) return tooLong;
  let kept = "";
  for (const ch of value.replace(/\r\n?|[\u2028\u2029]/g, "\n").normalize("NFC")) if (!isStrippedCodePoint(ch.codePointAt(0))) kept += ch;
  const body = kept.trim();
  if (!body) return { ok: false, error: "نص الرسالة مطلوب." };
  if (body.length > MAX_BODY_LENGTH) return tooLong;
  return { ok: true, body };
}

/** Thrown when every publication attempt lost the stream-position race: a transient conflict (the caller answers 503,
 *  retryable), never a server fault. */
class MessageContentionError extends Error {
  constructor() { super("Could not publish the message (stream position contention)."); this.name = "MessageContentionError"; this.retryable = true; }
}

/**
 * Bounded-concurrency download of many message-domain JSON blobs, aligned with `names`, where ONE unparsable blob reads
 * as null (skipped like any malformed document) instead of failing the whole batch: a single corrupt message, marker or
 * user document can never turn a whole thread, badge or summary into a permanent 500. Storage errors still throw.
 */
async function downloadManyJsonTolerant(container, names, limit) {
  return mapConcurrent(names, limit || getReadConcurrency(), async name => {
    try { return await downloadJsonOrNull(container, name); }
    catch (e) { if (e instanceof SyntaxError) return null; throw e; }
  });
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
 *
 * M.3 — PUBLICATION STAMP (opt-in: `options.publishNonce`; the message send path always passes one — the idempotency
 * claim's digest or a random value — while other users of this function, e.g. notification events whose stored key set
 * is fixed, keep their documents unchanged). A stamped document carries `publishNonce` (storage-only, never in a
 * view). A create conflict is not always
 * another writer: when the commit succeeded but its response was lost, the storage client's own retry of the SAME
 * create reports "already exists". The conflicting position is therefore read back first — if it holds THIS
 * request's stamp, that is this request's message and it is returned (before M.3 the same body was published again
 * at the next position). A failure that is not a conflict is AMBIGUOUS (the write may have committed): it is marked
 * `publishAmbiguous` so the caller keeps the idempotency claim instead of releasing it (message-send.js).
 */
async function createMessage(container, prefix, buildDoc, deps = {}, options = {}) {
  const upload = deps.uploadJsonConditional || uploadJsonConditional;
  const list = deps.listBlobNames || listBlobNames;
  const read = deps.downloadJsonOrNull || downloadJsonOrNull;
  const now = deps.now || (() => Date.now());
  const publishNonce = typeof options.publishNonce === "string" && options.publishNonce ? options.publishNonce : "";
  let position = maxListedPosition(await list(container, prefix), prefix) + 1;
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++, position++) {
    const messageId = sequencedMessageId(prefix, position);
    const name = prefix + messageId + ".json";
    const built = buildDoc(messageId, new Date(now()).toISOString());          // createdAt = display time only
    const doc = publishNonce ? { ...built, publishNonce } : built;
    try {
      await upload(container, name, doc, null);                           // etag=null → create-only = the commit
      return doc;
    } catch (e) {
      if (!isConcurrencyConflict(e)) { e.publishAmbiguous = true; throw e; }
      if (!publishNonce) continue;                                         // unstamped: a conflict is another writer
      let existing = null;
      try { existing = await read(container, name); } catch { existing = null; }   // unreadable → not provably ours
      if (existing && existing.publishNonce === publishNonce && existing.messageId === messageId) return existing;
    }
  }
  throw new MessageContentionError();
}

/** M.3 — how far back a taken-over idempotency claim looks for the message its earlier request may have published. */
const STAMP_LOOKBACK = 50;

/**
 * The message published under `prefix` with `publishNonce` among the newest STAMP_LOOKBACK sequenced positions, or
 * null. Used only when a stale idempotency claim is taken over (its request may have published, then died before
 * recording it), so that the retry replays that message instead of publishing it again.
 */
async function findPublishedByStamp(container, prefix, expected, publishNonce, deps = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const many = deps.downloadManyJson || downloadManyJsonTolerant;
  const ids = (await list(container, prefix)).map(n => blobMessageId(n, prefix)).filter(id => id && messagePosition(id, prefix) > 0).sort().slice(-STAMP_LOOKBACK);
  const docs = await many(container, ids.map(id => prefix + id + ".json"), getReadConcurrency());
  for (let i = docs.length - 1; i >= 0; i--) {
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: ids[i] });
    if (doc && doc.publishNonce === publishNonce) return doc;
  }
  return null;
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

/** Whether a stored message is one THIS reader must acknowledge: a valid document of this stream (`expected`) that the
 *  reader's sender-role rule (`include`) accepts — exactly what countUnread counts as unread. */
function isRelevantMessage(doc, expected, messageId, include) {
  const valid = normalizeStoredMessage(doc, { ...expected, messageId });
  return !!valid && include(valid);
}

/**
 * The reader's LEGACY FRONTIER. `unreadIds` are the reader's unread legacy ids, ascending (legacy order); `loadDocs(ids)`
 * returns their documents. Walks them oldest-first, classifying each with isRelevantMessage, and stops after the
 * LEGACY_UNREAD_PAGE_LIMIT-th RELEVANT one or after LEGACY_FRONTIER_SCAN_LIMIT candidates. The reader's own (irrelevant)
 * messages never spend the relevant budget. Returns:
 *   classified  Map id → relevant? for every id walked (the frontier window; ids after it are unknown);
 *   frontier    the relevant ids of the window — the only unread relevant legacy ids a page may show or an
 *               acknowledgement may newly cover (message-read-state.js enforces the same rule);
 *   absorbable  when the window holds NO relevant message (the bound was hit, or no unread legacy is left): its ids, all
 *               the reader's own / invalid messages — safe to fold into the reader's legacy boundary (they are never
 *               counted unread), so own messages can never permanently starve the frontier (absorbIrrelevantLegacy).
 *               When the window holds a relevant message, the reader's own acknowledgement of it covers them instead.
 * `until` (optional) stops the walk once ids pass it.
 */
async function scanLegacyFrontier(unreadIds, loadDocs, expected, include, { until } = {}) {
  const classified = new Map();
  const frontier = [];
  const leading = [];
  let i = 0;
  while (i < unreadIds.length && classified.size < LEGACY_FRONTIER_SCAN_LIMIT && frontier.length < LEGACY_UNREAD_PAGE_LIMIT) {
    if (until !== undefined && unreadIds[i] > until) break;
    const slice = unreadIds.slice(i, i + Math.min(LEGACY_FRONTIER_BATCH, LEGACY_FRONTIER_SCAN_LIMIT - classified.size));
    const docs = await loadDocs(slice);
    for (let j = 0; j < slice.length && frontier.length < LEGACY_UNREAD_PAGE_LIMIT; j++) {
      if (until !== undefined && slice[j] > until) break;
      const relevant = isRelevantMessage(docs[j], expected, slice[j], include);
      classified.set(slice[j], relevant);
      if (relevant) frontier.push(slice[j]);
      else if (!frontier.length) leading.push(slice[j]);
    }
    i += slice.length;
  }
  const exhausted = classified.size === unreadIds.length;
  const boundHit = classified.size >= LEGACY_FRONTIER_SCAN_LIMIT && frontier.length < LEGACY_UNREAD_PAGE_LIMIT;
  const absorbable = until === undefined && !frontier.length && (boundHit || exhausted) ? leading : [];
  return { classified, frontier: new Set(frontier), absorbable };
}

/**
 * The most recent `limit` messages under ONE prefix, oldest → newest (by id: legacy ids first), plus the reader's unread
 * legacy frontier and the newest legacy group (see below). Lists names only, sorts them, downloads just the bounded
 * page (and the bounded frontier window). `expected` pins kind + studentId/classId for validation. Reader options:
 * `isLegacyRead(id)` — the reader's legacy read state (its marker); `include(doc)` — the reader's sender-role rule.
 * Without them every legacy id counts as unread and relevant (fail-safe: nothing unread is ever skipped).
 * M.3 options: `isRead(id)` — the reader's read state for BOTH domains; when given, the SEQUENCED UNREAD FRONTIER
 * applies (below). `before` — a message id: an OLDER-HISTORY page (the `limit` visible messages before it).
 * Returns { messages, hasMore, hasNewer, legacyIds, absorbable, sequencedAbsorbable }:
 *   hasMore              a visible message older than the oldest one returned exists (older history to page back to);
 *   hasNewer             an unread relevant sequenced message was held back by the frontier (shown once the page is read);
 *   absorbable / sequencedAbsorbable   the reader's own leading unread runs (see scanLegacyFrontier).
 */
async function listRecentMessages(container, prefix, expected, limit, deps = {}, options = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const many = deps.downloadManyJson || downloadManyJsonTolerant;
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
  // every legacy id below it, so the page must never show a RELEVANT legacy id while hiding an unread relevant one below:
  //   • the reader's unread RELEVANT legacy ids ride along oldest-first, up to LEGACY_UNREAD_PAGE_LIMIT — the reader's
  //     own messages never spend that budget (scanLegacyFrontier);
  //   • an unread relevant legacy id outside that frontier is omitted everywhere (tail and newest group included) — it
  //     stays unread and appears once the frontier before it has been acknowledged (a later page);
  //   • the reader's own messages keep the normal tail / newest-group display (they are never acknowledged, so showing
  //     them can never cover anything), and read ids are always safe (at or below the reader's boundary).
  // Display order (by id) and the sequenced tail are unchanged.
  // SEQUENCED FRONTIER (M.3). The same rule in the sequenced domain: a sequenced acknowledgement through X covers every
  // position below X, so a page showing only the newest `limit` messages let a reader with more unread replies than
  // that mark the older ones read without ever seeing them. With `isRead`, the reader's unread RELEVANT sequenced
  // messages ride along oldest-first (same bounds, same relevance), and an unread relevant one beyond that frontier is
  // omitted (`hasNewer`) until the frontier has been acknowledged — message-read-state.js enforces it on every mark.
  const legacy = visible.filter(e => messagePosition(e.messageId, prefix) === 0);
  const sequenced = visible.filter(e => messagePosition(e.messageId, prefix) > 0);
  const isRead = typeof options.isRead === "function" ? options.isRead : null;
  const isLegacyRead = isRead || (typeof options.isLegacyRead === "function" ? options.isLegacyRead : () => false);
  const isSequencedRead = isRead || (() => true);                         // no `isRead` → no sequenced frontier (as before)
  const include = typeof options.include === "function" ? options.include : () => true;
  const cache = new Map();                                                // name → document (immutable blobs)
  const load = async names => {
    const missing = names.filter(n => !cache.has(n));
    if (missing.length) {
      const got = await many(container, missing, getReadConcurrency());
      missing.forEach((n, i) => cache.set(n, got[i]));
    }
    return names.map(n => cache.get(n));
  };
  const loadIds = ids => load(ids.map(id => prefix + id + ".json"));
  const unreadIds = legacy.filter(e => !isLegacyRead(e.messageId)).map(e => e.messageId);
  const scan = await scanLegacyFrontier(unreadIds, loadIds, expected, include);
  const unreadSequenced = sequenced.filter(e => !isSequencedRead(e.messageId)).map(e => e.messageId);
  const seqScan = await scanLegacyFrontier(unreadSequenced, loadIds, expected, include);
  const before = typeof options.before === "string" && options.before ? options.before : "";
  let chosen;
  if (before) {
    chosen = new Set(visible.filter(e => e.messageId < before).slice(-limit).map(e => e.messageId));
  } else {
    chosen = new Set(visible.slice(-limit).map(e => e.messageId));
    for (const id of scan.frontier) chosen.add(id);
    for (const id of seqScan.frontier) chosen.add(id);
    const newestKey = legacy.length ? legacy[legacy.length - 1].messageId.slice(0, 13) : "";
    for (const e of legacy.filter(x => x.messageId.slice(0, 13) === newestKey).slice(-MAX_HISTORY_LIMIT)) chosen.add(e.messageId);
  }
  const candidates = visible.filter(e => chosen.has(e.messageId));
  const docs = await load(candidates.map(e => e.name));
  const out = [];
  let hasNewer = false;
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[i].messageId;
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: id });
    if (!doc) continue;
    const isLegacy = messagePosition(id, prefix) === 0;
    const unreadRelevant = (isLegacy ? !isLegacyRead(id) : !isSequencedRead(id)) && include(doc);
    if (unreadRelevant && !(isLegacy ? scan.frontier : seqScan.frontier).has(id)) {   // outside the frontier: omitted, stays unread
      if (!isLegacy) hasNewer = true;
      continue;
    }
    out.push(doc);
  }
  const oldestShown = out.length ? out[0].messageId : "";
  const hasMore = !!oldestShown && visible.some(e => e.messageId < oldestShown);
  return { messages: out, hasMore, hasNewer, legacyIds: legacy.map(e => e.messageId), absorbable: before ? [] : scan.absorbable, sequencedAbsorbable: before ? [] : seqScan.absorbable };
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
  MAX_HISTORY_LIMIT, MAX_CREATE_ATTEMPTS, MessageContentionError, downloadManyJsonTolerant,
  isSafeId, directPrefix, announcementPrefix, sequencedMessageId, messagePosition, normalizeMessageBody, clampLimit,
  createMessage, findPublishedByStamp, STAMP_LOOKBACK, listRecentMessages, normalizeStoredMessage, messageView, studentDisplayName,
  // Phase 5D — reused by the read-state store (message ids / stream listing), never duplicated there.
  MESSAGE_ID_RE, SEQUENCE_KEY_BASE, blobMessageId, LEGACY_UNREAD_PAGE_LIMIT, LEGACY_FRONTIER_SCAN_LIMIT, isRelevantMessage,
  scanLegacyFrontier
};
