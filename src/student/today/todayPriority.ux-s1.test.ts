import { describe, it, expect } from "vitest";
import { selectTodayContinue, type TodayInput } from "./todayPriority";
import { nowItems } from "../portalPresentation";
import type { Summary } from "../types";
import type { StudentLearningCourse } from "../StudentLearningMaterials";

// UX-S1 (approved design docs/enterprise-ux-student-s1.md §2.1) — an extra attempt after a FINAL result is optional: it never
// outranks required work that was not started, never takes the red «موعد قريب» slot, and the hub's choice agrees with
// «ماذا عليّ أن أفعل الآن؟» (nowItems). It is still offered when nothing more important exists, as «محاولة إضافية (اختيارية)».
// Order only: canAttempt / availability / dashboardState stay the server's. TEST data only.
const NOW = Date.parse("2026-11-07T10:00:00.000Z");
const H = 3600e3;
const iso = (ms: number) => new Date(ms).toISOString();
const asg = (id: string, over: Partial<Summary> = {}): Summary => ({
  assignmentId: id, title: "واجب " + id, instructions: "", openAt: "", dueAt: iso(NOW + 5 * 24 * H), effectiveDueAt: "", questionCount: 10, totalMarks: 100, durationMinutes: 0,
  availability: "open", dashboardState: "available", gradingStatus: "notSubmitted", attemptsUsed: 0, allowedAttempts: 2, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false,
  latestScore: null, latestPercentage: null, latestResult: null, createdAt: "", ...over
});
const finalResult = (pct: number, visible = true) => ({ attemptNumber: 1, score: pct, totalMarks: 100, percentage: pct, submittedAt: iso(NOW - H), manualReviewMarks: 0, finalized: true, gradingStatus: "final" as const, teacherFeedback: "", ...(visible ? {} : { resultsVisible: false }) });
const retryable = (id: string, pct: number, dueIn: number, visible = true) => asg(id, { dashboardState: "completed", gradingStatus: "final", latestResult: finalResult(pct, visible), attemptsUsed: 1, dueAt: iso(NOW + dueIn) });
const COURSE: StudentLearningCourse = { courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }] };
const base = (over: Partial<TodayInput> = {}): TodayInput => ({ assignments: [], now: NOW, readerPosition: null, studyLastActivity: null, courses: [COURSE], projects: [], ...over });

describe("UX-S1 — one consistent next step", () => {
  it("fail-first: an optional extra attempt due in 20h never outranks an assignment that was not started (baseline: the retry, in red)", () => {
    const items = [retryable("DONE", 0, 20 * H), asg("NEW", { durationMinutes: 30 })];
    const hero = selectTodayContinue(base({ assignments: items }));
    expect(hero).toMatchObject({ assignmentId: "NEW", label: "ابدأ الامتحان" });
    expect(hero?.type).not.toBe("retry");
  });

  it("the hub's assignment is the first row of «ماذا عليّ أن أفعل الآن؟» (items in the server's order: by deadline)", () => {
    const items = [retryable("DONE", 0, 20 * H), asg("NEW"), asg("LATER", { dueAt: iso(NOW + 9 * 24 * H) })];
    const hero = selectTodayContinue(base({ assignments: items, courses: [] }));
    expect(hero?.assignmentId).toBe(nowItems(items).actionable[0].assignmentId);
  });

  it("a due-soon assignment that was not started keeps the «موعد قريب» slot (rule 2 unchanged for required work)", () => {
    const hero = selectTodayContinue(base({ assignments: [retryable("DONE", 40, 2 * H), asg("SOON", { dueAt: iso(NOW + 10 * H) })] }));
    expect(hero).toMatchObject({ type: "assignment", assignmentId: "SOON", label: "ابدأ الحل" });
  });

  it("alone, the extra attempt is still offered — as «محاولة إضافية (اختيارية)», type retry, with the final result and the deadline", () => {
    const hero = selectTodayContinue(base({ assignments: [retryable("DONE", 40, 20 * H)], courses: [] }));
    expect(hero).toMatchObject({ type: "retry", assignmentId: "DONE", label: "ابدأ محاولة جديدة" });
    expect(hero?.reason).toContain("نتيجتك النهائية 40%");
    expect(hero?.reason).toContain("لديك محاولة متبقية");
  });

  it("a Reader continuation comes before an optional extra attempt", () => {
    const hero = selectTodayContinue(base({ assignments: [retryable("DONE", 40, 20 * H)], readerPosition: { courseId: "791381", pageId: "791381-m01-p2", at: iso(NOW - H) } }));
    expect(hero?.type).toBe("reader");
  });

  it("an unreleased result never shows its percentage", () => {
    const hero = selectTodayContinue(base({ assignments: [retryable("DONE", 40, 20 * H, false)], courses: [] }));
    expect(hero?.type).toBe("retry");
    expect(hero?.reason).not.toMatch(/%/);
  });

  it("among several extra attempts, the earliest deadline first; none beats the first released module… only when no attempt exists", () => {
    const hero = selectTodayContinue(base({ assignments: [retryable("B", 10, 30 * H), retryable("A", 10, 6 * H)] }));
    expect(hero).toMatchObject({ type: "retry", assignmentId: "A" });
    expect(selectTodayContinue(base({}))).toMatchObject({ type: "study", label: "ابدأ القراءة" });
  });
});
