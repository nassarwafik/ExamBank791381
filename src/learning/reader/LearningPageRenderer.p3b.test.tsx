// @vitest-environment happy-dom
// Phase 3B — rendering of the two new generic primitives (list, unit-opener) + the opener page layout. Semantic
// HTML, safe spans (never raw HTML), correct provenance surfaces.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const header: ReaderPageHeader = {
  courseId: "791381", pageTitle: "ص", moduleTitle: "م", lessonTitle: "د",
  position: { index: 1, total: 8 }, source: { kind: "book", sourceId: "791381", pdfPageStart: 9, printedPage: 7 },
};
const draw = (page: ContentPage) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);

describe("Phase 3B — list block", () => {
  const page: ContentPage = {
    id: "p", title: "ص", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 9 },
    blocks: [
      {
        id: "b1", type: "list", origin: "book", variant: "cards",
        items: [
          { id: "i1", term: "ملفات", text: [{ text: "مشاركة ملفات وصور بين الأجهزة." }] },
          { id: "i2", term: "تواصل", text: [{ text: "بريد ورسائل." }] },
        ],
      },
      {
        id: "b2", type: "list", origin: "book", variant: "checklist",
        items: [{ id: "c1", text: [{ text: "سرعة في تبادل المعلومات." }] }],
      },
    ],
  };
  it("renders a semantic <ul>/<li> with terms and safe span text (cards + checklist variants)", () => {
    const { container } = draw(page);
    expect(container.querySelectorAll(".learning-reader-list").length).toBe(2);
    expect(container.querySelector(".variant-cards")).toBeTruthy();
    expect(container.querySelector(".variant-checklist")).toBeTruthy();
    expect(container.querySelectorAll(".learning-reader-list-item").length).toBe(3);
    expect(screen.getByText("ملفات")).toBeTruthy();
    expect(screen.getByText("مشاركة ملفات وصور بين الأجهزة.")).toBeTruthy();
    expect(container.querySelector("ul li")).toBeTruthy();
    expect(container.innerHTML).not.toContain("<script");
  });
});

describe("Phase 3B — unit-opener layout", () => {
  const opener: ContentPage = {
    id: "op", title: "أساسيات الشبكات", order: 1, layout: "opener",
    source: { kind: "book", sourceId: "791381", pdfPageStart: 7 },
    blocks: [{
      id: "o1", type: "unit-opener", origin: "book",
      unitLabel: "الوحدة الأولى", unitNumber: "01", title: "أساسيات الشبكات",
      subtitle: "ما هي الشبكة؟", goal: "الهدف: فكرة أساسية + مثال واضح + تدريب",
    }],
  };
  it("renders the hero (unit label/number/title/subtitle/goal) with NO standard lesson header, focus target intact", () => {
    const openerHeader: ReaderPageHeader = { ...header, pageTitle: "أساسيات الشبكات", source: { kind: "book", sourceId: "791381", pdfPageStart: 7 } };
    const { container } = render(<LearningPageRenderer header={openerHeader} body={{ kind: "ready", page: opener }} />);
    expect(container.querySelector(".learning-reader-page.is-opener")).toBeTruthy();
    expect(container.querySelector(".learning-reader-pagehead")).toBeNull();       // standard header suppressed
    expect(screen.getByText("الوحدة الأولى")).toBeTruthy();
    expect(screen.getByText("01")).toBeTruthy();
    const h2 = screen.getByRole("heading", { level: 2, name: "أساسيات الشبكات" });
    expect(h2.id).toBe("learning-reader-page-title");                              // reader focus target
    expect(h2.classList.contains("learning-reader-opener-title")).toBe(true);
    expect(screen.getByText(/الهدف: فكرة أساسية/)).toBeTruthy();
    expect(screen.getByText(/المصدر: كتاب 791381 · صفحة PDF 7/)).toBeTruthy();     // source kept for traceability
  });
});
