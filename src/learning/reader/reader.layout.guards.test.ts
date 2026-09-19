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
