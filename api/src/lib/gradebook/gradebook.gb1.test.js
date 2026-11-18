// Class gradebook GB1 (docs/enterprise-class-gradebook-gb.md §4.2–§4.4, §4.7) — scheme validation, evidence classification and the one
// computation. The owner's example (three categories, five items each) is worked by hand in §4.4 and pinned here.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

const cjs = createRequire(import.meta.url);
const { validateScheme, sumIssues, LIMITS } = cjs("./scheme.js");
const { assignmentEvidence, projectEvidence, manualEvidence } = cjs("./evidence.js");
const { computeGradebook, roundForDisplay } = cjs("./compute.js");

// ---------------------------------------------------------------------------------------------------------------- fixtures
const CLASS = "c1";
const published = id => ({ assignmentId: id, classId: CLASS, status: "published" });
const ASSIGNMENT_IDS = ["m1", "m2", "m3", "m4", "m5", "f1", "f2", "f3", "f4", "f5", "s1", "s2", "s3", "s4", "s5"];
const context = (extra = []) => ({ classId: CLASS, assignments: new Map([...ASSIGNMENT_IDS, ...extra].map(id => [id, published(id)])), projectCodes: ["794589"] });
const item = (itemId, weight, source) => ({ itemId, weight, source: source || { kind: "assignment", assignmentId: itemId } });

// The owner's example: الشهري 20 (10/15/25/25/25), الفصل 1 40 (20/10/15/30/25), الفصل 2 40 (5/15/25/25/30).
const OWNER_SCHEME_INPUT = {
  categories: [
    { categoryId: "monthly", title: "علامة الشهري", weight: 20, items: [item("m1", 10), item("m2", 15), item("m3", 25), item("m4", 25), item("m5", 25)] },
    { categoryId: "term1", title: "علامة الفصل 1", weight: 40, items: [item("f1", 20), item("f2", 10), item("f3", 15), item("f4", 30), item("f5", 25)] },
    { categoryId: "term2", title: "علامة الفصل 2", weight: 40, items: [item("s1", 5), item("s2", 15), item("s3", 25), item("s4", 25), item("s5", 30)] }
  ]
};
const ownerScheme = () => { const r = validateScheme(OWNER_SCHEME_INPUT, context()); if (!r.ok) throw new Error(JSON.stringify(r.errors)); return r.scheme; };

// evidence table: { [itemId]: { [studentId]: evidence } } — anything absent is "none".
const evidenceFrom = table => (it, studentId) => (table[it.itemId] && Object.prototype.hasOwnProperty.call(table[it.itemId], studentId) ? table[it.itemId][studentId] : { kind: "none" });
const finalOf = percent => ({ kind: "final", percent });
const allFinal = (studentId, percents) => Object.fromEntries(Object.entries(percents).map(([id, p]) => [id, { [studentId]: finalOf(p) }]));

// The §4.4 student: monthly 80/90/70/60/100; term 1 every item 85; term 2 every item 72.5.
const S44 = { m1: 80, m2: 90, m3: 70, m4: 60, m5: 100, f1: 85, f2: 85, f3: 85, f4: 85, f5: 85, s1: 72.5, s2: 72.5, s3: 72.5, s4: 72.5, s5: 72.5 };
const compute = (scheme, table, entries = {}, studentIds = ["u1"]) => computeGradebook({ scheme, studentIds, entries, evidenceOf: evidenceFrom(table) });
const rowOf = (result, id = "u1") => result.rows.find(r => r.studentId === id);

// ---------------------------------------------------------------------------------------------------------------- the owner's example
describe("GB1 — the owner's example (§4.4)", () => {
  it("validates as an active scheme: every sum is 100", () => {
    const r = validateScheme(OWNER_SCHEME_INPUT, context());
    expect(r.ok).toBe(true);
    expect(r.status).toBe("active");
    expect(r.sumIssues).toEqual([]);
    expect(r.scheme.categories.map(c => c.weight)).toEqual([20, 40, 40]);
  });
  it("monthly = 79.0; term 1 = 85.0; term 2 = 72.5; final = 78.8 — complete", () => {
    const res = compute(ownerScheme(), allFinal("u1", S44));
    const row = rowOf(res);
    expect(res.status).toBe("active");
    expect(row.categories.monthly.value).toBeCloseTo(79, 10);
    expect(row.categories.term1.value).toBeCloseTo(85, 10);
    expect(row.categories.term2.value).toBeCloseTo(72.5, 10);
    expect(row.final.value).toBeCloseTo(78.8, 10);
    expect(row.final.status).toBe("complete");
    expect(row.final.adjusted).toBeUndefined();
    expect(roundForDisplay(row.final.value)).toBe(78.8);
  });
  it("الوظيفة 1 excused: its weight is shared — monthly = 7100 / 90 = 78.888…, shown 78.9", () => {
    const res = compute(ownerScheme(), allFinal("u1", S44), { m1: { u1: { decision: "excused" } } });
    const row = rowOf(res);
    expect(row.cells.m1).toEqual({ state: "excused" });
    expect(row.categories.monthly.value).toBeCloseTo(7100 / 90, 10);
    expect(roundForDisplay(row.categories.monthly.value)).toBe(78.9);
    expect(row.final.status).toBe("complete");
  });
  it("one decimal at display only: values stay full precision", () => {
    expect(roundForDisplay(78.888888)).toBe(78.9);
    expect(roundForDisplay(78.85)).toBe(78.9);
    expect(roundForDisplay(0)).toBe(0);
    expect(roundForDisplay(null)).toBeNull();
    expect(roundForDisplay(NaN)).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------- safety invariants
describe("GB1 — invariant 1: nothing becomes a zero by itself", () => {
  it("a student who did not submit shows «—», is not counted, and the final is incomplete — never lowered by a zero", () => {
    const table = allFinal("u1", S44);
    delete table.m1;                                                         // m1: nothing submitted
    const row = rowOf(compute(ownerScheme(), table));
    expect(row.cells.m1).toEqual({ state: "missing" });
    // counted over the other four items only (90·15 + 70·25 + 60·25 + 100·25) / 90 — the same as excused, NOT (… + 0·10) / 100 = 71.0
    expect(row.categories.monthly.value).toBeCloseTo(7100 / 90, 10);
    expect(row.categories.monthly.value).not.toBeCloseTo(71, 5);
    expect(row.final.status).toBe("incomplete");
  });
  it("a missing source is a warning on the column, never a zero", () => {
    const table = allFinal("u1", S44);
    table.m2 = { u1: { kind: "missingSource" } };
    const res = compute(ownerScheme(), table);
    expect(rowOf(res).cells.m2).toEqual({ state: "missingSource" });
    expect(rowOf(res).categories.monthly.value).toBeCloseTo((800 + 1750 + 1500 + 2500) / 85, 10);
    expect(rowOf(res).final.status).toBe("incomplete");
    expect(res.warnings).toEqual([{ itemId: "m2", code: "MISSING_SOURCE" }]);
  });
  it("evidence that cannot be classified is never a mark (fail closed)", () => {
    for (const bad of [null, "final", { kind: "final" }, { kind: "final", percent: 101 }, { kind: "final", percent: -1 }, { kind: "final", percent: NaN }, { kind: "graded", percent: 50 }]) {
      const table = allFinal("u1", S44);
      table.m3 = { u1: bad };
      const row = rowOf(compute(ownerScheme(), table));
      expect(row.cells.m3).toEqual({ state: "unclassified" });
      expect(row.final.status).toBe("incomplete");
      expect(row.categories.monthly.value).toBeCloseTo((800 + 1350 + 1500 + 2500) / 75, 10);
    }
  });
  it("only a recorded «zero» decision counts as 0", () => {
    const table = allFinal("u1", S44);
    delete table.m1;
    const row = rowOf(compute(ownerScheme(), table, { m1: { u1: { decision: "zero" } } }));
    expect(row.cells.m1).toEqual({ state: "zero", percent: 0 });
    expect(row.categories.monthly.value).toBeCloseTo(71, 10);              // (0·10 + 7100) / 100
    expect(row.final.status).toBe("complete");
  });
  it("a «zero» decision stays when a result arrives later, and the result under it is returned so the conflict shows", () => {
    const row = rowOf(compute(ownerScheme(), allFinal("u1", S44), { m1: { u1: { decision: "zero" } } }));
    expect(row.cells.m1).toEqual({ state: "zero", percent: 0, evidence: { kind: "final", percent: 80 } });
    expect(row.categories.monthly.value).toBeCloseTo(71, 10);
  });
  it("corrupt entries are unclassified: an unknown decision, both a decision and a score, an empty object, a non-object", () => {
    for (const bad of [{ decision: "drop" }, { decision: "zero", score: 5 }, {}, "zero", 0]) {
      const row = rowOf(compute(ownerScheme(), allFinal("u1", S44), { m1: { u1: bad } }));
      expect(row.cells.m1).toEqual({ state: "unclassified" });
      expect(row.final.status).toBe("incomplete");
    }
  });
  it("a typed score on an assignment column is refused (a score belongs to a manual column only)", () => {
    const row = rowOf(compute(ownerScheme(), allFinal("u1", S44), { m1: { u1: { score: 10 } } }));
    expect(row.cells.m1).toEqual({ state: "unclassified" });
  });
});

describe("GB1 — invariant 2: a result that is not final never counts", () => {
  it("pending is shown, not counted, and the final is provisional", () => {
    const table = allFinal("u1", S44);
    table.m4 = { u1: { kind: "pending" } };
    const row = rowOf(compute(ownerScheme(), table));
    expect(row.cells.m4).toEqual({ state: "pending" });
    expect(row.categories.monthly.value).toBeCloseTo((800 + 1350 + 1750 + 2500) / 75, 10);
    expect(row.final.status).toBe("provisional");
  });
  it("incomplete wins over provisional", () => {
    const table = allFinal("u1", S44);
    table.m4 = { u1: { kind: "pending" } };
    delete table.m5;
    expect(rowOf(compute(ownerScheme(), table)).final.status).toBe("incomplete");
  });
});

describe("GB1 — invariant 3: weights are never rescaled silently", () => {
  it("category weights adding up to 99 → a draft scheme with no final mark", () => {
    const input = structuredClone(OWNER_SCHEME_INPUT);
    input.categories[0].weight = 19;
    const r = validateScheme(input, context());
    expect(r.ok).toBe(true);
    expect(r.status).toBe("draft");
    expect(r.sumIssues).toEqual([{ path: "categories", sum: 99 }]);
    const res = compute(r.scheme, allFinal("u1", S44));
    expect(res.status).toBe("draft");
    expect(rowOf(res).final).toEqual({ value: null, status: "draft" });
  });
  it("item weights adding up to 99 → that category has no value, and the scheme is a draft", () => {
    const input = structuredClone(OWNER_SCHEME_INPUT);
    input.categories[1].items[0].weight = 19;
    const r = validateScheme(input, context());
    expect(r.status).toBe("draft");
    expect(r.sumIssues).toEqual([{ path: "categories.term1.items", sum: 99 }]);
    const row = rowOf(compute(r.scheme, allFinal("u1", S44)));
    expect(row.categories.term1).toEqual({ value: null, draft: true });
    expect(row.categories.monthly.value).toBeCloseTo(79, 10);
    expect(row.final).toEqual({ value: null, status: "draft" });
  });
  it("a sum within the 0.01 tolerance is complete", () => {
    expect(sumIssues({ categories: [{ categoryId: "a", weight: 33.33, items: [item("x", 100)] }, { categoryId: "b", weight: 33.33, items: [item("y", 100)] }, { categoryId: "c", weight: 33.34, items: [item("z", 100)] }] })).toEqual([]);
    expect(sumIssues({ categories: [{ categoryId: "a", weight: 33.33, items: [item("x", 100)] }, { categoryId: "b", weight: 33.33, items: [item("y", 100)] }, { categoryId: "c", weight: 33.33, items: [item("z", 100)] }] })).toHaveLength(1);
  });
  it("a whole category excused: the final is computed over the other categories and marked adjusted", () => {
    const entries = Object.fromEntries(["m1", "m2", "m3", "m4", "m5"].map(id => [id, { u1: { decision: "excused" } }]));
    const row = rowOf(compute(ownerScheme(), allFinal("u1", S44), entries));
    expect(row.categories.monthly).toEqual({ value: null, allExcused: true });
    expect(row.final.value).toBeCloseTo((85 * 40 + 72.5 * 40) / 80, 10);
    expect(row.final.adjusted).toBe(true);
    expect(row.final.status).toBe("complete");
  });
  it("no counted item anywhere → no final value", () => {
    const row = rowOf(compute(ownerScheme(), {}));
    expect(row.final).toEqual({ value: null, status: "incomplete" });
    expect(Object.values(row.categories).every(c => c.value === null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------- sources
describe("GB1 — manual and project columns", () => {
  const input = () => ({ categories: [{ categoryId: "all", title: "الكل", weight: 100, items: [
    item("paper", 50, { kind: "manual", title: "امتحان ورقي", maxScore: 20 }),
    item("proj", 50, { kind: "project", projectCode: "794589" })
  ] }] });
  it("a typed manual score is score / maxScore; a project grade is its percent", () => {
    const r = validateScheme(input(), context());
    expect(r.ok).toBe(true);
    const res = compute(r.scheme, { proj: { u1: finalOf(60) } }, { paper: { u1: { score: 17 } } });
    expect(rowOf(res).cells.paper).toEqual({ state: "graded", percent: 85 });
    expect(rowOf(res).final.value).toBeCloseTo(72.5, 10);
  });
  it("an empty manual cell is «—», and an out-of-range typed score is unclassified, never clamped", () => {
    const r = validateScheme(input(), context());
    expect(rowOf(compute(r.scheme, { proj: { u1: finalOf(60) } })).cells.paper).toEqual({ state: "missing" });
    for (const bad of [21, -1, "17", NaN]) {
      expect(rowOf(compute(r.scheme, { proj: { u1: finalOf(60) } }, { paper: { u1: { score: bad } } })).cells.paper).toEqual({ state: "unclassified" });
    }
  });
  it("one row per student, in roster order, duplicates and non-string ids dropped", () => {
    const res = computeGradebook({ scheme: ownerScheme(), studentIds: ["b", "a", "b", 7], entries: {}, evidenceOf: () => ({ kind: "none" }) });
    expect(res.rows.map(r => r.studentId)).toEqual(["b", "a"]);
    expect(res.columns.map(c => c.itemId)).toEqual(ASSIGNMENT_IDS);
    expect(res.columns[0]).toEqual({ itemId: "m1", categoryId: "monthly", weight: 10, source: { kind: "assignment", assignmentId: "m1" } });
  });
  it("a corrupt stored scheme is refused, never half-computed", () => {
    const base = ownerScheme();
    const broken = [null, {}, { categories: [] }, { categories: [{ ...base.categories[0], weight: "20" }] }, { categories: [{ ...base.categories[0], items: [{ ...base.categories[0].items[0], source: { kind: "other" } }] }] },
      { categories: [base.categories[0], { ...base.categories[1], items: [base.categories[0].items[0]] }] }];
    for (const scheme of broken) expect(computeGradebook({ scheme, studentIds: ["u1"], entries: {}, evidenceOf: () => ({ kind: "none" }) })).toEqual({ ok: false, code: "SCHEME_INVALID" });
    expect(computeGradebook({ scheme: base, studentIds: ["u1"], entries: {} })).toEqual({ ok: false, code: "SCHEME_INVALID" });
  });
});

// ---------------------------------------------------------------------------------------------------------------- evidence
describe("GB1 — assignment evidence (D1: the latest final attempt)", () => {
  const attempt = (over = {}) => ({ attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, finalized: true, manualReviewMarks: 0, ...over });
  it("no submission / no attempts → none", () => {
    expect(assignmentEvidence(null)).toEqual({ kind: "none" });
    expect(assignmentEvidence({})).toEqual({ kind: "none" });
    expect(assignmentEvidence({ attempts: [] })).toEqual({ kind: "none" });
  });
  it("the LATEST attempt counts, even when an earlier one was better", () => {
    expect(assignmentEvidence({ attempts: [attempt({ score: 9 }), attempt({ attemptNumber: 2, score: 5, percentage: 50 })] })).toEqual({ kind: "final", percent: 50 });
  });
  it("full precision from score / totalMarks, not the stored rounded percentage", () => {
    expect(assignmentEvidence({ attempts: [attempt({ score: 2, totalMarks: 3, percentage: 66.67 })] }).percent).toBeCloseTo(200 / 3, 12);
  });
  it("awaiting the teacher → pending (manual marks, not finalized)", () => {
    expect(assignmentEvidence({ attempts: [attempt({ manualReviewMarks: 2 })] })).toEqual({ kind: "pending" });
    expect(assignmentEvidence({ attempts: [attempt({ finalized: false })] })).toEqual({ kind: "pending" });
  });
  it("automatic coding grading still open → pending", () => {
    expect(assignmentEvidence({ attempts: [attempt({ codingGrading: { targets: { q1: { state: "queued" } } } })] })).toEqual({ kind: "pending" });
  });
  it("a legacy attempt without `finalized` and no manual marks is final", () => {
    const legacy = attempt(); delete legacy.finalized;
    expect(assignmentEvidence({ attempts: [legacy] })).toEqual({ kind: "final", percent: 80 });
  });
  it("marks absent → the stored percentage; nothing usable → unclassified", () => {
    expect(assignmentEvidence({ attempts: [attempt({ score: undefined, totalMarks: 0, percentage: 70 })] })).toEqual({ kind: "final", percent: 70 });
    expect(assignmentEvidence({ attempts: [attempt({ score: undefined, totalMarks: 0, percentage: undefined })] })).toEqual({ kind: "unclassified" });
    expect(assignmentEvidence({ attempts: [attempt({ score: 11 })] })).toEqual({ kind: "unclassified" });
    expect(assignmentEvidence({ attempts: [attempt({ score: -1 })] })).toEqual({ kind: "unclassified" });
    expect(assignmentEvidence({ attempts: "x" })).toEqual({ kind: "unclassified" });
    expect(assignmentEvidence({ attempts: [null] })).toEqual({ kind: "unclassified" });
    expect(assignmentEvidence("x")).toEqual({ kind: "unclassified" });
  });
});

describe("GB1 — project and manual evidence", () => {
  it("project: grade → final; no record → none; gone from the class → missingSource; junk → unclassified", () => {
    expect(projectEvidence(64.5)).toEqual({ kind: "final", percent: 64.5 });
    expect(projectEvidence(0)).toEqual({ kind: "final", percent: 0 });
    expect(projectEvidence(null)).toEqual({ kind: "none" });
    expect(projectEvidence(50, { available: false })).toEqual({ kind: "missingSource" });
    expect(projectEvidence(120)).toEqual({ kind: "unclassified" });
    expect(projectEvidence("50")).toEqual({ kind: "unclassified" });
  });
  it("manual: within 0..maxScore → final; otherwise unclassified", () => {
    expect(manualEvidence(20, 20)).toEqual({ kind: "final", percent: 100 });
    expect(manualEvidence(0, 20)).toEqual({ kind: "final", percent: 0 });
    expect(manualEvidence(undefined, 20)).toEqual({ kind: "none" });
    expect(manualEvidence(5, 0)).toEqual({ kind: "unclassified" });
    expect(manualEvidence(25, 20)).toEqual({ kind: "unclassified" });
  });
});

// ---------------------------------------------------------------------------------------------------------------- validation
describe("GB1 — scheme validation (§4.2)", () => {
  const one = (over = {}, itemOver = {}) => ({ categories: [{ categoryId: "a", title: "قسم", weight: 100, items: [{ itemId: "x", weight: 100, source: { kind: "assignment", assignmentId: "m1" }, ...itemOver }], ...over }] });
  const codes = r => (r.ok ? [] : r.errors.map(e => e.code));
  it("weights: > 0, ≤ 100, two decimals at most, numbers only", () => {
    for (const w of [0, -5, 100.01, 12.345, "50", NaN, Infinity, null]) expect(codes(validateScheme(one({ weight: w }), context()))).toContain("WEIGHT");
    for (const w of [0.01, 12.5, 33.33, 100]) expect(codes(validateScheme(one({ weight: w }), context()))).not.toContain("WEIGHT");
  });
  it("ids are safe ids and unique", () => {
    expect(codes(validateScheme(one({ categoryId: "../x" }), context()))).toContain("CATEGORY_ID");
    expect(codes(validateScheme(one({}, { itemId: "a b" }), context()))).toContain("ITEM_ID");
    const dup = { categories: [{ categoryId: "a", title: "ق", weight: 50, items: [item("x", 100)] }, { categoryId: "a", title: "ق", weight: 50, items: [item("x", 100, { kind: "assignment", assignmentId: "m2" })] }] };
    dup.categories[0].items[0].source = { kind: "assignment", assignmentId: "m1" };
    expect(codes(validateScheme(dup, context()))).toEqual(expect.arrayContaining(["CATEGORY_ID_DUPLICATE", "ITEM_ID_DUPLICATE"]));
  });
  it("the same assignment or project appears only once", () => {
    const input = { categories: [{ categoryId: "a", title: "ق", weight: 50, items: [item("x", 100, { kind: "assignment", assignmentId: "m1" })] }, { categoryId: "b", title: "ق", weight: 50, items: [item("y", 100, { kind: "assignment", assignmentId: "m1" })] }] };
    const r = validateScheme(input, context());
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([{ path: "categories.1.items.0.source", code: "SOURCE_DUPLICATE", message: expect.any(String) }]);
  });
  it("an assignment must belong to the class and be reportable (published, or archived after being published)", () => {
    const ctx = context();
    ctx.assignments.set("draft1", { assignmentId: "draft1", classId: CLASS, status: "draft" });
    ctx.assignments.set("other", { assignmentId: "other", classId: "c2", status: "published" });
    ctx.assignments.set("arch", { assignmentId: "arch", classId: CLASS, status: "archived", archivedFromStatus: "published" });
    ctx.assignments.set("deleted", { assignmentId: "deleted", classId: CLASS, status: "archived", archivedFromStatus: "draft" });
    const withSource = assignmentId => validateScheme(one({}, { source: { kind: "assignment", assignmentId } }), ctx);
    for (const id of ["draft1", "other", "deleted", "unknown"]) expect(codes(withSource(id))).toEqual(["ASSIGNMENT_NOT_IN_CLASS"]);
    expect(withSource("arch").ok).toBe(true);
  });
  it("a project must be one of the class's projects", () => {
    expect(codes(validateScheme(one({}, { source: { kind: "project", projectCode: "883589" } }), context()))).toEqual(["PROJECT_NOT_IN_CLASS"]);
    expect(validateScheme(one({}, { source: { kind: "project", projectCode: "794589" } }), context()).ok).toBe(true);
  });
  it("without a usable class context, every class-bound source is refused (fail closed)", () => {
    for (const ctx of [undefined, null, {}, { classId: CLASS, assignments: {}, projectCodes: [] }, { classId: "../c", assignments: new Map(), projectCodes: [] }]) {
      expect(codes(validateScheme(one(), ctx))).toEqual(["CONTEXT"]);
    }
    expect(validateScheme(one({}, { source: { kind: "manual", title: "ورقي", maxScore: 20 } }), undefined).ok).toBe(true);
  });
  it("manual columns: a title and an integer maximum from 1 to 1000", () => {
    const manual = src => validateScheme(one({}, { source: { kind: "manual", ...src } }), context());
    expect(codes(manual({ title: "  ", maxScore: 20 }))).toEqual(["MANUAL_TITLE"]);
    expect(codes(manual({ title: "​", maxScore: 20 }))).toEqual(["MANUAL_TITLE"]);
    expect(codes(manual({ title: "x".repeat(LIMITS.manualTitle + 1), maxScore: 20 }))).toEqual(["MANUAL_TITLE"]);
    for (const m of [0, 1001, 2.5, "20"]) expect(codes(manual({ title: "ورقي", maxScore: m }))).toEqual(["MANUAL_MAX"]);
    expect(manual({ title: "  امتحان   ورقي ", maxScore: 1000 }).scheme.categories[0].items[0].source).toEqual({ kind: "manual", title: "امتحان ورقي", maxScore: 1000 });
  });
  it("an unknown source kind and an unknown shape are refused", () => {
    expect(codes(validateScheme(one({}, { source: { kind: "game" } }), context()))).toEqual(["SOURCE_KIND"]);
    expect(codes(validateScheme(null, context()))).toEqual(["SCHEME_SHAPE"]);
    expect(codes(validateScheme({ categories: {} }, context()))).toEqual(["SCHEME_SHAPE"]);
  });
  it("counts: 1–10 categories and 1–40 items per category; titles ≤ 80 characters", () => {
    expect(codes(validateScheme({ categories: [] }, context()))).toEqual(["CATEGORY_COUNT"]);
    const many = Array.from({ length: LIMITS.categories + 1 }, (_, i) => ({ categoryId: "c" + i, title: "ق", weight: 1, items: [item("i" + i, 100, { kind: "manual", title: "و", maxScore: 10 })] }));
    expect(codes(validateScheme({ categories: many }, context()))).toContain("CATEGORY_COUNT");
    expect(codes(validateScheme(one({ items: [] }), context()))).toEqual(["ITEM_COUNT"]);
    const items = Array.from({ length: LIMITS.itemsPerCategory + 1 }, (_, i) => item("i" + i, 1, { kind: "manual", title: "و", maxScore: 10 }));
    expect(codes(validateScheme(one({ items }), context()))).toContain("ITEM_COUNT");
    expect(codes(validateScheme(one({ title: "x".repeat(LIMITS.categoryTitle + 1) }), context()))).toEqual(["CATEGORY_TITLE"]);
  });
  it("only known fields are kept", () => {
    const r = validateScheme({ categories: [{ categoryId: "a", title: "ق", weight: 100, extra: 1, items: [{ itemId: "x", weight: 100, note: "n", source: { kind: "assignment", assignmentId: "m1", classId: "c9" } }] }], revision: 99 }, context());
    expect(r.scheme).toEqual({ schemaVersion: 1, categories: [{ categoryId: "a", title: "ق", weight: 100, items: [{ itemId: "x", weight: 100, source: { kind: "assignment", assignmentId: "m1" } }] }] });
  });
});
