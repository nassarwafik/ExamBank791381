// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");
const css = readFileSync(join(root, "assignments-pro.css"), "utf8");
const tokens = readFileSync(join(root, "design-tokens.css"), "utf8");
const available = new Set([...tokens.matchAll(/(--eb-[\\w-]+)\\s*:/g)].map(m => m[1]));

describe("21E assignments enterprise workspace — structural style guards", () => {
  it("covers toolbar, list, detail, composer, gradebook, analysis and library", () => {
    for (const selector of [".eb-assign-toolbar", ".eb-assign-row", ".eb-assign-detail", ".eb-assign-composer", ".eb-gradebook", ".eb-item-analysis", ".library-item"]) {
      expect(css).toContain(selector);
    }
  });
  it("uses only available design tokens without silent var() fallthrough", () => {
    const use = [...css.matchAll(/var\\((--eb-[\\w-]+)\\s*\\)/g)].map(m => m[1]);
    expect(use.filter(name => !available.has(name))).toEqual([]);
  });
  it("keeps a visible keyboard focus, reduced motion and mobile layout", () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/@media \\(prefers-reduced-motion: reduce\\)/);
    expect(css).toMatch(/@media \\(max-width: 767px\\)/);
    expect(css).toMatch(/grid-template-columns:\\s*minmax\\(0,\\s*1fr\\)/);
  });
  it("does not introduce stacking contexts that could trap dialogs under the shell", () => {
    const section = css.slice(css.indexOf("/* Phase 21E — unified enterprise assignments workspace."));
    expect(section).not.toMatch(/\\b(isolation|z-index|transform|filter|contain|will-change)\\s*:/);
  });
});
