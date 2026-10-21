// @vitest-environment happy-dom
//
// UX-R4 — the teacher dashboard in the reference look (docs/enterprise-ux-r0-redesign-foundation.md §3.2). Presentation only:
// the numbers, names, order and drill-downs are pinned by the existing dashboard suites; these tests pin the R4 decisions —
// single-card sections carry their title inside the card, table-only cards run flush, the KPI rows are hairline strips, cards are
// flat 8 px, attention rows are hairline rows with a decorative chevron, the period control is the reference segmented group,
// and the Today hub's tiles are flat.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("react-chartjs-2", () => ({ Line: () => <div />, Doughnut: () => <div />, Bar: () => <div /> }));
import TeacherDashboard from "./TeacherDashboard";

const read = (f: string) => readFileSync(path.join(process.cwd(), "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const dash = read("dashboard-pro.css");
const own = dash.slice(0, dash.indexOf(".analytics-view-tabs{"));             // the dashboard's own part (the shared tabs follow)
const today = read("teacher/teacherToday.css");
/** The declarations of the FIRST rule whose selector list is exactly `sel`. */
const rule = (css: string, sel: string) => {
  const at = css.indexOf("\n" + sel + "{");
  expect(at, "rule " + sel).toBeGreaterThan(-1);
  return css.slice(at + sel.length + 2, css.indexOf("}", at));
};

const NOW = "2026-09-10T08:30:00.000Z";
const trend = (n: number) => ({ assignmentId: "a" + n, classId: "c1", className: "الحادي عشر", title: "واجب " + n, dueAt: NOW, date: NOW, students: 20, submitted: 15, missing: 5, pendingReview: n, completionRate: 75, average: 60 + n * 5, highest: 95, lowest: 40 });
const analytics = { ok: true, generatedAt: NOW, scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
  classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 }],
  kpis: { activeClasses: 1, activeStudents: 20, publishedAssignments: 2, submissions: 30, expectedSubmissions: 40, missingSubmissions: 10, pendingReview: 3, lateSubmissions: 0, completionRate: 75, average: 70, highest: 95, lowest: 40, performanceChange: 2, followUpStudents: 1, neverLogged: 0 },
  submissionStatus: { submitted: 30, missing: 10, pendingReview: 3, late: 0 }, gradeDistribution: [{ label: "90-100", count: 4 }],
  assignmentTrend: [trend(1), trend(2)], classComparison: [], topicAnalytics: [],
  followUp: [{ userId: "u1", displayName: "سارة خالد", identityNumber: "123456789", classId: "c1", className: "الحادي عشر", average: 42, assigned: 2, completed: 1, missing: 1, completionRate: 50, trendDelta: -10, trend: "declining", lastLoginAt: NOW, severity: "high", reasons: ["المعدل منخفض"] }],
  topImprovers: [], insights: [{ tone: "info", title: "معلومة", text: "نص" }], students: [], studentDetail: null };

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function mount() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.startsWith("/api/teacher-analytics") ? analytics : { ok: true, posts: [] };
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  }) as unknown as typeof fetch;
  render(<TeacherDashboard token="t" />);
  await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
}
const sectionOf = (name: string | RegExp) => screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;

describe("UX-R4 — dashboard structure for the reference look", () => {
  it("the four single-card sections ARE the card (title inside); the other sections are not", async () => {
    await mount();
    for (const name of ["متابعة الواجبات", "مؤشرات ذكية للمعلم", /^إنجازات الطلاب الأخيرة/, "تحليل البيانات العامة واستخلاص العبر"])
      expect(sectionOf(name).classList.contains("eb-dash-panel"), String(name)).toBe(true);
    for (const name of ["يحتاج إلى انتباهك", "الاتجاهات والتحليلات", /^طلاب يحتاجون متابعة/])
      expect(sectionOf(name).classList.contains("eb-dash-panel"), String(name)).toBe(false);
    expect(document.querySelectorAll(".eb-dash-panel")).toHaveLength(4);
  });

  it("the two table-only cards run flush; a card with other content keeps its padding", async () => {
    await mount();
    const flush = [...document.querySelectorAll(".analytics-card.is-flush")];
    expect(flush).toHaveLength(2);
    for (const card of flush) expect(card.children.length === 1 && card.firstElementChild?.classList.contains("students-table-wrap")).toBe(true);
    expect(sectionOf(/^طلاب يحتاجون متابعة/).querySelector(".analytics-card:not(.is-flush) .analytics-improvers")).not.toBeNull();
  });
});

describe("UX-R4 — dashboard-pro.css and teacherToday.css", () => {
  it("cards are flat 8 px: no large radius and no card shadow in the dashboard's own rules or the hub's", () => {
    for (const css of [own, today]) {
      expect(css).not.toContain("var(--eb-r-lg)");
      expect(css).not.toMatch(/box-shadow:var\(--eb-sh-(xs|sm)\)/);
    }
    expect(rule(own, ".analytics-card")).toMatch(/border-radius:var\(--eb-r\);[\s\S]*box-shadow:none;/);
    expect(rule(own, ".eb-attention-card")).toMatch(/border-radius:var\(--eb-r\); box-shadow:none;/);
  });

  it("each KPI row is ONE hairline strip whose dividers are the 1 px gap over the hairline colour", () => {
    expect(rule(own, ".eb-dash .eb-dash-kpis .eb-stat-grid")).toBe(" gap:1px; background:var(--eb-line); border:1px solid var(--eb-line); border-radius:var(--eb-r); overflow:hidden; ");
    expect(rule(own, ".eb-dash .eb-dash-kpis .eb-stat-card")).toContain("border-color:transparent; border-radius:0; box-shadow:none; background:var(--eb-surface);");
  });

  it("attention rows: edge to edge, hairline-separated, ≥ 44 px, and the chevron is decoration only (empty content)", () => {
    expect(rule(own, ".eb-attention-card > .eb-attention-list")).toContain("margin-inline:calc(var(--eb-space-5) * -1);");
    expect(rule(own, ".eb-attention-list > li + li")).toContain("border-block-start:1px solid var(--eb-line);");
    const item = rule(own, ".eb-attention-item");
    expect(item).toContain("min-height:44px;");
    expect(item).toContain("border:0; border-radius:0;");
    expect(rule(own, ".eb-attention-item::after")).toMatch(/^ content:""; /);
  });

  it("the period control is the reference segmented group: one border, hairlines between options, grey + bold for the pressed one", () => {
    expect(rule(own, ".analytics-segmented")).toContain("gap:0; padding:0;");
    expect(rule(own, ".analytics-segmented button")).toContain("border-inline-start:1px solid var(--eb-line);");
    expect(rule(own, ".analytics-segmented button.active")).toBe(" background:var(--eb-chrome-active); color:var(--eb-text-heading); font-weight:var(--eb-fw-bold); box-shadow:none; ");
  });

  it("the toolbar sits on the page (no card); tables are quiet (white header, grey hover); insights carry no full tint", () => {
    expect(rule(own, ".eb-dash-toolbar")).toContain("padding:0; background:transparent; border:0; border-radius:0; box-shadow:none;");
    expect(rule(own, ".analytics-table th")).toContain("background:var(--eb-surface);");
    expect(rule(own, ".analytics-table tbody tr:hover")).toContain("background:var(--eb-surface-2);");
    expect(rule(own, ".analytics-insight.success,.analytics-insight.warning,.analytics-insight.info")).toContain("background:transparent;");
  });

  it("the shared view tabs keep their look with tokens of the same value (no colour literal left in the file)", () => {
    expect(dash).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(dash).toContain(".analytics-view-tab:not(.active) .analytics-view-tab-badge{ background:var(--eb-danger-bg); color:var(--eb-danger-tx); }");
  });

  it("Today hub: flat quick-action tiles with an ink icon on a grey chip, flat recent card, plain rows", () => {
    expect(rule(today, ".eb-today-action-icon")).toContain("background:var(--eb-chrome-active); color:var(--eb-text-heading);");
    expect(rule(today, ".eb-today-recent")).toContain("border-radius:var(--eb-r); box-shadow:none;");
    const row = rule(today, ".eb-today-row");
    expect(row).toContain("min-height:44px;");
    expect(row).not.toContain("background");
  });
});
