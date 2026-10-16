// Phase 21G.6 — the creation wizard's rules: what blocks each step, how far forward the teacher may jump, the Arabic copy count
// and the review rows.
import { describe, it, expect } from "vitest";
import { WIZARD_STEPS, stepIssues, firstBlockedStep, canReachStep, copiesCount, reviewRows } from "./assignmentWizard";

const OK = { hasContent: true, contentLoading: false, title: "واجب", classIds: ["c1"], windowIssues: [] };
const BAD_WINDOW = [{ field: "dueAt" as const, message: "آخر موعد يجب أن يكون بعد موعد الفتح.", blocking: true }, { field: "dueAt" as const, message: "آخر موعد مضى بالفعل.", blocking: false }];

describe("what blocks each step", () => {
  it("names the five steps in order", () => {
    expect(WIZARD_STEPS.map(s => s.label)).toEqual(["المحتوى", "الصفوف", "المواعيد", "القواعد", "المراجعة"]);
  });
  it("content: needs an exam with questions and a title; says so while it loads", () => {
    expect(stepIssues("content", OK)).toEqual([]);
    expect(stepIssues("content", { ...OK, hasContent: false })).toEqual(["اختر محتوى الواجب: امتحانًا من امتحاناتي أو عنصرًا من المكتبة."]);
    expect(stepIssues("content", { ...OK, title: "  " })).toEqual(["عنوان الواجب مطلوب."]);
    expect(stepIssues("content", { ...OK, hasContent: false, contentLoading: true })).toEqual(["جارٍ فتح الامتحان…"]);
  });
  it("classes: at least one; timing: only BLOCKING window issues (a past deadline is a warning); rules and review are free", () => {
    expect(stepIssues("classes", { ...OK, classIds: [] })).toEqual(["اختر صفًا واحدًا على الأقل."]);
    expect(stepIssues("timing", { ...OK, windowIssues: BAD_WINDOW })).toEqual(["آخر موعد يجب أن يكون بعد موعد الفتح."]);
    expect(stepIssues("timing", { ...OK, windowIssues: [BAD_WINDOW[1]] })).toEqual([]);
    expect(stepIssues("rules", { ...OK, classIds: [], hasContent: false })).toEqual([]);
    expect(stepIssues("review", OK)).toEqual([]);
  });
});

describe("moving between steps", () => {
  it("the first blocked step is where the teacher is sent; none when everything is valid", () => {
    expect(firstBlockedStep(OK)).toBeNull();
    expect(firstBlockedStep({ ...OK, classIds: [] })).toBe("classes");
    expect(firstBlockedStep({ ...OK, hasContent: false, classIds: [] })).toBe("content");
    expect(firstBlockedStep({ ...OK, windowIssues: BAD_WINDOW })).toBe("timing");
  });
  it("backwards is always free; forwards only through valid steps", () => {
    expect(canReachStep("timing", "content", { ...OK, hasContent: false })).toBe(true);
    expect(canReachStep("content", "classes", OK)).toBe(true);
    expect(canReachStep("content", "review", OK)).toBe(true);
    expect(canReachStep("content", "classes", { ...OK, title: "" })).toBe(false);
    expect(canReachStep("content", "review", { ...OK, classIds: [] })).toBe(false);          // blocked at «الصفوف» on the way
    expect(canReachStep("classes", "timing", { ...OK, hasContent: false })).toBe(true);     // the step being left is the one that counts
  });
});

describe("the review", () => {
  it("counts copies in Arabic and lists exactly what each copy will carry", () => {
    expect([1, 2, 3, 10, 11].map(copiesCount)).toEqual(["نسخة واحدة", "نسختان", "3 نسخ", "10 نسخ", "11 نسخة"]);
    const rows = reviewRows({ ...OK, contentTitle: "امتحان الكسور", questionCount: 12, classNames: ["أ", "ب"], openAt: "2026-10-20T08:00", dueAt: "", maxAttempts: 2, durationMinutes: 0, attemptPolicy: "strict", resultsRelease: "manual", publish: false, fmt: v => "«" + v + "»" });
    expect(rows.map(r => r.label + "=" + r.value)).toEqual([
      "المحتوى=امتحان الكسور · 12 سؤال", "العنوان=واجب", "الصفوف=أ، ب (نسختان)", "يفتح=«2026-10-20T08:00»", "آخر موعد=بدون موعد", "المحاولات=2", "مدة المحاولة=بدون مؤقت",
      "طريقة المحاولة=صارم", "إظهار النتائج=يدويًا", "الحالة بعد الإنشاء=مسودة: لا يراها الطلاب حتى تنشرها"
    ]);
  });
});
