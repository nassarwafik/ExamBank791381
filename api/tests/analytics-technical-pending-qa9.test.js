import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// QA-9 — teacher analytics never turn a mark that is provisional for a TECHNICAL reason into an academic signal.
//
// Fail-first (QA on main c244cbab; fail-first run on add00f92): a hidden-test coding answer whose official grading was still open —
// the Runner busy or down ("retryable"), or simply not back yet ("dispatched" / "pending") — entered every analytics average with
// its provisional score (the coding question counted as 0). One such submission put the student in «متابعة» with «معدل منخفض»,
// pulled the class and assignment averages down and filled the «أقل من 60» band. AGENTS.md §10: never manufacture a failing grade
// because of an infrastructure failure. The same holds for a question held for a render failure (Phase 21E.3) the teacher has not
// marked yet.
//
// The owner's decision: such an attempt stays a submission and stays in the pending-review count, but contributes NO score to any
// average, extreme, distribution band, trend or follow-up reason until its mark is settled. An attempt that is pending only for an
// ordinary manual review (an essay the teacher has not marked) is unchanged: its partial score still counts, exactly as R23 pins.
//
// The coding tests run the REAL submission and callback handlers (shared 17C fixtures), then the REAL computeTeacherAnalytics.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const { computeTeacherAnalytics } = require_("../src/lib/teacher-analytics-core.js");
const submission = require_("../src/functions/student-submission.js");
const grading = require_("../src/functions/coding-grading.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const busy = () => F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));
const ANSWERS = { auto1: F.code("a,b=map(int,input().split())\nprint(a+b)\n"), sa1: { kind: "text", value: "x" } };

async function submitCoding(fetch) {
  const ctx = F.seed();
  const r = await submission.handler(F.studentRequest(F.submitBody(ANSWERS)), { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch }, quiet);
  expect(r.status).toBe(200);
  return ctx;
}
const studentRow = data => (data.studentDetail ? data.studentDetail : null);
const followUpOf = (data, userId) => data.followUp.find(item => item.userId === userId) || null;

// The analytics surfaces that carry a score, in one place.
function scoreSurfaces(data) {
  return {
    average: data.kpis.average, highest: data.kpis.highest, lowest: data.kpis.lowest,
    banded: data.gradeDistribution.reduce((sum, bin) => sum + bin.count, 0),
    classAverage: data.classComparison.length ? data.classComparison[0].average : "no-row",
    assignmentAverage: data.assignmentTrend.length ? data.assignmentTrend[0].average : "no-row"
  };
}
const NO_SCORE = { average: null, highest: null, lowest: null, banded: 0, classAverage: null, assignmentAverage: null };

describe("QA-9 a coding mark still open for a technical reason contributes no score to teacher analytics", () => {
  it("Runner busy (retryable RUNNER_BUSY): still a submission and pending — but no average, extreme, band or follow-up «معدل منخفض»", async () => {
    const ctx = await submitCoding(busy());
    const attempt = ctx.getJson(F.SUB).attempts[0];
    expect(attempt.codingGrading.targets.auto1).toMatchObject({ state: "retryable", technicalCode: "RUNNER_BUSY" });
    expect(attempt.percentage).toBeLessThan(60);                                     // the provisional mark the old code averaged
    const data = await computeTeacherAnalytics(ctx.container);
    expect(data.kpis.submissions).toBe(1);
    expect(data.kpis.pendingReview).toBe(1);
    expect(scoreSurfaces(data)).toEqual(NO_SCORE);
    expect(followUpOf(data, F.S1)?.reasons || []).not.toContain("معدل منخفض");
  });

  it("Runner down (retryable EXECUTION_FAILED): same", async () => {
    const ctx = await submitCoding(F.runnerFetch("throw"));
    expect(ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1.state).toBe("retryable");
    expect(scoreSurfaces(await computeTeacherAnalytics(ctx.container))).toEqual(NO_SCORE);
  });

  it("a job dispatched and not called back yet: same (the mark is not known yet)", async () => {
    const ctx = await submitCoding(F.runnerFetch());
    expect(ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1.state).toBe("dispatched");
    expect(scoreSurfaces(await computeTeacherAnalytics(ctx.container))).toEqual(NO_SCORE);
  });

  it("student scope: the student's own average and score trend carry no provisional point, and no «معدل منخفض» is raised", async () => {
    const ctx = await submitCoding(busy());
    const data = await computeTeacherAnalytics(ctx.container, { classId: F.CLASS_ID, studentId: F.S1 });
    expect(studentRow(data)).toMatchObject({ completed: 1, average: null, trendDelta: 0 });
    expect(studentRow(data).reasons).not.toContain("معدل منخفض");                  // (the fixture student never logged in: that reason is real)
    expect(studentRow(data).scoreTrend).toEqual([]);
    expect(data.assignmentTrend[0]).toMatchObject({ submitted: 1, pendingReview: 1, average: null });
  });

  it("once the Runner calls back, the settled mark counts like any other (100% here)", async () => {
    const fetch = F.runnerFetch();
    const ctx = await submitCoding(fetch);
    const [job] = fetch.jobs();
    const cb = await grading.callbackHandler(F.callbackRequest(F.callbackBody(job, F.CANARY.expected)), { getContainer: () => ctx.container, env: F.ENV }, quiet);
    expect(cb.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts[0];
    expect(attempt.codingGrading.targets.auto1.state).toBe("complete");
    expect(attempt.percentage).toBe(100);
    const data = await computeTeacherAnalytics(ctx.container);
    expect(scoreSurfaces(data)).toEqual({ average: 100, highest: 100, lowest: 100, banded: 1, classAverage: 100, assignmentAverage: 100 });
  });

  it("a teacher mark on the coding question settles it even while the target is still open: the attempt counts again", async () => {
    const ctx = await submitCoding(busy());
    const doc = ctx.getJson(F.SUB);
    const a = doc.attempts[0];
    a.manualOverrides = { auto1: { score: 9, comment: "" } };
    a.questionGrades = a.questionGrades.map(g => g.questionId === "auto1" ? { ...g, score: 9, manualReview: false, reviewed: true } : g);
    Object.assign(a, { score: 11, percentage: 91.7, manualReviewMarks: 0, finalized: true });
    ctx.setJson(F.SUB, doc);
    expect(scoreSurfaces(await computeTeacherAnalytics(ctx.container)).average).toBe(91.7);
  });
});

// Stored-shape tests: several students and assignments in one class, each attempt written as the graders store it.
const T0 = Date.parse("2026-03-01T10:00:00.000Z"), iso = ms => new Date(ms).toISOString();
const JOB = "cg_" + "a".repeat(40);
const retryableTarget = () => ({ mode: "hiddenTests", state: "retryable", technicalCode: "RUNNER_BUSY", revision: 1, jobId: JOB });
const finalAttempt = (percentage, at = T0) => ({ attemptNumber: 1, submittedAt: iso(at), score: percentage, totalMarks: 100, percentage, manualReviewMarks: 0, finalized: true, questionGrades: [{ questionId: "q1", score: percentage, maxMarks: 100, manualReview: false }] });
const codingPendingAttempt = (at = T0) => ({ attemptNumber: 1, submittedAt: iso(at), score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false,
  questionGrades: [{ questionId: "auto1", score: 0, maxMarks: 10, manualReview: true }], codingGrading: { version: 1, targets: { auto1: retryableTarget() } } });
const renderHeldAttempt = (at = T0) => ({ attemptNumber: 1, submittedAt: iso(at), score: 0, totalMarks: 10, percentage: 0, manualReviewMarks: 10, finalized: false,
  questionGrades: [{ questionId: "q1", score: 0, maxMarks: 10, manualReview: true, technicalFailure: { code: "chunk-load", reason: "renderFailure" } }],
  renderFailures: { q1: { code: "chunk-load", held: true, reportedAt: iso(at) } } });
const essayPendingAttempt = (at = T0) => ({ attemptNumber: 1, submittedAt: iso(at), score: 4, totalMarks: 10, percentage: 40, manualReviewMarks: 6, finalized: false,
  questionGrades: [{ questionId: "q1", score: 4, maxMarks: 4, manualReview: false }, { questionId: "q2", score: 0, maxMarks: 6, manualReview: true }] });

function seedClass(rows) {
  const seed = { "platform/classes/c1.json": { classId: "c1", name: "صف", active: true, studentIds: [] } };
  const assignments = new Set();
  for (const [studentId, assignmentId, attempt] of rows) {
    seed["platform/users/" + studentId + ".json"] = { userId: studentId, role: "student", active: true, archived: false, classId: "c1", displayName: "طالب " + studentId, code: studentId, lastLoginAt: iso(T0) };
    if (!assignments.has(assignmentId)) {
      const n = assignments.size;
      assignments.add(assignmentId);
      seed["platform/assignments/" + assignmentId + ".json"] = { assignmentId, classId: "c1", status: "published", title: "واجب " + assignmentId, dueAt: iso(T0 + (n + 1) * 864e5), createdAt: iso(T0 + n * 864e5), maxAttempts: 1, examSnapshot: { questions: [] } };
    }
    if (attempt) seed["platform/submissions/" + assignmentId + "/" + studentId + ".json"] = { assignmentId, studentId, classId: "c1", attempts: [attempt], activeAttempt: null };
  }
  return createMemoryContainer(seed).container;
}

describe("QA-9 stored shapes: what is excluded, and what is not", () => {
  it("class of two: 80 (final) + a Runner-pending attempt → average 80, not the old 40; the band count is 1", async () => {
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(80)], ["s2", "a1", codingPendingAttempt()]]));
    expect(data.kpis).toMatchObject({ submissions: 2, pendingReview: 1, average: 80, highest: 80, lowest: 80 });
    expect(data.gradeDistribution.find(bin => bin.label === "أقل من 60").count).toBe(0);
    expect(data.assignmentTrend[0]).toMatchObject({ submitted: 2, pendingReview: 1, average: 80 });
    expect(followUpOf(data, "s2")).toBeNull();
  });

  it("one student, 90 then a Runner-pending attempt: average 90, no «تراجع ملحوظ في الأداء», no follow-up", async () => {
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(90)], ["s1", "a2", codingPendingAttempt(T0 + 864e5)]]), { classId: "c1", studentId: "s1" });
    expect(data.studentDetail).toMatchObject({ completed: 2, average: 90, trendDelta: 0, needsFollowUp: false });
    expect(data.studentDetail.scoreTrend.map(p => p.percentage)).toEqual([90]);
  });

  it("a render-failure hold the teacher has not marked is excluded the same way", async () => {
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(70)], ["s2", "a1", renderHeldAttempt()]]));
    expect(data.kpis).toMatchObject({ submissions: 2, pendingReview: 1, average: 70 });
    expect(followUpOf(data, "s2")).toBeNull();
  });

  it("…and counts again once the teacher marks the held question (the stored hold record stays)", async () => {
    const marked = renderHeldAttempt();
    marked.questionGrades[0] = { ...marked.questionGrades[0], score: 6, manualReview: false, reviewed: true };
    Object.assign(marked, { score: 6, percentage: 60, manualReviewMarks: 0, finalized: true });
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(70)], ["s2", "a1", marked]]));
    expect(data.kpis).toMatchObject({ pendingReview: 0, average: 65, lowest: 60 });
  });

  it("a hold the teacher has marked while another question still awaits an ordinary review: no longer technical — the partial score counts", async () => {
    const mixed = renderHeldAttempt();
    mixed.questionGrades = [{ ...mixed.questionGrades[0], score: 5, manualReview: false, reviewed: true }, { questionId: "q2", score: 0, maxMarks: 10, manualReview: true }];
    Object.assign(mixed, { score: 5, totalMarks: 20, percentage: 25, manualReviewMarks: 10, finalized: false });
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(75)], ["s2", "a1", mixed]]));
    expect(data.kpis).toMatchObject({ pendingReview: 1, average: 50, lowest: 25 });
  });

  it("a held render failure on a question the attempt has no grade for still fails safe (excluded)", async () => {
    const odd = renderHeldAttempt();
    odd.questionGrades = [];
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(70)], ["s2", "a1", odd]]));
    expect(data.kpis.average).toBe(70);
  });

  it("unchanged (R23): an attempt pending only for an ordinary manual review still counts with its partial score", async () => {
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", finalAttempt(80)], ["s2", "a1", essayPendingAttempt()]]));
    expect(data.kpis).toMatchObject({ submissions: 2, pendingReview: 1, average: 60, lowest: 40 });
    expect(followUpOf(data, "s2")?.reasons).toContain("معدل منخفض");
  });

  it("unchanged: a hold record with held:false, or a FINAL attempt carrying an old target, is an ordinary scored attempt", async () => {
    const notHeld = { ...renderHeldAttempt(), renderFailures: { q1: { code: "chunk-load", held: false, reportedAt: iso(T0) } } };
    const finalWithTarget = { ...finalAttempt(50), codingGrading: { version: 1, targets: { auto1: retryableTarget() } } };
    const data = await computeTeacherAnalytics(seedClass([["s1", "a1", notHeld], ["s2", "a1", finalWithTarget]]));
    expect(data.kpis).toMatchObject({ average: 25, lowest: 0, highest: 50 });
  });
});

describe("QA-9 the rule has one home", () => {
  it("teacher-analytics-core reads technical grading state only through technicalGradingPending (no codingGrading / renderFailures reads)", () => {
    const source = readFileSync(new URL("../src/lib/teacher-analytics-core.js", import.meta.url), "utf8");
    const code = source.split("\n").filter(line => !line.trim().startsWith("//")).join("\n");
    expect(code).toMatch(/require\("\.\/technical-grading-hold"\)/);
    expect(code).not.toMatch(/codingGrading|renderFailures|autoGradingPending/);
  });
});
