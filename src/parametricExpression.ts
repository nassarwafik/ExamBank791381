// Phase 21A.2 — the parametric engine's EXPRESSION CORE, moved VERBATIM out of parametricEngine.ts (which re-exports every name, so
// its API and behaviour are unchanged): the closed tokenizer, the bounded recursive-descent parser, the AST and the bounded evaluator of
// expression languages 1, 2 and 3, with the limits and the reserved-name rules. A separate module so that a consumer that needs only
// expressions (function graphs, on the student path) does not ship the generator, the templates or the variable grids. Pure and
// dependency-free: no React, no DOM, no I/O, no clock, no Math.random, no eval / Function / import(). Executes no code. (powInt and roundTo
// are exported only because the generator in parametricEngine.ts uses them, exactly as before the move.)
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
/** Phase 21A.2 — language 3 (function graphs ONLY; parametric questions and SmartSim keep languages 1 / 2 exactly) = language 2 + the
 *  trigonometric family sin cos tan asin acos atan, ln (the natural logarithm) and the constants pi and e. `log` is REFUSED in language 3
 *  (EXPR_AMBIGUOUS_LOG): school notation reads log as base 10 while language 2 reads it as natural, so a graph names its base (ln / log10).
 *  Same tokenizer, parser, AST and evaluator; the AST-node budget of language 2 applies; constants become number nodes. */
export const PARAMETRIC_FUNCTIONS_V3 = Object.freeze(["abs", "round", "floor", "ceil", "min", "max", "sqrt", "pow", "log10", "exp", "ln", "sin", "cos", "tan", "asin", "acos", "atan"] as const);
export type ParametricFunctionV3 = (typeof PARAMETRIC_FUNCTIONS_V3)[number];
export const PARAMETRIC_CONSTANTS_V3: Readonly<Record<"pi" | "e", number>> = Object.freeze({ pi: Math.PI, e: Math.E });
const ARITY_ALL: Readonly<Record<ParametricFunctionV2 | ParametricFunctionV3, readonly [number, number]>> = Object.freeze({ ...ARITY_V2, ln: [1, 1], sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1] });
const isFunctionNameV3 = (s: string): s is ParametricFunctionV3 => (PARAMETRIC_FUNCTIONS_V3 as readonly string[]).includes(s);
const isConstantV3 = (s: string): s is "pi" | "e" => s === "pi" || s === "e";
export type ParametricLanguage = 1 | 2 | 3;
export type ParseOptions = { language?: ParametricLanguage };

export type ParametricIssue = { code: string; message: string; path?: string };
export type ExprNode =
  | { t: "num"; v: number }
  | { t: "var"; id: string }
  | { t: "neg"; a: ExprNode }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; a: ExprNode; b: ExprNode }
  | { t: "call"; fn: ParametricFunctionV2 | ParametricFunctionV3; args: ExprNode[] };
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
  /** Languages 2 and 3 have an explicit AST-node budget (language 1 stays bounded by its token limit, exactly as in Phase 19B). */
  private node<T extends ExprNode>(n: T): T { if (this.language !== 1 && ++this.nodes > PARAMETRIC_LIMITS.astNodes) throw new ExprError("EXPR_TOO_COMPLEX"); return n; }
  private isFn(name: string): boolean { return this.language === 3 ? isFunctionNameV3(name) : this.language === 2 ? isFunctionNameV2(name) : isFunctionName(name); }
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
      return this.language !== 1 ? this.node({ t: "call", fn: "pow", args: [base, exponent] }) : { t: "bin", op: "^", a: base, b: exponent };
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
      if (this.language === 3 && t.v === "log") throw new ExprError("EXPR_AMBIGUOUS_LOG");
      if (this.isOp("(")) {
        if (!this.isFn(t.v)) throw new ExprError("EXPR_UNKNOWN_FUNCTION");
        const fn = t.v as ParametricFunctionV2 | ParametricFunctionV3;
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
        const [lo, hi] = ARITY_ALL[fn];
        if (args.length < lo || args.length > hi) throw new ExprError("EXPR_ARITY");
        return this.node({ t: "call", fn, args });
      }
      if (this.isFn(t.v)) throw new ExprError("EXPR_SYNTAX");
      if (this.language === 3 && isConstantV3(t.v)) return this.node({ t: "num", v: PARAMETRIC_CONSTANTS_V3[t.v] });
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
    const p = new Parser(prepare(src, PARAMETRIC_LIMITS.expressionChars), options.language === 3 ? 3 : options.language === 2 ? 2 : 1);
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
export function powInt(base: number, e: number): number {
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
export function roundTo(x: number, digits: number): number {
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
        // Language 3 only (function graphs; a language-1 / 2 parse can never produce these nodes). Inverse sine / cosine need |x| <= 1.
        case "ln": if (args[0] <= 0) throw new ExprError("EVAL_DOMAIN"); return bounded(normalize12(Math.log(args[0])));
        case "sin": return bounded(normalize12(Math.sin(args[0])));
        case "cos": return bounded(normalize12(Math.cos(args[0])));
        case "tan": return bounded(normalize12(Math.tan(args[0])));
        case "asin": if (args[0] < -1 || args[0] > 1) throw new ExprError("EVAL_DOMAIN"); return bounded(normalize12(Math.asin(args[0])));
        case "acos": if (args[0] < -1 || args[0] > 1) throw new ExprError("EVAL_DOMAIN"); return bounded(normalize12(Math.acos(args[0])));
        case "atan": return bounded(normalize12(Math.atan(args[0])));
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

/** True for a name that may never be a variable id (function names and prototype-sensitive names). */
export const isReservedParametricId = (id: string): boolean => isFunctionName(id) || PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(id);
/** Language-2 reserved names (adds the new function names). */
export const isReservedParametricIdV2 = (id: string): boolean => isFunctionNameV2(id) || PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(id);
/** Language 3: a function name, a constant (pi, e), the refused `log` or a prototype-sensitive name can never be a parameter. */
export const isReservedParametricIdV3 = (id: string): boolean => isFunctionNameV3(id) || isConstantV3(id) || id === "log" || PARAMETRIC_FORBIDDEN_IDENTIFIERS.has(id);
