import { afterEach, describe, expect, it } from "vitest";
import { testAssemblyModel, writeGlb } from "./glbWriter";
import type { MeshLibraryAsset } from "./meshAssetCatalog";
import { MESH_LIBRARY } from "./meshAssetCatalog";
import { clearMeshAssetCache, loadMeshModelAsset, meshAssetCacheStats, sha256Hex } from "./meshAssetLoader";
import { decodePickId, encodePickId, normalMatrix, orbitView, projectPoint } from "./meshCamera";
import { MESH_MODEL_LIMITS, meshAssetUrl, meshModelMissingParts, meshModelPlainText, validateMeshModelSpec, type MeshModelSpecV1 } from "./meshModelSpec";
import { computeNormals, textureScale } from "./meshRenderer";

// Phase 21D-B.1 — the MeshModelSpecV1 exam contract, the renderer's pure camera math and the integrity-checking asset loader.
const SHA = "a".repeat(64);
const PARTS = [{ id: "frontBlock", label: "الكتلة الأمامية" }, { id: "ball", label: "الكرة", description: "كرة خضراء" }];
const entry = (sha = SHA): MeshLibraryAsset => ({
  id: "test-assembly", version: 1, sha256: sha, byteLength: 100, title: "t", subject: "engineering",
  parts: [{ id: "frontBlock", label: "x" }, { id: "ball", label: "y" }, { id: "rod", label: "z" }],
  provenance: { source: "s", sourceUrl: "https://example.invalid", license: "l", licenseUrl: "https://example.invalid/l", attribution: "a", modifications: "m", educationalLimitations: "e", retrieved: "2026-10-10" }
});
const model = (patch: Partial<MeshModelSpecV1> = {}): MeshModelSpecV1 => ({
  version: 1, id: "heartModel", title: "نموذج", description: "وصف", asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA }, parts: PARTS,
  controls: { rotate: true, zoom: true, hideParts: false }, ...patch
});
const codes = (raw: unknown, library: readonly MeshLibraryAsset[] = [entry()]) => { const r = validateMeshModelSpec(raw, { library }); return r.ok ? [] : r.issues.map(i => i.code); };

describe("21D-B.1 MeshModelSpecV1 — versioned, strict, data only", () => {
  it("accepts a library reference (id, version, pinned SHA-256) and an upload reference (SHA-256 + length); emits a canonical copy", () => {
    const r = validateMeshModelSpec({ ...model(), camera: { azimuth: 0.5, elevation: -0.2, zoom: 1.4 } }, { library: [entry()] });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(Object.keys(r.value)).toEqual(["version", "id", "title", "description", "asset", "parts", "controls", "camera"]); expect(r.library?.id).toBe("test-assembly"); }
    expect(codes(model({ asset: { source: "upload", sha256: SHA, byteLength: 5000 } }))).toEqual([]);
    expect(MESH_LIBRARY).toEqual([]);                                                          // B.1 ships the contract; assets arrive in B.2
  });
  it("the runtime URL is derived by code from the hash only — same origin, no exam-supplied URL, no path traversal", () => {
    expect(meshAssetUrl({ source: "library", id: "x", version: 1, sha256: SHA })).toBe("/mesh-assets/" + SHA + ".glb");
    expect(meshAssetUrl({ source: "upload", sha256: SHA, byteLength: 10 })).toBe("/api/mesh-assets/runtime/" + SHA);
    expect(meshAssetUrl({ source: "upload", sha256: "../../etc/passwd", byteLength: 10 })).toBeNull();
    expect(codes(model({ asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA, url: "https://evil.example/m.glb" } as never }))).toContain("MESH_MODEL_UNKNOWN_KEY");
    expect(codes(model({ asset: { source: "url", href: "https://evil.example" } as never }))).toContain("MESH_MODEL_ASSET_INVALID");
  });
  it("library references must name a reviewed asset with the SAME bytes; labelled parts must exist in it", () => {
    expect(codes(model({ asset: { source: "library", id: "nope", version: 1, sha256: SHA } }))).toContain("MESH_MODEL_ASSET_UNKNOWN");
    expect(codes(model({ asset: { source: "library", id: "test-assembly", version: 2, sha256: SHA } }))).toContain("MESH_MODEL_ASSET_UNKNOWN");
    expect(codes(model({ asset: { source: "library", id: "test-assembly", version: 1, sha256: "b".repeat(64) } }))).toContain("MESH_MODEL_ASSET_HASH_MISMATCH");
    expect(codes(model({ parts: [...PARTS, { id: "liver", label: "كبد" }] }))).toContain("MESH_MODEL_PART_UNKNOWN");
    expect(codes(model({ asset: { source: "library", id: "test-assembly", version: 1, sha256: SHA.toUpperCase() } }))).toContain("MESH_MODEL_ASSET_INVALID");
  });
  it("refuses invalid configurations with a reason", () => {
    expect(codes(model({ parts: [] }))).toContain("MESH_MODEL_PARTS_COUNT");
    expect(codes(model({ parts: [PARTS[0], PARTS[0]] }))).toContain("MESH_MODEL_PART_DUPLICATE");
    expect(codes(model({ parts: [{ id: "__proto__", label: "x" }] }))).toContain("MESH_MODEL_PART_ID_INVALID");
    expect(codes(model({ parts: [{ id: "ball", label: "<script>x</script>" }] }))).toContain("MESH_MODEL_TEXT_INVALID");
    expect(codes(model({ parts: [{ id: "ball", label: "a\u202Eb" }] }))).toContain("MESH_MODEL_TEXT_INVALID");
    expect(codes(model({ parts: [{ id: "ball", label: "x".repeat(MESH_MODEL_LIMITS.labelChars + 1) }] }))).toContain("MESH_MODEL_TEXT_INVALID");
    expect(codes(model({ title: "" }))).toContain("MESH_MODEL_TEXT_INVALID");
    expect(codes(model({ id: "constructor" }))).toContain("MESH_MODEL_ID_INVALID");
    expect(codes(model({ version: 2 as 1 }))).toContain("MESH_MODEL_VERSION_INVALID");
    expect(codes(model({ controls: { rotate: true, zoom: "yes" as never, hideParts: false } }))).toContain("MESH_MODEL_FLAG_INVALID");
    expect(codes(model({ camera: { azimuth: 0, elevation: 2, zoom: 1 } }))).toContain("MESH_MODEL_NUMBER_INVALID");
    expect(codes(model({ camera: { azimuth: 0, elevation: 0, zoom: 9 } }))).toContain("MESH_MODEL_NUMBER_INVALID");
    expect(codes(model({ asset: { source: "upload", sha256: SHA, byteLength: 64 * 1024 * 1024 } }))).toContain("MESH_MODEL_ASSET_INVALID");
    expect(codes({ ...model(), geometry: [1, 2, 3] })).toContain("MESH_MODEL_UNKNOWN_KEY");
    expect(codes({ ...model(), parts: [{ ...PARTS[0], onclick: "x" }] })).toContain("MESH_MODEL_UNKNOWN_KEY");
  });
  it("never throws for hostile input (proxies, prototype tricks, wrong types)", () => {
    const hostile = new Proxy({}, { get() { throw new Error("boom"); }, ownKeys() { throw new Error("boom"); } });
    for (const raw of [null, 1, "x", [], hostile, Object.create({ version: 1 }), { version: 1, asset: hostile }]) expect(validateMeshModelSpec(raw).ok).toBe(false);
  });
  it("missing-part check and plain text", () => {
    expect(meshModelMissingParts(model(), ["frontBlock"])).toEqual(["ball"]);
    expect(meshModelPlainText(model())).toContain("الكرة: كرة خضراء");
  });
});

describe("21D-B.1 renderer math", () => {
  const bounds = { min: [-1, -0.8, -1] as [number, number, number], max: [1.1, 0.6, 1] as [number, number, number] };
  it("framing never depends on the orientation: every corner of the bounding box stays on screen at zoom 1, for any yaw / pitch and aspect", () => {
    for (const aspect of [0.6, 1, 1.6]) for (let yaw = -3; yaw <= 3; yaw += 0.6) for (let pitch = -1.4; pitch <= 1.4; pitch += 0.35) {
      const v = orbitView(bounds, { yaw, pitch, zoom: 1 }, aspect);
      for (const x of [bounds.min[0], bounds.max[0]]) for (const y of [bounds.min[1], bounds.max[1]]) for (const z of [bounds.min[2], bounds.max[2]]) {
        const p = projectPoint(v.viewProj, [x, y, z])!;
        expect(Math.abs(p[0])).toBeLessThan(1); expect(Math.abs(p[1])).toBeLessThan(1); expect(p[2]).toBeGreaterThan(-1); expect(p[2]).toBeLessThan(1);
      }
    }
  });
  it("yaw 0 looks along −Z from the front; zoom shortens the distance", () => {
    const v = orbitView(bounds, { yaw: 0, pitch: 0, zoom: 1 }, 1), z = orbitView(bounds, { yaw: 0, pitch: 0, zoom: 2 }, 1);
    expect(v.eye[2]).toBeGreaterThan(v.center[2]); expect(Math.abs(v.eye[0] - v.center[0])).toBeLessThan(1e-9);
    expect(z.distance).toBeCloseTo(v.distance / 2, 9);
  });
  it("normal matrix handles non-uniform scale; pick ids round-trip; smooth normals; texture budget", () => {
    const m = new Float32Array([2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]), n = normalMatrix(m);
    expect([n[0], n[4], n[8]].map(v => Math.round(v * 1000) / 1000)).toEqual([0.5, 1, 1]);
    for (const id of [0, 1, 63, 255, 256, 70000]) { const c = encodePickId(id).map(v => Math.round(v * 255)); expect(decodePickId(c[0], c[1], c[2])).toBe(id); }
    const normals = computeNormals(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint16Array([0, 1, 2]));
    expect(Array.from(normals.slice(0, 3))).toEqual([0, 0, 1]);
    expect(textureScale(4096, 4096, 2048, 1e9)).toBe(0.5);
    expect(textureScale(2048, 2048, 8192, 1024 * 1024)).toBe(0.5);
  });
});

describe("21D-B.1 asset loader — integrity before parsing, shared downloads, bounded cache", () => {
  afterEach(() => clearMeshAssetCache());
  const glb = writeGlb(testAssemblyModel());
  const fetchOf = (bytes: Uint8Array, opts: { status?: number; length?: number | null; chunks?: number } = {}) => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      const n = opts.chunks ?? 4, size = Math.ceil(bytes.length / n);
      const body = new ReadableStream<Uint8Array>({ start(c) { for (let i = 0; i < bytes.length; i += size) c.enqueue(bytes.slice(i, i + size)); c.close(); } });
      const headers = new Headers(opts.length === null ? {} : { "content-length": String(opts.length ?? bytes.length) });
      return new Response(body, { status: opts.status ?? 200, headers });
    }) as unknown as typeof fetch;
    return { impl, calls };
  };
  const specFor = async (bytes: Uint8Array, source: "library" | "upload" = "upload", parts = [{ id: "frontBlock", label: "أ" }]): Promise<MeshModelSpecV1> => {
    const sha = await sha256Hex(bytes);
    return model({ asset: source === "upload" ? { source, sha256: sha, byteLength: bytes.length } : { source, id: "test-assembly", version: 1, sha256: sha }, parts });
  };
  it("loads: same-origin derived URL, no redirects, credentials same-origin, streamed progress, verified hash, validated document", async () => {
    const m = await specFor(glb), f = fetchOf(glb), progress: number[] = [];
    const r = await loadMeshModelAsset(m, { fetchImpl: f.impl, onProgress: l => progress.push(l) });
    expect(r.ok).toBe(true);
    expect(f.calls[0].url).toBe("/api/mesh-assets/runtime/" + m.asset.sha256);
    expect(f.calls[0].init).toMatchObject({ redirect: "error", credentials: "same-origin" });
    expect(progress.length).toBeGreaterThanOrEqual(4); expect(progress.at(-1)).toBe(glb.length);
    if (r.ok) expect(r.value.summary.parts.length).toBe(5);
  });
  it("substituted bytes are refused BEFORE parsing (SHA-256 mismatch); a wrong length for an upload too", async () => {
    const m = await specFor(glb), flipped = glb.slice();
    flipped[flipped.length - 10] ^= 1;                                                          // same length, one bit changed
    const r = await loadMeshModelAsset(m, { fetchImpl: fetchOf(flipped).impl });
    expect(r.ok ? "" : r.error.code).toBe("MESH_LOAD_INTEGRITY");
    const other = writeGlb({ ...testAssemblyModel(), generator: "other" });                     // shorter than the pinned upload length
    expect(other.length).toBeLessThan(glb.length);
    const short = await loadMeshModelAsset(m, { fetchImpl: fetchOf(other).impl });
    expect(short.ok ? "" : short.error).toMatchObject({ code: "MESH_LOAD_INTEGRITY", detail: "length" });
    const lib = await specFor(glb, "library");
    const r2 = await loadMeshModelAsset(lib, { fetchImpl: fetchOf(other).impl, digest: async () => "f".repeat(64) });
    expect(r2.ok ? "" : r2.error.code).toBe("MESH_LOAD_INTEGRITY");
  });
  it("size caps: a declared or streamed body beyond the pinned length is cut off", async () => {
    const m = await specFor(glb);
    const declared = await loadMeshModelAsset(m, { fetchImpl: fetchOf(glb, { length: glb.length + 1 }).impl });
    expect(declared.ok ? "" : declared.error.code).toBe("MESH_LOAD_TOO_LARGE");
    const big = new Uint8Array(glb.length + 4096); big.set(glb);
    const streamed = await loadMeshModelAsset(m, { fetchImpl: fetchOf(big, { length: null }).impl });
    expect(streamed.ok ? "" : streamed.error.code).toBe("MESH_LOAD_TOO_LARGE");
  });
  it("HTTP / network errors, invalid assets and missing labelled parts fail closed with meaningful messages", async () => {
    const m = await specFor(glb);
    const http = await loadMeshModelAsset(m, { fetchImpl: fetchOf(glb, { status: 404 }).impl });
    expect(http.ok ? "" : http.error.code).toBe("MESH_LOAD_HTTP");
    const net = await loadMeshModelAsset(m, { fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    expect(net.ok ? "" : net.error.message).toContain("الاتصال");
    const junk = new Uint8Array(400).fill(7), mj = await specFor(junk);
    const invalid = await loadMeshModelAsset(mj, { fetchImpl: fetchOf(junk).impl });
    expect(invalid.ok ? "" : invalid.error.code).toBe("MESH_LOAD_INVALID");
    const mp = await specFor(glb, "upload", [{ id: "frontBlock", label: "أ" }, { id: "liver", label: "كبد" }]);
    const parts = await loadMeshModelAsset(mp, { fetchImpl: fetchOf(glb).impl });
    expect(parts.ok ? "" : parts.error).toMatchObject({ code: "MESH_LOAD_PARTS", detail: "liver" });
  });
  it("concurrent loads of one hash share one download; the parsed document is cached; the cache is byte-bounded", async () => {
    const m = await specFor(glb), f = fetchOf(glb);
    const [a, b] = await Promise.all([loadMeshModelAsset(m, { fetchImpl: f.impl }), loadMeshModelAsset(m, { fetchImpl: f.impl })]);
    expect([a.ok, b.ok, f.calls.length]).toEqual([true, true, 1]);
    const c = await loadMeshModelAsset(m, { fetchImpl: f.impl });
    expect([c.ok, f.calls.length, meshAssetCacheStats().entries]).toEqual([true, 1, 1]);
    expect(meshAssetCacheStats().bytes).toBeGreaterThan(10000);
  });
  it("aborting the last waiter aborts the shared download", async () => {
    const m = await specFor(glb);
    let seen: AbortSignal | null = null;
    const hanging = (async (_u: string, init: RequestInit) => { seen = init.signal ?? null; return new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))); }) as unknown as typeof fetch;
    const ctl = new AbortController(), p = loadMeshModelAsset(m, { fetchImpl: hanging, signal: ctl.signal });
    await new Promise(r => setTimeout(r, 5));
    ctl.abort();
    const r = await p;
    expect(r.ok ? "" : r.error.code).toBe("MESH_LOAD_ABORTED");
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
  });
});
