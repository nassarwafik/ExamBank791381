import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — «شاهد التنفيذ خطوة بخطوة»: the SERVER authority over the
// recorded question traces, over the REAL generated trace index and the in-memory container:
//   • a teacher (builder session) sees every trace, open;
//   • a student only through their persisted class (not archived, course attached and allowed) and only for a PUBLISHED module, then:
//       – an EXERCISE trace (it shows the answer): listed «answer-first» until the student's OWN study record says the exercise was
//         completed or its answer revealed; its steps → 409 ANSWER_FIRST before, 200 after;
//       – a BOOK trace: not listed and its steps → 403 NOT_RELEASED until the teacher released the module (D1); released but hidden
//         → 403 UNAVAILABLE;
//   • nothing else: an unknown block 404, bad ids 400, another method 405; the reply carries the program, its input and the steps only;
//   • reads only — nothing is written; refusals are logged by code only.
const cjs = createRequire(import.meta.url);
const { handler } = cjs("../src/functions/learning-trace.js");
const { loadTraceIndex } = cjs("../src/lib/learning-trace.js");

const CID = "899371";
const INDEX = loadTraceIndex(CID);
const all = Object.entries(INDEX.traces).map(([key, t]) => ({ key, pageId: key.split("/")[0], blockId: key.split("/")[1], ...t }));
const EX = all.find(t => t.kind === "exercise" && t.moduleId === "899371-m05");
const BOOK = all.find(t => t.kind === "book" && t.moduleId === "899371-m05");
const USR = "platform/users/u1.json", CLS = "platform/classes/cA.json", STUDY = "platform/learning-study/u1.json";
const student = { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "cA", displayName: "علي", code: "S1" };
const room = (materials, extra = {}) => ({ classId: "cA", name: "صف", active: true, status: "active", studentIds: ["u1"], learningMaterials: materials, ...extra });
const seed = (materials, extra = {}, more = {}) => createMemoryContainer({ [USR]: student, [CLS]: room(materials, extra), ...more });
const BUILDER_NO = { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) };
const studentDeps = ctx => ({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "STALE" } }), container: ctx.container, getContainer: () => ctx.container });
const teacherDeps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
const get = (deps, { action, query = "", method = "GET" } = {}, obs = null) =>
  handler({ method, url: "https://x/api/learning-trace/" + CID + (action ? "/" + action : "") + query, headers: { get: () => null }, params: { courseId: CID, ...(action ? { action } : {}) } }, deps, obs);
const steps = (deps, t, obs) => get(deps, { action: "steps", query: "?pageId=" + encodeURIComponent(t.pageId) + "&blockId=" + encodeURIComponent(t.blockId) }, obs);
const logs = () => { const all = []; const rec = level => (name, data) => all.push([level, name, data]); return { all, logInfo: rec("info"), logWarn: rec("warn"), logError: rec("error") }; };
const answered = (how) => ({ [STUDY]: { schemaVersion: 1, pages: { [EX.pageId]: { courseId: CID, moduleId: EX.moduleId, completed: how === "completed" ? { [EX.activityId]: "2026-11-10T10:00:00Z" } : {}, ...(how === "revealed" ? { revealed: { [EX.activityId]: "2026-11-10T10:00:00Z" } } : {}) } } } });

describe("899371 P13 — the trace index the route serves", () => {
  it("has the exercise and book traces of the course, each with its module, program and steps", () => {
    expect(all.length).toBe(151);
    expect(all.filter(t => t.kind === "exercise").every(t => /^m\d\d-l\d\d-p\d\d-q\d\d$/.test(t.activityId) && t.blockId === t.activityId + "-code")).toBe(true);
    expect(EX && BOOK).toBeTruthy();
  });
});

describe("899371 P13 — who may watch what", () => {
  it("a teacher sees every trace, open, and gets its steps", async () => {
    const ctx = seed([]);
    const r = await get(teacherDeps(ctx));
    expect(r.status).toBe(200);
    expect(Object.keys(r.jsonBody.traces).length).toBe(151);
    expect(new Set(Object.values(r.jsonBody.traces))).toEqual(new Set(["open"]));
    const s = await steps(teacherDeps(ctx), BOOK);
    expect(s.status).toBe(200);
    expect(Object.keys(s.jsonBody.trace).sort()).toEqual(["code", "kind", "steps", ...(BOOK.stdin !== undefined ? ["stdin"] : []), ...(BOOK.valuesFrom ? ["valuesFrom"] : [])].sort());
    expect(s.jsonBody.trace.code).toBe(BOOK.code);
    expect(s.jsonBody.trace.steps).toEqual(BOOK.steps);
  });

  it("an exercise: «answer-first» and 409 until the student's own record says answered; completed or revealed opens it", async () => {
    const vis = [{ courseId: CID, visibleModuleIds: [EX.moduleId] }];
    let ctx = seed(vis);
    let r = await get(studentDeps(ctx));
    expect(r.jsonBody.traces[EX.key]).toBe("answer-first");
    const obs = logs();
    let s = await steps(studentDeps(ctx), EX, obs);
    expect([s.status, s.jsonBody.code]).toEqual([409, "ANSWER_FIRST"]);
    expect(s.jsonBody.trace).toBeUndefined();
    expect(obs.all).toEqual([["warn", "learning.trace.refused", { code: "ANSWER_FIRST", status: 409 }]]);
    for (const how of ["completed", "revealed"]) {
      ctx = seed(vis, {}, answered(how));
      r = await get(studentDeps(ctx));
      expect(r.jsonBody.traces[EX.key], how).toBe("open");
      s = await steps(studentDeps(ctx), EX);
      expect(s.status, how).toBe(200);
      expect(s.jsonBody.trace.steps).toEqual(EX.steps);
    }
  });

  it("a book question: not listed and 403 NOT_RELEASED until the teacher releases the module; released but hidden stays closed", async () => {
    let ctx = seed([{ courseId: CID, visibleModuleIds: [BOOK.moduleId] }]);
    let r = await get(studentDeps(ctx));
    expect(r.jsonBody.traces[BOOK.key]).toBeUndefined();
    let s = await steps(studentDeps(ctx), BOOK);
    expect([s.status, s.jsonBody.code]).toEqual([403, "NOT_RELEASED"]);
    ctx = seed([{ courseId: CID, visibleModuleIds: [BOOK.moduleId], releasedModuleIds: [BOOK.moduleId] }]);
    r = await get(studentDeps(ctx));
    expect(r.jsonBody.traces[BOOK.key]).toBe("open");
    s = await steps(studentDeps(ctx), BOOK);
    expect(s.status).toBe(200);
    expect(s.jsonBody.trace.kind).toBe("book");
    ctx = seed([{ courseId: CID, visibleModuleIds: [], releasedModuleIds: [BOOK.moduleId] }]);
    r = await get(studentDeps(ctx));
    expect(r.jsonBody.traces[BOOK.key]).toBeUndefined();
    s = await steps(studentDeps(ctx), BOOK);
    expect([s.status, s.jsonBody.code]).toEqual([403, "UNAVAILABLE"]);
  });

  it("a student sees only traces of published modules; a released module opens only its own book traces", async () => {
    const ctx = seed([{ courseId: CID, visibleModuleIds: ["899371-m05", "899371-m06"], releasedModuleIds: ["899371-m05"] }]);
    const r = await get(studentDeps(ctx));
    const listed = Object.keys(r.jsonBody.traces).map(k => INDEX.traces[k]);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every(t => t.moduleId === "899371-m05" || t.moduleId === "899371-m06")).toBe(true);
    expect(listed.filter(t => t.kind === "book").every(t => t.moduleId === "899371-m05")).toBe(true);
    expect(listed.some(t => t.kind === "exercise" && t.moduleId === "899371-m06")).toBe(true);
  });

  it.each([
    ["an archived class", seed([{ courseId: CID, visibleModuleIds: ["899371-m05"] }], { status: "archived", active: false }), 403, "ARCHIVED"],
    ["a class without the course", seed([]), 403, "UNAVAILABLE"],
    ["no class", createMemoryContainer({ [USR]: { ...student, classId: "" } }), 403, "UNAVAILABLE"],
  ])("refuses %s", async (_what, ctx, status, code) => {
    for (const r of [await get(studentDeps(ctx)), await steps(studentDeps(ctx), EX)]) expect([r.status, r.jsonBody.code]).toEqual([status, code]);
  });

  it("refuses an unknown block, bad ids, another method and another course; nobody without a session", async () => {
    const ctx = seed([{ courseId: CID, visibleModuleIds: [EX.moduleId] }]);
    expect((await steps(teacherDeps(ctx), { pageId: EX.pageId, blockId: "m05-l04-p01-q99-code" })).status).toBe(404);
    expect((await get(teacherDeps(ctx), { action: "steps", query: "?pageId=../x&blockId=a" })).status).toBe(400);
    expect((await get(teacherDeps(ctx), { action: "steps" })).status).toBe(400);
    expect((await get(teacherDeps(ctx), { method: "POST" })).status).toBe(405);
    expect((await get(teacherDeps(ctx), { action: "run" })).status).toBe(405);
    const other = await handler({ method: "GET", url: "https://x/api/learning-trace/791381", headers: { get: () => null }, params: { courseId: "791381" } }, teacherDeps(ctx));
    expect(other.status).toBe(404);
    const none = await get({ ...BUILDER_NO, requireStudentAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), container: ctx.container });
    expect(none.status).toBe(401);
  });

  it("reads only: nothing is written by listing or watching", async () => {
    const ctx = seed([{ courseId: CID, visibleModuleIds: [EX.moduleId], releasedModuleIds: [EX.moduleId] }], {}, answered("completed"));
    const before = JSON.stringify(ctx.names(""));
    const snapshot = [CLS, STUDY, USR].map(n => JSON.stringify(ctx.getJson(n)));
    await get(studentDeps(ctx)); await steps(studentDeps(ctx), EX); await steps(studentDeps(ctx), BOOK);
    expect(JSON.stringify(ctx.names(""))).toBe(before);
    expect([CLS, STUDY, USR].map(n => JSON.stringify(ctx.getJson(n)))).toEqual(snapshot);
  });
});
