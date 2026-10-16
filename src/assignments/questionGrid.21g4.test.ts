// Phase 21G.4 — the per-question grid model: students by name, cells in question order, banded with the distribution's edges;
// a pending cell is never banded or given a mark, a missing grade is «—».
import { describe, it, expect } from "vitest";
import { questionGrid } from "./questionGrid";
import type { QuestionStat, StudentQuestionRow } from "./types";

const q = (number: number, maxMarks: number) => ({ questionId: "q" + number, number, text: "", type: "", maxMarks, studentsAnalyzed: 0, correctCount: 0, correctRate: null, averageScore: null, averagePercentage: null, manualReviewCount: 0, difficulty: null }) as QuestionStat;
const QS = [q(1, 4), q(2, 10), q(3, 0)];
const row = (studentId: string, studentName: string, cells: StudentQuestionRow["cells"]): StudentQuestionRow => ({ studentId, studentName, studentCode: "C" + studentId, attemptNumber: 1, cells });

describe("the per-question grid", () => {
  it("bands each graded mark as a share of the question's marks, at the distribution's edges", () => {
    const g = questionGrid(QS, [row("s1", "سارة", [{ state: "graded", score: 1.99 }, { state: "graded", score: 5 }, { state: "graded", score: 0 }]), row("s2", "أحمد", [{ state: "graded", score: 4 }, { state: "graded", score: 8.95 }, { state: "none" }])]);
    expect(g.map(r => r.studentName)).toEqual(["أحمد", "سارة"]);
    expect(g[1].cells.map(c => [c.kind, c.text, c.kind === "graded" ? c.band : ""])).toEqual([["graded", "1.99/4", "b0"], ["graded", "5/10", "b50"], ["graded", "0/0", "none"]]);
    expect(g[0].cells.map(c => [c.kind, c.text, c.kind === "graded" ? c.band : ""])).toEqual([["graded", "4/4", "b90"], ["graded", "8.95/10", "b80"], ["none", "—", ""]]);
  });
  it("a pending cell reads «بانتظار», is never banded and carries no mark; a missing cell is «—»", () => {
    const [r] = questionGrid(QS, [row("s1", "سارة", [{ state: "pending" }, { state: "pending", score: 9 } as never, { state: "none" }])]);
    expect(r.cells).toEqual([
      { kind: "pending", text: "بانتظار", label: "س1: بانتظار التصحيح" },
      { kind: "pending", text: "بانتظار", label: "س2: بانتظار التصحيح" },
      { kind: "none", text: "—", label: "س3: لا توجد علامة" }
    ]);
    expect(questionGrid(QS, [row("s1", "سارة", [])])[0].cells.map(c => c.kind)).toEqual(["none", "none", "none"]);
    expect(questionGrid(QS, undefined)).toEqual([]);
  });
});
