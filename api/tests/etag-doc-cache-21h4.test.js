import { describe, it, expect } from "vitest";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { instrumentReadCost } from "./helpers/read-cost.js";
import { createDocCache, loadJsonDocs } from "../src/lib/etag-doc-cache.js";
import { handler as todayHandler } from "../src/functions/teacher-today.js";
import { school, assignment, NOW, SUB } from "./fixtures/analytics-school.js";

// Phase 21H.4 — the ETag-verified document cache behind the dashboard's refreshes: an unchanged document is not downloaded again;
// a changed, new or deleted one is always seen; a hit is a fresh object; the cache is bounded and never shared across containers.
const P = "platform/users/";
const seed = () => ({ [P + "a.json"]: { id: "a", v: 1 }, [P + "b.json"]: { id: "b", v: 1 }, ["platform/other/x.json"]: { id: "x" } });

describe("21H.4 etag-doc-cache", () => {
  it("first load downloads everything; an unchanged second load downloads nothing and returns the same documents", async () => {
    const ctx = createMemoryContainer(seed()), rc = instrumentReadCost(ctx.container), cache = createDocCache();
    const first = await loadJsonDocs(ctx.container, P, cache);
    expect(first.stats).toEqual({ listed: 2, cached: 0, downloaded: 2 });
    rc.reset();
    const second = await loadJsonDocs(ctx.container, P, cache);
    expect(second.stats).toEqual({ listed: 2, cached: 2, downloaded: 0 });
    expect(rc.snapshot()).toMatchObject({ lists: 1, downloads: 0 });
    expect(second.docs).toEqual(first.docs);
  });

  it("a changed document (new ETag) is downloaded again; a new one appears; a deleted one disappears", async () => {
    const ctx = createMemoryContainer(seed()), cache = createDocCache();
    await loadJsonDocs(ctx.container, P, cache);
    ctx.setJson(P + "a.json", { id: "a", v: 2 });
    ctx.setJson(P + "c.json", { id: "c", v: 1 });
    await ctx.container.getBlobClient(P + "b.json").deleteIfExists();
    const r = await loadJsonDocs(ctx.container, P, cache);
    expect(r.docs.map(d => [d.id, d.v]).sort()).toEqual([["a", 2], ["c", 1]]);
    expect(r.stats).toEqual({ listed: 2, cached: 0, downloaded: 2 });
  });

  it("a blob listed without an ETag is always downloaded", async () => {
    const ctx = createMemoryContainer(seed()), cache = createDocCache();
    const listEntries = async () => [{ name: P + "a.json", etag: null }];
    await loadJsonDocs(ctx.container, P, cache, { listEntries });
    const r = await loadJsonDocs(ctx.container, P, cache, { listEntries });
    expect(r.stats).toEqual({ listed: 1, cached: 0, downloaded: 1 });
  });

  it("a hit is a fresh object: mutating a returned document never changes the next result", async () => {
    const ctx = createMemoryContainer(seed()), cache = createDocCache();
    (await loadJsonDocs(ctx.container, P, cache)).docs[0].v = 999;                  // a downloaded document
    const hit = await loadJsonDocs(ctx.container, P, cache);
    expect(hit.stats.cached).toBe(2);
    expect(hit.docs.every(d => d.v === 1)).toBe(true);
    hit.docs[0].v = 555;                                                                  // a document served from the cache
    expect((await loadJsonDocs(ctx.container, P, cache)).docs.every(d => d.v === 1)).toBe(true);
  });

  it("bounded: entries above maxEntries are evicted least-recently-used first (and simply downloaded again)", async () => {
    const ctx = createMemoryContainer(seed()), cache = createDocCache({ maxEntries: 1 });
    await loadJsonDocs(ctx.container, P, cache);
    const r = await loadJsonDocs(ctx.container, P, cache);
    expect(r.stats.cached + r.stats.downloaded).toBe(2);
    expect(r.stats.cached).toBeLessThanOrEqual(1);
    const tiny = createDocCache({ maxBytes: 5 });                                              // no document fits → nothing cached
    await loadJsonDocs(ctx.container, P, tiny);
    expect((await loadJsonDocs(ctx.container, P, tiny)).stats.downloaded).toBe(2);
  });

  it("two containers never share entries, even with the same names and ETags", async () => {
    const one = createMemoryContainer(seed()), two = createMemoryContainer({ [P + "a.json"]: { id: "a", v: "other" }, [P + "b.json"]: { id: "b", v: "other" } }), cache = createDocCache();
    await loadJsonDocs(one.container, P, cache);
    const r = await loadJsonDocs(two.container, P, cache);
    expect(r.stats.cached).toBe(0);
    expect(r.docs.map(d => d.v)).toEqual(["other", "other"]);
  });

  it("cache null → the plain path: everything downloaded every time", async () => {
    const ctx = createMemoryContainer(seed());
    await loadJsonDocs(ctx.container, P, null);
    expect((await loadJsonDocs(ctx.container, P, null)).stats).toEqual({ listed: 2, cached: 0, downloaded: 2 });
  });
});

describe("21H.4 teacher-today over the cache — figures stay exact between refreshes", () => {
  const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), teacherDirectUnread: async () => ({ totalUnread: 0, capped: false }), loadProjectEvaluationSources: async () => [] };
  const req = () => ({ method: "GET", url: "https://x/api/teacher-today", headers: { get: () => null } });
  it("a submission that changes between two refreshes changes the figures on the second one", async () => {
    const s = school();
    s["platform/assignments/P1.json"] = assignment("P1", "c1", "published", NOW, { dueAt: "2026-03-20T10:00:00.000Z" });
    const ctx = createMemoryContainer(s), cache = createDocCache(), deps = { ...AUTH, container: ctx.container, nowMs: Date.parse(NOW), docCache: cache };
    const before = (await todayHandler(req(), deps)).jsonBody.attention.activeAttempts.count;
    ctx.setJson(SUB + "P1/s04.json", { assignmentId: "P1", studentId: "s04", classId: "c1", attempts: [], activeAttempt: { attemptNumber: 1, startedAt: "2026-03-10T09:58:00.000Z", status: "started" } });
    const after = (await todayHandler(req(), deps)).jsonBody.attention.activeAttempts;
    expect(after.count).toBe(before + 1);
    expect(after.items.some(i => i.studentId === "s04")).toBe(true);
  });
});
