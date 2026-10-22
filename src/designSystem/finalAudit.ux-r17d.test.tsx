// @vitest-environment happy-dom
// UX-R17d — the final audit's fixes and the leftovers R17c recorded (docs/enterprise-ux-r0-redesign-foundation.md R17d). These
// guards pin: every Chart.js canvas is hidden from assistive technology (its ChartCard figure carries the chart's name; Chart.js
// marks the canvas role="img" with no name of its own, axe role-img-alt); every report table and the activity log scroll inside a
// named, focusable region (axe scrollable-region-focusable); the exam title's keyboard focus shows the app's ring; the type scale
// defines the two sizes three titles read; and the classic builder's pressed button no longer renders the old blue tint.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ReportTable } from "../reports/ui";

const read = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), "utf8");
const flat = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

describe("UX-R17d — charts and scrolling regions", () => {
  it("every react-chartjs-2 chart in the app is aria-hidden (the figure around it is the accessible image)", () => {
    const offenders: string[] = []; let seen = 0;
    for (const f of walk(path.join(process.cwd(), "src")).filter(f => f.endsWith(".tsx") && !/\.test\./.test(f))) {
      // up to the element's self-closing "/>" (props may contain ">", e.g. ChartOptions<"line">)
      for (const m of readFileSync(f, "utf8").matchAll(/<(Bar|Line|Doughnut|Pie|Radar|PolarArea|Scatter|Bubble)\s[\s\S]*?\/>/g)) {
        seen++;
        if (!/aria-hidden="true"/.test(m[0])) offenders.push(path.relative(process.cwd(), f) + ": " + m[0].slice(0, 60));
      }
    }
    expect(offenders).toEqual([]);
    expect(seen).toBeGreaterThanOrEqual(12);                       // the dashboard's charts, the projects' six and the reports' two
  });

  it("a report table scrolls inside a named, focusable region", () => {
    render(<ReportTable caption="جدول التجربة" columns={[{ key: "name", label: "الاسم" }, { key: "v", label: "القيمة", numeric: true }]} rows={[{ name: "أحمد", v: 5 }]} />);
    const region = screen.getByRole("region", { name: "جدول التجربة" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.querySelector("table")).not.toBeNull();
  });

  it("the student × assessment matrix and the activity log scroll inside named, focusable regions", () => {
    expect(read("src", "reports", "ReportViews.tsx")).toContain('<div className="eb-report-table-scroll" role="region" aria-labelledby="eb-report-matrix-title" tabIndex={0}>');
    expect(read("src", "AuditHistoryPanel.tsx")).toContain('<div className="students-table-wrap" role="region" aria-label="جدول سجل النشاط" tabIndex={0}>');
  });
});

describe("UX-R17d — focus, sizes and the leftovers", () => {
  it("the exam title's keyboard focus shows the app's ring", () => {
    expect(flat(read("src", "studio", "studio.css"))).toContain(".st-studio .st-title-input:focus-visible { outline: var(--eb-focus-ring); outline-offset: var(--eb-focus-offset);");
  });

  it("the type scale defines 15 px and 18 px, which three titles read", () => {
    const tokens = flat(read("src", "design-tokens.css"));
    expect(tokens).toContain("--eb-fs-15: 15px;");
    expect(tokens).toContain("--eb-fs-18: 18px;");
    expect(read("src", "projects", "performance.css")).toMatch(/\.eb-eval-title\{[^}]*font-size:var\(--eb-fs-15\)/);
  });

  it("no text is dimmed below AA by opacity: the unset reaction group dims its particles only; the archived avatar is greyscale only", () => {
    const rxn = flat(read("src", "chemistryReactions", "rxn.css"));
    expect(rxn).toContain(".rxn-group.is-unset { border-style: dashed; }");
    expect(rxn).toContain(".rxn-group.is-unset .rxn-copies { opacity: 0.55; }");
    expect(rxn).not.toMatch(/\.rxn-group\.is-unset \{[^}]*opacity/);
    const msg = flat(read("src", "messages", "messages.css"));
    expect(msg).toContain(".eb-msg-roster-item.is-archived .eb-msg-avatar,.eb-msg-roster-item.is-disabled .eb-msg-avatar{ filter:grayscale(1); }");
  });

  it("the classic builder's pressed button takes the primary tint, not the old blue", () => {
    const sb = flat(read("src", "structured-builder.css"));
    expect(sb).toContain(".sb-btn.is-active{background:var(--eb-primary-100);");
    expect(sb.toLowerCase()).not.toContain("#e8effc");
  });
});
