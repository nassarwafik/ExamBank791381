import { describe, it, expect } from "vitest";
import * as M from "./richMath";
import type { MathNode } from "./richMath";
import { MATH_FEATURES } from "./mathFeatures";

// Phase 21A — SCIENTIFIC MATH v2: the safe, allow-listed, bounded notation language. Fail-first on 60ddadc (no grids, no environments,
// no number sets, no multiple integrals, no language identity). The grammar stays NON-Turing-complete: a fixed environment allow-list,
// contextual cell / row separators, explicit grid bounds, no macros, no generic TeX.
type Grid = { k: "grid"; env: string; rows: MathNode[][] };
const ok = (s: string): MathNode => { const p = M.parseMath(s); if (!p.ok) throw new Error(JSON.stringify(s) + " → " + p.message); return p.ast; };
const refused = (s: string) => { const p = M.parseMath(s); expect(p.ok, "must be refused: " + JSON.stringify(s)).toBe(false); };
const find = (n: unknown, k: string): Record<string, unknown>[] => {
  const out: Record<string, unknown>[] = [];
  const walk = (x: unknown) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") { if ((x as { k?: string }).k === k) out.push(x as Record<string, unknown>); Object.values(x).forEach(walk); } };
  walk(n);
  return out;
};
const grid = (s: string): Grid => { const g = find(ok(s), "grid"); expect(g, s).toHaveLength(1); return g[0] as unknown as Grid; };
const cellText = (c: MathNode): string => JSON.stringify(c);
const id = (v: string) => ({ k: "row", c: [{ k: "id", v }] });

describe("21A-S1 language identity — code-owned, discoverable, frozen", () => {
  it("MATH_LANGUAGE_VERSION is 2; the environment allow-list is exactly the seven fixed environments", () => {
    expect(M.MATH_LANGUAGE_VERSION).toBe(2);
    expect([...M.MATH_ENVIRONMENTS]).toEqual(["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix", "cases", "aligned"]);
    expect(Object.isFrozen(M.MATH_ENVIRONMENTS)).toBe(true);
    expect(M.MATH_GRID_LIMITS).toEqual({ rows: 12, cols: 8, cells: 64, casesCols: 2, alignedCols: 2 });
    expect(Object.isFrozen(M.MATH_GRID_LIMITS)).toBe(true);
    expect(M.MATH_LIMITS).toEqual({ chars: 2000, nodes: 600, depth: 24 });                                        // the global bounds are unchanged
  });
  it("MATH_COMMANDS lists every new command and still every old one; it is frozen and sorted", () => {
    for (const c of ["begin", "end", "mathbb", "iint", "iiint", "Re", "Im", "arg", "det", "rightleftharpoons", "leftrightarrow", "uparrow", "downarrow", "hbar", "ell", "vdots", "ddots", "ddot", "sinh", "cosh", "tanh", "arcsin", "arccos", "arctan"])
      expect(M.MATH_COMMANDS, c).toContain(c);
    for (const c of ["frac", "dfrac", "tfrac", "sqrt", "left", "right", "text", "mathrm", "sum", "prod", "int", "oint", "lim", "vec", "partial", "Omega"]) expect(M.MATH_COMMANDS, c).toContain(c);
    expect(Object.isFrozen(M.MATH_COMMANDS)).toBe(true);
    expect([...M.MATH_COMMANDS]).toEqual([...M.MATH_COMMANDS].sort());
  });
  it("MATH_FEATURES: every advertised feature carries an example that the parser accepts (no feature without proof)", () => {
    const ids = MATH_FEATURES.map(f => f.id);
    for (const f of ["matrices", "determinants", "cases", "aligned", "derivatives", "partialDerivatives", "multipleIntegrals", "complex", "numberSets", "units", "chemistry", "electricity", "vectors", "fractions", "roots", "scripts", "largeOperators", "limits"]) expect(ids, f).toContain(f);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of MATH_FEATURES) { expect(M.parseMath(f.example).ok, f.id + ": " + f.example).toBe(true); expect(typeof f.group).toBe("string"); }
    expect(Object.isFrozen(MATH_FEATURES)).toBe(true);
  });
});

describe("21A-S2 matrices, determinants, cases, aligned — closed grid AST", () => {
  it("every matrix family builds { k:'grid', env, rows: cell rows } with no source-controlled field", () => {
    for (const env of ["matrix", "pmatrix", "bmatrix", "vmatrix", "Vmatrix"]) {
      const g = grid(`\\begin{${env}} a & b \\\\ c & d \\end{${env}}`);
      expect(g).toEqual({ k: "grid", env, rows: [[id("a"), id("b")], [id("c"), id("d")]] });
      expect(Object.keys(g).sort()).toEqual(["env", "k", "rows"]);
    }
  });
  it("multi-line sources (LF and CRLF), a single trailing \\\\ before \\end, and rich cells", () => {
    expect(grid("\\begin{matrix}\na & b \\\\\nc & d\n\\end{matrix}").rows).toHaveLength(2);
    expect(grid("\\begin{bmatrix}\r\n1 & 0 \\\\\r\n0 & 1\r\n\\end{bmatrix}").rows).toHaveLength(2);
    expect(grid("\\begin{pmatrix} a & b \\\\ c & d \\\\ \\end{pmatrix}").rows).toHaveLength(2);       // the trailing row break adds no row
    const g = grid("\\begin{pmatrix} \\frac{1}{2} & \\sqrt{x} \\\\ x^{2}_{1} & \\left( a+b \\right) \\end{pmatrix}");
    expect(find(g, "frac")).toHaveLength(1);
    expect(find(g, "fenced")).toHaveLength(1);
  });
  it("a determinant is a vmatrix (|…|), a norm-style determinant a Vmatrix (‖…‖); a 3×3 determinant parses", () => {
    expect(grid("\\det A = \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc").env).toBe("vmatrix");
    expect(grid("\\begin{vmatrix} 1 & 2 & 3 \\\\ 4 & 5 & 6 \\\\ 7 & 8 & 9 \\end{vmatrix}").rows.map(r => r.length)).toEqual([3, 3, 3]);
    expect(grid("\\begin{Vmatrix} x \\\\ y \\end{Vmatrix}").env).toBe("Vmatrix");
  });
  it("cases / systems: value & condition rows (conditions may be Arabic \\text), a row may omit its condition", () => {
    const g = grid("f(x)= \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}");
    expect(g.env).toBe("cases");
    expect(g.rows.map(r => r.length)).toEqual([2, 2]);
    const ar = grid("\\begin{cases} x^2 & \\text{إذا كان } x \\ge 0 \\\\ -x & \\text{إذا كان } x < 0 \\end{cases}");
    expect(cellText(ar.rows[0][1])).toContain("إذا كان");
    expect(grid("\\begin{cases} 2x + y = 5 \\\\ x - y = 1 \\end{cases}").rows.map(r => r.length)).toEqual([1, 1]);
  });
  it("aligned: lhs & rhs rows with a fixed two-column model; a continuation row may leave the lhs empty", () => {
    const g = grid("\\begin{aligned} V &= IR \\\\ P &= VI \\end{aligned}");
    expect(g.env).toBe("aligned");
    expect(g.rows.map(r => r.length)).toEqual([2, 2]);
    const cont = grid("\\begin{aligned} (a+b)^2 &= (a+b)(a+b) \\\\ &= a^2 + 2ab + b^2 \\end{aligned}");
    expect(cont.rows[1][0]).toEqual({ k: "row", c: [] });
  });
  it("grids compose inline with the old grammar (a matrix inside a fraction, an equation around a determinant)", () => {
    expect(find(ok("A^{-1} = \\frac{1}{\\det A} \\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}"), "grid")).toHaveLength(1);
    expect(find(ok("\\frac{\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}}{2}"), "grid")).toHaveLength(1);
  });
});

describe("21A-S3 environment grammar is a fixed allow-list — everything else is REFUSED", () => {
  it("unknown / forbidden environments: array, tabular, align*, equation*, gather, split, custom, case-variant, non-ASCII, prototype names", () => {
    for (const env of ["array", "tabular", "align", "align*", "equation", "equation*", "gather", "split", "smallmatrix", "Matrix", "MATRIX", "pmatrix*", "mymatrix", "مصفوفة", "mаtrix" /* Cyrillic а */, "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "", " matrix ", "mat rix", "matrix1"])
      refused(`\\begin{${env}} a & b \\end{${env}}`);
    refused("\\begin{array}{c|c} a & b \\end{array}");
    refused("\\begin{tabular}{cc} a & b \\end{tabular}");
  });
  it("malformed begin / end: mismatch, missing \\end, extra \\end, missing names, unbalanced name braces", () => {
    for (const s of ["\\begin{pmatrix} a \\end{bmatrix}", "\\begin{matrix} a & b", "\\begin{matrix} a \\end{matrix} \\end{matrix}", "\\end{matrix}", "a \\end{matrix}",
      "\\begin matrix a \\end matrix", "\\begin{matrix a \\end{matrix}", "\\begin{matrix}} a \\end{matrix}", "\\begin{{matrix}} a \\end{{matrix}}", "\\begin", "\\begin{", "\\begin{matrix}",
      "\\begin{matrix} a \\end", "\\begin{matrix} a \\end{", "\\begin{matrix} a \\end{matrix", "\\begin{\\text{matrix}} a \\end{matrix}", "\\begin{matrix} a \\end{pmatrix}"]) refused(s);
  });
  it("environments never nest in v2 (directly, through a group, through \\left…\\right, through \\frac)", () => {
    for (const s of ["\\begin{matrix} \\begin{matrix} a \\end{matrix} \\end{matrix}", "\\begin{pmatrix} {\\begin{matrix} a \\end{matrix}} & b \\end{pmatrix}",
      "\\begin{cases} \\left( \\begin{matrix} a \\end{matrix} \\right) & x \\end{cases}", "\\begin{aligned} x &= \\frac{\\begin{vmatrix} a \\end{vmatrix}}{2} \\end{aligned}"]) refused(s);
  });
  it("a grid is not an escape hatch: refused commands stay refused inside cells", () => {
    for (const c of ["\\href{x}{y}", "\\url{x}", "\\html{x}", "\\style{x}", "\\class{x}{y}", "\\def\\a{1}", "\\newcommand{\\a}{1}", "\\input{x}", "\\include{x}", "\\let\\a\\b", "\\unknown", "\\catcode", "\\renewcommand{\\a}{1}"])
      refused(`\\begin{pmatrix} ${c} & b \\\\ c & d \\end{pmatrix}`);
  });
  it("\\begin / \\end never become text: inside \\text they are refused characters, never an environment", () => {
    refused("\\text{\\begin{matrix} a \\end{matrix}}");
    refused("\\text{a & b}");
    refused("\\text{a \\\\ b}");
  });
});

describe("21A-S4 cell and row separators are legal ONLY at a grid's own cell level", () => {
  it("& and \\\\ outside any grid are refused (top level, groups, fractions, roots, scripts, fences)", () => {
    for (const s of ["a & b", "&", "a \\\\ b", "\\\\", "a \\\\", "\\frac{a & b}{c}", "\\frac{a}{b \\\\ c}", "\\sqrt[&]{x}", "\\sqrt{a \\\\ b}", "x^&", "x_\\\\", "x^{a & b}", "\\left( a & b \\right)", "\\left& a \\right.", "\\left\\\\ a \\right.", "{a & b}", "\\vec{a & b}", "a &amp; b"])
      refused(s);
  });
  it("inside a grid, separators nested in a group / fence / fraction / script are refused (no silent cell injection)", () => {
    for (const s of ["\\begin{matrix} {a & b} & c \\end{matrix}", "\\begin{matrix} \\left( a & b \\right) \\end{matrix}", "\\begin{matrix} \\frac{a & b}{c} \\end{matrix}",
      "\\begin{matrix} x^{a \\\\ b} \\end{matrix}", "\\begin{cases} \\sqrt{a \\\\ b} & x \\end{cases}"]) refused(s);
  });
  it("repeated separators, empty rows, ragged and empty matrices are refused — never padded, never silently dropped", () => {
    for (const s of ["\\begin{matrix} a && b \\end{matrix}", "\\begin{matrix} a & & b \\end{matrix}", "\\begin{matrix} a \\\\ \\\\ b \\end{matrix}", "\\begin{matrix} a \\\\ \\\\ \\end{matrix}",
      "\\begin{matrix} a & b \\\\ c \\end{matrix}", "\\begin{matrix} a \\\\ c & d \\end{matrix}", "\\begin{matrix}\\end{matrix}", "\\begin{matrix} \\end{matrix}", "\\begin{matrix} \\\\ \\end{matrix}",
      "\\begin{matrix} & a \\end{matrix}", "\\begin{matrix} a & \\end{matrix}", "\\begin{pmatrix} \\\\ a \\end{pmatrix}", "\\begin{matrix} a \\\\[2pt] b \\end{matrix}", "\\begin{matrix} a \\\\ [0,1] \\end{matrix}"])
      refused(s);
  });
  it("cases: 1–2 cells per row, no empty value, no empty condition, no third column; aligned: 1–2 cells, rhs never empty", () => {
    for (const s of ["\\begin{cases} a & b & c \\end{cases}", "\\begin{cases} & x > 0 \\end{cases}", "\\begin{cases} a & \\end{cases}", "\\begin{cases}\\end{cases}", "\\begin{cases} a && b \\end{cases}",
      "\\begin{aligned} a & b & c \\end{aligned}", "\\begin{aligned} a & \\end{aligned}", "\\begin{aligned} & \\end{aligned}", "\\begin{aligned}\\end{aligned}", "\\begin{aligned} a &&= b \\end{aligned}"])
      refused(s);
  });
  it("the escapes around \\\\ keep their meaning: \\\\, is a row break then ',', \\, alone is a space, an odd backslash is refused", () => {
    expect(grid("\\begin{matrix} a \\\\, b \\end{matrix}").rows).toHaveLength(2);
    expect(M.parseMath("a\\,b").ok).toBe(true);
    expect(grid("\\begin{matrix} a \\\\\\ b \\end{matrix}").rows).toHaveLength(2);                // \\\\ then the escaped space \\␠ (both legal)
    refused("\\begin{matrix} a \\\\\\& b \\end{matrix}");                                         // \\\\ then the illegal escape \\&
    refused("\\begin{matrix} a \\end{matrix} \\\\\\");
    expect(grid("\\begin{matrix} a \\\\ \\{b\\} \\end{matrix}").rows).toHaveLength(2);
  });
});

describe("21A-S5 grid bounds are explicit, conservative and enforced before materializing", () => {
  const mat = (r: number, c: number, env = "matrix") => `\\begin{${env}} ` + Array.from({ length: r }, () => Array.from({ length: c }, () => "x").join(" & ")).join(" \\\\ ") + ` \\end{${env}}`;
  it("a grid is ONE node of the 600-node bound (exact boundary: grid + cell row + cell + top row + 596 identifiers = 600) — mutation M28", () => {
    const withIds = (n: number) => "\\begin{matrix} a \\end{matrix}" + " x".repeat(n);
    expect(M.parseMath(withIds(596)).ok).toBe(true);
    refused(withIds(597));
    expect(withIds(597).length).toBeLessThan(M.MATH_LIMITS.chars);                                // refused by the NODE bound, not by length
  });
  it("rows: 12 accepted, 13 refused; cols: 8 accepted, 9 refused; cells: 64 (8×8) accepted, 72 (9×8) refused", () => {
    expect(grid(mat(12, 1)).rows).toHaveLength(12);
    refused(mat(13, 1));
    expect(grid(mat(1, 8)).rows[0]).toHaveLength(8);
    refused(mat(1, 9));
    expect(grid(mat(8, 8)).rows).toHaveLength(8);
    refused(mat(9, 8));
    refused(mat(12, 6));                                                                                             // 72 cells > 64 with rows and cols in bounds
    expect(grid(mat(10, 6)).rows).toHaveLength(10);                                                                  // 60 cells
  });
  it("cases and aligned: up to 12 rows; at most 2 columns", () => {
    for (const env of ["cases", "aligned"]) { expect(grid(mat(12, 2, env)).rows).toHaveLength(12); refused(mat(13, 2, env)); refused(mat(2, 3, env)); }
  });
  it("pathological inputs are refused quickly and never throw: thousands of separators, huge grids, node and char exhaustion", () => {
    const t0 = Date.now();
    for (const s of ["&".repeat(1999), "\\\\".repeat(999), "\\begin{matrix}" + "a&".repeat(600) + "a\\end{matrix}", "\\begin{matrix}" + "a\\\\".repeat(600) + "a\\end{matrix}",
      "\\begin{matrix}" + "\\frac{a}{b}&".repeat(7) + "x\\\\".repeat(1) + "\\end{matrix}".repeat(40), "\\begin{matrix}".repeat(200), "\\end{matrix}".repeat(200),
      mat(8, 8).replace(/x/g, "\\frac{\\frac{a}{b}}{\\frac{c}{d}}"), "x".repeat(2001)]) {
      expect(() => M.parseMath(s)).not.toThrow();
      expect(M.parseMath(s).ok, s.slice(0, 60)).toBe(false);
    }
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("depth: a grid counts toward MATH_LIMITS.depth like any group (one level deeper than a plain atom)", () => {
    const nest = (n: number, inner: string) => "\\sqrt{".repeat(n) + inner + "}".repeat(n);
    let k = 0;
    while (M.parseMath(nest(k + 1, "x")).ok) k++;                                                                    // the deepest plain nesting the bound allows
    expect(k).toBeGreaterThan(5);
    expect(M.parseMath(nest(k - 1, "\\begin{matrix} a \\end{matrix}")).ok).toBe(true);
    expect(M.parseMath(nest(k, "\\begin{matrix} a \\end{matrix}")).ok).toBe(false);
  });
});

describe("21A-S6 calculus, complex, number sets, units, chemistry, electricity, geometry — certified notation", () => {
  const CERTIFIED = [
    "\\frac{dy}{dx}", "\\frac{d^2y}{dx^2}", "\\frac{d^{2}y}{dx^{2}}", "\\frac{\\partial f}{\\partial x}", "\\frac{\\partial^2 f}{\\partial x^2}", "\\frac{\\partial^{2} f}{\\partial x \\partial y}",
    "\\int_{0}^{1} x^{2} \\, dx", "\\int f(x) \\, dx", "\\iint_{D} f(x,y) \\, dA", "\\iiint_{V} \\rho \\, dV", "\\oint_{C} \\vec{F} \\cdot d\\vec{r}", "\\sum_{i=1}^{n} i^{2}", "\\prod_{k=1}^{n} k", "\\lim_{x \\to 0} \\frac{\\sin x}{x}",
    "z = a + bi", "\\overline{z} = a - bi", "\\Re(z) = a", "\\Im(z) = b", "\\arg(z) = \\theta", "|z| = \\sqrt{a^2 + b^2}", "z \\in \\mathbb{C}", "x \\in \\mathbb{R}", "n \\in \\mathbb{N}", "k \\in \\mathbb{Z}", "q \\in \\mathbb{Q}",
    "6.02 \\times 10^{23}", "9.8 \\, \\mathrm{m}\\,\\mathrm{s}^{-2}", "220 \\, \\mathrm{V}", "2.5 \\, \\mathrm{A}", "50 \\, \\mathrm{Hz}", "10 \\, \\mathrm{k}\\Omega", "4.7 \\, \\mu\\mathrm{F}", "3 \\times 10^{8} \\, \\mathrm{m/s}",
    "\\mathrm{H}_2\\mathrm{O}", "\\mathrm{CO}_2", "\\mathrm{SO}_4^{2-}", "2\\mathrm{H}_2 + \\mathrm{O}_2 \\rightarrow 2\\mathrm{H}_2\\mathrm{O}", "\\mathrm{N}_2 + 3\\mathrm{H}_2 \\rightleftharpoons 2\\mathrm{NH}_3", "\\mathrm{Na}^{+} + \\mathrm{Cl}^{-}",
    "\\mathrm{CaCO}_3 \\rightarrow \\mathrm{CaO} + \\mathrm{CO}_2 \\uparrow",
    "V = IR", "P = VI", "R = \\frac{V}{I}", "X_C = \\frac{1}{2\\pi f C}", "X_L = 2\\pi f L", "Z = R + jX", "Q = CV", "I = \\frac{V}{R} = \\frac{12 \\, \\mathrm{V}}{4 \\, \\Omega}",
    "\\vec{F} = m\\vec{a}", "\\angle ABC = 90^{\\circ}", "AB \\perp CD", "AB \\parallel CD", "\\triangle ABC", "\\hbar \\omega", "\\ddot{x} = -\\omega^2 x", "\\sinh x", "\\arctan\\left( \\frac{y}{x} \\right)"
  ];
  it("every certified scientific expression parses", () => { for (const s of CERTIFIED) ok(s); });
  it("number sets: \\mathbb accepts ONLY N, Z, Q, R, C (braced or single letter) — no generic styling engine", () => {
    for (const [s, v] of [["\\mathbb{R}", "ℝ"], ["\\mathbb{C}", "ℂ"], ["\\mathbb{N}", "ℕ"], ["\\mathbb{Z}", "ℤ"], ["\\mathbb{Q}", "ℚ"], ["\\mathbb R", "ℝ"]] as const) expect(find(ok(s), "id")[0].v, s).toBe(v);
    for (const s of ["\\mathbb{X}", "\\mathbb{RR}", "\\mathbb{}", "\\mathbb", "\\mathbb{r}", "\\mathbb{\\alpha}", "\\mathbb{1}", "\\mathbb{R", "\\mathbb{__proto__}", "\\mathbb{ R }x"]) refused(s);
  });
  it("new symbols map to fixed code-owned values; \\iint / \\iiint are large operators", () => {
    const v = (s: string) => JSON.stringify(ok(s));
    expect(v("\\iint")).toContain('"v":"∬","large":true');
    expect(v("\\iiint")).toContain('"v":"∭","large":true');
    expect(v("\\Re")).toContain('"v":"ℜ"');
    expect(v("\\Im")).toContain('"v":"ℑ"');
    expect(v("\\arg")).toContain('"v":"arg","fn":true');
    expect(v("\\rightleftharpoons")).toContain('"v":"⇌"');
    expect(v("\\ddot{x}")).toContain('"k":"accent"');
  });
});

describe("21A-S7 the parser never throws and refuses deterministically", () => {
  it("random garbage over the v2 alphabet never throws", () => {
    const alphabet = ["\\begin{", "\\end{", "matrix", "cases", "aligned", "}", "{", "&", "\\\\", "\\", "a", "1", "^", "_", "\\frac", "\\left(", "\\right)", "\\text{", "[", "]", " ", "\n", "\r", "\\mathbb{", "R", "__proto__"];
    let seed = 7;
    const r = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let i = 0; i < 4000; i++) {
      let s = "";
      for (let j = 0; j < 1 + Math.floor(r() * 30); j++) s += alphabet[Math.floor(r() * alphabet.length)];
      const a = M.parseMath(s), b = M.parseMath(s);
      expect(a).toEqual(b);
    }
  });
  it("non-string input and whitespace-only input are refused, never thrown", () => {
    for (const s of [undefined, null, 1, {}, [], "", "   ", "\n\r\t"]) expect(M.parseMath(s as unknown).ok).toBe(false);
  });
});
