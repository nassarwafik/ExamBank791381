// @vitest-environment happy-dom
// Unified Strength — the PORTAL renders the SERVER's 25-stage progression verbatim. The dashboard mock returns a
// deliberately inconsistent payload (900 points but stage 17, 11 / 80 into the stage, 14%): under a client-side
// 80-step rule 900 points would read stage 12 with 20 / 80 and 25% — the portal must show the server's values,
// proving it runs no threshold logic over the total. A dashboard WITHOUT `strength` shows an explicit "unavailable"
// state (never a client-computed stage).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";
import { stageVisual } from "./studentStageVisuals";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 3, completed: 3, average: 80, pendingReview: 0, finalized: 3, inProgress: 0, averageFinalized: 80 };
const INCONSISTENT = {
  rawTotalPoints: 900, totalPoints: 900, examPoints: 300, practicePoints: 400, studyPoints: 100, projectPoints: 100,
  stagePoints: 900, stageMaxPoints: 2000, stageNumber: 17, stageCount: 25, stageBlockSize: 80, stageFloor: 1280, withinStagePoints: 11, stagePercent: 14,
  nextStageNumber: 18, nextStageRemaining: 69, pointsToMaximum: 1100, isMaximumStage: false, pathComplete: false, legacyRank: null, projects: [],
};

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
  it("900 points + server stage 17 / 11 / 14% → المرحلة 17 من 25 · تنين الجليد · 11 / 80 · 14% · نقاط القوة: 900 / 2000 · next سيد العواصف", async () => {
    mount(INCONSISTENT);
    const region = await progressRegion();
    expect(within(region).getByText("المرحلة 17 من 25")).toBeTruthy();
    expect(within(region).getByText("تنين الجليد")).toBeTruthy();                       // stage 17's title
    expect(within(region).getByText("مرحلة الريادة")).toBeTruthy();                      // stages 16–20
    expect(within(region).getByText("11 / 80")).toBeTruthy();
    expect(within(region).getByText("14%")).toBeTruthy();
    expect(within(region).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 900 / 2000");
    expect(within(region).getByText("بقي 69 نقطة قوة للوصول إلى المرحلة 18 — سيد العواصف")).toBeTruthy();
    const ring = within(region).getByRole("progressbar", { name: "التقدم نحو المرحلة 18 — سيد العواصف" });
    expect(ring.getAttribute("aria-valuemin")).toBe("0"); expect(ring.getAttribute("aria-valuemax")).toBe("80"); expect(ring.getAttribute("aria-valuenow")).toBe("11");
    expect((within(region).getByRole("img", { name: "المرحلة 17 — تنين الجليد" }) as HTMLImageElement).getAttribute("src")).toBe(stageVisual(17).image);
    expect((document.querySelector(".eb-sp-rank-next-art") as HTMLImageElement).getAttribute("src")).toBe(stageVisual(18).image);
    // what a client-side 80-step rule over 900 would have produced must NOT appear
    expect(region.textContent).not.toMatch(/المرحلة 12 من 25|20 \/ 80|25%|محارب الظلال/);
    // the avatar frame follows the server's stage group (17 → group 4)
    expect(document.querySelector(".eb-sp-avatar-frame.is-stage-group-4")).toBeTruthy();
  });
  it("no strength payload (older API) → an explicit unavailable state; no stage, no ring, nothing computed from finalized", async () => {
    mount(undefined);
    const region = await progressRegion();
    expect(within(region).getByText(/تعذّر تحميل مسار القوة/)).toBeTruthy();
    expect(within(region).queryByText(/المرحلة \d+ من 25/)).toBeNull();
    expect(within(region).queryByRole("progressbar", { name: /التقدم نحو/ })).toBeNull();
    expect(region.textContent).not.toMatch(/300|بذرة القوة/);
    expect(document.querySelector(".eb-sp-avatar-frame")?.className).not.toMatch(/is-stage-group-|is-rank-/);
  });
  it("a malformed payload (stage 26) is treated as unavailable — never clamped into a shown stage", async () => {
    mount({ ...INCONSISTENT, stageNumber: 26 });
    const region = await progressRegion();
    expect(within(region).getByText(/تعذّر تحميل مسار القوة/)).toBeTruthy();
    expect(within(region).queryByText(/المرحلة \d+ من 25/)).toBeNull();
  });
});
