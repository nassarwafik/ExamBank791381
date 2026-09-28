// @vitest-environment happy-dom
// Phase 12A — SVG visuals on DESKTOP: regression guards for the "works on the phone, not on the computer" report.
//
// The browser audit (headless Chromium at 1920 / 1366 / 768 / 390) found NO desktop-only layout defect — the figure
// frame, the SVG box and both CSS and SMIL motion were identical at every width — and ONE device-dependent path: the
// visuals render a still frame whenever `prefers-reduced-motion: reduce` holds, which desktop OSes set from their
// "animation effects" switch. That is now overridable (motionPreference.ts). These guards pin the sizing contract so a
// future stylesheet change cannot collapse, clip or hide the illustration at desktop widths, and check the rendered
// figure itself is never zero-sized by construction.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import VisualBlockView from "./VisualBlockView";
import type { VisualBlock } from "../content/types";

afterEach(cleanup);
const css = readFileSync(resolve(process.cwd(), "src/learning/visuals/visuals.css"), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
const rule = (selector: string): string => { const i = css.indexOf(selector + "{"); return i < 0 ? "" : noSpaces(css.slice(i + selector.length + 1, css.indexOf("}", i))); };
function mediaBlock(query: string): string {
  const start = css.indexOf("@media " + query);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) { if (css[i] === "{") depth++; else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i); }
  return "";
}

describe("visuals.css — the illustration can never collapse, clip or hide at any width", () => {
  it(".eb-visual is a block that fills its frame up to a cap, keeps its aspect ratio (height:auto) and overflows visibly", () => {
    const v = rule(".eb-visual");
    expect(v).toContain("display:block"); expect(v).toContain("width:100%"); expect(v).toContain("height:auto");
    expect(v).toContain("max-width:min(100%,520px)"); expect(v).toContain("overflow:visible"); expect(v).toContain("min-width:0");
    expect(v).not.toMatch(/(^|;)height:\d/); expect(v).not.toContain("max-height");
  });
  it("on desktop (≥1024px) the cap only GROWS (640px) — the desktop block touches nothing else about the figure", () => {
    const desktop = mediaBlock("(min-width: 1024px)");
    expect(noSpaces(desktop)).toBe(".eb-visual{max-width:640px;}");
    expect(css.match(/@media \(min-width/g)?.length).toBe(1);
  });
  it("no rule in visuals.css hides, clips, contains, absolutely positions or disables pointer events on the figure", () => {
    const flat = noSpaces(css.replace(/\/\*[\s\S]*?\*\//g, ""));
    for (const bad of ["display:none", "visibility:hidden", "overflow:hidden", "max-height", "contain:", "pointer-events:none", "position:absolute", "position:fixed", "height:0", "transform:scale(0)"]) expect(flat, bad).not.toContain(bad);
    const frame = rule(".eb-visual-frame");
    expect(frame).toContain("display:flex"); expect(frame).toContain("width:100%"); expect(frame).not.toMatch(/height:/);
  });
  it("reduced-motion rules only neutralise ANIMATION (never size or visibility), and yield to an explicit device choice of motion ON", () => {
    let blocks = 0;
    for (let at = css.indexOf("@media"); at !== -1; at = css.indexOf("@media", at + 1)) {
      const head = css.slice(at, css.indexOf("{", at));
      if (!/prefers-reduced-motion/.test(head)) continue;
      blocks++;
      const body = noSpaces(mediaBlock(head.replace("@media ", "").trim()));
      expect(body).toMatch(/^[.\w,:()[\]="-]+\{animation:none!important;\}$/);
      // every selector in the block is scoped to "no explicit ON choice" (see ui/motionPreference.ts)
      for (const sel of body.slice(0, body.indexOf("{")).split(",")) expect(sel).toMatch(/^:root:not\(\[data-eb-motion="on"\]\)\.eb-visual-[\w-]+$/);
    }
    expect(blocks).toBe(2);
  });
});

describe("rendered figure — desktop-sized window, motion allowed", () => {
  const block: VisualBlock = { id: "v", type: "visual", origin: "teacher-enrichment", visualId: "791381/ch1/network-connected-devices", alt: "شبكة من أجهزة متصلة", title: "رسم", caption: "شرح", motion: true };
  it("the SVG arrives with a viewBox + preserveAspectRatio, NO width/height attributes (CSS owns the size), inside a visible frame; SMIL is authored", async () => {
    Object.defineProperty(window, "innerWidth", { value: 1920, configurable: true });
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: false, media: "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} });
    const { container } = render(<VisualBlockView block={block} />);
    const svg = await screen.findByRole("img", { name: block.alt });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.hasAttribute("width")).toBe(false); expect(svg.hasAttribute("height")).toBe(false);
    expect(svg.getAttribute("style")).toBeNull();
    expect(svg.classList.contains("eb-visual")).toBe(true);
    const frame = container.querySelector(".eb-visual-frame")!;
    expect(frame.contains(svg)).toBe(true);
    for (const el of [frame, container.querySelector("figure")!]) { expect(el.hasAttribute("hidden")).toBe(false); expect(el.getAttribute("style")).toBeNull(); expect(el.getAttribute("aria-hidden")).toBeNull(); }
    expect(svg.querySelectorAll("animateMotion").length).toBeGreaterThan(0);
  });
});
