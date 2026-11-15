import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";
import { v1Template, seedV1ClassForm } from "./fixtures/exam-form-v1.js";

// Form version 2 of the 794589 and 883589 exam forms (docs/enterprise-project-exam-form-hand-in-checklist.md). Files are not
// uploaded to the site (owner decision, 2026-11-15), so the file questions of the two forms became one checklist: the
// student ticks what was handed to the teacher, as the 899373 form already asks. Two things must hold:
//   a class that opens its form NOW gets the checklist, and the checklist is a required answer like any other;
//   a class that opened its form under version 1 keeps that form for good — its questions were frozen at its first open —
//   and nothing about it changes: its students read, save and submit as before, and its file questions still never block.

const NOW = "2026-11-15T12:00:00.000Z";
const HAND_IN = "S16Q05";
const FORMS = [
  { code: "794589", questions: 91, v1Questions: 92, v1Files: ["S16Q02", "S16Q03"], first: "ملف Packet Tracer النهائي" },
  { code: "883589", questions: 95, v1Questions: 95, v1Files: ["S16Q03"], first: "مشروع Visual Studio النهائي" }
];
const all = template => template.sections.flatMap(s => s.questions);
const room = (id, code) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [code], createdAt: NOW, updatedAt: NOW });
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });

function fullAnswer(q) {
  switch (q.kind) {
    case "shortText": case "paragraph": case "cli": return { text: "جواب " + q.questionId };
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "choice": return q.justification ? { optionId: q.options[0].id, justification: "تبرير" } : { optionId: q.options[0].id };
    case "multiChoice": return { optionIds: [q.options[0].id] };
    case "matching": return { pairs: Object.fromEntries(q.left.map((l, i) => [l.id, q.right[i % q.right.length].id])) };
    case "ordering": return { order: q.items.map(i => i.id) };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: throw new Error("no answer for " + q.kind);
  }
}
// Every answerable question of a template (image and file questions take no typed answer).
const answersFor = (template, except = []) => Object.fromEntries(all(template).filter(q => q.kind !== "image" && q.kind !== "file" && !except.includes(q.questionId)).map(q => [q.questionId, fullAnswer(q)]));

function setup(code) {
  const NS = getStorageNamespace(code);
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1", code), "platform/users/s1.json": user("s1", "c1") });
  const audits = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); } };
  const studentDeps = { ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: "s1", sv: 1 }, student: ctx.getJson("platform/users/s1.json") }) };
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const teacher = body => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId: "c1", ...body }) }, teacherDeps);
  const teacherGet = (resource, extra = {}) => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: code, classId: "c1", resource, ...extra }), json: async () => ({}) }, teacherDeps);
  const get = () => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?" + new URLSearchParams({ projectCode: code }), json: async () => ({}) }, studentDeps);
  const post = body => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: code, ...body }) }, studentDeps);
  const classForm = () => ctx.getJson(NS.examFormClassName("c1"));
  const doc = () => ctx.getJson(NS.examFormAnswersName("c1", "s1"));
  return { ctx, audits, teacher, teacherGet, get, post, classForm, doc };
}

describe("form version 2 — a class that opens its form now gets the hand-in checklist", () => {
  for (const form of FORMS) {
    it(form.code + ": the first open freezes version 2; the student reads the checklist and no file question", async () => {
      const t = setup(form.code);
      const opened = await t.teacher({ action: "examForm.open" });
      expect(opened.status).toBe(200);
      expect(opened.jsonBody.examForm).toMatchObject({ state: "open", formVersion: 2, summary: { questions: form.questions, files: 0 } });
      expect(t.classForm()).toMatchObject({ formVersion: 2 });
      expect(t.classForm().template).toEqual(JSON.parse(JSON.stringify(getExamFormTemplate(form.code))));
      expect(t.audits[0]).toMatchObject({ action: "project.exam_form.open", details: { formVersion: 2, firstOpen: true } });

      const view = (await t.get()).jsonBody;
      const questions = all(view.form);
      expect(view.form.formVersion).toBe(2);
      expect(questions).toHaveLength(form.questions);
      expect(questions.filter(q => q.kind === "file")).toEqual([]);
      expect(questions.find(q => q.questionId === HAND_IN)).toEqual({
        questionId: HAND_IN, prompt: "أشّر ما سلّمته لمعلمك مباشرة. الملفات لا تُرفع إلى الموقع.", kind: "checklist", grading: "none", required: true,
        items: [{ id: "h1", text: form.first }, { id: "h2", text: "كتاب المشروع النهائي" }]
      });
      expect(view.progress.missing).toContain(HAND_IN);
    });

    it(form.code + ": the checklist is a required answer — a submit without it is refused, with it the form is submitted", async () => {
      const t = setup(form.code);
      await t.teacher({ action: "examForm.open" });                                   // image answers off: image questions wait
      const template = getExamFormTemplate(form.code);
      const saved = await t.post({ action: "saveDraft", baseRevision: 0, answers: answersFor(template, [HAND_IN]) });
      expect(saved.status).toBe(200);
      expect(saved.jsonBody.progress.missing).toEqual([HAND_IN]);
      const refused = await t.post({ action: "submit", baseRevision: 1 });
      expect(refused.status).toBe(400);
      expect(refused.jsonBody.code).toBe("FORM_INCOMPLETE");
      expect(t.doc().status).toBe("draft");

      // An item the form does not have is refused; nothing is ticked on the student's behalf.
      const unknown = await t.post({ action: "saveDraft", baseRevision: 1, answers: { [HAND_IN]: { checked: ["h9"] } } });
      expect(unknown.status).toBe(400);
      expect(t.doc().answers[HAND_IN]).toBeUndefined();

      const ticked = await t.post({ action: "saveDraft", baseRevision: 1, answers: { [HAND_IN]: { checked: ["h2", "h1"] } } });
      expect(ticked.status).toBe(200);
      expect(t.doc().answers[HAND_IN]).toEqual({ checked: ["h1", "h2"] });            // stored in the form's own order
      expect(ticked.jsonBody.progress).toMatchObject({ missing: [], answered: ticked.jsonBody.progress.total });
      const submitted = await t.post({ action: "submit", baseRevision: 2 });
      expect(submitted.status).toBe(200);
      expect(t.doc()).toMatchObject({ status: "submitted", formVersion: 2 });
    });
  }
});

describe("form version 2 — a class that opened its form under version 1 keeps it for good", () => {
  for (const form of FORMS) {
    it(form.code + ": teacher and student still read the version 1 form, file questions included, and no checklist", async () => {
      const t = setup(form.code);
      const stored = seedV1ClassForm(t.ctx, form.code, "c1", { now: NOW });
      const before = JSON.stringify(t.classForm());

      const state = (await t.teacherGet("exam-form")).jsonBody.examForm;
      expect(state).toMatchObject({ hasForm: true, state: "open", formVersion: 1, summary: { questions: form.v1Questions, files: form.v1Files.length } });

      const view = (await t.get()).jsonBody;
      const questions = all(view.form);
      expect(view.form.formVersion).toBe(1);
      expect(questions).toHaveLength(form.v1Questions);
      expect(questions.filter(q => q.kind === "file").map(q => q.questionId)).toEqual(form.v1Files);
      expect(questions.some(q => q.questionId === HAND_IN)).toBe(false);
      expect(view.progress.missing).not.toContain(HAND_IN);
      expect(JSON.stringify(t.classForm())).toBe(before);                             // a read rewrites nothing
      expect(stored.template).toEqual(v1Template(form.code));
    });

    it(form.code + ": its students save and submit as before — the file questions wait and never block", async () => {
      const t = setup(form.code);
      seedV1ClassForm(t.ctx, form.code, "c1", { now: NOW });
      const saved = await t.post({ action: "saveDraft", baseRevision: 0, answers: answersFor(v1Template(form.code)) });
      expect(saved.status).toBe(200);                                                 // not FORM_VERSION_CHANGED: the class's form is version 1
      expect(t.doc()).toMatchObject({ formVersion: 1, status: "draft", revision: 1 });
      expect(saved.jsonBody.progress.missing).toEqual([]);
      // The version 2 checklist is not a question of this class: an answer to it is refused, not stored.
      const stray = await t.post({ action: "saveDraft", baseRevision: 1, answers: { [HAND_IN]: { checked: ["h1"] } } });
      expect(stray.status).toBe(400);
      expect(t.doc().answers[HAND_IN]).toBeUndefined();
      const submitted = await t.post({ action: "submit", baseRevision: 1 });
      expect(submitted.status).toBe(200);
      expect(t.doc()).toMatchObject({ status: "submitted", formVersion: 1 });
      const list = (await t.teacherGet("exam-form-students")).jsonBody;
      expect(list).toMatchObject({ formVersion: 1, counts: { submitted: 1 } });
      const review = (await t.teacherGet("exam-form-student", { studentId: "s1" })).jsonBody;
      expect(review.form.formVersion).toBe(1);
      expect(all(review.form).filter(q => q.kind === "file").map(q => q.questionId)).toEqual(form.v1Files);
    });

    it(form.code + ": closing and opening it again never swaps its questions for version 2", async () => {
      const t = setup(form.code);
      seedV1ClassForm(t.ctx, form.code, "c1", { now: NOW });
      const template = JSON.stringify(t.classForm().template);
      expect((await t.teacher({ action: "examForm.close" })).status).toBe(200);
      const again = await t.teacher({ action: "examForm.open", imageAnswers: true });
      expect(again.status).toBe(200);
      expect(again.jsonBody.examForm).toMatchObject({ state: "open", formVersion: 1, imageAnswers: true, summary: { questions: form.v1Questions, files: form.v1Files.length } });
      expect(t.classForm().formVersion).toBe(1);
      expect(JSON.stringify(t.classForm().template)).toBe(template);
      expect(t.audits.map(a => a.details.formVersion)).toEqual([1, 1]);
    });
  }
});
