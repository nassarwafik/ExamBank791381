/// <reference types="node" />
// Phase 3E — mobile-first + native-content guards for Unit 3 (CSS read from disk; content assertions on m07).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import m07 from "./modules/m07";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const readerCss = read("../../reader/reader.css");
const activitiesCss = read("../../activities/activities.css");
const noSpaces = (s: string) => s.replace(/\s+/g, "");
const rule = (css: string, selector: string) => { const i = css.indexOf(selector); return noSpaces(css.slice(i, css.indexOf("}", i))); };

describe("Phase 3E — mobile-first CSS contract for address tables and the octets diagram", () => {
  it("tables scroll inside their own wrapper (never the page) and LTR cells isolate their bidi run", () => {
    expect(rule(readerCss, ".learning-reader-tablewrap{")).toContain("overflow-x:auto");
    expect(rule(readerCss, ".learning-reader-tablewrap{")).toContain("max-width:100%");
    expect(rule(readerCss, '.learning-reader-table td[dir="ltr"]{')).toContain("direction:ltr");
    expect(rule(readerCss, '.learning-reader-table td[dir="ltr"]{')).toContain("unicode-bidi:isolate");
  });
  it("octet buttons are ≥44px touch targets in an LTR row that wraps; focus is visible; reduced motion honoured", () => {
    expect(rule(activitiesCss, ".learning-octets-octet{")).toContain("min-height:44px");
    expect(rule(activitiesCss, ".learning-octets-row{")).toContain("direction:ltr");
    expect(rule(activitiesCss, ".learning-octets-row{")).toContain("flex-wrap:wrap");
    expect(rule(activitiesCss, ".learning-octets-octet:focus-visible")).toContain("outline:2px");
    expect(noSpaces(activitiesCss)).toContain('.learning-octets[data-reduced-motion="true"].learning-octets-octet{transition:none');
    expect(activitiesCss).not.toMatch(/\.learning-octets[^{]*\{[^}]*width:\s*\d{3,}px/);   // no fixed desktop width
  });
});

describe("Phase 3E — native content, not a PDF viewer", () => {
  it("no Unit-3 page embeds the PDF, an iframe, a screenshot or an image; every block is a native semantic block", () => {
    const json = JSON.stringify(m07);
    for (const banned of [".pdf", "<iframe", "screenshot", "http://", "https://"]) expect(json, banned).not.toContain(banned);
    const blocks = m07.lessons.flatMap(l => l.pages).flatMap(p => p.blocks);
    expect(blocks.filter(b => b.type === "image" || b.type === "diagram").length).toBe(0);
    expect(new Set(blocks.map(b => b.type))).toEqual(new Set(["unit-opener", "text", "callout", "list", "table", "interactive-diagram", "guided"]));
  });
});
