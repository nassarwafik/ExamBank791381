// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday, type ProjectEvaluationAttention } from "./TeacherTodayHub";

// Phase 9F — a «تقييم المشاريع» row starts an evaluation QUEUE session: the card's rows in the SERVER's order (never
// re-sorted), starting at the clicked row; the card's «المشاريع» action stays ordinary navigation; without the 9F
// callback the 9D / 9C / 9A fallbacks apply unchanged.
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const BASE: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 3 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: []
};
const row = (studentId: string, displayName: string, classId: string, projectCode: string, projectTitle: string, graded: number, total: number): ProjectEvaluationAttention["attention"][number] =>
  ({ studentId, displayName, classId, className: "صف " + classId, projectCode, projectTitle, gradedStages: graded, totalStages: total, ungradedStages: total - graded, evaluationProgress: Math.round((graded / total) * 100) });
// Deliberately NOT sorted by name or by ungraded count: the server's order is the contract.
const ROWS = [row("s7", "ياسر", "c1", "899373", "AquaSense", 1, 7), row("s2", "أحمد", "c2", "883589", "EduNet", 5, 8), row("s9", "سارة", "c1", "899373", "AquaSense", 4, 7)];
const PE: ProjectEvaluationAttention = { studentsWithUngradedStages: 3, totalUngradedStages: 12, attentionTotal: 3, capped: false, projects: [], attention: ROWS };
const ITEMS = ROWS.map(r => ({ projectCode: r.projectCode, classId: r.classId, studentId: r.studentId, displayName: r.displayName }));
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => (String(input).includes("/api/teacher-today") ? json({ ok: true, ...BASE, projectEvaluation: PE }) : json({ ok: true }))) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = () => screen.getByRole("article", { name: /تقييم المشاريع/ });
const rowButton = (name: RegExp) => within(card()).getByRole("button", { name });

describe("9F TeacherTodayHub — a row starts the evaluation queue", () => {
  it("Q1 clicking the SECOND row starts the queue at index 1 with ALL rows in the server's order (no client re-sort); the 9D callback is not used", async () => {
    const onStart = vi.fn(), onOpenProjectStudent = vi.fn(), onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProjectStudent={onOpenProjectStudent} onStartEvaluationQueue={onStart} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم أحمد/));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0]).toEqual([ITEMS, 1]);
    fireEvent.click(rowButton(/لتقييم سارة/));
    expect(onStart.mock.calls[1]).toEqual([ITEMS, 2]);
    fireEvent.click(rowButton(/لتقييم ياسر/));
    expect(onStart.mock.calls[2]).toEqual([ITEMS, 0]);
    expect(onOpenProjectStudent).not.toHaveBeenCalled(); expect(onNavigate).not.toHaveBeenCalled();
  });
  it("Q2 the card's «المشاريع» action stays ordinary Projects navigation (no queue)", async () => {
    const onStart = vi.fn(), onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onStartEvaluationQueue={onStart} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(within(card()).getByRole("button", { name: "المشاريع" }));
    expect(onNavigate).toHaveBeenCalledWith("projects"); expect(onStart).not.toHaveBeenCalled();
  });
  it("Q3 without the 9F callback a row is exactly the 9D drill (exact student ref); without it too, 9C / 9A", async () => {
    const onOpenProjectStudent = vi.fn(), onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProjectStudent={onOpenProjectStudent} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم أحمد/));
    expect(onOpenProjectStudent).toHaveBeenCalledWith({ projectCode: "883589", classId: "c2", studentId: "s2" });
    cleanup();
    const nav2 = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={nav2} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم أحمد/));
    expect(nav2).toHaveBeenCalledWith("projects");
  });
});
