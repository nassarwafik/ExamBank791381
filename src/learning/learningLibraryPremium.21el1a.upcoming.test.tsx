// @vitest-environment happy-dom
// Phase 21E L1-A review fix — the «قريبًا في المكتبة» shelf. The production catalog has no upcoming course today, so the
// catalog is replaced here by one available and one upcoming course. The shelf must be a named region (a <div> with
// aria-labelledby is not exposed as a landmark and its name is dropped), each course must appear exactly once on the
// shelf matching its status, and an upcoming course can never be opened.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import type { LearningCourse } from "./catalog";

vi.mock("./catalog", async importOriginal => {
  const actual = await importOriginal<typeof import("./catalog")>();
  const base = actual.LEARNING_COURSES[0];
  const upcoming: LearningCourse = { ...base, id: "794589", title: "كتاب قادم", productTitle: "كتاب 794589 — كتاب قادم", status: "coming-soon" };
  const courses = [base, upcoming];
  return { ...actual, LEARNING_COURSES: courses, findLearningCourse: (id: string) => courses.find(c => c.id === id) };
});

const { default: LearningMaterialsPage } = await import("./LearningMaterialsPage");

afterEach(() => { cleanup(); });

describe("21E L1-A review — upcoming shelf", () => {
  it("is a named region holding only the upcoming course, which cannot be opened", () => {
    render(<LearningMaterialsPage />);
    const shelf = screen.getByRole("region", { name: "قريبًا في المكتبة" });
    const upcomingCard = within(shelf).getByRole("article", { name: "كتاب قادم" });
    expect(within(upcomingCard).getByRole("button", { name: "فتح الكتاب" }).hasAttribute("disabled")).toBe(true);
    expect(within(shelf).queryByRole("article", { name: "شبكات الاتصال" })).toBeNull();
    const available = screen.getByRole("list", { name: "الكتب والمواد التعليمية المتاحة" });
    expect(within(available).getAllByRole("article").map(a => a.getAttribute("aria-labelledby"))).toEqual(["eb-lm-card-791381"]);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
});
