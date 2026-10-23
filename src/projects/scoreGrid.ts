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

// ---- Phase G1 — the class matrix: a cell is a score AND a «منجز» decision. ----

/** One status decision of the matrix: approve the stage («منجز») or reopen it (back to «قيد التنفيذ»). */
export type GridStatusChange = { key: string; studentId: string; stageId: string; to: "approved" | "in_progress"; implied: boolean };

const isApprovedCell = (board: Board, studentId: string, stageId: string) => {
  const c = board.students.find(s => s.studentId === studentId)?.cells[stageId];
  return !!c && c.status === "approved";
};

/**
 * The status writes a save makes, in board order:
 *   • an explicit «منجز» toggle that differs from the saved state approves (on) or reopens (off) the stage;
 *   • with «اعتماد عند الحفظ» on, a cell that gets a score (never a cleared one) on a stage not yet approved is approved
 *     too (`implied`), exactly as the student profile does (Phase P8); an explicit toggle on the same cell wins.
 * A stage the student marked done (approved + selfReported) counts as approved: confirming it needs no status write,
 * reopening it does. A cleared score never approves.
 */
export function gridStatusChanges(doneDrafts: Record<string, boolean>, scoreChanges: GridChange[], board: Board, approveOnSave: boolean): GridStatusChange[] {
  const out: GridStatusChange[] = [];
  const scored = new Map(scoreChanges.filter(c => !c.invalid).map(c => [c.key, c]));
  const stages = board.stages.slice().sort((a, b) => a.order - b.order);
  for (const student of board.students) {
    for (const stage of stages) {
      const key = student.studentId + "|" + stage.stageId;
      const approved = isApprovedCell(board, student.studentId, stage.stageId);
      if (key in doneDrafts) {
        if (doneDrafts[key] !== approved) out.push({ key, studentId: student.studentId, stageId: stage.stageId, to: doneDrafts[key] ? "approved" : "in_progress", implied: false });
        continue;
      }
      const change = scored.get(key);
      if (approveOnSave && change && change.score !== null && !approved) out.push({ key, studentId: student.studentId, stageId: stage.stageId, to: "approved", implied: true });
    }
  }
  return out;
}

/** The matrix's row filters: everyone, students with a stage waiting for the teacher, or with a stage that has no score. */
export type GridFilter = "all" | "waiting" | "unscored";
export function gridRowMatches(filter: GridFilter, student: Board["students"][number], stageIds: string[]): boolean {
  if (filter === "all") return true;
  return stageIds.some(id => {
    const c = student.cells[id];
    if (filter === "waiting") return !!c && (c.status === "ready_for_review" || c.selfReported === true);
    return !c || typeof c.score !== "number";
  });
}
