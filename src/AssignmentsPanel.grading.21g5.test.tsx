// @vitest-environment happy-dom
//
// Phase 21G.5 — through the REAL AssignmentsPanel: the review moves between the gradebook's students (its sort order, the next
// student waiting for review), and the results release is chosen in the composer and changed / published from «نظرة عامة».
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

const D = 24 * 3600 * 1000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
let ITEM: Record<string, unknown>;
const result = (pending: boolean) => ({ attemptNumber: 1, score: 5, totalMarks: 10, percentage: 50, submittedAt: at(-3600000), finalized: !pending, manualReviewMarks: pending ? 5 : 0 });
const row = (id: string, name: string, pending: boolean | null) => ({ studentId: id, studentName: name, studentCode: "P-" + id, attemptsUsed: pending === null ? 0 : 1, allowedAttempts: 1, dueAtOverride: null, attempts: [], attemptStatus: pending === null ? "notStarted" : "submitted", gradingStatus: pending === null ? "notSubmitted" : pending ? "pendingReview" : "final", latestResult: pending === null ? null : result(pending) });
const STUDENTS = [row("s1", "أحمد", true), row("s2", "باسل", false), row("s3", "تالا", null), row("s4", "دانة", true)];
let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input), method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : {};
  calls.push({ url, method, body });
  if (url === "/api/assignment-progress") return json({ ok: true, progress: [] });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [ITEM] });
  if (url === "/api/assignments" && method === "POST") {
    if (body.action === "setResultsRelease") ITEM = { ...ITEM, resultsRelease: body.resultsRelease, resultsReleasedAt: "" };
    if (body.action === "releaseResults") ITEM = { ...ITEM, resultsReleasedAt: body.released ? at(0) : "" };
    return json({ ok: true, assignment: ITEM });
  }
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  if (url.startsWith("/api/assignment-results")) return json({ ok: true, stats: { students: 4, submitted: 3, pendingReview: 2, finalized: 1, notSubmitted: 1, active: 0, average: 50, highest: 50, lowest: 50 }, students: STUDENTS });
  if (url.startsWith("/api/assignment-review")) {
    const sid = new URL(url, "http://x").searchParams.get("studentId")!, s = STUDENTS.find(x => x.studentId === sid)!;
    const A = { ...s.latestResult, gradingStatus: s.gradingStatus, startedAt: "", endedAt: "", endReason: "submitted", timedOut: false, teacherFeedback: "" };
    return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب الكسور", totalMarks: 10 }, student: { studentId: sid, studentName: s.studentName, studentCode: s.studentCode }, attempt: A, attempts: [A], questions: [] });
  }
  return json({ ok: true });
}
beforeEach(() => {
  calls = [];
  ITEM = { classId: "c1", className: "الحادي عشر", questionCount: 5, totalMarks: 10, maxAttempts: 1, durationMinutes: 45, assignmentId: "a1", title: "واجب الكسور", instructions: "", status: "published", openAt: at(-D), dueAt: at(3 * D), resultsRelease: "immediate", resultsReleasedAt: "" };
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn(routed) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openPage() {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  await screen.findByText("واجب الكسور");
  fireEvent.click(within(document.querySelector(".eb-assign-rows") as HTMLElement).getByRole("button", { name: "فتح" }));
  const page = await screen.findByRole("region", { name: "واجب الكسور" });
  await within(page).findByText("أحمد");
  return page;
}
const reviewReads = () => calls.filter(c => c.url.startsWith("/api/assignment-review")).map(c => new URL(c.url, "http://x").searchParams.get("studentId"));
const confirmEl = () => waitFor(() => { const el = document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null; if (!el) throw new Error("no confirm yet"); return el; });

describe("21G.5 grading flow through the panel", () => {
  it("the review moves through the gradebook's students and jumps to the next one waiting for review", async () => {
    const page = await openPage();
    fireEvent.click(within(within(page).getByText("أحمد").closest("tr") as HTMLElement).getByRole("button", { name: "تصحيح الآن" }));
    const nav = await screen.findByRole("group", { name: "التنقل بين الطلاب" });
    expect(within(nav).getByText("الطالب 1 من 3")).toBeTruthy();                                // تالا has no attempt
    fireEvent.click(within(nav).getByRole("button", { name: "الطالب التالي بانتظار التصحيح" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "التنقل بين الطلاب" })).getByText("الطالب 3 من 3")).toBeTruthy());
    fireEvent.click(within(screen.getByRole("group", { name: "التنقل بين الطلاب" })).getByRole("button", { name: "→ الطالب السابق" }));
    await waitFor(() => expect(within(screen.getByRole("group", { name: "التنقل بين الطلاب" })).getByText("الطالب 2 من 3")).toBeTruthy());
    await waitFor(() => expect(reviewReads()).toEqual(["s1", "s4", "s2"]));
  });

  it("«نظرة عامة»: the release mode is changed, and in «يدويًا» published after a confirmation", async () => {
    const page = await openPage();
    fireEvent.click(within(within(page).getByRole("group", { name: "أقسام الواجب" })).getByRole("button", { name: "نظرة عامة" }));
    const settings = within(page).getByRole("region", { name: "إعدادات الواجب" });
    expect(settings.textContent).toContain("تظهر للطلاب فور التصحيح");
    fireEvent.change(within(settings).getByLabelText("متى يرى الطلاب نتائجهم"), { target: { value: "manual" } });
    await waitFor(() => expect(settings.textContent).toContain("مخفية عن الطلاب حتى تنشرها"));
    fireEvent.click(within(settings).getByRole("button", { name: "نشر النتائج للطلاب" }));
    fireEvent.click(within(await confirmEl()).getByRole("button", { name: "نشر النتائج" }));
    await waitFor(() => expect(within(settings).getByRole("button", { name: "إخفاء النتائج عن الطلاب" })).toBeTruthy());
    expect(await screen.findByText("✓ نُشرت نتائج «واجب الكسور» للطلاب.")).toBeTruthy();
    expect(calls.filter(c => c.method === "POST" && c.url === "/api/assignments").map(c => c.body)).toEqual([
      { assignmentId: "a1", action: "setResultsRelease", resultsRelease: "manual" },
      { assignmentId: "a1", action: "releaseResults", released: true }
    ]);
    expect(within(page).getByText("إظهار النتائج: يدويًا")).toBeTruthy();                     // the page header says it too
  });
});
