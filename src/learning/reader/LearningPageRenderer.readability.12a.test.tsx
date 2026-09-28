// @vitest-environment happy-dom
// Phase 12A — Reader readability refresh, renderer contract: authored heading levels carry their level CLASS (the
// stylesheet gives each level its own size / colour / accent) on the unchanged h3/h4/h5 tags; callout kinds keep
// their kind class + label; a LONG page renders every block in order without collapsing or inline width styles;
// the visual fallback and the training block are unchanged.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentBlock, ContentPage } from "../content/types";

afterEach(cleanup);

const header: ReaderPageHeader = { courseId: "791381", pageTitle: "صفحة طويلة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 3, total: 9 } };
const text = (id: string, t: string): ContentBlock => ({ id, type: "text", origin: "book", spans: [{ text: t }] });
const heading = (id: string, level: 2 | 3 | 4, t: string): ContentBlock => ({ id, type: "heading", origin: "book", level, text: t });
const callout = (id: string, kind: "remember" | "important" | "warning" | "tip" | "summary", t: string): ContentBlock => ({ id, type: "callout", origin: "book", kind, spans: [{ text: t }] });
const list = (id: string): ContentBlock => ({ id, type: "list", origin: "book", variant: "cards", title: "قائمة " + id, items: [{ id: id + "-a", term: "مصطلح", text: [{ text: "شرح" }] }, { id: id + "-b", text: [{ text: "شرح آخر" }], note: "ملاحظة" }] } as unknown as ContentBlock);
const table = (id: string): ContentBlock => ({ id, type: "table", origin: "book", headers: ["أ", "ب"], rows: [["1", "2"], ["3", "4"]] });
const page = (blocks: ContentBlock[]): ContentPage => ({ id: "p-long", title: "صفحة طويلة", order: 1, source: { kind: "book", sourceId: "791381", pdfPageStart: 10 }, blocks });
const renderPage = (blocks: ContentBlock[]) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page(blocks) }} />);

describe("heading levels — tag unchanged, level class added", () => {
  it("level 2 → h3.is-level-2, level 3 → h4.is-level-3, level 4 → h5.is-level-4; all keep .learning-reader-heading and the authored dir", () => {
    renderPage([heading("h2", 2, "قسم"), heading("h3", 3, "فرع"), { ...heading("h4", 4, "Sub"), dir: "ltr" } as ContentBlock]);
    const h3 = screen.getByRole("heading", { level: 3, name: "قسم" });
    const h4 = screen.getByRole("heading", { level: 4, name: "فرع" });
    const h5 = screen.getByRole("heading", { level: 5, name: "Sub" });
    expect(h3.className).toBe("learning-reader-heading is-level-2");
    expect(h4.className).toBe("learning-reader-heading is-level-3");
    expect(h5.className).toBe("learning-reader-heading is-level-4");
    expect(h5.getAttribute("dir")).toBe("ltr");
    // the page title stays the single h2 ABOVE the section headings (hierarchy: title → section → sub → minor)
    expect(screen.getByRole("heading", { level: 2, name: "صفحة طويلة" })).toBeTruthy();
    expect(document.querySelectorAll("h2").length).toBe(1);
  });
});

describe("callouts — every kind keeps its kind class and a visible label", () => {
  it.each([["remember", "تذكّر"], ["important", "مهم"], ["warning", "تنبيه"], ["tip", "نصيحة"], ["summary", "الخلاصة"]] as const)("%s → .learning-reader-callout.kind-%s with label «%s»", (kind, label) => {
    const { container } = renderPage([callout("c", kind, "نص")]);
    const box = container.querySelector(".learning-reader-callout.kind-" + kind)!;
    expect(box).toBeTruthy();
    expect(within(box as HTMLElement).getByText(label).className).toBe("learning-reader-callout-label");
    expect(within(box as HTMLElement).getByText("نص").className).toBe("learning-reader-callout-body");
  });
});

describe("a LONG page does not collapse", () => {
  it("120 mixed blocks render in authored order inside ONE blocks container, with no inline width/height styles anywhere", () => {
    const blocks: ContentBlock[] = [];
    for (let i = 0; i < 24; i++) {
      blocks.push(heading("h" + i, i % 3 === 0 ? 2 : i % 3 === 1 ? 3 : 4, "عنوان " + i));
      blocks.push(text("t" + i, "فقرة رقم " + i + " ".repeat(1) + "نص طويل ".repeat(40)));
      blocks.push(callout("c" + i, (["remember", "important", "warning", "tip", "summary"] as const)[i % 5], "ملاحظة " + i));
      blocks.push(list("l" + i));
      blocks.push(table("tb" + i));
    }
    expect(blocks.length).toBe(120);
    const { container } = renderPage(blocks);
    const holder = container.querySelectorAll(".learning-reader-blocks");
    expect(holder.length).toBe(1);
    const rendered = holder[0].querySelectorAll(":scope > .learning-reader-block");
    expect(rendered.length).toBe(120);
    // order is the authored order (first / middle / last)
    expect(rendered[0].textContent).toBe("عنوان 0");
    expect(rendered[60].querySelector(".learning-reader-heading")?.textContent).toBe("عنوان 12");
    expect(rendered[119].querySelector("table")).toBeTruthy();
    // every table sits in its own scroll wrapper — the page itself never scrolls sideways
    expect(container.querySelectorAll(".learning-reader-tablewrap > table").length).toBe(24);
    // nothing carries an inline size: width is CSS-only (the same contract as the desktop layout test)
    for (const el of container.querySelectorAll<HTMLElement>("[style]")) expect(el.getAttribute("style")).not.toMatch(/(max-)?(width|height)|inline-size|block-size/);
    expect(container.querySelectorAll(".learning-reader-list-title").length).toBe(24);
  });
});

describe("visual + training blocks keep their contracts under the refresh", () => {
  it("an unknown visual still shows the faithful «قيد الإعداد» fallback inside the self-framed enrichment wrapper", () => {
    const visual: ContentBlock = { id: "v", type: "visual", origin: "teacher-enrichment", visualId: "791381/none/none", alt: "رسم مفقود" } as ContentBlock;
    const { container } = renderPage([visual]);
    const wrapper = container.querySelector(".learning-reader-block.is-enrichment.is-selfframed.kind-visual")!;
    expect(wrapper).toBeTruthy();
    expect(within(wrapper as HTMLElement).getByText("رسم توضيحي")).toBeTruthy();        // the provenance tag
    expect(screen.getByRole("img", { name: "رسم مفقود" }).textContent).toContain("قيد الإعداد");
  });
  it("a library-training block renders its code, label and the no-host note", () => {
    const training: ContentBlock = { id: "tr", type: "library-training", origin: "book", trainingId: "T01", label: "تدريب 1" } as ContentBlock;
    const { container } = renderPage([training]);
    const box = container.querySelector(".learning-reader-training.is-pending")!;
    expect(box).toBeTruthy();
    expect(within(box as HTMLElement).getByText("T01").className).toBe("learning-reader-training-code");
    expect(within(box as HTMLElement).getByText("تدريب 1").className).toBe("learning-reader-training-label");
    expect(within(box as HTMLElement).getByText("يُحلّ هذا التدريب تفاعليًا من داخل المنصة.")).toBeTruthy();
  });
});
