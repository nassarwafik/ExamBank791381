// @vitest-environment happy-dom
//
// Phase R-4 — Reports Center exports (docs/reports-center-audit.md P1-3 / P2-11, owner decision D-4). Through the REAL
// ReportsCenter → ReportViews tree: every report offers CSV, Excel and a print / PDF document built from ONE export model —
// an identity block (report, class, period, generation time) and table sections with real numbers (never «85%» text; a missing
// value is an empty cell, never 0). The assignments report exports the student × assessment matrix and the distribution too.
// Printing goes through printReport (a clean A4 document), never window.print() (which printed the whole app shell).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas data-chart="bar" />, Line: () => <canvas data-chart="line" />, Doughnut: () => <canvas data-chart="doughnut" /> }));
type Printed = { title: string; meta: [string, string][]; sections?: { heading?: string; columns: string[]; rows: (string | number)[][] }[] };
const printed: Printed[] = [];
let printOk = true;
vi.mock("./printReport", async orig => ({ ...(await orig() as object), printReport: (r: Printed) => { printed.push(r); return printOk; } }));

import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: ["794589"] }], projects: [{ projectCode: "794589", title: "مشروع الشبكات" }] };
const ASSIGN = {
  ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" },
  students: [{ studentId: "s1", displayName: "زيد" }, { studentId: "s2", displayName: "خالد" }, { studentId: "s3", displayName: "سعد" }],
  overall: { assessmentCount: 1, participants: 2, pendingReview: 1, average: 66.7, submissionRate: 67, distribution: { "0-49": 0, "50-59": 0, "60-69": 1, "70-79": 0, "80-89": 0, "90-100": 0 } },
  perAssignment: [{ assignmentId: "a1", title: "اختبار البرمجة", students: 3, submitted: 2, missing: 1, pendingReview: 1, zeroScores: 0, submissionRate: 67, average: 66.7, avgAttempts: 1.5 }],
  matrix: [{ assignmentId: "a1", title: "اختبار البرمجة", cells: [
    { studentId: "s1", state: "submitted", percentage: 66.7, zero: false },
    { studentId: "s2", state: "pending", percentage: null },
    { studentId: "s3", state: "missing", percentage: null }
  ] }]
};
const CLASS = { ok: true, type: "class", class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 3 }, kpis: { assignments: 0, averageScore: null, submissionRate: 0, pendingReview: 0 },
  projects: [{ projectCode: "794589", title: "مشروع الشبكات", tracks: [{ trackId: "book", title: "الكتاب" }], avgOverall: 55, trackAverages: { book: 55 }, completedCount: 1, notStartedCount: 2 }] };
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
function respond(url: string): Response {
  const type = new URL(url, "http://x").searchParams.get("type");
  if (type === "filters") return json(FILTERS);
  if (type === "assignments") return json(ASSIGN);
  if (type === "class") return json(CLASS);
  return json({ ok: false });
}
let blobs: Blob[] = [], downloads: string[] = [];
beforeEach(() => {
  printed.length = 0; printOk = true; blobs = []; downloads = [];
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(2026, 9, 20, 9, 5));
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => Promise.resolve(respond(String(input)))) as unknown as typeof fetch;
  URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return "blob:x"; }) as never;
  URL.revokeObjectURL = vi.fn() as never;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
  window.print = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

async function openReport(title: string) {
  render(<ReportsCenter token="t" />);
  fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + title }));
  await screen.findByRole("heading", { level: 2, name: title });
}
const filters = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(filters()).getByLabelText(label), { target: { value } });
const text = async (b: Blob) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await new Response(b).arrayBuffer()));
const csvLines = async (b: Blob) => (await text(b)).replace(/^﻿/, "").split("\r\n");

describe("R-4 — the assignments report exports CSV, Excel and a print document from one model", () => {
  it("CSV: identity block, numeric cells (no «%» text), the matrix with «بانتظار التصحيح» / «لم يسلّم», the distribution", async () => {
    await openReport("التقييمات والواجبات");
    pick("الصف", "c1");
    fireEvent.click(await screen.findByRole("button", { name: "تصدير CSV" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toBe("TadrisPlus-التقييمات-والواجبات-الحادي-عشر-كل-الفترة-2026-10-20.csv");
    const lines = await csvLines(blobs[0]);
    expect(lines[0]).toBe('"التقييمات والواجبات — الحادي عشر"');
    expect(lines).toContain('"الصف","الحادي عشر"');
    expect(lines).toContain('"الفترة","كل الفترة"');
    expect(lines).toContain('"تاريخ الإنشاء","2026-10-20 09:05"');
    expect(lines).toContain('"التقييم","الطلاب","مُسلَّم","لم يسلّم","بانتظار التصحيح","سلّم بعلامة صفر","نسبة التسليم (%)","المتوسط (%)","متوسط المحاولات"');
    expect(lines).toContain('"اختبار البرمجة","3","2","1","1","0","67","66.7","1.5"');
    expect(lines).toContain('"مصفوفة الطالب × التقييم"');
    expect(lines).toContain('"الطالب","اختبار البرمجة"');
    expect(lines).toContain('"زيد","66.7"');
    expect(lines).toContain('"خالد","بانتظار التصحيح"');
    expect(lines).toContain('"سعد","لم يسلّم"');
    expect(lines).toContain('"60-69","1"');
    expect(lines.join("\n")).not.toMatch(/\d%"/);                                    // a number is never «67%» text
  });
  it("Excel: a right-to-left .xlsx of the same rows, numbers as numbers, headers in bold", async () => {
    await openReport("التقييمات والواجبات");
    pick("الصف", "c1");
    fireEvent.click(await screen.findByRole("button", { name: "تصدير Excel" }));
    expect(downloads).toEqual(["TadrisPlus-التقييمات-والواجبات-الحادي-عشر-كل-الفترة-2026-10-20.xlsx"]);
    const zip = await text(blobs[0]);                                                 // STORED zip: the XML parts are plain text
    expect(zip).toContain('rightToLeft="1"');
    expect(zip).toContain("<v>66.7</v>");
    expect(zip).toContain("<v>1.5</v>");
    expect(zip).toMatch(/s="1"[^>]*><is><t xml:space="preserve">مصفوفة الطالب × التقييم</);
    expect(zip).toContain('<sheet name="التقييمات والواجبات"');
  });
  it("print / PDF: a printReport document with the identity block and every section — never window.print()", async () => {
    await openReport("التقييمات والواجبات");
    pick("الصف", "c1");
    fireEvent.click(await screen.findByRole("button", { name: "طباعة / PDF" }));
    expect(window.print).not.toHaveBeenCalled();
    expect(printed).toHaveLength(1);
    const p = printed[0];
    expect(p.title).toBe("التقييمات والواجبات — الحادي عشر");
    expect(p.meta).toEqual(expect.arrayContaining([["الصف", "الحادي عشر"], ["الفترة", "كل الفترة"]]));
    expect((p.sections || []).map(s => s.heading)).toEqual(["المؤشرات", "ملخص كل تقييم", "توزيع النتائج", "مصفوفة الطالب × التقييم"]);
  });
  it("a browser that cannot open the print document says so", async () => {
    printOk = false;
    await openReport("التقييمات والواجبات");
    pick("الصف", "c1");
    fireEvent.click(await screen.findByRole("button", { name: "طباعة / PDF" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("تعذر فتح نافذة الطباعة"));
  });
});

describe("R-4 — the class report: empty for a missing number, the period names its dates", () => {
  it("no average → an empty cell (never 0 or «—»); «آخر 7 أيام» carries its dates; project rows are numbers", async () => {
    await openReport("تقرير الصف");
    pick("الصف", "c1");
    pick("الفترة الزمنية", "7");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    await waitFor(() => expect(screen.getByRole("button", { name: "تصدير CSV" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "تصدير CSV" }));
    const lines = await csvLines(blobs[0]);
    expect(lines).toContain('"الفترة","آخر 7 أيام (2026-10-14 – 2026-10-20)"');
    expect(lines).toContain('"متوسط النتائج (%)",""');
    expect(lines).toContain('"مشروع الشبكات"');
    expect(lines).toContain('"التقدم العام (%)","55"');
    expect(lines).toContain('"الكتاب (%)","55"');
    expect(lines).toContain('"لم يبدأوا","2"');
    expect(lines.slice(1).join("\n")).not.toContain("—");                           // «—» only as the title separator, never a value
    expect(downloads[0]).toBe("TadrisPlus-تقرير-الصف-الحادي-عشر-2026-10-14_2026-10-20-2026-10-20.csv");
  });
});
