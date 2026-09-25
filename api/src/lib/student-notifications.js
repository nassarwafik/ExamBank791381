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
const { downloadManyJson, getReadConcurrency } = require("./platform-storage");
const { normalizeStoredMessage } = require("./message-store");
const { listStreamIds, isReadBy } = require("./message-read-state");

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

module.exports = { NOTIFICATION_LIMIT, NOTIFICATION_SCAN_LIMIT, PREVIEW_LENGTH, previewOf, recentIncoming, recentNotifications };
