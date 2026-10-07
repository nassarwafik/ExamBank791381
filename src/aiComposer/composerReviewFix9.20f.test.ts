import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 9 (fresh re-review of 0f8911f: 0 BLOCKER, 2 MAJOR, 1 MINOR, 3 NOTE — regressions of RF8's removals). Fail-first
// on 0f8911f.
//   MAJOR-1 a guard's touching zero exactly halfway between two samples (log|2x − 1| on [−8, 8]) was never refined, and a steep zero of
//           √(10|x − a|) stayed above the absolute threshold: incomplete keys accepted, correct keys refused;
//   MAJOR-2 a denominator's zero at the edge of its own domain (√(x + 2) at −2) was not a guard zero: the open edge was accepted as a root,
//           and a one-sided pole beyond the window (1/√(7 − x)) went unseen;
//   MINOR-1 a guard zero beyond the window where f is not even defined (√x/(x² − 4) at −2 on [0, 5]) refused correct keys.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };
const incomplete = (src: string, tasks: string[], over: Record<string, unknown>) => { const c = codes(buildSimFromSpec(fn(src, tasks, over))); expect(c.length > 0 && c.every(k => k === "AI_FUNCTION_KEY_INCOMPLETE") ? "incomplete" : JSON.stringify(c), src).toBe("incomplete"); };

describe("20F-RF9 MAJOR-1 a guard's touching zero is found wherever it falls between samples", () => {
  it("a zero exactly halfway between two samples", () => {
    const t = ["domainExclusions", "verticalAsymptotes"], w = { xMin: -8, xMax: 8 };
    incomplete("log(abs(2*x-1))+1/x", t, { ...w, domainExclusions: [0], verticalAsymptotes: [0] });
    accepted("log(abs(2*x-1))+1/x", t, { ...w, domainExclusions: [0, 0.5], verticalAsymptotes: [0, 0.5] });
    incomplete("1/(2*x-1)^2+1/x", ["verticalAsymptotes"], { ...w, verticalAsymptotes: [0] });
    incomplete("log(abs(x-1))+1/x", ["domainExclusions"], { xMin: -16, xMax: 16, domainExclusions: [0] });
  });
  it("a steep zero with a large coefficient", () => {
    incomplete("1/sqrt(abs(10*x-7))+1/x", ["domainExclusions"], { xMin: -10, xMax: 10, domainExclusions: [0] });
    accepted("1/sqrt(abs(10*x-7))+1/x", ["domainExclusions"], { xMin: -10, xMax: 10, domainExclusions: [0, 0.7] });
  });
});

describe("20F-RF9 MAJOR-2 a denominator's zero at the edge of its own domain is a guard zero", () => {
  it("the open edge of (x² − 4)/√(x + 2) is not a root", () => {
    expect(buildSimFromSpec(fn("(x^2-4)/sqrt(x+2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [-2, 2] })).ok).toBe(false);
    accepted("(x^2-4)/sqrt(x+2)", ["xIntercepts"], { xMin: -3, xMax: 3, xIntercepts: [2] });
  });
  it("a one-sided pole beyond the window refuses a vertical-asymptote key", () => {
    expect(codes(buildSimFromSpec(fn("1/sqrt(7-x)+1/x", ["verticalAsymptotes"], { verticalAsymptotes: [0] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF9 MINOR-1 a guard zero beyond the window counts only where f is defined beside it", () => {
  it("√x/(x² − 4) and log x/(x² − 1) on windows starting at the domain edge keep their correct keys", () => {
    accepted("sqrt(x)/(x^2-4)", ["domainExclusions", "verticalAsymptotes"], { xMin: 0, xMax: 5, domainExclusions: [2], verticalAsymptotes: [2] });
    accepted("log(x)/(x^2-1)", ["domainExclusions"], { xMin: 0, xMax: 5, domainExclusions: [1] });
  });
});
