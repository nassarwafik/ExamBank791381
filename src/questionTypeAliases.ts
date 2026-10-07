// Phase 16A — legacy import aliases + presentation vocabulary of the Question Type Catalog (pure; compiled into the shared
// build; used by structured import, the Blueprint / palette / inspector chrome and the server grading registry — deliberately
// NOT by the student runtime, so the student initial graph carries only the catalog identities).
import { resolveQuestionTypeKey, isKnownQuestionType, questionTypeDefinition, type QuestionTypeCategory, type GradingMode } from "./questionTypeCatalog";

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

/** A markdown "| … |" table in a question's text: exactly the detection the legacy student card (questionContent.parseTable) and the
 *  legacy table grader (assignment-grading tableRows) use — ≥ 2 pipe-delimited lines and ≥ 1 non-separator row after the header. */
function textHasTable(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(x => x.startsWith("|") && x.endsWith("|"));
  if (lines.length < 2) return false;
  return lines.slice(1).some(l => !l.slice(1, -1).split("|").every(c => /^:?-{3,}:?$/.test(c.trim().replace(/\s/g, ""))));
}
/**
 * Phase 20G.2 — the ONE legacy answer-kind binding: may a response of `kind` answer this question? The SERVER-OWNED question decides,
 * never the response. A type resolved (exact key or alias) to a MODERN catalog family answers true: its own binders / graders govern it,
 * unchanged. For a LEGACY or typeless / unknown-type question the admitted kinds are the catalog `responseKinds` of the resolved type,
 * plus the kinds the legacy renderers (StudentQuestionCard, CompoundPartControl) derive from the question's OWN content:
 *   table    ⇐ the question text contains a table;
 *   sequence, fields ⇐ the question carries fields;
 *   sequence ⇐ the question's OWN answer key is a sequence (answer.mode "exactSequence" / "sequence": the legacy dispatch has always
 *              graded such a question with the sequence grader, which only credits the keyed values in their positions) — not for a
 *              choice type;
 *   text     ⇐ the renderers show a textarea: every question whose LITERAL type (presentationType || type, lower-cased — the exact
 *              test StudentQuestionCard / CompoundPartControl and the legacy grader apply) is not "multiplechoice" / "truefalse". A
 *              raw stored alias ("mcq", "tf") therefore keeps its historical text answer (it never auto-scores: the text grader needs
 *              an exact answer.text match, otherwise teacher review) — refusing it would silently drop the only answer the client lets
 *              the student give.
 * `choice` comes ONLY from the catalog (multipleChoice / trueFalse and their aliases): no renderer ever produced it for another type,
 * and the choice grader matches positional codes against any answer value — a forged choice must never reach it. Consumed by the
 * ingest binder (draft-answers), the legacy grader and the first-N answered selection (exam-structure, the composite grader).
 */
export function legacyAnswerKindAllowed(question: unknown, kind: unknown): boolean {
  if (typeof kind !== "string") return false;
  const q = (question && typeof question === "object" ? question : {}) as { presentationType?: unknown; type?: unknown; text?: unknown; fields?: unknown; answer?: unknown };
  const raw = typeof q.presentationType === "string" && q.presentationType.trim() !== "" ? q.presentationType : q.type;
  const key = resolveQuestionTypeKeyOrAlias(raw);
  const def = key ? questionTypeDefinition(key) : undefined;
  if (def && !def.legacy) return true;
  const kinds: readonly string[] = def ? def.responseKinds : [];
  if (kinds.includes(kind)) return true;
  if (kind === "table") return textHasTable(q.text);
  if ((kind === "sequence" || kind === "fields") && Array.isArray(q.fields) && q.fields.length > 0) return true;
  if (kind === "sequence") {
    const mode = q.answer && typeof q.answer === "object" ? (q.answer as { mode?: unknown }).mode : undefined;
    return (mode === "exactSequence" || mode === "sequence") && !kinds.includes("choice");
  }
  if (kind === "text") {
    const shown = String(q.presentationType || q.type || "").toLowerCase();
    return shown !== "multiplechoice" && shown !== "truefalse";
  }
  return false;
}
