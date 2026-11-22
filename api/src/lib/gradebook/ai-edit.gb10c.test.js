// Class gradebook GB10c (docs/enterprise-class-gradebook-gb.md §4.12) — «تعديل المخطط الحالي», PURE: the draft the page sends, the handles
// the model is shown (never a key or an id), the operations judged in order against a simulation of the draft, answered by the draft's
// own keys, and the defence-in-depth check on what an operation adds. TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ai = require("./ai-proposal.js");
const edit = require("./ai-edit.js");

const SOURCES = {
  assignments: [
    { assignmentId: "as_exam3", title: "امتحان 3", totalMarks: 30, publishedAt: "2026-10-20" },
    { assignmentId: "as_exam2", title: "امتحان 2", totalMarks: 30, publishedAt: "2026-10-10" },
    { assignmentId: "as_exam1", title: "امتحان 1", totalMarks: 30, publishedAt: "2026-10-01" },
    { assignmentId: "as_hw1", title: "الوظيفة 1", totalMarks: 10, publishedAt: "2026-09-10" }
  ],
  projects: []
};
const refs = ai.buildSourceRefs(SOURCES);    // A1 الوظيفة 1 · A2 امتحان 1 · A3 امتحان 2 · A4 امتحان 3
const CURRENT = {
  categories: [
    { key: "k1", title: "الشهري", weight: 40, items: [
      { key: "k2", weight: 50, source: { kind: "assignment", assignmentId: "as_hw1" } },
      { key: "k3", weight: 50, source: { kind: "assignment", assignmentId: "as_exam1" } }
    ] },
    { key: "k4", title: "الفصل", weight: 60, items: [
      { key: "k5", weight: 70, source: { kind: "assignment", assignmentId: "as_gone" } },
      { key: "k6", weight: 30, source: { kind: "manual", title: "الحضور", maxScore: 10 } }
    ] }
  ]
};
const current = edit.readCurrent(CURRENT);
const handles = edit.buildEditHandles(current, refs);
const op = (o, extra = {}) => ({ op: o, category: "", item: "", title: "", ref: "", manualTitle: "", manualMaxScore: null, weight: null, weightSource: "stated", mention: o, ...extra });
const run = (operations, extra = {}) => edit.normalizeAiEdit({ operations, unmatched: [], assumptions: [], ...extra }, refs, handles, current);
const context = { classId: "c1", assignments: new Map(SOURCES.assignments.map(a => [a.assignmentId, { ...a, classId: "c1", status: "published" }])), projectCodes: [] };

describe("GB10c — the draft the page sends", () => {
  it("is read when well-formed; refused when a key repeats or is unsafe, a weight is invalid, a source is malformed, or the limits are passed", () => {
    expect(current.categories.map(c => [c.key, c.title, c.weight, c.items.map(i => i.key)])).toEqual([["k1", "الشهري", 40, ["k2", "k3"]], ["k4", "الفصل", 60, ["k5", "k6"]]]);
    const bad = mutate => { const c = JSON.parse(JSON.stringify(CURRENT)); mutate(c); return edit.readCurrent(c); };
    expect(bad(c => { c.categories[1].key = "k1"; })).toBeNull();
    expect(bad(c => { c.categories[0].items[0].key = "../x"; })).toBeNull();
    expect(bad(c => { c.categories[0].weight = 33.333; })).toBeNull();
    expect(bad(c => { c.categories[0].items[0].source = { kind: "manual", title: "x", maxScore: 0 }; })).toBeNull();
    expect(bad(c => { c.categories = Array.from({ length: 11 }, (_, i) => ({ key: "c" + i, title: "ق", weight: null, items: [] })); })).toBeNull();
    expect(bad(c => { c.categories = []; })).toBeNull();
    expect(edit.readCurrent(null)).toBeNull();
    expect(bad(c => { c.categories[0].weight = null; c.categories[0].items[0].weight = null; })).not.toBeNull();   // empty weights are a draft
  });
  it("the model sees the draft by handles: parts K…, columns by their source's reference, M… for a manual one, U… for a source the class no longer offers — never a key or an id", () => {
    expect(handles.lines).toEqual([
      "K1 | الشهري | 40% من العلامة النهائية", "  - A1 | الوظيفة 1 | 50%", "  - A2 | امتحان 1 | 50%",
      "K2 | الفصل | 60% من العلامة النهائية", "  - U1 | مصدر غير متاح | 70%", "  - M1 | الحضور (علامة يرصدها المعلم من 10) | 30%"
    ]);
    const prompt = edit.buildAiEditPrompt("اجعل الفصل 50%", refs, handles);
    for (const secret of ["k1", "k2", "k5", "as_hw1", "as_gone", "as_exam3"]) expect(prompt).not.toMatch(new RegExp("\\b" + secret + "\\b"));
    expect(prompt).toContain("A4 | واجب أو امتحان | امتحان 3");
    expect(prompt).toContain("<<<\nاجعل الفصل 50%\n>>>");
  });
  it("the schema is strict-mode ready", () => {
    const walk = s => {
      if (!s || typeof s !== "object") return;
      if (s.type === "object") { expect(s.additionalProperties).toBe(false); expect([...s.required].sort()).toEqual(Object.keys(s.properties).sort()); }
      for (const v of Object.values(s)) { if (Array.isArray(v)) v.forEach(walk); else walk(v); }
    };
    walk(edit.buildAiEditSchema());
  });
});

describe("GB10c — the operations, judged in order and answered by the draft's own keys", () => {
  it("a stated weight is kept as it is (the sum may leave 100); the change says from and to", () => {
    const r = run([op("setCategoryWeight", { category: "K2", weight: 50 })]);
    expect(r.edit.ops).toEqual([{ op: "setCategoryWeight", categoryKey: "k4", weight: 50 }]);
    expect(r.edit.changes).toEqual(["نسبة «الفصل» من العلامة النهائية: من 60% إلى 50%."]);
  });
  it("add an exam to a part, remove a column, reweigh one, rename a part, equalize — every existing column keeps its key", () => {
    const r = run([
      op("addItem", { category: "K1", ref: "A3", weight: 20 }),
      op("removeItem", { category: "K2", item: "U1" }),
      op("setItemWeight", { category: "K2", item: "M1", weight: 100 }),
      op("renameCategory", { category: "K1", title: "علامة الشهري" }),
      op("equalizeItems", { category: "K1" })
    ]);
    expect(r.edit.ops).toEqual([
      { op: "addItem", categoryKey: "k1", source: { kind: "assignment", assignmentId: "as_exam2" }, weight: 20 },
      { op: "removeItem", categoryKey: "k4", itemKey: "k5" },
      { op: "setItemWeight", categoryKey: "k4", itemKey: "k6", weight: 100 },
      { op: "renameCategory", categoryKey: "k1", title: "علامة الشهري" },
      { op: "equalizeItems", categoryKey: "k1" }
    ]);
    expect(r.edit.changes).toEqual([
      "إضافة «امتحان 2» إلى «الشهري» بوزن 20%.", "إزالة «مصدر غير متاح» من «الفصل».", "وزن «الحضور (علامة يرصدها المعلم من 10)» في «الفصل»: من 30% إلى 100%.",
      "إعادة تسمية «الشهري» إلى «علامة الشهري».", "توزيع أوزان «علامة الشهري» بالتساوي."
    ]);
    expect(r.edit.unmatched).toEqual([]);
  });
  it("a new part is referred to as N1 by the later operations and gets a new key; equalizing the parts is an operation, never arithmetic", () => {
    const r = run([op("addCategory", { title: "المشاركة", weight: null }), op("addItem", { category: "N1", manualTitle: "المشاركة الصفية", manualMaxScore: 5, weight: 100 }), op("equalizeCategories")]);
    expect(r.edit.ops).toEqual([
      { op: "addCategory", categoryKey: "new_1", title: "المشاركة", weight: null },
      { op: "addItem", categoryKey: "new_1", source: { kind: "manual", title: "المشاركة الصفية", maxScore: 5 }, weight: 100 },
      { op: "equalizeCategories" }
    ]);
    expect(r.edit.changes[0]).toBe("قسم جديد «المشاركة» بلا نسبة؛ اكتبها.");
  });
  it("an invented reference, a source already used, an unknown part or column, an invalid weight and a missing manual maximum are each refused and listed", () => {
    const r = run([
      op("addItem", { category: "K1", ref: "A9", mention: "امتحان 9" }),
      op("addItem", { category: "K2", ref: "A1", mention: "الوظيفة 1" }),
      op("setCategoryWeight", { category: "K7", weight: 10, mention: "قسم غير موجود" }),
      op("removeItem", { category: "K1", item: "M1", mention: "الحضور" }),
      op("setItemWeight", { category: "K1", item: "A1", weight: 0 }),
      op("addItem", { category: "K2", manualTitle: "امتحان شفوي", manualMaxScore: null }),
      op("explode")
    ]);
    expect(r.edit.ops).toEqual([]);
    expect(r.edit.unmatched.map(u => [u.title, u.code])).toEqual([
      ["امتحان 9", "UNKNOWN_SOURCE"], ["الوظيفة 1", "DUPLICATE"], ["قسم غير موجود", "CATEGORY_NOT_FOUND"], ["الحضور", "ITEM_NOT_FOUND"],
      ["الوظيفة 1", "WEIGHT_INVALID"], ["امتحان شفوي", "MANUAL_MAX_MISSING"], ["explode", "UNKNOWN_OPERATION"]
    ]);
  });
  it("the order counts: a column freed by a removal can be added elsewhere; a removed part cannot be edited afterwards", () => {
    const r = run([op("removeItem", { category: "K1", item: "A1" }), op("addItem", { category: "K2", ref: "A1", weight: 10 }), op("removeCategory", { category: "K1" }), op("renameCategory", { category: "K1", title: "س" })]);
    expect(r.edit.ops.map(o => o.op)).toEqual(["removeItem", "addItem", "removeCategory"]);
    expect(r.edit.unmatched.map(u => u.code)).toEqual(["CATEGORY_NOT_FOUND"]);
  });
  it("no operation and nothing listed → AI_NO_CHANGE; not an object → AI_RESPONSE_MALFORMED; the model's own «not found» keeps the candidates' titles only", () => {
    expect(run([])).toMatchObject({ ok: false, code: "AI_NO_CHANGE" });
    expect(edit.normalizeAiEdit("x", refs, handles, current)).toMatchObject({ ok: false, code: "AI_RESPONSE_MALFORMED" });
    const r = run([], { unmatched: [{ category: "الشهري", mention: "امتحان 4", candidates: ["A4", "A99"] }] });
    expect(r.edit.unmatched).toEqual([expect.objectContaining({ title: "امتحان 4", code: "NOT_FOUND", candidates: ["امتحان 3"] })]);
  });
  it("an operation never carries an id the model wrote: only the draft's keys and the class's resolved sources", () => {
    const r = run([op("removeItem", { category: "K1", item: "k2" }), op("addItem", { category: "K1", ref: "as_exam3", weight: 10 })]);
    expect(r.edit.ops).toEqual([]);
    expect(r.edit.unmatched.map(u => u.code)).toEqual(["ITEM_NOT_FOUND", "UNKNOWN_SOURCE"]);
  });
});

describe("GB10c — the builder's limits hold for the operations", () => {
  it("a scheme with ten parts cannot get an eleventh (TOO_MANY_CATEGORIES); removing one first makes room", () => {
    const ten = edit.readCurrent({ categories: Array.from({ length: 10 }, (_, i) => ({ key: "c" + i, title: "ق" + i, weight: 10, items: [] })) });
    const h = edit.buildEditHandles(ten, refs);
    const r = edit.normalizeAiEdit({ operations: [op("addCategory", { title: "جديد", weight: 5 })], unmatched: [], assumptions: [] }, refs, h, ten);
    expect(r.edit.ops).toEqual([]);
    expect(r.edit.unmatched.map(u => u.code)).toEqual(["TOO_MANY_CATEGORIES"]);
    const ok = edit.normalizeAiEdit({ operations: [op("removeCategory", { category: "K10" }), op("addCategory", { title: "جديد", weight: 10 })], unmatched: [], assumptions: [] }, refs, h, ten);
    expect(ok.edit.ops.map(o => o.op)).toEqual(["removeCategory", "addCategory"]);
  });
});

describe("GB10c — defence in depth on what an operation adds", () => {
  it("added columns from this class pass the server's own validator; one that is not this class's fails it", () => {
    const r = run([op("addItem", { category: "K1", ref: "A4", weight: 10 })]);
    expect(edit.addedAreSaveable(r.result, context)).toBe(true);
    const foreign = r.result.map(c => ({ ...c, items: c.items.map(i => (i.key === null ? { ...i, source: { kind: "assignment", assignmentId: "as_other" } } : i)) }));
    expect(edit.addedAreSaveable(foreign, context)).toBe(false);
    expect(edit.addedAreSaveable(run([op("equalizeCategories")]).result, context)).toBe(true);   // nothing added: nothing to judge
  });
});
