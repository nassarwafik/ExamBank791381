import { describe, it, expect } from "vitest";
import { validateChartSpec, isChartId, CHART_LIMITS } from "./chartSpec";
import { nextChartSelection } from "./chartData";
import { isVisualId } from "../visualGeometry";
import { validateChartSelectionConfig } from "../chartSelectionQuestion";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — pins added by the mutation campaign (each kills a mutant that the earlier suites let survive) and by the self-review:
// the serialized-size bound is reachable and enforced, the selection rules of every mode (single toggles off), the chart id rule is the
// visual id rule, and the chartSelection instruction label follows the same text rule as every chart text (no explicit bidi controls).
const codes = (c: unknown) => { const r = validateChartSpec(c); return r.ok ? [] : r.issues.map(i => i.code + "@" + i.path); };

describe("21A1-R1 serialized size bound (mutant C23)", () => {
  it("a maximal labelled scatter (500 points × 73-character Arabic labels ≈ 95 KB) is refused by the 64 KiB bound; short labels pass", () => {
    const sc = (label: string) => ({ version: 1, id: "s", kind: "scatter", title: "t", description: "d",
      series: [{ id: "a", label: "a", points: Array.from({ length: 500 }, (_, i) => ({ id: "p" + i, x: i, y: i, label: label + i })) }] });
    expect("ن".repeat(70).length + 3).toBeLessThanOrEqual(CHART_LIMITS.labelChars);
    expect(codes(sc("ن".repeat(70)))).toEqual(["CHART_LIMIT@chart"]);
    expect(validateChartSpec(sc("n")).ok).toBe(true);
  });
});

describe("21A1-R2 selection rules (mutants D02–D04)", () => {
  const order = ["a", "b", "c", "d", "e"];
  it("single: a click selects, a second click on the SAME target clears, another target replaces", () => {
    expect(nextChartSelection("single", order, [], "b", 1)).toEqual(["b"]);
    expect(nextChartSelection("single", order, ["b"], "b", 1)).toEqual([]);
    expect(nextChartSelection("single", order, ["b"], "d", 1)).toEqual(["d"]);
  });
  it("multiple: toggles, keeps chart order, never exceeds the bound", () => {
    expect(nextChartSelection("multiple", order, ["d"], "a", 2)).toEqual(["a", "d"]);
    expect(nextChartSelection("multiple", order, ["a", "d"], "c", 2)).toEqual(["a", "d"]);
    expect(nextChartSelection("multiple", order, ["a", "d"], "a", 2)).toEqual(["d"]);
  });
  it("range: the first click anchors, the next extends to a contiguous run (either direction, end included), the anchor alone clears", () => {
    expect(nextChartSelection("range", order, [], "b", 5)).toEqual(["b"]);
    expect(nextChartSelection("range", order, ["b"], "d", 5)).toEqual(["b", "c", "d"]);
    expect(nextChartSelection("range", order, ["d"], "b", 5)).toEqual(["b", "c", "d"]);
    expect(nextChartSelection("range", order, ["b"], "b", 5)).toEqual([]);
    expect(nextChartSelection("range", order, ["a"], "e", 3)).toEqual(["a", "b", "c"]);
  });
  it("an unknown key changes nothing (the current selection is kept in chart order)", () => {
    expect(nextChartSelection("multiple", order, ["c", "a"], "zz", 3)).toEqual(["a", "c"]);
  });
});

describe("21A1-R3 identity and text rules", () => {
  it("the chart id rule is exactly the visual id rule (a local copy keeps the contract free of the geometry module)", () => {
    const corpus = ["a", "A1", "chart-1", "x_y", "a".repeat(32), "a".repeat(33), "1a", "-a", "_a", "", " a", "a b", "jаn", "a/b", "a.b",
      "__proto__", "constructor", "prototype", "Prototype", "ab\u0000", "é", 1, null, undefined, {}, ["a"]];
    for (const v of corpus) expect(isChartId(v), JSON.stringify(v)).toBe(isVisualId(v));
  });
  it("the chartSelection instruction label refuses explicit bidi controls like every chart text; plain LRM / RLM marks are allowed", () => {
    const cfg = (label: string) => ({ v: 1, chart: rainfallBar(), target: "category", mode: "single", maxSelections: 1, label });
    const bad = validateChartSelectionConfig(cfg("اختر ‮الشهر"));
    expect(bad.ok ? [] : bad.issues.map(i => i.code)).toEqual(["CHART_SELECTION_LABEL_INVALID"]);
    expect(validateChartSelectionConfig(cfg("اختر ⁦Jan⁩")).ok).toBe(false);
    expect(validateChartSelectionConfig(cfg("اختر ‎Jan‎ من الرسم")).ok).toBe(true);
  });
});
