// @vitest-environment happy-dom
//
// Phase R-4 — the export actions of a report, through the REAL ReportsCenter (owner decision D-4; audit P1-3 and P2-11). Pinned:
//   - three actions, one description: «تصدير CSV», «تصدير Excel» (a real .xlsx), «طباعة / PDF» (the report's own document from a
//     hidden iframe — never window.print of the application page);
//   - the assessments export carries the student × assessment matrix, with words for a non-final cell;
//   - the charts on screen ride along as pictures in the light theme and are left out in the dark theme;
//   - no request is made by any export; a browser that cannot print says so calmly.
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas data-chart="bar" />, Line: () => <canvas data-chart="line" />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
// A picture the test DOM does not finish loading by itself (it decodes a real PNG at once; a browser never does — measured in
// Chromium: `complete` is false right after the document is written), so the waiting path is exercised as a browser runs it.
const LOADING_PNG = "data:image/png;base64," + "A".repeat(96);
const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }, { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [], available: { academic: true, projects: false } };
const ASSIGN_REPORT = { ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" },
  students: [{ studentId: "s1", displayName: "زيد صالح" }, { studentId: "s2", displayName: "خالد عمر" }],
  overall: { assessmentCount: 1, participants: 2, pendingReview: 1, average: 90, submissionRate: 100, distribution: { "0-49": 0, "90-100": 1 } },
  perAssignment: [{ assignmentId: "a1", title: "اختبار الكسور", students: 2, submitted: 2, missing: 0, pendingReview: 1, zeroScores: 0, submissionRate: 100, average: 90, avgAttempts: 1 }],
  matrix: [{ assignmentId: "a1", title: "اختبار الكسور", cells: [{ studentId: "s1", state: "submitted", percentage: 90 }, { studentId: "s2", state: "pending", percentage: null }] }] };

let calls: string[] = [];
let blobs: Blob[] = [];
let downloads: string[] = [];
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
beforeEach(() => {
  calls = []; blobs = []; downloads = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => { const url = String(input); calls.push(url); const type = new URL(url, "http://x").searchParams.get("type"); return Promise.resolve(json(type === "filters" ? FILTERS : type === "overview" ? { ok: true, type, overview: null } : type === "assignments" ? ASSIGN_REPORT : { ok: false })); }) as unknown as typeof fetch;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x"; };
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.documentElement.style.colorScheme = ""; document.querySelectorAll("iframe").forEach(f => f.remove()); });

const openAssessments = async () => { render(<ReportsCenter token="t" />); fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير التقييمات والواجبات" })); await screen.findByRole("heading", { level: 2, name: "التقييمات والواجبات" }); fireEvent.change(within(screen.getByRole("region", { name: "مرشحات التقرير" })).getByLabelText("الصف"), { target: { value: "c1" } }); await screen.findByRole("heading", { level: 3, name: "ملخص كل تقييم" }); };
const exportGroup = () => screen.getByRole("group", { name: "تصدير التقرير" });
/** Makes the next iframe added to the body printable, and returns the print spy and the frame's document text. */
function printable() {
  const print = vi.fn(), frames: HTMLIFrameElement[] = [], append = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(node: T) => { const r = append(node); if ((node as unknown as Element).tagName === "IFRAME") { const f = node as unknown as HTMLIFrameElement; frames.push(f); (f.contentWindow as unknown as { print: () => void }).print = print; } return r; });
  return { print, html: () => frames[0]?.contentDocument?.documentElement.outerHTML || "", images: () => Array.from(frames[0]?.contentDocument?.querySelectorAll("img") || []) };
}

describe("R-4 report export", () => {
  it("three actions in one named group; CSV carries the matrix with words for the cell awaiting correction; the file name carries the class and the day", async () => {
    await openAssessments();
    expect(within(exportGroup()).getAllByRole("button").map(b => b.textContent)).toEqual(["تصدير CSV", "تصدير Excel", "طباعة / PDF"]);
    const n = calls.length;
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "تصدير CSV" }));
    expect(downloads[0]).toMatch(/^TadrisPlus-تقرير-التقييمات-الحادي-عشر-\d{4}-\d{2}-\d{2}\.csv$/);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await new Response(blobs[0]).arrayBuffer())).slice(1).split("\r\n");
    expect(text[0]).toBe('"التقييمات والواجبات — الحادي عشر"');
    expect(text.slice(text.indexOf('"مصفوفة الطالب × التقييم (%)"') + 1)).toEqual(['"الطالب","اختبار الكسور"', '"زيد صالح","90"', '"خالد عمر","بانتظار التصحيح"']);
    expect(calls.length).toBe(n);                                    // built from the loaded report: no request
  });
  it("Excel: a real workbook (ZIP) with the same rows, a right-to-left sheet and the .xlsx name; no request", async () => {
    await openAssessments();
    const n = calls.length;
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "تصدير Excel" }));
    expect(downloads[0]).toMatch(/^TadrisPlus-تقرير-التقييمات-الحادي-عشر-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(blobs[0].type).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const bytes = new Uint8Array(await new Response(blobs[0]).arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);                       // «PK» — a ZIP
    const xml = new TextDecoder().decode(bytes);
    expect(xml).toContain('rightToLeft="1"');
    expect(xml).toContain("<v>90</v>");
    expect(xml).toContain("بانتظار التصحيح");
    expect(calls.length).toBe(n);
  });
  it("«طباعة / PDF» prints the report's own document — identity, every table, the charts as pictures — and never the application page", async () => {
    window.print = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = () => LOADING_PNG;
    await openAssessments();
    const { print, html, images } = printable();
    const n = calls.length;
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));
    // the pictures are not loaded yet when the document is written: printing WAITS for them (else the frames print empty)
    expect(images()).toHaveLength(3);
    expect(print).not.toHaveBeenCalled();
    images().slice(0, 2).forEach(img => img.dispatchEvent(new Event("load")));
    expect(print).not.toHaveBeenCalled();                           // one picture still loading
    images()[2].dispatchEvent(new Event("error"));                  // a picture that fails does not block the print
    expect(print).toHaveBeenCalledTimes(1);
    expect(window.print).not.toHaveBeenCalled();
    const doc = html();
    expect(doc).toContain('dir="rtl"');
    expect(doc).toContain("التقييمات والواجبات — الحادي عشر");
    expect(doc).toContain("<dt>الصف</dt><dd>الحادي عشر</dd>");
    expect(doc).toContain("<dt>الفترة</dt><dd>كل الفترة</dd>");
    for (const title of ["المؤشرات", "ملخص كل تقييم", "توزيع النتائج", "مصفوفة الطالب × التقييم (%)"]) expect(doc).toContain("<h2>" + title + "</h2>");
    expect(doc).toContain("<td>بانتظار التصحيح</td>");
    // the three charts of the report, each under its own title
    expect(doc.match(/<figure>/g)).toHaveLength(3);
    for (const title of ["تطوّر الأداء عبر التقييمات", "حالة التسليم في كل تقييم", "توزيع النتائج"]) expect(doc).toContain("<figcaption>" + title + "</figcaption>");
    expect(doc).not.toMatch(/eb-sidebar|eb-report-filters|<button/);           // nothing of the application's page
    expect(screen.queryByRole("alert")).toBeNull();
    expect(calls.length).toBe(n);
  });
  it("the dark theme: the tables print, the charts are left out (a chart drawn for a dark surface is unreadable on paper)", async () => {
    HTMLCanvasElement.prototype.toDataURL = () => PNG;
    document.documentElement.style.colorScheme = "dark";
    await openAssessments();
    const { print, html } = printable();
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(html()).toContain("<h2>ملخص كل تقييم</h2>");
    expect(html()).not.toContain("<figure>");
  });
  it("a canvas that cannot be read is simply not printed — the tables still are", async () => {
    HTMLCanvasElement.prototype.toDataURL = () => { throw new Error("tainted"); };
    await openAssessments();
    const { print, html } = printable();
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(html()).not.toContain("<figure>");
    expect(html()).toContain("<h2>المؤشرات</h2>");
  });
  it("pictures that never report loading do not hold the print for ever: it starts after the wait at the latest, once", async () => {
    HTMLCanvasElement.prototype.toDataURL = () => LOADING_PNG;
    await openAssessments();
    const { print, images } = printable();
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));
    expect(print).not.toHaveBeenCalled();
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 3000 });
    images().forEach(img => img.dispatchEvent(new Event("load")));  // late loads do not print a second time
    expect(print).toHaveBeenCalledTimes(1);
  });
  it("pictures that are already loaded print at once (nothing to wait for)", async () => {
    HTMLCanvasElement.prototype.toDataURL = () => PNG;
    await openAssessments();
    const { print, html } = printable();
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(html().match(/<figure>/g)).toHaveLength(3);
  });
  it("a browser that offers no print: a calm message that names the other formats; nothing left behind", async () => {
    await openAssessments();
    fireEvent.click(within(exportGroup()).getByRole("button", { name: "طباعة / PDF" }));     // happy-dom's iframe window has no print()
    expect((await screen.findByRole("alert")).textContent).toBe("تعذر فتح نافذة الطباعة في هذا المتصفح. جرّب تصدير Excel أو CSV.");
    expect(document.querySelector("iframe")).toBeNull();
  });
});
