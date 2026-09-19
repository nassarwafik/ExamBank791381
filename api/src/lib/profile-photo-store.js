// The ONE profile-photo publication / removal authority, shared by the teacher-managed student photo and the
// teacher's own photo (same image pipeline — profile-image.js — same storage rules, same cache semantics).
//
// Consistency model (review fix): the ACTIVE photo is whichever IMMUTABLE blob the CURRENT metadata document points
// to. A photo blob is never overwritten in place.
//   publish:  normalize → upload a NEW immutable blob (unreferenced so far) → CAS-commit the metadata to point at
//             exactly that blob → only then best-effort delete the previously referenced blob.
//             Metadata CAS failure ⇒ the previously published photo is untouched; the orphan is deleted best-effort;
//             the error propagates (StorageConflictError → the route's 503).
//   remove:   CAS-clear the metadata FIRST → only after success best-effort delete the blob it referenced.
//             Metadata CAS failure ⇒ old metadata + old blob remain usable.
//   serve:    authenticate (caller) → current metadata → download EXACTLY the referenced blob → serve it. The client's
//             `?v=` is cache-busting context only and never selects a blob.
// Cleanup is secondary by design: a leftover blob that no metadata references is never served and never becomes the
// active photo; a failed cleanup never alters the authoritative metadata.
//
// Persisted (internal) shape:  profilePhoto: { version, updatedAt, blobKey } + profilePhotoSeq (monotonic publication
//                              counter kept across removals so a re-published photo never reuses a cache-busting version)
// Public shape (photoMeta):     profilePhoto: { version, updatedAt }        — blobKey / storage internals never leave the API.
const crypto = require("crypto");
const { uploadBinary, downloadBinaryOrNull, deleteBlob, mutateJsonWithRetry } = require("./platform-storage");
const { decodeImageDataUrl, normalizeProfileImage } = require("./profile-image");

const LEGACY_BLOB_FILE = "current.webp";   // pre-fix layout (mutable blob); resolved only when a record carries no blobKey

/** The PUBLIC photo metadata of a document (null when no photo). Never includes the blob key. */
function photoMeta(doc) {
  const r = photoRecord(doc);
  return r ? { version: r.version, updatedAt: r.updatedAt } : null;
}

/** The INTERNAL photo record of a document: { version, updatedAt, blobKey } (blobKey "" for a legacy record) or null. */
function photoRecord(doc) {
  const p = doc && doc.profilePhoto;
  if (!p || typeof p !== "object" || !(Number(p.version) > 0)) return null;
  return { version: Number(p.version), updatedAt: String(p.updatedAt || ""), blobKey: typeof p.blobKey === "string" ? p.blobKey : "" };
}

/** The blob a record points at (legacy records without a key resolve to the old mutable name under the owner prefix). */
function resolveBlobKey(record, ownerPrefix) {
  if (!record) return "";
  return record.blobKey || (ownerPrefix + LEGACY_BLOB_FILE);
}

/** A fresh, never-reused blob name under the owner's prefix (time-ordered + random; safe under concurrency). */
function newRevisionBlobName(ownerPrefix) {
  return ownerPrefix + Date.now().toString(36) + "-" + crypto.randomBytes(12).toString("hex") + ".webp";
}

/** The next publication version: monotonic over the owner's lifetime (survives removals), never below the current record. */
function nextVersion(doc, prev) {
  const seq = Number(doc && doc.profilePhotoSeq);
  return Math.max(Number.isFinite(seq) && seq > 0 ? seq : 0, prev ? prev.version : 0) + 1;
}

async function bestEffortDelete(container, blobName, deps, obs, label) {
  if (!blobName) return false;
  try { await (deps.deleteBlob || deleteBlob)(container, blobName); return true; }
  catch (e) { obs?.logError?.(label || "profilePhoto.cleanup", e); return false; }
}

/**
 * Publish a new photo for the owner document `docName` under `ownerPrefix` (e.g. platform/student-profile-images/<id>/).
 * `prepareDoc(current)` returns the document to commit (may create it, may throw a domain error such as 404); the store
 * then sets `doc.profilePhoto = { version: previous + 1, updatedAt: now, blobKey }`. Throws ProfileImageError for bad
 * input (nothing stored), StorageConflictError / domain errors from the metadata commit (new blob cleaned up).
 * Resolves { doc, meta, record, normalized, previousBlobKey, cleanedPrevious }.
 */
async function publishProfilePhoto(container, { ownerPrefix, docName, dataUrl, now, prepareDoc }, deps = {}, obs = null) {
  const normalized = await (deps.normalizeProfileImage || normalizeProfileImage)(decodeImageDataUrl(dataUrl));
  const blobKey = newRevisionBlobName(ownerPrefix);
  await (deps.uploadBinary || uploadBinary)(container, blobKey, normalized.buffer, normalized.contentType);   // unreferenced until the commit below
  const at = now || new Date().toISOString();
  let previousBlobKey = "";
  let committed;
  try {
    committed = await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, docName, current => {
      const doc = prepareDoc ? prepareDoc(current) : current;
      const prev = photoRecord(doc);                                   // freshest document on EVERY attempt
      previousBlobKey = resolveBlobKey(prev, ownerPrefix);
      const version = nextVersion(doc, prev);
      doc.profilePhoto = { version, updatedAt: at, blobKey };
      doc.profilePhotoSeq = version;
      return doc;
    });
  } catch (e) {
    await bestEffortDelete(container, blobKey, deps, obs, "profilePhoto.orphanCleanup");   // the published photo is untouched
    throw e;
  }
  const cleanedPrevious = previousBlobKey && previousBlobKey !== blobKey ? await bestEffortDelete(container, previousBlobKey, deps, obs, "profilePhoto.previousCleanup") : false;
  return { doc: committed, meta: photoMeta(committed), record: photoRecord(committed), normalized, previousBlobKey, cleanedPrevious };
}

/**
 * Remove the owner's photo: CAS-clear the metadata (`prepareDoc` as above; `profilePhoto` becomes null, nothing else
 * — the preset avatarId is the caller's business and stays untouched) and only then best-effort delete the blob that
 * WAS referenced. Resolves { doc, previousBlobKey, cleanedPrevious }.
 */
async function removeProfilePhoto(container, { ownerPrefix, docName, prepareDoc }, deps = {}, obs = null) {
  let previousBlobKey = "";
  const committed = await (deps.mutateJsonWithRetry || mutateJsonWithRetry)(container, docName, current => {
    const doc = prepareDoc ? prepareDoc(current) : current;
    const prev = photoRecord(doc);
    // Preserve the highest known public version in the monotonic sequence BEFORE clearing the record — a legacy
    // record (no profilePhotoSeq) would otherwise let the next publication restart at v1 and reuse a cached version.
    if (prev) doc.profilePhotoSeq = nextVersion(doc, prev) - 1;
    previousBlobKey = resolveBlobKey(prev, ownerPrefix);
    doc.profilePhoto = null;
    return doc;
  });
  const cleanedPrevious = await bestEffortDelete(container, previousBlobKey, deps, obs, "profilePhoto.removeCleanup");
  return { doc: committed, previousBlobKey, cleanedPrevious };
}

/** The authenticated binary response for the photo the CURRENT record references (404 when absent). Private cache. */
async function photoResponse(container, record, ownerPrefix, deps = {}, obs = null) {
  if (!record) return { status: 404, jsonBody: { ok: false, error: "لا توجد صورة." } };
  const blob = await (deps.downloadBinaryOrNull || downloadBinaryOrNull)(container, resolveBlobKey(record, ownerPrefix));
  if (!blob) { obs?.logError?.("profilePhoto.referencedBlobMissing", new Error(resolveBlobKey(record, ownerPrefix))); return { status: 404, jsonBody: { ok: false, error: "لا توجد صورة." } }; }
  return { status: 200, body: blob.buffer, headers: { "content-type": blob.contentType || "image/webp", "cache-control": "private, max-age=3600", etag: '"v' + record.version + '"', "x-photo-version": String(record.version) } };
}

/** Every blob (any extension) under a prefix — for best-effort cleanup of an owner's whole photo namespace. */
async function listPhotoBlobNames(container, prefix) {
  const out = [];
  for await (const blob of container.listBlobsFlat({ prefix })) out.push(blob.name);
  return out;
}

/** Best-effort deletion of everything under the owner's photo prefix (account deletion). Never throws. */
async function purgeProfilePhotos(container, ownerPrefix, deps = {}, obs = null) {
  let deleted = 0;
  try {
    for (const name of await (deps.listPhotoBlobNames || listPhotoBlobNames)(container, ownerPrefix)) if (await bestEffortDelete(container, name, deps, obs, "profilePhoto.purge")) deleted += 1;
  } catch (e) { obs?.logError?.("profilePhoto.purge", e); }
  return deleted;
}

module.exports = { LEGACY_BLOB_FILE, photoMeta, photoRecord, resolveBlobKey, newRevisionBlobName, publishProfilePhoto, removeProfilePhoto, photoResponse, listPhotoBlobNames, purgeProfilePhotos };
