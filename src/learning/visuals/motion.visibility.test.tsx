// @vitest-environment happy-dom
// The RUNTIME motion-delivery fix: a one-shot educational SVG sequence begins at a fixed offset from MOUNT, so in the
// page-at-a-time reader a sequence low on the page can finish (fill="freeze") before the learner scrolls to it. The
// VisualBlockView restarts each animated SVG's SMIL timeline the first time the figure is actually visible, so the
// motion is noticeable after render — and it never runs under reduced motion nor where IntersectionObserver is absent.
// These tests exercise that delivery path and the Reader → VisualBlockView → registry-component integration.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import VisualBlockView from "./VisualBlockView";
import LearningPageRenderer, { type ReaderPageHeader } from "../reader/LearningPageRenderer";
import type { VisualBlock, ContentPage } from "../content/types";

const MOTION_ID = "791381/ch1/network-connected-devices";   // motion:true, uses SMIL <animateMotion>
const block: VisualBlock = {
  id: "v1", type: "visual", origin: "teacher-enrichment", visualId: MOTION_ID,
  alt: "رسم يبيّن أجهزة متصلة بشبكة مركزية.", title: "الشبكة أجهزة متصلة", caption: "تتبادل الأجهزة المعلومات.", motion: true,
};

function setMatchMedia(reduced: boolean) {
  const mql = { matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} };
  (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
}

// A controllable IntersectionObserver: capture instances + the requested threshold, and fire the callback on demand
// with a realistic entry (isIntersecting AND intersectionRatio, exactly what the browser provides).
type Entry = { isIntersecting: boolean; intersectionRatio: number; target: Element };
class MockIO {
  static instances: MockIO[] = [];
  cb: (entries: Entry[], obs: MockIO) => void;
  options: { threshold?: number | number[] };
  elements: Element[] = [];
  disconnected = false;
  constructor(cb: (entries: Entry[], obs: MockIO) => void, options: { threshold?: number | number[] } = {}) { this.cb = cb; this.options = options; MockIO.instances.push(this); }
  observe(el: Element) { this.elements.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  // Fire with a visibility ratio; isIntersecting is true for any ratio > 0 (as the real observer reports for a sliver).
  // A disconnected observer delivers nothing more — exactly the browser's contract, which is how "one play per view"
  // is enforced (the component keeps no fired-flag; it relies on disconnect()).
  fireRatio(ratio: number) { if (this.disconnected) return; this.cb(this.elements.map(target => ({ isIntersecting: ratio > 0, intersectionRatio: ratio, target })), this); }
}

const RealIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
afterEach(() => {
  cleanup();
  MockIO.instances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = RealIO;
});
function useMockIO() { (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIO; }

// Render the motion visual, wait for its LAZY chunk (Phase 8E-6) to resolve, spy on the inner SVG's SMIL timeline, and
// return the observer + spy for driving. The observer is created at mount (it watches the frame, not the SVG).
async function renderMotion(b: VisualBlock = block) {
  const r = render(<VisualBlockView block={b} />);
  const io = MockIO.instances[0];
  await screen.findByRole("img", { name: b.alt });
  const svg = r.container.querySelector("svg.eb-visual") as SVGSVGElement & { setCurrentTime: (t: number) => void };
  const spy = vi.fn();
  if (svg) (svg as unknown as { setCurrentTime: (t: number) => void }).setCurrentTime = spy;
  return { ...r, io, svg, spy };
}

describe("VisualBlockView — motion begins only when the figure is MEANINGFULLY visible", () => {
  it("observes with threshold 0.25 and only an animated (motion:true) visual", async () => {
    setMatchMedia(false);
    useMockIO();
    const { io } = await renderMotion();
    expect(MockIO.instances.length).toBe(1);
    expect(io.elements.length).toBe(1);
    expect((io.elements[0] as HTMLElement).classList.contains("eb-visual-frame")).toBe(true);
    expect(io.options.threshold).toBe(0.25);   // the exact audited visibility threshold
  });

  // BLOCKER 1 — a bare sliver (isIntersecting true but ratio below 0.25) must NOT replay or disconnect; only ≥0.25 does.
  const belowThreshold = [0.0, 0.01, 0.1, 0.24];
  for (const ratio of belowThreshold) {
    it(`ratio ${ratio}: does NOT restart and stays connected (a sub-threshold sliver is not "seen")`, async () => {
      setMatchMedia(false);
      useMockIO();
      const { io, spy } = await renderMotion();
      io.fireRatio(ratio);
      expect(spy).not.toHaveBeenCalled();
      expect(io.disconnected).toBe(false);
    });
  }

  it("ratio 0.25: restarts EXACTLY once (setCurrentTime(0)) and disconnects", async () => {
    setMatchMedia(false);
    useMockIO();
    const { io, spy } = await renderMotion();
    io.fireRatio(0.25);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(0);
    expect(io.disconnected).toBe(true);
  });

  it("ratio 0.50 as the first qualifying entry: restarts once and disconnects", async () => {
    setMatchMedia(false);
    useMockIO();
    const { io, spy } = await renderMotion();
    io.fireRatio(0.5);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(0);
    expect(io.disconnected).toBe(true);
  });

  it("sub-threshold entries first, then a qualifying one: replays only once, on the qualifying entry", async () => {
    setMatchMedia(false);
    useMockIO();
    const { io, spy } = await renderMotion();
    io.fireRatio(0.1); io.fireRatio(0.24);       // ignored
    expect(spy).not.toHaveBeenCalled();
    io.fireRatio(0.4);                            // qualifies
    expect(spy).toHaveBeenCalledTimes(1);
    expect(io.disconnected).toBe(true);
  });

  it("after the qualifying replay + disconnect, further entries produce NO additional replay (calm: one play per view)", async () => {
    setMatchMedia(false);
    useMockIO();
    const { io, spy } = await renderMotion();
    io.fireRatio(0.6);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(io.disconnected).toBe(true);
    // a disconnected observer delivers nothing more → no second replay (the calm "one play per view" guarantee)
    io.fireRatio(0.9); io.fireRatio(1.0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: no IntersectionObserver is created (nothing to restart — the component renders a still frame)", async () => {
    setMatchMedia(true);
    useMockIO();
    render(<VisualBlockView block={block} />);
    expect(MockIO.instances.length).toBe(0);
  });

  it("unknown visualId: no observer is created (there is no resolved visual to animate)", async () => {
    setMatchMedia(false);
    useMockIO();
    render(<VisualBlockView block={{ ...block, visualId: "791381/ch1/nope" }} />);
    expect(MockIO.instances.length).toBe(0);
  });

  // BLOCKER 2 — an intentionally static registered visual (motion:false) must allocate NO observer at all.
  it("motion:false visual (registry-audited static): no IntersectionObserver is created", async () => {
    setMatchMedia(false);
    useMockIO();
    // m21/well-known-ports is registered motion:false (a reference port table — intentionally static)
    render(<VisualBlockView block={{ ...block, visualId: "791381/m21/well-known-ports" }} />);
    expect(MockIO.instances.length).toBe(0);
  });
});

describe("Reader integration — LearningPageRenderer → VisualBlockView → registry component", () => {
  const page = (): ContentPage => ({
    id: "t-p1", title: "صفحة اختبار", order: 1,
    source: { kind: "book", sourceId: "791381", pdfPageStart: 1 },
    blocks: [block],
  });
  const header = (p: ContentPage): ReaderPageHeader => ({
    courseId: "791381", pageTitle: p.title, moduleTitle: "وحدة", lessonTitle: "درس",
    position: { index: 1, total: 1 }, source: p.source,
  });

  it("renders the visual as INLINE SVG through the reader chain — never wrapped in <img>, never rasterized", async () => {
    setMatchMedia(false);
    useMockIO();
    const { container } = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    const fig = container.querySelector(".eb-visual-figure")!;
    expect(fig).not.toBeNull();
    const svg = await screen.findByRole("img", { name: block.alt });        // Phase 8E-6: the SVG is a lazy chunk
    expect(svg.tagName.toLowerCase()).toBe("svg");           // the illustration is a live inline SVG
    expect(fig.querySelector("img")).toBeNull();             // not wrapped in an <img>
    expect(fig.querySelector("canvas")).toBeNull();          // not rasterized
    expect(container.innerHTML).not.toMatch(/data:image/);   // no embedded raster
  });

  it("passes reducedMotion through the chain: motion on ⇒ SMIL present; reduced ⇒ SMIL stripped, still SVG intact", async () => {
    setMatchMedia(false);
    useMockIO();
    const on = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    await screen.findByRole("img", { name: block.alt });
    expect(on.container.querySelectorAll("animateMotion").length).toBeGreaterThan(0);
    cleanup();

    setMatchMedia(true);
    const off = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    await screen.findByRole("img", { name: block.alt });
    expect(off.container.querySelectorAll("animateMotion").length).toBe(0);
    expect(off.container.querySelector('svg[role="img"]')).not.toBeNull();  // still frame remains a valid SVG
  });
});
