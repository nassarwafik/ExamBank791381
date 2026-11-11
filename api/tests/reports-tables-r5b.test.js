// Phase R-5b — the statistics behind the Reports Center tables (docs/enterprise-reports-tables-r5b.md): highest / lowest / median
// of each assessment's FINAL results, and the spread of the students' averages with who holds the highest and the lowest.
// The grading-safety rule is the point: a result awaiting the teacher (its provisional score is 0) and a student who never
// handed in are in none of these figures — they are never «the lowest» — and with no final result every figure is null, not 0.
// TEST data only.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ins = require("../src/lib/reports/insights.js");
const { handler: reports } = require("../src/functions/reports.js");
const { createMemoryContainer } = require("./fixtures/memory-container.js");

const final = (percentage, extra = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: percentage / 10, totalMarks: 10, percentage, manualReviewMarks: 0, finalized: true, ...extra });
const pending = () => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false });
const sub = (...attempts) => ({ attempts });

describe("R-5b A — spread (pure)", () => {
  it("highest, lowest, median (odd and even counts) and the population standard deviation, to 1 dp", () => {
    expect(ins.spread([70, 90, 50])).toEqual({ highest: 90, lowest: 50, median: 70, stdDev: 16.3 });
    expect(ins.spread([40, 60, 80, 100])).toEqual({ highest: 100, lowest: 40, median: 70, stdDev: 22.4 });
    expect(ins.spread([55.55])).toEqual({ highest: 55.6, lowest: 55.6, median: 55.6, stdDev: 0 });
    expect(ins.spread([0, 100])).toEqual({ highest: 100, lowest: 0, median: 50, stdDev: 50 });        // a REAL zero counts
  });
  it("no final result → every figure null (never 0); non-numbers are ignored, the input is not reordered", () => {
    expect(ins.spread([])).toEqual({ highest: null, lowest: null, median: null, stdDev: null });
    expect(ins.spread([null, undefined, Number.NaN, "80"])).toEqual({ highest: null, lowest: null, median: null, stdDev: null });
    const input = [90, 10, 50];
    ins.spread(input);
    expect(input).toEqual([90, 10, 50]);
  });
  it("assessmentSpread: final results of the roster only — a pending provisional 0 and a missing student are not the lowest", () => {
    const students = [{ studentId: "s1" }, { studentId: "s2" }, { studentId: "s3" }, { studentId: "s4" }];
    const subs = new Map(Object.entries({ s1: sub(final(80)), s2: sub(pending()), s4: sub(final(60)), outsider: sub(final(5)) }));
    expect(ins.assessmentSpread(students, subs)).toEqual({ highest: 80, lowest: 60, median: 70 });
    expect(ins.assessmentSpread(students, new Map(Object.entries({ s2: sub(pending()) })))).toEqual({ highest: null, lowest: null, median: null });
  });
  it("standingsSummary: who holds the highest and the lowest average; a student with no final result is left out; a tie keeps roster order", () => {
    const st = (studentId, average) => ({ studentId, displayName: "طالب " + studentId, average, graded: 0, pending: 0, missing: 0 });
    expect(ins.standingsSummary([st("a", 40), st("none", null), st("b", 90), st("c", 90), st("d", 40)])).toEqual({
      highest: { studentId: "b", displayName: "طالب b", average: 90 }, lowest: { studentId: "a", displayName: "طالب a", average: 40 },
      median: 65, stdDev: 25, withAverage: 4
    });
    expect(ins.standingsSummary([st("none", null)])).toEqual({ highest: null, lowest: null, median: null, stdDev: null, withAverage: 0 });
    expect(ins.standingsSummary([])).toEqual({ highest: null, lowest: null, median: null, stdDev: null, withAverage: 0 });
  });
});

describe("R-5b B — the REAL reports handler carries the statistics (additive)", () => {
  const CP = "platform/classes/", UP = "platform/users/", AP = "platform/assignments/", SP = "platform/submissions/";
  const stu = (userId, displayName) => ({ userId, role: "student", active: true, archived: false, classId: "c1", displayName });
  const asg = (id, createdAt) => ({ assignmentId: id, classId: "c1", status: "published", title: "واجب " + id, createdAt, totalMarks: 10 });
  const doc = (aid, sid, ...attempts) => ({ assignmentId: aid, studentId: sid, classId: "c1", attempts, activeAttempt: null });
  // a1: s1 80, s2 pending (provisional 0), s3 missing, s4 60.   a2: s1 a REAL 0, s2 60, s3 missing, s4 90.
  const seed = () => createMemoryContainer({
    [CP + "c1.json"]: { classId: "c1", name: "صف أ", status: "active", studentIds: ["s1", "s2", "s3", "s4"], schoolYear: "2025-2026" },
    [UP + "s1.json"]: stu("s1", "أحمد"), [UP + "s2.json"]: stu("s2", "بلال"), [UP + "s3.json"]: stu("s3", "جمال"), [UP + "s4.json"]: stu("s4", "دانا"),
    [AP + "a1.json"]: asg("a1", "2026-02-05T10:00:00.000Z"), [AP + "a2.json"]: asg("a2", "2026-03-05T10:00:00.000Z"),
    [SP + "a1/s1.json"]: doc("a1", "s1", final(80)), [SP + "a1/s2.json"]: doc("a1", "s2", pending()), [SP + "a1/s4.json"]: doc("a1", "s4", final(60)),
    [SP + "a2/s1.json"]: doc("a2", "s1", final(0)), [SP + "a2/s2.json"]: doc("a2", "s2", final(60)), [SP + "a2/s4.json"]: doc("a2", "s4", final(90))
  });
  const deps = ctx => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container });
  const report = async (ctx, qs) => { const r = await reports({ method: "GET", url: "https://x/api/reports?" + qs }, deps(ctx)); expect(r.status).toBe(200); return r.jsonBody; };

  it("assessments report: each row gains its day and highest / lowest / median; every earlier field is as it was", async () => {
    const body = await report(seed(), "type=assignments&classId=c1");
    const [a1, a2] = body.perAssignment;
    expect(a1).toMatchObject({ assignmentId: "a1", date: "2026-02-05", highest: 80, lowest: 60, median: 70 });          // the pending 0 is not the lowest
    expect(a2).toMatchObject({ assignmentId: "a2", date: "2026-03-05", highest: 90, lowest: 0, median: 60 });           // the REAL zero is
    expect(a1).toMatchObject({ students: 4, submitted: 3, missing: 1, pendingReview: 1, zeroScores: 0, submissionRate: 75, average: 70, avgAttempts: 1 });
    expect(Object.keys(a1).sort()).toEqual(["assignmentId", "average", "avgAttempts", "date", "highest", "lowest", "median", "missing", "pendingReview", "students", "submissionRate", "submitted", "title", "zeroScores"]);
  });
  it("class report: every assessment point carries the same three figures as its assessments-report row", async () => {
    const ctx = seed();
    const cls = await report(ctx, "type=class&classId=c1");
    const rows = (await report(ctx, "type=assignments&classId=c1")).perAssignment;
    expect(cls.insights.assessments.map(p => [p.highest, p.lowest, p.median])).toEqual(rows.map(r => [r.highest, r.lowest, r.median]));
  });
  it("class report summary: the spread of the students' averages; the student with no final result is not «the lowest»", async () => {
    const cls = await report(seed(), "type=class&classId=c1");
    // averages: s1 40 (80, 0) · s2 60 (pending excluded) · s3 none · s4 75
    expect(cls.insights.summary).toEqual({
      highest: { studentId: "s4", displayName: "دانا", average: 75 }, lowest: { studentId: "s1", displayName: "أحمد", average: 40 },
      median: 60, stdDev: 14.3, withAverage: 3
    });
  });
  it("an assessment nobody has a final result in: null figures, never 0", async () => {
    const ctx = seed();
    ctx.setJson(AP + "a3.json", asg("a3", "2026-04-01T10:00:00.000Z"));
    ctx.setJson(SP + "a3/s2.json", doc("a3", "s2", pending()));
    const a3 = (await report(ctx, "type=assignments&classId=c1")).perAssignment[2];
    expect(a3).toMatchObject({ assignmentId: "a3", submitted: 1, pendingReview: 1, average: null, highest: null, lowest: null, median: null });
  });
});
