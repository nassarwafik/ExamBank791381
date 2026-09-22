// Learning Materials — desktop inset guards (structural). The teacher-side library / overview / Reader get a LOGICAL
// inline inset on desktop only, expressed with spacing tokens, scoped to the Learning-Materials roots; the phone and
// tablet baseline, the shared Reader stylesheet and the student portal are untouched.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
const css = read("learning/learning.css");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
/** The body of the FIRST `@media (<query>)` block (brace-matched). */
function mediaBlock(query: string): string {
  const start = css.indexOf("@media " + query);
  if (start < 0) return "";
  let i = css.indexOf("{", start) + 1, depth = 1;
  const from = i;
  while (i < css.length && depth > 0) { if (css[i] === "{") depth++; else if (css[i] === "}") depth--; i++; }
  return css.slice(from, i - 1);
}
const desktop = mediaBlock("(min-width: 1024px)");
const outsideDesktop = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media \(min-width: 1024px\)\{[\s\S]*?\n\}\n/, "");

describe("Learning Materials — desktop inset", () => {
  it("exists exactly once, at 1024px, and insets BOTH Learning-Materials roots with logical token-based padding", () => {
    expect(css.match(/@media \(min-width: 1024px\)/g)?.length).toBe(1);
    expect(noSpaces(desktop)).toContain(".eb-lm,.eb-lm-reader{padding-inline:var(--eb-space-5);padding-block:var(--eb-space-4)var(--eb-space-6);}");
    expect(desktop).not.toMatch(/padding-left|padding-right|margin-left|margin-right|\d+px/);   // logical + tokens only
    expect(desktop).not.toMatch(/max-width|max-inline-size/);                                   // the Reader stays wide
  });
  it("is scoped: no rule targets the shared Reader (.learning-reader*), the student portal or the shell", () => {
    expect(desktop).not.toMatch(/\.learning-reader|\.eb-sp-|\.eb-shell|\.student-shell|\.teacher-platform/);
    expect(read("learning/reader/reader.css")).not.toContain(".eb-lm");
    expect(read("StudentPortal.tsx")).not.toContain("eb-lm-reader");
    expect(read("student/StudentReader.tsx")).not.toContain("eb-lm");
  });
  it("leaves the phone/tablet baseline untouched: no inset padding on the roots outside the desktop block", () => {
    expect(outsideDesktop).not.toMatch(/\.eb-lm\{[^}]*padding/);
    expect(outsideDesktop).not.toContain(".eb-lm-reader");
    expect(noSpaces(outsideDesktop)).toContain(".eb-lm{display:flex;flex-direction:column;gap:var(--eb-space-4);min-width:0;}");
  });
  it("the teacher page mounts its Reader inside the .eb-lm-reader root and the library/overview keep the .eb-lm root", () => {
    const page = read("learning/LearningMaterialsPage.tsx");
    expect(page).toContain('<div className="eb-lm-reader">');
    expect(page.match(/className="eb-lm(?: eb-lm-overview)?" aria-labelledby/g)?.length).toBe(2);
  });
});

// Reader Presentation mode — the white lesson page must contain the ENTIRE authored page: a SHORT page fills the
// presentation viewport, a LONG page grows with its content (no clamp to one viewport, no nested page scrollbar).
// CSS is stubbed under Vitest, so this is a structural guard on the presentation-page contract read from disk.
describe("Reader Presentation — lesson page surface grows with content", () => {
  const readerCss = read("learning/reader/reader.css");
  const nospace = (s: string) => s.replace(/\s+/g, "");
  /** The (brace-matched) body of the FIRST rule whose selector is exactly `sel`. */
  const ruleBody = (sel: string): string => {
    const i = readerCss.indexOf(sel + "{");
    if (i < 0) return "";
    const from = readerCss.indexOf("{", i) + 1;
    return nospace(readerCss.slice(from, readerCss.indexOf("}", from)));
  };
  const presPage = ruleBody(".learning-reader.is-presentation .learning-reader-page");
  const presMain = ruleBody(".learning-reader.is-presentation .learning-reader-main");

  it("the presentation page is a NON-shrinking, content-sized flex item (scoped to .is-presentation)", () => {
    expect(presPage).not.toBe("");                     // the presentation-scoped rule exists
    expect(presPage).toContain("flex:00auto");         // never shrink to the track height (the bug) — whitespace-stripped
    expect(presPage).toContain("block-size:auto");     // long pages grow with their content
    expect(presPage).toContain("min-block-size:100%"); // short pages still fill the presentation viewport
  });
  it("adds no page-level scroll or fixed-viewport / clipping hack (one scroll owner, natural height)", () => {
    expect(presPage).not.toMatch(/overflow/);          // no nested page scrollbar
    expect(presPage).not.toMatch(/100vh|100dvh/);      // no fixed viewport-height page
    expect(presPage).not.toMatch(/max-block-size|max-height/);
    expect(presPage).not.toMatch(/height:100%/);       // not clamped to the track (min-block-size:100% is allowed)
  });
  it(".learning-reader-main remains the single vertical scroll owner in presentation", () => {
    expect(presMain).toContain("overflow-y:auto");
  });
  it("does not disturb normal-mode Reader: the base .learning-reader-page rule has no no-shrink/auto-height override", () => {
    const basePage = ruleBody(".learning-reader-page");
    expect(basePage).not.toBe("");
    expect(basePage).not.toContain("flex:00auto");
  });
});
