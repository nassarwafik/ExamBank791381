// Phase 21E.2 (C) — field-level messages for the five editors on the shared Field frame. Each function answers "is THIS
// field invalid, and what should the teacher fix?" using exactly the predicate of the canonical rule in examQuality.ts /
// questionTypeValidation.ts (parity-tested in questionFieldIssues.21e2.test.ts): a field is never shown as invalid for a rule
// that does not block finalization, and a blocking rule on a field is never silent. Finalization itself is unchanged — it
// still runs the canonical validators on the whole exam.
import type { BuilderQuestion, QuestionBody } from "../examTypes";
import { validateQuestionTypeNode } from "../questionTypeValidation";
import { matchingPairs } from "../examBuilderState";

// The same coercion as examQuality.ts `num` (parity matters more than strictness here).
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };

/** Common question header — mirrors EMPTY_TEXT (non-compound, plain text required) and MARKS_PROBLEM. */
export function headerFieldIssues(q: Pick<BuilderQuestion, "text" | "marks" | "presentationType">): { text?: string; marks?: string } {
  const out: { text?: string; marks?: string } = {};
  if ((!q.text || !q.text.trim()) && q.presentationType !== "compound") out.text = "اكتب نص السؤال؛ السؤال بلا نص لا يُعتمد.";
  const m = num(q.marks);
  if (!Number.isFinite(m) || m <= 0) out.marks = "أدخل علامة أكبر من صفر.";
  return out;
}

/** Legacy multiple choice — mirrors MISSING_OPTIONS and MISSING_ANSWER. */
export function multipleChoiceFieldIssues(node: QuestionBody): { options?: string; answer?: string } {
  const opts = node.options || [];
  const ci = num((node.answer as { correctOptionIndex?: unknown })?.correctOptionIndex);
  const out: { options?: string; answer?: string } = {};
  if (opts.length < 2) out.options = "أضف خيارين على الأقل.";
  if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) out.answer = "حدّد الإجابة الصحيحة.";
  return out;
}

/** Legacy matching — mirrors MISSING_FIELDS and MATCH_INCOMPLETE_PAIR (per pair, by its position in the editor's list). */
export function matchingFieldIssues(node: QuestionBody): { list?: string; pairs: Record<number, { left?: string; right?: string }> } {
  const fields = node.fields || [];
  const pairs: Record<number, { left?: string; right?: string }> = {};
  if (!fields.length) return { list: "أضف زوجًا واحدًا على الأقل بعنصر وإجابته.", pairs };
  // The editor lists matchingPairs(node) — the same order as node.fields (one pair per field).
  matchingPairs(node).forEach((p, i) => {
    const left = String(p.left ?? "").trim(), right = String(p.right ?? "").trim();
    if (left === "" || right === "") pairs[i] = { ...(left === "" ? { left: "اكتب العنصر." } : {}), ...(right === "" ? { right: "اكتب الإجابة الصحيحة لهذا العنصر." } : {}) };
  });
  return { pairs };
}

/** Numeric response — the canonical numericResponse validator itself, mapped to the editor's fields. */
export type NumericField = "mode" | "expected" | "tolerance" | "min" | "max" | "unit";
export function numericFieldIssues(node: QuestionBody): Partial<Record<NumericField, string>> {
  const out: Partial<Record<NumericField, string>> = {};
  for (const i of validateQuestionTypeNode(node, "numericResponse", node.questionTypeVersion)) {
    if (i.severity !== "error") continue;
    if (i.code === "NUM_INVALID_EXPECTED") out.expected = i.message;
    else if (i.code === "NUM_INVALID_TOLERANCE") out.tolerance = i.message;
    else if (i.code === "NUM_INVALID_RANGE") { const a = node.answer as { min?: unknown; max?: unknown } | undefined; if (!Number.isFinite(a?.min)) out.min = i.message; if (!Number.isFinite(a?.max)) out.max = i.message; if (!out.min && !out.max) out.min = i.message; }
    else if (i.code === "NUM_RANGE_REVERSED") out.max = i.message;
    else if (i.code === "NUM_UNIT_REQUIRED_WITHOUT_UNIT") out.unit = i.message;
    else if (i.code === "NUM_INVALID_MODE") out.mode = i.message;
  }
  return out;
}
