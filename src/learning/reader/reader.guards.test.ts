/// <reference types="node" />
// Phase 3 reader guards — mobile touch-target sizes and enrichment-icon semantics (source/CSS assertions).
// CSS is stubbed under Vitest's transform, so the stylesheet is read from disk (not via a `?raw` import).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const css = read("./reader.css");
const renderer = read("./LearningPageRenderer.tsx");

/** Extract a CSS rule body by its exact selector (selector immediately followed by `{`). */
function body(selector: string): string {
  const i = css.indexOf(selector + "{");
  if (i < 0) return "";
  return css.slice(i + selector.length + 1, css.indexOf("}", i));
}
const noSpaces = (s: string) => s.replace(/\s+/g, "");

describe("Phase 3 — reader touch targets (≥44px mobile)", () => {
  it("the TOC page-selection row meets the 44px target", () => {
    expect(noSpaces(body(".learning-reader-toc-page"))).toContain("min-height:44px");
  });
  it("module rows, previous/next and the jump selector meet the 44px target", () => {
    expect(noSpaces(body(".learning-reader-toc-modbtn"))).toContain("min-height:44px");
    expect(noSpaces(body(".learning-reader-navbtn"))).toContain("min-height:44px");
    expect(noSpaces(body(".learning-reader-jump select"))).toContain("min-height:44px");
  });
});

describe("Phase 3 — enrichment icon semantics", () => {
  it("uses a semantically appropriate icon (sparkles), never a lock", () => {
    expect(renderer).not.toContain("IconLock");
    expect(renderer).toContain("IconSparkles");
  });
});
