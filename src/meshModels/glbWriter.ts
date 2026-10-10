// Phase 21D-B.1 — a small, dependency-free GLB 2.0 WRITER (leaf module: no imports). Used by the tests (valid and deliberately malformed
// assets), the real-browser harness (a deterministic multi-part ENGINEERING test model) and the Phase 21D-B.2 asset conversion script
// (Node strips the types). Never imported by application code, so it never ships to students.
//
// It writes exactly the subset the ExamBank GLB authority (glbAsset.ts) accepts: one BIN buffer, tightly packed float32 POSITION /
// NORMAL / TEXCOORD_0, uint16 / uint32 indices, metallic-roughness materials, PNG images embedded in buffer views, named part nodes.

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
export type GeometryData = { positions: Float32Array; normals: Float32Array; uvs?: Float32Array; indices: Uint16Array | Uint32Array };
export type GlbModelPart = { id: string; geometry: GeometryData; material: number; translation?: Vec3; rotation?: Quat; scale?: Vec3 };
export type GlbModelMaterial = {
  name: string; baseColor: [number, number, number, number]; metallic?: number; roughness?: number; emissive?: Vec3;
  baseColorImage?: number; normalImage?: number; normalScale?: number; doubleSided?: boolean; alphaMode?: "OPAQUE" | "MASK" | "BLEND";
};
export type GlbModelImage = { mimeType: "image/png" | "image/jpeg"; bytes: Uint8Array };
export type GlbModel = {
  parts: GlbModelPart[]; materials: GlbModelMaterial[]; images?: GlbModelImage[]; generator?: string; copyright?: string;
  root?: { name?: string; translation?: Vec3; rotation?: Quat; scale?: Vec3 };
};

// ── checksums + PNG (stored deflate: no compression library needed) ─────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function adler32(bytes: Uint8Array): number {
  let a = 1, b = 0;
  for (let i = 0; i < bytes.length; i++) { a = (a + bytes[i]) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
}
/** An RGBA8 image as a valid PNG (zlib stream of stored deflate blocks). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) { raw[y * (width * 4 + 1)] = 0; raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1); }
  const blocks: number[] = [0x78, 0x01];
  for (let i = 0; i < raw.length || i === 0; i += 65535) {
    const len = Math.min(65535, raw.length - i), last = i + len >= raw.length ? 1 : 0;
    blocks.push(last, len & 0xff, len >> 8, ~len & 0xff, (~len >> 8) & 0xff);
    for (let k = 0; k < len; k++) blocks.push(raw[i + k]);
    if (last) break;
  }
  const ad = adler32(raw);
  blocks.push(ad >>> 24, (ad >>> 16) & 0xff, (ad >>> 8) & 0xff, ad & 0xff);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const ihdr = new Uint8Array(13), hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width); hv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(blocks)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ── container ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Any JSON document + optional BIN bytes as a GLB container (used directly by the adversarial tests). */
export function assembleGlb(json: unknown, bin: Uint8Array | null): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(text.length / 4) * 4, binLen = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const total = 12 + 8 + jsonLen + (bin ? 8 + binLen : 0);
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLen); out.set(text, 20);
  if (bin) { const o = 20 + jsonLen; dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true); out.set(bin, o + 8); }
  return out;
}

/** A model as a GLB the ExamBank authority accepts (one node per named part under an optional root node). */
export function writeGlb(model: GlbModel): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Record<string, unknown>[] = [], accessors: Record<string, unknown>[] = [];
  const view = (bytes: Uint8Array, target?: number): number => {
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); length += pad; }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes); length += bytes.length;
    return bufferViews.length - 1;
  };
  const floatAccessor = (data: Float32Array, type: "VEC2" | "VEC3", withBounds: boolean): number => {
    const w = type === "VEC2" ? 2 : 3, count = data.length / w;
    const extra: Record<string, unknown> = {};
    if (withBounds) {
      const min = new Array(w).fill(Infinity), max = new Array(w).fill(-Infinity);
      for (let i = 0; i < count; i++) for (let c = 0; c < w; c++) { const v = data[i * w + c]; if (v < min[c]) min[c] = v; if (v > max[c]) max[c] = v; }
      extra.min = min; extra.max = max;
    }
    accessors.push({ bufferView: view(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)), 34962), componentType: 5126, count, type, ...extra });
    return accessors.length - 1;
  };
  const indexAccessor = (data: Uint16Array | Uint32Array): number => {
    accessors.push({ bufferView: view(new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)), 34963), componentType: data instanceof Uint32Array ? 5125 : 5123, count: data.length, type: "SCALAR" });
    return accessors.length - 1;
  };
  const meshes = model.parts.map(p => {
    const attributes: Record<string, number> = { POSITION: floatAccessor(p.geometry.positions, "VEC3", true), NORMAL: floatAccessor(p.geometry.normals, "VEC3", false) };
    if (p.geometry.uvs) attributes.TEXCOORD_0 = floatAccessor(p.geometry.uvs, "VEC2", false);
    return { name: p.id, primitives: [{ attributes, indices: indexAccessor(p.geometry.indices), material: p.material }] };
  });
  const images = (model.images ?? []).map((img, i) => ({ name: "image" + i, mimeType: img.mimeType, bufferView: view(img.bytes) }));
  const textures = images.map((_, i) => ({ source: i, sampler: 0 }));
  const materials = model.materials.map(m => ({
    name: m.name,
    pbrMetallicRoughness: { baseColorFactor: m.baseColor, metallicFactor: m.metallic ?? 0, roughnessFactor: m.roughness ?? 0.6, ...(m.baseColorImage !== undefined ? { baseColorTexture: { index: m.baseColorImage } } : {}) },
    ...(m.normalImage !== undefined ? { normalTexture: { index: m.normalImage, ...(m.normalScale !== undefined ? { scale: m.normalScale } : {}) } } : {}),
    ...(m.emissive ? { emissiveFactor: m.emissive } : {}), ...(m.alphaMode && m.alphaMode !== "OPAQUE" ? { alphaMode: m.alphaMode } : {}), ...(m.doubleSided ? { doubleSided: true } : {})
  }));
  const trs = (t?: Vec3, r?: Quat, s?: Vec3) => ({ ...(t ? { translation: t } : {}), ...(r ? { rotation: r } : {}), ...(s ? { scale: s } : {}) });
  const partNodes = model.parts.map((p, i) => ({ name: p.id, mesh: i, ...trs(p.translation, p.rotation, p.scale) }));
  const nodes: Record<string, unknown>[] = model.root
    ? [{ name: model.root.name ?? "model", children: partNodes.map((_, i) => i + 1), ...trs(model.root.translation, model.root.rotation, model.root.scale) }, ...partNodes]
    : partNodes;
  const pad = (4 - (length % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad)); length += pad; }
  const bin = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { bin.set(c, o); o += c.length; }
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: model.generator ?? "ExamBank glbWriter", ...(model.copyright ? { copyright: model.copyright } : {}) },
    scene: 0, scenes: [{ nodes: model.root ? [0] : partNodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews,
    buffers: [{ byteLength: bin.length }], materials,
    ...(images.length ? { images, textures, samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }] } : {})
  };
  return assembleGlb(json, bin);
}

// ── deterministic primitive geometry (engineering fixtures only — never presented as anatomy) ──────────────────────────────────────────
export function boxGeometry(sx: number, sy: number, sz: number): GeometryData {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  const faces: [Vec3, Vec3, Vec3][] = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const h: Vec3 = [sx / 2, sy / 2, sz / 2];
  for (const [n, u, v] of faces) {
    const base = P.length / 3;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let c = 0; c < 3; c++) P.push((n[c] + a * u[c] + b * v[c]) * h[c]);
      N.push(...n); U.push((a + 1) / 2, (1 - b) / 2);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint16Array(I) };
}
export function sphereGeometry(r: number, segments = 32, rings = 16): GeometryData {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const th = (j / rings) * Math.PI, ph = (i / segments) * 2 * Math.PI;
    const n: Vec3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), -Math.sin(th) * Math.sin(ph)];
    P.push(n[0] * r, n[1] * r, n[2] * r); N.push(...n); U.push(i / segments, j / rings);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint16Array(I) };
}
export function cylinderGeometry(r: number, h: number, segments = 32): GeometryData {
  const P: number[] = [], N: number[] = [], U: number[] = [], I: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI, x = Math.cos(a), z = -Math.sin(a);
    for (const y of [-h / 2, h / 2]) { P.push(x * r, y, z * r); N.push(x, 0, z); U.push(i / segments, y > 0 ? 0 : 1); }
  }
  for (let i = 0; i < segments; i++) { const a = i * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  for (const [y, ny] of [[h / 2, 1], [-h / 2, -1]] as const) {
    const c = P.length / 3;
    P.push(0, y, 0); N.push(0, ny, 0); U.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) { const a = (i / segments) * 2 * Math.PI; P.push(Math.cos(a) * r, y, -Math.sin(a) * r); N.push(0, ny, 0); U.push(0.5 + Math.cos(a) / 2, 0.5 + Math.sin(a) / 2); }
    for (let i = 0; i < segments; i++) { if (ny > 0) I.push(c, c + 1 + i, c + 2 + i); else I.push(c, c + 2 + i, c + 1 + i); }
  }
  return { positions: new Float32Array(P), normals: new Float32Array(N), uvs: new Float32Array(U), indices: new Uint16Array(I) };
}
export function checkerPng(size = 64, cells = 8, a: [number, number, number] = [235, 235, 235], b: [number, number, number] = [150, 160, 175]): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const c = ((Math.floor((x * cells) / size) + Math.floor((y * cells) / size)) % 2) ? a : b, o = (y * size + x) * 4;
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  return encodePng(size, size, px);
}

/** The deterministic ENGINEERING test assembly (five named parts, one textured; a front block that hides a back plate from the default
 *  front view, so depth testing and hide / show are measurable in real pixels). Not an educational model. */
export function testAssemblyModel(): GlbModel {
  return {
    generator: "ExamBank test assembly (Phase 21D-B.1)",
    materials: [
      { name: "plate", baseColor: [1, 1, 1, 1], metallic: 0.05, roughness: 0.7, baseColorImage: 0 },
      { name: "front", baseColor: [0.85, 0.12, 0.1, 1], metallic: 0, roughness: 0.45 },
      { name: "back", baseColor: [0.1, 0.25, 0.85, 1], metallic: 0, roughness: 0.5 },
      { name: "ball", baseColor: [0.12, 0.7, 0.25, 1], metallic: 0.1, roughness: 0.35 },
      { name: "rod", baseColor: [0.95, 0.75, 0.1, 1], metallic: 0.6, roughness: 0.3 }
    ],
    images: [{ mimeType: "image/png", bytes: checkerPng() }],
    root: { name: "assembly" },
    parts: [
      { id: "basePlate", geometry: boxGeometry(2.2, 0.16, 2), material: 0, translation: [0, -0.7, 0] },
      { id: "frontBlock", geometry: boxGeometry(0.62, 0.62, 0.62), material: 1, translation: [0, -0.05, 0.55] },
      { id: "backPlate", geometry: boxGeometry(1.3, 1.1, 0.24), material: 2, translation: [0, 0, -0.55] },
      { id: "ball", geometry: sphereGeometry(0.32), material: 3, translation: [-0.78, -0.3, 0.2] },
      { id: "rod", geometry: cylinderGeometry(0.12, 1.1), material: 4, translation: [0.8, -0.1, 0.25] }
    ]
  };
}
