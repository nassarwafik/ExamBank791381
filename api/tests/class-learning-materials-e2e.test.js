import { describe, it, expect } from "vitest";
import { handler as classrooms } from "../src/functions/manage-classrooms.js";
import { handler as studentMaterials } from "../src/functions/student-learning-materials.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Class Learning Materials — the FULL teacher → class → student journey over the real handlers and the real
// storage helpers (in-memory container), exactly the manual scenario of the phase: class 11-3, student A, no
// material → attach 791381 with m01 → publish m02 → publish m07 → hide m02 → re-publish m02 → remove the book.
// The student side is the entitlement endpoint (what «موادي التعليمية» and the Reader receive); the Reader-level
// behaviour for each state is proven in src/learning/reader/progressiveRelease.e2e.test.tsx.

const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const CLASS = "platform/classes/11-3.json", USER = "platform/users/studentA.json";
const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const teacher = (ctx, body, events) => classrooms({ method: "POST", url: "https://x/api/classrooms", json: async () => body }, { ...AUTH, container: ctx.container, recordAuditEvent: async (_c, ev) => events.push(ev) });
const studentReads = async ctx => {
  const reads = [];
  const r = await studentMaterials({ method: "GET", url: "https://x/api/student-learning-materials", headers: { get: () => null } }, {
    requireStudentAuth: () => ({ ok: true, user: { sub: "studentA", sv: 1, role: "student", classId: "STALE-TOKEN-CLASS" } }),
    container: ctx.container, downloadJsonOrNull: async (_c, n) => { reads.push(n); return ctx.getJson(n); }
  });
  return { r, reads };
};
const titles = r => (r.jsonBody.materials[0]?.modules || []).map(m => m.title);
const ids = r => (r.jsonBody.materials[0]?.modules || []).map(m => m.moduleId);

describe("E2E — progressive release journey for class 11-3 / student A", () => {
  it("walks the whole scenario with server-authoritative, default-deny results at every step", async () => {
    const events = [];
    const ctx = createMemoryContainer({
      [CLASS]: { classId: "11-3", name: "11-3", grade: "11", schoolYear: "2026-2027", active: true, status: "active", studentIds: ["studentA"], programCodes: ["794589"], createdAt: "2026-01-01" },
      [USER]: { userId: "studentA", role: "student", active: true, archived: false, authVersion: 1, classId: "11-3", displayName: "طالب أ", code: "A1" },
      "platform/assignments/a1.json": { assignmentId: "a1", classId: "11-3", status: "published" }
    });
    const snapshot = () => JSON.stringify({ ...ctx.getJson(CLASS), learningMaterials: undefined, updatedAt: undefined });
    const baseline = snapshot();

    // Start — no learning material: the student sees nothing (the portal renders «لا توجد مواد تعليمية مضافة لصفك حاليًا»).
    let { r, reads } = await studentReads(ctx);
    expect(r.jsonBody).toEqual({ ok: true, materials: [] });
    expect(reads).toEqual([USER, CLASS]);                                                      // persisted class, never the token's

    // Teacher attaches Book 791381 and publishes ONLY m01.
    let t = await teacher(ctx, { action: "setLearningCourseModules", classId: "11-3", courseId: "791381", moduleIds: [M01] }, events);
    expect(t.status).toBe(200);
    ({ r } = await studentReads(ctx));
    expect(r.jsonBody.materials).toEqual([{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: M01, title: "أساسيات الشبكات", order: 1 }] }]);
    expect(r.jsonBody.materials[0].modules.length).toBe(1);                                    // «1 وحدة متاحة»
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/الأعداد والموازين|عناوين IP/);

    // Teacher publishes m02.
    t = await teacher(ctx, { action: "setLearningCourseModules", classId: "11-3", courseId: "791381", moduleIds: [M01, M02] }, events);
    expect(t.jsonBody.learningMaterials[0].visibleModuleIds).toEqual([M01, M02]);
    ({ r } = await studentReads(ctx));
    expect(titles(r)).toEqual(["أساسيات الشبكات", "الأعداد والموازين"]);

    // Teacher publishes m07 (sent out of order on purpose — the server canonicalizes).
    t = await teacher(ctx, { action: "setLearningCourseModules", classId: "11-3", courseId: "791381", moduleIds: [M07, M02, M01] }, events);
    expect(t.jsonBody.learningMaterials[0].visibleModuleIds).toEqual([M01, M02, M07]);
    ({ r } = await studentReads(ctx));
    expect(titles(r)).toEqual(["أساسيات الشبكات", "الأعداد والموازين", "عناوين IP"]);

    // Teacher hides m02 (middle module).
    t = await teacher(ctx, { action: "setLearningCourseModules", classId: "11-3", courseId: "791381", moduleIds: [M01, M07] }, events);
    ({ r } = await studentReads(ctx));
    expect(ids(r)).toEqual([M01, M07]);
    expect(titles(r)).toEqual(["أساسيات الشبكات", "عناوين IP"]);
    expect(JSON.stringify(r.jsonBody)).not.toContain("الأعداد والموازين");                      // no blank, no hidden name

    // Teacher re-publishes m02 → canonical order restored.
    t = await teacher(ctx, { action: "setLearningCourseModules", classId: "11-3", courseId: "791381", moduleIds: [M02, M01, M07] }, events);
    ({ r } = await studentReads(ctx));
    expect(ids(r)).toEqual([M01, M02, M07]);

    // Teacher removes Book 791381 → no materials; nothing deleted (class, roster, projects, assignments intact).
    t = await teacher(ctx, { action: "removeLearningCourse", classId: "11-3", courseId: "791381" }, events);
    expect(t.jsonBody).toEqual({ ok: true, classId: "11-3", removed: true, learningMaterials: [] });
    ({ r } = await studentReads(ctx));
    expect(r.jsonBody).toEqual({ ok: true, materials: [] });
    expect(snapshot()).toBe(baseline);                                                         // every other class field byte-identical
    expect(ctx.getJson(USER).classId).toBe("11-3");
    expect(ctx.names("platform/assignments/")).toEqual(["platform/assignments/a1.json"]);
    expect(ctx.names("platform/").filter(n => !/^platform\/(classes|users|assignments)\//.test(n))).toEqual([]);   // no content blob ever written/deleted

    // Audit trail: one event per teacher step (5 sets + 1 remove), actor + class + course, no student PII.
    expect(events.map(e => e.action)).toEqual([...Array(5).fill("class.learningMaterials.setModules"), "class.learningMaterials.removeCourse"]);
    expect(events.every(e => e.actor === "teacher-1" && e.targetId === "11-3" && e.details.courseId === "791381")).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(/studentA|طالب أ|A1"/);
  });
});
