// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";
import Gradebook from "./assignments/Gradebook";

// Phase 21E.2 (G) — «تصدير سجل العلامات (CSV)» in the real gradebook: one browser download through reports/csv.ts (BOM, CRLF,
// quoted cells), EVERY student of the authoritative results even while the on-screen list is searched / filtered, stable
// columns, and none of the payload's private fields. Fixtures follow AssignmentsPanel.grading.test.tsx.
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }];
const lr = (over: Record<string, unknown>) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", teacherFeedback: "", ...over });
const finalLR = lr({ score: 90, percentage: 90, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const PEND = { studentId: "s1", studentName: "زيد", studentCode: "987654321", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, attempts: [lr({})], latestResult: lr({}) };
const FIN = { studentId: "s2", studentName: "خالد", studentCode: "012345678", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "final", activeAttempt: null, attempts: [finalLR], latestResult: finalLR };
const NOSUB = { studentId: "s3", studentName: "سعد", studentCode: "000004321", attemptsUsed: 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, attempts: [], latestResult: null };
const ACT = { studentId: "s4", studentName: "عمر", studentCode: "A1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "started", gradingStatus: "final", activeAttempt: { attemptNumber: 2, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "", status: "started" }, attempts: [finalLR], latestResult: finalLR };
const STATS = { students: 4, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 1, active: 1, average: 72, highest: 90, lowest: 62 };
const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);

function installFetch(status = "published") {
  const ASSIGNMENT = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "واجب", instructions: "x", status, openAt: "", dueAt: "", questionCount: 1, totalMarks: 100, maxAttempts: 3, durationMinutes: 0, archivedAt: status === "archived" ? "2026-01-01T00:00:00.000Z" : undefined };
  (globalThis as { fetch?: unknown }).fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init && init.method) || "GET";
    if (url.includes("/api/assignments") && method !== "POST") return json({ ok: true, assignments: [ASSIGNMENT] });
    if (url.includes("/api/saved-exams")) return json({ ok: true, exams: [] });
    if (url.includes("/api/assignment-results") && method !== "POST") return json({ ok: true, assignment: { assignmentId: "a1", title: "واجب", dueAt: "", durationMinutes: 0, maxAttempts: 3, totalMarks: 100 }, stats: STATS, students: [PEND, FIN, NOSUB, ACT] });
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; installFetch(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openGradebook(archived = false) {
  const r = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
  if (archived) fireEvent.click(await r.findByText(/المؤرشفة/));
  fireEvent.click(await r.findByRole("button", { name: "فتح" }));
  await r.findByText("زيد");
  return r;
}

function captureDownload() {
  const out: { blob?: Blob; name?: string; clicks: number } = { clicks: 0 };
  URL.createObjectURL = vi.fn((b: Blob) => { out.blob = b; return "blob:gradebook"; }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { out.clicks++; out.name = this.download; });
  return out;
}
async function text(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bom: Array.from(bytes.slice(0, 3)), body: new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).slice(1) };
}

describe("21E.2 G — gradebook CSV export", () => {
  it("downloads the whole gradebook as UTF-8 CSV with a BOM, even while the list is searched", async () => {
    const r = await openGradebook();
    fireEvent.change(r.getByPlaceholderText("بحث بالاسم أو الكود"), { target: { value: "خالد" } });
    const dl = captureDownload();
    fireEvent.click(r.getByRole("button", { name: "تصدير سجل العلامات (CSV)" }));
    expect(dl.clicks).toBe(1);
    expect(dl.name).toBe("TadrisPlus-سجل-العلامات-واجب.csv");
    expect(dl.blob?.type).toBe("text/csv;charset=utf-8;");
    const { bom, body } = await text(dl.blob as Blob);
    expect(bom).toEqual([0xef, 0xbb, 0xbf]);
    const lines = body.split("\r\n");
    expect(lines[0]).toBe('"الواجب","واجب"');
    expect(lines[3]).toBe('"الطالب","رقم الهوية (آخر 4 خانات)","حالة التصحيح","حالة المحاولة","المحاولات المستخدمة","المحاولات المسموحة","آخر علامة","العلامة الكاملة","النسبة المئوية","تاريخ آخر تسليم"');
    expect(lines.slice(4).map(l => l.split(",")[0])).toEqual(['"خالد"', '"زيد"', '"سعد"', '"عمر"']);
    expect(lines.find(l => l.startsWith('"سعد"'))).toBe('"سعد","•••••4321","لم يسلّم","لم يبدأ","0","3","","","",""');
    expect(lines.find(l => l.startsWith('"زيد"'))?.split(",").slice(2, 9)).toEqual(['"بانتظار التصحيح"', '"تم التسليم"', '"1"', '"3"', '"62"', '"100"', '"62"']);
    for (const secret of ["s1", "s2", "teacherFeedback", "attemptEpoch", "987654321", "012345678", "000004321"]) expect(body).not.toContain(secret);   // never a full identity / login number
  });

  it("is labelled, keyboard reachable and never changes the gradebook state", async () => {
    const r = await openGradebook();
    const button = r.getByRole("button", { name: "تصدير سجل العلامات (CSV)" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    const calls = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    captureDownload();
    fireEvent.click(button);
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(calls);   // no request
  });
});

describe("21E.2 G — export availability", () => {
  const base = { assignment: { assignmentId: "a1", classId: "c1", className: "x", title: "واجب", instructions: "", status: "published" as const, openAt: "", dueAt: "", questionCount: 1, totalMarks: 100, maxAttempts: 3 }, rows: [], gradingOf: () => "notSubmitted" as const,
    search: "", onSearch: vi.fn(), filter: "all" as const, onFilter: vi.fn(), sort: "name" as const, onSort: vi.fn(), onReview: vi.fn(), onGrant: vi.fn(), onReopen: vi.fn(), onExtend: vi.fn(), onDeadline: vi.fn(), onEndAttempt: vi.fn(), fmt: (v: string) => v };
  it("is disabled while the gradebook is busy and when there is no student at all; offered only with a handler", () => {
    const onExportCsv = vi.fn();
    const r = render(<Gradebook {...base} totalRows={0} busy={false} onExportCsv={onExportCsv} />);
    expect((r.getByRole("button", { name: "تصدير سجل العلامات (CSV)" }) as HTMLButtonElement).disabled).toBe(true);
    r.rerender(<Gradebook {...base} totalRows={3} busy onExportCsv={onExportCsv} />);
    expect((r.getByRole("button", { name: "تصدير سجل العلامات (CSV)" }) as HTMLButtonElement).disabled).toBe(true);
    r.rerender(<Gradebook {...base} totalRows={3} busy={false} onExportCsv={onExportCsv} />);
    const b = r.getByRole("button", { name: "تصدير سجل العلامات (CSV)" }) as HTMLButtonElement;
    expect(b.disabled).toBe(false);
    fireEvent.click(b);
    expect(onExportCsv).toHaveBeenCalledTimes(1);
    r.rerender(<Gradebook {...base} totalRows={3} busy={false} />);
    expect(r.queryByRole("button", { name: "تصدير سجل العلامات (CSV)" })).toBeNull();
  });
});
