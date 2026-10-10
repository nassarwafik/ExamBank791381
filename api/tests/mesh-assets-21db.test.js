import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { assembleGlb, testAssemblyModel, writeGlb } from "../../src/meshModels/glbWriter";
import { uploadHandler, listHandler, runtimeHandler, RUNTIME_HEADERS } from "../src/functions/mesh-assets.js";
import { BLOBS_PREFIX, RECORDS_PREFIX, OWNERS_PREFIX, ownerHashOf, displayNameOf } from "../src/lib/mesh-assets/store.js";

// Phase 21D-B.1 — mesh asset storage: the server validates every upload with the SHARED GLB authority (the same code the browser runs),
// stores the exact bytes content-addressed (create-only, deduplicated), indexes them per teacher, and serves them through a public
// capability route that re-verifies the bytes against their hash and can never become a document.
const teacherA = { ok: true, user: { sub: "teacher-a", role: "teacher" } }, teacherB = { ok: true, user: { sub: "teacher-b", role: "teacher" } };
const depsFor = (container, auth) => ({ getContainer: () => container, requireBuilderAuth: () => auth });
const glb = Buffer.from(writeGlb(testAssemblyModel()));
const hex = crypto.createHash("sha256").update(glb).digest("hex");
const upload = (buffer, name = "heart.glb", extra = {}) => ({ method: "POST", url: "https://app.example/api/mesh-assets/upload", headers: new Headers({ "x-file-name": encodeURIComponent(name), "content-length": String(buffer.length), ...extra }), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), params: {} });
const get = (hash) => ({ method: "GET", url: "https://app.example/api/mesh-assets/runtime/" + hash, headers: new Headers(), params: { hash } });

describe("21D-B.1 mesh asset upload (server authority)", () => {
  it("requires builder auth, a .glb name and a bounded size", async () => {
    const c = createMemoryContainer();
    expect((await uploadHandler(upload(glb), depsFor(c.container, { ok: false, response: { status: 401 } }))).status).toBe(401);
    expect((await uploadHandler(upload(glb, "model.gltf"), depsFor(c.container, teacherA))).status).toBe(400);
    expect((await uploadHandler(upload(glb, "model.glb.exe"), depsFor(c.container, teacherA))).status).toBe(400);
    expect((await uploadHandler(upload(glb, "m.glb", { "content-length": String(64 * 1024 * 1024) }), depsFor(c.container, teacherA))).status).toBe(413);
    expect((await uploadHandler(upload(Buffer.alloc(0)), depsFor(c.container, teacherA))).status).toBe(400);
    expect(c.names("mesh-assets/")).toEqual([]);
  });
  it("refuses an unsafe or malformed GLB with the authority's reason and stores NOTHING", async () => {
    const c = createMemoryContainer();
    const evil = Buffer.from(assembleGlb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4, uri: "https://evil.example/payload.bin" }], bufferViews: [], accessors: [], meshes: [], nodes: [] }, null));
    const r = await uploadHandler(upload(evil), depsFor(c.container, teacherA));
    expect(r.status).toBe(400);
    expect(r.jsonBody.issues[0].code).toBe("MESH_ASSET_EXTERNAL_REFERENCE");
    const junk = await uploadHandler(upload(Buffer.from("<html><script>alert(1)</script></html>")), depsFor(c.container, teacherA));
    expect([junk.status, junk.jsonBody.issues[0].code]).toEqual([400, "MESH_ASSET_HEADER"]);
    expect(c.names("mesh-assets/")).toEqual([]);
  });
  it("stores a valid GLB content-addressed (blob + record + owner index); re-upload is idempotent; another teacher shares the bytes, not the index", async () => {
    const c = createMemoryContainer();
    const first = await uploadHandler(upload(glb, "../../نموذج القلب.glb"), depsFor(c.container, teacherA));
    expect(first.status).toBe(201);
    expect(first.jsonBody.asset).toMatchObject({ sha256: hex, byteLength: glb.length, triangles: 1188, name: "نموذج القلب.glb" });
    expect(first.jsonBody.asset.parts.map(p => p.id)).toEqual(["basePlate", "frontBlock", "backPlate", "ball", "rod"]);
    expect(c.getBinary(BLOBS_PREFIX + hex + ".glb").buffer.equals(glb)).toBe(true);
    expect(c.getBinary(BLOBS_PREFIX + hex + ".glb").contentType).toBe("model/gltf-binary");
    expect(c.getJson(RECORDS_PREFIX + hex + ".json").validator).toBe("glb-21d-b1");
    const again = await uploadHandler(upload(glb), depsFor(c.container, teacherA));
    expect([again.status, again.jsonBody.status]).toEqual([200, "exists"]);
    const other = await uploadHandler(upload(glb), depsFor(c.container, teacherB));
    expect(other.status).toBe(201);
    expect(c.names(BLOBS_PREFIX)).toEqual([BLOBS_PREFIX + hex + ".glb"]);
    expect(c.names(OWNERS_PREFIX).sort()).toEqual([OWNERS_PREFIX + ownerHashOf("teacher-a") + "/" + hex + ".json", OWNERS_PREFIX + ownerHashOf("teacher-b") + "/" + hex + ".json"].sort());
    expect(c.names(OWNERS_PREFIX).some(n => n.includes("teacher-a"))).toBe(false);                         // owner identities are hashed
  });
  it("lists only the caller's own assets", async () => {
    const c = createMemoryContainer();
    await uploadHandler(upload(glb), depsFor(c.container, teacherA));
    const a = await listHandler({ headers: new Headers() }, depsFor(c.container, teacherA)), b = await listHandler({ headers: new Headers() }, depsFor(c.container, teacherB));
    expect(a.jsonBody.assets.map(x => x.sha256)).toEqual([hex]);
    expect(b.jsonBody.assets).toEqual([]);
    expect((await listHandler({ headers: new Headers() }, depsFor(c.container, null))).status).toBe(401);
  });
  it("display names are sanitised (no path, no markup, bounded)", () => {
    expect(displayNameOf("C:\\x\\..\\a<b>\"c.glb")).toBe("abc.glb");
    expect(displayNameOf("")).toBe("model.glb");
    expect(displayNameOf("a\u202Eb.glb")).toBe("ab.glb");
    expect(displayNameOf("x".repeat(200) + ".glb").length).toBe(80);
  });
});

describe("21D-B.1 mesh asset runtime route (public capability)", () => {
  it("serves the exact bytes with headers that can never turn them into a document", async () => {
    const c = createMemoryContainer();
    await uploadHandler(upload(glb), depsFor(c.container, teacherA));
    const r = await runtimeHandler(get(hex), depsFor(c.container, null));
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body).equals(glb)).toBe(true);
    expect(r.headers).toMatchObject({ ...RUNTIME_HEADERS, "Content-Length": String(glb.length) });
    expect(r.headers["Content-Disposition"]).toBe("attachment; filename=\"model-" + hex.slice(0, 12) + ".glb\"");
    expect(r.headers["Content-Security-Policy"]).toContain("sandbox");
    expect(r.headers["X-Content-Type-Options"]).toBe("nosniff");
  });
  it("unknown, malformed and traversal-shaped hashes are 404; a blob without its record is never served", async () => {
    const c = createMemoryContainer();
    await uploadHandler(upload(glb), depsFor(c.container, teacherA));
    for (const h of ["", "abc", hex.toUpperCase(), "../" + hex, hex + "/x", "f".repeat(64)]) expect((await runtimeHandler(get(h), depsFor(c.container, null))).status).toBe(404);
    c.store.delete(RECORDS_PREFIX + hex + ".json");
    expect((await runtimeHandler(get(hex), depsFor(c.container, null))).status).toBe(404);
  });
  it("integrity at rest: bytes that no longer match their hash are refused (500), never served", async () => {
    const c = createMemoryContainer();
    await uploadHandler(upload(glb), depsFor(c.container, teacherA));
    const tampered = Buffer.from(glb); tampered[tampered.length - 5] ^= 0xff;
    c.store.set(BLOBS_PREFIX + hex + ".glb", { content: tampered, etag: "x", contentType: "model/gltf-binary" });
    const r = await runtimeHandler(get(hex), depsFor(c.container, null));
    expect(r.status).toBe(500);
    expect(r.body).not.toBeInstanceOf(Buffer);
  });
});
