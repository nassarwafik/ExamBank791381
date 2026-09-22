/// <reference types="node" />
// UI fix — breathing room between the fixed sidebar rail and the main content on the teacher pages that render as
// direct shell-content children with no padding wrapper of their own: Projects hub (.eb-projects-hub), Reports
// (.eb-reports-hub), Question Bank (.eb-bank), and an OPENED project workspace (.eb-project-workspace, the
// ProjectTracker root that wraps the toolbar/context, class selector and every internal view). CSS is stubbed under
// Vitest, so these are structural assertions on the page CSS read from disk. Guarantees: each gets a small RTL-safe
// inline-START gutter (padding-inline-start: var(--eb-space-4) = 16px) ONLY at the desktop breakpoint (≥1024px, where
// the sidebar is a rail beside the content); no gutter at mobile/drawer sizes; inline-start only (no symmetric
// padding-inline, no inline-end); logical properties only (no left/right); the projects hub and workspace share ONE
// media rule; and the shared shell (sidebar width + navigation) is untouched.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const norm = (s: string) => s.replace(/\s+/g, "");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remove every `@media (...) { ... }` block (brace-balanced) so a selector's TOP-LEVEL rule can be inspected. */
const stripAtMedia = (css: string): string => {
  let out = "", i = 0;
  while (i < css.length) {
    const m = css.indexOf("@media", i);
    if (m < 0) { out += css.slice(i); break; }
    out += css.slice(i, m);
    const b = css.indexOf("{", m);
    if (b < 0) break;
    let depth = 1, j = b + 1;
    while (j < css.length && depth > 0) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    i = j;
  }
  return out;
};
/** The top-level (non-media) rule block for a selector, normalized — or "" if absent. */
const topLevelRule = (css: string, selector: string): string => {
  const bare = stripAtMedia(css);
  const i = bare.indexOf(selector + "{");
  if (i < 0) return "";
  return norm(bare.slice(i, bare.indexOf("}", i) + 1));
};
/** True when, inside a `@media (min-width:1024px)` block, `selector` receives padding-inline-start: var(--eb-space-4).
 *  Works whether the selector stands alone or is grouped with others (comma list). */
const hasDesktopGutter = (css: string, selector: string): boolean =>
  new RegExp(`@media\\(min-width:1024px\\)\\{[^{}]*${escapeRe(selector)}[^{}]*\\{[^}]*padding-inline-start:var\\(--eb-space-4\\);`).test(norm(css));

const CASES = [
  { name: "Projects hub", file: "../projects-pro.css", selector: ".eb-projects-hub" },
  { name: "Project workspace (opened project)", file: "../projects-pro.css", selector: ".eb-project-workspace" },
  { name: "Reports", file: "../reports-pro.css", selector: ".eb-reports-hub" },
  { name: "Question Bank", file: "../bank-pro.css", selector: ".eb-bank" },
] as const;

describe("sidebar ↔ content spacing — hubs + opened project workspace", () => {
  for (const c of CASES) {
    const css = read(c.file);
    describe(c.name, () => {
      it("adds a desktop-only inline-start gutter (padding-inline-start: var(--eb-space-4)) at ≥1024px", () => {
        expect(hasDesktopGutter(css, c.selector)).toBe(true);
      });
      it("does NOT add side padding at the top-level (mobile/drawer) rule — no leftover side space when the sidebar is a drawer", () => {
        const base = topLevelRule(css, c.selector);
        expect(base).not.toBe("");
        expect(base).not.toContain("padding-inline");
        expect(base).not.toContain("padding:");
      });
      it("insets only the sidebar side — no symmetric padding-inline and no inline-end gutter for this selector", () => {
        expect(norm(css)).not.toContain(`${c.selector}{padding-inline:`);
        expect(css).not.toMatch(/padding-inline-end\s*:/);
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

  it("the projects hub and the opened project workspace share ONE desktop media rule (extended, not duplicated)", () => {
    const css = read("../projects-pro.css");
    // exactly one min-width:1024px media query in the file
    expect((norm(css).match(/@media\(min-width:1024px\)/g) || []).length).toBe(1);
    // and that single block lists both selectors with the same inline-start gutter
    expect(hasDesktopGutter(css, ".eb-projects-hub")).toBe(true);
    expect(hasDesktopGutter(css, ".eb-project-workspace")).toBe(true);
  });

  it("uses an existing spacing token (12–24px range), not an arbitrary pixel value", () => {
    const tokens = read("../design-tokens.css");
    expect(norm(tokens)).toContain("--eb-space-4:16px");   // 16px, within 12–24px
  });

  it("the shared shell is unchanged: sidebar width still driven by --eb-sidebar-w, content wrapper still padding-free", () => {
    const shell = read("../shell.css");
    expect(norm(shell)).toContain("width:var(--eb-sidebar-w)");
    expect(norm(shell)).toContain(norm(".eb-shell-content{flex:1 1 auto;min-width:0;}"));
  });
});

// Teacher Games (.eb-games-page--teacher) — same sidebar↔content gutter, but via a TEACHER-SCOPED modifier so the
// STUDENT dedicated destination (which sits inside .eb-games-surface with its own padding) is never double-padded.
describe("sidebar ↔ content spacing — Teacher Games page", () => {
  const css = read("../games/games.css");
  it("adds a desktop-only inline-start gutter (padding-inline-start: var(--eb-space-4)) at ≥1024px on the teacher modifier", () => {
    expect(hasDesktopGutter(css, ".eb-games-page--teacher")).toBe(true);
  });
  it("the gutter is on the teacher modifier ONLY — never on the shared base class (no student double-padding)", () => {
    // the shared base .eb-games-page has no side padding at any breakpoint
    expect(topLevelRule(css, ".eb-games-page")).not.toContain("padding");
    expect(hasDesktopGutter(css, ".eb-games-page{")).toBe(false);
    // the modifier exists ONLY inside the desktop media query (no top-level rule → no gutter at mobile/drawer)
    expect(stripAtMedia(css)).not.toContain(".eb-games-page--teacher");
  });
  it("insets only the sidebar side — no symmetric padding-inline, no inline-end, RTL-safe logical properties only", () => {
    expect(norm(css)).not.toContain(".eb-games-page--teacher{padding-inline:");
    expect(css).not.toMatch(/padding-inline-end\s*:/);
    expect(css).not.toMatch(/margin-(?:left|right)\s*:/);
    expect(css).not.toMatch(/padding-(?:left|right)\s*:/);
  });
  it("does not touch the sidebar or the navigation", () => {
    expect(css).not.toContain(".eb-sidebar");
    expect(css).not.toContain(".eb-nav");
    expect(css).not.toContain("--eb-sidebar-w");
  });
});
