// @vitest-environment happy-dom
// Phase 3D — DOM rendering of the Unit-2 summary page (PDF 23): the four conversion methods render as a semantic
// list, and the LTR technical tokens (IPv4 / IPv6) render inside dir="ltr" code spans so RTL never reverses them.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import m02 from "../content/791381/modules/m02";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const p09 = (): ContentPage => m02.lessons.flatMap(l => l.pages).find(p => p.id === "791381-m02-l01-p09")!;
const header = (p: ContentPage): ReaderPageHeader => ({
  courseId: "791381", pageTitle: p.title, moduleTitle: "الأعداد والموازين", lessonTitle: "أنظمة العد والتحويل",
  position: { index: 9, total: 9 }, source: p.source,
});
const draw = (p: ContentPage) => render(<LearningPageRenderer header={header(p)} body={{ kind: "ready", page: p }} />);

describe("Phase 3D — PDF 23 summary renders faithfully", () => {
  it("renders the four conversion methods as a semantic list with the book's exact wording", () => {
    const { container } = draw(p09());
    const items = [...container.querySelectorAll(".learning-reader-list-item")];
    expect(items.length).toBe(4);
    expect(screen.getByText("استعمل الصناديق ثم اجمع القيم التي تحتها 1.")).toBeTruthy();
    expect(screen.getByText("قسّم إلى مجموعات من 4 ثم استعمل الجدول.")).toBeTruthy();
    expect(container.innerHTML).not.toContain("<script");
  });

  it("renders IPv4 and IPv6 as dir=ltr code spans (never reversed under RTL)", () => {
    const { container } = draw(p09());
    const codes = [...container.querySelectorAll("code[dir=ltr]")].map(c => c.textContent);
    expect(codes).toContain("IPv4");
    expect(codes).toContain("IPv6");
    for (const el of container.querySelectorAll("code[dir=ltr]")) expect(el.getAttribute("dir")).toBe("ltr");
    // the "why it matters" callout heading is present
    expect(screen.getByText("لماذا هذا مهم؟")).toBeTruthy();
  });
});
