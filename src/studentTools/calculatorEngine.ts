// Phase T2 — the calculator engine behind the `calculator` student tool.
//
// A small, bounded recursive-descent parser and evaluator: no eval, no Function, no dynamic property access, no clock, no I/O.
// It is deliberately SELF-CONTAINED rather than built on the parametric expression engine (src/parametricExpression.ts): that
// engine is a grading authority for parametricNumeric@1 / functionStudy2d@1 and its languages are frozen, while a calculator needs
// calculator conventions (degrees, factorial, Ans, implicit multiplication, school `log` = base 10). A student convenience tool must
// never be able to change what a grading engine accepts.
//
// Grammar (precedence low → high):
//   expr    := term (("+" | "-") term)*
//   term    := unary (("*" | "/") unary | implicit unary)*      implicit: 2π, 2(3), (1)(2), 2sin(30), 3√4
//   unary   := ("+" | "-") unary | power                         so −2^2 = −4 and 2^−1 = 0.5
//   power   := postfix ("^" unary)?                               right-associative: 2^3^2 = 2^9
//   postfix := primary "!"*
//   primary := number | constant | "Ans" | func "(" expr ")" | "√" primary-unary | "(" expr ")"
// Accepted spellings: × ÷ − for * / -, π or pi, e, √ or sqrt(…), and "," is NOT a decimal separator (one-argument functions only).

export type CalculatorVariant = "basic" | "scientific";
export type AngleUnit = "deg" | "rad";
export type CalculatorOptions = { variant: CalculatorVariant; angleUnit: AngleUnit; ans?: number };
export type CalculatorErrorCode =
  | "EMPTY" | "TOO_LONG" | "TOO_DEEP" | "SYNTAX" | "UNKNOWN_NAME" | "NOT_IN_BASIC" | "DIVIDE_BY_ZERO" | "DOMAIN" | "OVERFLOW" | "NO_ANS";
export type CalculatorResult = { ok: true; value: number; display: string } | { ok: false; code: CalculatorErrorCode; message: string };

export const CALCULATOR_LIMITS = Object.freeze({ maxLength: 200, maxDepth: 32, maxFactorial: 170, significantDigits: 12 });

export const CALCULATOR_FUNCTIONS = Object.freeze(["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "cbrt", "ln", "log", "exp", "abs"] as const);
type FunctionName = (typeof CALCULATOR_FUNCTIONS)[number];

const MESSAGES: Record<CalculatorErrorCode, string> = {
  EMPTY: "اكتب عملية حسابية.",
  TOO_LONG: "العملية أطول من المسموح.",
  TOO_DEEP: "الأقواس متداخلة أكثر من المسموح.",
  SYNTAX: "صيغة العملية غير صحيحة.",
  UNKNOWN_NAME: "اسم دالة أو ثابت غير معروف.",
  NOT_IN_BASIC: "هذه العملية غير متاحة في الآلة الحاسبة البسيطة.",
  DIVIDE_BY_ZERO: "لا يمكن القسمة على صفر.",
  DOMAIN: "القيمة خارج مجال الدالة.",
  OVERFLOW: "الناتج كبير جدًّا.",
  NO_ANS: "لا يوجد ناتج سابق بعد."
};

class CalcError extends Error {
  readonly code: CalculatorErrorCode;
  constructor(code: CalculatorErrorCode) { super(code); this.code = code; }
}
const fail = (code: CalculatorErrorCode): never => { throw new CalcError(code); };

type Token =
  | { t: "num"; v: number }
  | { t: "name"; v: string }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" | "!" | "(" | ")" | "√" };

const NORMALIZE: Record<string, string> = { "×": "*", "÷": "/", "−": "-", "–": "-", "·": "*", "π": "pi", "（": "(", "）": ")" };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    let ch = src[i];
    if (NORMALIZE[ch] !== undefined) {
      const n = NORMALIZE[ch];
      if (n === "pi") { out.push({ t: "name", v: "pi" }); i++; continue; }
      ch = n;
    }
    if (ch === " " || ch === "\t") { i++; continue; }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) fail("SYNTAX");
      const v = Number(m![0]);
      if (!Number.isFinite(v)) fail("OVERFLOW");
      out.push({ t: "num", v });
      i += m![0].length;
      if (src[i] === ".") fail("SYNTAX");          // 1.2.3
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
      out.push({ t: "name", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/^!()√".includes(ch)) { out.push({ t: "op", v: ch as "+" }); i++; continue; }
    fail("SYNTAX");
  }
  return out;
}

const isFunction = (name: string): name is FunctionName => (CALCULATOR_FUNCTIONS as readonly string[]).includes(name);
const SCIENTIFIC_ONLY_OPS = new Set(["^", "!", "√"]);

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) fail("DOMAIN");
  if (n > CALCULATOR_LIMITS.maxFactorial) fail("OVERFLOW");
  let r = 1;
  for (let k = 2; k <= n; k++) r *= k;
  return r;
}

// Exact zeros / ones at the angles a student expects (sin 180° = 0, cos 90° = 0, tan 45° = 1) instead of 1.2e-16 artefacts.
const snap = (v: number): number => (Math.abs(v) < 1e-13 ? 0 : Math.abs(v - Math.round(v)) < 1e-13 ? Math.round(v) : v);

function applyFunction(name: FunctionName, x: number, unit: AngleUnit): number {
  const toRad = (a: number) => (unit === "deg" ? (a % 360) * Math.PI / 180 : a);
  const fromRad = (r: number) => (unit === "deg" ? r * 180 / Math.PI : r);
  switch (name) {
    case "sin": return snap(Math.sin(toRad(x)));
    case "cos": return snap(Math.cos(toRad(x)));
    case "tan": {
      if (unit === "deg" && Number.isFinite(x) && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-9) fail("DOMAIN");
      const v = Math.tan(toRad(x));
      if (Math.abs(v) > 1e15) fail("DOMAIN");
      return snap(v);
    }
    case "asin": if (x < -1 || x > 1) fail("DOMAIN"); return snap(fromRad(Math.asin(x)));
    case "acos": if (x < -1 || x > 1) fail("DOMAIN"); return snap(fromRad(Math.acos(x)));
    case "atan": return snap(fromRad(Math.atan(x)));
    case "sqrt": if (x < 0) fail("DOMAIN"); return Math.sqrt(x);
    case "cbrt": return Math.cbrt(x);
    case "ln": if (x <= 0) fail("DOMAIN"); return Math.log(x);
    case "log": if (x <= 0) fail("DOMAIN"); return snap(Math.log10(x));
    case "exp": return Math.exp(x);
    case "abs": return Math.abs(x);
  }
}

class Parser {
  private pos = 0;
  private depth = 0;
  private readonly tokens: Token[];
  private readonly opts: CalculatorOptions;
  constructor(tokens: Token[], opts: CalculatorOptions) { this.tokens = tokens; this.opts = opts; }

  parse(): number {
    const v = this.expr();
    if (this.pos !== this.tokens.length) fail("SYNTAX");
    return v;
  }
  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private isOp(v: string): boolean { const t = this.peek(); return !!t && t.t === "op" && t.v === v; }
  private enter(): void { if (++this.depth > CALCULATOR_LIMITS.maxDepth) fail("TOO_DEEP"); }
  private leave(): void { this.depth--; }
  private scientific(): void { if (this.opts.variant !== "scientific") fail("NOT_IN_BASIC"); }

  private expr(): number {
    let v = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.tokens[this.pos++] as { v: string }).v;
      const r = this.term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  // A token that can START a value — used for implicit multiplication.
  private startsValue(): boolean {
    const t = this.peek();
    return !!t && (t.t === "num" || t.t === "name" || (t.t === "op" && (t.v === "(" || t.v === "√")));
  }
  private term(): number {
    let v = this.unary();
    for (;;) {
      if (this.isOp("*") || this.isOp("/")) {
        const op = (this.tokens[this.pos++] as { v: string }).v;
        const r = this.unary();
        if (op === "/") { if (r === 0) fail("DIVIDE_BY_ZERO"); v = v / r; } else v = v * r;
      } else if (this.startsValue()) {
        // A number directly after a value (2 3, (2)3) is ambiguous, never multiplied implicitly.
        if (this.peek()!.t === "num") fail("SYNTAX");
        v = v * this.power();
      } else break;
    }
    return v;
  }
  private unary(): number {
    if (this.isOp("-") || this.isOp("+")) {
      const neg = (this.tokens[this.pos++] as { v: string }).v === "-";
      this.enter();
      const v = this.unary();
      this.leave();
      return neg ? -v : v;
    }
    return this.power();
  }
  private power(): number {
    const base = this.postfix();
    if (this.isOp("^")) {
      this.scientific();
      this.pos++;
      this.enter();
      const exp = this.unary();
      this.leave();
      if (base === 0 && exp < 0) fail("DIVIDE_BY_ZERO");
      if (base < 0 && !Number.isInteger(exp)) fail("DOMAIN");
      return Math.pow(base, exp);
    }
    return base;
  }
  private postfix(): number {
    let v = this.primary();
    while (this.isOp("!")) { this.scientific(); this.pos++; v = factorial(v); }
    return v;
  }
  private group(): number {
    if (!this.isOp("(")) fail("SYNTAX");
    this.pos++;
    this.enter();
    const v = this.expr();
    this.leave();
    if (!this.isOp(")")) fail("SYNTAX");
    this.pos++;
    return v;
  }
  private primary(): number {
    const t = this.peek();
    if (!t) return fail("SYNTAX");
    if (t.t === "num") { this.pos++; return t.v; }
    if (t.t === "op" && t.v === "(") return this.group();
    if (t.t === "op" && t.v === "√") {
      this.scientific();
      this.pos++;
      this.enter();
      const x = this.isOp("-") || this.isOp("+") ? this.unary() : this.postfix();
      this.leave();
      return applyFunction("sqrt", x, this.opts.angleUnit);
    }
    if (t.t === "name") {
      this.pos++;
      const name = t.v;
      if (name === "Ans" || name === "ans") {
        if (this.opts.ans === undefined || !Number.isFinite(this.opts.ans)) fail("NO_ANS");
        return this.opts.ans as number;
      }
      if (name === "pi") { this.scientific(); return Math.PI; }
      if (name === "e") { this.scientific(); return Math.E; }
      if (isFunction(name)) { this.scientific(); return applyFunction(name, this.group(), this.opts.angleUnit); }
      return fail("UNKNOWN_NAME");
    }
    return fail("SYNTAX");
  }
}

/** Format a result the way a school calculator shows it: 12 significant digits, no binary artefacts, exponent form at the extremes. */
export function formatCalculatorNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const rounded = Number(v.toPrecision(CALCULATOR_LIMITS.significantDigits));
  const abs = Math.abs(rounded);
  if (abs >= 1e12 || abs < 1e-9) {
    const [m, e] = rounded.toExponential(CALCULATOR_LIMITS.significantDigits - 1).split("e");
    const mantissa = m.includes(".") ? m.replace(/0+$/, "").replace(/\.$/, "") : m;
    return mantissa + "e" + (e.startsWith("-") ? e : "+" + e.replace("+", ""));
  }
  return String(rounded);
}

export function evaluateCalculator(input: string, opts: CalculatorOptions): CalculatorResult {
  const src = typeof input === "string" ? input.trim() : "";
  if (!src) return { ok: false, code: "EMPTY", message: MESSAGES.EMPTY };
  if (src.length > CALCULATOR_LIMITS.maxLength) return { ok: false, code: "TOO_LONG", message: MESSAGES.TOO_LONG };
  try {
    const tokens = tokenize(src);
    if (opts.variant !== "scientific" && tokens.some(t => t.t === "op" && SCIENTIFIC_ONLY_OPS.has(t.v))) fail("NOT_IN_BASIC");
    const value = new Parser(tokens, opts).parse();
    if (!Number.isFinite(value)) fail("OVERFLOW");
    const clean = Object.is(value, -0) ? 0 : value;
    return { ok: true, value: clean, display: formatCalculatorNumber(clean) };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, code: e.code, message: MESSAGES[e.code] };
    return { ok: false, code: "SYNTAX", message: MESSAGES.SYNTAX };
  }
}
