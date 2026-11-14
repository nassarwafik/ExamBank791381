// Phase F4-UI — a picked image file becomes the data URL the form route takes. Everything here is a convenience for the
// student, never protection: the server sniffs the real bytes, bounds the upload, re-encodes the image and strips its
// metadata whatever this module did (api/src/lib/profile-image.js, the evidence profile).
//
// A phone photo is often larger than the server's upload bound, so a large file is first drawn inside the same box the
// server stores (1600 px) and sent as a JPEG. When the browser cannot do that the original is sent as it is, if it fits.

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
/** The server's bound on one upload (EVIDENCE_MAX_UPLOAD_BYTES). */
export const IMAGE_MAX_BYTES = 6 * 1024 * 1024;
/** Above this a file is shrunk before it is sent; a screenshot below it travels untouched. */
export const SHRINK_OVER_BYTES = 1536 * 1024;
/** A file this large is not even opened in the page. */
export const PICK_MAX_BYTES = 40 * 1024 * 1024;
const BOX = 1600;
const TYPES = IMAGE_ACCEPT.split(",");

/** Why a file cannot be attached, in words for the student. */
export class ImageFileError extends Error {
  constructor(message: string) { super(message); this.name = "ImageFileError"; }
}

export type Shrink = (file: Blob) => Promise<Blob | null>;

// The picked file drawn inside the server's box, as a JPEG; null when this browser cannot (the caller falls back).
export const shrinkInBrowser: Shrink = async file => {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const address = URL.createObjectURL(file);
  try {
    const picture = new Image();
    picture.src = address;
    await picture.decode();
    const scale = Math.min(1, BOX / Math.max(picture.naturalWidth, picture.naturalHeight));
    if (!Number.isFinite(scale) || scale <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * scale));
    const pen = canvas.getContext("2d");
    if (!pen) return null;
    pen.fillStyle = "#fff";                       // a transparent screenshot keeps a white page under it
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(picture, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>(resolve => { canvas.toBlob(resolve, "image/jpeg", 0.9); });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(address);
  }
};

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => reject(new Error("read"));
  reader.readAsDataURL(file);
});

/** The data URL to send for one picked file, or an ImageFileError that says why it cannot be attached. */
export async function prepareImageFile(file: File, shrink: Shrink = shrinkInBrowser): Promise<string> {
  if (!TYPES.includes(file.type)) throw new ImageFileError("نوع الملف غير مدعوم. المسموح: صورة JPEG أو PNG أو WebP.");
  if (file.size > PICK_MAX_BYTES) throw new ImageFileError("الصورة كبيرة جدًا. اختر صورة أصغر.");
  let payload: Blob = file;
  if (file.size > SHRINK_OVER_BYTES) {
    const smaller = await shrink(file).catch(() => null);
    if (smaller && smaller.size > 0 && smaller.size < file.size) payload = smaller;
  }
  if (payload.size > IMAGE_MAX_BYTES) throw new ImageFileError("حجم الصورة كبير جدًا. الحد الأقصى 6 ميغابايت.");
  const dataUrl = await readAsDataUrl(payload).catch(() => "");
  if (!dataUrl) throw new ImageFileError("تعذّر قراءة الملف.");
  return dataUrl;
}
