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

export const STUDENT_TOOLS_VERSION = 1 as const;

/** Every tool of contract version 1, in their default display order. Adding a tool is a reviewed contract change. */
export const STUDENT_TOOL_IDS = ["calculator", "baseConverter", "graphPlotter", "ipv4Calculator"] as const;
export type StudentToolId = (typeof STUDENT_TOOL_IDS)[number];

export const NUMBER_BASES = [2, 8, 10, 16] as const;
export type NumberBase = (typeof NUMBER_BASES)[number];

export const GRAPH_MAX_FUNCTIONS_LIMIT = 3;
export const MAX_SECTION_OVERRIDES = 100;
export const MAX_SECTION_ID_LENGTH = 120;

export type CalculatorToolV1 = { id: "calculator"; variant: "basic" | "scientific"; angleUnit: "deg" | "rad" };
export type BaseConverterToolV1 = { id: "baseConverter"; bases: NumberBase[]; showSteps: boolean };
export type GraphPlotterToolV1 = { id: "graphPlotter"; maxFunctions: number; showAnalysis: boolean };
export type Ipv4CalculatorToolV1 = { id: "ipv4Calculator"; showBinary: boolean; allowSubnetting: boolean };
export type StudentToolConfigV1 = CalculatorToolV1 | BaseConverterToolV1 | GraphPlotterToolV1 | Ipv4CalculatorToolV1;

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
  }
}

// Per-tool closed key sets (id included).
const TOOL_KEYS: Record<StudentToolId, readonly string[]> = {
  calculator: ["id", "variant", "angleUnit"],
  baseConverter: ["id", "bases", "showSteps"],
  graphPlotter: ["id", "maxFunctions", "showAnalysis"],
  ipv4Calculator: ["id", "showBinary", "allowSubnetting"]
};

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

/** The tools available while the student is in `sectionId` (the exam's tools minus that section's disabled ones), in spec order. */
export function enabledToolsForSection(spec: StudentToolsSpecV1 | undefined, sectionId: string | undefined): StudentToolConfigV1[] {
  if (!spec) return [];
  const disabled = sectionId !== undefined && spec.sectionOverrides && Object.prototype.hasOwnProperty.call(spec.sectionOverrides, sectionId)
    ? spec.sectionOverrides[sectionId].disabled : [];
  return spec.tools.filter(t => !disabled.includes(t.id));
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
