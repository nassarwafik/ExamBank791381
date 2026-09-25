import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeTeacherAnalytics } from "../src/lib/teacher-analytics-core.js";
import { deriveGradingStatus } from "../src/lib/grading-status.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Roadmap #23 — Canonical Grading Status in Teacher Analytics.
//
// Before R23 teacher analytics decided "pending review" with a raw `attempt.finalized === false` check in
// three places (class-level classAggregate, the scoped/global KPI, and the per-assignment trend). That
// disagreed with the ONE canonical R14 helper (deriveGradingStatus) used by assignment-results,
// assignment-review and the student dashboard in exactly two situations:
//   - a legacy result whose `finalized` field is ABSENT but `manualReviewMarks > 0`  (canonical: pending)
//   - a result with `finalized: true` but `manualReviewMarks > 0`                     (canonical: pending)
// Both were silently counted as NOT pending by analytics. These tests drive the REAL computeTeacherAnalytics
// over the in-memory container and prove every pending count now equals the canonical helper's verdict,
// while modern (fully-consistent) results are unchanged.

const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const iso = ms => new Date(ms).toISOString();

// The five grading shapes named by the R23 spec (A–E).
const SHAPE = {
  finalizedFalse:       { finalized: false, manualReviewMarks: 0, percentage: 60 },   // A → pending
  finalizedTrue:        { finalized: true,  manualReviewMarks: 0, percentage: 80 },   // B → final
  legacyManual:         { manualReviewMarks: 4, percentage: 70 },                     // C (finalized absent) → pending
  legacyClean:          { manualReviewMarks: 0, percentage: 90 },                     // D (finalized absent) → final (legacy canonical)
  manualOverridesFinal: { finalized: true,  manualReviewMarks: 3, percentage: 50 }    // E → pending (manual marks win)
};

const attempt = (shape, n = 1, at = T0) => ({ attemptNumber: n, submittedAt: iso(at), score: shape.percentage, totalMarks: 100, ...shape });
const cls = (classId, name, over = {}) => ({ classId, name, active: true, studentIds: [], ...over });
const student = (userId, classId) => ({ userId, role: "student", active: true, archived: false, classId, displayName: "طالب " + userId, code: "S" + userId, lastLoginAt: iso(T0) });
const assignment = (assignmentId, classId, dueAt, over = {}) => ({ assignmentId, classId, status: "published", title: "واجب " + assignmentId, dueAt: iso(dueAt), createdAt: iso(dueAt - 86400000), maxAttempts: 3, examSnapshot: { questions: [] }, ...over });
const submission = (assignmentId, studentId, classId, attempts) => ({ assignmentId, studentId, classId, attempts, activeAttempt: null });

// Seed helper: one active class (c1), one published assignment (a1), N students each with the given shape.
function seedSingleClass(shapes) {
  const seed = { [CP + "c1.json"]: cls("c1", "صف أ"), [AP + "a1.json"]: assignment("a1", "c1", T0 + 3600000) };
  shapes.forEach((shape, i) => {
    const id = "s" + (i + 1);
    seed[UP + id + ".json"] = student(id, "c1");
    if (shape) seed[SP + "a1/" + id + ".json"] = submission("a1", id, "c1", [attempt(shape)]);
  });
  return createMemoryContainer(seed);
}

// The full mixed fixture used by the class/student/assignment-level tests:
//   c1: a1 → s1 (A finalizedFalse), s2 (B finalizedTrue)
//       a2 → s3 (C legacyManual),   s4 (E manualOverridesFinal)   [s1,s2 have NOT submitted a2]
//   c2: a3 → s5 (D legacyClean)
// Canonical pending: c1 = 3 (s1@a1, s3@a2, s4@a2), c2 = 0; a1 = 1, a2 = 2, a3 = 0; global = 3.
const MIXED = {
  c1: { a1: { s1: SHAPE.finalizedFalse, s2: SHAPE.finalizedTrue }, a2: { s3: SHAPE.legacyManual, s4: SHAPE.manualOverridesFinal } },
  c2: { a3: { s5: SHAPE.legacyClean } }
};
function seedMixed() {
  const seed = {
    [CP + "c1.json"]: cls("c1", "صف أ"), [CP + "c2.json"]: cls("c2", "صف ب"),
    [UP + "s1.json"]: student("s1", "c1"), [UP + "s2.json"]: student("s2", "c1"), [UP + "s3.json"]: student("s3", "c1"), [UP + "s4.json"]: student("s4", "c1"),
    [UP + "s5.json"]: student("s5", "c2"),
    [AP + "a1.json"]: assignment("a1", "c1", T0 + 3600000), [AP + "a2.json"]: assignment("a2", "c1", T0 + 2 * 86400000), [AP + "a3.json"]: assignment("a3", "c2", T0 + 3 * 86400000)
  };
  for (const [classId, byAssignment] of Object.entries(MIXED)) {
    for (const [assignmentId, byStudent] of Object.entries(byAssignment)) {
      for (const [studentId, shape] of Object.entries(byStudent)) seed[SP + assignmentId + "/" + studentId + ".json"] = submission(assignmentId, studentId, classId, [attempt(shape)]);
    }
  }
  return createMemoryContainer(seed);
}
// Canonical expectation computed straight from the helper (so the test is pinned to R14, not to a hand-typed number).
const canonicalPending = shapes => shapes.filter(shape => deriveGradingStatus(attempt(shape)) === "pendingReview").length;
const allMixedShapes = Object.values(MIXED).flatMap(byA => Object.values(byA).flatMap(byS => Object.values(byS)));
const byClass = id => Object.values(MIXED[id]).flatMap(byS => Object.values(byS));
const byAssignment = (classId, id) => Object.values(MIXED[classId][id]);
const classRow = (data, id) => data.classComparison.find(row => row.classId === id);
const trendRow = (data, id) => data.assignmentTrend.find(row => row.assignmentId === id);
const pendingInsight = data => data.insights.find(item => item.title === "مراجعة يدوية مطلوبة");

// Every pending-count surface analytics exposes, in one place.
function pendingSurfaces(data) {
  return { kpi: data.kpis.pendingReview, status: data.submissionStatus.pendingReview, classes: Object.fromEntries(data.classComparison.map(row => [row.classId, row.pendingReview])), assignments: Object.fromEntries(data.assignmentTrend.map(row => [row.assignmentId, row.pendingReview])) };
}

describe("R23 sanity — the canonical helper's verdict for the five spec shapes", () => {
  it("A/B/C/D/E map to pending/final/pending/final/pending", () => {
    expect(deriveGradingStatus(attempt(SHAPE.finalizedFalse))).toBe("pendingReview");
    expect(deriveGradingStatus(attempt(SHAPE.finalizedTrue))).toBe("final");
    expect(deriveGradingStatus(attempt(SHAPE.legacyManual))).toBe("pendingReview");
    expect(deriveGradingStatus(attempt(SHAPE.legacyClean))).toBe("final");
    expect(deriveGradingStatus(attempt(SHAPE.manualOverridesFinal))).toBe("pendingReview");
  });
});

describe("R23 A — finalized:false is pending in every analytics surface", () => {
  it("one finalized:false attempt → kpi/status/class/assignment pending = 1 and the manual-review insight appears", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.finalizedFalse]).container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 1, status: 1, classes: { c1: 1 }, assignments: { a1: 1 } });
    expect(data.kpis.submissions).toBe(1);
    expect(pendingInsight(data)?.text).toContain("1 ");
  });
  it("latest attempt governs: an older FINAL attempt followed by a newer finalized:false attempt is pending", async () => {
    const ctx = seedSingleClass([null]);
    ctx.setJson(SP + "a1/s1.json", submission("a1", "s1", "c1", [attempt(SHAPE.finalizedTrue, 1, T0), attempt(SHAPE.finalizedFalse, 2, T0 + 60000)]));
    const data = await computeTeacherAnalytics(ctx.container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 1, status: 1, classes: { c1: 1 }, assignments: { a1: 1 } });
  });
});

describe("R23 B — finalized:true with no manual marks is final everywhere", () => {
  it("one finalized:true attempt → every pending surface is 0 and no manual-review insight", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.finalizedTrue]).container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 0, status: 0, classes: { c1: 0 }, assignments: { a1: 0 } });
    expect(data.kpis.submissions).toBe(1);
    expect(pendingInsight(data)).toBeUndefined();
  });
});

describe("R23 C — LEGACY result (finalized absent) with manualReviewMarks > 0 is pending (the pre-R23 divergence)", () => {
  it("finalized missing + manualReviewMarks:4 → pending = 1 on kpi/status/class/assignment + insight", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.legacyManual]).container);
    // Pre-R23 the raw `finalized === false` check evaluated `undefined === false` → NOT pending → 0 here.
    expect(pendingSurfaces(data)).toEqual({ kpi: 1, status: 1, classes: { c1: 1 }, assignments: { a1: 1 } });
    expect(pendingInsight(data)?.text).toContain("1 ");
  });
  it("finalized:true but manualReviewMarks:3 → manual marks override → pending (E)", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.manualOverridesFinal]).container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 1, status: 1, classes: { c1: 1 }, assignments: { a1: 1 } });
  });
});

describe("R23 D — LEGACY result (finalized absent) with 0 manual marks is final (canonical legacy rule)", () => {
  it("finalized missing + manualReviewMarks:0 → pending = 0 everywhere, still counted as a submission", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.legacyClean]).container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 0, status: 0, classes: { c1: 0 }, assignments: { a1: 0 } });
    expect(data.kpis.submissions).toBe(1);
    expect(pendingInsight(data)).toBeUndefined();
  });
  it("finalized missing + manualReviewMarks missing entirely → final (0 pending)", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([{ percentage: 75 }]).container);
    expect(pendingSurfaces(data)).toEqual({ kpi: 0, status: 0, classes: { c1: 0 }, assignments: { a1: 0 } });
  });
});

describe("R23 E — class-level pending counts (classComparison) are canonical", () => {
  it("mixed classes: c1 = 3 (A + C + E), c2 = 0 (D) — equal to deriveGradingStatus over the same attempts", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container);
    expect(classRow(data, "c1").pendingReview).toBe(canonicalPending(byClass("c1")));
    expect(classRow(data, "c1").pendingReview).toBe(3);
    expect(classRow(data, "c2").pendingReview).toBe(canonicalPending(byClass("c2")));
    expect(classRow(data, "c2").pendingReview).toBe(0);
    // submitted is grading-state independent: c1 has 4 submissions (2 per assignment), c2 has 1.
    expect(classRow(data, "c1").submitted).toBe(4);
    expect(classRow(data, "c2").submitted).toBe(1);
  });
  // Phase 8A: classComparison is a GLOBAL-scope view only — a class scope never carries other classes' aggregates.
  it("classComparison is a global-only view (Phase 8A): a classId scope returns no comparison rows; its own KPIs stay canonical", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container, { classId: "c2" });
    expect(data.classComparison).toEqual([]);
    expect(data.kpis.pendingReview).toBe(0);
  });
});

describe("R23 F — student-scope / global pending counts (kpis + submissionStatus) are canonical", () => {
  it("global scope → 3; classId:c1 → 3; classId:c2 → 0 — and kpis/submissionStatus always agree", async () => {
    const ctx = seedMixed();
    const global = await computeTeacherAnalytics(ctx.container);
    expect(global.kpis.pendingReview).toBe(canonicalPending(allMixedShapes));
    expect(global.kpis.pendingReview).toBe(3);
    expect(global.submissionStatus.pendingReview).toBe(3);
    const c1 = await computeTeacherAnalytics(ctx.container, { classId: "c1" });
    expect(c1.kpis.pendingReview).toBe(3);
    expect(c1.submissionStatus.pendingReview).toBe(3);
    const c2 = await computeTeacherAnalytics(ctx.container, { classId: "c2" });
    expect(c2.kpis.pendingReview).toBe(0);
    expect(c2.submissionStatus.pendingReview).toBe(0);
  });
  it("the manual-review insight carries the corrected global count (3, not the pre-R23 raw count of 1)", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container);
    expect(pendingInsight(data)?.text).toContain("3 ");
  });
  it("studentId scope: studentDetail.completed counts submissions independent of grading state (unchanged), pending KPI is the student's own (Phase 8A), canonical", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container, { classId: "c1", studentId: "s3" });
    expect(data.studentDetail).not.toBeNull();
    expect(data.studentDetail.userId).toBe("s3");
    expect(data.studentDetail.assigned).toBe(2);      // a1 + a2
    expect(data.studentDetail.completed).toBe(1);     // only a2 submitted (legacy pending) — still "completed" (submitted)
    expect(data.studentDetail.missing).toBe(1);
    expect(data.kpis.pendingReview).toBe(1);          // Phase 8A: s3's own a2 (legacy manual → canonical pending), not the class's 3
  });
});

describe("R23 G — assignment-level pending counts (assignmentTrend) are canonical", () => {
  it("a1 = 1 (A, not B), a2 = 2 (C + E), a3 = 0 (D) — equal to deriveGradingStatus per assignment", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container);
    expect(trendRow(data, "a1").pendingReview).toBe(canonicalPending(byAssignment("c1", "a1")));
    expect(trendRow(data, "a1").pendingReview).toBe(1);
    expect(trendRow(data, "a2").pendingReview).toBe(canonicalPending(byAssignment("c1", "a2")));
    expect(trendRow(data, "a2").pendingReview).toBe(2);
    expect(trendRow(data, "a3").pendingReview).toBe(canonicalPending(byAssignment("c2", "a3")));
    expect(trendRow(data, "a3").pendingReview).toBe(0);
    // submitted / missing are grading-state independent (a1: s1,s2 submitted; a2: s3,s4 submitted, s1,s2 missing).
    expect(trendRow(data, "a1")).toMatchObject({ students: 4, submitted: 2, missing: 2 });
    expect(trendRow(data, "a2")).toMatchObject({ students: 4, submitted: 2, missing: 2 });
  });
});

describe("R23 H — pending never leaks into the implicit final count; score stats stay over ALL submitted (unchanged non-goal)", () => {
  it("submissions − pendingReview equals the canonical FINAL count on every surface", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container);
    const canonicalFinal = allMixedShapes.filter(shape => deriveGradingStatus(attempt(shape)) === "final").length;
    expect(data.kpis.submissions - data.kpis.pendingReview).toBe(canonicalFinal);
    expect(data.kpis.submissions - data.kpis.pendingReview).toBe(2);     // B + D
    for (const row of data.classComparison) expect(row.pendingReview).toBeLessThanOrEqual(row.submitted);
    for (const row of data.assignmentTrend) expect(row.pendingReview).toBeLessThanOrEqual(row.submitted);
    expect(classRow(data, "c1").submitted - classRow(data, "c1").pendingReview).toBe(1);   // B only
    expect(classRow(data, "c2").submitted - classRow(data, "c2").pendingReview).toBe(1);   // D only
  });
  it("R23 changes NO grading math: average/highest/lowest/gradeDistribution still cover every submitted attempt (pending included)", async () => {
    const data = await computeTeacherAnalytics(seedMixed().container);
    const all = allMixedShapes.map(shape => shape.percentage);              // 60,80,70,50,90
    expect(data.kpis.average).toBe(Math.round(all.reduce((a, b) => a + b, 0) / all.length * 10) / 10);   // 70
    expect(data.kpis.highest).toBe(90);
    expect(data.kpis.lowest).toBe(50);
    expect(data.gradeDistribution.reduce((sum, bin) => sum + bin.count, 0)).toBe(all.length);
    // per-class averages likewise include the pending attempts (unchanged).
    expect(classRow(data, "c1").average).toBe(65);   // (60+80+70+50)/4
  });
});

describe("R23 I — MODERN results (explicit finalized boolean, consistent manualReviewMarks) are unchanged by R23", () => {
  it("for fully-modern attempts the canonical count equals the old raw `finalized === false` count", async () => {
    // Modern writers always persist finalized:boolean with manualReviewMarks>0 ⇔ finalized:false.
    const modern = [
      { finalized: false, manualReviewMarks: 6, percentage: 55 },
      { finalized: true,  manualReviewMarks: 0, percentage: 95 },
      { finalized: false, manualReviewMarks: 2, percentage: 40 },
      { finalized: true,  manualReviewMarks: 0, percentage: 88 },
      { finalized: true,  manualReviewMarks: 0, percentage: 61 }
    ];
    const data = await computeTeacherAnalytics(seedSingleClass(modern).container);
    const rawLegacyCount = modern.filter(shape => shape.finalized === false).length;   // what pre-R23 analytics computed
    expect(rawLegacyCount).toBe(2);
    expect(pendingSurfaces(data)).toEqual({ kpi: 2, status: 2, classes: { c1: 2 }, assignments: { a1: 2 } });
    expect(data.kpis.submissions).toBe(5);
    expect(data.kpis.missingSubmissions).toBe(0);
  });
  it("students without any submission remain notSubmitted → missing, never pending", async () => {
    const data = await computeTeacherAnalytics(seedSingleClass([SHAPE.finalizedTrue, null, null]).container);
    expect(data.kpis.expectedSubmissions).toBe(3);
    expect(data.kpis.submissions).toBe(1);
    expect(data.kpis.missingSubmissions).toBe(2);
    expect(pendingSurfaces(data)).toEqual({ kpi: 0, status: 0, classes: { c1: 0 }, assignments: { a1: 0 } });
  });
});

describe("R23 J — AI-insight inputs receive the corrected counts (teacher-analytics-ai consumes the core only)", () => {
  it("the exact call shape teacher-analytics-ai makes — computeTeacherAnalytics(container, { classId, studentId }) — returns corrected pending counts", async () => {
    const ctx = seedMixed();
    const classScope = await computeTeacherAnalytics(ctx.container, { classId: "c1", studentId: "" });
    expect(classScope.kpis.pendingReview).toBe(3);
    expect(classScope.submissionStatus.pendingReview).toBe(3);
    expect(classScope.studentDetail).toBeNull();
    const studentScope = await computeTeacherAnalytics(ctx.container, { classId: "c1", studentId: "s4" });
    expect(studentScope.studentDetail?.userId).toBe("s4");
    expect(studentScope.kpis.pendingReview).toBe(1);   // Phase 8A: s4's own a2 (manual marks override final → pending)
  });
  it("both analytics endpoints contain NO grading interpretation of their own (no finalized / manualReviewMarks reads) — they only consume computeTeacherAnalytics", () => {
    for (const file of ["teacher-analytics.js", "teacher-analytics-ai.js"]) {
      const source = readFileSync(new URL("../src/functions/" + file, import.meta.url), "utf8");
      expect(source).toContain("computeTeacherAnalytics");
      expect(source).not.toMatch(/finalized/);
      expect(source).not.toMatch(/manualReviewMarks/);
      expect(source).not.toMatch(/gradingStatus/);
    }
  });
  it("teacher-analytics-core has NO raw grading-field reads left in code — every interpretation goes through deriveGradingStatus", () => {
    const source = readFileSync(new URL("../src/lib/teacher-analytics-core.js", import.meta.url), "utf8");
    const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
    expect(code).not.toMatch(/\.finalized\b/);
    expect(code).not.toMatch(/manualReviewMarks/);
    expect(code).toMatch(/require\("\.\/grading-status"\)/);
    // Exactly the three migrated sites: classAggregate (class level), scoped KPI (student/global level), assignmentTrend (assignment level).
    expect(code.match(/deriveGradingStatus\([^)]*\) === "pendingReview"/g)).toHaveLength(3);
  });
});
