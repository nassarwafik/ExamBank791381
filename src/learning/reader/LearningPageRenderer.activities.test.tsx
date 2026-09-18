// @vitest-environment happy-dom
// Phase 3A — the reader DELEGATES the four interactive-activity families to the engine shell. This proves the
// delegation both ways: with no injected registry every activity shows its static fallback (production path), and
// with an injected demo registry each family renders its live component — without the renderer knowing anything
// about simulations/animations itself.
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
  it("renders a static fallback for every activity family when no registry is injected (production path)", () => {
    const { container } = render(<LearningPageRenderer header={header} body={{ kind: "ready", page: showcasePage }} />);
    expect(container.querySelectorAll(".learning-activity-fallback").length).toBe(4);
    expect(screen.queryByTestId("demo-activity")).toBeNull();
  });

  it("renders each family's live component through the injected registry, in authored order, inside enrichment surfaces", async () => {
    const emit = vi.fn();
    const { container } = render(
      <LearningPageRenderer header={header} body={{ kind: "ready", page: showcasePage }} activity={{ registry: demoActivityRegistry, emit }} />,
    );
    const demos = await screen.findAllByTestId("demo-activity");
    expect(demos.length).toBe(4);
    // all four sit in clearly-labelled, non-color-only enrichment surfaces
    expect(container.querySelectorAll(".learning-reader-block.is-enrichment").length).toBe(4);
    const tag = { selector: ".learning-reader-enrichment-tag" } as const;
    expect(screen.getByText("محاكاة", tag)).toBeTruthy();       // simulation enrichment tag
    expect(screen.getByText("رسم متحرك", tag)).toBeTruthy();     // animation
    expect(screen.getByText("نشاط موجّه", tag)).toBeTruthy();    // guided
    expect(screen.getByText("مخطط تفاعلي", tag)).toBeTruthy();   // interactive-diagram
  });
});
