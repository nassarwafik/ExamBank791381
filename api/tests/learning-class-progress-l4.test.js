import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/learning-class-progress.js";
import { handler as visitHandler } from "../src/functions/learning-progress.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { loadPageIndex, classProgressSummary, progressDocName } from "../src/lib/learning-progress.js";

// Phase L.4 — a teacher sees how far THEIR class has read a book: per published unit (started / completed / average share) and per
// student (pages read per unit, total, last reading time). Class-scoped like every class-bound endpoint (21G.0): another teacher's
// class is reported exactly like a missing one; only units published to the class NOW are reported; members come from the class
// index and are re-checked against their user documents. Per-unit counts only — never the exact pages a student read.

const INDEX = loadPageIndex("791381");
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const P = (m, i) => INDEX.modules[m][i];
const USR = id => "platform/users/" + id + ".json", CLS = id => "platform/classes/" + id + ".json";
const student = (id, classId, extra = {}) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId, displayName: "طالب " + id, code: "C-" + id, ...extra });
const room = (id, visible, extra = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: ["u1", "u2", "u3"], learningMaterials: visible === null ? [] : [{ courseId: "791381", visibleModuleIds: visible }], ...extra });
const teacher = (sub = "t1") => ({ requireBuilderAuth: () => ({ ok: true, user: { sub, am: "multi-user" } }) });
const get = (ctx, classId = "cA", courseId = "791381", auth = teacher()) => handler({ method: "GET", url: "https://x", headers: { get: () => null }, params: { classId, courseId } }, { ...auth, container: ctx.container, getContainer: () => ctx.container, nowMs: Date.parse("2026-10-17T12:00:00.000Z") });
const visit = (ctx, userId, pageId, at) => visitHandler({ method: "POST", url: "https://x", headers: { get: () => null }, params: { courseId: "791381", action: "visit" }, json: async () => ({ pageId }) },
  { requireStudentAuth: () => ({ ok: true, user: { sub: userId, sv: 1, role: "student" } }), container: ctx.container, getContainer: () => ctx.container, now: () => at });
function seed(visible = [M01, M02], extra = {}) {
  return createMemoryContainer({
    [USR("u1")]: student("u1", "cA"), [USR("u2")]: student("u2", "cA"), [USR("u3")]: student("u3", "cA"),
    [CLS("cA")]: room("cA", visible, { ownerId: "t1" }), ...extra,
  });
}

describe("GET /api/learning-class-progress/{classId}/{courseId}", () => {
  it("summarises the class over the published units: started / completed / average, and each student's progress per unit", async () => {
    const ctx = seed();
    for (const p of INDEX.modules[M01]) await visit(ctx, "u1", p, "2026-10-16T09:00:00.000Z");      // u1 read all of m01
    await visit(ctx, "u2", P(M01, 0), "2026-10-17T08:00:00.000Z");                                   // u2 started m01
    await visit(ctx, "u2", P(M02, 0), "2026-10-17T08:05:00.000Z");                                   // … and m02
    const r = await get(ctx);
    expect(r.status).toBe(200);
    const b = r.jsonBody;
    const n01 = INDEX.modules[M01].length, n02 = INDEX.modules[M02].length;
    expect(b.totalPages).toBe(n01 + n02);
    expect(b.modules.map(m => m.moduleId)).toEqual([M01, M02]);
    expect(b.modules[0]).toMatchObject({ total: n01, started: 2, completed: 1, averageRead: Math.round(((n01 + 1) / (3 * n01)) * 100) });
    expect(b.modules[1]).toMatchObject({ total: n02, started: 1, completed: 0 });
    const byId = Object.fromEntries(b.students.map(s => [s.userId, s]));
    expect(byId.u1).toMatchObject({ readPages: n01, modules: { [M01]: n01, [M02]: 0 }, lastReadAt: "2026-10-16T09:00:00.000Z", displayName: "طالب u1", code: "C-u1" });
    expect(byId.u2).toMatchObject({ readPages: 2, modules: { [M01]: 1, [M02]: 1 }, lastReadAt: "2026-10-17T08:05:00.000Z" });
    expect(byId.u3).toMatchObject({ readPages: 0, lastReadAt: null });
    expect(JSON.stringify(b)).not.toMatch(/-l\d\d-p\d\d/);                                           // never a page id
  });

  it("only units published NOW are reported (a unit hidden after reading disappears)", async () => {
    const ctx = seed([M01, M02]);
    await visit(ctx, "u1", P(M02, 0), "2026-10-17T08:00:00.000Z");
    ctx.setJson(CLS("cA"), room("cA", [M01], { ownerId: "t1" }));
    const b = (await get(ctx)).jsonBody;
    expect(b.modules.map(m => m.moduleId)).toEqual([M01]);
    expect(b.students.find(s => s.userId === "u1")).toMatchObject({ readPages: 0, modules: { [M01]: 0 }, lastReadAt: null });
    expect(b.totalPages).toBe(INDEX.modules[M01].length);
  });

  it("members: an archived, moved or inactive student and an id outside the class are never counted", async () => {
    const ctx = seed([M01], {
      [USR("u2")]: student("u2", "cB"),                                   // moved to another class (stale index entry)
      [USR("u3")]: student("u3", "cA", { archived: true }),
      [CLS("cA")]: room("cA", [M01], { ownerId: "t1", studentIds: ["u1", "u2", "u3", "u4", "../x"] }),
      [USR("u4")]: student("u4", "cA", { active: false }),
    });
    const b = (await get(ctx)).jsonBody;
    expect(b.students.map(s => s.userId)).toEqual(["u1"]);
  });

  it("tenancy: another teacher's class is reported exactly like a missing one; a legacy (unowned) class stays shared", async () => {
    const ctx = seed();
    const missing = await get(ctx, "cZ");
    const foreign = await get(ctx, "cA", "791381", teacher("t2"));
    expect(foreign.status).toBe(404);
    expect(foreign.jsonBody).toEqual(missing.jsonBody);
    ctx.setJson(CLS("cA"), room("cA", [M01]));                             // no ownerId: pre-tenancy, shared by design
    expect((await get(ctx, "cA", "791381", teacher("t2"))).status).toBe(200);
  });

  it("gates: unauthenticated, unknown course, course not attached, malformed ids", async () => {
    const ctx = seed();
    expect((await handler({ method: "GET", headers: { get: () => null }, params: { classId: "cA", courseId: "791381" } }, { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container })).status).toBe(401);
    expect((await get(ctx, "cA", "999999")).status).toBe(404);
    expect((await get(ctx, "../x")).status).toBe(404);
    ctx.setJson(CLS("cA"), room("cA", null, { ownerId: "t1" }));
    expect((await get(ctx)).status).toBe(404);
  });

  it("read-only: nothing is written", async () => {
    const ctx = seed();
    await visit(ctx, "u1", P(M01, 0), "2026-10-17T08:00:00.000Z");
    const before = JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]));
    await get(ctx);
    expect(JSON.stringify(ctx.names("").map(n => [n, ctx.getJson(n)]))).toBe(before);
    expect(ctx.has(progressDocName("u2"))).toBe(false);
  });
});

describe("classProgressSummary (pure)", () => {
  it("an empty class has zero averages, never NaN", () => {
    const s = classProgressSummary(INDEX, [{ moduleId: M01, title: "x", order: 1 }], []);
    expect(s.modules[0]).toMatchObject({ started: 0, completed: 0, averageRead: 0 });
    expect(s.students).toEqual([]);
  });
  it("a module missing from the page index is ignored (never a crash)", () => {
    const s = classProgressSummary(INDEX, [{ moduleId: "791381-m99", title: "x", order: 99 }, { moduleId: M07, title: "y", order: 3 }], [{ userId: "u", displayName: "", code: "", doc: null }]);
    expect(s.modules.map(m => m.moduleId)).toEqual([M07]);
  });
});
