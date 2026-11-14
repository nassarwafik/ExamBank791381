import { describe, it, expect } from "vitest";
import { handler as studentForm } from "../src/functions/student-project-exam-form.js";
import { handler as studentTracker } from "../src/functions/student-project-tracker.js";
import { handler as tracker } from "../src/functions/project-tracker.js";
import { getExamFormTemplate, getStorageNamespace } from "../src/lib/project-tracker/registry.js";
import { DEFERRED_KINDS } from "../src/lib/project-tracker/exam-form-answers.js";
import { evaluateAuto, autoEvidence, computeResult, unratedSections, applyApprove, applyReview } from "../src/lib/project-tracker/exam-form-review.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Phase F3 — the teacher's review of the project exam form: the class list, one student's answers with the evidence of the
// auto-marked questions, section ratings on the rubric, return for correction, approval (the mark is computed then) and
// taking an approval back; and what the student sees of it (docs/enterprise-project-exam-form-f3.md).

const NOW = "2026-11-14T10:00:00.000Z";
const CODE = "794589";
const NS = getStorageNamespace(CODE);
const TEMPLATE = getExamFormTemplate(CODE);
const QUESTIONS = TEMPLATE.sections.flatMap(s => s.questions);
const Q = id => QUESTIONS.find(q => q.questionId === id);
const ANSWERABLE = QUESTIONS.filter(q => !DEFERRED_KINDS.has(q.kind));
const SECTIONS = TEMPLATE.sections.map(s => s.sectionId);
const user = (id, cid) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id, extra = {}) => ({ classId: id, name: "صف " + id, grade: "12", schoolYear: "2026", active: true, status: "active", studentIds: [], programCodes: [CODE], createdAt: NOW, updatedAt: NOW, ...extra });
function keysDeep(value, into = new Set()) {
  if (Array.isArray(value)) value.forEach(v => keysDeep(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { into.add(k); keysDeep(v, into); }
  return into;
}
// The RIGHT answer of an auto-marked question; a complete, valid answer for any other answerable question.
function rightAnswer(q) {
  if (q.grading === "auto") {
    if (q.kind === "choice") return q.justification ? { optionId: q.answer.correctOptionId, justification: "لأن البوابة خارج شبكته" } : { optionId: q.answer.correctOptionId };
    if (q.kind === "multiChoice") return { optionIds: q.answer.correctOptionIds };
    if (q.kind === "matching") return { pairs: q.answer.pairs };
    return { order: q.answer.order };
  }
  switch (q.kind) {
    case "table": return { rows: Array.from({ length: q.minRows }, (_, i) => Object.fromEntries(q.columns.map(c => [c.id, c.id + i]))) };
    case "multiChoice": return { optionIds: [q.options[0].id] };
    case "scale": return { values: Object.fromEntries(q.items.map(i => [i.id, q.max])) };
    case "checklist": return { checked: [q.items[0].id] };
    case "declaration": return { accepted: true };
    default: return { text: "جواب " + q.questionId };
  }
}
const allAnswers = () => Object.fromEntries(ANSWERABLE.map(q => [q.questionId, rightAnswer(q)]));
const ratingsAll = level => Object.fromEntries(SECTIONS.map(id => [id, { level }]));

function setup(extra = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c2.json": room("c2"),
    "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c2"),
    ...extra
  });
  const audits = [];
  const common = { container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c, ev) => { audits.push(ev); }, recordProjectMilestones: async () => {} };
  const studentDeps = id => ({ ...common, requireActiveStudentSession: async () => ({ ok: true, container: ctx.container, user: { sub: id, sv: 1 }, student: ctx.getJson("platform/users/" + id + ".json") }) });
  const teacherDeps = { ...common, requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
  const sGet = (id = "s1") => studentForm({ method: "GET", url: "https://x/api/student-project-exam-form?projectCode=" + CODE, json: async () => ({}) }, studentDeps(id));
  const sPost = (body, id = "s1") => studentForm({ method: "POST", url: "https://x/api/student-project-exam-form", json: async () => ({ projectCode: CODE, ...body }) }, studentDeps(id));
  const card = async (id = "s1") => (await studentTracker({ method: "GET", url: "https://x/api/student-project-tracker", json: async () => ({}) }, studentDeps(id))).jsonBody.projects[0].examForm;
  const tPost = (body, classId = "c1") => tracker({ method: "POST", url: "https://x/api/project-tracker", json: async () => ({ projectCode: CODE, classId, ...body }) }, teacherDeps);
  const tGet = (resource, params = {}, classId = "c1") => tracker({ method: "GET", url: "https://x/api/project-tracker?" + new URLSearchParams({ projectCode: CODE, classId, resource, ...params }), json: async () => ({}) }, teacherDeps);
  const doc = (sid = "s1") => (ctx.has(NS.examFormAnswersName("c1", sid)) ? ctx.getJson(NS.examFormAnswersName("c1", sid)) : null);
  return { ctx, audits, sGet, sPost, card, tPost, tGet, doc };
}
// A class with the form open and student s1's complete form submitted (revision 2).
async function submitted(extra) {
  const t = setup(extra);
  await t.tPost({ action: "examForm.open" });
  expect((await t.sPost({ action: "saveDraft", baseRevision: 0, answers: allAnswers() })).status).toBe(200);
  expect((await t.sPost({ action: "submit", baseRevision: 1 })).status).toBe(200);
  t.audits.length = 0;
  return t;
}
const review = (t, body) => t.tPost({ action: "examForm.review", studentId: "s1", ...body });

describe("F3 the teacher hides questions before the first open", () => {
  it("lists the questions to choose from — prompts only, never a key", async () => {
    const t = setup();
    const r = await t.tGet("exam-form-questions");
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, frozen: false, hiddenQuestionIds: [] });
    expect(r.jsonBody.sections).toHaveLength(16);
    expect(r.jsonBody.sections.flatMap(s => s.questions)).toHaveLength(92);
    expect(r.jsonBody.sections[3].questions.find(q => q.questionId === "S04Q04")).toEqual({ questionId: "S04Q04", prompt: Q("S04Q04").prompt, kind: "choice", grading: "auto", required: Q("S04Q04").required === true });
    expect(keysDeep(r.jsonBody).has("answer")).toBe(false);
    expect(t.ctx.has(NS.examFormClassName("c1"))).toBe(false);          // a read never creates the class form
  });

  it("a hidden question is absent from the frozen form: the student never sees it, it never counts, and the teacher never rates on it", async () => {
    const t = setup();
    const r = await t.tPost({ action: "examForm.open", hiddenQuestionIds: ["S04Q04", "S01Q02", "S04Q04"] });
    expect(r.status).toBe(200);
    expect(r.jsonBody.examForm).toMatchObject({ state: "open", hiddenQuestionIds: ["S01Q02", "S04Q04"] });
    expect(r.jsonBody.examForm.summary.questions).toBe(90);
    expect(t.audits[0]).toMatchObject({ action: "project.exam_form.open", details: { firstOpen: true, hiddenQuestions: 2 } });
    const stored = t.ctx.getJson(NS.examFormClassName("c1"));
    expect(stored.template.sections.flatMap(s => s.questions).map(q => q.questionId)).not.toContain("S04Q04");
    expect(stored.template.sections.map(s => s.weight).reduce((a, b) => a + b, 0)).toBe(100);
    const student = (await t.sGet()).jsonBody;
    const seen = student.form.sections.flatMap(s => s.questions).map(q => q.questionId);
    expect(seen).toHaveLength(90);
    expect(seen).not.toContain("S04Q04");
    expect(seen).not.toContain("S01Q02");
    expect(student.progress.total).toBe(75);
    // an answer to a hidden question is refused like any unknown question
    expect((await t.sPost({ action: "saveDraft", baseRevision: 0, answers: { S04Q04: { optionId: "o1" } } })).status).toBe(400);
    // the student completes and submits without the hidden questions
    const answers = allAnswers(); delete answers.S04Q04; delete answers.S01Q02;
    expect((await t.sPost({ action: "saveDraft", baseRevision: 0, answers })).status).toBe(200);
    expect((await t.sPost({ action: "submit", baseRevision: 1 })).status).toBe(200);
    const teacher = (await t.tGet("exam-form-student", { studentId: "s1" })).jsonBody;
    expect(teacher.auto).toMatchObject({ total: 12, answered: 12, correct: 12 });
    expect((await t.tGet("exam-form-questions")).jsonBody).toMatchObject({ frozen: true, hiddenQuestionIds: ["S01Q02", "S04Q04"] });
  });

  it("the questions are frozen at the first open: hiding later is refused, a plain re-open keeps them", async () => {
    const t = setup();
    await t.tPost({ action: "examForm.open", hiddenQuestionIds: ["S01Q02"] });
    await t.tPost({ action: "examForm.close" });
    const late = await t.tPost({ action: "examForm.open", hiddenQuestionIds: ["S02Q01"] });
    expect(late.status).toBe(409);
    expect(late.jsonBody.code).toBe("FORM_FROZEN");
    expect(t.ctx.getJson(NS.examFormClassName("c1"))).toMatchObject({ state: "closed", hiddenQuestionIds: ["S01Q02"] });
    const again = await t.tPost({ action: "examForm.open", hiddenQuestionIds: [] });
    expect(again.status).toBe(200);
    expect(again.jsonBody.examForm).toMatchObject({ state: "open", hiddenQuestionIds: ["S01Q02"] });
    expect(again.jsonBody.examForm.summary.questions).toBe(91);
  });

  describe("a hidden list that is not allowed is refused and no form is created", () => {
    const section = TEMPLATE.sections[0].questions.map(q => q.questionId);
    const cases = [
      ["a question that is not in the form", ["S99Q01"], "UNKNOWN_QUESTION"],
      ["every question of one section", section, "SECTION_EMPTY"],
      ["a list that is not an array", "S01Q02", "BAD_HIDDEN"],
      ["an id that is not a string", [7], "BAD_HIDDEN"],
      ["more ids than a form can hold", Array.from({ length: 301 }, (_, i) => "S01Q" + i), "BAD_HIDDEN"]
    ];
    for (const [name, hiddenQuestionIds, code] of cases) {
      it(name, async () => {
        const t = setup();
        const r = await t.tPost({ action: "examForm.open", hiddenQuestionIds });
        expect(r.status).toBe(400);
        expect(r.jsonBody.code).toBe(code);
        expect(t.ctx.has(NS.examFormClassName("c1"))).toBe(false);
        expect(t.audits).toEqual([]);
      });
    }
  });

  it("opening without a list keeps all 92 questions (as before this phase)", async () => {
    const t = setup();
    const r = await t.tPost({ action: "examForm.open" });
    expect(r.jsonBody.examForm).toMatchObject({ state: "open", hiddenQuestionIds: [] });
    expect(r.jsonBody.examForm.summary.questions).toBe(92);
    expect(t.audits[0].details).toMatchObject({ firstOpen: true, hiddenQuestions: 0 });
  });
});

describe("F3 the evidence of the auto-marked questions", () => {
  it("each kind is right only when it is exactly right; an unanswered question is «not answered», never «wrong»", () => {
    const choice = Q("S04Q04"), multi = Q("S04Q03"), match = Q("S06Q04"), order = Q("S12Q03");
    expect(evaluateAuto(choice, { optionId: choice.answer.correctOptionId })).toBe(true);
    expect(evaluateAuto(choice, { optionId: choice.options.find(o => o.id !== choice.answer.correctOptionId).id })).toBe(false);
    expect(evaluateAuto(multi, { optionIds: [...multi.answer.correctOptionIds].reverse() })).toBe(true);
    expect(evaluateAuto(multi, { optionIds: multi.answer.correctOptionIds.slice(1) })).toBe(false);            // one right option missing
    expect(evaluateAuto(multi, { optionIds: [...multi.answer.correctOptionIds, "o4"] })).toBe(false);          // one wrong option added
    expect(evaluateAuto(multi, { optionIds: [...multi.answer.correctOptionIds.slice(1), "o4"] })).toBe(false);  // the right count, one of them wrong
    expect(evaluateAuto(match, { pairs: match.answer.pairs })).toBe(true);
    expect(evaluateAuto(match, { pairs: { ...match.answer.pairs, l1: match.answer.pairs.l2 } })).toBe(false);
    expect(evaluateAuto(match, { pairs: { l1: match.answer.pairs.l1 } })).toBe(false);                         // incomplete is not right
    expect(evaluateAuto(order, { order: order.answer.order })).toBe(true);
    expect(evaluateAuto(order, { order: [...order.answer.order].reverse() })).toBe(false);
    for (const q of [choice, multi, match, order]) { expect(evaluateAuto(q, undefined)).toBeNull(); expect(evaluateAuto(q, {})).toBeNull(); }
    expect(evaluateAuto(Q("S01Q01"), { text: "x" })).toBeNull();                                              // not an auto question
    expect(evaluateAuto(Q("S11Q02"), { optionIds: ["o1"] })).toBeNull();                                      // teacher-marked multi-choice
  });

  it("counts the 13 auto questions: right, answered, total", () => {
    expect(autoEvidence(TEMPLATE, allAnswers())).toMatchObject({ total: 13, answered: 13, correct: 13 });
    const some = allAnswers();
    some.S04Q04 = { optionId: Q("S04Q04").options.find(o => o.id !== Q("S04Q04").answer.correctOptionId).id };
    delete some.S12Q03;
    const e = autoEvidence(TEMPLATE, some);
    expect(e).toMatchObject({ total: 13, answered: 12, correct: 11 });
    expect(e.byQuestion.S04Q04).toBe(false);
    expect(e.byQuestion.S12Q03).toBeNull();
    expect(autoEvidence(TEMPLATE, null)).toMatchObject({ total: 13, answered: 0, correct: 0 });
  });
});

describe("F3 the mark", () => {
  it("is the weighted share of the rubric: all top = 100, all zero = 0, one section lower = its exact share less", () => {
    expect(computeResult(TEMPLATE, ratingsAll(4)).mark).toBe(100);
    expect(computeResult(TEMPLATE, ratingsAll(0)).mark).toBe(0);
    expect(computeResult(TEMPLATE, ratingsAll(2)).mark).toBe(50);
    const r = computeResult(TEMPLATE, { ...ratingsAll(4), S04: { level: 2 }, S01: { level: 3 } });   // S04 weighs 11 → 5.5; S01 weighs 3 → 2.25
    expect(r.mark).toBe(100 - 5.5 - 0.75);
    expect(r.sections.find(s => s.sectionId === "S04")).toEqual({ sectionId: "S04", level: 2, weight: 11, points: 5.5 });
    expect(r).toMatchObject({ outOf: 100, topLevel: 4 });
    expect(r.sections).toHaveLength(16);
  });

  it("a section without a rating is «unrated», and an approval with one never writes a mark", () => {
    const doc = { status: "submitted", revision: 2, answers: {}, review: { ratings: { ...ratingsAll(4) } } };
    delete doc.review.ratings.S07;
    expect(unratedSections(TEMPLATE, doc)).toEqual(["S07"]);
    expect(unratedSections(TEMPLATE, { status: "submitted", revision: 2 })).toEqual(SECTIONS);
    expect(unratedSections(TEMPLATE, { review: { ratings: { ...ratingsAll(4), S02: { level: 9 } } } })).toEqual(["S02"]);   // a level outside the rubric is no rating
    let error = null;
    try { applyApprove(doc, TEMPLATE, { expectedRevision: 2, actor: "t", now: NOW }); } catch (e) { error = e; }
    expect(error).toMatchObject({ httpStatus: 400, code: "REVIEW_INCOMPLETE", missing: ["S07"] });
    expect(doc.status).toBe("submitted");
    expect(doc.result).toBeUndefined();
  });

  it("applyReview / applyApprove never change the document they are given", () => {
    const doc = { schemaVersion: 1, status: "submitted", revision: 2, answers: {}, formVersion: 1 };
    const frozen = JSON.stringify(doc);
    const rated = applyReview(doc, TEMPLATE, { ratings: ratingsAll(3), expectedRevision: 2, actor: "t", now: NOW }).doc;
    const approved = applyApprove(rated, TEMPLATE, { expectedRevision: 3, actor: "t", now: NOW }).doc;
    expect(JSON.stringify(doc)).toBe(frozen);
    expect(rated.status).toBe("submitted");
    expect(approved).toMatchObject({ status: "approved", revision: 4, approvedBy: "t", result: { mark: 75 } });
  });
});

describe("F3 the teacher follows the class", () => {
  it("lists every student of the class with their state; someone who left the class is not listed", async () => {
    const t = await submitted();
    await t.sPost({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "طالب 2" } } }, "s2");
    t.ctx.setJson(NS.examFormAnswersName("c1", "gone"), { ...t.doc("s1"), studentId: "gone" });
    const r = await t.tGet("exam-form-students");
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, state: "open", formVersion: 1, counts: { not_started: 0, draft: 1, submitted: 1, returned: 0, approved: 0 } });
    expect(r.jsonBody.students.map(s => s.studentId).sort()).toEqual(["s1", "s2"]);
    expect(r.jsonBody.students.find(s => s.studentId === "s1")).toMatchObject({ status: "submitted", answered: 77, total: 77, rated: 0, toRate: 16, mark: null });
    expect(r.jsonBody.students.find(s => s.studentId === "s2")).toMatchObject({ status: "draft", answered: 1, mark: null });
    expect(keysDeep(r.jsonBody).has("answers")).toBe(false);
  });

  it("a student who never opened the form is «not started»", async () => {
    const t = setup();
    await t.tPost({ action: "examForm.open" });
    const r = await t.tGet("exam-form-students");
    expect(r.jsonBody.counts).toMatchObject({ not_started: 2 });
    expect(r.jsonBody.students.every(s => s.status === "not_started" && s.mark === null && s.answered === 0)).toBe(true);
  });

  it("one student's form carries the answers, the keys, the evidence and what is still unrated", async () => {
    const t = await submitted();
    const r = await t.tGet("exam-form-student", { studentId: "s1" });
    expect(r.status).toBe(200);
    const b = r.jsonBody;
    expect(b).toMatchObject({ ok: true, status: "submitted", revision: 2, student: { studentId: "s1" }, auto: { total: 13, answered: 13, correct: 13 }, result: null });
    expect(b.form.sections).toHaveLength(16);
    expect(b.form.sections[3].questions.find(q => q.questionId === "S04Q04").answer).toEqual({ correctOptionId: Q("S04Q04").answer.correctOptionId });
    expect(b.form.rubric.levels).toHaveLength(5);
    expect(b.answers.S01Q01).toEqual(rightAnswer(Q("S01Q01")));
    expect(b.unrated).toEqual(SECTIONS);
    expect(b.review).toEqual({ ratings: {}, generalNote: "", updatedAt: "" });
  });

  it("refuses: a class whose form was never opened, a student of another class, a missing student id", async () => {
    const t = await submitted();
    expect((await t.tGet("exam-form-students", {}, "c2")).status).toBe(404);
    expect((await t.tGet("exam-form-student", { studentId: "s3" })).status).toBe(404);
    expect((await t.tGet("exam-form-student", {})).status).toBe(400);
    expect((await t.tPost({ action: "examForm.review", studentId: "s3", expectedRevision: 0, ratings: {} })).status).toBe(404);
    expect((await t.tPost({ action: "examForm.approve", expectedRevision: 2 })).status).toBe(400);
  });

  it("a stored class form this code cannot trust is a 503 for the teacher's reads and writes", async () => {
    const t = await submitted();
    const broken = t.ctx.getJson(NS.examFormClassName("c1"));
    broken.template.sections[0].weight += 5;
    t.ctx.setJson(NS.examFormClassName("c1"), broken);
    expect((await t.tGet("exam-form-students")).status).toBe(503);
    expect((await t.tGet("exam-form-student", { studentId: "s1" })).status).toBe(503);
    expect((await review(t, { expectedRevision: 2, ratings: { S01: { level: 4 } } })).status).toBe(503);
    expect(t.doc()).toMatchObject({ status: "submitted", revision: 2 });
  });
});

describe("F3 the teacher rates the sections", () => {
  it("saves ratings and notes on a submitted form; nothing is audited and the student sees none of it", async () => {
    const t = await submitted();
    const r = await review(t, { expectedRevision: 2, ratings: { S01: { level: 4 }, S04: { level: 2, note: "  جدول الشبكات ناقص  " } }, generalNote: "عمل جيد" });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ changed: true, status: "submitted", revision: 3 });
    expect(r.jsonBody.review.ratings).toEqual({ S01: { level: 4 }, S04: { level: 2, note: "جدول الشبكات ناقص" } });
    expect(r.jsonBody.unrated).toHaveLength(14);
    expect(t.doc().review).toMatchObject({ generalNote: "عمل جيد", updatedBy: "teacher-1" });
    expect(t.audits).toEqual([]);
    const student = (await t.sGet()).jsonBody;
    const keys = keysDeep({ ...student, answers: null });   // a table answer is keyed by its column ids (one is «result»)
    expect(["review", "ratings", "result", "generalNote", "mark", "level", "returnNote"].filter(hidden => keys.has(hidden))).toEqual([]);
    expect(student.status).toBe("submitted");
  });

  it("a later save changes only the sections it names; null clears one; an unchanged save writes nothing", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: { S01: { level: 4 }, S02: { level: 3 } } });
    const second = await review(t, { expectedRevision: 3, ratings: { S02: null, S03: { level: 1 } } });
    expect(second.jsonBody.review.ratings).toEqual({ S01: { level: 4 }, S03: { level: 1 } });
    expect(second.jsonBody.revision).toBe(4);
    const same = await review(t, { expectedRevision: 4, ratings: { S01: { level: 4 } } });
    expect(same.jsonBody).toMatchObject({ changed: false, revision: 4 });
    expect(t.doc().revision).toBe(4);
  });

  describe("a rating that is not allowed is refused and nothing is written", () => {
    const cases = [
      ["a section that is not in the form", { ratings: { S99: { level: 2 } } }, 400],
      ["a level above the rubric", { ratings: { S01: { level: 5 } } }, 400],
      ["a negative level", { ratings: { S01: { level: -1 } } }, 400],
      ["a level that is not a whole number", { ratings: { S01: { level: 2.5 } } }, 400],
      ["a rating that is not an object", { ratings: { S01: 3 } }, 400],
      ["ratings that are not an object", { ratings: [3] }, 400],
      ["a section note longer than 1000 characters", { ratings: { S01: { level: 3, note: "س".repeat(1001) } } }, 400],
      ["a general note longer than 1000 characters", { ratings: {}, generalNote: "س".repeat(1001) }, 400],
      ["one bad rating among good ones (all or nothing)", { ratings: { S01: { level: 4 }, S02: { level: 9 } } }, 400],
      ["an older revision (the form changed since the teacher opened it)", { expectedRevision: 1, ratings: { S01: { level: 4 } } }, 409],
      ["no revision", { expectedRevision: undefined, ratings: { S01: { level: 4 } } }, 409]
    ];
    for (const [name, body, status] of cases) {
      it(name, async () => {
        const t = await submitted();
        const r = await review(t, { expectedRevision: 2, ...body });
        expect(r.status).toBe(status);
        expect(t.doc()).toMatchObject({ status: "submitted", revision: 2 });
        expect(t.doc().review).toBeUndefined();
      });
    }
  });

  it("a form that was not submitted cannot be rated, returned or approved — it never gets a mark", async () => {
    const t = setup();
    await t.tPost({ action: "examForm.open" });
    for (const action of ["examForm.review", "examForm.return", "examForm.approve"]) {
      const r = await t.tPost({ action, studentId: "s1", expectedRevision: 0, ratings: ratingsAll(0) });
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("FORM_NOT_SUBMITTED");
    }
    expect(t.doc()).toBeNull();
    await t.sPost({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "مسودة" } } });
    for (const action of ["examForm.review", "examForm.return", "examForm.approve"]) {
      const r = await t.tPost({ action, studentId: "s1", expectedRevision: 1, ratings: ratingsAll(0) });
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("FORM_NOT_SUBMITTED");
    }
    expect(t.doc()).toMatchObject({ status: "draft", revision: 1 });
    expect(t.doc().result).toBeUndefined();
    expect(t.audits.filter(a => a.action !== "project.exam_form.open")).toEqual([]);
  });

  it("an archived class is read-only for the review too", async () => {
    const t = await submitted();
    t.ctx.setJson("platform/classes/c1.json", room("c1", { status: "archived", active: false }));
    expect((await review(t, { expectedRevision: 2, ratings: { S01: { level: 4 } } })).status).toBe(403);
    expect((await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 2 })).status).toBe(403);
    expect((await t.tGet("exam-form-student", { studentId: "s1" })).jsonBody).toMatchObject({ readOnly: true, status: "submitted" });
    expect(t.doc().revision).toBe(2);
  });
});

describe("F3 the teacher returns a form for correction", () => {
  it("the student sees the note, edits, submits again; the teacher's ratings stay", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: { S01: { level: 3 } } });
    const r = await t.tPost({ action: "examForm.return", studentId: "s1", expectedRevision: 3, note: "أكمل جدول الشبكات للفرع الثاني" });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ changed: true, status: "returned", revision: 4, returnNote: "أكمل جدول الشبكات للفرع الثاني" });
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.return"]);
    expect(t.audits[0]).toMatchObject({ actor: "teacher-1", targetId: CODE + "/c1/s1" });

    const student = (await t.sGet()).jsonBody;
    expect(student).toMatchObject({ status: "returned", revision: 4, returnNote: "أكمل جدول الشبكات للفرع الثاني" });
    expect(keysDeep(student).has("ratings")).toBe(false);
    expect(await t.card()).toMatchObject({ status: "returned" });

    const edit = await t.sPost({ action: "saveDraft", baseRevision: 4, answers: { S01Q01: { text: "بعد التعديل" } } });
    expect(edit.status).toBe(200);
    expect(edit.jsonBody.status).toBe("returned");
    const again = await t.sPost({ action: "submit", baseRevision: 5 });
    expect(again.status).toBe(200);
    expect(again.jsonBody.status).toBe("submitted");
    expect(again.jsonBody.returnNote).toBeUndefined();
    expect(t.doc()).toMatchObject({ status: "submitted", revision: 6, review: { ratings: { S01: { level: 3 } } } });
    expect(t.doc().answers.S01Q01).toEqual({ text: "بعد التعديل" });
  });

  it("only a submitted form can be returned, and a stale page cannot return it", async () => {
    const t = await submitted();
    expect((await t.tPost({ action: "examForm.return", studentId: "s1", expectedRevision: 1 })).status).toBe(409);
    await t.tPost({ action: "examForm.return", studentId: "s1", expectedRevision: 2 });
    const twice = await t.tPost({ action: "examForm.return", studentId: "s1", expectedRevision: 3 });
    expect(twice.status).toBe(409);
    expect(twice.jsonBody.code).toBe("FORM_NOT_SUBMITTED");
    expect(t.audits).toHaveLength(1);
  });
});

describe("F3 the teacher approves", () => {
  it("an approval with unrated sections is refused, names them, and writes no mark", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: { S01: { level: 4 } } });
    const r = await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    expect(r.status).toBe(400);
    expect(r.jsonBody.code).toBe("REVIEW_INCOMPLETE");
    expect(r.jsonBody.missing).toEqual(SECTIONS.filter(id => id !== "S01"));
    expect(t.doc()).toMatchObject({ status: "submitted", revision: 3 });
    expect(t.doc().result).toBeUndefined();
    expect(t.audits).toEqual([]);
  });

  it("a fully rated form is approved once: the mark is computed, audited, and a repeated approval changes nothing", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: { ...ratingsAll(4), S04: { level: 2, note: "جدول الشبكات ناقص" } }, generalNote: "أحسنت" });
    const stale = await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 2 });
    expect(stale.status).toBe(409);
    expect(stale.jsonBody.code).toBe("REVIEW_STALE");
    const r = await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ changed: true, status: "approved", revision: 4, result: { mark: 94.5, outOf: 100 } });
    expect(t.doc()).toMatchObject({ status: "approved", approvedBy: "teacher-1", result: { mark: 94.5 } });
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.approve"]);
    expect(t.audits[0].details).toMatchObject({ projectCode: CODE, classId: "c1", mark: 94.5 });

    const before = JSON.stringify(t.doc());
    for (const expectedRevision of [4, 3, 99]) {
      const again = await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision });
      expect(again.status).toBe(200);
      expect(again.jsonBody).toMatchObject({ changed: false, status: "approved", result: { mark: 94.5 } });
    }
    expect(JSON.stringify(t.doc())).toBe(before);
    expect(t.audits).toHaveLength(1);
    expect((await t.tGet("exam-form-students")).jsonBody.students.find(s => s.studentId === "s1")).toMatchObject({ status: "approved", mark: 94.5, rated: 16 });
  });

  it("after the approval the student sees the mark, each section's level and note, and right / wrong only — never a key", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: { ...ratingsAll(4), S04: { level: 2, note: "جدول الشبكات ناقص" } }, generalNote: "أحسنت" });
    await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    const b = (await t.sGet()).jsonBody;
    expect(b.status).toBe("approved");
    expect(b.result).toMatchObject({ mark: 94.5, outOf: 100, generalNote: "أحسنت" });
    expect(b.result.sections).toHaveLength(16);
    expect(b.result.sections.find(s => s.sectionId === "S04")).toMatchObject({ level: 2, topLevel: 4, weight: 11, points: 5.5, note: "جدول الشبكات ناقص", levelLabel: TEMPLATE.rubric.levels[2].label });
    expect(Object.keys(b.result.auto)).toHaveLength(13);
    expect(Object.values(b.result.auto).every(v => v === true)).toBe(true);
    const keys = keysDeep(b);
    for (const secret of ["answer", "correctOptionId", "correctOptionIds", "template", "rubric", "review"]) expect(keys.has(secret)).toBe(false);
    expect(JSON.stringify(b)).not.toContain("correctOption");
    expect(await t.card()).toMatchObject({ status: "approved", mark: 94.5, outOf: 100 });
    // final for the student
    const edit = await t.sPost({ action: "saveDraft", baseRevision: 4, answers: { S01Q01: { text: "بعد الاعتماد" } } });
    expect(edit.status).toBe(409);
    expect(edit.jsonBody.code).toBe("FORM_APPROVED");
    expect((await t.sPost({ action: "submit", baseRevision: 4 })).status).toBe(409);
    expect(t.doc().revision).toBe(4);
  });

  it("an approved form cannot be rated or returned until the approval is taken back", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: ratingsAll(3) });
    await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    for (const action of ["examForm.review", "examForm.return"]) {
      const r = await t.tPost({ action, studentId: "s1", expectedRevision: 4, ratings: { S01: { level: 0 } } });
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("FORM_APPROVED");
    }
    expect(t.doc()).toMatchObject({ status: "approved", result: { mark: 75 } });
  });

  it("taking an approval back removes the mark for the student, keeps the ratings, and is audited", async () => {
    const t = await submitted();
    await review(t, { expectedRevision: 2, ratings: ratingsAll(3) });
    await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    t.audits.length = 0;
    expect((await t.tPost({ action: "examForm.unapprove", studentId: "s1", expectedRevision: 3 })).status).toBe(409);
    const r = await t.tPost({ action: "examForm.unapprove", studentId: "s1", expectedRevision: 4 });
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ changed: true, status: "submitted", revision: 5, result: null });
    expect(t.doc().result).toBeUndefined();
    expect(t.doc().review.ratings.S01).toEqual({ level: 3 });
    expect(t.audits.map(a => a.action)).toEqual(["project.exam_form.unapprove"]);
    const student = (await t.sGet()).jsonBody;
    expect(student.status).toBe("submitted");
    expect(student.result).toBeUndefined();
    expect((await t.card()).mark).toBeUndefined();
    const notApproved = await t.tPost({ action: "examForm.unapprove", studentId: "s1", expectedRevision: 5 });
    expect(notApproved.status).toBe(409);
    expect(notApproved.jsonBody.code).toBe("FORM_NOT_APPROVED");
    // and it can be re-rated and approved again with another mark
    await review(t, { expectedRevision: 5, ratings: { S01: { level: 4 } } });
    const again = await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 6 });
    expect(again.jsonBody.result.mark).toBe(75.75);
  });

  it("a mark is shown only for an APPROVED form: a stored result on a form in any other state is shown to no one", async () => {
    const t = await submitted();
    const stray = { ...t.doc(), result: { mark: 12, outOf: 100, topLevel: 4, sections: [] } };
    for (const status of ["submitted", "returned", "draft"]) {
      t.ctx.setJson(NS.examFormAnswersName("c1", "s1"), { ...stray, status });
      const student = (await t.sGet()).jsonBody;
      expect(student.result).toBeUndefined();
      expect((await t.card()).mark).toBeUndefined();
      expect((await t.tGet("exam-form-students")).jsonBody.students.find(s => s.studentId === "s1").mark).toBeNull();
      expect((await t.tGet("exam-form-student", { studentId: "s1" })).jsonBody.result).toBeNull();
    }
  });

  it("one student's approval never touches another student's form", async () => {
    const t = await submitted();
    await t.sPost({ action: "saveDraft", baseRevision: 0, answers: { S01Q01: { text: "طالب 2" } } }, "s2");
    await review(t, { expectedRevision: 2, ratings: ratingsAll(4) });
    await t.tPost({ action: "examForm.approve", studentId: "s1", expectedRevision: 3 });
    expect(t.doc("s2")).toMatchObject({ status: "draft", revision: 1 });
    expect(t.doc("s2").result).toBeUndefined();
    expect((await t.sGet("s2")).jsonBody.result).toBeUndefined();
  });
});
