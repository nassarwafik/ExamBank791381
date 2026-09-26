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

// Phase 8B moved the two PROJECT roots to a symmetric gutter (see the dedicated describe block below); the hub pages
// that were not in 8B's scope keep this original inline-start-only policy unchanged.
const CASES = [
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

// Phase 8B — Projects (hub + opened workspace / detail). Deliberately changed from the inline-start-only desktop inset:
// the projects pages must never sit flush against the sidebar rail (expanded or compact) NOR against the screen edge
// (mobile drawer), so both roots own an equal logical gutter on both inline sides at every width, aligned with the
// page header's inline padding (16px below 768px, 24px from 768px). The shell content wrapper stays padding-free,
// so this is never double spacing.
describe("sidebar ↔ content spacing — Projects hub + opened project workspace (Phase 8B)", () => {
  const css = read("../projects-pro.css");
  const group = ".eb-projects-hub,.eb-project-workspace";
  it("both roots share ONE top-level rule with a symmetric logical gutter (mobile drawer included)", () => {
    const bare = norm(stripAtMedia(css));
    const i = bare.indexOf(group + "{");
    expect(i).toBeGreaterThanOrEqual(0);
    const base = bare.slice(i, bare.indexOf("}", i) + 1);
    expect(base).toContain("padding-inline:var(--eb-space-4);");
    expect(base).toContain("box-sizing:border-box;");
    expect(base).toContain("min-width:0;");
  });
  it("from 768px the SAME grouped rule widens the gutter to the page-header inset (--eb-space-5)", () => {
    expect(norm(css)).toContain("@media(min-width:768px){" + group + "{padding-inline:var(--eb-space-5);}}");
  });
  it("no inline-start-only / inline-end-only / physical side paddings or margins remain for the project roots", () => {
    expect(css).not.toMatch(/padding-inline-(?:start|end)\s*:/);
    expect(css).not.toMatch(/margin-(?:left|right)\s*:/);
    expect(css).not.toMatch(/padding-(?:left|right)\s*:/);
    expect(norm(css)).not.toContain("@media(min-width:1024px){.eb-projects-hub");
  });
  it("does not touch the sidebar, the navigation or the shell wrapper (so no double spacing)", () => {
    expect(css).not.toContain(".eb-sidebar");
    expect(css).not.toContain(".eb-nav");
    expect(css).not.toContain("--eb-sidebar-w");
    expect(css).not.toContain(".eb-shell-content");
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
