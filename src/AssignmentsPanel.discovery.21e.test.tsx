// @vitest-environment happy-dom
//
// Phase 21E — assignments discovery (status filter + list sort). Drives the REAL AssignmentsPanel with a routed fetch
// mock and pins: the server order is kept until the teacher picks a sort; sorting / filtering are client-side (zero
// requests); the status filter belongs to the SAME master scope as class / archive / search, so the archived view is
// never emptied by it, an open detail never outlives its row, an authoritative mutation that moves a row out of the
// filter closes its detail, and a Today drill always reveals its assignment.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";
import type { AssignmentDrill } from "./assignments/drillTarget";

const CLASSES = [
  { classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" },
  { classId: "c2", name: "العاشر", grade: "10", active: true, status: "active" }
];
const base = { classId: "c1", className: "الحادي عشر", instructions: "x", openAt: "2026-02-01T08:00:00.000Z", questionCount: 5, totalMarks: 100, maxAttempts: 1 };
// Server order is deliberately neither by deadline nor by title.
const A1 = { ...base, assignmentId: "a1", title: "اختبار الكسور", status: "published", dueAt: "2026-03-01T10:00:00.000Z" };
const A2 = { ...base, assignmentId: "a2", title: "واجب الجبر", status: "draft", dueAt: "2026-02-20T10:00:00.000Z" };
const A5 = { ...base, assignmentId: "a5", title: "تمرين الضرب", status: "published", dueAt: "2026-02-10T10:00:00.000Z" };
const A3 = { ...base, assignmentId: "a3", title: "واجب قديم", status: "archived", dueAt: "2026-01-01T10:00:00.000Z", archivedAt: "2026-01-02T00:00:00.000Z", archivedFromStatus: "draft" };
const A4 = { ...base, assignmentId: "a4", classId: "c2", className: "العاشر", title: "اختبار الهندسة", status: "draft", dueAt: "2026-02-15T10:00:00.000Z" };
const STUDENT = { studentId: "s1", studentName: "زيد", studentCode: "P1", attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, attempts: [], latestResult: null };
const STATS = { students: 1, submitted: 0, pendingReview: 0, finalized: 0, notSubmitted: 1, active: 0, average: null, highest: null, lowest: null };

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
const ASSIGNMENTS = [A1, A2, A5, A3, A4];
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: ASSIGNMENTS });
  if (url.startsWith("/api/assignments")) {
    const it = ASSIGNMENTS.find(x => x.assignmentId === body.assignmentId) || A1;
    if (body.action === "setStatus") return json({ ok: true, assignment: { ...it, status: body.status } });
    return json({ ok: true, assignment: it });
  }
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  if (url.startsWith("/api/assignment-results")) return json({ ok: true, stats: STATS, students: [STUDENT] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; vi.spyOn(globalThis, "fetch").mockImplementation(routed as typeof fetch); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(drill: AssignmentDrill | null = null) {
  const view = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} drill={drill} />);
  return { rerenderDrill: (next: AssignmentDrill | null) => view.rerender(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} drill={next} />) };
}
const toolbar = () => screen.getByRole("region", { name: "أدوات الواجبات" });
const statusSelect = () => within(toolbar()).queryByLabelText("تصفية الواجبات حسب الحالة") as HTMLSelectElement | null;
const sortSelect = () => within(toolbar()).getByLabelText("ترتيب الواجبات") as HTMLSelectElement;
const list = () => document.querySelector(".eb-assign-rows") as HTMLElement;
const rowTitles = () => Array.from(list().querySelectorAll(".eb-assign-row-title strong")).map(x => x.textContent);
const rowOf = (title: string) => within(list()).getByText(title).closest(".assignment-row") as HTMLElement;
const detailTitle = () => document.querySelector("#eb-assign-detail-title")?.textContent ?? null;
const requestsSince = (n: number) => calls.slice(n).map(c => c.method + " " + c.url);
async function ready() { await screen.findByText("اختبار الكسور"); }
async function openDetail(title: string) { fireEvent.click(within(rowOf(title)).getByRole("button", { name: "فتح" })); await waitFor(() => expect(detailTitle()).toBe(title)); }

describe("21E assignments discovery — order, sort and status filter", () => {
  it("D1 keeps the server order by default; the sort control starts on «الترتيب الأصلي»", async () => {
    mount(); await ready();
    expect(sortSelect().value).toBe("original");
    expect(statusSelect()!.value).toBe("all");
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر", "تمرين الضرب"]);
    expect([...sortSelect().options].map(o => o.textContent)).toEqual(["الترتيب الأصلي", "موعد التسليم الأقرب", "موعد التسليم الأبعد", "العنوان أبجديًا"]);
  });
  it("D2 deadline / title sorts reorder client-side (zero requests) and «الترتيب الأصلي» restores the server order", async () => {
    mount(); await ready(); const n = calls.length;
    fireEvent.change(sortSelect(), { target: { value: "dueSoon" } });
    expect(rowTitles()).toEqual(["تمرين الضرب", "واجب الجبر", "اختبار الكسور"]);
    fireEvent.change(sortSelect(), { target: { value: "dueLate" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر", "تمرين الضرب"]);
    fireEvent.change(sortSelect(), { target: { value: "title" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "تمرين الضرب", "واجب الجبر"]);
    fireEvent.change(sortSelect(), { target: { value: "original" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "واجب الجبر", "تمرين الضرب"]);
    expect(requestsSince(n)).toEqual([]);
  });
  it("D3 the status filter composes with class + search and is client-side; no match shows «no matches», not «no assignments»", async () => {
    mount(); await ready(); const n = calls.length;
    fireEvent.change(statusSelect()!, { target: { value: "published" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "تمرين الضرب"]);
    fireEvent.change(statusSelect()!, { target: { value: "draft" } });
    expect(rowTitles()).toEqual(["واجب الجبر"]);
    fireEvent.change(within(toolbar()).getByLabelText("الصف"), { target: { value: "" } });
    expect(rowTitles()).toEqual(["واجب الجبر", "اختبار الهندسة"]);
    fireEvent.change(within(toolbar()).getByLabelText("بحث"), { target: { value: "الكسور" } });
    expect(rowTitles()).toEqual([]);
    expect(screen.getByText("لا توجد واجبات مطابقة.")).toBeTruthy();
    expect(screen.queryByText("لا توجد واجبات بعد.")).toBeNull();
    expect(requestsSince(n)).toEqual([]);
  });
  it("D4 the archived view is never emptied by a current-view status filter, and the filter returns with the current view", async () => {
    mount(); await ready();
    fireEvent.change(statusSelect()!, { target: { value: "draft" } });
    fireEvent.click(within(toolbar()).getByRole("button", { name: /^المؤرشفة/ }));
    expect(statusSelect()).toBeNull();
    expect(rowTitles()).toEqual(["واجب قديم"]);
    fireEvent.click(within(toolbar()).getByRole("button", { name: "الواجبات الحالية" }));
    expect(statusSelect()!.value).toBe("draft");
    expect(rowTitles()).toEqual(["واجب الجبر"]);
  });
  it("D5 an open detail never outlives its row: filtering it out closes the detail", async () => {
    mount(); await ready();
    await openDetail("واجب الجبر");
    fireEvent.change(statusSelect()!, { target: { value: "published" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "تمرين الضرب"]);
    expect(detailTitle()).toBeNull();
  });
  it("D6 publishing a draft while «مسودة» is selected moves the row out of the list and closes its detail", async () => {
    mount(); await ready();
    fireEvent.change(statusSelect()!, { target: { value: "draft" } });
    await openDetail("واجب الجبر");
    fireEvent.click(within(rowOf("واجب الجبر")).getByRole("button", { name: "إجراءات الواجب واجب الجبر" }));
    fireEvent.click(within(await screen.findByRole("group", { name: "إجراءات الواجب واجب الجبر" })).getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(rowTitles()).toEqual([]));
    expect(detailTitle()).toBeNull();
    expect(calls.filter(c => c.method === "POST").map(c => c.body.action)).toEqual(["setStatus"]);
  });
  it("D7 a Today drill to a draft while «منشور» is selected resets the status filter so its row is shown with the detail", async () => {
    const { rerenderDrill } = mount(); await ready();
    fireEvent.change(statusSelect()!, { target: { value: "published" } });
    expect(rowTitles()).toEqual(["اختبار الكسور", "تمرين الضرب"]);
    rerenderDrill({ assignmentId: "a2", mode: "pendingReview", seq: 1 });
    await waitFor(() => expect(detailTitle()).toBe("واجب الجبر"));
    expect(statusSelect()!.value).toBe("all");
    expect(rowTitles()).toContain("واجب الجبر");
    expect(rowOf("واجب الجبر").className).toContain("selected");
  });
  it("D8 the controls are labelled native selects inside the toolbar (keyboard operable, no extra request on change)", async () => {
    mount(); await ready();
    expect(statusSelect()!.tagName).toBe("SELECT");
    expect(sortSelect().tagName).toBe("SELECT");
    expect(within(toolbar()).getByText("الحالة")).toBeTruthy();
    expect(within(toolbar()).getByText("ترتيب")).toBeTruthy();
  });
});
