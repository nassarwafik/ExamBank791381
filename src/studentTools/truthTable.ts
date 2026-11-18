// Phase T6 — the truth-table engine behind the `truthTable` student tool.
//
// A small, bounded recursive-descent parser for Boolean expressions (no eval). Variables are single upper-case letters A–Z.
// Accepted notations (the school / textbook ones):
//   NOT:  ¬A  !A  ~A  NOT A  A'
//   AND:  A∧B  A&B  A·B  A*B  A AND B  AB (implicit, between operands)
//   OR:   A∨B  A|B  A+B  A OR B
//   XOR:  A⊕B  A^B  A XOR B
//   NAND, NOR (keywords), constants 0 and 1, brackets.
// Precedence (high → low): NOT, AND, XOR, OR; NAND binds like AND and NOR like OR, both left-associative.

export const TRUTH_LIMITS = Object.freeze({ maxLength: 200, maxDepth: 32, minVariables: 1, maxVariablesCap: 6 });

type Node =
  | { k: "var"; name: string }
  | { k: "const"; v: boolean }
  | { k: "not"; x: Node }
  | { k: "bin"; op: "AND" | "OR" | "XOR" | "NAND" | "NOR"; a: Node; b: Node };

type Tok = { t: "var"; v: string } | { t: "const"; v: boolean } | { t: "op"; v: "AND" | "OR" | "XOR" | "NAND" | "NOR" | "NOT" | "(" | ")" | "'" };

export type TruthTableResult =
  | { ok: true; variables: string[]; rows: { inputs: boolean[]; output: boolean }[]; minterms: number[]; normalized: string }
  | { ok: false; message: string };

class TruthError extends Error {}
const fail = (m: string): never => { throw new TruthError(m); };

const SYMBOL: Record<string, Tok> = {
  "¬": { t: "op", v: "NOT" }, "!": { t: "op", v: "NOT" }, "~": { t: "op", v: "NOT" }, "'": { t: "op", v: "'" }, "’": { t: "op", v: "'" },
  "∧": { t: "op", v: "AND" }, "&": { t: "op", v: "AND" }, "·": { t: "op", v: "AND" }, "*": { t: "op", v: "AND" }, ".": { t: "op", v: "AND" },
  "∨": { t: "op", v: "OR" }, "|": { t: "op", v: "OR" }, "+": { t: "op", v: "OR" },
  "⊕": { t: "op", v: "XOR" }, "^": { t: "op", v: "XOR" },
  "(": { t: "op", v: "(" }, ")": { t: "op", v: ")" }
};
const WORDS = new Set(["AND", "OR", "XOR", "NAND", "NOR", "NOT"]);

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t") { i++; continue; }
    if (c === "&" && src[i + 1] === "&") { out.push({ t: "op", v: "AND" }); i += 2; continue; }
    if (c === "|" && src[i + 1] === "|") { out.push({ t: "op", v: "OR" }); i += 2; continue; }
    if (SYMBOL[c]) { out.push(SYMBOL[c]); i++; continue; }
    if (c === "0" || c === "1") { out.push({ t: "const", v: c === "1" }); i++; continue; }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (WORDS.has(word.toUpperCase()) && word.length > 1) { out.push({ t: "op", v: word.toUpperCase() as "AND" }); i = j; continue; }
      // a run of capitals (AB) is implicit AND of single-letter variables; lower case is refused (ambiguous with words)
      if (!/^[A-Z]+$/.test(word)) fail("المتغيرات حروف إنجليزية كبيرة مفردة (A وB وC …)، والعمليات AND وOR وXOR وNOT.");
      for (const ch of word) out.push({ t: "var", v: ch });
      i = j;
      continue;
    }
    fail("رمز غير مسموح في العبارة: «" + c + "».");
  }
  return out;
}

class Parser {
  private pos = 0;
  private depth = 0;
  private readonly toks: Tok[];
  constructor(toks: Tok[]) { this.toks = toks; }
  parse(): Node { const n = this.or(); if (this.pos !== this.toks.length) fail("صيغة العبارة غير صحيحة."); return n; }
  private peekOp(v: string): boolean { const t = this.toks[this.pos]; return !!t && t.t === "op" && t.v === v; }
  private enter(): void { if (++this.depth > TRUTH_LIMITS.maxDepth) fail("العبارة متداخلة أكثر من المسموح."); }
  private or(): Node {
    let n = this.xor();
    while (this.peekOp("OR") || this.peekOp("NOR")) { const op = (this.toks[this.pos++] as { v: "OR" | "NOR" }).v; n = { k: "bin", op, a: n, b: this.xor() }; }
    return n;
  }
  private xor(): Node {
    let n = this.and();
    while (this.peekOp("XOR")) { this.pos++; n = { k: "bin", op: "XOR", a: n, b: this.and() }; }
    return n;
  }
  private startsOperand(): boolean {
    const t = this.toks[this.pos];
    return !!t && (t.t === "var" || t.t === "const" || (t.t === "op" && (t.v === "(" || t.v === "NOT")));
  }
  private and(): Node {
    let n = this.not();
    for (;;) {
      if (this.peekOp("AND") || this.peekOp("NAND")) { const op = (this.toks[this.pos++] as { v: "AND" | "NAND" }).v; n = { k: "bin", op, a: n, b: this.not() }; }
      else if (this.startsOperand()) n = { k: "bin", op: "AND", a: n, b: this.not() };     // implicit AND: AB, A(B+C), (A)(B)
      else return n;
    }
  }
  private not(): Node {
    if (this.peekOp("NOT")) { this.pos++; this.enter(); const x = this.not(); this.depth--; return { k: "not", x }; }
    let n = this.atom();
    while (this.peekOp("'")) { this.pos++; n = { k: "not", x: n }; }
    return n;
  }
  private atom(): Node {
    const t = this.toks[this.pos];
    if (!t) return fail("العبارة ناقصة.");
    if (t.t === "var") { this.pos++; return { k: "var", name: t.v }; }
    if (t.t === "const") { this.pos++; return { k: "const", v: t.v }; }
    if (t.t === "op" && t.v === "(") {
      this.pos++; this.enter();
      const n = this.or();
      this.depth--;
      if (!this.peekOp(")")) fail("قوس غير مغلق.");
      this.pos++;
      return n;
    }
    return fail("صيغة العبارة غير صحيحة.");
  }
}

function evaluate(n: Node, env: ReadonlyMap<string, boolean>): boolean {
  switch (n.k) {
    case "var": return env.get(n.name) === true;
    case "const": return n.v;
    case "not": return !evaluate(n.x, env);
    case "bin": {
      const a = evaluate(n.a, env), b = evaluate(n.b, env);
      switch (n.op) { case "AND": return a && b; case "OR": return a || b; case "XOR": return a !== b; case "NAND": return !(a && b); case "NOR": return !(a || b); }
    }
  }
}

function show(n: Node, parent = 0): string {
  const prec = (x: Node) => (x.k === "bin" ? (x.op === "OR" || x.op === "NOR" ? 1 : x.op === "XOR" ? 2 : 3) : 4);
  switch (n.k) {
    case "var": return n.name;
    case "const": return n.v ? "1" : "0";
    case "not": return "¬" + show(n.x, 4);
    case "bin": {
      const p = prec(n), sym = { AND: "∧", OR: "∨", XOR: "⊕", NAND: "↑", NOR: "↓" }[n.op];
      const s = show(n.a, p) + " " + sym + " " + show(n.b, p + 1);
      return p < parent ? "(" + s + ")" : s;
    }
  }
}

/** Parse, then evaluate every assignment of the expression's variables (alphabetical; A is the most significant input). */
export function truthTable(expression: string, maxVariables: number): TruthTableResult {
  const src = typeof expression === "string" ? expression.trim() : "";
  if (!src) return { ok: false, message: "اكتب عبارة منطقية، مثل A AND (B OR NOT C)." };
  if (src.length > TRUTH_LIMITS.maxLength) return { ok: false, message: "العبارة أطول من المسموح." };
  try {
    const ast = new Parser(tokenize(src)).parse();
    const vars = new Set<string>();
    (function walk(n: Node) { if (n.k === "var") vars.add(n.name); else if (n.k === "not") walk(n.x); else if (n.k === "bin") { walk(n.a); walk(n.b); } })(ast);
    const variables = [...vars].sort();
    const cap = Math.max(TRUTH_LIMITS.minVariables, Math.min(maxVariables, TRUTH_LIMITS.maxVariablesCap));
    if (variables.length > cap) return { ok: false, message: "العبارة فيها " + variables.length + " متغيرات، والمسموح " + cap + " على الأكثر." };
    const rows: { inputs: boolean[]; output: boolean }[] = [];
    const minterms: number[] = [];
    const n = variables.length;
    for (let i = 0; i < 2 ** n; i++) {
      const inputs = variables.map((_, j) => ((i >> (n - 1 - j)) & 1) === 1);
      const output = evaluate(ast, new Map(variables.map((v, j) => [v, inputs[j]])));
      rows.push({ inputs, output });
      if (output) minterms.push(i);
    }
    return { ok: true, variables, rows, minterms, normalized: show(ast) };
  } catch (e) {
    if (e instanceof TruthError) return { ok: false, message: e.message };
    return { ok: false, message: "صيغة العبارة غير صحيحة." };
  }
}
