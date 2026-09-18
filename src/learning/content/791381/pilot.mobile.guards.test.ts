/// <reference types="node" />
// Phase 3B — mobile-first + no-PDF-viewer guards (CSS + content assertions). CSS is stubbed under Vitest, so
// stylesheets are read from disk.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import m01 from "./modules/m01";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const activitiesCss = read("../../activities/activities.css");
const readerCss = read("../../reader/reader.css");
const noSpaces = (s: string) => s.replace(/\s+/g, "");

describe("Phase 3B — mobile-first CSS contract", () => {
  it("scope-diagram controls meet the ≥44px touch target and honor reduced-motion", () => {
    const i = activitiesCss.indexOf(".learning-scope-tab{");
    expect(noSpaces(activitiesCss.slice(i, activitiesCss.indexOf("}", i)))).toContain("min-height:44px");
    expect(noSpaces(activitiesCss)).toContain("prefers-reduced-motion:reduce");
    expect(noSpaces(activitiesCss)).toContain('.learning-scope[data-reduced-motion="true"]');
  });
  it("list cards use a responsive auto-fit grid that collapses on small screens (no fixed desktop width)", () => {
    expect(noSpaces(readerCss)).toContain("grid-template-columns:repeat(auto-fit,minmax(200px,1fr))");
    expect(readerCss).not.toMatch(/\.learning-reader-list[^{]*\{[^}]*width:\s*\d{3,}px/);
  });
  it("the unit-opener title scales with the viewport (clamp), never a fixed desktop size", () => {
    const i = readerCss.indexOf(".learning-reader-opener-title{");
    expect(readerCss.slice(i, readerCss.indexOf("}", i))).toContain("clamp(");
  });
});

describe("Phase 3B — native content, not a PDF viewer", () => {
  it("no page embeds the PDF or a full-page screenshot (no iframe / .pdf / one-image-per-page)", () => {
    const json = JSON.stringify(m01);
    expect(json).not.toContain(".pdf");
    expect(json).not.toContain("<iframe");
    expect(json).not.toContain("screenshot");
    // the only image-ish assets would be block type "image"/"diagram"; the pilot uses native blocks instead
    const imageBlocks = m01.lessons.flatMap(l => l.pages).flatMap(p => p.blocks).filter(b => b.type === "image");
    expect(imageBlocks.length).toBe(0);
  });
});
