// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import StudentGamesPage from "./StudentGamesPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("StudentGamesPage — the student's dedicated Games destination", () => {
  it("renders a page-level heading and both approved game cards", () => {
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "الألعاب التعليمية" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "الألعاب" });
    expect(within(list).getAllByRole("article").length).toBe(2);
    expect(screen.getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
  });

  it("Number Conversion is playable («ابدأ»); Live Challenge is joinable («انضم إلى غرفة») — no coming-soon action", () => {
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    const start = screen.getByRole("button", { name: "ابدأ" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    const join = screen.getByRole("button", { name: "انضم إلى غرفة" }) as HTMLButtonElement;
    expect(join.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "قريبًا — في المرحلة القادمة" })).toBeNull();
  });

  it("opening Live Challenge swaps to the join screen (enter room code) and leaves the games list", () => {
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "انضم إلى غرفة" }));
    expect(screen.getByRole("heading", { level: 1, name: "التحدّي المباشر" })).toBeTruthy();
    expect(screen.getByLabelText("رمز الغرفة")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "الألعاب" })).toBeNull();
  });

  it("opening Number Conversion swaps to the game (nested full-view); the games list is gone", async () => {
    // the game does one getState fetch on mount → return an empty state so it shows its home screen
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, active: null, best: null }) })) as unknown as typeof fetch;
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "تحدّي أنظمة العد" })).toBeTruthy());
    expect(screen.queryByRole("list", { name: "الألعاب" })).toBeNull();   // left the games list
    expect(document.querySelectorAll("main").length).toBe(1);             // standalone game keeps its own single <main> (unchanged)
    expect(document.querySelectorAll("h1").length).toBe(1);
    expect(screen.getByRole("button", { name: /العودة إلى الألعاب/ })).toBeTruthy();
  });

  it("REGRESSION: the student game is the default student mode over the STUDENT API (student token) — never the teacher preview", async () => {
    const calls: [string, RequestInit & { headers: Record<string, string> }][] = [];
    globalThis.fetch = vi.fn(async (u: string, i: RequestInit & { headers: Record<string, string> }) => { calls.push([u, i]); return { ok: true, status: 200, json: async () => ({ ok: true, active: null, best: { percentage: 70, correct: 7, total: 10, bestStreak: 3, elapsedMs: 0, at: "" } }) }; }) as unknown as typeof fetch;
    render(<StudentGamesPage token="stu-tok" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    await screen.findByText(/أفضل نتيجة محفوظة/);                                   // the persisted student best record is still shown
    expect(calls[0][0]).toBe("/api/game-number-conversion");
    expect(calls[0][1].headers["x-student-token"]).toBe("stu-tok");
    expect(calls.some(c => c[0].includes("preview"))).toBe(false);
    expect(screen.queryByText("معاينة المعلم — لا يتم حفظ النتائج")).toBeNull();
  });

  it("offers a clear back path to the portal", () => {
    const onBack = vi.fn();
    render(<StudentGamesPage token="t" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى لوحتي/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does NOT receive the teacher-only desktop-inset modifier (it sits in .eb-games-surface with its own padding)", () => {
    const { container } = render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    expect(container.querySelector(".eb-games-page")).toBeTruthy();               // uses the shared base class
    expect(container.querySelector(".eb-games-page--teacher")).toBeNull();        // but never the teacher modifier
    expect(container.querySelector(".eb-games-surface")).toBeTruthy();            // student destination keeps its own padded surface
  });
});
