// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within, fireEvent, waitFor } from "@testing-library/react";
import TeacherGamesPage from "./TeacherGamesPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("TeacherGamesPage", () => {
  it("renders the teacher games shell listing both approved games (h2 — the shell owns the h1)", () => {
    render(<TeacherGamesPage token="t" />);
    const region = screen.getByRole("region", { name: "الألعاب المتاحة" });
    expect(within(region).getByRole("heading", { level: 2, name: "الألعاب المتاحة" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "تحدّي أنظمة العد" })).toBeTruthy();
    expect(within(region).getByRole("heading", { name: "التحدّي المباشر" })).toBeTruthy();
    expect(within(region).getAllByRole("article").length).toBe(2);
  });

  it("Number Conversion stays student-only («متاح للطلاب», disabled); Live Challenge becomes an authoring entry («إنشاء تحدٍّ», enabled)", () => {
    render(<TeacherGamesPage token="t" />);
    const studentsOnly = screen.getByRole("button", { name: "متاح للطلاب" }) as HTMLButtonElement;   // no teacher hosting for the solo game
    expect(studentsOnly.disabled).toBe(true);
    const author = screen.getByRole("button", { name: "إنشاء تحدٍّ" }) as HTMLButtonElement;
    expect(author.disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "قريبًا — في المرحلة القادمة" })).toBeNull();
  });

  it("«إنشاء تحدٍّ» opens the Live Challenge Generator (nested full-view)", async () => {
    // the generator lists saved challenges on mount → stub fetch to return an empty list
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, challenges: [] }) })) as unknown as typeof fetch;
    render(<TeacherGamesPage token="t" />);
    fireEvent.click(screen.getByRole("button", { name: "إنشاء تحدٍّ" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "مولّد التحدّي المباشر" })).toBeTruthy());
    expect(screen.queryByRole("region", { name: "الألعاب المتاحة" })).toBeNull();   // swapped away from the games list
  });

  it("carries the teacher-scoped modifier so it gets the desktop sidebar↔content inset", () => {
    render(<TeacherGamesPage token="t" />);
    const region = screen.getByRole("region", { name: "الألعاب المتاحة" });
    expect(region.classList.contains("eb-games-page")).toBe(true);
    expect(region.classList.contains("eb-games-page--teacher")).toBe(true);
  });
});
