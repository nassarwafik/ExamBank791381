// Phase 6D — the student's UNIFIED in-app notification center: a READ-ONLY projection that merges
//   • the student's MESSAGE notifications — teacher messages of their own direct thread + the CURRENT class's
//     announcements — from message-store + the Phase 5D markers (lib/student-notifications.js; unchanged authority), and
//   • the NON-MESSAGE events of lib/notification-events.js — the student's personal stream + the CURRENT class's stream.
// Counts are reported separately and combined: `messages` (the ✉️ badge — message unread only, exactly Phase 5D's
// summary), `events` (non-message unread) and `bell` (🔔 = messages + events, capped at 99+). Nothing here writes.
//
// VISIBILITY is re-validated at READ time (an old event never outlives the state that made it visible):
//   • class events exist only for the student's CURRENT, non-archived class (an archived class exposes none);
//   • an assignment event is shown only while that assignment is PUBLISHED in the student's current class (a draft /
//     archived / deleted assignment silently drops out — its title is never shown and it never counts unread);
//   • a module event is shown only while the module is still published for the class (classCanSeeLearningModule); its
//     titles come from the canonical registry at read time, so a module hidden again never leaks its title;
//   • personal events belong to this student alone (the stream is keyed by the persisted student id).
// A class event created before the student's account existed, or older than CLASS_UNREAD_WINDOW_DAYS, never counts as
// unread (a student moved into a class does not inherit its whole history as "new"); it may still appear as read.
//
// COST per poll (?view=unread): the Phase 5D message summary (2 listings + unread candidates) + 1 read-state doc +
// 2 event-stream listings + at most EVENT_SCAN_LIMIT unread candidates per stream (in batches, stopping past 99) + one
// assignment doc per DISTINCT assignment among the class candidates (cached per request). No user/class/assignment scan.
const { downloadJsonOrNull } = require("./platform-storage");
const { listStreamIds, combineCounts, UNREAD_DISPLAY_CAP } = require("./message-read-state");
const { classCanSeeLearningModule } = require("./class-learning-materials");
const registry = require("./learning-materials-registry");
const { normalizeClassStatus } = require("./class-lifecycle");
const { recentNotifications, studentStreams, loadStreamMarkers, unreadSummary } = require("./student-notifications");
const { classEventPrefix, studentEventPrefix, normalizeStoredEvent, loadEventReadState, isPositionRead, eventPosition, loadEventDocs } = require("./notification-events");

const CENTER_LIMIT = 20;
const EVENT_SCAN_LIMIT = 150;
const EVENT_BATCH = 20;
const CLASS_UNREAD_WINDOW_DAYS = 30;
const AP = "platform/assignments/";

/** The public, browser-facing id of an event: "c-<eventId>" (current-class stream) or "s-<eventId>" (personal). */
function publicEventId(scope, eventId) { return (scope === "class" ? "c-" : "s-") + eventId; }
function parsePublicEventId(value) {
  const v = String(value || "");
  if (v.startsWith("c-")) return { scope: "class", eventId: v.slice(2) };
  if (v.startsWith("s-")) return { scope: "student", eventId: v.slice(2) };
  return null;
}

/**
 * Everything a request needs, derived ONLY from the persisted student + their current class document (never from the
 * request). `classroom` may be null (no class) — then there are no class events and no announcements.
 */
async function notificationContext(container, student, classroom, deps = {}) {
  const studentId = String(student.userId || "");
  const classId = classroom ? String(student.classId || "") : "";
  const classActive = !!classroom && normalizeClassStatus(classroom) !== "archived";
  const nowMs = (deps.now || Date.now)();
  const created = Date.parse(String(student.createdAt || ""));
  const classFloorMs = Math.max(Number.isFinite(created) ? created : 0, nowMs - CLASS_UNREAD_WINDOW_DAYS * 86400000);
  const streams = [{ key: "personal", scope: "student", prefix: studentEventPrefix(studentId) }];
  if (classActive) streams.push({ key: classId, scope: "class", prefix: classEventPrefix(classId) });
  return { studentId, classId, classroom, classActive, classFloorMs, streams, messageStreams: studentStreams(studentId, classId), assignmentCache: new Map(), docCache: new Map() };
}

async function assignmentOf(container, ctx, assignmentId, deps) {
  if (!ctx.assignmentCache.has(assignmentId)) {
    const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
    ctx.assignmentCache.set(assignmentId, dl(container, AP + assignmentId + ".json").catch(() => null));
  }
  return ctx.assignmentCache.get(assignmentId);
}

/**
 * The browser item of one validated event, or null when it is NOT visible to this student right now (see VISIBILITY).
 * Only routing/presentation fields — never a class id, a student id or a storage path.
 */
async function projectEvent(container, ctx, stream, ev, unread, deps) {
  const base = { id: publicEventId(stream.scope, ev.eventId), type: ev.type, createdAt: ev.createdAt, unread };
  if (stream.scope === "class") {
    if (ev.type === "learning_module_published") {
      if (!classCanSeeLearningModule(ctx.classroom, ev.courseId, ev.moduleId)) return null;
      const course = registry.findLearningCourse(ev.courseId);
      const mod = course && course.modules.find(m => m.moduleId === ev.moduleId);
      if (!course || !mod) return null;
      return { ...base, courseId: ev.courseId, courseTitle: String(course.title || ""), moduleId: ev.moduleId, moduleTitle: String(mod.title || "") };
    }
    const a = await assignmentOf(container, ctx, ev.assignmentId, deps);
    if (!a || a.status !== "published" || String(a.classId || "") !== ctx.classId) return null;
    return { ...base, assignmentId: ev.assignmentId, assignmentTitle: String(a.title || ev.assignmentTitle || ""), ...(ev.type === "assignment_deadline_extended" ? { dueAt: ev.dueAt } : {}) };
  }
  switch (ev.type) {
    case "teacher_reaction": return { ...base, postId: ev.postId, reaction: ev.reaction };
    case "teacher_note": return { ...base, postId: ev.postId, notePreview: ev.notePreview };
    case "assignment_reviewed": return { ...base, assignmentId: ev.assignmentId, assignmentTitle: ev.assignmentTitle, becameFinal: ev.becameFinal, scoreChanged: ev.scoreChanged, feedbackChanged: ev.feedbackChanged, finalized: ev.finalized, percentage: ev.percentage };
    case "assignment_deadline_extended":
    case "assignment_reopened": return { ...base, assignmentId: ev.assignmentId, assignmentTitle: ev.assignmentTitle, dueAt: ev.dueAt };
    case "attempt_time_extended": return { ...base, assignmentId: ev.assignmentId, assignmentTitle: ev.assignmentTitle, attemptNumber: ev.attemptNumber };
    default: return { ...base, assignmentId: ev.assignmentId, assignmentTitle: ev.assignmentTitle };
  }
}

/** Download (once per request) and validate the events of `ids` in one stream; returns [{ id, ev|null }]. */
async function eventsOf(container, ctx, stream, ids, deps) {
  const missing = ids.filter(id => !ctx.docCache.has(stream.prefix + id));
  for (let i = 0; i < missing.length; i += EVENT_BATCH) {
    const slice = missing.slice(i, i + EVENT_BATCH);
    const docs = await loadEventDocs(container, stream.prefix, slice, deps);
    slice.forEach((id, j) => ctx.docCache.set(stream.prefix + id, normalizeStoredEvent(docs[j], stream.scope, id)));
  }
  return ids.map(id => ({ id, ev: ctx.docCache.get(stream.prefix + id) || null }));
}

/** Whether an event of this stream may count as UNREAD for this student (read state + the class unread floor). */
function countsUnread(ctx, stream, state, id, ev) {
  if (isPositionRead(state, eventPosition(id, stream.prefix))) return false;
  if (stream.scope !== "class") return true;
  const t = Date.parse(ev.createdAt);
  return Number.isFinite(t) && t >= ctx.classFloorMs;
}
function streamState(readState, stream) { return stream.scope === "student" ? readState.personal : (readState.classes[stream.key] || { through: 0, read: [] }); }

/** Unread non-message events of one stream (newest candidates first, bounded, stopping once past the display cap). */
async function countStream(container, ctx, stream, readState, ids, deps) {
  const state = streamState(readState, stream);
  const candidates = ids.filter(id => !isPositionRead(state, eventPosition(id, stream.prefix))).reverse().slice(0, EVENT_SCAN_LIMIT);
  let count = 0;
  for (let i = 0; i < candidates.length && count <= UNREAD_DISPLAY_CAP; i += EVENT_BATCH) {
    for (const { id, ev } of await eventsOf(container, ctx, stream, candidates.slice(i, i + EVENT_BATCH), deps)) {
      if (ev && countsUnread(ctx, stream, state, id, ev) && await projectEvent(container, ctx, stream, ev, true, deps)) count++;
    }
  }
  // At most EVENT_SCAN_LIMIT unread candidates are classified per stream per request (> the 99 display cap).
  return count > UNREAD_DISPLAY_CAP ? { unread: UNREAD_DISPLAY_CAP, capped: true } : { unread: count, capped: false };
}

/** The newest `limit` VISIBLE events of one stream (read or unread), scanning a bounded window. */
async function recentStream(container, ctx, stream, readState, ids, limit, deps) {
  const state = streamState(readState, stream);
  const newest = ids.slice().reverse().slice(0, EVENT_SCAN_LIMIT);
  const out = [];
  for (let i = 0; i < newest.length && out.length < limit; i += EVENT_BATCH) {
    for (const { id, ev } of await eventsOf(container, ctx, stream, newest.slice(i, i + EVENT_BATCH), deps)) {
      if (!ev || out.length >= limit) continue;
      const item = await projectEvent(container, ctx, stream, ev, countsUnread(ctx, stream, state, id, ev), deps);
      if (item) out.push({ item, position: eventPosition(id, stream.prefix) });
    }
  }
  return out;
}

async function listEventIds(container, ctx, deps) {
  const out = new Map();
  for (const stream of ctx.streams) out.set(stream.key, await listStreamIds(container, stream.prefix, deps));
  return out;
}

/** The unified count snapshot: { messages, events, bell } (messages = EXACTLY the Phase 5D summary). */
async function unifiedSummary(container, ctx, deps = {}, loaded = {}) {
  const messages = await unreadSummary(container, ctx.messageStreams, deps, loaded.markers || null);
  const readState = loaded.readState || await loadEventReadState(container, ctx.studentId, deps);
  const idsByStream = loaded.idsByStream || await listEventIds(container, ctx, deps);
  const perStream = [];
  for (const stream of ctx.streams) perStream.push(await countStream(container, ctx, stream, readState, idsByStream.get(stream.key), deps));
  const events = combineCounts(...perStream);
  const bell = combineCounts({ unread: messages.totalUnread, capped: messages.totalCapped }, events);
  return { messages, events, bell };
}

const timeOf = item => { const t = Date.parse(item.createdAt); return Number.isFinite(t) ? t : 0; };
const KIND_RANK = { direct: 0, announcement: 1 };

/** Recent unified items, newest first (stable: messages before events at the same instant, then by id), capped. */
async function unifiedItems(container, ctx, deps = {}, loaded = {}, limit = CENTER_LIMIT) {
  const markers = loaded.markers || await loadStreamMarkers(container, ctx.messageStreams, deps);
  const readState = loaded.readState || await loadEventReadState(container, ctx.studentId, deps);
  const idsByStream = loaded.idsByStream || await listEventIds(container, ctx, deps);
  const messages = (await recentNotifications(container, ctx.messageStreams, markers, deps, limit)).map(m => ({ ...m, kind: "message" }));
  const events = [];
  for (const stream of ctx.streams) events.push(...(await recentStream(container, ctx, stream, readState, idsByStream.get(stream.key), limit, deps)).map(e => ({ ...e.item, kind: "event" })));
  return [...messages, ...events]
    .sort((a, b) => timeOf(b) - timeOf(a)
      || (a.kind === b.kind ? 0 : a.kind === "message" ? -1 : 1)
      || (KIND_RANK[a.type] ?? 2) - (KIND_RANK[b.type] ?? 2)
      || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(0, limit)
    .map(({ kind: _kind, ...item }) => item);
}

/** Items + counts from ONE set of loaded read states (the panel and the badges agree). */
async function unifiedView(container, ctx, deps = {}) {
  const loaded = {
    markers: await loadStreamMarkers(container, ctx.messageStreams, deps),
    readState: await loadEventReadState(container, ctx.studentId, deps),
    idsByStream: await listEventIds(container, ctx, deps)
  };
  const items = await unifiedItems(container, ctx, deps, loaded);
  const summary = await unifiedSummary(container, ctx, deps, loaded);
  return { items, ...summary };
}

/**
 * Resolve a browser event id to one of THIS student's streams + a currently VISIBLE event. Returns
 * { stream, position } or null (unknown format, another stream's id, missing, or no longer visible).
 */
async function resolveOwnEvent(container, ctx, publicId, deps = {}) {
  const parsed = parsePublicEventId(publicId);
  if (!parsed) return null;
  const stream = ctx.streams.find(s => s.scope === parsed.scope);
  if (!stream) return null;
  const position = eventPosition(parsed.eventId, stream.prefix);        // the id's digest must match THIS stream's prefix
  if (!position) return null;
  const [{ ev }] = await eventsOf(container, ctx, stream, [parsed.eventId], deps);
  if (!ev) return null;
  const item = await projectEvent(container, ctx, stream, ev, true, deps);
  return item ? { stream, position } : null;
}

module.exports = {
  CENTER_LIMIT, EVENT_SCAN_LIMIT, CLASS_UNREAD_WINDOW_DAYS,
  publicEventId, parsePublicEventId, notificationContext, unifiedSummary, unifiedItems, unifiedView, resolveOwnEvent
};
