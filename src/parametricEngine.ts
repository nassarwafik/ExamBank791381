// Phase 19B — the deterministic PARAMETRIC ENGINE. Pure and dependency-free: no React, no DOM, no I/O, no clock, no Math.random,
// no eval / Function / import(). Compiled into the shared server build (grading, delivery, review) and used by the lazy authoring
// and preview UI. It is reusable by any future parametric family; it knows nothing about a presentation type.
//
//   • a CLOSED expression language: tokenizer → recursive-descent parser → AST → bounded evaluator. Numbers, variable references,
//     parentheses, + - * / % ^ (integer exponent), unary minus and six functions (abs, round, floor, ceil, min, max). Nothing else
//     exists: no member access, strings, arrays, assignments, statements, comparisons outside constraints, or host functions.
//   • constraints: exactly ONE comparison of two expressions (< <= > >= == !=).
//   • bounded integer variables { id, kind: "int", min, max, step }.
//   • the stem template: literal text with {{id}} placeholders, rendered as plain text.
//   • the versioned deterministic generator. generatorVersion 1 = cyrb128(seed text) → sfc32, 12 warm-up outputs, one 53-bit
//     float per variable draw (declared order), index = floor(float × count), value = min + index × step, constraints checked in
//     declared order, at most 100 candidates, then an explicit failure. A future algorithm is a NEW version — v1 never changes.
// This is NOT a general-purpose programming engine and executes no code.

// Phase 19C — generatorVersion 2 (+ expression language 2) is ADDITIVE: version 1 keeps its exact parser, evaluator and generator,
// so every Phase 19B instance replays unchanged. Version 2 = explicit integer / decimal variables on a scaled-integer grid, derived
// values in a validated topological order, the language-2 functions (`^` ≡ pow) and presentation formats.
export const PARAMETRIC_GENERATOR_VERSIONS: readonly number[] = Object.freeze([1, 2]);

// Phase 21A.2 — the expression core (limits, tokenizer, parser, evaluator, reserved names) lives in parametricExpression.ts, re-exported
// here unchanged; this module keeps the generator, the templates, the variable grids, the formats and the derived values.
export * from "./parametricExpression";
import { PARAMETRIC_LIMITS, PARAMETRIC_ID_RE, parseExpression, evaluateExpression, evaluateConstraint, isReservedParametricId, isReservedParametricIdV2, powInt, roundTo, type ExprNode, type ParsedConstraint, type ParametricIssue } from "./parametricExpression";


// ── bounded integer variables ───────────────────────────────────────────────────────────────────────────────────────────
export type ParametricIntVariable = { id: string; kind: "int"; min: number; max: number; step: number };
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const VAR_KEYS = ["id", "kind", "min", "max", "step"];
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const safeInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && Math.abs(v) <= PARAMETRIC_LIMITS.intAbs;
const issue = (code: string, message: string, path?: string): ParametricIssue => (path ? { code, message, path } : { code, message });
export function validateVariables(raw: unknown): { ok: true; variables: ParametricIntVariable[] } | { ok: false; issues: ParametricIssue[] } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PARAMETRIC_LIMITS.variables) return { ok: false, issues: [issue("PARAM_VARIABLES_INVALID", "يجب تعريف من 1 إلى " + PARAMETRIC_LIMITS.variables + " متغيرًا.", "variables")] };
  const issues: ParametricIssue[] = [], out: ParametricIntVariable[] = [], seen = new Set<string>();
  raw.forEach((v, i) => {
    const path = "variables." + i;
    if (!isPlain(v) || !exactKeys(v, VAR_KEYS)) { issues.push(issue("PARAM_VAR_INVALID", "تعريف المتغير " + (i + 1) + " يحتوي حقولًا غير معروفة أو ناقصة.", path)); return; }
    if (typeof v.id !== "string" || !PARAMETRIC_ID_RE.test(v.id)) { issues.push(issue("PARAM_VAR_ID_INVALID", "معرّف المتغير " + (i + 1) + " غير صالح (حرف إنجليزي أولًا ثم حروف أو أرقام أو _، حتى 32 حرفًا).", path + ".id")); return; }
    if (isReservedParametricId(v.id)) { issues.push(issue("PARAM_VAR_ID_RESERVED", "الاسم «" + v.id + "» محجوز ولا يصلح معرّفًا لمتغير.", path + ".id")); return; }
    if (seen.has(v.id)) { issues.push(issue("PARAM_VAR_ID_DUPLICATE", "المتغير «" + v.id + "» معرّف أكثر من مرة.", path + ".id")); return; }
    seen.add(v.id);
    if (v.kind !== "int") { issues.push(issue("PARAM_VAR_KIND_UNSUPPORTED", "المتغير «" + v.id + "»: الإصدار 1 يدعم الأعداد الصحيحة فقط.", path + ".kind")); return; }
    if (!safeInt(v.min) || !safeInt(v.max)) { issues.push(issue("PARAM_VAR_BOUNDS_INVALID", "حدّا المتغير «" + v.id + "» يجب أن يكونا عددين صحيحين بين ‎-1,000,000,000‎ و‎1,000,000,000‎.", path)); return; }
    if (v.min > v.max) { issues.push(issue("PARAM_VAR_RANGE_IMPOSSIBLE", "الحد الأدنى للمتغير «" + v.id + "» أكبر من الحد الأعلى.", path)); return; }
    if (typeof v.step !== "number" || !Number.isSafeInteger(v.step) || v.step < 1) { issues.push(issue("PARAM_VAR_STEP_INVALID", "خطوة المتغير «" + v.id + "» يجب أن تكون عددًا صحيحًا موجبًا.", path + ".step")); return; }
    if ((v.max - v.min) % v.step !== 0) { issues.push(issue("PARAM_VAR_STEP_MISALIGNED", "الخطوة لا تصل من الحد الأدنى إلى الحد الأعلى للمتغير «" + v.id + "» (الفرق يجب أن يقبل القسمة على الخطوة).", path + ".step")); return; }
    out.push({ id: v.id, kind: "int", min: v.min, max: v.max, step: v.step });
  });
  return issues.length ? { ok: false, issues } : { ok: true, variables: out };
}

// ── the {{id}} template ─────────────────────────────────────────────────────────────────────────────────────────────────
export type TemplatePart = { t: "text"; v: string } | { t: "var"; id: string };
export function parseTemplate(text: unknown, declared: ReadonlySet<string> | null): { ok: true; parts: TemplatePart[]; refs: string[] } | { ok: false; issues: ParametricIssue[] } {
  const malformed = (m: string) => ({ ok: false as const, issues: [issue("PARAM_TEMPLATE_MALFORMED", m, "text")] });
  if (typeof text !== "string") return malformed("نص السؤال غير صالح.");
  if (text.length > PARAMETRIC_LIMITS.templateChars) return { ok: false, issues: [issue("PARAM_TEMPLATE_TOO_LONG", "نص السؤال أطول من الحد المسموح.", "text")] };
  if (text.includes("${") || text.includes("{{{") || text.includes("}}}")) return malformed("نص السؤال يحتوي صيغة قالب غير مدعومة؛ استخدم {{اسم_المتغير}} فقط.");
  const parts: TemplatePart[] = [], refs = new Set<string>(), unknown = new Set<string>();
  let i = 0, count = 0;
  for (;;) {
    const open = text.indexOf("{{", i);
    const chunk = open < 0 ? text.slice(i) : text.slice(i, open);
    if (chunk.includes("}}")) return malformed("في نص السؤال «}}» بلا «{{» مقابلة.");
    if (chunk) parts.push({ t: "text", v: chunk });
    if (open < 0) break;
    const close = text.indexOf("}}", open + 2);
    if (close < 0) return malformed("في نص السؤال «{{» بلا «}}» مقابلة.");
    const id = text.slice(open + 2, close);
    if (!PARAMETRIC_ID_RE.test(id) || isReservedParametricId(id)) return malformed("العنصر «{{" + id.slice(0, 40) + "}}» ليس اسم متغير صالحًا.");
    if (++count > PARAMETRIC_LIMITS.placeholders) return malformed("عدد المتغيرات في نص السؤال أكبر من الحد المسموح.");
    if (declared && !declared.has(id)) unknown.add(id);
    refs.add(id);
    parts.push({ t: "var", id });
    i = close + 2;
  }
  if (unknown.size) return { ok: false, issues: [...unknown].map(id => issue("PARAM_TEMPLATE_UNKNOWN_VARIABLE", "نص السؤال يستخدم متغيرًا غير معرّف: «" + id + "».", "text")) };
  return { ok: true, parts, refs: [...refs].sort() };
}
/** A generated value as plain text (integers verbatim; anything else to 12 significant digits). */
export const formatParametricNumber = (v: number): string => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12))));
/** Renders the stem. `formats` (generator 2) only changes how a value is WRITTEN; grading always uses the exact value. */
export function renderTemplate(parts: readonly TemplatePart[], values: Readonly<Record<string, number>>, formats?: Readonly<Record<string, ParametricFormat | undefined>>): string {
  return parts.map(p => (p.t === "text" ? p.v : Object.prototype.hasOwnProperty.call(values, p.id) ? formatParametricValue(values[p.id], formats && Object.prototype.hasOwnProperty.call(formats, p.id) ? formats[p.id] : undefined) : "…")).join("");
}

// ── Phase 19C: presentation formats (display only) ──────────────────────────────────────────────────────────────────────
export type ParametricFormat = { kind: "plain" } | { kind: "fixed"; decimals: number } | { kind: "percentage"; decimals: number };
const formatDecimalsOk = (d: unknown): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= PARAMETRIC_LIMITS.formatDecimals;
/** Strict format reader: plain | fixed(decimals 0..10) | percentage(decimals 0..10), exact keys; anything else is null. */
export function validateParametricFormat(raw: unknown): ParametricFormat | null {
  if (!isPlain(raw)) return null;
  if (raw.kind === "plain" && exactKeys(raw, ["kind"])) return { kind: "plain" };
  if ((raw.kind === "fixed" || raw.kind === "percentage") && exactKeys(raw, ["kind", "decimals"]) && formatDecimalsOk(raw.decimals)) return { kind: raw.kind, decimals: raw.decimals };
  return null;
}
/** plain = 12 significant digits (integers verbatim); fixed = exactly `decimals` places; percentage = value × 100 with `decimals`
 *  places and «%». Rounding is half away from zero (the engine's round()); a negative zero is written as zero. */
export function formatParametricValue(v: number, format?: ParametricFormat): string {
  if (!format || format.kind === "plain") return formatParametricNumber(v === 0 ? 0 : v);
  const scaled = format.kind === "percentage" ? v * 100 : v;
  const r = roundTo(scaled, format.decimals);
  return (r === 0 ? 0 : r).toFixed(format.decimals) + (format.kind === "percentage" ? "%" : "");
}
/**
 * The number a STUDENT may know for a displayed symbol: re-read from the displayed text only (same units as the value; a percentage
 * "18.5%" ⇒ 0.185), so a format never becomes a hidden-precision side channel. Integers (all v1 values) are returned unchanged.
 * Display only — grading, the teacher review and teacher samples always use the exact value.
 */
export function displayedParametricValue(v: number, format?: ParametricFormat): number {
  const text = formatParametricValue(v, format);
  const n = format && format.kind === "percentage" ? Number((Number(text.slice(0, -1)) / 100).toFixed(format.decimals + 2)) : Number(text);
  return n === 0 ? 0 : n;
}

// ── Phase 19C: explicit integer / decimal variables on a scaled-integer grid ─────────────────────────────────────────────
export type ParametricVariableV2 = { id: string; kind: "integer" | "decimal"; min: number; max: number; step: number; format?: ParametricFormat };
type Grid = { base: number; step: number; count: number; decimals: number; scale: number };
/** The smallest k ≤ 6 such that x has exactly k decimals (x === Number(x.toFixed(k))), or -1. */
function decimalPlaces(x: number): number {
  for (let k = 0; k <= PARAMETRIC_LIMITS.decimalPlaces; k++) if (Number(x.toFixed(k)) === x) return k;
  return -1;
}
function gridOf(v: { min: number; max: number; step: number }): Grid | null {
  const dm = decimalPlaces(v.min), dx = decimalPlaces(v.max), ds = decimalPlaces(v.step);
  if (dm < 0 || dx < 0 || ds < 0) return null;
  const decimals = Math.max(dm, dx, ds), scale = powInt(10, decimals);
  const base = Math.round(v.min * scale), top = Math.round(v.max * scale), step = Math.round(v.step * scale);
  if (step < 1 || top < base || (top - base) % step !== 0) return null;
  return { base, step, count: (top - base) / step + 1, decimals, scale };
}
/** The value at grid position `index` — computed from integers (no step accumulation), normalized to the grid's decimals. */
const gridValue = (g: Grid, index: number): number => { const v = Number(((g.base + index * g.step) / g.scale).toFixed(g.decimals)); return v === 0 ? 0 : v; };
const finiteBound = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= PARAMETRIC_LIMITS.intAbs;
const VAR2_REQUIRED = ["id", "kind", "min", "max"], VAR2_OPTIONAL = ["step", "format"];
export function validateVariablesV2(raw: unknown): { ok: true; variables: ParametricVariableV2[] } | { ok: false; issues: ParametricIssue[] } {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PARAMETRIC_LIMITS.variables) return { ok: false, issues: [issue("PARAM_VARIABLES_INVALID", "يجب تعريف من 1 إلى " + PARAMETRIC_LIMITS.variables + " متغيرًا.", "variables")] };
  const issues: ParametricIssue[] = [], out: ParametricVariableV2[] = [], seen = new Set<string>();
  raw.forEach((v, i) => {
    const path = "variables." + i, n = i + 1;
    if (!isPlain(v) || !VAR2_REQUIRED.every(k => Object.prototype.hasOwnProperty.call(v, k)) || Object.keys(v).some(k => !VAR2_REQUIRED.includes(k) && !VAR2_OPTIONAL.includes(k))) { issues.push(issue("PARAM_VAR_INVALID", "تعريف المتغير " + n + " يحتوي حقولًا غير معروفة أو ناقصة (النوع مطلوب صراحةً).", path)); return; }
    if (typeof v.id !== "string" || !PARAMETRIC_ID_RE.test(v.id)) { issues.push(issue("PARAM_VAR_ID_INVALID", "معرّف المتغير " + n + " غير صالح (حرف إنجليزي أولًا ثم حروف أو أرقام أو _، حتى 32 حرفًا).", path + ".id")); return; }
    if (isReservedParametricIdV2(v.id)) { issues.push(issue("PARAM_VAR_ID_RESERVED", "الاسم «" + v.id + "» محجوز ولا يصلح معرّفًا لمتغير.", path + ".id")); return; }
    if (seen.has(v.id)) { issues.push(issue("PARAM_VAR_ID_DUPLICATE", "المتغير «" + v.id + "» معرّف أكثر من مرة.", path + ".id")); return; }
    seen.add(v.id);
    if (v.kind !== "integer" && v.kind !== "decimal") { issues.push(issue("PARAM_VAR_KIND_UNSUPPORTED", "نوع المتغير «" + v.id + "» يجب أن يكون عددًا صحيحًا أو عشريًا.", path + ".kind")); return; }
    let format: ParametricFormat | undefined;
    if (v.format !== undefined) { const f = validateParametricFormat(v.format); if (!f) { issues.push(issue("PARAM_FORMAT_INVALID", "تنسيق عرض المتغير «" + v.id + "» غير صالح.", path + ".format")); return; } format = f; }
    const integer = v.kind === "integer";
    if (!finiteBound(v.min) || !finiteBound(v.max) || (integer && (!Number.isSafeInteger(v.min) || !Number.isSafeInteger(v.max)))) { issues.push(issue("PARAM_VAR_BOUNDS_INVALID", "حدّا المتغير «" + v.id + "» يجب أن يكونا عددين" + (integer ? " صحيحين" : "") + " بين ‎-1,000,000,000‎ و‎1,000,000,000‎.", path)); return; }
    const step = v.step === undefined && integer ? 1 : v.step;
    if (typeof step !== "number" || !Number.isFinite(step) || step <= 0 || step > PARAMETRIC_LIMITS.intAbs || (integer && !Number.isSafeInteger(step))) { issues.push(issue("PARAM_VAR_STEP_INVALID", "خطوة المتغير «" + v.id + "» يجب أن تكون عددًا موجبًا" + (integer ? " صحيحًا" : "") + ".", path + ".step")); return; }
    if (decimalPlaces(v.min) < 0 || decimalPlaces(v.max) < 0 || decimalPlaces(step) < 0) { issues.push(issue("PARAM_VAR_PRECISION", "قيم المتغير «" + v.id + "» تحتمل 6 منازل عشرية على الأكثر.", path)); return; }
    if (v.min > v.max) { issues.push(issue("PARAM_VAR_RANGE_IMPOSSIBLE", "الحد الأدنى للمتغير «" + v.id + "» أكبر من الحد الأعلى.", path)); return; }
    const g = gridOf({ min: v.min, max: v.max, step });
    if (!g) { issues.push(issue("PARAM_VAR_STEP_MISALIGNED", "الخطوة لا تصل من الحد الأدنى إلى الحد الأعلى للمتغير «" + v.id + "» (الفرق يجب أن يكون مضاعفًا للخطوة).", path + ".step")); return; }
    if (g.count > PARAMETRIC_LIMITS.positions) { issues.push(issue("PARAM_VAR_TOO_MANY_POSITIONS", "عدد القيم الممكنة للمتغير «" + v.id + "» أكبر من الحد المسموح (" + PARAMETRIC_LIMITS.positions + ").", path)); return; }
    out.push({ id: v.id, kind: v.kind, min: v.min, max: v.max, step, ...(format ? { format } : {}) });
  });
  return issues.length ? { ok: false, issues } : { ok: true, variables: out };
}

// ── Phase 19C: derived variables (validated dependency graph, deterministic topological order) ──────────────────────────
export type CompiledDerivedVariable = { id: string; expression: string; format?: ParametricFormat; ast: ExprNode; refs: string[] };
const DERIVED_KEYS = ["id", "expression", "format"];
/**
 * Validates derived values against the base variables: exact keys, ids (not reserved, unique, not a base name), language-2
 * expressions referencing only base / other derived names (never themselves), and an ACYCLIC dependency graph. The returned list is in
 * topological order (ties broken by declaration order — deterministic), which is the evaluation order.
 */
export function validateDerivedVariables(raw: unknown, baseIds: ReadonlySet<string>): { ok: true; derived: CompiledDerivedVariable[]; order: string[] } | { ok: false; issues: ParametricIssue[] } {
  if (!Array.isArray(raw)) return { ok: false, issues: [issue("PARAM_DERIVED_INVALID", "القيم المشتقة يجب أن تكون قائمة.", "derivedVariables")] };
  if (raw.length > PARAMETRIC_LIMITS.derivedVariables) return { ok: false, issues: [issue("PARAM_DERIVED_TOO_MANY", "عدد القيم المشتقة أكبر من " + PARAMETRIC_LIMITS.derivedVariables + ".", "derivedVariables")] };
  const issues: ParametricIssue[] = [], compiled: CompiledDerivedVariable[] = [];
  const ids = raw.map(d => (isPlain(d) && typeof d.id === "string" ? d.id : ""));
  const seen = new Set<string>();
  raw.forEach((d, i) => {
    const path = "derivedVariables." + i, n = i + 1;
    if (!isPlain(d) || !["id", "expression"].every(k => Object.prototype.hasOwnProperty.call(d, k)) || Object.keys(d).some(k => !DERIVED_KEYS.includes(k))) { issues.push(issue("PARAM_DERIVED_INVALID", "تعريف القيمة المشتقة " + n + " يحتوي حقولًا غير معروفة أو ناقصة.", path)); return; }
    if (typeof d.id !== "string" || !PARAMETRIC_ID_RE.test(d.id) || isReservedParametricIdV2(d.id)) { issues.push(issue("PARAM_DERIVED_ID_INVALID", "اسم القيمة المشتقة " + n + " غير صالح أو محجوز.", path + ".id")); return; }
    if (seen.has(d.id)) { issues.push(issue("PARAM_DERIVED_ID_DUPLICATE", "القيمة المشتقة «" + d.id + "» معرّفة أكثر من مرة.", path + ".id")); return; }
    seen.add(d.id);
    if (baseIds.has(d.id)) { issues.push(issue("PARAM_DERIVED_COLLISION", "الاسم «" + d.id + "» مستخدم لمتغير أساسي؛ اختر اسمًا آخر للقيمة المشتقة.", path + ".id")); return; }
    let format: ParametricFormat | undefined;
    if (d.format !== undefined) { const f = validateParametricFormat(d.format); if (!f) { issues.push(issue("PARAM_FORMAT_INVALID", "تنسيق عرض القيمة المشتقة «" + d.id + "» غير صالح.", path + ".format")); return; } format = f; }
    const p = parseExpression(d.expression, { language: 2 });
    if (!p.ok) { issues.push(issue("PARAM_DERIVED_EXPRESSION_INVALID", "صيغة القيمة المشتقة «" + d.id + "» غير صالحة (" + p.code + ").", path + ".expression")); return; }
    if (p.refs.includes(d.id)) { issues.push(issue("PARAM_DERIVED_SELF_REFERENCE", "صيغة القيمة المشتقة «" + d.id + "» تشير إلى نفسها.", path + ".expression")); return; }
    const unknown = p.refs.filter(r => !baseIds.has(r) && !ids.includes(r));
    if (unknown.length) { issues.push(issue("PARAM_DERIVED_UNKNOWN_REFERENCE", "صيغة القيمة المشتقة «" + d.id + "» تستخدم رمزًا غير معرّف: " + unknown.join("، "), path + ".expression")); return; }
    compiled.push({ id: d.id, expression: d.expression as string, ...(format ? { format } : {}), ast: p.ast, refs: p.refs });
  });
  if (issues.length) return { ok: false, issues };
  const derivedIds = new Set(compiled.map(c => c.id)), done = new Set<string>(), order: CompiledDerivedVariable[] = [];
  for (let round = 0; round < compiled.length; round++) {
    const next = compiled.find(c => !done.has(c.id) && c.refs.every(r => !derivedIds.has(r) || done.has(r)));
    if (!next) break;
    done.add(next.id); order.push(next);
  }
  if (order.length !== compiled.length) {
    const stuck = compiled.filter(c => !done.has(c.id)).map(c => c.id);
    return { ok: false, issues: [issue("PARAM_DERIVED_CYCLE", "القيم المشتقة تعتمد على بعضها في حلقة دورية: " + stuck.join("، "), "derivedVariables")] };
  }
  return { ok: true, derived: order, order: order.map(c => c.id) };
}
/** A constraint with both evaluated sides (teacher inspection). */
export function explainConstraint(c: ParsedConstraint, values: ReadonlyMap<string, number>): { ok: true; left: number; right: number; holds: boolean } | { ok: false; code: string } {
  const l = evaluateExpression(c.left, values); if (!l.ok) return l;
  const r = evaluateExpression(c.right, values); if (!r.ok) return r;
  const h = evaluateConstraint(c, values);
  return h.ok ? { ok: true, left: l.value, right: r.value, holds: h.holds } : h;
}

// ── generation identity and the versioned deterministic generator ───────────────────────────────────────────────────────
/** The server-owned identity of ONE official instance. Never chosen by a client; contains no grading secret. */
export type ParametricGenerationIdentity = { assignmentId: string; studentId: string; attemptNumber: number; questionKey: string };
const idString = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= PARAMETRIC_LIMITS.identityChars;
export function validateGenerationIdentity(raw: unknown): ParametricGenerationIdentity | null {
  if (!isPlain(raw)) return null;
  const { assignmentId, studentId, attemptNumber, questionKey } = raw;
  if (!idString(assignmentId) || !idString(studentId) || !idString(questionKey)) return null;
  if (typeof attemptNumber !== "number" || !Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > PARAMETRIC_LIMITS.maxAttemptNumber) return null;
  return { assignmentId, studentId, attemptNumber, questionKey };
}
/** Canonical, unambiguous seed text of an OFFICIAL instance (a JSON array — no delimiter can be forged inside an id). */
export const officialSeedText = (generatorVersion: number, id: ParametricGenerationIdentity): string => JSON.stringify(["smartassess.parametric", generatorVersion, "official", id.assignmentId, id.studentId, id.attemptNumber, id.questionKey]);
/** Seed text of a TEACHER PREVIEW sample — a separate namespace that can never equal an official seed. */
export const previewSeedText = (generatorVersion: number, questionKey: string, sample: number): string => JSON.stringify(["smartassess.parametric", generatorVersion, "preview", questionKey, sample]);

function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233); h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233); h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return t >>> 0;
  };
}
/** Audit digest of a seed text (hex of its cyrb128 hash) — identifies the instance without exposing anything private. */
export const seedDigest = (seedText: string): string => cyrb128(seedText).map(x => x.toString(16).padStart(8, "0")).join("");

export type GenerationInput = { generatorVersion: number; variables: readonly ParametricIntVariable[]; constraints: readonly ParsedConstraint[] };
export type GenerationResult = { ok: true; values: Record<string, number>; attempt: number } | { ok: false; code: "GEN_UNSUPPORTED_VERSION" | "GEN_INVALID_INPUT" | "GEN_CONSTRAINTS_UNSATISFIED" };
export function generateInstance(input: GenerationInput, seedText: string): GenerationResult {
  if (input.generatorVersion !== 1) return { ok: false, code: "GEN_UNSUPPORTED_VERSION" };
  if (!Array.isArray(input.variables) || !Array.isArray(input.constraints) || typeof seedText !== "string") return { ok: false, code: "GEN_INVALID_INPUT" };
  const [a, b, c, d] = cyrb128(seedText);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) next();
  const float = () => { const u1 = next(), u2 = next(); return ((u1 >>> 5) * 67108864 + (u2 >>> 6)) / 9007199254740992; };
  for (let attempt = 1; attempt <= PARAMETRIC_LIMITS.attempts; attempt++) {
    const values: Record<string, number> = {};
    for (const v of input.variables) {
      const count = (v.max - v.min) / v.step + 1;
      values[v.id] = v.min + Math.floor(float() * count) * v.step;
    }
    const env = new Map(Object.entries(values));
    let accepted = true;
    for (const c of input.constraints) { const r = evaluateConstraint(c, env); if (!r.ok || !r.holds) { accepted = false; break; } }    // an erroring constraint never holds
    if (accepted) return { ok: true, values, attempt };
  }
  return { ok: false, code: "GEN_CONSTRAINTS_UNSATISFIED" };
}

// ── Phase 19C: generatorVersion 2 ───────────────────────────────────────────────────────────────────────────────────────
// Same seeded stream as v1 (cyrb128 → sfc32, 12 warm-up outputs, one 53-bit float per draw) over the version-2 seed text; per candidate
// every base variable takes grid position floor(float × count) (integers only — no step accumulation, no drift), derived values are
// evaluated in their validated topological order, then the constraints in declared order. A candidate whose derived value or
// constraint cannot be evaluated is rejected. At most PARAMETRIC_LIMITS.attempts candidates (a counted for-loop), then an explicit failure.
export type GenerationInputV2 = { variables: readonly ParametricVariableV2[]; derived: readonly CompiledDerivedVariable[]; constraints: readonly ParsedConstraint[] };
export type GenerationResultV2 = { ok: true; values: Record<string, number>; derived: Record<string, number>; attempt: number } | { ok: false; code: "GEN_INVALID_INPUT" | "GEN_CONSTRAINTS_UNSATISFIED" };
export function generateInstanceV2(input: GenerationInputV2, seedText: string): GenerationResultV2 {
  if (!Array.isArray(input.variables) || !Array.isArray(input.derived) || !Array.isArray(input.constraints) || typeof seedText !== "string") return { ok: false, code: "GEN_INVALID_INPUT" };
  const grids: Grid[] = [];
  for (const v of input.variables) { const g = gridOf(v); if (!g || g.count > PARAMETRIC_LIMITS.positions) return { ok: false, code: "GEN_INVALID_INPUT" }; grids.push(g); }
  const [a, b, c, d] = cyrb128(seedText);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) next();
  const float = () => { const u1 = next(), u2 = next(); return ((u1 >>> 5) * 67108864 + (u2 >>> 6)) / 9007199254740992; };
  for (let attempt = 1; attempt <= PARAMETRIC_LIMITS.attempts; attempt++) {
    const values: Record<string, number> = {};
    input.variables.forEach((v, i) => { values[v.id] = gridValue(grids[i], Math.floor(float() * grids[i].count)); });
    const env = new Map(Object.entries(values)), derived: Record<string, number> = {};
    let accepted = true;
    for (const dv of input.derived) { const r = evaluateExpression(dv.ast, env); if (!r.ok) { accepted = false; break; } derived[dv.id] = r.value; env.set(dv.id, r.value); }
    if (accepted) for (const cn of input.constraints) { const r = evaluateConstraint(cn, env); if (!r.ok || !r.holds) { accepted = false; break; } }
    if (accepted) return { ok: true, values, derived, attempt };
  }
  return { ok: false, code: "GEN_CONSTRAINTS_UNSATISFIED" };
}
