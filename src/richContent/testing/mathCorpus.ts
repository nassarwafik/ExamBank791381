// Phase 21A — deterministic math-source generators for the scientific-math certification (TEST-ONLY: never imported by production code).
//   oldGrammarCorpus — candidates drawn ONLY from the Phase 20D.1 vocabulary (plus deliberate corruptions): the old-grammar freeze proves
//                      every expression the 20D.1 parser accepted keeps an identical AST, and nothing it refused is newly accepted
//                      unless it carries a documented Scientific Math v2 construct.
//   scientificV2Corpus — VALID v2 expressions (grids, number sets, multiple integrals, calculus, units, chemistry, electricity) and
//                      INVALID near-misses, for the generated-grammar campaign.

export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const LETTERS = ["x", "y", "z", "a", "b", "c", "n", "k", "t", "f", "g", "V", "I", "R", "P", "E", "m", "s", "ع", "س"];
const NUMS = ["0", "1", "2", "3", "10", "3.14", "0.5", "42", "6.02", "9.8"];
const OPS = ["+", "-", "*", "/", "=", "<", ">", "(", ")", "[", "]", "|", "!", "'", ",", ".", ":", ";", "?"];
const OLD_SYMBOLS = ["times", "cdot", "div", "pm", "mp", "le", "leq", "ge", "geq", "neq", "ne", "approx", "equiv", "propto", "to", "rightarrow",
  "leftarrow", "Rightarrow", "Leftrightarrow", "circ", "in", "notin", "subset", "cup", "cap", "perp", "parallel", "angle", "ldots", "cdots",
  "forall", "exists", "sum", "prod", "int", "oint", "infty", "degree", "prime", "partial", "nabla", "triangle", "alpha", "beta", "gamma",
  "Gamma", "delta", "Delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "Theta", "kappa", "lambda", "Lambda", "mu", "nu", "xi", "pi",
  "Pi", "rho", "sigma", "Sigma", "tau", "phi", "Phi", "chi", "psi", "Psi", "omega", "Omega", "lim", "log", "ln", "exp", "sin", "cos", "tan",
  "sec", "csc", "cot", "min", "max"];
const OLD_ACCENTS = ["vec", "overline", "bar", "hat", "dot"];
const FRACS = ["frac", "dfrac", "tfrac"];
const FENCE_OPEN = ["(", "[", "|", ".", "\\{"];
const FENCE_CLOSE = [")", "]", "|", ".", "\\}"];
const TEXTS = ["\\text{السرعة}", "\\text{if }", "\\mathrm{m}", "\\mathrm{kg}", "\\text{otherwise}", "\\mathrm{H}", "\\text{a b}"];
const SPACES = ["\\,", "\\;", "\\:", "\\ ", "\\quad", "\\qquad"];
/** Near-miss corruptions: malformed old grammar, refused commands, and v2 look-alikes (which the 20D.1 parser refused). */
const CORRUPT: ((s: string) => string)[] = [
  s => s + "}", s => "{" + s, s => s.replace("{", ""), s => s + "^", s => "_" + s, s => s + "^2^3", s => s + "\\unknowncmd",
  s => s + "\\def\\x{1}", s => s + "\\href{http://x}{y}", s => s + " & " + s, s => s + " \\\\ " + s, s => "\\begin{matrix}" + s + "\\end{matrix}",
  s => s + "\\left(", s => s + "\\right)", s => s + "\\sqrt[2", s => s.replace(/\}/, ""), s => s + "#", s => s + "$", s => s + "~", s => s + "\\@",
  s => "\\text{" + s, s => s + "\\mathbb{R}", s => s + "\\iint", s => s + "\\end{matrix}", s => s + "\\\\", s => "&" + s
];

/** Old-grammar candidates (deterministic for a seed). Every second candidate is corrupted. */
export function oldGrammarCandidates(seed: number): () => string {
  const r = prng(seed);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const chance = (p: number) => r() < p;
  const atom = (d: number): string => {
    const x = r();
    if (d > 2 || x < 0.34) return pick([pick(LETTERS), pick(NUMS), pick(OPS), "\\" + pick(OLD_SYMBOLS)]);
    if (x < 0.42) return "\\" + pick(FRACS) + "{" + expr(d + 1) + "}{" + expr(d + 1) + "}";
    if (x < 0.48) return "\\frac" + pick(["12", "{1}2", "1{2}", "ab"]);
    if (x < 0.56) return "\\sqrt" + (chance(0.4) ? "[" + expr(d + 1) + "]" : "") + "{" + expr(d + 1) + "}";
    if (x < 0.64) return "\\" + pick(OLD_ACCENTS) + (chance(0.7) ? "{" + expr(d + 1) + "}" : " " + pick(LETTERS));
    if (x < 0.72) return "\\left" + pick(FENCE_OPEN) + " " + expr(d + 1) + " \\right" + pick(FENCE_CLOSE);
    if (x < 0.80) return pick(TEXTS);
    if (x < 0.85) return pick(SPACES);
    return "{" + expr(d + 1) + "}";
  };
  const scripted = (d: number): string => {
    let s = atom(d);
    const x = r();
    const sc = () => (chance(0.5) ? "{" + expr(d + 1) + "}" : pick([pick(LETTERS), pick(NUMS), "\\" + pick(["alpha", "infty", "pi"])]));
    if (x < 0.15) s += "^" + sc();
    else if (x < 0.27) s += "_" + sc();
    else if (x < 0.34) s += "_" + sc() + "^" + sc();
    else if (x < 0.38) s += "^" + sc() + "_" + sc();
    return s;
  };
  const expr = (d: number): string => {
    const n = 1 + Math.floor(r() * (d === 0 ? 5 : 2));
    const parts: string[] = [];
    for (let i = 0; i < n; i++) parts.push(scripted(d));
    return parts.join(chance(0.3) ? " " : "");
  };
  let i = 0;
  return () => { const s = expr(0); return ++i % 2 === 0 ? pick(CORRUPT)(s) : s; };
}

// ── Scientific Math v2 generated corpus ─────────────────────────────────────────────────────────────────────────────────────────────────
export type V2Env = "matrix" | "pmatrix" | "bmatrix" | "vmatrix" | "Vmatrix" | "cases" | "aligned";
/** A generated case: `grids` is the expected shape (environment + cells per row) of every grid, in source order, for a VALID case. */
export type V2Case = { source: string; valid: boolean; kind: string; grids: { env: V2Env; rows: number[] }[] };
const MATRIX_ENVS: readonly V2Env[] = ["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix"];
/** Cell snippets that are valid on their own (proven by test) — old grammar and v2 constructs, Arabic text included. */
export const V2_CELLS = ["a", "x", "0", "1", "-1", "42", "3.14", "x^{2}", "a_{ij}", "\\frac{a}{b}", "\\sqrt{2}", "\\alpha", "-x", "2x + 1", "\\cos\\theta", "-\\sin\\theta",
  "\\text{إذا كان } x \\ge 0", "\\text{otherwise}", "\\mathbb{R}", "2\\mathrm{H}_2", "\\vec{v}", "\\overline{z}", "\\Re(z)", "\\Im(z)", "\\hbar \\omega", "\\ell",
  "\\frac{\\partial f}{\\partial x}", "\\lim_{x \\to 0} f(x)", "\\vdots", "\\cdots", "\\ddots", "\\det A", "e^{i\\theta}", "6.02 \\times 10^{23}", "IR", "\\frac{V}{R}"];
const V2_INLINE = ["\\mathbb{N}", "\\mathbb{Z}", "\\mathbb{Q}", "\\mathbb{R}", "\\mathbb{C}", "\\mathbb N", "\\iint_{D} f \\, dA", "\\iiint_{V} \\rho \\, dV", "\\mathrm{N}_2 + 3\\mathrm{H}_2 \\rightleftharpoons 2\\mathrm{NH}_3",
  "a \\leftrightarrow b", "\\uparrow \\downarrow", "\\arg(z) = \\theta", "\\sinh x + \\cosh x", "\\arctan 1", "\\ddot{x}", "\\hbar", "\\tanh y", "\\arcsin x + \\arccos x"];
const BAD_ENVS = ["array", "tabular", "align", "align*", "equation", "gather", "split", "smallmatrix", "Bmatrix", "pmatrix*", "Matrix", "__proto__", "constructor", "matrix1"];

export function scientificV2Candidates(seed: number): () => V2Case {
  const r = prng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const ws = () => pick([" ", " ", "  ", "\n", "\n  ", "\r\n", "\t"]);
  const SIMPLE = ["a", "b", "x", "0", "1", "-1", "2", "42", "\\alpha", "x^{2}", "\\pi", "c"];
  /** Large grids use short cells so a VALID case stays within 2,000 characters and 600 nodes. */
  const cell = (simple = false) => { if (simple) return pick(SIMPLE); const n = int(1, 2); const p: string[] = []; for (let i = 0; i < n; i++) p.push(pick(V2_CELLS)); return p.join(pick([" + ", " ", " - "])); };
  /** A valid grid of the given environment with the given cells-per-row; aligned rows may leave the left cell empty. */
  const gridOf = (env: V2Env, rows: number[], trailing: boolean) => {
    const simple = rows.reduce((a, b) => a + b, 0) > 12;
    const body = rows.map(n => Array.from({ length: n }, (_, j) => (env === "aligned" && n === 2 && j === 0 && r() < 0.3 ? "" : cell(simple))).join(ws() + "&" + ws())).join(ws() + "\\\\" + ws());
    return "\\begin{" + env + "}" + ws() + body + (trailing ? ws() + "\\\\" : "") + ws() + "\\end{" + env + "}";
  };
  const shape = (env: V2Env): number[] => {
    if (MATRIX_ENVS.includes(env)) { const cols = int(1, 8), rows = int(1, Math.min(12, Math.floor(64 / cols))); return Array(rows).fill(cols); }
    return Array.from({ length: int(1, 12) }, () => int(1, 2));
  };
  const valid = (): V2Case => {
    const x = r();
    if (x < 0.15) return { source: pick(V2_INLINE) + (r() < 0.5 ? " + " + cell() : ""), valid: true, kind: "inline-v2", grids: [] };
    const env = pick([...MATRIX_ENVS, "cases", "aligned"] as V2Env[]);
    const rows = x >= 0.9 ? Array(int(1, 3)).fill(int(1, 3)).map(n => (env === "cases" || env === "aligned" ? Math.min(n, 2) : n)) : shape(env);
    const g = gridOf(env, rows, r() < 0.2);
    if (x < 0.75) return { source: g, valid: true, kind: "grid:" + env, grids: [{ env, rows }] };
    if (x < 0.9) return { source: pick(["A = ", "f(x) = ", "\\det ", "x \\in \\mathbb{R}, \\quad "]) + g + pick(["", " = 0", ", \\quad x \\ge 0"]), valid: true, kind: "embedded:" + env, grids: [{ env, rows }] };
    const env2 = pick(MATRIX_ENVS), rows2 = Array(int(1, 3)).fill(int(1, 3));
    return { source: g + " " + pick(["=", "+", "\\cdot", "\\times"]) + " " + gridOf(env2, rows2, false), valid: true, kind: "two-grids", grids: [{ env, rows }, { env: env2, rows: rows2 }] };
  };
  const INVALID: [string, () => string][] = [
    ["unknown-env", () => { const e = pick(BAD_ENVS); return "\\begin{" + e + "} a & b \\end{" + e + "}"; }],
    ["mismatched-end", () => { const a = pick(MATRIX_ENVS); let b = pick(MATRIX_ENVS); if (b === a) b = a === "matrix" ? "pmatrix" : "matrix"; return "\\begin{" + a + "} a & b \\\\ c & d \\end{" + b + "}"; }],
    ["missing-end", () => gridOf(pick(MATRIX_ENVS), [2, 2], false).replace(/\\end\{[A-Za-z]+\}$/, "")],
    ["extra-end", () => gridOf(pick(MATRIX_ENVS), [2], false) + " \\end{matrix}"],
    ["nested", () => "\\begin{pmatrix} " + gridOf("matrix", [1], false) + " & b \\end{pmatrix}"],
    ["separator-outside", () => cell() + pick([" & ", " \\\\ "]) + cell()],
    ["separator-in-group", () => "\\begin{matrix} {" + cell() + " & " + cell() + "} \\end{matrix}"],
    ["too-many-rows", () => gridOf("matrix", Array(13).fill(1), false)],
    ["too-many-cols", () => gridOf("bmatrix", [9], false)],
    ["too-many-cells", () => gridOf("pmatrix", Array(9).fill(8), false)],
    ["cases-3-cols", () => gridOf("cases", [2, 3], false)],
    ["aligned-3-cols", () => gridOf("aligned", [3], false)],
    ["ragged-matrix", () => "\\begin{vmatrix} a & b \\\\ c \\end{vmatrix}"],
    ["empty-cell", () => "\\begin{matrix} a & \\\\ c & d \\end{matrix}"],
    ["empty-grid", () => "\\begin{" + pick(MATRIX_ENVS) + "}" + ws() + "\\end{" + "matrix}"],
    ["row-spacing", () => "\\begin{matrix} a \\\\[2pt] b \\end{matrix}"],
    ["double-trailing", () => "\\begin{matrix} a \\\\ \\\\ \\end{matrix}"],
    ["bad-name", () => pick(["\\begin{ matrix } a \\end{matrix}", "\\begin matrix a \\end matrix", "\\begin{} a \\end{}", "\\begin{\\text{matrix}} a \\end{matrix}", "\\begin{matrix a \\end{matrix}"])],
    ["bad-mathbb", () => "\\mathbb{" + pick(["A", "RR", "\\alpha", "", "1", "r", "ℝ"]) + "}"],
    ["escape-hatch-in-cell", () => "\\begin{pmatrix} " + pick(["\\href{x}{y}", "\\url{x}", "\\def\\a{1}", "\\newcommand{\\a}{1}", "\\input{x}", "\\color{red}{x}", "\\style{x}"]) + " & b \\end{pmatrix}"],
    ["over-length", () => { let s = "\\begin{matrix} "; while (s.length <= 2000) s += cell() + " \\\\ "; return s + "a \\end{matrix}"; }]
  ];
  let i = 0;
  return () => {
    if (++i % 2 === 1) return valid();
    const [kind, make] = pick(INVALID);
    return { source: make(), valid: false, kind, grids: [] };
  };
}
