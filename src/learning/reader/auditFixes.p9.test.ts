// 899371 P9 (docs/enterprise-899371-learning-plan.md §22) — three defects found by the final audit (scripts/audit-899371-p9.mjs: all
// 260 pages × 390 / 1440 × light / «داكن», axe WCAG 2.1 A/AA), each pinned here at the source:
//   1. the C# tracer's program list scrolls sideways (a long line, a phone) but could not be reached by keyboard
//      (axe scrollable-region-focusable on the 22 traced walkthrough pages) → the list is focusable, with a visible focus ring;
//   2. the CURRENT line's number in the tracer was the gutter grey on the highlighted line (axe color-contrast) → it takes the code
//      text colour, ≥ 4.5:1 on the highlighted line;
//   3. a short word-bank chip («if») was 38 px wide on touch (WCAG 2.5.5, the Reader's 44 px rule) → chips and blanks have a 44 px
//      minimum width on a coarse pointer, as they already had a 44 px height.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const activitiesCss = read("src/learning/activities/activities.css").replace(/\/\*[\s\S]*?\*\//g, "");
const readerCss = read("src/learning/reader/reader.css").replace(/\/\*[\s\S]*?\*\//g, "");
const tokensCss = read("src/design-tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
const traceTsx = read("src/learning/activities/CSharpTraceActivity.tsx");

/** The declarations of the first rule whose selector list is exactly `selector` (whitespace-insensitive), inside `css`. */
function rule(css: string, selector: string): Record<string, string> {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1]) !== norm(selector)) continue;
    const out: Record<string, string> = {};
    for (const d of m[2].split(";")) { const i = d.indexOf(":"); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
    return out;
  }
  return {};
}
const root = rule(tokensCss.replace(/^[\s\S]*?(:root\s*\{)/, "$1"), ":root");
const token = (v: string) => { const m = /^var\((--[\w-]+)\)$/.exec(v); return m ? root[m[1]] : v; };
const hex = (h: string) => { const v = h.replace("#", ""); const f = v.length === 3 ? v.split("").map(c => c + c).join("") : v; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255); };
const lum = (h: string) => { const [r, g, b] = hex(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
/** A translucent rgba() over an opaque hex background → the hex the eye sees (how the highlighted line is painted). */
const over = (top: string, under: string) => {
  const m = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(top.replace(/\s+/g, " ").replace(/, /g, ","));
  if (!m) return top;
  const a = Number(m[4]), base = hex(under).map(c => c * 255);
  return "#" + [1, 2, 3].map((k, i) => Math.round(Number(m[k]) * a + base[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
};

describe("899371 P9 audit fixes", () => {
  it("1. the tracer's program list is reachable by keyboard and shows its focus", () => {
    expect(traceTsx).toMatch(/<ol className="learning-trace-code" dir="ltr" tabIndex=\{0\} aria-label="البرنامج">/);
    expect(rule(activitiesCss, ".learning-trace-code:focus-visible")["outline"]).toMatch(/^2px solid var\(--eb-code-type\)$/);
  });
  it("2. the current line's number reads at ≥ 4.5:1 on the highlighted line", () => {
    const color = rule(activitiesCss, ".learning-trace-line.is-current .learning-trace-lineno")["color"];
    expect(color).toBe("var(--eb-code-fg)");
    const bg = over(token(rule(activitiesCss, ".learning-trace-line.is-current")["background"]), root["--eb-code-bg"]);
    expect(bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(token(color), bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(root["--eb-code-gutter"], bg)).toBeLessThan(4.5);   // the old colour really failed (what axe measured)
  });
  it("3. on touch a word-bank chip and a blank are at least 44 px wide, not only 44 px tall", () => {
    const coarse = readerCss.match(/@media \(pointer: coarse\)\{\s*\.learning-practice-blank[\s\S]*?\n\}/)?.[0] ?? "";
    expect(coarse).toMatch(/\.learning-practice-blank, \.learning-practice-chip\{ min-inline-size:44px; \}/);
  });
});
