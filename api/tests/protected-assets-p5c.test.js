import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ P5-C — risk S7, owner decision D10 («نقلها لتخزين محمي»). TEST data only.
// The course drawings (public/learning-assets) and the exam library's question images (public/exam-library/assets) were
// public static files: anyone with the URL — no account, no class, no entitlement — could fetch them. They now live outside the
// static site, and every payload that delivers them (a course module, a library item, an exam / assignment snapshot) carries a
// short-lived SIGNED URL to /api/content-asset, minted by the server only after that payload's own gate passed. The stored
// form never changes: the old path stays the durable identity (the book lock and every published assignment keep their bytes),
// and a signed URL sent back by a browser is stored as that path again. Titles stay public (D10-b).
// This first file is the FAIL-FIRST proof and uses only modules that exist before P5-C.

process.env.BANK_SETUP_KEY = process.env.BANK_SETUP_KEY || "p5c-protected-assets-root-secret";

const ROOT = path.resolve(__dirname, "../..");
const SIGNED = /^\/api\/content-asset\?p=(exam-library|learning)%2F[A-Za-z0-9_-]+%2F[a-f0-9]{16}\.png&exp=\d+&sig=[A-Za-z0-9_-]+$/;
const PUBLIC_PATH = /\/(learning-assets|exam-library\/assets)\//;
const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out); return out; };
const files = dir => { const abs = path.join(ROOT, dir); if (!existsSync(abs)) return []; const out = []; const walk = d => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(p); } }; walk(abs); return out; };

let learning, library, hydrate, assignments;
beforeAll(async () => {
  ({ handler: learning } = await import("../src/functions/learning-content.js"));
  ({ handler: library } = await import("../src/functions/exam-library.js"));
  hydrate = await import("../src/lib/bank-asset-hydrate.js");
  ({ handler: assignments } = await import("../src/functions/manage-assignments.js"));
});

const mem0 = () => createMemoryContainer();
const teacher = mem => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "t1", am: "multi-user" } }), container: mem.container, getContainer: () => mem.container });
const hdr = h => ({ get: k => h[String(k).toLowerCase()] ?? null });
const module00 = (deps, headers = {}) => learning({ method: "GET", url: "https://x", headers: hdr(headers), params: { courseId: "791381s", moduleId: "791381s-m00" } }, deps);
const item = (deps, id = "F01") => library({ method: "GET", url: "https://x", params: { id }, headers: hdr({}) }, deps);
const imageStrings = body => strings(body).filter(s => s.startsWith("/api/content-asset") || PUBLIC_PATH.test(s));

describe("P5-C fail-first — the course drawings and the library's images are not public", () => {
  it("no image is left in the public static tree", () => {
    expect(files("public/learning-assets")).toEqual([]);
    expect(files("public/exam-library/assets")).toEqual([]);
  });
  it("a course module is delivered with signed image URLs only (no public path)", async () => {
    const r = await module00(teacher(mem0()));
    expect(r.status).toBe(200);
    const imgs = imageStrings(r.jsonBody.module);
    expect(imgs.length).toBeGreaterThan(0);
    for (const s of imgs) expect(s).toMatch(SIGNED);
  });
  it("a library item is delivered with signed image URLs only (no public path)", async () => {
    const r = await item(teacher(mem0()));
    expect(r.status).toBe(200);
    const imgs = imageStrings(r.jsonBody.item);
    expect(imgs.length).toBeGreaterThan(0);
    for (const s of imgs) expect(s).toMatch(SIGNED);
  });
  it("an exam / assignment snapshot that stores the old path is delivered signed, and stored back as the old path", () => {
    const stored = { title: "x", questions: [{ id: "q1", image: { exists: true, visible: true, assets: [{ id: "img-0", origin: "uploaded", contentType: "image/png", dataUrl: "/exam-library/assets/F01/3bdf04b82e0d539b.png" }] } }] };
    const delivered = hydrate.hydrateBankAssets(stored);
    const url = delivered.questions[0].image.assets[0].dataUrl;
    expect(url).toMatch(SIGNED);
    expect(hydrate.normalizeBankAssetsForStorage(delivered)).toEqual(stored);
  });
});

describe("P5-C the stored form is unchanged (pins)", () => {
  it("a library assignment still stores the old path as its durable identity; a signed URL a browser sends back is stored as that path", async () => {
    const mem = createMemoryContainer({ "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, status: "active" } });
    let clock = Date.parse("2026-11-03T10:00:00.000Z");
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher" } }), getContainer: () => mem.container, now: () => new Date((clock += 1000)).toISOString(), ensurePublishedAssignmentIndexed: async () => {}, recordAuditEvent: async () => {}, recordEventSafely: async () => {} };
    const create = body => assignments({ method: "POST", url: "http://x/assignments", params: {}, json: async () => ({ action: "create", classId: "c1", title: "واجب", publish: true, ...body }) }, deps);
    const byRef = await create({ libraryRef: { itemId: "F01" } });
    expect(byRef.status).toBe(200);
    const storedOf = r => mem.getJson("platform/assignments/" + r.jsonBody.assignment.assignmentId + ".json");
    const refPaths = strings(storedOf(byRef).examSnapshot).filter(s => PUBLIC_PATH.test(s) || s.startsWith("/api/content-asset"));
    expect(refPaths.length).toBeGreaterThan(0);
    for (const s of refPaths) expect(s).toMatch(/^\/exam-library\/assets\/F01\/[a-f0-9]{16}\.png$/);
    const delivered = (await item(teacher(mem))).jsonBody.item.examSnapshot;          // what a teacher's browser holds
    const viaBrowser = await create({ examSnapshot: delivered });
    expect(strings(storedOf(viaBrowser).examSnapshot).filter(s => s.startsWith("/api/content-asset"))).toEqual([]);
    expect(strings(storedOf(viaBrowser).examSnapshot).filter(s => PUBLIC_PATH.test(s)).sort()).toEqual(refPaths.slice().sort());
  });
});
