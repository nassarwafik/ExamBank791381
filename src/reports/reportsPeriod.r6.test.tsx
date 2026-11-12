// @vitest-environment happy-dom
//
// Reports R-6 — the assessment reports SAY what their period and dates are (owner decision D-2: the publication date; older
// assessments keep their creation date and the screen says how many). Through the REAL ReportsCenter with a routed fetch mock.
// Pinned:
//   - the class, student and assessments reports show the sentence the server's `periodBasis` calls for, with its count;
//   - nothing is said when the reply carries no basis (an older API), names a criterion this client does not know, or the
//     academic part is withheld — a creation date is never presented as a publication date by the client's own guess;
//   - the exported file names the criterion in its identity; the requests themselves are unchanged (same `from` / `to`).
// TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({ Bar: () => <canvas />, Line: () => <canvas />, Doughnut: () => <canvas /> }));
import ReportsCenter from "./ReportsCenter";

const FILTERS = { ok: true, schoolYears: ["2025-2026"], classes: [{ classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", programCodes: [] }, { classId: "c2", name: "العاشر", schoolYear: "2025-2026", status: "active", programCodes: [] }], projects: [] };
const STUDENTS = [{ studentId: "s1", displayName: "زيد صالح" }, { studentId: "s2", displayName: "بلال عمر" }];
const BASE = "الفترة وتواريخ التقييمات وترتيبها بحسب تاريخ نشر التقييم.";
const OMIT = Symbol("no periodBasis field");
const withBasis = (body: Record<string, unknown>, basis: unknown) => (basis === OMIT ? body : { ...body, periodBasis: basis });
const classReport = (basis: unknown, kpis: unknown = { assignments: 2, averageScore: 80, submissionRate: 100, pendingReview: 0 }) => withBasis({ ok: true, type: "class",
  class: { classId: "c1", name: "الحادي عشر", schoolYear: "2025-2026", status: "active", studentCount: 2 }, kpis,
  insights: kpis ? { assessments: [{ assignmentId: "a1", title: "اختبار", date: "2026-03-10", students: 2, submitted: 2, missing: 0, pendingReview: 0, submissionRate: 100, average: 80 }],
    students: [{ studentId: "s1", displayName: "زيد صالح", average: 90, graded: 1, pending: 0, missing: 0 }, { studentId: "s2", displayName: "بلال عمر", average: 70, graded: 1, pending: 0, missing: 0 }],
    submission: { graded: 2, pending: 0, missing: 0 } } : null, projects: [], withheld: kpis ? [] : ["academic"] }, basis);
const studentReport = (basis: unknown) => withBasis({ ok: true, type: "student", student: { studentId: "s1", displayName: "زيد صالح", classId: "c1", className: "الحادي عشر", schoolYear: "2025-2026" },
  academic: { average: 90, submittedCount: 1, assessmentCount: 1, submissionRate: 100, pendingCount: 0 },
  insights: { assessments: [{ assignmentId: "a1", title: "اختبار", date: "2026-03-10", state: "submitted", percentage: 90, attempts: 1, classAverage: 80 }], submission: { graded: 1, pending: 0, missing: 0 } }, projects: [], withheld: [] }, basis);
const assignmentsReport = (basis: unknown) => withBasis({ ok: true, type: "assignments", class: { classId: "c1", name: "الحادي عشر" }, students: STUDENTS,
  overall: { assessmentCount: 1, participants: 2, pendingReview: 0, average: 80, submissionRate: 100, distribution: { "0-49": 0, "70-89": 1, "90-100": 1 } },
  perAssignment: [{ assignmentId: "a1", title: "اختبار", date: "2026-03-10", students: 2, submitted: 2, missing: 0, pendingReview: 0, zeroScores: 0, submissionRate: 100, average: 80, avgAttempts: 1 }],
  matrix: [{ assignmentId: "a1", title: "اختبار", cells: [{ studentId: "s1", state: "submitted", percentage: 90 }, { studentId: "s2", state: "submitted", percentage: 70 }] }] }, basis);

let calls: string[] = [];
let blobs: Blob[] = [];
let basis: unknown = { criterion: "publishedAt", byCreation: 0 };
let classKpis: unknown;
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
beforeEach(() => {
  calls = []; blobs = []; basis = { criterion: "publishedAt", byCreation: 0 }; classKpis = undefined;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    const type = new URL(url, "http://x").searchParams.get("type");
    return Promise.resolve(json(type === "filters" ? FILTERS : type === "overview" ? { ok: true, type, overview: null } : type === "classStudents" ? { ok: true, students: STUDENTS }
      : type === "class" ? (classKpis === undefined ? classReport(basis) : classReport(basis, classKpis)) : type === "student" ? studentReport(basis) : type === "assignments" ? assignmentsReport(basis) : { ok: false }));
  }) as unknown as typeof fetch;
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = (b: Blob) => { blobs.push(b); return "blob:x"; };
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* no storage */ } });

const filters = () => screen.getByRole("region", { name: "مرشحات التقرير" });
const pick = (label: string, value: string) => fireEvent.change(within(filters()).getByLabelText(label), { target: { value } });
async function open(card: string, heading: string) {
  render(<ReportsCenter token="t" />);
  fireEvent.click(await screen.findByRole("button", { name: "فتح التقرير " + card }));
  await screen.findByRole("heading", { level: 2, name: heading });
  pick("الصف", "c1");
}
const openClass = async () => { await open("تقرير الصف", "تقرير الصف"); await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ }); };
const openAssessments = async () => { await open("التقييمات والواجبات", "التقييمات والواجبات"); await screen.findByRole("heading", { level: 3, name: "الحادي عشر" }); };
async function openStudent() {
  await open("تقرير الطالب", "تقرير الطالب");
  await waitFor(() => expect(within(filters()).getByLabelText("الطالب").querySelectorAll("option").length).toBe(3));
  pick("الطالب", "s1");
  await screen.findByRole("heading", { level: 3, name: "زيد صالح" });
}
const note = () => document.querySelector("[data-period-basis]");
const gets = (type: string) => calls.filter(c => new URL(c, "http://x").searchParams.get("type") === type);

describe("R-6 the reports say what their period and dates are", () => {
  it("class report: the criterion sentence, once, as a note of the report", async () => {
    await openClass();
    expect(note()?.textContent).toBe(BASE);
    expect(note()?.getAttribute("data-period-basis")).toBe("publishedAt");
    expect(document.querySelectorAll("[data-period-basis]")).toHaveLength(1);
    expect(note()?.className).toBe("eb-report-note");                                              // the same quiet note as «آخر محاولة»
  });
  it("student report and assessments report: the same sentence", async () => {
    await openStudent();
    expect(note()?.textContent).toBe(BASE);
    cleanup();
    await openAssessments();
    expect(note()?.textContent).toBe(BASE);
  });
  it("older assessments in the reply: the sentence counts them and says their date is the creation date", async () => {
    basis = { criterion: "publishedAt", byCreation: 2 };
    await openClass();
    expect(note()?.textContent).toBe(BASE + " تقييمان هنا نُشرا قبل بدء تسجيل تاريخ النشر، فتاريخهما تاريخ إنشائهما.");
    cleanup();
    basis = { criterion: "publishedAt", byCreation: 12 };
    await openAssessments();
    expect(note()?.textContent).toBe(BASE + " 12 تقييمًا هنا نُشرت قبل بدء تسجيل تاريخ النشر، فتاريخها تاريخ إنشائها.");
  });
});

describe("R-6 nothing is said that the server did not say", () => {
  it("an older API (no `periodBasis`): no sentence; the report is exactly as it was", async () => {
    basis = OMIT;
    await openClass();
    expect(note()).toBeNull();
    expect(document.body.textContent).not.toContain("تاريخ نشر");
    cleanup();
    await openAssessments();
    expect(note()).toBeNull();
    cleanup();
    await openStudent();
    expect(note()).toBeNull();
  });
  it("a criterion this client does not know is not worded as the publication date", async () => {
    for (const unknown of [{ criterion: "createdAt", byCreation: 0 }, { criterion: "dueAt", byCreation: 1 }, null, "publishedAt"]) {
      basis = unknown;
      await openAssessments();
      expect(note(), JSON.stringify(unknown)).toBeNull();
      expect(document.body.textContent).not.toContain("تاريخ نشر");
      cleanup();
    }
  });
  it("the academic part withheld: no sentence about assessments that were not read", async () => {
    classKpis = null;
    await open("تقرير الصف", "تقرير الصف");
    await screen.findByRole("heading", { level: 3, name: /الحادي عشر/ });
    expect(note()).toBeNull();
  });
});

describe("R-6 the request and the export", () => {
  it("choosing a period sends the same `from` / `to` as before — the server applies them to the publication date", async () => {
    await openAssessments();
    fireEvent.change(within(filters()).getByLabelText("الفترة الزمنية"), { target: { value: "custom" } });
    fireEvent.change(within(filters()).getByLabelText("من"), { target: { value: "2026-03-08" } });
    fireEvent.change(within(filters()).getByLabelText("إلى"), { target: { value: "2026-03-14" } });
    await waitFor(() => expect(gets("assignments").at(-1)).toBe("/api/reports?type=assignments&classId=c1&from=2026-03-08&to=2026-03-14"));
    expect(note()?.textContent).toBe(BASE);
  });
  it("the CSV file names the criterion in its identity, right after the period", async () => {
    basis = { criterion: "publishedAt", byCreation: 1 };
    await openAssessments();
    fireEvent.click(within(screen.getByRole("group", { name: "تصدير التقرير" })).getByRole("button", { name: "تصدير CSV" }));
    const lines = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await new Response(blobs[0]).arrayBuffer())).slice(1).split("\r\n");
    const at = lines.findIndex(l => l.startsWith('"الفترة",'));
    expect(lines[at]).toBe('"الفترة","كل الفترة"');
    expect(lines[at + 1]).toBe('"معيار الفترة","تاريخ نشر التقييم (تقييم واحد هنا نُشر قبل بدء تسجيل تاريخ النشر، فتاريخه تاريخ إنشائه)"');
  });
  it("an older API: the CSV has no such line", async () => {
    basis = OMIT;
    await openAssessments();
    fireEvent.click(within(screen.getByRole("group", { name: "تصدير التقرير" })).getByRole("button", { name: "تصدير CSV" }));
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(new Uint8Array(await new Response(blobs[0]).arrayBuffer()));
    expect(text).not.toContain("معيار الفترة");
  });
});
