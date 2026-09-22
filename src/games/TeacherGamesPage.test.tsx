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

  it("is foundation-only: no teacher Start — Number Conversion reads «متاح للطلاب», Live Challenge «قريبًا …», both disabled", () => {
    render(<TeacherGamesPage />);
    const studentsOnly = screen.getByRole("button", { name: "متاح للطلاب" }) as HTMLButtonElement;      // available game, no teacher hosting yet
    const soon = screen.getByRole("button", { name: "قريبًا — في المرحلة القادمة" }) as HTMLButtonElement;
    expect(studentsOnly.disabled).toBe(true);
    expect(soon.disabled).toBe(true);
  });
});
