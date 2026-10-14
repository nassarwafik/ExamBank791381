import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/learning/reader");
const css = readFileSync(join(root, "reader-enterprise-l2a.css"), "utf8");
const component = readFileSync(join(root, "LearningReader.tsx"), "utf8");

describe("21E L2-A scoped reader clearance", () => {
  it("loads the additive stylesheet after the reader base sheet", () => {
    expect(component.indexOf('import "./reader.css";')).toBeGreaterThan(-1);
    expect(component.indexOf('import "./reader-enterprise-l2a.css";')).toBeGreaterThan(component.indexOf('import "./reader.css";'));
  });
  it("never scrolls or focuses from pointer event handlers", () => {
    expect(css).toContain("scroll-padding-block-end");
    expect(css).not.toMatch(/pointerdown|pointerup|mousedown|mouseup|scrollIntoView|scrollTo/);
  });
  it("does not override presentation mode styles", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g) ?? [];
    for (const rule of rules) {
      if (rule.includes("@media")) continue;
      expect(rule).toContain(":not(.is-presentation)");
    }
  });
  it("uses tokens, keyboard rings and forced-colors fallback", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("min-block-size: 44px");
  });
});
