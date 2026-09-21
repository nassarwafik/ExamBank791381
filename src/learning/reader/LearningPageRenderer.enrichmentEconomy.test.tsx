// @vitest-environment happy-dom
// Reader UX — Teacher Enrichment Surface Economy (Batch A). Presentation-only regressions proving:
//  • teacher-enrichment stays textually identified (the tag), never color-only;
//  • self-framed enrichment (visual / practice / practice-table / activity) drops the heavy tinted outer box
//    (`.is-selfframed`) while keeping the tag and its own frame;
//  • text-like enrichment (clarification / example) keeps the light container;
//  • the clarification double-box + duplicate «توضيح المعلم» label is gone (one label, no inner callout box);
//  • «جرّب بنفسك» is not duplicated on a practice block;
//  • book-origin blocks are untouched; practice / practice-table / visual / activity stay functionally intact;
//  • Study Strength eligibility is unchanged (a pure-content property the presentation change never touches).
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import { readerCourse } from "./readerFixtures";
import { eligibleStudyActivities } from "../study/eligibility";
import type { ContentPage } from "../content/types";

afterEach(cleanup);

const richPage = readerCourse.modules[0].lessons[0].pages[0];
const header: ReaderPageHeader = {
  courseId: "791381", pageTitle: "صفحة غنية", moduleTitle: "الوحدة الأولى", lessonTitle: "الدرس الأول",
  position: { index: 1, total: 7 }, source: richPage.source,
};
const renderPage = (page: ContentPage) =>
  render(<LearningPageRenderer header={{ ...header, source: page.source }} body={{ kind: "ready", page }} />);

const countOccurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe("enrichment economy — self-framed vs text-like classification", () => {
  it("visual / practice / practice-table / activity enrichment blocks are flattened (is-selfframed, no heavy box); text-like stays boxed", () => {
    // a compact page carrying a self-framed visual, a self-framed practice-table, and (from the rich fixture) practice
    // + simulation + a text-like clarification + example.
    const page: ContentPage = {
      ...richPage,
      blocks: [
        ...richPage.blocks,
        { id: "z-visual", type: "visual", origin: "teacher-enrichment", visualId: "791381/m04/sw6-router-trunk", alt: "مخطط الشبكة" },
        {
          id: "z-ptable", type: "practice-table", origin: "teacher-enrichment", studyEligible: false,
          headers: ["الجملة", "الإجابة"], columnDirs: ["rtl", "rtl"],
          rows: [["أكمل", { kind: "select", options: ["الراديو", "الضوء"], key: "الراديو" }]],
        },
      ],
    } as ContentPage;
    const { container } = renderPage(page);

    // self-framed → is-selfframed and NOT the padded/tinted box
    for (const kind of ["visual", "practice", "practice-table", "simulation"]) {
      const sec = container.querySelector(`.is-enrichment.kind-${kind}`)!;
      expect(sec, kind).not.toBeNull();
      expect(sec.classList.contains("is-selfframed"), kind).toBe(true);
      // the tag (provenance marker) is still present inside it
      expect(sec.querySelector(".learning-reader-enrichment-tag"), kind).not.toBeNull();
    }
    // text-like enrichment stays a light container (NOT self-framed)
    for (const kind of ["callout", "example"]) {
      const sec = container.querySelector(`.is-enrichment.kind-${kind}`)!;
      expect(sec, kind).not.toBeNull();
      expect(sec.classList.contains("is-selfframed"), kind).toBe(false);
    }
  });

  it("book-origin blocks carry neither the enrichment wrapper nor the self-framed modifier", () => {
    const { container } = renderPage(richPage);
    const bookSummary = container.querySelector(".learning-reader-block.is-book .learning-reader-callout.kind-summary");
    expect(bookSummary).not.toBeNull();                                   // book summary callout keeps its own box
    expect(bookSummary!.closest(".is-enrichment")).toBeNull();
    expect(container.querySelectorAll(".learning-reader-block.is-book").length).toBeGreaterThan(0);
  });
});

describe("enrichment economy — no duplicated labels", () => {
  it("a clarification renders «توضيح المعلم» exactly once (the tag) and drops the inner callout box", () => {
    const { container } = renderPage(richPage);
    const clar = container.querySelector(".is-enrichment.kind-callout")!;
    expect(clar).not.toBeNull();
    // exactly one occurrence of the label text inside the clarification block
    expect(countOccurrences(clar.textContent || "", "توضيح المعلم")).toBe(1);
    // the redundant inner callout box (and its label element) are gone; the body remains
    expect(clar.querySelector(".learning-reader-callout")).toBeNull();
    expect(clar.querySelector(".learning-reader-callout-label")).toBeNull();
    expect(clar.querySelector(".learning-reader-callout-body")).not.toBeNull();
    // still identified as enrichment (tag + aria)
    expect(clar.querySelector(".learning-reader-enrichment-tag")).not.toBeNull();
    expect(clar.getAttribute("aria-label")).toBe("توضيح المعلم");
  });

  it("a practice block shows «جرّب بنفسك» exactly once (no inner kicker duplicate)", () => {
    const { container } = renderPage(richPage);
    const prac = container.querySelector(".is-enrichment.kind-practice")!;
    expect(countOccurrences(prac.textContent || "", "جرّب بنفسك")).toBe(1);
  });
});

describe("enrichment economy — functional behaviour preserved", () => {
  it("practice stays interactive (radiogroup); practice-table stays interactive (select); visual + activity render", () => {
    const page: ContentPage = {
      ...richPage,
      blocks: [
        ...richPage.blocks,
        { id: "z-visual", type: "visual", origin: "teacher-enrichment", visualId: "791381/m04/sw6-router-trunk", alt: "مخطط الشبكة" },
        {
          id: "z-ptable", type: "practice-table", origin: "teacher-enrichment", studyEligible: false,
          headers: ["الجملة", "الإجابة"], columnDirs: ["rtl", "rtl"],
          rows: [["أكمل", { kind: "select", options: ["الراديو", "الضوء"], key: "الراديو" }]],
        },
      ],
    } as ContentPage;
    const { container } = renderPage(page);
    // practice interactive surface
    expect(container.querySelector(".is-enrichment.kind-practice [role='radiogroup']")).not.toBeNull();
    // practice-table interactive surface (native select)
    const ptable = container.querySelector(".is-enrichment.kind-practice-table")!;
    expect(within(ptable as HTMLElement).getAllByRole("combobox").length).toBeGreaterThan(0);
    // visual figure intact
    const vis = container.querySelector(".is-enrichment.kind-visual")!;
    expect(vis.querySelector(".eb-visual-figure")).not.toBeNull();
    // activity host (or its faithful fallback) intact for the simulation
    const sim = container.querySelector(".is-enrichment.kind-simulation")!;
    expect(sim.querySelector(".learning-activity, .learning-activity-fallback, .learning-reader-simulation")).not.toBeNull();
  });

  it("Study Strength eligibility is unchanged (pure content — presentation does not touch it)", () => {
    // the rich page's eligible activities are exactly its keyed practice(s); rendering does not alter that set.
    const before = eligibleStudyActivities(richPage).map(a => a.activityId).sort();
    renderPage(richPage);
    const after = eligibleStudyActivities(richPage).map(a => a.activityId).sort();
    expect(after).toEqual(before);
    expect(before.length).toBeGreaterThan(0);   // the fixture has at least one eligible exercise
  });
});
