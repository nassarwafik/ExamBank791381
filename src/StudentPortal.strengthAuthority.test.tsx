// @vitest-environment happy-dom
// Unified Strength (25-STAGE model) — the PORTAL renders the SERVER's stage / progress verbatim. The dashboard mock
// returns a deliberately inconsistent payload (650 points but stage 7): under a client-side `floor(points/80)+1` rule
// 650 points would read stage 9 — the portal must show the SERVER's stage 7, proving it runs no threshold logic over
// totalPoints. A dashboard WITHOUT `strength` (or a malformed one) still shows a safe zeroed stage-1 hero.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 3, completed: 3, average: 80, pendingReview: 0, finalized: 3, inProgress: 0, averageFinalized: 80 };
// 650 points, but the SERVER says stage 7 (a local floor(650/80)+1 rule would say 9): the portal must trust 7.
const SYNTHETIC = { totalPoints: 650, libraryPoints: 420, modulePoints: 230, stage: 7, stageCount: 25, stageSpan: 80, withinStagePoints: 33, nextStageRemaining: 47, percent: 41, nextStage: 8, totalMax: 2000 };

function mount(strength: unknown) {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats, ...(strength === undefined ? {} : { strength }) });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false, projects: [] });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}
const progressRegion = () => screen.findByRole("region", { name: /تقدّمي/ });

describe("Strength authority — the portal displays the server's stage, never a recomputed one", () => {
  it("650 points + server stage 7 → «ذئب الرياح» · المرحلة 7 من 25 · 650 / 2000 · 33 / 80 · 41% · toward stage 8", async () => {
    mount(SYNTHETIC);
    const region = await progressRegion();
    expect(within(region).getByText("ذئب الرياح")).toBeTruthy();                              // stage-7 name (uploaded pack)
    expect(within(region).getByText("المرحلة 7 من 25")).toBeTruthy();
    expect(within(region).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 650 / 2000");
    expect(within(region).getByText("التقدم في هذه المرحلة: 33 / 80")).toBeTruthy();
    expect(within(region).getByText("41%")).toBeTruthy();
    expect(within(region).getByText(/بقي 47 نقطة قوة للوصول إلى سيد الأمواج/)).toBeTruthy();   // next = stage 8
    // what a client-side floor(650/80)+1 = 9 rule would have produced must NOT appear
    expect(region.textContent).not.toMatch(/المرحلة 9|صقر العاصفة/);
  });
  it("stage 1 with a few points → the stage-1 hero, progress toward stage 2 (never a negative or NaN)", async () => {
    mount({ ...SYNTHETIC, totalPoints: 40, stage: 1, withinStagePoints: 40, nextStageRemaining: 40, percent: 50, nextStage: 2 });
    const region = await progressRegion();
    expect(within(region).getByText("بذرة القوة")).toBeTruthy();
    expect(within(region).getByText("المرحلة 1 من 25")).toBeTruthy();
    expect(within(region).getByText("التقدم في هذه المرحلة: 40 / 80")).toBeTruthy();
    expect(within(region).getByText(/بقي 40 نقطة قوة للوصول إلى شعلة صغيرة/)).toBeTruthy();
  });
  it("no strength payload (older API) → a safe zeroed stage-1 hero (0 / 2000), never a broken render", async () => {
    mount(undefined);
    const region = await progressRegion();
    expect(within(region).getByText("بذرة القوة")).toBeTruthy();
    expect(within(region).getByText("المرحلة 1 من 25")).toBeTruthy();
    expect(within(region).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 0 / 2000");
  });
});
