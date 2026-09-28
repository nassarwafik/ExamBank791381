// Phase 12E-B — the per-class PUBLISHED-assignment index: platform/assignment-index/classes/<classId>.json
//
//   { schemaVersion: 1, classId, ready: true|false, publishedAssignmentIds: [...], updatedAt }
//
// It lets the hot read paths (student-dashboard, teacher-today) find a class's currently-published assignments
// without listing + downloading EVERY assignment document of every class. It is a POINTER set, never an authority:
// a reader always downloads each named assignment and re-validates it (exists, status published, same class).
//
// CORRECTNESS INVARIANT — no false negatives:
//   • a successful transition to "published" (create-as-published, draft→published, restore-to-published) STRICTLY
//     ensures the pointer BEFORE the assignment commits "published"; if that ensure fails, the transition fails and the
//     assignment is not published (manage-assignments);
//   • pointers are removed only AFTER an assignment stopped being published (unpublish / archive / purge), best-effort,
//     under the same per-assignment lifecycle lock as the publishing transitions — so a delayed removal can never
//     erase the pointer of a concurrent re-publish of the same assignment;
//   • bootstrap only ever ADDS (a CAS union of the current ids and the legacy scan), so it can never drop a pointer that
//     a concurrent publish pre-added.
// A stale extra pointer (false positive) is harmless: the reader ignores a missing / draft / archived / other-class
// document behind it.
//
// `ready` exists because assignments created before this index existed are not in it: a missing index, a malformed one
// or ready:false means "not bootstrapped yet" — never "no published assignments". The first read of such a class runs
// the legacy global scan ONCE (one scan per request, whatever the number of classes), serves that result and CAS-merges
// the discovered ids into the index with ready:true. A strict add to a not-yet-bootstrapped class creates / keeps
// ready:false, which claims nothing about the legacy set.
const { downloadJsonOrNull, listJson, mutateJsonWithRetry, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { normalizeAssignmentStatus } = require("./assignment-lifecycle");

const INDEX_PREFIX = "platform/assignment-index/classes/";
const ASSIGNMENT_PREFIX = "platform/assignments/";
const SCHEMA_VERSION = 1;

/** The repository's safe-id convention (message-store): the id is used as a blob-name segment. */
function isSafeId(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function indexName(classId) {
  if (!isSafeId(classId)) throw new Error("Unsafe class id.");
  return INDEX_PREFIX + classId + ".json";
}
/** Stable order = the blob-listing order of the assignment documents (PREFIX + id + ".json"). */
const byBlobName = (a, b) => { const x = a + ".json", y = b + ".json"; return x < y ? -1 : x > y ? 1 : 0; };
/** Strings only, safe ids only, no blanks, no duplicates, stable (blob-name) order. */
function normalizeIds(list) {
  const out = new Set();
  for (const v of Array.isArray(list) ? list : []) { const id = typeof v === "string" ? v.trim() : ""; if (isSafeId(id)) out.add(id); }
  return [...out].sort(byBlobName);
}
/**
 * Lenient view of a stored index document: the parseable ids are always kept (so a merge never loses a pointer), but
 * only a well-formed document of THIS class with ready === true counts as bootstrapped.
 */
function normalizeIndex(doc, classId) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { classId, ready: false, publishedAssignmentIds: [], valid: false };
  const idsOk = Array.isArray(doc.publishedAssignmentIds);
  const valid = idsOk && String(doc.classId || "") === classId && Number(doc.schemaVersion) === SCHEMA_VERSION;
  return { classId, ready: valid && doc.ready === true, publishedAssignmentIds: normalizeIds(doc.publishedAssignmentIds), valid };
}
function indexDoc(classId, ready, ids, now) {
  return { schemaVersion: SCHEMA_VERSION, classId, ready: ready === true, publishedAssignmentIds: normalizeIds(ids), updatedAt: now || new Date().toISOString() };
}
const nowIso = deps => (deps.nowIso ? deps.nowIso() : new Date().toISOString());

/** Direct read of one class index (normalized), or null when it does not exist. */
async function readClassIndex(container, classId, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const doc = await dl(container, indexName(classId));
  return doc === null || doc === undefined ? null : normalizeIndex(doc, classId);
}

/**
 * STRICT: make sure `assignmentId` is in the class's published index (ETag CAS with retry). Creates the index as
 * ready:false when it does not exist, keeps ready as it was otherwise. Idempotent. Throws on failure (including CAS
 * exhaustion — StorageConflictError): the caller MUST NOT publish the assignment then.
 */
async function ensurePublishedAssignmentIndexed(container, classId, assignmentId, deps = {}) {
  if (!isSafeId(assignmentId)) throw new Error("Unsafe assignment id.");
  // A class id outside the safe-id convention (never generated today — classes use UUIDs) cannot have an index: its
  // readers always take the legacy scan path, so there is nothing to ensure and nothing can be missed.
  if (!isSafeId(classId)) return;
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  await mut(container, indexName(classId), current => {
    const cur = normalizeIndex(current, classId);
    return indexDoc(classId, cur.ready, [...cur.publishedAssignmentIds, assignmentId], nowIso(deps));
  });
}

const NOOP = Symbol("assignment-index-noop");
/**
 * BEST-EFFORT: drop `assignmentId` from the class's published index AFTER the assignment stopped being published.
 * Never creates an index, never writes when the id is absent. Returns { removed, failed } and never throws: a failure
 * only leaves a stale pointer, which every reader filters out. `obs` gets a safe technical warning on failure.
 */
async function removePublishedAssignmentFromIndex(container, classId, assignmentId, deps = {}, obs = null, action = "") {
  if (!isSafeId(classId) || !isSafeId(assignmentId)) return { removed: false, failed: false };
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  try {
    await mut(container, indexName(classId), current => {
      if (current === null || current === undefined) throw NOOP;
      const cur = normalizeIndex(current, classId);
      if (!cur.publishedAssignmentIds.includes(assignmentId)) throw NOOP;
      return indexDoc(classId, cur.ready, cur.publishedAssignmentIds.filter(id => id !== assignmentId), nowIso(deps));
    });
    return { removed: true, failed: false };
  } catch (e) {
    if (e === NOOP) return { removed: false, failed: false };
    try { obs?.logWarn("assignment.index.cleanup_failed", { action: String(action || ""), assignmentId, retryable: true }); } catch { /* inert */ }
    return { removed: false, failed: true };
  }
}

/** Bootstrap merge: current ids ∪ discovered ids, ready:true. Only ever adds (a concurrent strict add is never lost). */
async function bootstrapClassIndex(container, classId, discoveredIds, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  await mut(container, indexName(classId), current => {
    const cur = normalizeIndex(current, classId);
    return indexDoc(classId, true, [...cur.publishedAssignmentIds, ...discoveredIds], nowIso(deps));
  });
}

const isPublishedIn = (doc, classId) => !!doc && typeof doc === "object" && !Array.isArray(doc) && normalizeAssignmentStatus(doc) === "published" && String(doc.classId || "") === classId && isSafeId(String(doc.assignmentId || ""));

/**
 * The currently-published assignments of each requested class, re-validated from the assignment documents.
 * Steady state (ready indexes): one index read per class + one download per pointer — NO global listing.
 * Classes whose index is missing / malformed / not ready share AT MOST ONE legacy `listJson(platform/assignments/)` for
 * the whole call; their result comes from that scan and their index is CAS-merged (best-effort: a failed bootstrap is
 * logged and simply retried by the next request).
 *
 * Returns { byClass: Map<classId, doc[]>, stats: { indexReads, globalScans, bootstrapped, bootstrapFailures,
 * assignmentDocsLoaded } }. Every list is in blob-name order (the legacy listing order).
 */
async function loadPublishedAssignmentsForClasses(container, classIds, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const ls = deps.listJson || listJson;
  const mc = deps.mapConcurrent || mapConcurrent;
  const limit = (deps.getReadConcurrency || getReadConcurrency)();
  const requested = [...new Set((Array.isArray(classIds) ? classIds : []).map(v => String(v || "")).filter(Boolean))];
  const ids = requested.filter(isSafeId), scanOnly = requested.filter(id => !isSafeId(id));   // unsafe ids: never indexed
  const stats = { indexReads: 0, globalScans: 0, bootstrapped: 0, bootstrapFailures: 0, assignmentDocsLoaded: 0 };
  const byClass = new Map(requested.map(id => [id, []]));
  if (!requested.length) return { byClass, stats };

  // An unreadable index (e.g. a corrupt document) is treated like a missing one: served from the scan, never trusted.
  const indexes = await mc(ids, limit, id => readClassIndex(container, id, { ...deps, downloadJsonOrNull: dl }).catch(() => null));
  stats.indexReads = ids.length;
  const ready = [], cold = [];
  ids.forEach((id, i) => (indexes[i] && indexes[i].ready ? ready : cold).push({ classId: id, index: indexes[i] }));

  // Ready classes: download only the named pointers and re-validate every document.
  const pointers = [];
  for (const r of ready) for (const aid of r.index.publishedAssignmentIds) pointers.push({ classId: r.classId, assignmentId: aid });
  const docs = await mc(pointers, limit, p => dl(container, ASSIGNMENT_PREFIX + p.assignmentId + ".json"));
  stats.assignmentDocsLoaded += pointers.length;
  pointers.forEach((p, i) => { const d = docs[i]; if (isPublishedIn(d, p.classId) && String(d.assignmentId) === p.assignmentId) byClass.get(p.classId).push(d); });

  // Cold classes: ONE legacy scan for all of them, then a best-effort CAS-merge bootstrap per class.
  if (cold.length || scanOnly.length) {
    const all = await ls(container, ASSIGNMENT_PREFIX);
    stats.globalScans = 1;
    stats.assignmentDocsLoaded += all.length;
    for (const classId of scanOnly) byClass.set(classId, all.filter(d => d && typeof d === "object" && normalizeAssignmentStatus(d) === "published" && String(d.classId || "") === classId));
    for (const { classId } of cold) {
      const found = all.filter(d => isPublishedIn(d, classId));
      byClass.set(classId, found);
      try { await bootstrapClassIndex(container, classId, found.map(d => String(d.assignmentId)), deps); stats.bootstrapped += 1; }
      catch {
        stats.bootstrapFailures += 1;
        try { obs?.logWarn("assignment.index.bootstrap_failed", { retryable: true }); } catch { /* inert */ }
      }
    }
  }
  for (const [classId, list] of byClass) byClass.set(classId, list.slice().sort((a, b) => byBlobName(String(a.assignmentId), String(b.assignmentId))));
  return { byClass, stats };
}

module.exports = {
  INDEX_PREFIX, SCHEMA_VERSION, isSafeId, indexName, normalizeIds, normalizeIndex,
  readClassIndex, ensurePublishedAssignmentIndexed, removePublishedAssignmentFromIndex, bootstrapClassIndex, loadPublishedAssignmentsForClasses
};
