// Phase R-1 — Reports accuracy. Owner decision D-1 (docs/reports-center-audit.md): a latest result that still awaits the teacher
// (deriveGradingStatus → "pendingReview": manual marks, unfinalized, a coding target still grading or held for review, a technical
// hold) is NEVER an academic zero and never enters an average, a distribution, a highest or a lowest — on the Reports Center, the
// assignments home (assignment-progress) and the gradebook (assignment-results) alike. It still counts as SUBMITTED (the student
// handed it in). Also pinned: «متوسط المحاولات» is per submitting student, and a short timeline range keeps the partial first week.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const agg = require("../src/lib/reports/aggregate.js");
const { buildHistoryTimeline } = require("../src/lib/reports/timeline.js");
const { parseDateRange } = require("../src/lib/reports/date-range.js");
const { handler: reportsHandler } = require("../src/functions/reports.js");
const { deriveAssignmentProgress } = require("../src/lib/assignment-progress.js");
const results = require("../src/functions/assignment-results.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const final = (percentage, extra = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: percentage / 10, totalMarks: 10, percentage, manualReviewMarks: 0, finalized: true, ...extra });
// A coding / essay attempt still awaiting the teacher: the provisional score is 0 (the canonical "manualReview" base).
const pending = (extra = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false, ...extra });
const sub = (...attempts) => ({ attempts });

describe("R-1 A — aggregate: a pending result is its own state, never a zero", () => {
  it("studentOutcome → pending (no percentage) for manual marks, unfinalized, or both", () => {
    expect(agg.studentOutcome(sub(pending()))).toMatchObject({ state: "pending", percentage: null, score: null, attempts: 1 });
    expect(agg.studentOutcome(sub(final(70, { finalized: false, manualReviewMarks: 0 }))).state).toBe("pending");
    expect(agg.studentOutcome(sub(final(70, { finalized: true, manualReviewMarks: 2 }))).state).toBe("pending");
    // legacy (no finalized flag, no manual marks) stays a final submitted result — unchanged
    expect(agg.studentOutcome(sub({ score: 0, percentage: 0 }))).toMatchObject({ state: "submitted", percentage: 0 });
    // only the LATEST attempt decides: an earlier final result does not leak while the newest awaits the teacher
    expect(agg.studentOutcome(sub(final(90), pending({ attemptNumber: 2 })))).toMatchObject({ state: "pending", attempts: 2 });
  });
  it("assignmentStats: pending counts as submitted, never as a zero, never in the average", () => {
    const st = agg.assignmentStats([
      { studentId: "a", submission: sub(final(80)) },
      { studentId: "b", submission: sub(pending()) },
      { studentId: "c", submission: null }
    ]);
    expect(st).toMatchObject({ students: 3, submitted: 2, missing: 1, pendingReview: 1, zeroScores: 0, submissionRate: 67, average: 80 });
  });
  it("avgAttempts is per SUBMITTING student (non-submitters have no attempts to average)", () => {
    const st = agg.assignmentStats([
      { studentId: "a", submission: sub(final(10), final(10), final(50)) },
      { studentId: "b", submission: null },
      { studentId: "c", submission: null }
    ]);
    expect(st.avgAttempts).toBe(3);
  });
  it("studentAcademicAverage pools FINAL results only and reports the pending count", () => {
    expect(agg.studentAcademicAverage([sub(final(100)), sub(pending()), null, sub(final(50))])).toEqual({ average: 75, submittedCount: 3, pendingCount: 1 });
  });
});

describe("R-1 B — the REAL reports handler excludes pending results from every academic figure", () => {
  const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
  const T0 = "2026-03-01T10:00:00.000Z";
  const stu = userId => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + userId });
  const asg = id => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, createdAt: T0, totalMarks: 10 });
  const doc = (aid, sid, ...attempts) => ({ assignmentId: aid, studentId: sid, classId: "c1", attempts, activeAttempt: null });
  // a1: s1 final 80, s2 pending (provisional 0), s3 missing.   a2: s1 final 0 (a REAL zero), s2 final 60, s3 missing.
  const seed = () => createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2", "s3"], schoolYear: "2025-2026" },
    [UP + "s1.json"]: stu("s1"), [UP + "s2.json"]: stu("s2"), [UP + "s3.json"]: stu("s3"),
    [AP + "a1.json"]: asg("a1"), [AP + "a2.json"]: asg("a2"),
    [SP + "a1/s1.json"]: doc("a1", "s1", final(80)), [SP + "a1/s2.json"]: doc("a1", "s2", pending()),
    [SP + "a2/s1.json"]: doc("a2", "s1", final(0)), [SP + "a2/s2.json"]: doc("a2", "s2", final(60))
  });
  const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
  const report = async (ctx, qs) => (await reportsHandler({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx))).jsonBody;

  it("assignments report: per-assessment pendingReview, real zero kept, pending cell has no percentage, pooled figures final-only", async () => {
    const body = await report(seed(), "type=assignments&classId=c1");
    const [a1, a2] = body.perAssignment;
    expect(a1).toMatchObject({ assignmentId: "a1", submitted: 2, missing: 1, pendingReview: 1, zeroScores: 0, submissionRate: 67, average: 80 });
    expect(a2).toMatchObject({ assignmentId: "a2", submitted: 2, missing: 1, pendingReview: 0, zeroScores: 1, average: 30 });
    const cell = (aid, sid) => body.matrix.find(m => m.assignmentId === aid).cells.find(c => c.studentId === sid);
    expect(cell("a1", "s2")).toMatchObject({ state: "pending", percentage: null });
    expect(cell("a2", "s1")).toMatchObject({ state: "submitted", percentage: 0, zero: true });
    expect(cell("a1", "s1")).toMatchObject({ state: "submitted", percentage: 80, zero: false });
    // 4 handed-in cells of 6 (pending included), 3 final results pooled (80, 0, 60), the pending provisional 0 nowhere
    expect(body.overall).toMatchObject({ participants: 4, pendingReview: 1, submissionRate: 67, average: 46.7 });
    expect(Object.values(body.overall.distribution).reduce((s, n) => s + n, 0)).toBe(3);
    expect(body.overall.distribution["0-49"]).toBe(1);
  });
  it("class report: averageScore is final-only, the pending count is reported, the submission rate counts it as handed in", async () => {
    const body = await report(seed(), "type=class&classId=c1");
    expect(body.kpis).toMatchObject({ assignments: 2, averageScore: 46.7, submissionRate: 67, pendingReview: 1 });
  });
  it("student report: the pending result is submitted but not averaged", async () => {
    const body = await report(seed(), "type=student&studentId=s2");
    expect(body.academic).toMatchObject({ average: 60, submittedCount: 2, assessmentCount: 2, submissionRate: 100, pendingCount: 1 });
  });
});

describe("R-1 C — a short timeline range keeps the week it starts in", () => {
  const def = { tracks: [{ trackId: "book" }], trackWeights: { book: 100 }, stages: [{ stageId: "B01", track: "book", active: true, required: true, weight: 1 }] };
  const entries = [{ studentId: "s", progress: { history: [{ type: "status", stageId: "B01", toStatus: "approved", createdAt: "2026-09-01T10:00:00Z" }] } }];
  it("«آخر 7 أيام» (Wed 14 → Tue 20 Oct 2026) spans two weeks → two points (the partial first week is not dropped)", () => {
    const trend = buildHistoryTimeline(def, entries, parseDateRange("2026-10-14", "2026-10-20"), "2026-10-20T12:00:00Z");
    expect(trend.map(p => p.weekStart)).toEqual(["2026-10-11", "2026-10-18"]);
  });
  it("a week that ends before the range starts is still excluded", () => {
    const trend = buildHistoryTimeline(def, entries, parseDateRange("2026-10-18", "2026-10-20"), "2026-10-20T12:00:00Z");
    expect(trend.map(p => p.weekStart)).toEqual(["2026-10-18"]);
  });
});

describe("R-1 D — the assignments home and the gradebook apply the same rule (D-1 parity)", () => {
  const members = ["s1", "s2", "s3"].map(userId => ({ userId }));
  it("assignment-progress: average over FINAL results only; pending still submitted", () => {
    const subs = new Map([["s1", sub(final(80))], ["s2", sub(pending())], ["s3", sub(final(60))]]);
    expect(deriveAssignmentProgress(members, subs)).toMatchObject({ submitted: 3, pendingReview: 1, graded: 2, average: 70 });
  });
  it("assignment-progress: only pending results → no average (never a manufactured 0)", () => {
    expect(deriveAssignmentProgress(members, new Map([["s1", sub(pending())]])).average).toBe(null);
  });
  it("gradebook stats: average / highest / lowest over FINAL results only", async () => {
    const mem = createMemoryContainer({
      "platform/assignments/a1.json": { assignmentId: "a1", classId: "c1", status: "published", title: "واجب", totalMarks: 10, maxAttempts: 1, examSnapshot: { questions: [] } },
      "platform/classes/c1.json": { classId: "c1", name: "صف", status: "active" },
      ...Object.fromEntries(["s1", "s2", "s3"].map(id => ["platform/users/" + id + ".json", { userId: id, role: "student", active: true, archived: false, classId: "c1", displayName: id }])),
      "platform/submissions/a1/s1.json": { assignmentId: "a1", studentId: "s1", attempts: [final(80)] },
      "platform/submissions/a1/s2.json": { assignmentId: "a1", studentId: "s2", attempts: [pending()] },
      "platform/submissions/a1/s3.json": { assignmentId: "a1", studentId: "s3", attempts: [final(60)] }
    });
    const d = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: mem.container, getContainer: () => mem.container };
    const res = await results.handler({ method: "GET", url: "http://x/api/assignment-results?assignmentId=a1", headers: { get: () => "" }, json: async () => ({}) }, d);
    expect(res.status).toBe(200);
    expect(res.jsonBody.stats).toMatchObject({ submitted: 3, pendingReview: 1, finalized: 2, average: 70, highest: 80, lowest: 60 });
  });
});
