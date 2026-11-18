// Class gradebook GB5 — the teacher's unsaved marks and decisions in the table (docs/enterprise-class-gradebook-gb.md §4.6 item 3). PURE.
//
// One edit per cell: the stored value the teacher saw (`expected`, sent with the save so a cell changed elsewhere is never overwritten)
// and what the teacher wants now — a decision («معفى» / «صفر») or, in a manual column, a typed score. An edit that comes back to the
// stored value disappears (nothing to save). Nothing is written before «حفظ العلامات».
//
// The column actions touch ONLY cells where the student has nothing: no result, no typed score, no decision (state «missing»).
// A graded, pending, excused or zero cell is never changed by them — «اعتبار غير المسلِّمين صفرًا» can never turn a result, or a result
// awaiting the teacher, into a zero (AGENTS.md §10: a zero exists only by the teacher's explicit decision, cell by cell or for the
// non-submitters of one column).
import { normalizeDigits } from "./schemeDraft";
import type { GbColumn, GbEntryItem, GbEntryValue, GbGradebook } from "./types";

export type Decision = "excused" | "zero";
export type CellEdit = { itemId: string; studentId: string; expected: GbEntryValue | null; decision: Decision | null; scoreText: string; stale?: GbEntryValue | null };
export type EntriesDraft = Record<string, CellEdit>;

export const cellKey = (itemId: string, studentId: string) => itemId + "/" + studentId;
const same = (a: GbEntryValue | null, b: GbEntryValue | null) => JSON.stringify(a) === JSON.stringify(b);

/** The stored value of a cell (from the server's `entries`), or null. */
export function storedValue(gb: GbGradebook, itemId: string, studentId: string): GbEntryValue | null {
  const v = gb.entries && gb.entries[itemId] ? gb.entries[itemId][studentId] : undefined;
  if (!v || typeof v !== "object") return null;
  if ("decision" in v && (v.decision === "excused" || v.decision === "zero")) return { decision: v.decision };
  if ("score" in v && typeof v.score === "number") return { score: v.score };
  return null;
}

const columnOf = (gb: GbGradebook, itemId: string): GbColumn | undefined => gb.columns.find(c => c.itemId === itemId);
const maxScoreOf = (col: GbColumn | undefined) => (col && col.source.kind === "manual" ? col.source.maxScore : 0);

/** A typed score: digits (Arabic-Indic accepted), at most two decimals, within 0..max; else null. */
export function parseScore(text: string, max: number): number | null {
  const t = normalizeDigits(text);
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= max ? n : null;
}

const editFromStored = (itemId: string, studentId: string, expected: GbEntryValue | null): CellEdit => ({
  itemId, studentId, expected,
  decision: expected && "decision" in expected ? expected.decision : null,
  scoreText: expected && "score" in expected ? String(expected.score) : ""
});

/** The edit of a cell as the teacher sees it now (the draft's, else the stored value). */
export function currentEdit(draft: EntriesDraft, gb: GbGradebook, itemId: string, studentId: string): CellEdit {
  return draft[cellKey(itemId, studentId)] || editFromStored(itemId, studentId, storedValue(gb, itemId, studentId));
}

/** The value an edit asks for: a decision wins; else a valid typed score; an empty score is «nothing» (null); an invalid one is undefined. */
export function editValue(edit: CellEdit, max: number): GbEntryValue | null | undefined {
  if (edit.decision) return { decision: edit.decision };
  if (!edit.scoreText.trim()) return null;
  const n = parseScore(edit.scoreText, max);
  return n === null ? undefined : { score: n };
}

function put(draft: EntriesDraft, gb: GbGradebook, edit: CellEdit): EntriesDraft {
  const key = cellKey(edit.itemId, edit.studentId);
  const next = { ...draft };
  const value = editValue(edit, maxScoreOf(columnOf(gb, edit.itemId)));
  if (value !== undefined && same(value, edit.expected)) delete next[key];   // back to what is stored: nothing to save
  else next[key] = edit;
  return next;
}

export function setDecision(draft: EntriesDraft, gb: GbGradebook, itemId: string, studentId: string, decision: Decision | null): EntriesDraft {
  return put(draft, gb, { ...currentEdit(draft, gb, itemId, studentId), decision });
}
/** Manual columns only: the typed text is kept as typed (so a half-typed «12.» never jumps). */
export function setScoreText(draft: EntriesDraft, gb: GbGradebook, itemId: string, studentId: string, scoreText: string): EntriesDraft {
  if (maxScoreOf(columnOf(gb, itemId)) <= 0) return draft;
  return put(draft, gb, { ...currentEdit(draft, gb, itemId, studentId), scoreText });
}

export type ColumnAction = "zeroMissing" | "excuseMissing" | "clearDecisions";
export const COLUMN_ACTION_LABEL: Record<ColumnAction, string> = {
  zeroMissing: "اعتبار غير المسلِّمين صفرًا",
  excuseMissing: "إعفاء غير المسلِّمين",
  clearDecisions: "مسح قرارات العمود"
};

/** A column action, for the rows shown. The «missing» actions touch only cells with nothing at all (see the header). */
export function applyColumnAction(draft: EntriesDraft, gb: GbGradebook, itemId: string, studentIds: string[], action: ColumnAction): EntriesDraft {
  let next = draft;
  for (const studentId of studentIds) {
    const row = gb.rows.find(r => r.studentId === studentId);
    const cell = row ? row.cells[itemId] : undefined;
    const edit = currentEdit(next, gb, itemId, studentId);
    if (action === "clearDecisions") {
      if (edit.decision) next = setDecision(next, gb, itemId, studentId, null);
      continue;
    }
    // Nothing at all: the server says «missing», and the teacher has neither a decision nor a typed score on it (saved or unsaved).
    const nothing = cell && cell.state === "missing" && !edit.decision && !edit.scoreText.trim();
    if (nothing) next = setDecision(next, gb, itemId, studentId, action === "zeroMissing" ? "zero" : "excused");
  }
  return next;
}

/** The edits that cannot be saved as typed (an invalid score), keyed. */
export function invalidEdits(draft: EntriesDraft, gb: GbGradebook): string[] {
  return Object.entries(draft).filter(([, e]) => editValue(e, maxScoreOf(columnOf(gb, e.itemId))) === undefined).map(([k]) => k);
}

/** The save request: one item per valid edit, with the value the teacher saw. */
export function toItems(draft: EntriesDraft, gb: GbGradebook): GbEntryItem[] {
  const out: GbEntryItem[] = [];
  for (const e of Object.values(draft)) {
    const value = editValue(e, maxScoreOf(columnOf(gb, e.itemId)));
    if (value === undefined) continue;
    out.push({ itemId: e.itemId, studentId: e.studentId, expected: e.expected, value });
  }
  return out;
}

/** After a save: applied edits leave the draft; a stale one stays, now based on the server's current value (shown to the teacher). */
export function afterSave(draft: EntriesDraft, applied: { itemId: string; studentId: string }[], stale: { itemId: string; studentId: string; current: GbEntryValue | null }[]): EntriesDraft {
  const next = { ...draft };
  for (const a of applied) delete next[cellKey(a.itemId, a.studentId)];
  for (const s of stale) {
    const key = cellKey(s.itemId, s.studentId);
    if (next[key]) next[key] = { ...next[key], expected: s.current, stale: s.current };
  }
  return next;
}

/** «0 (قرار)», «معفى», «12.5 من 20», «—»: a stored value in words (used for the server's value of a stale cell). */
export function valueText(v: GbEntryValue | null, max = 0): string {
  if (!v) return "—";
  if ("decision" in v) return v.decision === "zero" ? "0 (قرار)" : "معفى";
  return String(v.score) + (max ? " من " + max : "");
}

/** After the gradebook is read again: an edit whose stored value changed meanwhile now saves over the new value, and shows it
 *  («تغيّر في مكان آخر») — the teacher's own value is kept, never silently replaced, and nothing is overwritten without being seen. */
export function rebase(draft: EntriesDraft, gb: GbGradebook): EntriesDraft {
  const next: EntriesDraft = {};
  for (const [key, e] of Object.entries(draft)) {
    const cur = storedValue(gb, e.itemId, e.studentId);
    const moved = !same(cur, e.expected);
    const edit = moved ? { ...e, expected: cur, stale: cur } : e;
    const value = editValue(edit, maxScoreOf(columnOf(gb, e.itemId)));
    if (value !== undefined && same(value, edit.expected)) continue;      // the server already holds what the teacher wants
    next[key] = edit;
  }
  return next;
}
