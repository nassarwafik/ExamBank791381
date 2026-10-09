// Phase 21A.2 — SHARED function-graph fixtures: the unit suites, the acceptance exam builder (scripts/function-graphs-21a2-exam.mjs) and
// the certification use the SAME graphs. Each call returns a fresh object. Teacher-authored values only: every point said to lie on a
// curve does (exact values, π written with full double precision), every authored slope / derivative is the true one.
import type { FunctionGraphSpecV1 } from "../functionGraphSpec";

const PI = Math.PI;

/** A — f(x) = x² − 4x + 3: roots 1 and 3, vertex (2, −1), y-intercept 3. Neutral point labels (a label must never give the answer away). */
export const quadraticGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-quad", title: "منحنى الدالة التربيعية", description: "منحنى الدالة f(x) = x² − 4x + 3 على الفترة من −2 إلى 6، وعليه أربع نقاط مسمّاة A و B و C و D.",
  viewport: { xMin: -2, xMax: 6, yMin: -3, yMax: 8 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "f", kind: "explicit", label: "f(x) = x^2 - 4x + 3", expression: "x^2 - 4*x + 3" }],
  points: [
    { id: "p1", x: 1, y: 0, label: "A", role: "root", on: ["f"] },
    { id: "p2", x: 3, y: 0, label: "B", role: "root", on: ["f"] },
    { id: "p3", x: 2, y: -1, label: "C", role: "minimum", on: ["f"] },
    { id: "p4", x: 0, y: 3, label: "D", role: "yIntercept", on: ["f"] }
  ]
});

/** B — g(x) = 1/(x − 2): vertical asymptote x = 2, horizontal asymptote y = 0, and a reference line y = 2 (a distractor). */
export const rationalGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-rat", title: "الدالة الكسرية", description: "منحنى الدالة g(x) = 1/(x − 2) مع ثلاثة خطوط مسمّاة L1 و L2 و L3.",
  viewport: { xMin: -4, xMax: 8, yMin: -6, yMax: 6 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "g", kind: "explicit", label: "g(x) = 1/(x - 2)", expression: "1/(x - 2)" }],
  lines: [
    { id: "l1", orientation: "vertical", value: 2, label: "L1", role: "asymptote", style: { line: "dashed" } },
    { id: "l2", orientation: "horizontal", value: 0, label: "L2", role: "asymptote", style: { line: "dashed" } },
    { id: "l3", orientation: "horizontal", value: 2, label: "L3", role: "reference", style: { line: "dotted" } }
  ]
});

/** C — sin(x) on [−2π, 2π] with π ticks: maximum (π/2, 1), minimum (−π/2, −1), roots 0 and π. */
export const sineGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-sin", title: "منحنى الجيب", description: "منحنى الدالة y = sin(x) على الفترة من −2π إلى 2π، وعليه أربع نقاط مسمّاة P و Q و R و S.",
  viewport: { xMin: -2 * PI, xMax: 2 * PI, yMin: -1.5, yMax: 1.5 },
  axes: { x: { label: "x", grid: true, step: PI / 2, ticks: "pi" }, y: { label: "y", grid: true, step: 0.5 } },
  curves: [{ id: "s", kind: "explicit", label: "y = sin(x)", expression: "sin(x)" }],
  points: [
    { id: "q1", x: PI / 2, y: 1, label: "P", role: "maximum", on: ["s"] },
    { id: "q2", x: -PI / 2, y: -1, label: "Q", role: "minimum", on: ["s"] },
    { id: "q3", x: 0, y: 0, label: "R", role: "root", on: ["s"] },
    { id: "q4", x: PI, y: 0, label: "S", role: "root", on: ["s"] }
  ]
});

/** D — a piecewise function: x + 2 (x < 0), x² (0 ≤ x ≤ 2), 6 − x (x > 2). A jump at 0 (open (0, 2), filled (0, 0)); continuous at 2. */
export const piecewiseGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-piece", title: "دالة متعددة القواعد", description: "منحنى دالة معرّفة بثلاث قواعد على الفترات x < 0 و 0 ≤ x ≤ 2 و x > 2، مع النقاط المسمّاة M و N و K.",
  viewport: { xMin: -4, xMax: 6, yMin: -2, yMax: 6 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "h", kind: "piecewise", label: "h(x)", pieces: [
    { expression: "x + 2", domain: { max: 0, maxClosed: false } },
    { expression: "x^2", domain: { min: 0, max: 2 } },
    { expression: "6 - x", domain: { min: 2, minClosed: false } }
  ] }],
  points: [
    { id: "m1", x: 0, y: 2, label: "M", role: "hole", on: ["h"], open: true },
    { id: "m2", x: 0, y: 0, label: "N", role: "endpoint", on: ["h"] },
    { id: "m3", x: 2, y: 4, label: "K", role: "point", on: ["h"] }
  ]
});

/** E — two functions: f(x) = x² − 1 and g(x) = x + 1 meet at (−1, 0) and (2, 3); (1, 0) is a root of f only (a distractor). */
export const intersectionGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-meet", title: "تقاطع منحنيين", description: "منحنيا الدالتين f(x) = x² − 1 و g(x) = x + 1 مع ثلاث نقاط مسمّاة E1 و E2 و E3.",
  viewport: { xMin: -4, xMax: 4, yMin: -2, yMax: 8 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [
    { id: "c1", kind: "explicit", label: "المنحنى 1", expression: "x^2 - 1" },
    { id: "c2", kind: "explicit", label: "المنحنى 2", expression: "x + 1", style: { line: "dashed" } }
  ],
  points: [
    { id: "e1", x: -1, y: 0, label: "E1", role: "intersection", on: ["c1", "c2"] },
    { id: "e2", x: 2, y: 3, label: "E2", role: "intersection", on: ["c1", "c2"] },
    { id: "e3", x: 1, y: 0, label: "E3", role: "root", on: ["c1"] }
  ]
});

/** F — f(x) = x² with its AUTHORED derivative f'(x) = 2x, the tangent at x = 1 (slope 2) and the normal there. */
export const tangentGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-tan", title: "المماس والمشتقة", description: "منحنى f(x) = x² ومنحنى مشتقتها، ومستقيمان مسمّيان T1 و T2 يمرّان بالنقطة (1, 1).",
  viewport: { xMin: -3, xMax: 3, yMin: -3, yMax: 6 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [
    { id: "fx", kind: "explicit", label: "المنحنى أ", expression: "x^2" },
    { id: "dfx", kind: "explicit", label: "المنحنى ب", expression: "2*x", derivativeOf: "fx", style: { line: "dashed" } }
  ],
  points: [{ id: "t0", x: 1, y: 1, label: "T", role: "tangency", on: ["fx"] }],
  tangents: [
    { id: "t1", curve: "fx", x: 1, kind: "tangent", slope: 2, label: "T1" },
    { id: "t2", curve: "fx", x: 1, kind: "normal", label: "T2" }
  ]
});

/** G — the area under f(x) = x² on [0, 2] (= 8/3) and on [2, 3] (= 19/3), with the integration interval [0, 2] marked on the x-axis. */
export const areaGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-area", title: "المساحة تحت المنحنى", description: "منحنى f(x) = x² مع منطقتين مظللتين R1 و R2 بين المنحنى ومحور x، والفترة [0, 2] على محور x.",
  viewport: { xMin: -1, xMax: 4, yMin: -1, yMax: 10 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "a", kind: "explicit", label: "f(x) = x^2", expression: "x^2" }],
  regions: [{ id: "r1", curve: "a", from: 0, to: 2, label: "R1" }, { id: "r2", curve: "a", from: 2, to: 3, label: "R2" }],
  intervals: [{ id: "i1", from: 0, to: 2, fromClosed: true, toClosed: true, label: "[0, 2]" }]
});

/** H — Arabic UI text around LTR mathematics: Arabic title / description / labels; the expression stays LTR source. */
export const arabicGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-ar", title: "الدالة الخطية ك(س)", description: "الدالة f(x) = 2x + 1 مرسومة بخط متصل، وعليها نقطتان: نقطة أ عند (0, 1) ونقطة ب عند (1, 3).",
  viewport: { xMin: -3, xMax: 3, yMin: -4, yMax: 6 },
  axes: { x: { label: "س", grid: true }, y: { label: "ص", grid: true } },
  curves: [{ id: "k", kind: "explicit", label: "الدالة f(x) = 2x + 1", expression: "2*x + 1" }],
  points: [
    { id: "n1", x: 0, y: 1, label: "نقطة أ", role: "yIntercept", on: ["k"] },
    { id: "n2", x: 1, y: 3, label: "نقطة ب", on: ["k"] }
  ]
});

/** I — a cubic with three roots (−2, 1, 3) and its y-intercept, plus a circle (parametric) for the composite context. */
export const cubicGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-cubic", title: "دالة من الدرجة الثالثة", description: "منحنى الدالة c(x) = (x + 2)(x − 1)(x − 3)/4 وعليه أربع نقاط مسمّاة U1 و U2 و U3 و U4.",
  viewport: { xMin: -4, xMax: 5, yMin: -5, yMax: 5 },
  axes: { x: { label: "x", grid: true }, y: { label: "y", grid: true } },
  curves: [{ id: "cu", kind: "explicit", label: "c(x)", expression: "(x + 2)*(x - 1)*(x - 3)/4" }],
  points: [
    { id: "u1", x: -2, y: 0, label: "U1", role: "root", on: ["cu"] },
    { id: "u2", x: 1, y: 0, label: "U2", role: "root", on: ["cu"] },
    { id: "u3", x: 3, y: 0, label: "U3", role: "root", on: ["cu"] },
    { id: "u4", x: 0, y: 1.5, label: "U4", role: "yIntercept", on: ["cu"] }
  ]
});

/** A parametric circle of radius 2 (x = 2cos t, y = 2sin t) with a point on it and a parameterized line y = a·x. */
export const circleGraph = (): FunctionGraphSpecV1 => ({
  version: 1, id: "g-circle", title: "دائرة ومستقيم", description: "الدائرة x = 2cos(t), y = 2sin(t) والمستقيم y = a·x حيث a = 1.",
  viewport: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
  parameters: [{ id: "a", value: 1 }],
  curves: [
    { id: "circ", kind: "parametric", label: "الدائرة", x: "2*cos(t)", y: "2*sin(t)", t: { min: 0, max: 2 * PI } },
    { id: "ln1", kind: "explicit", label: "المستقيم", expression: "a*x" }
  ],
  points: [{ id: "w1", x: Math.SQRT2, y: Math.SQRT2, label: "W", role: "intersection", on: ["circ", "ln1"] }]
});

export const ALL_GRAPHS = { quadraticGraph, rationalGraph, sineGraph, piecewiseGraph, intersectionGraph, tangentGraph, areaGraph, arabicGraph, cubicGraph, circleGraph };
