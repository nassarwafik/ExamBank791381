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
