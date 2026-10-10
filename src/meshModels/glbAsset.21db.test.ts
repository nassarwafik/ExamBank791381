import { describe, expect, it } from "vitest";
import { MESH_ASSET_LIMITS, decodeUtf8Strict, inspectGlbAsset, isMeshPartId, sniffImage, type MeshAssetLimits } from "./glbAsset";
import { assembleGlb, boxGeometry, checkerPng, encodePng, testAssemblyModel, writeGlb } from "./glbWriter";

// Phase 21D-B.1 — the GLB 2.0 authority: what it accepts (the normalised document), and every class of hostile / unsupported input it
// refuses with a reason (never repaired, never thrown).
const valid = () => writeGlb(testAssemblyModel());
/** Splits a GLB into its JSON document and BIN chunk, so a test can tamper with the JSON and re-assemble a well-formed container. */
function parts(glb: Uint8Array): { json: Record<string, any>; bin: Uint8Array } {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength), jl = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jl)));
  const bl = dv.getUint32(20 + jl, true);
  return { json, bin: glb.slice(28 + jl, 28 + jl + bl) };
}
const tamper = (mutate: (json: Record<string, any>, bin: Uint8Array) => void) => { const { json, bin } = parts(valid()); mutate(json, bin); return assembleGlb(json, bin); };
const code = (bytes: Uint8Array, limits?: Partial<MeshAssetLimits>) => { const r = inspectGlbAsset(bytes, limits ? { limits } : {}); return r.ok ? "OK" : r.issues[0].code; };

describe("21D-B.1 GLB authority — accepted documents", () => {
  it("accepts the test assembly and returns a normalised document: named parts, world transforms, materials, an embedded PNG texture", () => {
    const r = inspectGlbAsset(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.parts.map(p => p.id)).toEqual(["basePlate", "frontBlock", "backPlate", "ball", "rod"]);
    expect([r.summary.triangles, r.summary.vertices, r.summary.materials, r.summary.textures, r.summary.texturePixels]).toEqual([1188, 767, 5, 1, 4096]);
    const front = r.document.parts.find(p => p.id === "frontBlock")!;
    expect(Array.from(front.matrix.slice(12, 15)).map(v => Math.round(v * 100) / 100)).toEqual([0, -0.05, 0.55]);          // translation resolved
    expect(front.bounds.max[2]).toBeCloseTo(0.86, 5);
    expect(r.document.images[0]).toMatchObject({ mimeType: "image/png", width: 64, height: 64 });
    expect(r.document.materials[0].baseColorTexture).toBe(0);
    expect(r.document.parts[0].primitives[0].indices).toBeInstanceOf(Uint16Array);
  });
  it("accepts a document without a scene (parentless nodes are the roots), without normals and without indices", () => {
    const g = boxGeometry(1, 1, 1);
    const flat = new Float32Array(Array.from(g.indices).flatMap(i => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]]));
    const bin = new Uint8Array(flat.buffer.slice(0));
    const json = { asset: { version: "2.0" }, nodes: [{ name: "cube", mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: flat.length / 3, type: "VEC3" }], bufferViews: [{ buffer: 0, byteLength: bin.length }], buffers: [{ byteLength: bin.length }] };
    const r = inspectGlbAsset(assembleGlb(json, bin));
    expect(r.ok).toBe(true);
    if (r.ok) expect([r.document.parts[0].primitives[0].normals, r.summary.triangles]).toEqual([null, 12]);
  });
  it("part ids are plain ASCII identifiers (no prototype names, no paths)", () => {
    for (const ok of ["leftVentricle", "LV", "aorta_1", "a-b"]) expect(isMeshPartId(ok)).toBe(true);
    for (const bad of ["", "1abc", "../x", "a/b", "__proto__", "constructor", "x".repeat(49), "قلب", "a b"]) expect(isMeshPartId(bad)).toBe(false);
  });
});

describe("21D-B.1 GLB authority — refusals (each with a reason)", () => {
  it("container: magic, version, length, chunk order, chunk types, trailing bytes, truncation", () => {
    const g = valid();
    const w = (o: number, v: number) => { const c = g.slice(); new DataView(c.buffer).setUint32(o, v, true); return c; };
    expect(code(new Uint8Array(10))).toBe("MESH_ASSET_HEADER");
    expect(code(w(0, 0x12345678))).toBe("MESH_ASSET_HEADER");
    expect(code(w(4, 1))).toBe("MESH_ASSET_VERSION");
    expect(code(w(8, g.length + 4))).toBe("MESH_ASSET_LENGTH");
    expect(code(w(16, 0x004e4942))).toBe("MESH_ASSET_CHUNK");
    expect(code(g.slice(0, g.length - 4))).toBe("MESH_ASSET_LENGTH");
    const extra = new Uint8Array(g.length + 8); extra.set(g); new DataView(extra.buffer).setUint32(8, extra.length, true);
    expect(code(extra)).toBe("MESH_ASSET_CHUNK");                                                    // bytes after the chunks
    const { json } = parts(g);
    expect(code(assembleGlb(json, null))).toBe("MESH_ASSET_BUFFER");                                 // no BIN chunk
    const badUtf8 = g.slice(); badUtf8[20] = 0xc0; badUtf8[21] = 0xaf;
    expect(code(badUtf8)).toBe("MESH_ASSET_JSON");
  });
  it("never loads anything outside the file: every uri (http, data:, relative path) is refused", () => {
    for (const uri of ["https://evil.example/x.bin", "data:application/octet-stream;base64,AAAA", "../../etc/passwd", "model.bin"]) {
      expect(code(tamper(j => { j.buffers[0].uri = uri; }))).toBe("MESH_ASSET_EXTERNAL_REFERENCE");
      expect(code(tamper(j => { j.images[0].uri = uri; delete j.images[0].bufferView; }))).toBe("MESH_ASSET_EXTERNAL_REFERENCE");
    }
  });
  it("no extensions, no extras, no decoder: extensionsUsed / extensionsRequired / extensions / extras are refused", () => {
    expect(code(tamper(j => { j.extensionsUsed = ["KHR_draco_mesh_compression"]; }))).toBe("MESH_ASSET_EXTENSION");
    expect(code(tamper(j => { j.extensionsRequired = ["EXT_meshopt_compression"]; }))).toBe("MESH_ASSET_EXTENSION");
    expect(code(tamper(j => { j.materials[1].extensions = { KHR_materials_transmission: {} }; }))).toBe("MESH_ASSET_EXTENSION");
    expect(code(tamper(j => { j.nodes[1].extras = { script: "alert(1)" }; }))).toBe("MESH_ASSET_EXTENSION");
    expect(code(tamper(j => { j.extensionsUsed = []; }))).toBe("OK");
  });
  it("unsupported features are refused, not ignored: animations, skins, cameras, morph targets, non-triangle modes, extra UV sets, sparse accessors", () => {
    expect(code(tamper(j => { j.animations = []; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.skins = []; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.cameras = []; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.meshes[0].primitives[0].targets = []; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.meshes[0].primitives[0].mode = 1; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.meshes[0].primitives[0].attributes.TEXCOORD_1 = 0; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.meshes[0].primitives[0].attributes.JOINTS_0 = 0; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.accessors[0].sparse = { count: 1 }; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.materials[0].pbrMetallicRoughness.baseColorTexture.texCoord = 1; }))).toBe("MESH_ASSET_UNSUPPORTED");
  });
  it("bounds: buffer views, accessors, strides, offsets and every index are checked against the bytes present", () => {
    expect(code(tamper(j => { j.bufferViews[0].byteLength = 1e9; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.bufferViews[0].buffer = 1; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.accessors[0].count = j.accessors[0].count + 50; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.accessors[0].byteOffset = 2; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.bufferViews[0].byteStride = 6; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.accessors[0].bufferView = 999; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.meshes[0].primitives[0].material = 99; }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { j.nodes[0].children = [42]; }))).toBe("MESH_ASSET_BOUNDS");
    // an index pointing past the vertex count (the GPU must never read out of bounds)
    expect(code(tamper((j, bin) => { const a = j.accessors[j.meshes[0].primitives[0].indices], v = j.bufferViews[a.bufferView]; new DataView(bin.buffer).setUint16(v.byteOffset, 60000, true); }))).toBe("MESH_ASSET_BOUNDS");
    expect(code(tamper(j => { const a = j.accessors[j.meshes[0].primitives[0].indices]; a.count = a.count - 1; }))).toBe("MESH_ASSET_SHAPE");   // not a multiple of 3
    expect(code(tamper(j => { j.accessors[0].componentType = 5130; }))).toBe("MESH_ASSET_SHAPE");
  });
  it("numbers: NaN / ∞ positions, invalid transforms and non-unit rotations are refused", () => {
    expect(code(tamper((j, bin) => { new DataView(bin.buffer).setFloat32(j.bufferViews[0].byteOffset + 4, NaN, true); }))).toBe("MESH_ASSET_NUMBER");
    expect(code(tamper((j, bin) => { new DataView(bin.buffer).setFloat32(j.bufferViews[0].byteOffset, Infinity, true); }))).toBe("MESH_ASSET_NUMBER");
    expect(code(tamper(j => { j.nodes[1].rotation = [0, 0, 0, 2]; }))).toBe("MESH_ASSET_NUMBER");
    expect(code(tamper(j => { j.nodes[1].scale = [1, 0, 1]; }))).toBe("MESH_ASSET_NUMBER");
    expect(code(tamper(j => { j.nodes[1].matrix = new Array(16).fill(1); }))).toBe("MESH_ASSET_SHAPE");          // matrix AND translation
    expect(code(tamper(j => { delete j.nodes[1].translation; j.nodes[1].matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, "x"]; }))).toBe("MESH_ASSET_NUMBER");
    expect(code(tamper(j => { j.materials[0].pbrMetallicRoughness.metallicFactor = 2; }))).toBe("MESH_ASSET_NUMBER");
  });
  it("node graph: cycles, two parents, invalid scene roots, too deep a tree", () => {
    expect(code(tamper(j => { j.nodes[1].children = [0]; }))).toBe("MESH_ASSET_GRAPH");                // root ↔ child cycle
    expect(code(tamper(j => { j.nodes[1].children = [2]; }))).toBe("MESH_ASSET_GRAPH");                // node 2 has two parents
    expect(code(tamper(j => { j.scenes[0].nodes = [1]; }))).toBe("MESH_ASSET_GRAPH");                  // a child as a scene root
    expect(code(tamper(j => { j.scene = 3; }))).toBe("MESH_ASSET_BOUNDS");
    const chain = (n: number) => tamper(j => {
      const base = j.nodes.length;
      for (let i = 0; i < n; i++) j.nodes.push({ name: "g" + i, children: i + 1 < n ? [base + i + 1] : [] });
      j.nodes[0].children = [...j.nodes[0].children, base];
    });
    expect(code(chain(5))).toBe("OK");
    expect(code(chain(20))).toBe("MESH_ASSET_GRAPH");
  });
  it("parts: every mesh-bearing node has a unique, valid part name", () => {
    expect(code(tamper(j => { delete j.nodes[1].name; }))).toBe("MESH_ASSET_PART_NAME");
    expect(code(tamper(j => { j.nodes[1].name = "../escape"; }))).toBe("MESH_ASSET_PART_NAME");
    expect(code(tamper(j => { j.nodes[1].name = "__proto__"; }))).toBe("MESH_ASSET_PART_NAME");
    expect(code(tamper(j => { j.nodes[2].name = j.nodes[1].name; }))).toBe("MESH_ASSET_PART_DUPLICATE");
    expect(code(tamper(j => { j.nodes[1].name = "<script>"; }))).toBe("MESH_ASSET_NAME");
    expect(code(tamper(j => { j.nodes[0].children = []; }))).toBe("MESH_ASSET_EMPTY");
  });
  it("images: only PNG / JPEG whose bytes match the declared type; dimensions bounded without decoding", () => {
    expect(code(tamper(j => { j.images[0].mimeType = "image/svg+xml"; }))).toBe("MESH_ASSET_IMAGE");
    expect(code(tamper(j => { j.images[0].mimeType = "image/jpeg"; }))).toBe("MESH_ASSET_IMAGE");       // PNG bytes declared as JPEG
    expect(code(tamper((j, bin) => { bin[j.bufferViews[j.images[0].bufferView].byteOffset] = 0; }))).toBe("MESH_ASSET_IMAGE");
    expect(code(valid(), { maxImageSide: 32 })).toBe("MESH_ASSET_LIMIT");
    expect(code(valid(), { maxTexturePixels: 1000 })).toBe("MESH_ASSET_LIMIT");
    expect(sniffImage(checkerPng(16), "image/png")).toEqual({ width: 16, height: 16 });
    // the second, independent guard: the signature sniffer accepts nothing but PNG / JPEG whatever the bytes are
    for (const type of ["image/svg+xml", "image/gif", "image/webp", "text/html", ""]) expect(sniffImage(checkerPng(16), type)).toBeNull();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 48, 0, 64, 3, 1, 0x22, 0, 0xff, 0xd9]);
    expect(sniffImage(jpeg, "image/jpeg")).toEqual({ width: 64, height: 48 });
    expect(sniffImage(jpeg.slice(0, 10), "image/jpeg")).toBeNull();
    expect(sniffImage(encodePng(3, 2, new Uint8Array(24)), "image/png")).toEqual({ width: 3, height: 2 });
  });
  it("budgets: size, JSON size, triangles, vertices, parts, materials", () => {
    expect(code(valid(), { maxBytes: 1000 })).toBe("MESH_ASSET_TOO_LARGE");
    expect(code(valid(), { maxJsonBytes: 100 })).toBe("MESH_ASSET_TOO_LARGE");
    expect(code(valid(), { maxTriangles: 1000 })).toBe("MESH_ASSET_LIMIT");
    expect(code(valid(), { maxVertices: 500 })).toBe("MESH_ASSET_LIMIT");
    expect(code(valid(), { maxParts: 4 })).toBe("MESH_ASSET_LIMIT");
    expect(code(valid(), { maxMaterials: 2 })).toBe("MESH_ASSET_LIMIT");
    expect(MESH_ASSET_LIMITS).toMatchObject({ maxBytes: 16 * 1024 * 1024, maxTriangles: 400_000, maxParts: 64, maxImageSide: 2048 });
  });
  it("strict shape: unknown keys anywhere, missing required keys, wrong glTF version", () => {
    expect(code(tamper(j => { j.foo = 1; }))).toBe("MESH_ASSET_UNSUPPORTED");
    expect(code(tamper(j => { j.meshes[0].primitives[0].attributes.POSITION = undefined; delete j.meshes[0].primitives[0].attributes.POSITION; }))).toBe("MESH_ASSET_SHAPE");
    expect(code(tamper(j => { j.asset.version = "1.0"; }))).toBe("MESH_ASSET_VERSION");
    expect(code(tamper(j => { j.asset.generator = "x".repeat(500); }))).toBe("MESH_ASSET_NAME");
    expect(code(tamper(j => { j.buffers.push({ byteLength: 4 }); }))).toBe("MESH_ASSET_LIMIT");
  });
  it("never throws: 400 seeded random corruptions of a valid file all return a verdict", () => {
    const g = valid();
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let refused = 0;
    for (let i = 0; i < 400; i++) {
      const c = g.slice(), n = 1 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) c[Math.floor(rnd() * c.length)] = Math.floor(rnd() * 256);
      const r = inspectGlbAsset(c);
      expect(typeof r.ok).toBe("boolean");
      if (!r.ok) { refused++; expect(r.issues[0].message.length).toBeGreaterThan(5); }
    }
    expect(refused).toBeGreaterThan(50);
    expect(inspectGlbAsset("not bytes" as unknown as Uint8Array).ok).toBe(false);
  });
  it("strict UTF-8: overlong forms, surrogates and truncated sequences are invalid", () => {
    expect(decodeUtf8Strict(new TextEncoder().encode("قلب ♥ 😀"))).toBe("قلب ♥ 😀");
    for (const bad of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xe2, 0x82], [0xf8, 0x88, 0x80, 0x80, 0x80], [0xf4, 0x90, 0x80, 0x80]]) expect(decodeUtf8Strict(new Uint8Array(bad))).toBeNull();
  });
});
