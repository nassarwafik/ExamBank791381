// @vitest-environment happy-dom
//
// Phase R-1 — Reports accuracy (docs/reports-center-audit.md, owner decisions D-1 and D-3). Drives the REAL ReportsCenter →
// ReportViews tree over a routed fetch mock and pins: the period list has no «هذه السنة الدراسية» (it was identical to «كل
// الفترة»); a result still awaiting the teacher is shown «بانتظار التصحيح» — never a 0, never colour-only — and is counted in its
// own column / hint; the zero cell follows the server's `zero` flag (the same rule as the «سلّم بعلامة صفر» count); a one-point
// timeline says why there is no trend.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas data-chart="bar" />, Line: () => <canvas data-chart="line" />, Doughnut: () => <canvas data-chart="doughnut" /> }));

import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] }], projects: [{ projectCode: "794589", title: "مشروع 794589" }] };
const TRACKS = [{ trackId: "book", title: "الكتاب" }];
const ASSIGN = {
  ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" },
  students: [{ studentId: "s1", displayName: "زيد" }, { studentId: "s2", displayName: "خالد" }, { studentId: "s3", displayName: "سعد" }, { studentId: "s4", displayName: "ليث" }],
  overall: { assessmentCount: 1, participants: 3, pendingReview: 1, average: 40, submissionRate: 100, distribution: { "0-49": 2, "50-59": 0, "60-69": 0, "70-79": 0, "80-89": 0, "90-100": 0 } },
  perAssignment: [{ assignmentId: "a1", title: "اختبار البرمجة", students: 3, submitted: 3, missing: 0, pendingReview: 1, zeroScores: 1, submissionRate: 100, average: 40, avgAttempts: 1 }],
  matrix: [{ assignmentId: "a1", title: "اختبار البرمجة", cells: [
    { studentId: "s1", state: "pending", percentage: null },
    { studentId: "s2", state: "submitted", percentage: 0, zero: true },
    { studentId: "s3", state: "submitted", percentage: 0.4, zero: false },
    { studentId: "s4", state: "submitted", percentage: 0, zero: false }      // a real score that rounds to 0 % (e.g. 0.1 of 1000 marks)
  ] }]
};
const CLASS = { ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 1, averageScore: 40, submissionRate: 100, pendingReview: 2 }, projects: [] };
const TIMELINE = { ok: true, type: "timeline", projectCode: "794589", tracks: TRACKS, class: { name: "الحادي عشر" }, scope: "class", trend: [{ weekStart: "2026-10-18", avgOverall: 40 }] };

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
function respond(url: string): Response {
  const type = new URL(url, "http://x").searchParams.get("type");
  if (type === "filters") return json(FILTERS);
  if (type === "classStudents") return json({ ok: true, students: [] });
  if (type === "assignments") return json(ASSIGN);
  if (type === "class") return json(CLASS);
  if (type === "timeline") return json(TIMELINE);
  return json({ ok: false });
}
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openReport(title: string) {
  render(<ReportsCenter token="t" />);
  fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + title }));
  await screen.findByRole("heading", { level: 2, name: title });
}
const filters = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(filters()).getByLabelText(label), { target: { value } });

describe("R-1 — period options (D-3)", () => {
  it("offers all / 7 / 30 / custom — no «هذه السنة الدراسية»", async () => {
    await openReport("التقييمات والواجبات");
    const period = within(filters()).getByLabelText("الفترة الزمنية") as HTMLSelectElement;
    expect(Array.from(period.options).map(o => o.value)).toEqual(["all", "7", "30", "custom"]);
    expect(period.textContent).not.toContain("هذه السنة الدراسية");
  });
});

describe("R-1 — a result awaiting the teacher is never shown as a zero (D-1)", () => {
  it("assignments report: pending matrix cell, its own column, the zero cell follows the server's `zero` flag", async () => {
    await openReport("التقييمات والواجبات");
    pick("الصف", "c1");
    const matrix = await waitFor(() => { const m = document.querySelector(".eb-report-matrix") as HTMLElement | null; expect(m).toBeTruthy(); return m!; });
    const row = (name: string) => within(matrix).getByRole("rowheader", { name }).closest("tr") as HTMLElement;
    const cell = (name: string) => row(name).querySelector("td") as HTMLElement;
    expect(cell("زيد").textContent).toBe("بانتظار التصحيح");
    expect(cell("زيد").className).toContain("is-pending");
    expect(cell("خالد").className).toContain("is-zero");
    expect(cell("خالد").textContent).toContain("سلّم بعلامة صفر");
    expect(cell("سعد").className).toContain("is-submitted");                // 0.4 % is a real, non-zero score
    expect(cell("ليث").className).toContain("is-submitted");                // the server, not the rounded percentage, decides «صفر»
    expect(cell("ليث").textContent).not.toContain("سلّم بعلامة صفر");
    expect(matrix.parentElement?.previousElementSibling?.textContent).toContain("بانتظار التصحيح");   // legend explains the state
    const per = screen.getAllByRole("table").find(t => t.querySelector("caption")?.textContent?.startsWith("ملخص كل تقييم")) as HTMLElement;
    const heads = within(per).getAllByRole("columnheader").map(h => h.textContent);
    const at = heads.indexOf("بانتظار التصحيح");
    expect(at).toBeGreaterThan(-1);
    expect(within(per).getAllByRole("row")[1].children[at].textContent).toBe("1");
    expect(document.querySelector(".eb-report-result")?.textContent).toContain("لا تدخل في المتوسط");
  });
  it("class report: the average says how many results awaiting the teacher it leaves out", async () => {
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(document.querySelector(".eb-report-stats")?.textContent).toContain("لا يشمل 2 بانتظار التصحيح");
  });
});

describe("R-1 — a one-point timeline explains itself", () => {
  it("says the range is too short to show a trend", async () => {
    await openReport("التقدم الزمني");
    pick("المشروع", "794589");
    pick("الصف", "c1");
    expect(await screen.findByText(/نقطة واحدة/)).toBeTruthy();
  });
});
