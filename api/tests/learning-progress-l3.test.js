import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-progress.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { progressDocName, loadPageIndex, moduleOfPage, normalizeProgressDoc, applyVisit, visitIsNoop, progressView } from "../src/lib/learning-progress.js";
import { listLearningModules } from "../src/lib/learning-materials-registry.js";

// Phase L.3 — Reading Progress: the server authority over WHERE a student is in a book and WHICH pages they read, over the
// REAL generated page index (api/src/data/learning-pages/791381.json) and the in-memory container: page authority (the page
// must exist in the book and its own module must be published to the persisted class), idempotent CAS writes (a repeat of the
// current page writes nothing; a page's first-read time never moves), the view filtered to what the class can see NOW, and the
// auth / lifecycle gates. Progress is never a grade: no Strength or gradebook document is touched.

const INDEX = loadPageIndex("791381");
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "علي", code: "S1", ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], learningMaterials: visible === null ? [] : [{ courseId: "791381", visibleModuleIds: visible }], ...extra });
const deps = (ctx, id = "u1", extra = {}) => ({ requireStudentAuth: () => ({ ok: true, user: { sub: id, sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container, now: () => "2026-10-17T10:00:00.000Z", ...extra });
const get = (d, courseId = "791381") => handler({ method: "GET", url: "https://x/api/learning-progress", headers: { get: () => null }, params: { courseId } }, d);
const visit = (d, body, courseId = "791381") => handler({ method: "POST", url: "https://x/api/learning-progress", headers: { get: () => null }, params: { courseId, action: "visit" }, json: async () => body }, d);
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const P = (m, i) => INDEX.modules[m][i];
const seed = (visible, extra = {}) => createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", visible), ...extra });

describe("the generated page index", () => {
  it("covers the real book: 28 publishable modules, 248 pages; unknown ids resolve to null", () => {
    expect(Object.keys(INDEX.modules).sort()).toEqual(listLearningModules("791381").map(m => m.moduleId).sort());
    expect(Object.values(INDEX.modules).flat()).toHaveLength(248);
    expect(moduleOfPage(INDEX, P(M02, 0))).toBe(M02);
    for (const bad of ["791381-m99-l01-p01", "", "../x", null, 42]) expect(moduleOfPage(INDEX, bad)).toBeNull();
    expect(loadPageIndex("999999")).toBeNull();
    expect(loadPageIndex("../../etc")).toBeNull();
  });
});

describe("the per-student document (pure)", () => {
  it("records the first read once, moves the last page, and the view follows what the class can see", () => {
    let d = applyVisit(null, { courseId: "791381", moduleId: M01, pageId: P(M01, 0) }, "2026-10-17T09:00:00.000Z");
    d = applyVisit(d, { courseId: "791381", moduleId: M02, pageId: P(M02, 1) }, "2026-10-17T09:05:00.000Z");
    d = applyVisit(d, { courseId: "791381", moduleId: M01, pageId: P(M01, 0) }, "2026-10-17T09:10:00.000Z");
    expect(d.courses["791381"].pages[P(M01, 0)]).toBe("2026-10-17T09:00:00.000Z");      // first read never moves
    expect(d.courses["791381"].lastPageId).toBe(P(M01, 0));
    expect(visitIsNoop(d, { courseId: "791381", pageId: P(M01, 0) })).toBe(true);
    expect(visitIsNoop(d, { courseId: "791381", pageId: P(M02, 1) })).toBe(false);       // read, but not the last page
    const all = progressView(d, "791381", INDEX, () => true);
    expect(all.visited).toEqual([P(M01, 0), P(M02, 1)]);                                  // reading order
    expect(all.modules[M01]).toEqual({ read: 1, total: INDEX.modules[M01].length });
    const onlyM02 = progressView(d, "791381", INDEX, m => m === M02);
    expect(onlyM02.visited).toEqual([P(M02, 1)]);
    expect(onlyM02.lastPageId).toBeNull();                                                // the last page's unit is hidden now
    expect(Object.keys(onlyM02.modules)).toEqual([M02]);
  });
  it("normalisation drops anything malformed without throwing", () => {
    const d = normalizeProgressDoc({ courses: { "791381": { lastPageId: "<x>", lastReadAt: "nope", pages: { [P(M01, 0)]: "2026-10-17T09:00:00.000Z", "bad id": "2026-10-17T09:00:00.000Z", [P(M01, 1)]: 5 } }, "../x": {} } });
    expect(d.courses["791381"]).toEqual({ lastPageId: null, lastModuleId: null, lastReadAt: null, pages: { [P(M01, 0)]: "2026-10-17T09:00:00.000Z" } });
    expect(Object.keys(d.courses)).toEqual(["791381"]);
    expect(normalizeProgressDoc("garbage")).toEqual({ schemaVersion: 1, courses: {} });
  });
});

describe("GET /api/learning-progress/{courseId}", () => {
  it("an empty progress for a student who has read nothing; only the published modules are listed", async () => {
    const ctx = seed([M01, M02]);
    const r = await get(deps(ctx));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toEqual({ ok: true, courseId: "791381", lastPageId: null, lastReadAt: null, visited: [], modules: { [M01]: { read: 0, total: INDEX.modules[M01].length }, [M02]: { read: 0, total: INDEX.modules[M02].length } } });
  });
  it("gates: unauthenticated, unknown course, course not attached, archived class", async () => {
    const ctx = seed([M01]);
    expect((await get({ requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container })).status).toBe(401);
    expect((await get(deps(ctx), "999999")).status).toBe(404);
    expect((await get(deps(ctx), "../etc")).status).toBe(404);
    expect((await get(deps(seed(null)))).status).toBe(403);
    expect((await get(deps(seed([M01], { [CLS("cA")]: room("cA", [M01], { status: "archived", active: false }) })))).status).toBe(403);
  });
});

describe("POST /api/learning-progress/{courseId}/visit", () => {
  it("records a published page; the persisted class decides (never the token's class claim)", async () => {
    const ctx = seed([M01, M02]);
    const r = await visit(deps(ctx), { pageId: P(M02, 2) });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, persisted: true, lastPageId: P(M02, 2), lastReadAt: "2026-10-17T10:00:00.000Z", visited: [P(M02, 2)] });
    expect(r.jsonBody.modules[M02]).toEqual({ read: 1, total: INDEX.modules[M02].length });
    const again = await get(deps(ctx));
    expect(again.jsonBody.lastPageId).toBe(P(M02, 2));                                   // the next device sees it
  });
  it("a repeat of the current page writes nothing; another page moves the last page and keeps the first-read times", async () => {
    const ctx = seed([M01, M02]);
    let writes = 0;
    const counting = deps(ctx, "u1", { mutateJsonWithRetry: async (c, name, fn) => { writes++; const { mutateJsonWithRetry } = await import("../src/lib/platform-storage.js"); return mutateJsonWithRetry(c, name, fn); } });
    await visit(counting, { pageId: P(M01, 0) });
    const repeat = await visit(counting, { pageId: P(M01, 0) });
    expect(repeat.jsonBody.persisted).toBe(false);
    expect(writes).toBe(1);
    const later = deps(ctx, "u1", { now: () => "2026-10-17T11:00:00.000Z" });
    await visit(later, { pageId: P(M01, 1) });
    const back = await visit(later, { pageId: P(M01, 0) });
    expect(back.jsonBody).toMatchObject({ persisted: true, lastPageId: P(M01, 0), lastReadAt: "2026-10-17T11:00:00.000Z", visited: [P(M01, 0), P(M01, 1)] });
  });
  it("refuses an invented page, a page of a hidden module, a malformed body; writes nothing for any of them", async () => {
    const ctx = seed([M01]);
    for (const body of [{ pageId: "791381-m01-l99-p99" }, { pageId: "<script>" }, { pageId: 42 }, {}, null]) {
      expect((await visit(deps(ctx), body)).status).toBe(400);
    }
    expect((await visit(deps(ctx), { pageId: P(M07, 0) })).status).toBe(403);                // m07 is not published
    const r = await get(deps(ctx));
    expect(r.jsonBody.visited).toEqual([]);
    expect(r.jsonBody.lastPageId).toBeNull();
  });
  it("a unit hidden after reading disappears from the view and comes back when re-published (nothing is deleted)", async () => {
    const ctx = seed([M01, M02]);
    await visit(deps(ctx), { pageId: P(M01, 0) });
    await visit(deps(ctx), { pageId: P(M02, 0) });
    ctx.setJson(CLS("cA"), room("cA", [M01]));
    const hidden = await get(deps(ctx));
    expect(hidden.jsonBody.visited).toEqual([P(M01, 0)]);
    expect(hidden.jsonBody.lastPageId).toBeNull();
    ctx.setJson(CLS("cA"), room("cA", [M01, M02]));
    const restored = await get(deps(ctx));
    expect(restored.jsonBody.visited).toEqual([P(M01, 0), P(M02, 0)]);
    expect(restored.jsonBody.lastPageId).toBe(P(M02, 0));
  });
  it("each student has their own document; progress touches no study, strength or submission document", async () => {
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [USR("u2")]: student("u2", "cA"), [CLS("cA")]: room("cA", [M01]) });
    await visit(deps(ctx, "u1"), { pageId: P(M01, 0) });
    expect((await get(deps(ctx, "u2"))).jsonBody.visited).toEqual([]);
    const names = ctx.names("platform/");
    expect(names.filter(n => !n.startsWith("platform/users/") && !n.startsWith("platform/classes/"))).toEqual([progressDocName("u1")]);
  });
  it("a persistent CAS conflict is a retryable 503, never a crash and never a partial write", async () => {
    // a concurrent writer touches the document before EVERY compare-and-set: mutateJsonWithRetry exhausts its attempts
    const ctx = createMemoryContainer({ [USR("u1")]: student("u1", "cA"), [CLS("cA")]: room("cA", [M01]), [progressDocName("u1")]: { schemaVersion: 1, courses: {} } },
      { beforeConditionalUpload: (name, api) => { if (name === progressDocName("u1")) api.setJson(name, api.getJson(name)); } });
    const r = await visit(deps(ctx), { pageId: P(M01, 0) });
    expect(r.status).toBe(503);
    expect(ctx.getJson(progressDocName("u1"))).toEqual({ schemaVersion: 1, courses: {} });
  });
  it("only GET and POST …/visit exist", async () => {
    const ctx = seed([M01]);
    expect((await handler({ method: "DELETE", url: "https://x", headers: { get: () => null }, params: { courseId: "791381" } }, deps(ctx))).status).toBe(405);
    expect((await handler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: "791381", action: "reset" }, json: async () => ({}) }, deps(ctx))).status).toBe(405);
  });
});
