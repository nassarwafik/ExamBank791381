/// <reference types="node" />
// Phase UX-R3 — the teacher analytics chart theme. Every Chart.js chart of the teacher pages (dashboard, reports, projects) reads
// the ONE token palette of projects/chartPalette.ts: the deep purple first, its lavender step second, then the warn / success hues,
// a three-step judgement scale from the semantic tokens, and a quiet grid. The dashboard no longer hard-codes the old blue.
// (The exam-question chart palette, src/charts/chartTheme.ts, is CONTENT — a question may name a series by its colour — and is
// deliberately outside the redesign.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { chartPalette, tokenColor, withAlpha } from "./chartPalette";

const SRC = fileURLToPath(new URL("..", import.meta.url));

describe("UX-R3 — teacher chart palette", () => {
  const p = chartPalette();
  it("series: the deep purple, then its lavender step, then warn and success", () => {
    expect(p.series).toEqual([
      withAlpha(tokenColor("--eb-primary"), 0.85), withAlpha(tokenColor("--eb-primary-300"), 0.9),
      withAlpha(tokenColor("--eb-warn"), 0.85), withAlpha(tokenColor("--eb-success"), 0.85),
    ]);
  });
  it("the judgement scale comes from the semantic tokens (danger · warn · success), never invented hues", () => {
    expect(p.scale).toEqual({ low: withAlpha(tokenColor("--eb-danger"), 0.76), mid: withAlpha(tokenColor("--eb-warn"), 0.76), high: withAlpha(tokenColor("--eb-success"), 0.76) });
  });
  it("the first two series are distinguishable from each other and from white (non-text ≥ 3:1)", () => {
    const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const [first, second] = [tokenColor("--eb-primary"), tokenColor("--eb-primary-300")];
    expect(ratio(first, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(ratio(second, "#ffffff")).toBeGreaterThanOrEqual(3);
    expect(ratio(first, second)).toBeGreaterThanOrEqual(3);
  });
});

describe("UX-R3 — the dashboard charts read the palette", () => {
  const src = readFileSync(join(SRC, "TeacherDashboard.tsx"), "utf8");
  it("no hard-coded chart colour remains (the old blue / sky / red / green / amber literals)", () => {
    expect(src).not.toMatch(/#2563eb|37,\s*99,\s*235|14,\s*165,\s*233|239,\s*68,\s*68|22,\s*163,\s*74|245,\s*158,\s*11|148,\s*163,\s*184/i);
  });
  it("every chart takes the shared palette (and lists it in its memo dependencies)", () => {
    expect(src).toContain('import { chartPalette } from "./projects/chartPalette";');
    expect(src.match(/const palette=useChartPalette\(\);/g)).toHaveLength(5);
    expect(src.match(/grid:\{color:palette\.grid\}/g)).toHaveLength(4);
  });
});
