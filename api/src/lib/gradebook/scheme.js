// Class gradebook GB1 (docs/enterprise-class-gradebook-gb.md §4.2) — validation of a class's grading scheme. PURE: no storage, no I/O.
//
// A scheme has CATEGORIES (each with a weight in the final mark) and, inside each, ITEMS (each with a weight inside its category). An
// item's source is a class assignment / exam, a class project or a manual column.
//
//   - A STRUCTURAL problem (a malformed id, title or weight, an unknown source, a source used twice, too many categories) refuses the
//     save: validateScheme answers { ok: false, errors }.
//   - SUMS that are not 100 are not a refusal: the scheme is valid but a DRAFT, and has no final mark (invariant 3: weights are never
//     rescaled silently). The UI offers «توزيع بالتساوي», which the teacher clicks.
//
// The source checks need the class's context (`classId`, its assignments, its projects). It is required: without it every assignment
// and project source is refused (fail closed), never accepted unchecked.
const { isSafeId, cleanText } = require("../roster-input");
const { isReportableAssessment } = require("../assignment-lifecycle");

const SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({ categories: 10, itemsPerCategory: 40, categoryTitle: 80, manualTitle: 120, manualMaxScore: 1000 });
const SUM_TOLERANCE = 0.01;
const SOURCE_KINDS = Object.freeze(["assignment", "project", "manual"]);

const MESSAGES = Object.freeze({
  SCHEME_SHAPE: "مخطط العلامات غير صالح.",
  CATEGORY_COUNT: "يجب أن يحتوي المخطط على قسم واحد على الأقل وعلى " + LIMITS.categories + " أقسام على الأكثر.",
  CATEGORY_ID: "معرّف القسم غير صالح.",
  CATEGORY_ID_DUPLICATE: "معرّف القسم مكرر.",
  CATEGORY_TITLE: "عنوان القسم مطلوب، و" + LIMITS.categoryTitle + " حرفًا على الأكثر.",
  ITEM_COUNT: "يجب أن يحتوي كل قسم على عنصر واحد على الأقل وعلى " + LIMITS.itemsPerCategory + " عنصرًا على الأكثر.",
  ITEM_ID: "معرّف العنصر غير صالح.",
  ITEM_ID_DUPLICATE: "معرّف العنصر مكرر.",
  WEIGHT: "الوزن يجب أن يكون رقمًا أكبر من 0 وحتى 100، بمنزلتين عشريتين على الأكثر.",
  SOURCE_KIND: "نوع مصدر العنصر غير معروف.",
  ASSIGNMENT_ID: "معرّف الواجب غير صالح.",
  ASSIGNMENT_NOT_IN_CLASS: "الواجب غير موجود في هذا الصف أو لم يُنشر بعد.",
  PROJECT_CODE: "رمز المشروع غير صالح.",
  PROJECT_NOT_IN_CLASS: "المشروع غير مفعّل في هذا الصف.",
  SOURCE_DUPLICATE: "هذا المصدر مستخدم مرة أخرى في المخطط.",
  MANUAL_TITLE: "عنوان العلامة التي يرصدها المعلم مطلوب، و" + LIMITS.manualTitle + " حرفًا على الأكثر.",
  MANUAL_MAX: "العلامة القصوى للعلامة التي يرصدها المعلم يجب أن تكون رقمًا صحيحًا من 1 إلى " + LIMITS.manualMaxScore + ".",
  CONTEXT: "تعذر التحقق من مصادر المخطط."
});

const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/** A weight: a finite number in (0, 100] with at most two decimals; else null (never coerced). */
function normalizeWeight(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0 || value > 100) return null;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-9) return null;
  return value;
}

/** A required plain-text title, cleaned (invisible characters removed, spaces collapsed), within `max` characters; else null. */
function normalizeTitle(value, max) {
  if (typeof value !== "string") return null;
  const text = cleanText(value);
  if (!text || Array.from(text).length > max) return null;
  return text;
}

/** Whether a list of weights adds up to 100 (within the tolerance). */
function sumsTo100(weights) {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  return Math.abs(sum - 100) <= SUM_TOLERANCE;
}

/** Where a scheme's sums are not 100: [{ path, sum }] ("categories", or "categories.<categoryId>.items"). Empty = complete. */
function sumIssues(scheme) {
  const out = [];
  const categories = scheme.categories;
  const total = categories.reduce((acc, c) => acc + c.weight, 0);
  if (!sumsTo100(categories.map(c => c.weight))) out.push({ path: "categories", sum: total });
  for (const c of categories) {
    if (!sumsTo100(c.items.map(i => i.weight))) out.push({ path: "categories." + c.categoryId + ".items", sum: c.items.reduce((acc, i) => acc + i.weight, 0) });
  }
  return out;
}

function sourceKey(source) {
  if (source.kind === "assignment") return "assignment:" + source.assignmentId;
  if (source.kind === "project") return "project:" + source.projectCode;
  return null;   // a manual column is its own source
}

/** The class's context, normalized; null when it is unusable (the caller then refuses every class-bound source). */
function normalizeContext(context) {
  if (!isPlainObject(context) || !isSafeId(context.classId)) return null;
  const assignments = context.assignments instanceof Map ? context.assignments : null;
  const projectCodes = Array.isArray(context.projectCodes) ? new Set(context.projectCodes.map(String)) : null;
  if (!assignments || !projectCodes) return null;
  return { classId: context.classId, assignments, projectCodes };
}

function validateSource(raw, ctx, err) {
  if (!isPlainObject(raw) || !SOURCE_KINDS.includes(raw.kind)) { err("SOURCE_KIND"); return null; }
  if (raw.kind === "assignment") {
    if (!isSafeId(raw.assignmentId)) { err("ASSIGNMENT_ID"); return null; }
    if (!ctx) { err("CONTEXT"); return null; }
    const a = ctx.assignments.get(raw.assignmentId);
    if (!a || String(a.classId || "") !== ctx.classId || !isReportableAssessment(a)) { err("ASSIGNMENT_NOT_IN_CLASS"); return null; }
    return { kind: "assignment", assignmentId: raw.assignmentId };
  }
  if (raw.kind === "project") {
    if (typeof raw.projectCode !== "string" || !isSafeId(raw.projectCode)) { err("PROJECT_CODE"); return null; }
    if (!ctx) { err("CONTEXT"); return null; }
    if (!ctx.projectCodes.has(raw.projectCode)) { err("PROJECT_NOT_IN_CLASS"); return null; }
    return { kind: "project", projectCode: raw.projectCode };
  }
  const title = normalizeTitle(raw.title, LIMITS.manualTitle);
  if (title === null) { err("MANUAL_TITLE"); return null; }
  const max = raw.maxScore;
  if (!Number.isInteger(max) || max < 1 || max > LIMITS.manualMaxScore) { err("MANUAL_MAX"); return null; }
  return { kind: "manual", title, maxScore: max };
}

/**
 * Validate a scheme submitted by a teacher.
 *   input   — { categories: [{ categoryId, title, weight, items: [{ itemId, weight, source }] }] }
 *   context — { classId, assignments: Map<assignmentId, assignment document>, projectCodes: string[] }
 * Returns { ok: true, scheme, status: "active" | "draft", sumIssues } or { ok: false, errors: [{ path, code, message }] }.
 * The returned scheme holds only the known fields, cleaned; it carries no revision or timestamps (the route stamps those).
 */
function validateScheme(input, context) {
  const errors = [];
  const fail = (path, code) => errors.push({ path, code, message: MESSAGES[code] });
  if (!isPlainObject(input) || !Array.isArray(input.categories)) { fail("", "SCHEME_SHAPE"); return { ok: false, errors }; }
  if (input.categories.length < 1 || input.categories.length > LIMITS.categories) fail("categories", "CATEGORY_COUNT");
  const ctx = normalizeContext(context);
  const categoryIds = new Set(), itemIds = new Set(), sources = new Map();
  const categories = [];
  input.categories.slice(0, LIMITS.categories).forEach((rawCategory, ci) => {
    const cPath = "categories." + ci;
    if (!isPlainObject(rawCategory)) { fail(cPath, "SCHEME_SHAPE"); return; }
    const categoryId = rawCategory.categoryId;
    if (!isSafeId(categoryId)) fail(cPath + ".categoryId", "CATEGORY_ID");
    else if (categoryIds.has(categoryId)) fail(cPath + ".categoryId", "CATEGORY_ID_DUPLICATE");
    else categoryIds.add(categoryId);
    const title = normalizeTitle(rawCategory.title, LIMITS.categoryTitle);
    if (title === null) fail(cPath + ".title", "CATEGORY_TITLE");
    const weight = normalizeWeight(rawCategory.weight);
    if (weight === null) fail(cPath + ".weight", "WEIGHT");
    const rawItems = Array.isArray(rawCategory.items) ? rawCategory.items : null;
    if (!rawItems || rawItems.length < 1 || rawItems.length > LIMITS.itemsPerCategory) fail(cPath + ".items", "ITEM_COUNT");
    const items = [];
    (rawItems || []).slice(0, LIMITS.itemsPerCategory).forEach((rawItem, ii) => {
      const iPath = cPath + ".items." + ii;
      if (!isPlainObject(rawItem)) { fail(iPath, "SCHEME_SHAPE"); return; }
      const itemId = rawItem.itemId;
      if (!isSafeId(itemId)) fail(iPath + ".itemId", "ITEM_ID");
      else if (itemIds.has(itemId)) fail(iPath + ".itemId", "ITEM_ID_DUPLICATE");
      else itemIds.add(itemId);
      const itemWeight = normalizeWeight(rawItem.weight);
      if (itemWeight === null) fail(iPath + ".weight", "WEIGHT");
      const source = validateSource(rawItem.source, ctx, code => fail(iPath + ".source", code));
      if (source) {
        const key = sourceKey(source);
        if (key !== null && sources.has(key)) fail(iPath + ".source", "SOURCE_DUPLICATE");
        else if (key !== null) sources.set(key, iPath);
      }
      items.push({ itemId, weight: itemWeight, source });
    });
    categories.push({ categoryId, title, weight, items });
  });
  if (errors.length) return { ok: false, errors };
  const scheme = { schemaVersion: SCHEMA_VERSION, categories };
  const issues = sumIssues(scheme);
  return { ok: true, scheme, status: issues.length ? "draft" : "active", sumIssues: issues };
}

module.exports = { SCHEMA_VERSION, LIMITS, SUM_TOLERANCE, SOURCE_KINDS, MESSAGES, validateScheme, sumIssues, sumsTo100, normalizeWeight };
