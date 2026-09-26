import { describe, it, expect } from "vitest";
import { selectTodayContinue, isAttemptable, isDueSoon, moduleOfPage, DUE_SOON_MS, TODAY_PRIORITY, type TodayInput } from "./todayPriority";
import type { Summary } from "../types";
import type { StudentLearningCourse } from "../StudentLearningMaterials";

// Phase 9A — the student priority algorithm is PURE and deterministic; these pin the documented rules.
const NOW = Date.parse("2026-03-10T10:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const H = 60 * 60 * 1000;
const asg = (id: string, over: Partial<Summary> = {}): Summary => ({
  assignmentId: id, title: "واجب " + id, instructions: "", openAt: "", dueAt: iso(NOW + 10 * 24 * H), effectiveDueAt: "", questionCount: 3, totalMarks: 30, durationMinutes: 0,
  availability: "open", dashboardState: "available", gradingStatus: "notSubmitted", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false,
  latestScore: null, latestPercentage: null, latestResult: null, createdAt: "", ...over
});
const final = (pct: number) => ({ attemptNumber: 1, score: pct, totalMarks: 100, percentage: pct, submittedAt: iso(NOW - H), manualReviewMarks: 0, finalized: true, gradingStatus: "final" as const, teacherFeedback: "" });
const COURSE: StudentLearningCourse = { courseId: "791381", title: "شبكات الحاسوب", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }, { moduleId: "791381-m03", title: "الطبقات", order: 2 }] };
const base = (over: Partial<TodayInput> = {}): TodayInput => ({ assignments: [], now: NOW, readerPosition: null, studyLastActivity: null, courses: [COURSE], projects: [], ...over });

describe("9A priority — rules", () => {
  it("1 a live attempt always wins, even over a due-soon assignment and even when canAttempt is false; timed → «تابع الامتحان», paused → «استأنف»", () => {
    const soon = asg("SOON", { dueAt: iso(NOW + 2 * H) });
    const live = asg("LIVE", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "started", canAttempt: false, durationMinutes: 40 });
    const r = selectTodayContinue(base({ assignments: [soon, live] }));
    expect(r).toMatchObject({ type: "activeAttempt", priority: 1, assignmentId: "LIVE", label: "تابع الامتحان" });
    const paused = selectTodayContinue(base({ assignments: [asg("P", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "paused" })] }));
    expect(paused?.label).toBe("استأنف الامتحان");
    const untimed = selectTodayContinue(base({ assignments: [asg("U", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "draft" })] }));
    expect(untimed?.label).toBe("تابع المحاولة");
  });

  it("2 a due-soon attemptable assignment beats the Reader continuation; the EARLIEST deadline wins among several", () => {
    const later = asg("B", { dueAt: iso(NOW + 30 * H) }), sooner = asg("A", { dueAt: iso(NOW + 5 * H) });
    const r = selectTodayContinue(base({ assignments: [later, sooner], readerPosition: { courseId: "791381", pageId: "791381-m03-l01-p02", at: iso(NOW) } }));
    expect(r).toMatchObject({ type: "assignment", priority: 2, assignmentId: "A", label: "ابدأ الحل" });
    expect(isDueSoon(asg("X", { dueAt: iso(NOW + DUE_SOON_MS) }), NOW)).toBe(true);
    expect(isDueSoon(asg("X", { dueAt: iso(NOW + DUE_SOON_MS + 1) }), NOW)).toBe(false);
    expect(isDueSoon(asg("X", { dueAt: iso(NOW - 1) }), NOW)).toBe(false);                     // past deadline is never "soon"
  });

  it("3 Reader continuation: this device's page first (module title from the released list), else the server's latest study page; unreleased content never", () => {
    const device = selectTodayContinue(base({ readerPosition: { courseId: "791381", pageId: "791381-m03-l01-p02", at: iso(NOW) }, studyLastActivity: { courseId: "791381", moduleId: "791381-m01", pageId: "791381-m01-l00-p01", completedAt: iso(NOW - H) } }));
    expect(device).toMatchObject({ type: "reader", priority: 3, courseId: "791381", moduleId: "791381-m03", pageId: "791381-m03-l01-p02", title: "الطبقات", label: "تابع القراءة" });
    const server = selectTodayContinue(base({ studyLastActivity: { courseId: "791381", moduleId: "791381-m01", pageId: "791381-m01-l00-p01", completedAt: iso(NOW - H) } }));
    expect(server).toMatchObject({ type: "reader", moduleId: "791381-m01", pageId: "791381-m01-l00-p01", title: "أساسيات الشبكات" });
    // A page of a module the class no longer has → not offered (falls through to the next rule).
    const hidden = selectTodayContinue(base({ readerPosition: { courseId: "791381", pageId: "791381-m07-l01-p01", at: iso(NOW) } }));
    expect(hidden?.type).toBe("study");
    // Courses unknown (not loaded yet) → no Reader claim at all.
    expect(selectTodayContinue(base({ courses: null, readerPosition: { courseId: "791381", pageId: "791381-m03-l01-p02", at: iso(NOW) } }))).toBeNull();
    expect(moduleOfPage(COURSE, "791381-m03-l01-p02")).toBe("791381-m03");
    expect(moduleOfPage(COURSE, "791381-m09-l01-p02")).toBe("");
  });

  it("4 a project in progress (0 < progress < 100) comes after the Reader and before «start something»", () => {
    const r = selectTodayContinue(base({ courses: [], projects: [{ projectCode: "794589", overallProgress: 40, strengthPoints: 160 }] }));
    expect(r).toMatchObject({ type: "project", priority: 4, projectCode: "794589", label: "تابع المشروع" });
    expect(selectTodayContinue(base({ courses: [], projects: [{ projectCode: "794589", overallProgress: 100, strengthPoints: 400 }] }))).toBeNull();
    expect(selectTodayContinue(base({ courses: [], projects: [{ projectCode: "794589", overallProgress: 0, strengthPoints: 0 }] }))).toBeNull();
  });

  it("5 «start something»: an open assignment without a near deadline, else the first released module; nothing → null", () => {
    const open = selectTodayContinue(base({ assignments: [asg("FAR")] }));
    expect(open).toMatchObject({ type: "study", priority: 5, assignmentId: "FAR", label: "ابدأ الحل" });
    const read = selectTodayContinue(base({}));
    expect(read).toMatchObject({ type: "study", priority: 5, courseId: "791381", moduleId: "791381-m01", label: "ابدأ القراءة", title: "أساسيات الشبكات" });
    expect(selectTodayContinue(base({ courses: [] }))).toBeNull();
    expect(TODAY_PRIORITY).toEqual({ activeAttempt: 1, assignment: 2, reader: 3, project: 4, study: 5 });
  });

  it("never offers: completed without a remaining attempt, awaiting review, scheduled, closed/expired, exhausted attempts", () => {
    const items = [
      asg("DONE", { dashboardState: "completed", gradingStatus: "final", latestResult: final(90), canAttempt: false, attemptsUsed: 1 }),
      asg("WAIT", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", canAttempt: true }),
      asg("SOON", { dashboardState: "scheduled", availability: "scheduled", openAt: iso(NOW + H), canAttempt: false }),
      asg("LATE", { dashboardState: "closedUnsubmitted", availability: "closed", dueAt: iso(NOW - H), canAttempt: false }),
      asg("USED", { canAttempt: false, attemptsUsed: 1, allowedAttempts: 1 })
    ];
    for (const i of items) expect(isAttemptable(i), i.assignmentId).toBe(false);
    expect(selectTodayContinue(base({ assignments: items, courses: [] }))).toBeNull();
  });

  it("a remaining attempt after a final result IS offered («ابدأ محاولة جديدة»); a teacher extension reopens a closed one only through the server's own fields", () => {
    const again = asg("AGAIN", { dashboardState: "completed", gradingStatus: "final", latestResult: final(70), canAttempt: true, attemptsUsed: 1, allowedAttempts: 2, dueAt: iso(NOW + 3 * H) });
    expect(selectTodayContinue(base({ assignments: [again] }))).toMatchObject({ type: "assignment", assignmentId: "AGAIN", label: "ابدأ محاولة جديدة" });
    // Extended: the server now reports open + effectiveDueAt in the future + canAttempt → available again.
    const extended = asg("EXT", { dueAt: iso(NOW - H), effectiveDueAt: iso(NOW + 6 * H), availability: "open", dashboardState: "available", canAttempt: true });
    expect(selectTodayContinue(base({ assignments: [extended] }))).toMatchObject({ type: "assignment", assignmentId: "EXT", dueAt: iso(NOW + 6 * H) });
    // Not extended (still closed) → nothing.
    const closed = asg("CLOSED", { dueAt: iso(NOW - H), availability: "closed", dashboardState: "closedUnsubmitted", canAttempt: false });
    expect(selectTodayContinue(base({ assignments: [closed], courses: [] }))).toBeNull();
  });

  it("is deterministic: the same input always yields the same choice, regardless of array order among equal candidates", () => {
    const a = asg("A", { dueAt: iso(NOW + 5 * H) }), b = asg("B", { dueAt: iso(NOW + 5 * H) });
    const r1 = selectTodayContinue(base({ assignments: [a, b] })), r2 = selectTodayContinue(base({ assignments: [a, b] }));
    expect(r1).toEqual(r2);
    expect(r1?.assignmentId).toBe("A");                                                          // equal deadline → server order
  });
});
