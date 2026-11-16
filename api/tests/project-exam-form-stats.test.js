import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getSupportedProjects, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { buildFormStats, ACTIVE_WINDOW_MS } from "../src/lib/project-tracker/exam-form-stats.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// The class statistics of the project exam form (resource=exam-form-stats), behind the «الإحصائيات» charts and their live
// refresh: per-student filling, per-section averages, distribution, who is writing now — for EVERY project that ships a
// form. The body is numbers only: no answer, no key, no rubric, no mark.

const NOW = "2026-11-14T10:00:00.000Z";
const CODES = getSupportedProjects().map(p => (typeof p === "string" ? p : p.projectCode || p.code)).filter(code => getExamFormTemplate(code));
const room = (id, code, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [code], createdAt: NOW, updatedAt: NOW, ...extra });
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
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

function setup(code, extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1", code), "platform/classes/c2.json": room("c2", code),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c1"),
    "platform/users/s9.json": user("s9", "c2"),
    ...extra
  });
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const teacherDeps = (u = { sub: "teacher-1" }) => ({ ...common, requireBuilderAuth: () => ({ ok: true, user: u }) });
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const tPost = (body, classId = "c1") => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: code, classId, ...body }) }, teacherDeps());
  const stats = (classId = "c1", u) => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: code, classId, resource: "exam-form-stats" }), json: async () => ({}) }, teacherDeps(u));
  const sPost = (id, body) => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: code, ...body }) }, studentDeps(id));
  return { ctx, tPost, stats, sPost };
}

describe("exam-form-stats — the class statistics of the form, for every project that ships one", () => {
  it("the three bundled forms are covered", () => {
    expect(CODES).toEqual(expect.arrayContaining(["794589", "883589", "899373"]));
  });

  for (const code of CODES) {
    const NS = getStorageNamespace(code);
    const template = getExamFormTemplate(code);
    const answerableOf = sections => sections.flatMap(s => s.questions).filter(q => !DEFERRED_KINDS.has(q.kind));

    it(code + ": a class whose form was never opened has no statistics (stats: null), and the read writes nothing", async () => {
      const t = setup(code);
      const before = t.ctx.names().length;
      const r = await t.stats();
      expect(r.status).toBe(200);
      expect(r.jsonBody).toMatchObject({ ok: true, projectCode: code, classId: "c1", stats: null });
      expect(t.ctx.names().length).toBe(before);
    });

    it(code + ": counts, per-student filling, per-section averages, distribution and «writing now»", async () => {
      const t = setup(code);
      expect((await t.tPost({ action: "examForm.open" })).status).toBe(200);          // image answers stay off: image questions are not counted
      const frozen = t.ctx.getJson(NS.examFormClassName("c1")).template.sections;
      const answerable = answerableOf(frozen);
      const first = frozen.map(s => ({ ...s, questions: s.questions.filter(q => !DEFERRED_KINDS.has(q.kind)) })).filter(s => s.questions.length)[0];

      // s1 fills everything and submits; s2 fills exactly the first section (a draft, just now); s3 never opens the form
      const all = Object.fromEntries(answerable.map(q => [q.questionId, rightAnswer(q)]));
      expect((await t.sPost("s1", { action: "saveDraft", baseRevision: 0, answers: all })).status).toBe(200);
      expect((await t.sPost("s1", { action: "submit", baseRevision: 1 })).status).toBe(200);
      const part = Object.fromEntries(first.questions.map(q => [q.questionId, rightAnswer(q)]));
      expect((await t.sPost("s2", { action: "saveDraft", baseRevision: 0, answers: part })).status).toBe(200);

      const names = t.ctx.names().length;
      const r = await t.stats();
      expect(r.status).toBe(200);
      expect(t.ctx.names().length).toBe(names);                                        // a read never writes
      const s = r.jsonBody.stats;
      const total = answerable.length, n2 = first.questions.length;
      expect(s).toMatchObject({ state: "open", studentCount: 3, totalQuestions: total, activeNow: 1 });
      expect(s.counts).toEqual({ not_started: 1, draft: 1, submitted: 1, returned: 0, approved: 0 });
      const by = Object.fromEntries(s.students.map(x => [x.studentId, x]));
      expect(by.s1).toMatchObject({ status: "submitted", answered: total, total, percent: 100, active: false });
      expect(by.s2).toMatchObject({ status: "draft", answered: n2, total, percent: Math.round((n2 / total) * 100), active: true });
      expect(by.s3).toMatchObject({ status: "not_started", answered: 0, percent: 0, updatedAt: "", active: false });
      expect(s.averagePercent).toBe(Math.round(((total + n2) / (total * 3)) * 100));
      expect(Object.values(s.buckets).reduce((a, b) => a + b, 0)).toBe(3);
      expect(s.buckets["100"]).toBe(1);
      expect(s.buckets["0"]).toBe(1);
      // sections: the first one is complete for two of three students, every other one for one of three
      expect(s.sections.reduce((n, x) => n + x.questions, 0)).toBe(total);
      expect(s.sections[0]).toMatchObject({ sectionId: first.sectionId, questions: n2, averagePercent: 67, completeCount: 2 });
      for (const sec of s.sections.slice(1)) expect(sec).toMatchObject({ averagePercent: 33, completeCount: 1 });

      // numbers only: no answer, key, prompt, rubric, rating or mark anywhere in the body
      const keys = keysDeep(r.jsonBody);
      for (const secret of ["answers", "answer", "correctOptionId", "correctOptionIds", "pairs", "prompt", "rubric", "review", "ratings", "result", "mark", "questionId", "text", "code"]) expect(keys.has(secret)).toBe(false);
      expect(JSON.stringify(r.jsonBody)).not.toContain("جواب ");
    });

    it(code + ": a closed form still reports; a student who left the class and another class's students are not counted", async () => {
      const t = setup(code);
      await t.tPost({ action: "examForm.open" });
      await t.tPost({ action: "examForm.open" }, "c2");
      const q = answerableOf(t.ctx.getJson(NS.examFormClassName("c1")).template.sections)[0];
      expect((await t.sPost("s2", { action: "saveDraft", baseRevision: 0, answers: { [q.questionId]: rightAnswer(q) } })).status).toBe(200);
      expect((await t.sPost("s9", { action: "saveDraft", baseRevision: 0, answers: { [q.questionId]: rightAnswer(q) } })).status).toBe(200);
      t.ctx.setJson("platform/users/s2.json", { ...user("s2", "c1"), classId: "c2" });   // s2 moved: their old c1 document stays stored
      await t.tPost({ action: "examForm.close" });
      const s = (await t.stats()).jsonBody.stats;
      expect(s.state).toBe("closed");
      expect(s.students.map(x => x.studentId).sort()).toEqual(["s1", "s3"]);
      expect(s.counts).toEqual({ not_started: 2, draft: 0, submitted: 0, returned: 0, approved: 0 });
      expect(s.averagePercent).toBe(0);
    });
  }

  it("another teacher's class is reported as missing; an unknown class and a class outside the project are refused", async () => {
    const t = setup("794589", { "platform/classes/c7.json": room("c7", "794589", { ownerId: "teacher-2" }), "platform/classes/c8.json": room("c8", "883589") });
    const mine = { sub: "teacher-1", am: "multi-user" };
    expect((await t.stats("c7", mine)).status).toBe(404);
    expect((await t.stats("c7", { sub: "teacher-2", am: "multi-user" })).status).toBe(200);
    expect((await t.stats("nope")).status).toBe(404);
    expect((await t.stats("c8")).status).toBe(400);
  });

  it("a class form whose stored template cannot be trusted fails closed (503), never statistics", async () => {
    const t = setup("794589");
    await t.tPost({ action: "examForm.open" });
    const name = getStorageNamespace("794589").examFormClassName("c1");
    t.ctx.setJson(name, { ...t.ctx.getJson(name), template: { sections: "x" } });
    const r = await t.stats();
    expect(r.status).toBe(503);
    expect(r.jsonBody.stats).toBeUndefined();
  });

  it("«writing now» (pure): only a writable form saved inside the window counts — not a stale draft, a submitted form or a future time", () => {
    const template = getExamFormTemplate("794589");
    const students = ["a", "b", "c", "d", "e"].map(id => ({ studentId: id, displayName: id }));
    const at = ms => new Date(Date.parse(NOW) - ms).toISOString();
    const doc = (studentId, status, updatedAt) => ({ studentId, status, updatedAt, answers: {} });
    const s = buildFormStats({ state: "open" }, template, students, [
      doc("a", "draft", at(ACTIVE_WINDOW_MS)), doc("b", "draft", at(ACTIVE_WINDOW_MS + 1000)), doc("c", "submitted", at(1000)),
      doc("d", "returned", at(5000)), doc("e", "draft", at(-60000)), doc("gone", "draft", at(0))
    ], NOW);
    expect(s.students.filter(x => x.active).map(x => x.studentId)).toEqual(["a", "d"]);
    expect(s.activeNow).toBe(2);
    expect(s.studentCount).toBe(5);
    // image questions are deferred while the class did not switch them on, and counted once it did
    const withImages = buildFormStats({ state: "open", imageAnswers: true }, template, students, [], NOW);
    const images = template.sections.flatMap(x => x.questions).filter(q => q.kind === "image").length;
    expect(withImages.totalQuestions).toBe(s.totalQuestions + images);
  });
});
