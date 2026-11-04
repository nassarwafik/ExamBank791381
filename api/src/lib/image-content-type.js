// Tadris+ P9-B3 — the ONE allow-list of image types the platform stores and serves from the `assets` container (security review:
// a browser-declared type was stored and replayed, so `text/html` could be served on the app's origin). A type is judged by its
// media type only (parameters and case ignored); anything else is not an image here: stored as an opaque `application/octet-stream`
// and served as a download, never rendered.
const IMAGE_TYPES = Object.freeze({ "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" });

/** The allow-listed media type of `value` (lower case, no parameters), or null. */
function allowedImageType(value) {
  const media = String(value || "").split(";")[0].trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(media) && Object.prototype.hasOwnProperty.call(IMAGE_TYPES, media) ? media : null;
}
/** The file extension for an allow-listed type ("bin" otherwise). */
const imageExtension = value => { const t = allowedImageType(value); return t ? IMAGE_TYPES[t] : "bin"; };

// Served with every image: no sniffing, and a policy that allows nothing (an SVG opened directly runs no script, loads nothing).
const IMAGE_SAFETY_HEADERS = Object.freeze({ "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" });

module.exports = { IMAGE_TYPES, allowedImageType, imageExtension, IMAGE_SAFETY_HEADERS };
