// Phase 6D — NON-MESSAGE student notification events (the unified bell's second source; messages are NOT here).
//
// Direct messages and class announcements keep their own canonical storage (message-store.js) and their own Phase 5D
// read markers (message-read-state.js) — they are never copied into this store, so a message has exactly ONE unread
// authority. This store holds only events that have no other stream: an assignment was published, a deadline was
// extended, a module was published, a teacher reviewed / reacted / wrote a note.
//
// STORAGE — immutable, append-only, one blob per event, TWO narrow scopes (never a fan-out of one class event into N
// student blobs):
//   platform/notifications/class/<classId>/<eventId>.json      one event for a whole class (read by its current members)
//   platform/notifications/student/<studentId>/<eventId>.json  one event for ONE student only
//   platform/notifications/read-state/<studentId>.json         that student's event read state (see READ STATE)
// An event id is a SEQUENCED publication position of its stream, exactly like a message (message-store.createMessage):
// the create-only write (If-None-Match:"*") of the blob for position p is the commit AND the ordering authority, so a
// later-published event always has a larger position, and a forged id from another stream never validates (the id's
// digest is bound to the stream prefix).
//
// EVENT DOCUMENT — { schemaVersion, eventId, type, scope, createdAt (server), dedupeKey, ...safe fields of the type }.
// Only routing/presentation metadata: assignment id/title, course/module ids (titles are resolved from the registry at
// read time), achievement postId + reaction, a truncated teacher-note preview, the student's OWN review flags and
// percentage. Never exam questions, answers, tokens, another student's data or internal paths.
//
// RECORDING IS SECONDARY. Producers call recordEventSafely AFTER their authoritative mutation committed and only when
// that commit really changed student-facing state. A storage failure here is logged (type + scope only) and swallowed:
// it can never roll back or fail the educational action. IDEMPOTENCY: each producer derives a deterministic dedupeKey
// from the committed transition (e.g. the assignment id + the committed updatedAt); before publishing, the newest
// DEDUPE_WINDOW events of the stream are checked for that key, so a retried event write (e.g. an ambiguous network
// failure after the create) never publishes the same transition twice. A no-op request (nothing changed) never reaches
// the store at all.
//
// READ STATE — per student, per stream: { through, read[] } of stream POSITIONS. position <= through → read; a
// position listed in read[] → read; everything else → unread. Acknowledging event p adds exactly p (never a newer or an
// older unread event); contiguous read positions directly above `through` are compacted into it. A GET never writes.
const crypto = require("crypto");
const { downloadManyJson, downloadJsonOrNull, mutateJsonWithRetry, getReadConcurrency } = require("./platform-storage");
const { isSafeId, createMessage, messagePosition } = require("./message-store");
const { listStreamIds } = require("./message-read-state");

const EVENT_PREFIX = "platform/notifications/";
const EVENT_TYPES = Object.freeze([
  "assignment_published", "assignment_deadline_extended", "assignment_reopened", "assignment_retry_granted",
  "attempt_time_extended", "learning_module_published", "assignment_reviewed", "teacher_reaction", "teacher_note"
]);
// Which scope each type may be stored in (a class-wide deadline extension is class scope; a per-student one is personal).
const TYPE_SCOPES = Object.freeze({
  assignment_published: ["class"],
  assignment_deadline_extended: ["class", "student"],
  assignment_reopened: ["student"],
  assignment_retry_granted: ["student"],
  attempt_time_extended: ["student"],
  learning_module_published: ["class"],
  assignment_reviewed: ["student"],
  teacher_reaction: ["student"],
  teacher_note: ["student"]
});
const REACTION_IDS = Object.freeze(["heart", "clap", "cheer", "fire"]);
const DEDUPE_WINDOW = 20;
const NOTE_PREVIEW_LENGTH = 120;
const TITLE_LENGTH = 200;
const MAX_READ_SET = 500;
const MAX_CLASS_STATES = 20;

// Control characters (C0 + DEL) become spaces; whitespace collapses; never cuts a surrogate pair.
const isControl = ch => { const c = ch.codePointAt(0); return c < 32 || c === 127; };
const cleanText = (value, max) => {
  const chars = Array.from(Array.from(String(value == null ? "" : value)).map(ch => (isControl(ch) ? " " : ch)).join("").replace(/\s+/g, " ").trim());
  return chars.length > max ? chars.slice(0, max - 1).join("").trimEnd() + "…" : chars.join("");
};
const cleanIso = value => { const t = Date.parse(String(value || "")); return Number.isFinite(t) ? new Date(t).toISOString() : ""; };
const cleanInt = value => { const n = Number(value); return Number.isInteger(n) && n >= 0 ? n : 0; };

function classEventPrefix(classId) {
  if (!isSafeId(classId)) throw new Error("Unsafe class id.");
  return EVENT_PREFIX + "class/" + classId + "/";
}
function studentEventPrefix(studentId) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  return EVENT_PREFIX + "student/" + studentId + "/";
}
function eventReadStateName(studentId) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  return EVENT_PREFIX + "read-state/" + studentId + ".json";
}

/**
 * The type's SAFE fields, from a producer's input or a stored document (the same whitelist both ways). Returns null
 * for an unknown type or a missing required reference — such a document is never stored and never projected.
 */
function eventFields(type, src) {
  const s = src && typeof src === "object" ? src : {};
  const assignment = () => {
    const assignmentId = String(s.assignmentId || "");
    return isSafeId(assignmentId) ? { assignmentId, assignmentTitle: cleanText(s.assignmentTitle, TITLE_LENGTH) } : null;
  };
  switch (type) {
    case "assignment_published":
    case "assignment_retry_granted":
      return assignment();
    case "assignment_deadline_extended":
    case "assignment_reopened": {
      const a = assignment();
      return a && { ...a, dueAt: cleanIso(s.dueAt) };
    }
    case "attempt_time_extended": {
      const a = assignment();
      return a && { ...a, attemptNumber: cleanInt(s.attemptNumber) };
    }
    case "assignment_reviewed": {
      const a = assignment();
      if (!a) return null;
      const pct = Number(s.percentage);
      return { ...a, attemptNumber: cleanInt(s.attemptNumber), becameFinal: s.becameFinal === true, scoreChanged: s.scoreChanged === true, feedbackChanged: s.feedbackChanged === true, finalized: s.finalized === true, percentage: Number.isFinite(pct) && s.finalized === true ? Math.round(pct * 100) / 100 : null };
    }
    case "learning_module_published": {
      const courseId = String(s.courseId || ""), moduleId = String(s.moduleId || "");
      return isSafeId(courseId) && isSafeId(moduleId) ? { courseId, moduleId } : null;
    }
    case "teacher_reaction": {
      const postId = String(s.postId || ""), reaction = String(s.reaction || "");
      return isSafeId(postId) && REACTION_IDS.includes(reaction) ? { postId, reaction } : null;
    }
    case "teacher_note": {
      const postId = String(s.postId || ""), notePreview = cleanText(s.notePreview, NOTE_PREVIEW_LENGTH);
      return isSafeId(postId) && notePreview ? { postId, notePreview } : null;
    }
    default:
      return null;
  }
}

/** A stored event document, validated for THIS stream (`scope`, and the id it is stored under); else null. */
function normalizeStoredEvent(doc, scope, eventId) {
  if (!doc || typeof doc !== "object") return null;
  const type = String(doc.type || "");
  if (!EVENT_TYPES.includes(type) || doc.scope !== scope || !TYPE_SCOPES[type].includes(scope)) return null;
  if (String(doc.eventId || "") !== eventId) return null;
  const fields = eventFields(type, doc);
  if (!fields) return null;
  return { eventId, type, scope, createdAt: cleanIso(doc.createdAt), ...fields };
}

/** Stable hash of a dedupe key (the stored key never carries raw ids beyond what the event already holds). */
function dedupeHash(key) { return crypto.createHash("sha256").update("notification-dedupe\n" + String(key)).digest("hex").slice(0, 32); }

/**
 * Publish ONE event. `target` = { scope: "class", classId } | { scope: "student", studentId }. `dedupeKey` identifies the
 * committed transition. Returns { recorded: boolean, eventId?, duplicate? }. Throws on storage failure (use
 * recordEventSafely from producers).
 */
async function recordEvent(container, { scope, classId, studentId, type, dedupeKey, data }, deps = {}) {
  if (!EVENT_TYPES.includes(type) || !TYPE_SCOPES[type].includes(scope)) throw new Error("Invalid notification event type/scope.");
  const prefix = scope === "class" ? classEventPrefix(String(classId || "")) : studentEventPrefix(String(studentId || ""));
  const fields = eventFields(type, data);
  if (!fields) throw new Error("Invalid notification event data.");
  const key = dedupeHash(String(dedupeKey || ""));
  if (!dedupeKey) throw new Error("Missing notification dedupe key.");
  // Idempotency: the same committed transition already published (a retried write) → nothing new.
  const many = deps.downloadManyJson || downloadManyJson;
  const recent = (await listStreamIds(container, prefix, deps)).reverse().slice(0, DEDUPE_WINDOW);
  if (recent.length) {
    const docs = await many(container, recent.map(id => prefix + id + ".json"), getReadConcurrency());
    if (docs.some(d => d && d.dedupeKey === key)) return { recorded: false, duplicate: true };
  }
  const doc = await createMessage(container, prefix, (eventId, createdAt) => ({ schemaVersion: 1, eventId, type, scope, createdAt, dedupeKey: key, ...fields }), deps);
  return { recorded: true, eventId: doc.eventId };
}

/**
 * The producers' entry point: never throws, never fails the caller's educational action. A failure is logged with the
 * event type and scope only (no ids, titles, notes or answers).
 */
async function recordEventSafely(container, event, deps = {}, obs = null) {
  const rec = deps.recordNotificationEvent || recordEvent;
  try {
    return await rec(container, event, deps);
  } catch (e) {
    try { obs?.logWarn?.("notification.event.failed", { type: String(event && event.type || ""), scope: String(event && event.scope || ""), errorClass: e && e.name ? String(e.name) : "Error" }); } catch { /* logging is best-effort */ }
    return { recorded: false, failed: true };
  }
}

// ── READ STATE ────────────────────────────────────────────────────────────────────────────────────────────────────
function normalizeStreamState(raw) {
  const through = raw && Number.isInteger(raw.through) && raw.through > 0 ? raw.through : 0;
  const read = raw && Array.isArray(raw.read) ? Array.from(new Set(raw.read.filter(p => Number.isInteger(p) && p > through))).sort((a, b) => a - b) : [];
  return { through, read };
}
/** { personal: {through, read[]}, classes: { <classId>: {through, read[]} } } — missing/malformed → nothing read. */
function normalizeEventReadState(doc) {
  const classes = {};
  const raw = doc && typeof doc === "object" && doc.classes && typeof doc.classes === "object" ? doc.classes : {};
  for (const [classId, state] of Object.entries(raw)) if (isSafeId(classId)) classes[classId] = normalizeStreamState(state);
  return { personal: normalizeStreamState(doc && doc.personal), classes };
}
function isPositionRead(state, position) {
  return !!state && position >= 1 && (position <= state.through || state.read.includes(position));
}
/** Add ONE position (monotonic), compacting a contiguous run above `through`. Returns { state, changed }. */
function acknowledgePosition(state, position) {
  const s = normalizeStreamState(state);
  if (isPositionRead(s, position)) return { state: s, changed: false };
  const read = new Set(s.read); read.add(position);
  let through = s.through;
  while (read.has(through + 1)) { read.delete(through + 1); through += 1; }
  const list = Array.from(read).sort((a, b) => a - b);
  if (list.length > MAX_READ_SET) throw Object.assign(new Error("Too many individually acknowledged events."), { httpStatus: 409 });
  return { state: { through, read: list }, changed: true };
}
async function loadEventReadState(container, studentId, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  return normalizeEventReadState(await dl(container, eventReadStateName(studentId)));
}
/** CAS-acknowledge one position of one of THIS student's streams (`stream` = "personal" | a class id). */
async function markEventPositionRead(container, studentId, stream, position, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  let result = null;
  await mut(container, eventReadStateName(studentId), current => {
    const state = normalizeEventReadState(current);
    const before = stream === "personal" ? state.personal : (state.classes[stream] || { through: 0, read: [] });
    const { state: next, changed } = acknowledgePosition(before, position);
    if (stream === "personal") state.personal = next; else state.classes[stream] = next;
    // Bounded document: keep the current class plus the most recently written others.
    const ids = Object.keys(state.classes);
    if (ids.length > MAX_CLASS_STATES) for (const id of ids.filter(id => id !== stream).slice(0, ids.length - MAX_CLASS_STATES)) delete state.classes[id];
    result = { changed, state };
    return { schemaVersion: 1, studentId, personal: state.personal, classes: state.classes, updatedAt: new Date().toISOString() };
  });
  return result;
}

/** Stream position of an event id under `prefix` (>= 1), or 0 when it is not a canonical event id of that stream. */
function eventPosition(eventId, prefix) {
  const p = messagePosition(String(eventId || ""), prefix);
  return p >= 1 ? p : 0;
}

/** Download a bounded batch of event docs of one stream (ids newest first). */
async function loadEventDocs(container, prefix, ids, deps = {}) {
  const many = deps.downloadManyJson || downloadManyJson;
  return ids.length ? many(container, ids.map(id => prefix + id + ".json"), getReadConcurrency()) : [];
}

module.exports = {
  EVENT_PREFIX, EVENT_TYPES, TYPE_SCOPES, REACTION_IDS, DEDUPE_WINDOW, NOTE_PREVIEW_LENGTH, MAX_READ_SET,
  classEventPrefix, studentEventPrefix, eventReadStateName, eventFields, normalizeStoredEvent, dedupeHash,
  recordEvent, recordEventSafely,
  normalizeEventReadState, isPositionRead, acknowledgePosition, loadEventReadState, markEventPositionRead, eventPosition, loadEventDocs
};
