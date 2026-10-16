// Phase 21G.4 — the per-question grid of the «تحليل الأسئلة» section (pure): one row per student (latest attempt), one cell per
// question, banded with the SAME edges as the score distribution. Grading safety: a pending cell is shown as pending — it has no
// score to band — and a cell the server did not grade is "—"; neither is ever drawn as a mark.
import { bandOf } from "./assignmentPage";
import type { QuestionStat, StudentQuestionRow } from "./types";

export type GridCell =
  | { kind: "graded"; text: string; band: string; label: string }
  | { kind: "pending"; text: string; label: string }
  | { kind: "none"; text: string; label: string };
export type GridRow = { studentId: string; studentName: string; studentCode: string; cells: GridCell[] };

const num = (n: number) => String(Math.round(n * 100) / 100);

export function questionGrid(questions: readonly QuestionStat[], students: readonly StudentQuestionRow[] | undefined): GridRow[] {
  return [...(students || [])]
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "ar"))
    .map(s => ({
      studentId: s.studentId, studentName: s.studentName, studentCode: s.studentCode,
      cells: questions.map((q, i): GridCell => {
        const c = s.cells[i];
        const where = "س" + q.number;
        if (c?.state === "pending") return { kind: "pending", text: "بانتظار", label: where + ": بانتظار التصحيح" };
        if (c?.state !== "graded" || typeof c.score !== "number") return { kind: "none", text: "—", label: where + ": لا توجد علامة" };
        const text = num(c.score) + "/" + num(q.maxMarks);
        return { kind: "graded", text, band: q.maxMarks > 0 ? bandOf(c.score / q.maxMarks * 100).key : "none", label: where + ": " + text };
      })
    }));
}
