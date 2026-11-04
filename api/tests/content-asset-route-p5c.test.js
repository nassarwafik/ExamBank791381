import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P5-C — risk S7, owner decision D10. TEST data only. GET /api/content-asset and the signed delivery around it:
//   the signature is checked BEFORE any file is read (missing / expired / too far ahead / tampered / another path / a bank-image
//   signature / no server secret → 401); a valid URL serves exactly the protected bytes, privately, never past its expiry;
//   signing is windowed (one URL per window, valid ≥ one more window) and folded into the ETags of the payloads that carry it;
//   a governance revision is delivered signed too; a server without a signing secret still delivers every payload (unsigned).

const cjs = createRequire(import.meta.url);
const SECRET = "p5c-content-asset-root-secret";
process.env.BANK_SETUP_KEY = SECRET;
const { handler: asset } = cjs("../src/functions/content-asset.js");
const { handler: learning } = cjs("../src/functions/learning-content.js");
const { handler: library } = cjs("../src/functions/exam-library.js");
const { handler: governance } = cjs("../src/functions/exam-governance.js");
const CA = cjs("../src/lib/content-assets.js");
const { createSignedAssetParams } = cjs("../src/lib/builder-auth.js");
const GOV = cjs("../src/lib/exam-governance.js");

const ROOT = path.resolve(__dirname, "../src/data/content-assets");
const W = CA.WINDOW_SECONDS * 1000;
const T0 = Math.floor(Date.parse("2026-11-03T10:00:00.000Z") / W) * W + 60_000;   // one minute into a window
const sha = b => createHash("sha256").update(b).digest("hex");
const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out); return out; };
const signedIn = v => strings(v).filter(s => s.startsWith("/api/content-asset?"));
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const get = (url, nowMs = T0) => asset({ method: "GET", url: "https://x" + url }, { nowMs: () => nowMs });
const teacher = (nowMs = T0) => { const mem = createMemoryContainer(); return { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1", am: "multi-user" } }), container: mem.container, getContainer: () => mem.container, nowMs: () => nowMs }; };
const module00 = (deps, headers = {}) => learning({ method: "GET", url: "https://x", headers: hdr(headers), params: { courseId: "791381s", moduleId: "791381s-m00" } }, deps);
const item = (deps, headers = {}) => library({ method: "GET", url: "https://x", params: { id: "F01" }, headers: hdr(headers) }, deps);
const fileOf = rel => readFileSync(path.join(ROOT, rel));
const relOf = url => new URLSearchParams(url.split("?")[1]).get("p");

beforeEach(() => { process.env.BANK_SETUP_KEY = SECRET; delete process.env.BUILDER_SESSION_SECRET; delete process.env.GOVERNANCE_CAPABILITIES; CA.resetContentAssetMemo(); });

describe("P5-C GET /api/content-asset", () => {
  it("a signed URL from a delivered module serves exactly the protected bytes, privately, never past its expiry", async () => {
    const url = signedIn((await module00(teacher())).jsonBody.module)[0];
    const r = await get(url);
    expect(r.status).toBe(200);
    expect(sha(r.body)).toBe(sha(fileOf(relOf(url))));
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    const exp = Number(new URLSearchParams(url.split("?")[1]).get("exp"));
    expect(r.headers["cache-control"]).toBe("private, max-age=" + (exp - Math.floor(T0 / 1000)));
  });
  it("refuses before reading anything: no / tampered / foreign-path / expired / too-far / bank-image signatures, and no secret", async () => {
    const reads = [];
    const deps = nowMs => ({ nowMs: () => nowMs, readContentAsset: rel => { reads.push(rel); return { buffer: Buffer.from("x"), contentType: "image/png" }; } });
    const call = (url, nowMs = T0) => asset({ method: "GET", url: "https://x" + url }, deps(nowMs));
    const rel = "learning/791381s/c74762bdc9f9119d.png";
    const good = CA.signedContentAssetUrl(rel, T0);
    const q = new URLSearchParams(good.split("?")[1]);
    const exp = q.get("exp"), sig = q.get("sig");
    const other = "exam-library/F01/3bdf04b82e0d539b.png";
    const bank = createSignedAssetParams(rel, 600);
    const cases = [
      "/api/content-asset", "/api/content-asset?p=" + encodeURIComponent(rel),
      "/api/content-asset?p=" + encodeURIComponent(rel) + "&exp=" + exp + "&sig=" + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"),
      "/api/content-asset?p=" + encodeURIComponent(other) + "&exp=" + exp + "&sig=" + sig,
      "/api/content-asset?p=" + encodeURIComponent(rel) + "&exp=" + (Number(exp) + 1) + "&sig=" + sig,
      "/api/content-asset?p=" + encodeURIComponent(rel) + "&exp=" + bank.exp + "&sig=" + bank.sig,
      "/api/content-asset?p=" + encodeURIComponent("learning/../../../package.json") + "&exp=" + exp + "&sig=" + sig,
      "/api/content-asset?p=" + encodeURIComponent("learning/791381s/c74762bdc9f9119d.svg") + "&exp=" + exp + "&sig=" + sig
    ];
    for (const u of cases) expect([u, (await call(u)).status]).toEqual([u, 401]);
    expect((await call(good, Number(exp) * 1000)).status).toBe(401);                          // expired at its own expiry
    const far = CA.signedContentAssetUrl(rel, T0 + 10 * W);                                   // genuinely signed, but expiring far ahead
    expect((await call(far, T0 + 10 * W)).status).toBe(200);
    expect((await call(far)).status).toBe(401);
    reads.length = 0;
    delete process.env.BANK_SETUP_KEY;
    expect((await call(good)).status).toBe(401);
    expect(reads).toEqual([]);
    process.env.BANK_SETUP_KEY = SECRET;
    expect((await call(good)).status).toBe(200);
    expect(reads).toEqual([rel]);
  });
  it("only image paths of the protected tree can ever be signed (no svg, no traversal, no other folder)", () => {
    for (const rel of ["learning/791381s/c74762bdc9f9119d.svg", "learning/../x/c74762bdc9f9119d.png", "other/791381s/c74762bdc9f9119d.png", "learning/791381s/C74762BDC9F9119D.png"]) expect(CA.signedContentAssetUrl(rel, T0), rel).toBe(null);
    expect(CA.contentAssetPathOf("/learning-assets/791381s/c74762bdc9f9119d.svg")).toBe(null);
  });
  it("a correctly signed URL for a file that does not exist → 404", async () => {
    expect((await get(CA.signedContentAssetUrl("learning/791381s/0000000000000000.png", T0))).status).toBe(404);
  });
  it("every reference in the committed library items and course modules resolves to a protected file (and no file is orphaned)", () => {
    const glob = dir => { const fs = cjs("node:fs"); const out = []; const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; walk(dir); return out; };
    const refs = new Set();
    for (const f of glob(path.resolve(__dirname, "../src/data")).filter(f => f.endsWith(".json"))) for (const s of strings(JSON.parse(readFileSync(f, "utf8")))) { const rel = CA.contentAssetPathOf(s); if (rel) refs.add(rel); }
    const onDisk = new Set(glob(ROOT).map(f => path.relative(ROOT, f).split(path.sep).join("/")));
    expect(refs.size).toBeGreaterThan(0);
    for (const rel of refs) expect(onDisk.has(rel), rel).toBe(true);
    for (const rel of onDisk) expect(refs.has(rel), "orphan " + rel).toBe(true);
  });
});

describe("P5-C windowed signing and ETags", () => {
  it("inside a window the URLs and the ETag are identical (304 works); the next window gets fresh URLs, a new ETag, and old ones still load", async () => {
    const a = await module00(teacher(T0)), b = await module00(teacher(T0 + 3_600_000));
    expect(signedIn(b.jsonBody.module)).toEqual(signedIn(a.jsonBody.module));
    expect(b.headers.ETag).toBe(a.headers.ETag);
    expect(a.headers.ETag).toMatch(/^"[A-Za-z0-9_-]{22}"$/);
    expect((await module00(teacher(T0 + 3_600_000), { "if-none-match": a.headers.ETag })).status).toBe(304);
    const next = await module00(teacher(T0 + W), { "if-none-match": a.headers.ETag });
    expect(next.status).toBe(200);                                                          // never a 304 with the old window's URLs
    expect(next.headers.ETag).not.toBe(a.headers.ETag);
    expect(signedIn(next.jsonBody.module)).not.toEqual(signedIn(a.jsonBody.module));
    expect((await get(signedIn(a.jsonBody.module)[0], T0 + W + 60_000)).status).toBe(200);   // a page opened late in a window keeps loading
  });
  it("a library item is signed too; its keyless variant keeps its own ETag", async () => {
    const r = await item(teacher());
    expect(signedIn(r.jsonBody.item).length).toBeGreaterThan(0);
    expect(strings(r.jsonBody.item).some(s => s.startsWith("/exam-library/assets/"))).toBe(false);
    expect((await item(teacher(), { "if-none-match": r.headers.ETag })).status).toBe(304);
  });
  it("without a signing secret every payload is still delivered (stored paths, the stored ETag) — never refused for its images", async () => {
    delete process.env.BANK_SETUP_KEY;
    const r = await module00(teacher());
    expect(r.status).toBe(200);
    expect(signedIn(r.jsonBody.module)).toEqual([]);
    expect(strings(r.jsonBody.module).some(s => s.startsWith("/learning-assets/791381s/"))).toBe(true);
  });
  it("a module without images is byte-identical to its stored data, with its stored ETag", async () => {
    const r = await learning({ method: "GET", url: "https://x", headers: hdr({}), params: { courseId: "791381", moduleId: "791381-m01" } }, teacher());
    const text = readFileSync(path.resolve(__dirname, "../src/data/learning-content/791381/791381-m01.json"), "utf8");
    expect(r.jsonBody.module).toEqual(JSON.parse(text));
    expect(r.headers.ETag).toBe('"' + createHash("sha256").update(text).digest("base64url").slice(0, 22) + '"');
  });
  // Tadris+ P9-B1 (acceptance test #5): the signed copy is memoized for the window and shared by every request, so it is frozen
  // like the stored value it came from — no caller can change what the next teacher or student receives.
  it("the window's signed copy is shared and deep-frozen: changing one response never reaches the next (module and library item)", async () => {
    for (const [read, pick] of [[() => module00(teacher()), r => r.jsonBody.module], [() => item(teacher()), r => r.jsonBody.item]]) {
      const first = await read();
      const original = JSON.stringify(pick(first));
      expect(signedIn(pick(first)).length).toBeGreaterThan(0);                  // a copy was made (it carries signed URLs)
      const v = pick(first);
      expect(Object.isFrozen(v)).toBe(true);
      const firstObject = Object.values(v).find(x => x && typeof x === "object");
      expect(Object.isFrozen(firstObject)).toBe(true);
      try { v.title = "x"; } catch { /* frozen */ }
      expect(JSON.stringify(pick(await read()))).toBe(original);
    }
  });
});

describe("P5-C governance revisions", () => {
  it("a governed exam with a library image: stored as its path, delivered signed (revision and published)", async () => {
    const mem = createMemoryContainer();
    let clock = T0;
    const now = () => new Date((clock += 1000)).toISOString();
    const img = { exists: true, visible: true, origin: "uploaded", assets: [{ id: "img-0", origin: "uploaded", contentType: "image/png", dataUrl: CA.signedContentAssetUrl("exam-library/F01/3bdf04b82e0d539b.png", T0) }] };
    const exam = { examId: "EX-1", title: "x", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "ق", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "multipleChoice", text: "س", marks: 2, image: img, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }] };
    const actor = { id: "teacher", capabilities: ["author", "review", "approve", "publish"] };
    const en = await GOV.enableGovernance(mem.container, { examId: "EX-1", exam, actor, requestId: "e" }, { now });
    const s = await GOV.submitForReview(mem.container, { examId: "EX-1", revisionId: en.manifest.latestRevisionId, actor, requestId: "s", expectedStateVersion: en.manifest.stateVersion }, { now });
    const a = await GOV.approve(mem.container, { examId: "EX-1", actor, requestId: "a", expectedStateVersion: s.manifest.stateVersion }, { now });
    await GOV.publish(mem.container, { examId: "EX-1", actor, requestId: "p", expectedStateVersion: a.manifest.stateVersion }, { now });
    const storedRev = mem.names("exam-governance/EX-1/revisions/").map(n => mem.getJson(n))[0];
    expect(strings(storedRev).filter(s => s.includes("3bdf04b82e0d539b"))).toEqual(["/exam-library/assets/F01/3bdf04b82e0d539b.png"]);   // no credential persisted
    const route = body => governance({ method: "POST", url: "http://x/api/exam-governance", headers: new Headers(), json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { ver: 2, role: "teacher", sub: "teacher" } }), getContainer: () => mem.container, now });
    for (const body of [{ action: "published", examId: "EX-1" }, { action: "revision", examId: "EX-1", revisionId: en.manifest.latestRevisionId }]) {
      const r = await route(body);
      expect(r.status).toBe(200);
      const urls = signedIn(r.jsonBody.revision);
      expect(urls.length).toBe(1);
      expect(relOf(urls[0])).toBe("exam-library/F01/3bdf04b82e0d539b.png");
    }
  });
});
