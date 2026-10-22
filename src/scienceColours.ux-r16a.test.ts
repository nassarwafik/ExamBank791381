// UX-R16a — the science simulators' own colours on the purple-neutral palette (docs/enterprise-ux-r0-redesign-foundation.md R16a).
// Presentation only: what a simulator computes, grades or stores is pinned by its own suites (physicsMotion, freeFall, lab, chemistry
// structure / reactions / lab, mesh models, function surfaces, interactive 3D). These guards pin the content-token family and its
// legibility, that the converted sheets hold only the hues that carry meaning, that those hues did not move, and the two layout
// fixes (a measurement box never spills; the chemistry column may shrink).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { smartSimStarterConfig } from "./trustedSim/smartSimStarters";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = strip(read("src", "design-tokens.css"));
const SHEETS = ["physicsMotion/motion.css", "physicsFreeFall/freefall.css", "physicsLab/lab.css", "chemistryStructure/chem.css", "chemistryReactions/rxn.css",
  "chemistryLab/chemLab.css", "meshModels/mesh-model.css", "functionSurfaces/surface-plot.css", "functionSurfaces/surface-3d.css", "interactive3d/interactive3d.css", "smartsim/dynamic/dynamic.css"];
// interactive3d.css: its scene drawing (lines, edges, vertices, the selected and review tints) is pinned as drawn by the 21E viewer
// guards, so only its interface literals are converted (3 of 23); the scene's own colours are a later, owner-visible decision.
const PINNED_3D = "interactive3d/interactive3d.css";
const css = Object.fromEntries(SHEETS.map(f => [f, strip(read("src", ...f.split("/")))]));
/** The sheet with its dark-scheme and more-contrast blocks removed (those blocks are tuned for their own grounds and keep literals). */
const lightOnly = (s: string) => {
  let out = "", k = 0; const re = /@media\s*\((?:prefers-color-scheme:\s*dark|prefers-contrast:\s*more)\)\s*\{/g; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) { let d = 0, j = m.index + m[0].length - 1; for (; j < s.length; j++) { if (s[j] === "{") d++; else if (s[j] === "}" && --d === 0) break; } out += s.slice(k, m.index); k = j + 1; re.lastIndex = k; }
  return out + s.slice(k);
};
const value = (name: string): string => { const v = tokens.match(new RegExp("--" + name + ":\\s*([^;]+);"))![1].trim(); const ref = v.match(/^var\(--([\w-]+)\)$/); return ref ? value(ref[1]) : v; };
const rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => { const [r, g, b] = rgb(h).map(v => v / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const chroma = (h: string) => { const c = rgb(h); return Math.max(...c) - Math.min(...c); };
const hex6 = (h: string) => (h.length === 4 ? "#" + [...h.slice(1)].map(c => c + c).join("") : h).toLowerCase();

describe("UX-R16a — the content-token family", () => {
  const GROUNDS = ["surface", "content-ground", "content-ground-2"];
  it("is defined once each, on the palette", () => {
    for (const t of ["ink", "text", "muted", "axis", "faint", "grid", "line", "ground", "ground-2", "accent", "accent-strong"]) {
      expect(tokens.match(new RegExp("--eb-content-" + t + ":", "g")), t).toHaveLength(1);
    }
    expect(value("eb-content-accent")).toBe(value("eb-primary-strong"));
    expect(value("eb-content-ink")).toBe(value("eb-navy"));
  });

  it("text tokens are AA (4.5:1) on every content ground; the axis token is ≥ 3:1 (strokes, axes, guides)", () => {
    for (const fg of ["content-ink", "content-text", "content-muted"]) for (const bg of GROUNDS) expect(ratio(value("eb-" + fg), value("eb-" + bg)), fg + " on " + bg).toBeGreaterThanOrEqual(4.5);
    for (const bg of GROUNDS) expect(ratio(value("eb-content-axis"), value("eb-" + bg)), "axis on " + bg).toBeGreaterThanOrEqual(3);
  });

  it("the control colour carries white text at AAA, like the blue it replaces did at AA", () => {
    expect(ratio(value("eb-content-accent"), "#ffffff")).toBeGreaterThanOrEqual(7);
    expect(ratio("#1d6fd6", "#ffffff")).toBeLessThan(ratio(value("eb-content-accent"), "#ffffff"));
  });
});

describe("UX-R16a — the converted sheets", () => {
  it("hold no neutral (low-chroma) literal and no control blue outside the dark-scheme / more-contrast blocks", () => {
    for (const [f, s] of Object.entries(css)) {
      if (f === PINNED_3D) continue;
      const lits = (lightOnly(s).match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(hex6);
      expect(lits.filter(h => chroma(h) <= 70), f + " neutrals").toEqual([]);
      expect(lits.filter(h => h === "#236aa4" || h === "#0d3f80" && !/chem\.css$/.test(f)), f + " control blues").toEqual([]);
      expect(lightOnly(s), f).not.toMatch(/rgba\(\s*(15,\s*23,\s*42|255,\s*255,\s*255)\s*,/);
    }
  });

  it("the hues that carry meaning did not move (applied force, kinetic energy, electrons, a series, the free-fall curve, the vectors)", () => {
    expect(css["physicsMotion/motion.css"]).toContain(".motion-vector.is-applied line { stroke: #1d6fd6; }");
    expect(css["physicsMotion/motion.css"]).toContain(".motion-vector.is-weight line, .motion-vector.is-normal line { stroke: #6b3fa0; }");
    expect(css["physicsMotion/motion.css"]).toContain(".motion-vector.is-friction line { stroke: #b4561d; }");
    expect(css["physicsLab/lab.css"]).toContain(".lab-bar.is-ke rect, .lab-legend .is-ke .lab-swatch { fill: #1d6fd6; background: #1d6fd6; }");
    expect(css["chemistryStructure/chem.css"]).toContain(".chem-electron { fill: #1d6fd6; stroke: #0d3f80; stroke-width: 1; }");
    expect(css["chemistryLab/chemLab.css"]).toContain(".clab-swatch.clab-s1, .xp-dyn-series.clab-s1 { background: #1d6fd6; stroke: #1d6fd6; }");
    expect(css["physicsFreeFall/freefall.css"]).toContain(".freefall-curve { fill: none; stroke: #1d6fd6; stroke-width: 2.5; }");
  });

  it("status hues name their tokens at the same value; presentation variables keep winning over the fallbacks", () => {
    expect(css["physicsMotion/motion.css"]).toContain(".motion-vector.is-velocity line { stroke: var(--xp-success, var(--eb-success-tx)); stroke-width: 3; }");
    expect(css["physicsMotion/motion.css"]).toContain(".motion-trail { fill: none; stroke: var(--xp-primary, var(--eb-content-accent)); stroke-width: 2; }");
    expect(value("eb-success-tx")).toBe("#15803d"); expect(value("eb-danger-tx")).toBe("#b42318");
  });

  it("the controls, pressed toggles and focus rings use the content accent", () => {
    expect(css["physicsMotion/motion.css"]).toContain(".motion button, .motion-editor button { min-height: 40px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--eb-content-accent); background: var(--eb-content-accent); color: var(--eb-surface);");
    expect(css["chemistryLab/chemLab.css"]).toContain(".clab :focus-visible { outline: 3px solid var(--eb-content-accent); outline-offset: 2px; }");
  });

  it("each sheet is below its old literal count in the colour baseline", () => {
    const base = JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files as Record<string, number>;
    const before: Record<string, number> = { "physicsMotion/motion.css": 64, "physicsFreeFall/freefall.css": 49, "physicsLab/lab.css": 37, "chemistryStructure/chem.css": 58, "chemistryReactions/rxn.css": 53,
      "chemistryLab/chemLab.css": 52, "meshModels/mesh-model.css": 86, "functionSurfaces/surface-plot.css": 38, "functionSurfaces/surface-3d.css": 35, "interactive3d/interactive3d.css": 23, "smartsim/dynamic/dynamic.css": 28 };
    for (const f of SHEETS.filter(f => f !== PINNED_3D)) expect(base["src/" + f] ?? 0, f).toBeLessThan(before[f] / 2);
    expect(base["src/" + PINNED_3D]).toBe(20);
  });
});

describe("UX-R16a — the layout fixes", () => {
  it("a measurement or point box's track may shrink below its field (no spill), in the shared widgets and in free fall", () => {
    const m = css["physicsMotion/motion.css"], f = css["physicsFreeFall/freefall.css"];
    expect(m).toContain(".motion, .motion-explore, .motion-task, .motion-editor fieldset { grid-template-columns: minmax(0, 1fr); }");
    expect(m).toContain('.motion-task .motion-row > input[type="text"], .motion-task .motion-row > label { flex: 1 1 8em; min-width: 0; }');
    expect(m).toContain(".motion-task label { grid-template-columns: minmax(0, 1fr); }");
    expect(m).toContain('.motion-task label input[type="text"] { width: 100%; min-width: 0; }');
    expect(f).toContain(".freefall, .freefall-task { grid-template-columns: minmax(0, 1fr); }");
    expect(f).toContain('.freefall-task .freefall-row > input[type="text"], .freefall-task .freefall-row > label { flex: 1 1 8em; min-width: 0; }');
    expect(f).toContain('.freefall-task label input[type="text"] { width: 100%; min-width: 0; }');
  });

  it("the time field keeps a field's width; the dynamic layer and the chemistry column may shrink (no sideways page scroll)", () => {
    expect(css["physicsMotion/motion.css"]).toContain('.motion-timeline label input[type="number"] { width: 7em; }');
    expect(css["physicsFreeFall/freefall.css"]).toContain('.freefall-timeline label input[type="number"] { width: 7em; }');
    expect(css["smartsim/dynamic/dynamic.css"]).toContain(".smartsim-dyn { grid-template-columns: minmax(0, 1fr); }");
    expect(css["chemistryStructure/chem.css"]).toContain(".chem { grid-template-columns: minmax(0, 1fr); }");
  });

  it("the sliders take the control colour instead of the browser's blue", () => {
    expect(css["physicsMotion/motion.css"]).toContain('.motion input[type="range"], .motion-explore input[type="range"], .smartsim-dyn input[type="range"], .motion-editor input[type="range"] { accent-color: var(--eb-content-accent); }');
    expect(css["physicsFreeFall/freefall.css"]).toContain('.freefall input[type="range"], .freefall-editor input[type="range"] { accent-color: var(--eb-content-accent); }');
    expect(css["chemistryLab/chemLab.css"]).toContain('.clab input[type="range"] { accent-color: var(--eb-content-accent); }');
  });
});

describe("UX-R16a — the capture fixture", () => {
  it("scripts/ux-r16a-sim-starters.json is exactly each plugin's code-owned starter (no drift)", () => {
    const fx = JSON.parse(read("scripts", "ux-r16a-sim-starters.json")) as Record<string, unknown>;
    expect(Object.keys(fx)).toEqual(["physicsFreeFall", "physicsMotion", "physicsLab", "chemistryStructure", "chemistryReactions", "chemistryLab"]);
    for (const [k, v] of Object.entries(fx)) expect(v, k).toEqual(smartSimStarterConfig(k, 1));
  });
});
