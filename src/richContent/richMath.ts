// Phase 20D.1 — the SAFE math subset. A strict, allow-listed LaTeX-style source is parsed into a CLOSED abstract syntax tree; the lazy
// renderer (RichMath.tsx) turns that tree into MathML ELEMENTS built by React (never an HTML string, never a library's innerHTML).
// Anything outside the allow-list — unknown commands, macros (\def, \newcommand), HTML-capable commands (\href, \url, \html, \style,
// \class), file inputs, unbalanced braces, stray characters — is REFUSED, never repaired. Pure, server-safe (shared finalization build).

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
  | { k: "fenced"; open: string; close: string; c: MathNode };
export type MathParse = { ok: true; ast: MathNode } | { ok: false; message: string };

export const MATH_LIMITS = Object.freeze({ chars: 2000, nodes: 600, depth: 24 });

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
  csc: { k: "id", v: "csc", fn: true }, cot: { k: "id", v: "cot", fn: true }, min: { k: "id", v: "min", fn: true }, max: { k: "id", v: "max", fn: true }
});
const ACCENTS: Readonly<Record<string, string>> = Object.freeze({ vec: "→", overline: "‾", bar: "‾", hat: "^", dot: "˙" });
const FRACS = new Set(["frac", "dfrac", "tfrac"]);
const TEXTS = new Set(["text", "mathrm"]);
const SPACES = new Set(["quad", "qquad"]);
/** Every command the subset knows (discoverable vocabulary for authoring / future generation). */
export const MATH_COMMANDS: readonly string[] = Object.freeze([...Object.keys(SYMBOLS), ...Object.keys(ACCENTS), ...FRACS, "sqrt", ...TEXTS, ...SPACES, "left", "right"].sort());
const OPS = new Set(["+", "-", "*", "/", "=", "<", ">", "(", ")", "[", "]", "|", "!", "'", ",", ".", ":", ";", "?"]);
const FENCES = new Set(["(", ")", "[", "]", "|", "."]);

type Tok = { t: "cmd"; v: string } | { t: "sym"; v: string } | { t: "num"; v: string } | { t: "letter"; v: string } | { t: "open" } | { t: "close" } | { t: "sup" } | { t: "sub" } | { t: "lbrack" } | { t: "rbrack" } | { t: "space" } | { t: "ws" };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\n" || ch === "\t") { if (out.length && out[out.length - 1].t !== "ws") out.push({ t: "ws" }); i++; continue; }
    if (ch === "\\") {
      const m = /^[A-Za-z]+/.exec(src.slice(i + 1));
      if (m) { out.push({ t: "cmd", v: m[0] }); i += 1 + m[0].length; continue; }
      const next = src[i + 1];
      if (next === "," || next === ";" || next === " " || next === ":") { out.push({ t: "space" }); i += 2; continue; }
      if (next === "{" || next === "}" || next === "%" || next === "|") { out.push({ t: "sym", v: next }); i += 2; continue; }
      return "رمز غير مسموح بعد \\";
    }
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
  let pos = 0, nodes = 0, inText = false;
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
