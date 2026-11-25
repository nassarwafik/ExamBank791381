import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "module";
import { fileURLToPath } from "node:url";

// AUTO-A8b — the separating word of an automatonDesign@1 answer (owner decision 2026-11-25): kept with the grade by the server authority
// (assignment-grading.js), shown to the teacher in review and — ONLY once the results are released — to the student in the per-question
// breakdown. One word (or one public rule the machine broke), rebuilt field by field: never the reference, never on a question that awaits
// the teacher or does not count; every other question type's grade is byte-for-byte unchanged. Real student-submission / assignment-review
// handlers on the in-memory container.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const { questionBreakdown, automatonOf } = require_("../src/lib/student-question-breakdown.js");
const { automatonFeedbackOf } = require_("../src/lib/automaton-design-grading.js");
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const A8 = JSON.parse(fs.readFileSync(path.join(repo, "docs/fixtures/automaton-design-a8/ExamBank_A8_Automaton_Design_Acceptance.json"), "utf8"));
const q = id => structuredClone(A8.sections.flatMap(s => s.questions).find(x => x.examQuestionId === id));

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions }] });
const m = (states, start, accept, transitions) => ({ kind: "automatonDesign", machine: { states, start, accept, transitions: transitions.map(t => t.split(" ")) } });
const RIGHT_D1 = m(["s", "t"], "s", ["t"], ["s 0 s", "s 1 t", "t 0 s", "t 1 t"]);
const INCOMPLETE_D1 = m(["s", "t"], "s", ["t"], ["s 0 s", "s 1 t", "t 1 t"]);
const ENDS_B_N1 = m(["q0", "q1"], "q0", ["q1"], ["q0 a q0", "q0 b q0", "q0 b q1"]);

function harness(over = {}) {
  const a = F.assignment({ attemptModelVersion: undefined, attemptPolicy: undefined, durationMinutes: 0, maxAttempts: 1, examSnapshot: exam([q("d1"), q("n1"), q("c1")]), totalMarks: 13, ...over });
  const ctx = F.seed({ a, doc: null });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() };
  return {
    submit: answers => submission.handler(F.studentRequest({ action: "submit", answers }), sDeps, quiet),
    state: () => submission.handler(F.studentRequest(null, "GET"), sDeps, quiet),
    saveReview: overrides => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    getReview: () => review.handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), tDeps, quiet),
  };
}

describe("A8b — the grade keeps the separating word (server authority)", () => {
  it("a wrong machine keeps its word, a broken rule its rule; a right one, a blank or another type keeps nothing", () => {
    const g = gradeExam(exam([q("d1"), q("n1"), q("d2"), q("c1")]), { d1: INCOMPLETE_D1, n1: ENDS_B_N1, d2: m(["e", "o"], "e", ["e"], ["e b e", "e a o", "o b o", "o a e"]), c1: { kind: "choice", index: 0 } });
    const fb = Object.fromEntries(g.questions.map(x => [x.questionId, x.automatonFeedback ?? null]));
    expect(fb).toEqual({ d1: { issue: { code: "incomplete", state: "t", symbol: "0" } }, n1: { counterexample: { word: "b", shouldAccept: false } }, d2: null, c1: null });
    expect(gradeExam(exam([q("n1")]), {}).questions[0].automatonFeedback).toBeUndefined();
  });
  it("a question that does not count (first N answered) keeps no word; one that fails closed keeps none either", () => {
    const e = exam([q("d1"), q("n1")]);
    e.sections[0] = { ...e.sections[0], gradingPolicy: "firstNAnswered", requiredAnswers: 1 };
    const g = gradeExam(e, { d1: RIGHT_D1, n1: ENDS_B_N1 });
    expect(g.questions.map(x => [x.questionId, x.ignored, x.automatonFeedback ?? null])).toEqual([["d1", false, null], ["n1", true, null]]);
    const broken = exam([q("n1")]);
    broken.sections[0].questions[0].answer.reference.start = "nowhere";
    const r = gradeExam(broken, { n1: ENDS_B_N1 }).questions[0];
    expect([r.manualReview, r.automatonFeedback]).toEqual([true, undefined]);
  });
  it("the stored shape is rebuilt and bounded: a forged or oversized verdict keeps nothing", () => {
    expect(automatonFeedbackOf({ correct: false, counterexample: { word: "ab", shouldAccept: true, reference: "x" } })).toEqual({ counterexample: { word: "ab", shouldAccept: true } });
    expect(automatonFeedbackOf({ correct: false, counterexample: { word: "a".repeat(41), shouldAccept: true } })).toBeNull();
    expect(automatonFeedbackOf({ correct: false, counterexample: { word: "<b>", shouldAccept: true } })).toBeNull();
    expect(automatonFeedbackOf({ correct: false, issue: { code: "incomplete", state: "q0", symbol: "a", hint: "x" } })).toEqual({ issue: { code: "incomplete", state: "q0", symbol: "a" } });
    expect(automatonFeedbackOf({ correct: false, issue: { code: "reference-is-q7" } })).toBeNull();
    expect(automatonFeedbackOf({ correct: true, counterexample: { word: "a", shouldAccept: true } })).toBeNull();
    expect(automatonFeedbackOf({ correct: false, manualReview: true, counterexample: { word: "a", shouldAccept: true } })).toBeNull();
  });
});

describe("A8b — the student's breakdown: one word, only once released", () => {
  it("the allowlist: the word or the rule, rebuilt; nothing on a pending or uncounted question; nothing else ever", () => {
    const b = questionBreakdown({ questionGrades: [
      { questionNumber: 1, sectionId: "s1", score: 0, maxMarks: 5, automatonFeedback: { counterexample: { word: "b", shouldAccept: false, reference: ["q0"] }, model: "SECRET" } },
      { questionNumber: 2, sectionId: "s1", score: 0, maxMarks: 5, automatonFeedback: { issue: { code: "too-many-states", max: 4, extra: "SECRET" } } },
      { questionNumber: 3, sectionId: "s1", score: 0, maxMarks: 5, manualReview: true, automatonFeedback: { counterexample: { word: "a", shouldAccept: true } } },
      { questionNumber: 4, sectionId: "s1", score: 0, maxMarks: 5, ignored: true, automatonFeedback: { counterexample: { word: "a", shouldAccept: true } } },
      { questionNumber: 5, sectionId: "s1", score: 0, maxMarks: 5, automatonFeedback: { counterexample: { word: "a b", shouldAccept: true } } },
    ] });
    expect(b.questions.map(x => x.automaton ?? null)).toEqual([{ word: "b", shouldAccept: false }, { issue: { code: "too-many-states", max: 4 } }, null, null, null]);
    expect(JSON.stringify(b)).not.toMatch(/SECRET|reference|model/);
    expect(automatonOf({ automatonFeedback: { issue: { code: "unknown-rule" } } })).toBeNull();
  });
  it("released (immediate): the submit result and the state carry the word; the reference never", async () => {
    const h = harness();
    const r = await h.submit({ d1: INCOMPLETE_D1, n1: ENDS_B_N1, c1: { kind: "choice", index: 0 } });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    const qs = r.jsonBody.result.questionBreakdown.questions;
    expect(qs.map(x => [x.number, x.status, x.automaton ?? null])).toEqual([[1, "zero", { issue: { code: "incomplete", state: "t", symbol: "0" } }], [2, "zero", { word: "b", shouldAccept: false }], [3, "full", null]]);
    const state = await h.state();
    expect(state.jsonBody.state.latestResult.questionBreakdown.questions[1].automaton).toEqual({ word: "b", shouldAccept: false });
    expect(JSON.stringify(state.jsonBody)).not.toMatch(/"reference"|"q2","b"/);
  });
  it("results not released yet (manual release) → no breakdown and so no word, exactly like the score", async () => {
    const h = harness({ resultsRelease: "manual" });
    const r = await h.submit({ d1: INCOMPLETE_D1, n1: ENDS_B_N1 });
    expect(r.jsonBody.result.resultsVisible).toBe(false);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/automaton|"word"/);
    expect(JSON.stringify((await h.state()).jsonBody)).not.toMatch(/automaton|"word"/);
  });
  it("a teacher's review keeps the stored word: the student still sees it beside the reviewed mark and the comment", async () => {
    const h = harness();
    await h.submit({ d1: RIGHT_D1, n1: ENDS_B_N1 });
    expect((await h.saveReview({ n1: { score: 2, comment: "الفكرة قريبة" } })).status).toBe(200);
    const n1 = (await h.state()).jsonBody.state.latestResult.questionBreakdown.questions[1];
    expect(n1).toEqual({ number: 2, sectionId: "s1", status: "partial", maxMarks: 6, score: 2, comment: "الفكرة قريبة", automaton: { word: "b", shouldAccept: false } });
  });
  it("the teacher's review payload carries the rules, the reference and the stored word", async () => {
    const h = harness();
    await h.submit({ d1: INCOMPLETE_D1, n1: ENDS_B_N1 });
    const rv = await h.getReview();
    expect(rv.status, JSON.stringify(rv.jsonBody)).toBe(200);
    const n1 = rv.jsonBody.questions.find(x => x.questionId === "n1");
    expect([n1.type, n1.automatonDesign, n1.expectedAnswer, n1.autoGrade.automatonFeedback]).toEqual(["automatonDesign", q("n1").automatonDesign, q("n1").answer, { counterexample: { word: "b", shouldAccept: false } }]);
  });
});
