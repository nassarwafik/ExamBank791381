const crypto = require("crypto");
const storage = require("./platform-storage");
const { loadDocs } = require("./classes-students-read-cache");
const { normalizeClassStatus } = require("./class-lifecycle");
const { createPendingGradingReader, pendingForClassMembers, pendingGradingMessage } = require("./pending-grading");
const { addToRosterIndex, removeFromRosterIndex } = require("./class-roster-index");
const { directPrefix } = require("./message-store");
const { listStreamIds, messageIdMs, keyDomain, normalizeMarker, advanceMarker, teacherDirectStateName } = require("./message-read-state");

// Tadris+ P5-B3a — moving a WHOLE class to another teacher (owner only; blueprint §11.6, owner decisions §19.21: «كل تاريخ الصف»).
//
// What a teacher may see is decided by OWNER STAMPS: a class by class.ownerId; a student first by student.ownerId (only when it
// has none, by its class) — teacher-tenancy.studentAccessible. Assignments, submissions, the class-assignment index, the achievement
// feed and project progress follow the CLASS (they carry no owner). So a class transfer is exactly:
//   1. class.ownerId: A → B (compare-and-set against the expected A; an owner history entry appended);
//   2. every student whose classId is that class — archived ones too — student.ownerId: A → B (profileRevision + 1).
// Then the new teacher has the class's whole history (assignments, results, pending grading, projects, messages of those students) and
// the former teacher has none of it. Nothing is deleted, no submission or grade is rewritten.
//
// Idempotent and resumable: step 1 is skipped when the class already belongs to B (and its history shows A → B), so running the same
// transfer again completes any student a failure left behind; a student owned by someone else than A or B is never touched
// (reported). Every run writes ONE ledger record (platform/transfers/<id>.json) — who, when, what moved, what did not.

const CLASS_PREFIX = "platform/classes/";
const USER_PREFIX = "platform/users/";
const LEDGER_PREFIX = "platform/transfers/";
const MAX_REASON = 500;

class TransferRefusal extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

/** The students of a class (archived included), from the users listing. */
function classStudents(users, classId) {
  return users.filter(u => u && u.role === "student" && String(u.classId || "") === classId && typeof u.userId === "string" && u.userId);
}
const ownedBy = (student, accountId, classOwner) => (typeof student.ownerId === "string" && student.ownerId ? student.ownerId === accountId : classOwner === accountId);

/** What a transfer of `classroom` to `to` would move (no write). */
async function previewClassTransfer(container, classroom, to, deps = {}) {
  const classId = String(classroom.classId);
  const from = String(classroom.ownerId || "");
  const users = await (deps.listJson || loadDocs)(container, USER_PREFIX);
  const students = classStudents(users, classId);
  const assignments = (await (deps.listJson || loadDocs)(container, "platform/assignments/")).filter(a => a && String(a.classId || "") === classId);
  const byStatus = {};
  for (const a of assignments) { const s = String(a.status || "draft"); byStatus[s] = (byStatus[s] || 0) + 1; }
  const current = students.filter(s => s.archived !== true).map(s => s.userId);
  const pendingGrading = current.length ? await pendingForClassMembers((deps.createPendingGradingReader || createPendingGradingReader)(container), classId, current) : 0;
  const foreign = students.filter(s => !ownedBy(s, from, from) && !ownedBy(s, to, from)).length;
  return {
    classId, className: String(classroom.name || ""), status: normalizeClassStatus(classroom), from, to,
    students: { total: students.length, archived: students.filter(s => s.archived === true).length, foreign },
    assignments: { total: assignments.length, byStatus }, pendingGrading
  };
}

/**
 * Moves `classId` from `from` to `to`. → { ledger, preview } ; throws TransferRefusal (nothing written) for a stale or impossible request.
 * `isTeacher(accountId)` must say whether an account exists (checked by the caller as well).
 */
async function transferClass(container, { classId, from, to, actor, reason = "", nowMs = Date.now() }, deps = {}) {
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const at = new Date(nowMs).toISOString();
  const note = String(reason || "").trim().slice(0, MAX_REASON);
  if (!from || !to || from === to) throw new TransferRefusal(400, "SAME_TEACHER", "اختر معلمًا آخر غير المعلم الحالي.");

  // 1. the class: A → B, against the owner the preview showed (a class moved meanwhile is refused, never moved twice)
  let resumed = false;
  await mut(container, CLASS_PREFIX + classId + ".json", current => {
    if (!current || String(current.classId || classId) !== classId) throw new TransferRefusal(404, "CLASS_NOT_FOUND", "الصف غير موجود.");
    const history = Array.isArray(current.ownerHistory) ? current.ownerHistory : [];
    if (current.ownerId === to) {
      const last = history[history.length - 1];
      if (last && last.from === from && last.to === to) { resumed = true; return current; }   // completing an earlier run
      throw new TransferRefusal(409, "TRANSFER_STALE", "الصف عند هذا المعلم أصلًا.");
    }
    if (current.ownerId !== from) throw new TransferRefusal(409, "TRANSFER_STALE", "تغيّر مالك الصف منذ المعاينة. أعد فتح النقل.");
    return { ...current, ownerId: to, ownerHistory: [...history, { from, to, at, by: actor, ...(note ? { reason: note } : {}) }], updatedAt: at };
  });

  // 2. every student of the class (archived included) owned by A → B; read AFTER step 1, so a student A added just before is included
  const users = await (deps.listJson || loadDocs)(container, USER_PREFIX);
  const moved = [], skipped = [], failed = [];
  for (const s of classStudents(users, classId)) {
    try {
      let outcome = "skipped";
      await mut(container, USER_PREFIX + s.userId + ".json", cur => {
        if (!cur || cur.role !== "student" || String(cur.classId || "") !== classId) { outcome = "skipped"; return cur; }   // moved meanwhile
        if (cur.ownerId === to) { outcome = "already"; return cur; }
        if (typeof cur.ownerId === "string" && cur.ownerId && cur.ownerId !== from) { outcome = "skipped"; return cur; }    // never another tenant's
        outcome = "moved";
        return { ...cur, ownerId: to, profileRevision: Number(cur.profileRevision || 0) + 1, updatedAt: at };
      });
      if (outcome === "moved") moved.push(s.userId);
      else if (outcome === "skipped") skipped.push(s.userId);
    } catch (e) {
      failed.push(s.userId);
      deps.obs?.logError?.("transfer.student.error", e, { classId });
    }
  }

  // 3. the ledger
  const transferId = "tr-" + nowMs.toString(36) + "-" + crypto.randomBytes(6).toString("hex");
  const ledger = {
    schemaVersion: 1, transferId, kind: "class", classId, from, to, at, by: actor, ...(note ? { reason: note } : {}), resumed,
    students: { moved: moved.length, skipped: skipped.length, failed: failed.length }, failedStudentIds: failed, complete: failed.length === 0
  };
  await (deps.uploadJsonConditional || storage.uploadJsonConditional)(container, LEDGER_PREFIX + transferId + ".json", ledger, null);
  return { ledger };
}

// ── Tadris+ P5-B3b — moving ONE student into another teacher's class (owner decisions §19.21, D16) ───────────────────────────
// The student's document is the authority: classId → the new class, ownerId → the new teacher, `directSince` = the transfer moment,
// a transferHistory entry. Everything the student DID stays where it was: submissions keep their classId (the former teacher keeps
// them as «منقول» in the gradebook, read-only — assignment-results movedStudents); the new teacher sees the student's learning
// progress (per-student documents) but neither the old class's grades (buildStudentProfile filters by the viewer's classes) nor the
// conversation before the transfer (messages.js hides direct messages older than directSince; the new teacher's read marker starts
// at the transfer, so nothing old is ever counted as unread). Refused while the student has work awaiting the former teacher (an open
// attempt or a result to review — PENDING_GRADING), re-checked AFTER the write (an attempt started meanwhile reverts the move).

/** The newest message of a student's direct stream, per read domain — the new teacher's starting read marker. */
async function boundaryMarker(container, studentId, deps = {}) {
  const ids = await (deps.listStreamIds || listStreamIds)(container, directPrefix(studentId), deps);
  const marker = {};
  for (const id of ids) {
    const key = messageIdMs(id);
    if (!Number.isFinite(key)) continue;
    const domain = keyDomain(key);
    const cur = marker[domain];
    if (!cur || key > cur.boundaryMs) marker[domain] = { boundaryMs: key, seenIdsAtBoundary: [id] };
    else if (key === cur.boundaryMs) cur.seenIdsAtBoundary.push(id);
  }
  return marker;
}
async function startReadMarker(container, teacherId, studentId, deps = {}) {
  const incoming = await boundaryMarker(container, studentId, deps);
  if (!incoming.legacy && !incoming.sequenced) return false;                       // no message yet: nothing to mark
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  await mut(container, teacherDirectStateName(teacherId, studentId), current => {
    const r = advanceMarker(normalizeMarker(current), incoming);
    return { schemaVersion: 2, principalRole: "teacher", streamKind: "direct", streamId: studentId, teacherId, legacy: r.marker.legacy || null, sequenced: r.marker.sequenced || null, updatedAt: new Date().toISOString() };
  });
  return true;
}

const pendingOf = (container, classId, userId, deps) => pendingForClassMembers((deps.createPendingGradingReader || createPendingGradingReader)(container), classId, [userId]);

/** What moving `student` into `target` would do (no write). */
async function previewStudentTransfer(container, student, fromClass, target, deps = {}) {
  return {
    userId: String(student.userId), displayName: String(student.displayName || ""), archived: student.archived === true,
    fromClassId: String(fromClass.classId), fromClassName: String(fromClass.name || ""), from: ownerOfStudent(student, fromClass),
    toClassId: String(target.classId), toClassName: String(target.name || ""), to: String(target.ownerId || ""),
    pendingGrading: await pendingOf(container, String(fromClass.classId), String(student.userId), deps)
  };
}
/** The teacher a student belongs to: its own stamp, else its class's owner. */
function ownerOfStudent(student, cls) {
  return typeof student.ownerId === "string" && student.ownerId ? student.ownerId : String((cls && cls.ownerId) || "");
}

async function transferStudent(container, { userId, fromClassId, toClassId, from, to, actor, reason = "", nowMs = Date.now() }, deps = {}) {
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const at = new Date(nowMs).toISOString();
  const note = String(reason || "").trim().slice(0, MAX_REASON);
  if (!from || !to || from === to) throw new TransferRefusal(400, "SAME_TEACHER", "اختر صفًا لمعلم آخر غير المعلم الحالي.");
  const blob = USER_PREFIX + userId + ".json";

  const before = await pendingOf(container, fromClassId, userId, deps);
  if (before > 0) throw new TransferRefusal(409, "PENDING_GRADING", pendingGradingMessage ? pendingGradingMessage("move", before) : "لدى الطالب عمل بانتظار التصحيح.");

  let previous = null;
  await mut(container, blob, cur => {
    if (!cur || cur.role !== "student") throw new TransferRefusal(404, "STUDENT_NOT_FOUND", "الطالب غير موجود.");
    if (String(cur.classId || "") !== fromClassId) throw new TransferRefusal(409, "TRANSFER_STALE", "نُقل الطالب أو تغيّر صفه منذ المعاينة. أعد فتح النقل.");
    const owner = typeof cur.ownerId === "string" && cur.ownerId ? cur.ownerId : null;
    if (owner && owner !== from) throw new TransferRefusal(409, "TRANSFER_STALE", "تغيّر معلم الطالب منذ المعاينة. أعد فتح النقل.");
    previous = { ownerId: owner, directSince: cur.directSince, profileRevision: Number(cur.profileRevision || 0) };
    const history = Array.isArray(cur.transferHistory) ? cur.transferHistory : [];
    return { ...cur, classId: toClassId, ownerId: to, directSince: at, transferHistory: [...history, { fromClassId, toClassId, from, to, at, by: actor, ...(note ? { reason: note } : {}) }], profileRevision: previous.profileRevision + 1, updatedAt: at };
  });

  // QA2-8 pattern: an attempt started in the old class between the check and the write is seen now → the move is withdrawn
  const after = await pendingOf(container, fromClassId, userId, deps);
  if (after > 0) {
    await mut(container, blob, cur => {
      const history = Array.isArray(cur && cur.transferHistory) ? cur.transferHistory : [];
      const last = history[history.length - 1];
      if (!cur || !last || last.at !== at || String(cur.classId || "") !== toClassId) return cur;   // changed since: leave it
      const next = { ...cur, classId: fromClassId, transferHistory: history.slice(0, -1), profileRevision: Number(cur.profileRevision || 0) + 1, updatedAt: new Date().toISOString() };
      if (previous.ownerId) next.ownerId = previous.ownerId; else delete next.ownerId;
      if (previous.directSince !== undefined) next.directSince = previous.directSince; else delete next.directSince;
      return next;
    });
    throw new TransferRefusal(409, "PENDING_GRADING", pendingGradingMessage ? pendingGradingMessage("move", after) : "لدى الطالب عمل بانتظار التصحيح.");
  }

  const roster = { removed: true, added: true };
  try { await (deps.removeFromRosterIndex || removeFromRosterIndex)(container, fromClassId, [userId], { obs: deps.obs, operation: "transfer" }); } catch { roster.removed = false; }
  try { await (deps.addToRosterIndex || addToRosterIndex)(container, toClassId, [userId], { obs: deps.obs, operation: "transfer" }); } catch { roster.added = false; }
  let readMarker = true;
  try { await startReadMarker(container, to, userId, deps); } catch (e) { readMarker = false; deps.obs?.logError?.("transfer.marker.error", e); }

  const transferId = "tr-" + nowMs.toString(36) + "-" + crypto.randomBytes(6).toString("hex");
  const ledger = { schemaVersion: 1, transferId, kind: "student", userId, fromClassId, toClassId, from, to, at, by: actor, ...(note ? { reason: note } : {}), rosterSynced: roster.removed && roster.added, readMarker, complete: true };
  await (deps.uploadJsonConditional || storage.uploadJsonConditional)(container, LEDGER_PREFIX + transferId + ".json", ledger, null);
  return { ledger };
}

module.exports = {
  LEDGER_PREFIX, MAX_REASON, TransferRefusal, classStudents, previewClassTransfer, transferClass,
  previewStudentTransfer, transferStudent, ownerOfStudent, boundaryMarker
};
