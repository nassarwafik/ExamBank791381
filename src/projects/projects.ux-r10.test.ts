// UX-R10 — the projects pages in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R10). Presentation only:
// markup, roles and behaviour are pinned by the P-* / 8B / 8C / 9B–9G / UX-6 suites; these guards pin the UX-R10 block at the end
// of projects-pro.css — last in the sheet, every rule scoped to the projects pages (the chips, segmented groups, stat grids,
// tables and charts are shared with the student portal, the dashboard and the reports), the status colours untouched — and the
// phone view-switch touch-target fix.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const all = readFileSync(path.join(process.cwd(), "src", "projects-pro.css"), "utf8");
const at = all.lastIndexOf("/*", all.indexOf("UX-R10"));
const block = all.slice(at).replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector list is exactly `sel` (at a line start, optionally indented) inside the block. */
const rule = (sel: string) => {
  const m = block.match(new RegExp("\\n\\s*" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = block.indexOf(m![0]) + m![0].length;
  return block.slice(i, block.indexOf("}", i));
};

describe("UX-R10 — the fix: the view switch is a 44 px touch target on a phone", () => {
  it("the last min-height a phone gives the view-switch buttons is at least 44 px (it was 40 px)", () => {
    const heights = [...all.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/\.eb-project-views > button\{[^}]*min-height:(\d+)px/g)].map(m => Number(m[1]));
    expect(heights.length).toBeGreaterThan(0);
    expect(heights[heights.length - 1]).toBeGreaterThanOrEqual(44);
  });
});

describe("UX-R10 — the block itself", () => {
  it("is the last thing in the sheet and appears once", () => {
    expect(all.indexOf("UX-R10")).toBe(all.lastIndexOf("UX-R10"));
    expect(at).toBeGreaterThan(all.lastIndexOf(".eb-review-list-controls .eb-segmented > button{ min-height:44px; }"));
  });

  it("scopes every rule to the projects pages, and never restyles a status colour", () => {
    const sels = (block.match(/^[^{}@\n][^{}\n]*(?=\{)/gm) || []).map(s => s.trim()).filter(Boolean);
    expect(sels.length).toBeGreaterThan(15);
    for (const s of sels) expect(s).toMatch(/^\.eb-projects-hub |^\.eb-project-workspace /);
    expect(block).not.toMatch(/eb-heatmap-cell|eb-heatmap-swatch|eb-stage-row|eb-score-cell|eb-score-legend|eb-eval-|eb-stage-danger-zone|is-evaluation-pending|is-approved|is-ready|is-stale|is-complete/);
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|transform|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|padding-inline-(start|end)|\b(left|right)\s*:/);
  });
});

describe("UX-R10 — the hub and the workspace", () => {
  it("the hub card is a flat 8 px hairline card (also on hover) with a quiet «فتح المشروع»", () => {
    expect(rule(".eb-projects-hub .eb-project-card")).toBe(" border-radius:var(--eb-r); box-shadow:none; ");
    expect(rule(".eb-projects-hub .eb-project-card:hover")).toBe(" border-color:var(--eb-line-2); box-shadow:none; ");
    expect(rule(".eb-projects-hub .eb-project-card-foot .eb-button.is-primary")).toBe(" background:var(--eb-surface); border-color:var(--eb-line-2); color:var(--eb-text-heading); ");
  });

  it("the student card's «فتح ملف الطالب» is quiet too (one dark button per card otherwise)", () => {
    expect(rule(".eb-project-workspace .eb-student-card-foot .eb-button.is-primary")).toBe(" background:var(--eb-surface); border-color:var(--eb-line-2); color:var(--eb-text-heading); ");
  });

  it("the toolbar and the workspace panels are flat 8 px panels without a resting shadow", () => {
    expect(rule(".eb-project-workspace .eb-project-toolbar")).toBe(" border-radius:var(--eb-r); box-shadow:none; ");
    const panels = rule(".eb-project-workspace :is(.eb-project-progress-card, .eb-student-card, .eb-student-profile-summary, .eb-stage-table-wrap, .eb-stage-timeline, .eb-heatmap-card, .eb-stage-settings-bar, .eb-stage-settings-group)");
    expect(panels).toBe(" border-radius:var(--eb-r); box-shadow:none; ");
  });

  it("the switches are the reference segmented group and the filters read as sub-navigation (grey pressed pill)", () => {
    expect(rule(".eb-project-workspace .eb-segmented")).toContain("gap:0; padding:0;");
    expect(rule('.eb-project-workspace .eb-segmented > button[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); font-weight:var(--eb-fw-bold); box-shadow:none; ");
    expect(rule(".eb-project-workspace .eb-chip-button")).toContain("border-color:transparent; border-radius:var(--eb-r-sm); background:transparent;");
    expect(rule('.eb-project-workspace .eb-chip-button[aria-pressed="true"]')).toBe(" background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); font-weight:var(--eb-fw-bold); ");
  });

  it("the headline figures are ONE hairline strip whose cells draw their own hairlines", () => {
    expect(rule(".eb-project-workspace .eb-project-stats.eb-stat-grid")).toBe(" gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden; ");
    expect(rule(".eb-project-workspace .eb-project-stats .eb-stat-card")).toBe(" border-color:transparent; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line); ");
  });

  it("the students table is an 8 px hairline frame with a quiet white header (the sticky header keeps its opaque band)", () => {
    expect(rule(".eb-project-workspace .eb-project-students-table.students-table-wrap")).toBe(" border-color:var(--eb-line); border-radius:var(--eb-r); background:var(--eb-surface); ");
    expect(rule(".eb-project-workspace .eb-project-students-table .students-table thead th")).toBe(" background:var(--eb-surface); color:var(--eb-muted); ");
  });
});
