import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Phase 21H.5 — the dashboard's visual and accessibility gate (axe-core 4.10.2 + overflow + touch targets at 390 / 834 touch and
// 1180 / 1440 fine pointer: 16 / 16 clean). These guards pin what the gate fixed, so it cannot silently regress:
//   - Chart.js marks each canvas role="img" with no name of its own; the ChartCard figure around it carries the name, so every
//     canvas is aria-hidden (axe role-img-alt);
//   - on a coarse pointer every dashboard and hub control is at least 44 px tall (table links 44 × 44);
//   - the hub grid has readable columns of equal height.
const read = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
const block = (css: string, marker: string) => { const i = css.indexOf(marker); expect(i).toBeGreaterThan(-1); return css.slice(i, css.indexOf("\n}\n", i) + 3); };

describe("21H.5 dashboard gate guards", () => {
  it("every chart canvas is aria-hidden (the ChartCard figure carries the name)", () => {
    const src = read("TeacherDashboard.tsx");
    const charts = src.match(/<(Line|Doughnut|Bar) data=\{data\} options=\{options\}[^>]*\/>/g) || [];
    expect(charts.length).toBe(5);
    for (const c of charts) expect(c).toContain('aria-hidden="true"');
    expect(read("ui/ChartCard.tsx")).toMatch(/role="img" aria-label=\{ariaLabel \|\| title\}/);
  });

  it("coarse pointer: dashboard controls, table links and the hub's controls are at least 44 px", () => {
    const dash = block(read("dashboard-pro.css"), "/* Phase 21H.5 — touch targets");
    expect(dash).toContain("@media (pointer: coarse)");
    for (const sel of [".eb-dash-toolbar :is(button, select)", ".analytics-segmented button", ".eb-chart-picker-item", ".eb-attention-item", ".eb-dash .eb-chart-card .eb-button"]) expect(dash).toContain(sel);
    expect(dash).toMatch(/\.analytics-link\{ display:inline-flex; align-items:center; min-height:44px; min-width:44px; \}/);
    const hub = block(read("teacher/teacherToday.css"), "/* Phase 21H.5 — on a coarse pointer");
    for (const sel of [".eb-today-row-action", ".eb-today-row-secondary", ".eb-today-card-action", ".eb-today-teacher .eb-button"]) expect(hub).toContain(sel);
    expect(hub).toContain("min-height:44px");
  });

  it("the hub grid: auto-fill columns of at least 260 px, equal heights per row; a row's action wraps under it", () => {
    const css = read("teacher/teacherToday.css");
    expect(css).toContain(".eb-today-grid{ grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); align-items:stretch; }");
    expect(css).toContain(".eb-today-row-item.has-action, .eb-today-row.has-action{ flex-wrap:wrap; }");
  });
});
