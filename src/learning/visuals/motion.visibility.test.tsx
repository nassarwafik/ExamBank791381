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

// A controllable IntersectionObserver: capture instances and fire their callback on demand.
type Entry = { isIntersecting: boolean; target: Element };
class MockIO {
  static instances: MockIO[] = [];
  cb: (entries: Entry[], obs: MockIO) => void;
  elements: Element[] = [];
  disconnected = false;
  constructor(cb: (entries: Entry[], obs: MockIO) => void) { this.cb = cb; MockIO.instances.push(this); }
  observe(el: Element) { this.elements.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fire(isIntersecting: boolean) { this.cb(this.elements.map(target => ({ isIntersecting, target })), this); }
}

const RealIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
afterEach(() => {
  cleanup();
  MockIO.instances = [];
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = RealIO;
});
function useMockIO() { (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIO; }

describe("VisualBlockView — motion begins when the figure is visible", () => {
  it("motion ON: observes the figure and restarts each animated SVG's SMIL timeline (setCurrentTime(0)) on first intersection, then disconnects", () => {
    setMatchMedia(false);
    useMockIO();
    const { container } = render(<VisualBlockView block={block} />);
    expect(MockIO.instances.length).toBe(1);
    const io = MockIO.instances[0];
    expect(io.elements.length).toBe(1);
    expect((io.elements[0] as HTMLElement).classList.contains("eb-visual-frame")).toBe(true);

    // the animated SVG carries SMIL and (in this DOM) no native timeline — install a spy so the restart is observable
    const svg = container.querySelector("svg.eb-visual") as SVGSVGElement & { setCurrentTime: (t: number) => void };
    expect(svg.querySelector("animateMotion")).not.toBeNull();
    const spy = vi.fn();
    (svg as unknown as { setCurrentTime: (t: number) => void }).setCurrentTime = spy;

    io.fire(true);
    expect(spy).toHaveBeenCalledWith(0);      // the timeline is replayed from the start, now that it is visible
    expect(io.disconnected).toBe(true);       // calm: one play per view (revisit replays via remount)
  });

  it("not-yet-visible: an intersection with isIntersecting=false does NOT restart and does NOT disconnect", () => {
    setMatchMedia(false);
    useMockIO();
    const { container } = render(<VisualBlockView block={block} />);
    const io = MockIO.instances[0];
    const svg = container.querySelector("svg.eb-visual")!;
    const spy = vi.fn();
    (svg as unknown as { setCurrentTime: (t: number) => void }).setCurrentTime = spy;
    io.fire(false);
    expect(spy).not.toHaveBeenCalled();
    expect(io.disconnected).toBe(false);
  });

  it("reduced motion: no IntersectionObserver is created (nothing to restart — the component renders a still frame)", () => {
    setMatchMedia(true);
    useMockIO();
    render(<VisualBlockView block={block} />);
    expect(MockIO.instances.length).toBe(0);
  });

  it("unknown visualId: no observer is created (there is no resolved visual to animate)", () => {
    setMatchMedia(false);
    useMockIO();
    render(<VisualBlockView block={{ ...block, visualId: "791381/ch1/nope" }} />);
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

  it("renders the visual as INLINE SVG through the reader chain — never wrapped in <img>, never rasterized", () => {
    setMatchMedia(false);
    useMockIO();
    const { container } = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    const fig = container.querySelector(".eb-visual-figure")!;
    expect(fig).not.toBeNull();
    const svg = screen.getByRole("img", { name: block.alt });
    expect(svg.tagName.toLowerCase()).toBe("svg");           // the illustration is a live inline SVG
    expect(fig.querySelector("img")).toBeNull();             // not wrapped in an <img>
    expect(fig.querySelector("canvas")).toBeNull();          // not rasterized
    expect(container.innerHTML).not.toMatch(/data:image/);   // no embedded raster
  });

  it("passes reducedMotion through the chain: motion on ⇒ SMIL present; reduced ⇒ SMIL stripped, still SVG intact", () => {
    setMatchMedia(false);
    useMockIO();
    const on = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    expect(on.container.querySelectorAll("animateMotion").length).toBeGreaterThan(0);
    cleanup();

    setMatchMedia(true);
    const off = render(<LearningPageRenderer header={header(page())} body={{ kind: "ready", page: page() }} />);
    expect(off.container.querySelectorAll("animateMotion").length).toBe(0);
    expect(off.container.querySelector('svg[role="img"]')).not.toBeNull();  // still frame remains a valid SVG
  });
});
