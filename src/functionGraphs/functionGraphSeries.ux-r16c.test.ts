// UX-R16c — the function-graph and chart series colours in the theme's order (docs/enterprise-ux-r0-redesign-foundation.md R16c).
// Presentation only: a graph stores a series INDEX (style.color 1–6) and a chart names a PALETTE, never a colour, so stored question
// data is untouched; what is drawn and graded is pinned by the 21A.1 / 21A.2 suites. These guards pin the new order (the deep purple
// first), that every pair of series stays at least as distinguishable as before for normal, protan, deutan and tritan vision, that
// every series and its label keep AA on the plot, and the neutrals the graph sheets now read from tokens.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHART_PALETTE_COLORS } from "../charts/chartTheme";
import { intersectionGraph } from "./testing/graphFixtures";
import { stackedArea } from "../charts/testing/chartFixtures";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const tokens = strip(read("src", "design-tokens.css"));
const graph = strip(read("src", "functionGraphs", "function-graph.css")), editor = strip(read("src", "functionGraphs", "graph-editor.css"));
const token = (name: string) => tokens.match(new RegExp("--" + name + ":\\s*(#[0-9a-fA-F]{6})"))![1];
const series = () => [1, 2, 3, 4, 5, 6].map(i => { const v = graph.match(new RegExp("--fg-c" + i + ":([^;]+);"))![1].trim(); const ref = v.match(/^var\(--([\w-]+)\)$/); return ref ? token(ref[1]) : v; });

// Colour-vision simulation (Machado, Oliveira & Fernandes 2009, severity 1) and CIE76 ΔE between the simulated colours.
const CVD: Record<string, number[][]> = { normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] };
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lab = ([r, g, b]: number[]) => { const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b; const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const [fx, fy, fz] = [f(X / 0.95047), f(Y), f(Z / 1.08883)]; return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]; };
const sim = (hex: string, m: number[][]) => { const c = [1, 3, 5].map(i => lin(parseInt(hex.slice(i, i + 2), 16))); return m.map(row => Math.min(1, Math.max(0, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))); };
const minDelta = (pal: readonly string[], m: number[][]) => { let min = Infinity; for (let i = 0; i < pal.length; i++) for (let j = i + 1; j < pal.length; j++) { const a = lab(sim(pal[i], m)), b = lab(sim(pal[j], m)); min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])); } return min; };
const luminance = (h: string) => 0.2126 * lin(parseInt(h.slice(1, 3), 16)) + 0.7152 * lin(parseInt(h.slice(3, 5), 16)) + 0.0722 * lin(parseInt(h.slice(5, 7), 16));
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const OLD_GRAPH = ["#1D4ED8", "#B91C1C", "#047857", "#7C3AED", "#C2410C", "#475569"];
const OLD_CATEGORICAL = ["#2563EB", "#C2410C", "#047857", "#B91C1C", "#6D28D9", "#0E7490", "#BE185D", "#4D7C0F"];

describe("UX-R16c — the function-graph series", () => {
  it("take the theme's order: the deep purple first (the --eb-primary-strong token), the former first blue at 4", () => {
    expect(graph).toContain("--fg-c1:var(--eb-primary-strong); --fg-c2:#B91C1C; --fg-c3:#047857; --fg-c4:#1D4ED8; --fg-c5:#C2410C; --fg-c6:#475569;");
    // the six indices still map one-to-one onto their classes (stored style.color 1–6 keep their meaning)
    for (let i = 1; i <= 6; i++) { expect(graph).toContain(".fg-c" + i + "{ stroke:var(--fg-c" + i + "); }"); expect(graph).toContain(".fg-label-c" + i + "{ fill:var(--fg-c" + i + "); }"); }
  });

  it("every pair stays at least as distinguishable as before, for normal, protan, deutan and tritan vision", () => {
    for (const [k, m] of Object.entries(CVD)) expect(minDelta(series(), m), k).toBeGreaterThanOrEqual(minDelta(OLD_GRAPH, m) - 1e-9);
    expect(minDelta(series(), CVD.deutan)).toBeGreaterThan(10);           // was 6.6 with blue and violet side by side
  });

  it("every series and its label keep AA (4.5:1) on the plot", () => {
    for (const c of series()) expect(contrast(c, "#ffffff"), c).toBeGreaterThanOrEqual(4.5);
  });

  it("the plot's neutrals, the selection colour and the review amber read tokens (no slate literal left)", () => {
    expect(graph).toContain(".fg-grid{ stroke:var(--eb-line); stroke-width:1; }");
    expect(graph).toContain(".fg-axis{ stroke:var(--eb-text); stroke-width:1.4; }");
    expect(graph).toContain("--_g-selected:var(--eb-warn-tx);");
    expect(graph).not.toMatch(/#0F172A|#334155|#64748B|#E2E8F0|#94A3B8|#2563eb|rgba\(15,23,42/i);
    // the hues that carry meaning stay: tangent teal, region blue, review green / red, selected amber tint
    for (const h of ["#0F766E", "#0369A1", "#0EA5E9", "#FFFBEB"]) expect(graph).toContain(h);
  });

  it("the graph editor holds no colour literal (errors name the danger tokens, focus the primary)", () => {
    expect(editor).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(/);
    expect(editor).toContain("color:var(--eb-danger-tx);");
    expect(JSON.parse(read("scripts", "ux-color-inventory.baseline.json")).files["src/functionGraphs/graph-editor.css"]).toBeUndefined();
  });
});

describe("UX-R16c — the chart categorical palette", () => {
  it("starts with the deep purple; the blue takes the violet's place; the set of hue families is otherwise the same", () => {
    expect(CHART_PALETTE_COLORS.categorical).toEqual(["#4A2380", "#C2410C", "#047857", "#B91C1C", "#2563EB", "#0E7490", "#BE185D", "#4D7C0F"]);
    expect(CHART_PALETTE_COLORS.categorical[0].toLowerCase()).toBe(token("eb-primary-strong"));
  });

  it("stays at least as distinguishable as before for every vision type", () => {
    for (const [k, m] of Object.entries(CVD)) expect(minDelta(CHART_PALETTE_COLORS.categorical, m), k).toBeGreaterThanOrEqual(minDelta(OLD_CATEGORICAL, m) - 1e-9);
  });
});

describe("UX-R16c — the capture fixture", () => {
  it("scripts/ux-r16c-graph-fixtures.json is exactly the suites' own graph and chart fixtures (no drift)", () => {
    expect(JSON.parse(read("scripts", "ux-r16c-graph-fixtures.json"))).toEqual({ functionGraph: intersectionGraph(), chart: stackedArea() });
  });
});
