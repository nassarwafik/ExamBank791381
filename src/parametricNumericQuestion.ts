// Phase 19B — parametricNumeric@1 («سؤال رقمي بمعطيات متغيرة»): the first question family on the parametric engine. Pure (no
// React, no DOM, no I/O): compiled into the shared server build (validator, grader, sanitizer, ingest, teacher review) and used by
// the lazy editor / renderer. The engine (src/parametricEngine.ts) owns the language and generation; this module owns the CONTRACT.
//
//   PUBLIC   question.parametric = { v: 1, generatorVersion: 1, variables: [{ id, kind: "int", min, max, step }], constraints: [..],
//            response: { unit: "none" } | { unit: "label", label } | { unit: "input" } }; the stem `question.text` is the {{id}}
//            template. A student NEVER receives this object — only the per-attempt projection below.
//   PRIVATE  question.answer = { expression, mode: "tolerance", tolerance, unit? } | { expression, mode: "range", below, above, unit? }
//            (unit exactly when response.unit is "input"). Removed by the sanitizer like every answer key.
//   STUDENT  { text: rendered stem, parametric: { v: 1, status: "ready", generatorVersion, values, response } | { v: 1, status: "unavailable" } }
//   ANSWER   the existing numeric Answer { kind: "numeric", value, unit? } — nothing else is ever accepted from a client.
// The official instance is regenerated from the SERVER-owned identity { assignmentId, studentId, attemptNumber, questionKey } and the
// generator version; no generated value or computed answer is ever persisted as authority, and a client can never name a seed.
import {
  PARAMETRIC_GENERATOR_VERSIONS, PARAMETRIC_ID_RE, PARAMETRIC_LIMITS, evaluateExpression, explainConstraint, generateInstance, generateInstanceV2, officialSeedText, parseConstraint,
  parseExpression, parseTemplate, previewSeedText, renderTemplate, seedDigest, validateDerivedVariables, validateGenerationIdentity, validateVariables, validateVariablesV2,
  type CompiledDerivedVariable, type ExprNode, type ParametricFormat, type ParametricGenerationIdentity, type ParametricIntVariable, type ParametricIssue, type ParametricVariableV2,
  type ParsedConstraint, type TemplatePart
} from "./parametricEngine";
import { scoreNumericResponse } from "./questionTypeScoring";

export const PARAMETRIC_NUMERIC_TYPE_KEY = "parametricNumeric";
export const PARAMETRIC_NUMERIC_CONFIG_VERSION = 1;
/** Deterministic authoring-time sample count (preview namespace) used by the validator to catch impossible / failing contracts. */
export const PARAMETRIC_PREVIEW_SAMPLES = 8;
export const PARAMETRIC_NUMERIC_LIMITS = Object.freeze({ unitChars: 32, responseChars: 64, toleranceMax: 1e9, maxSample: 1_000_000 });

export type ParametricResponsePresentation = { unit: "none" } | { unit: "label"; label: string } | { unit: "input" };
export type ParametricNumericConfigV1 = { v: 1; generatorVersion: number; variables: ParametricIntVariable[]; constraints: string[]; response: ParametricResponsePresentation };
// Phase 19C — the v2 contract (generatorVersion 2): explicit integer / decimal variables, derived values, constraints over base +
// derived values, display formats. A v1 config is dispatched to the frozen Phase 19B path; versions are never mixed.
export type ParametricDerivedVariableV2 = { id: string; expression: string; format?: ParametricFormat };
export type ParametricNumericConfigV2 = { v: 2; generatorVersion: 2; variables: ParametricVariableV2[]; derivedVariables: ParametricDerivedVariableV2[]; constraints: string[]; response: ParametricResponsePresentation };
export type ParametricNumericConfig = ParametricNumericConfigV1 | ParametricNumericConfigV2;
export type ParametricNumericAnswerKeyV1 =
  | { expression: string; mode: "tolerance"; tolerance: number; unit?: string }
  | { expression: string; mode: "range"; below: number; above: number; unit?: string };
export type ParametricStudentProjection =
  | { v: 1; status: "ready"; generatorVersion: number; values: Record<string, number>; response: ParametricResponsePresentation }
  | { v: 1; status: "unavailable" };
export type ParametricQuestionIssue = ParametricIssue & { severity: "error" };

/** New questions use the v2 contract (Phase 19C). Existing v1 questions keep v1 until a teacher explicitly upgrades a draft. */
export function defaultParametricNumericConfig(): ParametricNumericConfigV2 {
  return { v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 1, max: 10, step: 1 }, { id: "b", kind: "integer", min: 1, max: 10, step: 1 }], derivedVariables: [], constraints: [], response: { unit: "none" } };
}
export function defaultParametricNumericAnswerKey(): ParametricNumericAnswerKeyV1 { return { expression: "", mode: "tolerance", tolerance: 0 }; }

// ── helpers ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every(k => has(o, k));
const err = (code: string, message: string, path?: string): ParametricIssue => (path ? { code, message, path } : { code, message });
const finiteNonNeg = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= PARAMETRIC_NUMERIC_LIMITS.toleranceMax;
const unitString = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.length <= PARAMETRIC_NUMERIC_LIMITS.unitChars;
const questionKeyOf = (node: Record<string, unknown>): string => (typeof node.examQuestionId === "string" && node.examQuestionId ? node.examQuestionId : typeof node.id === "string" && node.id ? node.id : "question");

function checkResponse(raw: unknown): ParametricResponsePresentation | null {
  if (!isPlain(raw)) return null;
  if (raw.unit === "none" && exactKeys(raw, ["unit"])) return { unit: "none" };
  if (raw.unit === "input" && exactKeys(raw, ["unit"])) return { unit: "input" };
  if (raw.unit === "label" && exactKeys(raw, ["unit", "label"]) && unitString(raw.label)) return { unit: "label", label: raw.label.trim() };
  return null;
}

/** A validated config of either version. `ids` = every symbol a stem / expression may use (v2: base + derived). */
type CheckedConfig = { version: 1 | 2; config: ParametricNumericConfig; constraints: ParsedConstraint[]; constraintSources: string[]; ids: Set<string>; baseIds: string[]; derived: CompiledDerivedVariable[]; variablesV2: ParametricVariableV2[]; formats: Record<string, ParametricFormat> };
const V2_KEYS = ["v", "generatorVersion", "variables", "derivedVariables", "constraints", "response"];
function checkConfig(raw: unknown): { ok: true; value: CheckedConfig } | { ok: false; issues: ParametricIssue[] } {
  if (!isPlain(raw)) return { ok: false, issues: [err("PARAM_CONFIG_MISSING", "إعداد السؤال الرقمي ذي المعطيات المتغيرة مفقود.", "parametric")] };
  if (raw.v === 2) return checkConfigV2(raw);
  if (raw.v !== 1 && !Object.keys(raw).some(k => FORBIDDEN_KEYS.has(k)) && Object.keys(raw).every(k => V2_KEYS.includes(k))) return { ok: false, issues: [err("PARAM_CONFIG_VERSION", "إصدار إعداد السؤال غير مدعوم.", "parametric.v")] };
  // ── v1 (Phase 19B) — unchanged ──
  if (!exactKeys(raw, ["v", "generatorVersion", "variables", "constraints", "response"]) || Object.keys(raw).some(k => FORBIDDEN_KEYS.has(k))) return { ok: false, issues: [err("PARAM_CONFIG_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة أو ناقصة.", "parametric")] };
  if (raw.v !== 1) return { ok: false, issues: [err("PARAM_CONFIG_VERSION", "إصدار إعداد السؤال غير مدعوم.", "parametric.v")] };
  if (raw.generatorVersion !== 1) return { ok: false, issues: [err("PARAM_GENERATOR_UNSUPPORTED", "إصدار مولّد القيم غير مدعوم.", "parametric.generatorVersion")] };
  const issues: ParametricIssue[] = [];
  const vars = validateVariables(raw.variables);
  if (!vars.ok) issues.push(...vars.issues);
  const ids = new Set(vars.ok ? vars.variables.map(v => v.id) : []);
  const constraints: ParsedConstraint[] = [];
  if (!Array.isArray(raw.constraints) || raw.constraints.length > PARAMETRIC_LIMITS.constraints) issues.push(err("PARAM_CONSTRAINTS_INVALID", "القيود يجب أن تكون قائمة من " + PARAMETRIC_LIMITS.constraints + " قيدًا على الأكثر.", "parametric.constraints"));
  else raw.constraints.forEach((c, i) => {
    const p = parseConstraint(c);
    if (!p.ok) { issues.push(err("PARAM_CONSTRAINT_INVALID", "القيد " + (i + 1) + " ليس مقارنة صالحة (" + p.code + ").", "parametric.constraints." + i)); return; }
    const unknown = vars.ok ? p.refs.filter(r => !ids.has(r)) : [];
    if (unknown.length) { issues.push(err("PARAM_CONSTRAINT_UNKNOWN_VARIABLE", "القيد " + (i + 1) + " يستخدم متغيرًا غير معرّف: " + unknown.join("، "), "parametric.constraints." + i)); return; }
    constraints.push(p.constraint);
  });
  const response = checkResponse(raw.response);
  if (!response) issues.push(err("PARAM_RESPONSE_INVALID", "إعداد وحدة الإجابة غير صالح.", "parametric.response"));
  if (issues.length || !vars.ok || !response) return { ok: false, issues };
  return { ok: true, value: { version: 1, config: { v: 1, generatorVersion: 1, variables: vars.variables, constraints: [...(raw.constraints as string[])], response }, constraints, constraintSources: [...(raw.constraints as string[])], ids, baseIds: [...ids], derived: [], variablesV2: [], formats: {} } };
}
/** v2 (Phase 19C): explicit kinds, derived graph, constraints over base + derived symbols, formats. Every problem blocks. */
function checkConfigV2(raw: Record<string, unknown>): { ok: true; value: CheckedConfig } | { ok: false; issues: ParametricIssue[] } {
  if (raw.generatorVersion !== 2) return { ok: false, issues: [err("PARAM_CONFIG_VERSION", "إعداد الإصدار 2 يتطلب مولّد القيم الإصدار 2.", "parametric.generatorVersion")] };
  if (!exactKeys(raw, V2_KEYS) || Object.keys(raw).some(k => FORBIDDEN_KEYS.has(k))) return { ok: false, issues: [err("PARAM_CONFIG_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة أو ناقصة.", "parametric")] };
  const issues: ParametricIssue[] = [];
  const vars = validateVariablesV2(raw.variables);
  if (!vars.ok) issues.push(...vars.issues);
  const baseIds = vars.ok ? vars.variables.map(v => v.id) : [];
  const derived = vars.ok ? validateDerivedVariables(raw.derivedVariables, new Set(baseIds)) : null;
  if (derived && !derived.ok) issues.push(...derived.issues);
  const ids = new Set([...baseIds, ...(derived && derived.ok ? derived.order : [])]);
  const constraints: ParsedConstraint[] = [];
  if (!Array.isArray(raw.constraints) || raw.constraints.length > PARAMETRIC_LIMITS.constraints) issues.push(err("PARAM_CONSTRAINTS_INVALID", "القيود يجب أن تكون قائمة من " + PARAMETRIC_LIMITS.constraints + " قيدًا على الأكثر.", "parametric.constraints"));
  else raw.constraints.forEach((c, i) => {
    const p = parseConstraint(c, { language: 2 });
    if (!p.ok) { issues.push(err("PARAM_CONSTRAINT_INVALID", "القيد " + (i + 1) + " ليس مقارنة واحدة صالحة (" + p.code + ").", "parametric.constraints." + i)); return; }
    const unknown = vars.ok && derived && derived.ok ? p.refs.filter(r => !ids.has(r)) : [];
    if (unknown.length) { issues.push(err("PARAM_CONSTRAINT_UNKNOWN_VARIABLE", "القيد " + (i + 1) + " يستخدم رمزًا غير معرّف: " + unknown.join("، "), "parametric.constraints." + i)); return; }
    constraints.push(p.constraint);
  });
  const response = checkResponse(raw.response);
  if (!response) issues.push(err("PARAM_RESPONSE_INVALID", "إعداد وحدة الإجابة غير صالح.", "parametric.response"));
  if (issues.length || !vars.ok || !derived || !derived.ok || !response) return { ok: false, issues };
  const formats: Record<string, ParametricFormat> = {};
  for (const v of vars.variables) if (v.format) formats[v.id] = v.format;
  for (const d of derived.derived) if (d.format) formats[d.id] = d.format;
  const authoredDerived: ParametricDerivedVariableV2[] = (raw.derivedVariables as Record<string, unknown>[]).map(d => ({ id: d.id as string, expression: d.expression as string, ...(d.format !== undefined ? { format: d.format as ParametricFormat } : {}) }));
  return { ok: true, value: { version: 2, config: { v: 2, generatorVersion: 2, variables: vars.variables, derivedVariables: authoredDerived, constraints: [...(raw.constraints as string[])], response }, constraints, constraintSources: [...(raw.constraints as string[])], ids, baseIds, derived: derived.derived, variablesV2: vars.variables, formats } };
}
export function validateParametricNumericConfig(raw: unknown): { ok: true; config: ParametricNumericConfig } | { ok: false; issues: ParametricIssue[] } {
  const r = checkConfig(raw);
  return r.ok ? { ok: true, config: r.value.config } : r;
}

type CheckedKey = { key: ParametricNumericAnswerKeyV1; ast: ExprNode };
const KEY_FIELDS = ["expression", "mode", "tolerance", "below", "above", "unit"];
function checkKey(raw: unknown, cfg: CheckedConfig): { ok: true; value: CheckedKey } | { ok: false; issues: ParametricIssue[] } {
  if (!isPlain(raw) || Object.keys(raw).some(k => !KEY_FIELDS.includes(k))) return { ok: false, issues: [err("PARAM_ANSWER_KEY_INVALID", "مفتاح الإجابة يحتوي حقولًا غير معروفة.", "answer")] };
  if (raw.mode !== "tolerance" && raw.mode !== "range") return { ok: false, issues: [err("PARAM_ANSWER_MODE_UNKNOWN", "طريقة مقارنة الإجابة غير معروفة.", "answer.mode")] };
  const required = raw.mode === "tolerance" ? ["expression", "mode", "tolerance"] : ["expression", "mode", "below", "above"];
  if (!required.every(k => has(raw, k)) || Object.keys(raw).some(k => k !== "unit" && !required.includes(k))) return { ok: false, issues: [err("PARAM_ANSWER_KEY_INVALID", "مفتاح الإجابة لا يطابق طريقة المقارنة المختارة.", "answer")] };
  const issues: ParametricIssue[] = [];
  let ast: ExprNode | null = null;
  if (typeof raw.expression !== "string" || raw.expression.trim() === "") issues.push(err("PARAM_ANSWER_EXPRESSION_MISSING", "تعبير الإجابة مطلوب (مثل: a * b).", "answer.expression"));
  else {
    const p = parseExpression(raw.expression, { language: cfg.version });
    if (!p.ok) issues.push(err("PARAM_ANSWER_EXPRESSION_INVALID", "تعبير الإجابة غير صالح (" + p.code + "). المسموح: أعداد، متغيرات، + - * / % ^، أقواس، abs و round و floor و ceil و min و max.", "answer.expression"));
    else {
      const unknown = p.refs.filter(r => !cfg.ids.has(r));
      if (unknown.length) issues.push(err("PARAM_ANSWER_UNKNOWN_VARIABLE", "تعبير الإجابة يستخدم متغيرًا غير معرّف: " + unknown.join("، "), "answer.expression"));
      else ast = p.ast;
    }
  }
  if (raw.mode === "tolerance" && !finiteNonNeg(raw.tolerance)) issues.push(err("PARAM_ANSWER_TOLERANCE_INVALID", "التسامح يجب أن يكون عددًا غير سالب.", "answer.tolerance"));
  if (raw.mode === "range" && (!finiteNonNeg(raw.below) || !finiteNonNeg(raw.above))) issues.push(err("PARAM_ANSWER_RANGE_INVALID", "حدّا المدى حول الناتج يجب أن يكونا عددين غير سالبين.", "answer"));
  const wantsUnit = cfg.config.response.unit === "input";
  if (wantsUnit ? !unitString(raw.unit) : has(raw, "unit")) issues.push(err("PARAM_ANSWER_UNIT_INVALID", wantsUnit ? "حدّد الوحدة الصحيحة التي يكتبها الطالب." : "الوحدة الصحيحة تُحدَّد فقط عندما يكتب الطالب الوحدة.", "answer.unit"));
  if (issues.length || !ast) return { ok: false, issues };
  const unit = wantsUnit ? { unit: (raw.unit as string).trim() } : {};
  const key: ParametricNumericAnswerKeyV1 = raw.mode === "tolerance"
    ? { expression: raw.expression as string, mode: "tolerance", tolerance: raw.tolerance as number, ...unit }
    : { expression: raw.expression as string, mode: "range", below: raw.below as number, above: raw.above as number, ...unit };
  return { ok: true, value: { key, ast } };
}
export function validateParametricNumericAnswerKey(raw: unknown, rawConfig: unknown): { ok: true; key: ParametricNumericAnswerKeyV1 } | { ok: false; issues: ParametricIssue[] } {
  const cfg = checkConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("PARAM_KEY_CONFIG_INVALID", "لا يمكن التحقق من مفتاح الإجابة لأن إعداد السؤال غير صالح.", "answer")] };
  const k = checkKey(raw, cfg.value);
  return k.ok ? { ok: true, key: k.value.key } : k;
}

function checkTemplate(text: unknown, ids: Set<string>): { ok: true; parts: TemplatePart[]; refs: string[] } | { ok: false; issues: ParametricIssue[] } {
  return parseTemplate(text, ids);
}
type Authority = { cfg: CheckedConfig; key: CheckedKey; parts: TemplatePart[] };
/** The FULL published authority (public config + private key + stem template), or null. Used by grading and the teacher review. */
function checkAuthority(node: Record<string, unknown>): Authority | null {
  const cfg = checkConfig(node.parametric); if (!cfg.ok) return null;
  const key = checkKey(node.answer, cfg.value); if (!key.ok) return null;
  const t = checkTemplate(node.text, cfg.value.ids); if (!t.ok) return null;
  return { cfg: cfg.value, key: key.value, parts: t.parts };
}
/** One generated instance of either version: `values` = every symbol (v2: base + derived), `base` / `derived` split for the teacher. */
type Instance = { ok: true; values: Record<string, number>; base: Record<string, number>; derived: Record<string, number>; attempt: number } | { ok: false; code: string };
function instanceOf(cfg: CheckedConfig, seedText: string): Instance {
  if (cfg.version === 1) {
    const g = generateInstance({ generatorVersion: 1, variables: (cfg.config as ParametricNumericConfigV1).variables, constraints: cfg.constraints }, seedText);
    return g.ok ? { ok: true, values: g.values, base: g.values, derived: {}, attempt: g.attempt } : g;
  }
  const g = generateInstanceV2({ variables: cfg.variablesV2, derived: cfg.derived, constraints: cfg.constraints }, seedText);
  return g.ok ? { ok: true, values: { ...g.values, ...g.derived }, base: g.values, derived: g.derived, attempt: g.attempt } : g;
}
const render = (cfg: CheckedConfig, parts: readonly TemplatePart[], values: Record<string, number>) => renderTemplate(parts, values, cfg.formats);

/** Every problem of a whole parametricNumeric@1 node (all block finalization), including a deterministic preview-namespace sample check. */
export function validateParametricNumericQuestion(node: Record<string, unknown>): ParametricQuestionIssue[] {
  const out: ParametricIssue[] = [];
  const cfg = checkConfig(node.parametric);
  if (!cfg.ok) out.push(...cfg.issues);
  const key = cfg.ok ? checkKey(node.answer, cfg.value) : null;
  if (key && !key.ok) out.push(...key.issues);
  const t = cfg.ok ? checkTemplate(node.text, cfg.value.ids) : null;
  if (t && !t.ok) out.push(...t.issues);
  if (t && t.ok && t.refs.length === 0) out.push(err("PARAM_TEMPLATE_NO_VARIABLE", "نص السؤال يجب أن يعرض متغيرًا واحدًا على الأقل بالصيغة {{اسم_المتغير}}.", "text"));
  if (cfg.ok && key && key.ok && t && t.ok) {
    const qk = questionKeyOf(node);
    for (let s = 1; s <= PARAMETRIC_PREVIEW_SAMPLES; s++) {
      const g = instanceOf(cfg.value, previewSeedText(cfg.value.config.generatorVersion, qk, s));
      if (!g.ok) { out.push(err("PARAM_SAMPLE_GENERATION_FAILED", "تعذّر توليد قيم تحقق القيود خلال " + PARAMETRIC_LIMITS.attempts + " محاولة؛ راجع حدود المتغيرات والقيود.", "parametric.constraints")); break; }
      const e = evaluateExpression(key.value.ast, new Map(Object.entries(g.values)));
      if (!e.ok) { out.push(err("PARAM_SAMPLE_ANSWER_FAILED", "تعبير الإجابة يفشل على عينة مولّدة (" + e.code + ")؛ أضف قيدًا يمنع ذلك (مثل: b != 0).", "answer.expression")); break; }
    }
  }
  return out.map(i => ({ ...i, severity: "error" as const }));
}

// ── student projection (per attempt) ────────────────────────────────────────────────────────────────────────────────────
const UNAVAILABLE: ParametricStudentProjection = Object.freeze({ v: 1, status: "unavailable" }) as ParametricStudentProjection;
const safeStem = (text: unknown) => (typeof text === "string" ? text.replace(/\{\{[^{}]*\}\}/g, "…").replace(/\{\{|\}\}/g, "") : "");
/**
 * The ONLY parametric data a student receives: the stem rendered with the official instance of THIS attempt and the values it shows,
 * plus the response presentation. Built from the public config and the server-owned identity — never from the private key. Without a
 * valid identity, or with an invalid public contract / unsatisfiable constraints, the question is explicitly UNAVAILABLE.
 */
export function projectParametricNumericForStudent(node: Record<string, unknown>, identityRaw: unknown): { text: string; parametric: ParametricStudentProjection } {
  const unavailable = () => ({ text: safeStem(node.text), parametric: { ...UNAVAILABLE } });
  const identity = validateGenerationIdentity(identityRaw);
  if (!identity) return unavailable();
  const cfg = checkConfig(node.parametric); if (!cfg.ok) return unavailable();
  const t = checkTemplate(node.text, cfg.value.ids); if (!t.ok) return unavailable();
  const g = instanceOf(cfg.value, officialSeedText(cfg.value.config.generatorVersion, identity)); if (!g.ok) return unavailable();
  const values: Record<string, number> = {};
  for (const id of t.refs) values[id] = g.values[id];
  return { text: render(cfg.value, t.parts, g.values), parametric: { v: 1, status: "ready", generatorVersion: cfg.value.config.generatorVersion, values, response: { ...cfg.value.config.response } } };
}
/** Strict reader of a delivered projection (the renderer never trusts anything else). */
export function readParametricStudentProjection(raw: unknown): ParametricStudentProjection | null {
  if (!isPlain(raw) || raw.v !== 1) return null;
  if (raw.status === "unavailable") return exactKeys(raw, ["v", "status"]) ? { v: 1, status: "unavailable" } : null;
  if (raw.status !== "ready" || !exactKeys(raw, ["v", "status", "generatorVersion", "values", "response"])) return null;
  if (typeof raw.generatorVersion !== "number" || !PARAMETRIC_GENERATOR_VERSIONS.includes(raw.generatorVersion)) return null;
  const response = checkResponse(raw.response);
  if (!response || !isPlain(raw.values)) return null;
  const entries = Object.entries(raw.values);
  if (entries.length > PARAMETRIC_LIMITS.variables || !entries.every(([k, v]) => PARAMETRIC_ID_RE.test(k) && !FORBIDDEN_KEYS.has(k) && typeof v === "number" && Number.isFinite(v))) return null;
  return { v: 1, status: "ready", generatorVersion: raw.generatorVersion, values: Object.fromEntries(entries) as Record<string, number>, response };
}

// ── ingest ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A client answer to a parametric question is reduced to exactly { kind: "numeric", value, unit? } (bounded strings). */
export function bindParametricNumericAnswer(a: unknown): { ok: true; answer: { kind: "numeric"; value: string; unit?: string } } | { ok: false; code: "PARAM_ANSWER_INVALID" } {
  if (!isPlain(a) || a.kind !== "numeric" || typeof a.value !== "string" || (a.unit !== undefined && typeof a.unit !== "string")) return { ok: false, code: "PARAM_ANSWER_INVALID" };
  return { ok: true, answer: { kind: "numeric", value: a.value.slice(0, PARAMETRIC_NUMERIC_LIMITS.responseChars), ...(typeof a.unit === "string" ? { unit: a.unit.slice(0, PARAMETRIC_NUMERIC_LIMITS.unitChars) } : {}) } };
}

// ── authoritative scoring ───────────────────────────────────────────────────────────────────────────────────────────────
export type ParametricScore = { score: number; correct: boolean; manualReview: boolean };
/** Invalid published authority (or no server identity): no automatic academic mark — the question goes to manual review. */
export const PARAMETRIC_FAIL_CLOSED: Readonly<ParametricScore> = Object.freeze({ score: 0, correct: false, manualReview: true });
type Expected = { ok: true; authority: Authority; identity: ParametricGenerationIdentity; values: Record<string, number>; base: Record<string, number>; derived: Record<string, number>; expected: number; seed: string } | { ok: false; code: string };
function officialExpected(node: Record<string, unknown>, identityRaw: unknown): Expected {
  const identity = validateGenerationIdentity(identityRaw);
  if (!identity) return { ok: false, code: "PARAM_IDENTITY_INVALID" };
  const authority = checkAuthority(node);
  if (!authority) return { ok: false, code: "PARAM_AUTHORITY_INVALID" };
  const seed = officialSeedText(authority.cfg.config.generatorVersion, identity);
  const g = instanceOf(authority.cfg, seed);
  if (!g.ok) return { ok: false, code: "PARAM_GENERATION_FAILED" };
  const e = evaluateExpression(authority.key.ast, new Map(Object.entries(g.values)));
  if (!e.ok) return { ok: false, code: "PARAM_ANSWER_EVAL_FAILED" };
  return { ok: true, authority, identity, values: g.values, base: g.base, derived: g.derived, expected: e.value, seed };
}
/**
 * The authoritative scorer: validates the public config, the private key and the stem, regenerates the official instance from the
 * server identity, evaluates the answer expression, then applies the EXISTING numeric comparison (numericResponse semantics:
 * Arabic / English digits, inclusive epsilon-safe tolerance / range, unit NFKC + whitespace-free + case-insensitive, no conversion).
 * Any authority failure ⇒ PARAMETRIC_FAIL_CLOSED. A malformed student response under valid authority is an ordinary zero.
 */
export function scoreParametricNumeric(input: { question: Record<string, unknown>; response: unknown; maxMarks: number; identity: unknown }): ParametricScore {
  const max = Number.isFinite(input.maxMarks) ? Math.max(0, input.maxMarks) : 0;
  const x = officialExpected(input.question, input.identity);
  if (!x.ok) return { ...PARAMETRIC_FAIL_CLOSED };
  const k = x.authority.key.key;
  const answer = k.mode === "tolerance" ? { mode: "tolerance", expected: x.expected, tolerance: k.tolerance, unit: k.unit } : { mode: "range", min: x.expected - k.below, max: x.expected + k.above, unit: k.unit };
  const r = scoreNumericResponse({ answer, unitRequired: x.authority.cfg.config.response.unit === "input", response: input.response, maxMarks: max });
  if (r.reason === "invalid-key") return { ...PARAMETRIC_FAIL_CLOSED };
  return { score: r.score, correct: r.correct, manualReview: false };
}

// ── teacher review and teacher sample ───────────────────────────────────────────────────────────────────────────────────
export type ParametricConstraintCheck = { source: string; left: number | null; right: number | null; holds: boolean };
export type ParametricReviewInstance =
  | { ok: true; generatorVersion: number; seedDigest: string; identity: ParametricGenerationIdentity; values: Record<string, number>; text: string; expected: number; derived?: Record<string, number>; constraints?: ParametricConstraintCheck[] }
  | { ok: false; code: string; message: string };
/** Every constraint with both evaluated sides on one instance (teacher inspection only). */
function constraintChecks(cfg: CheckedConfig, values: Record<string, number>): ParametricConstraintCheck[] {
  const env = new Map(Object.entries(values));
  return cfg.constraints.map((c, i) => { const r = explainConstraint(c, env); return r.ok ? { source: cfg.constraintSources[i], left: r.left, right: r.right, holds: r.holds } : { source: cfg.constraintSources[i], left: null, right: null, holds: false }; });
}
const REVIEW_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  PARAM_IDENTITY_INVALID: "لا توجد هوية توليد صالحة لهذه المحاولة؛ السؤال بحاجة إلى تصحيح يدوي.",
  PARAM_AUTHORITY_INVALID: "إعداد السؤال أو مفتاح إجابته المنشور غير صالح؛ لم يُحتسب تصحيح آلي والسؤال بحاجة إلى تصحيح يدوي.",
  PARAM_GENERATION_FAILED: "تعذّر توليد قيم هذه المحاولة (القيود غير قابلة للتحقق)؛ السؤال بحاجة إلى تصحيح يدوي.",
  PARAM_ANSWER_EVAL_FAILED: "تعبير الإجابة فشل على قيم هذه المحاولة؛ السؤال بحاجة إلى تصحيح يدوي."
});
/** The EXACT official instance of one attempt for the teacher (same authority as grading): values, rendered stem, expected value, audit identity. */
export function parametricReviewInstance(node: Record<string, unknown>, identityRaw: unknown): ParametricReviewInstance {
  const x = officialExpected(node, identityRaw);
  if (!x.ok) return { ok: false, code: x.code, message: REVIEW_MESSAGES[x.code] ?? REVIEW_MESSAGES.PARAM_AUTHORITY_INVALID };
  const base = { ok: true as const, generatorVersion: x.authority.cfg.config.generatorVersion, seedDigest: seedDigest(x.seed), identity: x.identity, values: { ...x.base }, text: render(x.authority.cfg, x.authority.parts, x.values), expected: x.expected };
  // v1 (Phase 19B) keeps its exact review shape; v2 adds the derived values and the constraint evaluation (teacher only).
  return x.authority.cfg.version === 1 ? base : { ...base, derived: { ...x.derived }, constraints: constraintChecks(x.authority.cfg, x.values) };
}
export type ParametricSample = { ok: true; sample: number; values: Record<string, number>; text: string; expected: number | null; issues: ParametricIssue[] } | { ok: false; sample: number; issues: ParametricIssue[] };
/**
 * A TEACHER-PREVIEW sample: generated in the preview namespace (never an official seed). The sample answer is computed only when the
 * private key is valid and is shown to the teacher only (the editor), never to a student.
 */
export function previewParametricSample(node: Record<string, unknown>, sampleRaw: number): ParametricSample {
  const sample = Number.isSafeInteger(sampleRaw) && sampleRaw >= 1 && sampleRaw <= PARAMETRIC_NUMERIC_LIMITS.maxSample ? sampleRaw : 1;
  const cfg = checkConfig(node.parametric);
  if (!cfg.ok) return { ok: false, sample, issues: cfg.issues };
  const t = checkTemplate(node.text, cfg.value.ids);
  if (!t.ok) return { ok: false, sample, issues: t.issues };
  const g = instanceOf(cfg.value, previewSeedText(cfg.value.config.generatorVersion, questionKeyOf(node), sample));
  if (!g.ok) return { ok: false, sample, issues: [err("PARAM_SAMPLE_GENERATION_FAILED", "تعذّر توليد قيم تحقق القيود.", "parametric.constraints")] };
  const key = checkKey(node.answer, cfg.value);
  let expected: number | null = null;
  const issues: ParametricIssue[] = key.ok ? [] : key.issues;
  if (key.ok) {
    const e = evaluateExpression(key.value.ast, new Map(Object.entries(g.values)));
    if (e.ok) expected = e.value; else issues.push(err("PARAM_SAMPLE_ANSWER_FAILED", "تعبير الإجابة يفشل على هذه العينة (" + e.code + ").", "answer.expression"));
  }
  return { ok: true, sample, values: { ...g.base }, ...(cfg.value.version === 2 ? { derived: { ...g.derived } } : {}), text: render(cfg.value, t.parts, g.values), expected, issues };
}

// ── Phase 19C: teacher sample generator + solution inspector (preview namespace only) ───────────────────────────────────
export const PARAMETRIC_SAMPLE_COUNTS: readonly number[] = Object.freeze([3, 5, 10]);
export type ParametricComparisonPolicy = { mode: "tolerance"; tolerance: number; unit?: string } | { mode: "range"; below: number; above: number; unit?: string };
export type ParametricInspectedSample =
  | { ok: true; sample: number; candidate: number; values: Record<string, number>; derived: Record<string, number>; text: string; constraints: ParametricConstraintCheck[]; expression: string | null; expected: number | null; policy: ParametricComparisonPolicy | null; issues: ParametricIssue[] }
  | { ok: false; sample: number; issues: ParametricIssue[] };
/**
 * Generates `count` (3 / 5 / 10, anything else ⇒ 3) TEACHER-PREVIEW samples starting at `start`, each inspected: base values,
 * derived values, the rendered stem, every constraint with both sides, the answer expression, the expected value and the comparison
 * policy. Preview namespace only: it can never equal an official seed, touches no attempt and is never part of a student payload.
 */
export function previewParametricSamples(node: Record<string, unknown>, countRaw: number, startRaw = 1): { ok: true; samples: ParametricInspectedSample[] } | { ok: false; issues: ParametricIssue[] } {
  const count = PARAMETRIC_SAMPLE_COUNTS.includes(countRaw) ? countRaw : 3;
  const start = Number.isSafeInteger(startRaw) && startRaw >= 1 && startRaw <= PARAMETRIC_NUMERIC_LIMITS.maxSample - 10 ? startRaw : 1;
  const cfg = checkConfig(node.parametric);
  if (!cfg.ok) return { ok: false, issues: cfg.issues };
  const t = checkTemplate(node.text, cfg.value.ids);
  if (!t.ok) return { ok: false, issues: t.issues };
  const key = checkKey(node.answer, cfg.value);
  const k = key.ok ? key.value.key : null;
  const policy: ParametricComparisonPolicy | null = k ? (k.mode === "tolerance" ? { mode: "tolerance", tolerance: k.tolerance, ...(k.unit ? { unit: k.unit } : {}) } : { mode: "range", below: k.below, above: k.above, ...(k.unit ? { unit: k.unit } : {}) }) : null;
  const samples: ParametricInspectedSample[] = [];
  for (let s = start; s < start + count; s++) {
    const g = instanceOf(cfg.value, previewSeedText(cfg.value.config.generatorVersion, questionKeyOf(node), s));
    if (!g.ok) { samples.push({ ok: false, sample: s, issues: [err("PARAM_SAMPLE_GENERATION_FAILED", "تعذّر توليد قيم تحقق القيود لهذه العينة.", "parametric.constraints")] }); continue; }
    const issues: ParametricIssue[] = key.ok ? [] : [...key.issues];
    let expected: number | null = null;
    if (key.ok) { const e = evaluateExpression(key.value.ast, new Map(Object.entries(g.values))); if (e.ok) expected = e.value; else issues.push(err("PARAM_SAMPLE_ANSWER_FAILED", "تعبير الإجابة يفشل على هذه العينة (" + e.code + ").", "answer.expression")); }
    samples.push({ ok: true, sample: s, candidate: g.attempt, values: { ...g.base }, derived: { ...g.derived }, text: render(cfg.value, t.parts, g.values), constraints: constraintChecks(cfg.value, g.values), expression: k ? k.expression : null, expected, policy, issues });
  }
  return { ok: true, samples };
}
/**
 * EXPLICIT authoring upgrade of a valid v1 config to the v2 contract (kind "int" → "integer", no derived values). Generated values
 * change (a new generator version), so it is offered only as a teacher action on a draft — replay never upgrades anything. A valid
 * v2 config is returned unchanged; anything else is null.
 */
export function upgradeParametricConfigToV2(raw: unknown): ParametricNumericConfigV2 | null {
  const c = checkConfig(raw);
  if (!c.ok) return null;
  if (c.value.version === 2) return c.value.config as ParametricNumericConfigV2;
  const v1 = c.value.config as ParametricNumericConfigV1;
  return { v: 2, generatorVersion: 2, variables: v1.variables.map(v => ({ id: v.id, kind: "integer", min: v.min, max: v.max, step: v.step })), derivedVariables: [], constraints: [...v1.constraints], response: { ...v1.response } };
}
