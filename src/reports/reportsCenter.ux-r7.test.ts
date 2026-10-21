// UX-R7 — the Reports Center in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R7). Presentation only: the
// catalogue, filters, KPIs, CSV and print are pinned by the ux6b / p5d / r1 / r2 suites and the sidebar-spacing guard; these
// guards pin the R7 rules in reports-pro.css, including the report chart height fix.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "src", "reports-pro.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const phone = css.slice(css.indexOf("@media (max-width:767px){"));
/** The declarations of the FIRST rule whose selector list is exactly `sel` (at a line start). */
const rule = (sel: string, from = css) => {
  const at = from.indexOf("\n" + sel + "{");
  expect(at, "rule " + sel).toBeGreaterThan(-1);
  return from.slice(at + sel.length + 2, from.indexOf("}", at));
};

describe("UX-R7 — report charts have a height of their own (fix)", () => {
  it("the report result owns the chart box heights (260 / 360 px; 220 / 280 px on a phone), independent of projects-pro.css", () => {
    expect(rule(".eb-report-result .eb-chart-canvas")).toBe(" position:relative; height:260px; ");
    expect(rule(".eb-report-result .eb-chart-canvas.is-tall")).toBe(" height:360px; ");
    expect(phone).toContain(".eb-report-result .eb-chart-canvas{ height:220px; }");
    expect(phone).toContain(".eb-report-result .eb-chart-canvas.is-tall{ height:280px; }");
  });
});

describe("UX-R7 — the hub", () => {
  it("the catalogue filter reads as sub-navigation: quiet items, the pressed one a grey pill with bold text", () => {
    expect(rule(".eb-reports-categories .eb-chip-button")).toContain("border-color:transparent; border-radius:var(--eb-r-sm); background:transparent;");
    expect(rule('.eb-reports-categories .eb-chip-button[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); font-weight:var(--eb-fw-bold); ");
  });

  it("each group is ONE hairline card of report rows (≥ 44 px, split by hairlines), not a grid of cards", () => {
    expect(rule(".eb-report-cards")).toContain("display:flex; flex-direction:column; gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    const card = rule(".eb-report-card");
    expect(card).toContain("flex-direction:row;");
    expect(card).toContain("min-height:44px;");
    expect(card).toContain("border:0; border-block-start:1px solid var(--eb-line); border-radius:0; box-shadow:none;");
    expect(rule(".eb-report-card:first-child")).toBe(" border-block-start:0; ");
  });

  it("the row action is quiet (one primary button per row would be eight dark buttons)", () => {
    expect(rule(".eb-report-card .eb-button.is-primary")).toBe(" background:var(--eb-surface); border-color:var(--eb-line-2); color:var(--eb-text-heading); ");
  });
});

describe("UX-R7 — the report", () => {
  it("the KPI figures are ONE hairline strip whose cells draw their own hairlines (no painted empty cells for 5 figures)", () => {
    expect(rule(".eb-report-stats.eb-stat-grid")).toBe(" gap:0; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden; ");
    expect(rule(".eb-report-stats .eb-stat-card")).toBe(" border-color:transparent; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line); ");
  });

  it("cards and tables are flat 8 px; the table header is quiet and stays opaque (sticky)", () => {
    expect(css).not.toContain("var(--eb-r-lg)");
    expect(css).not.toMatch(/box-shadow:var\(--eb-sh-(xs|sm)\)/);
    expect(rule(".eb-report-table thead th")).toBe(" position:sticky; top:0; background:var(--eb-surface); color:var(--eb-muted); font-size:var(--eb-fs-12); font-weight:var(--eb-fw-semibold); ");
  });

  it("the print rules are untouched: controls hidden, the print title shown, the table unclipped", () => {
    const print = css.slice(css.indexOf("@media print{"));
    expect(print).toContain(".eb-report-noprint{ display:none !important; }");
    expect(print).toContain(".eb-report-print-title{ display:block; }");
    expect(print).toContain(".eb-report-table-scroll{ overflow:visible; border:0; }");
  });
});
