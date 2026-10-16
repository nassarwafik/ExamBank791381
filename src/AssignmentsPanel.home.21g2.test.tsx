// @vitest-environment happy-dom
//
// Phase 21G.2 — the assignments home, through the REAL AssignmentsPanel with a routed fetch mock: every class by default, the KPI
// strip from the server progress, the time chips and submission bars on each row, the time filter (and the master-scope invariant
// it joins), and an unavailable progress read shown as unknown — never as zero.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const H = 3600 * 1000, D = 24 * H;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }, { classId: "c2", name: "العاشر", grade: "10", active: true, status: "active" }];
const base = { instructions: "", questionCount: 5, totalMarks: 10, maxAttempts: 1, durationMinutes: 0 };
const ITEMS = [
  { ...base, assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب مفتوح", status: "published", openAt: at(-D), dueAt: at(5 * D) },
  { ...base, assignmentId: "a2", classId: "c2", className: "العاشر", title: "واجب يُغلق قريبًا", status: "published", openAt: at(-D), dueAt: at(5 * H + 10 * 60000) },
  { ...base, assignmentId: "a3", classId: "c1", className: "الحادي عشر", title: "واجب مغلق", status: "published", openAt: at(-9 * D), dueAt: at(-3 * D) },
  { ...base, assignmentId: "a4", classId: "c1", className: "الحادي عشر", title: "واجب لم يُنشر", status: "draft", openAt: "", dueAt: "" }
];
const PROGRESS = [
  { assignmentId: "a1", classId: "c1", expected: 10, submitted: 4, notSubmitted: 6, pendingReview: 1, graded: 3, active: 2, average: 70, lastSubmittedAt: "" },
  { assignmentId: "a2", classId: "c2", expected: 10, submitted: 6, notSubmitted: 4, pendingReview: 0, graded: 6, active: 0, average: 80, lastSubmittedAt: "" },
  { assignmentId: "a3", classId: "c1", expected: 10, submitted: 9, notSubmitted: 1, pendingReview: 3, graded: 6, active: 0, average: 75, lastSubmittedAt: "" }
];
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
let progressFails = false;
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return progressFails ? json({ ok: false, error: "x" }, 500) : json({ ok: true, progress: PROGRESS });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: ITEMS });
  if (url.startsWith("/api/assignments")) { const item = ITEMS.find(x => x.assignmentId === body.assignmentId)!; return json({ ok: true, assignment: { ...item, status: body.status || item.status } }); }
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  if (url.startsWith("/api/assignment-results")) return json({ ok: true, stats: { students: 10, submitted: 4, pendingReview: 1, average: 70, highest: 90, lowest: 40 }, students: [] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; progressFails = false; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() { render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />); await screen.findByText("واجب مفتوح"); }
const rows = () => Array.from(document.querySelectorAll(".eb-assign-rows .eb-assign-row-title strong")).map(x => x.textContent);
const rowOf = (title: string) => within(document.querySelector(".eb-assign-rows") as HTMLElement).getByText(title).closest(".assignment-row") as HTMLElement;
const kpi = (label: string) => { const card = within(screen.getByRole("region", { name: "ملخص الواجبات" })).getByText(label).closest("article") as HTMLElement; return { value: card.querySelector(".eb-stat-value")?.textContent, hint: card.querySelector(".eb-stat-hint")?.textContent }; };

describe("21G.2 assignments home", () => {
  it("shows every class, the KPI strip and each row's time status and submission progress", async () => {
    await mount();
    expect((within(screen.getByRole("region", { name: "أدوات الواجبات" })).getByLabelText("الصف") as HTMLSelectElement).value).toBe("");
    expect(rows()).toEqual(["واجب مفتوح", "واجب يُغلق قريبًا", "واجب مغلق", "واجب لم يُنشر"]);
    await waitFor(() => expect(kpi("بانتظار التصحيح").value).toBe("4"));
    expect(kpi("مفتوحة الآن")).toEqual({ value: "2", hint: "واحد منها يُغلق خلال 48 ساعة" });
    expect(kpi("بانتظار التصحيح").hint).toBe("في واجبين");
    expect(kpi("يحاولون الآن").value).toBe("2");
    expect(kpi("نسبة التسليم")).toEqual({ value: "50%", hint: "10 من 20 في الواجبات المفتوحة" });
    const open = rowOf("واجب مفتوح");
    expect(within(open).getByText("مفتوح · يُغلق خلال 5 أيام")).toBeTruthy();
    expect(within(open).getByText("بانتظار التصحيح: 1")).toBeTruthy();
    expect(within(open).getByText("يحاولون الآن: 2")).toBeTruthy();
    expect(within(open).getByRole("progressbar", { name: "سلّم 4 من 10" }).getAttribute("aria-valuenow")).toBe("40");
    expect(within(rowOf("واجب يُغلق قريبًا")).getByText("يُغلق خلال 5 ساعات")).toBeTruthy();
    expect(within(rowOf("واجب مغلق")).getByText("أُغلق منذ 3 أيام")).toBeTruthy();
    expect(rowOf("واجب لم يُنشر").querySelector(".eb-assign-row-progress")).toBeNull();          // a draft: its badge already says it
    expect(calls.filter(c => c.url === "/api/assignment-progress")).toHaveLength(1);
  });

  it("the time filter narrows the list client-side and closes a detail it hides; the KPIs keep the whole scope", async () => {
    await mount();
    const filters = screen.getByRole("group", { name: "تصفية حسب الوقت" });
    expect(within(filters).getAllByRole("button").map(b => b.textContent)).toEqual(["الكل 4", "مفتوحة 2", "تُغلق قريبًا 1", "مغلقة 1", "مسودات 1"]);
    fireEvent.click(within(rowOf("واجب مغلق")).getByRole("button", { name: "فتح" }));
    await screen.findByRole("region", { name: "واجب مغلق" });
    const before = calls.length;
    fireEvent.click(within(filters).getByRole("button", { name: /^مفتوحة/ }));
    expect(rows()).toEqual(["واجب مفتوح", "واجب يُغلق قريبًا"]);
    expect(screen.queryByRole("region", { name: "واجب مغلق" })).toBeNull();               // the detail followed the scope
    expect(within(filters).getByRole("button", { name: /^مفتوحة/ }).getAttribute("aria-pressed")).toBe("true");
    expect(kpi("مفتوحة الآن").value).toBe("2");
    fireEvent.click(within(filters).getByRole("button", { name: /^تُغلق قريبًا/ }));
    expect(rows()).toEqual(["واجب يُغلق قريبًا"]);
    fireEvent.click(within(filters).getByRole("button", { name: /^الكل/ }));
    expect(rows()).toHaveLength(4);
    expect(calls.length).toBe(before);                                                        // zero requests
  });

  it("an unavailable progress read is shown as unknown, never as zero, and the list keeps working", async () => {
    progressFails = true;
    await mount();
    await waitFor(() => expect(kpi("بانتظار التصحيح")).toEqual({ value: "—", hint: "تعذر تحميل التقدم" }));
    expect(kpi("نسبة التسليم").value).toBe("—");
    expect(kpi("مفتوحة الآن").value).toBe("2");                                              // needs no progress
    expect(within(rowOf("واجب مفتوح")).getByText("تقدم التسليم غير متاح حاليًا.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the archived view has no KPI strip or time filter; publishing re-reads the progress", async () => {
    await mount();
    await waitFor(() => expect(calls.filter(c => c.url === "/api/assignment-progress")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: /^المؤرشفة/ }));
    expect(screen.queryByRole("region", { name: "ملخص الواجبات" })).toBeNull();
    expect(screen.queryByRole("group", { name: "تصفية حسب الوقت" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "الواجبات الحالية" }));
    fireEvent.click(within(rowOf("واجب لم يُنشر")).getByRole("button", { name: "إجراءات الواجب واجب لم يُنشر" }));
    fireEvent.click(within(await screen.findByRole("group", { name: "إجراءات الواجب واجب لم يُنشر" })).getByRole("button", { name: "نشر" }));
    await waitFor(() => expect(calls.filter(c => c.url === "/api/assignment-progress")).toHaveLength(2));
  });
});
