import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// AUTO-A15a (docs/enterprise-automata-lab-a4.md §22) — machineTrace@1 on the server: the grader computes the true run from the PUBLIC
// question (the machine and the word) with the book engine's semantics, gives partial credit and never counts an error twice, fails CLOSED
// (0 + teacher review, never an automatic mark) when the question does not read or a stored answer has an impossible shape; the official
// grader keeps which rows were right; the student sees the machine and the word, never a key; the ingest binds the answer's shape only.
const require_ = createRequire(import.meta.url);
const { scoreMachineTrace, traceFeedbackOf, MACHINE_TRACE_FAIL_CLOSED } = require_("../src/lib/machine-trace-grading.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const { sanitizeExamForStudent } = require_("../src/lib/student-exam-sanitize.js");
const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");
const { isAnsweredForSelection } = (() => { try { return require_("../src/lib/exam-structure.js"); } catch { return {}; } })();

const PDA = { kind: "PDA", states: ["q0", "q1", "q2"], alphabet: ["a", "b"], start: "q0", accept: ["q2"], transitions: [
  { from: "q0", read: "a", top: "⏊", op: "push", write: "S", to: "q1" }, { from: "q1", read: "a", top: "S", op: "push", write: "A", to: "q1" },
  { from: "q1", read: "a", top: "A", op: "push", write: "A", to: "q1" }, { from: "q1", read: "b", top: "A", op: "pop", write: "A", to: "q1" },
  { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" }] };
const CFG = { v: 1, machine: PDA, word: "aabb" };
// the true run of aabb: (q0,⏊) (q1,⏊S) (q1,⏊SA) (q1,⏊S) (q2,⏊) — 5 rows + the verdict (accept) = 6 parts
const TRUE_ROWS = [{ state: "q0", stack: "⏊" }, { state: "q1", stack: "⏊S" }, { state: "q1", stack: "⏊SA" }, { state: "q1", stack: "⏊S" }, { state: "q2", stack: "⏊" }];
const ans = (rows, verdict = "accept") => ({ kind: "machineTrace", rows, verdict });
const score = (response, config = CFG, answerKey = {}) => scoreMachineTrace({ config, answerKey, response, maxMarks: 6 });

describe("A15a — the grader", () => {
  it("the true run and the verdict: every mark; feedback marks each row", () => {
    const r = score(ans(TRUE_ROWS));
    expect(r).toMatchObject({ score: 6, correct: true, manualReview: false, parts: { correct: 6, total: 6 } });
    expect(traceFeedbackOf(r)).toEqual({ rows: [true, true, true, true, true], verdict: true, trueRows: 5 });
  });
  it("an error is never counted twice: a wrong row costs one part, the rows that follow from it are right", () => {
    // row 2 forgets to push A (⏊S instead of ⏊SA); from (q1, ⏊S) reading «b» the machine pops S → (q2, ⏊): the student's own row 3 is that
    const rows = [TRUE_ROWS[0], TRUE_ROWS[1], { state: "q1", stack: "⏊S" }, { state: "q2", stack: "⏊" }, { state: "q2", stack: "⏊" }];
    const r = score(ans(rows));
    // rows 0, 1; row 3 is the step from the student's own wrong row 2; row 4 is the true row 4; the verdict — 5 of 6
    expect(r.parts).toEqual({ correct: 5, total: 6 });
    expect(traceFeedbackOf(r).rows).toEqual([true, true, false, true, true]);
    expect(r.score).toBeCloseTo(5, 10);
    // the same slip without its consequence followed: row 3 written as the TRUE row 3 (q1,⏊S) is right too (it is the truth)
    expect(score(ans([TRUE_ROWS[0], TRUE_ROWS[1], { state: "q1", stack: "⏊S" }, TRUE_ROWS[3], TRUE_ROWS[4]])).parts).toEqual({ correct: 5, total: 6 });
    // a row that is neither the step from the student's row nor the truth: wrong
    expect(traceFeedbackOf(score(ans([TRUE_ROWS[0], { state: "q2", stack: "⏊" }, TRUE_ROWS[2], TRUE_ROWS[3], TRUE_ROWS[4]]))).rows).toEqual([true, false, true, true, true]);
  });
  it("no answer → 0, not answered (no review); an empty trace → 0 automatically", () => {
    expect(score(undefined)).toEqual({ score: 0, correct: false, manualReview: false });
    expect(score(ans([], null))).toMatchObject({ score: 0, manualReview: false, parts: { correct: 0, total: 6 } });
  });
  it("fails CLOSED — 0 and the teacher's review, never a mark — when the question does not read, the key is not empty, or the stored answer is not one", () => {
    for (const [config, key, response] of [
      [{ ...CFG, machine: { ...PDA, start: "zz" } }, {}, ans(TRUE_ROWS)],
      [{ ...CFG, word: "abc" }, {}, ans(TRUE_ROWS)],
      [{ v: 1, machine: { kind: "TM", states: ["q0"], alphabet: ["a"], start: "q0", accept: [], transitions: [{ from: "q0", read: "a", write: "a", move: "S", to: "q0" }] }, word: "a" }, {}, ans([])],
      [CFG, { run: TRUE_ROWS }, ans(TRUE_ROWS)],
      [CFG, {}, { kind: "machineTrace", rows: [{ state: "q0", score: 6 }], verdict: "accept" }],
    ]) expect(score(response, config, key)).toEqual({ ...MACHINE_TRACE_FAIL_CLOSED });
  });
});

const exam = () => ({ examId: "E-A15", title: "تتبّع", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
  { examQuestionId: "t1", presentationType: "machineTrace", questionTypeVersion: 1, text: "تتبّع تشغيل الأوتومات على الكلمة.", marks: 6, machineTrace: CFG, answer: {} },
  { examQuestionId: "c1", presentationType: "multipleChoice", text: "سؤال", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } }] }] });

describe("A15a — the platform", () => {
  it("the official grader: partial marks, the rows' feedback kept with the grade", () => {
    const rows = [TRUE_ROWS[0], TRUE_ROWS[1], { state: "q1", stack: "⏊S" }, { state: "q2", stack: "⏊" }, { state: "q2", stack: "⏊" }];
    const r = gradeExam(exam(), { t1: ans(rows), c1: { kind: "choice", index: 0 } });
    const t = r.questions.find(q => q.questionId === "t1");
    expect([r.totalMarks, t.maxMarks, t.manualReview]).toEqual([8, 6, false]);
    expect(t.score).toBeCloseTo(5, 2);
    expect(t.traceFeedback).toEqual({ rows: [true, true, false, true, true], verdict: true, trueRows: 5 });
    expect(gradeExam(exam(), { t1: ans(TRUE_ROWS) }).questions[0]).toMatchObject({ score: 6, correct: true });
  });
  it("the student sees the machine and the word as authored — and no key", () => {
    const view = sanitizeExamForStudent(exam());
    const t = view.sections[0].questions[0];
    expect(t.machineTrace).toEqual(CFG);
    expect(t.answer ?? {}).toEqual({});
    const broken = exam(); broken.sections[0].questions[0].machineTrace = { ...CFG, extra: "x" };
    expect("machineTrace" in sanitizeExamForStudent(broken).sections[0].questions[0]).toBe(false);
  });
  it("the ingest binds the answer's shape to a machineTrace question only; a forged or oversized answer is refused with its code", () => {
    const n = normalizeDraftAnswers({
      t1: ans(TRUE_ROWS),
      c1: ans(TRUE_ROWS),
    }, exam());
    expect(Object.keys(n.answers)).toEqual(["t1"]);
    expect(n.rejected).toEqual([{ id: "c1", code: "TRACE_QUESTION_MISMATCH" }]);
    expect(normalizeDraftAnswers({ t1: { ...ans(TRUE_ROWS), score: 6 } }, exam()).rejected).toEqual([{ id: "t1", code: "TRACE_ANSWER_INVALID" }]);
    expect(normalizeDraftAnswers({ t1: ans(Array(33).fill({ state: "q0" })) }, exam()).rejected).toEqual([{ id: "t1", code: "TRACE_ANSWER_INVALID" }]);
    // a row that is not a configuration of this machine is KEPT (the grader judges it wrong)
    expect(normalizeDraftAnswers({ t1: ans([{ state: "zz", stack: "x" }]) }, exam()).answers.t1).toEqual(ans([{ state: "zz", stack: "x" }]));
    void isAnsweredForSelection;
  });
});
