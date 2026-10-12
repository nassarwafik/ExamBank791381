// @vitest-environment happy-dom
//
// Phase 21E.2 — review cluster K1 on the shared ActionMenu (the builder toolbar's «إضافة أسئلة» / «المزيد» menus):
//   A-F1  opening a menu called focus() on its first control, but in a real browser focus stayed on the trigger: the global
//         `button { transition: .18s ease }` (transition-property all, App.css) also transitions the control's INHERITED
//         visibility from the measuring frame's `hidden` to `visible`, and at the transition's first instant the control is
//         still hidden, so focus() is ignored. happy-dom runs no CSS transitions, so the browser is EMULATED below: a control
//         refuses focus until its visibility transition is finished (or, without getAnimations, until a frame has passed).
//   A-F2  at 640 × 450 (200 % zoom) the 9-item «المزيد» panel opened below the toolbar with maxHeight = vh − 2·gap and ran off
//         the viewport; its own scroll then closed it (the capture scroll listener treated it as a page scroll).
//   C-F6  the panel was portalled to <body>, outside the builder's aria-modal dialog (WebKit / VoiceOver may hide content
//         outside an aria-modal subtree): it now lives inside the trigger's aria-modal surface unless that surface re-bases
//         position:fixed.
// The real-browser evidence is scripts/capture-visual-gate-21e2-builder.mjs (checks M-0 / M-0m / M-0n, M-2a–c, M-3).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import { useRef } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ActionMenu from "./ActionMenu";
import useModalSurface from "./useModalSurface";

const restorers: (() => void)[] = [];
afterEach(() => { cleanup(); while (restorers.length) restorers.pop()!(); vi.restoreAllMocks(); });

const panelOf = (label: string) => document.querySelector<HTMLElement>('.eb-menu-panel[aria-label="' + label + '"]');
const frame = () => new Promise(r => requestAnimationFrame(() => r(undefined)));

function Menu({ label = "المزيد", count = 3 }: { label?: string; count?: number }) {
  return <ActionMenu label={label}>{Array.from({ length: count }, (_, i) => <button key={i} type="button" className="eb-menu-item">بند {i + 1}</button>)}</ActionMenu>;
}

// ── A-F1 browser emulation ────────────────────────────────────────────────────────────────────────────────────────────
type Fake = { transitionProperty: string; finish: () => void };
function emulateRevealTransition({ getAnimations }: { getAnimations: boolean }) {
  const settled = new WeakSet<Element>();
  const finished: string[] = [];
  let refused = 0;
  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    const panel = this.closest(".eb-menu-panel");
    if (panel && panel.getAttribute("data-ready") === "true" && !settled.has(this)) {
      refused++;                                                         // inherited visibility is still `hidden` at p = 0
      if (!getAnimations) requestAnimationFrame(() => settled.add(this));   // a frame later p > 0 → visible
      return;
    }
    return originalFocus.call(this, options);
  };
  restorers.push(() => { HTMLElement.prototype.focus = originalFocus; });
  const proto = Element.prototype as unknown as { getAnimations?: (o?: { subtree?: boolean }) => Fake[] };
  const originalGetAnimations = proto.getAnimations;
  proto.getAnimations = getAnimations ? function (this: Element, o?: { subtree?: boolean }) {
    if (!this.classList.contains("eb-menu-panel") || !o?.subtree || this.getAttribute("data-ready") !== "true") return [];
    return Array.from(this.querySelectorAll("button")).flatMap(b => [
      { transitionProperty: "visibility", finish: () => { finished.push("visibility"); settled.add(b); } },
      { transitionProperty: "background-color", finish: () => { finished.push("background-color"); } }
    ]);
  } : undefined;
  restorers.push(() => { proto.getAnimations = originalGetAnimations; });
  return { finished, refused: () => refused };
}

describe("A-F1 — focus lands inside the panel whatever global transitions exist", () => {
  it("one click: the reveal's visibility transitions are finished BEFORE the first control is focused, so focus is inside at once; other transitions are left alone", () => {
    const emu = emulateRevealTransition({ getAnimations: true });
    render(<><Menu /><button type="button">بعد</button></>);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    trigger.focus();
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(panel).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 1" }));   // synchronously, before any key
    expect(emu.refused()).toBe(0);
    expect(emu.finished.length).toBeGreaterThan(0);
    expect(emu.finished.every(p => p === "visibility")).toBe(true);    // a hover colour transition is never cut short
    // Tab now leaves the OPEN menu as specified (to the control after the trigger), instead of walking past it from the trigger.
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(panelOf("المزيد")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بعد" }));
  });

  it("an engine without getAnimations: the refused focus is retried once on the next frame (still only while focus sits on the trigger)", async () => {
    const emu = emulateRevealTransition({ getAnimations: false });
    render(<Menu />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(emu.refused()).toBe(1);
    await frame(); await frame();
    expect(panelOf("المزيد")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 1" }));
  });

  it("the retry never steals focus the user already moved elsewhere", async () => {
    emulateRevealTransition({ getAnimations: false });
    render(<><Menu /><input aria-label="حقل" /></>);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    trigger.focus();
    fireEvent.click(trigger);
    const field = screen.getByLabelText("حقل") as HTMLInputElement;
    HTMLElement.prototype.focus.call(field);                             // not a panel control: focus is allowed
    await frame(); await frame();
    expect(document.activeElement).toBe(field);
  });
});

// ── A-F2 placement ────────────────────────────────────────────────────────────────────────────────────────────────────
function mockRects(trigger: HTMLElement, t: { top: number; height: number }, panelHeight: number) {
  vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({ top: t.top, bottom: t.top + t.height, left: 500, right: 600, width: 100, height: t.height, x: 500, y: t.top, toJSON() {} } as DOMRect);
  vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return (this.classList.contains("eb-menu-panel") ? { top: 0, left: 0, right: 240, bottom: panelHeight, width: 240, height: panelHeight, x: 0, y: 0, toJSON() {} } : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
  });
}
const px = (v: string) => Number(v.replace("px", ""));

describe("A-F2 — a panel taller than its room opens on the roomier side, capped to that room, and scrolls inside", () => {
  it("trigger near the top (the 200 % zoom toolbar): opens below with maxHeight = vh − top − gap, so its bottom edge stays inside the viewport", () => {
    const vh = window.innerHeight;
    render(<Menu count={9} />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    mockRects(trigger, { top: 135, height: 44 }, vh + 200);             // taller than the whole viewport
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(px(panel.style.top)).toBe(135 + 44 + 4);
    expect(px(panel.style.maxHeight)).toBe(vh - (135 + 44 + 4) - 4);
    expect(px(panel.style.top) + px(panel.style.maxHeight)).toBeLessThanOrEqual(vh - 4);
  });

  it("trigger near the bottom: opens above with maxHeight = trigger.top − 2·gap, ending one gap above the trigger", () => {
    const vh = window.innerHeight;
    render(<Menu count={9} />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    mockRects(trigger, { top: vh - 100, height: 44 }, vh + 200);
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(px(panel.style.maxHeight)).toBe(vh - 100 - 8);
    expect(px(panel.style.top)).toBe(4);
    expect(px(panel.style.top) + px(panel.style.maxHeight)).toBe(vh - 100 - 4);   // bottom edge = trigger.top − gap
  });

  it("a panel that fits on neither side but has more room above opens above (prefers the roomier side)", () => {
    const vh = window.innerHeight;
    render(<Menu count={9} />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    mockRects(trigger, { top: Math.round(vh * 0.6), height: 40 }, vh);
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(px(panel.style.top)).toBe(4);
    expect(px(panel.style.maxHeight)).toBe(Math.round(vh * 0.6) - 8);
  });

  it("tiny rooms on both sides: the panel keeps a usable 120 px and is shifted to stay inside the viewport (it may overlap its trigger)", () => {
    const vh = window.innerHeight;
    render(<Menu count={9} />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    mockRects(trigger, { top: 60, height: vh - 128 }, 400);             // roomBelow 60 > roomAbove 52 → below
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(px(panel.style.maxHeight)).toBe(120);
    expect(px(panel.style.top)).toBe(vh - 4 - 120);                      // not trigger.bottom + gap (that would end off-screen)
    expect(px(panel.style.top) + px(panel.style.maxHeight)).toBeLessThanOrEqual(vh - 4);
  });

  it("scrolling INSIDE the panel (an item brought into view) keeps the menu open; a page or ancestor scroll still closes it", () => {
    render(<div data-testid="scroller"><Menu count={9} /></div>);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    act(() => { panel.dispatchEvent(new Event("scroll")); });           // the panel's own overflow scroll
    act(() => { panel.querySelector("button")!.dispatchEvent(new Event("scroll")); });
    expect(panelOf("المزيد")).not.toBeNull();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });   // wraps to the last item
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 9" }));
    act(() => { screen.getByTestId("scroller").dispatchEvent(new Event("scroll")); });   // an ancestor scroller moves the trigger: close
    expect(panelOf("المزيد")).toBeNull();
    fireEvent.click(trigger);
    expect(panelOf("المزيد")).not.toBeNull();
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(panelOf("المزيد")).toBeNull();
  });
});

describe("A-F2 — the capped panel keeps its scroll to itself (static pin; CSS is stubbed under Vitest, Chromium check M-2b)", () => {
  it("the menu panel scrolls inside (overflow:auto) and contains its overscroll, so reaching its end never scrolls the page under it", () => {
    const css = readFileSync(resolve(__dirname, "..", "page-parts.css"), "utf8");
    const at = css.indexOf(".eb-menu-panel{");
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toMatch(/overflow:auto;/);
    expect(body).toMatch(/overscroll-behavior:contain;/);
  });
});

// ── C-F6 portal target ────────────────────────────────────────────────────────────────────────────────────────────────
function Surface({ onEscape = () => {}, style }: { onEscape?: () => void; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalSurface(ref, true, onEscape);
  return <div ref={ref} data-testid="surface" role="dialog" aria-modal="true" aria-label="محرر" tabIndex={-1} style={style}>
    <button type="button">أول</button><Menu /><button type="button">بعد</button>
  </div>;
}

describe("C-F6 — the panel is portalled into the trigger's aria-modal surface", () => {
  it("inside an aria-modal surface the panel is the surface's child (fixed, on its layer); Escape closes only the menu; Tab continues after the trigger; the surface trap stays out", () => {
    const onEscape = vi.fn();
    render(<><button type="button">خارج</button><Surface onEscape={onEscape} /></>);
    const surface = screen.getByTestId("surface");
    const trigger = screen.getByRole("button", { name: "المزيد" });
    fireEvent.click(trigger);
    const panel = panelOf("المزيد") as HTMLElement;
    expect(panel.parentElement).toBe(surface);
    expect(panel.style.position).toBe("fixed");
    expect(panel.getAttribute("data-ready")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 1" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(panelOf("المزيد")).toBeNull();
    expect(onEscape).not.toHaveBeenCalled();                             // the surface yields Escape to the menu
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 2" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(panelOf("المزيد")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بعد" }));   // not the panel's DOM order, not «أول»
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(trigger);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("an item's own handler still runs and the outside-click close still works when the panel lives in the surface", () => {
    const onA = vi.fn();
    function S() {
      const ref = useRef<HTMLDivElement>(null);
      useModalSurface(ref, true, () => {});
      return <div ref={ref} role="dialog" aria-modal="true" aria-label="محرر" tabIndex={-1}><button type="button">أول</button>
        <ActionMenu label="المزيد"><button type="button" className="eb-menu-item" onClick={onA}>تنفيذ</button></ActionMenu></div>;
    }
    render(<S />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "تنفيذ" }));
    expect(onA).toHaveBeenCalledTimes(1);
    expect(panelOf("المزيد")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "أول" }));
    expect(panelOf("المزيد")).toBeNull();
  });

  it("without an aria-modal ancestor the panel stays a child of <body>", () => {
    render(<div role="dialog" aria-label="ليس نموذجيًا"><Menu /></div>);
    fireEvent.click(screen.getByRole("button", { name: "المزيد" }));
    expect((panelOf("المزيد") as HTMLElement).parentElement).toBe(document.body);
  });

  it("a surface (or an ancestor of it) that re-bases position:fixed keeps the panel in <body>, so its viewport coordinates hold", () => {
    const { unmount } = render(<Surface style={{ transform: "translateX(0px)" }} />);
    fireEvent.click(screen.getByRole("button", { name: "المزيد" }));
    expect((panelOf("المزيد") as HTMLElement).parentElement).toBe(document.body);
    unmount();
    render(<div style={{ filter: "blur(0px)" }}><Surface /></div>);
    fireEvent.click(screen.getByRole("button", { name: "المزيد" }));
    expect((panelOf("المزيد") as HTMLElement).parentElement).toBe(document.body);
  });
});
