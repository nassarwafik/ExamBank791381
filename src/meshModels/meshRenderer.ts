// Phase 21D-B.1 — the owned WebGL2 renderer of ExamBank's realistic mesh models (lazy; never in the initial bundle).
//
// Why owned, not a 3D engine: the renderer draws ONLY documents the GLB authority (glbAsset.ts) has already validated and normalised —
// no loader, no URI resolution, no decoder workers, no extension code paths, nothing that can fetch or execute. It is the smallest
// boundary that delivers the required quality:
//   • depth-buffered rasterisation with multisample antialiasing (context `antialias`), high-DPI drawing buffers (DPR ≤ 2, bounded
//     pixel count), back-face culling unless a material is double-sided;
//   • physically based metallic-roughness shading (GGX distribution, height-correlated Smith visibility, Schlick Fresnel), sRGB base
//     colour / emissive textures with mipmaps and anisotropic filtering, tangent-free normal mapping, occlusion, ACES tone mapping and
//     sRGB output; a camera-relative key / fill / rim light rig plus a sky / ground hemisphere and a split-sum ambient specular term;
//   • GPU picking (an ID pass into an offscreen RGBA8 + depth target, 1-pixel read) so the FRONT-MOST visible part under the pointer is
//     selected; highlight / review tints and hidden parts are render state, never geometry edits;
//   • bounded GPU memory (accounted per buffer / texture, textures downscaled to the device's limit and a total pixel budget), context
//     loss handled (preventDefault + full rebuild from the retained CPU document on restore), and dispose() releases every buffer,
//     texture, program and framebuffer, then the context itself (WEBGL_lose_context), so repeated mount / unmount never leaks contexts.
// Rendering is on demand (one frame per state change) — there is no continuous animation loop.
import type { MeshDocument, MeshMaterial } from "./glbAsset";
import { decodePickId, encodePickId, normalMatrix, orbitView, viewDirToWorld, type OrbitState } from "./meshCamera";

export type MeshMark = "correct" | "incorrect" | "missed";
export type MeshRenderState = {
  camera: OrbitState;
  hidden: ReadonlySet<string>;
  selected: ReadonlySet<string>;
  hover: string | null;
  /** parts that can be picked (labelled parts); other parts still occlude */
  selectable: ReadonlySet<string>;
  marks?: ReadonlyMap<string, MeshMark>;
};
export type MeshRendererStats = { drawCalls: number; triangles: number; gpuBytes: number; textures: number; frames: number; samples: number; dpr: number; width: number; height: number; contextLost: boolean };
export type MeshRenderer = {
  resize(cssWidth: number, cssHeight: number, devicePixelRatio: number): void;
  render(state: MeshRenderState): void;
  /** The selectable part under a CSS-pixel position (front-most visible surface), or null. */
  pick(cssX: number, cssY: number, state: MeshRenderState): string | null;
  /** Renders (the given state, else the last rendered one) and reads one CSS pixel of the final image (sRGB bytes) — certification only. */
  probe(cssX: number, cssY: number, state?: MeshRenderState): [number, number, number, number] | null;
  /** The pick of many CSS-pixel positions from ONE pick pass (orientation / coverage certification only). */
  pickMany(points: readonly (readonly [number, number])[], state: MeshRenderState): (string | null)[];
  stats(): MeshRendererStats;
  /** Resolves when every texture is decoded and uploaded (the first frames draw untextured base colours). */
  texturesReady: Promise<void>;
  dispose(): void;
};
export type MeshRendererHooks = { onContextLost?(): void; onContextRestored?(): void; onTexturesReady?(): void };
export const MESH_RENDER_LIMITS = Object.freeze({ maxDpr: 2, maxDrawingPixels: 4_200_000, maxGpuTexturePixels: 16_777_216, lowMemoryTexturePixels: 4_194_304 });

let live = 0;
/** Renderers created and not yet disposed (leak detection in tests and the certification harness). */
export const meshRendererLiveCount = () => live;

const VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;
uniform mat4 uModel;
uniform mat4 uViewProj;
uniform mat3 uNormalMatrix;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vUv;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = uNormalMatrix * aNormal;
  vUv = aUv;
  gl_Position = uViewProj * world;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vUv;
uniform vec3 uEye;
uniform vec4 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform vec3 uEmissive;
uniform float uNormalScale;
uniform float uOcclusionStrength;
uniform int uMaps;
uniform sampler2D uBaseMap;
uniform sampler2D uMrMap;
uniform sampler2D uNormalMap;
uniform sampler2D uOcclusionMap;
uniform sampler2D uEmissiveMap;
uniform int uAlphaMode;
uniform float uAlphaCutoff;
uniform vec3 uLightDir[3];
uniform vec3 uLightColor[3];
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec4 uTint;
uniform float uExposure;
out vec4 fragColor;
const float PI = 3.14159265359;
vec3 perturb(vec3 n, vec3 p, vec2 uv, vec3 m) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, n), dp1perp = cross(n, dp1);
  vec3 t = dp2perp * du1.x + dp1perp * du2.x;
  vec3 b = dp2perp * du1.y + dp1perp * du2.y;
  float s = max(dot(t, t), dot(b, b));
  if (s < 1e-20) return n;
  float inv = inversesqrt(s);
  return normalize(mat3(t * inv, b * inv, n) * m);
}
float dGgx(float noh, float a) { float a2 = a * a; float d = noh * noh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }
float vSmith(float nov, float nol, float a) {
  float a2 = a * a;
  float gv = nol * sqrt(nov * nov * (1.0 - a2) + a2);
  float gl = nov * sqrt(nol * nol * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}
vec3 fSchlick(float voh, vec3 f0) { return f0 + (1.0 - f0) * pow(1.0 - voh, 5.0); }
vec3 envBrdf(vec3 f0, float r, float nov) {
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022);
  const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 q = r * c0 + c1;
  float a004 = min(q.x * q.x, exp2(-9.28 * nov)) * q.x + q.y;
  vec2 ab = vec2(-1.04, 1.04) * a004 + q.zw;
  return f0 * ab.x + ab.y;
}
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSrgb(vec3 c) { return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
void main() {
  vec4 base = uBaseColor;
  if ((uMaps & 1) != 0) base *= texture(uBaseMap, vUv);
  if (uAlphaMode == 1 && base.a < uAlphaCutoff) discard;
  float metallic = uMetallic;
  float roughness = uRoughness;
  if ((uMaps & 2) != 0) { vec4 mr = texture(uMrMap, vUv); roughness *= mr.g; metallic *= mr.b; }
  roughness = clamp(roughness, 0.045, 1.0);
  metallic = clamp(metallic, 0.0, 1.0);
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  if ((uMaps & 4) != 0) {
    vec3 m = texture(uNormalMap, vUv).xyz * 2.0 - 1.0;
    m.xy *= uNormalScale;
    n = perturb(n, vWorld, vUv, normalize(m));
  }
  vec3 v = normalize(uEye - vWorld);
  float nov = max(dot(n, v), 1e-4);
  vec3 diffuse = base.rgb * (1.0 - metallic);
  vec3 f0 = mix(vec3(0.04), base.rgb, metallic);
  float a = roughness * roughness;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec3 l = uLightDir[i];
    float nol = dot(n, l);
    if (nol <= 0.0) continue;
    vec3 h = normalize(l + v);
    float noh = max(dot(n, h), 0.0);
    float voh = max(dot(v, h), 0.0);
    vec3 f = fSchlick(voh, f0);
    vec3 spec = dGgx(noh, a) * vSmith(nov, nol, a) * f;
    vec3 kd = (1.0 - f) * diffuse / PI;
    color += (kd + spec) * uLightColor[i] * nol;
  }
  vec3 ambient = mix(uGround, uSky, n.y * 0.5 + 0.5);
  float ao = 1.0;
  if ((uMaps & 8) != 0) ao = mix(1.0, texture(uOcclusionMap, vUv).r, uOcclusionStrength);
  color += (diffuse * ambient + envBrdf(f0, roughness, nov) * ambient * 0.65) * ao;
  vec3 emissive = uEmissive;
  if ((uMaps & 16) != 0) emissive *= texture(uEmissiveMap, vUv).rgb;
  color += emissive;
  if (uTint.a > 0.0) {
    float shade = 0.45 + 0.55 * max(dot(n, uLightDir[0]), 0.0);
    color = mix(color, uTint.rgb * shade, uTint.a);
  }
  fragColor = vec4(toSrgb(aces(color * uExposure)), uAlphaMode == 2 ? base.a : 1.0);
}`;
const PICK_VS = `#version 300 es
layout(location = 0) in vec3 aPosition;
uniform mat4 uModel;
uniform mat4 uViewProj;
void main() { gl_Position = uViewProj * uModel * vec4(aPosition, 1.0); }`;
const PICK_FS = `#version 300 es
precision highp float;
uniform vec4 uId;
out vec4 fragColor;
void main() { fragColor = uId; }`;

// camera-relative light rig (view space: +x right, +y up, +z towards the viewer) — linear radiance
const LIGHTS: { dir: [number, number, number]; color: [number, number, number] }[] = [
  { dir: [-0.45, 0.62, 0.64], color: [2.35, 2.27, 2.15] },   // key: upper left, in front
  { dir: [0.7, 0.12, 0.55], color: [0.55, 0.6, 0.72] },      // fill: right, cool
  { dir: [0.1, 0.55, -0.83], color: [1.0, 1.0, 1.05] }       // rim: behind, from above
];
// a darker ambient than a product viewer: saturated tissue colours, contrast between neighbouring structures
const SKY = [0.24, 0.27, 0.31], GROUND = [0.09, 0.08, 0.075];
const BG_SRGB = [0.957, 0.969, 0.984];
// highlight / review tints (linear rgb + amount): strong enough to read unambiguously on any base colour (the list carries the same
// state as text, so colour is never the only signal)
const TINTS: Record<string, [number, number, number, number]> = {
  selected: [1.0, 0.42, 0.0, 0.72], hover: [1, 1, 1, 0.2],
  correct: [0.02, 0.62, 0.12, 0.82], incorrect: [0.85, 0.02, 0.02, 0.82], missed: [1.0, 0.62, 0.0, 0.82]
};
const NO_TINT: [number, number, number, number] = [0, 0, 0, 0];

type GpuPrimitive = { vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; count: number; indexType: number; material: number; bytes: number };
type GpuPart = { id: string; index: number; model: Float32Array; normal: Float32Array; primitives: GpuPrimitive[]; centre: [number, number, number] };
type Program = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> };
type Gpu = {
  pbr: Program; pick: Program; parts: GpuPart[]; textures: Map<string, { texture: WebGLTexture; bytes: number }>;
  pickFbo: { fbo: WebGLFramebuffer; color: WebGLRenderbuffer; depth: WebGLRenderbuffer; w: number; h: number } | null;
  white: WebGLTexture; aniso: { ext: EXT_texture_filter_anisotropic; max: number } | null; geometryBytes: number;
};

/** Area-weighted smooth normals for a primitive that has none (indexed triangles). */
export function computeNormals(positions: Float32Array, indices: Uint16Array | Uint32Array): Float32Array {
  const n = new Float32Array(positions.length);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]);
    if (l > 1e-20) { n[k] /= l; n[k + 1] /= l; n[k + 2] /= l; } else { n[k + 1] = 1; }
  }
  return n;
}

/** Texture budget: the device's maximum side, and a total GPU pixel budget (lower on low-memory devices). */
export function textureScale(width: number, height: number, maxSide: number, budgetLeft: number): number {
  let s = Math.min(1, maxSide / Math.max(width, height));
  while (s > 1 / 64 && width * s * height * s > budgetLeft) s /= 2;
  return s;
}

export function createMeshRenderer(canvas: HTMLCanvasElement, doc: MeshDocument, hooks: MeshRendererHooks = {}): MeshRenderer | null {
  let gl: WebGL2RenderingContext | null = null;
  try { gl = canvas.getContext("webgl2", { antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "default" }); }
  catch { gl = null; }
  if (!gl) return null;
  const ctx = gl;
  live++;
  let gpu: Gpu | null = null, lost = false, disposed = false, frames = 0, lastDraws = 0;
  let cssW = 1, cssH = 1, dpr = 1;
  const bitmaps = new Map<number, ImageBitmap>();
  const lowMemory = typeof navigator !== "undefined" && typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === "number" && ((navigator as Navigator & { deviceMemory?: number }).deviceMemory as number) <= 4;
  let texturesDone: () => void = () => {};
  const texturesReady = new Promise<void>(resolve => { texturesDone = resolve; });
  let lastState: MeshRenderState | null = null;

  const compile = (vs: string, fs: string, names: string[]): Program => {
    const make = (type: number, src: string) => {
      const s = ctx.createShader(type);
      if (!s) throw new Error("shader");
      ctx.shaderSource(s, src); ctx.compileShader(s);
      if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS) && !ctx.isContextLost()) throw new Error("shader: " + ctx.getShaderInfoLog(s));
      return s;
    };
    const v = make(ctx.VERTEX_SHADER, vs), f = make(ctx.FRAGMENT_SHADER, fs), program = ctx.createProgram();
    if (!program) throw new Error("program");
    ctx.attachShader(program, v); ctx.attachShader(program, f); ctx.linkProgram(program);
    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS) && !ctx.isContextLost()) throw new Error("link: " + ctx.getProgramInfoLog(program));
    ctx.deleteShader(v); ctx.deleteShader(f);
    return { program, uniforms: new Map(names.map(n => [n, ctx.getUniformLocation(program, n)])) };
  };
  const PBR_UNIFORMS = ["uModel", "uViewProj", "uNormalMatrix", "uEye", "uBaseColor", "uMetallic", "uRoughness", "uEmissive", "uNormalScale", "uOcclusionStrength", "uMaps", "uBaseMap", "uMrMap", "uNormalMap", "uOcclusionMap", "uEmissiveMap", "uAlphaMode", "uAlphaCutoff", "uLightDir", "uLightColor", "uSky", "uGround", "uTint", "uExposure"];

  const upload = (data: ArrayBufferView, target: number): WebGLBuffer => {
    const b = ctx.createBuffer();
    if (!b) throw new Error("buffer");
    ctx.bindBuffer(target, b); ctx.bufferData(target, data, ctx.STATIC_DRAW);
    return b;
  };
  const build = (): Gpu => {
    const pbr = compile(VS, FS, PBR_UNIFORMS), pick = compile(PICK_VS, PICK_FS, ["uModel", "uViewProj", "uId"]);
    let geometryBytes = 0;
    const parts: GpuPart[] = doc.parts.map((p, index) => {
      const primitives = p.primitives.map(prim => {
        const vao = ctx.createVertexArray();
        if (!vao) throw new Error("vao");
        ctx.bindVertexArray(vao);
        const normals = prim.normals ?? computeNormals(prim.positions, prim.indices);
        const pos = upload(prim.positions, ctx.ARRAY_BUFFER);
        ctx.enableVertexAttribArray(0); ctx.vertexAttribPointer(0, 3, ctx.FLOAT, false, 0, 0);
        const nor = upload(normals, ctx.ARRAY_BUFFER);
        ctx.enableVertexAttribArray(1); ctx.vertexAttribPointer(1, 3, ctx.FLOAT, false, 0, 0);
        const buffers = [pos, nor];
        if (prim.uvs) { const uv = upload(prim.uvs, ctx.ARRAY_BUFFER); buffers.push(uv); ctx.enableVertexAttribArray(2); ctx.vertexAttribPointer(2, 2, ctx.FLOAT, false, 0, 0); }
        else { ctx.disableVertexAttribArray(2); ctx.vertexAttrib2f(2, 0, 0); }
        const idx = upload(prim.indices, ctx.ELEMENT_ARRAY_BUFFER); buffers.push(idx);
        ctx.bindVertexArray(null);
        const bytes = prim.positions.byteLength + normals.byteLength + (prim.uvs ? prim.uvs.byteLength : 0) + prim.indices.byteLength;
        geometryBytes += bytes;
        return { vao, buffers, count: prim.indices.length, indexType: prim.indices instanceof Uint32Array ? ctx.UNSIGNED_INT : ctx.UNSIGNED_SHORT, material: prim.material, bytes };
      });
      const b = p.bounds;
      return { id: p.id, index, model: p.matrix, normal: normalMatrix(p.matrix), primitives, centre: [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2] };
    });
    const white = ctx.createTexture();
    if (!white) throw new Error("texture");
    ctx.bindTexture(ctx.TEXTURE_2D, white);
    ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA8, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    const ext = ctx.getExtension("EXT_texture_filter_anisotropic");
    return { pbr, pick, parts, textures: new Map(), pickFbo: null, white, aniso: ext ? { ext, max: Math.min(8, ctx.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) } : null, geometryBytes };
  };

  // textures: decoded once (ImageBitmaps survive a context loss), uploaded per (texture, colour space) on first use after decode
  const usage = new Map<number, Set<"srgb" | "linear">>();
  for (const m of doc.materials) {
    const add = (t: number, space: "srgb" | "linear") => { if (t >= 0) { const s = usage.get(t) ?? new Set(); s.add(space); usage.set(t, s); } };
    add(m.baseColorTexture, "srgb"); add(m.emissiveTexture, "srgb"); add(m.metallicRoughnessTexture, "linear"); add(m.normalTexture, "linear"); add(m.occlusionTexture, "linear");
  }
  const uploadTextures = () => {
    if (!gpu || lost) return;
    const maxSide = ctx.getParameter(ctx.MAX_TEXTURE_SIZE) as number;
    let budget: number = lowMemory ? MESH_RENDER_LIMITS.lowMemoryTexturePixels : MESH_RENDER_LIMITS.maxGpuTexturePixels;
    for (const [t, spaces] of usage) {
      const tex = doc.textures[t], bmp = bitmaps.get(tex.image);
      if (!bmp) continue;
      for (const space of spaces) {
        const key = t + ":" + space;
        if (gpu.textures.has(key)) continue;
        const s = textureScale(bmp.width, bmp.height, maxSide, budget);
        const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
        let source: TexImageSource = bmp;
        if (s < 1 && typeof OffscreenCanvas !== "undefined") {
          const oc = new OffscreenCanvas(w, h), c2 = oc.getContext("2d");
          if (c2) { c2.drawImage(bmp, 0, 0, w, h); source = oc; }
        }
        const texture = ctx.createTexture();
        if (!texture) continue;
        ctx.bindTexture(ctx.TEXTURE_2D, texture);
        ctx.pixelStorei(ctx.UNPACK_COLORSPACE_CONVERSION_WEBGL, ctx.NONE);
        ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        ctx.texImage2D(ctx.TEXTURE_2D, 0, space === "srgb" ? ctx.SRGB8_ALPHA8 : ctx.RGBA8, w, h, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, source);
        const mip = tex.sampler.minFilter >= 9984;
        if (mip) ctx.generateMipmap(ctx.TEXTURE_2D);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, tex.sampler.magFilter);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, tex.sampler.minFilter);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, tex.sampler.wrapS);
        ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, tex.sampler.wrapT);
        if (gpu.aniso && mip) ctx.texParameterf(ctx.TEXTURE_2D, gpu.aniso.ext.TEXTURE_MAX_ANISOTROPY_EXT, gpu.aniso.max);
        const bytes = Math.round(w * h * 4 * (mip ? 4 / 3 : 1));
        budget = Math.max(0, budget - w * h);
        gpu.textures.set(key, { texture, bytes });
      }
    }
  };
  const decode = async () => {
    const images = [...new Set([...usage.keys()].map(t => doc.textures[t].image))];
    await Promise.all(images.map(async i => {
      const img = doc.images[i];
      try {
        const blob = new Blob([img.bytes.slice().buffer as ArrayBuffer], { type: img.mimeType });
        const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
        if (disposed) bmp.close(); else bitmaps.set(i, bmp);
      } catch { /* an undecodable image leaves its material untextured (base colour factor) */ }
    }));
    if (disposed) return;
    uploadTextures();
    texturesDone();
    hooks.onTexturesReady?.();
  };

  const releaseGpu = () => {
    if (!gpu) return;
    if (!lost && !ctx.isContextLost()) {
      for (const p of gpu.parts) for (const prim of p.primitives) { ctx.deleteVertexArray(prim.vao); prim.buffers.forEach(b => ctx.deleteBuffer(b)); }
      for (const t of gpu.textures.values()) ctx.deleteTexture(t.texture);
      ctx.deleteTexture(gpu.white);
      ctx.deleteProgram(gpu.pbr.program); ctx.deleteProgram(gpu.pick.program);
      if (gpu.pickFbo) { ctx.deleteFramebuffer(gpu.pickFbo.fbo); ctx.deleteRenderbuffer(gpu.pickFbo.color); ctx.deleteRenderbuffer(gpu.pickFbo.depth); }
    }
    gpu = null;
  };
  const onLost = (e: Event) => { e.preventDefault(); lost = true; gpu = null; hooks.onContextLost?.(); };
  const onRestored = () => {
    if (disposed) return;
    lost = false;
    try { gpu = build(); uploadTextures(); } catch { gpu = null; return; }
    hooks.onContextRestored?.();
    if (lastState) render(lastState);
  };
  canvas.addEventListener("webglcontextlost", onLost, false);
  canvas.addEventListener("webglcontextrestored", onRestored, false);
  try { gpu = build(); }
  catch {
    canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored);
    live--;
    return null;
  }
  void decode();

  const setTexture = (unit: number, uniform: string, key: string | null, prog: Program) => {
    if (!gpu) return false;
    const t = key ? gpu.textures.get(key) : undefined;
    ctx.activeTexture(ctx.TEXTURE0 + unit);
    ctx.bindTexture(ctx.TEXTURE_2D, t ? t.texture : gpu.white);
    ctx.uniform1i(prog.uniforms.get(uniform) ?? null, unit);
    return !!t;
  };
  const bindMaterial = (m: MeshMaterial | undefined, prog: Program) => {
    const u = (n: string) => prog.uniforms.get(n) ?? null;
    const mat = m ?? DEFAULT_MATERIAL;
    let maps = 0;
    if (setTexture(0, "uBaseMap", mat.baseColorTexture >= 0 ? mat.baseColorTexture + ":srgb" : null, prog)) maps |= 1;
    if (setTexture(1, "uMrMap", mat.metallicRoughnessTexture >= 0 ? mat.metallicRoughnessTexture + ":linear" : null, prog)) maps |= 2;
    if (setTexture(2, "uNormalMap", mat.normalTexture >= 0 ? mat.normalTexture + ":linear" : null, prog)) maps |= 4;
    if (setTexture(3, "uOcclusionMap", mat.occlusionTexture >= 0 ? mat.occlusionTexture + ":linear" : null, prog)) maps |= 8;
    if (setTexture(4, "uEmissiveMap", mat.emissiveTexture >= 0 ? mat.emissiveTexture + ":srgb" : null, prog)) maps |= 16;
    ctx.uniform1i(u("uMaps"), maps);
    ctx.uniform4fv(u("uBaseColor"), mat.baseColor);
    ctx.uniform1f(u("uMetallic"), mat.metallic); ctx.uniform1f(u("uRoughness"), mat.roughness);
    ctx.uniform3fv(u("uEmissive"), mat.emissive);
    ctx.uniform1f(u("uNormalScale"), mat.normalScale); ctx.uniform1f(u("uOcclusionStrength"), mat.occlusionStrength);
    ctx.uniform1i(u("uAlphaMode"), mat.alphaMode === "MASK" ? 1 : mat.alphaMode === "BLEND" ? 2 : 0);
    ctx.uniform1f(u("uAlphaCutoff"), mat.alphaCutoff);
    if (mat.doubleSided) ctx.disable(ctx.CULL_FACE); else ctx.enable(ctx.CULL_FACE);
  };
  const viewOf = (state: MeshRenderState) => orbitView(doc.bounds, state.camera, cssW / Math.max(1, cssH));
  const tintOf = (id: string, state: MeshRenderState): [number, number, number, number] => {
    const mark = state.marks?.get(id);
    if (mark) return TINTS[mark];
    if (state.selected.has(id)) return TINTS.selected;
    if (state.hover === id) return TINTS.hover;
    return NO_TINT;
  };

  const draw = (state: MeshRenderState): number => {
    if (!gpu) return 0;
    const v = viewOf(state), prog = gpu.pbr, u = (n: string) => prog.uniforms.get(n) ?? null;
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
    ctx.viewport(0, 0, canvas.width, canvas.height);
    ctx.clearColor(BG_SRGB[0], BG_SRGB[1], BG_SRGB[2], 1);
    ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
    ctx.enable(ctx.DEPTH_TEST); ctx.depthFunc(ctx.LEQUAL); ctx.depthMask(true); ctx.disable(ctx.BLEND); ctx.cullFace(ctx.BACK);
    ctx.useProgram(prog.program);
    ctx.uniformMatrix4fv(u("uViewProj"), false, v.viewProj);
    ctx.uniform3fv(u("uEye"), v.eye);
    ctx.uniform3fv(u("uLightDir"), LIGHTS.flatMap(l => viewDirToWorld(v.view, l.dir)));
    ctx.uniform3fv(u("uLightColor"), LIGHTS.flatMap(l => l.color));
    ctx.uniform3fv(u("uSky"), SKY); ctx.uniform3fv(u("uGround"), GROUND);
    ctx.uniform1f(u("uExposure"), 1);
    let draws = 0;
    const blended: { part: GpuPart; prim: GpuPrimitive; depth: number }[] = [];
    const drawPrim = (part: GpuPart, prim: GpuPrimitive) => {
      ctx.uniformMatrix4fv(u("uModel"), false, part.model);
      ctx.uniformMatrix3fv(u("uNormalMatrix"), false, part.normal);
      ctx.uniform4fv(u("uTint"), tintOf(part.id, state));
      bindMaterial(doc.materials[prim.material], prog);
      ctx.bindVertexArray(prim.vao);
      ctx.drawElements(ctx.TRIANGLES, prim.count, prim.indexType, 0);
      draws++;
    };
    for (const part of gpu.parts) {
      if (state.hidden.has(part.id)) continue;
      for (const prim of part.primitives) {
        if (doc.materials[prim.material]?.alphaMode === "BLEND") {
          const c = part.centre, d = (c[0] - v.eye[0]) ** 2 + (c[1] - v.eye[1]) ** 2 + (c[2] - v.eye[2]) ** 2;
          blended.push({ part, prim, depth: d });
        } else drawPrim(part, prim);
      }
    }
    if (blended.length) {
      ctx.enable(ctx.BLEND); ctx.blendFunc(ctx.SRC_ALPHA, ctx.ONE_MINUS_SRC_ALPHA); ctx.depthMask(false);
      blended.sort((a, b) => b.depth - a.depth).forEach(x => drawPrim(x.part, x.prim));
      ctx.depthMask(true); ctx.disable(ctx.BLEND);
    }
    ctx.bindVertexArray(null);
    frames++;
    return draws;
  };
  function render(state: MeshRenderState) {
    lastState = state;
    if (disposed || lost || !gpu) return;
    lastDraws = draw(state);
  }
  const ensurePickTarget = (): Gpu["pickFbo"] => {
    if (!gpu) return null;
    const w = canvas.width, h = canvas.height;
    if (gpu.pickFbo && gpu.pickFbo.w === w && gpu.pickFbo.h === h) return gpu.pickFbo;
    if (gpu.pickFbo) { ctx.deleteFramebuffer(gpu.pickFbo.fbo); ctx.deleteRenderbuffer(gpu.pickFbo.color); ctx.deleteRenderbuffer(gpu.pickFbo.depth); gpu.pickFbo = null; }
    const fbo = ctx.createFramebuffer(), color = ctx.createRenderbuffer(), depth = ctx.createRenderbuffer();
    if (!fbo || !color || !depth) return null;
    ctx.bindRenderbuffer(ctx.RENDERBUFFER, color); ctx.renderbufferStorage(ctx.RENDERBUFFER, ctx.RGBA8, w, h);
    ctx.bindRenderbuffer(ctx.RENDERBUFFER, depth); ctx.renderbufferStorage(ctx.RENDERBUFFER, ctx.DEPTH_COMPONENT24, w, h);
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, fbo);
    ctx.framebufferRenderbuffer(ctx.FRAMEBUFFER, ctx.COLOR_ATTACHMENT0, ctx.RENDERBUFFER, color);
    ctx.framebufferRenderbuffer(ctx.FRAMEBUFFER, ctx.DEPTH_ATTACHMENT, ctx.RENDERBUFFER, depth);
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
    gpu.pickFbo = { fbo, color, depth, w, h };
    return gpu.pickFbo;
  };
  const toPixel = (cssX: number, cssY: number) => {
    const x = Math.floor((cssX / Math.max(1, cssW)) * canvas.width), y = canvas.height - 1 - Math.floor((cssY / Math.max(1, cssH)) * canvas.height);
    return x >= 0 && y >= 0 && x < canvas.width && y < canvas.height ? { x, y } : null;
  };
  const pickMany = (points: readonly (readonly [number, number])[], state: MeshRenderState): (string | null)[] => {
    const none = points.map(() => null);
    if (disposed || lost || !gpu) return none;
    const pixels = points.map(([x, y]) => toPixel(x, y)), target = ensurePickTarget();
    if (!target || pixels.every(p => !p)) return none;
    const v = viewOf(state), prog = gpu.pick, u = (n: string) => prog.uniforms.get(n) ?? null;
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, target.fbo);
    ctx.viewport(0, 0, target.w, target.h);
    ctx.clearColor(0, 0, 0, 0); ctx.clear(ctx.COLOR_BUFFER_BIT | ctx.DEPTH_BUFFER_BIT);
    ctx.enable(ctx.DEPTH_TEST); ctx.depthFunc(ctx.LEQUAL); ctx.disable(ctx.BLEND);
    ctx.useProgram(prog.program);
    ctx.uniformMatrix4fv(u("uViewProj"), false, v.viewProj);
    for (const part of gpu.parts) {
      if (state.hidden.has(part.id)) continue;
      ctx.uniformMatrix4fv(u("uModel"), false, part.model);
      ctx.uniform4fv(u("uId"), encodePickId(state.selectable.has(part.id) ? part.index + 1 : 0));
      for (const prim of part.primitives) {
        if (doc.materials[prim.material]?.doubleSided) ctx.disable(ctx.CULL_FACE); else ctx.enable(ctx.CULL_FACE);
        ctx.bindVertexArray(prim.vao);
        ctx.drawElements(ctx.TRIANGLES, prim.count, prim.indexType, 0);
      }
    }
    ctx.bindVertexArray(null);
    const out = new Uint8Array(4), found = pixels.map(px => {
      if (!px || !gpu) return null;
      ctx.readPixels(px.x, px.y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, out);
      const id = decodePickId(out[0], out[1], out[2]), part = id > 0 ? gpu.parts[id - 1] : undefined;
      return part ? part.id : null;
    });
    ctx.bindFramebuffer(ctx.FRAMEBUFFER, null);
    if (lastState) render(lastState);
    return found;
  };
  const pick = (cssX: number, cssY: number, state: MeshRenderState): string | null => pickMany([[cssX, cssY]], state)[0];
  const probe = (cssX: number, cssY: number, state?: MeshRenderState): [number, number, number, number] | null => {
    const use = state ?? lastState;
    if (disposed || lost || !gpu || !use) return null;
    const px = toPixel(cssX, cssY);
    if (!px) return null;
    render(use);
    const out = new Uint8Array(4);
    ctx.readPixels(px.x, px.y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, out);
    return [out[0], out[1], out[2], out[3]];
  };
  const resize = (w: number, h: number, ratio: number) => {
    cssW = Math.max(1, w); cssH = Math.max(1, h);
    let r = Math.min(MESH_RENDER_LIMITS.maxDpr, Math.max(1, ratio || 1));
    while (cssW * r * cssH * r > MESH_RENDER_LIMITS.maxDrawingPixels && r > 1) r = Math.max(1, r - 0.25);
    dpr = r;
    const pw = Math.round(cssW * r), ph = Math.round(cssH * r);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  };
  const stats = (): MeshRendererStats => {
    const texBytes = gpu ? [...gpu.textures.values()].reduce((n, t) => n + t.bytes, 0) : 0;
    const fboBytes = gpu?.pickFbo ? gpu.pickFbo.w * gpu.pickFbo.h * 8 : 0;
    let samples = 0;
    try { samples = lost ? 0 : (ctx.getParameter(ctx.SAMPLES) as number); } catch { samples = 0; }
    return { drawCalls: lastDraws, triangles: doc.triangles, gpuBytes: (gpu?.geometryBytes ?? 0) + texBytes + fboBytes, textures: gpu?.textures.size ?? 0, frames, samples, dpr, width: canvas.width, height: canvas.height, contextLost: lost };
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    releaseGpu();
    for (const b of bitmaps.values()) b.close();
    bitmaps.clear();
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    try { ctx.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* already lost */ }
    texturesDone();
    live--;
  };
  return { resize, render, pick, pickMany, probe, stats, texturesReady, dispose };
}

const DEFAULT_MATERIAL: MeshMaterial = {
  name: "default", baseColor: [0.8, 0.8, 0.8, 1], metallic: 0, roughness: 0.6, emissive: [0, 0, 0], baseColorTexture: -1, metallicRoughnessTexture: -1,
  normalTexture: -1, normalScale: 1, occlusionTexture: -1, occlusionStrength: 1, emissiveTexture: -1, alphaMode: "OPAQUE", alphaCutoff: 0.5, doubleSided: false
};
