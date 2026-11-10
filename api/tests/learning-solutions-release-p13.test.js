import { describe, it, expect } from "vitest";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  getClassLearningMaterials, getReleasedLearningModuleIds, classSolutionsReleased, setClassLearningCourseReleases, setClassLearningCourseModules
} from "../src/lib/class-learning-materials.js";
import { courseHasSolutionRelease } from "../src/lib/learning-materials-registry.js";
import { ROUTE_CAPABILITIES } from "../src/lib/access/route-capabilities.js";

// 899371 enrichment P13 — decision D1 (docs/enterprise-899371-enrichment-plan.md §4.1, §9): the BOOK solutions and output tracers of a
// module stay closed to a class's students until the teacher opens them for that module. The SERVER owns it:
//   • storage: the class's learningMaterials entry carries `releasedModuleIds` (only for a course that has a release, only when
//     non-empty — a class that never released anything keeps its exact earlier shape), canonical, unknown ids dropped;
//   • the gate: released AND published (a hidden module stays closed); default-deny for anything else;
//   • publishing / hiding a module never drops a release; removing the course drops it with the course;
//   • the action setLearningCourseReleases: capability learning.module.release, the course must have a release and be attached, ids
//     validated, archived class refused, CAS write, audited with what was opened and closed.

const C = "899371", M1 = "899371-m01", M2 = "899371-m02", M5 = "899371-m05";
const CLASS = "platform/classes/c1.json";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const post = (ctx, body, events = []) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, { ...AUTH, container: ctx.container, recordAuditEvent: async (_c, ev) => events.push(ev) });
const fresh = (materials, extra = {}) => createMemoryContainer({ [CLASS]: { classId: "c1", name: "11-1", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], createdAt: "2026-01-01", ...(materials ? { learningMaterials: materials } : {}), ...extra } });

describe("P13 D1 — the release in a class's learning materials (pure)", () => {
  it("only 899371 has a solutions release", () => {
    expect(courseHasSolutionRelease(C)).toBe(true);
    for (const c of ["791381", "791381s", "", "nope", " 899371x"]) expect(courseHasSolutionRelease(c)).toBe(false);
  });

  it("is normalized: canonical, unknown ids dropped, only when non-empty, never for a course without release", () => {
    const cls = { learningMaterials: [
      { courseId: C, visibleModuleIds: [M2, M1], releasedModuleIds: [M5, "899371-m99", " ", M1, M1] },
      { courseId: "791381", visibleModuleIds: ["791381-m01"], releasedModuleIds: ["791381-m01"] },
    ] };
    expect(getClassLearningMaterials(cls)).toEqual([
      { courseId: "791381", visibleModuleIds: ["791381-m01"] },                          // no release for a course that has none
      { courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1, M5] },
    ]);
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: C, visibleModuleIds: [M1], releasedModuleIds: [] }] })).toEqual([{ courseId: C, visibleModuleIds: [M1] }]);
    expect(getClassLearningMaterials({ learningMaterials: [{ courseId: C, visibleModuleIds: [M1], releasedModuleIds: "899371-m01" }] })).toEqual([{ courseId: C, visibleModuleIds: [M1] }]);
  });

  it("the gate: released AND published; default-deny otherwise", () => {
    const cls = { learningMaterials: [{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1, M5] }] };
    expect(classSolutionsReleased(cls, C, M1)).toBe(true);
    expect(classSolutionsReleased(cls, C, M2)).toBe(false);                               // published, not released
    expect(classSolutionsReleased(cls, C, M5)).toBe(false);                               // released, but hidden from the students
    expect(classSolutionsReleased(cls, "791381", "791381-m01")).toBe(false);
    for (const bad of [null, undefined, {}, { learningMaterials: "x" }, { learningMaterials: [{ courseId: C, visibleModuleIds: [M1] }] }]) expect(classSolutionsReleased(bad, C, M1)).toBe(false);
    expect(getReleasedLearningModuleIds(cls, C)).toEqual([M1, M5]);
    expect(getReleasedLearningModuleIds(null, C)).toEqual([]);
  });

  it("publishing / hiding never drops a release; setting releases never touches the publication", () => {
    const cls = { classId: "c1", learningMaterials: [{ courseId: C, visibleModuleIds: [M1], releasedModuleIds: [M1] }] };
    const published = setClassLearningCourseModules(cls, C, [M1, M2]);
    expect(getClassLearningMaterials(published)).toEqual([{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1] }]);
    const hidden = setClassLearningCourseModules(published, C, [M2]);
    expect(getReleasedLearningModuleIds(hidden, C)).toEqual([M1]);
    expect(classSolutionsReleased(hidden, C, M1)).toBe(false);                            // kept, but closed while hidden
    const opened = setClassLearningCourseReleases(published, C, [M2, M1]);
    expect(getClassLearningMaterials(opened)).toEqual([{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1, M2] }]);
    const closed = setClassLearningCourseReleases(opened, C, []);
    expect(getClassLearningMaterials(closed)).toEqual([{ courseId: C, visibleModuleIds: [M1, M2] }]);
    expect(() => setClassLearningCourseReleases({ learningMaterials: [] }, C, [M1])).toThrow(/not attached/);
    expect(() => setClassLearningCourseReleases({ learningMaterials: [{ courseId: "791381", visibleModuleIds: [] }] }, "791381", [])).toThrow(/no solutions release/);
  });
});

describe("P13 D1 — the setLearningCourseReleases action", () => {
  it("is declared with the release capability", () => {
    expect(ROUTE_CAPABILITIES["manage-classrooms.js"].setlearningcoursereleases).toBe("learning.module.release");
  });

  it("opens and closes per module, keeps the publication, audits what changed", async () => {
    const events = [];
    const ctx = fresh([{ courseId: C, visibleModuleIds: [M1, M2] }]);
    let r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", courseId: C, moduleIds: [M2, M1] }, events);
    expect(r.status).toBe(200);
    expect(r.jsonBody.learningMaterials).toEqual([{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1, M2] }]);
    expect(ctx.getJson(CLASS).learningMaterials).toEqual([{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M1, M2] }]);
    r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", courseId: C, moduleIds: [M2] }, events);
    expect(r.jsonBody.learningMaterials).toEqual([{ courseId: C, visibleModuleIds: [M1, M2], releasedModuleIds: [M2] }]);
    const audits = events.filter(e => e.action === "class.learningMaterials.setReleases");
    expect(audits.map(e => [e.actor, e.targetId, e.details])).toEqual([
      ["teacher-1", "c1", { courseId: C, moduleIds: [M1, M2], opened: [M1, M2], closed: [] }],
      ["teacher-1", "c1", { courseId: C, moduleIds: [M2], opened: [], closed: [M1] }],
    ]);
  });

  it("refuses a course without release even when it is attached (its own refusal, nothing written)", async () => {
    const ctx = fresh([{ courseId: "791381", visibleModuleIds: ["791381-m01"] }, { courseId: C, visibleModuleIds: [M1] }]);
    const before = JSON.stringify(ctx.getJson(CLASS));
    const r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", courseId: "791381", moduleIds: ["791381-m01"] });
    expect([r.status, r.jsonBody.error]).toEqual([400, "لا حلول قابلة للفتح في هذه المادة."]);
    expect(JSON.stringify(ctx.getJson(CLASS))).toBe(before);
  });

  it.each([
    ["a course without release", { courseId: "791381", moduleIds: [] }, 400],
    ["an unknown module", { courseId: C, moduleIds: ["899371-m99"] }, 400],
    ["no course", { moduleIds: [M1] }, 400],
    ["a malformed list", { courseId: C, moduleIds: "899371-m01" }, 400],
  ])("refuses %s (nothing written)", async (_what, body, status) => {
    const ctx = fresh([{ courseId: C, visibleModuleIds: [M1] }]);
    const before = JSON.stringify(ctx.getJson(CLASS));
    const r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", ...body });
    expect(r.status).toBe(status);
    expect(JSON.stringify(ctx.getJson(CLASS))).toBe(before);
  });

  it("refuses a course not attached to the class, an archived class and a missing class", async () => {
    let ctx = fresh([]);
    let r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", courseId: C, moduleIds: [M1] });
    expect([r.status, r.jsonBody.error]).toEqual([400, "أضف المادة إلى الصف أولًا."]);
    ctx = fresh([{ courseId: C, visibleModuleIds: [M1] }], { status: "archived", active: false });
    r = await post(ctx, { action: "setLearningCourseReleases", classId: "c1", courseId: C, moduleIds: [M1] });
    expect(r.status).toBe(403);
    expect(ctx.getJson(CLASS).learningMaterials).toEqual([{ courseId: C, visibleModuleIds: [M1] }]);
    r = await post(ctx, { action: "setLearningCourseReleases", classId: "nope", courseId: C, moduleIds: [M1] });
    expect(r.status).toBe(404);
  });
});
