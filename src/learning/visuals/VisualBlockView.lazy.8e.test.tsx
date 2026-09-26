// @vitest-environment happy-dom
//
// Phase 8E-6 — VisualBlockView with a LAZY visual chunk: the figure structure (title / frame / caption) is stable while the
// chunk loads and only the frame shows a quiet status line; the one-shot motion delivery keeps working whether the SVG
// arrives before or after the figure becomes visible; reduced-motion and static visuals still allocate no observer; an
// unmount before the chunk resolves does no stale DOM work. Each scenario gates a DIFFERENT trusted group module (a
// resolved module is cached for the rest of the file), so every test observes its own pending → resolved transition.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import VisualBlockView from "./VisualBlockView";
import type { VisualBlock } from "../content/types";

type Gate = { release: () => void; open: Promise<void> };
const gates = vi.hoisted(() => {
  const make = (): Gate => { const g = { release: () => {}, open: Promise.resolve() }; g.open = new Promise<void>(r => { g.release = r; }); return g; };
  return { ch1: make(), m10: make(), m07: make(), m08: make(), m21: make() };
});
vi.mock("./791381/groups/ch1", async importOriginal => { await gates.ch1.open; return importOriginal(); });
vi.mock("./791381/groups/m10", async importOriginal => { await gates.m10.open; return importOriginal(); });
vi.mock("./791381/groups/m07", async importOriginal => { await gates.m07.open; return importOriginal(); });
vi.mock("./791381/groups/m08", async importOriginal => { await gates.m08.open; return importOriginal(); });
vi.mock("./791381/groups/m21", async importOriginal => { await gates.m21.open; return importOriginal(); });

const FALLBACK = "جارٍ تحميل الرسم التوضيحي...";
const blockFor = (visualId: string, alt: string): VisualBlock => ({ id: "v-" + visualId, type: "visual", origin: "teacher-enrichment", visualId, alt, title: "عنوان " + alt, caption: "شرح " + alt, motion: true });

function setMatchMedia(reduced: boolean) {
  const mql = { matches: reduced, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} };
  (window as unknown as { matchMedia: unknown }).matchMedia = () => mql;
}
type Entry = { isIntersecting: boolean; intersectionRatio: number; target: Element };
class MockIO {
  static instances: MockIO[] = [];
  cb: (entries: Entry[], obs: MockIO) => void; options: { threshold?: number }; elements: Element[] = []; disconnected = false;
  constructor(cb: (entries: Entry[], obs: MockIO) => void, options: { threshold?: number } = {}) { this.cb = cb; this.options = options; MockIO.instances.push(this); }
  observe(el: Element) { this.elements.push(el); }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  fireRatio(ratio: number) { if (this.disconnected) return; this.cb(this.elements.map(target => ({ isIntersecting: ratio > 0, intersectionRatio: ratio, target })), this); }
}
const RealIO = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
const useMockIO = () => { (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = MockIO; };
afterEach(() => { cleanup(); MockIO.instances = []; (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = RealIO; vi.restoreAllMocks(); });
const spyTimeline = (container: HTMLElement) => { const svg = container.querySelector("svg.eb-visual") as SVGSVGElement; const spy = vi.fn(); (svg as unknown as { setCurrentTime: (t: number) => void }).setCurrentTime = spy; return spy; };
const release = (g: Gate) => act(async () => { g.release(); await g.open; });

describe("8E-6 — figure structure and the local loading state", () => {
  it("1. motion:true, chunk resolves while OFF-SCREEN: figure/title/caption + ONE frame observer from the start, only the frame shows the status line; a visibility hit before the SVG exists does not consume the one-shot; the first ≥25% visibility after the SVG arrives replays exactly once", async () => {
    setMatchMedia(false); useMockIO();
    const block = blockFor("791381/ch1/network-connected-devices", "أجهزة متصلة");
    const { container } = render(<VisualBlockView block={block} />);
    // suspended frame: stable figure, quiet status inside the frame, no SVG yet
    const fig = container.querySelector("figure.eb-visual-figure")!;
    expect(fig).not.toBeNull();
    expect(fig.querySelector("p.eb-visual-title")!.textContent).toBe(block.title);
    expect(fig.querySelector("figcaption")!.textContent).toBe(block.caption);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe(FALLBACK);
    expect(status.closest(".eb-visual-frame")).toBe(fig.querySelector(".eb-visual-frame"));
    expect(container.querySelector("svg")).toBeNull();
    expect(MockIO.instances.length).toBe(1);                                              // observer exists already (frame-based)
    const io = MockIO.instances[0];
    expect((io.elements[0] as HTMLElement).classList.contains("eb-visual-frame")).toBe(true);
    expect(io.options.threshold).toBe(0.25);
    // visible before the SVG exists → nothing to restart → the observer stays connected (the one-shot is not consumed)
    io.fireRatio(0.5);
    expect(io.disconnected).toBe(false);
    // the chunk arrives (still "off-screen" as far as the observer is concerned: no new entry until the next crossing)
    await release(gates.ch1);
    const svg = await screen.findByRole("img", { name: block.alt });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(svg.closest(".eb-visual-frame")).toBe(fig.querySelector(".eb-visual-frame"));  // same frame, structure intact
    expect(MockIO.instances.length).toBe(1);                                              // no second observer stacked
    const spy = spyTimeline(container);
    io.fireRatio(0.1);                                                                    // sliver → ignored
    expect(spy).not.toHaveBeenCalled(); expect(io.disconnected).toBe(false);
    io.fireRatio(0.3);                                                                    // first meaningful visibility with the SVG present
    expect(spy).toHaveBeenCalledTimes(1); expect(spy).toHaveBeenCalledWith(0); expect(io.disconnected).toBe(true);
    io.fireRatio(1);                                                                      // one play per view
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("2. motion:true, chunk resolves while ALREADY visible: the SVG receives the one-shot on the next qualifying entry, exactly once, one observer", async () => {
    setMatchMedia(false); useMockIO();
    const block = blockFor("791381/m10/p2p-direct", "اتصال مباشر");                    // a SMIL (animateMotion) one-shot visual
    const { container } = render(<VisualBlockView block={block} />);
    await release(gates.m10);
    await screen.findByRole("img", { name: block.alt });
    expect(MockIO.instances.length).toBe(1);
    const io = MockIO.instances[0]; const spy = spyTimeline(container);
    io.fireRatio(0.5);
    expect(spy).toHaveBeenCalledTimes(1); expect(io.disconnected).toBe(true);
    io.fireRatio(0.9);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("3. reducedMotion=true: no observer before or after the chunk resolves, and the resolved SVG carries no motion markers", async () => {
    setMatchMedia(true); useMockIO();
    const block = blockFor("791381/m08/address-classes", "فئات العناوين");
    const { container } = render(<VisualBlockView block={block} />);
    expect(screen.getByRole("status").textContent).toBe(FALLBACK);
    expect(MockIO.instances.length).toBe(0);
    await release(gates.m08);
    await screen.findByRole("img", { name: block.alt });
    expect(MockIO.instances.length).toBe(0);
    expect(container.querySelectorAll("animate, animateMotion, animateTransform").length).toBe(0);
    expect(container.querySelectorAll("[class*='-anim'], .eb-visual-pulse").length).toBe(0);
  });

  it("4. motion:false (registry-audited static visual): no observer before or after the chunk resolves", async () => {
    setMatchMedia(false); useMockIO();
    const block = { ...blockFor("791381/m21/well-known-ports", "المنافذ المعروفة"), motion: false };
    render(<VisualBlockView block={block} />);
    expect(MockIO.instances.length).toBe(0);
    await release(gates.m21);
    await screen.findByRole("img", { name: block.alt });
    expect(MockIO.instances.length).toBe(0);
  });

  it("5. unmount BEFORE the chunk resolves: the observer is released, and the late module does no DOM work and raises no error", async () => {
    setMatchMedia(false); useMockIO();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const block = blockFor("791381/m07/ip-identity", "هوية IP");
    const { unmount, container } = render(<VisualBlockView block={block} />);
    expect(MockIO.instances.length).toBe(1);
    const io = MockIO.instances[0];
    unmount();
    expect(io.disconnected).toBe(true);
    await release(gates.m07);                                                             // the chunk arrives after the figure is gone
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
    expect(container.innerHTML).toBe("");
    expect(document.querySelector("svg.eb-visual")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    expect(MockIO.instances.length).toBe(1);                                              // nothing re-observed after unmount
  });

  it("6. unknown visualId: the existing 'قيد الإعداد' fallback renders immediately — no status line, no observer, no chunk", () => {
    setMatchMedia(false); useMockIO();
    const block = blockFor("791381/ch1/does-not-exist", "بديل");
    render(<VisualBlockView block={block} />);
    const img = screen.getByRole("img", { name: block.alt });
    expect(img.textContent).toContain("قيد الإعداد");
    expect(screen.queryByRole("status")).toBeNull();
    expect(MockIO.instances.length).toBe(0);
  });
});
