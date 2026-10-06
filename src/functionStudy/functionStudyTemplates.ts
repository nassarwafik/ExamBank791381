// Phase 20A.2 — functionStudy2d@1 authoring presets (fresh copies on every call). The certification function
//   f(x) = (2x − 4) / ((x − 1)(x + 2))
// analysed by hand (never by the implementation): domain ℝ \ {−2, 1}; x-intercept (2, 0); y-intercept (0, 2); vertical asymptotes x = −2
// and x = 1; horizontal asymptote y = 0; f′(x) = −2x(x − 4) / ((x − 1)²(x + 2)²) ⇒ local minimum (0, 2) and local maximum (4, 2/9);
// decreasing on (−∞, −2), (−2, 0) and (4, +∞), increasing on (0, 1) and (1, 4). The checks hold the PRIVATE expected answers,
// tolerances and weights (total 13) and never reach a student.
import type { FunctionStudyConfigV1 } from "../functionStudyModel";

export const RATIONAL_CERTIFICATION_SOURCE = "(2*x-4)/((x-1)*(x+2))";
export const rationalCertificationConfig = (): FunctionStudyConfigV1 => ({
  v: 1,
  expression: { language: 2, variable: "x", source: RATIONAL_CERTIFICATION_SOURCE },
  window: { xMin: -6, xMax: 8, yMin: -6, yMax: 6, sampleCount: 701 },
  tasks: { domainExclusions: true, xIntercepts: true, yIntercept: true, verticalAsymptotes: true, horizontalAsymptotes: true, extrema: true, monotonicIntervals: true }
});
export const rationalCertificationChecks = (): Record<string, unknown>[] => [
  { id: "domain", label: "استثناءات المجال", weight: 2, kind: "domain.exclusions", expected: [-2, 1], tolerance: 0.01 },
  { id: "x-intercepts", label: "المقاطع السينية", weight: 1, kind: "intercepts.x", expected: [{ x: 2, y: 0 }], tolerance: 0.01 },
  { id: "y-intercept", label: "المقطع الصادي", weight: 1, kind: "intercept.y", expected: 2, tolerance: 0.01 },
  { id: "vertical-asymptotes", label: "خطوط التقارب الرأسية", weight: 2, kind: "asymptotes.vertical", expected: [-2, 1], tolerance: 0.01 },
  { id: "horizontal-asymptotes", label: "خطوط التقارب الأفقية", weight: 1, kind: "asymptotes.horizontal", expected: [0], tolerance: 0.01 },
  { id: "extrema", label: "القيم القصوى المحلية", weight: 3, kind: "extrema.points", expected: [{ kind: "min", x: 0, y: 2 }, { kind: "max", x: 4, y: 0.2222222222222222 }], tolerance: 0.01 },
  { id: "monotonic", label: "فترات التزايد والتناقص", weight: 3, kind: "monotonic.intervals", tolerance: 0.01, expected: [
    { kind: "decreasing", from: "-inf", to: -2 }, { kind: "decreasing", from: -2, to: 0 }, { kind: "increasing", from: 0, to: 1 }, { kind: "increasing", from: 1, to: 4 }, { kind: "decreasing", from: 4, to: "+inf" }
  ] }
];
