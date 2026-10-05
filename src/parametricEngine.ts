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
export const PARAMETRIC_LIMITS = Object.freeze({
  variables: 20, idChars: 32, intAbs: 1_000_000_000, valueAbs: 1e15, expressionChars: 500, tokens: 200, depth: 32, constraints: 20, constraintChars: 300,
  attempts: 100, exponentAbs: 64, roundDigits: 10, functionArgs: 10, templateChars: 4000, placeholders: 100, identityChars: 200, maxAttemptNumber: 1_000_000,
  // Phase 19C (language / generator 2 only): AST-node budget, derived values, grid positions per variable, authored decimals, format precision.
  astNodes: 160, derivedVariables: 20, positions: 10_000_000, decimalPlaces: 6, formatDecimals: 10
});
export const PARAMETRIC_FUNCTIONS = Object.freeze(["abs", "round", "floor", "ceil", "min", "max"] as const);
export type ParametricFunction = (typeof PARAMETRIC_FUNCTIONS)[number];
const ARITY: Readonly<Record<ParametricFunction, readonly [number, number]>> = Object.freeze({ abs: [1, 1], round: [1, 2], floor: [1, 1], ceil: [1, 1], min: [2, 10], max: [2, 10] });
/** Identifiers that can never be a variable or a function (prototype-sensitive names of plain objects). */
export const PARAMETRIC_FORBIDDEN_IDENTIFIERS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toString", "toLocaleString", "valueOf", "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__"]);
export const PARAMETRIC_ID_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
const isFunctionName = (s: string): s is ParametricFunction => (PARAMETRIC_FUNCTIONS as readonly string[]).includes(s);
/** Language 2 = language 1 + sqrt, pow, log (natural), log10, exp. In language 2 `a ^ b` IS `pow(a, b)` (one semantics). */
export const PARAMETRIC_FUNCTIONS_V2 = Object.freeze([...PARAMETRIC_FUNCTIONS, "sqrt", "pow", "log", "log10", "exp"] as const);
export type ParametricFunctionV2 = (typeof PARAMETRIC_FUNCTIONS_V2)[number];
const ARITY_V2: Readonly<Record<ParametricFunctionV2, readonly [number, number]>> = Object.freeze({ ...ARITY, sqrt: [1, 1], pow: [2, 2], log: [1, 1], log10: [1, 1], exp: [1, 1] });
const isFunctionNameV2 = (s: string): s is ParametricFunctionV2 => (PARAMETRIC_FUNCTIONS_V2 as readonly string[]).includes(s);
export type ParametricLanguage = 1 | 2;
export type ParseOptions = { language?: ParametricLanguage };

export type ParametricIssue = { code: string; message: string; path?: string };
export type ExprNode =
  | { t: "num"; v: number }
  | { t: "var"; id: string }
  | { t: "neg"; a: ExprNode }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; a: ExprNode; b: ExprNode }
  | { t: "call"; fn: ParametricFunctionV2; args: ExprNode[] };
export type ComparisonOp = "<" | "<=" | ">" | ">=" | "==" | "!=";
export type ParsedConstraint = { left: ExprNode; op: ComparisonOp; right: ExprNode };

// ── tokenizer ────────────────────────────────────────────────────────────────────────────────────────────────────────────
type Token = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string } | { k: "cmp"; v: ComparisonOp };
class ExprError { readonly code: string; constructor(code: string) { this.code = code; } }
function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") { i++; continue; }
    if (ch >= "0" && ch <= "9") {
      const m = /^([0-9]+)(\.[0-9]+)?/.exec(src.slice(i))!;
      if (m[1].length > 15 || (m[2] && m[2].length > 16)) throw new ExprError("EXPR_TOKEN_INVALID");
      out.push({ k: "num", v: Number(m[0]) }); i += m[0].length; continue;
    }
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_") {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      if (m[0].length > PARAMETRIC_LIMITS.idChars) throw new ExprError("EXPR_TOKEN_INVALID");
      if (PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(m[0])) throw new ExprError("EXPR_FORBIDDEN_IDENTIFIER");
      out.push({ k: "id", v: m[0] }); i += m[0].length; continue;
    }
    if ("+-*/%^(),".includes(ch)) { out.push({ k: "op", v: ch }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=") { out.push({ k: "cmp", v: two }); i += 2; continue; }
    if (ch === "<" || ch === ">") { out.push({ k: "cmp", v: ch }); i++; continue; }
    throw new ExprError("EXPR_TOKEN_INVALID");
  }
  if (out.length > PARAMETRIC_LIMITS.tokens) throw new ExprError("EXPR_TOO_MANY_TOKENS");
  return out;
}

// ── recursive-descent parser (bounded depth) ─────────────────────────────────────────────────────────────────────────────
class Parser {
  private pos = 0;
  private depth = 0;
  private nodes = 0;
  private readonly language: ParametricLanguage;
  readonly refs = new Set<string>();
  private readonly tokens: Token[];
  constructor(tokens: Token[], language: ParametricLanguage = 1) { this.tokens = tokens; this.language = language; }
  /** Language 2 has an explicit AST-node budget (language 1 stays bounded by its token limit, exactly as in Phase 19B). */
  private node<T extends ExprNode>(n: T): T { if (this.language === 2 && ++this.nodes > PARAMETRIC_LIMITS.astNodes) throw new ExprError("EXPR_TOO_COMPLEX"); return n; }
  private isFn(name: string): boolean { return this.language === 2 ? isFunctionNameV2(name) : isFunctionName(name); }
  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private isOp(v: string): boolean { const t = this.peek(); return !!t && t.k === "op" && t.v === v; }
  private expectOp(v: string) { if (!this.isOp(v)) throw new ExprError("EXPR_SYNTAX"); this.pos++; }
  private enter() { if (++this.depth > PARAMETRIC_LIMITS.depth) throw new ExprError("EXPR_TOO_DEEP"); }
  atEnd(): boolean { return this.pos >= this.tokens.length; }
  peekCmp(): ComparisonOp | undefined { const t = this.peek(); return t && t.k === "cmp" ? t.v : undefined; }
  takeCmp(): ComparisonOp { const c = this.peekCmp(); if (!c) throw new ExprError("EXPR_NOT_A_COMPARISON"); this.pos++; return c; }
  additive(): ExprNode {
    let a = this.multiplicative();
    for (;;) {
      if (this.isOp("+") || this.isOp("-")) { const op = (this.tokens[this.pos++] as { v: "+" | "-" }).v; a = this.node({ t: "bin", op, a, b: this.multiplicative() }); }
      else return a;
    }
  }
  private multiplicative(): ExprNode {
    let a = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/") || this.isOp("%")) { const op = (this.tokens[this.pos++] as { v: "*" | "/" | "%" }).v; a = this.node({ t: "bin", op, a, b: this.unary() }); }
      else return a;
    }
  }
  private unary(): ExprNode {
    this.enter();
    try {
      if (this.isOp("-")) { this.pos++; return this.node({ t: "neg", a: this.unary() }); }
      return this.power();
    } finally { this.depth--; }
  }
  private power(): ExprNode {
    const base = this.primary();
    if (this.isOp("^")) {                                                                       // right associative
      this.pos++;
      const exponent = this.unary();
      return this.language === 2 ? this.node({ t: "call", fn: "pow", args: [base, exponent] }) : { t: "bin", op: "^", a: base, b: exponent };
    }
    return base;
  }
  private primary(): ExprNode {
    const t = this.peek();
    if (!t) throw new ExprError("EXPR_SYNTAX");
    if (t.k === "num") { this.pos++; return this.node({ t: "num", v: t.v }); }
    if (t.k === "op" && t.v === "(") { this.pos++; const e = this.additive(); this.expectOp(")"); return e; }
    if (t.k === "id") {
      this.pos++;
      if (this.isOp("(")) {
        if (!this.isFn(t.v)) throw new ExprError("EXPR_UNKNOWN_FUNCTION");
        const fn = t.v as ParametricFunctionV2;
        this.pos++;
        const args: ExprNode[] = [];
        if (!this.isOp(")")) {
          for (;;) {
            args.push(this.additive());
            if (args.length > PARAMETRIC_LIMITS.functionArgs) throw new ExprError("EXPR_ARITY");
            if (this.isOp(",")) { this.pos++; continue; }
            break;
          }
        }
        this.expectOp(")");
        const [lo, hi] = ARITY_V2[fn];
        if (args.length < lo || args.length > hi) throw new ExprError("EXPR_ARITY");
        return this.node({ t: "call", fn, args });
      }
      if (this.isFn(t.v)) throw new ExprError("EXPR_SYNTAX");
      this.refs.add(t.v);
      return this.node({ t: "var", id: t.v });
    }
    throw new ExprError("EXPR_SYNTAX");
  }
}
const sortedRefs = (p: Parser) => [...p.refs].sort();
function prepare(src: unknown, maxChars: number): Token[] {
  if (typeof src !== "string" || src.trim() === "") throw new ExprError("EXPR_EMPTY");
  if (src.length > maxChars) throw new ExprError("EXPR_TOO_LONG");
  return tokenize(src);
}

/** Parses an ARITHMETIC expression (never a comparison). */
export function parseExpression(src: unknown, options: ParseOptions = {}): { ok: true; ast: ExprNode; refs: string[] } | { ok: false; code: string } {
  try {
    const p = new Parser(prepare(src, PARAMETRIC_LIMITS.expressionChars), options.language === 2 ? 2 : 1);
    const ast = p.additive();
    if (p.peekCmp()) return { ok: false, code: "EXPR_COMPARISON_NOT_ALLOWED" };
    if (!p.atEnd()) return { ok: false, code: "EXPR_SYNTAX" };
    return { ok: true, ast, refs: sortedRefs(p) };
  } catch (e) { if (e instanceof ExprError) return { ok: false, code: e.code }; throw e; }
}
/** Parses a constraint: exactly ONE comparison of two arithmetic expressions. */
export function parseConstraint(src: unknown, options: ParseOptions = {}): { ok: true; constraint: ParsedConstraint; refs: string[] } | { ok: false; code: string } {
  try {
    const p = new Parser(prepare(src, PARAMETRIC_LIMITS.constraintChars), options.language === 2 ? 2 : 1);
    const left = p.additive();
    const op = p.takeCmp();
    const right = p.additive();
    if (!p.atEnd()) return { ok: false, code: "EXPR_SYNTAX" };
    return { ok: true, constraint: { left, op, right }, refs: sortedRefs(p) };
  } catch (e) { if (e instanceof ExprError) return { ok: false, code: e.code }; throw e; }
}

// ── bounded evaluator ───────────────────────────────────────────────────────────────────────────────────────────────────
export type EvalResult = { ok: true; value: number } | { ok: false; code: string };
const bounded = (v: number): number => {
  if (!Number.isFinite(v)) throw new ExprError("EVAL_NON_FINITE");
  if (Math.abs(v) > PARAMETRIC_LIMITS.valueAbs) throw new ExprError("EVAL_OUT_OF_RANGE");
  return v === 0 ? 0 : v;                                                                       // never a negative zero
};
/** base ^ e for an integer e by repeated squaring (IEEE operations only — identical on every engine). */
function powInt(base: number, e: number): number {
  let r = 1, b = base, n = Math.abs(e);
  while (n > 0) { if (n & 1) r *= b; n >>>= 1; if (n > 0) b *= b; }
  return e < 0 ? 1 / r : r;
}
/** Round half AWAY from zero to `digits` decimals; binary noise is removed first (toPrecision(15) is exactly specified). */
/** Transcendental results (log, log10, exp, fractional powers) are normalized to 12 significant digits, absorbing last-ulp
 *  differences between math libraries; the server's value is the authority in any case. A non-finite value stays non-finite. */
const normalize12 = (v: number): number => (Number.isFinite(v) ? Number(v.toPrecision(12)) : v);
/** Language-2 exponentiation (`^` and pow): integer exponents exactly as language 1 (|e| ≤ 64, repeated squaring); a fractional
 *  exponent needs a positive base (a negative base is a domain error) and is normalized to 12 significant digits. */
function powV2(a: number, b: number): number {
  if (Math.abs(b) > PARAMETRIC_LIMITS.exponentAbs) throw new ExprError("EVAL_EXPONENT_INVALID");
  if (a === 0 && b < 0) throw new ExprError("EVAL_DIVIDE_BY_ZERO");
  if (Number.isInteger(b)) return powInt(a, b);
  if (a < 0) throw new ExprError("EVAL_DOMAIN");
  if (a === 0) return 0;
  return normalize12(Math.pow(a, b));
}
function roundTo(x: number, digits: number): number {
  const f = powInt(10, digits), y = bounded(Math.abs(x) * f);
  const r = Math.round(Number(y.toPrecision(15))) / f;
  return x < 0 ? -r : r;
}
function evalNode(n: ExprNode, values: ReadonlyMap<string, number>): number {
  switch (n.t) {
    case "num": return bounded(n.v);
    case "var": {
      if (!values.has(n.id)) throw new ExprError("EVAL_UNKNOWN_VARIABLE");
      const v = values.get(n.id);
      if (typeof v !== "number") throw new ExprError("EVAL_NON_FINITE");
      return bounded(v);
    }
    case "neg": return bounded(-evalNode(n.a, values));
    case "bin": {
      const a = evalNode(n.a, values), b = evalNode(n.b, values);
      switch (n.op) {
        case "+": return bounded(a + b);
        case "-": return bounded(a - b);
        case "*": return bounded(a * b);
        case "/": if (b === 0) throw new ExprError("EVAL_DIVIDE_BY_ZERO"); return bounded(a / b);
        case "%": if (b === 0) throw new ExprError("EVAL_DIVIDE_BY_ZERO"); return bounded(a % b);
        case "^":
          if (!Number.isInteger(b) || Math.abs(b) > PARAMETRIC_LIMITS.exponentAbs) throw new ExprError("EVAL_EXPONENT_INVALID");
          if (a === 0 && b < 0) throw new ExprError("EVAL_DIVIDE_BY_ZERO");
          return bounded(powInt(a, b));
      }
      throw new ExprError("EVAL_NON_FINITE");
    }
    case "call": {
      const args = n.args.map(x => evalNode(x, values));
      switch (n.fn) {
        case "abs": return bounded(Math.abs(args[0]));
        case "floor": return bounded(Math.floor(args[0]));
        case "ceil": return bounded(Math.ceil(args[0]));
        case "min": return bounded(Math.min(...args));
        case "max": return bounded(Math.max(...args));
        case "round": {
          const d = args.length > 1 ? args[1] : 0;
          if (!Number.isInteger(d) || d < 0 || d > PARAMETRIC_LIMITS.roundDigits) throw new ExprError("EVAL_ROUND_DIGITS_INVALID");
          return bounded(roundTo(args[0], d));
        }
        // Language 2 only (a language-1 parse can never produce these nodes).
        case "sqrt": if (args[0] < 0) throw new ExprError("EVAL_DOMAIN"); return bounded(Math.sqrt(args[0]));
        case "pow": return bounded(powV2(args[0], args[1]));
        case "log": if (args[0] <= 0) throw new ExprError("EVAL_DOMAIN"); return bounded(normalize12(Math.log(args[0])));
        case "log10": if (args[0] <= 0) throw new ExprError("EVAL_DOMAIN"); return bounded(normalize12(Math.log10(args[0])));
        case "exp": return bounded(normalize12(Math.exp(args[0])));
      }
    }
  }
  throw new ExprError("EVAL_NON_FINITE");
}
/** Evaluates a parsed expression against variable values (an own-key Map: a lookup never reaches a prototype). */
export function evaluateExpression(ast: ExprNode, values: ReadonlyMap<string, number>): EvalResult {
  try { return { ok: true, value: evalNode(ast, values) }; }
  catch (e) { if (e instanceof ExprError) return { ok: false, code: e.code }; throw e; }
}
export function evaluateConstraint(c: ParsedConstraint, values: ReadonlyMap<string, number>): { ok: true; holds: boolean } | { ok: false; code: string } {
  const l = evaluateExpression(c.left, values); if (!l.ok) return l;
  const r = evaluateExpression(c.right, values); if (!r.ok) return r;
  const a = l.value, b = r.value;
  const holds = c.op === "<" ? a < b : c.op === "<=" ? a <= b : c.op === ">" ? a > b : c.op === ">=" ? a >= b : c.op === "==" ? a === b : a !== b;
  return { ok: true, holds };
}

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
/** True for a name that may never be a variable id (function names and prototype-sensitive names). */
export const isReservedParametricId = (id: string): boolean => isFunctionName(id) || PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(id);
/** Language-2 reserved names (adds the new function names). */
export const isReservedParametricIdV2 = (id: string): boolean => isFunctionNameV2(id) || PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(id);
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
