// Phase G3 — «تصدير إلى Excel»: the class's project scores as the rows of one right-to-left worksheet (written by the shared
// reports/xlsx writer, the same one the assignment gradebook uses). The rows are built from the SERVER's board only:
//   • every active stage of every track, in track then stage order, as two columns — its score and its status;
//   • a cell with no score stays empty (never «0»), a stage the student marked carries «حدّدها الطالب»;
//   • the progress and the weighted grade are the server's (`summary`), never computed here;
//   • no teacher note, no full student code (the last four characters, as every teacher export), no unsaved draft.
import type { Board } from "./ProjectBulkReview";
import type { TrackMeta } from "./types";
import { stageStatusLabel } from "./teacherPresentation";
import { csvDateTime, maskedStudentCode } from "../teacher/teacherExports";
import type { XlsxCell } from "../reports/xlsx";

/** The index of the column row (bold in the workbook): after the title, class and date rows and one empty row. */
export const SCORE_EXPORT_HEADER_ROW = 4;

export function projectScoresRows(board: Board, tracks: TrackMeta[], meta: { title?: string; className?: string; schoolYear?: string; exportedAt: Date }): XlsxCell[][] {
  const trackOrder = new Map(tracks.map((t, i) => [t.trackId, i]));
  const trackTitle = new Map(tracks.map(t => [t.trackId, t.title]));
  const stages = board.stages.slice().sort((a, b) => (trackOrder.get(a.track) ?? 99) - (trackOrder.get(b.track) ?? 99) || a.order - b.order);
  const head: XlsxCell[] = ["الطالب", "رقم الطالب (آخر 4 خانات)"];
  for (const s of stages) {
    const name = (trackTitle.get(s.track) || s.track) + " · " + s.stageId + " " + s.title;
    head.push(name + " — العلامة من 100", name + " — الحالة");
  }
  head.push("التقدّم %", "العلامة الموزونة من 100");
  const rows: XlsxCell[][] = [
    ["المشروع", meta.title || ""],
    ["الصف", [meta.className, meta.schoolYear].filter(Boolean).join(" · ")],
    ["تاريخ التصدير", csvDateTime(meta.exportedAt.toISOString())],
    [],
    head
  ];
  const students = board.students.slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "ar"));
  for (const st of students) {
    const row: XlsxCell[] = [st.displayName || st.studentId, maskedStudentCode(st.code)];
    for (const s of stages) {
      const c = st.cells[s.stageId];
      row.push(c && typeof c.score === "number" && Number.isFinite(c.score) ? c.score : "");
      row.push(c ? stageStatusLabel(c.status) + (c.selfReported ? " (حدّدها الطالب)" : "") : stageStatusLabel("not_started"));
    }
    row.push(st.summary && Number.isFinite(st.summary.overallProgress) ? st.summary.overallProgress : "");
    row.push(st.summary && Number.isFinite(st.summary.grade) ? st.summary.grade : "");
    rows.push(row);
  }
  return rows;
}
