// Roadmap #25 — the class ROSTER INDEX (`classroom.studentIds`) as an explicitly denormalized, repairable cache.
//
// ARCHITECTURE
//   Source of truth  : the USER document — a student is a member of a class when
//                      isStudentClassMember(user, classId) (role "student", user.classId === classId,
//                      archived !== true; `active` is login eligibility only — Roadmap #24).
//   Fast index/cache : classroom.studentIds — used ONLY for cheap display counts (class cards, report
//                      headers, project selectors) so those O(classes) reads never scan all users.
//
// RULES
//   - The index NEVER decides membership; when it disagrees with user documents, the user documents win
//     and the index is rewritten to match (repair). No membership decision anywhere reads studentIds.
//   - Every writer first changes the AUTHORITATIVE user state, then updates the index best-effort. A
//     failed index update (optimistic-concurrency retry exhaustion) is reported as `synced:false`
//     ("roster sync deferred") + a structured warning — never a failure of the business operation and
//     never a reason to roll back or delete the user document.
//   - Additions and removals are idempotent; duplicates/blank ids are normalized away; a repair rewrites
//     the list in deterministic (sorted) order; every index write is a CAS read-modify-write with retry.
//   - Reconciliation never adds a full-users scan to a hot path: it piggybacks on code that ALREADY has
//     the exact member set (listStudents' users scan, or the explicit teacher-triggered reconcile action).
//     A synchronized index costs zero writes; a drifted one costs at most one class read/write.
//
// RACE GUARD (why a repair can never remove a member that appeared after the scan began)
//   Because every writer changes the user document BEFORE touching the index, any index change for class X
//   that lands after the scan started bumps classroom.updatedAt. reconcileRosterIndex re-reads the classroom
//   inside the CAS loop and SKIPS the repair when updatedAt is newer than scanStartedAt (with a small clock
//   tolerance); a write that lands between the read and the conditional upload fails the ETag check and the
//   retry re-reads and skips. So a repair is written only when the index has not changed since the scan
//   began — and then the only user changes the scan could have missed are ones whose index update has not
//   happened yet: such a member is either already absent from the index (nothing to remove) or was seen by
//   the scan (kept). The pending writer's own idempotent add/remove then lands on top. The drift, if any,
//   is simply repaired on the next reconcile cycle.
const { mutateJsonWithRetry, StorageConflictError } = require("./platform-storage");
const { isStudentClassMember } = require("./class-membership");

const CLASS_PREFIX = "platform/classes/";
const CLOCK_SKEW_TOLERANCE_MS = 2000;

// Thrown inside the CAS callback to mean "nothing to write" (classroom gone, or index already correct).
class SkipRosterWrite extends Error {}

function normalizeRosterIds(ids) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

// The authoritative member ids of a class from a set of user documents (the ONE membership predicate).
function canonicalMemberIds(users, classId) {
  const ids = (Array.isArray(users) ? users : [])
    .filter(user => isStudentClassMember(user, classId))
    .map(user => String(user.userId || "").trim());
  return normalizeRosterIds(ids).sort();
}

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const id of b) if (!set.has(id)) return false;
  return true;
}

function timestampMs(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function warnDeferred(obs, classId, operation, extra = {}) {
  try {
    obs?.logWarn("class.rosterIndex.sync_deferred", { classId, operation, retryable: true, rosterSyncDeferred: true, ...extra });
  } catch { /* observing must never break the operation */ }
}

// CAS read-modify-write of the index. `applyMutation(classroom)` edits classroom.studentIds in place (or
// throws SkipRosterWrite for "no change"). Returns { synced:true } on success or no-op, { synced:false } when
// the optimistic-concurrency retry budget is exhausted (the ONLY tolerated failure — anything else propagates).
async function mutateRosterIndex(container, classId, applyMutation, { obs, operation = "rosterIndex" } = {}) {
  if (!classId) return { synced: true, changed: false };
  let changed = false;
  try {
    await mutateJsonWithRetry(container, CLASS_PREFIX + classId + ".json", current => {
      if (!current) throw new SkipRosterWrite();
      const stored = Array.isArray(current.studentIds) ? current.studentIds.map(id => String(id ?? "")) : [];
      current.studentIds = normalizeRosterIds(stored);
      applyMutation(current);
      const after = normalizeRosterIds(current.studentIds);
      // Zero writes when the stored list is already exactly the result (idempotent add/remove).
      if (after.length === stored.length && after.every((id, i) => id === stored[i])) throw new SkipRosterWrite();
      current.studentIds = after;
      current.updatedAt = new Date().toISOString();
      changed = true;
      return current;
    });
    return { synced: true, changed };
  } catch (e) {
    if (e instanceof SkipRosterWrite) return { synced: true, changed: false };
    if (e instanceof StorageConflictError) { warnDeferred(obs, classId, operation); return { synced: false, changed: false }; }
    throw e;
  }
}

async function addToRosterIndex(container, classId, userIds, opts) {
  const ids = normalizeRosterIds(userIds);
  if (!ids.length) return { synced: true, changed: false };
  return mutateRosterIndex(container, classId, classroom => {
    for (const id of ids) if (!classroom.studentIds.includes(id)) classroom.studentIds.push(id);
  }, opts);
}

async function removeFromRosterIndex(container, classId, userIds, opts) {
  const ids = new Set(normalizeRosterIds(userIds));
  if (!ids.size) return { synced: true, changed: false };
  return mutateRosterIndex(container, classId, classroom => {
    classroom.studentIds = classroom.studentIds.filter(id => !ids.has(id));
  }, opts);
}

// Repairs the index to exactly `memberIds` (the authoritative set computed from user documents by the caller).
// `scanStartedAt` (ms) is when the caller's users scan began — see RACE GUARD above. Never throws for a
// concurrency conflict. Returns { changed, synced, skipped, beforeCount, authoritativeCount, repairedCount }.
async function reconcileRosterIndex(container, classId, memberIds, { scanStartedAt = 0, obs, operation = "reconcile" } = {}) {
  const expected = normalizeRosterIds(memberIds).sort();
  const result = { changed: false, synced: true, skipped: false, beforeCount: 0, authoritativeCount: expected.length, repairedCount: 0 };
  if (!classId) return result;
  try {
    await mutateJsonWithRetry(container, CLASS_PREFIX + classId + ".json", current => {
      if (!current) { result.skipped = true; throw new SkipRosterWrite(); }
      const rawBefore = Array.isArray(current.studentIds) ? current.studentIds : [];
      const before = normalizeRosterIds(rawBefore);
      result.beforeCount = rawBefore.length;
      result.repairedCount = rawBefore.length;
      // Already synchronized (same set, no duplicates/blanks) → zero writes; order alone never causes a write.
      if (before.length === rawBefore.length && sameIdSet(before, expected)) throw new SkipRosterWrite();
      // Race guard: the classroom (its index) changed after the scan began → this scan may be stale; skip now,
      // the next reconcile cycle repairs whatever drift remains.
      if (scanStartedAt && timestampMs(current.updatedAt) > scanStartedAt - CLOCK_SKEW_TOLERANCE_MS) {
        result.skipped = true;
        throw new SkipRosterWrite();
      }
      current.studentIds = expected;
      current.updatedAt = new Date().toISOString();
      result.changed = true;
      result.repairedCount = expected.length;
      return current;
    });
    return result;
  } catch (e) {
    if (e instanceof SkipRosterWrite) return result;
    if (e instanceof StorageConflictError) { warnDeferred(obs, classId, operation, { reconcile: true }); result.synced = false; return result; }
    throw e;
  }
}

module.exports = { CLASS_PREFIX, normalizeRosterIds, canonicalMemberIds, sameIdSet, addToRosterIndex, removeFromRosterIndex, reconcileRosterIndex };
