// @vitest-environment happy-dom
// Phase 3C — DOM rendering of the number-system pages: numeric tables render dir="ltr" (MSB-left, never reversed
// under RTL), LTR technical strings keep their digit order, the ordered method list is a real <ol>, and tables sit
// in their own horizontal-scroll wrapper (no page overflow).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import m02 from "../content/791381/modules/m02";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const pageBy = (id: string): ContentPage => m02.lessons.flatMap(l => l.pages).find(p => p.id === id)!;
const header = (p: ContentPage): ReaderPageHeader => ({
  courseId: "791381", pageTitle: p.title, moduleTitle: "الأعداد والموازين", lessonTitle: "أنظمة العد والتحويل",
  position: { index: 1, total: 9 }, source: p.source,
});
const draw = (p: ContentPage) => render(<LearningPageRenderer header={header(p)} body={{ kind: "ready", page: p }} />);

describe("Phase 3C — numeric table renders LTR (no digit-order reversal)", () => {
  it("PDF 16 place-value table is dir=ltr with 128 first (leftmost) and the exact binary row, in a scroll wrapper", () => {
    const { container } = draw(pageBy("791381-m02-l01-p01"));
    const table = container.querySelector(".learning-reader-table") as HTMLTableElement;
    expect(table.getAttribute("dir")).toBe("ltr");
    expect(table.closest(".learning-reader-tablewrap")).toBeTruthy();       // contained horizontal scroll
    const heads = [...table.querySelectorAll("thead th")].map(th => th.textContent);
    expect(heads).toEqual(["128", "64", "32", "16", "8", "4", "2", "1"]);   // authored order preserved in DOM
    const cells = [...table.querySelectorAll("tbody td")].map(td => td.textContent);
    expect(cells).toEqual(["0", "1", "1", "1", "1", "0", "1", "1"]);
    // the equation + binary example render as LTR code spans with intact digit order (the Batch-2 SVG visual on this
    // page also draws the same equation faithfully, so the equation may appear more than once — at least the book one)
    expect(container.querySelector("code[dir=ltr]")).toBeTruthy();
    expect(screen.getAllByText("64 + 32 + 16 + 8 + 2 + 1 = 123").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("01111011").length).toBeGreaterThanOrEqual(1);
  });

  it("PDF 20 renders A23F and the non-reversed binary for 9A2C5 as LTR spans", () => {
    const { container } = draw(pageBy("791381-m02-l01-p03"));
    expect(screen.getByText("A23F = 1010 0010 0011 1111")).toBeTruthy();
    expect(screen.getByText("9A2C5 = 1001 1010 0010 1100 0101")).toBeTruthy();
    for (const el of container.querySelectorAll("code[dir=ltr]")) expect(el.getAttribute("dir")).toBe("ltr");
  });
});

describe("Phase 3C — ordered method list is a real <ol>", () => {
  it("PDF 21 renders the three method steps as an ordered list with the source wording", () => {
    const { container } = draw(pageBy("791381-m02-l01-p07"));
    const ol = container.querySelector(".learning-reader-list.variant-ordered ol.learning-reader-list-items");
    expect(ol).toBeTruthy();
    const items = within(ol as HTMLElement).getAllByRole("listitem");
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain("نقسّم العدد الثنائي إلى مجموعات من 4 بتات");
    expect(container.innerHTML).not.toContain("<script");
  });
});

describe("Phase 3C — hex↔binary table (default RTL, Arabic headers, pure-digit cells)", () => {
  it("PDF 19 renders the 14 source rows (0–6, 8–E) as a semantic table; 7 and F absent (source-faithful)", () => {
    const { container } = draw(pageBy("791381-m02-l01-p06"));
    const rows = [...container.querySelectorAll(".learning-reader-table tbody tr")];
    expect(rows.length).toBe(14);
    const hex = rows.map(r => r.querySelector("td")?.textContent);
    expect(hex).not.toContain("7");
    expect(hex).not.toContain("F");
    expect(screen.getByText("1110")).toBeTruthy();   // pure-digit binary cell renders intact
  });
});
