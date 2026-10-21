// UX-R9a — the teacher's learning library, course home, library search and «قراءة صفوفي» in the reference look
// (docs/enterprise-ux-r0-redesign-foundation.md R9a). Presentation only: markup, roles, names and behaviour are pinned by the
// L.0–L.4 / 21E L1 / L3-B suites and learning.css by learning.layout.guards; these guards pin the R9a block appended at the end of
// each of the three library sheets — last in its sheet (it wins by order), free of stacking contexts, transitions, colour literals
// and physical sides — and keep the shared Reader search sheet (learning-search.css) out of it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), "src", "learning", ...p), "utf8");
/** The UX-R9a block of a sheet (from its marker to the end), comments stripped, plus a `rule(sel)` reader for it. */
const r9a = (src: string) => {
  const at = src.indexOf("/* UX-R9a");
  expect(at, "UX-R9a block").toBeGreaterThan(-1);
  const block = src.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = (sel: string, gap = " ") => {
    const i = block.indexOf("\n" + sel + gap + "{");
    expect(i, "rule " + sel).toBeGreaterThan(-1);
    return block.slice(i + sel.length + gap.length + 2, block.indexOf("}", i));
  };
  return { at, block, rule };
};
const premiumSrc = read("learning-library-premium.css");
const searchSrc = read("search", "learning-library-search.css");
const readingSrc = read("classReading", "class-reading.css");
const premium = r9a(premiumSrc), search = r9a(searchSrc), reading = r9a(readingSrc);

describe("UX-R9a — the blocks themselves", () => {
  it("each is the last thing in its sheet and appears once", () => {
    for (const [src, b] of [[premiumSrc, premium], [searchSrc, search], [readingSrc, reading]] as const) {
      expect(src.indexOf("UX-R9a")).toBe(src.lastIndexOf("UX-R9a"));
      expect(src.slice(b.at)).not.toMatch(/@media/);
    }
  });

  it("add no stacking context, no transition, no colour literal and no physical side", () => {
    for (const { block } of [premium, search, reading]) {
      expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
      expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
      expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
    }
  });

  it("leave learning.css (pinned by the layout guards) and the shared Reader search sheet untouched", () => {
    expect(read("learning.css")).not.toContain("UX-R9a");
    expect(read("search", "learning-search.css")).not.toContain("UX-R9a");
    for (const sel of search.block.match(/^[^{\n]+(?=\{)/gm) || []) expect(sel.trim()).toMatch(/^\.eb-lm-/);
  });
});

describe("UX-R9a — the library", () => {
  it("the page header sits on the page (no hero card) and the count is a quiet grey tag", () => {
    expect(premium.rule(".eb-lm-library-hero")).toBe(" padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; ");
    expect(premium.rule(".eb-lm-library-count")).toBe(" background: var(--eb-chrome-active); color: var(--eb-text-heading); border-color: transparent; ");
  });

  it("the course card is a flat 8 px hairline card, also on hover", () => {
    expect(premium.rule(".eb-lm-premium-library .eb-lm-card")).toBe(" border-color: var(--eb-line); border-radius: var(--eb-r); box-shadow: none; ");
    expect(premium.rule(".eb-lm-premium-library .eb-lm-card:hover")).toBe(" border-color: var(--eb-line-2); box-shadow: none; ");
  });

  it("the filters are quiet 6 px selects and the search block a flat 8 px panel with a shadowless field (focus ring kept)", () => {
    expect(search.rule(".eb-lm-filter-select")).toBe(" border-color: var(--eb-line-2); border-radius: var(--eb-r-sm); ");
    expect(search.rule(".eb-lm-search")).toBe(" border-radius: var(--eb-r); box-shadow: none; ");
    expect(search.rule(".eb-lm-search .eb-search-box:not(:focus-within)")).toBe(" box-shadow: none; ");
  });
});

describe("UX-R9a — the course home", () => {
  it("the sections are ONE hairline card of rows (≥ 44 px, split by hairlines), not a stack of cards", () => {
    expect(premium.rule(".eb-lm-overview .eb-lm-batch-list")).toBe(" gap: 0; background: var(--eb-surface); border: 1px solid var(--eb-line); border-radius: var(--eb-r); overflow: hidden; ");
    expect(premium.rule(".eb-lm-overview .eb-lm-batch")).toBe(" border: 0; border-block-start: 1px solid var(--eb-line); border-radius: 0; ");
    expect(premium.rule(".eb-lm-overview .eb-lm-batch:first-child")).toBe(" border-block-start: 0; ");
    expect(premium.rule(".eb-lm-overview .eb-lm-batch-open")).toBe(" min-block-size: 48px; background: transparent; border: 0; border-radius: 0; ");
  });

  it("a row hovers grey (no purple) and its focus ring is drawn inside the clipping card", () => {
    expect(premium.rule(".eb-lm-overview .eb-lm-batch-open:hover")).toBe(" background: var(--eb-chrome-hover); ");
    expect(premium.rule(".eb-lm-overview .eb-lm-batch-open:focus-visible")).toBe(" outline: var(--eb-focus-ring); outline-offset: -2px; ");
  });

  it("«قراءة صفوفي»: the figures are ONE hairline strip whose cells draw their own hairlines; table headers a quiet white band", () => {
    expect(reading.rule(".eb-lm-cr-kpis", "")).toBe(" gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden; ");
    expect(reading.rule(".eb-lm-cr-kpis > div", "")).toBe(" border:0; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line); ");
    expect(reading.rule(".eb-lm-cr-table thead th", "")).toBe(" background:var(--eb-surface); font-size:var(--eb-fs-12); ");
  });
});
