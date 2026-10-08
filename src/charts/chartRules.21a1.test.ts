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
    // review fix A3: C1 controls and invisible format characters are refused there too
    for (const bad2 of ["اختر\u0085الشهر", "اختر\u200Bالشهر", "اختر\u2029الشهر"]) expect(validateChartSelectionConfig(cfg(bad2)).ok, JSON.stringify(bad2)).toBe(false);
  });
  it("every C1 control U+0080–U+009F is refused in chart text, not only NEL and CSI (review fix 3, round-3 pin E10)", () => {
    for (let cp = 0x80; cp <= 0x9f; cp++) {
      const c = rainfallBar() as unknown as { title: string };
      c.title = "هطول" + String.fromCharCode(cp) + "شهري";
      expect(validateChartSpec(c).ok, "U+" + cp.toString(16).toUpperCase().padStart(4, "0")).toBe(false);
    }
  });
  it("ZWNJ / ZWJ (needed by Persian and Arabic text) stay allowed in chart text", () => {
    const c = rainfallBar() as unknown as { title: string; categories: { label: string }[] };
    c.title = "می\u200Cخواهم"; c.categories[0].label = "لا\u200Dم";
    expect(validateChartSpec(c).ok).toBe(true);
  });
});

describe("21A1-R4 the validator never throws (review fix A1, defense in depth)", () => {
  it("a value whose property access throws (a getter — not producible by JSON, but by an in-process caller) is refused as CHART_INVALID", () => {
    const hostile = { ...rainfallBar() } as Record<string, unknown>;
    Object.defineProperty(hostile, "title", { enumerable: true, get() { throw new Error("boom"); } });
    let r: ReturnType<typeof validateChartSpec> | undefined;
    expect(() => { r = validateChartSpec(hostile); }).not.toThrow();
    expect(r!.ok).toBe(false);
    expect(r!.ok ? [] : r!.issues.map(i => i.code)).toEqual(["CHART_INVALID"]);
  });
});

describe("21A1-R5 invisible characters: every default-ignorable is refused, look-alike labels are duplicates (review fix 2, N4)", () => {
  const withLabel = (label: string, at = 0) => { const c = rainfallBar() as Record<string, unknown> & { categories: { id: string; label: string }[] }; c.categories = c.categories.map((x, i) => (i === at ? { ...x, label } : x)); return c; };
  const codes = (c: unknown) => { const r = validateChartSpec(c); return r.ok ? [] : r.issues.map(i => i.code); };
  const hex = (ch: string) => "U+" + ch.codePointAt(0)!.toString(16).toUpperCase();
  it("invisible operators, soft hyphen, Mongolian vowel separator, Hangul fillers, variation selectors and tag characters are refused", () => {
    // also the word joiner, the deprecated format characters U+206A–206F and the interlinear annotation marks U+FFF9–FFFB (round 2, C2-1)
    for (const ch of ["\u2060", "\u206A", "\u206D", "\u206F", "\uFFF9", "\uFFFA", "\uFFFB", "\u2061", "\u2063", "\u00AD", "\u180E", "\u115F", "\u3164", "\uFFA0", "\uFE00", "\u{E0020}", "\u{E0100}"]) {
      expect(codes(withLabel("يناير" + ch)), hex(ch)).toContain("CHART_TEXT_CONTROL");
      expect(validateChartSelectionConfig({ v: 1, chart: rainfallBar(), target: "category", mode: "single", maxSelections: 1, label: "اختر" + ch }).ok, hex(ch)).toBe(false);
    }
  });
  it("ZWNJ / ZWJ, the LRM / RLM / ALM marks and the text / emoji presentation selectors stay allowed", () => {
    for (const ch of ["\u200C", "\u200D", "\u200E", "\u200F", "\u061C", "\uFE0E", "\uFE0F"]) expect(codes(withLabel("يناير" + ch)), hex(ch)).toEqual([]);
  });
  it("labels that differ only by case, Unicode composition or inner spacing are duplicates (round 3, lane C N4)", () => {
    expect(codes(withLabel("فبراير", 0))).toContain("CHART_LABEL_DUPLICATE");                                // control: an exact duplicate
    const latin = () => { const c = rainfallBar() as Record<string, unknown> & { categories: { id: string; label: string }[] }; c.categories = c.categories.map((x, i) => ({ ...x, label: i === 0 ? "Jan" : i === 1 ? "jan" : x.label })); return c; };
    expect(codes(latin())).toContain("CHART_LABEL_DUPLICATE");
    const nfc = (a: string, b: string) => { const c = rainfallBar() as Record<string, unknown> & { categories: { id: string; label: string }[] }; c.categories = c.categories.map((x, i) => ({ ...x, label: i === 0 ? a : i === 1 ? b : x.label })); return c; };
    expect(codes(nfc("Caf\u00E9", "Cafe\u0301"))).toContain("CHART_LABEL_DUPLICATE");
    expect(codes(nfc("a  b", "a b"))).toContain("CHART_LABEL_DUPLICATE");
  });
  it("labels that differ only by an allowed invisible character are duplicates", () => {
    expect(codes(withLabel("يناير\u200C", 1))).toContain("CHART_LABEL_DUPLICATE");
    expect(codes(withLabel("ين\u200Dاير", 1))).toContain("CHART_LABEL_DUPLICATE");
  });
});
