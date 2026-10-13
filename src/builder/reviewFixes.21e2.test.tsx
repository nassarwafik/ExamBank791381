// @vitest-environment happy-dom
//
// Phase 21E.2 — regression pins for the findings of the independent adversarial review of the first implementation:
//   P1  a menu opened from the builder toolbar painted UNDER the full-screen builder overlay (dropdown 20 < overlay 60);
//   P3  Tab from an ActionMenu item left the page / modal surface (the panel is portalled to the end of <body>) and left the
//       menu open;
//   P3  the CSS defects measured in Chromium: framed option / pair inputs shrank to their intrinsic width; «تنبيه:» broke
//       mid-word; icon-only undo / redo stayed 38 px under 768 px; the gated finalize hover and the open-menu trigger state.
// CSS is stubbed under Vitest, so the CSS pins read the sheets from disk (the Chromium harness measures the real result).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import ActionMenu from "../ui/ActionMenu";
import useModalSurface from "../ui/useModalSurface";

afterEach(cleanup);
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const tokens = read("design-tokens.css");
const token = (name: string) => Number(tokens.match(new RegExp("--" + name + "\\s*:\\s*(\\d+)"))?.[1]);
const rule = (css: string, selector: string) => { const i = css.indexOf(selector + "{") >= 0 ? css.indexOf(selector + "{") : css.indexOf(selector + " {"); if (i < 0) throw new Error("no rule " + selector); return css.slice(i, css.indexOf("}", i)); };

describe("menu layer (P1)", () => {
  it("an ActionMenu panel paints above the builder overlay and above dialogs", () => {
    const body = rule(read("page-parts.css"), ".eb-menu-panel");
    const m = body.match(/z-index\s*:\s*calc\(var\(--eb-z-modal\)\s*\+\s*(\d+)\)/);
    expect(m, "menu panel z-index is derived from the modal layer").not.toBeNull();
    const menuZ = token("eb-z-modal") + Number(m![1]);
    expect(menuZ).toBeGreaterThan(token("eb-z-overlay"));
    expect(menuZ).toBeGreaterThan(token("eb-z-modal"));
    expect(menuZ).toBeGreaterThan(token("eb-z-toast"));
  });
});

function Page() {
  return <><button type="button">قبل</button><ActionMenu label="المزيد"><button type="button">بند 1</button><button type="button">بند 2</button></ActionMenu><button type="button">بعد</button></>;
}
function Surface() {
  const ref = useRef<HTMLDivElement>(null);
  useModalSurface(ref, true, () => {});
  return <div ref={ref} role="dialog" aria-modal="true" aria-label="محرر" tabIndex={-1}><button type="button">أول</button><ActionMenu label="المزيد"><button type="button">بند</button></ActionMenu></div>;
}
describe("ActionMenu Tab (P3)", () => {
  it("Tab from an item closes the menu and continues after the trigger; Shift+Tab returns to the trigger", () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 1" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(screen.queryByRole("button", { name: "بند 1" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بعد" }));
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab", shiftKey: true });
    expect(screen.queryByRole("button", { name: "بند 1" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
  it("inside a modal surface Tab from the last trigger's menu wraps to the surface's first control (never leaves it)", () => {
    render(<Surface />);
    fireEvent.click(screen.getByRole("button", { name: "المزيد" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(screen.queryByRole("button", { name: "بند" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "أول" }));
  });
  it("Escape and arrow keys keep their behaviour", () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "المزيد" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "بند 2" }));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });
});

describe("CSS review fixes (static pins; measured in Chromium by scripts/capture-visual-gate-21e2.mjs)", () => {
  it("framed option / pair fields grow with the row", () => {
    expect(read("ui/field.css")).toMatch(/\.sb-option-row > \.eb-field, \.sb-field-row > \.eb-field \{ flex: 1 1 12rem; min-width: 0; \}/);
  });
  it("the inline issue severity word never breaks; only the message wraps", () => {
    const css = read("builder/builder-issues.css");
    expect(rule(css, ".sb-inline-issue-kind")).toMatch(/flex: 0 0 auto; white-space: nowrap/);
    expect(rule(css, ".sb-inline-issue-text")).toMatch(/flex: 1 1 auto; min-width: 0/);
  });
  it("under 768 px icon-only toolbar buttons are 44 px targets too", () => {
    const css = read("builder/builder-toolbar.css");
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/\.sb-tb-btn, \.sb-tb-btn\.is-icon, \.sb-toolbar-21e2 \.sb-tb-menu \{ min-height: 44px; min-width: 44px;/);
  });
  it("the gated finalize button keeps readable text on hover; an open menu trigger shows its state", () => {
    const css = read("builder/builder-toolbar.css");
    expect(css).toMatch(/\.sb-tb-btn\.is-primary\.is-gated, \.sb-tb-btn\.is-primary\.is-gated:hover:not\(:disabled\) \{ background: var\(--eb-surface\); color: var\(--eb-primary-strong\)/);
    expect(css).toMatch(/\.sb-toolbar-21e2 \.sb-tb-menu\[aria-expanded="true"\]/);
  });
});
