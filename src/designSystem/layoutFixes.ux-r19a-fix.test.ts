// UX-R19a-fix — the two layout defects R19a's scenes found (docs/enterprise-ux-r0-redesign-foundation.md R19a-fix). happy-dom does no
// layout, so these guards pin the rules that fix them, and that the capture harness clicks the builder's menus with a pointer (a
// covered trigger fails the scene); the browser measurements (every top-bar button reachable from 1024 to 1920 px,
// the function-study page as wide as the viewport) are recorded in the design record.
//   1. The studio's top bar: its end column is never narrower than its tools (they slid under «حفظ مؤقت» and «متابعة» from 1024 to
//      1439 px), and below 1280 px, where one row cannot hold the title, the steps and the tools, the steps take a second row.
//   2. The function-study cards: a text field's natural width no longer widens a card's column past the card (the page ran 12 px
//      wider than a 1024 px viewport and 31 px wider than a 390 px one).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", ...p), "utf8");
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
/** The body of the first `@media <query> {` block, up to its matching brace. */
const media = (css: string, query: string) => {
  const start = css.indexOf("@media " + query + " {");
  expect(start, query).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  throw new Error("unclosed " + query);
};

describe("UX-R19a-fix — the studio's top bar keeps every tool reachable", () => {
  const studio = flat(read("studio", "studio.css"));

  it("the end column is never narrower than its contents", () => {
    expect(studio).toContain(".st-studio .st-topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 1fr);");
    expect(studio).not.toContain("grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);");
  });

  it("below 1280 px the steps take a second row (the title and the tools share the first)", () => {
    const below1280 = media(studio, "(max-width: 1279px)");
    expect(below1280).toContain(".st-studio .st-topbar { grid-template-columns: minmax(0, 1fr) auto; }");
    expect(below1280).toContain(".st-studio .st-topbar .st-steps { grid-column: 1 / -1; grid-row: 2; justify-self: center; }");
    // the phone layout keeps its own grid areas
    expect(media(studio, "(max-width: 767px)")).toContain('grid-template-areas: "start save next" "steps tools tools";');
  });

  it("the capture harness opens the builder's menus with a pointer click, which fails when a trigger is covered", () => {
    const harness = readFileSync(path.join(process.cwd(), "scripts", "capture-visual-baseline-ux-r.mjs"), "utf8");
    expect(harness).toContain(`.st-menu[aria-label='أدوات الامتحان']").first().click({ timeout: 15000 });`);
    expect(harness).toContain(`.st-menu[aria-label='إضافة أسئلة']").first().click({ timeout: 15000 });`);
    expect(harness).not.toContain('.st-menu[aria-label=\'أدوات الامتحان\']").first().press(');
  });
});

describe("UX-R19a-fix — the function-study cards stay inside the page", () => {
  it("a card's column and its labels' columns may shrink below a text field's natural width", () => {
    expect(flat(read("functionStudy", "function-study.css"))).toContain(".fnstudy-task, .fnstudy-task label, .fnstudy-editor label { grid-template-columns: minmax(0, 1fr); }");
  });
});
