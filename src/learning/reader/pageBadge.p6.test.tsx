// @vitest-environment happy-dom
// 899371 P6 (plan §19) — the page header says where a page comes from. A page with at least one book block says «من الكتاب»; a
// practice page says «تدريبات تفاعلية»; a page holding ONLY added (teacher-enrichment) blocks — such as a «نحلّ معًا» walkthrough —
// must not claim to be the book: it says «إثراء تعليمي».
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(() => { cleanup(); });
const header: ReaderPageHeader = { courseId: "x", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 }, source: { kind: "book", bookId: "x" } as never };
const page = (layout: string | undefined, origins: string[]): ContentPage => ({
  id: "x-m01-l01-p01", order: 1, title: "صفحة", ...(layout ? { layout } : {}), source: { kind: "book", sourceId: "x", pdfPageStart: 1 },
  blocks: origins.map((origin, i) => ({ id: "b" + i, type: "text", origin, spans: [{ text: "نص " + i }] })),
} as unknown as ContentPage);
const badge = (p: ContentPage) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: p }} />).container.querySelector(".learning-reader-frombook")!.textContent;

describe("the page header's origin badge", () => {
  it("a book page — even with an added note — says «من الكتاب»", () => {
    expect(badge(page(undefined, ["book"]))).toBe("من الكتاب");
    expect(badge(page(undefined, ["book", "teacher-enrichment"]))).toBe("من الكتاب");
  });
  it("a practice page says «تدريبات تفاعلية»", () => {
    expect(badge(page("practice", ["teacher-enrichment"]))).toBe("تدريبات تفاعلية");
  });
  it("a page of added blocks only (a walkthrough) says «إثراء تعليمي», never «من الكتاب»", () => {
    expect(badge(page(undefined, ["teacher-enrichment", "teacher-enrichment"]))).toBe("إثراء تعليمي");
  });
});
