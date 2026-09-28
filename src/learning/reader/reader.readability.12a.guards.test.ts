/// <reference types="node" />
// Phase 12A — READER READABILITY guards (structural assertions on reader.css / visuals.css, read from disk because
// CSS is stubbed under Vitest). The Reader owns ONE typography scale (--eb-read-*): a clearly larger body, a
// comfortable line height, a three-level coloured heading system under the page title, labelled tinted callouts,
// roomier tables and lists, a bounded measure for prose-like blocks on desktop, and presentation mode never smaller
// than the normal Reader. The phone baseline / desktop-block contracts of reader.layout.guards.test.ts still hold.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const css = readFileSync(fileURLToPath(new URL("./reader.css", import.meta.url)), "utf8");
const visuals = readFileSync(fileURLToPath(new URL("../visuals/visuals.css", import.meta.url)), "utf8");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
/** The (first) rule body whose selector list is exactly `selector`, whitespace-stripped. */
function rule(text: string, selector: string): string {
  const i = text.indexOf(selector + "{");
  if (i < 0) return "";
  return noSpaces(text.slice(i + selector.length + 1, text.indexOf("}", i)));
}
function mediaBlock(text: string, query: string): string {
  const start = text.indexOf("@media " + query);
  if (start < 0) return "";
  const open = text.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i); }
  return "";
}
const desktop = mediaBlock(css, "(min-width: 1024px)");
const base = rule(css, ".learning-reader");
const px = (body: string, token: string) => Number(body.match(new RegExp(token.replace(/[-]/g, "\\-") + ":(\\d+)px"))?.[1]);

describe("the Reader typography scale", () => {
  it("is defined ONCE on .learning-reader (phone/tablet) and stepped up in the desktop block; the body is clearly larger than the old 16px", () => {
    expect(px(base, "--eb-read-fs-body")).toBeGreaterThanOrEqual(18);
    expect(px(rule(desktop, ".learning-reader"), "--eb-read-fs-body")).toBeGreaterThan(px(base, "--eb-read-fs-body"));
    expect(base).toContain("--eb-read-lh:1.85");
    expect(px(base, "--eb-read-fs-title")).toBeGreaterThanOrEqual(26);
    expect(px(base, "--eb-read-fs-title-desktop")).toBeGreaterThanOrEqual(32);
    // a strictly descending heading scale under the title, each step ≥ the body
    const [h3, h4, h5, body] = ["--eb-read-fs-h3", "--eb-read-fs-h4", "--eb-read-fs-h5", "--eb-read-fs-body"].map(t => px(base, t));
    expect(h3).toBeGreaterThan(h4); expect(h4).toBeGreaterThan(h5); expect(h5).toBeGreaterThanOrEqual(body);
    expect(px(base, "--eb-read-fs-title")).toBeGreaterThan(h3);
    // tables / code / small text never fall back to the 12–13px of the old scale
    for (const t of ["--eb-read-fs-table", "--eb-read-fs-code", "--eb-read-fs-small"]) expect(px(base, t)).toBeGreaterThanOrEqual(15);
    expect(px(base, "--eb-read-fs-meta")).toBeGreaterThanOrEqual(14);
  });
  it("prose, callouts, examples, lists, tables and code all read from the scale (no hard-coded 12–14px token left on them)", () => {
    const content = [".learning-reader-text", ".learning-reader-callout-body", ".learning-reader-callout-label", ".learning-reader-example-steps",
      ".learning-reader-example-prompt,.learning-reader-example-result", ".learning-reader-list-text", ".learning-reader-list-term", ".learning-reader-table",
      ".learning-reader-code code", ".learning-reader-context", ".learning-reader-kicker", ".learning-reader-source", ".learning-reader-caption",
      ".learning-reader-state-text", ".learning-reader-training-note", ".learning-reader-training-label", ".learning-reader-practice-hint", ".learning-reader-toc-page"];
    for (const sel of content) {
      const body = sel.includes(",") ? noSpaces(css.slice(css.indexOf(sel.replace(/,/g, ", ")), css.indexOf("}", css.indexOf(sel.replace(/,/g, ", "))))) : rule(css, sel);
      expect(body, sel).not.toBe("");
      expect(body, sel).toMatch(/var\(--eb-read-fs-/);
      expect(body, sel).not.toMatch(/--eb-fs-1[2-6]\b/);
    }
    expect(rule(css, ".learning-reader-text")).toContain("line-height:var(--eb-read-lh)");
    expect(rule(css, ".learning-reader-callout-body")).toContain("font-size:var(--eb-read-fs-body)");   // same size as the prose around it
    expect(rule(css, ".learning-reader-blocks")).toContain("gap:var(--eb-read-gap)");
  });
});

describe("visual hierarchy — page title and three heading levels, coloured and distinct (never colour-only)", () => {
  it("the page title carries a primary accent bar; the kicker is coloured; the head has a tinted rule", () => {
    const title = rule(css, ".learning-reader-page-title");
    expect(title).toContain("font-size:var(--eb-read-fs-title)");
    expect(title).toContain("border-inline-start:5pxsolidvar(--eb-read-accent)");
    expect(rule(css, ".learning-reader-kicker")).toContain("color:var(--eb-read-accent-strong)");
    expect(rule(css, ".learning-reader-pagehead")).toContain("border-block-end:2pxsolidvar(--eb-primary-100)");
    expect(rule(desktop, ".learning-reader-page-title")).toContain("font-size:var(--eb-read-fs-title-desktop)");
  });
  it("level 2 = accent bar + primary colour, level 3 = deep-blue with underline, level 4 = navy semibold — different size, colour AND shape", () => {
    const l2 = rule(css, ".learning-reader-heading.is-level-2"), l3 = rule(css, ".learning-reader-heading.is-level-3"), l4 = rule(css, ".learning-reader-heading.is-level-4");
    expect(l2).toContain("font-size:var(--eb-read-fs-h3)"); expect(l2).toContain("color:var(--eb-read-accent-strong)"); expect(l2).toContain("border-inline-start:4pxsolidvar(--eb-read-accent)");
    expect(l3).toContain("font-size:var(--eb-read-fs-h4)"); expect(l3).toContain("color:var(--eb-read-accent-2)"); expect(l3).toContain("border-block-end:2pxsolidvar(--eb-read-accent-2-bg)");
    expect(l4).toContain("font-size:var(--eb-read-fs-h5)"); expect(l4).toContain("color:var(--eb-text-heading)"); expect(l4).toContain("font-weight:var(--eb-fw-semibold)");
    expect(new Set([l2, l3, l4]).size).toBe(3);
    // the accents resolve to real app tokens (no new raw colours)
    expect(base).toContain("--eb-read-accent:var(--eb-primary)");
    expect(base).toContain("--eb-read-accent-2:var(--eb-info-tx)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b(?![^{]*\*\/)/i);   // reader.css declares no raw hex colour (tokens only)
  });
  it("list titles use the sub-heading language; the RTL logical properties are used (no left/right)", () => {
    expect(rule(css, ".learning-reader-list-title")).toContain("color:var(--eb-read-accent-2)");
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/(padding|margin|border)-(left|right)\s*:/);
  });
});

describe("containers — callouts, examples, enrichment, training", () => {
  it("every callout kind has a tint, a 4px accent bar and a label colour of its own; the body is the Reader body size", () => {
    const box = rule(css, ".learning-reader-callout");
    expect(box).toContain("padding:var(--eb-space-4)"); expect(box).toContain("border-inline-start:4pxsolid"); expect(box).toContain("border-radius:var(--eb-r-lg)");
    const labels = ["remember", "important", "warning", "tip"].map(k => rule(css, `.learning-reader-callout.kind-${k} .learning-reader-callout-label`));
    for (const l of labels) expect(l).toMatch(/^color:var\(--eb-(info|primary|warn|success)[-a-z]*\);$/);
    expect(new Set(labels).size).toBe(4);
    for (const k of ["remember", "important", "warning", "tip", "summary"]) expect(rule(css, ".learning-reader-callout.kind-" + k), k).toContain("border-inline-start-color:");
    expect(rule(css, ".learning-reader-callout-label")).toContain("font-size:var(--eb-read-fs-label)");
  });
  it("an example is its own green-accented card, distinct from the blue enrichment surface and from callouts", () => {
    const ex = rule(css, ".learning-reader-example");
    expect(ex).toContain("border-inline-start:4pxsolidvar(--eb-success)"); expect(ex).toContain("padding:var(--eb-space-4)"); expect(ex).toContain("border-radius:var(--eb-r-lg)");
    expect(rule(css, ".learning-reader-example-kicker")).toContain("color:var(--eb-success-tx)");
    expect(rule(css, ".learning-reader-block.is-enrichment")).toContain("border-inline-start:4pxsolidvar(--eb-primary)");
    expect(rule(css, ".learning-reader-block.is-enrichment")).toContain("padding:var(--eb-space-4)");
    expect(rule(css, ".learning-reader-training")).toContain("padding:var(--eb-space-4)");
    expect(rule(css, ".learning-reader-training.is-available")).toContain("border-inline-start-color:var(--eb-primary-strong)");
  });
  it("tables: larger cells, a tinted header row and zebra rows; only the wrapper scrolls (unchanged)", () => {
    expect(rule(css, ".learning-reader-table")).toContain("font-size:var(--eb-read-fs-table)");
    expect(rule(css, ".learning-reader-table th, .learning-reader-table td")).toContain("padding:var(--eb-space-3)var(--eb-space-4)");
    expect(rule(css, ".learning-reader-table th")).toContain("background:var(--eb-primary-050)");
    expect(rule(css, ".learning-reader-table tbody tr:nth-child(even) td")).toContain("background:var(--eb-surface-2)");
    expect(rule(css, ".learning-reader-tablewrap")).toContain("overflow-x:auto");
  });
});

describe("desktop measure and presentation minimums", () => {
  it("on desktop, prose-LIKE blocks get a bounded measure while tables, the cards grid and visuals keep the canvas", () => {
    const capped = noSpaces(desktop).match(/\.learning-reader-callout,\.learning-reader-example,[^{]*\{max-inline-size:var\(--eb-read-measure-wide\);\}/)?.[0] ?? "";
    expect(capped).not.toBe("");
    for (const s of [".learning-reader-callout", ".learning-reader-example", ".learning-reader-practice", ".learning-reader-training", ".learning-reader-list.variant-plain", ".learning-reader-list.variant-checklist", ".learning-reader-list.variant-ordered", ".learning-reader-block.is-enrichment:not(.is-selfframed)"]) expect(capped).toContain(s);
    for (const s of [".learning-reader-tablewrap", ".learning-reader-table", ".variant-cards", ".eb-visual", ".learning-reader-blocks", ".learning-reader-pagebody"]) expect(capped).not.toContain(s);
    expect(base).toContain("--eb-read-measure-wide:92ch");
    expect(rule(desktop, ".learning-reader-text")).toContain("max-inline-size:var(--eb-measure,72ch)");   // the prose measure contract is untouched
  });
  it("presentation mode never reads smaller than the normal Reader (its clamps start at the base sizes)", () => {
    const P = ".learning-reader.is-presentation";
    const min = (body: string) => Number(body.match(/clamp\((\d+)px/)?.[1]);
    expect(min(rule(css, P + " .learning-reader-text"))).toBeGreaterThanOrEqual(px(base, "--eb-read-fs-body"));
    expect(min(rule(css, P + " .learning-reader-heading"))).toBeGreaterThanOrEqual(px(base, "--eb-read-fs-h4"));
    expect(min(rule(css, P + " .learning-reader-page-title"))).toBeGreaterThanOrEqual(px(base, "--eb-read-fs-title"));
    expect(min(rule(css, P + " .learning-reader-code code"))).toBeGreaterThanOrEqual(px(base, "--eb-read-fs-code"));
  });
});

describe("visual figure chrome reads from the same scale", () => {
  it("the figure title / caption use the Reader label / small sizes with safe fallbacks; the figure has roomier padding", () => {
    expect(rule(visuals, ".eb-visual-title")).toContain("font-size:var(--eb-read-fs-label,16px)");
    expect(rule(visuals, ".eb-visual-caption")).toContain("font-size:var(--eb-read-fs-small,15px)");
    expect(rule(visuals, ".eb-visual-figure")).toContain("padding:var(--eb-space-4)");
  });
});
