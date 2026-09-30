// Phase 16A — deterministic scoring for the Wave 1 enterprise types (pure; compiled into the server shared build and used by
// api/src/lib/question-type-graders.js — the ONE implementation of each formula). No expression evaluation of any kind.
export type MultipleSelectScoring = "allOrNothing" | "partialNoPenalty" | "partialWithPenalty";
export const MULTIPLE_SELECT_SCORING: readonly MultipleSelectScoring[] = Object.freeze(["allOrNothing", "partialNoPenalty", "partialWithPenalty"]);
export const MULTIPLE_SELECT_SCORING_LABELS: Readonly<Record<MultipleSelectScoring, string>> = Object.freeze({ allOrNothing: "كل شيء أو لا شيء", partialNoPenalty: "علامة جزئية بدون خصم", partialWithPenalty: "علامة جزئية مع خصم للاختيارات الخاطئة" });
/** Relative epsilon for inclusive numeric boundaries (1.1 − 1 = 0.10000000000000009 must still be "on" a 0.1 tolerance). */
export const NUMERIC_EPSILON = 1e-9;

const clamp = (n: number, max: number) => Math.min(Math.max(0, n), Math.max(0, max));
const idList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

export type MultipleSelectResult = { score: number; correct: boolean; answered: boolean; selected: string[] };
/**
 * S = selected ∩ valid option ids (deduplicated), C = correct option ids (∩ valid).
 *   allOrNothing       : S = C → marks, else 0
 *   partialNoPenalty   : |S ∩ C| / |C| × marks
 *   partialWithPenalty : max(0, (|S ∩ C| − |S \ C|) / |C|) × marks
 * Always 0 ≤ score ≤ marks. Empty S = unanswered (score 0, correct false).
 */
export function scoreMultipleSelect(input: { optionIds: readonly string[]; correctOptionIds: readonly string[]; selectedOptionIds: unknown; scoring: MultipleSelectScoring | string; maxMarks: number }): MultipleSelectResult {
  const valid = new Set(idList(input.optionIds));
  const correct = new Set(idList(input.correctOptionIds).filter(id => valid.has(id)));
  const selected = [...new Set(idList(input.selectedOptionIds).filter(id => valid.has(id)))];
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  if (!selected.length) return { score: 0, correct: false, answered: false, selected };
  const hits = selected.filter(id => correct.has(id)).length, misses = selected.length - hits, total = correct.size;
  let ratio = 0;
  if (input.scoring === "allOrNothing") ratio = hits === total && misses === 0 ? 1 : 0;
  else if (input.scoring === "partialNoPenalty") ratio = total ? hits / total : 0;
  else if (input.scoring === "partialWithPenalty") ratio = total ? Math.max(0, (hits - misses) / total) : 0;
  const score = clamp(ratio * max, max);
  return { score, correct: total > 0 && hits === total && misses === 0, answered: true, selected };
}

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩", EXTENDED_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";
const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** Plain decimal (Arabic / English digits and separators, optional exponent) → finite number, else null. Never an expression. */
export function parseNumericInput(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/[٠-٩]/g, ch => String(ARABIC_INDIC.indexOf(ch))).replace(/[۰-۹]/g, ch => String(EXTENDED_ARABIC_INDIC.indexOf(ch)));
  s = s.replace(/[٬]/g, "").replace(/[٫،,]/g, ".").replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (!NUMBER_PATTERN.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
/** Deterministic unit normalization: NFKC, lower-case, whitespace removed. */
export const normalizeUnit = (raw: unknown): string => (typeof raw === "string" ? raw.normalize("NFKC").toLowerCase().replace(/\s+/g, "") : "");

export type NumericAnswerKey = { mode?: unknown; expected?: unknown; tolerance?: unknown; min?: unknown; max?: unknown; unit?: unknown };
export type NumericResult = { score: number; correct: boolean; answered: boolean; reason: "unanswered" | "not-a-number" | "unit" | "outside" | "correct" | "invalid-key" };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Tolerance: |v − expected| ≤ tolerance (inclusive, epsilon-safe). Range: min ≤ v ≤ max (inclusive). Unit compared only when required. */
export function scoreNumericResponse(input: { answer: NumericAnswerKey; unitRequired: boolean; response: unknown; maxMarks: number }): NumericResult {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const r = input.response && typeof input.response === "object" ? (input.response as { kind?: unknown; value?: unknown; unit?: unknown }) : null;
  const rawValue = r && r.kind === "numeric" ? r.value : undefined;
  if (typeof rawValue !== "string" || !rawValue.trim()) return { score: 0, correct: false, answered: false, reason: "unanswered" };
  const v = parseNumericInput(rawValue);
  if (v === null) return { score: 0, correct: false, answered: true, reason: "not-a-number" };
  const a = input.answer || {};
  if (input.unitRequired) {
    const expectedUnit = normalizeUnit(a.unit);
    if (!expectedUnit || normalizeUnit(r?.unit) !== expectedUnit) return { score: 0, correct: false, answered: true, reason: "unit" };
  }
  let ok = false;
  if (a.mode === "tolerance" && finite(a.expected) && finite(a.tolerance) && a.tolerance >= 0) {
    const eps = NUMERIC_EPSILON * Math.max(1, Math.abs(a.expected), Math.abs(a.tolerance));
    ok = Math.abs(v - a.expected) <= a.tolerance + eps;
  } else if (a.mode === "range" && finite(a.min) && finite(a.max) && a.min <= a.max) {
    const eps = NUMERIC_EPSILON * Math.max(1, Math.abs(a.min), Math.abs(a.max));
    ok = v >= a.min - eps && v <= a.max + eps;
  } else return { score: 0, correct: false, answered: true, reason: "invalid-key" };
  return ok ? { score: max, correct: true, answered: true, reason: "correct" } : { score: 0, correct: false, answered: true, reason: "outside" };
}

type Identified = { id: string };
const validIds = (list: unknown): string[] => (Array.isArray(list) ? list.map(x => (x && typeof x === "object" ? (x as Identified).id : undefined)).filter((id): id is string => typeof id === "string" && id !== "") : []);
const stringMap = (v: unknown): Record<string, string> => { const out: Record<string, string> = {}; if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string") out[k] = val; return out; };

export type MatrixResult = { score: number; correct: boolean; answered: boolean; correctRows: number; totalRows: number };
/** One column per row; score = correctRows / totalRows × marks. Identities are stable ids — order is irrelevant. */
export function scoreMatrix(input: { rows: readonly Identified[]; columns: readonly Identified[]; correctColumnByRow: unknown; values: unknown; maxMarks: number }): MatrixResult {
  const rows = validIds(input.rows), cols = new Set(validIds(input.columns)), key = stringMap(input.correctColumnByRow), values = stringMap(input.values);
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const answered = rows.some(r => (values[r] ?? "") !== "");
  let correctRows = 0;
  for (const r of rows) if (cols.has(key[r]) && values[r] === key[r]) correctRows++;
  const totalRows = rows.length;
  const score = totalRows ? clamp((correctRows / totalRows) * max, max) : 0;
  return { score, correct: totalRows > 0 && correctRows === totalRows, answered, correctRows, totalRows };
}

export type CategorizationResult = { score: number; correct: boolean; answered: boolean; correctItems: number; totalItems: number };
/** score = correctItems / totalItems × marks; unknown item ids in the response are ignored. */
export function scoreCategorization(input: { categories: readonly Identified[]; items: readonly Identified[]; correctCategoryByItem: unknown; values: unknown; maxMarks: number }): CategorizationResult {
  const items = validIds(input.items), cats = new Set(validIds(input.categories)), key = stringMap(input.correctCategoryByItem), values = stringMap(input.values);
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const answered = items.some(i => (values[i] ?? "") !== "");
  let correctItems = 0;
  for (const i of items) if (cats.has(key[i]) && values[i] === key[i]) correctItems++;
  const totalItems = items.length;
  const score = totalItems ? clamp((correctItems / totalItems) * max, max) : 0;
  return { score, correct: totalItems > 0 && correctItems === totalItems, answered, correctItems, totalItems };
}
