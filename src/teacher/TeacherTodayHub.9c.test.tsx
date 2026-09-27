// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday, type ProjectEvaluationAttention } from "./TeacherTodayHub";
import { parseProjectEvaluation } from "./teacherTodayEvaluation";

// Phase 9C — the Teacher Today Hub's «تقييم المشاريع» card over the additive `projectEvaluation` block: counts, rows
// (0 is a grade), navigation into the project through App's existing navigation, the positive empty state, the
// partial state, the older payload without the block (UI unchanged), and RTL / accessibility labels.
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
const BASE: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 3 },
  attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } },
  recent: [], partial: []
};
const row = (studentId: string, displayName: string, projectCode: string, projectTitle: string, graded: number, total: number): ProjectEvaluationAttention["attention"][number] =>
  ({ studentId, displayName, classId: "c1", className: "صف 1", projectCode, projectTitle, gradedStages: graded, totalStages: total, ungradedStages: total - graded, evaluationProgress: Math.round((graded / total) * 100) });
const PE: ProjectEvaluationAttention = {
  studentsWithUngradedStages: 7, totalUngradedStages: 18,
  projects: [{ projectCode: "899373", title: "AquaSense", studentsWithUngradedStages: 4, totalUngradedStages: 10 }, { projectCode: "883589", title: "EduNet", studentsWithUngradedStages: 3, totalUngradedStages: 8 }],
  attentionTotal: 7, capped: false,
  attention: [row("s1", "ليان", "899373", "AquaSense", 3, 7), row("s2", "كريم", "883589", "EduNet", 5, 8), row("s3", "سارة", "899373", "BuildPrint", 6, 9)]
};
function mockFetch(body: unknown) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/teacher-today")) return json(body);
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = () => screen.getByRole("article", { name: /تقييم المشاريع/ });

describe("9C TeacherTodayHub — «تقييم المشاريع»", () => {
  it("T15/T16 counts and rows: the badge is the student count, the note carries students + waiting stages, each row shows name — project — graded/total", async () => {
    mockFetch({ ok: true, ...BASE, projectEvaluation: PE });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    const c = within(card());
    expect(c.getByText("7")).toBeTruthy();
    expect(c.getByText("7 طلاب لديهم مراحل مشروع غير مقيّمة · 18 مراحل تنتظر التقييم")).toBeTruthy();
    const rows = within(c.getByRole("list", { name: "طلاب بانتظار تقييم مراحل المشروع" })).getAllByRole("listitem");
    expect(rows.map(r => r.querySelector(".eb-attention-item-label")?.textContent)).toEqual(["ليان — AquaSense", "كريم — EduNet", "سارة — BuildPrint"]);
    expect(rows.map(r => r.querySelector(".eb-attention-item-meta")?.textContent)).toEqual(["3/7 مراحل مقيّمة · صف 1", "5/8 مراحل مقيّمة · صف 1", "6/9 مراحل مقيّمة · صف 1"]);
    expect(screen.queryByText("لا توجد عناصر تحتاج تدخلك الآن.")).toBeNull();                       // ungraded projects are attention, never "quiet"
  });
  it("T17 a 0 score is graded: the row shows the server's graded count as-is (1/7), never «غير مقيّمة» for the zero", async () => {
    const zero = { ...PE, studentsWithUngradedStages: 1, totalUngradedStages: 6, attentionTotal: 1, attention: [row("s9", "نور", "899373", "AquaSense", 1, 7)] };
    mockFetch({ ok: true, ...BASE, projectEvaluation: zero });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    const c = within(card());
    expect(c.getByText("1/7 مراحل مقيّمة · صف 1")).toBeTruthy();
    expect(c.getByText("طالب واحد لديه مراحل مشروع غير مقيّمة · 6 مراحل تنتظر التقييم")).toBeTruthy();
    expect(parseProjectEvaluation(zero)!.attention[0].gradedStages).toBe(1);
  });
  it("T18 empty state: zero students → «لا توجد مراحل مشروع بانتظار التقييم.», no list, and the hub's quiet line still shows", async () => {
    mockFetch({ ok: true, ...BASE, projectEvaluation: { ...PE, studentsWithUngradedStages: 0, totalUngradedStages: 0, projects: [], attentionTotal: 0, attention: [] } });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    const c = within(card());
    expect(c.getByText("لا توجد مراحل مشروع بانتظار التقييم.")).toBeTruthy();
    expect(c.queryByRole("list")).toBeNull();
    expect(screen.getByText("لا توجد عناصر تحتاج تدخلك الآن.")).toBeTruthy();
  });
  it("T19 navigation: a row opens THAT project through onOpenProject; the card action goes to «المشاريع»; without onOpenProject a row falls back to the projects destination", async () => {
    mockFetch({ ok: true, ...BASE, projectEvaluation: PE });
    const onNavigate = vi.fn(), onOpenProject = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenProject={onOpenProject} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(within(card()).getByRole("button", { name: "افتح مشروع EduNet لتقييم كريم — 5/8 مراحل مقيّمة" }));
    expect(onOpenProject).toHaveBeenCalledWith("883589");
    fireEvent.click(within(card()).getByRole("button", { name: "المشاريع" }));
    expect(onNavigate).toHaveBeenCalledWith("projects");
    cleanup();
    const nav2 = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={nav2} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    fireEvent.click(within(card()).getByRole("button", { name: /لتقييم ليان/ }));
    expect(nav2).toHaveBeenCalledWith("projects");
  });
  it("T20 an older payload WITHOUT projectEvaluation renders exactly the 9A hub (four cards, no project card); null → the card degrades alone", async () => {
    mockFetch({ ok: true, ...BASE });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    expect(screen.getAllByRole("article").length).toBe(4);
    expect(screen.queryByRole("article", { name: /تقييم المشاريع/ })).toBeNull();
    expect(screen.getByText("لا توجد عناصر تحتاج تدخلك الآن.")).toBeTruthy();
    cleanup();
    mockFetch({ ok: true, ...BASE, projectEvaluation: null, partial: ["projectEvaluation"] });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    expect(within(card()).getByText("تعذر قراءة تقييم المشاريع الآن؛ بقية الملخص محدّثة.")).toBeTruthy();
    expect(within(card()).getByText("—")).toBeTruthy();
    expect(parseProjectEvaluation(undefined)).toBeUndefined(); expect(parseProjectEvaluation({ studentsWithUngradedStages: "x" })).toBeNull();
    expect(parseProjectEvaluation({ studentsWithUngradedStages: 1, totalUngradedStages: 2, attention: [{ studentId: "a", projectCode: "p", gradedStages: 1, totalStages: 3 }, { junk: true }] })!.attention).toEqual([{ studentId: "a", displayName: "a", classId: "", className: "", projectCode: "p", projectTitle: "p", gradedStages: 1, totalStages: 3, ungradedStages: 2, evaluationProgress: 0 }]);
  });
  it("T21 RTL / accessibility: the card is a labelled article, the list is named, every row is a real button with a full Arabic label, «و N أخرى» reflects the server total beyond the preview", async () => {
    const many = { ...PE, attentionTotal: 23, capped: true, attention: Array.from({ length: 20 }, (_, i) => row("s" + i, "طالب " + i, "899373", "AquaSense", i % 7, 7)) };
    mockFetch({ ok: true, ...BASE, projectEvaluation: many });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { level: 3, name: /تقييم المشاريع/ });
    const c = within(card());
    expect(card().getAttribute("aria-labelledby")).toBe("eb-today-project-eval");
    const buttons = within(c.getByRole("list", { name: "طلاب بانتظار تقييم مراحل المشروع" })).getAllByRole("button");
    expect(buttons.length).toBe(8);                                                                   // preview of 8 rows
    for (const b of buttons) expect(b.getAttribute("aria-label")).toMatch(/^افتح مشروع AquaSense لتقييم طالب \d+ — \d\/7 مراحل مقيّمة$/);
    expect(c.getByText("و15 أخرى")).toBeTruthy();                                                     // 23 total − 8 shown, from attentionTotal (never the capped array)
    expect(document.querySelector(".eb-today-project-eval .eb-attention-item-meta")?.getAttribute("dir")).toBe("auto");
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(card().textContent || "")).toBe(false);
  });
});
