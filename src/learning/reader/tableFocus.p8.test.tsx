// @vitest-environment happy-dom
// 899371 P8 (docs/enterprise-899371-learning-plan.md §21.4) — found by the P8 browser check (axe `scrollable-region-focusable` at 390 px):
// a book table wider than a phone scrolls sideways inside its wrapper, and a keyboard user could not reach that scroll. The wrapper of a
// static table is now focusable and named (its caption, else «جدول»), like the C# code panel (plan §18). A table of practice cells is
// not changed: its own inputs are focusable.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(() => cleanup());
const header: ReaderPageHeader = { courseId: "x", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 } };
const page = (caption?: string): ContentPage => ({
  id: "x-m01-l01-p01", moduleId: "x-m01", lessonId: "x-m01-l01", order: 1, title: "صفحة", layout: "standard",
  blocks: [{ id: "t1", type: "table", origin: "book", dir: "rtl", headers: ["number", "numStr", "الناتج"], rows: [["1234", "\"1234\"", "مقبول"]], ...(caption ? { caption } : {}) }],
} as unknown as ContentPage);

describe("a book table on a narrow screen", () => {
  it("its scrolling wrapper is reachable by keyboard and named by the caption", () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page("جدول المتابعة") }} />);
    const wrap = container.querySelector(".learning-reader-tablewrap") as HTMLElement;
    expect(wrap.tabIndex).toBe(0);
    expect(wrap.getAttribute("role")).toBe("region");
    expect(wrap.getAttribute("aria-label")).toBe("جدول المتابعة");
    expect(wrap.querySelector("table")).toBeTruthy();
  });
  it("without a caption it is named «جدول»", () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page() }} />);
    expect((container.querySelector(".learning-reader-tablewrap") as HTMLElement).getAttribute("aria-label")).toBe("جدول");
  });
});
