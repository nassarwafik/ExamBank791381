// @vitest-environment happy-dom
// Phase 3A — the reader DELEGATES the four interactive-activity families to the engine shell. This proves the
// delegation both ways: with no injected registry the three REGISTRY families show their static fallback
// (production path) while GUIDED renders its built-in progressive-reveal presenter; with an injected demo registry
// each registry family renders its live component — without the renderer knowing anything about simulations.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import { showcasePage, demoActivityRegistry } from "../activities/activityFixtures";

afterEach(cleanup);

const header: ReaderPageHeader = {
  courseId: "791381", pageTitle: showcasePage.title, moduleTitle: "الوحدة", lessonTitle: "الدرس",
  position: { index: 1, total: 1 }, source: showcasePage.source,
};

describe("Phase 3A — LearningPageRenderer activity delegation", () => {
  it("with no registry injected (production path): 3 static fallbacks + the built-in guided presenter, no live registry component", () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page: showcasePage }} />);
    expect(container.querySelectorAll(".learning-activity-fallback").length).toBe(3);   // simulation, animation, interactive-diagram
    expect(container.querySelectorAll(".learning-guided").length).toBe(1);             // guided is built-in
    expect(screen.queryByTestId("demo-activity")).toBeNull();
    // NO enrichment surface (fallback or guided) claims book provenance — only the page header's own badge may.
    for (const el of container.querySelectorAll(".learning-reader-block.is-enrichment")) {
      expect(el.textContent).not.toContain("من الكتاب");
    }
    expect(container.querySelectorAll(".learning-activity-fallback").length).toBe(3);
  });

  it("renders each registry family's live component through the injected registry, in authored order, inside enrichment surfaces", async () => {
    const emit = vi.fn();
    const { container } = render(
      <LearningPageRenderer header={header} body={{ kind: "ready", page: showcasePage }} activity={{ registry: demoActivityRegistry, emit }} />,
    );
    const demos = await screen.findAllByTestId("demo-activity");
    expect(demos.length).toBe(3);                                                      // simulation, animation, interactive-diagram
    expect(container.querySelectorAll(".learning-guided").length).toBe(1);             // guided still built-in
    // all four sit in clearly-labelled, non-color-only enrichment surfaces
    expect(container.querySelectorAll(".learning-reader-block.is-enrichment").length).toBe(4);
    const tag = { selector: ".learning-reader-enrichment-tag" } as const;
    expect(screen.getByText("محاكاة", tag)).toBeTruthy();       // simulation enrichment tag
    expect(screen.getByText("رسم متحرك", tag)).toBeTruthy();     // animation
    expect(screen.getByText("نشاط موجّه", tag)).toBeTruthy();    // guided
    expect(screen.getByText("مخطط تفاعلي", tag)).toBeTruthy();   // interactive-diagram
    // authored order preserved: simulation → animation → guided → interactive-diagram
    const kinds = [...container.querySelectorAll(".learning-reader-block.is-enrichment")].map(el => el.className.match(/kind-([a-z-]+)/)?.[1]);
    expect(kinds).toEqual(["simulation", "animation", "guided", "interactive-diagram"]);
  });
});
