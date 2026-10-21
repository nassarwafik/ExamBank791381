// UX-R14 — the student portal in the reference look (docs/enterprise-ux-r0-redesign-foundation.md R14). Presentation only:
// data, priorities, filters, availability, results and grading texts are pinned by the 21E V2 / 9A / 21G / achievement suites,
// and the sheet's scope and token-only rule by StudentPortal.v2.21e; the L.8 gate reads its last coarse-pointer block. These
// guards pin the UX-R14 block at the end of student-portal-v2.css: last in the sheet, scoped, token-only, every status edge and
// tint untouched, and the reference patterns it applies.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const src = readFileSync(path.join(process.cwd(), "src", "student", "student-portal-v2.css"), "utf8");
const block = src.slice(src.lastIndexOf("/*", src.indexOf("UX-R14"))).replace(/\/\*[\s\S]*?\*\//g, "");
/** The declarations of the rule whose selector list is exactly `sel` (at a line start) inside the block. */
const rule = (sel: string) => {
  const m = block.match(new RegExp("\\n" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{"));
  expect(m, "rule " + sel).not.toBeNull();
  const i = block.indexOf(m![0]) + m![0].length;
  return block.slice(i, block.indexOf("}", i)).trim();
};

describe("UX-R14 — the block itself", () => {
  it("is the last thing in the sheet, appears once, and follows the L.8 coarse block without adding one", () => {
    expect(src.indexOf("UX-R14")).toBe(src.lastIndexOf("UX-R14"));
    expect(src.indexOf("UX-R14")).toBeGreaterThan(src.lastIndexOf("@media (pointer: coarse)"));
    expect(block).not.toContain("pointer: coarse");
  });

  it("adds no stacking context, no transition, no colour literal, no physical side", () => {
    expect(block).not.toMatch(/\b(isolation|z-index|filter|contain|will-change|transition|animation|position)\s*:/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(block).not.toMatch(/(margin|padding|border)-(left|right)|\b(left|right)\s*:/);
  });

  it("never restyles a status edge or tint (task states, «الآن» states, today-hero kinds, KPI tones, results)", () => {
    expect(block).not.toMatch(/dash-|is-now|is-review|is-average|is-activeAttempt|is-assignment|is-reader|is-study|is-project|is-empty|is-final|is-pending|eb-sp-kpi-icon|eb-status-badge/);
  });
});

describe("UX-R14 — the page", () => {
  it("the welcome hero is a quiet 8 px hairline card with heading text and a grey code tag (no navy gradient banner)", () => {
    expect(rule(".eb-sp-v2 .eb-sp-identity")).toBe("color:var(--eb-text); background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(".eb-sp-v2 .eb-sp-identity-text h2")).toBe("color:var(--eb-text-heading);");
    expect(rule(".eb-sp-v2 .eb-sp-identity .eb-sp-code")).toBe("background:var(--eb-chrome-active); color:var(--eb-text-heading); border-color:transparent;");
  });

  it("the four figures are ONE hairline strip whose cells draw their own hairlines; a hover never lifts a cell", () => {
    expect(rule(".eb-sp-kpis")).toBe("gap:0; background:var(--eb-surface); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden;");
    expect(rule(".eb-sp-kpi")).toBe("border-color:transparent; border-radius:0; background:transparent; box-shadow:1px 0 0 0 var(--eb-line), 0 1px 0 0 var(--eb-line);");
    expect(rule(".eb-sp-kpi:hover")).toContain("transform:none;");
    expect(rule(".eb-sp-kpi:focus-visible")).toBe("outline-offset:-2px;");
  });

  it("panels, task cards, «الآن» items and the next-step card are flat 8 px cards; the section-title bar is gone", () => {
    expect(rule(".eb-sp-v2 .eb-sp-panel")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(".eb-sp-v2 .eb-sp-panel > .eb-section-header .eb-section-title::before")).toBe("content:none;");
    expect(rule(".eb-sp-v2 .eb-sp-today-hero, .eb-sp-v2 .eb-sp-now-item, .eb-sp-v2 .eb-sp-task")).toBe("border-radius:var(--eb-r); box-shadow:none;");
    expect(rule(".eb-sp-v2 .eb-sp-task:hover")).toBe("box-shadow:none; border-color:var(--eb-line-2);");
  });

  it("the task filter is quiet sub-navigation with a grey pressed pill; each task card's action is quiet, «الآن» keeps its primary", () => {
    expect(rule(".eb-sp-v2 .eb-sp-filters")).toBe("padding:0; border-radius:var(--eb-r-sm); background:transparent;");
    expect(rule('.eb-sp-v2 .eb-sp-filters .eb-chip-button[aria-pressed="true"]')).toBe("background:var(--eb-chrome-active); border-color:transparent; color:var(--eb-text-heading); font-weight:var(--eb-fw-bold);");
    expect(rule(".eb-sp-v2 .eb-sp-task .eb-sp-task-action.eb-button.is-primary")).toBe("background:var(--eb-surface); border-color:var(--eb-line-2); color:var(--eb-text-heading);");
    expect(block).not.toContain("eb-sp-now-action");
  });
});
