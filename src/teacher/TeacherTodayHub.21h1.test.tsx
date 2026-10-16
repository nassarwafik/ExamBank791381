// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday, type ProjectEvaluationAttention } from "./TeacherTodayHub";

// Phase 21H.1 (D2) — with the server's `review` block the project card lists the stages students SUBMITTED for review (the
// sidebar badge's figure), not every ungraded stage: its count is stages, its line says how many students, each row says
// how many stages wait; rows start the same evaluation queue (server order) as 9F. Without the block the 9C card is unchanged.
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const BASE: TeacherToday = {
  generatedAt: "2026-10-16T22:00:00.000Z", scope: { activeClasses: 2, students: 40, publishedAssignments: 3 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: []
};
const row = (studentId: string, displayName: string, readyStages: number, graded = 0) => ({ studentId, displayName, classId: "c1", className: "الثاني عشر", projectCode: "794589", projectTitle: "مشروع 794589", gradedStages: graded, totalStages: 105, ungradedStages: 105 - graded, evaluationProgress: 0, readyStages });
const UNGRADED = Array.from({ length: 8 }, (_, i) => ({ ...row("u" + i, "طالب " + i, 0), readyStages: undefined }));
const PE = (review: unknown): ProjectEvaluationAttention => ({ studentsWithUngradedStages: 40, totalUngradedStages: 3765, attentionTotal: 56, capped: true, projects: [], attention: UNGRADED as ProjectEvaluationAttention["attention"], ...(review === undefined ? {} : { review }) } as ProjectEvaluationAttention);
const REVIEW = { studentsAwaitingReview: 23, totalReadyStages: 80, attentionTotal: 23, capped: true, attention: [row("s1", "احمد بدارنة", 5, 12), row("s2", "ايه نصار", 2), row("s3", "حلا نصار", 1), row("s4", "بلا مراحل", 0)] };
let payload: unknown;
beforeEach(() => {
  globalThis.fetch = vi.fn(async () => json({ ok: true, ...BASE, projectEvaluation: payload })) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const mount = async (props: Partial<Parameters<typeof TeacherTodayHub>[0]> = {}) => { render(<TeacherTodayHub token="t" {...props} />); await screen.findByRole("heading", { level: 3, name: /مشاريع|تقييم المشاريع/ }); };

describe("21H.1 TeacherTodayHub — submitted project stages", () => {
  it("counts submitted stages (the badge's figure) and names their students; untouched students are not listed", async () => {
    payload = PE(REVIEW);
    await mount();
    const c = within(screen.getByRole("article", { name: /مراحل مشاريع بانتظار مراجعتك/ }));
    expect(c.getByText("80")).toBeTruthy();
    expect(c.getByText("80 مرحلة من 23 طالبًا")).toBeTruthy();
    expect(c.getByText("5 مراحل بانتظار المراجعة · 12/105 مراحل مقيّمة · الثاني عشر")).toBeTruthy();
    expect(c.getByText(/^مرحلتان بانتظار المراجعة/)).toBeTruthy();
    expect(c.getByText(/^مرحلة واحدة بانتظار المراجعة/)).toBeTruthy();
    expect(c.queryByText(/طالب 0/)).toBeNull();
    expect(c.queryByText(/بلا مراحل/)).toBeNull();                                               // a row with no submitted stage is not review work
    expect(c.getByText("و20 أخرى")).toBeTruthy();
    expect(screen.queryByRole("article", { name: /^تقييم المشاريع/ })).toBeNull();
  });

  it("a row starts the evaluation queue over the review rows in the server's order", async () => {
    payload = PE(REVIEW);
    const onStart = vi.fn();
    await mount({ onStartEvaluationQueue: onStart });
    fireEvent.click(screen.getByRole("button", { name: /لمراجعة ايه نصار/ }));
    expect(onStart).toHaveBeenCalledWith(REVIEW.attention.filter(r => r.readyStages > 0).map(r => ({ projectCode: r.projectCode, classId: r.classId, studentId: r.studentId, displayName: r.displayName })), 1);
  });

  it("nothing submitted → a neutral card that says so (never the 3765 ungraded stages)", async () => {
    payload = PE({ studentsAwaitingReview: 0, totalReadyStages: 0, attentionTotal: 0, capped: false, attention: [] });
    await mount();
    const card = screen.getByRole("article", { name: /مراحل مشاريع بانتظار مراجعتك/ });
    expect(card.className).toContain("tone-neutral");
    expect(within(card).getByText("لا توجد مراحل سلّمها الطلاب بانتظار مراجعتك.")).toBeTruthy();
    expect(card.textContent).not.toContain("3765");
  });

  it("an older payload (no review) or a malformed one keeps the 9C card", async () => {
    payload = PE(undefined);
    await mount();
    expect(screen.getByRole("article", { name: /^تقييم المشاريع/ })).toBeTruthy();
    cleanup();
    payload = PE({ totalReadyStages: "80", attention: [] });
    await mount();
    expect(screen.getByRole("article", { name: /^تقييم المشاريع/ })).toBeTruthy();
  });
});
