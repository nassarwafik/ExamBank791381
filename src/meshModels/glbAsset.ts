// Phase 21D-B.1 — the ONE GLB 2.0 authority of ExamBank's mesh models (pure; shared server build).
//
// A mesh asset is DATA, never code. Only the self-contained binary container (GLB 2.0: a JSON chunk + one BIN chunk) is accepted, and
// only the subset of glTF 2.0 the owned WebGL renderer draws: triangle meshes (POSITION, optional NORMAL / TEXCOORD_0 / TANGENT),
// metallic-roughness materials, PNG / JPEG textures embedded in the BIN chunk, and a node tree whose mesh-bearing nodes are the
// model's NAMED PARTS. Everything else is refused with a reason, never ignored or repaired:
//   • no `uri` anywhere (no external file, no http(s), no data: URL, no relative path): nothing outside the uploaded bytes is ever loaded;
//   • no extensions (`extensionsUsed` / `extensionsRequired` / `extensions`) and no `extras`: no decoder, no worker, no vendor payload;
//   • no animations, skins, morph targets, cameras, sparse accessors or non-triangle primitives;
//   • every accessor, buffer view, index and image is bounds-checked against the bytes actually present; every index is < its vertex
//     count; every position / normal / transform is finite; the node graph is a forest (no cycle, one parent per node);
//   • image bytes must match their declared PNG / JPEG signature; dimensions are read from the header (never decoded here) and bounded;
//   • size, triangle, vertex, part, material and texture budgets bound CPU and GPU memory (MESH_ASSET_LIMITS).
// The same function runs on the server at upload (authoritative) and in the browser before anything reaches the GPU (defence in depth).
// It never throws; the first refusal is returned with its code, path and an Arabic reason for the teacher. On success it returns a
// normalised document (tightly packed copies, world transforms resolved) and a summary.

import { CONTROL, UNSAFE_BIDI, UNSAFE_INVISIBLE } from "../richContent/proseGuard";

export const MESH_ASSET_LIMITS = Object.freeze({
  maxBytes: 16 * 1024 * 1024,
  maxJsonBytes: 2 * 1024 * 1024,
  maxTriangles: 400_000,
  maxVertices: 400_000,
  maxParts: 64,
  maxNodes: 512,
  maxNodeDepth: 16,
  maxMeshes: 128,
  maxPrimitives: 256,
  maxAccessors: 2048,
  maxBufferViews: 2048,
  maxMaterials: 32,
  maxTextures: 16,
  maxImages: 8,
  maxImageSide: 2048,
  maxTexturePixels: 4 * 2048 * 2048,
  nameChars: 64,
  generatorChars: 200
});

export type MeshAssetLimits = { [K in keyof typeof MESH_ASSET_LIMITS]: number };
export const MESH_PART_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
const RESERVED = ["__proto__", "constructor", "prototype"];
export const isMeshPartId = (v: unknown): v is string => typeof v === "string" && MESH_PART_ID.test(v) && !RESERVED.includes(v);

export type MeshAssetIssue = { code: string; path: string; message: string };
export type Vec3 = [number, number, number];
export type MeshBounds = { min: Vec3; max: Vec3 };
export type MeshPrimitive = { positions: Float32Array; normals: Float32Array | null; uvs: Float32Array | null; indices: Uint16Array | Uint32Array; material: number; vertices: number; triangles: number };
/** A named part: one mesh-bearing node, its world transform (column-major) and its primitives. */
export type MeshPart = { id: string; matrix: Float32Array; primitives: MeshPrimitive[]; bounds: MeshBounds; triangles: number; vertices: number };
export type MeshTextureRef = { texture: number };
export type MeshMaterial = {
  name: string; baseColor: [number, number, number, number]; metallic: number; roughness: number; emissive: Vec3;
  baseColorTexture: number; metallicRoughnessTexture: number; normalTexture: number; normalScale: number; occlusionTexture: number; occlusionStrength: number; emissiveTexture: number;
  alphaMode: "OPAQUE" | "MASK" | "BLEND"; alphaCutoff: number; doubleSided: boolean;
};
export type MeshSampler = { magFilter: number; minFilter: number; wrapS: number; wrapT: number };
export type MeshImage = { mimeType: "image/png" | "image/jpeg"; bytes: Uint8Array; width: number; height: number };
export type MeshTexture = { image: number; sampler: MeshSampler };
export type MeshDocument = { parts: MeshPart[]; materials: MeshMaterial[]; textures: MeshTexture[]; images: MeshImage[]; bounds: MeshBounds; triangles: number; vertices: number };
export type MeshAssetSummary = {
  byteLength: number; triangles: number; vertices: number; materials: number; textures: number; texturePixels: number; bounds: MeshBounds;
  parts: { id: string; triangles: number; vertices: number; bounds: MeshBounds }[]; generator?: string; copyright?: string;
};
export type MeshAssetReport = { ok: true; summary: MeshAssetSummary; document: MeshDocument; issues: [] } | { ok: false; issues: MeshAssetIssue[] };
export type MeshAssetOptions = { limits?: Partial<MeshAssetLimits> };

const GLB_MAGIC = 0x46546c67, CHUNK_JSON = 0x4e4f534a, CHUNK_BIN = 0x004e4942;
const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const MAG_FILTERS = [9728, 9729], MIN_FILTERS = [9728, 9729, 9984, 9985, 9986, 9987], WRAPS = [33071, 33648, 10497];
const DEFAULT_SAMPLER: MeshSampler = { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const NAME_EXTRA = /[\t\n\r<>]/;
const unsafeName = (v: string) => CONTROL.test(v) || UNSAFE_BIDI.test(v) || UNSAFE_INVISIBLE.test(v) || NAME_EXTRA.test(v);

class Refusal extends Error { readonly issue: MeshAssetIssue; constructor(issue: MeshAssetIssue) { super(issue.code); this.issue = issue; } }

const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const isIndex = (v: unknown, length: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < length;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Header dimensions of a PNG / JPEG image without decoding it (null when the bytes do not match the declared format). */
export function sniffImage(bytes: Uint8Array, mimeType: string): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    if (bytes.length < 33 || PNG_SIG.some((b, i) => bytes[i] !== b)) return null;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(8) !== 13 || String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== "IHDR") return null;
    const width = dv.getUint32(16), height = dv.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (mimeType === "image/jpeg") {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
    let i = 2;
    for (let guard = 0; guard < 4096 && i + 4 <= bytes.length; guard++) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      if (marker === 0xd9 || marker === 0xda) return null;                              // end of image / scan before any frame header
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2 || i + 2 + len > bytes.length) return null;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        if (len < 7) return null;
        const height = (bytes[i + 5] << 8) | bytes[i + 6], width = (bytes[i + 7] << 8) | bytes[i + 8];
        return width > 0 && height > 0 ? { width, height } : null;
      }
      i += 2 + len;
    }
    return null;
  }
  return null;
}

/** Strict UTF-8 → string (null on any invalid, overlong, surrogate or truncated sequence). Environment-neutral: the shared server build
 *  has no DOM TextDecoder. */
export function decodeUtf8Strict(b: Uint8Array): string | null {
  let out = "", chunk: number[] = [];
  for (let i = 0; i < b.length;) {
    const c = b[i];
    let cp: number, n: number;
    if (c < 0x80) { cp = c; n = 1; }
    else if (c >= 0xc2 && c <= 0xdf) { cp = c & 0x1f; n = 2; }
    else if (c >= 0xe0 && c <= 0xef) { cp = c & 0x0f; n = 3; }
    else if (c >= 0xf0 && c <= 0xf4) { cp = c & 0x07; n = 4; }
    else return null;
    if (i + n > b.length) return null;
    for (let k = 1; k < n; k++) { const d = b[i + k]; if ((d & 0xc0) !== 0x80) return null; cp = (cp << 6) | (d & 0x3f); }
    if ((n === 3 && (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff))) || (n === 4 && (cp < 0x10000 || cp > 0x10ffff))) return null;
    if (cp > 0xffff) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); } else chunk.push(cp);
    if (chunk.length >= 8192) { out += String.fromCharCode(...chunk); chunk = []; }
    i += n;
  }
  return out + String.fromCharCode(...chunk);
}

// ── column-major 4×4 helpers (world transforms of the node tree) ────────────────────────────────────────────────────────────────────
const IDENTITY = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function composeTRS(t: Vec3, q: [number, number, number, number], s: Vec3): Float32Array {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return new Float32Array([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ]);
}
const transformPoint = (m: Float32Array, x: number, y: number, z: number): Vec3 => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function inspect(bytes: Uint8Array, L: MeshAssetLimits): MeshAssetReport {
  const refuse = (code: string, path: string, message: string): never => { throw new Refusal({ code, path, message }); };

  // ── container ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (!(bytes instanceof Uint8Array)) refuse("MESH_ASSET_NOT_BINARY", "glb", "الملف ليس بيانات ثنائية.");
  if (bytes.length > L.maxBytes) refuse("MESH_ASSET_TOO_LARGE", "glb", "حجم النموذج يتجاوز " + Math.floor(L.maxBytes / (1024 * 1024)) + " MB.");
  if (bytes.length < 20) refuse("MESH_ASSET_HEADER", "glb", "الملف ليس نموذج GLB صالحًا (رأس الملف ناقص).");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) refuse("MESH_ASSET_HEADER", "glb", "الملف ليس بصيغة GLB (glTF ثنائي).");
  if (dv.getUint32(4, true) !== 2) refuse("MESH_ASSET_VERSION", "glb.version", "يُقبل glTF 2.0 فقط.");
  if (dv.getUint32(8, true) !== bytes.length) refuse("MESH_ASSET_LENGTH", "glb.length", "طول الملف المعلن لا يطابق حجمه الفعلي.");
  const jsonLength = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== CHUNK_JSON) refuse("MESH_ASSET_CHUNK", "glb.chunks[0]", "أول جزء في الملف يجب أن يكون JSON.");
  if (jsonLength === 0 || jsonLength % 4 !== 0 || 20 + jsonLength > bytes.length) refuse("MESH_ASSET_CHUNK", "glb.chunks[0]", "جزء JSON تالف.");
  if (jsonLength > L.maxJsonBytes) refuse("MESH_ASSET_TOO_LARGE", "glb.chunks[0]", "وصف النموذج (JSON) أكبر من المسموح.");
  let bin: Uint8Array | null = null;
  let offset = 20 + jsonLength;
  if (offset < bytes.length) {
    if (offset + 8 > bytes.length) refuse("MESH_ASSET_CHUNK", "glb.chunks[1]", "جزء البيانات الثنائية تالف.");
    const binLength = dv.getUint32(offset, true), binType = dv.getUint32(offset + 4, true);
    if (binType !== CHUNK_BIN) refuse("MESH_ASSET_CHUNK", "glb.chunks[1]", "جزء غير معروف في الملف.");
    if (binLength % 4 !== 0 || offset + 8 + binLength > bytes.length) refuse("MESH_ASSET_CHUNK", "glb.chunks[1]", "جزء البيانات الثنائية تالف.");
    bin = bytes.subarray(offset + 8, offset + 8 + binLength);
    offset += 8 + binLength;
  }
  if (offset !== bytes.length) refuse("MESH_ASSET_CHUNK", "glb", "يحتوي الملف بيانات إضافية غير مسموحة بعد أجزائه.");
  let gltf: unknown;
  const jsonText = decodeUtf8Strict(bytes.subarray(20, 20 + jsonLength));
  if (jsonText === null) refuse("MESH_ASSET_JSON", "glb.json", "وصف النموذج ليس نصًا صالحًا بترميز UTF-8.");
  try { gltf = JSON.parse(jsonText as string); }
  catch { refuse("MESH_ASSET_JSON", "glb.json", "وصف النموذج ليس JSON صالحًا."); }

  // ── strict document shape ──────────────────────────────────────────────────────────────────────────────────────────────────────
  const object = (v: unknown, path: string, keys: readonly string[], required: readonly string[] = []): Record<string, unknown> => {
    if (!isPlain(v)) refuse("MESH_ASSET_SHAPE", path, "بنية غير صالحة في وصف النموذج.");
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (k === "extensions" || k === "extras") refuse("MESH_ASSET_EXTENSION", path + "." + k, "الامتدادات والبيانات الإضافية (extensions / extras) غير مسموحة.");
      if (k === "uri") refuse("MESH_ASSET_EXTERNAL_REFERENCE", path + ".uri", "مرجع خارجي (uri) غير مسموح: يجب أن يكون كل محتوى النموذج داخل ملف GLB نفسه.");
      if (!keys.includes(k)) refuse("MESH_ASSET_UNSUPPORTED", path + "." + k, "ميزة غير مدعومة في النموذج: " + k.slice(0, 32));
    }
    for (const k of required) if (!Object.prototype.hasOwnProperty.call(o, k)) refuse("MESH_ASSET_SHAPE", path + "." + k, "حقل مطلوب مفقود: " + k);
    return o;
  };
  const list = (v: unknown, path: string, max: number, min = 0): unknown[] => {
    if (v === undefined && min === 0) return [];
    if (!Array.isArray(v) || v.length < min) refuse("MESH_ASSET_SHAPE", path, "قائمة مطلوبة مفقودة أو فارغة.");
    if ((v as unknown[]).length > max) refuse("MESH_ASSET_LIMIT", path, "عدد العناصر أكبر من المسموح (" + max + ").");
    return v as unknown[];
  };
  const name = (v: unknown, path: string): string => {
    if (v === undefined) return "";
    if (typeof v !== "string" || v.length > L.nameChars || unsafeName(v)) refuse("MESH_ASSET_NAME", path, "اسم غير صالح في النموذج (حتى " + L.nameChars + " محرفًا، دون رموز تحكم).");
    return v as string;
  };
  const root = object(gltf, "gltf", ["asset", "scene", "scenes", "nodes", "meshes", "accessors", "bufferViews", "buffers", "materials", "textures", "images", "samplers", "extensionsUsed", "extensionsRequired"], ["asset", "meshes", "accessors", "bufferViews", "buffers", "nodes"]);
  if (root.extensionsUsed !== undefined || root.extensionsRequired !== undefined) {
    if ((Array.isArray(root.extensionsUsed) && root.extensionsUsed.length) || (Array.isArray(root.extensionsRequired) && root.extensionsRequired.length) || !Array.isArray(root.extensionsUsed ?? []) || !Array.isArray(root.extensionsRequired ?? []))
      refuse("MESH_ASSET_EXTENSION", "gltf.extensionsUsed", "امتدادات glTF غير مسموحة (لا ضغط، لا فك ترميز خارجي).");
  }
  const asset = object(root.asset, "gltf.asset", ["version", "minVersion", "generator", "copyright"], ["version"]);
  if (asset.version !== "2.0" || (asset.minVersion !== undefined && asset.minVersion !== "2.0")) refuse("MESH_ASSET_VERSION", "gltf.asset.version", "يُقبل glTF 2.0 فقط.");
  const meta = (v: unknown, path: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== "string" || v.length > L.generatorChars || unsafeName(v)) refuse("MESH_ASSET_NAME", path, "نص وصفي غير صالح في النموذج.");
    return v as string;
  };
  const generator = meta(asset.generator, "gltf.asset.generator"), copyright = meta(asset.copyright, "gltf.asset.copyright");

  // buffers: exactly one, the GLB BIN chunk
  const buffers = list(root.buffers, "gltf.buffers", 1, 1);
  const buf = object(buffers[0], "gltf.buffers[0]", ["byteLength", "name"], ["byteLength"]);
  name(buf.name, "gltf.buffers[0].name");
  if (!bin || !isIndex(buf.byteLength, bin.length + 1) || (buf.byteLength as number) < 1 || bin.length - (buf.byteLength as number) > 3)
    refuse("MESH_ASSET_BUFFER", "gltf.buffers[0].byteLength", "حجم البيانات الثنائية المعلن لا يطابق الملف.");
  const binBytes = (bin as Uint8Array).subarray(0, buf.byteLength as number);
  const binView = new DataView(binBytes.buffer, binBytes.byteOffset, binBytes.byteLength);

  const views = list(root.bufferViews, "gltf.bufferViews", L.maxBufferViews, 1).map((v, i) => {
    const p = "gltf.bufferViews[" + i + "]", o = object(v, p, ["buffer", "byteOffset", "byteLength", "byteStride", "target", "name"], ["buffer", "byteLength"]);
    name(o.name, p + ".name");
    const byteOffset = o.byteOffset === undefined ? 0 : o.byteOffset;
    if (o.buffer !== 0 || !isIndex(byteOffset, binBytes.length + 1) || !isIndex(o.byteLength, binBytes.length + 1) || (o.byteLength as number) < 1 || (byteOffset as number) + (o.byteLength as number) > binBytes.length)
      refuse("MESH_ASSET_BOUNDS", p, "مقطع بيانات خارج حدود الملف.");
    if (o.byteStride !== undefined && (!isIndex(o.byteStride, 253) || (o.byteStride as number) < 4 || (o.byteStride as number) % 4 !== 0)) refuse("MESH_ASSET_BOUNDS", p + ".byteStride", "خطوة بيانات غير صالحة.");
    if (o.target !== undefined && o.target !== 34962 && o.target !== 34963) refuse("MESH_ASSET_SHAPE", p + ".target", "نوع مقطع بيانات غير صالح.");
    return { offset: byteOffset as number, length: o.byteLength as number, stride: (o.byteStride as number | undefined) ?? 0 };
  });
  type Accessor = { view: number; offset: number; componentType: number; count: number; type: string; normalized: boolean; stride: number; size: number };
  const accessors: Accessor[] = list(root.accessors, "gltf.accessors", L.maxAccessors, 1).map((v, i) => {
    const p = "gltf.accessors[" + i + "]", o = object(v, p, ["bufferView", "byteOffset", "componentType", "normalized", "count", "type", "max", "min", "name"], ["bufferView", "componentType", "count", "type"]);
    name(o.name, p + ".name");
    if (!isIndex(o.bufferView, views.length)) refuse("MESH_ASSET_BOUNDS", p + ".bufferView", "مرجع مقطع بيانات غير صالح.");
    const comp = COMPONENT_SIZE[o.componentType as number], width = TYPE_SIZE[o.type as string];
    if (!comp || !width || typeof o.componentType !== "number" || typeof o.type !== "string") refuse("MESH_ASSET_SHAPE", p, "نوع بيانات غير مدعوم.");
    if (!isIndex(o.count, L.maxVertices * 3 + 1) || (o.count as number) < 1) refuse("MESH_ASSET_LIMIT", p + ".count", "عدد العناصر غير صالح أو أكبر من المسموح.");
    if (o.normalized !== undefined && typeof o.normalized !== "boolean") refuse("MESH_ASSET_SHAPE", p + ".normalized", "قيمة غير صالحة.");
    for (const k of ["min", "max"] as const) if (o[k] !== undefined && (!Array.isArray(o[k]) || (o[k] as unknown[]).length !== width || !(o[k] as unknown[]).every(finite))) refuse("MESH_ASSET_SHAPE", p + "." + k, "حدود غير صالحة.");
    const view = views[o.bufferView as number], byteOffset = o.byteOffset === undefined ? 0 : o.byteOffset;
    const size = comp * width, stride = view.stride || size;
    if (!isIndex(byteOffset, view.length) || (byteOffset as number) % comp !== 0 || (view.offset + (byteOffset as number)) % comp !== 0 || (view.stride && view.stride < size))
      refuse("MESH_ASSET_BOUNDS", p + ".byteOffset", "إزاحة بيانات غير صالحة.");
    if ((byteOffset as number) + stride * ((o.count as number) - 1) + size > view.length) refuse("MESH_ASSET_BOUNDS", p, "بيانات العنصر تتجاوز مقطعها.");
    return { view: o.bufferView as number, offset: view.offset + (byteOffset as number), componentType: o.componentType as number, count: o.count as number, type: o.type as string, normalized: o.normalized === true, stride, size };
  });
  const read = (a: Accessor, e: number, c: number): number => {
    const at = a.offset + e * a.stride + c * COMPONENT_SIZE[a.componentType];
    switch (a.componentType) {
      case 5126: return binView.getFloat32(at, true);
      case 5125: return binView.getUint32(at, true);
      case 5123: { const v = binView.getUint16(at, true); return a.normalized ? v / 65535 : v; }
      case 5122: { const v = binView.getInt16(at, true); return a.normalized ? Math.max(v / 32767, -1) : v; }
      case 5121: { const v = binView.getUint8(at); return a.normalized ? v / 255 : v; }
      default: { const v = binView.getInt8(at); return a.normalized ? Math.max(v / 127, -1) : v; }
    }
  };
  const floats = (index: number, path: string, type: string, allowNormalizedInts: boolean): Float32Array => {
    const a = accessors[index];
    if (a.type !== type || !(a.componentType === 5126 || (allowNormalizedInts && a.normalized && (a.componentType === 5121 || a.componentType === 5123))))
      refuse("MESH_ASSET_SHAPE", path, "نوع بيانات الرؤوس غير مدعوم.");
    const w = TYPE_SIZE[type], out = new Float32Array(a.count * w);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < w; c++) {
      const v = read(a, e, c);
      if (!Number.isFinite(v)) refuse("MESH_ASSET_NUMBER", path, "قيمة غير منتهية (NaN / ∞) في بيانات النموذج.");
      out[e * w + c] = v;
    }
    return out;
  };

  // samplers / images / textures / materials
  const samplers: MeshSampler[] = list(root.samplers, "gltf.samplers", L.maxTextures).map((v, i) => {
    const p = "gltf.samplers[" + i + "]", o = object(v, p, ["magFilter", "minFilter", "wrapS", "wrapT", "name"]);
    name(o.name, p + ".name");
    const pick = (k: string, allowed: number[], d: number) => { const x = o[k]; if (x === undefined) return d; if (typeof x !== "number" || !allowed.includes(x)) refuse("MESH_ASSET_SHAPE", p + "." + k, "إعداد عينة غير صالح."); return x as number; };
    return { magFilter: pick("magFilter", MAG_FILTERS, DEFAULT_SAMPLER.magFilter), minFilter: pick("minFilter", MIN_FILTERS, DEFAULT_SAMPLER.minFilter), wrapS: pick("wrapS", WRAPS, DEFAULT_SAMPLER.wrapS), wrapT: pick("wrapT", WRAPS, DEFAULT_SAMPLER.wrapT) };
  });
  let texturePixels = 0;
  const images: MeshImage[] = list(root.images, "gltf.images", L.maxImages).map((v, i) => {
    const p = "gltf.images[" + i + "]", o = object(v, p, ["bufferView", "mimeType", "name"], ["bufferView", "mimeType"]);
    name(o.name, p + ".name");
    if (o.mimeType !== "image/png" && o.mimeType !== "image/jpeg") refuse("MESH_ASSET_IMAGE", p + ".mimeType", "تُقبل صور PNG و JPEG فقط داخل النموذج.");
    if (!isIndex(o.bufferView, views.length)) refuse("MESH_ASSET_BOUNDS", p + ".bufferView", "مرجع صورة غير صالح.");
    const view = views[o.bufferView as number], data = binBytes.subarray(view.offset, view.offset + view.length);
    const dims = sniffImage(data, o.mimeType as string);
    if (!dims) refuse("MESH_ASSET_IMAGE", p, "محتوى الصورة لا يطابق نوعها المعلن.");
    const { width, height } = dims as { width: number; height: number };
    if (width > L.maxImageSide || height > L.maxImageSide) refuse("MESH_ASSET_LIMIT", p, "أبعاد الصورة أكبر من " + L.maxImageSide + " بكسل.");
    texturePixels += width * height;
    return { mimeType: o.mimeType as "image/png" | "image/jpeg", bytes: data.slice(), width, height };
  });
  if (texturePixels > L.maxTexturePixels) refuse("MESH_ASSET_LIMIT", "gltf.images", "مجموع أبعاد الصور أكبر من المسموح.");
  const textures: MeshTexture[] = list(root.textures, "gltf.textures", L.maxTextures).map((v, i) => {
    const p = "gltf.textures[" + i + "]", o = object(v, p, ["sampler", "source", "name"], ["source"]);
    name(o.name, p + ".name");
    if (!isIndex(o.source, images.length)) refuse("MESH_ASSET_BOUNDS", p + ".source", "مرجع صورة غير صالح.");
    if (o.sampler !== undefined && !isIndex(o.sampler, samplers.length)) refuse("MESH_ASSET_BOUNDS", p + ".sampler", "مرجع عينة غير صالح.");
    return { image: o.source as number, sampler: o.sampler === undefined ? { ...DEFAULT_SAMPLER } : samplers[o.sampler as number] };
  });
  const textureInfo = (v: unknown, path: string, extra: "scale" | "strength" | null): { texture: number; factor: number } => {
    if (v === undefined) return { texture: -1, factor: 1 };
    const o = object(v, path, extra ? ["index", "texCoord", extra] : ["index", "texCoord"], ["index"]);
    if (!isIndex(o.index, textures.length)) refuse("MESH_ASSET_BOUNDS", path + ".index", "مرجع خامة غير صالح.");
    if (o.texCoord !== undefined && o.texCoord !== 0) refuse("MESH_ASSET_UNSUPPORTED", path + ".texCoord", "مجموعة إحداثيات خامة واحدة فقط مدعومة (TEXCOORD_0).");
    const f = extra ? o[extra] : undefined;
    if (f !== undefined && (!finite(f) || f < 0 || f > 10)) refuse("MESH_ASSET_NUMBER", path + "." + extra, "قيمة غير صالحة.");
    return { texture: o.index as number, factor: f === undefined ? 1 : (f as number) };
  };
  const unit = (v: unknown, path: string, d: number) => { if (v === undefined) return d; if (!finite(v) || v < 0 || v > 1) refuse("MESH_ASSET_NUMBER", path, "قيمة خارج المدى 0…1."); return v as number; };
  const colour = (v: unknown, path: string, n: 3 | 4, d: number[]) => {
    if (v === undefined) return d;
    if (!Array.isArray(v) || v.length !== n || !v.every(x => finite(x) && x >= 0 && x <= 1)) refuse("MESH_ASSET_NUMBER", path, "لون غير صالح.");
    return v as number[];
  };
  const materials: MeshMaterial[] = list(root.materials, "gltf.materials", L.maxMaterials).map((v, i) => {
    const p = "gltf.materials[" + i + "]", o = object(v, p, ["name", "pbrMetallicRoughness", "normalTexture", "occlusionTexture", "emissiveTexture", "emissiveFactor", "alphaMode", "alphaCutoff", "doubleSided"]);
    const pbr = o.pbrMetallicRoughness === undefined ? {} : object(o.pbrMetallicRoughness, p + ".pbrMetallicRoughness", ["baseColorFactor", "baseColorTexture", "metallicFactor", "roughnessFactor", "metallicRoughnessTexture"]);
    if (o.alphaMode !== undefined && o.alphaMode !== "OPAQUE" && o.alphaMode !== "MASK" && o.alphaMode !== "BLEND") refuse("MESH_ASSET_SHAPE", p + ".alphaMode", "نمط شفافية غير صالح.");
    if (o.doubleSided !== undefined && typeof o.doubleSided !== "boolean") refuse("MESH_ASSET_SHAPE", p + ".doubleSided", "قيمة غير صالحة.");
    const normal = textureInfo(o.normalTexture, p + ".normalTexture", "scale"), occlusion = textureInfo(o.occlusionTexture, p + ".occlusionTexture", "strength");
    return {
      name: name(o.name, p + ".name"), baseColor: colour(pbr.baseColorFactor, p + ".pbrMetallicRoughness.baseColorFactor", 4, [1, 1, 1, 1]) as [number, number, number, number],
      metallic: unit(pbr.metallicFactor, p + ".pbrMetallicRoughness.metallicFactor", 1), roughness: unit(pbr.roughnessFactor, p + ".pbrMetallicRoughness.roughnessFactor", 1),
      emissive: colour(o.emissiveFactor, p + ".emissiveFactor", 3, [0, 0, 0]) as Vec3,
      baseColorTexture: textureInfo(pbr.baseColorTexture, p + ".pbrMetallicRoughness.baseColorTexture", null).texture,
      metallicRoughnessTexture: textureInfo(pbr.metallicRoughnessTexture, p + ".pbrMetallicRoughness.metallicRoughnessTexture", null).texture,
      normalTexture: normal.texture, normalScale: normal.factor, occlusionTexture: occlusion.texture, occlusionStrength: Math.min(1, occlusion.factor),
      emissiveTexture: textureInfo(o.emissiveTexture, p + ".emissiveTexture", null).texture,
      alphaMode: (o.alphaMode as MeshMaterial["alphaMode"] | undefined) ?? "OPAQUE", alphaCutoff: o.alphaCutoff === undefined ? 0.5 : unit(o.alphaCutoff, p + ".alphaCutoff", 0.5), doubleSided: o.doubleSided === true
    };
  });

  // meshes: triangle primitives only; positions / normals / uvs copied tightly packed, every index checked against its vertex count
  let primitiveCount = 0;
  const meshes = list(root.meshes, "gltf.meshes", L.maxMeshes, 1).map((v, i) => {
    const p = "gltf.meshes[" + i + "]", o = object(v, p, ["primitives", "name"], ["primitives"]);
    name(o.name, p + ".name");
    return list(o.primitives, p + ".primitives", L.maxPrimitives, 1).map((pv, j) => {
      const pp = p + ".primitives[" + j + "]", prim = object(pv, pp, ["attributes", "indices", "material", "mode"], ["attributes"]);
      if (++primitiveCount > L.maxPrimitives) refuse("MESH_ASSET_LIMIT", pp, "عدد أجزاء الشبكات أكبر من المسموح.");
      if (prim.mode !== undefined && prim.mode !== 4) refuse("MESH_ASSET_UNSUPPORTED", pp + ".mode", "تُقبل المثلثات فقط (لا نقاط ولا خطوط).");
      const attrs = object(prim.attributes, pp + ".attributes", ["POSITION", "NORMAL", "TEXCOORD_0", "TANGENT"], ["POSITION"]);
      for (const k of ["POSITION", "NORMAL", "TEXCOORD_0", "TANGENT"]) if (attrs[k] !== undefined && !isIndex(attrs[k], accessors.length)) refuse("MESH_ASSET_BOUNDS", pp + ".attributes." + k, "مرجع بيانات غير صالح.");
      if (prim.material !== undefined && !isIndex(prim.material, materials.length)) refuse("MESH_ASSET_BOUNDS", pp + ".material", "مرجع مادة غير صالح.");
      const positions = floats(attrs.POSITION as number, pp + ".attributes.POSITION", "VEC3", false), vertices = positions.length / 3;
      if (vertices > L.maxVertices) refuse("MESH_ASSET_LIMIT", pp, "عدد الرؤوس أكبر من المسموح.");
      const sameCount = (k: string) => { if (attrs[k] !== undefined && accessors[attrs[k] as number].count !== vertices) refuse("MESH_ASSET_SHAPE", pp + ".attributes." + k, "عدد قيم " + k + " لا يطابق عدد الرؤوس."); };
      ["NORMAL", "TEXCOORD_0", "TANGENT"].forEach(sameCount);
      const normals = attrs.NORMAL === undefined ? null : floats(attrs.NORMAL as number, pp + ".attributes.NORMAL", "VEC3", false);
      const uvs = attrs.TEXCOORD_0 === undefined ? null : floats(attrs.TEXCOORD_0 as number, pp + ".attributes.TEXCOORD_0", "VEC2", true);
      if (attrs.TANGENT !== undefined) floats(attrs.TANGENT as number, pp + ".attributes.TANGENT", "VEC4", false);   // validated; the renderer derives its own frame
      let indices: Uint16Array | Uint32Array;
      if (prim.indices === undefined) {
        if (vertices % 3 !== 0) refuse("MESH_ASSET_SHAPE", pp, "عدد الرؤوس ليس من مضاعفات 3.");
        indices = vertices > 65535 ? new Uint32Array(vertices) : new Uint16Array(vertices);
        for (let k = 0; k < vertices; k++) indices[k] = k;
      } else {
        if (!isIndex(prim.indices, accessors.length)) refuse("MESH_ASSET_BOUNDS", pp + ".indices", "مرجع الفهارس غير صالح.");
        const a = accessors[prim.indices as number];
        if (a.type !== "SCALAR" || a.normalized || (a.componentType !== 5121 && a.componentType !== 5123 && a.componentType !== 5125)) refuse("MESH_ASSET_SHAPE", pp + ".indices", "نوع الفهارس غير صالح.");
        if (a.count % 3 !== 0) refuse("MESH_ASSET_SHAPE", pp + ".indices", "عدد الفهارس ليس من مضاعفات 3.");
        indices = vertices > 65535 ? new Uint32Array(a.count) : new Uint16Array(a.count);
        for (let k = 0; k < a.count; k++) {
          const ix = read(a, k, 0);
          if (ix >= vertices) refuse("MESH_ASSET_BOUNDS", pp + ".indices", "فهرس يشير إلى رأس غير موجود.");
          indices[k] = ix;
        }
      }
      return { positions, normals, uvs, indices, material: (prim.material as number | undefined) ?? -1, vertices, triangles: indices.length / 3 };
    });
  });

  // nodes: a forest; mesh-bearing nodes are the NAMED PARTS (unique ids)
  const nodeList = list(root.nodes, "gltf.nodes", L.maxNodes, 1);
  const parent = new Array<number>(nodeList.length).fill(-1);
  const nodes = nodeList.map((v, i) => {
    const p = "gltf.nodes[" + i + "]", o = object(v, p, ["name", "mesh", "children", "matrix", "translation", "rotation", "scale"]);
    const nm = name(o.name, p + ".name");
    if (o.mesh !== undefined && !isIndex(o.mesh, meshes.length)) refuse("MESH_ASSET_BOUNDS", p + ".mesh", "مرجع شبكة غير صالح.");
    const children = list(o.children, p + ".children", L.maxNodes).map((c, k) => {
      if (!isIndex(c, nodeList.length) || c === i) refuse("MESH_ASSET_BOUNDS", p + ".children[" + k + "]", "مرجع عقدة غير صالح.");
      if (parent[c as number] !== -1) refuse("MESH_ASSET_GRAPH", p + ".children[" + k + "]", "عقدة لها أكثر من أصل في شجرة النموذج.");
      parent[c as number] = i;
      return c as number;
    });
    let local: Float32Array;
    if (o.matrix !== undefined) {
      if (o.translation !== undefined || o.rotation !== undefined || o.scale !== undefined) refuse("MESH_ASSET_SHAPE", p, "تحويل العقدة إما مصفوفة أو (إزاحة، دوران، تحجيم)، لا الاثنان.");
      if (!Array.isArray(o.matrix) || o.matrix.length !== 16 || !o.matrix.every(finite)) refuse("MESH_ASSET_NUMBER", p + ".matrix", "مصفوفة تحويل غير صالحة.");
      local = new Float32Array(o.matrix as number[]);
    } else {
      const vec = (k: string, n: number, d: number[]) => { const x = o[k]; if (x === undefined) return d; if (!Array.isArray(x) || x.length !== n || !x.every(finite)) refuse("MESH_ASSET_NUMBER", p + "." + k, "تحويل غير صالح."); return x as number[]; };
      const q = vec("rotation", 4, [0, 0, 0, 1]), len = Math.hypot(q[0], q[1], q[2], q[3]);
      if (Math.abs(len - 1) > 1e-3) refuse("MESH_ASSET_NUMBER", p + ".rotation", "رباعي الدوران يجب أن يكون بطول 1.");
      const s = vec("scale", 3, [1, 1, 1]);
      if (s.some(x => Math.abs(x) < 1e-8)) refuse("MESH_ASSET_NUMBER", p + ".scale", "تحجيم صفري غير مسموح.");
      local = composeTRS(vec("translation", 3, [0, 0, 0]) as Vec3, [q[0] / len, q[1] / len, q[2] / len, q[3] / len], s as Vec3);
    }
    return { name: nm, mesh: o.mesh as number | undefined, children, local };
  });
  // the default scene's roots (or every parentless node when there is no scene)
  const scenes = list(root.scenes, "gltf.scenes", 1);
  let roots: number[];
  if (scenes.length) {
    const sc = object(scenes[0], "gltf.scenes[0]", ["nodes", "name"]);
    name(sc.name, "gltf.scenes[0].name");
    if (root.scene !== undefined && root.scene !== 0) refuse("MESH_ASSET_BOUNDS", "gltf.scene", "مرجع مشهد غير صالح.");
    roots = list(sc.nodes, "gltf.scenes[0].nodes", L.maxNodes, 1).map((n, k) => { if (!isIndex(n, nodes.length) || parent[n as number] !== -1) refuse("MESH_ASSET_GRAPH", "gltf.scenes[0].nodes[" + k + "]", "جذر مشهد غير صالح."); return n as number; });
    if (new Set(roots).size !== roots.length) refuse("MESH_ASSET_GRAPH", "gltf.scenes[0].nodes", "جذر مكرر في المشهد.");
  } else {
    if (root.scene !== undefined) refuse("MESH_ASSET_BOUNDS", "gltf.scene", "مرجع مشهد غير صالح.");
    roots = nodes.map((_, i) => i).filter(i => parent[i] === -1);
  }
  const parts: MeshPart[] = [], seen = new Set<string>(), visited = new Uint8Array(nodes.length);
  let triangles = 0, vertexTotal = 0;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const walk = (ix: number, world: Float32Array, depth: number) => {
    if (depth > L.maxNodeDepth) refuse("MESH_ASSET_GRAPH", "gltf.nodes[" + ix + "]", "شجرة النموذج أعمق من المسموح.");
    if (visited[ix]) refuse("MESH_ASSET_GRAPH", "gltf.nodes[" + ix + "]", "حلقة في شجرة النموذج.");
    visited[ix] = 1;
    const n = nodes[ix], m = mat4Multiply(world, n.local);
    if (n.mesh !== undefined) {
      const p = "gltf.nodes[" + ix + "].name";
      if (!isMeshPartId(n.name)) refuse("MESH_ASSET_PART_NAME", p, "كل عقدة تحمل شبكة يجب أن يكون لها اسم جزء صالح (حرف لاتيني أولًا، حتى 48 محرفًا من A-Z a-z 0-9 _ -).");
      if (seen.has(n.name)) refuse("MESH_ASSET_PART_DUPLICATE", p, "اسم جزء مكرر في النموذج: " + n.name);
      seen.add(n.name);
      if (parts.length >= L.maxParts) refuse("MESH_ASSET_LIMIT", p, "عدد أجزاء النموذج أكبر من " + L.maxParts + ".");
      const prims = meshes[n.mesh];
      const pmin: Vec3 = [Infinity, Infinity, Infinity], pmax: Vec3 = [-Infinity, -Infinity, -Infinity];
      let pt = 0, pv = 0;
      for (const prim of prims) {
        pt += prim.triangles; pv += prim.vertices;
        for (let k = 0; k < prim.vertices; k++) {
          const w = transformPoint(m, prim.positions[k * 3], prim.positions[k * 3 + 1], prim.positions[k * 3 + 2]);
          for (let c = 0; c < 3; c++) { if (w[c] < pmin[c]) pmin[c] = w[c]; if (w[c] > pmax[c]) pmax[c] = w[c]; }
        }
      }
      if (!pmin.every(Number.isFinite) || !pmax.every(Number.isFinite)) refuse("MESH_ASSET_NUMBER", p, "إحداثيات الجزء غير منتهية بعد التحويل.");
      for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], pmin[c]); max[c] = Math.max(max[c], pmax[c]); }
      triangles += pt; vertexTotal += pv;
      if (triangles > L.maxTriangles) refuse("MESH_ASSET_LIMIT", "gltf.meshes", "عدد المثلثات أكبر من " + L.maxTriangles + ".");
      if (vertexTotal > L.maxVertices) refuse("MESH_ASSET_LIMIT", "gltf.meshes", "عدد الرؤوس أكبر من " + L.maxVertices + ".");
      parts.push({ id: n.name, matrix: m, primitives: prims, bounds: { min: pmin, max: pmax }, triangles: pt, vertices: pv });
    }
    for (const c of n.children) walk(c, m, depth + 1);
  };
  for (const r of roots) walk(r, IDENTITY(), 1);
  if (!parts.length) refuse("MESH_ASSET_EMPTY", "gltf.nodes", "النموذج لا يحتوي أي جزء مرئي.");
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  if (!(size > 0) || !Number.isFinite(size)) refuse("MESH_ASSET_NUMBER", "gltf", "أبعاد النموذج غير صالحة.");
  const bounds: MeshBounds = { min, max };
  const document: MeshDocument = { parts, materials, textures, images, bounds, triangles, vertices: vertexTotal };
  const summary: MeshAssetSummary = {
    byteLength: bytes.length, triangles, vertices: vertexTotal, materials: materials.length, textures: textures.length, texturePixels, bounds,
    parts: parts.map(p => ({ id: p.id, triangles: p.triangles, vertices: p.vertices, bounds: p.bounds })),
    ...(generator ? { generator } : {}), ...(copyright ? { copyright } : {})
  };
  return { ok: true, summary, document, issues: [] };
}

/** Validates and normalises a GLB 2.0 asset. Never throws for malformed, hostile, truncated or oversized input. */
export function inspectGlbAsset(bytes: Uint8Array, options: MeshAssetOptions = {}): MeshAssetReport {
  const L: MeshAssetLimits = { ...MESH_ASSET_LIMITS, ...(options.limits ?? {}) };
  try { return inspect(bytes, L); }
  catch (e) {
    if (e instanceof Refusal) return { ok: false, issues: [e.issue] };
    return { ok: false, issues: [{ code: "MESH_ASSET_INVALID", path: "glb", message: "تعذر التحقق من ملف النموذج." }] };
  }
}
