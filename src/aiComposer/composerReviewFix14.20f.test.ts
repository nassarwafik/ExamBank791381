import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 14 (fresh re-review of 91051fb: 0 BLOCKER, 0 MAJOR, 1 MINOR, 3 NOTE). Fail-first on 91051fb.
//   MINOR-1 a domain edge where f tends to a NON-ZERO value, between EDGE_TOL and 10⁻³ past a window edge (√(x + √2) + 1 on
//           [−1.414, 4]), was neither a recorded stretch end nor a refusal: the WRONG monotonic key that ignores the edge
//           (inc(−∞, +∞)) was accepted whenever its midpoint sample fell inside the domain, while the correct key was refused.
//           The scan beyond the window now refuses a monotonic key there ("widen the window"), as it already did from 10⁻³ outward.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };
const only = (src: string, tasks: string[], over: Record<string, unknown>, code: string) => expect(codes(buildSimFromSpec(fn(src, tasks, over))), src + " " + JSON.stringify(over)).toEqual([code]);
const inc = (from: string, to: string) => ({ kind: "increasing", from, to }), dec = (from: string, to: string) => ({ kind: "decreasing", from, to });
const mono = ["monotonicIntervals"];

describe("20F-RF14 MINOR-1 a domain edge just past the window (f → a non-zero value) refuses a monotonic key: widen the window", () => {
  it("the wrong key that ignores the edge is refused (left edge)", () => {
    only("sqrt(x+1.41421356237309)+1", mono, { xMin: -1.414, xMax: 4, intervals: [inc("-inf", "+inf")] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
    only("sqrt(x+3)+2", mono, { xMin: -2.99995, xMax: 4, intervals: [inc("-inf", "+inf")] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
    only("sqrt(x+3)+2", mono, { xMin: -2.9991, xMax: 4, intervals: [inc("-inf", "+inf")] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("the right edge too: √(3 − x) + 2 on [−4, 2.9998]", () => {
    only("sqrt(3-x)+2", mono, { xMin: -4, xMax: 2.9998, intervals: [dec("-inf", "+inf")] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("the key that ends at the edge gets the same answer — the window must contain the edge", () => {
    only("sqrt(x+3)+2", mono, { xMin: -2.99995, xMax: 4, intervals: [inc("-3", "+inf")] }, "AI_FUNCTION_WINDOW_TOO_NARROW");
  });
  it("pins: within EDGE_TOL the edge is the window's own (correct key accepted, wrong key refused); a window that contains the edge is unchanged", () => {
    accepted("sqrt(x+3)+2", mono, { xMin: -2.99998, xMax: 4, intervals: [inc("-3", "+inf")] });
    expect(buildSimFromSpec(fn("sqrt(x+3)+2", mono, { xMin: -2.99998, xMax: 4, intervals: [inc("-inf", "+inf")] })).ok).toBe(false);
    accepted("sqrt(x+3)+2", mono, { xMin: -3, xMax: 4, intervals: [inc("-3", "+inf")] });
    accepted("sqrt(x+1.41421356237309)+1", mono, { xMin: -1.4142135, xMax: 4, intervals: [inc("-1.4142", "+inf")] });
  });
  it("pins: other tasks are not refused for that edge (an exclusion key, a roots key)", () => {
    accepted("(sqrt(x+3)+2)*(x-1)", ["xIntercepts"], { xMin: -2.9991, xMax: 4, yMin: -30, yMax: 30, xIntercepts: [1] });
    accepted("(sqrt(x+3)+2)*(x-1)/(x-1)", ["domainExclusions"], { xMin: -2.9991, xMax: 4, domainExclusions: [1] });
  });
});
