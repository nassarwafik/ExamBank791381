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
