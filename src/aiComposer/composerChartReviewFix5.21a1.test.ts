import { describe, it, expect } from "vitest";
import { mapAiChart, numbersInText, pairedNumbers, type AiChartPolicy } from "./composerChart";

// Phase 21A.1 Review Fix 5 — the round-5 pairing findings (lane A R5-A1 … R5-A11, lane C C5-1 / C5-2 / C5-4): what the request WRITES for a
// category is read in the documented forms only; an unclear writing pairs nothing (the correct chart is accepted), a clear one detects a swap.
const D = (over: Record<string, unknown> = {}) => ({
  kind: "bar", dataOrigin: "teacherProvided", title: "رسم", description: "وصف الرسم.", categories: ["يناير", "فبراير", "مارس"],
  series: [{ label: "القيمة", values: [120, 95, 82], mark: "bar" }], points: [], bins: [], boxes: [], xLabel: "", yLabel: "", unit: "",
  stacked: false, horizontal: false, donut: false, ...over
});
const P = (request: string): AiChartPolicy => ({ request, illustrative: false, charts: true });
const bar = (categories: string[], values: (number | null)[]) => D({ categories, series: [{ label: "القيمة", values, mark: "bar" }] });
const verdict = (raw: unknown, request: string) => { const r = mapAiChart(raw, 0, P(request), "b"); return r.ok ? "ok" : r.issues.map(i => i.code).join(); };
const REFUSED = "AI_CHART_DATA_NOT_PROVIDED";

describe("21A1-AI12 values written BEFORE their labels never pair with the next label (round-5 finding R5-A1)", () => {
  const LINES: [string, string[], number[], number[]][] = [
    ["120 في يناير\n80 في فبراير\n95 في مارس", ["يناير", "فبراير", "مارس"], [120, 80, 95], [80, 95, 120]],
    ["120 Jan\n80 Feb\n95 Mar", ["Jan", "Feb", "Mar"], [120, 80, 95], [80, 95, 120]],
    ["120\tJan\n80\tFeb", ["Jan", "Feb"], [120, 80], [80, 120]],
    ["5,A\n12,B", ["A", "B"], [5, 12], [12, 5]],
    ["50% أ\n30% ب\n20% ج", ["أ", "ب", "ج"], [50, 30, 20], [30, 20, 50]]
  ];
  it("a label never takes the next line's number, and a number right before a label makes the pairing unclear: the correct chart is accepted", () => {
    for (const [req, labels, good] of LINES) {
      expect(pairedNumbers(req, labels), req).toEqual(labels.map(() => undefined));
      expect(verdict(bar(labels, good), req), req).toBe("ok");
    }
  });
  it("a label ending its line does not take the number on the next line (label-first lines still pair)", () => {
    expect(pairedNumbers("Jan\n120 Feb 80", ["Jan", "Feb"])[0]).toBeUndefined();
    expect(pairedNumbers("Jan 120\nFeb 80\nMar 95", ["Jan", "Feb", "Mar"])).toEqual([120, 80, 95]);
  });
});

describe("21A1-AI13 a value's unit is one token of any length; parentheses and superscripts (round-5 findings R5-A2 / R5-A10 / R5-A11)", () => {
  it("label · number · unit pairs with long, slashed, degree and Arabic units, and in parentheses; a swap of them is refused", () => {
    const CASES: [string, string[], number[]][] = [
      ["Class A 30 students, Class B 25 students", ["Class A", "Class B"], [30, 25]],
      ["Mon 45 minutes, Tue 50 minutes", ["Mon", "Tue"], [45, 50]],
      ["Car 60 km/h, Bus 40 km/h", ["Car", "Bus"], [60, 40]],
      ["يناير 120 ملليمترًا، فبراير 80 ملليمترًا", ["يناير", "فبراير"], [120, 80]],
      ["Jan (120), Feb (80)", ["Jan", "Feb"], [120, 80]],
      ["Jan (120 mm), Feb (80 mm)", ["Jan", "Feb"], [120, 80]],
      ["Room A 30 m², Room B 25 m²", ["Room A", "Room B"], [30, 25]]
    ];
    for (const [req, labels, good] of CASES) {
      expect(pairedNumbers(req, labels), req).toEqual(good);
      expect(verdict(bar(labels, good), req), req).toBe("ok");
      expect(verdict(bar(labels, [...good].reverse()), req), req).toBe(REFUSED);
    }
  });
  it("a superscript is part of its unit, never a number: m² is not the number 2", () => {
    expect([...numbersInText("Room A 30 m², Room B 25 m³")]).toEqual([30, 25]);
  });
  it("fullwidth digits, decimal point and minus read as written (R5-A10): a sign-flipped chart is refused, the correct one accepted", () => {
    expect([...numbersInText("Jan －５, Feb １２０．５")]).toEqual([-5, 120.5]);
    expect(verdict(bar(["Jan", "Feb"], [-5, 120.5]), "Jan －５, Feb １２０．５")).toBe("ok");
    expect(verdict(bar(["Jan", "Feb"], [5, 120.5]), "Jan －５, Feb １２０．５")).toBe(REFUSED);
  });
  it("a six-character unit continues a value list (R5-A11): «طالبات» after each value", () => {
    expect(pairedNumbers("Jan, Feb: 120 طالبات، 80 طالبات", ["Jan", "Feb"])).toEqual([120, 80]);
  });
});

describe("21A1-AI14 list items and labels inside longer labels (round-5 findings R5-A3 / R5-A4)", () => {
  it("a label after a unit and a separator is not an item of a list of labels: «أ 30 طالب، ب 25 طالب», \"A: 21 °C, B: 19 °C\"", () => {
    expect(pairedNumbers("أ 30 طالب، ب 25 طالب", ["أ", "ب"])).toEqual([30, 25]);
    expect(pairedNumbers("A: 21 °C, B: 19 °C", ["A", "B"])).toEqual([21, 19]);
    expect(pairedNumbers("A: 21 °C, B: 19 °C, C: 25 °C", ["A", "B", "C"])).toEqual([21, 19, 25]);   // "°C" is a unit, never the label "C"
  });
  it("a label written inside a longer label of the chart is that label: the correct chart is accepted, a swap refused", () => {
    const CASES: [string, string[], number[]][] = [
      ["Strongly agree 30, Agree 25", ["Strongly agree", "Agree"], [30, 25]],
      ["Very good 12, Good 20", ["Very good", "Good"], [12, 20]],
      ["موافق بشدة 30، موافق 25", ["موافق بشدة", "موافق"], [30, 25]],
      ["شمال غرب 5، غرب 7", ["شمال غرب", "غرب"], [5, 7]]
    ];
    for (const [req, labels, good] of CASES) {
      expect(pairedNumbers(req, labels), req).toEqual(good);
      expect(verdict(bar(labels, good), req), req).toBe("ok");
      expect(verdict(bar(labels, [...good].reverse()), req), req).toBe(REFUSED);
    }
  });
});

describe("21A1-AI15 radar axes and one-row heat maps are checked like single-series charts (round-5 finding R5-A5)", () => {
  const req = "مهارات علي: القراءة 8، الكتابة 6، الحساب 7";
  it("a swapped radar is refused, the correct radar accepted", () => {
    const radar = (values: number[]) => D({ kind: "radar", categories: ["القراءة", "الكتابة", "الحساب"], series: [{ label: "علي", values, mark: "bar" }] });
    expect(verdict(radar([8, 6, 7]), req)).toBe("ok");
    expect(verdict(radar([6, 8, 7]), req)).toBe(REFUSED);
  });
  it("a swapped one-row heat map is refused, the correct one accepted", () => {
    const heat = (values: number[]) => D({ kind: "heatmap", categories: ["القراءة", "الكتابة", "الحساب"], series: [{ label: "علي", values, mark: "bar" }] });
    expect(verdict(heat([8, 6, 7]), req)).toBe("ok");
    expect(verdict(heat([8, 7, 6]), req)).toBe(REFUSED);
  });
});

describe("21A1-AI16 a connector or a proclitic glued to the next label is never a unit (round-5 finding C5-1)", () => {
  it("small monthly values written with «و» (glued or alone), «ثم», \"and\", \"then\" or another proclitic pair as written", () => {
    const CASES: [string, string[], number[]][] = [
      ["متوسط درجات الحرارة: يناير 12 وفبراير 14 ومارس 18", ["يناير", "فبراير", "مارس"], [12, 14, 18]],
      ["يناير 12 و فبراير 14 و مارس 18", ["يناير", "فبراير", "مارس"], [12, 14, 18]],
      ["يناير 5 وفبراير 8", ["يناير", "فبراير"], [5, 8]],
      ["مارس 3 وأبريل 40", ["مارس", "أبريل"], [3, 40]],
      ["يناير 12 ثم فبراير 14", ["يناير", "فبراير"], [12, 14]],
      ["يناير 12 فمارس 18", ["يناير", "مارس"], [12, 18]],
      ["Jan 12 and Feb 14 and Mar 18", ["Jan", "Feb", "Mar"], [12, 14, 18]],
      ["Jan 12 then Feb 14", ["Jan", "Feb"], [12, 14]]
    ];
    for (const [req, labels, good] of CASES) expect(pairedNumbers(req, labels), req).toEqual(good);
  });
  it("the swap of the glued Arabic form is refused (it was accepted on the round-5 head), the correct chart accepted", () => {
    const req = "متوسط درجات الحرارة: يناير 12 وفبراير 14 ومارس 18";
    expect(verdict(bar(["يناير", "فبراير", "مارس"], [12, 14, 18]), req)).toBe("ok");
    expect(verdict(bar(["يناير", "فبراير", "مارس"], [14, 12, 18]), req)).toBe(REFUSED);
    expect(verdict(bar(["يناير", "فبراير"], [8, 5]), "يناير 5 وفبراير 8")).toBe(REFUSED);
  });
  it("a unit that starts with a proclitic letter is still a unit («وحدة»)", () => {
    expect(pairedNumbers("يناير 120 وحدة، فبراير 80 وحدة", ["يناير", "فبراير"])).toEqual([120, 80]);
  });
});

describe("21A1-AI17 every documented pairing rule has an assertion that fails without it (round-5 findings C5-2 / C5-4)", () => {
  it("an ordinal is not a value: \"North 2nd, South 80\"", () => {
    expect(pairedNumbers("North 2nd, South 80", ["North", "South"])).toEqual([undefined, 80]);
  });
  it("a line break and «؟» end a clause: the number after them is not in the label's clause", () => {
    expect(pairedNumbers("Jan 120\nTotal 95", ["Jan"])).toEqual([120]);
    expect(pairedNumbers("يناير 120؟ المجموع 95", ["يناير"])).toEqual([120]);
  });
  it("«ثم» is a connector to the next label", () => {
    expect(pairedNumbers("يناير 120 ثم فبراير 80", ["يناير", "فبراير"])).toEqual([120, 80]);
  });
  it("the proclitics ف ب ل ك (not only و) may join the next label", () => {
    expect(pairedNumbers("يناير 12 فمارس 18", ["يناير", "مارس"])).toEqual([12, 18]);
    expect(pairedNumbers("الصف 12 بالفصل 18", ["الصف", "الفصل"])).toEqual([12, 18]);
  });
  it("the Levantine month names are months: «شباط 3 أيام» is a day count", () => {
    expect(pairedNumbers("شباط 3 أيام، آذار 40", ["شباط", "آذار"])).toEqual([undefined, 40]);
    expect(pairedNumbers("Feb 3 days, Mar 40", ["Feb", "Mar"])).toEqual([undefined, 40]);
  });
  it("the day of the month is a whole number from 1 to 31 — 30 and 31 are days, 0 and 32 are not", () => {
    expect(pairedNumbers("Mar 30 days, Apr 40", ["Mar", "Apr"])).toEqual([undefined, 40]);
    expect(pairedNumbers("Mar 31 days, Apr 40", ["Mar", "Apr"])).toEqual([undefined, 40]);
    expect(pairedNumbers("Mar 0 days, Apr 40", ["Mar", "Apr"])).toEqual([0, 40]);
    expect(pairedNumbers("Mar 32 days, Apr 40", ["Mar", "Apr"])).toEqual([32, 40]);
  });
  it("the one-letter word labels \"a\" and \"I\" pair only after \":\" or \"=\" — both marks count", () => {
    expect(pairedNumbers("I 30 students, J: 5", ["I", "J"])).toEqual([undefined, 5]);
    expect(pairedNumbers("I = 30, J = 5", ["I", "J"])).toEqual([30, 5]);
    expect(pairedNumbers("A = 6, B = 7", ["A", "B"])).toEqual([6, 7]);
  });
});
