// @vitest-environment happy-dom
// The Reader renders a `visual` block as clearly-tagged teacher enrichment (رسم توضيحي) with the SVG + caption, and
// falls back faithfully for an unknown registry key.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningPageRenderer from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const page: ContentPage = {
  id: "791381-m01-l01-p01", title: "ما هي الشبكة؟", order: 1,
  source: { kind: "book", sourceId: "791381", pdfPageStart: 8 },
  blocks: [
    { id: "b1", type: "text", origin: "book", spans: [{ text: "الشبكة هي مجموعة أجهزة متصلة." }] },
    { id: "b2", type: "visual", origin: "teacher-enrichment", visualId: "791381/ch1/network-connected-devices",
      alt: "رسم يبيّن أجهزة متصلة بشبكة مركزية.", title: "رسم توضيحي: الشبكة أجهزة متصلة", caption: "الأجهزة المتصلة تتبادل المعلومات." },
  ],
};

const header = { courseId: "791381", pageTitle: "ما هي الشبكة؟", moduleTitle: "m", lessonTitle: "l", position: { index: 0, total: 1 } };

describe("Reader — visual block", () => {
  it("renders the visual inside a teacher-enrichment section labelled رسم توضيحي, with the SVG and caption", async () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page }} />);
    expect(screen.getByText("الشبكة هي مجموعة أجهزة متصلة.")).toBeTruthy();
    const section = container.querySelector("section.is-enrichment.kind-visual");
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("رسم توضيحي");
    // Phase 8E-6: the SVG is a lazy chunk — the section/caption are immediate, the illustration arrives once it resolves.
    expect((await screen.findByRole("img", { name: "رسم يبيّن أجهزة متصلة بشبكة مركزية." })).tagName.toLowerCase()).toBe("svg");
    expect(screen.getByText("الأجهزة المتصلة تتبادل المعلومات.")).toBeTruthy();
  });

  it("unknown visualId falls back to قيد الإعداد (never blank)", () => {
    const bad: ContentPage = { ...page, blocks: [{ id: "b3", type: "visual", origin: "teacher-enrichment", visualId: "nope", alt: "بديل" }] };
    render(<LearningPageRenderer header={header} body={{ kind: "ready", page: bad }} />);
    expect(screen.getByRole("img", { name: "بديل" }).textContent).toContain("قيد الإعداد");
  });
});
