import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { vanillaPackage, reactDistPackage } from "./fixtures/smartsim-zip.js";
import { listOwnerPackages, listOwnerPackageVersions, loadPackageRecordByHash, loadPackageAsset, ownerHashOf, PACKAGES_PREFIX, OWNERS_PREFIX, packageAvailabilityIssues } from "../src/lib/smartsim/package-store.js";
import { uploadHandler, listHandler, versionsHandler, runtimeHandler } from "../src/functions/simulators.js";

// Phase 16B-A — immutable, content-addressed, teacher-owned simulator packages: same id/version/hash idempotent, same
// identity + different bytes → conflict (never overwrite), V1 stays retrievable after V2, teacher isolation, the runtime
// serving route (hash capability, safe paths, strict MIME, immutable cache + CSP headers). Fail-first on 6bb3b97.
const teacherA = { ok: true, user: { sub: "teacher-a", role: "teacher" } }, teacherB = { ok: true, user: { sub: "teacher-b", role: "teacher" } };
const depsFor = (container, auth) => ({ getContainer: () => container, requireBuilderAuth: () => auth });
function uploadRequest(buffer, name = "counter.smartsim", type = "application/zip", extraHeaders = {}) {
  return { method: "POST", url: "https://app.example/api/simulators/upload", headers: new Headers({ "x-file-name": encodeURIComponent(name), "x-file-type": type, "content-length": String(buffer.length), ...extraHeaders }), arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length), params: {}, query: new URLSearchParams() };
}
const getReq = (url, params = {}) => ({ method: "GET", url, headers: new Headers(), params, query: new URL(url).searchParams });

describe("S18 / S19 / S20 — content-addressed immutability", () => {
  it("S18 same id / version / identical bytes is idempotent (exists, same hash, no second write); S19 same identity + different bytes conflicts (409, VERSION_HASH_CONFLICT) and the stored package is untouched", async () => {
    const c = createMemoryContainer();
    const first = await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, teacherA));
    expect(first.status).toBe(201); expect(first.jsonBody.ok).toBe(true); expect(first.jsonBody.package.packageHash).toMatch(/^sha256:/);
    const hash = first.jsonBody.package.packageHash;
    const again = await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, teacherA));
    expect(again.status).toBe(200); expect(again.jsonBody.status).toBe("exists"); expect(again.jsonBody.package.packageHash).toBe(hash);
    const different = await uploadHandler(uploadRequest(vanillaPackage({ description: "changed bytes" })), depsFor(c.container, teacherA));
    expect(different.status).toBe(409); expect(different.jsonBody.ok).toBe(false);
    expect(different.jsonBody.report.issues.map(i => i.code)).toContain("VERSION_HASH_CONFLICT");
    expect(different.jsonBody.existing.packageHash).toBe(hash);
    const rec = c.getJson(OWNERS_PREFIX + ownerHashOf("teacher-a") + "/counter-sim/1.json");
    expect(rec.packageHash).toBe(hash);
    expect(c.names(PACKAGES_PREFIX).filter(n => n.endsWith("/metadata.json")).length).toBe(1);
  });
  it("S20 V1 remains retrievable byte-for-byte after V2 is uploaded; the runtime never resolves latest", async () => {
    const c = createMemoryContainer();
    const v1 = await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, teacherA));
    const v2 = await uploadHandler(uploadRequest(vanillaPackage({ packageVersion: 2, description: "v2" })), depsFor(c.container, teacherA));
    expect(v1.status).toBe(201); expect(v2.status).toBe(201); expect(v1.jsonBody.package.packageHash).not.toBe(v2.jsonBody.package.packageHash);
    const h1 = v1.jsonBody.package.packageHash.slice(7), h2 = v2.jsonBody.package.packageHash.slice(7);
    const a1 = await runtimeHandler(getReq("https://app.example/api/simulators/runtime/counter-sim/1/" + h1 + "/index.html", { packageId: "counter-sim", packageVersion: "1", hash: h1, assetPath: "index.html" }), depsFor(c.container, null));
    const a2 = await runtimeHandler(getReq("https://app.example/api/simulators/runtime/counter-sim/2/" + h2 + "/index.html", { packageId: "counter-sim", packageVersion: "2", hash: h2, assetPath: "index.html" }), depsFor(c.container, null));
    expect(a1.status).toBe(200); expect(a2.status).toBe(200);
    // identity / hash must agree: V1's hash under V2's version (or vice versa) is refused, and "latest" is not a version
    const mixed = await runtimeHandler(getReq("https://app.example/api/simulators/runtime/counter-sim/2/" + h1 + "/index.html", { packageId: "counter-sim", packageVersion: "2", hash: h1, assetPath: "index.html" }), depsFor(c.container, null));
    expect(mixed.status).toBe(404);
    const latest = await runtimeHandler(getReq("https://app.example/api/simulators/runtime/counter-sim/latest/" + h2 + "/index.html", { packageId: "counter-sim", packageVersion: "latest", hash: h2, assetPath: "index.html" }), depsFor(c.container, null));
    expect(latest.status).toBe(404);
    const versions = await versionsHandler(getReq("https://app.example/api/simulators/counter-sim", { packageId: "counter-sim" }), depsFor(c.container, teacherA));
    expect(versions.jsonBody.versions.map(v => v.packageVersion)).toEqual([1, 2]);
    const rec1 = await loadPackageRecordByHash(c.container, v1.jsonBody.package.packageHash);
    expect(rec1.packageVersion).toBe(1); expect(rec1.entry).toBe("index.html");
  });
  it("the store persists ONLY the runtime file set (manifest + dist/**) as immutable blobs under the hash plus the original archive; source/ is never persisted", async () => {
    const c = createMemoryContainer();
    const r = await uploadHandler(uploadRequest(reactDistPackage(), "react-sim.zip"), depsFor(c.container, teacherA));
    expect(r.status).toBe(201);
    const hash = r.jsonBody.package.packageHash;
    const names = c.names(PACKAGES_PREFIX + hash.slice(7) + "/");
    expect(names).toEqual(expect.arrayContaining([PACKAGES_PREFIX + hash.slice(7) + "/metadata.json", PACKAGES_PREFIX + hash.slice(7) + "/package.smartsim", PACKAGES_PREFIX + hash.slice(7) + "/dist/index.html", PACKAGES_PREFIX + hash.slice(7) + "/dist/assets/index-abc123.js"]));
    expect(names.some(n => n.includes("/source/"))).toBe(false);
    const asset = await loadPackageAsset(c.container, hash, "assets/index-abc123.js");
    expect(asset.contentType).toMatch(/javascript/); expect(asset.buffer.toString("utf8")).toContain("React Sim");
    expect(await loadPackageAsset(c.container, hash, "../metadata.json")).toBeNull();
    expect(await loadPackageAsset(c.container, hash, "metadata.json")).toBeNull();            // never served as a runtime asset
  });
});

describe("S21 — ownership isolation", () => {
  it("Teacher B cannot list, read versions of, or conflict with Teacher A's package identity; B's own identical upload is B's own record", async () => {
    const c = createMemoryContainer();
    await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, teacherA));
    const listA = await listHandler(getReq("https://app.example/api/simulators"), depsFor(c.container, teacherA));
    const listB = await listHandler(getReq("https://app.example/api/simulators"), depsFor(c.container, teacherB));
    expect(listA.jsonBody.packages.map(p => p.packageId)).toEqual(["counter-sim"]); expect(listB.jsonBody.packages).toEqual([]);
    const vB = await versionsHandler(getReq("https://app.example/api/simulators/counter-sim", { packageId: "counter-sim" }), depsFor(c.container, teacherB));
    expect(vB.status).toBe(404);
    // B uploads DIFFERENT bytes under the same identity: not a conflict with A (separate owner namespace), B's own record
    const bUp = await uploadHandler(uploadRequest(vanillaPackage({ description: "B's counter" })), depsFor(c.container, teacherB));
    expect(bUp.status).toBe(201);
    expect((await listHandler(getReq("https://app.example/api/simulators"), depsFor(c.container, teacherA))).jsonBody.packages[0].packageHash).not.toBe(bUp.jsonBody.package.packageHash);
    expect(listA.jsonBody.packages[0].owner).toBeUndefined();                                    // owner hash never echoed
    expect(JSON.stringify(listA.jsonBody)).not.toContain("teacher-a");
    expect((await listOwnerPackages(c.container, ownerHashOf("teacher-b"))).length).toBe(1);
    expect((await listOwnerPackageVersions(c.container, ownerHashOf("teacher-a"), "counter-sim")).length).toBe(1);
  });
  it("upload requires builder auth; rejects an empty body, a non-package file and an oversized declared length before reading", async () => {
    const c = createMemoryContainer();
    expect((await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }))).status).toBe(401);
    expect((await uploadHandler(uploadRequest(Buffer.alloc(0)), depsFor(c.container, teacherA))).status).toBe(400);
    const bad = await uploadHandler(uploadRequest(Buffer.from("<html>nope</html>"), "sim.smartsim"), depsFor(c.container, teacherA));
    expect(bad.status).toBe(400); expect(bad.jsonBody.report.issues.map(i => i.code)).toContain("INVALID_ZIP");
    expect((await uploadHandler(uploadRequest(vanillaPackage(), "counter.smartsim", "application/zip", { "content-length": String(50 * 1024 * 1024) }), depsFor(c.container, teacherA))).status).toBe(413);
    expect((await uploadHandler(uploadRequest(vanillaPackage(), "counter.rar"), depsFor(c.container, teacherA))).status).toBe(400);
  });
});

describe("S47 / S79 / S90 / S91 — runtime serving", () => {
  it("serves exact stored assets with strict MIME, immutable cache, CSP and security headers; refuses traversal, listing, metadata and unknown identities", async () => {
    const c = createMemoryContainer();
    const up = await uploadHandler(uploadRequest(reactDistPackage()), depsFor(c.container, teacherA));
    const hash = up.jsonBody.package.packageHash.slice(7);
    const serve = (assetPath, over = {}) => runtimeHandler(getReq("https://app.example/api/simulators/runtime/react-sim/1/" + hash + "/" + assetPath, { packageId: "react-sim", packageVersion: "1", hash, assetPath, ...over }), depsFor(c.container, null));
    const html = await serve("index.html");
    expect(html.status).toBe(200); expect(html.headers["Content-Type"]).toBe("text/html; charset=utf-8");
    expect(html.headers["Cache-Control"]).toBe("no-cache");                                   // RF: executable documents revalidate; assets below stay immutable
    expect(html.headers["X-Content-Type-Options"]).toBe("nosniff"); expect(html.headers["Referrer-Policy"]).toBe("no-referrer"); expect(html.headers["Cross-Origin-Resource-Policy"]).toBe("cross-origin"); expect(html.headers["Access-Control-Allow-Origin"]).toBe("*");
    const csp = html.headers["Content-Security-Policy"];
    expect(csp).toMatch(/default-src 'none'/); expect(csp).toMatch(/connect-src 'none'/); expect(csp).toMatch(/frame-src 'none'/); expect(csp).toMatch(/object-src 'none'/); expect(csp).toMatch(/base-uri 'none'/); expect(csp).toMatch(/form-action 'none'/); expect(csp).toMatch(/frame-ancestors 'self'/);
    expect(csp).not.toMatch(/connect-src \*/); expect(csp).not.toMatch(/script-src[^;]*\shttps:(?:\s|;)/);                                            // no bare https: scheme source
    expect(csp).toMatch(/^sandbox allow-scripts;/); expect(csp).toMatch(/script-src https:\/\/app\.example\/api\/simulators\/runtime\/react-sim\/1\/[0-9a-f]{64}\/ 'unsafe-inline'/); expect(csp).not.toMatch(/'self' https/);
    const js = await serve("assets/index-abc123.js"); expect(js.status).toBe(200); expect(js.headers["Cache-Control"]).toBe("public, max-age=31536000, immutable"); expect(js.headers["Content-Type"]).toMatch(/javascript/); expect(js.headers["Content-Security-Policy"]).toBeTruthy();
    const css = await serve("assets/index-abc123.css"); expect(css.headers["Content-Type"]).toBe("text/css; charset=utf-8");
    expect((await serve("../metadata.json")).status).toBe(404); expect((await serve("..%2Fmetadata.json")).status).toBe(404);
    expect((await serve("metadata.json")).status).toBe(404); expect((await serve("package.smartsim")).status).toBe(404);
    expect((await serve("")).status).toBe(404); expect((await serve("assets/")).status).toBe(404); expect((await serve("assets")).status).toBe(404);
    expect((await serve("index.html", { hash: "0".repeat(64) })).status).toBe(404); expect((await serve("index.html", { hash: "nothex" })).status).toBe(404);
    expect((await serve("index.html", { packageId: "other-sim" })).status).toBe(404);
    expect(Buffer.isBuffer(html.body)).toBe(true); expect(html.body.toString("utf8")).toContain("<div id=\"root\">");
  });
  it("availability: a question reference resolves only when id + version + hash match a stored package", async () => {
    const c = createMemoryContainer();
    const up = await uploadHandler(uploadRequest(vanillaPackage()), depsFor(c.container, teacherA));
    const ok = { packageId: "counter-sim", packageVersion: 1, packageHash: up.jsonBody.package.packageHash, runtimeVersion: 1 };
    expect(await packageAvailabilityIssues(c.container, [ok])).toEqual([]);
    expect((await packageAvailabilityIssues(c.container, [{ ...ok, packageVersion: 2 }])).map(i => i.code)).toEqual(["SIM_PACKAGE_UNAVAILABLE"]);
    expect((await packageAvailabilityIssues(c.container, [{ ...ok, packageHash: "sha256:" + "a".repeat(64) }])).map(i => i.code)).toEqual(["SIM_PACKAGE_UNAVAILABLE"]);
  });
});
