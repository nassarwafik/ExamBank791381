// @vitest-environment happy-dom
//
// Phase 21G.3 — the full-width assignment page, through the REAL AssignmentsPanel with a routed fetch mock: opening an assignment
// replaces the list and the KPI strip with its page (the list stays mounted behind it, so «العودة إلى الواجبات» returns focus to
// the opener), the page offers the same action menu as the row, three sections (the gradebook by default), the overview's
// distribution counts FINAL results only, and every section switch is client-side.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const D = 24 * 3600 * 1000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
const base = { classId: "c1", className: "الحادي عشر", questionCount: 5, totalMarks: 10, maxAttempts: 2, durationMinutes: 45 };
const ITEMS = [
  { ...base, assignmentId: "a1", title: "واجب الكسور", instructions: "حل كل الأسئلة.", status: "published", openAt: at(-D), dueAt: at(3 * D) },
  { ...base, assignmentId: "a2", title: "واجب الجبر", instructions: "", status: "published", openAt: at(-D), dueAt: at(5 * D) }
];
const result = (percentage: number, extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: percentage / 10, totalMarks: 10, percentage, submittedAt: at(-3600000), finalized: true, manualReviewMarks: 0, ...extra });
const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ studentId: id, studentName: name, studentCode: "P-" + id, attemptsUsed: 0, allowedAttempts: 2, dueAtOverride: null, attempts: [], latestResult: null, ...extra });
const STUDENTS = [
  row("s1", "سارة", { attemptsUsed: 1, gradingStatus: "final", latestResult: result(85) }),
  row("s2", "أحمد", { attemptsUsed: 1, gradingStatus: "final", latestResult: result(45) }),
  row("s3", "باسل", { attemptsUsed: 1, gradingStatus: "pendingReview", latestResult: result(70, { finalized: false, manualReviewMarks: 3 }) }),
  row("s4", "تالا", { activeAttempt: { attemptNumber: 1, startedAt: at(-60000), endsAt: at(3600000) } }),
  row("s5", "دانة")
];
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return json({ ok: true, progress: [] });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: ITEMS });
  if (url.startsWith("/api/assignments")) { const item = ITEMS.find(x => x.assignmentId === body.assignmentId)!; return json({ ok: true, assignment: { ...item, status: body.status || item.status } }); }
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  if (url.startsWith("/api/assignment-results")) return json({ ok: true, stats: { students: 5, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 2, active: 1, average: 66.7, highest: 85, lowest: 45 }, students: STUDENTS });
  if (url.startsWith("/api/assignment-item-analysis")) return json({ ok: true, assignmentId: "a1", title: "واجب الكسور", studentsInClass: 5, studentsSubmitted: 3, attemptsAnalyzed: 3, questions: [] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() { render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />); await screen.findByText("واجب الكسور"); }
const list = () => document.querySelector(".eb-assign-list") as HTMLElement;
const rowOf = (title: string) => within(document.querySelector(".eb-assign-rows") as HTMLElement).getByText(title).closest(".assignment-row") as HTMLElement;
async function openPage(title = "واجب الكسور") {
  const trigger = within(rowOf(title)).getByRole("button", { name: "فتح" });
  fireEvent.click(trigger);
  const page = await screen.findByRole("region", { name: title });
  await within(page).findByText("سارة");
  return { page, trigger };
}
const sections = (page: HTMLElement) => within(page).getByRole("group", { name: "أقسام الواجب" });
const pressed = (page: HTMLElement) => within(sections(page)).getAllByRole("button").filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.textContent);

describe("21G.3 the full-width assignment page", () => {
  it("replaces the list and the KPI strip; the gradebook is the default section; back returns focus to «فتح»", async () => {
    await mount();
    expect(screen.getByRole("region", { name: "ملخص الواجبات" })).toBeTruthy();
    const { page, trigger } = await openPage();
    expect(list().hidden).toBe(true);
    expect(screen.queryByRole("region", { name: "ملخص الواجبات" })).toBeNull();
    expect(document.querySelector(".eb-assign-layout")?.className).toContain("is-page");
    expect(document.activeElement).toBe(within(page).getByRole("heading", { level: 2, name: "واجب الكسور" }));
    expect(within(sections(page)).getAllByRole("button").map(b => b.textContent)).toEqual(["الطلاب", "نظرة عامة", "تحليل الأسئلة"]);
    expect(pressed(page)).toEqual(["الطلاب"]);
    expect(within(page).getByLabelText("بحث بالاسم أو الكود")).toBeTruthy();                // the gradebook
    fireEvent.click(within(page).getByRole("button", { name: "العودة إلى الواجبات" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "واجب الكسور" })).toBeNull());
    expect(list().hidden).toBe(false);
    expect(screen.getByRole("region", { name: "ملخص الواجبات" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("the overview: final-only distribution, every student's status, the settings and their editors — with no request", async () => {
    await mount();
    const { page } = await openPage();
    const before = calls.length;
    fireEvent.click(within(sections(page)).getByRole("button", { name: "نظرة عامة" }));
    expect(pressed(page)).toEqual(["نظرة عامة"]);
    expect(within(page).queryByLabelText("بحث بالاسم أو الكود")).toBeNull();                 // the gradebook gave way
    const dist = within(page).getByRole("region", { name: "توزيع العلامات" });
    expect(within(dist).getByText("العلامات النهائية فقط؛ لا يشمل طالب واحد بانتظار التصحيح.")).toBeTruthy();
    expect(within(dist).getByRole("img").getAttribute("aria-label")).toBe("توزيع العلامات النهائية (طالبان): أقل من 50% 1، 50–64% 0، 65–79% 0، 80–89% 1، 90–100% 0");
    expect(Array.from(dist.querySelectorAll(".eb-dist-row")).map(r => r.querySelector(".eb-dist-label")?.textContent + "=" + r.querySelector(".eb-dist-count")?.textContent))
      .toEqual(["أقل من 50%=1", "50–64%=0", "65–79%=0", "80–89%=1", "90–100%=0"]);
    const status = within(page).getByRole("region", { name: "حالة الطلاب" });
    expect(Array.from(status.querySelectorAll(".eb-status-legend li")).map(li => li.textContent)).toEqual(["مصحّح 2", "بانتظار التصحيح 1", "يحاول الآن 1", "لم يسلّم 1"]);
    const settings = within(page).getByRole("region", { name: "إعدادات الواجب" });
    expect(settings.textContent).toContain("حل كل الأسئلة.");
    expect(settings.textContent).toContain("45 دقيقة");
    expect(calls.length).toBe(before);
    fireEvent.click(within(settings).getByRole("button", { name: "تعديل الوقت والموعد" }));
    expect(await screen.findByRole("dialog", { name: "تعديل الوقت والموعد" })).toBeTruthy();
  });

  it("the page header offers the row's action menu", async () => {
    await mount();
    const { page } = await openPage();
    fireEvent.click(within(page).getByRole("button", { name: "إجراءات الواجب واجب الكسور" }));
    const menu = await screen.findByRole("group", { name: "إجراءات الواجب واجب الكسور" });
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["إيقاف النشر", "تعديل العنوان والتعليمات", "تعديل عدد المحاولات", "تعديل الوقت والموعد", "أرشفة"]);
    fireEvent.click(within(menu).getByRole("button", { name: "إيقاف النشر" }));
    await waitFor(() => expect(calls.filter(c => c.method === "POST" && c.url === "/api/assignments").map(c => c.body)).toEqual([{ assignmentId: "a1", action: "setStatus", status: "draft" }]));
  });

  it("the analysis loads once, on its first visit; another assignment opens on the gradebook again", async () => {
    await mount();
    const { page } = await openPage();
    const analysisReads = () => calls.filter(c => c.url.startsWith("/api/assignment-item-analysis")).length;
    expect(analysisReads()).toBe(0);
    fireEvent.click(within(sections(page)).getByRole("button", { name: "تحليل الأسئلة" }));
    await within(page).findByRole("region", { name: "تحليل الأسئلة" });
    expect(analysisReads()).toBe(1);
    fireEvent.click(within(sections(page)).getByRole("button", { name: "نظرة عامة" }));
    fireEvent.click(within(sections(page)).getByRole("button", { name: "تحليل الأسئلة" }));
    expect(analysisReads()).toBe(1);
    fireEvent.click(within(page).getByRole("button", { name: "العودة إلى الواجبات" }));
    await waitFor(() => expect(list().hidden).toBe(false));
    const next = await openPage("واجب الجبر");
    expect(pressed(next.page)).toEqual(["الطلاب"]);
  });
});
