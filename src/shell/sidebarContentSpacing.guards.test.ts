/// <reference types="node" />
// UI fix — breathing room between the fixed sidebar rail and the main content on the three teacher hub pages that
// render as direct shell-content children with no padding wrapper of their own: Projects (.eb-projects-hub),
// Reports (.eb-reports-hub) and Question Bank (.eb-bank). CSS is stubbed under Vitest, so these are structural
// assertions on the page CSS read from disk. Guarantees: each page gets a small RTL-safe horizontal gutter
// (padding-inline: var(--eb-space-4) = 16px) ONLY at the desktop breakpoint (≥1024px, where the sidebar is a rail
// beside the content); no gutter is added at the mobile/drawer sizes; only logical properties are used (no
// margin-left/right hacks); and the shared shell (sidebar width + navigation) is untouched.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const norm = (s: string) => s.replace(/\s+/g, "");
/** The FIRST (top-level, pre-media) rule block for a selector, normalized — or "" if absent. */
const baseRule = (css: string, selector: string): string => {
  const i = css.indexOf(selector + "{");
  if (i < 0) return "";
  return norm(css.slice(i, css.indexOf("}", i) + 1));
};

const PAGES = [
  { name: "Projects", file: "../projects-pro.css", selector: ".eb-projects-hub" },
  { name: "Reports", file: "../reports-pro.css", selector: ".eb-reports-hub" },
  { name: "Question Bank", file: "../bank-pro.css", selector: ".eb-bank" },
] as const;

describe("sidebar ↔ content spacing — Projects / Reports / Question Bank", () => {
  for (const p of PAGES) {
    const css = read(p.file);
    describe(p.name, () => {
      it("adds a desktop-only horizontal gutter (padding-inline: var(--eb-space-4)) at ≥1024px", () => {
        // the gutter lives inside the desktop media query, applied to the page's own root selector
        expect(norm(css)).toContain(`@media(min-width:1024px){${p.selector}{padding-inline:var(--eb-space-4);}}`);
      });
      it("does NOT add side padding at the base (mobile/drawer) rule — no leftover side space when the sidebar is a drawer", () => {
        const base = baseRule(css, p.selector);
        expect(base).not.toBe("");
        expect(base).not.toContain("padding-inline");
        expect(base).not.toContain("padding:");
      });
      it("uses RTL-safe logical properties only — no margin-left/right or padding-left/right hacks", () => {
        expect(css).not.toMatch(/margin-(?:left|right)\s*:/);
        expect(css).not.toMatch(/padding-(?:left|right)\s*:/);
      });
      it("does not touch the sidebar or the navigation", () => {
        expect(css).not.toContain(".eb-sidebar");
        expect(css).not.toContain(".eb-nav");
        expect(css).not.toContain("--eb-sidebar-w");
      });
    });
  }

  it("uses an existing spacing token (12–24px range), not an arbitrary pixel value", () => {
    // --eb-space-4 = 16px per the token scale; assert the token exists and sits in the requested range
    const tokens = read("../design-tokens.css");
    expect(norm(tokens)).toContain("--eb-space-4:16px");
  });

  it("the shared shell is unchanged: sidebar width still driven by --eb-sidebar-w, content wrapper still padding-free", () => {
    const shell = read("../shell.css");
    expect(norm(shell)).toContain("width:var(--eb-sidebar-w)");            // sidebar width untouched
    expect(norm(shell)).toContain(".eb-shell-content{flex:1 1 auto;min-width:0;}".replace(/\s+/g, ""));  // no global content padding introduced
  });
});
