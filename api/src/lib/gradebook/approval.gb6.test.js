// Class gradebook GB6 — the pure approval rules (lib/gradebook/approval.js): readiness, the frozen snapshot, drift, a corrupt stored
// document, a withheld column (unknown, never «unchanged»), and what one student may see. TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { computeGradebook } = require("./compute");
const A = require("./approval");
const { cleanText } = require("../roster-input");

const scheme = {
  categories: [
    { categoryId: "k1", title: "الأول", weight: 50, items: [{ itemId: "hw", weight: 100, source: { kind: "assignment", assignmentId: "a1" } }] },
    { categoryId: "k2", title: "الثاني", weight: 50, items: [{ itemId: "p", weight: 100, source: { kind: "project", projectCode: "794589" } }] }
  ]
};
const ctxOf = ({ evidence = { s1: 80, s2: 60 }, students = ["s1", "s2"], entries = {}, withheld = [], release = {} } = {}) => {
  const result = computeGradebook({ scheme, studentIds: students, entries, evidenceOf: (item, id) => (item.itemId === "p" ? { kind: "final", percent: 50 } : evidence[id] === undefined ? { kind: "none" } : evidence[id] === "pending" ? { kind: "pending" } : { kind: "final", percent: evidence[id] }) });
  return { scheme, result, withheldItems: new Set(withheld), assignmentDocs: new Map([["a1", { assignmentId: "a1", ...release }]]), nowMs: Date.parse("2026-11-18T10:00:00Z") };
};
const titles = new Map([["hw", "الوظيفة"], ["p", "المشروع"]]);

describe("GB6 — readiness", () => {
  it("every non-final cell state blocks a part; «صفر» / «معفى» complete it", () => {
    expect(A.partReadiness("k1", ctxOf()).ready).toBe(true);
    for (const v of ["pending", undefined]) {
      const r = A.partReadiness("k1", ctxOf({ evidence: { s1: 80, s2: v } }));
      expect(r.issues).toEqual([expect.objectContaining({ code: "PART_INCOMPLETE", cells: 1, students: 1 })]);
    }
    for (const decision of ["zero", "excused"]) expect(A.partReadiness("k1", ctxOf({ evidence: { s1: 80 }, entries: { hw: { s2: { decision } } } })).ready).toBe(true);
    expect(A.partReadiness("k1", ctxOf({ students: [] })).issues.map(i => i.code)).toEqual(["NO_STUDENTS"]);
  });
  it("a withheld column blocks; an unreleased or unreadable assignment blocks (fail closed)", () => {
    expect(A.partReadiness("k2", ctxOf({ withheld: ["p"] })).issues.map(i => i.code)).toEqual(["PART_WITHHELD"]);
    expect(A.partReadiness("k1", ctxOf({ release: { resultsRelease: "afterDue", dueAt: "2026-12-01T00:00:00Z" } })).issues.map(i => i.code)).toEqual(["RESULTS_NOT_RELEASED"]);
    expect(A.partReadiness("k1", ctxOf({ release: { resultsRelease: "bogus" } })).ready).toBe(false);
    const c = ctxOf(); c.assignmentDocs = new Map();
    expect(A.partReadiness("k1", c).issues.map(i => i.code)).toEqual(["RESULTS_NOT_RELEASED"]);
  });
});

describe("GB6 — snapshot and drift", () => {
  it("unchanged → 0; a changed mark, a new student, a student who left, a changed column → drift", () => {
    const snap = A.partSnapshot("k1", ctxOf(), titles);
    expect(snap).toMatchObject({ categoryId: "k1", title: "الأول", weight: 50, items: [{ itemId: "hw", title: "الوظيفة" }] });
    expect(A.partDrift(snap, ctxOf())).toEqual({ structure: false, students: 0 });
    expect(A.partDrift(snap, ctxOf({ evidence: { s1: 81, s2: 60 } }))).toEqual({ structure: false, students: 1 });
    expect(A.partDrift(snap, ctxOf({ evidence: { s1: 80, s2: 60, s3: 10 }, students: ["s1", "s2", "s3"] }))).toEqual({ structure: false, students: 1 });
    expect(A.partDrift(snap, ctxOf({ students: ["s1"] }))).toEqual({ structure: false, students: 1 });
    expect(A.partDrift(snap, ctxOf({ entries: { hw: { s2: { decision: "zero" } } } }))).toEqual({ structure: false, students: 1 });
    const moved = { ...snap, items: [{ ...snap.items[0], weight: 50 }] };
    expect(A.partDrift(moved, ctxOf())).toEqual({ structure: true, students: 2 });
  });
  it("a cell that changes while the part mark stays the same is drift too (graded 50 → «معفى» beside another 50)", () => {
    const two = { categories: [{ categoryId: "k", title: "ق", weight: 100, items: [{ itemId: "x", weight: 50, source: { kind: "manual", title: "س", maxScore: 10 } }, { itemId: "y", weight: 50, source: { kind: "manual", title: "ص", maxScore: 10 } }] }] };
    const ctx = entries => ({ scheme: two, withheldItems: new Set(), assignmentDocs: new Map(), nowMs: 0, result: computeGradebook({ scheme: two, studentIds: ["s1"], entries, evidenceOf: () => ({ kind: "none" }) }) });
    const before = ctx({ x: { s1: { score: 5 } }, y: { s1: { score: 5 } } }), after = ctx({ x: { s1: { decision: "excused" } }, y: { s1: { score: 5 } } });
    expect(after.result.rows[0].categories.k.value).toBe(before.result.rows[0].categories.k.value);
    expect(A.partDrift(A.partSnapshot("k", before, new Map()), after)).toEqual({ structure: false, students: 1 });
  });
  it("a withheld column: drift is unknown (null), and the final cannot be approved", () => {
    const snap = A.partSnapshot("k2", ctxOf(), titles);
    expect(A.partDrift(snap, ctxOf({ withheld: ["p"] }))).toEqual({ structure: false, students: null });
    const approvals = { parts: { k1: { snapshot: A.partSnapshot("k1", ctxOf(), titles) }, k2: { snapshot: snap } } };
    expect(A.finalReadiness(ctxOf(), approvals).ready).toBe(true);
    expect(A.finalReadiness(ctxOf({ withheld: ["p"] }), approvals).issues.map(i => i.code)).toEqual(["PART_WITHHELD", "PART_DRIFT"]);   // drift unknown counts as drift
    const fin = A.finalSnapshot(ctxOf());
    expect(A.finalDrift(fin, ctxOf())).toEqual({ structure: false, students: 0 });
    expect(A.finalDrift(fin, ctxOf({ withheld: ["p"] }))).toEqual({ structure: false, students: null });
    expect(A.finalDrift(fin, ctxOf({ evidence: { s1: 90, s2: 60 } }))).toEqual({ structure: false, students: 1 });
  });
});

describe("GB6 — stored document, reason, student view", () => {
  it("a corrupt approvals document is null (the route fails closed); a missing one is empty", () => {
    expect(A.readApprovals(null, "c")).toMatchObject({ parts: {}, final: null, history: [] });
    for (const bad of [[], "x", { parts: [] }, { parts: { k: null } }, { parts: { k: { snapshot: { items: [], students: [] } } } }, { parts: {}, final: "x" }, { parts: {}, final: { snapshot: null } }]) expect(A.readApprovals(bad, "c")).toBeNull();
  });
  it("a reason is 3..300 visible characters", () => {
    expect(A.normalizeReason("  سبب   واضح ", cleanText)).toBe("سبب واضح");
    for (const bad of [null, 5, "", "ab", "​​​", "x".repeat(301)]) expect(A.normalizeReason(bad, cleanText)).toBeNull();
  });
  it("a student sees only their own row of approved, released parts; the final only when every part of it is shown", () => {
    const k1 = A.partSnapshot("k1", ctxOf(), titles), k2 = A.partSnapshot("k2", ctxOf(), titles);
    const approvals = { parts: { k1: { approvedAt: "t1", snapshot: k1 }, k2: { approvedAt: "t2", snapshot: k2 } }, final: { approvedAt: "t3", snapshot: A.finalSnapshot(ctxOf()) } };
    const v = A.studentApprovedView(approvals, "s1", new Set());
    expect(v.parts.map(p => [p.categoryId, p.display])).toEqual([["k1", 80], ["k2", 50]]);
    expect(v.final).toEqual({ value: 65, display: 65, approvedAt: "t3" });
    expect(JSON.stringify(v)).not.toContain("s2");
    const hidden = A.studentApprovedView(approvals, "s1", new Set(["hw"]));
    expect(hidden.parts.map(p => p.categoryId)).toEqual(["k2"]);
    expect(hidden.final).toBeNull();
    expect(A.studentApprovedView({ parts: { k1: { snapshot: k1 } }, final: approvals.final }, "s1", new Set()).final).toBeNull();
    expect(A.studentApprovedView(approvals, "stranger", new Set())).toEqual({ parts: [], final: null });
  });
});
