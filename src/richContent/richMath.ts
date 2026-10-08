// Phase 20D.1 — the SAFE math subset. A strict, allow-listed LaTeX-style source is parsed into a CLOSED abstract syntax tree; the lazy
// renderer (RichMath.tsx) turns that tree into MathML ELEMENTS built by React (never an HTML string, never a library's innerHTML).
// Anything outside the allow-list — unknown commands, macros (\def, \newcommand), HTML-capable commands (\href, \url, \html, \style,
// \class), file inputs, unbalanced braces, stray characters — is REFUSED, never repaired. Pure, server-safe (shared finalization build).
//
// Phase 21A — SCIENTIFIC MATH v2 (MATH_LANGUAGE_VERSION 2), a strict superset of the 20D.1 subset: every source the 20D.1 parser
// accepted keeps an identical AST (old-grammar freeze). v2 adds a FIXED environment allow-list (\begin{env} … \end{env} for matrix,
// pmatrix, bmatrix, vmatrix, Vmatrix, cases, aligned — never a generic environment), the contextual cell / row separators & and \\
// (legal ONLY at a grid's own cell level), explicit grid bounds, the number sets \mathbb{N Z Q R C} (a fixed alphabet, not a styling
// engine), multiple integrals and a few scientific symbols. There are still no macros, no arguments from source that select a tag or an
// attribute, and no nesting of environments: the grammar stays bounded and non-Turing-complete.

export type MathNode =
  | { k: "row"; c: MathNode[] }
  | { k: "id"; v: string; fn?: true }
  | { k: "num"; v: string }
  | { k: "op"; v: string; large?: true }
  | { k: "text"; v: string }
  | { k: "space" }
  | { k: "frac"; n: MathNode; d: MathNode }
  | { k: "sqrt"; b: MathNode; idx?: MathNode }
  | { k: "scripts"; b: MathNode; sub?: MathNode; sup?: MathNode }
  | { k: "accent"; b: MathNode; v: string }
  | { k: "fenced"; open: string; close: string; c: MathNode }
  | { k: "grid"; env: MathEnvironment; rows: MathNode[][] };
export type MathParse = { ok: true; ast: MathNode } | { ok: false; message: string };

export const MATH_LIMITS = Object.freeze({ chars: 2000, nodes: 600, depth: 24 });

/** The safe scientific math language identity (20D.1 = 1; 21A adds grids, number sets and scientific symbols as a strict superset). */
export const MATH_LANGUAGE_VERSION = 2;
/** The ONLY environments \begin / \end accept. Fences and alignment are code-owned per environment in the renderer. */
export const MATH_ENVIRONMENTS = Object.freeze(["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "cases", "aligned"] as const);
export type MathEnvironment = (typeof MATH_ENVIRONMENTS)[number];
/** Grid bounds, enforced while parsing (a grid is refused as soon as a bound is crossed, before the rest is materialized). */
export const MATH_GRID_LIMITS = Object.freeze({ rows: 12, cols: 8, cells: 64, casesCols: 2, alignedCols: 2 });
const ENV_COLS: Readonly<Record<string, number>> = Object.freeze({ matrix: MATH_GRID_LIMITS.cols, pmatrix: MATH_GRID_LIMITS.cols, bmatrix: MATH_GRID_LIMITS.cols,
  vmatrix: MATH_GRID_LIMITS.cols, Vmatrix: MATH_GRID_LIMITS.cols, cases: MATH_GRID_LIMITS.casesCols, aligned: MATH_GRID_LIMITS.alignedCols });

const SYMBOLS: Readonly<Record<string, { k: "op" | "id"; v: string; large?: true; fn?: true }>> = Object.freeze({
  times: { k: "op", v: "×" }, cdot: { k: "op", v: "⋅" }, div: { k: "op", v: "÷" }, pm: { k: "op", v: "±" }, mp: { k: "op", v: "∓" },
  le: { k: "op", v: "≤" }, leq: { k: "op", v: "≤" }, ge: { k: "op", v: "≥" }, geq: { k: "op", v: "≥" }, neq: { k: "op", v: "≠" }, ne: { k: "op", v: "≠" },
  approx: { k: "op", v: "≈" }, equiv: { k: "op", v: "≡" }, propto: { k: "op", v: "∝" }, to: { k: "op", v: "→" }, rightarrow: { k: "op", v: "→" },
  leftarrow: { k: "op", v: "←" }, Rightarrow: { k: "op", v: "⇒" }, Leftrightarrow: { k: "op", v: "⇔" }, circ: { k: "op", v: "∘" },
  in: { k: "op", v: "∈" }, notin: { k: "op", v: "∉" }, subset: { k: "op", v: "⊂" }, cup: { k: "op", v: "∪" }, cap: { k: "op", v: "∩" },
  perp: { k: "op", v: "⊥" }, parallel: { k: "op", v: "∥" }, angle: { k: "op", v: "∠" }, ldots: { k: "op", v: "…" }, cdots: { k: "op", v: "⋯" },
  forall: { k: "op", v: "∀" }, exists: { k: "op", v: "∃" },
  sum: { k: "op", v: "∑", large: true }, prod: { k: "op", v: "∏", large: true }, int: { k: "op", v: "∫", large: true }, oint: { k: "op", v: "∮", large: true },
  infty: { k: "id", v: "∞" }, degree: { k: "id", v: "°" }, prime: { k: "id", v: "′" }, partial: { k: "id", v: "∂" }, nabla: { k: "id", v: "∇" }, triangle: { k: "id", v: "△" },
  alpha: { k: "id", v: "α" }, beta: { k: "id", v: "β" }, gamma: { k: "id", v: "γ" }, Gamma: { k: "id", v: "Γ" }, delta: { k: "id", v: "δ" }, Delta: { k: "id", v: "Δ" },
  epsilon: { k: "id", v: "ε" }, varepsilon: { k: "id", v: "ε" }, zeta: { k: "id", v: "ζ" }, eta: { k: "id", v: "η" }, theta: { k: "id", v: "θ" }, Theta: { k: "id", v: "Θ" },
  kappa: { k: "id", v: "κ" }, lambda: { k: "id", v: "λ" }, Lambda: { k: "id", v: "Λ" }, mu: { k: "id", v: "μ" }, nu: { k: "id", v: "ν" }, xi: { k: "id", v: "ξ" },
  pi: { k: "id", v: "π" }, Pi: { k: "id", v: "Π" }, rho: { k: "id", v: "ρ" }, sigma: { k: "id", v: "σ" }, Sigma: { k: "id", v: "Σ" }, tau: { k: "id", v: "τ" },
  phi: { k: "id", v: "φ" }, Phi: { k: "id", v: "Φ" }, chi: { k: "id", v: "χ" }, psi: { k: "id", v: "ψ" }, Psi: { k: "id", v: "Ψ" }, omega: { k: "id", v: "ω" }, Omega: { k: "id", v: "Ω" },
  lim: { k: "id", v: "lim", fn: true }, log: { k: "id", v: "log", fn: true }, ln: { k: "id", v: "ln", fn: true }, exp: { k: "id", v: "exp", fn: true },
  sin: { k: "id", v: "sin", fn: true }, cos: { k: "id", v: "cos", fn: true }, tan: { k: "id", v: "tan", fn: true }, sec: { k: "id", v: "sec", fn: true },
  csc: { k: "id", v: "csc", fn: true }, cot: { k: "id", v: "cot", fn: true }, min: { k: "id", v: "min", fn: true }, max: { k: "id", v: "max", fn: true },
  // Phase 21A — multiple integrals, chemistry / physics arrows, matrix dots, complex parts and common scientific functions
  iint: { k: "op", v: "∬", large: true }, iiint: { k: "op", v: "∭", large: true }, rightleftharpoons: { k: "op", v: "⇌" }, leftrightarrow: { k: "op", v: "↔" },
  uparrow: { k: "op", v: "↑" }, downarrow: { k: "op", v: "↓" }, vdots: { k: "op", v: "⋮" }, ddots: { k: "op", v: "⋱" },
  hbar: { k: "id", v: "ℏ" }, ell: { k: "id", v: "ℓ" }, Re: { k: "id", v: "ℜ" }, Im: { k: "id", v: "ℑ" },
  arg: { k: "id", v: "arg", fn: true }, det: { k: "id", v: "det", fn: true }, sinh: { k: "id", v: "sinh", fn: true }, cosh: { k: "id", v: "cosh", fn: true },
  tanh: { k: "id", v: "tanh", fn: true }, arcsin: { k: "id", v: "arcsin", fn: true }, arccos: { k: "id", v: "arccos", fn: true }, arctan: { k: "id", v: "arctan", fn: true }
});
const ACCENTS: Readonly<Record<string, string>> = Object.freeze({ vec: "→", overline: "‾", bar: "‾", hat: "^", dot: "˙", ddot: "¨" });
/** \mathbb is a FIXED number-set alphabet (ℕ ℤ ℚ ℝ ℂ), not a font-styling command. */
const NUMBER_SETS: Readonly<Record<string, string>> = Object.freeze({ N: "ℕ", Z: "ℤ", Q: "ℚ", R: "ℝ", C: "ℂ" });
const FRACS = new Set(["frac", "dfrac", "tfrac"]);
const TEXTS = new Set(["text", "mathrm"]);
const SPACES = new Set(["quad", "qquad"]);
/** Every command the subset knows (discoverable vocabulary for authoring / future generation). */
export const MATH_COMMANDS: readonly string[] = Object.freeze([...Object.keys(SYMBOLS), ...Object.keys(ACCENTS), ...FRACS, "sqrt", ...TEXTS, ...SPACES, "left", "right", "begin", "end", "mathbb"].sort());
const OPS = new Set(["+", "-", "*", "/", "=", "<", ">", "(", ")", "[", "]", "|", "!", "'", ",", ".", ":", ";", "?"]);
const FENCES = new Set(["(", ")", "[", "]", "|", "."]);

// "cellsep" (&) and "rowsep" (\\) are dedicated tokens: never symbols, never text, legal only where a grid expects them (21A)
type Tok = { t: "cmd"; v: string } | { t: "sym"; v: string } | { t: "num"; v: string } | { t: "letter"; v: string } | { t: "open" } | { t: "close" } | { t: "sup" } | { t: "sub" } | { t: "lbrack" } | { t: "rbrack" } | { t: "space" } | { t: "ws" } | { t: "cellsep" } | { t: "rowsep" };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\n" || ch === "\t" || ch === "\r") { if (out.length && out[out.length - 1].t !== "ws") out.push({ t: "ws" }); i++; continue; }
    if (ch === "\\") {
      const m = /^[A-Za-z]+/.exec(src.slice(i + 1));
      if (m) { out.push({ t: "cmd", v: m[0] }); i += 1 + m[0].length; continue; }
      const next = src[i + 1];
      if (next === "\\") { out.push({ t: "rowsep" }); i += 2; continue; }
      if (next === "," || next === ";" || next === " " || next === ":") { out.push({ t: "space" }); i += 2; continue; }
      if (next === "{" || next === "}" || next === "%" || next === "|") { out.push({ t: "sym", v: next }); i += 2; continue; }
      return "رمز غير مسموح بعد \\";
    }
    if (ch === "&") { out.push({ t: "cellsep" }); i++; continue; }
    if (ch === "{") { out.push({ t: "open" }); i++; continue; }
    if (ch === "}") { out.push({ t: "close" }); i++; continue; }
    if (ch === "^") { out.push({ t: "sup" }); i++; continue; }
    if (ch === "_") { out.push({ t: "sub" }); i++; continue; }
    if (ch === "[") { out.push({ t: "lbrack" }); i++; continue; }
    if (ch === "]") { out.push({ t: "rbrack" }); i++; continue; }
    const num = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: num[0] }); i += num[0].length; continue; }
    if (/\p{L}/u.test(ch)) { out.push({ t: "letter", v: ch }); i++; continue; }
    if (OPS.has(ch)) { out.push({ t: "sym", v: ch }); i++; continue; }
    return "رمز غير مسموح في الصيغة: " + ch;
  }
  return out;
}

class MathError extends Error {}

/** Parses a math source of the allow-listed subset. Never throws. */
export function parseMath(source: unknown): MathParse {
  if (typeof source !== "string" || source.trim() === "") return { ok: false, message: "الصيغة الرياضية فارغة." };
  if (source.length > MATH_LIMITS.chars) return { ok: false, message: "الصيغة الرياضية أطول من الحد المسموح." };
  const toks = tokenize(source);
  if (typeof toks === "string") return { ok: false, message: toks };
  let pos = 0, nodes = 0, inText = false, inGrid = false;
  const fail = (m: string): never => { throw new MathError(m); };
  const count = <T extends MathNode>(n: T): T => { if (++nodes > MATH_LIMITS.nodes) fail("الصيغة الرياضية أكبر من الحد المسموح."); return n; };
  // whitespace is insignificant EXCEPT inside \text{...} (kept there as a single space)
  const peek = (): Tok => { while (!inText && pos < toks.length && toks[pos].t === "ws") pos++; return toks[pos]; };
  // row := atom* until a stop token
  const row = (depth: number, stop: (t: Tok | undefined) => boolean): MathNode => {
    if (depth > MATH_LIMITS.depth) fail("الصيغة الرياضية متداخلة أكثر من الحد المسموح.");
    const c: MathNode[] = [];
    while (pos < toks.length && !stop(peek())) c.push(scripted(depth));
    return count({ k: "row", c });
  };
  const group = (depth: number): MathNode => {
    const t = peek();
    if (!t || t.t !== "open") fail("يُتوقع { في الصيغة الرياضية.");
    pos++;
    const r = row(depth + 1, x => !!x && x.t === "close");
    if (!peek() || peek().t !== "close") fail("أقواس { } غير متوازنة في الصيغة الرياضية.");
    pos++;
    return r;
  };
  // an argument is a braced group or a single atom (\frac12 is allowed as in LaTeX)
  const arg = (depth: number): MathNode => (peek() && peek().t === "open" ? group(depth) : atom(depth));
  const textGroup = (): string => {
    // \text{...}: the RAW characters between the braces are kept as plain text (re-read from the source tokens)
    const t = peek();
    if (!t || t.t !== "open") fail("يُتوقع { بعد \\text.");
    pos++;
    inText = true;
    let s = "";
    while (pos < toks.length && peek().t !== "close") {
      const x = peek();
      if (x.t === "letter" || x.t === "num" || x.t === "sym") s += x.v;
      else if (x.t === "space" || x.t === "ws") s += " ";
      else { inText = false; fail("محتوى \\text يجب أن يكون نصًا عاديًا."); }
      pos++;
    }
    inText = false;
    if (!peek()) fail("أقواس { } غير متوازنة في الصيغة الرياضية.");
    pos++;
    return s.trim();
  };
  const fence = (): string => {
    const t = peek();
    if (!t) fail("يُتوقع قوس بعد \\left أو \\right.");
    if (t.t === "sym" && FENCES.has(t.v)) { pos++; return t.v === "." ? "" : t.v; }
    if (t.t === "lbrack") { pos++; return "["; }
    if (t.t === "rbrack") { pos++; return "]"; }
    if (t.t === "sym" && (t.v === "{" || t.v === "}")) { pos++; return t.v; }
    return fail("قوس غير مسموح بعد \\left أو \\right.");
  };
  // \begin / \end name: a braced run of ASCII letters read token by token — no whitespace, no commands, no groups, at most 16 letters
  const envName = (): string => {
    if (!peek() || peek().t !== "open") fail("يُتوقع اسم بيئة بين { } بعد \\begin أو \\end.");
    pos++;
    let name = "";
    while (pos < toks.length && name.length < 16) { const x = toks[pos]; if (x.t !== "letter" || !/^[A-Za-z]$/.test(x.v)) break; name += x.v; pos++; }
    if (pos >= toks.length || toks[pos].t !== "close") fail("اسم بيئة غير مسموح في الصيغة الرياضية.");
    pos++;
    return name;
  };
  // grid := \begin{env} cell (& cell)* (\\ cell (& cell)*)* [\\] \end{env}, bounded while parsing, never nested
  const grid = (depth: number): MathNode => {
    if (inGrid) fail("لا يُسمح بتداخل البيئات في الصيغة الرياضية.");
    const env = envName();
    if (!Object.prototype.hasOwnProperty.call(ENV_COLS, env)) fail("بيئة غير مسموح بها في الصيغة الرياضية: " + env);
    const maxCols = ENV_COLS[env];
    inGrid = true;
    const rows: MathNode[][] = [];
    let cells = 0, cur: MathNode[] = [];
    const stop = (x: Tok | undefined) => !x || x.t === "cellsep" || x.t === "rowsep" || (x.t === "cmd" && x.v === "end");
    for (;;) {
      cur.push(row(depth + 1, stop));
      if (++cells > MATH_GRID_LIMITS.cells || cur.length > maxCols) fail("المصفوفة أكبر من الحد المسموح في الصيغة الرياضية.");
      const t = peek();
      if (!t) fail("\\begin{" + env + "} بلا \\end في الصيغة الرياضية.");
      pos++;
      if (t.t === "cellsep") continue;
      rows.push(cur); cur = [];
      if (rows.length > MATH_GRID_LIMITS.rows) fail("عدد صفوف المصفوفة أكبر من الحد المسموح في الصيغة الرياضية.");
      if (t.t === "rowsep") {
        const n = peek();
        if (n && n.t === "lbrack") fail("وسيط المسافة بعد \\\\ غير مسموح في الصيغة الرياضية.");
        if (n && n.t === "cmd" && n.v === "end") { pos++; break; }                       // one trailing row break before \end adds no row
        continue;
      }
      break;                                                                                // \end
    }
    inGrid = false;
    if (envName() !== env) fail("\\end لا يطابق \\begin{" + env + "} في الصيغة الرياضية.");
    const empty = (c: MathNode) => c.k === "row" && c.c.length === 0;
    if (env === "cases" || env === "aligned") {
      // value [& condition] / lhs [& rhs]: only an aligned continuation row may leave its lhs empty
      for (const r of rows) if (r.some((c, i) => empty(c) && !(env === "aligned" && i === 0 && r.length === 2))) fail("خلية فارغة غير مسموحة في الصيغة الرياضية.");
    } else {
      if (rows.some(r => r.length !== rows[0].length)) fail("صفوف المصفوفة غير متساوية الطول في الصيغة الرياضية.");
      if (rows.some(r => r.some(empty))) fail("خلية فارغة غير مسموحة في الصيغة الرياضية.");
    }
    return count({ k: "grid", env: env as MathEnvironment, rows });
  };
  const atom = (depth: number): MathNode => {
    // unbraced command arguments (\vec \vec x, \sqrt \sqrt 2) recurse through arg → atom, not row: bound them too (review fix 1)
    if (depth > MATH_LIMITS.depth) fail("الصيغة الرياضية متداخلة أكثر من الحد المسموح.");
    const t = peek();
    if (!t) return fail("الصيغة الرياضية ناقصة.");
    pos++;
    switch (t.t) {
      case "num": return count({ k: "num", v: t.v });
      case "letter": return count({ k: "id", v: t.v });
      case "sym": return count({ k: "op", v: t.v });
      case "lbrack": return count({ k: "op", v: "[" });
      case "rbrack": return count({ k: "op", v: "]" });
      case "space": return count({ k: "space" });
      case "open": { pos--; return group(depth); }
      case "close": return fail("قوس } زائد في الصيغة الرياضية.");
      case "sup": case "sub": return fail("رمز ^ أو _ بلا أساس في الصيغة الرياضية.");
      case "cellsep": case "rowsep": return fail("الرمزان & و \\\\ مسموحان فقط بين خلايا مصفوفة أو cases أو aligned.");
      case "cmd": {
        const c = t.v;
        if (Object.prototype.hasOwnProperty.call(SYMBOLS, c)) { const s = SYMBOLS[c]; return count(s.k === "op" ? { k: "op", v: s.v, ...(s.large ? { large: true as const } : {}) } : { k: "id", v: s.v, ...(s.fn ? { fn: true as const } : {}) }); }
        if (FRACS.has(c)) { const n = arg(depth + 1); const d = arg(depth + 1); return count({ k: "frac", n, d }); }
        if (c === "sqrt") {
          let idx: MathNode | undefined;
          if (peek() && peek().t === "lbrack") { pos++; idx = row(depth + 1, x => !!x && x.t === "rbrack"); if (!peek() || peek().t !== "rbrack") fail("قوس ] ناقص في \\sqrt."); pos++; }
          return count({ k: "sqrt", b: arg(depth + 1), ...(idx ? { idx } : {}) });
        }
        if (TEXTS.has(c)) return count({ k: "text", v: textGroup() });
        if (SPACES.has(c)) return count({ k: "space" });
        if (Object.prototype.hasOwnProperty.call(ACCENTS, c)) return count({ k: "accent", b: arg(depth + 1), v: ACCENTS[c] });
        if (c === "left") {
          const open = fence();
          const inner = row(depth + 1, x => !!x && x.t === "cmd" && x.v === "right");
          if (!peek()) fail("\\left بلا \\right في الصيغة الرياضية.");
          pos++;
          return count({ k: "fenced", open, close: fence(), c: inner });
        }
        if (c === "right") return fail("\\right بلا \\left في الصيغة الرياضية.");
        if (c === "begin") return grid(depth);
        if (c === "end") return fail("\\end بلا \\begin في الصيغة الرياضية.");
        if (c === "mathbb") {
          let v: string | undefined;
          const t2 = peek();
          if (t2 && t2.t === "open") { const l = toks[pos + 1], cl = toks[pos + 2]; if (l && l.t === "letter" && cl && cl.t === "close") { v = l.v; pos += 3; } }
          else if (t2 && t2.t === "letter") { v = t2.v; pos++; }
          if (v === undefined || !Object.prototype.hasOwnProperty.call(NUMBER_SETS, v)) fail("\\mathbb يقبل فقط N أو Z أو Q أو R أو C.");
          return count({ k: "id", v: NUMBER_SETS[v as string] });
        }
        return fail("أمر غير مسموح في الصيغة الرياضية: \\" + c);
      }
    }
    return fail("الصيغة الرياضية غير صالحة.");
  };
  const scripted = (depth: number): MathNode => {
    const b = atom(depth);
    let sub: MathNode | undefined, sup: MathNode | undefined;
    for (let guard = 0; guard < 2 && peek() && (peek().t === "sup" || peek().t === "sub"); guard++) {
      const which = peek().t; pos++;
      const a = arg(depth + 1);
      if (which === "sup") { if (sup) fail("أس مكرر في الصيغة الرياضية."); sup = a; } else { if (sub) fail("دليل سفلي مكرر في الصيغة الرياضية."); sub = a; }
    }
    if (peek() && (peek().t === "sup" || peek().t === "sub")) fail("أس أو دليل مكرر في الصيغة الرياضية.");
    return sub || sup ? count({ k: "scripts", b, ...(sub ? { sub } : {}), ...(sup ? { sup } : {}) }) : b;
  };
  try {
    const ast = row(0, () => false);
    if (peek() !== undefined) fail("الصيغة الرياضية غير صالحة.");
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, message: e instanceof MathError ? e.message : "الصيغة الرياضية غير صالحة." };
  }
}
