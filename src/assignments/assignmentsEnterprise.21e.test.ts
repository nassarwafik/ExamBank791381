// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");
const css = readFileSync(join(root, "assignments-pro.css"), "utf8");
const tokens = readFileSync(join(root, "design-tokens.css"), "utf8");
const available = new Set([...tokens.matchAll(/(--eb-[\w-]+)\s*:/g)].map(m => m[1]));

describe("21E assignments enterprise workspace — structural style guards", () => {
  it("covers toolbar, list, detail, composer, gradebook, analysis and library", () => {
    for (const selector of [".eb-assign-toolbar", ".eb-assign-row", ".eb-assign-detail", ".eb-assign-composer", ".eb-gradebook", ".eb-item-analysis", ".library-item"]) {
      expect(css).toContain(selector);
    }
  });
  it("uses only available design tokens without silent var() fallthrough", () => {
    const use = [...css.matchAll(/var\((--eb-[\w-]+)\s*\)/g)].map(m => m[1]);
    expect(use.filter(name => !available.has(name))).toEqual([]);
  });
  it("keeps a visible keyboard focus, reduced motion and mobile layout", () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)/);
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });
  it("does not introduce stacking contexts that could trap dialogs under the shell", () => {
    const section = css.slice(css.indexOf("/* Phase 21E — unified enterprise assignments workspace."));
    expect(section).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change)\s*:/);
  });
});

describe("21E assignments reviewer regression guards", () => {
  const premium = css.slice(css.indexOf("/* Phase 21E — unified enterprise assignments workspace."));
  it("restores RTL list alignment below 1024px after the desktop-only centering rule", () => {
    expect(premium).toMatch(/@media \(min-width: 1024px\)\s*\{\s*\.eb-assign-row\s*\{\s*align-items:\s*center/);
    expect(premium).toMatch(/@media \(max-width: 1023px\)\s*\{\s*\.eb-assign-row\s*\{\s*align-items:\s*stretch/);
  });
  it("keeps detail actions at top, restores table header positioning and distinguishes selection from focus", () => {
    expect(premium).toContain(".eb-assign-detail-head { align-items: flex-start;");
    expect(premium).not.toContain(".eb-gradebook-table th { position: relative;");
    expect(premium).not.toMatch(/\.eb-assign-row\.selected[^}]*box-shadow:\s*var\(--eb-focus\)/);
  });
  it("provides 44px coarse-pointer tablet controls including edit fields and gradebook chips", () => {
    expect(premium).toMatch(/@media \(max-width: 1023px\) and \(pointer: coarse\)/);
    expect(premium).toContain(".gradebook-chip, .library-cat-chip");
    expect(premium).toContain('input:not([type="checkbox"]), select, textarea');
    expect(premium).toContain("min-height: 44px");
  });
});
