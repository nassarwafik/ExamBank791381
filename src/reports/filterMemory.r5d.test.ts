// @vitest-environment happy-dom
// Phase R-5d — what the Reports Center remembers on this device (filterMemory.ts): ids and a period key only, validated on read.
import { describe, it, expect } from "vitest";
import { readRememberedFilters, rememberFilters, activeFilterChips, REMEMBER_KEY } from "./filterMemory";

const KEY = "examBankViewPref:" + REMEMBER_KEY;
const NOTHING = { schoolYear: "", classId: "", projectCode: "", period: "all" };

describe("R-5d filter memory", () => {
  it("round-trips the year, class, project and a fixed period", () => {
    rememberFilters({ schoolYear: "2025-2026", classId: "c1", projectCode: "794589", period: "30" });
    expect(readRememberedFilters()).toEqual({ schoolYear: "2025-2026", classId: "c1", projectCode: "794589", period: "30" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ schoolYear: "2025-2026", classId: "c1", projectCode: "794589", period: "30" });   // exactly these four keys
  });
  it("a custom period is stored as «كل الفترة»; nothing chosen removes the key", () => {
    rememberFilters({ schoolYear: "", classId: "c1", projectCode: "", period: "custom" });
    expect(readRememberedFilters().period).toBe("all");
    rememberFilters({ schoolYear: "", classId: "", projectCode: "", period: "custom" });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(readRememberedFilters()).toEqual(NOTHING);
  });
  it("anything unreadable or of the wrong shape is ignored — the default, never a crash", () => {
    for (const raw of ["not json", "null", "[]", "7", JSON.stringify({ classId: 5, schoolYear: { a: 1 }, period: "custom" }), JSON.stringify({ classId: "x".repeat(500) })]) {
      localStorage.setItem(KEY, raw);
      expect(readRememberedFilters()).toEqual(NOTHING);
    }
    localStorage.setItem(KEY, JSON.stringify({ classId: "c9", period: "90", studentId: "s1", from: "2026-01-01" }));
    expect(readRememberedFilters()).toEqual({ schoolYear: "", classId: "c9", projectCode: "", period: "all" });   // unknown period → all; extra keys dropped
  });
  it("activeFilterChips: only the filters with a value, in the filter bar's order", () => {
    expect(activeFilterChips({ schoolYear: "2025-2026", project: "", className: "الحادي عشر", student: "", period: "آخر 30 يومًا" })).toEqual([
      { key: "schoolYear", label: "السنة الدراسية", value: "2025-2026" }, { key: "class", label: "الصف", value: "الحادي عشر" }, { key: "period", label: "الفترة", value: "آخر 30 يومًا" }
    ]);
    expect(activeFilterChips({ schoolYear: "", project: "", className: "", student: "", period: "" })).toEqual([]);
  });
});
