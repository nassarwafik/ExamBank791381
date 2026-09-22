// @vitest-environment happy-dom
// The Educational Games entry is a DEDICATED destination reached from the student shell top bar (a full-view swap,
// like the Reader/exam) — NOT a permanent dashboard section. These tests prove the entry opens the games surface,
// the two approved cards live there, and Back returns to the normal portal.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };

function mount() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false, projects: [] });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
}

describe("StudentPortal — Educational Games is a dedicated destination", () => {
  it("shows a games entry in the shell, no inline games grid on the dashboard, and opens/returns from the dedicated page", async () => {
    mount();
    await screen.findByText(/مرحبًا أحمد/);
    // dedicated, not inline: the normal dashboard shows no games card grid
    expect(document.querySelector(".eb-game-cards")).toBeNull();
    const entry = screen.getByRole("button", { name: "الألعاب التعليمية" });
    expect(entry).toBeTruthy();

    // open the dedicated Games destination
    fireEvent.click(entry);
    const heading = await screen.findByRole("heading", { level: 1, name: "الألعاب التعليمية" });
    expect(heading).toBeTruthy();
    const list = screen.getByRole("list", { name: "الألعاب" });
    expect(within(list).getAllByRole("article").length).toBe(2);
    expect(screen.getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    // the normal portal sections are gone while on the dedicated surface
    expect(screen.queryByRole("region", { name: "تقدّمي وقوتي" })).toBeNull();

    // Back returns to the normal portal
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى لوحتي/ }));
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.getByRole("button", { name: "الألعاب التعليمية" })).toBeTruthy();
    expect(document.querySelector(".eb-game-cards")).toBeNull();
  });
});
