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
// or ready:false means "not reconciled yet" — never "no published assignments". A strict add to a not-yet-reconciled
// class creates / keeps ready:false, which claims nothing about the legacy set.
//
// MIXED-VERSION AUTHORITY (review blocker). A pre-12E-B writer that is still alive publishes WITHOUT touching the index,
// and nothing in storage lets a reader tell "that writer has finished" from "it is still running": its only trace is
// the assignment blob, which a reader cannot see without the global scan. So an index is trusted ONLY through an
// explicit storage-level authority contract:
//
//   platform/assignment-index/control.json = { schemaVersion: 1, state: "authoritative" | "migrating", epoch, updatedAt }
//
//   • MIGRATING (the default: control missing / malformed / unreadable / state !== "authoritative"): every reader uses
//     the legacy global scan — exactly the pre-12E-B read path, correct whatever code writes. No index is read or
//     written by readers. Writers still maintain pointers strictly (ensure before publish).
//   • AUTHORITATIVE: set by an explicit activation (assignment-index-control) once no pre-index writer can run any more.
//     Every activation mints a FRESH random epoch. A class index is trusted only if ready === true AND its epoch equals
//     the control epoch. The epoch is stamped only by a reconcile that read the authoritative control (that epoch)
//     BEFORE starting its global scan, so the scan began after activation and saw every legacy publish (all of them
//     committed before activation). A reconcile CAS-UNIONs the scan into the current ids, so a pointer that a new
//     writer ensured concurrently is never dropped. Indexes built before activation (any epoch, or none — e.g. by an
//     earlier build of this phase) are never trusted: the first request after activation reconciles them once.
//   • Deactivation (back to migrating) is always safe; re-activation mints a new epoch, so every index is reconciled
//     again before it is trusted.
const { downloadJsonOrNull, listJson, mutateJsonWithRetry, mapConcurrent, getReadConcurrency } = require("./platform-storage");
const { normalizeAssignmentStatus } = require("./assignment-lifecycle");
const { randomUUID } = require("node:crypto");

const INDEX_PREFIX = "platform/assignment-index/classes/";
const CONTROL_NAME = "platform/assignment-index/control.json";
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
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { classId, ready: false, epoch: "", publishedAssignmentIds: [], valid: false };
  const idsOk = Array.isArray(doc.publishedAssignmentIds);
  const valid = idsOk && String(doc.classId || "") === classId && Number(doc.schemaVersion) === SCHEMA_VERSION;
  const epoch = valid && isSafeId(doc.epoch) ? doc.epoch : "";
  return { classId, ready: valid && doc.ready === true, epoch, publishedAssignmentIds: normalizeIds(doc.publishedAssignmentIds), valid };
}
function indexDoc(classId, ready, ids, now, epoch) {
  return { schemaVersion: SCHEMA_VERSION, classId, ready: ready === true, epoch: isSafeId(epoch) ? epoch : "", publishedAssignmentIds: normalizeIds(ids), updatedAt: now || new Date().toISOString() };
}
const nowIso = deps => (deps.nowIso ? deps.nowIso() : new Date().toISOString());
const newEpoch = deps => (deps.newEpoch ? deps.newEpoch() : randomUUID());

/** Authority view of the control document: anything but a well-formed "authoritative" doc means MIGRATING. */
function normalizeControl(doc) {
  const ok = !!doc && typeof doc === "object" && !Array.isArray(doc) && Number(doc.schemaVersion) === SCHEMA_VERSION && doc.state === "authoritative" && isSafeId(doc.epoch);
  return ok ? { authoritative: true, epoch: doc.epoch } : { authoritative: false, epoch: "" };
}
/** Read the authority state. Missing, malformed or unreadable → migrating (fail-safe: readers scan). */
async function readIndexControl(container, deps = {}) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  try { return normalizeControl(await dl(container, CONTROL_NAME)); } catch { return { authoritative: false, epoch: "" }; }
}
/**
 * Explicit activation — to be issued only once no pre-index writer can run against this storage any more. Mints a
 * FRESH epoch every time (so every class index is reconciled again before it is trusted). ETag CAS; throws
 * StorageConflictError on exhaustion (the control is then unchanged).
 */
async function activateAssignmentIndex(container, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const next = await mut(container, CONTROL_NAME, () => ({ schemaVersion: SCHEMA_VERSION, state: "authoritative", epoch: newEpoch(deps), updatedAt: nowIso(deps) }));
  return normalizeControl(next);
}
/** Back to MIGRATING (always safe: readers scan again). */
async function deactivateAssignmentIndex(container, deps = {}) {
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  const next = await mut(container, CONTROL_NAME, () => ({ schemaVersion: SCHEMA_VERSION, state: "migrating", epoch: "", updatedAt: nowIso(deps) }));
  return normalizeControl(next);
}

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
    return indexDoc(classId, cur.ready, [...cur.publishedAssignmentIds, assignmentId], nowIso(deps), cur.epoch);
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
      return indexDoc(classId, cur.ready, cur.publishedAssignmentIds.filter(id => id !== assignmentId), nowIso(deps), cur.epoch);
    });
    return { removed: true, failed: false };
  } catch (e) {
    if (e === NOOP) return { removed: false, failed: false };
    try { obs?.logWarn("assignment.index.cleanup_failed", { action: String(action || ""), assignmentId, retryable: true }); } catch { /* inert */ }
    return { removed: false, failed: true };
  }
}

/**
 * Reconcile merge: current ids ∪ discovered ids, ready:true, stamped with `epoch` — the AUTHORITATIVE control epoch the
 * caller read BEFORE the scan that produced `discoveredIds`. Only ever adds (a concurrent strict add is never lost).
 */
async function bootstrapClassIndex(container, classId, discoveredIds, epoch, deps = {}) {
  if (!isSafeId(epoch)) throw new Error("A reconcile needs the authoritative epoch read before its scan.");
  const mut = deps.mutateJsonWithRetry || mutateJsonWithRetry;
  await mut(container, indexName(classId), current => {
    const cur = normalizeIndex(current, classId);
    return indexDoc(classId, true, [...cur.publishedAssignmentIds, ...discoveredIds], nowIso(deps), epoch);
  });
}

const isPublishedIn = (doc, classId) => !!doc && typeof doc === "object" && !Array.isArray(doc) && normalizeAssignmentStatus(doc) === "published" && String(doc.classId || "") === classId && isSafeId(String(doc.assignmentId || ""));

/** Authoritative attempts per request before failing safe to one legacy scan (bounded under authority churn). */
const AUTHORITY_ATTEMPTS = 3;

/**
 * The currently-published assignments of each requested class, re-validated from the assignment documents.
 *
 * MIGRATING (no authoritative control): ONE legacy `listJson(platform/assignments/)` serves every class — the
 * pre-12E-B read path, correct whatever code version publishes. No index is read or written.
 *
 * AUTHORITATIVE (control epoch E):
 *   • trusted classes (index ready AND epoch === E): one index read per class + one download per pointer — NO listing;
 *   • every other class (missing / malformed / not ready / older epoch) shares AT MOST ONE legacy scan per attempt;
 *     its result comes from that scan and its index is reconciled (CAS union, ready, epoch E — E was read BEFORE the
 *     scan). A failed reconcile is logged and retried by the next request.
 *
 * FINAL AUTHORITY VALIDATION. A result derived from epoch E is returned only if a control read taken AFTER all of its
 * index / scan work still says authoritative with the SAME epoch E. Epochs are random and never reused, so an equal
 * epoch means the authority did not change at any point in between: no deactivation (which must precede any pre-index
 * writer resuming) and no re-activation. Otherwise the result is discarded and the work is redone under the state that
 * final read returned (migrating → one legacy scan; a new epoch → a new authoritative attempt). After
 * AUTHORITY_ATTEMPTS superseded attempts the request fails safe to ONE legacy scan. Linearization: a publish or
 * authority transition that completes after the final validation may be missed by this request (it is ordered after
 * it); one that completed before it cannot be hidden by a superseded epoch.
 *
 * Returns { byClass: Map<classId, doc[]>, stats: { authoritative, authorityChanges, indexReads, globalScans,
 * bootstrapped, bootstrapFailures, assignmentDocsLoaded } }. Every list is in blob-name order (the legacy listing
 * order).
 */
async function loadPublishedAssignmentsForClasses(container, classIds, deps = {}, obs = null) {
  const dl = deps.downloadJsonOrNull || downloadJsonOrNull;
  const ls = deps.listJson || listJson;
  const mc = deps.mapConcurrent || mapConcurrent;
  const limit = (deps.getReadConcurrency || getReadConcurrency)();
  const requested = [...new Set((Array.isArray(classIds) ? classIds : []).map(v => String(v || "")).filter(Boolean))];
  const stats = { authoritative: 0, authorityChanges: 0, indexReads: 0, globalScans: 0, bootstrapped: 0, bootstrapFailures: 0, assignmentDocsLoaded: 0 };
  const done = byClass => { for (const [classId, list] of byClass) byClass.set(classId, list.slice().sort((a, b) => byBlobName(String(a.assignmentId), String(b.assignmentId)))); return { byClass, stats }; };
  if (!requested.length) return { byClass: new Map(), stats };
  const readControl = () => readIndexControl(container, { ...deps, downloadJsonOrNull: dl });

  // Legacy path (migrating, or the fail-safe): one scan serves every class; valid whatever the authority does.
  const legacy = async () => {
    const all = await ls(container, ASSIGNMENT_PREFIX);
    stats.globalScans += 1;
    stats.assignmentDocsLoaded += all.length;
    stats.authoritative = 0;
    const byClass = new Map(requested.map(classId => [classId, all.filter(d => d && typeof d === "object" && !Array.isArray(d) && normalizeAssignmentStatus(d) === "published" && String(d.classId || "") === classId)]));
    return done(byClass);
  };

  // One authoritative pass under `control` (whose epoch was read BEFORE any scan of this pass).
  const authoritativePass = async control => {
    const byClass = new Map(requested.map(id => [id, []]));
    const ids = requested.filter(isSafeId), scanOnly = requested.filter(id => !isSafeId(id));   // unsafe ids: never indexed
    // An unreadable index (e.g. a corrupt document) is treated like a missing one: served from the scan, never trusted.
    const indexes = await mc(ids, limit, id => readClassIndex(container, id, { ...deps, downloadJsonOrNull: dl }).catch(() => null));
    stats.indexReads += ids.length;
    const trusted = [], cold = [];
    ids.forEach((id, i) => (indexes[i] && indexes[i].ready && indexes[i].epoch === control.epoch ? trusted : cold).push({ classId: id, index: indexes[i] }));
    // Trusted classes: download only the named pointers and re-validate every document.
    const pointers = [];
    for (const r of trusted) for (const aid of r.index.publishedAssignmentIds) pointers.push({ classId: r.classId, assignmentId: aid });
    const docs = await mc(pointers, limit, p => dl(container, ASSIGNMENT_PREFIX + p.assignmentId + ".json"));
    stats.assignmentDocsLoaded += pointers.length;
    pointers.forEach((p, i) => { const d = docs[i]; if (isPublishedIn(d, p.classId) && String(d.assignmentId) === p.assignmentId) byClass.get(p.classId).push(d); });
    // Everything else: ONE legacy scan (started after `control` was read), then a best-effort reconcile per class
    // stamped with THAT epoch.
    if (cold.length || scanOnly.length) {
      const all = await ls(container, ASSIGNMENT_PREFIX);
      stats.globalScans += 1;
      stats.assignmentDocsLoaded += all.length;
      for (const classId of scanOnly) byClass.set(classId, all.filter(d => d && typeof d === "object" && !Array.isArray(d) && normalizeAssignmentStatus(d) === "published" && String(d.classId || "") === classId));
      for (const { classId } of cold) {
        const found = all.filter(d => isPublishedIn(d, classId));
        byClass.set(classId, found);
        try { await bootstrapClassIndex(container, classId, found.map(d => String(d.assignmentId)), control.epoch, deps); stats.bootstrapped += 1; }
        catch {
          stats.bootstrapFailures += 1;
          try { obs?.logWarn("assignment.index.bootstrap_failed", { retryable: true }); } catch { /* inert */ }
        }
      }
    }
    return byClass;
  };

  // Authority FIRST (its epoch must be known before any scan), then the work, then the FINAL validation.
  let control = await readControl();
  for (let attempt = 0; attempt < AUTHORITY_ATTEMPTS; attempt++) {
    if (!control.authoritative) return legacy();
    const byClass = await authoritativePass(control);
    const final = await readControl();
    if (final.authoritative && final.epoch === control.epoch) { stats.authoritative = 1; return done(byClass); }
    stats.authorityChanges += 1;          // superseded: discard this result, redo under the state just read
    control = final;
  }
  return legacy();                        // authority churned AUTHORITY_ATTEMPTS times: fail safe to one scan
}

module.exports = {
  INDEX_PREFIX, CONTROL_NAME, SCHEMA_VERSION, isSafeId, indexName, normalizeIds, normalizeIndex, normalizeControl,
  AUTHORITY_ATTEMPTS, readIndexControl, activateAssignmentIndex, deactivateAssignmentIndex, readClassIndex, ensurePublishedAssignmentIndexed, removePublishedAssignmentFromIndex, bootstrapClassIndex, loadPublishedAssignmentsForClasses
};
