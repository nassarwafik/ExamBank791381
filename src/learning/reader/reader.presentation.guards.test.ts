/// <reference types="node" />
// Learning Reader — PRESENTATION MODE CSS guards (structural assertions on reader.css, read from disk because CSS is
// stubbed under Vitest). The overlay is app-level (fixed, full viewport, modal z-token), every presentation rule is
// prefixed with `.learning-reader.is-presentation` (so the phone baseline and the desktop block keep their exact
// rules and the source-order contract of reader.layout.guards.test.ts is untouched), only the main area scrolls and
// never horizontally, controls keep ≥44px hit areas, and the block sits BEFORE the desktop media block.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const css = readFileSync(fileURLToPath(new URL("./reader.css", import.meta.url)), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
const rule = (selector: string): string => {
  const i = css.indexOf(selector + "{");
  if (i < 0) return "";
  return noSpaces(css.slice(i + selector.length + 1, css.indexOf("}", i)));
};
const P = ".learning-reader.is-presentation";
const START = css.indexOf("/* ---------- Presentation mode");
const DESKTOP = css.indexOf("@media (min-width: 1024px)");

describe("presentation overlay", () => {
  it("is a fixed, full-viewport, modal-layer overlay that never scrolls horizontally; only the main area scrolls", () => {
    const rootRule = rule(P);
    expect(rootRule).toContain("position:fixed");
    expect(rootRule).toContain("inset:0");
    expect(rootRule).toContain("z-index:var(--eb-z-modal");
    expect(rootRule).toContain("overflow:hidden");
    const main = rule(P + " .learning-reader-main");
    expect(main).toContain("overflow-y:auto");
    expect(main).toContain("overflow-x:hidden");
    expect(main).toContain("block-size:100%");
    expect(main).toContain("max-inline-size:none");
    const page = rule(P + " .learning-reader-page");
    expect(page).toContain("inline-size:100%");
    expect(page).toContain("max-inline-size:none");
    expect(page).not.toMatch(/(^|;)height:/);
    expect(page).not.toMatch(/width:\d+px/);
  });
  it("hides the sidebar, the partial note and the jump select; shows the index toggle at every width", () => {
    expect(rule(P + " .learning-reader-partial,\n" + P + " .learning-reader-sidebar,\n" + P + " .learning-reader-jump") || noSpaces(css).includes(noSpaces(P + " .learning-reader-partial," + P + " .learning-reader-sidebar," + P + " .learning-reader-jump{display:none;}"))).toBeTruthy();
    expect(rule(P + " .learning-reader-toc-toggle")).toContain("display:inline-flex");
  });
  it("controls keep large hit areas (≥44px) and the bottom bar is a static flex item (never overlapping content)", () => {
    expect(rule(P + " .learning-reader-navbtn")).toMatch(/min-height:4[4-9]px|min-height:[5-9]\dpx/);
    expect(rule(".learning-reader-pagejump-input")).toContain("min-height:44px");
    expect(rule(".learning-reader-pagejump-input")).toContain("direction:ltr");
    expect(rule(".learning-reader-pagejump-go")).toContain("min-height:44px");
    expect(rule(".learning-reader-present-toggle")).toContain("min-height:44px");
    expect(rule(P + " .learning-reader-toc-toggle")).toContain("min-height:44px");
    expect(rule(P + " .learning-reader-nav")).toContain("position:static");
    expect(rule(P + " .learning-reader-nav")).toContain("env(safe-area-inset-bottom,0px)");
  });
  it("sits before the desktop media block and adds no unprefixed rule for the protected selectors", () => {
    expect(START).toBeGreaterThan(0);
    expect(START).toBeLessThan(DESKTOP);
    const block = css.slice(START, DESKTOP).replace(/\/\*[\s\S]*?\*\//g, "");   // comments (the desktop block's contract note) excluded
    for (const sel of [".learning-reader-layout", ".learning-reader-sidebar", ".learning-reader-main", ".learning-reader-page", ".learning-reader-nav", ".learning-reader-text", ".learning-reader-page-title"]) {
      expect(block, sel).not.toMatch(new RegExp("(^|\\n)[ \\t]*" + sel.replace(/\./g, "\\.") + "\\s*\\{"));
    }
    expect(block).not.toContain("!important");
    expect(block).not.toContain("min-block-size:60vh");
    expect(block).not.toContain("--eb-fs-28");
    expect(block).not.toMatch(/@media \(min-width: 1024px\)/);
  });
});
