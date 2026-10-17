// Messages M.4 — the MESSAGING DATA of a deleted student. A hard delete (manage-students.js deleteStudent) removed the
// login and the user document but left everything the messaging features had stored for that student, unreachable
// (no route can name a deleted student) yet kept forever:
//   platform/messages/direct/<studentId>/…                      the direct conversation (both sides)
//   platform/messages/read-state/student/<studentId>/…          the student's own read markers
//   platform/messages/read-state/teacher/<key>/direct/<id>.json every teacher's read marker for that conversation
//   platform/throttle/messages-<sha256("messages|student|id")>   the student's send-rate bucket
//   platform/notifications/student/<studentId>/…                the student's notification events
//   platform/notifications/read-state/<studentId>.json          the student's notification read state
//   platform/push/students/<studentId>.json (+ owner records)   the student's Web Push registrations
// Class announcements and class events are class data and are NOT touched. Idempotency claims
// (platform/messages/send-keys/) carry no student id in their name or body, so they cannot be attributed and stay.
//
// DURABLE, BOUNDED, RESUMABLE. Before the core delete, a purge record platform/messages/purge/<studentId>.json is
// written. After it, one bounded step runs inline (never failing the delete). Whatever is left — a storage failure,
// or more data than one step's budget — is finished by drainStudentPurges, which the teacher's unread-summary poll
// calls (one record per call). A record is acted on ONLY while the student's user document does not exist: a record
// whose student still exists is an aborted delete — kept while recent (the delete may still be running), dropped
// once stale — and never removes anything.
const { listBlobNames, uploadJson, downloadJsonOrNull, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { isSafeId, directPrefix } = require("./message-store");
const { READ_STATE_PREFIX } = require("./message-read-state");
const { bucketName } = require("./message-rate-limit");
const { studentEventPrefix, eventReadStateName } = require("./notification-events");
const { purgeStudentPush } = require("./push-subscriptions");

const PURGE_PREFIX = "platform/messages/purge/";
const USER_PREFIX = "platform/users/";
/** Blob deletions per step (inline after a delete, or per drain call). */
const PURGE_STEP_BUDGET = 100;
/** A purge record whose student still exists is dropped after this long (the delete was aborted). */
const STALE_RECORD_MS = 24 * 60 * 60 * 1000;

const purgeRecordName = studentId => PURGE_PREFIX + studentId + ".json";

/** Writes the durable purge record (before the core delete). */
async function requestStudentPurge(container, studentId, deps = {}) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  const now = deps.now ? deps.now() : Date.now();
  await (deps.uploadJson || uploadJson)(container, purgeRecordName(studentId), { schemaVersion: 1, studentId, requestedAt: new Date(now).toISOString() });
}

/**
 * One bounded purge step for a DELETED student: deletes at most `budget` blobs, in order — the conversation, the
 * student's markers, every teacher's marker, the rate bucket, the notification events and read state — then the push
 * registrations. Resolves { complete, removed }; a storage failure rejects (the purge record keeps it pending).
 */
async function purgeStudentStep(container, studentId, deps = {}, budget = PURGE_STEP_BUDGET) {
  if (!isSafeId(studentId)) throw new Error("Unsafe student id.");
  const list = deps.listBlobNames || listBlobNames;
  let left = budget, removed = 0;
  const drop = async names => {
    const batch = names.slice(0, left);
    await mapConcurrent(batch, getReadConcurrency(), name => container.getBlobClient(name).deleteIfExists());
    left -= batch.length; removed += batch.length;
    return batch.length === names.length;
  };
  const groups = [
    () => list(container, directPrefix(studentId)),
    () => list(container, READ_STATE_PREFIX + "student/" + studentId + "/"),
    async () => (await list(container, READ_STATE_PREFIX + "teacher/")).filter(n => n.endsWith("/direct/" + studentId + ".json")),
    async () => [bucketName("student", studentId)],
    () => list(container, studentEventPrefix(studentId)),
    async () => [eventReadStateName(studentId)]
  ];
  for (const names of groups) {
    if (left <= 0) return { complete: false, removed };
    if (!(await drop(await names()))) return { complete: false, removed };
  }
  if (left <= 0) return { complete: false, removed };
  await (deps.purgeStudentPush || purgeStudentPush)(container, studentId, deps);
  return { complete: true, removed };
}

/** Removes the purge record (the purge is complete, or the record is a stale leftover of an aborted delete). */
async function clearStudentPurge(container, studentId) {
  await container.getBlobClient(purgeRecordName(studentId)).deleteIfExists();
}

/**
 * Inline step after a delete (best-effort): never throws. Resolves true when the student's messaging data is gone
 * (the record is then cleared), false when the purge record keeps the rest pending.
 */
async function purgeAfterDelete(container, studentId, deps = {}, obs = null, budget = PURGE_STEP_BUDGET) {
  try {
    const step = await purgeStudentStep(container, studentId, deps, budget);
    if (step.complete) await clearStudentPurge(container, studentId);
    return step.complete;
  } catch (e) {
    obs?.logError?.("student.delete.messagingPurge", e);
    return false;
  }
}

/**
 * Finishes pending purges: at most `max` records per call, one bounded step each. A record is acted on only when the
 * student's user document does not exist; otherwise it is kept while recent and dropped once stale. Never throws for a
 * single record's failure (it stays pending for a later call). Resolves the number of records completed.
 */
async function drainStudentPurges(container, deps = {}, { max = 1 } = {}) {
  const names = (await (deps.listBlobNames || listBlobNames)(container, PURGE_PREFIX)).slice(0, max);
  const now = deps.now ? deps.now() : Date.now();
  let done = 0;
  for (const name of names) {
    const studentId = name.slice(PURGE_PREFIX.length, -".json".length);
    if (!isSafeId(studentId)) continue;
    try {
      if (await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, USER_PREFIX + studentId + ".json")) {
        const record = await (deps.downloadJsonOrNull || downloadJsonOrNull)(container, name).catch(() => null);
        const at = Date.parse(String(record && record.requestedAt || ""));
        if (!Number.isFinite(at) || now - at > STALE_RECORD_MS) await clearStudentPurge(container, studentId);
        continue;
      }
      const step = await purgeStudentStep(container, studentId, deps);
      if (step.complete) { await clearStudentPurge(container, studentId); done++; }
    } catch { /* stays pending */ }
  }
  return done;
}

module.exports = {
  PURGE_PREFIX, PURGE_STEP_BUDGET, STALE_RECORD_MS, purgeRecordName,
  requestStudentPurge, purgeStudentStep, purgeAfterDelete, clearStudentPurge, drainStudentPurges
};
