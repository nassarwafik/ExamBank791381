// @vitest-environment happy-dom
//
// Phase 21G.5 — the review moves between students: «الطالب السابق / التالي / التالي بانتظار التصحيح», keys ] [ N (by physical
// key, never while typing), «حفظ والانتقال …», and every switch through the same unsaved-edits guard as closing.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor, fireEvent, within } from "@testing-library/react";
import AssignmentReview from "./AssignmentReview";
import type { ReviewNav } from "./assignments/reviewNav";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const A = { attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 5, finalized: false, gradingStatus: "pendingReview", startedAt: "", endedAt: "", endReason: "submitted", timedOut: false, teacherFeedback: "" };
const body = (studentId: string) => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب", totalMarks: 10 }, student: { studentId, studentName: "طالب " + studentId, studentCode: studentId }, attempt: A, attempts: [A], questions: [] });
const NAV: ReviewNav = { position: 2, total: 3, prev: { studentId: "s1", attemptNumber: 1 }, next: { studentId: "s3", attemptNumber: 2 }, nextPending: { studentId: "s3", attemptNumber: 2 } };
let saves = 0;
function mount(nav: ReviewNav | null = NAV, saveOk = true) {
  saves = 0;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignment-review") && method === "GET") return Promise.resolve({ status: 200, ok: true, json: async () => body(new URL(url, "http://x").searchParams.get("studentId") || "") } as Response);
    saves++;
    return Promise.resolve(saveOk ? { status: 200, ok: true, json: async () => ({ ok: true, result: { gradingStatus: "final", finalized: true, score: 9, totalMarks: 10, percentage: 90, manualReviewMarks: 0 } }) } as Response : { status: 503, ok: false, json: async () => ({ ok: false, error: "تعارض" }) } as Response);
  }) as unknown as typeof fetch;
  const onGo = vi.fn(), onSaved = vi.fn();
  render(<AssignmentReview token="t" assignmentId="a1" studentId="s2" initialAttempt={1} onClose={() => {}} onSaved={onSaved} nav={nav} onGo={onGo} />);
  return { onGo, onSaved };
}
const navGroup = () => screen.getByRole("group", { name: "التنقل بين الطلاب" });
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });

describe("21G.5 moving between students in the review", () => {
  it("shows the position and goes to the previous, next and next-pending student", async () => {
    const { onGo } = mount();
    await screen.findByText(/طالب s2/);
    expect(within(navGroup()).getByText("الطالب 2 من 3")).toBeTruthy();
    fireEvent.click(within(navGroup()).getByRole("button", { name: "→ الطالب السابق" }));
    fireEvent.click(within(navGroup()).getByRole("button", { name: "الطالب التالي ←" }));
    fireEvent.click(within(navGroup()).getByRole("button", { name: "الطالب التالي بانتظار التصحيح" }));
    await waitFor(() => expect(onGo.mock.calls.map(c => c[0].studentId)).toEqual(["s1", "s3", "s3"]));
  });

  it("keys ] [ N move by physical key, never while typing in a field or with a modifier", async () => {
    const { onGo } = mount();
    const dialog = await screen.findByRole("dialog");
    await screen.findByText(/طالب s2/);
    fireEvent.keyDown(dialog, { code: "BracketRight", key: "د" });           // an Arabic layout still sends the physical code
    fireEvent.keyDown(dialog, { code: "BracketLeft", key: "ج" });
    fireEvent.keyDown(dialog, { code: "KeyN", key: "ى" });
    fireEvent.keyDown(dialog, { code: "KeyN", ctrlKey: true });
    fireEvent.keyDown(screen.getByPlaceholderText(/أداء جيد/), { code: "BracketRight" });
    await waitFor(() => expect(onGo.mock.calls.map(c => c[0].studentId)).toEqual(["s3", "s1", "s3"]));
  });

  it("unsaved edits ask first: «البقاء مع هذا الطالب» stays, «الانتقال دون حفظ» goes", async () => {
    const { onGo } = mount();
    await screen.findByText(/طالب s2/);
    fireEvent.change(screen.getByPlaceholderText(/أداء جيد/), { target: { value: "ملاحظة" } });
    fireEvent.click(within(navGroup()).getByRole("button", { name: "الطالب التالي ←" }));
    let dlg = await confirmEl();
    expect(dlg.textContent).toContain("الانتقال إلى طالب آخر سيتجاهل هذه التعديلات");
    fireEvent.click(within(dlg).getByRole("button", { name: "البقاء مع هذا الطالب" }));
    await waitFor(() => expect(document.querySelector('.eb-confirm[role="dialog"]')).toBeNull());
    expect(onGo).not.toHaveBeenCalled();
    fireEvent.click(within(navGroup()).getByRole("button", { name: "الطالب التالي ←" }));
    dlg = await confirmEl();
    fireEvent.click(within(dlg).getByRole("button", { name: "الانتقال دون حفظ" }));
    await waitFor(() => expect(onGo).toHaveBeenCalledWith({ studentId: "s3", attemptNumber: 2 }));
    expect(saves).toBe(0);                                                       // nothing is auto-saved
  });

  it("«حفظ والانتقال …» saves first and moves only when the save succeeded", async () => {
    let m = mount();
    await screen.findByText(/طالب s2/);
    fireEvent.change(screen.getByPlaceholderText(/أداء جيد/), { target: { value: "أحسنت" } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ والانتقال إلى التالي بانتظار التصحيح" }));
    await waitFor(() => expect(m.onGo).toHaveBeenCalledWith({ studentId: "s3", attemptNumber: 2 }));
    expect(saves).toBe(1);
    expect(m.onSaved).toHaveBeenCalledTimes(1);
    cleanup();
    m = mount(NAV, false);
    await screen.findByText(/طالب s2/);
    fireEvent.click(screen.getByRole("button", { name: "حفظ والانتقال إلى التالي بانتظار التصحيح" }));
    expect(await screen.findByText("تعارض")).toBeTruthy();
    expect(m.onGo).not.toHaveBeenCalled();
  });

  it("without a nav (a single review) there is no student navigation and keys do nothing", async () => {
    const { onGo } = mount(null);
    const dialog = await screen.findByRole("dialog");
    await screen.findByText(/طالب s2/);
    expect(screen.queryByRole("group", { name: "التنقل بين الطلاب" })).toBeNull();
    expect(screen.queryByRole("button", { name: /حفظ والانتقال/ })).toBeNull();
    fireEvent.keyDown(dialog, { code: "BracketRight" });
    expect(onGo).not.toHaveBeenCalled();
  });
});
