// @vitest-environment happy-dom
// Phase P-5d — the Reports Center shows «لم يبدأوا» (the server's notStartedCount, P-5b rule) where it shows the project's
// other counts: the project report gets its own StatCard and CSV row; the class report's project card gets a badge and a CSV
// row. Only when the server reports one or more — a class where everyone started reads exactly as before.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));

import ReportsCenter from "./ReportsCenter";
import * as csvRows from "./reportCsv";

const TRACKS = [{ trackId: "book", title: "الكتاب" }, { trackId: "packetTracer", title: "Packet Tracer" }];
const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] }], projects: [{ projectCode: "794589", title: "مشروع 794589" }] };
const ANALYTICS = { perStudent: [], stageCompletion: [], buckets: { "0-25": 0, "26-50": 0, "51-75": 0, "76-99": 0, "100": 0 }, weeklyTrend: [], heatmap: { students: [], stages: [], statuses: [] } };
const SUMMARY = { avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 2, studentsReadyForReview: 3, staleCount: 1, studentCount: 24 };
const PROJ = { projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, avgOverall: 55, trackAverages: { book: 70, packetTracer: 40 }, completedCount: 2 };
let extra: { summary?: Record<string, unknown>; project?: Record<string, unknown> } = {};
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
function respond(url: string): Response {
  const type = new URL(url, "http://x").searchParams.get("type");
  if (type === "filters") return json(FILTERS);
  if (type === "project") return json({ ok: true, type, projectCode: "794589", tracks: TRACKS, class: { classId: "c1", name: "الحادي عشر" }, summary: { ...SUMMARY, ...extra.summary }, analytics: ANALYTICS });
  if (type === "class") return json({ ok: true, type, class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 24 }, kpis: { assignments: 3, averageScore: 71, submissionRate: 83 }, projects: [{ ...PROJ, ...extra.project }] });
  return json({ ok: false, error: "x" });
}
let captured: Blob | null = null;
beforeEach(() => {
  extra = {}; captured = null;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => respond(String(input))) as unknown as typeof fetch;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => { captured = b; return "blob:x"; };
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openReport(title: string, project: boolean) {
  render(<ReportsCenter token="t" />);
  await screen.findByRole("group", { name: "تصنيف التقارير" });
  fireEvent.click(screen.getByRole("button", { name: "فتح التقرير " + title }));
  await screen.findByRole("heading", { level: 2, name: title });
  const f = screen.getByRole("region", { name: "مرشحات التقرير" });
  if (project) fireEvent.change(within(f).getByLabelText("المشروع"), { target: { value: "794589" } });
  fireEvent.change(within(f).getByLabelText("الصف"), { target: { value: "c1" } });
  await waitFor(() => expect(document.querySelector(".eb-report-result")).toBeTruthy());
}
const cards = () => Array.from(document.querySelectorAll(".eb-stat-grid .eb-stat-card")).map(c => (c.querySelector(".eb-stat-label")?.textContent || "") + "=" + (c.querySelector(".eb-stat-value")?.textContent || ""));
async function exportedCsv(): Promise<string> {
  fireEvent.click(screen.getByRole("button", { name: /CSV/ }));
  await waitFor(() => expect(captured).toBeTruthy());
  return new TextDecoder().decode(new Uint8Array(await new Response(captured as unknown as Blob).arrayBuffer()));
}

describe("P-5d — project report", () => {
  it("«لم يبدأوا» card (attention) and CSV row when the server reports students who have not started", async () => {
    extra = { summary: { notStartedCount: 5 } };
    await openReport("تقرير المشروع", true);
    expect(cards()).toEqual(["الطلاب=24", "مكتملون=2", "ينتظرون الفحص=3", "بلا تحديث=1", "لم يبدأوا=5"]);
    const card = Array.from(document.querySelectorAll(".eb-stat-card")).find(c => c.querySelector(".eb-stat-label")?.textContent === "لم يبدأوا") as HTMLElement;
    expect(card.className).toContain("tone-attention");
    expect(card.querySelector(".eb-stat-hint")?.textContent).toBe("لم يبدأ أي مرحلة بعد");
    expect(await exportedCsv()).toContain('"لم يبدأوا","5"');
  });
  it("no card and no CSV row when everyone started (the field is absent)", async () => {
    await openReport("تقرير المشروع", true);
    expect(cards()).toEqual(["الطلاب=24", "مكتملون=2", "ينتظرون الفحص=3", "بلا تحديث=1"]);
    expect(await exportedCsv()).not.toContain("لم يبدأوا");
  });
});

describe("P-5d — class report", () => {
  it("the project card carries a «لم يبدأوا N» badge next to «مكتملون N»; absent when zero", async () => {
    extra = { project: { notStartedCount: 4 } };
    await openReport("تقرير الصف", false);
    const section = await screen.findByRole("region", { name: "مشاريع الصف" });
    expect(section.textContent).toContain("مكتملون 2");
    expect(section.textContent).toContain("لم يبدأوا 4");
  });
  it("the class CSV lists «لم يبدأوا» for a project only when the server reports it", () => {
    const base = { class: { name: "ص" }, projects: [{ title: "م", tracks: [], avgOverall: 1, trackAverages: {}, completedCount: 2 }] };
    expect(csvRows.classReportRows([], base).map(r => r.join("|"))).not.toContain("م|لم يبدأوا|4");
    const withCount = { ...base, projects: [{ ...base.projects[0], notStartedCount: 4 }] };
    expect(csvRows.classReportRows([], withCount).map(r => r.join("|"))).toContain("م|لم يبدأوا|4");
  });
});
