// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent } from "@testing-library/react";
import StudentGamesPage from "./StudentGamesPage";

afterEach(cleanup);

describe("StudentGamesPage — the student's dedicated Games destination", () => {
  it("renders a page-level heading and both approved game cards", () => {
    render(<StudentGamesPage onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1, name: "الألعاب التعليمية" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "الألعاب" });
    expect(within(list).getAllByRole("article").length).toBe(2);
    expect(screen.getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    expect(screen.getByText("فردي")).toBeTruthy();
    expect(screen.getByText("متعدد اللاعبين المباشر")).toBeTruthy();
  });

  it("keeps both games coming-soon with disabled actions (no gameplay)", () => {
    render(<StudentGamesPage onBack={vi.fn()} />);
    const buttons = screen.getAllByRole("button", { name: "قريبًا — في المرحلة القادمة" });
    expect(buttons.length).toBe(2);
    expect(buttons.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("offers a clear back path to the portal", () => {
    const onBack = vi.fn();
    render(<StudentGamesPage onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى لوحتي/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
