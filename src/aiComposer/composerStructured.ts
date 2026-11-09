// Phase 21N — the STRUCTURED families in the AI Full Exam Composer: multipleSelect@1, matching@1, ordering@1, categorization@1.
// The frozen 19A per-question layer is NOT touched: these kinds travel in their own flat `structured` payload. The model writes only
// CONTENT (the stem, option texts, pairs, the sequence in its correct order, categories and their items); CODE owns every id, the option
// order of matching dropdowns, the shuffled display order of an ordering question, the answer keys and the stored shape (the exact shape
// the structured builder itself writes: buildMatchingPatch / syncSequenceAnswer / the registered type defaults). The canonical validators
// (validateStructuredExam) then judge each question.
//
// No free credit (code-checked, never trusted to the model):
//   • multipleSelect: at least one correct option and at least as many wrong options as correct ones, and only allOrNothing or
//     partialWithPenalty scoring — "select every option" never earns a mark (partialNoPenalty would pay it in full, so it is refused);
//   • ordering: the display order is a DERANGEMENT of the correct order (no item starts at its own position), so the identity answer
//     1, 2, 3 … earns nothing;
//   • matching: one-to-one pairs (distinct answers), and the dropdown order is shuffled so that no row's correct answer sits at that
//     row's own position — "pick option k for row k" earns nothing;
//   • categorization: every category holds at least one item (no empty decoy, no single-category key).
import type { BuilderQuestion } from "../examTypes";
import { buildMatchingPatch, syncSequenceAnswer } from "../examBuilderState";
import type { ComposerIssue } from "./composerLimits";
import { COMPOSER_LIMITS } from "./composerLimits";
import type { ComposerStructuredType } from "./composerCatalog";
import { cleanText, hasExactKeys, isArr, isEnum, isInt, isStr, sArr, sEnum, sInt, sObj, sStr, type JsonSchema } from "./composerSchemaKit";

export const STRUCTURED_LIMITS = Object.freeze({
  options: { min: 3, max: 8 }, pairs: { min: 2, max: 10 }, distractors: 4, sequence: { min: 3, max: 10 },
  categories: { min: 2, max: 6 }, entries: { min: 2, max: 20 }, textChars: 300
});
/** The multipleSelect scorings the composer may store: both refuse "select every option" (partialNoPenalty would pay it). */
export const COMPOSER_MS_SCORINGS = Object.freeze(["allOrNothing", "partialWithPenalty"] as const);
const S = STRUCTURED_LIMITS;

/** The flat wire payload (provider strict mode: every field present; the fields another kind uses stay empty). */
export function buildStructuredSchema(): JsonSchema {
  return sObj({
    text: sStr(),
    options: sArr(sStr(), S.options.max), correctOptions: sArr(sInt(0, S.options.max - 1), S.options.max), scoring: sEnum(COMPOSER_MS_SCORINGS),
    pairs: sArr(sObj({ left: sStr(), right: sStr() }), S.pairs.max), distractors: sArr(sStr(), S.distractors), headers: sArr(sStr(), 2),
    sequence: sArr(sStr(), S.sequence.max),
    categories: sArr(sStr(), S.categories.max), entries: sArr(sObj({ label: sStr(), category: sInt(0, S.categories.max - 1) }), S.entries.max)
  });
}
const KEYS = ["text", "options", "correctOptions", "scoring", "pairs", "distractors", "headers", "sequence", "categories", "entries"] as const;
/** Which wire lists each kind fills; every other list must be empty (a payload that mixes kinds is refused, never trimmed). */
const USES: Readonly<Record<ComposerStructuredType, readonly string[]>> = Object.freeze({
  multipleSelect: ["options", "correctOptions"], matching: ["pairs", "distractors", "headers"], ordering: ["sequence"], categorization: ["categories", "entries"]
});
const LISTS = ["options", "correctOptions", "pairs", "distractors", "headers", "sequence", "categories", "entries"] as const;

// ── deterministic, seeded permutations (the question id is the seed: the same draft always yields the same stored question) ──────────
function seedOf(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number): () => number { let a = seed || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffled<T>(list: readonly T[], next: () => number): T[] { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** A permutation of 0..n-1 that satisfies `ok`; a rotation by one when the bounded search finds none (a rotation satisfies every rule here). */
function permutation(n: number, seed: string, ok: (p: number[]) => boolean): number[] {
  const next = rng(seedOf(seed)), base = Array.from({ length: n }, (_, i) => i);
  for (let attempt = 0; attempt < 64; attempt++) { const p = shuffled(base, next); if (ok(p)) return p; }
  return base.map(i => (i + 1) % n);
}
/** p[k] = the index of the item shown at position k; a derangement shows no item at its own index. */
export const isDerangement = (p: readonly number[]) => p.every((v, k) => v !== k);

const norm = (s: string) => cleanText(s).replace(/\s+/g, " ").toLowerCase();
const distinct = (list: readonly string[]) => new Set(list.map(norm)).size === list.length;
type R = { ok: true; node: Record<string, unknown> } | { ok: false; issues: ComposerIssue[] };

/** The `structured` payload of ONE item / composite part → the canonical question body (without id / marks: the caller owns them).
 *  `part`: a composite child (matching is then stored as per-row select fields, the shape the composite part control answers). */
export function buildStructuredBody(raw: unknown, kind: ComposerStructuredType, seed: string, path: string, questionId: string, part = false): R {
  const bad = (code: string, message: string, at = path): R => ({ ok: false, issues: [{ code, message, path: at, questionId }] });
  if (!hasExactKeys(raw, KEYS) || !isStr(raw.text, COMPOSER_LIMITS.richTextChars, 1) || !isEnum(raw.scoring, COMPOSER_MS_SCORINGS)) return bad("AI_STRUCTURED_MALFORMED", "محتوى السؤال غير صالح البنية.");
  const r = raw;
  for (const k of LISTS) if (!isArr(r[k], 20)) return bad("AI_STRUCTURED_MALFORMED", "محتوى السؤال غير صالح البنية.", path + "." + k);
  const foreign = LISTS.filter(k => !USES[kind].includes(k) && (r[k] as unknown[]).length);
  if (foreign.length) return bad("AI_STRUCTURED_FOREIGN_FIELDS", "حقول لا تخص نوع السؤال (" + kind + "): " + foreign.join(", ") + ". اترك قوائم الأنواع الأخرى فارغة.");
  const text = cleanText(r.text as string);
  const texts = (k: string, max: number = S.textChars): string[] | null => { const a = r[k] as unknown[]; return a.every(x => isStr(x, max, 1) && cleanText(x as string) !== "") ? (a as string[]).map(cleanText) : null; };

  if (kind === "multipleSelect") {
    const options = texts("options");
    if (!options || options.length < S.options.min || options.length > S.options.max) return bad("AI_MS_OPTIONS", "اختيار متعدد الإجابات يحتاج " + S.options.min + "–" + S.options.max + " خيارات بنصوص غير فارغة.");
    if (!distinct(options)) return bad("AI_MS_OPTIONS", "خيارات اختيار متعدد الإجابات يجب أن تكون مختلفة.");
    const correct = r.correctOptions as unknown[];
    if (!correct.every(i => isInt(i, 0, options.length - 1)) || new Set(correct).size !== correct.length || !correct.length) return bad("AI_MS_CORRECT", "حدّد إجابة صحيحة واحدة على الأقل بأرقام خيارات صالحة غير مكررة (تبدأ من 0).");
    if (options.length - correct.length < correct.length) return bad("AI_MS_FREE_CREDIT", "عدد الخيارات الخاطئة يجب ألا يقل عن عدد الصحيحة (وإلا نال اختيار كل الخيارات علامة).");
    const ids = options.map((_, i) => "o" + (i + 1));
    return { ok: true, node: { presentationType: "multipleSelect", questionTypeVersion: 1, text, options: options.map((t, i) => ({ id: ids[i], text: t })), answer: { correctOptionIds: [...(correct as number[])].sort((a, b) => a - b).map(i => ids[i]), scoring: r.scoring } } };
  }

  if (kind === "ordering") {
    const seq = texts("sequence");
    if (!seq || seq.length < S.sequence.min || seq.length > S.sequence.max) return bad("AI_ORDER_ITEMS", "سؤال الترتيب يحتاج " + S.sequence.min + "–" + S.sequence.max + " عناصر بنصوص غير فارغة، بترتيبها الصحيح.");
    if (!distinct(seq)) return bad("AI_ORDER_ITEMS", "عناصر سؤال الترتيب يجب أن تكون مختلفة.");
    const shown = permutation(seq.length, seed + "::order", isDerangement);
    const fields = shown.map((idx, k) => ({ id: "f" + (k + 1), label: seq[idx], order: k, kind: "select", correct: String(idx + 1) }));
    return { ok: true, node: { presentationType: "ordering", questionTypeVersion: 1, text, fields, wordBank: seq.map((_, i) => String(i + 1)), answer: syncSequenceAnswer(fields as never) } };
  }

  if (kind === "matching") {
    const pairs = r.pairs as unknown[];
    if (pairs.length < S.pairs.min || pairs.length > S.pairs.max || !pairs.every(p => hasExactKeys(p, ["left", "right"]) && isStr(p.left, S.textChars, 1) && isStr(p.right, S.textChars, 1)))
      return bad("AI_MATCH_PAIRS", "سؤال المطابقة يحتاج " + S.pairs.min + "–" + S.pairs.max + " أزواج، لكل زوج عنصر وإجابته.");
    const list = (pairs as { left: string; right: string }[]).map(p => ({ left: cleanText(p.left), right: cleanText(p.right) }));
    const distractors = texts("distractors"), headers = texts("headers", 80);
    // a cell is one table cell and one entry of the "left=right;…" key: no separators, no line breaks, nothing empty
    const cellOk = (s: string) => s !== "" && !/[|=;؛\n]/.test(s);
    if (!list.every(p => cellOk(p.left) && cellOk(p.right)) || !distractors || !distractors.every(cellOk)) return bad("AI_MATCH_PAIRS", "نصوص المطابقة لا تحتوي الرموز | = ; ؛ ولا أسطرًا جديدة، ولا تكون فارغة.");
    if (!distinct(list.map(p => p.left))) return bad("AI_MATCH_PAIRS", "عناصر العمود الأول في المطابقة يجب أن تكون مختلفة.");
    if (!distinct(list.map(p => p.right))) return bad("AI_MATCH_ONE_TO_ONE", "المطابقة واحد لواحد: لكل عنصر إجابة مختلفة (أضف الإجابات الزائدة في distractors).");
    if (!distinct([...list.map(p => p.right), ...distractors])) return bad("AI_MATCH_PAIRS", "الإجابات المضلِّلة يجب أن تختلف عن إجابات الأزواج وعن بعضها.");
    if (!headers || (headers.length !== 0 && headers.length !== 2) || !headers.every(cellOk)) return bad("AI_MATCH_PAIRS", "عناوين أعمدة المطابقة: اتركها فارغة أو اكتب عنوانين.");
    const pool = [...list.map(p => p.right), ...distractors];
    const order = permutation(pool.length, seed + "::match", p => list.every((_, row) => p[row] !== row));
    const options = order.map(i => ({ text: pool[i] }));
    const patch = buildMatchingPatch(list, headers.length === 2 ? [headers[0], headers[1]] : undefined) as { text: string; fields: Record<string, unknown>[]; answer: unknown };
    const fields = patch.fields.map(f => ({ ...f, options }));
    // a question draws the builder's table (its student card answers it as a table); a composite part answers per-row select fields
    return { ok: true, node: { presentationType: "matching", questionTypeVersion: 1, text: part ? text : text + "\n" + patch.text, fields, answer: patch.answer } };
  }

  const categories = texts("categories"), entries = r.entries as unknown[];
  if (!categories || categories.length < S.categories.min || categories.length > S.categories.max || !distinct(categories)) return bad("AI_CAT_CATEGORIES", "التصنيف يحتاج " + S.categories.min + "–" + S.categories.max + " فئات مختلفة بنصوص غير فارغة.");
  if (entries.length < S.entries.min || entries.length > S.entries.max || !entries.every(e => hasExactKeys(e, ["label", "category"]) && isStr(e.label, S.textChars, 1) && cleanText(e.label as string) !== "" && isInt(e.category, 0, categories.length - 1)))
    return bad("AI_CAT_ITEMS", "التصنيف يحتاج " + S.entries.min + "–" + S.entries.max + " عناصر، لكل عنصر نص ورقم فئته (يبدأ من 0).");
  const items = (entries as { label: string; category: number }[]).map(e => ({ label: cleanText(e.label), category: e.category }));
  if (!distinct(items.map(e => e.label))) return bad("AI_CAT_ITEMS", "عناصر التصنيف يجب أن تكون مختلفة.");
  const empty = categories.filter((_, k) => !items.some(e => e.category === k));
  if (empty.length) return bad("AI_CAT_EMPTY_CATEGORY", "كل فئة تحتاج عنصرًا واحدًا على الأقل: " + empty.join("، "));
  const catIds = categories.map((_, k) => "k" + (k + 1)), itemIds = items.map((_, i) => "t" + (i + 1));
  return { ok: true, node: { presentationType: "categorization", questionTypeVersion: 1, text, categorization: { categories: categories.map((label, k) => ({ id: catIds[k], label })), items: items.map((e, i) => ({ id: itemIds[i], label: e.label })) }, answer: { correctCategoryByItem: Object.fromEntries(items.map((e, i) => [itemIds[i], catIds[e.category]])) } } };
}

/** A whole composer question from a structured payload (code-owned id and plan marks). */
export function buildStructuredQuestion(raw: unknown, kind: ComposerStructuredType, qid: string, marks: number, path: string): { ok: true; question: BuilderQuestion } | { ok: false; issues: ComposerIssue[] } {
  const b = buildStructuredBody(raw, kind, qid, path, qid);
  return b.ok ? { ok: true, question: { examQuestionId: qid, marks, ...b.node } as unknown as BuilderQuestion } : b;
}

/** The model-facing rules, sent only with the prompts that may write these kinds (keeps the general catalog bounded). */
export function structuredRulesForPrompt(): string {
  return [
    "STRUCTURED QUESTION RULES (multipleSelect, matching, ordering, categorization): fill `structured` (question = null); `text` is the instruction the student reads; leave every list another kind uses EMPTY. Code builds every id, option order and answer key.",
    "- multipleSelect: options " + S.options.min + "-" + S.options.max + " distinct texts; correctOptions = zero-based indices of EVERY correct option; at least as many wrong options as correct ones; scoring allOrNothing (default) or partialWithPenalty.",
    "- matching: pairs " + S.pairs.min + "-" + S.pairs.max + " {left, right}, one-to-one (each right differs); up to " + S.distractors + " extra wrong rights in distractors; headers empty or the two column titles; no | = ; or line breaks in any cell.",
    "- ordering: sequence = " + S.sequence.min + "-" + S.sequence.max + " distinct items IN THEIR CORRECT ORDER (code shuffles them for the student; never number them).",
    "- categorization: categories " + S.categories.min + "-" + S.categories.max + " distinct names; entries " + S.entries.min + "-" + S.entries.max + " {label, category = zero-based index}; every category gets at least one entry."
  ].join("\n");
}
const STRUCTURED_WORDS = /multiple ?select|select all|matching|\bmatch\b|ordering|\border\b|sequence|categor|classif|اختيار متعدد|أكثر من إجابة|مطابقة|طابق|صل |صِل|ترتيب|رتّ?ب|تسلسل|تصنيف|صنّ?ف|multipleSelect|categorization/i;
/** A modify request (or the exam it edits) that involves a structured kind. */
export const mentionsStructuredKinds = (text: string): boolean => STRUCTURED_WORDS.test(text);
