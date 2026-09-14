// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";

// Roadmap #7 — teacher archive/restore/purge UI. The normal destructive action ARCHIVES (never emits
// action:"delete"); archived rows offer restore + impact-gated permanent purge.

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const PUBLISHED = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب منشور", instructions: "", status: "published", openAt: "", dueAt: "", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0 };
const ARCHIVED = { assignmentId: "a2", classId: "c1", className: "الحادي عشر", title: "واجب مؤرشف", instructions: "", status: "archived", archivedFromStatus: "published", archivedAt: "2026-01-01T00:00:00.000Z", openAt: "", dueAt: "", questionCount: 1, totalMarks: 10, maxAttempts: 1, durationMinutes: 0 };

type Body = Record<string, unknown>;
const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let posts: Body[] = [];
let impactResponse: Record<string, unknown> = {};
function installFetch() {
  posts = [];
  impactResponse = { assignmentId: "a2", status: "archived", submissionDocuments: 0, studentsWithCompletedAttempts: 0, completedAttempts: 0, activeAttempts: 0, draftDocuments: 0, canPurge: true };
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [PUBLISHED, ARCHIVED] });
    if (url.includes("/api/saved-exams") && method !== "POST") return json({ ok: true, exams: [] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exam: null });
    if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, students: [{ studentId: "s1", studentName: "طالب", studentCode: "S1", attemptsUsed: 1, allowedAttempts: 1, attemptStatus: "submitted", activeAttempt: null, timed: false, effectiveAttemptEndsAt: "", dueAtOverride: null, latestResult: { attemptNumber: 1, score: 5, totalMarks: 10, percentage: 50, finalized: true, manualReviewMarks: 0 } }], stats: { students: 1, submitted: 1, pendingReview: 0, average: 50, highest: 50, lowest: 50 } });
    if (url.includes("/api/assignments")) {
      const body = JSON.parse(String(init!.body)) as Body; posts.push(body);
      if (body.action === "deleteImpact") return json({ ok: true, impact: impactResponse });
      if (body.action === "archive") return json({ ok: true, archived: true, assignment: { ...PUBLISHED, assignmentId: body.assignmentId, status: "archived", archivedFromStatus: "published" } });
      if (body.action === "restore") return json({ ok: true, restored: true, assignment: { ...ARCHIVED, assignmentId: body.assignmentId, status: "published", archivedFromStatus: "" } });
      if (body.action === "purge") return json({ ok: true, purged: true, assignmentId: body.assignmentId });
      return json({ ok: true, assignment: { ...PUBLISHED, assignmentId: body.assignmentId } });
    }
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function mount() {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  await r.findByText("واجب منشور");
  return r;
}
const rowOf = (r: ReturnType<typeof render>, name: string) => r.getByText(name).closest(".assignment-row") as HTMLElement;
const noDeleteEmitted = () => expect(posts.some(p => p.action === "delete")).toBe(false);

describe("R7 AssignmentsPanel — archive-first UI", () => {
  it("a normal (non-archived) assignment shows 'أرشفة' and no direct hard-delete button", async () => {
    const r = await mount();
    const row = rowOf(r, "واجب منشور");
    expect(within(row).getByText("أرشفة")).toBeTruthy();
    expect(within(row).queryByText("حذف")).toBeNull();
    expect(within(row).queryByText("حذف نهائي")).toBeNull();
  });

  it("clicking 'أرشفة' checks impact then POSTs action:'archive' (never action:'delete')", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const r = await mount();
    fireEvent.click(within(rowOf(r, "واجب منشور")).getByText("أرشفة"));
    await waitFor(() => expect(posts.some(p => p.action === "archive")).toBe(true));
    expect(posts.some(p => p.action === "deleteImpact")).toBe(true);
    noDeleteEmitted();
    expect(confirmSpy).toHaveBeenCalled();
  });

  it("active-attempt archive shows a warning and sends confirmActiveAttempts:true", async () => {
    impactResponse = { ...impactResponse, activeAttempts: 2, submissionDocuments: 2 };
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const r = await mount();
    fireEvent.click(within(rowOf(r, "واجب منشور")).getByText("أرشفة"));
    await waitFor(() => expect(posts.some(p => p.action === "archive")).toBe(true));
    expect(posts.find(p => p.action === "archive")!.confirmActiveAttempts).toBe(true);
    expect(confirmSpy.mock.calls.some(c => String(c[0]).includes("محاولات نشطة"))).toBe(true);
  });

  it("archived assignments appear under 'المؤرشفة' with 'استعادة' and 'حذف نهائي'", async () => {
    const r = await mount();
    expect(r.queryByText("واجب مؤرشف")).toBeNull();
    fireEvent.click(r.getByText(/المؤرشفة/));
    const row = (await r.findByText("واجب مؤرشف")).closest(".assignment-row") as HTMLElement;
    expect(within(row).getByText("استعادة")).toBeTruthy();
    expect(within(row).getByText("حذف نهائي")).toBeTruthy();
  });

  it("restore POSTs action:'restore' and updates the list", async () => {
    const r = await mount();
    fireEvent.click(r.getByText(/المؤرشفة/));
    await r.findByText("واجب مؤرشف");
    const row = (r.getByText("واجب مؤرشف").closest(".assignment-row")) as HTMLElement;
    fireEvent.click(within(row).getByText("استعادة"));
    await waitFor(() => expect(posts.some(p => p.action === "restore")).toBe(true));
    noDeleteEmitted();
  });

  it("purge with existing submissions shows the blocked-history message and never opens the purge modal", async () => {
    impactResponse = { ...impactResponse, submissionDocuments: 3, canPurge: false };
    const r = await mount();
    fireEvent.click(r.getByText(/المؤرشفة/));
    await r.findByText("واجب مؤرشف");
    const row = (r.getByText("واجب مؤرشف").closest(".assignment-row")) as HTMLElement;
    fireEvent.click(within(row).getByText("حذف نهائي"));
    await waitFor(() => expect(posts.some(p => p.action === "deleteImpact")).toBe(true));
    expect(await r.findByText(/لا يمكن الحذف النهائي لأن للواجب بيانات طلاب محفوظة/)).toBeTruthy();
    expect(r.container.querySelector(".purge-modal")).toBeNull();
    expect(posts.some(p => p.action === "purge")).toBe(false);
  });

  it("zero-history purge requires the exact title, then removes the row after purged:true", async () => {
    const r = await mount();
    fireEvent.click(r.getByText(/المؤرشفة/));
    await r.findByText("واجب مؤرشف");
    const row = (r.getByText("واجب مؤرشف").closest(".assignment-row")) as HTMLElement;
    fireEvent.click(within(row).getByText("حذف نهائي"));
    const modal = await waitFor(() => { const m = r.container.querySelector(".purge-modal"); if (!m) throw new Error("no modal"); return m as HTMLElement; });
    const confirmBtn = modal.querySelector(".assignment-delete-button") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(modal.querySelector("input") as HTMLInputElement, { target: { value: "واجب مؤرشف" } });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(posts.some(p => p.action === "purge")).toBe(true));
    const purge = posts.find(p => p.action === "purge")!;
    expect(purge.confirmTitle).toBe("واجب مؤرشف"); expect(purge.confirmAssignmentId).toBe("a2");
    await waitFor(() => expect(r.queryByText("واجب مؤرشف")).toBeNull());
    noDeleteEmitted();
  });

  // ── Archived gradebook: review/manual grading stays; B2B participation controls hide ──
  it("A: an archived assignment's gradebook keeps the review control but hides the B2B participation controls", async () => {
    const r = await mount();
    fireEvent.click(r.getByText(/المؤرشفة/));
    const row = (await r.findByText("واجب مؤرشف")).closest(".assignment-row") as HTMLElement;
    fireEvent.click(within(row).getByText(/سجل العلامات/));
    await r.findByText(/سجل علامات:/);          // gradebook opened
    await r.findByText("طالب");                   // student row rendered
    expect(r.getByText(/عرض \/ تعديل التصحيح/)).toBeTruthy();   // manual grading / review kept
    expect(r.queryByText(/منح محاولة إضافية/)).toBeNull();
    expect(r.queryByText("إعادة فتح للطالب")).toBeNull();
    expect(r.queryByText(/تمديد الموعد/)).toBeNull();
  });

  it("B: archiving an assignment whose gradebook is open hides the B2B controls immediately (review stays)", async () => {
    const r = await mount();
    fireEvent.click(within(rowOf(r, "واجب منشور")).getByText(/سجل العلامات/));
    await r.findByText("طالب");
    expect(r.getByText(/منح محاولة إضافية/)).toBeTruthy();   // published: controls present
    fireEvent.click(within(rowOf(r, "واجب منشور")).getByText("أرشفة"));
    await waitFor(() => expect(posts.some(p => p.action === "archive")).toBe(true));
    await waitFor(() => expect(r.queryByText(/منح محاولة إضافية/)).toBeNull()); // controls gone
    expect(r.getByText(/عرض \/ تعديل التصحيح/)).toBeTruthy();      // review still available
  });

  it("C: restoring an assignment whose archived gradebook is open brings the B2B controls back", async () => {
    const r = await mount();
    fireEvent.click(r.getByText(/المؤرشفة/));
    const row = (await r.findByText("واجب مؤرشف")).closest(".assignment-row") as HTMLElement;
    fireEvent.click(within(row).getByText(/سجل العلامات/));
    await r.findByText("طالب");
    expect(r.queryByText(/منح محاولة إضافية/)).toBeNull();    // archived: hidden
    fireEvent.click(within(rowOf(r, "واجب مؤرشف")).getByText("استعادة"));
    await waitFor(() => expect(posts.some(p => p.action === "restore")).toBe(true));
    await waitFor(() => expect(r.queryByText(/منح محاولة إضافية/)).not.toBeNull()); // controls back
  });
});
