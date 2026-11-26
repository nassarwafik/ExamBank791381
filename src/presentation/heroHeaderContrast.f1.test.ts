import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PRESENTATION_PRESETS, contrastRatio } from "./presentationModel";

// F1 — the «hero» exam header (presentation.css) tints the student exam's top bar with 6% of the preset's primary over its surface. The
// preset contrast policy guarantees the MUTED colour on the plain surface only, and on that tint it is not enough: «أكاديمي حديث»
// (modernAcademic, the preset whose exam header is «hero») draws the bar's context line (class · attempt, 12px) in #64748B on #F1F4FD —
// 4.32:1 < 4.5 (axe, real Chromium: scripts/check-899271-automata-theory-browser.mjs). Under the hero header the context line takes the
// preset's TEXT colour, the very colour the bar's title already uses on the same tint; this test proves it reads ≥ 4.5:1 on every preset's
// tint, and keeps the reason (muted fails for modernAcademic) on record.
const sheet = readFileSync(path.join(process.cwd(), "src", "presentation", "presentation.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => "#" + c.map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
/** color-mix(in srgb, primary p%, surface): the hero tint as the browser computes it. */
const heroTint = (primary: string, surface: string, p = 0.06) => toHex(hex(primary).map((v, i) => v * p + hex(surface)[i] * (1 - p)));

describe("F1 — the «hero» exam header: the top bar's context line is readable on its tint", () => {
  it("the hero tint is 6% of the primary over the surface (the rule this test models)", () => {
    expect(sheet).toMatch(/\[data-xp-exam-header="hero"\]\s*:is\(\.iex-topbar,\.iex-cover-card\)\{\s*background:color-mix\(in srgb,var\(--xp-primary\) 6%,var\(--xp-surface\)\);\s*\}/);
    expect(heroTint("#1D4ED8", "#FFFFFF")).toBe("#F1F4FD");   // modernAcademic: the background axe measured
  });

  it("under the hero header the context line takes the preset's text colour", () => {
    expect(sheet).toMatch(/\[data-xp-exam-header="hero"\]\s*\.iex-topbar-context\{\s*color:var\(--xp-text\);\s*\}/);
  });

  it("on every preset's hero tint the text colour reads ≥ 4.5:1 — where the muted colour does not always (modernAcademic 4.32:1)", () => {
    const rows = Object.entries(PRESENTATION_PRESETS).map(([id, p]) => {
      const tint = heroTint(p.colors.primary, p.colors.surface);
      return { id, text: contrastRatio(p.colors.text, tint), muted: contrastRatio(p.colors.muted, tint) };
    });
    for (const r of rows) expect(r.text, r.id).toBeGreaterThanOrEqual(4.5);
    const modern = rows.find(r => r.id === "modernAcademic")!;
    expect(modern.muted).toBeLessThan(4.5);
    expect(modern.muted).toBeCloseTo(4.32, 1);   // axe: 4.32 (its own rounding of the same colours)
  });
});
