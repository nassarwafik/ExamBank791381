/// <reference types="node" />
// Phase 21E.1 (slice 2) — audit finding F6: --eb-muted (secondary text: hints, meta lines, captions) must meet WCAG AA 4.5:1 for
// normal-size text on EVERY light surface and tint it is placed on. Before 21E.1 slice 2 it was #64748b: 4.04–4.48:1 on the page
// background, the primary tints and the warn / danger tints. It must also stay visibly lighter than body text (--eb-text), so the
// hierarchy between primary and secondary text survives.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const tokens = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "design-tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const hex = (name: string) => {
  const m = new RegExp("--eb-" + name + ":\\s*(#[0-9a-fA-F]{6})\\b").exec(tokens);
  if (!m) throw new Error("token --eb-" + name + " is not a literal hex colour");
  return m[1];
};
const lum = (h: string) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("21E.1 slice 2 — F6: --eb-muted meets AA on every light surface and tint", () => {
  const SURFACES = ["bg", "bg-tint", "surface", "surface-2", "primary-050", "primary-100", "success-bg", "warn-bg", "danger-bg", "info-bg"];
  for (const s of SURFACES) {
    it(`--eb-muted on --eb-${s} ≥ 4.5:1`, () => {
      expect(ratio(hex("muted"), hex(s))).toBeGreaterThanOrEqual(4.5);
    });
  }
  it("stays lighter than --eb-text (secondary text remains secondary) and darker than --eb-faint", () => {
    expect(lum(hex("muted"))).toBeGreaterThan(lum(hex("text")));
    expect(lum(hex("muted"))).toBeLessThan(lum(hex("faint")));
  });
});
