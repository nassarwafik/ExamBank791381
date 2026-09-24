// Phase 5D — Message read/unread state. Messages stay IMMUTABLE and append-only (message-store.js): read state is a
// SEPARATE per-reader, per-stream marker document, never a field on a message and never a denormalized counter.
//
//   platform/messages/read-state/teacher/<sha256(teacher id)>/direct/<studentId>.json   the teacher's view of one student
//   platform/messages/read-state/student/<studentId>/direct.json                        a student's direct conversation
//   platform/messages/read-state/student/<studentId>/announcements/<classId>.json       a student's view of one class
//
// ORDER KEY. The 13-digit id prefix is the message's ORDER KEY ("ms" in the names below, kept for the stored marker
// format). New messages are SEQUENCED (message-store.js): key = SEQUENCE_KEY_BASE + the stream position assigned by the
// create-only publication write itself, so key order IS publication order — a message that becomes visible later
// always has a larger key, and "key < boundary → read" can never cover a message published after the acknowledged
// one. Legacy Phase 5C ids ("<ms>-<random>", key < SEQUENCE_KEY_BASE) keep their millisecond key and sort below every
// sequenced id.
// READ BOUNDARY (same-key safe). Legacy ids created in the SAME millisecond on different instances order by their
// random suffix — so a single "last read id" would wrongly hide a later same-ms message whose suffix sorts lower. The
// marker is therefore { boundaryMs, seenIdsAtBoundary[] } (boundaryMs = an order key):
//   key <  boundaryMs → read;  key > boundaryMs → unread;  key == boundaryMs → read ONLY if listed in seenIdsAtBoundary.
// (A sequenced key is unique per stream, so for sequenced ids seenIdsAtBoundary is just [X].)
// TWO READ DOMAINS (review follow-up, late legacy). Legacy and sequenced keys are two INDEPENDENT order domains: a
// Phase 5C writer that is still running (an instance draining during a deploy, or a rollback new → old → new) keeps
// creating "<ms>-<random>" ids whose key is BELOW every sequenced key, however late they are published. So a marker
// holds one boundary PER DOMAIN — { legacy: {boundaryMs, seenIdsAtBoundary} | null, sequenced: {…} | null } — and an
// id is only ever compared with the boundary of ITS OWN domain. No message is read merely because its domain sorts
// below a boundary of the other domain: a late legacy message is read only once a legacy acknowledgement covers it.
// The acknowledgement carries the snapshot's latest relevant id (primary part) and, when that is sequenced and the
// snapshot also displayed relevant legacy ids, a LEGACY part (legacyThroughMessageId + legacySeenIdsAtBoundary) with
// the same rules; both parts advance in ONE CAS, each domain monotonically and independently.
// STORED FORMAT. schemaVersion 2 = { legacy, sequenced } (each null or a boundary). A schemaVersion-1 marker (a single
// { boundaryMs, seenIdsAtBoundary }) is read in place, never migrated: a legacy-key boundary is the legacy domain (no
// sequenced progress); a sequenced-key boundary is the sequenced domain, and — because its old semantics covered every
// legacy id — its legacy progress is "every legacy id created before the marker was written" (legacy boundary =
// updatedAt, nothing seen at it; an unparsable updatedAt → no legacy progress, fail-safe). The next write stores v2.
// Anything malformed reads as no progress in that domain (unread — fails safe), never as read.
// Marking read is a SNAPSHOT ACKNOWLEDGEMENT: the client sends X (the latest unread-RELEVANT message it actually
// displayed) and seenIdsAtBoundary — the relevant ids at X's millisecond that were in THAT applied snapshot. The boundary
// ids are NEVER re-derived from a fresh listing: a message created in the same millisecond after the reader's GET (on
// another instance, possibly sorting below X) was never shown, so it must stay unread. Every supplied id must exist
// in the server-authorized stream, share X's millisecond, and validate for the stream AND its unread-relevant sender
// role (a teacher acknowledges student messages, a student acknowledges teacher messages, any announcement) — anything
// else is rejected with no write. Duplicate ids in seenIdsAtBoundary are ALLOWED and deduplicated (the list is a set;
// the 200-entry bound applies to the raw list). It is a monotonic CAS: a boundary never moves backwards; an equal
// boundary unions. The remaining count returned by a mark is computed AFTER the marker write from a FRESH stream
// listing — never from the listing used during validation — so a message that arrived meanwhile is counted.
//
// Unread counts derive from immutable messages + the marker: names are listed (no download), ids already covered by
// the marker are dropped, and only the remaining CANDIDATES are downloaded (newest first, bounded concurrency) to check
// sender role/kind/owner — stopping once the display cap (99 → "99+") is exceeded.
const crypto = require("crypto");
const { listBlobNames, downloadManyJson, downloadJsonOrNull, mutateJsonWithRetry, getReadConcurrency } = require("./platform-storage");
const { MESSAGE_PREFIX, DIRECT_PREFIX, MESSAGE_ID_RE, SEQUENCE_KEY_BASE, isSafeId, directPrefix, normalizeStoredMessage, blobMessageId } = require("./message-store");

const READ_STATE_PREFIX = MESSAGE_PREFIX + "read-state/";
const USER_PREFIX = "platform/users/";
const UNREAD_DISPLAY_CAP = 99;
// Upper bound on a snapshot acknowledgement's boundary ids (a snapshot page never exceeds the history cap).
const MAX_BOUNDARY_IDS = 200;
const DOMAINS = ["legacy", "sequenced"];

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

/** The 13-digit ORDER KEY of a message id (legacy: its millisecond; sequenced: SEQUENCE_KEY_BASE + position); NaN when
 *  it is not a message id. */
function messageIdMs(id) {
  return typeof id === "string" && MESSAGE_ID_RE.test(id) ? Number(id.slice(0, 13)) : NaN;
}

/** The read domain of an order key: "legacy" (Phase 5C millisecond ids) or "sequenced" (publication positions). */
function keyDomain(key) {
  return key < SEQUENCE_KEY_BASE ? "legacy" : "sequenced";
}

/** One domain's boundary, validated: its key must lie IN that domain; seen ids must share the key. Else null. */
function normalizeBoundary(doc, domain) {
  if (!doc || typeof doc !== "object") return null;
  const boundaryMs = Number(doc.boundaryMs);
  if (!Number.isInteger(boundaryMs) || boundaryMs < 0 || keyDomain(boundaryMs) !== domain) return null;
  const seen = Array.isArray(doc.seenIdsAtBoundary) ? doc.seenIdsAtBoundary.filter(id => messageIdMs(id) === boundaryMs) : [];
  return { boundaryMs, seenIdsAtBoundary: Array.from(new Set(seen)).sort() };
}

/** A stored marker (v2, or v1 read in place — see STORED FORMAT), as { legacy, sequenced }; null when it carries no
 *  valid progress at all (everything unread — fails safe). */
function normalizeMarker(doc) {
  if (!doc || typeof doc !== "object") return null;
  if (Number(doc.schemaVersion) >= 2) {
    const legacy = normalizeBoundary(doc.legacy, "legacy"), sequenced = normalizeBoundary(doc.sequenced, "sequenced");
    return legacy || sequenced ? { legacy, sequenced } : null;
  }
  const key = Number(doc.boundaryMs);
  const single = Number.isInteger(key) ? normalizeBoundary(doc, keyDomain(key)) : null;
  if (!single) return null;
  if (keyDomain(single.boundaryMs) === "legacy") return { legacy: single, sequenced: null };
  const writtenAt = Date.parse(doc.updatedAt);
  const legacy = Number.isFinite(writtenAt) && writtenAt >= 0 ? { boundaryMs: Math.min(writtenAt, SEQUENCE_KEY_BASE - 1), seenIdsAtBoundary: [] } : null;
  return { legacy, sequenced: single };
}

/** Whether a message id is covered (read) by a marker — ONLY ever against the boundary of the id's own domain. */
function isReadBy(marker, id) {
  if (!marker) return false;
  const key = messageIdMs(id);
  if (!Number.isFinite(key)) return false;
  const boundary = marker[keyDomain(key)];
  if (!boundary) return false;
  if (key < boundary.boundaryMs) return true;
  if (key > boundary.boundaryMs) return false;
  return boundary.seenIdsAtBoundary.includes(id);
}

/** Monotonic merge of ONE domain's boundary: never moves backwards; an equal boundary unions its ids. */
function advanceBoundary(current, incoming) {
  const next = { boundaryMs: incoming.boundaryMs, seenIdsAtBoundary: Array.from(new Set(incoming.seenIdsAtBoundary)).sort() };
  if (!current || next.boundaryMs > current.boundaryMs) return { changed: true, marker: next };
  if (next.boundaryMs < current.boundaryMs) return { changed: false, marker: current };
  const union = Array.from(new Set([...current.seenIdsAtBoundary, ...next.seenIdsAtBoundary])).sort();
  if (union.length === current.seenIdsAtBoundary.length) return { changed: false, marker: current };
  return { changed: true, marker: { boundaryMs: current.boundaryMs, seenIdsAtBoundary: union } };
}

/** Per-domain monotonic merge: each domain in `incoming` ({ legacy?, sequenced? }) advances independently; a domain
 *  not acknowledged is left exactly as it is. Returns { changed, marker: { legacy, sequenced } }. */
function advanceMarker(current, incoming) {
  const marker = { legacy: current ? current.legacy : null, sequenced: current ? current.sequenced : null };
  let changed = false;
  for (const domain of DOMAINS) {
    if (!incoming[domain]) continue;
    const r = advanceBoundary(marker[domain], incoming[domain]);
    if (r.changed) { marker[domain] = r.marker; changed = true; }
  }
  return { changed, marker };
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

/** One acknowledgement part's shape: X well-formed; 1..200 ids (duplicates deduplicated), all at X's key, X included. */
function parseAcknowledgementPart(throughMessageId, seenIdsAtBoundary) {
  if (typeof throughMessageId !== "string" || !MESSAGE_ID_RE.test(throughMessageId)) throw new MarkReadError();
  if (!Array.isArray(seenIdsAtBoundary) || !seenIdsAtBoundary.length || seenIdsAtBoundary.length > MAX_BOUNDARY_IDS) throw new MarkReadError();
  const boundaryMs = messageIdMs(throughMessageId);
  const seen = Array.from(new Set(seenIdsAtBoundary));
  for (const id of seen) if (typeof id !== "string" || messageIdMs(id) !== boundaryMs) throw new MarkReadError();
  if (!seen.includes(throughMessageId)) throw new MarkReadError();
  return { domain: keyDomain(boundaryMs), boundary: { boundaryMs, seenIdsAtBoundary: seen.sort() } };
}

/**
 * Validate a snapshot acknowledgement: the primary part (throughMessageId + seenIdsAtBoundary) and, optionally, a
 * LEGACY part (legacyThroughMessageId + legacySeenIdsAtBoundary) — allowed only when the primary part is sequenced,
 * and it must lie in the legacy domain. Returns { [domain]: boundary } for each part. Throws MarkReadError (400) when
 * a part is malformed (see parseAcknowledgementPart), is in the wrong domain, or any id does not exist in this stream /
 * does not validate / is not unread-relevant (`include`) for this reader. The validation listing is deliberately NOT
 * returned: it is stale once the marker is written and must never feed a remaining count.
 */
async function validateAcknowledgement(container, { streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary, legacyThroughMessageId, legacySeenIdsAtBoundary }, deps = {}) {
  const parts = [parseAcknowledgementPart(throughMessageId, seenIdsAtBoundary)];
  if (legacyThroughMessageId != null || legacySeenIdsAtBoundary != null) {
    if (parts[0].domain !== "sequenced") throw new MarkReadError();
    const legacy = parseAcknowledgementPart(legacyThroughMessageId, legacySeenIdsAtBoundary);
    if (legacy.domain !== "legacy") throw new MarkReadError();
    parts.push(legacy);
  }
  const seen = parts.flatMap(p => p.boundary.seenIdsAtBoundary);
  const listed = new Set(await listStreamIds(container, streamPrefix, deps));
  if (!seen.every(id => listed.has(id))) throw new MarkReadError();
  const docs = await (deps.downloadManyJson || downloadManyJson)(container, seen.map(id => streamPrefix + id + ".json"), getReadConcurrency());
  for (let i = 0; i < seen.length; i++) {
    const doc = normalizeStoredMessage(docs[i], { ...expected, messageId: seen[i] });
    if (!doc || !include(doc)) throw new MarkReadError();
  }
  return Object.fromEntries(parts.map(p => [p.domain, p.boundary]));
}

/**
 * Mark ONE authorized stream read from a validated snapshot acknowledgement (see validateAcknowledgement). Monotonic
 * per-domain CAS through mutateJsonWithRetry: every retry re-reads the freshest marker and merges each domain into it,
 * so an older/slower mark can never regress a newer one and concurrent legacy / sequenced advances both survive.
 * Returns { marker } only — callers count what remains with countUnread WITHOUT `ids`, i.e. from a fresh listing
 * taken after the write.
 */
async function markStreamRead(container, { stateName, streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary, legacyThroughMessageId, legacySeenIdsAtBoundary, meta = {} }, deps = {}) {
  const incoming = await validateAcknowledgement(container, { streamPrefix, expected, include, throughMessageId, seenIdsAtBoundary, legacyThroughMessageId, legacySeenIdsAtBoundary }, deps);
  const mutate = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  try {
    const written = await mutate(container, stateName, current => {
      const r = advanceMarker(normalizeMarker(current), incoming);
      if (!r.changed) throw new NoChange(r.marker);                 // no regression, no redundant write
      return { schemaVersion: 2, ...meta, legacy: r.marker.legacy, sequenced: r.marker.sequenced, updatedAt: new Date().toISOString() };
    });
    return { marker: normalizeMarker(written) };
  } catch (e) {
    if (e instanceof NoChange) return { marker: e.marker };
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
  messageIdMs, keyDomain, normalizeMarker, isReadBy, advanceBoundary, advanceMarker, listStreamIds, loadMarker, markStreamRead, countUnread,
  combineCounts, groupDirectIds, teacherDirectUnread
};
