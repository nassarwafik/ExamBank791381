// Tadris+ P8-A1 — the teacher appearance presets in src/design-tokens.css (blueprint §9.3, owner decisions §19.27), checked from the
// SHIPPED CSS (not a copy): every palette swaps exactly the brand family, its plain light values equal the light half of its
// light-dark() values, and every pair the default palette must meet (tokensV2.ux-r1 / darkTokens.ux-r18a / mutedContrast) is met by
// every palette in BOTH modes. The density preset only tightens the larger spacing steps; exam pages (light islands) keep the defaults.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(import.meta.dirname, "..", "design-tokens.css"), "utf8");
const dark = readFileSync(path.join(import.meta.dirname, "..", "design-tokens-dark.css"), "utf8");
const PALETTES = ["ocean", "forest", "sand"];
const FAMILY = ["--eb-primary", "--eb-primary-strong", "--eb-primary-050", "--eb-primary-100", "--eb-primary-200", "--eb-primary-300", "--eb-focus"];

const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const declsOf = (block: string) => Object.fromEntries([...block.matchAll(/(--eb-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
/** The declarations of `:root[data-palette="id"] { … }` — the first (plain) block, or the one inside @supports. */
function paletteBlock(id: string, inSupports: boolean) {
  const supportsAt = css.indexOf("@supports (color: light-dark(#000, #fff))");
  const src = inSupports ? css.slice(supportsAt) : css.slice(0, supportsAt);
  const m = src.match(new RegExp(':root\\[data-palette="' + id + '"\\]\\s*\\{([^}]*)\\}'));
  expect(m, id + (inSupports ? " (light-dark)" : " (plain)")).toBeTruthy();
  return declsOf(m![1]);
}
const half = (v: string, i: 0 | 1) => { const m = v.match(/light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/); return m ? m[1 + i].trim() : v; };
const neutral = (name: string) => { const m = dark.match(new RegExp(name + ":\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)")); expect(m, name).toBeTruthy(); return { l: m![1], d: m![2] }; };
const N = { surface: neutral("--eb-surface"), bg: neutral("--eb-bg"), surface2: neutral("--eb-surface-2"), muted: neutral("--eb-muted") };

describe("P8-A1 palettes — the shipped tokens", () => {
  it("each palette declares exactly the brand family, plainly and with light-dark(); the plain value is the light half", () => {
    for (const id of PALETTES) {
      const plain = paletteBlock(id, false), themed = paletteBlock(id, true);
      expect(Object.keys(plain).sort(), id).toEqual([...FAMILY].sort());
      expect(Object.keys(themed).sort(), id).toEqual([...FAMILY].sort());
      for (const t of FAMILY) {
        if (t === "--eb-focus") { expect(plain[t]).toMatch(/^0 0 0 4px rgba\(/); expect(themed[t]).toMatch(/^0 0 0 4px light-dark\(rgba\(/); continue; }
        expect(themed[t], id + " " + t).toMatch(/^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
        expect(half(themed[t], 0), id + " " + t).toBe(plain[t]);
      }
    }
  });

  it("every palette meets the default palette's contrast pairs — light mode (AA)", () => {
    for (const id of PALETTES) {
      const p = paletteBlock(id, false);
      const [pri, strong, t050, t100] = [p["--eb-primary"], p["--eb-primary-strong"], p["--eb-primary-050"], p["--eb-primary-100"]];
      expect(ratio("#ffffff", pri), id).toBeGreaterThanOrEqual(4.5);
      expect(ratio("#ffffff", strong), id).toBeGreaterThanOrEqual(4.5);
      for (const g of [N.surface.l, N.bg.l, t050, t100]) { expect(ratio(pri, g), id + " on " + g).toBeGreaterThanOrEqual(4.5); expect(ratio(strong, g), id + " strong on " + g).toBeGreaterThanOrEqual(4.5); }
      expect(ratio(pri, strong), id + " hover step").toBeGreaterThanOrEqual(1.4);
      for (const g of [t050, t100]) expect(ratio(N.muted.l, g), id + " muted on " + g).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("every palette meets the default palette's contrast pairs — dark mode (AA, focus ring 3:1, content accent 7:1)", () => {
    for (const id of PALETTES) {
      const p = paletteBlock(id, true);
      const [pri, strong, t050, t100] = ["--eb-primary", "--eb-primary-strong", "--eb-primary-050", "--eb-primary-100"].map(t => half(p[t], 1));
      expect(ratio(N.surface.d, pri), id).toBeGreaterThanOrEqual(4.5);
      expect(ratio(N.surface.d, strong), id).toBeGreaterThanOrEqual(4.5);
      for (const g of [N.surface.d, N.surface2.d, N.bg.d, t050, t100]) { expect(ratio(pri, g), id + " on " + g).toBeGreaterThanOrEqual(4.5); expect(ratio(strong, g), id + " strong on " + g).toBeGreaterThanOrEqual(4.5); }
      for (const g of [N.surface.d, N.surface2.d, N.bg.d]) expect(ratio(pri, g), id + " focus ring").toBeGreaterThanOrEqual(3);
      expect(ratio(pri, strong), id + " hover step").toBeGreaterThanOrEqual(1.4);
      for (const g of [t050, t100]) expect(ratio(N.muted.d, g), id + " muted on " + g).toBeGreaterThanOrEqual(4.5);
      expect(ratio(strong, N.surface.d), id + " content accent").toBeGreaterThanOrEqual(7);
    }
  });

  it("compact density tightens only space-3..7 (never the 4/8 px steps); exam pages keep the default palette and spacing", () => {
    const compact = declsOf(css.match(/:root\[data-density="compact"\]\s*\{([^}]*)\}/)![1]);
    expect(Object.keys(compact).sort()).toEqual(["--eb-space-3", "--eb-space-4", "--eb-space-5", "--eb-space-6", "--eb-space-7"]);
    const def = declsOf(css.slice(0, css.indexOf("Tadris+ P8-A1")));
    for (const [t, v] of Object.entries(compact)) expect(parseInt(v), t).toBeLessThan(parseInt(def[t]));
    const islandPalette = declsOf(css.match(/:root\[data-palette\] :is\([^)]*\)\s*\{([^}]*)\}/)![1]);
    for (const t of FAMILY) expect(islandPalette[t], "island " + t).toBe(def[t]);
    const islandSpace = declsOf(css.match(/:root\[data-density\] :is\([^)]*\)\s*\{([^}]*)\}/)![1]);
    for (const t of Object.keys(compact)) expect(islandSpace[t], "island " + t).toBe(def[t]);
  });
});
