// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import TeacherGamesPage from "./TeacherGamesPage";

afterEach(cleanup);

describe("TeacherGamesPage", () => {
  it("renders the teacher games shell listing both approved games (h2 — the shell owns the h1)", () => {
    render(<TeacherGamesPage />);
    const region = screen.getByRole("region", { name: "الألعاب المتاحة" });
    expect(within(region).getByRole("heading", { level: 2, name: "الألعاب المتاحة" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    expect(within(region).getAllByRole("article").length).toBe(2);
  });

  it("shows the games as coming-soon (foundation shell only, no hosting yet)", () => {
    render(<TeacherGamesPage />);
    const buttons = screen.getAllByRole("button", { name: "قريبًا — في المرحلة القادمة" });
    expect(buttons.length).toBe(2);
    expect(buttons.every(b => (b as HTMLButtonElement).disabled)).toBe(true);
  });
});
