import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 10 (fresh re-review of 15eaedc: 0 BLOCKER, 1 MAJOR, 2 MINOR, 3 NOTE). Fail-first on 15eaedc.
//   MAJOR-1 a steep touching root of f itself (x·√|x − 1.3| at 1.3) was judged by an absolute level: missed inside the window (RF8
//           removed the snapping that used to hit it) and beyond it (x·√|x − 7| on [−5, 5]);
//   MINOR-1 a guard zero of a small fractional power (|3x − 1|^0.25) escaped the RF9 ratio rules;
//   MINOR-2 a monotonic stretch beyond a window edge that is a pole (1/(x² − 4) on [−2, 2]) was never required.
// One rule now decides every "does it vanish here" question: |g| falls like a power of the distance as x closes in on the point.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const iv = (kind: "increasing" | "decreasing", from: string, to: string) => ({ kind, from, to });
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);

describe("20F-RF10 MAJOR-1 a steep touching root of f is a root", () => {
  it("inside the window", () => {
    refused("x*sqrt(abs(x-1.3))", ["xIntercepts"], { xIntercepts: [0] });
    accepted("x*sqrt(abs(x-1.3))", ["xIntercepts"], { xIntercepts: [0, 1.3] });
    refused("(x-3)*sqrt(abs(x+1.7))", ["xIntercepts"], { xMin: -4, xMax: 4, xIntercepts: [3] });
    accepted("(x-3)*sqrt(abs(x+1.7))", ["xIntercepts"], { xMin: -4, xMax: 4, xIntercepts: [-1.7, 3] });
  });
  it("beyond the window", () => {
    expect(codes(buildSimFromSpec(fn("x*sqrt(abs(x-7))", ["xIntercepts"], { xIntercepts: [0] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF10 MINOR-1 a guard zero of a small fractional power is found", () => {
  it("|3x − 1|^0.25 in a denominator, and (x² − 2)^0.25 as an open edge", () => {
    const t = ["domainExclusions", "verticalAsymptotes"];
    refused("1/abs(3*x-1)^0.25+1/x", t, { domainExclusions: [0], verticalAsymptotes: [0] });
    refused("1/abs(7*x-3)^(1/3)+1/x", ["domainExclusions"], { xMin: -10, xMax: 10, domainExclusions: [0] });
    refused("(x-3)*(x^2-2)/(x^2-2)^0.25", ["xIntercepts"], { xIntercepts: [-1.41421, 1.41421, 3] });
  });
});

describe("20F-RF10 MINOR-2 a monotonic stretch beyond a window edge is required too", () => {
  it("1/(x² − 4) on [−2, 2] needs its four intervals", () => {
    refused("1/(x^2-4)", ["monotonicIntervals"], { xMin: -2, xMax: 2, intervals: [iv("increasing", "-2", "0"), iv("decreasing", "0", "2")] });
    accepted("1/(x^2-4)", ["monotonicIntervals"], { xMin: -2, xMax: 2, intervals: [iv("increasing", "-inf", "-2"), iv("increasing", "-2", "0"), iv("decreasing", "0", "2"), iv("decreasing", "2", "+inf")] });
    refused("1/(x-5)^2", ["monotonicIntervals"], { intervals: [iv("increasing", "-inf", "5")] });
  });
});

describe("20F-RF10 the vanishing rule needs a STEADY power", () => {
  it("an offset cusp (|x − 0.3| + 10⁻⁷) falls fast and then stops: not a zero, so not an exclusion", () => {
    accepted("1/(abs(x-0.3)+0.0000001)+1/(x-3)", ["domainExclusions"], { domainExclusions: [3] });
  });
});
