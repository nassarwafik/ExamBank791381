import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getSupportedProjects, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F3-UI (reconciliation with F1b) — the teacher's review was written and tested on the 794589 form. A second project
// (883589) ships a form since: the same review path must hold for EVERY bundled form — hide a question, a complete form of
// right answers, the evidence, the ratings, the approval and the student's result.

const NOW = "2026-11-14T10:00:00.000Z";
const CODES = getSupportedProjects().map(p => (typeof p === "string" ? p : p.projectCode || p.code)).filter(code => getExamFormTemplate(code));
const room = code => ({ classId: "c1", name: "صف c1", grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [code], createdAt: NOW, updatedAt: NOW });
const user = { userId: "s1", role: "student", active: true, archived: false, authVersion: 1, classId: "c1", displayName: "طالب", code: "C1" };
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}
function rightAnswer(q) {
  if (q.grading === "auto") {
    if (q.kind === "choice") return q.justification ? { optionId: q.answer.correctOptionId, justification: "لأن" } : { optionId: q.answer.correctOptionId };
    if (q.kind === "multiChoice") return { optionIds: q.answer.correctOptionIds };
    if (q.kind === "matching") return { pairs: q.answer.pairs };
    return { order: q.answer.order };
  }
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options[0].id, justification: "لأن" } : { optionId: q.options[0].id };
    case "multiChoice": return { optionIds: [q.options[0].id] };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: return { text: "جواب " + q.questionId };
  }
}

describe("F3 the review holds for every project that ships an exam form", () => {
  it("at least the two bundled forms are covered", () => {
    expect(CODES).toEqual(expect.arrayContaining(["794589", "883589"]));
  });

  for (const code of CODES) {
    it(code + ": hide one question, submit right answers, rate, approve — mark 100, full evidence, no key for the student", async () => {
      const template = getExamFormTemplate(code);
      const NS = getStorageNamespace(code);
      const ctx = createMemoryContainer({ "platform/classes/c1.json": room(code), "platform/users/s1.json": user });
      const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
      const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
      const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: user }) };
      const tPost = body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", ...body }) }, teacherDeps);
      const tGet = (resource, params = {}) => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: code, classId: "c1", resource, ...params }), json: async () => ({}) }, teacherDeps);
      const sPost = body => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: code, ...body }) }, studentDeps);
      const sGet = () => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?projectCode=" + code, json: async () => ({}) }, studentDeps);

      // the teacher hides the first auto-marked question of a section that keeps other questions
      const picker = (await tGet("exam-form-questions")).jsonBody;
      expect(keysDeep(picker).has("answer")).toBe(false);
      const hideFrom = template.sections.find(s => s.questions.length > 1 && s.questions.some(q => q.grading === "auto"));
      const hiddenId = hideFrom.questions.find(q => q.grading === "auto").questionId;
      const opened = await tPost({ action: "examForm.open", hiddenQuestionIds: [hiddenId] });
      expect(opened.status).toBe(200);
      const frozen = ctx.getJson(NS.examFormClassName("c1")).template.sections.flatMap(s => s.questions);
      const all = template.sections.flatMap(s => s.questions);
      expect(frozen).toHaveLength(all.length - 1);
      const autos = frozen.filter(q => q.grading === "auto").length;
      expect(autos).toBe(all.filter(q => q.grading === "auto").length - 1);

      const answers = Object.fromEntries(frozen.filter(q => !DEFERRED_KINDS.has(q.kind)).map(q => [q.questionId, rightAnswer(q)]));
      expect((await sPost({ action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
      const submit = await sPost({ action: "submit", baseRevision: 1 });
      expect(submit.status).toBe(200);

      const view = (await tGet("exam-form-student", { studentId: "s1" })).jsonBody;
      expect(view.auto).toMatchObject({ total: autos, answered: autos, correct: autos });
      expect(view.unrated).toEqual(template.sections.filter(s => s.weight > 0).map(s => s.sectionId));
      const top = template.rubric.levels.length - 1;
      const ratings = Object.fromEntries(template.sections.map(s => [s.sectionId, { level: top }]));
      expect((await tPost({ action: "examForm.review", studentId: "s1", expectedRevision: 2, ratings })).status).toBe(200);
      const approved = await tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
      expect(approved.status).toBe(200);
      expect(approved.jsonBody.result).toMatchObject({ mark: 100, outOf: 100 });

      const student = (await sGet()).jsonBody;
      expect(student.status).toBe("approved");
      expect(student.result.mark).toBe(100);
      expect(student.result.sections).toHaveLength(template.sections.filter(s => s.weight > 0).length);
      expect(Object.values(student.result.auto).every(v => v === true)).toBe(true);
      expect(Object.keys(student.result.auto)).not.toContain(hiddenId);
      const keys = keysDeep({ ...student, answers: null });
      for (const secret of ["answer", "correctOptionId", "correctOptionIds", "rubric", "review"]) expect(keys.has(secret)).toBe(false);
    });
  }
});
