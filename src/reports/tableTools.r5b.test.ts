// Phase R-5b — the pure logic of the interactive tables (tableTools.ts): ordering, the header click cycle and name search.
// The rule that matters: a cell with no final number is EMPTY and sorts last in BOTH directions — never as a 0.
import { describe, it, expect } from "vitest";
import { sortRows, nextSort, ariaSort, normalizeSearch, matchesQuery } from "./tableTools";

type Row = { name: string; v: number | null | undefined };
const rows: Row[] = [{ name: "أ", v: 40 }, { name: "ب", v: null }, { name: "ج", v: 90 }, { name: "د", v: 0 }, { name: "هـ", v: undefined }, { name: "و", v: 40 }];
const names = (r: Row[]) => r.map(x => x.name).join("");

describe("R-5b sortRows", () => {
  it("numbers: descending and ascending; rows with no value stay LAST in both, in their original order", () => {
    expect(names(sortRows(rows, r => r.v, "desc"))).toBe("جأودبهـ");
    expect(names(sortRows(rows, r => r.v, "asc"))).toBe("دأوجبهـ");        // the real 0 is first; «no result» is not below it
  });
  it("is stable (equal values keep their order) and never mutates its input", () => {
    const before = names(rows);
    sortRows(rows, r => r.v, "desc");
    expect(names(rows)).toBe(before);
    expect(names(sortRows([{ name: "1", v: 5 }, { name: "2", v: 5 }, { name: "3", v: 5 }], r => r.v, "desc"))).toBe("123");
  });
  it("text: Arabic collation, digits inside names compared as numbers; empty text last", () => {
    const t = [{ name: "سعد", v: 1 }, { name: "", v: 1 }, { name: "أحمد", v: 1 }, { name: "خالد", v: 1 }];
    expect(sortRows(t, r => r.name, "asc").map(r => r.name)).toEqual(["أحمد", "خالد", "سعد", ""]);
    expect(sortRows(t, r => r.name, "desc").map(r => r.name)).toEqual(["سعد", "خالد", "أحمد", ""]);
    expect(sortRows([{ name: "B10", v: 1 }, { name: "B2", v: 1 }], r => r.name, "asc").map(r => r.name)).toEqual(["B2", "B10"]);
  });
  it("NaN and Infinity are empty too (never ordered as numbers)", () => {
    expect(sortRows([{ name: "x", v: Number.NaN }, { name: "y", v: 3 }, { name: "z", v: Infinity }], r => r.v, "asc").map(r => r.name)).toEqual(["y", "x", "z"]);
  });
});

describe("R-5b nextSort / ariaSort", () => {
  it("a numeric column: highest first, then reversed, then the original order", () => {
    const a = nextSort(null, "avg", true), b = nextSort(a, "avg", true), c = nextSort(b, "avg", true);
    expect([a, b, c]).toEqual([{ key: "avg", dir: "desc" }, { key: "avg", dir: "asc" }, null]);
  });
  it("a text column: A→Z first; another column starts its own cycle", () => {
    const a = nextSort(null, "name", false);
    expect(a).toEqual({ key: "name", dir: "asc" });
    expect(nextSort(a, "avg", true)).toEqual({ key: "avg", dir: "desc" });
    expect(nextSort(nextSort(a, "name", false), "name", false)).toBeNull();
  });
  it("ariaSort names the order of the sorted column only", () => {
    expect([ariaSort({ key: "a", dir: "asc" }, "a"), ariaSort({ key: "a", dir: "desc" }, "a"), ariaSort({ key: "a", dir: "asc" }, "b"), ariaSort(null, "a")]).toEqual(["ascending", "descending", "none", "none"]);
  });
});

describe("R-5b search", () => {
  it("normalizeSearch: hamza forms, diacritics, tatweel, taa-marbuta / alef-maqsura, case and spaces", () => {
    expect(normalizeSearch("  أَحْمَـد  ")).toBe("احمد");
    expect(normalizeSearch("إيمان")).toBe(normalizeSearch("ايمان"));
    expect(normalizeSearch("فاطمة")).toBe(normalizeSearch("فاطمه"));
    expect(normalizeSearch("مصطفى")).toBe(normalizeSearch("مصطفي"));
    expect(normalizeSearch("Packet   TRACER")).toBe("packet tracer");
  });
  it("matchesQuery: every word of the query, in any order; an empty query matches everything", () => {
    expect(matchesQuery("أحمد الحسن", "احمد")).toBe(true);
    expect(matchesQuery("أحمد الحسن", "الحسن احمد")).toBe(true);
    expect(matchesQuery("أحمد الحسن", "احمد علي")).toBe(false);
    expect(matchesQuery("أحمد الحسن", "   ")).toBe(true);
    expect(matchesQuery("", "احمد")).toBe(false);
  });
});
