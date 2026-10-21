// UX-R6a — the assignments home and the creation wizard in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R6a).
// Presentation only: markup, names and behaviour are pinned by the 21E / 21G suites; these guards pin the R6a block at the end of
// assignments-pro.css — it must come last (it wins by order), stay free of stacking-context properties and transitions, and leave
// the full-width page and the gradebook (R6b) alone.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const all = readFileSync(path.join(process.cwd(), "src", "assignments-pro.css"), "utf8");
const at = all.indexOf("/* UX-R6a");
const block = all.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector list is exactly `sel` inside the R6a block. */
const rule = (sel: string) => {
  const i = block.indexOf("\n" + sel + " {");
  expect(i, "rule " + sel).toBeGreaterThan(-1);
  return block.slice(i + sel.length + 3, block.indexOf("}", i));
};

describe("UX-R6a — the block itself", () => {
  it("is the last thing in the sheet (after the 21G.7 coarse block), so it wins by order", () => {
    expect(at).toBeGreaterThan(all.lastIndexOf("@media (pointer: coarse)"));
    expect(at).toBeGreaterThan(all.indexOf(".eb-assign-detail .students-table-wrap[tabindex]:focus-visible"));
  });

  it("adds no stacking context, no transition, no new coarse block, and never targets the detail page, gradebook or overview", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation)\s*:/);
    expect(block).not.toContain("(pointer: coarse)");
    expect(block).not.toMatch(/\.eb-assign-detail|\.eb-gradebook|\.eb-assign-overview|\.is-page|\.eb-dist-|\.eb-status-bar/);
  });
});

describe("UX-R6a — the home", () => {
  it("the toolbar sits on the page (no card)", () => {
    expect(rule(".eb-assign-toolbar")).toBe(" padding: 0; background: transparent; border: 0; border-radius: 0; box-shadow: none; ");
  });

  it("the headline figures are ONE hairline strip (1 px gap over the hairline colour), tiles keep a transparent 1 px border", () => {
    expect(rule(".eb-assign-kpis .eb-stat-grid.is-primary")).toBe(" gap: 1px; background: var(--eb-line); border: 1px solid var(--eb-line); border-radius: var(--eb-r); overflow: hidden; ");
    expect(rule(".eb-assign-kpis .eb-stat-card")).toBe(" border-color: transparent; border-radius: 0; box-shadow: none; background: var(--eb-surface); ");
  });

  it("view switches are the reference segmented group, scoped to the assignments workspace", () => {
    expect(rule(".eb-assignments .eb-segmented")).toContain("gap: 0; padding: 0;");
    expect(rule('.eb-assignments .eb-segmented > button[aria-pressed="true"]')).toBe(" background: var(--eb-chrome-active); font-weight: var(--eb-fw-bold); box-shadow: none; ");
  });

  it("time filters read as sub-navigation: the pressed one a grey pill with bold text (no purple fill)", () => {
    expect(rule(".eb-filter-chip")).toContain("border-color: transparent; border-radius: var(--eb-r-sm); background: transparent;");
    expect(rule('.eb-filter-chip[aria-pressed="true"]')).toBe(" background: var(--eb-chrome-active); border-color: transparent; color: var(--eb-text-heading); font-weight: var(--eb-fw-bold); ");
  });

  it("the list is ONE hairline card of rows: no card per assignment, rows split by hairlines, the selected row grey", () => {
    expect(rule(".eb-assign-rows")).toBe(" gap: 0; background: var(--eb-surface); border: 1px solid var(--eb-line); border-radius: var(--eb-r); overflow: hidden; ");
    const row = rule(".eb-assign-row");
    expect(row).toContain("border: 0; border-block-start: 1px solid var(--eb-line); border-radius: 0; box-shadow: none;");
    expect(rule(".eb-assign-row:first-child")).toBe(" border-block-start: 0; ");
    expect(rule(".eb-assign-row.selected")).toBe(" background: var(--eb-chrome-active); box-shadow: none; ");
  });

  it("a row is compact: title line, details on one wrapping line, then the time chip and submission bar side by side", () => {
    expect(rule(".eb-assign-row-main")).toContain("flex-direction: row; flex-wrap: wrap;");
    expect(rule(".eb-assign-row-main > .eb-assign-row-title, .eb-assign-row-main > .eb-assign-row-progress")).toBe(" flex-basis: 100%; ");
    expect(rule(".eb-assign-row-progress")).toContain("flex-direction: row; flex-wrap: wrap;");
  });
});

describe("UX-R6a — the wizard", () => {
  it("is a flat 8 px panel without a card shadow", () => {
    expect(rule(".eb-assign-composer")).toBe(" border-color: var(--eb-line); border-radius: var(--eb-r); box-shadow: none; ");
  });
});
