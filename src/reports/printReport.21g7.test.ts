// @vitest-environment happy-dom
//
// Phase 21G.7 — the PDF export: a right-to-left, print-ready report of the SAME rows as the CSV / Excel exports, every cell
// escaped, printed from a hidden iframe that is removed afterwards; the gradebook report carries counts only (no answers, keys or
// feedback). And the reminder notification as the student reads it.
import { describe, it, expect, vi, afterEach } from "vitest";
import { reportHtml, printReport } from "./printReport";
import { gradebookPrintReport, gradebookCsvRows, GRADEBOOK_HEADER_ROW } from "../teacher/teacherExports";
import { rowGrading } from "../assignments/assignmentsView";
import { notificationItemOf } from "../notifications/notificationsClient";
import { presentNotification } from "../notifications/notificationPresentation";
import type { StudentResult } from "../assignments/types";

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ""; });
const s = (id: string, name: string, latest: unknown, extra: Record<string, unknown> = {}) => ({ studentId: id, studentName: name, studentCode: "1234567" + id, attemptsUsed: latest ? 1 : 0, allowedAttempts: 1, dueAtOverride: null, attempts: [], latestResult: latest, ...extra } as unknown as StudentResult);
const ROWS = [s("2", "سارة", { attemptNumber: 1, score: 8, totalMarks: 10, percentage: 80, submittedAt: "2026-10-01T09:05:00", finalized: true, manualReviewMarks: 0, teacherFeedback: "سرّي" }), s("1", "<img src=x onerror=alert(1)>", null)];

describe("the print report", () => {
  it("is right-to-left, escapes every cell and lists the same columns and rows as the CSV", () => {
    const r = gradebookPrintReport({ title: "واجب <الكسور>", className: "أ", dueAt: "2026-10-05T10:00:00" }, ROWS, rowGrading, { students: 2, submitted: 1, pendingReview: 0, finalized: 1, average: 80 }, new Date("2026-10-16T12:00:00"));
    const csv = gradebookCsvRows({ title: "واجب <الكسور>", className: "أ" }, ROWS, rowGrading);
    expect(r.columns).toEqual(csv[GRADEBOOK_HEADER_ROW]);
    expect(r.rows).toEqual(csv.slice(GRADEBOOK_HEADER_ROW + 1));
    expect(r.meta).toEqual([["الصف", "أ"], ["آخر موعد", "2026-10-05 10:00"], ["تم التسليم", "1 من 2"], ["بانتظار التصحيح", "0"], ["نهائي", "1"], ["المعدل", "80%"]]);
    const html = reportHtml(r);
    expect(html.startsWith('<!doctype html><html lang="ar" dir="rtl">')).toBe(true);
    expect(html).toContain("@page{size:A4 landscape");
    expect(html).toContain("<title>سجل العلامات — واجب &lt;الكسور&gt;</title>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("سرّي");                                       // teacher feedback never leaves in an export
    expect(html).toContain('<td class="num">80</td>');
    expect(html).toContain("<footer>أُنشئ في 2026-10-16 12:00</footer>");
  });

  it("prints from a hidden iframe and removes it after printing", () => {
    const print = vi.fn(), append = document.body.appendChild.bind(document.body);
    const add = vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(n: T) => { const r = append(n); const w = (n as unknown as HTMLIFrameElement).contentWindow as unknown as { print?: () => void } | null; if (w) w.print = print; return r; });   // (happy-dom has no print dialog)
    expect(printReport({ title: "ت", meta: [], columns: ["أ"], rows: [["١"]], generatedAt: "x" })).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
    const frame = add.mock.results[0].value as HTMLIFrameElement;
    expect(frame.tagName).toBe("IFRAME");
    expect(frame.getAttribute("aria-hidden")).toBe("true");
    expect(frame.style.width).toBe("0px");
    expect(frame.contentDocument?.documentElement.getAttribute("dir")).toBe("rtl");
    frame.contentWindow!.dispatchEvent(new Event("afterprint"));
    return new Promise<void>(done => setTimeout(() => { expect(frame.isConnected).toBe(false); done(); }, 5));
  });
  it("gives up cleanly (no frame left) when the browser offers no print", () => {
    expect(printReport({ title: "ت", meta: [], columns: [], rows: [], generatedAt: "x" })).toBe(false);
    expect(document.querySelector("iframe")).toBeNull();
  });
});

describe("the reminder notification", () => {
  it("is accepted by the client and reads as the teacher's reminder with the deadline", () => {
    const item = notificationItemOf({ id: "e1", type: "assignment_reminder", createdAt: "x", unread: true, assignmentId: "a1", assignmentTitle: "واجب الكسور", dueAt: "2026-10-20T10:00:00Z" });
    expect(item).toMatchObject({ type: "assignment_reminder", assignmentId: "a1", dueAt: "2026-10-20T10:00:00Z" });
    const p = presentNotification(item!);
    expect(p.title).toBe("تذكير من المعلم");
    expect(p.preview).toMatch(/^لم تسلّم «واجب الكسور» بعد · آخر موعد .+/);
    expect(p.icon).toBe("deadline");
    expect(notificationItemOf({ id: "e2", type: "assignment_reminder", assignmentId: "" })).toBeNull();
  });
});
