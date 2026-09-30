// Phase 16A — legacy import aliases + presentation vocabulary of the Question Type Catalog (pure; compiled into the shared
// build; used by structured import, the Blueprint / palette / inspector chrome and the server grading registry — deliberately
// NOT by the student runtime, so the student initial graph carries only the catalog identities).
import { resolveQuestionTypeKey, isKnownQuestionType, type QuestionTypeCategory, type GradingMode } from "./questionTypeCatalog";

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
