// @vitest-environment happy-dom
// 899371 P9 (docs/enterprise-899371-learning-plan.md §22) — an exercise's «راجع في الكتاب: <title>» in the Reader: shown only when the
// exercise names a page that is in this Reader's book (a student's Reader holds only the published units), and it opens that page.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(() => cleanup());
const header: ReaderPageHeader = { courseId: "899371", pageTitle: "تدريبات الوحدة", moduleTitle: "الوحدة", lessonTitle: "تدريبات الوحدة", position: { index: 1, total: 1 } };
const page = (reviewPageId?: string): ContentPage => ({
  id: "899371-m04-l04-p01", moduleId: "899371-m04", lessonId: "899371-m04-l04", order: 1, title: "تدريبات الوحدة", layout: "practice",
  blocks: [{ id: "q1", type: "practice", origin: "teacher-enrichment", question: { kind: "trueFalse", prompt: "نتيجة true && false هي true.", answer: false, feedback: { explanation: "…" } }, ...(reviewPageId ? { reviewPageId } : {}) }],
} as unknown as ContentPage);
const book = (titles: Record<string, string>) => { const open = vi.fn(); return { open, bookPages: { title: (id: string) => titles[id] ?? null, open } }; };

describe("«راجع في الكتاب» under an exercise", () => {
  it("names the lesson page and opens it", () => {
    const { open, bookPages } = book({ "899371-m04-l01-p04": "جداول منطقية" });
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page("899371-m04-l01-p04") }} bookPages={bookPages} />);
    fireEvent.click(screen.getByRole("button", { name: "راجع في الكتاب: جداول منطقية" }));
    expect(open).toHaveBeenCalledWith("899371-m04-l01-p04");
  });
  it("no link when the exercise names no page, when the page is not in this Reader's book, or with no book at all", () => {
    const { bookPages } = book({ "899371-m04-l01-p04": "جداول منطقية" });
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page() }} bookPages={bookPages} />);
    expect(screen.queryByRole("button", { name: /راجع في الكتاب/ })).toBeNull();
    cleanup();
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page("899371-m09-l01-p01") }} bookPages={bookPages} />);
    expect(screen.queryByRole("button", { name: /راجع في الكتاب/ })).toBeNull();
    cleanup();
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page("899371-m04-l01-p04") }} />);
    expect(screen.queryByRole("button", { name: /راجع في الكتاب/ })).toBeNull();
  });
});
