import { describe, it, expect } from "vitest";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F2-UI — the student tracker response carries, per project, the few facts the form's card shows (`examForm`),
// only where the teacher opened the form for the class that serves the project. No question, answer or key; and a form
// that cannot be read never breaks the project page.

const NOW = "2026-11-14T10:00:00.000Z";
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id, codes) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: codes, createdAt: NOW, updatedAt: NOW });
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}
function setup() {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", ["794589", "899373"]), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1") });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const view = async (id = "s1") => studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, studentDeps(id));
  const project = async (code, id) => (await view(id)).jsonBody.projects.find(p => p.projectCode === code);
  const teacher = action => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: "794589", classId: "c1", action }) }, teacherDeps);
  const save = (answers, baseRevision, id = "s1") => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: "794589", action: "saveDraft", baseRevision, answers }) }, studentDeps(id));
  return { ctx, view, project, teacher, save };
}

describe("F2-UI the form summary in the student tracker response", () => {
  it("is absent until the teacher opens the form, and for a project that ships no form", async () => {
    const t = setup();
    expect("examForm" in (await t.project("794589"))).toBe(false);
    await t.teacher("examForm.open");
    expect((await t.project("794589")).examForm).toEqual({ title: "استمارة امتحان المشروع", state: "open", status: "draft", started: false, answered: 0, total: 77 });
    expect("examForm" in (await t.project("899373"))).toBe(false);
  });

  it("follows the student's own progress and the form's state; another student's answers do not show", async () => {
    const t = setup();
    await t.teacher("examForm.open");
    await t.save({ S01Q01: { text: "EcoResort" }, S01Q02: { text: "شبكة منتجع" } }, 0);
    expect((await t.project("794589")).examForm).toMatchObject({ state: "open", status: "draft", started: true, answered: 2, total: 77 });
    expect((await t.project("794589", "s2")).examForm).toMatchObject({ started: false, answered: 0 });
    await t.teacher("examForm.close");
    expect((await t.project("794589")).examForm).toMatchObject({ state: "closed", answered: 2 });
  });

  it("carries no question, answer or key", async () => {
    const t = setup();
    await t.teacher("examForm.open");
    await t.save({ S04Q04: { optionId: "o1" } }, 0);
    const body = (await t.view()).jsonBody;
    expect(Object.keys(body.projects.find(p => p.projectCode === "794589").examForm).sort()).toEqual(["answered", "started", "state", "status", "title", "total"]);
    const keys = keysDeep(body);
    for (const secret of ["answer", "answers", "correctOptionId", "template", "sections", "rubric"]) expect(keys.has(secret)).toBe(false);
  });

  it("a stored form that cannot be trusted hides the card and never breaks the project page", async () => {
    const t = setup();
    await t.teacher("examForm.open");
    const name = getStorageNamespace("794589").examFormClassName("c1");
    const broken = t.ctx.getJson(name);
    broken.template.sections[0].weight += 5;
    t.ctx.setJson(name, broken);
    const r = await t.view();
    expect(r.status).toBe(200);
    expect(r.jsonBody.projects.map(p => p.projectCode).sort()).toEqual(["794589", "899373"]);
    expect("examForm" in r.jsonBody.projects.find(p => p.projectCode === "794589")).toBe(false);
  });
});
