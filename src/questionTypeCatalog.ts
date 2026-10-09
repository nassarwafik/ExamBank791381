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

// Compact production capability bitset (initial-graph size matters):
// 1 auto · 2 manual · 4 hybrid · 8 partial · 16 compound · 32 interactive · 64 image · 128 offline.
const caps = (f: number): QuestionTypeCapabilities => Object.freeze({
  autoGrading: !!(f&1), manualGrading: !!(f&2), hybridGrading: !!(f&4), partialCredit: !!(f&8),
  compoundPart: !!(f&16), interactive: !!(f&32), requiresImage: !!(f&64), offline: !!(f&128)
});
const row = (key: string, label: string, category: QuestionTypeCategory, gradingMode: GradingMode, flags: number, responseKinds: readonly string[], legacy = false, version = 1): QuestionTypeDefinition =>
  Object.freeze({ key, version, label, category, gradingMode, capabilities: caps(flags), responseKinds: Object.freeze([...responseKinds]), legacy });
/** Phase 17F-C2 (Review Fix 1) — the CURRENT version of a production type whose contract was versioned. coding@2 adds the
 *  teacher-owned compile-error policy (`answer.compileErrorPolicy`, explicit "zero" | "manualReview"); coding@1 remains the
 *  historical contract (a compile error is an automatic 0) and stored coding@1 questions are never reinterpreted. A pre-C2
 *  server knows coding@1 only, so it refuses coding@2 (fail closed) instead of grading it under the old contract. */
const PRODUCTION_VERSIONS: Readonly<Record<string, number>> = Object.freeze({ coding: 3 });
/** Phase 19F — coding@3 (the LOCKED TEMPLATE contract) is supported but is NOT the version a new question gets: it is created only by
 *  the explicit «إكمال كود بأجزاء مقفلة» preset. A newly authored coding question stays coding@2 (full source editable — write a
 *  program, fix a bug, complete code). Types without an entry are authored at their current version. */
const AUTHORING_VERSIONS: Readonly<Record<string, number>> = Object.freeze({ coding: 2 });

export const LEGACY_QUESTION_TYPE_KEYS: readonly string[] = Object.freeze(["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"]);

/** Production rows — `as const` so TypeScript keeps the literal keys: the production key UNION derives from here (R2-D),
 *  never from a second hand-written list. Legacy 11 (historical order) then the Wave 1 enterprise types. */
const PRODUCTION_ROWS = [
  ["multipleChoice", "اختيار من متعدد", "choice", "auto", 145, ["choice"], true],
  ["trueFalse", "صح أو خطأ", "choice", "auto", 145, ["choice"], true],
  ["multiTrueFalse", "صح/خطأ متعدد", "choice", "auto", 153, ["fields"], true],
  ["shortAnswer", "إجابة قصيرة / مفتوحة", "response", "hybrid", 151, ["text"], true],
  ["fillBlank", "إكمال فراغات", "response", "auto", 153, ["sequence", "fields"], true],
  ["wordBank", "مخزن كلمات", "response", "auto", 153, ["sequence", "fields"], true],
  ["matching", "مطابقة", "structured", "auto", 153, ["fields"], true],
  ["ordering", "ترتيب", "structured", "auto", 153, ["sequence"], true],
  ["tableFill", "إكمال جدول", "structured", "auto", 153, ["fields", "table"], true],
  ["cliFill", "أوامر CLI", "response", "auto", 153, ["fields"], true],
  ["compound", "سؤال مركّب", "composite", "composed", 143, ["compound"], true],
  // Phase 20D — the ADVANCED composite family (composite@1), a NEW type beside the frozen legacy compound: groups of heterogeneous modern
  // children (every Wave-1 / interactive family incl. coding, SmartSim, parametric, visual, open response), shared static sources and shared
  // SmartSim contexts, group-level firstNAnswered, per-part manual / automatic grading. Its children live under the type-owned root
  // `composite` (never `parts`, which is how legacy compound is detected); composite never nests (not a compound part, never its own child).
  ["composite", "سؤال مركّب متقدّم", "composite", "composed", 175, ["composite"], false],
  // Phase 21A.1 — chartSelection@1: the student selects SEMANTIC targets of a declarative data chart (category / series / value / point / bin,
  // single, multiple or a contiguous range); auto-graded on target keys (never pixels), partial credit optional; not a compound part. Inserted
  // right after composite (like 20D's composite after compound) so the legacy order and every append position stay unchanged.
  ["chartSelection", "اختيار من رسم بياني", "interactive", "auto", 169, ["chartSelection"], false],
  // Phase 21A.2 — functionGraphSelection@1: the student selects SEMANTIC targets of a mathematical function graph (curves, points, lines,
  // tangents, shaded regions, intervals); auto-graded on target keys (never pixels), partial credit optional; not a compound part.
  ["functionGraphSelection", "اختيار من رسم دالة", "interactive", "auto", 169, ["functionGraphSelection"], false],
  // Phase 21C — scene3DSelection@1: semantic selection on an ExamBank-owned interactive 3D scene (object / face / edge / vertex).
  ["scene3DSelection", "3D", "interactive", "auto", 169, ["scene3DSelection"], false],
  ["multipleSelect", "اختيار متعدد الإجابات", "choice", "auto", 153, ["multiChoice"], false],
  ["numericResponse", "إجابة رقمية", "response", "auto", 145, ["numeric"], false],
  ["matrix", "مصفوفة / شبكة اختيارات", "structured", "auto", 153, ["fields"], false],
  ["categorization", "تصنيف العناصر", "structured", "auto", 153, ["fields"], false],
  // Phase 16B-A — ONE universal interactive type: a sandboxed, teacher-uploaded simulation package (simulation@1). Manual-review
  // only in 16B-A (uploaded code never grades); not a compound part (V1 decision, documented); interactive; offline-capable.
  ["simulation", "محاكاة تفاعلية", "interactive", "manual", 162, ["simulation"], false],
  // Phase 17A — ONE generic coding type (coding@1): the student writes ONE source file in a teacher-allowed language (language
  // is data, never a type). Designed hybrid; in 17A the official grade is MANUAL (no trusted executor yet, autoGrading false).
  // Phase 17F-C2 RF1 — CURRENT version 2 (PRODUCTION_VERSIONS): coding@2 = coding@1 + the explicit compile-error policy.
  ["coding", "برمجة / كتابة كود", "interactive", "hybrid", 174, ["code", "codeTemplate"], false],
  // Phase 18C — the first network-device CLI simulator plugin (networkCli@1): a deterministic educational managed SWITCH. Auto-graded
  // on canonical device STATE (per-check partial credit) by the shared engine; interactive; offline; not a compound part (V1 decision:
  // one terminal per question keeps the session, replay and review unambiguous).
  ["networkCli", "محاكي أوامر الشبكة (CLI)", "interactive", "auto", 169, ["networkCli"], false],
  // Phase 19A — inline completion passage (inlineCloze@1): text + inline text blanks / dropdowns in any order; auto-graded per blank
  // (partial credit); the student answer is the existing `fields` Answer (blank id → value); not a compound part (V1 decision).
  ["inlineCloze", "إكمال نص تفاعلي", "response", "auto", 137, ["fields"], false],
  // Phase 19B — deterministic parametric numeric question (parametricNumeric@1): bounded integer variables generated per official
  // attempt from a server-owned identity, an {{id}} stem template and a private answer expression in a closed language; auto-graded
  // with the numericResponse comparison (no partial credit); the student answer is the existing `numeric` Answer; not a compound part.
  ["parametricNumeric", "سؤال رقمي بمعطيات متغيرة", "response", "auto", 129, ["numeric"], false],
  // Phase 19D — the visual foundation: ONE shared normalized geometry engine, two families on the question's canonical image. hotspot@1:
  // the student marks points (private target regions, one-to-one matching); labelDiagram@1: the student places bank labels on public
  // zones (the existing `fields` Answer). Auto-graded with partial credit; image-requiring; not compound parts (V1 decision).
  ["hotspot", "تحديد منطقة على صورة", "interactive", "auto", 233, ["hotspot"], false],
  ["labelDiagram", "تسمية أجزاء الرسم", "interactive", "auto", 233, ["fields"], false],
  // Phase 19E — ONE open-response family (openResponse@1) for essay / explain / justify / compare / analyze / source-based answers
  // (profiles, never types): plain-text answer (the existing `text` Answer), MANUAL grading with a teacher rubric — the server computes
  // the official score from the published rubric; partial credit through rubric levels; not a compound part (V1 decision).
  ["openResponse", "إجابة مفتوحة مع سلم تقييم", "response", "manual", 138, ["text"], false],
  // Phase 20A — ONE trusted, repository-owned simulation family (smartSim@1), distinct from the untrusted uploaded simulation@1: the stored
  // question names a code-registered plugin by EXACT identity (pluginKey@pluginVersion — networkTopology@1 first) and its public config;
  // the server replays the student's semantic actions and grades private weighted checks on the derived state (partial credit).
  // Interactive; offline; not a compound part (V1 decision: one workspace per question keeps replay and review unambiguous).
  ["smartSim", "محاكاة موثوقة (SmartSim)", "interactive", "auto", 169, ["smartSim"], false]
] as const;
/** The production type identity as a TypeScript union — ONE source of truth with the runtime catalog. Registered plugin
 *  keys widen to `string` at the extension seams (they are runtime data, not compile-time identity). */
export type ProductionQuestionTypeKey = (typeof PRODUCTION_ROWS)[number][0];

/** Production catalog: frozen definitions built from PRODUCTION_ROWS. */
export const QUESTION_TYPE_CATALOG: readonly QuestionTypeDefinition[] = Object.freeze(PRODUCTION_ROWS.map(r => row(r[0], r[1], r[2], r[3], r[4], r[5], r[6], PRODUCTION_VERSIONS[r[0]] ?? 1)));

/** Runtime identity of ONE implementation: a type key AND a version. Persisted data carries `presentationType` / `type` +
 *  `questionTypeVersion` (absence = V1); every runtime registry resolves by BOTH. */
export type QuestionTypeIdentity = { key: string; version: number };
export const questionTypeIdentityKey = (key: string, version: number): string => key + "@" + version;

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,63}$/;
const registry = new Map<string, QuestionTypeDefinition>(QUESTION_TYPE_CATALOG.map(d => [d.key, d]));
const productionKeys = new Set(QUESTION_TYPE_CATALOG.map(d => d.key));

/** Registers a CODE-OWNED type (plugin / test). Refuses duplicates, production keys and malformed keys. Returns the unregister function. */
export function registerQuestionType(definition: QuestionTypeDefinition): () => void {
  if (!definition || typeof definition !== "object") throw new Error("question type required");
  const key = definition.key;
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) throw new Error("invalid type key");
  if (registry.has(key)) throw new Error("duplicate type: " + key);
  if (!Number.isInteger(definition.version) || definition.version < 1) throw new Error("invalid type version");
  if (!["choice", "response", "structured", "interactive", "composite"].includes(definition.category)) throw new Error("invalid type category");
  if (!["auto", "manual", "hybrid", "composed"].includes(definition.gradingMode)) throw new Error("invalid grading mode");
  registry.set(key, Object.freeze({ ...definition, responseKinds: Object.freeze([...definition.responseKinds]), legacy: false }));
  return () => { if (!productionKeys.has(key)) registry.delete(key); };
}

export const questionTypeDefinition = (key: unknown): QuestionTypeDefinition | undefined => (typeof key === "string" ? registry.get(key) : undefined);
export const isKnownQuestionType = (key: unknown): boolean => typeof key === "string" && registry.has(key);
/** Production catalog + registered plugin types, in registration order (legacy first). */
export const listQuestionTypes = (): readonly QuestionTypeDefinition[] => [...registry.values()];
export const compoundPartTypeKeys = (): string[] => listQuestionTypes().filter(d => d.capabilities.compoundPart).map(d => d.key);
export const currentQuestionTypeVersion = (key: unknown): number => questionTypeDefinition(key)?.version ?? 0;
/** The version a NEW question of this type is created at (Phase 19F): the explicit authoring version when one is declared, else the
 *  current version; never above the current version. */
export const authoringQuestionTypeVersion = (key: unknown): number => { const d = questionTypeDefinition(key); if (!d) return 0; const a = AUTHORING_VERSIONS[d.key]; return a !== undefined && a >= 1 && a <= d.version ? a : d.version; };
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
