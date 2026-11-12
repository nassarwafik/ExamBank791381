const storage = require("./platform-storage");
const { isSafeId } = require("./roster-input");
const { sharedClassIds, sharedClassEntries } = require("./class-membership");
const { addToRosterIndex, removeFromRosterIndex } = require("./class-roster-index");
const { createPendingGradingReader } = require("./pending-grading");

// Tadris+ P11-A — ONE student account in MORE THAN ONE class (owner decision: «الطالب يستطيع ان يتعلم عند اكثر من معلم»).
//
// The student keeps ONE account (the identity number is the platform-wide login) and ONE home class: `classId` (+ `ownerId`, the home
// teacher) exactly as before. A class the owner ADDS the student to is a SHARED class: an entry of `student.sharedClasses`
// ({ classId, addedAt, addedBy }). Nothing else is stored: the teacher of a shared class is always the class's own owner, read from the
// class document, so a class that moves to another teacher takes its shared students with it and nothing can drift.
//
// Owner decisions (recorded in docs/enterprise-shared-enrollment-p11a.md):
//   - the account itself (name, identity number, password, login state, archive, delete) is managed by the OWNER and the HOME teacher
//     only. The teacher of a shared class sees the student in that class and may REMOVE the student from it — nothing else;
//   - each teacher sees the results of THEIR class only (the rule of D16);
//   - an existing student is added to another teacher's class by the OWNER only (never by a teacher who knows an identity number).
//
// Grading safety (AGENTS.md §10): leaving a shared class takes the student's work there out of that class's gradebook, so it is refused
// while that work still awaits the teacher (an open attempt, a result to review) — checked before the write and AGAIN after it (an
// attempt started in between puts the student back), the QA2-8 pattern of the transfer.

const USER_PREFIX = "platform/users/";
const MAX_SHARED_CLASSES = 8;
const MAX_HISTORY = 50;

class EnrollmentRefusal extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.name = "EnrollmentRefusal"; this.status = status; this.code = code; this.extra = extra; }
}
class NoWrite extends Error {}

const NOT_FOUND = () => new EnrollmentRefusal(404, "STUDENT_NOT_FOUND", "الطالب غير موجود.");

function pendingMessage(pending) {
  return "لا يمكن إزالة الطالب من هذا الصف الآن: لديه " + pending + (pending === 1 ? " عمل" : " أعمال") +
    " بانتظار التصحيح أو محاولة مفتوحة في هذا الصف، وستختفي من دفتر علاماته. أكمل التصحيح أو أنهِ المحاولة أولًا.";
}

/** The pending-work message of an account action (archive / delete) blocked by work in a class the student SHARES. */
function sharedPendingMessage(operation, pending) {
  const verb = operation === "archive" ? "أرشفة" : operation === "delete" ? "حذف" : "نقل";
  return "لا يمكن " + verb + " الطالب الآن: لديه " + pending + (pending === 1 ? " عمل" : " أعمال") +
    " بانتظار التصحيح أو محاولة مفتوحة في صف آخر يتعلم فيه. يُكمَل التصحيح هناك أولًا، أو يزيله المالك من ذلك الصف.";
}

const historyOf = doc => (Array.isArray(doc && doc.sharedHistory) ? doc.sharedHistory : []).slice(-(MAX_HISTORY - 1));

/**
 * Adds each student of `userIds` to `classroom` as a SHARED class. Per student: "enrolled", "already" (home or shared there already —
 * nothing written) or an error row. The account is not touched otherwise: no password, no session revocation, no rename.
 * → { enrolled: [student documents], already: [userIds], errors: [{ userId, code, error }], rosterSynced }
 */
async function enrollStudents(container, classroom, userIds, { actor = "", nowMs = Date.now(), obs = null } = {}, deps = {}) {
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const classId = String(classroom.classId), at = new Date(nowMs).toISOString();
  const enrolled = [], already = [], errors = [];
  for (const userId of userIds) {
    try {
      if (!isSafeId(userId)) throw NOT_FOUND();
      let written = null;
      try {
        written = await mut(container, USER_PREFIX + userId + ".json", cur => {
          if (!cur || cur.role !== "student" || String(cur.userId || "") !== userId) throw NOT_FOUND();
          if (String(cur.classId || "") === classId || sharedClassIds(cur).includes(classId)) throw new NoWrite();
          if (cur.archived === true) throw new EnrollmentRefusal(409, "STUDENT_ARCHIVED", "الطالب مؤرشف عند معلمه. يُستعاد من الأرشيف أولًا.");
          const entries = sharedClassEntries(cur);
          if (entries.length >= MAX_SHARED_CLASSES) throw new EnrollmentRefusal(409, "SHARED_LIMIT", "الطالب مضاف إلى " + MAX_SHARED_CLASSES + " صفوف إضافية، وهذا هو الحد الأقصى.");
          return {
            ...cur,
            sharedClasses: [...entries, { classId, addedAt: at, addedBy: actor }],
            sharedHistory: [...historyOf(cur), { classId, action: "added", at, by: actor }],
            updatedAt: at
          };
        });
      } catch (e) {
        if (!(e instanceof NoWrite)) throw e;
        already.push(userId);
        continue;
      }
      enrolled.push(written);
    } catch (e) {
      if (e instanceof EnrollmentRefusal) errors.push({ userId, code: e.code, error: e.message });
      else { obs?.logError?.("enrollment.add.error", e, { classId }); errors.push({ userId, code: "FAILED", error: "تعذرت إضافة هذا الطالب." }); }
    }
  }
  // The student documents above are the authority; the roster index is a repairable count cache (class-roster-index.js).
  const rosterSynced = enrolled.length
    ? (await (deps.addToRosterIndex || addToRosterIndex)(container, classId, enrolled.map(s => String(s.userId)), { obs, operation: "enroll" })).synced
    : true;
  return { enrolled, already, errors, rosterSynced };
}

/**
 * Removes the student from the SHARED class `classId` (never from the home class: that is a move / transfer / archive). Refused while
 * work in that class awaits its teacher. → { removed: true, rosterSynced } ; throws EnrollmentRefusal (nothing written).
 */
async function unenrollStudent(container, classId, userId, { actor = "", nowMs = Date.now(), obs = null } = {}, deps = {}) {
  const mut = deps.mutateJsonWithRetry || storage.mutateJsonWithRetry;
  const pendingOf = () => (deps.createPendingGradingReader || createPendingGradingReader)(container).count(userId, classId);
  if (!isSafeId(userId) || !isSafeId(classId)) throw NOT_FOUND();
  const blob = USER_PREFIX + userId + ".json";
  const at = new Date(nowMs).toISOString();

  const before = await pendingOf();
  if (before > 0) throw new EnrollmentRefusal(409, "PENDING_GRADING", pendingMessage(before), { pendingCount: before });

  let removedEntry = null;
  await mut(container, blob, cur => {
    if (!cur || cur.role !== "student" || String(cur.userId || "") !== userId) throw NOT_FOUND();
    const entries = sharedClassEntries(cur);
    removedEntry = entries.find(e => e.classId === classId) || null;
    if (!removedEntry) throw new EnrollmentRefusal(404, "NOT_SHARED_HERE", "الطالب ليس مضافًا إلى هذا الصف.");
    return {
      ...cur,
      sharedClasses: entries.filter(e => e.classId !== classId),
      sharedHistory: [...historyOf(cur), { classId, action: "removed", at, by: actor }],
      updatedAt: at
    };
  });

  // QA2-8 pattern: an attempt the student started in this class between the check and the write is visible now → the student is put
  // back (only when nothing changed the entry since), and the removal is refused like the pre-check.
  const after = await pendingOf();
  if (after > 0) {
    await mut(container, blob, cur => {
      if (!cur || cur.role !== "student") return cur;
      const history = Array.isArray(cur.sharedHistory) ? cur.sharedHistory : [];
      const last = history[history.length - 1];
      if (!last || last.at !== at || last.action !== "removed" || last.classId !== classId) return cur;   // changed since: leave it
      if (String(cur.classId || "") === classId || sharedClassIds(cur).includes(classId)) return cur;
      return { ...cur, sharedClasses: [...sharedClassEntries(cur), removedEntry], sharedHistory: history.slice(0, -1), updatedAt: new Date().toISOString() };
    });
    throw new EnrollmentRefusal(409, "PENDING_GRADING", pendingMessage(after), { pendingCount: after });
  }

  const rosterSynced = (await (deps.removeFromRosterIndex || removeFromRosterIndex)(container, classId, [userId], { obs, operation: "unenroll" })).synced;
  return { removed: true, rosterSynced };
}

/** Work of the student still awaiting a teacher in the classes the student SHARES (the home class has its own guard). */
async function pendingInSharedClasses(reader, student) {
  let total = 0;
  for (const classId of sharedClassIds(student)) total += await reader.count(String(student.userId || ""), classId);
  return total;
}

module.exports = { MAX_SHARED_CLASSES, EnrollmentRefusal, enrollStudents, unenrollStudent, pendingInSharedClasses, sharedPendingMessage };
