// Tadris+ P9-B3 — the image types the platform stores and serves from the `assets` container (security review: a browser-declared
// type was stored and replayed, so `text/html` could be served on the app's origin). A type is judged by its media type only
// (parameters and case ignored). EVERY `image/*` type is an image here — the import pipelines keep the type the source file declared
// (`image/jpg`, `image/bmp`, `image/x-icon` …), so a narrower list would stop real, already stored images from showing (Review Fix 1).
// What makes an image safe is how it is SERVED: `nosniff` and a policy that allows nothing (an SVG runs no script). Anything that is
// not `image/*` is stored as an opaque `application/octet-stream` and served as a download, never rendered.
const IMAGE_TYPES = Object.freeze({ "image/png": "png", "image/jpeg": "jpeg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" });

/** The `image/*` media type of `value` (lower case, no parameters), or null for anything else. */
function allowedImageType(value) {
  const media = String(value || "").split(";")[0].trim().toLowerCase();
  return /^image\/[a-z0-9][a-z0-9.+-]{0,63}$/.test(media) ? media : null;
}
/** The file extension for an image type (the known ones by name, any other from its subtype's letters and digits), "bin" otherwise. */
const imageExtension = value => {
  const t = allowedImageType(value);
  if (!t) return "bin";
  return IMAGE_TYPES[t] || t.slice("image/".length).replace(/[^a-z0-9]/g, "") || "bin";
};

// Served with every image: no sniffing, and a policy that allows nothing (an SVG opened directly runs no script, loads nothing).
const IMAGE_SAFETY_HEADERS = Object.freeze({ "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" });

module.exports = { IMAGE_TYPES, allowedImageType, imageExtension, IMAGE_SAFETY_HEADERS };
