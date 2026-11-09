// 899371 P1 (docs/enterprise-899371-learning-plan.md §13) — code blocks stay readable in EVERY reading theme.
//
// Defect found in P1: the code panel painted its background with `--eb-navy`, a token that design-tokens-dark.css redeclares as
// light-dark(#1c1330, #f4f1fb), while the code text kept a fixed light colour (#e6edf7). In the Reader's «داكن» theme and in the
// app's dark mode the panel turned light under light text: ≈1.06:1, unreadable (measured in Chromium:
// scripts/check-reader-code-p1.mjs). The panel now reads its own tokens (--eb-code-*), declared once in design-tokens.css and
// redeclared by no theme, so the dark code panel is the same in light, sepia and dark; every text colour is checked for WCAG AA.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const readerCss = read("src/learning/reader/reader.css");
const tokensCss = read("src/design-tokens.css");
const THEME_FILES = ["src/design-tokens-dark.css", "src/learning/reader/reader.css", "src/learning/reader/reader-enterprise-l1.css", "src/learning/themes/booklet-theme.css"];

/** The declarations of the first rule whose selector list is exactly `selector` (whitespace-insensitive). */
function rule(css: string, selector: string): Record<string, string> {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1]) !== norm(selector)) continue;
    const out: Record<string, string> = {};
    for (const d of m[2].split(";")) { const i = d.indexOf(":"); if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }
    return out;
  }
  return {};
}
const hex = (h: string) => { const v = h.replace("#", ""); const f = v.length === 3 ? v.split("").map(c => c + c).join("") : v; return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) / 255); };
const lum = (h: string) => { const [r, g, b] = hex(h).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const wrap = rule(readerCss, ".learning-reader-codewrap");
const root = rule(tokensCss.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[\s\S]*?(:root\s*\{)/, "$1"), ":root");
const TOKENS = ["--eb-code-fg", "--eb-code-keyword", "--eb-code-type", "--eb-code-string", "--eb-code-number", "--eb-code-comment"];

describe("code panel colours", () => {
  it("the panel and its text use the panel's own tokens, not a theme token", () => {
    expect(wrap["background"] ?? wrap["background-color"]).toBe("var(--eb-code-bg)");
    expect(rule(readerCss, ".learning-reader-code code")["color"]).toBe("var(--eb-code-fg)");
  });

  it("the panel's tokens are declared once, in design-tokens.css, and no theme or reader sheet redeclares them", () => {
    expect(Object.keys(root).filter(k => k.startsWith("--eb-code-")).sort()).toEqual([...TOKENS, "--eb-code-bg", "--eb-code-gutter", "--eb-code-line", "--eb-code-hover", "--eb-code-control"].sort());
    for (const f of THEME_FILES) expect(read(f), f).not.toMatch(/--eb-code-(bg|fg|keyword|type|string|number|comment|gutter|line|hover|control)\s*:/);
  });

  it("every text colour on the panel meets WCAG AA (4.5:1), the line numbers 3:1", () => {
    const bg = root["--eb-code-bg"];
    expect(bg).toMatch(/^#[0-9a-f]{6}$/i);
    for (const t of TOKENS) {
      expect(root[t], t).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(root[t], bg), t).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(root["--eb-code-gutter"], bg)).toBeGreaterThanOrEqual(3);
  });
});
