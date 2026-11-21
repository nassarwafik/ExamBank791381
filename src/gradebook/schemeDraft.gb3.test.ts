// Class gradebook GB3 — the scheme builder's draft model (docs/enterprise-class-gradebook-gb.md §4.2, §4.6): weights typed as text
// (Arabic digits accepted), «توزيع بالتساوي», the guidance that mirrors the server's rules, and the payload the server receives.
import { describe, it, expect } from "vitest";
import {
  parseWeight, normalizeDigits, equalWeights, emptyDraft, fromScheme, addCategory, setCategoryTitle, setCategoryWeight, addItem, setItemWeight,
  removeItem, moveItem, equalizeCategories, equalizeItems, summarize, toPayload, isDirty, newId, type Draft
} from "./schemeDraft";
import type { GbScheme } from "./types";

const a = (assignmentId: string) => ({ kind: "assignment" as const, assignmentId });
/** Builds a draft: [title, weight, [ [source, weight], … ]] per category. */
function build(spec: [string, string, [ReturnType<typeof a> | { kind: "manual"; title: string; maxScore: number } | { kind: "project"; projectCode: string }, string][]][]): Draft {
  let d = emptyDraft();
  for (const [title, weight, items] of spec) {
    d = addCategory(d);
    const key = d.categories[d.categories.length - 1].key;
    d = setCategoryWeight(setCategoryTitle(d, key, title), key, weight);
    for (const [source, w] of items) {
      d = addItem(d, key, source);
      const c = d.categories.find(x => x.key === key)!;
      d = setItemWeight(d, key, c.items[c.items.length - 1].key, w);
    }
  }
  return d;
}
// The owner's example (three parts, five items each).
const OWNER = (): Draft => build([
  ["علامة الشهري", "20", [[a("m1"), "10"], [a("m2"), "15"], [a("m3"), "25"], [a("m4"), "25"], [a("m5"), "25"]]],
  ["علامة الفصل 1", "40", [[a("f1"), "20"], [a("f2"), "10"], [a("f3"), "15"], [a("f4"), "30"], [a("f5"), "25"]]],
  ["علامة الفصل 2", "40", [[a("s1"), "5"], [a("s2"), "15"], [a("s3"), "25"], [a("s4"), "25"], [a("s5"), "30"]]]
]);

describe("GB3 — weights as typed text", () => {
  it("Arabic-Indic digits and «٫» / «,» decimals are accepted", () => {
    expect(normalizeDigits("٢٥٫٥")).toBe("25.5");
    expect(normalizeDigits("۱۲,۲۵")).toBe("12.25");
    expect(parseWeight("٢٥")).toBe(25);
    expect(parseWeight(" 33.33 ")).toBe(33.33);
  });
  it("(0, 100], two decimals at most, never coerced", () => {
    for (const bad of ["", "0", "-5", "100.01", "12.345", "abc", "1e2", "12.", ".5", "١٠١"]) expect(parseWeight(bad)).toBeNull();
    for (const [t, n] of [["0.01", 0.01], ["100", 100], ["12.5", 12.5]] as const) expect(parseWeight(t)).toBe(n);
  });
  it("«توزيع بالتساوي» gives hundredths that add up to exactly 100", () => {
    expect(equalWeights(3)).toEqual(["33.34", "33.33", "33.33"]);
    expect(equalWeights(4)).toEqual(["25", "25", "25", "25"]);
    expect(equalWeights(7).reduce((s, w) => s + Math.round(Number(w) * 100), 0)).toBe(10000);
    expect(equalWeights(0)).toEqual([]);
  });
  it("new ids are in the server's safe-id alphabet and distinct", () => {
    const ids = Array.from({ length: 200 }, (_, i) => newId(i % 2 ? "c" : "i"));
    expect(ids.every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("GB3 — the guidance (mirrors the server; the server decides)", () => {
  it("the owner's example is complete: every sum is 100, nothing blocks the save", () => {
    const s = summarize(OWNER());
    expect(s.blocking).toEqual([]);
    expect(s.categoryTotal).toBe(100);
    expect(s.complete).toBe(true);
  });
  it("sums that are not 100 never block the save: the scheme is saved as a draft", () => {
    const d = build([["الشهري", "20", [[a("m1"), "50"]]], ["الفصل", "70", [[a("f1"), "100"]]]]);
    const s = summarize(d);
    expect(s.blocking).toEqual([]);
    expect(s.complete).toBe(false);
    expect(s.categoryTotal).toBe(90);
    expect(Object.values(s.perCategory).map(x => [x.total, x.ok])).toEqual([[50, false], [100, true]]);
  });
  it("structural problems block: no part, an untitled part, an invalid weight, an empty part, a source used twice, a bad manual column", () => {
    expect(summarize(emptyDraft()).blocking.map(x => x.at)).toEqual(["scheme"]);
    const d = build([["", "50", [[a("m1"), "100"]]], ["ب", "x", []], ["ج", "50", [[a("m1"), "abc"], [{ kind: "manual", title: " ", maxScore: 0 }, "10"]]]]);
    const messages = summarize(d).blocking.map(x => x.message).join(" | ");
    expect(messages).toContain("اكتب عنوان القسم");
    expect(messages).toContain("نسبة «ب»");
    expect(messages).toContain("أضف عنصرًا واحدًا على الأقل إلى «ب»");
    expect(messages).toContain("مستخدم مرة أخرى");
    expect(messages).toContain("وزن كل عنصر في «ج»");
    expect(messages).toContain("عنوان العلامة التي يرصدها المعلم مطلوب");
    expect(messages).toContain("العلامة القصوى للعلامة التي يرصدها المعلم");
  });
  it("an unparseable weight leaves its total unknown, never a guessed number", () => {
    const d = build([["أ", "100", [[a("m1"), "50"], [a("m2"), "؟"]]]]);
    expect(Object.values(summarize(d).perCategory)[0]).toEqual({ total: null, ok: false });
  });
});

describe("GB3 — editing", () => {
  it("equalize the parts and the items of one part", () => {
    let d = build([["أ", "", [[a("m1"), ""], [a("m2"), ""], [a("m3"), ""]]], ["ب", "", [[a("f1"), ""]]], ["ج", "", [[a("s1"), ""]]]]);
    d = equalizeCategories(d);
    expect(d.categories.map(c => c.weightText)).toEqual(["33.34", "33.33", "33.33"]);
    d = equalizeItems(d, d.categories[0].key);
    expect(d.categories[0].items.map(i => i.weightText)).toEqual(["33.34", "33.33", "33.33"]);
    expect(d.categories[1].items[0].weightText).toBe("");                          // other parts untouched
    expect(summarize(d).perCategory[d.categories[0].key]).toEqual({ total: 100, ok: true });
  });
  it("move and remove items", () => {
    let d = build([["أ", "100", [[a("m1"), "40"], [a("m2"), "60"]]]]);
    const [k, [i1, i2]] = [d.categories[0].key, d.categories[0].items.map(i => i.key)];
    d = moveItem(d, k, i2, -1);
    expect(d.categories[0].items.map(i => i.key)).toEqual([i2, i1]);
    expect(moveItem(d, k, i2, -1)).toEqual(d);                                     // already first: unchanged
    d = removeItem(d, k, i2);
    expect(d.categories[0].items.map(i => i.key)).toEqual([i1]);
  });
});

describe("GB3 — the payload and the round trip", () => {
  it("the payload carries numbers, trimmed titles and the ids", () => {
    const d = build([["  الشهري  ", "٢٠", [[a("m1"), "100"]]], ["الفصل", "80", [[{ kind: "manual", title: "  ورقي ", maxScore: 20 }, "100"]]]]);
    const p = toPayload(d);
    expect(p.categories.map(c => [c.title, c.weight])).toEqual([["الشهري", 20], ["الفصل", 80]]);
    expect(p.categories[1].items[0].source).toEqual({ kind: "manual", title: "ورقي", maxScore: 20 });
    expect(p.categories.every(c => /^c_/.test(c.categoryId) && c.items.every(i => /^i_/.test(i.itemId)))).toBe(true);
  });
  it("a stored scheme opens unchanged (not dirty); any edit makes it dirty; editing back makes it clean again", () => {
    const stored: GbScheme = { revision: 3, updatedAt: "", categories: [{ categoryId: "c1", title: "الكل", weight: 100, items: [{ itemId: "i1", weight: 33.33, source: a("m1") }, { itemId: "i2", weight: 66.67, source: a("m2") }] }] };
    const original = fromScheme(stored);
    expect(original.categories[0].items.map(i => i.weightText)).toEqual(["33.33", "66.67"]);
    expect(toPayload(original)).toEqual({ categories: stored.categories });
    const edited = setItemWeight(original, original.categories[0].key, original.categories[0].items[0].key, "30");
    expect(isDirty(edited, original)).toBe(true);
    expect(isDirty(setItemWeight(edited, original.categories[0].key, original.categories[0].items[0].key, "33.33"), original)).toBe(false);
    expect(isDirty(fromScheme(null), emptyDraft())).toBe(false);
  });
});
