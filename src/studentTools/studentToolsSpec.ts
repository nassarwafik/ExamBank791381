// Phase T1 — StudentToolsSpecV1: the exam-level contract for the tools a teacher allows students to open during an exam
// (calculator, number-base converter, function plotter, IPv4 / subnet calculator).
//
// Pure, data only, no React / DOM / I/O. Compiled into the shared server build (scripts/build-shared-finalization.mjs) so the
// Builder quality gate, the server finalization gate, the assignment-creation gate and the student projection apply
// byte-identical rules.
//
// Contract rules (design record: docs/enterprise-student-tools-t.md):
//   • closed keys at every level — an unknown, foreign or prototype-polluting key makes the WHOLE spec invalid;
//   • versioned — `version: 1`; any other version is refused (a future behaviour is a new version, never a reinterpretation);
//   • a tool id appears at most once; unknown tool ids are refused (never silently ignored);
//   • the spec carries configuration only — never an expression to evaluate, HTML, a URL, an answer or a grading datum;
//   • the student copy is the CANONICAL value or nothing (projectStudentToolsForStudent): a malformed spec is withheld,
//     which only removes a convenience — it can never change a score, an answer or an attempt.

import { validateRichContent, type RichContentV1, type RichBlockType } from "../richContent/richContentModel";

export const STUDENT_TOOLS_VERSION = 1 as const;

/** Every tool of contract version 1, in their default display order. Adding a tool is a reviewed contract change. */
// Phase T5 — `formulaSheet` and `scratchPad` were added to version 1 additively: every spec that was valid stays valid and means the same.
// Phase T6 — five subject tools, added additively in the same way.
// Phase T13 — the owner's two binary-conversion aids (place-value boxes, the hex ↔ binary table), added additively in the same way.
// Phase T14 — the C# editor (docs/enterprise-student-tools-csharp-editor-design.md), added additively in the same way.
export const STUDENT_TOOL_IDS = ["calculator", "baseConverter", "graphPlotter", "ipv4Calculator", "formulaSheet", "scratchPad",
  "asciiTable", "bitwiseCalculator", "truthTable", "unitConverter", "periodicTable", "placeValueBoxes", "hexBinaryTable", "csharpEditor"] as const;
export type StudentToolId = (typeof STUDENT_TOOL_IDS)[number];

export const NUMBER_BASES = [2, 8, 10, 16] as const;
export type NumberBase = (typeof NUMBER_BASES)[number];

export const GRAPH_MAX_FUNCTIONS_LIMIT = 3;
/** Phase T6 — subject tool option values (kept here, not imported from the engines, so the contract stays a leaf module). */
export const BIT_WIDTH_OPTIONS = [8, 16, 32] as const;
export const UNIT_CATEGORY_IDS = ["length", "mass", "time", "temperature", "speed", "data", "dataRate"] as const;
export type UnitCategoryId = (typeof UNIT_CATEGORY_IDS)[number];
export const TRUTH_MAX_VARIABLES_RANGE = { min: 2, max: 6 } as const;
/** Phase T13 — how many place-value boxes the student gets (4: one hex digit, 8: one byte, 16: two bytes). */
export const PLACE_VALUE_WIDTH_OPTIONS = [4, 8, 16] as const;
export const MAX_SECTION_OVERRIDES = 100;
export const MAX_SECTION_ID_LENGTH = 120;
/** Phase T5 — formula sheet bounds: a short title and a light document (it travels inside every delivered exam). */
export const FORMULA_SHEET_TITLE_MAX = 80;
export const FORMULA_SHEET_MAX_BYTES = 65536;
/** The rich-content blocks a formula sheet may use: text, maths, tables and (Phase T9) images. Charts, graphs and 3D scenes stay refused —
 *  a sheet is reference material, and every allowed block renders without heavy engines. */
export const FORMULA_SHEET_BLOCKS: readonly RichBlockType[] = Object.freeze(["heading", "paragraph", "unorderedList", "orderedList", "table", "math", "callout", "keyValueGrid", "divider", "code", "quote", "columns", "image", "figure"] as RichBlockType[]);
/** Phase T9 — a sheet's images have their own budget, apart from the 64 KiB of text: at most 4 images, each an uploaded raster of at
 *  most ~1 MB (its data URL length) or a bank image (a durable reference, delivered through a signed URL), ~2 MB in all. The text
 *  bound is measured with the images' data left out, so an image never eats into the text. */
export const FORMULA_SHEET_MAX_IMAGES = 4;
export const FORMULA_SHEET_IMAGE_MAX_CHARS = 1400000;
export const FORMULA_SHEET_IMAGES_MAX_CHARS = 2800000;

export type CalculatorToolV1 = { id: "calculator"; variant: "basic" | "scientific"; angleUnit: "deg" | "rad" };
export type BaseConverterToolV1 = { id: "baseConverter"; bases: NumberBase[]; showSteps: boolean };
export type GraphPlotterToolV1 = { id: "graphPlotter"; maxFunctions: number; showAnalysis: boolean };
export type Ipv4CalculatorToolV1 = { id: "ipv4Calculator"; showBinary: boolean; allowSubnetting: boolean };
export type FormulaSheetToolV1 = { id: "formulaSheet"; title: string; content: RichContentV1 };
export type ScratchPadToolV1 = { id: "scratchPad"; drawing: boolean };
export type AsciiTableToolV1 = { id: "asciiTable"; range: "printable" | "full" };
export type BitwiseCalculatorToolV1 = { id: "bitwiseCalculator"; width: 8 | 16 | 32 };
export type TruthTableToolV1 = { id: "truthTable"; maxVariables: number };
export type UnitConverterToolV1 = { id: "unitConverter"; categories: UnitCategoryId[] };
/** Phase T10 — `range` is additive within version 1: absent (or "curriculum") is Z 1–36, the table every exam published before T10
 *  shows; "all" is Z 1–118. The canonical form carries the key only for "all", so an older spec keeps its exact shape. */
export type PeriodicTableToolV1 = { id: "periodicTable"; showMass: boolean; showConfiguration: boolean; range?: "all" };
/** Phase T13 — empty boxes under the place values (128 … 1); the student writes 0 / 1 and works the value out. Nothing is computed. */
export type PlaceValueBoxesToolV1 = { id: "placeValueBoxes"; width: 4 | 8 | 16 };
/** Phase T13 — the reference list 0 – F: hex, binary (4 bits) and, as the teacher chose, decimal. */
export type HexBinaryTableToolV1 = { id: "hexBinaryTable"; showDecimal: boolean };
/** Phase T14 — a free C# editor (a coding scratch pad: never an answer, never stored, never graded). `allowRun` lets the learner RUN the
 *  code on the isolated Coding Runner — IN A COURSE BOOK ONLY (owner decision): in an exam or assignment the editor is a writing aid
 *  whatever this flag says, and the run route has no exam context at all (api/src/functions/student-tool-run.js). Off ⇒ write only. */
export type CSharpEditorToolV1 = { id: "csharpEditor"; allowRun: boolean };
export type StudentToolConfigV1 = CalculatorToolV1 | BaseConverterToolV1 | GraphPlotterToolV1 | Ipv4CalculatorToolV1 | FormulaSheetToolV1 | ScratchPadToolV1
  | AsciiTableToolV1 | BitwiseCalculatorToolV1 | TruthTableToolV1 | UnitConverterToolV1 | PeriodicTableToolV1 | PlaceValueBoxesToolV1 | HexBinaryTableToolV1
  | CSharpEditorToolV1;

export type StudentToolsSectionOverrideV1 = { disabled: StudentToolId[] };
export type StudentToolsSpecV1 = {
  version: 1;
  tools: StudentToolConfigV1[];
  sectionOverrides?: Record<string, StudentToolsSectionOverrideV1>;
};

export type StudentToolsIssue = { code: string; path: string; message: string };
export type StudentToolsValidation = { ok: true; value: StudentToolsSpecV1; issues: [] } | { ok: false; issues: StudentToolsIssue[] };

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};
const isToolId = (v: unknown): v is StudentToolId => typeof v === "string" && (STUDENT_TOOL_IDS as readonly string[]).includes(v);
const hasControlChar = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0x20 || c === 0x7f) return true; }
  return false;
};

/** The configuration the Builder adds when the teacher switches a tool on. */
export function defaultStudentToolConfig(id: StudentToolId): StudentToolConfigV1 {
  switch (id) {
    case "calculator": return { id, variant: "scientific", angleUnit: "deg" };
    case "baseConverter": return { id, bases: [2, 8, 10, 16], showSteps: false };
    case "graphPlotter": return { id, maxFunctions: GRAPH_MAX_FUNCTIONS_LIMIT, showAnalysis: false };
    case "ipv4Calculator": return { id, showBinary: true, allowSubnetting: false };
    case "formulaSheet": return { id, title: "ورقة القوانين", content: { schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "اكتب هنا القوانين والثوابت المسموحة للطالب." }] }] } };
    case "scratchPad": return { id, drawing: true };
    case "asciiTable": return { id, range: "printable" };
    case "bitwiseCalculator": return { id, width: 8 };
    case "truthTable": return { id, maxVariables: 4 };
    case "unitConverter": return { id, categories: [...UNIT_CATEGORY_IDS] };
    case "periodicTable": return { id, showMass: true, showConfiguration: true, range: "all" };
    case "placeValueBoxes": return { id, width: 8 };
    case "hexBinaryTable": return { id, showDecimal: true };
    case "csharpEditor": return { id, allowRun: false };   // exams: always write only; a book's teacher may switch running on
  }
}

// Per-tool closed key sets (id included).
const TOOL_KEYS: Record<StudentToolId, readonly string[]> = {
  calculator: ["id", "variant", "angleUnit"],
  baseConverter: ["id", "bases", "showSteps"],
  graphPlotter: ["id", "maxFunctions", "showAnalysis"],
  ipv4Calculator: ["id", "showBinary", "allowSubnetting"],
  formulaSheet: ["id", "title", "content"],
  scratchPad: ["id", "drawing"],
  asciiTable: ["id", "range"],
  bitwiseCalculator: ["id", "width"],
  truthTable: ["id", "maxVariables"],
  unitConverter: ["id", "categories"],
  periodicTable: ["id", "showMass", "showConfiguration", "range"],
  placeValueBoxes: ["id", "width"],
  hexBinaryTable: ["id", "showDecimal"],
  csharpEditor: ["id", "allowRun"]
};

const hasControlOrBidi = (s: string): boolean => hasControlChar(s) || /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(s);
function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) { n += 4; i++; } else n += 3;
  }
  return n;
}
/** Every image / figure asset of a document, columns included, in reading order. */
function sheetImageAssets(content: RichContentV1): { dataUrl?: string; origin?: string }[] {
  const out: { dataUrl?: string; origin?: string }[] = [];
  const walk = (blocks: readonly RichContentV1["blocks"][number][]) => {
    for (const b of blocks) {
      if (b.type === "image" || b.type === "figure") out.push(b.asset);
      else if (b.type === "columns") for (const c of b.columns) walk(c.blocks);
    }
  };
  walk(content.blocks);
  return out;
}
/** The document with every image's data left out (the text the 64 KiB bound measures). */
function sheetTextOnly(content: RichContentV1): unknown {
  const strip = (blocks: readonly RichContentV1["blocks"][number][]): unknown[] => blocks.map(b =>
    b.type === "image" || b.type === "figure" ? { ...b, asset: { ...b.asset, dataUrl: "" } }
      : b.type === "columns" ? { ...b, columns: b.columns.map(c => ({ ...c, blocks: strip(c.blocks) })) } : b);
  return { ...content, blocks: strip(content.blocks) };
}
/** Every block type used by a document, columns included. */
function blockTypes(content: RichContentV1): RichBlockType[] {
  const out: RichBlockType[] = [];
  const walk = (blocks: readonly RichContentV1["blocks"][number][]) => { for (const b of blocks) { out.push(b.type); if (b.type === "columns") for (const c of b.columns) walk(c.blocks); } };
  walk(content.blocks);
  return out;
}

type Add = (code: string, path: string, message: string) => void;

function checkClosedKeys(obj: Record<string, unknown>, allowed: readonly string[], path: string, add: Add): void {
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_KEYS.has(k)) add("STUDENT_TOOLS_FORBIDDEN_KEY", path + "." + k, "مفتاح غير مسموح في إعدادات الأدوات.");
    else if (!allowed.includes(k)) add("STUDENT_TOOLS_UNKNOWN_KEY", path + "." + k, "حقل غير معروف في إعدادات الأدوات: «" + k + "».");
  }
}

function readTool(raw: unknown, path: string, add: Add, issues: readonly StudentToolsIssue[]): StudentToolConfigV1 | null {
  if (!isPlainObject(raw)) { add("STUDENT_TOOLS_TOOL_NOT_OBJECT", path, "كل أداة يجب أن تكون كائن إعدادات."); return null; }
  if (!isToolId(raw.id)) { add("STUDENT_TOOLS_UNKNOWN_TOOL", path + ".id", "أداة غير معروفة: «" + String(raw.id) + "»."); return null; }
  const id = raw.id;
  const before = issues.length;
  checkClosedKeys(raw, TOOL_KEYS[id], path, add);
  const bool = (key: string): boolean => {
    if (typeof raw[key] !== "boolean") add("STUDENT_TOOLS_INVALID_VALUE", path + "." + key, "القيمة «" + key + "» يجب أن تكون نعم / لا.");
    return raw[key] === true;
  };
  let value: StudentToolConfigV1 | null = null;
  switch (id) {
    case "calculator": {
      const variant = raw.variant, angleUnit = raw.angleUnit;
      if (variant !== "basic" && variant !== "scientific") add("STUDENT_TOOLS_INVALID_VALUE", path + ".variant", "نوع الآلة الحاسبة يجب أن يكون بسيطة أو علمية.");
      if (angleUnit !== "deg" && angleUnit !== "rad") add("STUDENT_TOOLS_INVALID_VALUE", path + ".angleUnit", "وحدة الزوايا يجب أن تكون درجات أو راديان.");
      value = { id, variant: variant === "basic" ? "basic" : "scientific", angleUnit: angleUnit === "rad" ? "rad" : "deg" };
      break;
    }
    case "baseConverter": {
      const bases: NumberBase[] = [];
      if (!Array.isArray(raw.bases)) add("STUDENT_TOOLS_INVALID_VALUE", path + ".bases", "أنظمة العدّ يجب أن تكون قائمة.");
      else {
        for (const b of raw.bases) {
          if (!(NUMBER_BASES as readonly unknown[]).includes(b)) { add("STUDENT_TOOLS_INVALID_VALUE", path + ".bases", "نظام عدّ غير مدعوم: «" + String(b) + "» (المسموح 2 و8 و10 و16)."); continue; }
          if (bases.includes(b as NumberBase)) { add("STUDENT_TOOLS_DUPLICATE_VALUE", path + ".bases", "نظام العدّ «" + String(b) + "» مكرر."); continue; }
          bases.push(b as NumberBase);
        }
        if (bases.length < 2) add("STUDENT_TOOLS_INVALID_VALUE", path + ".bases", "محوّل الأنظمة يحتاج إلى نظامَي عدّ على الأقل.");
      }
      value = { id, bases: bases.sort((a, b) => a - b), showSteps: bool("showSteps") };
      break;
    }
    case "graphPlotter": {
      const m = raw.maxFunctions;
      if (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > GRAPH_MAX_FUNCTIONS_LIMIT) add("STUDENT_TOOLS_INVALID_VALUE", path + ".maxFunctions", "عدد الدوال يجب أن يكون عددًا صحيحًا من 1 إلى " + GRAPH_MAX_FUNCTIONS_LIMIT + ".");
      value = { id, maxFunctions: typeof m === "number" ? m : 1, showAnalysis: bool("showAnalysis") };
      break;
    }
    case "ipv4Calculator":
      value = { id, showBinary: bool("showBinary"), allowSubnetting: bool("allowSubnetting") };
      break;
    case "formulaSheet": {
      const title = raw.title;
      if (typeof title !== "string" || !title.trim() || title.length > FORMULA_SHEET_TITLE_MAX || hasControlOrBidi(title))
        add("STUDENT_TOOLS_INVALID_VALUE", path + ".title", "عنوان ورقة القوانين مطلوب، بلا محارف تحكم، وبحد أقصى " + FORMULA_SHEET_TITLE_MAX + " محرفًا.");
      // An outer bound first (text + the whole image budget), so a huge value is refused before it is walked.
      let size = Infinity;
      try { size = utf8Length(JSON.stringify(raw.content) ?? ""); } catch { /* cyclic → refused */ }
      if (size > FORMULA_SHEET_MAX_BYTES + FORMULA_SHEET_IMAGES_MAX_CHARS) { add("STUDENT_TOOLS_TOO_LARGE", path + ".content", "ورقة القوانين أكبر من الحد المسموح."); break; }
      const rc = validateRichContent(raw.content, path + ".content");
      if (!rc.ok || !rc.value) { for (const i of rc.issues.slice(0, 5)) add("STUDENT_TOOLS_INVALID_CONTENT", i.path, "ورقة القوانين: " + i.message); break; }
      const refused = [...new Set(blockTypes(rc.value).filter(t => !FORMULA_SHEET_BLOCKS.includes(t)))];
      if (refused.length) { add("STUDENT_TOOLS_BLOCK_NOT_ALLOWED", path + ".content", "ورقة القوانين لا تقبل هذا النوع من المحتوى: " + refused.join("، ") + " (المسموح نصوص ومعادلات وجداول وصور)."); break; }
      // T9 — the text bound (images' data left out), then the image budget.
      if (utf8Length(JSON.stringify(sheetTextOnly(rc.value))) > FORMULA_SHEET_MAX_BYTES) { add("STUDENT_TOOLS_TOO_LARGE", path + ".content", "نص ورقة القوانين أكبر من الحد المسموح."); break; }
      const images = sheetImageAssets(rc.value);
      if (images.length > FORMULA_SHEET_MAX_IMAGES) { add("STUDENT_TOOLS_TOO_LARGE", path + ".content", "ورقة القوانين تقبل " + FORMULA_SHEET_MAX_IMAGES + " صور على الأكثر."); break; }
      const imageChars = images.map(a => (a.origin === "bank" ? 0 : (a.dataUrl ?? "").length));
      if (imageChars.some(n => n > FORMULA_SHEET_IMAGE_MAX_CHARS)) { add("STUDENT_TOOLS_TOO_LARGE", path + ".content", "صورة في ورقة القوانين أكبر من الحد المسموح (نحو 1 ميغابايت للصورة)."); break; }
      if (imageChars.reduce((n, c) => n + c, 0) > FORMULA_SHEET_IMAGES_MAX_CHARS) { add("STUDENT_TOOLS_TOO_LARGE", path + ".content", "صور ورقة القوانين أكبر من الحد المسموح (نحو 2 ميغابايت معًا)."); break; }
      if (typeof title === "string") value = { id, title: title.trim(), content: rc.value };
      break;
    }
    case "scratchPad":
      value = { id, drawing: bool("drawing") };
      break;
    case "asciiTable":
      if (raw.range !== "printable" && raw.range !== "full") add("STUDENT_TOOLS_INVALID_VALUE", path + ".range", "نطاق جدول ASCII يجب أن يكون الرموز المطبوعة أو الجدول كاملًا.");
      value = { id, range: raw.range === "full" ? "full" : "printable" };
      break;
    case "bitwiseCalculator":
      if (!(BIT_WIDTH_OPTIONS as readonly unknown[]).includes(raw.width)) add("STUDENT_TOOLS_INVALID_VALUE", path + ".width", "طول الكلمة يجب أن يكون 8 أو 16 أو 32 بت.");
      value = { id, width: raw.width === 16 ? 16 : raw.width === 32 ? 32 : 8 };
      break;
    case "truthTable": {
      const m = raw.maxVariables;
      if (typeof m !== "number" || !Number.isInteger(m) || m < TRUTH_MAX_VARIABLES_RANGE.min || m > TRUTH_MAX_VARIABLES_RANGE.max)
        add("STUDENT_TOOLS_INVALID_VALUE", path + ".maxVariables", "عدد المتغيرات يجب أن يكون عددًا صحيحًا من " + TRUTH_MAX_VARIABLES_RANGE.min + " إلى " + TRUTH_MAX_VARIABLES_RANGE.max + ".");
      value = { id, maxVariables: typeof m === "number" ? m : TRUTH_MAX_VARIABLES_RANGE.min };
      break;
    }
    case "unitConverter": {
      const cats: UnitCategoryId[] = [];
      if (!Array.isArray(raw.categories) || raw.categories.length === 0) add("STUDENT_TOOLS_INVALID_VALUE", path + ".categories", "اختر فئة وحدات واحدة على الأقل.");
      else for (const c of raw.categories) {
        if (!(UNIT_CATEGORY_IDS as readonly unknown[]).includes(c)) { add("STUDENT_TOOLS_INVALID_VALUE", path + ".categories", "فئة وحدات غير معروفة: «" + String(c) + "»."); continue; }
        if (cats.includes(c as UnitCategoryId)) { add("STUDENT_TOOLS_DUPLICATE_VALUE", path + ".categories", "فئة الوحدات «" + String(c) + "» مكررة."); continue; }
        cats.push(c as UnitCategoryId);
      }
      value = { id, categories: UNIT_CATEGORY_IDS.filter(c => cats.includes(c)) };
      break;
    }
    case "periodicTable":
      if ("range" in raw && raw.range !== "curriculum" && raw.range !== "all") add("STUDENT_TOOLS_INVALID_VALUE", path + ".range", "نطاق الجدول الدوري يجب أن يكون نطاق المنهاج (1–36) أو الجدول كاملًا (1–118).");
      value = { id, showMass: bool("showMass"), showConfiguration: bool("showConfiguration"), ...(raw.range === "all" ? { range: "all" as const } : {}) };
      break;
    case "placeValueBoxes":
      if (!(PLACE_VALUE_WIDTH_OPTIONS as readonly unknown[]).includes(raw.width)) add("STUDENT_TOOLS_INVALID_VALUE", path + ".width", "عدد صناديق التحويل يجب أن يكون 4 أو 8 أو 16.");
      value = { id, width: raw.width === 4 ? 4 : raw.width === 16 ? 16 : 8 };
      break;
    case "hexBinaryTable":
      value = { id, showDecimal: bool("showDecimal") };
      break;
    case "csharpEditor":
      value = { id, allowRun: bool("allowRun") };
      break;
  }
  return issues.length === before ? value : null;
}

/**
 * Strict validation. `ok` ⇒ `value` is the canonical spec (bases sorted ascending, override lists in tool order). Any issue ⇒ no
 * value at all: callers never use a partially valid spec.
 */
export function validateStudentTools(raw: unknown): StudentToolsValidation {
  const issues: StudentToolsIssue[] = [];
  const add: Add = (code, path, message) => { issues.push({ code, path, message }); };
  if (!isPlainObject(raw)) {
    add("STUDENT_TOOLS_NOT_OBJECT", "studentTools", "إعدادات أدوات الطالب يجب أن تكون كائنًا.");
    return { ok: false, issues };
  }
  checkClosedKeys(raw, ["version", "tools", "sectionOverrides"], "studentTools", add);
  if (raw.version !== STUDENT_TOOLS_VERSION) add("STUDENT_TOOLS_UNSUPPORTED_VERSION", "studentTools.version", "إصدار إعدادات الأدوات غير مدعوم.");

  const tools: StudentToolConfigV1[] = [];
  if (!Array.isArray(raw.tools)) add("STUDENT_TOOLS_INVALID_VALUE", "studentTools.tools", "قائمة الأدوات مفقودة أو غير صالحة.");
  else {
    if (raw.tools.length > STUDENT_TOOL_IDS.length) add("STUDENT_TOOLS_TOO_MANY", "studentTools.tools", "عدد الأدوات أكبر من المسموح.");
    raw.tools.forEach((t, i) => {
      const tool = readTool(t, "studentTools.tools[" + i + "]", add, issues);
      if (!tool) return;
      if (tools.some(x => x.id === tool.id)) { add("STUDENT_TOOLS_DUPLICATE_TOOL", "studentTools.tools[" + i + "]", "الأداة «" + tool.id + "» مضافة أكثر من مرة."); return; }
      tools.push(tool);
    });
  }

  let sectionOverrides: Record<string, StudentToolsSectionOverrideV1> | undefined;
  if (raw.sectionOverrides !== undefined) {
    if (!isPlainObject(raw.sectionOverrides)) add("STUDENT_TOOLS_INVALID_VALUE", "studentTools.sectionOverrides", "تخصيص الأقسام يجب أن يكون كائنًا.");
    else {
      const entries = Object.keys(raw.sectionOverrides);
      if (entries.length > MAX_SECTION_OVERRIDES) add("STUDENT_TOOLS_TOO_MANY", "studentTools.sectionOverrides", "عدد تخصيصات الأقسام أكبر من المسموح.");
      sectionOverrides = Object.create(null) as Record<string, StudentToolsSectionOverrideV1>;
      for (const sid of entries) {
        const path = "studentTools.sectionOverrides[" + JSON.stringify(sid) + "]";
        if (FORBIDDEN_KEYS.has(sid)) { add("STUDENT_TOOLS_FORBIDDEN_KEY", path, "معرّف قسم غير مسموح."); continue; }
        if (!sid.trim() || sid.length > MAX_SECTION_ID_LENGTH || hasControlChar(sid)) { add("STUDENT_TOOLS_INVALID_SECTION_ID", path, "معرّف القسم غير صالح."); continue; }
        const o = (raw.sectionOverrides as Record<string, unknown>)[sid];
        if (!isPlainObject(o)) { add("STUDENT_TOOLS_INVALID_VALUE", path, "تخصيص القسم يجب أن يكون كائنًا."); continue; }
        checkClosedKeys(o, ["disabled"], path, add);
        if (!Array.isArray(o.disabled) || o.disabled.length === 0) { add("STUDENT_TOOLS_INVALID_VALUE", path + ".disabled", "قائمة الأدوات المعطّلة في القسم يجب ألا تكون فارغة."); continue; }
        const seen = new Set<string>();
        for (const d of o.disabled) {
          if (!isToolId(d)) { add("STUDENT_TOOLS_UNKNOWN_TOOL", path + ".disabled", "أداة غير معروفة: «" + String(d) + "»."); continue; }
          if (seen.has(d)) { add("STUDENT_TOOLS_DUPLICATE_VALUE", path + ".disabled", "الأداة «" + d + "» مكررة في تعطيل القسم."); continue; }
          if (Array.isArray(raw.tools) && !tools.some(t => t.id === d)) { add("STUDENT_TOOLS_OVERRIDE_NOT_ENABLED", path + ".disabled", "لا يمكن تعطيل الأداة «" + d + "» في قسم لأنها غير مفعّلة في الامتحان."); continue; }
          seen.add(d);
        }
        sectionOverrides[sid] = { disabled: STUDENT_TOOL_IDS.filter(id => seen.has(id)) };
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  const value: StudentToolsSpecV1 = { version: STUDENT_TOOLS_VERSION, tools };
  if (sectionOverrides && Object.keys(sectionOverrides).length) {
    const plain: Record<string, StudentToolsSectionOverrideV1> = {};
    for (const k of Object.keys(sectionOverrides).sort()) plain[k] = sectionOverrides[k];
    value.sectionOverrides = plain;
  }
  return { ok: true, value, issues: [] };
}

/**
 * The ONE student projection: the canonical spec, or undefined (no tools) when the spec is absent, malformed or enables no tool.
 * Never a spread of the raw value, so nothing smuggled beside a valid field can reach the student browser.
 */
export function projectStudentToolsForStudent(raw: unknown): StudentToolsSpecV1 | undefined {
  if (raw === undefined || raw === null) return undefined;
  const v = validateStudentTools(raw);
  if (!v.ok || v.value.tools.length === 0) return undefined;
  return v.value;
}

/** The fixed stand-in for a formula sheet's content before the attempt starts. */
export const PRE_START_SHEET_PLACEHOLDER: RichContentV1 = Object.freeze({ schemaVersion: 1, blocks: [{ type: "paragraph", runs: [{ text: "تظهر ورقة القوانين بعد بدء المحاولة." }] }] }) as RichContentV1;

/**
 * Phase T5 — the PRE-START projection (start screen, before the attempt and its timer begin): the same canonical spec, except that a
 * formula sheet keeps its title but not its content (a fixed placeholder instead). The start screen only announces the tools; the
 * teacher's sheet arrives with the exam body once the attempt has started, so it never gives reading time before the clock runs.
 */
export function projectStudentToolsForPreStart(raw: unknown): StudentToolsSpecV1 | undefined {
  const spec = projectStudentToolsForStudent(raw);
  if (!spec) return undefined;
  return { ...spec, tools: spec.tools.map(t => (t.id === "formulaSheet" ? { ...t, content: PRE_START_SHEET_PLACEHOLDER } : t)) };
}

/** The tools available while the student is in `sectionId` (the exam's tools minus that section's disabled ones), in spec order. */
export function enabledToolsForSection(spec: StudentToolsSpecV1 | undefined, sectionId: string | undefined): StudentToolConfigV1[] {
  if (!spec) return [];
  const disabled = sectionId !== undefined && spec.sectionOverrides && Object.prototype.hasOwnProperty.call(spec.sectionOverrides, sectionId)
    ? spec.sectionOverrides[sectionId].disabled : [];
  return spec.tools.filter(t => !disabled.includes(t.id));
}

/** Phase T14 — whether a BOOK tool set (no sections) lets the learner run code from the C# editor. */
export function csharpRunAllowedInBook(spec: StudentToolsSpecV1 | undefined): boolean {
  const tool = spec?.tools.find(t => t.id === "csharpEditor");
  return !!tool && tool.id === "csharpEditor" && tool.allowRun === true;
}

/** Section overrides that name a section the exam does not have (a blocking quality issue: the teacher's intent cannot be applied). */
export function studentToolsUnknownSectionIssues(spec: StudentToolsSpecV1, sectionIds: readonly string[]): StudentToolsIssue[] {
  const known = new Set(sectionIds);
  return Object.keys(spec.sectionOverrides || {}).filter(sid => !known.has(sid)).map(sid => ({
    code: "STUDENT_TOOLS_UNKNOWN_SECTION",
    path: "studentTools.sectionOverrides[" + JSON.stringify(sid) + "]",
    message: "تخصيص الأدوات يشير إلى قسم غير موجود في الامتحان."
  }));
}

/** Phase T11 — the tools a course book offers when the class's teacher chooses them (docs/enterprise-student-tools-t.md §18). */
export const BOOK_EXCLUDED_TOOLS: readonly StudentToolId[] = Object.freeze(["formulaSheet"] as StudentToolId[]);

/**
 * A course book's tool set, chosen by the teacher for a class: a valid version-1 spec without section overrides (a book has no sections)
 * and without a formula sheet (the book is the reference text, and a sheet would make every class document heavy). An empty tool list is
 * valid: the teacher turned the book's tools off. All or nothing, like validateStudentTools.
 */
export function validateBookStudentTools(raw: unknown): StudentToolsValidation {
  const r = validateStudentTools(raw);
  if (!r.ok) return r;
  const issues: StudentToolsIssue[] = [];
  if (r.value.sectionOverrides) issues.push({ code: "STUDENT_TOOLS_BOOK_NO_SECTIONS", path: "studentTools.sectionOverrides", message: "الكتاب ليس فيه أقسام، فلا تخصيص للأقسام في أدواته." });
  for (const t of r.value.tools) if (BOOK_EXCLUDED_TOOLS.includes(t.id)) issues.push({ code: "STUDENT_TOOLS_BOOK_TOOL_NOT_ALLOWED", path: "studentTools.tools", message: "ورقة القوانين لا تُضاف إلى الكتاب: الكتاب نفسه هو المرجع." });
  return issues.length ? { ok: false, issues } : r;
}
