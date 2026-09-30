// Phase 16A — the ONE canonical Question Type Catalog (pure, React-free, compiled into the server shared build).
//
// A question type has a stable identity (`key`) and an explicit `version`; the catalog carries FACTUAL metadata only —
// label, category, grading mode, capability contract, the response kinds it emits. Capability metadata is never permission
// or security authority. Executable behaviour (authoring editor, student renderer, validator, grader) lives in CODE-OWNED
// runtime registries keyed by this identity (src/questionTypes/*, api/src/lib/question-type-graders.js); persisted exam
// data carries only `presentationType` / `type` + `questionTypeVersion` and its own configuration — never a module,
// component, path, script or renderer.
//
// The 11 legacy types keep their historical order, labels and semantics (absence of `questionTypeVersion` = V1). The
// production constant QUESTION_TYPE_CATALOG is frozen; a plugin (or a test) may ADD a code-owned type through
// registerQuestionType() at module level — exam JSON can never register anything.
export type QuestionTypeKey = string;
export type GradingMode = "auto" | "manual" | "hybrid" | "composed";
export type QuestionTypeCategory = "choice" | "response" | "structured" | "interactive" | "composite";
export type QuestionTypeCapabilities = {
  autoGrading: boolean; manualGrading: boolean; hybridGrading: boolean; partialCredit: boolean;
  compoundPart: boolean; interactive: boolean; requiresImage: boolean; offline: boolean;
};
export type QuestionTypeDefinition = {
  key: QuestionTypeKey; version: number; label: string; category: QuestionTypeCategory;
  gradingMode: GradingMode; capabilities: QuestionTypeCapabilities; responseKinds: readonly string[]; legacy: boolean;
  /** Presentation-only, optional: production entries keep them in src/questionTypes/typePresentation.ts (lazy with the palette). */
  description?: string; icon?: string;
};

// Compact production encoding (initial-graph size matters): capability FLAGS are letters — a autoGrading, m manualGrading,
// h hybridGrading, p partialCredit, c compoundPart, i interactive, r requiresImage, o offline. Every entry is version 1.
const FLAG: Record<string, keyof QuestionTypeCapabilities> = { a: "autoGrading", m: "manualGrading", h: "hybridGrading", p: "partialCredit", c: "compoundPart", i: "interactive", r: "requiresImage", o: "offline" };
const caps = (flags: string): QuestionTypeCapabilities => {
  const c: QuestionTypeCapabilities = { autoGrading: false, manualGrading: false, hybridGrading: false, partialCredit: false, compoundPart: false, interactive: false, requiresImage: false, offline: false };
  for (const ch of flags) c[FLAG[ch]] = true;
  return Object.freeze(c);
};
const def = (d: QuestionTypeDefinition): QuestionTypeDefinition => Object.freeze({ ...d, responseKinds: Object.freeze([...d.responseKinds]) });
const row = (key: string, label: string, category: QuestionTypeCategory, gradingMode: GradingMode, flags: string, responseKinds: string[], legacy = false): QuestionTypeDefinition =>
  def({ key, version: 1, label, category, gradingMode, capabilities: caps(flags), responseKinds, legacy });

export const LEGACY_QUESTION_TYPE_KEYS: readonly string[] = Object.freeze(["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"]);

/** Production catalog: legacy 11 (historical order) then the Wave 1 enterprise types. Frozen. */
export const QUESTION_TYPE_CATALOG: readonly QuestionTypeDefinition[] = Object.freeze([
  row("multipleChoice", "اختيار من متعدد", "choice", "auto", "aco", ["choice"], true),
  row("trueFalse", "صح أو خطأ", "choice", "auto", "aco", ["choice"], true),
  row("multiTrueFalse", "صح/خطأ متعدد", "choice", "auto", "acop", ["fields"], true),
  row("shortAnswer", "إجابة قصيرة / مفتوحة", "response", "hybrid", "amhco", ["text"], true),
  row("fillBlank", "إكمال فراغات", "response", "auto", "acop", ["sequence", "fields"], true),
  row("wordBank", "مخزن كلمات", "response", "auto", "acop", ["sequence", "fields"], true),
  row("matching", "مطابقة", "structured", "auto", "acop", ["fields"], true),
  row("ordering", "ترتيب", "structured", "auto", "acop", ["sequence"], true),
  row("tableFill", "إكمال جدول", "structured", "auto", "acop", ["fields", "table"], true),
  row("cliFill", "أوامر CLI", "response", "auto", "acop", ["fields"], true),
  row("compound", "سؤال مركّب", "composite", "composed", "amhpo", ["compound"], true),
  row("multipleSelect", "اختيار متعدد الإجابات", "choice", "auto", "acop", ["multiChoice"]),
  row("numericResponse", "إجابة رقمية", "response", "auto", "aco", ["numeric"]),
  row("matrix", "مصفوفة / شبكة اختيارات", "structured", "auto", "acop", ["fields"]),
  row("categorization", "تصنيف العناصر", "structured", "auto", "acop", ["fields"])
]);

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,63}$/;
const registry = new Map<string, QuestionTypeDefinition>(QUESTION_TYPE_CATALOG.map(d => [d.key, d]));
const productionKeys = new Set(QUESTION_TYPE_CATALOG.map(d => d.key));

/** Registers a CODE-OWNED type (plugin / test). Refuses duplicates, production keys and malformed keys. Returns the unregister function. */
export function registerQuestionType(definition: QuestionTypeDefinition): () => void {
  if (!definition || typeof definition !== "object") throw new Error("question type definition required");
  const key = definition.key;
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw new Error("invalid question type key");
  if (registry.has(key)) throw new Error("question type already registered: " + key);
  if (!Number.isInteger(definition.version) || definition.version < 1) throw new Error("invalid question type version");
  if (!["choice", "response", "structured", "interactive", "composite"].includes(definition.category)) throw new Error("invalid question type category");
  if (!["auto", "manual", "hybrid", "composed"].includes(definition.gradingMode)) throw new Error("invalid grading mode");
  registry.set(key, def({ ...definition, legacy: false }));
  return () => { if (!productionKeys.has(key)) registry.delete(key); };
}

export const questionTypeDefinition = (key: unknown): QuestionTypeDefinition | undefined => (typeof key === "string" ? registry.get(key) : undefined);
export const isKnownQuestionType = (key: unknown): boolean => typeof key === "string" && registry.has(key);
/** Production catalog + registered plugin types, in registration order (legacy first). */
export const listQuestionTypes = (): readonly QuestionTypeDefinition[] => [...registry.values()];
export const compoundPartTypeKeys = (): string[] => listQuestionTypes().filter(d => d.capabilities.compoundPart).map(d => d.key);
export const currentQuestionTypeVersion = (key: unknown): number => questionTypeDefinition(key)?.version ?? 0;
/** Absence means the canonical V1 behaviour of a known type; otherwise an integer 1..current. Unknown types support nothing. */
export function supportsQuestionTypeVersion(key: unknown, version: unknown): boolean {
  const d = questionTypeDefinition(key);
  if (!d) return false;
  if (version === undefined) return true;
  return Number.isInteger(version) && (version as number) >= 1 && (version as number) <= d.version;
}
/** Canonical key for an exact key or a case-insensitive spelling; undefined when unknown. Legacy import aliases (mcq, tf,
 *  open, …) are resolved by questionTypeAliases.ts (import / server), which is not part of the student initial graph. */
export function resolveQuestionTypeKey(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  if (registry.has(s)) return s;
  const lower = s.toLowerCase();
  for (const k of registry.keys()) if (k.toLowerCase() === lower) return k;
  return undefined;
}
export const questionTypeLabel = (key: unknown): string | undefined => questionTypeDefinition(resolveQuestionTypeKey(key))?.label;
