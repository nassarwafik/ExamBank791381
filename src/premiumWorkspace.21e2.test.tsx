// @vitest-environment happy-dom
// Phase 21E.2 — premium teacher workspace pass (dashboard, today hub, navigation). Pins the visual contract that the
// Chromium capture (scripts/capture-visual-gate-21e2-workspace.mjs) measures: decorative icons never reach assistive
// technology, accents are straight bars (the old 3px borders bent round the rounded corners), the phone KPI grid, the
// quick-action tile grid and the navigation's active indicator. Values, names and order are unchanged.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen } from "@testing-library/react";
import StatCard from "./ui/StatCard";

afterEach(cleanup);
const css = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (sheet: string, selector: string) => {
  const i = sheet.indexOf(selector + "{") >= 0 ? sheet.indexOf(selector + "{") : sheet.indexOf(selector + " {");
  expect(i, selector + " present").toBeGreaterThanOrEqual(0);
  return sheet.slice(i, sheet.indexOf("}", i) + 1);
};
const phone = (sheet: string, media: string) => { const i = sheet.indexOf(media); expect(i, media).toBeGreaterThanOrEqual(0); return sheet.slice(i); };

describe("StatCard — optional decorative icon", () => {
  it("without an icon the markup is exactly the previous one (label, value, hint; no chip)", () => {
    const { container } = render(<StatCard label="الطلاب الفعّالون" value={38} hint="2 صفوف فعّالة" />);
    const card = container.querySelector("article.eb-stat-card")!;
    expect([...card.children].map(c => c.className)).toEqual(["eb-stat-label", "eb-stat-value", "eb-stat-hint"]);
    expect(card.className).not.toContain("has-icon");
    expect(container.querySelector(".eb-stat-icon")).toBeNull();
  });
  it("with an icon: the chip is aria-hidden, the label stays visible text, value and hint unchanged", () => {
    const { container } = render(<StatCard primary tone="danger" label="بانتظار التصحيح" value={4} hint="من 51 تسليمًا" icon={<svg data-testid="ico" />} />);
    const chip = container.querySelector(".eb-stat-icon")!;
    expect(chip.getAttribute("aria-hidden")).toBe("true");
    expect(chip.querySelector("[data-testid='ico']")).not.toBeNull();
    expect(container.querySelector(".eb-stat-head .eb-stat-label")?.textContent).toBe("بانتظار التصحيح");
    expect(container.querySelector(".eb-stat-value")?.textContent).toBe("4");
    expect(container.querySelector(".eb-stat-hint")?.textContent).toBe("من 51 تسليمًا");
    expect(container.querySelector("article")!.className).toBe("eb-stat-card tone-danger is-primary has-icon");
    expect(screen.getByText("بانتظار التصحيح")).toBeTruthy();
  });
});

describe("straight accent bars (no bent coloured borders)", () => {
  it("StatCard: the accent is a ::before bar along the top edge; no coloured inline-start border remains", () => {
    const ui = css("ui/ui.css");
    const card = rule(ui, ".eb-stat-card");
    expect(card).toMatch(/position: relative; overflow: hidden;/);
    expect(card).not.toMatch(/border-inline-start/);
    expect(rule(ui, ".eb-stat-card::before")).toMatch(/inset-block-start: 0; height: 3px;[\s\S]*background: var\(--eb-stat-accent\)/);
    for (const tone of ["attention", "success", "danger", "info"]) expect(ui).toMatch(new RegExp("\\.eb-stat-card\\.tone-" + tone + " \\{ --eb-stat-accent: var\\(--eb-"));
    expect(ui).not.toMatch(/\.eb-stat-card\.tone-[a-z]+ \{ border-inline-start-color/);
  });
  it("attention cards: a ::before bar clipped by the radius instead of border-block-start", () => {
    const dp = css("dashboard-pro.css");
    const card = rule(dp, ".eb-attention-card");
    expect(card).toMatch(/position:relative; overflow:hidden;/);
    expect(card).not.toMatch(/border-block-start/);
    expect(rule(dp, ".eb-attention-card::before")).toMatch(/height:3px; background:var\(--eb-attention-accent\)/);
    expect(dp).not.toMatch(/\.eb-attention-card\.tone-[a-z]+\{ border-block-start-color/);
  });
});

describe("phone layout of the dashboard KPIs", () => {
  it("headline tiles: two columns on phones; the secondary rows stay one per line despite assignments-pro.css's unscoped 2-column rule", () => {
    const block = phone(css("dashboard-pro.css"), "@media (max-width:767px)");
    expect(block).toContain(".eb-stat-grid.is-primary{ grid-template-columns:repeat(2,minmax(0,1fr));");
    expect(block).toContain(".eb-dash-kpis .eb-stat-grid.is-secondary{ grid-template-columns:minmax(0,1fr); }");
    // the leak this override answers is still there (scoped fix, assignments-pro.css untouched)
    expect(css("assignments-pro.css")).toContain(".eb-assign-stats .eb-stat-grid.is-primary,.eb-stat-grid.is-secondary{ grid-template-columns:repeat(2,minmax(0,1fr)); }");
  });
  it("secondary tiles are compact rows: label and hint at the start, the value at the end", () => {
    const dp = css("dashboard-pro.css");
    expect(rule(dp, ".eb-stat-grid.is-secondary .eb-stat-card")).toMatch(/grid-template-areas:"label value" "hint value"/);
  });
});

describe("today hub quick actions", () => {
  it("are a tile grid: 2 columns, 3 from 768 px, 6 from 1280 px; the 44 px phone target pin is kept", () => {
    const t = css("teacher/teacherToday.css");
    expect(rule(t, ".eb-today-actions")).toMatch(/display:grid; grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    expect(t).toContain("@media (min-width: 768px){ .eb-today-actions{ grid-template-columns:repeat(3,minmax(0,1fr)); } }");
    expect(t).toContain("@media (min-width: 1280px){ .eb-today-actions{ grid-template-columns:repeat(6,minmax(0,1fr)); } }");
    expect(t).toMatch(/\.eb-today-actions \.eb-button\{ min-height:44px; \}/);
  });
});

describe("navigation active state", () => {
  it("keeps the solid fallback, tints with color-mix where supported, and adds an inline-start indicator bar", () => {
    const sh = css("shell.css");
    expect(sh).toContain(".eb-nav-link.is-active { background: var(--eb-primary); color: var(--eb-surface);");
    expect(sh).toMatch(/@supports \(background: color-mix\(in srgb, red 50%, transparent\)\) \{\s*\.eb-nav-link\.is-active \{/);
    expect(rule(sh, ".eb-nav-link.is-active::before")).toMatch(/inset-inline-start: 0;[\s\S]*width: 3px;/);
    expect(rule(sh, ".eb-nav-link")).toMatch(/position: relative;/);
  });
});
