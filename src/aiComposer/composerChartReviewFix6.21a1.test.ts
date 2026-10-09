import { describe, it, expect } from "vitest";
import { mapAiChart, pairedNumbers, type AiChartPolicy } from "./composerChart";

// Phase 21A.1 Review Fix 6 — the round-6 pairing findings (lane A R6-A1 … R6-A3, lane C C6-2): a value written before its label pairs
// nothing wherever the value-first writing starts (after a leading word, a colon, a line break, with a unit); every line break counts as one
// (CR, CR LF, VT, FF, NEL, LS, PS); and the pairing of a long request stays linear (no backtracking over the text before each number).
const D = (over: Record<string, unknown> = {}) => ({
  kind: "bar", dataOrigin: "teacherProvided", title: "رسم", description: "وصف الرسم.", categories: ["يناير", "فبراير", "مارس"],
  series: [{ label: "القيمة", values: [120, 95, 82], mark: "bar" }], points: [], bins: [], boxes: [], xLabel: "", yLabel: "", unit: "",
  stacked: false, horizontal: false, donut: false, ...over
});
const P = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
const chart = (kind: string, categories: string[], values: (number | null)[]) => D({ kind, categories, series: [{ label: "القيمة", values, mark: "bar" }] });
const verdict = (raw: unknown, request: string) => { const r = mapAiChart(raw, 0, P(request), "b"); return r.ok ? "ok" : r.issues.map(i => i.code).join(); };
const REFUSED = "AI_CHART_DATA_NOT_PROVIDED";

describe("21A1-AI19 a value-first writing after a leading word pairs nothing (round-6 finding R6-A1)", () => {
  const CASES: [string, string[], number[]][] = [
    ["Sales 120 Jan 80 Feb 95 Mar", ["Jan", "Feb", "Mar"], [120, 80, 95]],
    ["Rainfall 120 in Jan 80 in Feb 95 in Mar", ["Jan", "Feb", "Mar"], [120, 80, 95]],
    ["الأمطار 120 في يناير 80 في فبراير 95 في مارس", ["يناير", "فبراير", "مارس"], [120, 80, 95]],
    ["المبيعات 120 يناير 80 فبراير 95 مارس", ["يناير", "فبراير", "مارس"], [120, 80, 95]]
  ];
  it("no label takes the next value; the correct chart is accepted (it was refused, and the shifted one accepted, on the round-6 head)", () => {
    for (const [req, labels, good] of CASES) {
      expect(pairedNumbers(req, labels), req).toEqual(labels.map(() => undefined));
      expect(verdict(chart("bar", labels, good), req), req).toBe("ok");
    }
  });
  it("radar axes and heat-map columns: \"Scores 8 for Speed …\", \"Readings 12 at Mon …\" — the correct chart is accepted", () => {
    expect(verdict(chart("radar", ["Speed", "Power", "Skill"], [8, 6, 9]), "Scores 8 for Speed 6 for Power 9 for Skill")).toBe("ok");
    expect(pairedNumbers("Readings 12 at Mon 15 at Tue 9 at Wed", ["Mon", "Tue", "Wed"])).toEqual([undefined, undefined, undefined]);
  });
  it("label-first writings still pair, and their swaps are still refused", () => {
    for (const [req, labels, good, swapped] of [
      ["Jan 120 and Feb 80 and Mar 95", ["Jan", "Feb", "Mar"], [120, 80, 95], [80, 120, 95]],
      ["يناير 12 وفبراير 14 ومارس 18", ["يناير", "فبراير", "مارس"], [12, 14, 18], [14, 12, 18]],
      ["Jan (120) Feb (80) Mar (95)", ["Jan", "Feb", "Mar"], [120, 80, 95], [80, 120, 95]]
    ] as [string, string[], number[], number[]][]) {
      expect(pairedNumbers(req, labels), req).toEqual(good);
      expect(verdict(chart("bar", labels, good), req), req).toBe("ok");
      expect(verdict(chart("bar", labels, swapped), req), req).toBe(REFUSED);
    }
  });
  it("a value-first clause after a line break, after a colon, and with a unit before the label (lane C C6-2: mutants X07 / X10 / X08)", () => {
    for (const [req, labels, good] of [
      ["Rainfall\n120 Jan 80 Feb 95 Mar", ["Jan", "Feb", "Mar"], [120, 80, 95]],
      ["Rainfall: 120 Jan 80 Feb 95 Mar", ["Jan", "Feb", "Mar"], [120, 80, 95]],
      ["50% X 30% Y 20% Z", ["X", "Y", "Z"], [50, 30, 20]],
      ["50% أ 30% ب 20% ج", ["أ", "ب", "ج"], [50, 30, 20]]
    ] as [string, string[], number[]][]) {
      expect(pairedNumbers(req, labels), req).toEqual(labels.map(() => undefined));
      expect(verdict(chart("bar", labels, good), req), req).toBe("ok");
    }
  });
});

describe("21A1-AI22 Review Fix 6 mutation pins (§20.6)", () => {
  it("RW08 / RW10: a value-first clause at the text's start or after a colon makes a connector pairing unclear too", () => {
    expect(pairedNumbers("120 Jan and 80 Feb", ["Jan", "Feb"])).toEqual([undefined, undefined]);
    expect(pairedNumbers("Rainfall: 120 Jan and 80 Feb", ["Jan", "Feb"])).toEqual([undefined, undefined]);
  });
});

describe("21A1-AI20 every line break ends a clause (round-6 finding R6-A2)", () => {
  const BREAKS = ["\r", "\r\n", "\u000B", "\u000C", "\u0085", "\u2028", "\u2029"];
  it("value-first lines separated by any line break pair nothing; the correct chart is accepted", () => {
    for (const br of BREAKS) {
      const req = ["Rainfall", "120 Jan", "80 Feb", "95 Mar"].join(br);
      expect(pairedNumbers(req, ["Jan", "Feb", "Mar"]), JSON.stringify(br)).toEqual([undefined, undefined, undefined]);
      expect(verdict(chart("bar", ["Jan", "Feb", "Mar"], [120, 80, 95]), req), JSON.stringify(br)).toBe("ok");
    }
  });
  it("a label alone on its line does not take the number on the next line, whatever the break", () => {
    for (const br of BREAKS) expect(pairedNumbers(["Jan", "120 mm rain", "Feb", "80", "Mar 95"].join(br), ["Jan", "Feb", "Mar"]), JSON.stringify(br)).toEqual([undefined, undefined, 95]);
  });
  it("label-first lines still pair across every break", () => {
    for (const br of BREAKS) expect(pairedNumbers(["Jan 120", "Feb 80", "Mar 95"].join(br), ["Jan", "Feb", "Mar"]), JSON.stringify(br)).toEqual([120, 80, 95]);
  });
});

describe("21A1-AI21 the pairing of a long request stays linear (round-6 finding R6-A3)", () => {
  it("2,000 spaces then 990 one-letter words before a number: well under a second (it took over 10 s on the round-6 head)", () => {
    for (const [lab, other, req] of [
      ["b", "ب", " ".repeat(2000) + "b ".repeat(990) + " 1"],
      ["ب", "b", " ".repeat(2000) + "ب ".repeat(990) + " 1"],
      ["b", "ب", "\n".repeat(2000) + "b\n".repeat(990) + " 1"]
    ]) {
      const t0 = performance.now();
      mapAiChart(chart("bar", [lab, other, "c", "d"], [1, 1, 1, 1]), 0, P(req), "b");
      expect(performance.now() - t0, JSON.stringify(req.slice(-8))).toBeLessThan(1000);
    }
  });
});
