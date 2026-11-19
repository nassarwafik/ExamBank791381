import { describe, it, expect } from "vitest";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";
import { handler as studentMaterials } from "../src/functions/student-learning-materials.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import {
  getClassLearningMaterials, setClassLearningCourseTools, getClassLearningCourseTools, setClassLearningCourseModules, setClassLearningCourseReleases,
  removeClassLearningCourse, buildStudentLearningMaterials
} from "../src/lib/class-learning-materials.js";
import { ROUTE_CAPABILITIES } from "../src/lib/access/route-capabilities.js";
import { validateBookStudentTools } from "../src/lib/shared-finalization/studentTools/studentToolsSpec.js";

// Phase T11 — the student tools of a course book, chosen by the class's teacher (docs/enterprise-student-tools-t.md §18).
//   • storage: the class's learningMaterials entry carries `studentTools` only when the teacher chose (canonical; [] = tools off); a
//     stored value that is no longer valid reads as absent (the book's built-in set), never as a partial spec;
//   • publishing / hiding / releasing never drops it; removing the course drops it with the course;
//   • the action setLearningCourseTools: capability learning.module.release, the course must be attached, the spec is checked by
//     validateBookStudentTools (no sections, no formula sheet), null restores the built-in set, archived class refused, audited with
//     the tool ids only;
//   • the student endpoint delivers the class's choice with the course.

const NET = "791381", N1 = "791381-m01", C = "899371", C1 = "899371-m01";
const CLASS = "platform/classes/c1.json";
const CALC = { id: "calculator", variant: "scientific", angleUnit: "deg" };
const BASE = { id: "baseConverter", bases: [2, 10, 16], showSteps: true };
const SPEC = { version: 1, tools: [CALC, BASE] };
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const post = (ctx, body, events = []) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, { ...AUTH, container: ctx.container, recordAuditEvent: async (_c, ev) => events.push(ev) });
const room = (materials, extra = {}) => ({ classId: "c1", name: "11-1", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: [], createdAt: "2026-01-01", ...(materials ? { learningMaterials: materials } : {}), ...extra });
const fresh = (materials, extra = {}) => createMemoryContainer({ [CLASS]: room(materials, extra) });

describe("T11 — the book's tool set rule", () => {
  it("accepts a valid spec and an empty list (tools off); refuses sections and a formula sheet", () => {
    expect(validateBookStudentTools(SPEC).ok).toBe(true);
    expect(validateBookStudentTools({ version: 1, tools: [] }).ok).toBe(true);
    const sheet = { id: "formulaSheet", title: "ق", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "x" }] }] } };
    const r1 = validateBookStudentTools({ version: 1, tools: [CALC, sheet] });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.issues.map(i => i.code)).toContain("STUDENT_TOOLS_BOOK_TOOL_NOT_ALLOWED");
    const r2 = validateBookStudentTools({ version: 1, tools: [CALC], sectionOverrides: { s1: { disabled: ["calculator"] } } });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.issues.map(i => i.code)).toContain("STUDENT_TOOLS_BOOK_NO_SECTIONS");
    expect(validateBookStudentTools({ version: 1, tools: [{ id: "calculator" }] }).ok).toBe(false);
  });
});

describe("T11 — the book tools in a class's learning materials (pure)", () => {
  it("are stored only when chosen, canonical; a class that never chose keeps its exact earlier shape", () => {
    const cls = { classId: "c1", learningMaterials: [{ courseId: NET, visibleModuleIds: [N1] }] };
    expect(getClassLearningMaterials(cls)).toEqual([{ courseId: NET, visibleModuleIds: [N1] }]);
    const set = setClassLearningCourseTools(cls, NET, { version: 1, tools: [{ ...BASE, bases: [16, 2, 10] }, CALC] });
    expect(getClassLearningCourseTools(set, NET)).toEqual({ version: 1, tools: [BASE, CALC] });   // canonical: the teacher's order kept, bases sorted
    const off = setClassLearningCourseTools(set, NET, { version: 1, tools: [] });
    expect(getClassLearningCourseTools(off, NET)).toEqual({ version: 1, tools: [] });
    const reset = setClassLearningCourseTools(off, NET, null);
    expect(getClassLearningMaterials(reset)).toEqual([{ courseId: NET, visibleModuleIds: [N1] }]);
    expect(getClassLearningCourseTools(reset, NET)).toBeUndefined();
    expect(() => setClassLearningCourseTools({ learningMaterials: [] }, NET, SPEC)).toThrow(/not attached/);
    expect(() => setClassLearningCourseTools(cls, NET, { version: 1, tools: [{ id: "nope" }] })).toThrow(/invalid book tools/);
  });

  it("a stored value that is no longer valid reads as the built-in set (never a partial spec)", () => {
    for (const bad of [{ version: 2, tools: [] }, { version: 1, tools: [{ id: "calculator" }] }, "x", null, { version: 1, tools: [CALC], sectionOverrides: { s: { disabled: ["calculator"] } } }]) {
      expect(getClassLearningMaterials({ learningMaterials: [{ courseId: NET, visibleModuleIds: [N1], studentTools: bad }] })).toEqual([{ courseId: NET, visibleModuleIds: [N1] }]);
    }
  });

  it("publishing, hiding and releasing keep the choice; removing the course drops it", () => {
    const cls = setClassLearningCourseTools({ classId: "c1", learningMaterials: [{ courseId: C, visibleModuleIds: [C1] }] }, C, SPEC);
    const published = setClassLearningCourseModules(cls, C, [C1, "899371-m02"]);
    expect(getClassLearningCourseTools(published, C)).toEqual(SPEC);
    const hidden = setClassLearningCourseModules(published, C, []);
    expect(getClassLearningCourseTools(hidden, C)).toEqual(SPEC);
    const released = setClassLearningCourseReleases(published, C, [C1]);
    expect(getClassLearningMaterials(released)).toEqual([{ courseId: C, visibleModuleIds: [C1, "899371-m02"], releasedModuleIds: [C1], studentTools: SPEC }]);
    expect(getClassLearningMaterials(removeClassLearningCourse(released, C).classroom)).toEqual([]);
  });

  it("the student catalog carries the choice with its course, and nothing for a course without one", () => {
    const cls = setClassLearningCourseTools({ learningMaterials: [{ courseId: NET, visibleModuleIds: [N1] }, { courseId: C, visibleModuleIds: [C1] }] }, C, { version: 1, tools: [] });
    const out = buildStudentLearningMaterials(cls);
    expect(out.find(m => m.courseId === NET).studentTools).toBeUndefined();
    expect(out.find(m => m.courseId === C).studentTools).toEqual({ version: 1, tools: [] });
  });
});

describe("T11 — the setLearningCourseTools action", () => {
  it("is declared with the publishing capability", () => {
    expect(ROUTE_CAPABILITIES["manage-classrooms.js"].setlearningcoursetools).toBe("learning.module.release");
  });

  it("sets, turns off and restores the book's tools; the publication is untouched; audits the tool ids only", async () => {
    const events = [];
    const ctx = fresh([{ courseId: NET, visibleModuleIds: [N1] }]);
    let r = await post(ctx, { action: "setLearningCourseTools", classId: "c1", courseId: NET, studentTools: SPEC }, events);
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.learningMaterials).toEqual([{ courseId: NET, visibleModuleIds: [N1], studentTools: SPEC }]);
    expect(ctx.getJson(CLASS).learningMaterials).toEqual([{ courseId: NET, visibleModuleIds: [N1], studentTools: SPEC }]);
    r = await post(ctx, { action: "setLearningCourseTools", classId: "c1", courseId: NET, studentTools: { version: 1, tools: [] } }, events);
    expect(r.jsonBody.learningMaterials[0].studentTools).toEqual({ version: 1, tools: [] });
    r = await post(ctx, { action: "setLearningCourseTools", classId: "c1", courseId: NET, studentTools: null }, events);
    expect(ctx.getJson(CLASS).learningMaterials).toEqual([{ courseId: NET, visibleModuleIds: [N1] }]);
    expect(events.filter(e => e.action === "class.learningMaterials.setTools").map(e => [e.actor, e.targetId, e.details])).toEqual([
      ["teacher-1", "c1", { courseId: NET, before: null, after: ["calculator", "baseConverter"] }],
      ["teacher-1", "c1", { courseId: NET, before: ["calculator", "baseConverter"], after: [] }],
      ["teacher-1", "c1", { courseId: NET, before: [], after: null }]
    ]);
  });

  it.each([
    ["a formula sheet", { courseId: NET, studentTools: { version: 1, tools: [{ id: "formulaSheet", title: "ق", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "x" }] }] } }] } }, 400],
    ["section overrides", { courseId: NET, studentTools: { version: 1, tools: [CALC], sectionOverrides: { s1: { disabled: ["calculator"] } } } }, 400],
    ["a malformed spec", { courseId: NET, studentTools: { version: 1, tools: [{ id: "calculator", expression: "1+1" }] } }, 400],
    ["no studentTools field", { courseId: NET }, 400],
    ["no course", { studentTools: SPEC }, 400],
    ["a course not attached to the class", { courseId: C, studentTools: SPEC }, 400]
  ])("refuses %s (nothing written)", async (_what, body, status) => {
    const ctx = fresh([{ courseId: NET, visibleModuleIds: [N1] }]);
    const before = JSON.stringify(ctx.getJson(CLASS));
    const r = await post(ctx, { action: "setLearningCourseTools", classId: "c1", ...body });
    expect(r.status).toBe(status);
    expect(JSON.stringify(ctx.getJson(CLASS))).toBe(before);
  });

  it("an archived class is refused; an unknown class is not found", async () => {
    const ctx = fresh([{ courseId: NET, visibleModuleIds: [N1] }], { status: "archived", active: false });
    const before = JSON.stringify(ctx.getJson(CLASS));
    expect((await post(ctx, { action: "setLearningCourseTools", classId: "c1", courseId: NET, studentTools: SPEC })).status).toBe(403);
    expect(JSON.stringify(ctx.getJson(CLASS))).toBe(before);
    expect((await post(ctx, { action: "setLearningCourseTools", classId: "nope", courseId: NET, studentTools: SPEC })).status).toBe(404);
  });
});

describe("T11 — the student endpoint delivers the class's choice", () => {
  it("the course carries the teacher's tools; a course without a choice carries none (the reader uses the built-in set)", async () => {
    const ctx = createMemoryContainer({
      ["platform/users/u1.json"]: { userId: "u1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "علي", code: "S1" },
      [CLASS]: room([{ courseId: NET, visibleModuleIds: [N1], studentTools: SPEC }, { courseId: C, visibleModuleIds: [C1] }])
    });
    const r = await studentMaterials({ method: "GET", url: "https://x/api/student-learning-materials", headers: { get: () => null } }, {
      requireStudentAuth: () => ({ ok: true, user: { sub: "u1", sv: 1, role: "student", classId: "c1" } }), container: ctx.container, getContainer: () => ctx.container,
      downloadJsonOrNull: async (_c, name) => ctx.getJson(name)
    });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(r.jsonBody.materials.find(m => m.courseId === NET).studentTools).toEqual(SPEC);
    expect(r.jsonBody.materials.find(m => m.courseId === C).studentTools).toBeUndefined();
  });
});
