// UX-R17a — the two legacy base sheets (platform.css, App.css) on the purple-neutral palette (docs/enterprise-ux-r0-redesign-
// foundation.md R17a). Presentation only. These guards pin that the slate neutrals, the white literals and the old blue chrome
// left both sheets; that a status value equal to a token names it; that the hero text keeps AAA on the hero; and that what carries
// meaning or draws the student's exam paper did not move (status shades, the difficulty scale, the legend, the word bank).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const sheets = { platform: flat(read("src", "platform.css")), app: flat(read("src", "App.css")) };
const tokens = flat(read("src", "design-tokens.css"));
/** Rules that draw the classic exam paper or a meaning-carrying scale keep their literals (they are what the student sees). */
const KEPT = /\.generated-exam|\.word-bank|\.legend-dot|difficulty-|\.topic-chip|\.export-ai-button|\.preview-download/;
const chrome = (s: string) => s.split("}").filter(r => r.includes("{") && !KEPT.test(r.slice(0, r.indexOf("{")))).join("}");
const hex6 = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h).toLowerCase();
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const isNeutral = (h: string) => {
  const [r, g, b] = rgb(h); const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2;
  if ((mx - mn) * 255 < 6) return true;
  return b >= g && g >= r && (mx - mn) / (1 - Math.abs(2 * l - 1)) <= 0.5;
};
const token = (name: string): string => { const v = tokens.match(new RegExp("--" + name + ":\\s*([^;]+);"))![1].trim(); const ref = v.match(/^var\(--([\w-]+)\)$/); return ref ? token(ref[1]) : v; };
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const OLD_BLUE_CHROME = ["#cfe0f8", "#f7f9fd", "#f5f9ff", "#f2f6fd", "#0f2b46", "#d6e2f7", "#bfd3f2", "#e0e7ff", "#7c3aed", "#f5f3ff", "#ddd6fe", "#3730a3", "#eef2ff", "#4338ca", "#2563eb", "#1d4ed8"];

describe("UX-R17a — platform.css and App.css", () => {
  it("hold no slate, grey or white literal outside the exam paper and the meaning-carrying scales", () => {
    for (const [name, s] of Object.entries(sheets)) {
      const lits = (chrome(s).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex6);
      expect(lits.filter(isNeutral), name).toEqual([]);
      expect(chrome(s), name).not.toMatch(/rgba?\(\s*(15,\s*23,\s*42|255,\s*255,\s*255|11,\s*18,\s*32)\s*[,)]/);
    }
  });

  it("hold none of the old blue chrome (hairlines, grounds, the navy chip, the indigo and violet panels)", () => {
    for (const [name, s] of Object.entries(sheets)) for (const h of OLD_BLUE_CHROME) expect(chrome(s).toLowerCase(), name + " " + h).not.toContain(h);
    expect(sheets.platform).toContain(".student-filter-chip.active{background:var(--eb-navy);color:var(--eb-surface);border-color:var(--eb-navy)}");
  });

  it("a status value equal to a token names it, at the same value", () => {
    expect(sheets.platform).toContain(".analytics-chip.warning { background: var(--eb-warn-bg); color: #c2410c; }");
    expect(sheets.app).toContain(".saved-delete-button:hover, .question-delete-mini:hover { background: var(--eb-danger-bg); border-color: #f0b4b4; }");
    expect(token("eb-warn-bg")).toBe("#fff7ed"); expect(token("eb-danger-bg")).toBe("#fef2f2");
  });

  it("the hero's text keeps AAA (7:1) on every stop of the hero gradient", () => {
    expect(sheets.platform).toContain(".platform-hero p { color: var(--eb-primary-200); }");
    for (const stop of ["eb-content-ink", "eb-navy", "eb-navy-2", "eb-primary-strong"]) expect(ratio(token("eb-primary-200"), token(stop)), stop).toBeGreaterThanOrEqual(7);
  });

  it("the shades that carry meaning and the student's exam paper did not move", () => {
    expect(sheets.app).toContain(".question-card.difficulty-1::before { background: #22c55e; }");
    expect(sheets.platform).toContain(".legend-dot.review { background: #8b5cf6; }");
    expect(sheets.platform).toMatch(/\.platform-notice[^}]*#166534/);
    expect(sheets.app).toMatch(/\.word-bank-box \{[^}]*#bae6fd/);
  });

  it("no text colour reads the axis or faint token (strokes only); the small helper and table notes keep AA (4.5:1) on white", () => {
    for (const [name, s] of Object.entries(sheets)) expect(s, name).not.toMatch(/(^|[;{ ])color:\s*var\(--eb-content-(axis|faint)\)/);
    const resolve = (v: string) => { const t = v.match(/^var\(--([\w-]+)\)$/); return t ? token(t[1]) : v; };
    const colorOf = (s: string, sel: string) => {
      const i = s.indexOf(sel + " {"); expect(i, sel).toBeGreaterThan(-1);
      return resolve(s.slice(s.indexOf("{", i) + 1, s.indexOf("}", i)).match(/(?:^|;)\s*color:\s*([^;]+);/)![1].trim());
    };
    for (const [s, sel] of [[sheets.app, ".helper-text"], [sheets.platform, ".analytics-topic-list span"], [sheets.platform, ".analytics-table td small"], [sheets.platform, ".analytics-improvers small"]] as const) {
      expect(ratio(colorOf(s, sel), "#ffffff"), sel).toBeGreaterThanOrEqual(4.5);
    }
    // the analytics chart's axis labels are text too (SVG fill), so they take the muted text token
    expect(sheets.platform).toContain(".analytics-axis-text,.analytics-axis-label { fill: var(--eb-content-muted); font-size: 10px; }");
    expect(ratio(token("eb-content-muted"), "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("the colour baseline holds each sheet below a third of its old count", () => {
    const base = JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files as Record<string, number>;
    expect(base["src/platform.css"]).toBeLessThan(267 / 3);
    expect(base["src/App.css"]).toBeLessThan(241 / 2);
  });
});
