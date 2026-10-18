/// <reference types="node" />
// Phase L.8 — what the real-browser gate (scripts/check-learning-reader-browser-l8.mjs) found, pinned in the CSS (read from disk:
// CSS is stubbed under Vitest):
//   • the unit opener's numeral (decorative, aria-hidden, but visible) meets the 3:1 contrast of large text in every reading
//     theme — the former pale tint measured 1.2:1 on white;
//   • on a touch tablet (834 px, coarse pointer) the student portal's top-bar links, filter chips and card buttons are 44 px tall —
//     the phone rules stop at 720 / 767 px.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
const readerCss = read("./reader.css"), l1 = read("./reader-enterprise-l1.css"), l2c = read("./reader-enterprise-l2c.css");
const tokens = read("../../design-tokens.css"), portal = read("../../student/student-portal-v2.css");
const allReaderCss = [readerCss, l1, l2c, read("./reader-enterprise-l2a.css")].join("\n");

const token = (css: string, name: string) => css.match(new RegExp(name + ":\\s*(#[0-9a-fA-F]{6})"))?.[1] ?? "";
const lum = (hex: string) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const [r, g, b] = [1, 3, 5].map(i => f(parseInt(hex.slice(i, i + 2), 16))); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("L.8 — the unit opener's numeral is readable in every theme", () => {
  it("its one colour rule is --eb-primary; no reader stylesheet paints it with a pale tint any more", () => {
    const rules = [...allReaderCss.matchAll(/([^{}]*\.learning-reader-opener-number[^{}]*)\{([^}]*)\}/g)].filter(m => /color\s*:/.test(m[2]));
    expect(rules.map(m => noSpaces(m[2]).match(/(?:^|;)color:([^;]+)/)?.[1])).toEqual(["var(--eb-primary)"]);
  });
  it("--eb-primary is ≥ 3:1 on the light, sepia and dark reading surfaces (large text, WCAG 1.4.3)", () => {
    expect(contrast(token(tokens, "--eb-primary"), token(tokens, "--eb-surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(tokens, "--eb-primary"), token(l2c, "--eb-read-sepia-surface"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(l1, "--eb-read-dark-primary"), token(l1, "--eb-read-dark-surface"))).toBeGreaterThanOrEqual(3);
  });
});

describe("L.8 — touch tablets get 44 px targets in the student portal", () => {
  it("a coarse pointer gives the top-bar links, logout, buttons and filter chips min-height 44px, whatever the width", () => {
    const start = portal.lastIndexOf("@media (pointer: coarse)");
    expect(start).toBeGreaterThan(0);
    const block = noSpaces(portal.slice(portal.indexOf("{", start) + 1, portal.indexOf("}", start) + 1));
    for (const sel of [".eb-student-shell.student-topbar-link", ".eb-student-shell.student-logout", ".eb-student-shell.eb-button", ".eb-student-shell.eb-chip-button", ".eb-sp-v2.eb-sp-filters.eb-chip-button"]) expect(block, sel).toContain(sel);
    expect(block).toContain("min-height:44px");
  });
  it("the coarse-pointer block comes after the 40 px desktop rules it overrides (same specificity, later wins)", () => {
    const coarse = portal.lastIndexOf("@media (pointer: coarse)");
    expect(portal.indexOf(".eb-sp-v2 .eb-sp-filters .eb-chip-button { min-height: 40px")).toBeLessThan(coarse);
    expect(portal.indexOf(".eb-student-shell .student-logout { border-radius: var(--eb-pill); min-height: 40px")).toBeLessThan(coarse);
  });
});
