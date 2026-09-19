// @vitest-environment happy-dom
// Unified Strength — the PORTAL renders the SERVER's rank/progress verbatim. The dashboard mock returns a
// deliberately inconsistent payload (520 points but tier «bronze», 77 / 400 into the block, 323 remaining, 19%):
// under a client-side 400-step rule 520 points would read «beginner» with 120 / 400 — the portal must show the
// server's values, proving it runs no threshold logic over totalPoints. A dashboard WITHOUT `strength` still shows
// the legacy finalized × 100 ring.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 3, completed: 3, average: 80, pendingReview: 0, finalized: 3, inProgress: 0, averageFinalized: 80 };
const SYNTHETIC = { totalPoints: 520, examPoints: 300, practicePoints: 20, projectPoints: 200, tier: "bronze", level: 2, nextTier: "silver", levelBlockSize: 400, withinLevelPoints: 77, nextLevelRemaining: 323, percent: 19, projects: [] };

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

describe("Strength authority — the portal displays the server's progression, never a recomputed one", () => {
  it("520 points + server tier «bronze» → الرتبة: برونزي · بـ 520 نقطة قوة · بقي 323 نقطة قوة للوصول إلى رتبة فضي · 77 / 400 · 19%", async () => {
    mount(SYNTHETIC);
    const region = await progressRegion();
    expect(within(region).getByText(/الرتبة:/).textContent).toContain("الرتبة: برونزي");
    expect(within(region).getByText("بـ 520 نقطة قوة")).toBeTruthy();
    expect(within(region).getByText(/بقي 323 نقطة قوة للوصول إلى رتبة فضي/)).toBeTruthy();
    expect(within(region).getByText("التقدم نحو المستوى التالي: 77 / 400")).toBeTruthy();
    expect(within(region).getByText("19%")).toBeTruthy();
    expect(within(region).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 520");
    // what a client-side 400-step rule over 520 would have produced must NOT appear
    expect(region.textContent).not.toMatch(/الرتبة: مبتدئ|بقي 280 نقطة|120 \/ 400|30%/);
  });
  it("server tier null with the server's block values → the pre-rank ring reads those values (not totalPoints % 400)", async () => {
    mount({ ...SYNTHETIC, tier: null, level: 0, nextTier: "beginner", totalPoints: 950, withinLevelPoints: 33, nextLevelRemaining: 367, percent: 8 });
    const region = await progressRegion();
    expect(within(region).getByText("33 من 400 نقطة قوة لفتح رتبتك")).toBeTruthy();
    expect(within(region).queryByText(/الرتبة:/)).toBeNull();
    expect(region.textContent).not.toMatch(/150 من 400|برونزي|مبتدئ/);
  });
  it("no strength payload (older API) → the legacy finalized × 100 ring: 3 exams → 300 من 400", async () => {
    mount(undefined);
    const region = await progressRegion();
    expect(within(region).getByText("300 من 400 نقطة قوة لفتح رتبتك")).toBeTruthy();
    expect(within(region).getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 300");
  });
});
