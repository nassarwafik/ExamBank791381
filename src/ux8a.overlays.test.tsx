// @vitest-environment happy-dom
// UX-8a — Responsive, Touch & Legacy Overlay Closure: the three legacy full-screen overlays (AssignmentReview, ExamPreview,
// StructuredExamImportDialog) become real modals IN PLACE through the shared useFocusTrap + the tiny useBodyScrollLock
// (dialog name, focus enters, Tab / Shift+Tab stay inside, Escape closes, focus returns to the opener, body scroll locks
// and restores — including above a suspended shared Dialog), the project heatmap cells expose their state as an accessible
// name, and the shared scroll-lock helper never unlocks a parent. Behaviour that the base commit lacks is asserted directly.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { useState } from "react";
import AssignmentReview from "./AssignmentReview";
import ExamPreview from "./ExamPreview";
import StructuredExamImportDialog from "./StructuredExamImportDialog";
import ProjectHeatmap from "./projects/ProjectHeatmap";
import Dialog from "./ui/Dialog";
import useBodyScrollLock from "./ui/useBodyScrollLock";

afterEach(() => { cleanup(); vi.restoreAllMocks(); document.body.style.overflow = ""; });

const tab = (shift = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey: shift });
const escape = () => fireEvent.keyDown(document, { key: "Escape" });
const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute("aria-hidden"));

// ---------- AssignmentReview fixtures (same shape as AssignmentReview.grading.test.tsx) ----------
const attempt = (n: number, over: Record<string, unknown> = {}) => ({ attemptNumber: n, submittedAt: "2026-03-01T10:00:00.000Z", score: 72, totalMarks: 100, percentage: 72, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "", ...over });
const reviewBody = () => ({ ok: true, assignment: { assignmentId: "a1", title: "واجب الشبكات", totalMarks: 100 }, student: { studentId: "s1", studentName: "أحمد", studentCode: "S-1" }, attempt: attempt(1), attempts: [attempt(1)], questions: [{ questionId: "q1", questionNumber: 1, text: "س1", marks: 10, studentAnswer: { kind: "text", value: "ج" }, expectedAnswer: "ج", autoGrade: { score: 5, manualReview: true }, manualScore: null, teacherComment: "" }] });
let gate: (() => void) | null = null;
let reviewCalls: { url: string; method: string; body: unknown }[] = [];
function installReviewFetch(hold = false) {
  reviewCalls = []; gate = null;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    reviewCalls.push({ url, method, body: init && init.body ? JSON.parse(String(init.body)) : null });
    const ok = (body: unknown) => ({ status: 200, ok: true, json: async () => body } as Response);
    if (url.includes("/api/assignment-review") && method === "GET") {
      if (hold) return new Promise<Response>(resolve => { gate = () => resolve(ok(reviewBody())); });
      return Promise.resolve(ok(reviewBody()));
    }
    if (url.includes("/api/assignment-review")) return Promise.resolve(ok({ ok: true, result: { gradingStatus: "final", finalized: true, score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0 } }));
    return Promise.resolve({ status: 404, ok: false, json: async () => ({ ok: false }) } as Response);
  }) as unknown as typeof fetch;
}

/** A page with an opener button that mounts the overlay; mirrors how the teacher surfaces open the legacy overlays. */
function Host({ children, label = "فتح" }: { children: (close: () => void) => React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" onClick={() => setOpen(true)}>{label}</button><button type="button">خلفية</button>{open && children(() => setOpen(false))}</div>;
}

describe("UX-8a — AssignmentReview is a real modal in place", () => {
  it("has a dialog name from its heading, focus enters, Tab and Shift+Tab stay inside, Escape closes, focus returns to the opener, body scroll locks and restores", async () => {
    installReviewFetch();
    render(<Host label="مراجعة">{close => <AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={close} onSaved={() => {}} />}</Host>);
    const opener = screen.getByRole("button", { name: "مراجعة" });
    opener.focus(); fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "واجب الشبكات" });
    expect(dialog.className).toContain("review-modal");                                                 // the panel, not the backdrop
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const items = focusables(dialog);
    expect(items.length).toBeGreaterThan(2);
    items[items.length - 1].focus(); tab();
    expect(document.activeElement).toBe(items[0]);                                                      // Tab wraps to the first control
    items[0].focus(); tab(true);
    expect(document.activeElement).toBe(items[items.length - 1]);                                       // Shift+Tab wraps to the last control
    screen.getByRole("button", { name: "خلفية" }).focus(); tab();
    expect(dialog.contains(document.activeElement)).toBe(true);                                         // focus outside is pulled back in
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("loading state is already a labelled modal with a focusable close action (focus has a valid destination before the sheet loads)", async () => {
    installReviewFetch(true);
    render(<Host label="مراجعة">{close => <AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={close} onSaved={() => {}} />}</Host>);
    const opener = screen.getByRole("button", { name: "مراجعة" });
    opener.focus(); fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "مراجعة ورقة الطالب" });
    expect(within(dialog).getByRole("status").textContent).toBe("جارٍ تحميل ورقة الطالب...");
    const close = within(dialog).getByRole("button", { name: "إغلاق" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => { gate!(); await Promise.resolve(); });
    const loaded = await screen.findByRole("dialog", { name: "واجب الشبكات" });
    expect(loaded).toBe(dialog);                                                                        // same panel node across states (trap root stays valid)
    expect(loaded.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(loaded).getAllByRole("button", { name: "إغلاق" })[0]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("above a SUSPENDED shared Dialog: focus stays in the review, closing unsuspends the parent and returns focus to the original review opener inside it; the parent's scroll lock survives", async () => {
    installReviewFetch();
    function Page() {
      const [review, setReview] = useState(false);
      return <>
        <button type="button">خارج</button>
        <Dialog open title="ملف الطالب" onClose={() => {}} suspended={review}>
          <button type="button" onClick={() => setReview(true)}>فتح المراجعة</button>
          <button type="button">آخر</button>
        </Dialog>
        {review && <AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => setReview(false)} onSaved={() => {}} />}
      </>;
    }
    render(<Page />);
    const parent = screen.getByRole("dialog", { name: "ملف الطالب" });
    expect(document.body.style.overflow).toBe("hidden");                                                // parent Dialog lock
    const opener = within(parent).getByRole("button", { name: "فتح المراجعة" });
    opener.focus(); fireEvent.click(opener);
    const review = await screen.findByRole("dialog", { name: "واجب الشبكات" });
    expect(parent.getAttribute("aria-hidden")).toBe("true");                                            // suspended parent hidden from AT
    await waitFor(() => expect(review.contains(document.activeElement)).toBe(true));
    opener.focus(); tab();
    expect(review.contains(document.activeElement)).toBe(true);                                         // the suspended parent is not reachable
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "واجب الشبكات" })).toBeNull());
    expect(parent.hasAttribute("aria-hidden")).toBe(false);                                             // parent unsuspended
    expect(document.activeElement).toBe(opener);                                                        // focus back on the ORIGINAL opener inside the parent
    expect(document.body.style.overflow).toBe("hidden");                                                // parent's lock intact (previous value restored)
  });

  it("save behaviour unchanged: the same GET and the same saveReview POST body, onSaved called", async () => {
    installReviewFetch();
    const onSaved = vi.fn();
    render(<AssignmentReview token="t" assignmentId="a1" studentId="s1" initialAttempt={1} onClose={() => {}} onSaved={onSaved} />);
    const dialog = await screen.findByRole("dialog", { name: "واجب الشبكات" });
    fireEvent.change(within(dialog).getByRole("spinbutton"), { target: { value: "8" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /حفظ واعتماد التصحيح/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const post = reviewCalls.find(c => c.method === "POST")!;
    expect(post.url).toBe("/api/assignment-review");
    expect(post.body).toEqual({ action: "saveReview", assignmentId: "a1", studentId: "s1", attemptNumber: 1, overrides: { q1: { score: 8, comment: "" } }, teacherFeedback: "" });
    expect(reviewCalls.filter(c => c.method === "GET").length).toBe(2);                                 // load + reload after save, as before
  });
});

// ---------- ExamPreview ----------
const previewExam = { title: "امتحان المعاينة", presentationTheme: "classic", questions: [{ examQuestionId: "q1", text: "سؤال أول", marks: 5, presentationType: "open" }, { examQuestionId: "q2", text: "سؤال ثاني", marks: 5, presentationType: "multipleChoice", options: [{ text: "أ" }, { text: "ب" }] }] };

describe("UX-8a — ExamPreview overlay is a real modal in place", () => {
  it("dialog name from its header, focus enters, Tab trapped, Escape closes, opener focus restored, body scroll locked and restored, rendering unchanged", async () => {
    render(<Host label="معاينة">{close => <ExamPreview exam={previewExam} onClose={close} />}</Host>);
    const opener = screen.getByRole("button", { name: "معاينة" });
    opener.focus(); fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: /معاينة الطالب — امتحان المعاينة/ });
    expect(dialog.className).toContain("sb-preview-overlay");                                           // same overlay, same layering
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(within(dialog).getByText("سؤال أول")).toBeTruthy();
    expect(within(dialog).getByText("سؤال ثاني")).toBeTruthy();                                        // long-form teacher preview unchanged
    expect(dialog.querySelector("main.exam-theme-classic")).toBeTruthy();
    const items = focusables(dialog);
    items[items.length - 1].focus(); tab();
    expect(document.activeElement).toBe(items[0]);
    screen.getByRole("button", { name: "خلفية" }).focus(); tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByRole("radio", { name: "ب" }));                                  // temporary answers still work, no network
    expect((within(dialog).getByRole("radio", { name: "ب" }) as HTMLInputElement).checked).toBe(true);
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
});

// ---------- StructuredExamImportDialog ----------
const importJson = JSON.stringify({ title: "امتحان مستورد", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ id: "q1", type: "open", text: "سؤال مستورد", marks: 5 }] }] });

describe("UX-8a — StructuredExamImportDialog overlay is a real modal in place", () => {
  it("dialog name, focus enters, Tab trapped, Escape closes, opener focus restored, body scroll locked and restored", async () => {
    render(<Host label="استيراد">{close => <StructuredExamImportDialog onClose={close} onOpenInBuilder={() => {}} />}</Host>);
    const opener = screen.getByRole("button", { name: "استيراد" });
    opener.focus(); fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: /استيراد امتحان منظّم/ });
    expect(dialog.className).toContain("sb-preview-overlay");
    expect(document.body.style.overflow).toBe("hidden");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const items = focusables(dialog);
    expect(items.length).toBeGreaterThan(1);
    items[items.length - 1].focus(); tab();
    expect(document.activeElement).toBe(items[0]);
    items[0].focus(); tab(true);
    expect(document.activeElement).toBe(items[items.length - 1]);
    escape();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("file parsing and open-in-builder behaviour unchanged: a JSON file yields the import summary and hands the exam to the parent; no request", async () => {
    const onOpen = vi.fn();
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    render(<StructuredExamImportDialog onClose={() => {}} onOpenInBuilder={onOpen} />);
    const dialog = screen.getByRole("dialog", { name: /استيراد امتحان منظّم/ });
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([importJson], "exam.json", { type: "application/json" });
    if (typeof (file as unknown as { text?: unknown }).text !== "function") (file as unknown as { text: () => Promise<string> }).text = () => Promise.resolve(importJson);
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    fireEvent.change(input);
    await screen.findByText("نتيجة الاستيراد");
    expect(within(dialog).getByText(/1 قسم/)).toBeTruthy();
    expect(within(dialog).getByText(/1 سؤال/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "فتح في محرر الامتحان المنظّم" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0].title).toBe("امتحان مستورد");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

// ---------- Body scroll lock helper ----------
describe("UX-8a — useBodyScrollLock", () => {
  it("locks while active and restores the PREVIOUS value, so an overlay above an already-locked parent never unlocks it", () => {
    function Lock({ on }: { on: boolean }) { useBodyScrollLock(on); return null; }
    document.body.style.overflow = "hidden";                                                            // a parent Dialog already locked
    const r = render(<Lock on />);
    expect(document.body.style.overflow).toBe("hidden");
    r.unmount();
    expect(document.body.style.overflow).toBe("hidden");                                                // parent lock intact
    document.body.style.overflow = "";
    const r2 = render(<Lock on />);
    expect(document.body.style.overflow).toBe("hidden");
    r2.rerender(<Lock on={false} />);
    expect(document.body.style.overflow).toBe("");
  });
});

// ---------- Project heatmap ----------
describe("UX-8a — project heatmap cells expose their state as an accessible name", () => {
  const stages = [{ stageId: "1.1", title: "التحليل", track: "hw", groupId: "g1" }, { stageId: "1.2", title: "التصميم", track: "hw", groupId: "g1" }];
  const heatmap = { students: [{ studentId: "s1", name: "زيد صالح" }, { studentId: "s2", name: "خالد عمر" }], stages, statuses: [{ "1.1": "approved", "1.2": "in_progress" }, { "1.1": "not_started", "1.2": "ready_for_review" }] };
  it("every cell is a table cell named 'student · stage · status' (not colour or title only), with the visible abbreviation kept; no calculation involved", () => {
    render(<ProjectHeatmap heatmap={heatmap as never} tracks={[{ trackId: "hw", title: "عتاد" }] as never} groups={[{ groupId: "g1", title: "المجموعة 1" }] as never} />);
    const approved = screen.getByRole("cell", { name: "زيد صالح · 1.1 التحليل · تم الاعتماد" });
    expect(approved.className).toContain("eb-heatmap-cell");
    expect(approved.getAttribute("aria-label")).toBe(approved.getAttribute("title"));
    expect(approved.querySelector('[aria-hidden="true"]')?.textContent?.length).toBeGreaterThan(0);        // visible abbreviation still there
    expect(screen.getByRole("cell", { name: /خالد عمر · 1.2 التصميم/ }).getAttribute("aria-label")).toMatch(/خالد عمر · 1.2 التصميم · /);
    expect(screen.getAllByRole("cell").filter(c => c.className.includes("eb-heatmap-cell")).length).toBe(4);
    expect(document.querySelectorAll('.eb-heatmap-cell[tabindex], .eb-heatmap-cell button').length).toBe(0);   // not interactive
  });
});
