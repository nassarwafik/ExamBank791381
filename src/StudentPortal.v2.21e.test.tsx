// @vitest-environment happy-dom
// Phase 21E V2 — Student Portal visual release. Behavioural guards for what the release adds:
//   • the at-a-glance strip shows ONLY server values (stats / strength) or the portal's own task-state derivation (the
//     same items «ماذا عليّ أن أفعل الآن؟» lists); a missing value reads «—», never a guessed zero;
//   • each tile scrolls to the section that explains it;
//   • a failed dashboard read offers ONE explicit retry of the same read (no automatic loop) and recovers on success;
//   • the first-load skeleton is decorative (aria-hidden) and the status line is still announced;
//   • the stylesheet stays scoped to the V2 portal root / student shell.
/// <reference types="node" />
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const asg = (id: string, over: Record<string, unknown>) => ({
  assignmentId: id, title: id, instructions: "", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "", questionCount: 4, totalMarks: 100,
  durationMinutes: 0, availability: "open", attemptsUsed: 0, allowedAttempts: 2, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false,
  latestScore: null, latestPercentage: null, latestResult: null, createdAt: "", ...over,
});
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 4, completed: 1, average: 60, pendingReview: 3, finalized: 1, inProgress: 1, averageFinalized: 77.6 };
const strength = { rawTotalPoints: 830, totalPoints: 830, examPoints: 830, practicePoints: 0, studyPoints: 0, projectPoints: 0, stagePoints: 830, stageMaxPoints: 2000, stageNumber: 11, stageCount: 25, stageBlockSize: 80, stageFloor: 800, withinStagePoints: 30, stagePercent: 38, nextStageNumber: 12, nextStageRemaining: 50, pointsToMaximum: 1170, isMaximumStage: false, pathComplete: false, legacyRank: null, projects: [] };
const assignments = [
  asg("A1", { dashboardState: "available" }),
  asg("A2", { dashboardState: "inProgress", hasActiveAttempt: true, attemptsUsed: 1 }),
  asg("A3", { dashboardState: "scheduled", availability: "scheduled", canAttempt: false }),
];

function mount(dashboards: Array<{ status: number; body: unknown }>) {
  let n = 0;
  const dashboardGets = () => n;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) { const d = dashboards[Math.min(n, dashboards.length - 1)]; n++; return res(d.status, d.body); }
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { dashboardGets, onLogout };
}
const strip = async () => within(await screen.findByRole("list", { name: "ملخص سريع" }));
const tile = (s: ReturnType<typeof within>, label: string) => s.getByText(label).closest("button") as HTMLButtonElement;

describe("21E V2 — at-a-glance strip", () => {
  it("shows the actionable count (inProgress + available), the server's pending-review count, the finalized average and the server stage", async () => {
    mount([{ status: 200, body: { student, classroom, assignments, stats, strength } }]);
    const s = await strip();
    expect(tile(s, "مطلوب الآن").textContent).toContain("2");                       // A1 + A2 (A3 is only scheduled)
    expect(tile(s, "مطلوب الآن").textContent).toContain("1 قيد الحل");
    expect(tile(s, "بانتظار التصحيح").textContent).toContain("3");
    expect(tile(s, "معدّلي النهائي").textContent).toContain("78%");                  // averageFinalized 77.6, rounded
    expect(tile(s, "مرحلة القوة").textContent).toContain("11");
    expect(tile(s, "مرحلة القوة").textContent).toContain("من 25 مرحلة");
  });

  it("reads «—» (never a guessed 0) when the server has no finalized average or no strength", async () => {
    mount([{ status: 200, body: { student, classroom, assignments: [], stats: { ...stats, averageFinalized: null, pendingReview: 0, inProgress: 0 } } }]);
    const s = await strip();
    expect(tile(s, "معدّلي النهائي").querySelector(".eb-sp-kpi-value")!.textContent).toBe("—");
    expect(tile(s, "مرحلة القوة").querySelector(".eb-sp-kpi-value")!.textContent).toBe("—");
    expect(tile(s, "مطلوب الآن").querySelector(".eb-sp-kpi-value")!.textContent).toBe("0");
  });

  it("each tile scrolls to the section that explains it", async () => {
    const scrolled: string[] = [];
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) { scrolled.push(this.id); });
    mount([{ status: 200, body: { student, classroom, assignments, stats, strength } }]);
    const s = await strip();
    fireEvent.click(tile(s, "مطلوب الآن"));
    fireEvent.click(tile(s, "بانتظار التصحيح"));
    fireEvent.click(tile(s, "معدّلي النهائي"));
    await waitFor(() => expect(scrolled).toEqual(["eb-sp-now-title", "eb-sp-tasks-title", "eb-sp-progress-title"]));
  });
});

describe("21E V2 — loading and failure states", () => {
  it("a failed dashboard read shows the error and ONE explicit retry, which re-reads once and renders the portal", async () => {
    const { dashboardGets, onLogout } = mount([
      { status: 500, body: { ok: false, error: "تعذّر تحميل بياناتك الآن." } },
      { status: 200, body: { student, classroom, assignments, stats, strength } },
    ]);
    expect(await screen.findByRole("alert")).toBeTruthy();
    const retry = await screen.findByRole("button", { name: "إعادة المحاولة" });
    await waitFor(() => {});
    expect(dashboardGets()).toBe(1);                                                       // no automatic retry loop
    fireEvent.click(retry);
    expect(await screen.findByRole("list", { name: "ملخص سريع" })).toBeTruthy();
    expect(dashboardGets()).toBe(2);
    expect(screen.queryByRole("button", { name: "إعادة المحاولة" })).toBeNull();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("the first-load skeleton is decorative and the status line is still announced", async () => {
    let release: () => void = () => {};
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return new Promise<Response>(r => { release = () => r({ status: 200, ok: true, json: async () => ({ student, classroom, assignments, stats, strength }) } as Response); });
      return res(200, { ok: true, posts: [], materials: [], enrolled: false });
    }) as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
    const skeleton = document.querySelector(".eb-sp-skeleton")!;
    expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("جارٍ تحميل حسابك...");
    release();
    await screen.findByRole("list", { name: "ملخص سريع" });
    expect(document.querySelector(".eb-sp-skeleton")).toBeNull();
  });
});

describe("21E V2 — stylesheet scope", () => {
  it("every rule is scoped to the V2 portal, the student shell or the V2-only components", () => {
    const css = readFileSync(join(process.cwd(), "src/student/student-portal-v2.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = (css.match(/[^{}]+\{/g) ?? []).map(s => s.replace("{", "").trim()).filter(s => !s.startsWith("@") && !/^(from|to)$/.test(s));
    expect(selectors.length).toBeGreaterThan(20);
    for (const group of selectors) {
      for (const sel of group.split(",").map(x => x.trim())) {
        expect(sel, sel).toMatch(/^(\.eb-sp-v2|\.eb-student-shell|\.eb-sp-kpi|\.eb-sp-skel|\.eb-sp-retry)/);
      }
    }
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);                                  // tokens only
  });
});
