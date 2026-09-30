// Phase 16A — the canonical question-type validation seam (pure; compiled into the server shared build). It validates the
// identity (known key, supported version, compound capability), refuses executable field names on any node, and delegates
// type-specific configuration / answer-key checks to CODE-OWNED validators registered per type (Wave 1 included here;
// legacy types keep their existing structural checks in examQuality). examQuality / finalization block on every error.
import { isKnownQuestionType, supportsQuestionTypeVersion, questionTypeDefinition } from "./questionTypeCatalog";
import { MULTIPLE_SELECT_SCORING } from "./questionTypeScoring";

export type QuestionTypeIssue = { code: string; message: string; severity: "error" | "warning"; path?: string };
export type TypeValidator = (node: Record<string, unknown>, context: { version: number; part: boolean }) => QuestionTypeIssue[];
/** Field names persisted content might use to name code / markup. Always refused, on any node. */
export const EXECUTABLE_NODE_FIELDS: readonly string[] = Object.freeze(["component", "module", "load", "loader", "render", "renderer", "grader", "import", "src", "srcdoc", "html", "script", "code", "eval", "path", "url", "handler", "onLoad", "onRender"]);

const validators = new Map<string, TypeValidator>();
export function registerTypeValidator(key: string, validator: TypeValidator): () => void {
  validators.set(key, validator);
  return () => { validators.delete(key); };
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const err = (code: string, message: string, path?: string): QuestionTypeIssue => ({ code, message, severity: "error", path });
const idOf = (v: unknown): string | undefined => (isObj(v) && typeof v.id === "string" && v.id.trim() ? v.id : undefined);
function uniqueIds(list: unknown, code: string, label: string, out: QuestionTypeIssue[]): string[] {
  const ids: string[] = []; const seen = new Set<string>();
  if (!Array.isArray(list)) return ids;
  list.forEach((entry, i) => {
    const id = idOf(entry);
    if (!id) { out.push(err(code, label + " رقم " + (i + 1) + " بلا معرّف ثابت.")); return; }
    if (seen.has(id)) out.push(err(code, "معرّف مكرر في " + label + ": " + id)); else { seen.add(id); ids.push(id); }
  });
  return ids;
}

export function validateQuestionTypeNode(node: unknown, type: unknown, version: unknown, options: { part?: boolean } = {}): QuestionTypeIssue[] {
  const issues: QuestionTypeIssue[] = [];
  const n: Record<string, unknown> = isObj(node) ? node : {};
  for (const f of EXECUTABLE_NODE_FIELDS) if (f in n) issues.push(err("EXECUTABLE_FIELD", "حقل غير مسموح في بيانات السؤال: " + f, f));
  if (!isKnownQuestionType(type)) { issues.push(err("UNKNOWN_QUESTION_TYPE", "نوع سؤال غير معروف: " + String(type ?? ""))); return issues; }
  const key = type as string;
  if (!supportsQuestionTypeVersion(key, version)) { issues.push(err("UNSUPPORTED_QUESTION_TYPE_VERSION", "إصدار نوع السؤال غير مدعوم: " + String(version) + " (" + key + ").")); return issues; }
  if (options.part && !questionTypeDefinition(key)!.capabilities.compoundPart) issues.push(err("TYPE_NOT_COMPOUND_CAPABLE", "النوع «" + questionTypeDefinition(key)!.label + "» لا يمكن استخدامه كبند مركّب."));
  const v = validators.get(key);
  if (v) issues.push(...v(n, { version: version === undefined ? 1 : (version as number), part: !!options.part }));
  return issues;
}

// ── Wave 1 validators ─────────────────────────────────────────────────────────────────────────────────────────────
registerTypeValidator("multipleSelect", node => {
  const out: QuestionTypeIssue[] = [];
  const options = Array.isArray(node.options) ? node.options : [];
  if (options.length < 2) out.push(err("MS_TOO_FEW_OPTIONS", "اختيار متعدد الإجابات يحتاج خيارين على الأقل."));
  const ids = new Set(uniqueIds(options, "MS_DUPLICATE_OPTION_ID", "الخيارات", out));
  options.forEach((o, i) => { if (!isObj(o) || !String(o.text ?? o.label ?? o.value ?? "").trim()) out.push(err("MS_EMPTY_OPTION_TEXT", "الخيار " + (i + 1) + " بلا نص.")); });
  const answer = isObj(node.answer) ? node.answer : {};
  const correct = Array.isArray(answer.correctOptionIds) ? answer.correctOptionIds.filter((x): x is string => typeof x === "string") : [];
  if (!correct.length) out.push(err("MS_NO_CORRECT", "حدّد إجابة صحيحة واحدة على الأقل."));
  for (const id of correct) if (!ids.has(id)) out.push(err("MS_CORRECT_NOT_OPTION", "إجابة صحيحة تشير إلى خيار غير موجود: " + id));
  if (!(MULTIPLE_SELECT_SCORING as readonly string[]).includes(answer.scoring as string)) out.push(err("MS_INVALID_SCORING", "طريقة التصحيح غير معروفة."));
  return out;
});
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
registerTypeValidator("numericResponse", node => {
  const out: QuestionTypeIssue[] = [];
  const answer = isObj(node.answer) ? node.answer : {};
  const numeric = isObj(node.numeric) ? node.numeric : {};
  if (answer.mode === "tolerance") {
    if (!finite(answer.expected)) out.push(err("NUM_INVALID_EXPECTED", "القيمة المتوقعة يجب أن تكون عددًا منتهيًا."));
    if (!finite(answer.tolerance) || answer.tolerance < 0) out.push(err("NUM_INVALID_TOLERANCE", "التسامح يجب أن يكون عددًا غير سالب."));
  } else if (answer.mode === "range") {
    if (!finite(answer.min) || !finite(answer.max)) out.push(err("NUM_INVALID_RANGE", "حدّا المدى يجب أن يكونا عددين منتهيين."));
    else if (answer.min > answer.max) out.push(err("NUM_RANGE_REVERSED", "الحد الأدنى للمدى أكبر من الحد الأعلى."));
  } else out.push(err("NUM_INVALID_MODE", "نمط الإجابة الرقمية غير معروف."));
  if (numeric.unitRequired === true && !(typeof answer.unit === "string" && answer.unit.trim())) out.push(err("NUM_UNIT_REQUIRED_WITHOUT_UNIT", "الوحدة مطلوبة من الطالب دون تحديد الوحدة الصحيحة."));
  return out;
});
registerTypeValidator("matrix", node => {
  const out: QuestionTypeIssue[] = [];
  const m = isObj(node.matrix) ? node.matrix : {};
  const rows = Array.isArray(m.rows) ? m.rows : [], columns = Array.isArray(m.columns) ? m.columns : [];
  if (!rows.length) out.push(err("MX_NO_ROWS", "المصفوفة تحتاج صفًا واحدًا على الأقل."));
  if (columns.length < 2) out.push(err("MX_TOO_FEW_COLUMNS", "المصفوفة تحتاج عمودين على الأقل."));
  const rowIds = uniqueIds(rows, "MX_DUPLICATE_ID", "الصفوف", out), colIds = new Set(uniqueIds(columns, "MX_DUPLICATE_ID", "الأعمدة", out));
  const key = isObj(node.answer) && isObj((node.answer as Record<string, unknown>).correctColumnByRow) ? (node.answer as { correctColumnByRow: Record<string, unknown> }).correctColumnByRow : {};
  for (const r of rowIds) {
    const c = key[r];
    if (typeof c !== "string" || !c) out.push(err("MX_ROW_NO_CORRECT", "الصف «" + r + "» بلا إجابة صحيحة محددة."));
    else if (!colIds.has(c)) out.push(err("MX_CORRECT_NOT_COLUMN", "الإجابة الصحيحة للصف «" + r + "» تشير إلى عمود غير موجود."));
  }
  return out;
});
registerTypeValidator("categorization", node => {
  const out: QuestionTypeIssue[] = [];
  const c = isObj(node.categorization) ? node.categorization : {};
  const categories = Array.isArray(c.categories) ? c.categories : [], items = Array.isArray(c.items) ? c.items : [];
  if (categories.length < 2) out.push(err("CAT_TOO_FEW_CATEGORIES", "التصنيف يحتاج فئتين على الأقل."));
  if (!items.length) out.push(err("CAT_NO_ITEMS", "التصنيف يحتاج عنصرًا واحدًا على الأقل."));
  const catIds = new Set(uniqueIds(categories, "CAT_DUPLICATE_ID", "الفئات", out)), itemIds = uniqueIds(items, "CAT_DUPLICATE_ID", "العناصر", out);
  const key = isObj(node.answer) && isObj((node.answer as Record<string, unknown>).correctCategoryByItem) ? (node.answer as { correctCategoryByItem: Record<string, unknown> }).correctCategoryByItem : {};
  for (const i of itemIds) {
    const k = key[i];
    if (typeof k !== "string" || !k) out.push(err("CAT_ITEM_NO_CATEGORY", "العنصر «" + i + "» بلا فئة صحيحة محددة."));
    else if (!catIds.has(k)) out.push(err("CAT_CORRECT_NOT_CATEGORY", "الفئة الصحيحة للعنصر «" + i + "» غير موجودة."));
  }
  return out;
});
