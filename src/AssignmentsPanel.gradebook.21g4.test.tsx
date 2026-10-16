// @vitest-environment happy-dom
//
// Phase 21G.4 — the professional gradebook, through the REAL AssignmentsPanel with a routed fetch mock: one status per student,
// row selection that never outlives the rows it was made on, and the bulk actions — the SAME per-student requests as the row actions,
// one per ticked row, every student reported (the ones that failed stay ticked), and a run that stops when the teacher leaves the page.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const D = 24 * 3600 * 1000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
const base = { classId: "c1", className: "الحادي عشر", questionCount: 5, totalMarks: 10, maxAttempts: 1, durationMinutes: 45 };
let ITEMS: Record<string, unknown>[] = [];
const result = (percentage: number, extra: Record<string, unknown> = {}) => ({ attemptNumber: 1, score: percentage / 10, totalMarks: 10, percentage, submittedAt: at(-3600000), finalized: true, manualReviewMarks: 0, ...extra });
const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ studentId: id, studentName: name, studentCode: "P-" + id, attemptsUsed: 0, allowedAttempts: 1, dueAtOverride: null, attempts: [], latestResult: null, ...extra });
const STUDENTS = [
  row("s1", "سارة", { attemptsUsed: 1, attemptStatus: "submitted", gradingStatus: "final", latestResult: result(85) }),
  row("s2", "أحمد", { attemptsUsed: 1, attemptStatus: "submitted", gradingStatus: "pendingReview", latestResult: result(45, { finalized: false, manualReviewMarks: 3 }) }),
  row("s3", "باسل", { attemptStatus: "notStarted" }),
  row("s4", "تالا", { attemptStatus: "notStarted" })
];
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
let failFor = new Set<string>();
let hold: ((r: Response) => void) | null = null, holdNext = false;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return Promise.resolve(json({ ok: true, progress: [] }));
  if (url.startsWith("/api/assignments") && method === "GET") return Promise.resolve(json({ ok: true, assignments: ITEMS }));
  if (url.startsWith("/api/saved-exams")) return Promise.resolve(json({ ok: true, exams: [] }));
  if (url.startsWith("/api/assignment-item-analysis")) return Promise.resolve(json({ ok: true, assignmentId: "a1", title: "واجب الكسور", studentsInClass: 4, studentsSubmitted: 2, attemptsAnalyzed: 2,
    questions: [1, 2].map(n => ({ questionId: "q" + n, number: n, text: "سؤال " + n, type: "mcq", maxMarks: 5, studentsAnalyzed: 2, correctCount: 1, correctRate: 50, averageScore: 2.5, averagePercentage: 50, manualReviewCount: n === 2 ? 1 : 0, difficulty: "medium" })),
    students: [{ studentId: "s1", studentName: "سارة", studentCode: "P-s1", attemptNumber: 1, cells: [{ state: "graded", score: 5 }, { state: "graded", score: 3.5 }] }, { studentId: "s2", studentName: "أحمد", studentCode: "P-s2", attemptNumber: 1, cells: [{ state: "graded", score: 1 }, { state: "pending" }] }] }));
  if (url.startsWith("/api/assignment-results") && method === "GET") return Promise.resolve(json({ ok: true, stats: { students: 4, submitted: 2, pendingReview: 1, finalized: 1, notSubmitted: 2, active: 0, average: 85, highest: 85, lowest: 85 }, students: STUDENTS }));
  if (url === "/api/assignment-results" && method === "POST") {
    const s = STUDENTS.find(x => x.studentId === body.studentId)!;
    if (failFor.has(String(body.studentId))) return Promise.resolve(json({ ok: false, error: "تعارض في الحفظ، حاول مرة أخرى." }, 503));
    const snap = body.action === "allowRetry" ? { allowedAttempts: s.allowedAttempts + 1, attemptsUsed: s.attemptsUsed } : { dueAtOverride: body.dueAtOverride };
    if (holdNext) { holdNext = false; return new Promise<Response>(resolve => { hold = resolve; }); }
    return Promise.resolve(json({ ok: true, ...snap }));
  }
  return Promise.resolve(json({ ok: true }));
}
beforeEach(() => {
  calls = []; failFor = new Set(); hold = null; holdNext = false;
  ITEMS = [{ ...base, assignmentId: "a1", title: "واجب الكسور", instructions: "", status: "published", openAt: at(-D), dueAt: at(3 * D) }];
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn(routed) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openPage() {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  await screen.findByText("واجب الكسور");
  fireEvent.click(within(document.querySelector(".eb-assign-rows") as HTMLElement).getByRole("button", { name: "فتح" }));
  const page = await screen.findByRole("region", { name: "واجب الكسور" });
  await within(page).findByText("سارة");
  return page;
}
const rowOf = (page: HTMLElement, name: string) => within(page).getByText(name).closest("tr") as HTMLElement;
const tick = (page: HTMLElement, name: string) => fireEvent.click(within(page).getByRole("checkbox", { name: "تحديد " + name }));
const bulkBar = (page: HTMLElement) => within(page).queryByRole("group", { name: "إجراءات الطلاب المحددين" });
const posts = () => calls.filter(c => c.method === "POST" && c.url === "/api/assignment-results").map(c => [c.body.action, c.body.studentId]);
const confirmDialog = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });

describe("21G.4 the professional gradebook", () => {
  it("shows ONE status per student, grading first", async () => {
    const page = await openPage();
    const statuses = ["سارة", "أحمد", "باسل"].map(n => Array.from(rowOf(page, n).querySelectorAll(".eb-student-status")).map(b => b.textContent));
    expect(statuses).toEqual([["نهائي"], ["بانتظار التصحيح (3 ع.)"], ["لم يسلّم"]]);
    expect(page.querySelector(".lifecycle-badge")).toBeNull();
  });

  it("selection: the bulk bar counts the ticked rows; «تحديد الكل» ticks the visible rows only; a filter or search clears it", async () => {
    const page = await openPage();
    expect(bulkBar(page)).toBeNull();
    tick(page, "سارة"); tick(page, "باسل");
    expect(within(bulkBar(page)!).getByRole("status").textContent).toBe("تم تحديد طالبان");
    expect(rowOf(page, "سارة").className).toContain("is-selected");
    fireEvent.click(within(page).getByRole("button", { name: "لم يسلّم" }));
    expect(bulkBar(page)).toBeNull();                                                        // the filter cleared it
    const all = within(page).getByRole("checkbox", { name: "تحديد كل الطلاب الظاهرين" }) as HTMLInputElement;
    fireEvent.click(all);
    expect(within(bulkBar(page)!).getByRole("status").textContent).toBe("تم تحديد طالبان");  // باسل + تالا only
    expect(all.checked).toBe(true);
    fireEvent.change(within(page).getByLabelText("بحث بالاسم أو الكود"), { target: { value: "تا" } });
    expect(bulkBar(page)).toBeNull();
  });

  it("bulk «منح محاولة إضافية»: confirmed once, one allowRetry per ticked row; a failure is named and stays ticked", async () => {
    const page = await openPage();
    failFor = new Set(["s3"]);
    tick(page, "سارة"); tick(page, "باسل"); tick(page, "تالا");
    fireEvent.click(within(bulkBar(page)!).getByRole("button", { name: "منح محاولة إضافية" }));
    const dlg = await confirmDialog();
    expect(dlg.textContent).toContain("سيتم السماح لـ 3 طلاب بمحاولة إضافية");
    fireEvent.click(within(dlg).getByRole("button", { name: "منح المحاولة" }));
    await waitFor(() => expect(posts()).toEqual([["allowRetry", "s3"], ["allowRetry", "s4"], ["allowRetry", "s1"]]));   // the visible order
    expect(await screen.findByText("✓ تم منح محاولة إضافية لـ طالبان.")).toBeTruthy();
    expect(screen.getByText(/تعذر تنفيذ الإجراء لـ طالب واحد: باسل \(تعارض في الحفظ، حاول مرة أخرى\.\)/)).toBeTruthy();
    expect(within(bulkBar(page)!).getByRole("status").textContent).toBe("تم تحديد طالب واحد");
    expect((within(page).getByRole("checkbox", { name: "تحديد باسل" }) as HTMLInputElement).checked).toBe(true);
    expect(rowOf(page, "سارة").textContent).toContain("1/2");                                  // the snapshot was merged
  });

  it("bulk «تمديد الموعد»: one deadline for every ticked row, the dialog closes when all succeed", async () => {
    const page = await openPage();
    tick(page, "باسل"); tick(page, "تالا");
    fireEvent.click(within(bulkBar(page)!).getByRole("button", { name: "تمديد الموعد" }));
    const dlg = await screen.findByRole("dialog", { name: "تمديد الموعد للمحددين" });
    expect(dlg.textContent).toContain("طالبان");
    fireEvent.change(dlg.querySelector('input[type="datetime-local"]')!, { target: { value: "2030-01-05T10:00" } });
    fireEvent.click(within(dlg).getByRole("button", { name: /حفظ/ }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تمديد الموعد للمحددين" })).toBeNull());
    const sent = calls.filter(c => c.method === "POST" && c.url === "/api/assignment-results").map(c => [c.body.action, c.body.studentId, c.body.dueAtOverride]);
    const iso = new Date("2030-01-05T10:00").toISOString();
    expect(sent).toEqual([["setDueAtOverride", "s3", iso], ["setDueAtOverride", "s4", iso]]);
    expect(bulkBar(page)).toBeNull();
  });

  it("leaving the page stops a bulk run: no request after the one in flight, and the page is usable again", async () => {
    const page = await openPage();
    tick(page, "سارة"); tick(page, "باسل"); tick(page, "تالا");
    holdNext = true;
    fireEvent.click(within(bulkBar(page)!).getByRole("button", { name: "منح محاولة إضافية" }));
    fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "منح المحاولة" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    fireEvent.click(within(page).getByRole("button", { name: "العودة إلى الواجبات" }));
    hold!(json({ ok: true, allowedAttempts: 2 }));
    await new Promise(r => setTimeout(r, 20));
    expect(posts()).toEqual([["allowRetry", "s3"]]);
    const open = within(document.querySelector(".eb-assign-rows") as HTMLElement).getByRole("button", { name: "فتح" }) as HTMLButtonElement;
    expect(open.disabled).toBe(false);                                                         // the run's busy state was released
  });

  it("«تحليل الأسئلة» shows every student's mark per question; a pending question reads «بانتظار» and is not banded", async () => {
    const page = await openPage();
    fireEvent.click(within(within(page).getByRole("group", { name: "أقسام الواجب" })).getByRole("button", { name: "تحليل الأسئلة" }));
    const grid = await within(page).findByRole("region", { name: "جدول علامات الطلاب لكل سؤال" });
    expect(within(grid).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الطالب", "س1", "س2"]);
    const cells = (name: string) => Array.from(within(grid).getByRole("rowheader", { name: new RegExp(name) }).closest("tr")!.querySelectorAll("td")).map(td => td.textContent + "|" + td.className.replace("eb-qgrid-cell ", ""));
    expect(cells("أحمد")).toEqual(["1/5|is-b0", "بانتظار|is-pending"]);
    expect(cells("سارة")).toEqual(["5/5|is-b90", "3.5/5|is-b65"]);
  });

  it("…also when the request in flight FAILS after the teacher left", async () => {
    const page = await openPage();
    tick(page, "سارة"); tick(page, "باسل");
    holdNext = true;
    fireEvent.click(within(bulkBar(page)!).getByRole("button", { name: "منح محاولة إضافية" }));
    fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "منح المحاولة" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    fireEvent.click(within(page).getByRole("button", { name: "العودة إلى الواجبات" }));
    hold!(json({ ok: false, error: "تعارض في الحفظ، حاول مرة أخرى." }, 503));
    await new Promise(r => setTimeout(r, 20));
    expect(posts()).toEqual([["allowRetry", "s3"]]);
  });

  it("an archived assignment offers no selection", async () => {
    ITEMS = [{ ...base, assignmentId: "a1", title: "واجب الكسور", instructions: "", status: "archived", openAt: at(-D), dueAt: at(-D / 2) }];
    render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
    fireEvent.click(await screen.findByRole("button", { name: /المؤرشفة/ }));
    fireEvent.click(within(await waitFor(() => document.querySelector(".eb-assign-rows") as HTMLElement)).getByRole("button", { name: "فتح" }));
    const page = await screen.findByRole("region", { name: "واجب الكسور" });
    await within(page).findByText("سارة");
    expect(within(page).queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("21G.4 gradebook styles", () => {
  const raw = readFileSync(path.join(process.cwd(), "src", "assignments-pro.css"), "utf8");
  const block = raw.slice(raw.indexOf("/* Phase 21G.4")).replace(/\/\*[\s\S]*?\*\//g, "");
  it("keep the header in view inside a bounded scroll area, and lay each student out as a card on a phone", () => {
    expect(block).toMatch(/\.eb-gradebook-table-wrap \{ max-block-size: min\(72vh, 820px\); \}/);
    expect(block).toMatch(/\.eb-gradebook-table thead th \{ position: sticky; inset-block-start: 0;/);
    const phone = block.slice(block.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/\.eb-gradebook-table tbody tr \{ display: grid;/);
    expect(phone).toMatch(/content: attr\(data-label\)/);
    expect(phone).toMatch(/\.eb-gradebook-table, \.eb-gradebook-table tbody \{ display: block; inline-size: 100%; min-inline-size: 0; \}/);   // beats .students-table's 620px
    expect(phone).toMatch(/\.eb-gradebook-table thead th\.is-sortable \{ display: block; \}/);   // sorting stays reachable on a phone
  });
});
