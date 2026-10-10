// Phase 21D-B.1 — MeshModelSpecV1: the versioned exam contract of a realistic 3D mesh model (pure; shared server build).
//
// The exam JSON never carries geometry, binary data, URLs or renderer state. It carries a STABLE ASSET REFERENCE and the teacher's
// educational layer:
//   • asset: { source: "library", id, version, sha256 }  — a reviewed asset of the code-owned library (provenance + licence recorded), or
//            { source: "upload", sha256, byteLength }      — a teacher upload validated by the server and stored content-addressed;
//   • parts: the named parts of the asset the teacher labels (Arabic label + optional description) — the student-facing vocabulary and,
//            for questions, the only selectable targets;
//   • controls: what the student may do (rotate / zoom / hide parts); camera: the authored starting view.
// The runtime URL is DERIVED from the hash by code (`meshAssetUrl`), so no exam can point the browser at another host or path, and the
// browser verifies the downloaded bytes against the pinned SHA-256 before parsing them. Validation is strict (exact keys at every level,
// bounded text with no markup / control / bidi / invisible characters, ASCII identifiers) and never throws; a problem is refused with a
// reason, never repaired.
import { CONTROL, RAW_HTML, UNSAFE_BIDI, UNSAFE_INVISIBLE } from "../richContent/proseGuard";
import { MESH_ASSET_LIMITS, isMeshPartId } from "./glbAsset";
import { MESH_LIBRARY, meshLibraryAsset, type MeshLibraryAsset } from "./meshAssetCatalog";

export const MESH_MODEL_VERSION = 1;
export const MESH_MODEL_LIMITS = Object.freeze({
  titleChars: 160, descriptionChars: 600, labelChars: 60, partDescriptionChars: 300, partsMin: 1, partsMax: MESH_ASSET_LIMITS.maxParts,
  azimuthAbs: Math.PI, pitchAbs: 1.45, zoomMin: 0.6, zoomMax: 3
});
export const DEFAULT_MESH_CAMERA = Object.freeze({ azimuth: 0, elevation: 0.2, zoom: 1 });

export type MeshAssetRef = { source: "library"; id: string; version: number; sha256: string } | { source: "upload"; sha256: string; byteLength: number };
export type MeshModelPartV1 = { id: string; label: string; description?: string };
export type MeshModelControls = { rotate: boolean; zoom: boolean; hideParts: boolean };
export type MeshModelCamera = { azimuth: number; elevation: number; zoom: number };
export type MeshModelSpecV1 = {
  version: 1; id: string; title: string; description: string; asset: MeshAssetRef; parts: MeshModelPartV1[];
  controls: MeshModelControls; camera?: MeshModelCamera;
};
export type MeshModelIssue = { code: string; path: string; message: string };
export type MeshModelResult = { ok: true; value: MeshModelSpecV1; library: MeshLibraryAsset | null; issues: [] } | { ok: false; issues: MeshModelIssue[] };
export type MeshModelOptions = { library?: readonly MeshLibraryAsset[] };

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const RESERVED = ["__proto__", "constructor", "prototype"];
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
export const isMeshModelId = (v: unknown): v is string => typeof v === "string" && ID.test(v) && !RESERVED.includes(v);
export const isSha256Hex = (v: unknown): v is string => typeof v === "string" && HEX64.test(v);

/** The ONLY way a runtime URL is produced: same-origin, from a validated hash (never from exam text). */
export function meshAssetUrl(ref: MeshAssetRef): string | null {
  if (!isSha256Hex(ref.sha256)) return null;
  return ref.source === "library" ? "/mesh-assets/" + ref.sha256 + ".glb" : "/api/mesh-assets/runtime/" + ref.sha256;
}

function validate(raw: unknown, library: readonly MeshLibraryAsset[]): MeshModelResult {
  const issues: MeshModelIssue[] = [];
  const fail = (code: string, path: string, message: string) => { if (issues.length < 20) issues.push({ code, path, message }); };
  const object = (o: unknown, path: string, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null => {
    if (!isPlain(o)) { fail("MESH_MODEL_OBJECT_INVALID", path, "مطلوب كائن بيانات عادي."); return null; }
    for (const k of Object.keys(o)) if (!keys.includes(k)) fail("MESH_MODEL_UNKNOWN_KEY", path + "." + k, "حقل غير مسموح في النموذج ثلاثي الأبعاد: " + k.slice(0, 32));
    for (const k of keys) if (!optional.includes(k) && !own(o, k)) fail("MESH_MODEL_MISSING_KEY", path + "." + k, "حقل مطلوب مفقود: " + k);
    return o;
  };
  const text = (v: unknown, path: string, max: number): string | null => {
    if (typeof v !== "string" || !v.trim() || v.length > max || CONTROL.test(v) || RAW_HTML.test(v) || UNSAFE_BIDI.test(v) || UNSAFE_INVISIBLE.test(v)) {
      fail("MESH_MODEL_TEXT_INVALID", path, "النص فارغ أو أطول من " + max + " محرفًا أو يتضمن علامات غير مسموحة."); return null;
    }
    return v;
  };
  const bool = (v: unknown, path: string): boolean | null => (typeof v === "boolean" ? v : (fail("MESH_MODEL_FLAG_INVALID", path, "القيمة يجب أن تكون صحيحًا أو خطأً."), null));
  const number = (v: unknown, path: string, lo: number, hi: number): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) { fail("MESH_MODEL_NUMBER_INVALID", path, "قيمة عددية خارج الحدود المسموحة (" + lo.toFixed(2) + " … " + hi.toFixed(2) + ")."); return null; }
    return v === 0 ? 0 : v;
  };

  const top = object(raw, "model", ["version", "id", "title", "description", "asset", "parts", "controls", "camera"], ["camera"]);
  if (!top) return { ok: false, issues };
  if (top.version !== MESH_MODEL_VERSION) fail("MESH_MODEL_VERSION_INVALID", "model.version", "إصدار نموذج ثلاثي الأبعاد غير مدعوم.");
  const id = isMeshModelId(top.id) ? top.id : (fail("MESH_MODEL_ID_INVALID", "model.id", "معرّف النموذج غير صالح (حرف لاتيني أولًا، حتى 48 محرفًا)."), null);
  const title = text(top.title, "model.title", MESH_MODEL_LIMITS.titleChars);
  const description = text(top.description, "model.description", MESH_MODEL_LIMITS.descriptionChars);

  // asset reference: library (id, version, sha256 must match the reviewed entry) or a server-validated upload (sha256, byteLength)
  let asset: MeshAssetRef | null = null, entry: MeshLibraryAsset | null = null;
  if (isPlain(top.asset) && top.asset.source === "library") {
    const a = object(top.asset, "model.asset", ["source", "id", "version", "sha256"]);
    if (a) {
      const aid = isMeshModelId(a.id) ? a.id : (fail("MESH_MODEL_ASSET_INVALID", "model.asset.id", "معرّف أصل المكتبة غير صالح."), null);
      const ver = typeof a.version === "number" && Number.isInteger(a.version) && a.version >= 1 && a.version <= 1000 ? a.version : (fail("MESH_MODEL_ASSET_INVALID", "model.asset.version", "إصدار أصل المكتبة غير صالح."), null);
      const sha = isSha256Hex(a.sha256) ? a.sha256 : (fail("MESH_MODEL_ASSET_INVALID", "model.asset.sha256", "بصمة SHA-256 غير صالحة (64 محرفًا ست عشريًا صغيرًا)."), null);
      if (aid && ver && sha) {
        const found = meshLibraryAsset(library, aid, ver);
        if (!found) fail("MESH_MODEL_ASSET_UNKNOWN", "model.asset", "النموذج غير موجود في مكتبة النماذج المعتمدة: " + aid + " v" + ver);
        else if (found.sha256 !== sha) fail("MESH_MODEL_ASSET_HASH_MISMATCH", "model.asset.sha256", "بصمة الملف لا تطابق النسخة المعتمدة من المكتبة.");
        else { entry = found; asset = { source: "library", id: aid, version: ver, sha256: sha }; }
      }
    }
  } else if (isPlain(top.asset) && top.asset.source === "upload") {
    const a = object(top.asset, "model.asset", ["source", "sha256", "byteLength"]);
    if (a) {
      const sha = isSha256Hex(a.sha256) ? a.sha256 : (fail("MESH_MODEL_ASSET_INVALID", "model.asset.sha256", "بصمة SHA-256 غير صالحة (64 محرفًا ست عشريًا صغيرًا)."), null);
      const len = typeof a.byteLength === "number" && Number.isInteger(a.byteLength) && a.byteLength >= 20 && a.byteLength <= MESH_ASSET_LIMITS.maxBytes ? a.byteLength : (fail("MESH_MODEL_ASSET_INVALID", "model.asset.byteLength", "حجم ملف النموذج غير صالح."), null);
      if (sha && len) asset = { source: "upload", sha256: sha, byteLength: len };
    }
  } else fail("MESH_MODEL_ASSET_INVALID", "model.asset", "مصدر النموذج يجب أن يكون مكتبة النماذج المعتمدة أو ملفًا رفعه المعلم وتحقق منه الخادم.");

  // parts: the labelled, student-facing vocabulary (unique ids; for a library asset, every id must exist in the reviewed file)
  const parts: MeshModelPartV1[] = [];
  if (!Array.isArray(top.parts) || top.parts.length < MESH_MODEL_LIMITS.partsMin || top.parts.length > MESH_MODEL_LIMITS.partsMax) {
    fail("MESH_MODEL_PARTS_COUNT", "model.parts", "يضم النموذج من " + MESH_MODEL_LIMITS.partsMin + " إلى " + MESH_MODEL_LIMITS.partsMax + " جزءًا مسمّى.");
  } else {
    const seen = new Set<string>();
    top.parts.forEach((p, i) => {
      const at = "model.parts[" + i + "]", o = object(p, at, ["id", "label", "description"], ["description"]);
      if (!o) return;
      const pid = isMeshPartId(o.id) ? o.id : (fail("MESH_MODEL_PART_ID_INVALID", at + ".id", "معرّف الجزء غير صالح."), null);
      if (pid && seen.has(pid)) fail("MESH_MODEL_PART_DUPLICATE", at + ".id", "جزء مكرر: " + pid);
      if (pid) seen.add(pid);
      if (pid && entry && !entry.parts.some(x => x.id === pid)) fail("MESH_MODEL_PART_UNKNOWN", at + ".id", "الجزء «" + pid + "» غير موجود في ملف النموذج.");
      const label = text(o.label, at + ".label", MESH_MODEL_LIMITS.labelChars);
      const desc = own(o, "description") ? text(o.description, at + ".description", MESH_MODEL_LIMITS.partDescriptionChars) : undefined;
      if (pid && label && desc !== null) parts.push({ id: pid, label, ...(desc ? { description: desc } : {}) });
    });
  }
  const cr = object(top.controls, "model.controls", ["rotate", "zoom", "hideParts"]);
  let controls: MeshModelControls | null = null;
  if (cr) {
    const rotate = bool(cr.rotate, "model.controls.rotate"), zoom = bool(cr.zoom, "model.controls.zoom"), hideParts = bool(cr.hideParts, "model.controls.hideParts");
    if (rotate !== null && zoom !== null && hideParts !== null) controls = { rotate, zoom, hideParts };
  }
  let camera: MeshModelCamera | undefined;
  if (own(top, "camera")) {
    const c = object(top.camera, "model.camera", ["azimuth", "elevation", "zoom"]);
    if (c) {
      const azimuth = number(c.azimuth, "model.camera.azimuth", -MESH_MODEL_LIMITS.azimuthAbs, MESH_MODEL_LIMITS.azimuthAbs);
      const elevation = number(c.elevation, "model.camera.elevation", -MESH_MODEL_LIMITS.pitchAbs, MESH_MODEL_LIMITS.pitchAbs);
      const zoom = number(c.zoom, "model.camera.zoom", MESH_MODEL_LIMITS.zoomMin, MESH_MODEL_LIMITS.zoomMax);
      if (azimuth !== null && elevation !== null && zoom !== null) camera = { azimuth, elevation, zoom };
    }
  }
  if (issues.length || !id || !title || !description || !asset || !controls || !parts.length) return { ok: false, issues: issues.length ? issues : [{ code: "MESH_MODEL_INVALID", path: "model", message: "النموذج ثلاثي الأبعاد غير صالح." }] };
  return { ok: true, value: { version: MESH_MODEL_VERSION, id, title, description, asset, parts, controls, ...(camera ? { camera } : {}) }, library: entry, issues: [] };
}

/** Never throws for malformed, hostile or unsupported input; a canonical copy (fixed key order, no foreign field) is emitted on success. */
export function validateMeshModelSpec(raw: unknown, options: MeshModelOptions = {}): MeshModelResult {
  try { return validate(raw, options.library ?? MESH_LIBRARY); }
  catch { return { ok: false, issues: [{ code: "MESH_MODEL_INVALID", path: "model", message: "تعذر التحقق من النموذج ثلاثي الأبعاد." }] }; }
}

/** Labelled parts that the loaded asset does not contain (an upload is checked when its bytes are inspected — in the browser before
 *  drawing, and by the server before a question that uses it is published). */
export const meshModelMissingParts = (spec: MeshModelSpecV1, assetPartIds: readonly string[]): string[] => spec.parts.map(p => p.id).filter(id => !assetPartIds.includes(id));

/** Plain text of a model (search, accessibility summaries). */
export const meshModelPlainText = (s: MeshModelSpecV1): string => [s.title, s.description, ...s.parts.map(p => p.label + (p.description ? ": " + p.description : ""))].join("\n");
