// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import StudentGamesHub from "./StudentGamesHub";

afterEach(cleanup);

describe("StudentGamesHub", () => {
  it("renders the games section with both approved games as cards", () => {
    render(<StudentGamesHub />);
    const region = screen.getByRole("region", { name: "الألعاب التعليمية" });
    expect(within(region).getByRole("heading", { level: 2, name: "الألعاب التعليمية" })).toBeTruthy();
    const cards = within(region).getAllByRole("article");
    expect(cards.length).toBe(2);
    expect(within(region).getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
  });

  it("presents both games as coming-soon with disabled actions (no gameplay in Phase 1)", () => {
    render(<StudentGamesHub />);
    const buttons = screen.getAllByRole("button", { name: "قريبًا — في المرحلة القادمة" });
    expect(buttons.length).toBe(2);
    expect(buttons.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getAllByText("قريبًا").length).toBe(2);
  });

  it("shows both mode labels (Solo and Live Multiplayer)", () => {
    render(<StudentGamesHub />);
    expect(screen.getByText("فردي")).toBeTruthy();
    expect(screen.getByText("متعدد اللاعبين المباشر")).toBeTruthy();
  });
});
