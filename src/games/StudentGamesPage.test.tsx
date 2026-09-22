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

  it("Number Conversion is playable («ابدأ»); Live Challenge stays disabled («قريبًا …»)", () => {
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    const start = screen.getByRole("button", { name: "ابدأ" }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    const soon = screen.getByRole("button", { name: "قريبًا — في المرحلة القادمة" }) as HTMLButtonElement;
    expect(soon.disabled).toBe(true);
  });

  it("opening Number Conversion swaps to the game (nested full-view); the games list is gone", async () => {
    // the game does one getState fetch on mount → return an empty state so it shows its home screen
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, active: null, best: null }) })) as unknown as typeof fetch;
    render(<StudentGamesPage token="t" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ابدأ" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "تحدّي أنظمة العد" })).toBeTruthy());
    expect(screen.queryByRole("list", { name: "الألعاب" })).toBeNull();   // left the games list
    expect(screen.getByRole("button", { name: /العودة إلى الألعاب/ })).toBeTruthy();
  });

  it("offers a clear back path to the portal", () => {
    const onBack = vi.fn();
    render(<StudentGamesPage token="t" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى لوحتي/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
