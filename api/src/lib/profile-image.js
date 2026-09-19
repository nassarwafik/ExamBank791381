// ONE safe image-normalization service for every personal photo on the platform (a student's teacher-managed photo
// and the teacher's own photo use the SAME path — there is no weaker one):
//   1. bound the raw upload (≤ MAX_UPLOAD_BYTES) and the data-URL transport,
//   2. sniff the real bytes — only JPEG / PNG / WebP rasters (never by extension or declared MIME; SVG, GIF, PDF,
//      HTML, text and arbitrary binary are rejected),
//   3. DECODE it (a file that merely starts with a raster signature fails here),
//   4. resize to a bounded square (≤ OUTPUT_SIZE, cover-cropped, EXIF orientation applied),
//   5. re-encode to WebP — a freshly generated raster: EXIF / GPS / device / ICC metadata never survive.
// Errors carry an httpStatus + Arabic message so the API layers map them 1:1.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;   // 3 MB original
const OUTPUT_SIZE = 512;
const OUTPUT_CONTENT_TYPE = "image/webp";
const MAX_INPUT_PIXELS = 40 * 1000 * 1000;   // decompression-bomb guard (40 MP)

class ProfileImageError extends Error {
  constructor(message, code, httpStatus = 400) { super(message); this.code = code; this.httpStatus = httpStatus; }
}

const MESSAGES = {
  TOO_LARGE: "حجم الصورة كبير جدًا. الحد الأقصى 3 ميغابايت.",
  UNSUPPORTED: "نوع الملف غير مدعوم. المسموح: JPEG أو PNG أو WebP.",
  UNDECODABLE: "تعذّر قراءة الصورة. اختر صورة صالحة بصيغة JPEG أو PNG أو WebP.",
  EMPTY: "لم يتم اختيار صورة."
};

/** The raster kind from the REAL bytes: "jpeg" | "png" | "webp" | null. */
function sniffRasterKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** A `data:image/(jpeg|png|webp);base64,…` transport string → raw bytes (bounded BEFORE decoding). */
function decodeImageDataUrl(dataUrl) {
  const text = String(dataUrl || "");
  if (!text) throw new ProfileImageError(MESSAGES.EMPTY, "EMPTY");
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(text);
  if (!m) throw new ProfileImageError(MESSAGES.UNSUPPORTED, "UNSUPPORTED");
  const b64 = m[2].replace(/\s+/g, "");
  if (b64.length > Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 4) throw new ProfileImageError(MESSAGES.TOO_LARGE, "TOO_LARGE", 413);
  const buffer = Buffer.from(b64, "base64");
  if (!buffer.length) throw new ProfileImageError(MESSAGES.EMPTY, "EMPTY");
  return buffer;
}

/** Decode → resize → re-encode. Returns { buffer, contentType, width, height, sourceKind }. */
async function normalizeProfileImage(input) {
  if (!Buffer.isBuffer(input) || !input.length) throw new ProfileImageError(MESSAGES.EMPTY, "EMPTY");
  if (input.length > MAX_UPLOAD_BYTES) throw new ProfileImageError(MESSAGES.TOO_LARGE, "TOO_LARGE", 413);
  const kind = sniffRasterKind(input);
  if (!kind) throw new ProfileImageError(MESSAGES.UNSUPPORTED, "UNSUPPORTED");
  let sharp;
  try { sharp = require("sharp"); } catch { throw new ProfileImageError("معالجة الصور غير متاحة حاليًا.", "UNAVAILABLE", 503); }
  try {
    const pipeline = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS, animated: false, pages: 1 });
    const meta = await pipeline.metadata();
    if (!meta || !["jpeg", "png", "webp"].includes(String(meta.format)) || !meta.width || !meta.height) throw new Error("not a raster");
    const buffer = await pipeline
      .rotate()                                                              // apply EXIF orientation, then drop the tag
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 })                                      // no withMetadata → EXIF/ICC/XMP stripped
      .toBuffer();
    const out = await sharp(buffer).metadata();
    return { buffer, contentType: OUTPUT_CONTENT_TYPE, width: out.width, height: out.height, sourceKind: kind };
  } catch (e) {
    if (e instanceof ProfileImageError) throw e;
    throw new ProfileImageError(MESSAGES.UNDECODABLE, "UNDECODABLE");
  }
}

module.exports = { MAX_UPLOAD_BYTES, OUTPUT_SIZE, OUTPUT_CONTENT_TYPE, ProfileImageError, MESSAGES, sniffRasterKind, decodeImageDataUrl, normalizeProfileImage };
