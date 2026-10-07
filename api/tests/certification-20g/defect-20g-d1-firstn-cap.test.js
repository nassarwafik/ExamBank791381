import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { evaluateExamFinalization } from "../../../src/examFinalization";

// Phase 20G — DEFECT D1 (fail-first on f16ac8f): a firstNAnswered SECTION whose questions carry UNEQUAL marks (finalization accepts it: only
// the composite GROUP rule demands equal marks) was graded at submit WITHOUT its section cap — the first N answered units could sum above
// section.maxMarks, so the attempt scored above its own total (percentage > 100) — while every later rebuild (teacher review, coding callback)
// capped the same section through sectionCappedScore. The score therefore CHANGED when an unrelated review was saved. Fixed: the submit-time
// grader caps a firstNAnswered section at its explicit maximum exactly like capScore and like the rebuild.
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../../src/lib/assignment-grading.js");
const { rebuildAttemptGrades } = require_("../../src/lib/attempt-grade-rebuild.js");
const { examOfficialStats } = require_("../../src/lib/exam-structure.js");
const { createPlatform } = require_("./platform.js");
const mcq = (id, marks) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const exam = () => ({ examId: "D1-FIRSTN", title: "اختر سؤالين", status: "draft", schemaVersion: 2, metadata: {}, sections: [
  { id: "s1", title: "أجب عن سؤالين فقط", gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2, maxMarks: 30, stimuli: {}, questions: [mcq("q1", 10), mcq("q2", 20), mcq("q3", 30)] },
  { id: "s2", title: "إجباري", gradingPolicy: "all", stimuli: {}, questions: [mcq("q4", 10)] }] });
const right = { kind: "choice", index: 0 };

describe("20G D1 — firstNAnswered section cap at submit", () => {
  it("the exam is finalizable (the defect is reachable by a teacher) and its official total is 40", () => {
    expect(evaluateExamFinalization(exam()).canFinalize).toBe(true);
    expect(examOfficialStats(exam()).totalMarks).toBe(40);
  });
  it("answering the two LARGEST questions correctly scores the section maximum 30 — never 50 — and the attempt never exceeds its total", () => {
    const g = gradeExam(exam(), { q2: right, q3: right, q4: right });
    expect(g.sections.map(s => [s.id, s.score, s.maxMarks])).toEqual([["s1", 30, 30], ["s2", 10, 10]]);
    expect([g.score, g.totalMarks, g.percentage]).toEqual([40, 40, 100]);
  });
  it("submit-time grading and the canonical rebuild agree (a no-op teacher review never changes the score)", () => {
    const g = gradeExam(exam(), { q2: right, q3: right });
    const attempt = { score: g.score, totalMarks: g.totalMarks, percentage: g.percentage, manualReviewMarks: g.manualReviewMarks, finalized: g.finalized, questionGrades: g.questions, sections: g.sections, manualOverrides: {} };
    const before = [attempt.score, attempt.percentage];
    rebuildAttemptGrades(attempt);
    expect([attempt.score, attempt.percentage]).toEqual(before);
    expect(before).toEqual([30, 75]);
  });
  it("through the REAL handlers: submit → score 30/40; a teacher review save with no change keeps 30", async () => {
    const p = createPlatform({ students: { "d1-s": "طالب" } });
    expect((await p.teacher.publish(exam())).ok).toBe(true);
    const aid = (await p.teacher.assign("D1-FIRSTN")).jsonBody.assignment.assignmentId;
    const s = p.student("d1-s");
    await s.start(aid);
    const sub = await s.submit(aid, { q2: right, q3: right });
    expect(sub.jsonBody.result).toMatchObject({ score: 30, totalMarks: 40, percentage: 75, finalized: true });
    const rv = await p.teacher.saveReview(aid, "d1-s", {});
    expect(rv.jsonBody.result).toMatchObject({ score: 30, percentage: 75 });
  });
});
