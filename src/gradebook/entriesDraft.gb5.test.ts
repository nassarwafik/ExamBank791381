// Class gradebook GB5 — the unsaved marks and decisions (docs/enterprise-class-gradebook-gb.md §4.6 item 3). The invariant first: a column
// action touches ONLY the cells where the student has nothing — never a result, a result awaiting the teacher, a typed score or a decision
// (AGENTS.md §10: a zero exists only by the teacher's explicit decision). Then: edits that return to the stored value vanish, typed scores
// (Arabic digits accepted) are validated against the column's maximum, the save carries the value the teacher saw, and a cell changed
// elsewhere keeps the teacher's value and shows the server's.
import { describe, it, expect } from "vitest";
import {
  storedValue, parseScore, setDecision, setScoreText, applyColumnAction, invalidEdits, toItems, afterSave, rebase, currentEdit, cellKey, valueText, type EntriesDraft
} from "./entriesDraft";
import type { GbGradebook, GbRow } from "./types";

const row = (studentId: string, cells: GbRow["cells"]): GbRow => ({ studentId, cells, categories: {}, final: { value: null, display: null, status: "incomplete" } });
const GB = (over: Partial<GbGradebook> = {}): GbGradebook => ({
  ok: true, classId: "c1", className: "ص", readOnly: false, withheld: [], warnings: [], schemeStatus: "active", etags: { scheme: "e", entries: "x" },
  students: ["s1", "s2", "s3", "s4", "s5", "s6"].map(id => ({ studentId: id, displayName: id, code: "" })),
  scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "k", title: "ق", weight: 100, items: [] }] },
  columns: [
    { itemId: "hw", categoryId: "k", weight: 50, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة" },
    { itemId: "paper", categoryId: "k", weight: 50, source: { kind: "manual", title: "ورقي", maxScore: 20 }, title: "ورقي" }
  ],
  rows: [
    row("s1", { hw: { state: "graded", percent: 80, display: 80 }, paper: { state: "graded", percent: 50, display: 50 } }),
    row("s2", { hw: { state: "pending" }, paper: { state: "missing" } }),
    row("s3", { hw: { state: "missing" }, paper: { state: "missing" } }),
    row("s4", { hw: { state: "excused" }, paper: { state: "excused" } }),
    row("s5", { hw: { state: "zero", percent: 0, display: 0 }, paper: { state: "missingSource" } }),
    row("s6", { hw: { state: "missing" }, paper: { state: "unclassified" } })
  ],
  entries: { paper: { s1: { score: 10 }, s4: { decision: "excused" } }, hw: { s4: { decision: "excused" }, s5: { decision: "zero" } } },
  ...over
});
const ALL = ["s1", "s2", "s3", "s4", "s5", "s6"];
const decisions = (d: EntriesDraft) => Object.fromEntries(Object.entries(d).map(([k, e]) => [k, e.decision]));

describe("GB5 — the column actions touch only the students who have nothing", () => {
  it("«اعتبار غير المسلِّمين صفرًا» on an assignment: only «missing» cells; never graded, pending, excused or zero", () => {
    const d = applyColumnAction({}, GB(), "hw", ALL, "zeroMissing");
    expect(decisions(d)).toEqual({ "hw/s3": "zero", "hw/s6": "zero" });
  });
  it("on a manual column: a stored or unsaved typed score is never replaced; a missing source or an unclassified cell is left alone", () => {
    let d = setScoreText({}, GB(), "paper", "s3", "15");               // typed, not saved yet
    d = applyColumnAction(d, GB(), "paper", ALL, "zeroMissing");
    expect(d["paper/s3"]).toMatchObject({ decision: null, scoreText: "15" });
    expect(decisions(d)).toEqual({ "paper/s2": "zero", "paper/s3": null });   // s1 stored 10, s4 excused, s5 source gone, s6 unclassified
  });
  it("an unsaved decision the teacher just chose is never replaced by a column action («معفى» stays «معفى»)", () => {
    let d = setDecision({}, GB(), "hw", "s3", "excused");
    d = applyColumnAction(d, GB(), "hw", ALL, "zeroMissing");
    expect(decisions(d)).toEqual({ "hw/s3": "excused", "hw/s6": "zero" });
    d = applyColumnAction(setDecision({}, GB(), "hw", "s6", "zero"), GB(), "hw", ALL, "excuseMissing");
    expect(decisions(d)).toEqual({ "hw/s6": "zero", "hw/s3": "excused" });
  });
  it("only the shown students (the filter) are touched", () => {
    expect(Object.keys(applyColumnAction({}, GB(), "hw", ["s1", "s3"], "zeroMissing"))).toEqual(["hw/s3"]);
  });
  it("«إعفاء غير المسلِّمين» marks the same cells excused; «مسح قرارات العمود» clears decisions (stored ones become a clearing edit)", () => {
    expect(decisions(applyColumnAction({}, GB(), "hw", ALL, "excuseMissing"))).toEqual({ "hw/s3": "excused", "hw/s6": "excused" });
    const cleared = applyColumnAction({}, GB(), "hw", ALL, "clearDecisions");
    expect(toItems(cleared, GB())).toEqual([
      { itemId: "hw", studentId: "s4", expected: { decision: "excused" }, value: null },
      { itemId: "hw", studentId: "s5", expected: { decision: "zero" }, value: null }
    ]);
  });
});

describe("GB5 — edits", () => {
  it("stored values are read as values only; an edit returning to the stored value disappears", () => {
    expect(storedValue(GB(), "paper", "s1")).toEqual({ score: 10 });
    expect(storedValue(GB(), "hw", "s1")).toBeNull();
    let d = setDecision({}, GB(), "hw", "s3", "zero");
    expect(Object.keys(d)).toEqual(["hw/s3"]);
    d = setDecision(d, GB(), "hw", "s3", null);
    expect(d).toEqual({});
    expect(setScoreText(setScoreText({}, GB(), "paper", "s1", "12"), GB(), "paper", "s1", "10")).toEqual({});
  });
  it("typed scores: Arabic digits, two decimals, 0..max; an invalid one blocks the save and is not sent", () => {
    expect(parseScore("١٢٫٥", 20)).toBe(12.5);
    for (const bad of ["21", "-1", "1.234", "abc", "١٢,٥٥٥"]) expect(parseScore(bad, 20)).toBeNull();
    const d = setScoreText(setScoreText({}, GB(), "paper", "s2", "25"), GB(), "paper", "s3", "٧");
    expect(invalidEdits(d, GB())).toEqual(["paper/s2"]);
    expect(toItems(d, GB())).toEqual([{ itemId: "paper", studentId: "s3", expected: null, value: { score: 7 } }]);
  });
  it("a score is typed only in a manual column; a decision wins over a typed score", () => {
    expect(setScoreText({}, GB(), "hw", "s3", "5")).toEqual({});
    const d = setDecision(setScoreText({}, GB(), "paper", "s2", "15"), GB(), "paper", "s2", "excused");
    expect(toItems(d, GB())).toEqual([{ itemId: "paper", studentId: "s2", expected: null, value: { decision: "excused" } }]);
  });
  it("clearing a stored score sends null over the stored value", () => {
    expect(toItems(setScoreText({}, GB(), "paper", "s1", " "), GB())).toEqual([{ itemId: "paper", studentId: "s1", expected: { score: 10 }, value: null }]);
  });
});

describe("GB5 — after a save", () => {
  it("applied edits leave the draft", () => {
    const d = setDecision(setDecision({}, GB(), "hw", "s3", "zero"), GB(), "hw", "s6", "excused");
    expect(Object.keys(afterSave(d, [{ itemId: "hw", studentId: "s3" }], []))).toEqual(["hw/s6"]);
  });
  it("a cell changed elsewhere keeps the teacher's value, now over the server's (shown); one already holding the wish disappears", () => {
    const d = setDecision(setDecision({}, GB(), "hw", "s3", "zero"), GB(), "hw", "s6", "excused");
    const fresh = GB({ entries: { hw: { s3: { decision: "excused" }, s6: { decision: "excused" } } } });
    const r = rebase(d, fresh);
    expect(Object.keys(r)).toEqual(["hw/s3"]);
    expect(r["hw/s3"]).toMatchObject({ decision: "zero", expected: { decision: "excused" }, stale: { decision: "excused" } });
    expect(toItems(r, fresh)).toEqual([{ itemId: "hw", studentId: "s3", expected: { decision: "excused" }, value: { decision: "zero" } }]);
    expect(valueText({ decision: "excused" })).toBe("معفى");
    expect(valueText({ score: 12 }, 20)).toBe("12 من 20");
  });
  it("an unchanged cell keeps its edit untouched", () => {
    const d = setDecision({}, GB(), "hw", "s3", "zero");
    expect(rebase(d, GB())).toEqual(d);
    expect(currentEdit(d, GB(), "hw", "s3").expected).toBeNull();
    expect(cellKey("a", "b")).toBe("a/b");
  });
});
