// Phase 17A — the Coding Question model (coding@1). Pure (no React, no DOM, no I/O): compiled into the shared server build so
// the Builder, finalization, the student sanitizer and the draft pipeline apply the SAME contract.
//
// Two identities are deliberately distinct and never confused:
//   • the question TYPE `coding@1` (catalog key + questionTypeVersion) versions SmartAssess behaviour;
//   • the programming LANGUAGE (`language` key + language CONTRACT `version`) describes what the student writes.
// Runtime / toolchain versions (an interpreter or compiler release) are NOT promised here: they belong to the execution
// provider's capability response (Phase 17B). Language is configuration / data, never a separate question type.
//
// Public vs private: everything a student may see lives under `question.coding` (allowed languages, default, starter code,
// public sample tests, limits); every correctness / evaluation truth (hidden tests, comparator, reference solutions) lives
// under `question.answer`, which the student sanitizer always removes.

export type CodingLanguageCapabilities = { compile: boolean; run: boolean; stdin: boolean; tests: boolean };
/** A language CONTRACT (not a runtime): `capabilities` say what the stdin/stdout program model can mean for this language —
 *  whether an execution provider actually offers it is a separate, provider-reported fact. */
export type CodingLanguageDefinition = { key: string; version: number; label: string; extension: string; editorLanguage: string; indentUnit: string; capabilities: CodingLanguageCapabilities };

const lang = (key: string, label: string, extension: string, indentUnit: string, flags: string): CodingLanguageDefinition =>
  Object.freeze({ key, version: 1, label, extension, editorLanguage: key, indentUnit, capabilities: Object.freeze({ compile: flags.includes("c"), run: flags.includes("r"), stdin: flags.includes("r"), tests: flags.includes("r") }) });
/** Coding Assessment V1 intentionally supports exactly Python, Java and C# (stable order). No JavaScript, TypeScript, C++ or
 *  SQL in V1: an unregistered key fails closed everywhere (finalization, student projection, server answer ingestion). The
 *  registry stays data-driven so a language can be ADDED later through a reviewed change — never by branching on a key. */
export const CODING_LANGUAGES: readonly CodingLanguageDefinition[] = Object.freeze([
  lang("python", "Python", ".py", "    ", "r"),
  lang("java", "Java", ".java", "    ", "cr"),
  lang("csharp", "C#", ".cs", "    ", "cr")
]);
const LANGUAGE_INDEX = new Map(CODING_LANGUAGES.map(l => [l.key, l]));
export const codingLanguage = (key: unknown): CodingLanguageDefinition | undefined => (typeof key === "string" ? LANGUAGE_INDEX.get(key) : undefined);
export const isCodingLanguage = (key: unknown): boolean => codingLanguage(key) !== undefined;
export const CODING_LANGUAGE_KEY_PATTERN = /^[a-z][a-z0-9]{0,31}$/;

export type CodingLimits = { sourceBytes: number; outputBytes: number; timeMs: number; memoryMb: number };
/** Bounded ranges for every resource a future runner request may ask for. A teacher can never request unlimited resources. */
export const CODING_LIMIT_RANGES: Readonly<Record<keyof CodingLimits, readonly [number, number]>> = Object.freeze({ sourceBytes: [1024, 65536], outputBytes: [1024, 262144], timeMs: [250, 10000], memoryMb: [16, 512] });
export const DEFAULT_CODING_LIMITS: Readonly<CodingLimits> = Object.freeze({ sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 });
/** The absolute ceiling of a stored source (UTF-8 bytes) — enforced by the client editor AND by the server on every ingest. */
export const CODE_SOURCE_MAX_BYTES = 65536;
export const CODING_TEST_LIMITS = Object.freeze({ publicTests: 10, hiddenTests: 50, ioBytes: 16384, totalBytes: 262144 });
export const CODING_TEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type CodingComparator = "exact" | "trimTrailingWhitespace" | "normalizeWhitespace";
export const CODING_COMPARATORS: readonly CodingComparator[] = Object.freeze(["exact", "trimTrailingWhitespace", "normalizeWhitespace"]);
export const DEFAULT_CODING_COMPARATOR: CodingComparator = "trimTrailingWhitespace";

/** A student-visible example. `sampleOutput` (not "expected…": that family is secret under the canonical key policy). */
export type CodingTestCasePublic = { id: string; title?: string; input: string; sampleOutput?: string };
/** A teacher-private grading case (stored under `answer.hiddenTests`). */
export type CodingTestCasePrivate = { id: string; title?: string; input: string; expectedOutput: string; weight: number };
export type CodingQuestionConfigV1 = {
  allowedLanguages: string[]; defaultLanguage: string; starterCode?: Record<string, string>;
  taskMode: "program"; inputMode: "stdin"; outputMode: "stdout"; limits: CodingLimits; publicTests?: CodingTestCasePublic[];
};
/** Phase 17C — the OFFICIAL grading mode (teacher-private, under `answer`). Missing / unknown → "manual" (the Phase 17A behaviour:
 *  score 0, manual review); "hiddenTests" → the SmartAssess server grades the stored submission against the hidden tests through
 *  the isolated Coding Runner. Existing 17A questions with hidden tests are NEVER silently switched to automatic grading. */
export type CodingGradingMode = "manual" | "hiddenTests";
export const CODING_GRADING_MODES: readonly CodingGradingMode[] = Object.freeze(["manual", "hiddenTests"]);
export type CodingAnswerKeyV1 = { hiddenTests?: CodingTestCasePrivate[]; comparator?: CodingComparator; referenceSolutions?: Record<string, string>; gradingMode?: CodingGradingMode };
/** The effective official grading mode of an answer key: "hiddenTests" only when explicitly stored as such. */
export const codingGradingMode = (answerKey: unknown): CodingGradingMode => (!!answerKey && typeof answerKey === "object" && !Array.isArray(answerKey) && (answerKey as Record<string, unknown>).gradingMode === "hiddenTests" ? "hiddenTests" : "manual");
export type CodeAnswer = { kind: "code"; language: string; languageVersion: number; source: string };

export const defaultCodingConfig = (): CodingQuestionConfigV1 => ({ allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { ...DEFAULT_CODING_LIMITS }, publicTests: [] });
export const defaultCodingAnswerKey = (): Required<CodingAnswerKeyV1> => ({ hiddenTests: [], comparator: DEFAULT_CODING_COMPARATOR, referenceSolutions: {}, gradingMode: "manual" });

/** UTF-8 byte length without TextEncoder (pure; same result in the browser and the server). */
export function utf8ByteLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Server / client ingest of a `code` answer. Keeps EXACTLY {kind, language, languageVersion, source} — the source is TEXT and
 *  is never trimmed, re-indented or re-encoded; anything a client adds (score, passed, testsPassed, stdout…) is dropped. */
export function normalizeCodeAnswer(a: unknown): { ok: true; answer: CodeAnswer } | { ok: false; code: string } {
  if (!isObj(a) || a.kind !== "code" || typeof a.source !== "string" || typeof a.language !== "string" || !CODING_LANGUAGE_KEY_PATTERN.test(a.language)) return { ok: false, code: "CODE_ANSWER_INVALID" };
  if (typeof a.languageVersion !== "number" || !Number.isInteger(a.languageVersion) || a.languageVersion < 1 || a.languageVersion > 1000) return { ok: false, code: "CODE_ANSWER_INVALID" };
  // Server-authoritative registry binding: a regex-valid key is not enough — only a REGISTERED language at its exact contract
  // version is a valid code answer (V1: python@1, java@1, csharp@1).
  const def = codingLanguage(a.language);
  if (!def || a.languageVersion !== def.version) return { ok: false, code: "CODE_ANSWER_INVALID" };
  if (utf8ByteLength(a.source) > CODE_SOURCE_MAX_BYTES) return { ok: false, code: "CODE_SOURCE_TOO_LARGE" };
  return { ok: true, answer: { kind: "code", language: a.language, languageVersion: a.languageVersion, source: a.source } };
}

const PUBLIC_KEYS = new Set(["allowedLanguages", "defaultLanguage", "starterCode", "taskMode", "inputMode", "outputMode", "limits", "publicTests"]);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
/** The ONLY student projection of a coding config: an allow-list rebuilt field by field (never a copy-and-delete), so a
 *  private value smuggled into the public object (hidden tests, reference solutions, weights, notes, tokens) never reaches a
 *  student. Returns undefined for anything that is not an object (fail closed). */
export function projectCodingConfigForStudent(cfg: unknown): CodingQuestionConfigV1 | undefined {
  if (!isObj(cfg)) return undefined;
  const out: Record<string, unknown> = {};
  if (Array.isArray(cfg.allowedLanguages)) out.allowedLanguages = cfg.allowedLanguages.filter(l => typeof l === "string" && isCodingLanguage(l));
  if (typeof cfg.defaultLanguage === "string") out.defaultLanguage = cfg.defaultLanguage;
  if (isObj(cfg.starterCode)) { const sc: Record<string, string> = {}; for (const k of Object.keys(cfg.starterCode)) { const v = cfg.starterCode[k]; if (typeof v === "string" && isCodingLanguage(k)) sc[k] = v; } out.starterCode = sc; }
  for (const k of ["taskMode", "inputMode", "outputMode"]) if (typeof cfg[k] === "string") out[k] = cfg[k];
  if (isObj(cfg.limits)) { const l: Record<string, number> = {}; for (const k of Object.keys(CODING_LIMIT_RANGES)) { const v = cfg.limits[k]; if (typeof v === "number" && Number.isFinite(v)) l[k] = v; } out.limits = l; }
  if (Array.isArray(cfg.publicTests)) out.publicTests = cfg.publicTests.filter(isObj).map(t => { const p: Record<string, string> = {}; for (const k of ["id", "title", "input", "sampleOutput"]) { const v = str(t[k]); if (v !== undefined) p[k] = v; } return p; });
  return out as CodingQuestionConfigV1;
}

/** Independent Review Fix — binds a `code` answer to the AUTHORITATIVE published question it claims to answer (the server
 *  passes the assignment's exam snapshot, the same one the grader uses). Accepted only when the question is coding@1, the
 *  answer's language is one of THAT question's allowed (registered) languages, and the source fits THAT question's
 *  limits.sourceBytes (never above CODE_SOURCE_MAX_BYTES). Returns the canonical answer or a precise refusal code. */
export function bindCodeAnswerToQuestion(a: unknown, question: unknown): { ok: true; answer: CodeAnswer } | { ok: false; code: string } {
  const base = normalizeCodeAnswer(a);
  if (!base.ok) return base;
  if (!isObj(question) || String(question.presentationType ?? question.type ?? "") !== "coding" || (question.questionTypeVersion !== undefined && question.questionTypeVersion !== 1)) return { ok: false, code: "CODE_QUESTION_MISMATCH" };
  const cfg = projectCodingConfigForStudent(question.coding);
  if (!cfg || !Array.isArray(cfg.allowedLanguages) || !cfg.allowedLanguages.includes(base.answer.language)) return { ok: false, code: "CODE_LANGUAGE_NOT_ALLOWED" };
  const configured = cfg.limits && typeof cfg.limits.sourceBytes === "number" && Number.isInteger(cfg.limits.sourceBytes) && cfg.limits.sourceBytes > 0 ? cfg.limits.sourceBytes : CODE_SOURCE_MAX_BYTES;
  if (utf8ByteLength(base.answer.source) > Math.min(configured, CODE_SOURCE_MAX_BYTES)) return { ok: false, code: "CODE_SOURCE_TOO_LARGE" };
  return base;
}

export type CodingIssue = { code: string; message: string; severity: "error"; path?: string };
const err = (code: string, message: string, path?: string): CodingIssue => ({ code, message, severity: "error", path });
const validLimit = (k: keyof CodingLimits, v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= CODING_LIMIT_RANGES[k][0] && v <= CODING_LIMIT_RANGES[k][1];

/** coding@1 finalization rules. Every problem is BLOCKING; a manual-only question (no hidden tests) is valid. Nothing here
 *  loads, compiles or executes anything. */
export function validateCodingQuestion(node: Record<string, unknown>): CodingIssue[] {
  const out: CodingIssue[] = [];
  const cfg = node.coding;
  if (!isObj(cfg)) return [err("CODING_CONFIG_MISSING", "إعداد سؤال البرمجة مفقود أو غير صالح.", "coding")];
  for (const k of Object.keys(cfg)) if (!PUBLIC_KEYS.has(k)) out.push(err("CODING_CONFIG_UNKNOWN_KEY", "حقل غير معروف في إعداد سؤال البرمجة: " + k, "coding." + k));
  const langs = Array.isArray(cfg.allowedLanguages) ? cfg.allowedLanguages : [];
  if (!langs.length) out.push(err("CODING_NO_LANGUAGES", "اختر لغة برمجة واحدة على الأقل.", "coding.allowedLanguages"));
  const allowed = new Set<string>();
  for (const l of langs) {
    if (!isCodingLanguage(l)) out.push(err("CODING_LANGUAGE_UNKNOWN", "لغة برمجة غير مدعومة: " + String(l), "coding.allowedLanguages"));
    else if (allowed.has(l as string)) out.push(err("CODING_LANGUAGE_DUPLICATE", "لغة مكررة: " + String(l), "coding.allowedLanguages"));
    else allowed.add(l as string);
  }
  if (langs.length && !(typeof cfg.defaultLanguage === "string" && allowed.has(cfg.defaultLanguage))) out.push(err("CODING_DEFAULT_LANGUAGE_INVALID", "اللغة الافتراضية يجب أن تكون إحدى اللغات المسموحة.", "coding.defaultLanguage"));
  if (cfg.taskMode !== "program" || cfg.inputMode !== "stdin" || cfg.outputMode !== "stdout") out.push(err("CODING_TASK_MODE_UNSUPPORTED", "وضع المهمة المدعوم: برنامج كامل يقرأ من الإدخال القياسي ويكتب إلى الإخراج القياسي.", "coding.taskMode"));
  const limits = isObj(cfg.limits) ? cfg.limits : null;
  if (!limits || !(Object.keys(CODING_LIMIT_RANGES) as (keyof CodingLimits)[]).every(k => validLimit(k, limits[k]))) out.push(err("CODING_LIMIT_INVALID", "حدود التنفيذ يجب أن تكون أعدادًا صحيحة ضمن المدى المسموح.", "coding.limits"));
  const sourceLimit = limits && validLimit("sourceBytes", limits.sourceBytes) ? (limits.sourceBytes as number) : CODE_SOURCE_MAX_BYTES;
  if (cfg.starterCode !== undefined) {
    if (!isObj(cfg.starterCode)) out.push(err("CODING_STARTER_INVALID", "الكود الابتدائي غير صالح.", "coding.starterCode"));
    else for (const [k, v] of Object.entries(cfg.starterCode)) {
      if (typeof v !== "string") out.push(err("CODING_STARTER_INVALID", "الكود الابتدائي غير صالح: " + k, "coding.starterCode." + k));
      else if (!allowed.has(k)) out.push(err("CODING_STARTER_LANGUAGE_NOT_ALLOWED", "كود ابتدائي للغة غير مسموحة: " + k, "coding.starterCode." + k));
      else if (utf8ByteLength(v) > sourceLimit) out.push(err("CODING_STARTER_TOO_LARGE", "الكود الابتدائي أكبر من حد حجم الكود: " + k, "coding.starterCode." + k));
    }
  }
  const key = isObj(node.answer) ? node.answer : {};
  const ids = new Set<string>();
  let total = 0, hiddenWeight = 0;
  const checkTests = (list: unknown, hidden: boolean) => {
    if (list === undefined) return 0;
    const where = hidden ? "answer.hiddenTests" : "coding.publicTests";
    if (!Array.isArray(list)) { out.push(err("CODING_TEST_MALFORMED", "قائمة الاختبارات غير صالحة.", where)); return 0; }
    list.forEach((t, i) => {
      const label = (hidden ? "الاختبار المخفي " : "المثال ") + (i + 1);
      if (!isObj(t)) { out.push(err("CODING_TEST_MALFORMED", label + " غير صالح.", where)); return; }
      if (typeof t.id !== "string" || !CODING_TEST_ID_PATTERN.test(t.id)) out.push(err("CODING_TEST_ID_INVALID", label + " بلا معرّف ثابت صالح.", where));
      else if (ids.has(t.id)) out.push(err("CODING_TEST_ID_DUPLICATE", "معرّف اختبار مكرر: " + t.id, where));
      else ids.add(t.id);
      const outKey = hidden ? "expectedOutput" : "sampleOutput";
      if (typeof t.input !== "string" || (hidden ? typeof t[outKey] !== "string" : t[outKey] !== undefined && typeof t[outKey] !== "string") || (t.title !== undefined && typeof t.title !== "string")) { out.push(err("CODING_TEST_MALFORMED", label + ": المدخلات والمخرجات يجب أن تكون نصوصًا.", where)); return; }
      for (const v of [t.input, t[outKey] as string | undefined]) if (v !== undefined) { const b = utf8ByteLength(v); total += b; if (b > CODING_TEST_LIMITS.ioBytes) out.push(err("CODING_TEST_TOO_LARGE", label + ": المدخلات أو المخرجات أكبر من 16 KB.", where)); }
      if (hidden) { if (typeof t.weight !== "number" || !Number.isFinite(t.weight) || t.weight < 0) out.push(err("CODING_WEIGHT_INVALID", label + ": الوزن يجب أن يكون عددًا غير سالب.", where)); else hiddenWeight += t.weight; }
    });
    return list.length;
  };
  const nPublic = checkTests(cfg.publicTests, false), nHidden = checkTests(key.hiddenTests, true);
  if (nPublic > CODING_TEST_LIMITS.publicTests) out.push(err("CODING_TOO_MANY_PUBLIC_TESTS", "الحد الأقصى للأمثلة الظاهرة " + CODING_TEST_LIMITS.publicTests + ".", "coding.publicTests"));
  if (nHidden > CODING_TEST_LIMITS.hiddenTests) out.push(err("CODING_TOO_MANY_HIDDEN_TESTS", "الحد الأقصى للاختبارات المخفية " + CODING_TEST_LIMITS.hiddenTests + ".", "answer.hiddenTests"));
  if (total > CODING_TEST_LIMITS.totalBytes) out.push(err("CODING_TEST_DATA_TOO_LARGE", "مجموع بيانات الاختبارات أكبر من 256 KB.", "answer.hiddenTests"));
  if (nHidden > 0 && hiddenWeight <= 0 && !out.some(i => i.code === "CODING_WEIGHT_INVALID")) out.push(err("CODING_WEIGHT_TOTAL_ZERO", "مجموع أوزان الاختبارات المخفية يجب أن يكون أكبر من صفر.", "answer.hiddenTests"));
  if (nPublic + nHidden > 0 && [...allowed].some(l => !codingLanguage(l)!.capabilities.tests)) out.push(err("CODING_TESTS_UNSUPPORTED_FOR_LANGUAGE", "اختبارات الإدخال/الإخراج لا تنطبق على لغة مسموحة في هذا السؤال.", "coding.allowedLanguages"));
  if (key.comparator !== undefined && !CODING_COMPARATORS.includes(key.comparator as CodingComparator)) out.push(err("CODING_COMPARATOR_UNKNOWN", "طريقة مقارنة مخرجات غير معروفة.", "answer.comparator"));
  // Phase 17C — official automatic grading fails CLOSED: the suite must be gradeable before the question can be published.
  if (key.gradingMode !== undefined && !CODING_GRADING_MODES.includes(key.gradingMode as CodingGradingMode)) out.push(err("CODING_GRADING_MODE_UNKNOWN", "طريقة تصحيح رسمي غير معروفة.", "answer.gradingMode"));
  if (key.gradingMode === "hiddenTests") {
    if (nHidden === 0) out.push(err("CODING_AUTO_NO_HIDDEN_TESTS", "التصحيح التلقائي يحتاج إلى اختبار مخفي واحد على الأقل.", "answer.hiddenTests"));
    // the student program's output can never exceed the question's output limit, so an expected output above it is unreachable
    const outputLimit = limits && validLimit("outputBytes", limits.outputBytes) ? (limits.outputBytes as number) : 0;
    if (Array.isArray(key.hiddenTests)) key.hiddenTests.forEach((t, i) => {
      if (isObj(t) && typeof t.expectedOutput === "string" && outputLimit > 0 && utf8ByteLength(t.expectedOutput) > outputLimit) out.push(err("CODING_EXPECTED_OUTPUT_EXCEEDS_LIMIT", "الاختبار المخفي " + (i + 1) + ": المخرجات المتوقعة أكبر من حد المخرجات المسموح للبرنامج.", "answer.hiddenTests"));
    });
  }
  if (key.referenceSolutions !== undefined) {
    if (!isObj(key.referenceSolutions)) out.push(err("CODING_REFERENCE_INVALID", "الحلول المرجعية غير صالحة.", "answer.referenceSolutions"));
    else for (const [k, v] of Object.entries(key.referenceSolutions)) {
      if (!allowed.has(k)) out.push(err("CODING_REFERENCE_LANGUAGE_NOT_ALLOWED", "حل مرجعي للغة غير مسموحة: " + k, "answer.referenceSolutions." + k));
      else if (typeof v !== "string" || utf8ByteLength(v) > CODE_SOURCE_MAX_BYTES) out.push(err("CODING_REFERENCE_INVALID", "الحل المرجعي غير صالح: " + k, "answer.referenceSolutions." + k));
    }
  }
  return out;
}
