// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday, type ProjectEvaluationAttention } from "./TeacherTodayHub";

// Phase 9D — a «تقييم المشاريع» row hands App the EXACT {projectCode, classId, studentId} (onOpenProjectStudent); the
// card's «المشاريع» action stays ordinary Projects navigation; without the 9D callback the 9C / 9A fallbacks still apply.
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const BASE: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 3 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: []
};
const row = (studentId: string, displayName: string, classId: string, projectCode: string, projectTitle: string, graded: number, total: number): ProjectEvaluationAttention["attention"][number] =>
  ({ studentId, displayName, classId, className: "صف " + classId, projectCode, projectTitle, gradedStages: graded, totalStages: total, ungradedStages: total - graded, evaluationProgress: Math.round((graded / total) * 100) });
const PE: ProjectEvaluationAttention = {
  studentsWithUngradedStages: 3, totalUngradedStages: 10, attentionTotal: 3, capped: false,
  projects: [{ projectCode: "899373", title: "AquaSense", studentsWithUngradedStages: 2, totalUngradedStages: 7 }, { projectCode: "883589", title: "EduNet", studentsWithUngradedStages: 1, totalUngradedStages: 3 }],
  attention: [row("s1", "ليان", "c1", "899373", "AquaSense", 3, 7), row("s2", "كريم", "c2", "883589", "EduNet", 5, 8), row("s3", "سارة", "c1", "899373", "AquaSense", 4, 7)]
};
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => (String(input).includes("/api/teacher-today") ? json({ ok: true, ...BASE, projectEvaluation: PE }) : json({ ok: true }))) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = () => screen.getByRole("article", { name: /تقييم المشاريع/ });
const rowButton = (name: RegExp) => within(card()).getByRole("button", { name });

describe("9D TeacherTodayHub — evaluation rows hand App the exact student", () => {
  it("A1 a row sends exactly {projectCode, classId, studentId} — one call, nothing else; two rows of the same project differ by student/class", async () => {
    const onNavigate = vi.fn(), onOpenProject = vi.fn(), onOpenProjectStudent = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProject={onOpenProject} onOpenProjectStudent={onOpenProjectStudent} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم ليان/));
    expect(onOpenProjectStudent).toHaveBeenCalledTimes(1);
    expect(onOpenProjectStudent.mock.calls[0]).toEqual([{ projectCode: "899373", classId: "c1", studentId: "s1" }]);
    fireEvent.click(rowButton(/لتقييم سارة/));
    expect(onOpenProjectStudent.mock.calls[1]).toEqual([{ projectCode: "899373", classId: "c1", studentId: "s3" }]);
    fireEvent.click(rowButton(/لتقييم كريم/));
    expect(onOpenProjectStudent.mock.calls[2]).toEqual([{ projectCode: "883589", classId: "c2", studentId: "s2" }]);
    expect(onOpenProject).not.toHaveBeenCalled();                          // 9D takes precedence over the 9C project-only callback
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("A2 the card's «المشاريع» action stays ordinary Projects navigation (never a drill target)", async () => {
    const onNavigate = vi.fn(), onOpenProject = vi.fn(), onOpenProjectStudent = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProject={onOpenProject} onOpenProjectStudent={onOpenProjectStudent} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(within(card()).getByRole("button", { name: "المشاريع" }));
    expect(onNavigate).toHaveBeenCalledWith("projects");
    expect(onOpenProjectStudent).not.toHaveBeenCalled(); expect(onOpenProject).not.toHaveBeenCalled();
  });
  it("A3 fallbacks stay safe: without the 9D callback a row opens the project (9C); without both it goes to «المشاريع» (9A)", async () => {
    const onNavigate = vi.fn(), onOpenProject = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProject={onOpenProject} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم كريم/));
    expect(onOpenProject).toHaveBeenCalledWith("883589"); expect(onNavigate).not.toHaveBeenCalled();
    cleanup();
    const nav2 = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={nav2} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(rowButton(/لتقييم كريم/));
    expect(nav2).toHaveBeenCalledWith("projects");
  });
});
