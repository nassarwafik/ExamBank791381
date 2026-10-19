// Phase P4 — pure helpers of the score grid («جدول العلامات»): what a typed cell means and which cells changed.
import type { Board } from "./ProjectBulkReview";

export type GridParsed = { kind: "empty" } | { kind: "value"; value: number } | { kind: "invalid" };
/** One changed cell: the score to store (null = clear) and the score the grid showed (`expected`, the stale guard). */
export type GridChange = { key: string; studentId: string; stageId: string; score: number | null; expected: number | null; invalid: boolean };

/** Arabic-Indic (٠–٩) and Extended Arabic-Indic (۰–۹) digits → ASCII; «٫» or «,» as the decimal separator → «.». */
export function normalizeGridDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[\u066B,]/g, ".");
}

/** A typed cell: empty (clears a saved score), a score 0–100 (decimals allowed), or invalid. */
export function parseGridScore(text: string): GridParsed {
  const t = normalizeGridDigits(String(text)).trim();
  if (t === "") return { kind: "empty" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { kind: "invalid" };
  const value = Number(t);
  return value >= 0 && value <= 100 ? { kind: "value", value } : { kind: "invalid" };
}

/**
 * The cells whose draft differs from the board's saved score, in board order (students, then the board's stage order).
 * An empty draft over an empty cell, or a value equal to the saved score, is no change. Drafts for a student or stage
 * the board no longer lists are ignored.
 */
export function scoreGridChanges(drafts: Record<string, string>, board: Board): GridChange[] {
  const out: GridChange[] = [];
  const stages = board.stages.slice().sort((a, b) => a.order - b.order);
  for (const student of board.students) {
    for (const stage of stages) {
      const key = student.studentId + "|" + stage.stageId;
      if (!(key in drafts)) continue;
      const cell = student.cells[stage.stageId];
      const expected = cell && typeof cell.score === "number" ? cell.score : null;
      const parsed = parseGridScore(drafts[key]);
      if (parsed.kind === "invalid") { out.push({ key, studentId: student.studentId, stageId: stage.stageId, score: null, expected, invalid: true }); continue; }
      const score = parsed.kind === "empty" ? null : parsed.value;
      if (score === expected) continue;
      out.push({ key, studentId: student.studentId, stageId: stage.stageId, score, expected, invalid: false });
    }
  }
  return out;
}
