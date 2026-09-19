/// <reference types="node" />
// Learning Reader — DESKTOP WIDE-SLIDE LAYOUT guards (structural CSS assertions; CSS is read from disk because it is
// stubbed under Vitest). The phone layout is a protected baseline: everything outside the ≥1024px media block must
// stay single-column with the sidebar hidden. From 1024px the Reader is a bounded sidebar + a flexible main track,
// and the lesson page fills that track — never capped at the old 72ch document measure, never a fixed width/height.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = read("./reader.css");
const activitiesCss = read("../activities/activities.css");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

/** The body of the `@media (min-width: 1024px)` block (brace-matched). */
function mediaBlock(query: string): string {
  const start = css.indexOf("@media " + query);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
}
/** A rule body by exact selector inside a given CSS text. */
function rule(text: string, selector: string): string {
  const i = text.indexOf(selector + "{");
  if (i < 0) return "";
  return noSpaces(text.slice(i + selector.length + 1, text.indexOf("}", i)));
}
const desktop = mediaBlock("(min-width: 1024px)");
const mobile = css.replace(desktop, "");   // everything that is NOT inside the desktop block

describe("Reader desktop layout — root cause removed", () => {
  it("has exactly one desktop media block and the main track is NOT capped at 72ch anywhere", () => {
    expect(desktop.length).toBeGreaterThan(0);
    expect(css.match(/@media \(min-width: 1024px\)/g)?.length).toBe(1);
    expect(css).not.toMatch(/\.learning-reader-main\s*\{[^}]*72ch/);
    expect(css).not.toMatch(/\.learning-reader-page\s*\{[^}]*72ch/);
    expect(rule(desktop, ".learning-reader-main")).toContain("max-inline-size:none");
    expect(rule(desktop, ".learning-reader-main")).toContain("inline-size:100%");
  });
  it("sidebar stays bounded and the main track flexible (never a 50/50 split)", () => {
    const layout = rule(desktop, ".learning-reader-layout");
    expect(layout).toContain("display:grid");
    expect(layout).toContain("grid-template-columns:minmax(240px,300px)minmax(0,1fr)");
  });
  it("the page occupies 100% of the main track with a slide-like MIN block size — no fixed width/height, no clipping", () => {
    const page = rule(desktop, ".learning-reader-page");
    expect(page).toContain("inline-size:100%");
    expect(page).toContain("min-inline-size:0");
    expect(page).toContain("min-block-size:");
    expect(page).not.toMatch(/(^|;)height:/);
    expect(page).not.toMatch(/(^|;)block-size:/);
    expect(page).not.toMatch(/width:\d+px/);
    expect(page).not.toContain("overflow:hidden");
    expect(rule(desktop, ".learning-reader-main")).not.toContain("overflow:hidden");
    // desktop padding uses spacing tokens, never arbitrary pixels
    expect(page).toMatch(/padding:var\(--eb-space-\d\)/);
  });
  it("readable measure applies ONLY to prose paragraphs, not to the main track or the page", () => {
    expect(rule(desktop, ".learning-reader-text")).toContain("max-inline-size:var(--eb-measure,72ch)");
    expect(rule(desktop, ".learning-reader-main")).not.toContain("72ch");
    expect(rule(desktop, ".learning-reader-page")).not.toContain("72ch");
  });
  it("uses no arbitrary pixel widths on the desktop canvas and the opener number stays proportionate (clamped)", () => {
    expect(desktop).not.toMatch(/\.learning-reader-(main|page|opener|list)[^{]*\{[^}]*(?<!min-|max-)(width|inline-size):\s*\d{3,}px/);
    expect(rule(desktop, ".learning-reader-opener-number")).toMatch(/font-size:clamp\(/);
    expect(rule(desktop, ".learning-reader-opener")).not.toMatch(/(^|;)height:/);
  });
});

describe("Reader mobile layout — protected baseline (no desktop rule leaks below 1024px)", () => {
  it("outside the desktop block the Reader is single-column, the sidebar is hidden and the drawer is unchanged", () => {
    expect(rule(mobile, ".learning-reader-layout")).toContain("display:block");
    expect(rule(mobile, ".learning-reader-sidebar")).toContain("display:none");
    expect(mobile).not.toMatch(/\.learning-reader-layout\s*\{[^}]*grid-template-columns/);
    expect(rule(mobile, ".learning-reader-drawer")).toContain("inline-size:min(88vw,360px)");
    expect(rule(mobile, ".learning-reader-page")).toContain("padding:var(--eb-space-4)");   // phone padding untouched
    expect(mobile).not.toContain("min-block-size:60vh");
  });
  it("the sticky, safe-area-aware bottom navigation is unchanged and not overridden on desktop", () => {
    const nav = rule(mobile, ".learning-reader-nav");
    expect(nav).toContain("position:sticky");
    expect(nav).toContain("env(safe-area-inset-bottom,0px)");
    expect(desktop).not.toMatch(/\.learning-reader-nav\s*\{/);
  });
});

describe("Reader desktop layout — tables and activities keep their contracts", () => {
  it("tables still scroll inside their own wrapper and keep per-column LTR isolation; no narrow measure on tables", () => {
    expect(rule(css, ".learning-reader-tablewrap")).toContain("overflow-x:auto");
    expect(rule(css, ".learning-reader-table")).toContain("width:100%");
    expect(rule(css, '.learning-reader-table td[dir="ltr"]')).toContain("unicode-bidi:isolate");
    expect(desktop).not.toMatch(/\.learning-reader-table[^{]*\{[^}]*(max-inline-size|max-width)/);
  });
  it("activity surfaces gain no fixed desktop widths (they inherit the wider canvas)", () => {
    expect(desktop).not.toMatch(/learning-activity|learning-scope|learning-octets|learning-guided/);
    expect(activitiesCss).not.toMatch(/\.learning-(activity|scope|octets|guided)[^{]*\{[^}]*(?<!min-|max-)width:\s*\d{3,}px/);
    expect(activitiesCss).not.toMatch(/@media \(min-width/);
  });
});

// ── Source-order contract ──────────────────────────────────────────────────────────────────────────────────────
// Several desktop declarations target the SAME selectors (same specificity) as base rules written later in the
// file's history (Phase 3B list / opener, 3C, 3E). CSS resolves such ties by SOURCE ORDER, so a desktop block that
// sits BEFORE those base rules is silently overridden at ≥1024px (found by the independent review of PR #116).
// This is not a cascade engine — it protects the one known contract: the desktop media block is the LAST rule set,
// and every order-sensitive base declaration it overrides appears before it and never after it.
const DESKTOP_START = css.indexOf("@media (min-width: 1024px)");
const DESKTOP_OPEN = css.indexOf("{", DESKTOP_START);                 // `desktop` = css.slice(DESKTOP_OPEN + 1, closingBrace)
const DESKTOP_END = DESKTOP_OPEN + 1 + desktop.length + 1;          // offset just past the block's closing brace
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Start offsets of every rule whose selector list is EXACTLY `selector` (a line-leading `selector{`). */
const rulePositions = (selector: string): number[] =>
  [...css.matchAll(new RegExp("(?:^|\\n)[ \\t]*" + esc(selector) + "\\s*\\{", "g"))].map(m => m.index + m[0].indexOf(selector));
const basePositions = (selector: string) => rulePositions(selector).filter(p => p < DESKTOP_START || p > DESKTOP_END);
const desktopPositions = (selector: string) => rulePositions(selector).filter(p => p > DESKTOP_START && p < DESKTOP_END);

/** Order-sensitive desktop overrides: [selector, property, desktop value, base value it must beat]. */
const ORDER_SENSITIVE: Array<[string, string, string, string]> = [
  [".learning-reader-list.variant-cards .learning-reader-list-items", "grid-template-columns", "repeat(auto-fit,minmax(240px,1fr))", "repeat(auto-fit,minmax(200px,1fr))"],
  [".learning-reader-opener", "gap", "var(--eb-space-6)", "var(--eb-space-4)"],
  [".learning-reader-opener", "padding", "var(--eb-space-6)var(--eb-space-4)", "var(--eb-space-4)0"],
  [".learning-reader-opener-number", "font-size", "clamp(96px,10vw,144px)", "clamp(64px,18vw,120px)"],
  [".learning-reader-opener-title", "font-size", "clamp(32px,3vw,44px)", "clamp(24px,6vw,34px)"],
  [".learning-reader-opener-subtitle", "font-size", "var(--eb-fs-20)", "var(--eb-fs-16)"],
  [".learning-reader-main", "max-inline-size", "none", ""],
  [".learning-reader-page", "padding", "var(--eb-space-6)", "var(--eb-space-4)"],
  [".learning-reader-page", "min-block-size", "60vh", ""],
  [".learning-reader-page-title", "font-size", "var(--eb-fs-28)", "var(--eb-fs-20)"],
];
const declared = (body: string, prop: string): string | undefined => body.match(new RegExp("(?:^|;)" + esc(prop) + ":([^;]*)"))?.[1];

describe("Reader desktop layout — source order lets the desktop block WIN its same-specificity overrides", () => {
  it("the desktop media block is the LAST rule set in reader.css (only whitespace/comments may follow it)", () => {
    expect(DESKTOP_START).toBeGreaterThan(0);
    expect(css[DESKTOP_END - 1]).toBe("}");
    expect(css.slice(DESKTOP_END).replace(/\/\*[\s\S]*?\*\//g, "").trim()).toBe("");
    // it also sits after every base section it overrides: Phase 3B list + opener, 3C ordered list, 3E table direction
    for (const marker of ["Phase 3B: generic list block", "Phase 3B: unit-opener hero", "Phase 3C: ordered", '.learning-reader-table td[dir="ltr"]', "@media (prefers-reduced-motion: reduce)"]) {
      expect(css.lastIndexOf(marker), marker).toBeLessThan(DESKTOP_START);
    }
  });

  it.each(ORDER_SENSITIVE)("%s { %s } — the desktop declaration comes AFTER the last base declaration and differs from it", (selector, prop, desktopValue, baseValue) => {
    const base = basePositions(selector);
    const inDesktop = desktopPositions(selector);
    expect(base.length, `base rule for ${selector}`).toBeGreaterThan(0);
    expect(inDesktop.length, `desktop rule for ${selector}`).toBe(1);
    // ORDER: every base occurrence precedes the desktop override; none follows the media block
    expect(Math.max(...base)).toBeLessThan(inDesktop[0]);
    expect(base.some(p => p > DESKTOP_END)).toBe(false);
    // VALUE: the desktop declaration is the intended one, and the base declares a different value (or none) —
    // so with correct source order the desktop value is the effective one at ≥1024px
    expect(declared(rule(desktop, selector), prop)).toBe(desktopValue);
    const baseBodies = base.map(p => noSpaces(css.slice(css.indexOf("{", p) + 1, css.indexOf("}", p))));
    const baseDeclared = baseBodies.map(b => declared(b, prop)).filter((v): v is string => v !== undefined);
    expect(baseDeclared.at(-1) ?? "").toBe(baseValue);
    expect(baseDeclared).not.toContain(desktopValue);
  });

  it("the phone baseline is untouched by the move: every base rule still exists exactly once outside the desktop block", () => {
    for (const [selector] of ORDER_SENSITIVE) {
      expect(basePositions(selector).length, selector).toBe(1);
    }
    expect(mobile).not.toContain("clamp(96px");
    expect(mobile).not.toContain("minmax(240px, 1fr)");
    expect(mobile).not.toContain("--eb-fs-28");
  });
});
