import { describe, it, expect } from "vitest";
import { SMARTASSESS_EDITOR_THEME, SMARTASSESS_EDITOR_THEME_DARK } from "./editorOptions";

// 899371 enrichment P17 (docs/enterprise-899371-enrichment-plan.md §13) — the number Monaco draws on the editor's last, empty line is
// DIMMED: without a theme colour of its own Monaco paints it at 40 % of the line-number colour, which axe reports as too faint
// (color-contrast, found by the P14 browser check and the P15 audit). Both SmartAssess themes — the exam's editor and the Reader's —
// give it a colour of its own that reads at ≥ 4.5:1 on the gutter, and still sits between the ordinary and the active line number.
const lum = (h: string) => {
  const v = h.replace("#", "").slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("P17 — the dimmed last line number in the editor themes", () => {
  for (const theme of [SMARTASSESS_EDITOR_THEME, SMARTASSESS_EDITOR_THEME_DARK]) {
    it(theme.name + ": a colour of its own, ≥ 4.5:1 on the gutter, between the ordinary and the active number", () => {
      const c = theme.data.colors as Record<string, string>;
      const dimmed = c["editorLineNumber.dimmedForeground"];
      expect(dimmed, "editorLineNumber.dimmedForeground").toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(dimmed, c["editorGutter.background"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dimmed, c["editor.background"])).toBeGreaterThanOrEqual(4.5);
      const gutter = c["editorGutter.background"];
      expect(contrast(dimmed, gutter)).toBeGreaterThan(contrast(c["editorLineNumber.foreground"], gutter));
      expect(contrast(dimmed, gutter)).toBeLessThan(contrast(c["editorLineNumber.activeForeground"], gutter));
    });
  }
});
