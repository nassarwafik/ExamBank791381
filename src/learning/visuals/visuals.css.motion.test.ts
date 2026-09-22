// CSS MOTION AMPLITUDE — the owner reported the visuals looking static. A root cause was opacity-only pulses around
// .85–.90 → 1, which read as no motion. This pins that every looping visual pulse now combines its opacity change
// with an actual transform (scale / translate) so the movement is perceptible, while every motion class stays
// neutralized under prefers-reduced-motion. (Runtime confirmation: in headless Chromium 1194 the enhanced sweep
// computes translateX 26 → 190px across its cycle; the plain opacity keyframes it replaces computed only .9 → 1.0.)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/learning/visuals/visuals.css"), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

// Extract the body of a single @keyframes block by name.
function keyframes(name: string): string {
  const start = css.indexOf("@keyframes " + name);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0, i = css.indexOf("{", start);
  const from = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") { depth--; if (depth === 0) return css.slice(from, i + 1); }
  }
  throw new Error("unterminated @keyframes " + name);
}

describe("visuals.css — perceptible (not opacity-only) motion", () => {
  // These pulses used to animate opacity ONLY; each must now also move/scale so it is visible.
  for (const name of ["eb-visual-pulse", "eb-visual-breathe", "eb-visual-rise", "eb-visual-glow", "eb-visual-prefix-glow"]) {
    it(`@keyframes ${name} animates a transform, not opacity alone`, () => {
      expect(keyframes(name)).toMatch(/transform\s*:/);
    });
  }

  it("the position-based motions keep a clearly visible amplitude (sweep travels a long distance; bob is no longer a near-invisible 3px)", () => {
    expect(noSpaces(keyframes("eb-visual-sweep"))).toContain("translateX(26px)");
    expect(noSpaces(keyframes("eb-visual-sweep"))).toContain("translateX(354px)");
    // bob was translateY(-3px) (barely perceptible) — deepened so the pin visibly bobs
    const bobY = keyframes("eb-visual-bob").match(/translateY\((-?\d+)px\)/g)!.map(m => Math.abs(Number(m.match(/-?\d+/)![0])));
    expect(Math.max(...bobY)).toBeGreaterThanOrEqual(6);
  });

  it("classes that scale/translate are transform-boxed to fill-box (SVG-safe origin, no reflow, no clipping)", () => {
    for (const cls of ["eb-visual-pulse", "eb-visual-leaf-anim", "eb-visual-pillar-anim", "eb-visual-glow-anim", "eb-visual-pin-anim", "eb-visual-prefix-anim"]) {
      const start = css.indexOf("." + cls + "{");
      const decl = css.slice(start, css.indexOf("}", start));
      expect(noSpaces(decl), cls).toContain("transform-box:fill-box");
    }
  });

  it("EVERY motion class remains disabled under prefers-reduced-motion (defense in depth)", () => {
    const flat = noSpaces(css);
    expect(flat).toContain("prefers-reduced-motion:reduce");
    expect(flat).toContain("animation:none!important");
    // gather the bodies of every @media (prefers-reduced-motion: reduce) block (balanced-brace scan)
    let reduced = "";
    for (let at = css.indexOf("@media"); at !== -1; at = css.indexOf("@media", at + 1)) {
      const head = css.slice(at, css.indexOf("{", at));
      if (!/prefers-reduced-motion:\s*reduce/.test(head)) continue;
      let depth = 0, i = css.indexOf("{", at);
      for (; i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}") { depth--; if (depth === 0) break; } }
      reduced += css.slice(at, i + 1) + "\n";
    }
    // each animated class name appears inside a reduced-motion block that sets animation:none
    for (const cls of ["eb-visual-pulse", "eb-visual-leaf-anim", "eb-visual-pillar-anim", "eb-visual-glow-anim", "eb-visual-sweep-anim", "eb-visual-pin-anim", "eb-visual-prefix-anim"]) {
      expect(reduced, cls).toContain(cls);
    }
  });
});
