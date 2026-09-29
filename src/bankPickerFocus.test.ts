import { describe, it, expect } from "vitest";
import * as FOCUS from "./bankPickerFocus";
import type { CoverageItem } from "./assessmentBlueprintCoverage";

// Phase 13C-B — F7 (pure): a coverage row → an EXACT bank filter, or nothing. Never fuzzy, never guessed.
const item = (over: Partial<CoverageItem>): CoverageItem => ({ id: "c", kind: "constraint", refLabel: "x", metric: "count", unit: "absolute", actual: 0, count: 0, weightMarks: 0, officialMarks: 0, relation: "below-target", issues: [], delta: null, shortfall: null, excess: null, evidence: [], ...over } as CoverageItem);

describe("bankFocusForCoverageItem", () => {
  it("topic → exact topic id (never the label); difficulty 1..5 → exact difficulty; engine question type → exact bank presentation type", () => {
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING", refLabel: "عنونة IPv4" }))).toEqual({ topic: "IP_ADDRESSING" });
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "difficulty", ref: "3" }))).toEqual({ difficulty: 3 });
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "questionType", ref: "multipleChoice" }))).toEqual({ presentationType: "multipleChoice" });
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "questionType", ref: "fillBlank" }))).toEqual({ presentationType: "fillBlank" });
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "questionType", ref: "wordBank" }))).toEqual({ presentationType: "wordBank" });
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "questionType", ref: "shortAnswer" }))).toEqual({ presentationType: "open" });   // the documented 13B bridge, not a guess
  });
  it("unsupported dimensions and values have NO bank action: objective, cognitive level, capability, section, totals, out-of-scale difficulty, unbridged types, unassessable rows", () => {
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "objective", ref: "o1" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "cognitiveLevel", ref: "apply" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "capability", ref: "cli" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "section", ref: "s1" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ kind: "total-questions" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "difficulty", ref: "7" }))).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "difficulty", ref: "2.5" }))).toBeNull();
    for (const t of ["cliFill", "compound", "multiTrueFalse", "ordering", "tableFill", "matching", "trueFalse"]) expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "questionType", ref: t })), t).toBeNull();
    expect(FOCUS.bankFocusForCoverageItem(item({ dimension: "topic", ref: "IP_ADDRESSING", relation: "unassessable" }))).toBeNull();
  });
  it("bankFiltersFromFocus prefills exactly the focused filter and nothing else", () => {
    expect(FOCUS.bankFiltersFromFocus({ topic: "IP_ADDRESSING" })).toEqual({ q: "", section: "", type: "", difficulty: "", source: "", topic: "IP_ADDRESSING" });
    expect(FOCUS.bankFiltersFromFocus({ difficulty: 3 })).toEqual({ q: "", section: "", type: "", difficulty: "3", source: "", topic: "" });
    expect(FOCUS.bankFiltersFromFocus({ presentationType: "open" })).toEqual({ q: "", section: "", type: "open", difficulty: "", source: "", topic: "" });
    expect(FOCUS.bankFiltersFromFocus(undefined)).toEqual({ q: "", section: "", type: "", difficulty: "", source: "", topic: "" });
  });
});
