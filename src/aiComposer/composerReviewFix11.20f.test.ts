import { describe, it, expect } from "vitest";
import { buildSimFromSpec } from "./composerSim";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 11 (fresh re-review of 20966d8: 0 BLOCKER, 1 MAJOR, 2 MINOR, 3 NOTE). Fail-first on 20966d8.
//   MAJOR-1 an extremum exactly on the window's edge (x⁴ − 2x² on [−1, 1]) was never required: the scan skipped the first and last
//           sample, and the scan beyond the window does not compare the slope inside with the slope beyond;
//   MINOR-1 RF10's vanishing rule took a floored fractional cusp (|x − 1.3|^0.25 + 0.001) for a root;
//   MINOR-2 a steep root within ≈ 2 % of another root (x − 8.89)·√|x − 8.74| bent the 10⁻² sample and was missed;
//   NOTE-1  the exponent floor (0.05) was not pinned, and a root of |x − a|^0.04 was never a root;
//   NOTE-2  touching features in the last grid cell or just beyond the edge were missed.
// Found while fixing them (fail-first on 20966d8 too): features in the first cells past the edge (before the scan beyond the window
// starts, 10⁻³ out), a root of an even smaller power where f is exactly 0, and a steep root whose dip falls between two samples of a
// wide window — found at the expression's cusps (zeros of a power's base or a square root's argument). The last block holds the tests
// the RF11 mutation campaign asked for (survivors): each fails on 20966d8 as well.
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const fn = (source: string, tasks: string[], over: Record<string, unknown> = {}) => F.funcSim({ source, xMin: -5, xMax: 5, yMin: -10, yMax: 10, tasks, domainExclusions: [], xIntercepts: [], yIntercept: null, verticalAsymptotes: [], horizontalAsymptotes: [], extrema: [], intervals: [], ...over });
const accepted = (src: string, tasks: string[], over: Record<string, unknown>) => { const r = buildSimFromSpec(fn(src, tasks, over)); expect(r.ok ? "ok" : JSON.stringify(r.issues), src + " " + JSON.stringify(over)).toBe("ok"); };
const refused = (src: string, tasks: string[], over: Record<string, unknown>) => expect(buildSimFromSpec(fn(src, tasks, over)).ok, src + " " + JSON.stringify(over)).toBe(false);
const mn = (x: number, y: number) => ({ kind: "min", x, y }), mx = (x: number, y: number) => ({ kind: "max", x, y });

describe("20F-RF11 MAJOR-1 an extremum on the window's edge is a feature like any other", () => {
  it("is required when it sits on the edge", () => {
    refused("x^4-2*x^2", ["extrema"], { xMin: -1, xMax: 1, extrema: [mx(0, 0)] });
    accepted("x^4-2*x^2", ["extrema"], { xMin: -1, xMax: 1, extrema: [mn(-1, -1), mx(0, 0), mn(1, -1)] });
    refused("x^3-3*x", ["extrema"], { xMin: -1, xMax: 3, extrema: [mn(1, -2)] });
    accepted("x^3-3*x", ["extrema"], { xMin: -1, xMax: 3, extrema: [mx(-1, 2), mn(1, -2)] });
  });
  it("refuses the key (widen the window) when it sits just beyond the edge", () => {
    expect(codes(buildSimFromSpec(fn("x^3-3*x", ["extrema"], { xMin: -0.9995, xMax: 3, extrema: [mn(1, -2)] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF11 MINOR-1 / NOTE-1 the vanishing rule follows the power down to 10⁻¹²", () => {
  it("a floored cusp is not a root", () => {
    refused("(x+2)*(abs(x-1.3)^(0.25)+0.001)", ["xIntercepts"], { xIntercepts: [-2, 1.3] });
    accepted("(x+2)*(abs(x-1.3)^(0.25)+0.001)", ["xIntercepts"], { xIntercepts: [-2] });
  });
  it("a root of a very small power is a root", () => {
    refused("(x+2)*abs(x-1.3)^(0.04)", ["xIntercepts"], { xIntercepts: [-2] });
    refused("(x+2)*abs(x-1.3333333333333333)^(0.04)", ["xIntercepts"], { xIntercepts: [-2] });
  });
});

describe("20F-RF11 MINOR-2 a steep root next to another root is found", () => {
  it("(x − 8.89)·√|x − 8.74| on [−10, 10]", () => {
    refused("(x-8.89)*sqrt(abs(x-8.74))", ["xIntercepts"], { xMin: -10, xMax: 10, yMin: -50, yMax: 50, xIntercepts: [8.89] });
    accepted("(x-8.89)*sqrt(abs(x-8.74))", ["xIntercepts"], { xMin: -10, xMax: 10, yMin: -50, yMax: 50, xIntercepts: [8.74, 8.89] });
  });
});

describe("20F-RF11 NOTE-2 touching features in the last grid cell or just beyond the edge", () => {
  it("a touching root and a double pole between the last sample and the edge, or just past it", () => {
    refused("(x+1)*(x-4.998)^2", ["xIntercepts"], { xIntercepts: [-1] });
    accepted("(x+1)*(x-4.998)^2", ["xIntercepts"], { xIntercepts: [-1, 4.998] });
    refused("1/(x-4.998)^2+1/(x+1)", ["verticalAsymptotes"], { verticalAsymptotes: [-1] });
    refused("1/(x-5.0005)^2+1/(x+1)", ["verticalAsymptotes"], { verticalAsymptotes: [-1] });
    // the same touching root written as a product: no power, so no cusp — only the edge cells see it
    refused("(x+1)*(x-4.998)*(x-4.998)", ["xIntercepts"], { xIntercepts: [-1] });
    accepted("(x+1)*(x-4.998)*(x-4.998)", ["xIntercepts"], { xIntercepts: [-1, 4.998] });
  });
});

describe("20F-RF11 the edge strip: features just past the window's edge, up to where the scan beyond the window takes over", () => {
  it("a root of an even smaller power is still a root where f is exactly 0 at the 12-digit point", () => {
    refused("(x+2)*abs(x-1.3)^(0.005)", ["xIntercepts"], { xIntercepts: [-2] });
    accepted("(x+2)*abs(x-1.3)^(0.005)", ["xIntercepts"], { xIntercepts: [-2, 1.3] });
  });
  it("two roots in two cells just past the edge (f has the same sign on the edge and 10⁻³ past it)", () => {
    expect(codes(buildSimFromSpec(fn("(x+0.2)*(x-0.5003)*(x-0.5008)", ["xIntercepts"], { xMin: -0.5, xMax: 0.5, xIntercepts: [-0.2] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a touching root 3·10⁻⁴ past the edge", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*(x-5.0003)^2", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    expect(codes(buildSimFromSpec(fn("(x+1)*(x-5.0003)*(x-5.0003)", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a touching root exactly on the first sample past the edge (a dyadic grid: 2⁻¹⁰ apart)", () => {
    const w = { xMin: -0.9765625, xMax: 0.9765625 };
    expect(codes(buildSimFromSpec(fn("(x+0.5)*(x-0.9775390625)^2", ["xIntercepts"], { ...w, xIntercepts: [-0.5] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    expect(codes(buildSimFromSpec(fn("(x+0.5)*(x-0.9775390625)*(x-0.9775390625)", ["xIntercepts"], { ...w, xIntercepts: [-0.5] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a narrow window: an extremum 5·10⁻⁴ past the edge, 10 grid steps out", () => {
    const src = "(x-0.0505)^2*(x+0.03)", top = mx(-0.0031667, 0.0000773);
    expect(codes(buildSimFromSpec(fn(src, ["extrema"], { xMin: -0.05, xMax: 0.05, extrema: [top] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    accepted(src, ["extrema"], { xMin: -0.05, xMax: 0.06, extrema: [top, mn(0.0505, 0)] });
  });
});

describe("20F-RF11 the expression's cusps: a steep root whose dip falls between two samples", () => {
  it("(x − 41.34)·|x − 41.47|^(1/3) and (x − 4.64)·|x² − 4.7²|^0.1 on [−50, 50] (no local minimum of |f| on the grid)", () => {
    const w = { xMin: -50, xMax: 50 };
    refused("(x-41.34)*abs(x-41.47)^(1/3)", ["xIntercepts"], { ...w, xIntercepts: [41.34] });
    accepted("(x-41.34)*abs(x-41.47)^(1/3)", ["xIntercepts"], { ...w, xIntercepts: [41.34, 41.47] });
    refused("(x-4.64)*abs(x^2-4.7^2)^(0.1)", ["xIntercepts"], { ...w, xIntercepts: [-4.7, 4.64] });
    accepted("(x-4.64)*abs(x^2-4.7^2)^(0.1)", ["xIntercepts"], { ...w, xIntercepts: [-4.7, 4.64, 4.7] });
  });
  it("a cusp just past the edge that is a root, and one that is not (a floor)", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*abs(x-5.0004)^(1/3)", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    expect(codes(buildSimFromSpec(fn("(x+1)*abs(x-5.7)^(1/3)", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    accepted("(x+1)*(abs(x-5.7)^(0.25)+0.001)", ["xIntercepts"], { xIntercepts: [-1] });
  });
});

describe("20F-RF11 each new rule holds on its own (mutation campaign)", () => {
  it("a root of an exponent between 0.01 and 0.05 at an irrational point (±√2) is a root", () => {
    refused("(x+2)*abs(x^2-2)^(0.04)", ["xIntercepts"], { xIntercepts: [-2] });
  });
  it("searches reach the last digits of x in a wide window: a pole of 1/√|x − 0.5| on [−1000, 1000]", () => {
    const w = { xMin: -1000, xMax: 1000 };
    expect(codes(buildSimFromSpec(fn("1/sqrt(abs(x-0.5))+1/(x+300)", ["verticalAsymptotes"], { ...w, verticalAsymptotes: [-300] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("1/sqrt(abs(x-0.5))+1/(x+300)", ["verticalAsymptotes"], { ...w, verticalAsymptotes: [-300, 0.5] });
  });
  it("a search never settles inside a small domain gap: the double pole at 2.0012 beside a gap at (2.0025, 2.0035)", () => {
    const src = "1/((x-2.0012)^2+0*sqrt(abs(x-2.003)-0.0005))+1/(x+3)";
    expect(codes(buildSimFromSpec(fn(src, ["verticalAsymptotes"], { verticalAsymptotes: [-3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted(src, ["verticalAsymptotes"], { verticalAsymptotes: [-3, 2.0012] });
  });
  it("a cusp root inside the window near its edge is not 'beyond the window'", () => {
    accepted("(x+1)*abs(x-4.9995)^(1/3)", ["xIntercepts"], { xIntercepts: [-1, 4.9995] });
  });
  it("a cusp past the window whose dip the scan beyond the window does not see (e^(2x) outgrows it)", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*exp(2*x)*abs(x-9)^(0.1)", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    accepted("(x+1)*exp(2*x)*abs(x-9)^(0.1)", ["xIntercepts"], { xMin: -5, xMax: 10, xIntercepts: [-1, 9] });
  });
  it("a square root's argument is a cusp: (x − 41.34)·√√|x − 41.47| on [−50, 50]", () => {
    const w = { xMin: -50, xMax: 50 };
    refused("(x-41.34)*sqrt(sqrt(abs(x-41.47)))", ["xIntercepts"], { ...w, xIntercepts: [41.34] });
    accepted("(x-41.34)*sqrt(sqrt(abs(x-41.47)))", ["xIntercepts"], { ...w, xIntercepts: [41.34, 41.47] });
  });
  it("a cusp at an irrational point is a root when f vanishes like a power there (its 12-digit rounding is close enough)", () => {
    expect(codes(buildSimFromSpec(fn("(x-1.35)*abs((x-1.41421356237309)*(x+3))^(0.1)", ["xIntercepts"], { xMin: -50, xMax: 50, xIntercepts: [-3, 1.35] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a flat extremum near the edge rises only 16 steps out, past the edge: (x − 4.99)⁸ + 1000", () => {
    const yi = 4.99 ** 8 + 1000;
    expect(codes(buildSimFromSpec(fn("(x-4.99)^8+1000", ["extrema", "yIntercept"], { yIntercept: yi })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
    accepted("(x-4.99)^8+1000", ["extrema", "yIntercept"], { yIntercept: yi, extrema: [mn(4.99, 1000)] });
  });
});

describe("20F-RF11 many cusps never switch the exclusions off (regression found in self-review of 5d3739b)", () => {
  // a zigzag of log(|x| + 1) has 64 zeros beyond each window edge (x ≈ ±19 … ±4·10⁵): 5d3739b capped the cusps with the exclusions,
  // so past the cap the double pole at 7 went unseen (the incomplete key accepted); 20966d8, without cusps, refused it
  const Z = "abs(abs(abs(abs(abs(abs(log(abs(x)+1)-8)-2.5)-1.25)-0.625)-0.3125)-0.15625)-0.078125";
  const src = "(x+1)*(sqrt(abs(" + Z + "))+1)+1/(x-7)^2+1/(x-2)", tasks = ["xIntercepts", "verticalAsymptotes"];
  it("the double pole at 7 beyond the window still refuses the key", () => {
    expect(codes(buildSimFromSpec(fn(src, tasks, { xIntercepts: [-0.8705, 1.8564], verticalAsymptotes: [2] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("with 7 inside the window the key is accepted: every cusp beyond it is checked, none is a root", () => {
    accepted(src, tasks, { xMax: 8, xIntercepts: [-0.8705, 1.8564], verticalAsymptotes: [2, 7] });
  });
});

describe("20F-RF11 the left edge too (regression found by the batteries on d180e8d: a search bracket given right to left)", () => {
  it("a steep touching root beyond the LEFT edge (x·√|x + 6| on [−5, 5]) refuses the key", () => {
    expect(codes(buildSimFromSpec(fn("x*sqrt(abs(x+6))", ["xIntercepts"], { yMin: -100, yMax: 100, xIntercepts: [0] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    expect(codes(buildSimFromSpec(fn("(x+1)*abs(x+6)^(2/3)", ["xIntercepts"], { yMin: -100, yMax: 100, xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a guard's touching zero beyond the LEFT edge is a pole there (1/√|x + 6|)", () => {
    expect(codes(buildSimFromSpec(fn("1/sqrt(abs(x+6))+1/x", ["verticalAsymptotes"], { verticalAsymptotes: [0] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("the edge strip mirrored: two roots and a touching root just past the LEFT edge", () => {
    expect(codes(buildSimFromSpec(fn("(x-0.2)*(x+0.5003)*(x+0.5008)", ["xIntercepts"], { xMin: -0.5, xMax: 0.5, xIntercepts: [0.2] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
    expect(codes(buildSimFromSpec(fn("(x-1)*(x+5.0003)*(x+5.0003)", ["xIntercepts"], { xIntercepts: [1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a plain root beyond the window — no cusp, no guard — is found by the scan's sign change ((x + 1)(x − 7))", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*(x-7)", ["xIntercepts"], { yMin: -50, yMax: 50, xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});

describe("20F-RF11 each rule holds on its own (final mutation re-run on 59747bc)", () => {
  const Zu = "abs(abs(abs(abs(abs(abs(log(abs(x)+1)-8)-2.5)-1.25)-0.625)-0.3125)-0.15625)-0.078125";
  it("a window narrower than the edge strip: a root between the strip's end and the scan beyond the window (the edge value starts the scan)", () => {
    expect(codes(buildSimFromSpec(fn("(x-0.00025)*(x-0.0012)", ["xIntercepts"], { xMin: 0, xMax: 0.0005, xIntercepts: [0.00025] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a guard zero of a power below the vanishing floor is found where the guard is exactly 0 at the 12-digit point (1/|x − 2.1|^0.005)", () => {
    expect(codes(buildSimFromSpec(fn("1/abs(x-2.1)^(0.005)+1/(x+4.2)", ["domainExclusions"], { domainExclusions: [-4.2] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a hidden cusp root below the vanishing floor: (x − 41.34)·|x − 41.47|^0.005 on [−50, 50]", () => {
    expect(codes(buildSimFromSpec(fn("(x-41.34)*abs(x-41.47)^(0.005)", ["xIntercepts"], { xMin: -50, xMax: 50, xIntercepts: [41.34] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a touching root beyond the window that is neither a cusp nor a sign change: (x + 1)(x − 7)(x − 7)", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*(x-7)*(x-7)", ["xIntercepts"], { yMin: -100, yMax: 100, xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
  it("a large V-shaped touching root that is not a cusp vanishes like a power: 10⁹·|x² − 2|·(x + 3)", () => {
    expect(codes(buildSimFromSpec(fn("1000000000*abs(x^2-2)*(x+3)", ["xIntercepts"], { xIntercepts: [-3] })))).toEqual(["AI_FUNCTION_KEY_INCOMPLETE"]);
  });
  it("a steep root beyond the window when the guards beyond it are too many to report (64 zeros of a denominator)", () => {
    expect(codes(buildSimFromSpec(fn("(x+1)*sqrt(abs(x^2-82))+0/(" + Zu + ")", ["xIntercepts"], { xIntercepts: [-1] })))).toEqual(["AI_FUNCTION_WINDOW_TOO_NARROW"]);
  });
});
