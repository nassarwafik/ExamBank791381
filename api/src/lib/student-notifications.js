// Phase 6C — the student's in-app notification center ("🔔 الإشعارات"): a small, READ-ONLY projection of the student's
// EXISTING message streams (Phase 5C storage + Phase 5D read state). There is no notification database, no
// notification document and no second unread authority:
//   • items   = the most recent INCOMING messages of the two streams the student may read — their own direct
//               conversation (TEACHER messages only; the student's own replies are never a notification) and the
//               CURRENT class's announcements — newest first, at most NOTIFICATION_LIMIT;
//   • unread  = per item, the SAME rule the unread counts use: not covered by the student's stored read marker
//               (isReadBy, per read domain) — computed from the very markers loaded for the counts in that request.
// Nothing here writes: building the projection never advances a marker and never absorbs legacy ids, so opening
// the bell (or the panel) can never mark anything read. Only the Student Messages page acknowledges (Phase 5D).
// Work stays narrow: names are listed per stream (no download), then only the newest candidates are downloaded in
// small batches until enough relevant messages were found or the scan bound is reached.
const { getReadConcurrency } = require("./platform-storage");
// Messages hardening (M.1): one unparsable blob reads as missing instead of failing the whole panel.
const { downloadManyJsonTolerant: downloadManyJson } = require("./message-store");
const { normalizeStoredMessage, directPrefix, announcementPrefix, blobMessageId } = require("./message-store");
const {
  listStreamIds, isReadBy, loadMarker, countUnread, combineCounts, READER_RELEVANCE, studentDirectStateName, studentAnnouncementStateName, READ_STATE_PREFIX
} = require("./message-read-state");
// M.3 — the ETag-validated memo of the badge counts (never an authority; see message-unread-memo.js).
const { sharedMemo, listEntries, etagMap, listingSignature, cachedLoader, memoGet, memoSet } = require("./message-unread-memo");

const NOTIFICATION_LIMIT = 15;
// Upper bound on downloaded candidates per stream (a thread of mostly own replies can never make this unbounded).
const NOTIFICATION_SCAN_LIMIT = 60;
const NOTIFICATION_BATCH = 10;
const PREVIEW_LENGTH = 140;

/** A short single-line preview of a message body (whitespace collapsed, trimmed to PREVIEW_LENGTH characters). */
function previewOf(body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);                       // never cut a surrogate pair in half
  return chars.length > PREVIEW_LENGTH ? chars.slice(0, PREVIEW_LENGTH - 1).join("").trimEnd() + "…" : text;
}

/**
 * The newest `limit` messages of ONE authorized stream that this reader must acknowledge (`include` — the same
 * sender-role rule the unread count uses), each with its read flag under `marker`. Newest = highest order key.
 */
async function recentIncoming(container, { streamPrefix, expected, include, marker }, limit, deps = {}) {
  const many = deps.downloadManyJson || downloadManyJson;
  const ids = (await listStreamIds(container, streamPrefix, deps)).reverse().slice(0, NOTIFICATION_SCAN_LIMIT);
  const out = [];
  for (let i = 0; i < ids.length && out.length < limit; i += NOTIFICATION_BATCH) {
    const slice = ids.slice(i, i + NOTIFICATION_BATCH);
    const docs = await many(container, slice.map(id => streamPrefix + id + ".json"), getReadConcurrency());
    for (let j = 0; j < slice.length && out.length < limit; j++) {
      const doc = normalizeStoredMessage(docs[j], { ...expected, messageId: slice[j] });
      if (doc && include(doc)) out.push({ doc, unread: !isReadBy(marker, slice[j]) });
    }
  }
  return out;
}

/** The public item shape — only what the panel renders (no stream path, class id, student id or sender id). */
function notificationItem({ doc, unread }) {
  return {
    id: String(doc.messageId),
    type: doc.kind === "announcement" ? "announcement" : "direct",
    senderDisplayName: String(doc.senderDisplayName || ""),
    preview: previewOf(doc.body),
    createdAt: String(doc.createdAt || ""),
    unread
  };
}

// ── The student's message streams and their Phase 5D unread summary (the ONE message unread authority; shared by
// /api/student-messages and the Phase 6D unified notification center). ──
/** The authorized streams for this student: own direct thread + the CURRENT class's announcements (if it exists). */
function studentStreams(studentId, classId) {
  return {
    direct: { stateName: studentDirectStateName(studentId), streamPrefix: directPrefix(studentId), expected: { kind: "direct", studentId }, include: READER_RELEVANCE.studentDirect },
    announcements: classId ? { stateName: studentAnnouncementStateName(studentId, classId), streamPrefix: announcementPrefix(classId), expected: { kind: "announcement", classId }, include: READER_RELEVANCE.announcements } : null
  };
}

/** Both streams' stored read markers (announcements: null when the student has no current class). */
async function loadStreamMarkers(container, streams, deps) {
  return {
    direct: await loadMarker(container, streams.direct.stateName, deps),
    announcements: streams.announcements ? await loadMarker(container, streams.announcements.stateName, deps) : null
  };
}

/** `markers` (optional) = markers already loaded in this request, so a notifications read counts from the SAME state.
 *  `options.absorb` (M.1): fold the student's OWN leading direct replies into their direct boundary so later counts stop
 *  re-downloading them (changes no count). Off by default — the notification view stays strictly read-only. */
async function unreadSummary(container, streams, deps, markers = null, options = {}) {
  const directAbsorb = options.absorb && streams.direct ? { stateName: streams.direct.stateName, meta: { principalRole: "student", streamKind: "direct", streamId: String(streams.direct.expected.studentId || "") } } : undefined;
  // M.3 — the badge poll reuses a stream's count while its listing (names + ETags) and the marker's ETag are unchanged.
  // Not when the caller passes `markers` (the notification view counts from the SAME markers as its items) nor when it
  // injected its own storage functions (they must observe every read).
  const memo = deps && deps.unreadMemo === null ? null : ((deps && deps.unreadMemo) || sharedMemo);
  if (!markers && memo && !(deps && (deps.listBlobNames || deps.downloadManyJson))) return unreadSummaryMemo(container, streams, deps || {}, directAbsorb, memo);
  const m = markers || await loadStreamMarkers(container, streams, deps);
  const count = async (s, marker, absorb) => s ? countUnread(container, { streamPrefix: s.streamPrefix, expected: s.expected, include: s.include, marker, absorb }, deps) : { unread: 0, capped: false };
  const directUnread = await count(streams.direct, m.direct, directAbsorb);
  const announcementUnread = await count(streams.announcements, m.announcements);
  const total = combineCounts(directUnread, announcementUnread);
  return { directUnread, announcementUnread, totalUnread: total.unread, totalCapped: total.capped };
}

async function unreadSummaryMemo(container, streams, deps, directAbsorb, memo) {
  const list = deps.listEntries || listEntries;
  const studentId = String(streams.direct.expected.studentId || "");
  const markerEtags = etagMap(await list(container, READ_STATE_PREFIX + "student/" + studentId + "/"));
  const count = async (s, absorb) => {
    if (!s) return { unread: 0, capped: false };
    const entries = await list(container, s.streamPrefix);
    const markerTag = markerEtags.has(s.stateName) ? markerEtags.get(s.stateName) : "none";
    const streamSig = listingSignature(entries);
    const signature = streamSig && markerTag ? streamSig + "|" + markerTag : "";
    const key = "student|" + s.stateName;
    const hit = memoGet(memo, container, key, signature);
    if (hit) return hit;
    const marker = await loadMarker(container, s.stateName, deps);
    const ids = entries.map(e => blobMessageId(e.name, s.streamPrefix)).filter(Boolean).sort();     // as listStreamIds
    const c = await countUnread(container, { streamPrefix: s.streamPrefix, expected: s.expected, include: s.include, marker, absorb, ids }, { ...deps, downloadManyJson: cachedLoader(memo, container, etagMap(entries), deps) });
    memoSet(memo, container, key, signature, c);
    return c;
  };
  const directUnread = await count(streams.direct, directAbsorb);
  const announcementUnread = await count(streams.announcements);
  const total = combineCounts(directUnread, announcementUnread);
  return { directUnread, announcementUnread, totalUnread: total.unread, totalCapped: total.capped };
}

const timeOf = item => { const t = Date.parse(item.createdAt); return Number.isFinite(t) ? t : 0; };

/**
 * Recent notifications across the student's authorized streams. `streams` = { direct, announcements|null } with
 * { streamPrefix, expected, include } each; `markers` = the markers already loaded for this request's counts.
 * Merged newest first by display time (ties: announcements after direct, then id), capped at NOTIFICATION_LIMIT.
 */
async function recentNotifications(container, streams, markers, deps = {}, limit = NOTIFICATION_LIMIT) {
  const direct = await recentIncoming(container, { ...streams.direct, marker: markers.direct }, limit, deps);
  const announcements = streams.announcements ? await recentIncoming(container, { ...streams.announcements, marker: markers.announcements }, limit, deps) : [];
  return [...direct, ...announcements]
    .map(notificationItem)
    .sort((a, b) => timeOf(b) - timeOf(a) || (a.type === b.type ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : a.type === "direct" ? -1 : 1))
    .slice(0, limit);
}

module.exports = { NOTIFICATION_LIMIT, NOTIFICATION_SCAN_LIMIT, PREVIEW_LENGTH, previewOf, recentIncoming, recentNotifications, studentStreams, loadStreamMarkers, unreadSummary };
