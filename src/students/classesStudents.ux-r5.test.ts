// UX-R5 — «الصفوف والطلاب» in the reference look, on the owner's U.1 layout (class bar above a full-width roster; owner decision
// 2026-10-21, docs/enterprise-ux-r0-redesign-foundation.md R5). Presentation only: the markup, names and behaviour are pinned by
// the U.1 / U.2 / S.3 / S.4 / hardening suites and the U.1 Chromium gate; these guards pin the R5 decisions in page-parts.css.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const all = readFileSync(path.join(process.cwd(), "src", "page-parts.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const css = all.slice(all.indexOf("\n.eb-students-layout{"));                   // the UX-4 workspace part (literal-free)
const phone = css.slice(css.indexOf("@media (max-width:767px){"));
/** The declarations of the FIRST rule whose selector list is exactly `sel` (at a line start). */
const rule = (sel: string, from = css) => {
  const at = from.indexOf("\n" + sel + "{");
  expect(at, "rule " + sel).toBeGreaterThan(-1);
  return from.slice(at + sel.length + 2, from.indexOf("}", at));
};

describe("UX-R5 — the class bar reads as a sub-navigation (U.1 layout kept)", () => {
  it("class items have no box of their own; the selected class is a grey pill with a bold name, no shadow", () => {
    const row = rule(".eb-class-row");
    expect(row).toContain("border:1px solid transparent; border-radius:var(--eb-r-sm); background:transparent;");
    expect(rule(".eb-class-row:hover")).toBe(" background:var(--eb-surface-2); ");
    expect(rule(".eb-class-row.selected")).toBe(" border-color:transparent; background:var(--eb-chrome-active); box-shadow:none; ");
    expect(rule(".eb-class-row.selected .eb-class-name")).toContain("font-weight:var(--eb-fw-bold);");
  });

  it("the «⋯» of a class item is quiet until hovered or open", () => {
    expect(rule('.eb-class-row .eb-menu-trigger:not(:hover):not([aria-expanded="true"])')).toBe(" border-color:transparent; background:transparent; ");
  });

  it("the U.1 layout is untouched: one column, the bar above the roster", () => {
    expect(rule(".eb-students-layout")).toContain("grid-template-columns:minmax(0,1fr);");
    expect(css).not.toMatch(/\.eb-students-layout\{[^}]*grid-template-columns:\s*\d+px/);
  });
});

describe("UX-R5 — the summary figures are ONE hairline strip", () => {
  it("cells sit on a 1 px gap over the hairline colour inside one bordered 8 px strip", () => {
    expect(rule(".eb-roster-stats")).toBe(" display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:1px; background:var(--eb-line); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden; ");
    const stat = rule(".eb-roster-stat");
    expect(stat).toContain("min-height:44px;");
    expect(stat).toContain("border:0; border-radius:0; background:var(--eb-surface);");
    expect(rule('.eb-roster-stat[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); ");
  });

  it("the tone is a decorative dot before the label (empty content: nothing added to the button's name)", () => {
    expect(rule(".eb-roster-stat-label::before")).toMatch(/^ content:""; /);
    for (const tone of ["success", "attention", "info"]) expect(css).toContain(".eb-roster-stat.tone-" + tone + " .eb-roster-stat-label::before{");
  });

  it("no wrap that would leave an empty hairline cell: 5 columns down to the phone, 2 there with an odd last figure spanning", () => {
    expect(css).not.toMatch(/\.eb-roster-stats\{\s*grid-template-columns:repeat\(3,/);
    expect(phone).toContain(".eb-roster-stats{ grid-template-columns:repeat(2,minmax(0,1fr)); }");
    expect(phone).toContain(".eb-roster-stat:last-child:nth-child(odd){ grid-column:1 / -1; }");
  });
});

describe("UX-R5 — roster, view switch and cards", () => {
  it("the roster search box fills its field (the R0 §7 phone overflow, 391 > 390 px)", () => {
    expect(rule(".eb-roster-toolbar .eb-search-field input")).toBe(" inline-size:100%; ");
  });

  it("the roster is a flat 8 px card with a quiet white header; workspace cards use the 8 px radius, no card shadow", () => {
    expect(css).toContain(".eb-roster-table-wrap{ border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:auto;");
    expect(rule(".eb-roster-table th")).toContain("background:var(--eb-surface);");
    expect(rule(".eb-roster-table thead .eb-col-actions")).toBe(" z-index:3; background:var(--eb-surface); ");
    expect(css).not.toContain("var(--eb-r-lg)");
    expect(rule(".eb-lm-class-panel")).toContain("border-radius:var(--eb-r); box-shadow:none;");
  });

  it("the view switch is the reference segmented group in this workspace only; the shared base is unchanged for other pages", () => {
    expect(rule(".eb-students-workspace .eb-segmented")).toBe(" gap:0; padding:0; background:var(--eb-surface); border-color:var(--eb-line-2); overflow:hidden; ");
    expect(rule('.eb-students-workspace .eb-segmented > button[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); font-weight:var(--eb-fw-bold); box-shadow:none; ");
    expect(rule('.eb-segmented > button[aria-pressed="true"]')).toBe(" background:var(--eb-surface); color:var(--eb-text-heading); box-shadow:var(--eb-sh-xs); ");
  });
});
