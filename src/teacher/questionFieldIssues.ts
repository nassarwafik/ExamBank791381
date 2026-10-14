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

// K3 (A-F6) — the canonical rule code behind each field-level message below. A Field frame that shows one of these messages carries
// its code (Field `issueCode` → data-issue-codes), so the builder's issue summary focuses the field that shows the issue the teacher
// clicked. It is the label of the SAME mapping (one entry per message key), never a second rule; the K3 builder test pins that every
// code a frame carries is one of its question's canonical issues.
export const HEADER_FIELD_CODES = { text: "EMPTY_TEXT", marks: "MARKS_PROBLEM" } as const;
export const MULTIPLE_CHOICE_FIELD_CODES = { options: "MISSING_OPTIONS", answer: "MISSING_ANSWER" } as const;
export const MATCHING_FIELD_CODES = { list: "MISSING_FIELDS", pair: "MATCH_INCOMPLETE_PAIR" } as const;
/** The codes behind the messages a frame shows together (e.g. the multiple-choice group), space-separated; "" when none. */
export function fieldIssueCodes<K extends string>(issues: Partial<Record<K, string>>, codes: Readonly<Record<K, string>>): string {
  return (Object.keys(codes) as K[]).filter(k => issues[k]).map(k => codes[k]).join(" ");
}

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

/** Legacy matching — mirrors MISSING_FIELDS and MATCH_INCOMPLETE_PAIR (per pair, by its position in the editor's list).
 *  RF2-1 — `nth` names WHICH MATCH_INCOMPLETE_PAIR a pair shows: the canonical rule emits one per incomplete pair, in pair order,
 *  so the n-th incomplete pair of this loop is the question's n-th MATCH_INCOMPLETE_PAIR (its frames carry it: Field `issueNth`). */
export function matchingFieldIssues(node: QuestionBody): { list?: string; pairs: Record<number, { left?: string; right?: string; nth: number }> } {
  const fields = node.fields || [];
  const pairs: Record<number, { left?: string; right?: string; nth: number }> = {};
  if (!fields.length) return { list: "أضف زوجًا واحدًا على الأقل بعنصر وإجابته.", pairs };
  // The editor lists matchingPairs(node) — the same order as node.fields (one pair per field).
  let nth = 0;
  matchingPairs(node).forEach((p, i) => {
    const left = String(p.left ?? "").trim(), right = String(p.right ?? "").trim();
    if (left === "" || right === "") pairs[i] = { ...(left === "" ? { left: "اكتب العنصر." } : {}), ...(right === "" ? { right: "اكتب الإجابة الصحيحة لهذا العنصر." } : {}), nth: ++nth };
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

/** K3 (A-F6) — per numeric field, the code of the validator issue whose message that field shows (read back from the same
 *  validator run; the mapping above stays the only field rule). */
export function numericFieldCodes(node: QuestionBody, issues: Partial<Record<NumericField, string>> = numericFieldIssues(node)): Partial<Record<NumericField, string>> {
  const codeOf = new Map<string, string>();
  for (const i of validateQuestionTypeNode(node, "numericResponse", node.questionTypeVersion)) if (i.severity === "error" && !codeOf.has(i.message)) codeOf.set(i.message, i.code);
  const out: Partial<Record<NumericField, string>> = {};
  for (const [field, message] of Object.entries(issues) as [NumericField, string][]) { const code = codeOf.get(message); if (code) out[field] = code; }
  return out;
}
