// @vitest-environment happy-dom
//
// Phase 5A — the master-list «تعديل الوقت والموعد» (class-wide time & deadline) action. Drives the REAL
// AssignmentsPanel with a routed fetch mock and pins: the kebab action, the focused dialog, current values
// shown, the future-date validation, the exact updateTiming payload, snapshot reconciliation with no page
// reload, and the explanatory copy (attempts remaining; exhausted students never described as reset/granted).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
// A published, EXPIRED assignment (dueAt in the past) — the primary Phase 5A use case.
const A1 = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "اختبار الكسور", instructions: "x", status: "published", openAt: "2026-02-01T08:00:00.000Z", dueAt: "2026-03-01T10:00:00.000Z", questionCount: 5, totalMarks: 100, maxAttempts: 2, durationMinutes: 90 };

type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [A1] });
  if (url.startsWith("/api/assignments")) {
    const a = String(body.action);
    if (a === "updateTiming") return json({ ok: true, assignment: { ...A1, dueAt: String(body.dueAt), durationMinutes: Number(body.durationMinutes) } });
    return json({ ok: true, assignment: A1 });
  }
  if (url.startsWith("/api/saved-exams") && method === "GET") return json({ ok: true, exams: [] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const posts = () => calls.filter(c => c.method === "POST" && c.url.startsWith("/api/assignments")).map(c => c.body);
const getAssignmentsCount = () => calls.filter(c => c.method === "GET" && c.url.startsWith("/api/assignments")).length;
const rowOf = (title: string) => within(document.querySelector(".eb-assign-rows") as HTMLElement).getByText(title).closest(".assignment-row") as HTMLElement;
async function mount() { render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />); await screen.findByText("اختبار الكسور"); }
async function assignmentMenu(title: string) { fireEvent.click(within(rowOf(title)).getByRole("button", { name: "إجراءات الواجب " + title })); return await screen.findByRole("group", { name: "إجراءات الواجب " + title }); }
async function openTimingDialog(title = "اختبار الكسور") {
  fireEvent.click(within(await assignmentMenu(title)).getByRole("button", { name: "تعديل الوقت والموعد" }));
  return await screen.findByRole("dialog", { name: "تعديل الوقت والموعد" });
}

describe("AssignmentsPanel — Phase 5A class-wide time & deadline", () => {
  it("the kebab menu exposes «تعديل الوقت والموعد»", async () => {
    await mount();
    expect(within(await assignmentMenu("اختبار الكسور")).getByRole("button", { name: "تعديل الوقت والموعد" })).toBeTruthy();
  });

  it("the dialog opens showing the current deadline + duration, and the explanatory copy about remaining attempts", async () => {
    await mount();
    const d = await openTimingDialog();
    expect(within(d).getByText("موعد التسليم الحالي")).toBeTruthy();
    expect(within(d).getByText("مدة المحاولة الحالية")).toBeTruthy();
    expect(within(d).getByText("90 دقيقة")).toBeTruthy();                       // current duration shown
    // explanatory copy: reopening is only for students with attempts left; exhausted students get nothing.
    expect(d.textContent).toContain("تمديد الموعد يعيد إتاحة الواجب فقط للطلاب الذين ما زالت لديهم محاولات متبقية.");
    expect(d.textContent).toContain("الطلاب الذين استنفدوا جميع المحاولات لن يحصلوا على محاولة إضافية.");
    expect(d.textContent).toContain("لا يعيد ضبط محاولة مؤقتة بدأت بالفعل");     // active-attempt note
    // never describes exhausted attempts as reset/granted
    expect(d.textContent).not.toMatch(/إعادة تعيين المحاولات|منح محاولة إضافية للجميع|تصفير/);
  });

  it("a non-future deadline surfaces validation and keeps save disabled; no request is sent", async () => {
    await mount();
    const d = await openTimingDialog();
    // the assignment is expired, so the prefilled (past) value is already invalid → warning + disabled save
    fireEvent.change(within(d).getByDisplayValue(/2026-03-01/) as HTMLInputElement, { target: { value: "2020-01-01T09:00" } });
    expect(within(d).getByText("يجب أن يكون موعد التسليم الجديد في المستقبل.")).toBeTruthy();
    expect((within(d).getByRole("button", { name: "حفظ" }) as HTMLButtonElement).disabled).toBe(true);
    expect(posts()).toHaveLength(0);
  });

  it("a valid future extension posts the exact updateTiming payload, reconciles with no page reload, and shows the success notice", async () => {
    await mount();
    const d = await openTimingDialog();
    const dueInput = d.querySelector(".assignment-timing-due") as HTMLInputElement;
    const durInput = d.querySelector(".assignment-timing-duration") as HTMLInputElement;
    fireEvent.change(dueInput, { target: { value: "2027-01-01T10:00" } });
    fireEvent.change(durInput, { target: { value: "60" } });
    const getsBefore = getAssignmentsCount();
    fireEvent.click(within(d).getByRole("button", { name: "حفظ" }));
    await screen.findByText("✓ تم تحديث وقت الواجب وموعد التسليم.");
    // exactly one updateTiming POST with the correct payload (ISO dueAt derived from the local input)
    const timing = posts().filter(b => b.action === "updateTiming");
    expect(timing).toHaveLength(1);
    expect(timing[0]).toMatchObject({ assignmentId: "a1", dueAt: new Date("2027-01-01T10:00").toISOString(), durationMinutes: 60 });
    // reconciled in place — NO extra GET /api/assignments (no full-page/list reload)
    expect(getAssignmentsCount()).toBe(getsBefore);
    // the dialog closed after success
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل الوقت والموعد" })).toBeNull());
  });
});
