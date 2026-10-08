// Phase 21A — the Scientific Math v2 FEATURE CATALOG: one code-owned table of what the safe math language can express, each feature
// with a representative example that the parser (richMath.ts) accepts — proven by test, so nothing is advertised without proof. It is a
// separate module from the parser so the parser chunk (shipped with every student exam page) stays lean: only the lazy authoring editor
// (snippet palette) and the AI Composer catalog (prompt contract) import it. Pure, server-safe (reached by the shared finalization build).

export type MathFeatureGroup = "basic" | "calculus" | "linearAlgebra" | "complex" | "science" | "geometry";
export type MathFeature = { readonly id: string; readonly group: MathFeatureGroup; readonly example: string };

export const MATH_FEATURES: readonly MathFeature[] = Object.freeze([
  { id: "fractions", group: "basic", example: "\\frac{a}{b}" },
  { id: "roots", group: "basic", example: "\\sqrt[3]{x}" },
  { id: "scripts", group: "basic", example: "x_{1}^{2}" },
  { id: "greek", group: "basic", example: "\\alpha + \\beta = \\gamma" },
  { id: "relations", group: "basic", example: "a \\le b \\ne c" },
  { id: "text", group: "basic", example: "\\text{السرعة} = \\frac{d}{t}" },
  { id: "fences", group: "basic", example: "\\left( a + b \\right)^{2}" },
  { id: "derivatives", group: "calculus", example: "\\frac{dy}{dx}" },
  { id: "secondDerivatives", group: "calculus", example: "\\frac{d^{2}y}{dx^{2}}" },
  { id: "partialDerivatives", group: "calculus", example: "\\frac{\\partial f}{\\partial x}" },
  { id: "integrals", group: "calculus", example: "\\int_{0}^{1} x^{2} \\, dx" },
  { id: "multipleIntegrals", group: "calculus", example: "\\iint_{D} f(x,y) \\, dA" },
  { id: "largeOperators", group: "calculus", example: "\\sum_{i=1}^{n} i^{2}" },
  { id: "limits", group: "calculus", example: "\\lim_{x \\to 0} \\frac{\\sin x}{x}" },
  { id: "matrices", group: "linearAlgebra", example: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
  { id: "determinants", group: "linearAlgebra", example: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc" },
  { id: "cases", group: "linearAlgebra", example: "f(x) = \\begin{cases} x^{2} & x \\ge 0 \\\\ -x & x < 0 \\end{cases}" },
  { id: "aligned", group: "linearAlgebra", example: "\\begin{aligned} V &= IR \\\\ P &= VI \\end{aligned}" },
  { id: "complex", group: "complex", example: "z = a + bi, \\quad \\overline{z} = a - bi" },
  { id: "complexParts", group: "complex", example: "\\Re(z) = a, \\quad \\Im(z) = b, \\quad \\arg(z) = \\theta" },
  { id: "numberSets", group: "complex", example: "x \\in \\mathbb{R}, \\quad z \\in \\mathbb{C}" },
  { id: "scientificNotation", group: "science", example: "6.02 \\times 10^{23}" },
  { id: "units", group: "science", example: "9.8 \\, \\mathrm{m}\\,\\mathrm{s}^{-2}" },
  { id: "chemistry", group: "science", example: "\\mathrm{SO}_4^{2-}" },
  { id: "chemicalEquations", group: "science", example: "2\\mathrm{H}_2 + \\mathrm{O}_2 \\rightarrow 2\\mathrm{H}_2\\mathrm{O}" },
  { id: "equilibrium", group: "science", example: "\\mathrm{N}_2 + 3\\mathrm{H}_2 \\rightleftharpoons 2\\mathrm{NH}_3" },
  { id: "electricity", group: "science", example: "X_C = \\frac{1}{2\\pi f C}" },
  { id: "vectors", group: "geometry", example: "\\vec{F} = m\\vec{a}" },
  { id: "geometry", group: "geometry", example: "\\angle ABC = 90^{\\circ}, \\quad AB \\perp CD" }
].map(f => Object.freeze(f as MathFeature)));
