// Phase G4 — «استيراد من Excel»: what an imported file means for the class matrix (owner decisions of 2026-10-24, D-G4a…d). The
// file is the one «تصدير إلى Excel» writes (G3), possibly edited and saved again by Excel. This module only PLANS: it turns the
// file's rows and the server's board into score changes and the problems found, and changes nothing. The matrix shows the plan,
// and on the teacher's confirmation the changes become ordinary unsaved drafts, saved by «حفظ العلامات» (score.bulk with its
// stale guard, then the approve-on-save switch, D-G4d), so an import has no write path of its own.
//   • A row is matched to a student by the name AND the last four characters of the student code, both as the export writes
//     them (D-G4c). No match, more than one match, or two rows for one student: the row is reported and never imported.
//   • A score column is found by its header, «… · <stage id> … — العلامة من 100»; the status, progress and grade columns are
//     read-only and ignored; a stage column the board does not list is reported.
//   • An empty cell leaves the saved score as it is (D-G4a); a value that is not a score from 0 to 100 is reported and that
//     cell only is left out (D-G4b); a value equal to the saved score is no change.
import type { Board, BoardStage } from "./ProjectBulkReview";
import type { XlsxReadCell } from "../reports/xlsxRead";
import { normalizeGridDigits, parseGridScore } from "./scoreGrid";

export type ImportChange = { studentId: string; stageId: string; score: number; previous: number | null };
export type ImportIssue = { row: number; name: string; kind: "unmatched" | "ambiguous" | "duplicate" | "invalid"; stageId?: string; value?: string };
export type ImportPlan = {
  changes: ImportChange[];
  /** Cells whose value equals the saved score. */
  unchanged: number;
  /** Matched students' empty score cells (left as they are). */
  empty: number;
  /** The score columns the file and the board share, in the file's order. */
  stages: BoardStage[];
  issues: ImportIssue[];
  /** Score-column headers whose stage the board does not list. */
  unknownColumns: string[];
  /** Data rows read (a row with neither a name nor a code is skipped). */
  rows: number;
};
export class ScoreImportError extends Error {}

const SCORE_SUFFIX = "— العلامة من 100";
const text = (v: XlsxReadCell) => (v === null || v === undefined ? "" : String(v));
/** A display name as compared: Unicode NFC, spaces collapsed. */
// QA2-25 — invisible marks (zero-width space, bidi marks, BOM, soft hyphen) never decide whether a file name matches the roster.
export const importName = (v: XlsxReadCell) => text(v).normalize("NFC").replace(/[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF\u00AD]/g, "").replace(/\s+/g, " ").trim();
/** The last four characters of a student code as compared: the export's «•••••» mask and separators dropped, digits made ASCII,
 *  a number cell padded back to four digits (Excel drops a leading zero when a teacher retypes «0123»). */
export function importCode(v: XlsxReadCell): string {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? String(v).padStart(4, "0").slice(-4) : "";
  const s = normalizeGridDigits(text(v)).replace(/[^0-9A-Za-z؀-ۿ]/g, "");
  return s.slice(-4).toUpperCase();
}

/** The plan of an import (pure): the file's rows (`readXlsxRows`) against the server's board. */
export function planScoreImport(rows: XlsxReadCell[][], board: Board): ImportPlan {
  const headerAt = rows.slice(0, 20).findIndex(r => importName(r?.[0] ?? null) === "الطالب");
  if (headerAt < 0) throw new ScoreImportError("لم أجد صفّ العناوين («الطالب» في أول عمود). استورد ملفًا صدّرته «تصدير إلى Excel» من هذا الجدول.");
  const header = rows[headerAt] || [];
  const byId = new Map(board.stages.map(s => [s.stageId, s]));
  const columns: { col: number; stage: BoardStage }[] = [];
  const unknownColumns: string[] = [];
  header.forEach((h, col) => {
    const title = importName(h);
    if (col < 2 || !title.endsWith(SCORE_SUFFIX)) return;
    // QA-22 — the header is «<track title> · <stage id> <stage title> — …», and a track or stage title may itself contain «·»: the
    // FIRST «· X» is not necessarily the stage id. Every «· X» is a candidate; the column belongs to a stage only when exactly
    // one candidate is a stage of this board (none, or more than one, is reported as an unknown column — never guessed).
    const candidates = [...new Set([...title.matchAll(/· (\S+) /g)].map(x => x[1]).filter(id => byId.has(id)))];
    const stage = candidates.length === 1 ? byId.get(candidates[0]) : undefined;
    if (!stage || columns.some(c => c.stage.stageId === stage.stageId)) { unknownColumns.push(title); return; }
    columns.push({ col, stage });
  });
  if (!columns.length) throw new ScoreImportError("لا يحوي الملف أي عمود علامات لمراحل هذا المشروع.");

  const key = (name: string, code: string) => name + "|" + code;
  const roster = new Map<string, string[]>();
  for (const s of board.students) {
    const k = key(importName(s.displayName || ""), importCode(s.code || ""));
    roster.set(k, [...(roster.get(k) || []), s.studentId]);
  }
  const issues: ImportIssue[] = [];
  const matched: { row: number; name: string; studentId: string; cells: XlsxReadCell[] }[] = [];
  let count = 0;
  for (let r = headerAt + 1; r < rows.length; r++) {
    const cells = rows[r] || [];
    const name = importName(cells[0] ?? null), code = importCode(cells[1] ?? null);
    if (!name && !code) continue;
    count++;
    const ids = roster.get(key(name, code)) || [];
    if (ids.length === 0) issues.push({ row: r + 1, name, kind: "unmatched" });
    else if (ids.length > 1) issues.push({ row: r + 1, name, kind: "ambiguous" });
    else matched.push({ row: r + 1, name, studentId: ids[0], cells });
  }
  // Two rows for one student: neither is imported (which one the teacher meant cannot be known).
  const seen = new Map<string, number>();
  for (const m of matched) seen.set(m.studentId, (seen.get(m.studentId) || 0) + 1);
  const single = matched.filter(m => {
    if (seen.get(m.studentId) === 1) return true;
    issues.push({ row: m.row, name: m.name, kind: "duplicate" });
    return false;
  });

  const changes: ImportChange[] = [];
  let unchanged = 0, empty = 0;
  for (const m of single) {
    const student = board.students.find(s => s.studentId === m.studentId)!;
    for (const { col, stage } of columns) {
      const v = m.cells[col] ?? null;
      const parsed = typeof v === "number"
        ? (Number.isFinite(v) && v >= 0 && v <= 100 ? { kind: "value" as const, value: v } : { kind: "invalid" as const })
        : parseGridScore(text(v));
      if (parsed.kind === "empty") { empty++; continue; }
      if (parsed.kind === "invalid") { issues.push({ row: m.row, name: m.name, kind: "invalid", stageId: stage.stageId, value: text(v) }); continue; }
      const cell = student.cells[stage.stageId];
      const previous = cell && typeof cell.score === "number" ? cell.score : null;
      if (previous === parsed.value) { unchanged++; continue; }
      changes.push({ studentId: m.studentId, stageId: stage.stageId, score: parsed.value, previous });
    }
  }
  issues.sort((a, b) => a.row - b.row);
  return { changes, unchanged, empty, stages: columns.map(c => c.stage), issues, unknownColumns, rows: count };
}

export const IMPORT_ISSUE_TEXT: Record<ImportIssue["kind"], string> = {
  unmatched: "لا يطابق أي طالب في الصف (الاسم وآخر 4 خانات من الرقم)",
  ambiguous: "يطابق أكثر من طالب في الصف",
  duplicate: "الطالب نفسه في أكثر من صف في الملف",
  invalid: "ليست علامة من 0 إلى 100",
};
