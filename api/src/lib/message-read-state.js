// Phase 5D — Message read/unread state. Messages stay IMMUTABLE and append-only (message-store.js): read state is a
// SEPARATE per-reader, per-stream marker document, never a field on a message and never a denormalized counter.
//
//   platform/messages/read-state/teacher/<sha256(teacher id)>/direct/<studentId>.json   the teacher's view of one student
//   platform/messages/read-state/student/<studentId>/direct.json                        a student's direct conversation
//   platform/messages/read-state/student/<studentId>/announcements/<classId>.json       a student's view of one class
//
// READ BOUNDARY (same-millisecond safe). Message ids are "<13-digit ms>-<random>", and ids created in the SAME
// millisecond on different instances order by their random suffix — so a single "last read id" would wrongly hide a
// later same-ms message whose suffix sorts lower. The marker is therefore { boundaryMs, seenIdsAtBoundary[] }:
//   ms <  boundaryMs → read;  ms > boundaryMs → unread;  ms == boundaryMs → read ONLY if its id is in seenIdsAtBoundary.
// Marking read is a SNAPSHOT ACKNOWLEDGEMENT: the client sends X (the latest unread-RELEVANT message it actually
// displayed) and seenIdsAtBoundary — the relevant ids at X's millisecond that were in THAT applied snapshot. The boundary
// ids are NEVER re-derived from a fresh listing: a message created in the same millisecond after the reader's GET (on
// another instance, possibly sorting below X) was never shown, so it must stay unread. Every supplied id must exist
// in the server-authorized stream, share X's millisecond, and validate for the stream AND its unread-relevant sender
// role (a teacher acknowledges student messages, a student acknowledges teacher messages, any announcement) — anything
// else is rejected with no write. It is a monotonic CAS: a boundary never moves backwards; an equal boundary unions.
//
// Unread counts derive from immutable messages + the marker: names are listed (no download), ids already covered by
// the marker are dropped, and only the remaining CANDIDATES are downloaded (newest first, bounded concurrency) to check
// sender role/kind/owner — stopping once the display cap (99 → "99+") is exceeded.
const crypto = require("crypto");
const { listBlobNames, downloadManyJson, downloadJsonOrNull, mutateJsonWithRetry, getReadConcurrency } = require("./platform-storage");
const { MESSAGE_PREFIX, DIRECT_PREFIX, MESSAGE_ID_RE, isSafeId, directPrefix, normalizeStoredMessage, blobMessageId } = require("./message-store");

const READ_STATE_PREFIX = MESSAGE_PREFIX + "read-state/";
const USER_PREFIX = "platform/users/";
const UNREAD_DISPLAY_CAP = 99;
// Upper bound on a snapshot acknowledgement's boundary ids (a snapshot page never exceeds the history cap).
const MAX_BOUNDARY_IDS = 200;

class MarkReadError extends Error {
  constructor(message) { super(message || "Invalid message reference."); this.name = "MarkReadError"; this.httpStatus = 400; }
}
class NoChange extends Error { constructor(marker) { super("no-change"); this.name = "NoChange"; this.marker = marker; } }

/** Deterministic, path-safe teacher key: sha256("teacher\n" + id). The raw token subject never appears in a path. */
function teacherActorKey(teacherId) {
  const id = String(teacherId == null ? "" : teacherId);
  if (!id) throw new Error("Missing teacher id.");
  return crypto.createHash("sha256").update("teacher\n" + id).digest("hex");
}
function teacherDirectStatePrefix(teacherId) { return READ_STATE_PREFIX + "teacher/" + teacherActorKey(teacherId) + "/direct/"; }
function teacherDirectStateName(teacherId, studentId) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  return teacherDirectStatePrefix(teacherId) + studentId + ".json";
}
function studentDirectStateName(studentId) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  return READ_STATE_PREFIX + "student/" + studentId + "/direct.json";
}
function studentAnnouncementStateName(studentId, classId) {
  if (!isSafeId(studentId) || !isSafeId(classId)) throw new Error("Unsafe id.");
  return READ_STATE_PREFIX + "student/" + studentId + "/announcements/" + classId + ".json";
}

/** The 13-digit millisecond prefix of a message id (NaN when it is not a message id). */
function messageIdMs(id) {
  return typeof id === "string" && MESSAGE_ID_RE.test(id) ? Number(id.slice(0, 13)) : NaN;
}

/** A stored marker, validated; anything malformed reads as "no marker" (everything unread — fails safe). */
function normalizeMarker(doc) {
  if (!doc || typeof doc !== "object") return null;
  const boundaryMs = Number(doc.boundaryMs);
  if (!Number.isInteger(boundaryMs) || boundaryMs < 0) return null;
  const seen = Array.isArray(doc.seenIdsAtBoundary) ? doc.seenIdsAtBoundary.filter(id => messageIdMs(id) === boundaryMs) : [];
  return { boundaryMs, seenIdsAtBoundary: Array.from(new Set(seen)).sort() };
}

/** Whether a message id is covered (read) by a marker. */
function isReadBy(marker, id) {
  if (!marker) return false;
  const ms = messageIdMs(id);
  if (!Number.isFinite(ms)) return false;
  if (ms < marker.boundaryMs) return true;
  if (ms > marker.boundaryMs) return false;
  return marker.seenIdsAtBoundary.includes(id);
}

/** Monotonic merge: never moves backwards; an equal boundary unions its ids. Returns { changed, marker }. */
function advanceMarker(current, incoming) {
  const next = { boundaryMs: incoming.boundaryMs, seenIdsAtBoundary: Array.from(new Set(incoming.seenIdsAtBoundary)).sort() };
  if (!current || next.boundaryMs > current.boundaryMs) return { changed: true, marker: next };
  if (next.boundaryMs < current.boundaryMs) return { changed: false, marker: current };
  const union = Array.from(new Set([...current.seenIdsAtBoundary, ...next.seenIdsAtBoundary])).sort();
  if (union.length === current.seenIdsAtBoundary.length) return { changed: false, marker: current };
  return { changed: true, marker: { boundaryMs: current.boundaryMs, seenIdsAtBoundary: union } };
}

/** Valid message ids listed under ONE stream prefix (names only — nothing is downloaded). */
async function listStreamIds(container, streamPrefix, deps = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const ids = [];
  for (const name of await list(container, streamPrefix)) {
    const id = blobMessageId(name, streamPrefix);
    if (id) ids.push(id);
  }
  return ids.sort();
}

async function loadMarker(container, stateName, deps = {}) {
  return normalizeMarker(await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, stateName));
}

/**
 * Validate a snapshot acknowledgement. Returns the deduplicated, sorted boundary ids; throws MarkReadError (400) when
 * X is malformed, the list is missing/oversized/malformed, an id has another millisecond, X is not in the list, or any
 * id does not exist in this stream / does not validate / is not unread-relevant (`include`) for this reader.
 */
async function validateAcknowledgement(container, { streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary }, deps = {}) {
  if (typeof throughMessageId !== "string" || !MESSAGE_ID_RE.test(throughMessageId)) throw new MarkReadError();
  if (!Array.isArray(seenIdsAtBoundary) || !seenIdsAtBoundary.length || seenIdsAtBoundary.length > MAX_BOUNDARY_IDS) throw new MarkReadError();
  const boundaryMs = messageIdMs(throughMessageId);
  const seen = Array.from(new Set(seenIdsAtBoundary));
  for (const id of seen) if (typeof id !== "string" || messageIdMs(id) !== boundaryMs) throw new MarkReadError();
  if (!seen.includes(throughMessageId)) throw new MarkReadError();
  const ids = await listStreamIds(container, streamPrefix, deps);
  const listed = new Set(ids);
  if (!seen.every(id => listed.has(id))) throw new MarkReadError();
  const docs = await (deps.downloadManyJson || downloadManyJson)(container, seen.map(id => streamPrefix + id + ".json"), getReadConcurrency());
  for (let i = 0; i < seen.length; i++) {
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: seen[i] });
    if (!doc || !include(doc)) throw new MarkReadError();
  }
  return { boundaryMs, seenIdsAtBoundary: seen.sort(), ids };
}

/**
 * Mark ONE authorized stream read from a validated snapshot acknowledgement (see validateAcknowledgement). Monotonic
 * CAS through mutateJsonWithRetry: every retry re-reads the freshest marker, so an older/slower mark can never regress
 * a newer one. Returns { marker, ids } (ids = the stream's listed ids, reusable for counting).
 */
async function markStreamRead(container, { stateName, streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary: acknowledged, meta = {} }, deps = {}) {
  const { boundaryMs, seenIdsAtBoundary, ids } = await validateAcknowledgement(container, { streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary: acknowledged }, deps);
  const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  try {
    const written = await mutate(container, stateName, current => {
      const r = advanceMarker(normalizeMarker(current), { boundaryMs, seenIdsAtBoundary });
      if (!r.changed) throw new NoChange(r.marker);                 // no regression, no redundant write
      return { schemaVersion: 1, ...meta, boundaryMs: r.marker.boundaryMs, seenIdsAtBoundary: r.marker.seenIdsAtBoundary, updatedAt: new Date().toISOString() };
    });
    return { marker: normalizeMarker(written), ids };
  } catch (e) {
    if (e instanceof NoChange) return { marker: e.marker, ids };
    throw e;
  }
}

/**
 * Unread messages of ONE stream for a reader: ids not covered by `marker`, validated against `expected`, and accepted
 * by `include(doc)` (the sender-role rule). Downloads only candidates, newest first, and stops once the count exceeds
 * the display cap. Returns { unread, capped } with unread ≤ 99.
 */
async function countUnread(container, { streamPrefix, expected, marker, include, ids }, deps = {}) {
  const many = deps.downloadManyJson || downloadManyJson;
  const all = ids || await listStreamIds(container, streamPrefix, deps);
  const candidates = all.filter(id => !isReadBy(marker, id)).sort().reverse();
  const batch = Math.max(8, getReadConcurrency());
  let count = 0;
  for (let i = 0; i < candidates.length && count <= UNREAD_DISPLAY_CAP; i += batch) {
    const slice = candidates.slice(i, i + batch);
    const docs = await many(container, slice.map(id => streamPrefix + id + ".json"), getReadConcurrency());
    for (let j = 0; j < slice.length; j++) {
      const doc = normalizeStoredMessage(docs[j], { ...expected, messageId: slice[j] });
      if (doc && include(doc)) count++;
    }
  }
  return count > UNREAD_DISPLAY_CAP ? { unread: UNREAD_DISPLAY_CAP, capped: true } : { unread: count, capped: false };
}

/** Sum of stream counts, capped for display. */
function combineCounts(...counts) {
  const sum = counts.reduce((n, c) => n + c.unread, 0);
  const capped = counts.some(c => c.capped) || sum > UNREAD_DISPLAY_CAP;
  return { unread: Math.min(sum, UNREAD_DISPLAY_CAP), capped };
}

/** Direct-message ids grouped by student, from ONE listing of the direct namespace (names only). */
function groupDirectIds(names) {
  const out = new Map();
  for (const name of names) {
    if (!name.startsWith(DIRECT_PREFIX)) continue;
    const parts = name.slice(DIRECT_PREFIX.length).split("/");
    if (parts.length !== 2 || !isSafeId(parts[0])) continue;
    const id = blobMessageId(name, DIRECT_PREFIX + parts[0] + "/");
    if (!id) continue;
    if (!out.has(parts[0])) out.set(parts[0], []);
    out.get(parts[0]).push(id);
  }
  for (const ids of out.values()) ids.sort();
  return out;
}

/**
 * The TEACHER's unread student replies. Counts ONLY student-authored direct messages after THIS teacher's markers.
 * Membership authority is the CURRENT persisted student document (role === "student", exact userId, and — for a class
 * summary — exact classId); classroom.studentIds is never used. Archived/disabled students are included (their history
 * stays readable). A deleted student never counts (their conversation can't be opened). Work: one listing of direct
 * names + one marker read per conversation + user reads only for conversations with candidates + candidate downloads;
 * the global summary stops once the display cap is exceeded.
 */
async function teacherDirectUnread(container, teacherId, { classId = "" } = {}, deps = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const many = deps.downloadManyJson || downloadManyJson;
  const conc = getReadConcurrency();
  const byStudentIds = groupDirectIds(await list(container, DIRECT_PREFIX));
  const studentIds = Array.from(byStudentIds.keys()).sort();
  const markers = (await many(container, studentIds.map(sid => teacherDirectStateName(teacherId, sid)), conc)).map(normalizeMarker);
  let rows = studentIds
    .map((sid, i) => ({ sid, ids: byStudentIds.get(sid), marker: markers[i] }))
    .filter(r => r.ids.some(id => !isReadBy(r.marker, id)));
  const users = await many(container, rows.map(r => USER_PREFIX + r.sid + ".json"), conc);
  rows = rows.filter((r, i) => {
    const u = users[i];
    return !!u && u.role === "student" && String(u.userId || "") === r.sid && (!classId || String(u.classId || "") === classId);
  });
  const byStudent = {};
  const counts = [];
  for (const r of rows) {
    if (!classId && combineCounts(...counts).capped) break;          // global badge already "99+"
    const c = await countUnread(container, { streamPrefix: directPrefix(r.sid), expected: { kind: "direct", studentId: r.sid }, marker: r.marker, ids: r.ids, include: doc => doc.senderRole === "student" }, deps);
    counts.push(c);
    if (c.unread > 0) byStudent[r.sid] = c;
  }
  const total = combineCounts(...counts);
  return classId ? { totalUnread: total.unread, capped: total.capped, byStudent } : { totalUnread: total.unread, capped: total.capped };
}

module.exports = {
  READ_STATE_PREFIX, UNREAD_DISPLAY_CAP, MAX_BOUNDARY_IDS, MarkReadError, validateAcknowledgement,
  teacherActorKey, teacherDirectStatePrefix, teacherDirectStateName, studentDirectStateName, studentAnnouncementStateName,
  messageIdMs, normalizeMarker, isReadBy, advanceMarker, listStreamIds, loadMarker, markStreamRead, countUnread,
  combineCounts, groupDirectIds, teacherDirectUnread
};
