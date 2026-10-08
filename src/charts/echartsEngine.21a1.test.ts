// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mountChartEngine } from "./echartsEngine";
import { buildEngineOption } from "./echartsAdapter";
import { defaultChartTokens } from "./chartTheme";
import { validateChartSpec } from "./chartSpec";
import { rainfallBar } from "./testing/chartFixtures";

// Phase 21A.1 — Review Fix 1 (B-1), the REAL engine module (the rendering library, SVG renderer): the drawn SVG carries a viewBox equal to its
// drawing size after every mount / update / resize, so the print stylesheet can scale the picture to the printed column; resize(width) draws
// at that width (print) and resize() follows the container again.
describe("21A1-RB1 the engine's SVG is scalable", () => {
  it("viewBox = drawing size after mount, after resize(PRINT) and after resize() back to the container", () => {
    const r = validateChartSpec(rainfallBar());
    if (!r.ok) throw new Error("fixture");
    const el = document.createElement("div");
    el.style.width = "900px";
    el.style.height = "340px";
    document.body.appendChild(el);
    const option = buildEngineOption(r.value, { tokens: defaultChartTokens(), animation: "none", compact: false });
    const h = mountChartEngine(el, option, () => {});
    const svg = () => el.querySelector("svg")!;
    const box = () => [svg().getAttribute("width"), svg().getAttribute("height"), svg().getAttribute("viewBox")];
    expect(box()).toEqual(["900", "340", "0 0 900 340"]);
    h.resize(640);
    expect(box()).toEqual(["640", "340", "0 0 640 340"]);
    h.update(option);
    expect(box()).toEqual(["640", "340", "0 0 640 340"]);
    h.resize();
    expect(box()).toEqual(["900", "340", "0 0 900 340"]);
    expect(svg().getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    h.dispose();
    el.remove();
  });
});

// Review Fix 2 (N-1): the engine repaints on its NEXT animation frame, and printing lays the page out before one runs — resize(width) alone
// leaves the picture drawn for the old width inside the new box. flush() paints now.
describe("21A1-RB1c flush() paints the print width now", () => {
  it("after resize(640) the drawing still reaches past 640 until flush(); after flush() everything is inside 640, and back after resize()", () => {
    const r = validateChartSpec(rainfallBar());
    if (!r.ok) throw new Error("fixture");
    const el = document.createElement("div");
    el.style.width = "900px";
    el.style.height = "340px";
    document.body.appendChild(el);
    const h = mountChartEngine(el, buildEngineOption(r.value, { tokens: defaultChartTokens(), animation: "none", compact: false }), () => {});
    // the right-most x the picture draws at: text anchors and path vertices
    const right = () => {
      const xs: number[] = [];
      el.querySelectorAll("text").forEach(t => { const m = /translate\(([-\d.]+)/.exec(t.getAttribute("transform") ?? ""); if (m) xs.push(Number(m[1])); });
      el.querySelectorAll("path").forEach(p => { for (const m of (p.getAttribute("d") ?? "").matchAll(/[ML]([-\d.]+)\s/g)) xs.push(Number(m[1])); });
      return Math.max(...xs);
    };
    expect(right()).toBeGreaterThan(640);
    h.resize(640);
    expect(right()).toBeGreaterThan(640);                                            // the box changed; the picture has not been repainted
    h.flush();
    expect(right()).toBeLessThanOrEqual(640);
    h.resize();
    h.flush();
    expect(right()).toBeGreaterThan(640);
    h.resize(640, 300);                                                              // review fix 3: an explicit height, never the print box
    expect([el.querySelector("svg")!.getAttribute("width"), el.querySelector("svg")!.getAttribute("height")]).toEqual(["640", "300"]);
    h.resize();                                                                      // after printing: the container's width AND height again
    expect([el.querySelector("svg")!.getAttribute("width"), el.querySelector("svg")!.getAttribute("height")]).toEqual(["900", "340"]);
    h.dispose();
    h.flush();                                                                       // a disposed engine ignores it
    el.remove();
  });
});

// Review Fix 4 (B4-3): value labels that would overlap are hidden by the rendering library's label layout (installed by its core) through
// the adapter's `labelLayout: { hideOverlap: true }` — the real engine draws a few of 30 dense labels, all 30 without it.
describe("21A1-RB23b the engine hides value labels that would overlap", () => {
  it("30 seven-digit value labels on a 300 px stage: fewer drawn than there are values, and at least one drawn", () => {
    const r = validateChartSpec({ version: 1, id: "dense", kind: "bar", title: "ت", description: "كثيف", valueLabels: true,
      categories: Array.from({ length: 30 }, (_, i) => ({ id: "c" + i, label: "ي" + (i + 1) })), series: [{ id: "s", label: "س", values: Array.from({ length: 30 }, (_, i) => 1234567 + i) }] });
    if (!r.ok) throw new Error("fixture");
    const el = document.createElement("div");
    el.style.width = "300px";
    el.style.height = "320px";
    document.body.appendChild(el);
    const h = mountChartEngine(el, buildEngineOption(r.value, { tokens: defaultChartTokens(), animation: "none", compact: true, width: 300 }), () => {});
    const drawn = [...el.querySelectorAll("text")].filter(t => /^\d{7}$/.test((t.textContent ?? "").replace(/[\u2066-\u2069]/g, ""))).length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(30);
    h.dispose();
    el.remove();
  });
});
