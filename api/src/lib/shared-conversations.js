const { listBlobNames, downloadJsonOrNull } = require("./platform-storage");
const { normalizeClassStatus } = require("./class-lifecycle");
const { sharedClassEntries, isStudentSharedIn } = require("./class-membership");
const { SHARED_PREFIX, sharedDirectPrefix, announcementPrefix, blobMessageId, isSafeId } = require("./message-store");
const {
  READER_RELEVANCE, teacherSharedStateName, studentSharedStateName, studentAnnouncementStateName, loadMarker, isReadBy, countUnread, combineCounts
} = require("./message-read-state");

// Tadris+ P11-B — the conversation of a student with the teacher of a class the student SHARES (owner decision: «محادثة منفصلة لكل
// معلم», docs/enterprise-shared-messaging-p11b.md).
//
// A student has ONE home conversation (platform/messages/direct/<studentId>/, with the home teacher — unchanged) and, for every class
// the owner added the student to, ONE more conversation with that class's teacher: message-store sharedDirectPrefix(classId, studentId).
// The two never mix: a message names its conversation (`sharedClassId`), every reader has a separate read marker per conversation,
// and a teacher reaches only the conversation of a class of THEIR OWN — never the student's conversation with another teacher.
//
// This module only DESCRIBES those streams (prefix, expected shape, marker name, relevance) for the generic message engine
// (listRecentMessages, publishGuarded, markStreamRead, countUnread, edit / delete) and counts the teacher's unread replies in them.
// Every authorization decision stays in the route.

const USER_PREFIX = "platform/users/";
const CLASS_PREFIX = "platform/classes/";

const sharedExpected = (classId, studentId) => ({ kind: "direct", studentId, sharedClassId: classId });

/** The TEACHER's side of the conversation of (shared class, student). */
function teacherSharedStream(teacherId, classId, studentId) {
  return {
    streamPrefix: sharedDirectPrefix(classId, studentId), expected: sharedExpected(classId, studentId), include: READER_RELEVANCE.teacherDirect,
    stateName: teacherSharedStateName(teacherId, classId, studentId),
    meta: { principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId, sharedClassId: classId }
  };
}

/** The STUDENT's streams of one shared class — the shape of student-notifications.studentStreams: { direct, announcements }. */
function studentSharedStreams(studentId, classId) {
  return {
    direct: { stateName: studentSharedStateName(studentId, classId), streamPrefix: sharedDirectPrefix(classId, studentId), expected: sharedExpected(classId, studentId), include: READER_RELEVANCE.studentDirect },
    announcements: { stateName: studentAnnouncementStateName(studentId, classId), streamPrefix: announcementPrefix(classId), expected: { kind: "announcement", classId }, include: READER_RELEVANCE.announcements }
  };
}

/**
 * The classes the student SHARES whose document exists, each with its document, whether it is archived and when the student was
 * added — in the order they were added. A shared class whose document is gone gives nothing (fail closed).
 */
async function sharedClassesOf(container, student, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const out = [];
  for (const entry of sharedClassEntries(student)) {
    const classroom = await dl(container, CLASS_PREFIX + entry.classId + ".json");
    if (!classroom || typeof classroom !== "object") continue;
    out.push({ classId: entry.classId, classroom, archived: normalizeClassStatus(classroom) === "archived", addedAt: entry.addedAt });
  }
  return out;
}

/** Shared-conversation message ids grouped by "<classId>/<studentId>", from ONE listing (names only). */
function groupSharedIds(names) {
  const out = new Map();
  for (const name of names) {
    if (!name.startsWith(SHARED_PREFIX)) continue;
    const parts = name.slice(SHARED_PREFIX.length).split("/");
    if (parts.length !== 3 || !isSafeId(parts[0]) || !isSafeId(parts[1])) continue;
    const id = blobMessageId(name, SHARED_PREFIX + parts[0] + "/" + parts[1] + "/");
    if (!id) continue;
    const key = parts[0] + "/" + parts[1];
    if (!out.has(key)) out.set(key, { classId: parts[0], studentId: parts[1], ids: [] });
    out.get(key).ids.push(id);
  }
  for (const group of out.values()) group.ids.sort();
  return Array.from(out.values()).sort((a, b) => (a.classId + "/" + a.studentId < b.classId + "/" + b.studentId ? -1 : 1));
}

/**
 * The TEACHER's unread student replies in the conversations of shared classes — the counterpart of teacherDirectUnread for the home
 * conversations. Counted only where, RIGHT NOW: the class is one this teacher may act on (`classOk`, the tenancy authority; null =
 * single mode) and the student document still shares that class. A student removed from the class, a deleted student or another
 * teacher's class never counts. Work: one listing of the shared namespace (or of one class), then per conversation with an unread
 * candidate: the class check (cached by the caller's reader), one user read, one marker read and its candidate downloads; the global
 * summary stops once the display cap is exceeded.
 * → { totalUnread, capped } and, with `classId`, { byStudent } too.
 */
async function teacherSharedUnread(container, teacherId, { classId = "", classOk = null } = {}, deps = {}) {
  const list = deps.listBlobNames || listBlobNames;
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  if (classId && !isSafeId(classId)) return { totalUnread: 0, capped: false, byStudent: {} };
  const groups = groupSharedIds(await list(container, classId ? SHARED_PREFIX + classId + "/" : SHARED_PREFIX));
  const byStudent = {};
  const counts = [];
  for (const g of groups) {
    if (!classId && combineCounts(...counts).capped) break;          // global badge already "99+"
    if (classOk && !(await classOk(g.classId))) continue;
    const user = await dl(container, USER_PREFIX + g.studentId + ".json");
    if (!user || user.role !== "student" || String(user.userId || "") !== g.studentId || !isStudentSharedIn(user, g.classId)) continue;
    const stream = teacherSharedStream(teacherId, g.classId, g.studentId);
    const marker = await loadMarker(container, stream.stateName, deps);
    if (!g.ids.some(id => !isReadBy(marker, id))) continue;
    const c = await countUnread(container, { streamPrefix: stream.streamPrefix, expected: stream.expected, marker, ids: g.ids, include: stream.include, absorb: { stateName: stream.stateName, meta: stream.meta } }, deps);
    counts.push(c);
    if (c.unread > 0) byStudent[g.studentId] = c;
  }
  const total = combineCounts(...counts);
  return classId ? { totalUnread: total.unread, capped: total.capped, byStudent } : { totalUnread: total.unread, capped: total.capped };
}

module.exports = { sharedExpected, teacherSharedStream, studentSharedStreams, sharedClassesOf, groupSharedIds, teacherSharedUnread };
