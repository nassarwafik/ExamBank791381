// @vitest-environment happy-dom
// Static + render GUARDS for the SVG visual-enrichment pilot: no external/CDN dependency, responsive SVG, motion
// always gated by reduced-motion, and NO grading/Strength/publication/network coupling in the visuals layer.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup } from "@testing-library/react";
import { resolveVisual, REGISTERED_VISUAL_IDS } from "./registry";

afterEach(cleanup);

const DIRS = ["src/learning/visuals/791381/chapter1", "src/learning/visuals/791381/batch2"].map(d => resolve(process.cwd(), d) + "/");
const componentFiles = DIRS.flatMap(dir => readdirSync(dir).filter(f => f.endsWith(".tsx")).map(f => dir + f));
const sources = componentFiles.map(f => readFileSync(f, "utf8"));
const css = readFileSync(resolve(process.cwd(), "src/learning/visuals/visuals.css"), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

describe("visuals — no external dependency", () => {
  it("has one component file per registered visual (5)", () => {
    expect(componentFiles.length).toBe(REGISTERED_VISUAL_IDS.length);
  });
  it("no component references a remote URL, CDN, <img>, fetch, or a data: image", () => {
    for (const s of sources) {
      // the only http(s) literal allowed is the SVG xmlns namespace declaration (not a fetched resource)
      const nonNamespace = s.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "");
      expect(nonNamespace).not.toMatch(/https?:\/\//);
      expect(s).not.toMatch(/<img\b/);
      expect(s).not.toMatch(/\bfetch\b/);
      expect(s).not.toMatch(/data:image/);
      // the only href allowed is a local SMIL <mpath> fragment reference (#...)
      const hrefs = s.match(/href=[`"'][^`"']*[`"']/g) || [];
      for (const h of hrefs) expect(h).toMatch(/#/);
    }
  });
  it("no component couples to grading / Strength / publication / api / persistence", () => {
    for (const s of sources) {
      expect(s).not.toMatch(/\/api\b/);
      expect(s).not.toMatch(/strength|grade|gradebook|publish|visibleModule|assignment|localStorage/i);
    }
  });
});

describe("visuals — responsive + RTL-safe", () => {
  it("every SVG declares a viewBox and scales to its container (no fixed pixel width)", () => {
    for (const s of sources) {
      expect(s).toMatch(/viewBox=/);
      expect(s).toMatch(/preserveAspectRatio=/);
      expect(s).toMatch(/role="img"/);
    }
    // width/height come from CSS (width:100%; height:auto), not hard-coded on the element
    expect(noSpaces(css)).toContain("width:100%");
    expect(noSpaces(css)).toContain("height:auto");
  });
});

describe("visuals — motion always respects reduced motion", () => {
  it("visuals.css disables CSS animation under prefers-reduced-motion:reduce", () => {
    expect(noSpaces(css)).toContain("prefers-reduced-motion:reduce");
    expect(noSpaces(css)).toContain("animation:none!important");
  });

  // Motion mechanisms, all gated by the reducedMotion PROP (not only the CSS @media query): SMIL <animateMotion>
  // (traveling dots) and CSS animation classes (`.eb-visual-pulse`, `.eb-visual-leaf-anim`, `.eb-visual-pillar-anim`).
  // Under reduced motion NONE may appear in the rendered DOM; with motion on, at least one must. (The visuals.css
  // @media query is retained as the additional CSS-level safety net.)
  const MOTION_SELECTORS = [
    "animateMotion",
    // Chapter 1 CSS animation classes
    ".eb-visual-pulse", ".eb-visual-leaf-anim", ".eb-visual-pillar-anim",
    // Batch 2 CSS animation classes
    ".eb-visual-glow-anim", ".eb-visual-sweep-anim", ".eb-visual-pin-anim", ".eb-visual-prefix-anim",
  ];
  const motionMarks = (root: Element) =>
    MOTION_SELECTORS.reduce((n, sel) => n + root.querySelectorAll(sel).length, 0);

  it("each component omits ALL motion markers (SMIL + every CSS animation class) when reducedMotion is true, and renders a valid still SVG", () => {
    for (const id of REGISTERED_VISUAL_IDS) {
      const Comp = resolveVisual(id)!.component;
      const still = render(<Comp ariaLabel="x" reducedMotion={true} />);
      for (const sel of MOTION_SELECTORS) {
        expect(still.container.querySelectorAll(sel).length, `${id} ${sel}`).toBe(0);
      }
      expect(motionMarks(still.container), id).toBe(0);
      expect(still.container.querySelector('svg[role="img"]'), id).not.toBeNull();
      cleanup();
    }
  });

  it("each motion:true component renders some motion when reducedMotion is false", () => {
    for (const id of REGISTERED_VISUAL_IDS) {
      const entry = resolveVisual(id)!;
      if (!entry.motion) continue;
      const Comp = entry.component;
      const moving = render(<Comp ariaLabel="x" reducedMotion={false} />);
      expect(motionMarks(moving.container), id).toBeGreaterThan(0);
      cleanup();
    }
  });
});
