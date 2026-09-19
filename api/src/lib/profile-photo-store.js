// Shared photo storage on top of the ONE image pipeline (profile-image.js): the student's teacher-managed photo and
// the teacher's own photo both go through `storeProfilePhoto` / `removeProfilePhoto` / `photoResponse` — identical
// validation, normalization, blob handling and cache semantics. Callers own authorization and the metadata document.
const { uploadBinary, downloadBinaryOrNull, deleteBlob } = require("./platform-storage");
const { decodeImageDataUrl, normalizeProfileImage } = require("./profile-image");

/** The public photo metadata of a document (null when no photo). */
function photoMeta(doc) {
  const p = doc && doc.profilePhoto;
  return p && typeof p === "object" && Number(p.version) > 0 ? { version: Number(p.version), updatedAt: String(p.updatedAt || "") } : null;
}

/** Decode the transport → normalize → store the derivative. Throws ProfileImageError on bad input. */
async function storeProfilePhoto(container, blobName, dataUrl, deps = {}) {
  const normalized = await (deps.normalizeProfileImage || normalizeProfileImage)(decodeImageDataUrl(dataUrl));
  await (deps.uploadBinary || uploadBinary)(container, blobName, normalized.buffer, normalized.contentType);
  return normalized;
}

async function removeProfilePhoto(container, blobName, deps = {}) {
  await (deps.deleteBlob || deleteBlob)(container, blobName);
}

/** The authenticated binary response for a stored photo (404 when absent). Private cache, version-tagged. */
async function photoResponse(container, blobName, meta, deps = {}) {
  if (!meta) return { status: 404, jsonBody: { ok: false, error: "لا توجد صورة." } };
  const blob = await (deps.downloadBinaryOrNull || downloadBinaryOrNull)(container, blobName);
  if (!blob) return { status: 404, jsonBody: { ok: false, error: "لا توجد صورة." } };
  return { status: 200, body: blob.buffer, headers: { "content-type": blob.contentType || "image/webp", "cache-control": "private, max-age=3600", etag: '"v' + meta.version + '"', "x-photo-version": String(meta.version) } };
}

module.exports = { photoMeta, storeProfilePhoto, removeProfilePhoto, photoResponse };
