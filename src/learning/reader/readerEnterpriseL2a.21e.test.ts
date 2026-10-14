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
  it("puts the sticky-pager clearance on the document scroller and never scrolls or focuses from pointer handlers", () => {
    // Normal reading scrolls the DOCUMENT, so the clearance must sit on the root element (a scroll-padding on the
    // reader box itself has no effect — measured in Chromium: focused practice options ended under the pager).
    expect(css).toMatch(/:root:has\(\.learning-reader:not\(\.is-presentation\) \.learning-reader-nav\)\s*\{\s*scroll-padding-block-end:/);
    expect(css).not.toMatch(/pointerdown|pointerup|mousedown|mouseup|scrollIntoView|scrollTo/);
  });
  it("does not override presentation mode styles", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+\{/g) ?? [];
    for (const rule of rules) {
      if (rule.includes("@media")) continue;
      expect(rule).toContain(":not(.is-presentation)");
    }
  });
  it("enables RTL arrow and paging keys in normal mode only from the reading surface, never from inputs or controls", () => {
    // Behaviour is covered in LearningReader.l2a.21e.test.tsx; this pins the guard order in the source.
    expect(component).toContain('isEditableTarget(e.target)');
    expect(component).toContain('nestedDialogOpen()');
    expect(component).toContain('if (!presentation && !isReadingSurface(e.target, contentRef.current)) return;');
    expect(component).not.toContain('if (!presentation) return;\n      if (e.key === "ArrowLeft"');
    expect(component).toContain('e.key === "ArrowLeft" || e.key === "PageDown"');
    expect(component).toContain('e.key === "ArrowRight" || e.key === "PageUp"');
  });
  it("keeps the release notice dismissible and outside presentation mode", () => {
    expect(component).toContain("releaseNoteVisible &&");
    expect(component).toContain("setReleaseNoteVisible(false)");
    expect(component).toContain('aria-label="إخفاء تنبيه محتوى الكتاب"');
    expect(css).toContain(".learning-reader-release-note");
  });
  it("uses tokens, keyboard rings and forced-colors fallback", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
    expect(css).toContain(":focus-visible");
    expect(css).toContain("forced-colors: active");
    expect(css).toContain("min-block-size: 44px");
  });
});
