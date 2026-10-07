// Phase 16A — legacy import aliases + presentation vocabulary of the Question Type Catalog (pure; compiled into the shared
// build; used by structured import, the Blueprint / palette / inspector chrome and the server grading registry — deliberately
// NOT by the student runtime, so the student initial graph carries only the catalog identities).
import { resolveQuestionTypeKey, isKnownQuestionType, questionTypeDefinition, type QuestionTypeCategory, type GradingMode } from "./questionTypeCatalog";
import { parseTable } from "./legacyTableSemantics";

export const CATEGORY_LABELS: Readonly<Record<QuestionTypeCategory, string>> = Object.freeze({ choice: "اختيار", response: "إجابات", structured: "منظّم", interactive: "تفاعلي", composite: "مركّب" });
export const CATEGORY_ORDER: readonly QuestionTypeCategory[] = Object.freeze(["choice", "response", "structured", "interactive", "composite"]);
export const GRADING_MODE_LABELS: Readonly<Record<GradingMode, string>> = Object.freeze({ auto: "تصحيح تلقائي", manual: "تصحيح يدوي", hybrid: "تصحيح هجين", composed: "تصحيح مركّب" });

/** Legacy import aliases (harmless spellings normalized explicitly, never a silent guess). Case-insensitive keys. */
export const LEGACY_TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  mcq: "multipleChoice", multiplechoice: "multipleChoice",
  tf: "trueFalse", truefalse: "trueFalse",
  multitruefalse: "multiTrueFalse", multitf: "multiTrueFalse",
  open: "shortAnswer", short: "shortAnswer", shortanswer: "shortAnswer", essay: "shortAnswer",
  fillblank: "fillBlank", fill: "fillBlank",
  wordbank: "wordBank",
  matching: "matching", match: "matching",
  ordering: "ordering", order: "ordering",
  tablefill: "tableFill", table: "tableFill",
  clifill: "cliFill", cli: "cliFill",
  compound: "compound"
});
/** Canonical key for an exact key, a case-insensitive spelling OR a legacy alias; undefined when unknown. */
export function resolveQuestionTypeKeyOrAlias(raw: unknown): string | undefined {
  const direct = resolveQuestionTypeKey(raw);
  if (direct) return direct;
  if (typeof raw !== "string") return undefined;
  const alias = LEGACY_TYPE_ALIASES[raw.trim().toLowerCase()];
  return alias && isKnownQuestionType(alias) ? alias : undefined;
}

/** A markdown "| … |" table in a question's text: the ONE legacy table parse (legacyTableSemantics.parseTable) the student card draws
 *  from and the legacy table grader grades from (Phase 20G.3) — ≥ 2 pipe-delimited lines and ≥ 1 non-separator row after the header. */
function textHasTable(text: unknown): boolean {
  return typeof text === "string" && parseTable(text) !== null;
}
/** Where a legacy question is answered: "question" = the top-level card (StudentQuestionCard); "part" = a compound@1 part or a
 *  composite@1 legacy child (CompoundPartControl — radios / field set / textarea only, never a table or a word-bank sequence UI). */
export type LegacyAnswerPlacement = "question" | "part";
/**
 * Phase 20G.2 — the ONE legacy answer-kind binding: may a response of `kind` answer this question? The SERVER-OWNED question decides,
 * never the response. The type is derived exactly as the legacy renderers, the legacy grader and the 16A registry derive it:
 * `presentationType || type` (an exact catalog key or an alias). A type resolving to a MODERN catalog family answers true: its own
 * binders / graders govern it, unchanged. For a LEGACY or typeless / unknown-type question the admitted kinds are:
 *   choice   ⇐ ONLY the catalog choice family (multipleChoice / trueFalse and their aliases): no renderer ever produced it for another
 *              type, and the choice grader matches positional codes against any answer value — a forged choice must never reach it;
 *   table    ⇐ where the renderer draws a table from the question's text: a top-level question that is not a field-type question
 *              (StudentQuestionCard's isFieldType: multiTrueFalse, cliFill, tableFill with a tableHeaders / tableRows grid) whose text
 *              holds a table — never for a part / composite child (CompoundPartControl never draws one); and the catalog table kind
 *              (tableFill) wherever its text holds NO table, because the table grader then finds no rows and fails closed (no score);
 *   the other catalog `responseKinds` of the resolved type (fillBlank / wordBank: sequence + fields; ordering: sequence; …);
 *   sequence, fields ⇐ the question carries fields;
 *   sequence ⇐ the question's OWN answer key is a sequence (answer.mode "exactSequence" / "sequence": the legacy dispatch has always
 *              graded such a question with the sequence grader) — not for a choice type;
 *   text     ⇐ every question whose LITERAL type (presentationType || type, lower-cased) is not "multiplechoice" / "truefalse" — the
 *              renderers' textarea fallback; a raw stored alias ("mcq", "tf") therefore keeps its historical text answer (teacher
 *              review) instead of being silently dropped.
 * sequence / fields / text are graded by graders that credit only the keyed values (positional exact values, per-field keys, an exact
 * answer.text), so admitting them where a current renderer happens not to draw them can never score without the answer. Consumed by
 * the ingest binder (draft-answers), the legacy grader and the first-N answered selection (exam-structure, the composite grader).
 */
export function legacyAnswerKindAllowed(question: unknown, kind: unknown, placement: LegacyAnswerPlacement = "question"): boolean {
  if (typeof kind !== "string") return false;
  const q = (question && typeof question === "object" ? question : {}) as { presentationType?: unknown; type?: unknown; text?: unknown; fields?: unknown; answer?: unknown; tableHeaders?: unknown; tableRows?: unknown };
  const shown = String(q.presentationType || q.type || "");
  const literal = shown.toLowerCase();
  const key = resolveQuestionTypeKeyOrAlias(shown);
  const def = key ? questionTypeDefinition(key) : undefined;
  if (def && !def.legacy) return true;
  const kinds: readonly string[] = def ? def.responseKinds : [];
  if (kind === "table") {
    const fieldType = literal === "multitruefalse" || literal === "clifill" || (literal === "tablefill" && !!(q.tableHeaders || q.tableRows));
    const drawable = textHasTable(q.text);
    return drawable ? placement === "question" && !fieldType : kinds.includes("table");
  }
  if (kinds.includes(kind)) return true;
  if ((kind === "sequence" || kind === "fields") && Array.isArray(q.fields) && q.fields.length > 0) return true;
  if (kind === "sequence") {
    const mode = q.answer && typeof q.answer === "object" ? (q.answer as { mode?: unknown }).mode : undefined;
    return (mode === "exactSequence" || mode === "sequence") && !kinds.includes("choice");
  }
  if (kind === "text") return literal !== "multiplechoice" && literal !== "truefalse";
  return false;
}
