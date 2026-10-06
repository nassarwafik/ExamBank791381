// Phase 20D.1 — the ONE canonical image-asset validator (moved verbatim from scenarioSource.ts so the 19G scenario sources AND the 20D.1
// rich-content image / figure blocks share a single authority instead of two image systems). An asset is the canonical ExamBank shape
// (examTypes.BuilderImageAsset) with exact keys: a SAFE inline raster data URL (png / jpeg / webp — never SVG, never a remote URL) for an
// uploaded / AI image, or the DURABLE bank identity whose `dataUrl`, when present, is the server-minted delivery URL. Pure, server-safe.

/** The canonical ExamBank image asset shape (examTypes.BuilderImageAsset), reused — never a second image system. */
export type ImageAssetV1 = { dataUrl?: string; id?: string; origin?: "uploaded" | "ai-generated" | "bank"; contentType?: string; blobName?: string };

export const IMAGE_ASSET_LIMITS = Object.freeze({ dataUrlChars: 4200000 });   // ≈ 3 MB of base64 raster data (the question-media upload limit) plus its header
const SAFE_RASTER_DATA_URL = /^data:image\/(png|jpe?g|webp)[;,]/i;
const DELIVERY_URL = /^\/api\/question-image\?/;
const SAFE_BLOB_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const ORIGINS = new Set(["uploaded", "ai-generated", "bank"]);
const ASSET_KEYS = new Set(["dataUrl", "id", "origin", "contentType", "blobName"]);

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const blank = (v: string) => v.trim() === "";

/** The canonical copy of a valid asset (exact keys, nothing repaired), or null. */
export function validateImageAsset(raw: unknown): ImageAssetV1 | null {
  if (!isPlain(raw)) return null;
  for (const k of Object.keys(raw)) if (!ASSET_KEYS.has(k)) return null;
  const out: ImageAssetV1 = {};
  if (own(raw, "id")) { if (!isText(raw.id, 200) || blank(raw.id)) return null; out.id = raw.id; }
  if (own(raw, "origin")) { if (typeof raw.origin !== "string" || !ORIGINS.has(raw.origin)) return null; out.origin = raw.origin as ImageAssetV1["origin"]; }
  if (own(raw, "contentType")) { if (!isText(raw.contentType, 100) || !/^image\//.test(raw.contentType)) return null; out.contentType = raw.contentType; }
  if (out.origin === "bank") {
    if (!isText(raw.blobName, 256) || !SAFE_BLOB_NAME.test(raw.blobName) || raw.blobName.includes("..") || raw.blobName.includes("//")) return null;
    out.blobName = raw.blobName;
    if (own(raw, "dataUrl")) { if (typeof raw.dataUrl !== "string" || !DELIVERY_URL.test(raw.dataUrl) || raw.dataUrl.length > 2048) return null; out.dataUrl = raw.dataUrl; }
    return out;
  }
  if (own(raw, "blobName")) return null;
  if (typeof raw.dataUrl !== "string" || !SAFE_RASTER_DATA_URL.test(raw.dataUrl) || raw.dataUrl.length > IMAGE_ASSET_LIMITS.dataUrlChars) return null;
  out.dataUrl = raw.dataUrl;
  return out;
}
