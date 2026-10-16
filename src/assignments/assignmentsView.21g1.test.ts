// Phase 21G.1 — the pure view rules extracted from AssignmentsPanel, pinned alone: master scope, gradebook rows (search · filter ·
// sort), item-analysis order and summary, and the drill-in gradebook view. The panel-level suites keep pinning the same behaviour
// through the real component.
import { describe, it, expect } from "vitest";
import { matchesMasterScope, normalizeQuery, gradebookRows, sortAnalysisQuestions, summarizeAnalysis, drillViewFor, rowGrading } from "./assignmentsView";
import type { Item, StudentResult, ItemAnalysis, QuestionStat } from "./types";

const item = (over: Partial<Item>): Item => ({ assignmentId: "a", classId: "c1", className: "الحادي عشر", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: "", questionCount: 1, totalMarks: 10, maxAttempts: 1, ...over });
const latest = (percentage: number, extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: percentage / 10, totalMarks: 10, percentage, submittedAt: "2026-10-01T00:00:00Z", finalized: true, manualReviewMarks: 0, ...extra });
const student = (id: string, name: string, over: Partial<StudentResult> = {}): StudentResult => ({ studentId: id, studentName: name, studentCode: "P-" + id, attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, ...over } as StudentResult);

describe("master scope", () => {
  it("filters by class, by current / archived view and by a normalized query over title and class", () => {
    const scope = { classId: "c1", showArchived: false, q: "" };
    expect(matchesMasterScope(item({}), scope)).toBe(true);
    expect(matchesMasterScope(item({ classId: "c2" }), scope)).toBe(false);
    expect(matchesMasterScope(item({ classId: "c2" }), { ...scope, classId: "" })).toBe(true);
    expect(matchesMasterScope(item({ status: "archived" }), scope)).toBe(false);
    expect(matchesMasterScope(item({ status: "archived" }), { ...scope, showArchived: true })).toBe(true);
    expect(matchesMasterScope(item({ status: "draft" }), { ...scope, showArchived: true })).toBe(false);
    expect(normalizeQuery("  الحادي  ")).toBe("الحادي");
    expect(matchesMasterScope(item({}), { ...scope, q: normalizeQuery(" الحادي ") })).toBe(true);
    expect(matchesMasterScope(item({ title: "Quiz ONE" }), { ...scope, q: normalizeQuery("one") })).toBe(true);
    expect(matchesMasterScope(item({}), { ...scope, q: "غير موجود" })).toBe(false);
  });
});

describe("gradebook rows", () => {
  const rows = [
    student("1", "سارة", { latestResult: latest(90) } as Partial<StudentResult>),
    student("2", "أحمد", { latestResult: latest(40, { finalized: false, manualReviewMarks: 2 }) } as Partial<StudentResult>),
    student("3", "باسل"),
    student("4", "تالا", { activeAttempt: { attemptNumber: 1, startedAt: "x", endsAt: "y" } } as Partial<StudentResult>),
    student("5", "دانة", { gradingStatus: "final", latestResult: latest(70) } as Partial<StudentResult>)
  ];
  const names = (r: StudentResult[]) => r.map(s => s.studentName);
  it("grading comes from the server status when present, else from the shared resolver", () => {
    expect(rows.map(rowGrading)).toEqual(["final", "pendingReview", "notSubmitted", "notSubmitted", "final"]);
  });
  it("searches name and code, case-insensitively", () => {
    expect(names(gradebookRows(rows, " سار ", "all", "name"))).toEqual(["سارة"]);
    expect(names(gradebookRows(rows, "p-3", "all", "name"))).toEqual(["باسل"]);
  });
  it("filters by grading status and by an active attempt", () => {
    expect(names(gradebookRows(rows, "", "pendingReview", "name"))).toEqual(["أحمد"]);
    expect(names(gradebookRows(rows, "", "final", "name"))).toEqual(["دانة", "سارة"]);
    expect(names(gradebookRows(rows, "", "notSubmitted", "name"))).toEqual(["باسل", "تالا"]);
    expect(names(gradebookRows(rows, "", "active", "name"))).toEqual(["تالا"]);
  });
  it("sorts by name, pending first, highest and lowest (no result always last)", () => {
    expect(names(gradebookRows(rows, "", "all", "name"))).toEqual(["أحمد", "باسل", "تالا", "دانة", "سارة"]);
    expect(names(gradebookRows(rows, "", "all", "pendingFirst"))).toEqual(["أحمد", "باسل", "تالا", "دانة", "سارة"]);
    expect(names(gradebookRows(rows, "", "all", "highest"))).toEqual(["سارة", "دانة", "أحمد", "باسل", "تالا"]);
    expect(names(gradebookRows(rows, "", "all", "lowest"))).toEqual(["أحمد", "دانة", "سارة", "باسل", "تالا"]);
  });
  it("never mutates the input", () => {
    const copy = JSON.stringify(rows);
    gradebookRows(rows, "", "all", "highest");
    expect(JSON.stringify(rows)).toBe(copy);
  });
});

describe("item analysis", () => {
  const q = (number: number, averagePercentage: number | null): QuestionStat => ({ questionId: "q" + number, number, text: "", type: "open", maxMarks: 1, studentsAnalyzed: 1, correctCount: 0, correctRate: null, averageScore: null, averagePercentage } as QuestionStat);
  const analysis = { assignmentId: "a", title: "", studentsInClass: 3, studentsSubmitted: 2, attemptsAnalyzed: 2, questions: [q(3, 80), q(1, null), q(2, 20), q(4, 50)] } as ItemAnalysis;
  const order = (s: QuestionStat[]) => s.map(x => x.number);
  it("orders by number, hardest or easiest, with no-data questions last", () => {
    expect(order(sortAnalysisQuestions(analysis, "number"))).toEqual([1, 2, 3, 4]);
    expect(order(sortAnalysisQuestions(analysis, "hardest"))).toEqual([2, 4, 3, 1]);
    expect(order(sortAnalysisQuestions(analysis, "easiest"))).toEqual([3, 4, 2, 1]);
    expect(sortAnalysisQuestions(null, "number")).toEqual([]);
  });
  it("summarizes the average and the hardest / easiest question", () => {
    expect(summarizeAnalysis(analysis)).toEqual({ overallAverage: 50, hardest: analysis.questions[2], easiest: analysis.questions[0] });
    expect(summarizeAnalysis({ ...analysis, questions: [q(1, null)] })).toEqual({ overallAverage: null, hardest: null, easiest: null });
    expect(summarizeAnalysis(null)).toBeNull();
    expect(summarizeAnalysis({ ...analysis, questions: [q(1, 33.33), q(2, 66.67), q(3, 50)] })?.overallAverage).toBe(50);
  });
});

describe("drill-in gradebook view", () => {
  const rows = [student("s1", "سارة", { activeAttempt: { attemptNumber: 1, startedAt: "x", endsAt: "y" } } as Partial<StudentResult>), student("s2", "أحمد", { latestResult: latest(40, { finalized: false, manualReviewMarks: 2 }) } as Partial<StudentResult>)];
  it("maps the intent onto the existing filter, without a student", () => {
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "pendingReview" }, rows)).toEqual({ filter: "pendingReview", focusStudentId: null, notice: null });
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "assignment" }, rows)).toEqual({ filter: "all", focusStudentId: null, notice: null });
  });
  it("focuses a present student that still matches the intent", () => {
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "active", studentId: "s1" }, rows)).toEqual({ filter: "active", focusStudentId: "s1", notice: null });
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "student", studentId: "s2" }, rows)).toEqual({ filter: "all", focusStudentId: "s2", notice: null });
  });
  it("shows every row with a calm note when the student no longer matches, and a note when the student is gone", () => {
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "active", studentId: "s2" }, rows)).toEqual({ filter: "all", focusStudentId: "s2", notice: "لم تعد محاولة أحمد جارية؛ تُعرض حالته الحالية." });
    expect(drillViewFor({ seq: 1, assignmentId: "a", mode: "student", studentId: "gone" }, rows)).toEqual({ filter: "all", focusStudentId: null, notice: "لم يعد هذا الطالب ضمن الواجب؛ تُعرض الحالة الحالية." });
  });
});
