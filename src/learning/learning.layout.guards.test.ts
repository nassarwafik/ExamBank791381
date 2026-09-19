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
