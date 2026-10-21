// UX-R6b — the assignment page (overview, gradebook, question analysis) in the reference look (docs/enterprise-ux-r0-redesign-
// foundation.md R6b). Presentation only: grading, status and release logic, markup and names are pinned by the 21G suites; these
// guards pin the R6b block at the end of assignments-pro.css.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const all = readFileSync(path.join(process.cwd(), "src", "assignments-pro.css"), "utf8");
const at = all.indexOf("/* UX-R6b");
const block = all.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the FIRST rule whose selector list is exactly `sel` inside the R6b block. */
const rule = (sel: string) => {
  const i = block.indexOf("\n" + sel + " {");
  expect(i, "rule " + sel).toBeGreaterThan(-1);
  return block.slice(i + sel.length + 3, block.indexOf("}", i));
};

describe("UX-R6b — the block itself", () => {
  it("is the last block of the sheet, after R6a and after the last coarse block", () => {
    expect(at).toBeGreaterThan(all.indexOf("/* UX-R6a"));
    expect(at).toBeGreaterThan(all.lastIndexOf("@media (pointer: coarse)"));
  });

  it("adds no stacking context, no transition, no coarse block, no colour literal, and does not repeat a mutation anchor", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation)\s*:/);
    expect(block).not.toContain("(pointer: coarse)");
    expect(block).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(block).not.toContain("position: sticky");
    expect(block).not.toContain("display: block; inline-size: 100%; min-inline-size: 0; }");
  });

  it("every rule is scoped to the assignment page (.eb-assign-detail): nothing reaches the home, the wizard or other pages", () => {
    const selectors = [...block.matchAll(/(^|\n)\s*([^{}@\n][^{}]*?)\s*\{/g)].map(m => m[2].trim()).filter(s => !s.startsWith("@"));
    expect(selectors.length).toBeGreaterThan(8);
    for (const list of selectors) for (const sel of list.split(",")) expect(sel.trim(), list).toMatch(/^\.eb-assign-detail\b/);
  });
});

describe("UX-R6b — the page", () => {
  it("is a flat 8 px hairline panel (no card shadow, no primary inline-start bar)", () => {
    expect(rule(".eb-assign-detail")).toBe(" border: 1px solid var(--eb-line); border-radius: var(--eb-r); box-shadow: none; ");
  });

  it("headline and analysis figures are ONE hairline strip each; the tiles outrank the legacy tinted `.gradebook-stats article`", () => {
    expect(rule(".eb-assign-detail .eb-assign-stats .eb-stat-grid.is-primary, .eb-assign-detail .eb-item-analysis .eb-stat-grid.is-secondary"))
      .toBe(" margin: 0; gap: 1px; background: var(--eb-line); border: 1px solid var(--eb-line); border-radius: var(--eb-r); overflow: hidden; ");
    expect(rule(".eb-assign-detail .gradebook-stats .eb-stat-card")).toBe(" background: var(--eb-surface); border-color: transparent; border-radius: 0; box-shadow: none; ");
    expect(rule(".eb-assign-detail .gradebook-stats .eb-stat-label")).toContain("color: var(--eb-muted); font-size: var(--eb-fs-13);");
  });

  it("gradebook controls sit on the page; status filters and question sort are sub-navigation with a grey pressed pill", () => {
    expect(rule(".eb-assign-detail .eb-gradebook-controls")).toBe(" padding: 0; background: transparent; border: 0; border-radius: 0; ");
    expect(rule('.eb-assign-detail .gradebook-chip[aria-pressed="true"], .eb-assign-detail .gradebook-chip.active'))
      .toBe(" background: var(--eb-chrome-active); border-color: transparent; color: var(--eb-text-heading); font-weight: var(--eb-fw-bold); ");
  });

  it("quiet tables: white opaque header, grey hover; the selected and drill rows keep their state tint", () => {
    expect(rule(".eb-assign-detail .eb-gradebook-table th, .eb-assign-detail .item-analysis-table th")).toContain("background: var(--eb-surface);");
    expect(rule(".eb-assign-detail .eb-gradebook-table tbody tr:hover td, .eb-assign-detail .item-analysis-table tbody tr:hover td")).toBe(" background: var(--eb-surface-2); ");
    expect(rule(".eb-assign-detail .eb-gradebook-table tbody tr.is-selected td, .eb-assign-detail .eb-gradebook-table tbody tr.is-drill-focus td")).toBe(" background: var(--eb-primary-050); ");
  });

  it("phone: the per-student cards keep their borderless wrapper and the card (not the cell) carries the state", () => {
    const phone = block.slice(block.indexOf("@media (max-width: 767px)"));
    expect(phone).toContain(".eb-assign-detail .eb-gradebook-table-wrap { border: 0; border-radius: 0; }");
    expect(phone).toContain(".eb-assign-detail .eb-gradebook-table tbody tr.is-selected td, .eb-assign-detail .eb-gradebook-table tbody tr.is-drill-focus td { background: transparent; }");
  });
});
