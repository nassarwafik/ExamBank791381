// Phase 5B — Structured Exam Question Media: shared, mostly-pure helpers for authoring one illustration
// per structured question. The React editor (QuestionMediaEditor) and the tests both import these so the
// rules (allowed types, 3 MB cap, SVG sanitization, canonical replace/remove semantics, the SAFE AI request
// shape) live in exactly one place. No React here — safe to import anywhere.
//
// Model reuse (examTypes.ts): a question's authored illustration is the canonical
//   image: { exists:true, visible:true, assets:[asset] }
// and the renderer's precedence is image (when exists && visible) THEN the legacy images[] fallback. These
// helpers keep that contract: REPLACE sets the canonical image and clears the stale images[] fallback;
// REMOVE clears both so an explicit remove truly removes (an imported images[] never silently reappears).

import type { BuilderImageAsset, BuilderQuestion } from "./examTypes";

// The one uploaded-source-image size limit (matches the legacy builder). Data URLs live inline in the exam.
export const MEDIA_MAX_BYTES = 3 * 1024 * 1024;
// The four accepted upload formats. SVG is included but is sanitized as text before it is ever accepted.
export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const IMAGE_ACCEPT_ATTR = "image/png,image/jpeg,image/webp,image/svg+xml";
export const RASTER_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

// Concise Arabic UX strings (single source so component + tests agree).
export const MEDIA_MSG = {
  unsupported: "يمكن رفع صور PNG أو JPG أو WEBP أو SVG فقط.",
  tooLarge: "حجم الصورة كبير جدًا. الحد الأقصى 3 MB.",
  unsafeSvg: "ملف SVG غير آمن أو غير صالح.",
  readFail: "تعذر قراءة الصورة.",
  aiFail: "تعذر إنشاء صورة السؤال حاليًا.",
  generating: "جاري إنشاء الصورة...",
  uploading: "جاري رفع الصورة...",
  aiSuccess: "✓ تم إنشاء الصورة بنجاح.",
  uploadSuccess: "✓ تم رفع الصورة بنجاح.",
} as const;

const SVG_MAX_BYTES = MEDIA_MAX_BYTES;

// ── SVG sanitation ───────────────────────────────────────────────────────────
// SVG text is NEVER trusted. We REJECT (never silently strip) any SVG carrying active/executable content,
// then hand back a safe UTF-8 data URL that is rendered ONLY through <img src="data:image/svg+xml,…">
// (which browsers do NOT execute scripts from) — never dangerouslySetInnerHTML. Pure string analysis so it
// runs in any environment; a DOMParser check is layered on when one is available.
const SVG_DANGEROUS_ELEMENTS = ["script", "foreignobject", "iframe", "object", "embed", "animate", "set", "handler"];
// Any on* event-handler attribute (onload, onclick, onerror, …).
const SVG_EVENT_ATTR = /\son[a-z]+\s*=/i;
// javascript: (and other active) URL schemes, tolerant of whitespace/entities between characters.
const SVG_JS_SCHEME = /j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:/i;
// An external http(s) or protocol-relative resource reference in a URL-bearing attribute.
const SVG_EXTERNAL_REF = /(?:href|xlink:href|src)\s*=\s*["']?\s*(?:https?:)?\/\//i;

/** True when the SVG text is safe to embed. Rejects dangerous elements, on* handlers, javascript: URLs and
 *  external resource references, and requires a single well-formed <svg> root. */
export function isSafeSvg(text: string): boolean {
  const svg = String(text || "");
  if (!svg.trim()) return false;
  if (svg.length > SVG_MAX_BYTES) return false;
  const lower = svg.toLowerCase();
  if (!lower.includes("<svg")) return false;
  for (const el of SVG_DANGEROUS_ELEMENTS) {
    if (lower.includes("<" + el)) return false;         // opening tag of a dangerous element
  }
  if (SVG_EVENT_ATTR.test(svg)) return false;
  if (SVG_JS_SCHEME.test(svg)) return false;
  if (SVG_EXTERNAL_REF.test(svg)) return false;
  // Extra structural check when a DOMParser is available (browser / happy-dom): it must parse as XML with an
  // <svg> root and no parser error. In a DOM-less environment this is skipped (the string checks stand alone).
  const DP = (globalThis as { DOMParser?: typeof DOMParser }).DOMParser;
  if (typeof DP === "function") {
    try {
      const doc = new DP().parseFromString(svg, "image/svg+xml");
      if (doc.getElementsByTagName("parsererror").length > 0) return false;
      const root = doc.documentElement;
      if (!root || root.nodeName.toLowerCase() !== "svg") return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** A safe SVG data URL (UTF-8, URL-encoded) for a sanitized SVG string. Rendered only via <img>. */
export function svgToSafeDataUrl(text: string): string {
  return "data:image/svg+xml," + encodeURIComponent(String(text || ""));
}

export type ReadImageResult = { dataUrl: string; contentType: string; origin: "uploaded" };

/** Read + validate a local File into a safe data-url asset. Enforces the allowed MIME set and the 3 MB cap;
 *  SVG is read as text and sanitized (rejected when unsafe); raster is read as a data URL and its prefix is
 *  verified against the claimed type (never trust the extension). Rejects with a concise Arabic error. */
export function readImageFile(file: File): Promise<ReadImageResult> {
  return new Promise((resolve, reject) => {
    const contentType = String(file?.type || "").toLowerCase();
    if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(contentType)) { reject(new Error(MEDIA_MSG.unsupported)); return; }
    if (Number(file?.size || 0) > MEDIA_MAX_BYTES) { reject(new Error(MEDIA_MSG.tooLarge)); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(MEDIA_MSG.readFail));
    if (contentType === "image/svg+xml") {
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        if (!text) { reject(new Error(MEDIA_MSG.readFail)); return; }
        if (!isSafeSvg(text)) { reject(new Error(MEDIA_MSG.unsafeSvg)); return; }
        resolve({ dataUrl: svgToSafeDataUrl(text), contentType, origin: "uploaded" });
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        // Trust the decoded content type, not the filename: the data URL must declare the SAME raster MIME.
        if (!dataUrl.startsWith("data:" + contentType) || !(RASTER_MIME as readonly string[]).includes(contentType)) {
          reject(new Error(MEDIA_MSG.readFail)); return;
        }
        resolve({ dataUrl, contentType, origin: "uploaded" });
      };
      reader.readAsDataURL(file);
    }
  });
}

// ── SAFE AI request shape ─────────────────────────────────────────────────────
export type AiImageRequestQuestion = { examQuestionId: string; text: string; options?: { text?: string; value?: string; label?: string }[]; topic?: string };

/** Build the MINIMAL question payload the existing /api/generate-question-image endpoint needs
 *  (examQuestionId, text, options text/value/label, optional topic). It NEVER includes `answer`,
 *  `fields`, `parts` or any grading secret — the answer key is never sent to the image model. */
export function aiRequestQuestion(q: BuilderQuestion): AiImageRequestQuestion {
  const options = Array.isArray(q.options)
    ? q.options.map(o => ({ text: o?.text, value: o?.value, label: o?.label })).filter(o => o.text || o.value || o.label)
    : undefined;
  const topic = typeof (q as { topic?: unknown }).topic === "string" ? (q as { topic?: string }).topic : undefined;
  const out: AiImageRequestQuestion = { examQuestionId: String(q.examQuestionId || ""), text: String(q.text || "") };
  if (options && options.length) out.options = options;
  if (topic) out.topic = topic;
  return out;
}

// ── Media state helpers (pure) ────────────────────────────────────────────────
/** The asset the editor should show for a question, if any: the canonical image's first asset when it exists,
 *  else the first legacy images[] fallback asset. Ignores `visible` (the editor shows a hidden image too;
 *  only the student renderer respects visibility). Returns null when there is no image at all. */
export function currentAsset(q: BuilderQuestion | undefined): BuilderImageAsset | null {
  const img = q?.image;
  if (img && img.exists && Array.isArray(img.assets) && img.assets.length && img.assets[0]?.dataUrl) return img.assets[0];
  if (Array.isArray(q?.images) && q!.images!.length && q!.images![0]?.dataUrl) return q!.images![0];
  return null;
}
/** Whether a question currently has any renderable authored/imported image. */
export function hasImage(q: BuilderQuestion | undefined): boolean {
  return !!currentAsset(q);
}
/** Whether the current image is the canonical (exists) image and hidden (visible === false). */
export function isImageHidden(q: BuilderQuestion | undefined): boolean {
  const img = q?.image;
  return !!(img && img.exists && Array.isArray(img.assets) && img.assets.length && img.visible === false);
}

/** REPLACE: set the canonical single-asset image and clear any stale legacy images[] fallback. */
export function replaceImagePatch(asset: BuilderImageAsset): Partial<BuilderQuestion> {
  return { image: { exists: true, visible: true, assets: [asset] }, images: [] };
}
/** REMOVE: clear the canonical image AND the legacy fallback so an explicit remove truly removes. */
export function removeImagePatch(): Partial<BuilderQuestion> {
  return { image: { exists: false, visible: false, assets: [] }, images: [] };
}
/** Hide/show the question's image. The renderer falls back to the legacy images[] whenever the canonical
 *  image is absent OR hidden, so visibility can only be honored on the canonical image: a legacy
 *  images[]-only question is PROMOTED (its assets, bytes kept, become the canonical image) and images[] is
 *  cleared — otherwise "hide" would leave the legacy image visible to students. A canonical image keeps its
 *  own assets; any shadowed images[] fallback (never shown alongside it) is cleared for the same reason.
 *  Show restores the same assets. No image at all → empty patch (no-op). */
export function setVisibilityPatch(q: BuilderQuestion, visible: boolean): Partial<BuilderQuestion> {
  const img = q?.image;
  const canonical = img && img.exists && Array.isArray(img.assets) && img.assets.length && img.assets[0]?.dataUrl ? img.assets : null;
  const legacy = Array.isArray(q?.images) ? q.images.filter(a => a?.dataUrl).map(a => ({ ...a })) : [];
  const assets = canonical || legacy;
  if (!assets.length) return {};
  return { image: { exists: true, visible, assets }, images: [] };
}

/** A generated asset may replace the current image only when it carries an EMBEDDED raster image
 *  (data:image/png|jpeg|webp;base64,…) — never a remote URL or an empty result. */
export function isEmbeddedRasterDataUrl(url: unknown): boolean {
  return typeof url === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(url);
}
