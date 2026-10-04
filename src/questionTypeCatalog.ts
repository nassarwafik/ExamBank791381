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
// h hybridGrading, p partialCredit, c compoundPart, i interactive, r requiresImage, o offline. Every entry is version 1 unless
// PRODUCTION_VERSIONS names a later CURRENT version (the family then ships every version 1..N — see registerQuestionTypePlugin).
const FLAG: Record<string, keyof QuestionTypeCapabilities> = { a: "autoGrading", m: "manualGrading", h: "hybridGrading", p: "partialCredit", c: "compoundPart", i: "interactive", r: "requiresImage", o: "offline" };
const caps = (flags: string): QuestionTypeCapabilities => {
  const c: QuestionTypeCapabilities = { autoGrading: false, manualGrading: false, hybridGrading: false, partialCredit: false, compoundPart: false, interactive: false, requiresImage: false, offline: false };
  for (const ch of flags) c[FLAG[ch]] = true;
  return Object.freeze(c);
};
const def = (d: QuestionTypeDefinition): QuestionTypeDefinition => Object.freeze({ ...d, responseKinds: Object.freeze([...d.responseKinds]) });
const row = (key: string, label: string, category: QuestionTypeCategory, gradingMode: GradingMode, flags: string, responseKinds: string[], legacy = false, version = 1): QuestionTypeDefinition =>
  def({ key, version, label, category, gradingMode, capabilities: caps(flags), responseKinds, legacy });
/** Phase 17F-C2 (Review Fix 1) — the CURRENT version of a production type whose contract was versioned. coding@2 adds the
 *  teacher-owned compile-error policy (`answer.compileErrorPolicy`, explicit "zero" | "manualReview"); coding@1 remains the
 *  historical contract (a compile error is an automatic 0) and stored coding@1 questions are never reinterpreted. A pre-C2
 *  server knows coding@1 only, so it refuses coding@2 (fail closed) instead of grading it under the old contract. */
const PRODUCTION_VERSIONS: Readonly<Record<string, number>> = Object.freeze({ coding: 2 });

export const LEGACY_QUESTION_TYPE_KEYS: readonly string[] = Object.freeze(["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"]);

/** Production rows — `as const` so TypeScript keeps the literal keys: the production key UNION derives from here (R2-D),
 *  never from a second hand-written list. Legacy 11 (historical order) then the Wave 1 enterprise types. */
const PRODUCTION_ROWS = [
  ["multipleChoice", "اختيار من متعدد", "choice", "auto", "aco", ["choice"], true],
  ["trueFalse", "صح أو خطأ", "choice", "auto", "aco", ["choice"], true],
  ["multiTrueFalse", "صح/خطأ متعدد", "choice", "auto", "acop", ["fields"], true],
  ["shortAnswer", "إجابة قصيرة / مفتوحة", "response", "hybrid", "amhco", ["text"], true],
  ["fillBlank", "إكمال فراغات", "response", "auto", "acop", ["sequence", "fields"], true],
  ["wordBank", "مخزن كلمات", "response", "auto", "acop", ["sequence", "fields"], true],
  ["matching", "مطابقة", "structured", "auto", "acop", ["fields"], true],
  ["ordering", "ترتيب", "structured", "auto", "acop", ["sequence"], true],
  ["tableFill", "إكمال جدول", "structured", "auto", "acop", ["fields", "table"], true],
  ["cliFill", "أوامر CLI", "response", "auto", "acop", ["fields"], true],
  ["compound", "سؤال مركّب", "composite", "composed", "amhpo", ["compound"], true],
  ["multipleSelect", "اختيار متعدد الإجابات", "choice", "auto", "acop", ["multiChoice"], false],
  ["numericResponse", "إجابة رقمية", "response", "auto", "aco", ["numeric"], false],
  ["matrix", "مصفوفة / شبكة اختيارات", "structured", "auto", "acop", ["fields"], false],
  ["categorization", "تصنيف العناصر", "structured", "auto", "acop", ["fields"], false],
  // Phase 16B-A — ONE universal interactive type: a sandboxed, teacher-uploaded simulation package (simulation@1). Manual-review
  // only in 16B-A (uploaded code never grades); not a compound part (V1 decision, documented); interactive; offline-capable.
  ["simulation", "محاكاة تفاعلية", "interactive", "manual", "mio", ["simulation"], false],
  // Phase 17A — ONE generic coding type (coding@1): the student writes ONE source file in a teacher-allowed language (language
  // is data, never a type). Designed hybrid; in 17A the official grade is MANUAL (no trusted executor yet, autoGrading false).
  // Phase 17F-C2 RF1 — CURRENT version 2 (PRODUCTION_VERSIONS): coding@2 = coding@1 + the explicit compile-error policy.
  ["coding", "برمجة / كتابة كود", "interactive", "hybrid", "mhpio", ["code"], false],
  // Phase 18C — the first network-device CLI simulator plugin (networkCli@1): a deterministic educational managed SWITCH. Auto-graded
  // on canonical device STATE (per-check partial credit) by the shared engine; interactive; offline; not a compound part (V1 decision:
  // one terminal per question keeps the session, replay and review unambiguous).
  ["networkCli", "محاكي أوامر الشبكة (CLI)", "interactive", "auto", "apio", ["networkCli"], false],
  // Phase 19A — inline completion passage (inlineCloze@1): text + inline text blanks / dropdowns in any order; auto-graded per blank
  // (partial credit); the student answer is the existing `fields` Answer (blank id → value); not a compound part (V1 decision).
  ["inlineCloze", "إكمال نص تفاعلي", "response", "auto", "apo", ["fields"], false]
] as const;
/** The production type identity as a TypeScript union — ONE source of truth with the runtime catalog. Registered plugin
 *  keys widen to `string` at the extension seams (they are runtime data, not compile-time identity). */
export type ProductionQuestionTypeKey = (typeof PRODUCTION_ROWS)[number][0];

/** Production catalog: frozen definitions built from PRODUCTION_ROWS. */
export const QUESTION_TYPE_CATALOG: readonly QuestionTypeDefinition[] = Object.freeze(PRODUCTION_ROWS.map(r => row(r[0], r[1], r[2], r[3], r[4], [...r[5]], r[6], PRODUCTION_VERSIONS[r[0]] ?? 1)));

/** Runtime identity of ONE implementation: a type key AND a version. Persisted data carries `presentationType` / `type` +
 *  `questionTypeVersion` (absence = V1); every runtime registry resolves by BOTH. */
export type QuestionTypeIdentity = { key: string; version: number };
export const questionTypeIdentityKey = (key: string, version: number): string => key + "@" + version;

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
/** THE version-normalization authority (Review Fix 1 / R1). Known type + absent stored version → canonical V1 (legacy data is
 *  never bulk-rewritten); an explicit positive integer within 1..current → itself; anything else (unknown key, 0, negative,
 *  fraction, string, above current) → undefined = FAIL CLOSED. Never coerces 2 into 1, never upgrades V1 to current. */
export function effectiveQuestionTypeVersion(key: unknown, storedVersion: unknown): number | undefined {
  const d = questionTypeDefinition(key);
  if (!d) return undefined;
  if (storedVersion === undefined) return 1;
  if (typeof storedVersion !== "number" || !Number.isInteger(storedVersion) || storedVersion < 1 || storedVersion > d.version) return undefined;
  return storedVersion;
}

/** A CODE-OWNED runtime registry bound to (key, version). `register` refuses a taken identity (a new version is ADDITIVE and
 *  can never replace an older implementation); `resolve` normalizes the stored version through effectiveQuestionTypeVersion
 *  and looks the EXACT identity up — no "latest" fallback, ever. */
export type VersionedRegistry<T> = {
  register(key: string, version: number, impl: T): () => void;
  resolve(rawKey: unknown, storedVersion: unknown): { key: string; version: number; impl: T } | undefined;
  has(key: string, version: number): boolean;
};
export function createVersionedRegistry<T>(what: string, options: { requireKnownType?: boolean } = {}): VersionedRegistry<T> {
  const entries = new Map<string, T>();
  return {
    register(key, version, impl) {
      if (typeof key !== "string" || !KEY_PATTERN.test(key) || !Number.isInteger(version) || version < 1 || impl == null) throw new Error("invalid " + what + " registration: " + key + "@" + version);
      const id = questionTypeIdentityKey(key, version);
      if (entries.has(id)) throw new Error(what + " already registered: " + id);
      entries.set(id, impl);
      return () => { if (entries.get(id) === impl) entries.delete(id); };
    },
    resolve(rawKey, storedVersion) {
      const key = resolveQuestionTypeKey(rawKey) ?? (typeof rawKey === "string" && !options.requireKnownType ? rawKey.trim() : undefined);
      if (!key) return undefined;
      // Known type → the catalog decides the effective version. A code-owned implementation registered for a key the catalog
      // does not (yet) know serves version 1 only (test-only graders); anything else fails closed.
      const version = isKnownQuestionType(key) ? effectiveQuestionTypeVersion(key, storedVersion) : (storedVersion === undefined || storedVersion === 1 ? 1 : undefined);
      if (version === undefined) return undefined;
      const impl = entries.get(questionTypeIdentityKey(key, version));
      return impl === undefined ? undefined : { key, version, impl };
    },
    has(key, version) { return entries.has(questionTypeIdentityKey(key, version)); }
  };
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
