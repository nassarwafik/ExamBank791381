// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import AssignmentsPanel from "./AssignmentsPanel";
import type { AssignmentDrill, AssignmentDrillTarget } from "./assignments/drillTarget";

// Phase 12B — the assignments workspace consumes App's sequenced drill target ONCE against its own authoritative data:
// it waits for the assignment list, brings the exact assignment into the master scope (its class), opens it through the
// SAME single results read as «فتح», applies the EXISTING gradebook filter for the intent and (optionally) marks the
// requested student — then the teacher owns every control. Stale / missing targets degrade calmly; newest intent wins.
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true }, { classId: "c2", name: "العاشر", grade: "10", active: true }];
const A = (assignmentId: string, classId: string, title: string, status = "published") => ({ assignmentId, classId, className: classId === "c1" ? "الحادي عشر" : "العاشر", title, instructions: "x", status, openAt: "", dueAt: "", questionCount: 1, totalMarks: 100, maxAttempts: 3, durationMinutes: 0 });
const ASSIGNMENTS = [A("a1", "c1", "واجب الحادي عشر"), A("a2", "c2", "واجب العاشر"), A("a3", "c2", "واجب مؤرشف", "archived"), A("a4", "c1", "واجب ثانٍ للحادي عشر")];
const lr = (over: Record<string, unknown>) => ({ attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview", ...over });
const finalLR = lr({ score: 90, percentage: 90, finalized: true, manualReviewMarks: 0, gradingStatus: "final" });
const student = (studentId: string, studentName: string, kind: "pending" | "final" | "none" | "active") => ({
  studentId, studentName, studentCode: studentId.toUpperCase(), attemptsUsed: kind === "none" ? 0 : 1, allowedAttempts: 3, dueAtOverride: null,
  attemptStatus: kind === "active" ? "started" : kind === "none" ? "notStarted" : "submitted",
  gradingStatus: kind === "pending" ? "pendingReview" : kind === "none" ? "notSubmitted" : "final",
  activeAttempt: kind === "active" ? { attemptNumber: 2, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "", status: "started" } : null,
  attempts: kind === "none" ? [] : [kind === "pending" ? lr({}) : finalLR], latestResult: kind === "none" ? null : kind === "pending" ? lr({}) : finalLR,
});
const ROSTER = [student("s1", "زيد", "pending"), student("s2", "خالد", "final"), student("s3", "سعد", "none"), student("s4", "عمر", "active")];
const STATS = { students: 4, submitted: 3, pendingReview: 1, finalized: 2, notSubmitted: 1, active: 1, average: 72, highest: 90, lowest: 62 };

type Deferred = { promise: Promise<Response>; resolve: () => void };
let calls: { url: string; method: string }[] = [];
let listGate: Deferred | null = null;
const resultGates = new Map<string, Deferred>();
let roster: ReturnType<typeof student>[] = ROSTER;
let assignments = ASSIGNMENTS;
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
function defer(body: () => unknown): Deferred { let resolve!: () => void; const promise = new Promise<Response>(r => { resolve = () => r(ok(body())); }); return { promise, resolve }; }
function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/api/assignments") && method === "GET") return listGate ? listGate.promise : Promise.resolve(ok({ ok: true, assignments }));
    if (url.includes("/api/saved-exams")) return Promise.resolve(ok({ ok: true, exams: [] }));
    if (url.includes("/api/assignment-results") && method === "GET") {
      const id = new URL(url, "http://x").searchParams.get("assignmentId") || "";
      const gate = resultGates.get(id);
      const body = { ok: true, stats: STATS, students: roster };
      return gate ? gate.promise : Promise.resolve(ok(body));
    }
    return Promise.resolve(ok({ ok: true }));
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  calls = []; listGate = null; resultGates.clear(); roster = ROSTER; assignments = ASSIGNMENTS;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const drill = (seq: number, t: AssignmentDrillTarget): AssignmentDrill => ({ ...t, seq });
const resultsReads = (id?: string) => calls.filter(c => c.method === "GET" && c.url.includes("/api/assignment-results") && (!id || c.url.includes("assignmentId=" + id))).length;
const detailTitle = () => document.querySelector("#eb-assign-detail-title")?.textContent ?? null;
const chip = (label: string) => screen.getByText(label, { selector: ".gradebook-chip" });
const pressedChip = () => [...document.querySelectorAll(".gradebook-chip")].filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.textContent);
const shownStudents = () => [...document.querySelectorAll(".eb-gradebook-table tbody tr td:first-child strong")].map(s => s.textContent);
const classSelect = () => screen.getByLabelText("الصف") as HTMLSelectElement;
function mount(d: AssignmentDrill | null, onDrillConsumed = vi.fn()) {
  const view = render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} drill={d} onDrillConsumed={onDrillConsumed} />);
  return { ...view, onDrillConsumed, rerenderDrill: (next: AssignmentDrill | null) => view.rerender(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} drill={next} onDrillConsumed={onDrillConsumed} />) };
}

describe("12B AssignmentsPanel — a drill opens the exact assignment in the useful gradebook state", () => {
  it("11+12 pendingReview: the exact assignment (another class than the default filter) is selected and the EXISTING «بانتظار التصحيح» filter is applied", async () => {
    const { onDrillConsumed } = mount(drill(1, { assignmentId: "a2", mode: "pendingReview" }));
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"));
    expect(classSelect().value).toBe("c2");                                        // scope moved to the assignment's own class
    const row = screen.getByText("واجب العاشر", { selector: "strong" }).closest("li")!;
    expect(row.className).toContain("selected");
    expect(within(row).getByRole("button", { name: "فتح" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    expect(shownStudents()).toEqual(["زيد"]);
    expect(onDrillConsumed).toHaveBeenCalledTimes(1);
    expect(onDrillConsumed).toHaveBeenCalledWith(1);
    expect(resultsReads("a2")).toBe(1);
  });
  it("13 active + student: the «قيد المحاولة» filter and the requested student's row is marked (aria-current + text tag)", async () => {
    mount(drill(1, { assignmentId: "a1", mode: "active", studentId: "s4" }));
    await waitFor(() => expect(pressedChip()).toEqual(["قيد المحاولة"]));
    expect(shownStudents()).toEqual(["عمر"]);
    const focused = document.querySelector("tr[aria-current='true']")!;
    expect(focused).toBeTruthy();
    expect(within(focused as HTMLElement).getByText("عمر")).toBeTruthy();
    expect(within(focused as HTMLElement).getByText("الطالب المطلوب")).toBeTruthy();
    expect(focused.className).toContain("is-drill-focus");
  });
  it("14 notSubmitted: the «لم يسلّم» filter; no student is focused", async () => {
    mount(drill(1, { assignmentId: "a1", mode: "notSubmitted" }));
    await waitFor(() => expect(pressedChip()).toEqual(["لم يسلّم"]));
    expect(shownStudents()).toEqual(["سعد"]);
    expect(document.querySelector("tr[aria-current]")).toBeNull();
  });
  it("15 student mode uses the AUTHORITATIVE rows: all rows shown, that student marked; an ended attempt shows its current state with a calm note", async () => {
    mount(drill(1, { assignmentId: "a1", mode: "student", studentId: "s2" }));
    await waitFor(() => expect(document.querySelector("tr[aria-current='true']")?.textContent).toContain("خالد"));
    expect(pressedChip()).toEqual(["الكل"]);
    expect(shownStudents().sort()).toEqual(["خالد", "زيد", "سعد", "عمر"].sort());
    cleanup(); calls = [];
    // stale Today row: s4's attempt has ended since Today was read → still opens safely, shows the current row, no error
    roster = ROSTER.map(s => s.studentId === "s4" ? student("s4", "عمر", "final") : s);
    mount(drill(2, { assignmentId: "a1", mode: "active", studentId: "s4" }));
    await waitFor(() => expect(document.querySelector("tr[aria-current='true']")?.textContent).toContain("عمر"));
    expect(pressedChip()).toEqual(["الكل"]);
    expect(screen.getByText("لم تعد محاولة عمر جارية؛ تُعرض حالته الحالية.").getAttribute("role")).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("16 a missing or archived assignment degrades safely: calm note, no other assignment selected, no results read", async () => {
    mount(drill(1, { assignmentId: "gone", mode: "pendingReview" }));
    expect(await screen.findByText(/تعذر فتح الواجب المطلوب لأنه لم يعد متاحًا/)).toBeTruthy();
    expect(detailTitle()).toBeNull();
    expect(resultsReads()).toBe(0);
    expect(document.querySelector(".eb-assign-row.selected")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup(); calls = [];
    mount(drill(2, { assignmentId: "a3", mode: "pendingReview" }));                // archived since Today was read
    expect(await screen.findByText(/تعذر فتح الواجب المطلوب/)).toBeTruthy();
    expect(detailTitle()).toBeNull();
    expect(resultsReads()).toBe(0);
  });
  it("17 a drill that arrives while the list is still loading waits for the authoritative list, then applies (never a false «not found»)", async () => {
    listGate = defer(() => ({ ok: true, assignments }));
    const { onDrillConsumed } = mount(drill(1, { assignmentId: "a2", mode: "pendingReview" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onDrillConsumed).not.toHaveBeenCalled();
    expect(screen.queryByText(/تعذر فتح الواجب المطلوب/)).toBeNull();
    expect(resultsReads()).toBe(0);
    await act(async () => { listGate!.resolve(); });
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"));
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    expect(onDrillConsumed).toHaveBeenCalledWith(1);
  });
  it("18 newest intent wins: an older target's results arriving AFTER a newer target never overwrite it", async () => {
    resultGates.set("a1", defer(() => ({ ok: true, stats: STATS, students: roster })));
    const view = mount(drill(1, { assignmentId: "a1", mode: "notSubmitted" }));
    await waitFor(() => expect(resultsReads("a1")).toBe(1));                     // a1's read is in flight
    view.rerenderDrill(drill(2, { assignmentId: "a2", mode: "pendingReview" }));
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"));
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    await act(async () => { resultGates.get("a1")!.resolve(); });                  // the stale response lands last
    await act(async () => { await Promise.resolve(); });
    expect(detailTitle()).toBe("واجب العاشر");
    expect(pressedChip()).toEqual(["بانتظار التصحيح"]);
    expect(view.onDrillConsumed.mock.calls).toEqual([[1], [2]]);
  });
  it("18b newest intent wins within the SAME class too (the scope check cannot mask it): the older read is discarded by sequence", async () => {
    resultGates.set("a1", defer(() => ({ ok: true, stats: STATS, students: roster })));
    const view = mount(drill(1, { assignmentId: "a1", mode: "notSubmitted" }));
    await waitFor(() => expect(resultsReads("a1")).toBe(1));
    view.rerenderDrill(drill(2, { assignmentId: "a4", mode: "pendingReview" }));    // same class c1
    await waitFor(() => expect(detailTitle()).toBe("واجب ثانٍ للحادي عشر"));
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    await act(async () => { resultGates.get("a1")!.resolve(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(detailTitle()).toBe("واجب ثانٍ للحادي عشر");                              // never snapped back to a1
    expect(pressedChip()).toEqual(["بانتظار التصحيح"]);                             // a1's «لم يسلّم» never applied
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("19 after consumption the teacher owns the controls: a manual filter change survives re-renders, a list refresh and the same drill again", async () => {
    const view = mount(drill(1, { assignmentId: "a1", mode: "pendingReview" }));
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    fireEvent.click(chip("الكل"));
    expect(pressedChip()).toEqual(["الكل"]);
    view.rerenderDrill(drill(1, { assignmentId: "a1", mode: "pendingReview" }));   // same (consumed) target re-passed
    fireEvent.click(screen.getByRole("button", { name: "المزيد من إجراءات الواجبات" }));
    fireEvent.click(await screen.findByRole("button", { name: /تحديث/ }));        // authoritative list refresh
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(pressedChip()).toEqual(["الكل"]);
    expect(resultsReads("a1")).toBe(1);                                            // never re-opened by the old target
    expect(view.onDrillConsumed).toHaveBeenCalledTimes(1);
  });
  it("20 no replay: remounting after App cleared the target (leaving / re-entering assignments) opens nothing; a manual open clears the focus", async () => {
    const first = mount(drill(1, { assignmentId: "a1", mode: "active", studentId: "s4" }));
    await waitFor(() => expect(document.querySelector("tr[aria-current='true']")).toBeTruthy());
    first.unmount(); calls = [];
    mount(null);                                                                   // App cleared it on consumption / navigation
    await screen.findByText("واجب الحادي عشر", { selector: "strong" });
    await act(async () => { await Promise.resolve(); });
    expect(detailTitle()).toBeNull();
    expect(resultsReads()).toBe(0);
    fireEvent.click(within(screen.getByText("واجب الحادي عشر", { selector: "strong" }).closest("li")!).getByRole("button", { name: "فتح" }));
    await waitFor(() => expect(detailTitle()).toBe("واجب الحادي عشر"));
    expect(pressedChip()).toEqual(["الكل"]);
    expect(document.querySelector("tr[aria-current]")).toBeNull();
  });
  it("request parity: a drill costs exactly what a manual «فتح» costs — one list read, one saved-exams read, one results read", async () => {
    mount(drill(1, { assignmentId: "a2", mode: "pendingReview" }));
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]));
    const drilled = { list: calls.filter(c => c.url.includes("/api/assignments") && c.method === "GET").length, saved: calls.filter(c => c.url.includes("/api/saved-exams")).length, results: resultsReads() };
    cleanup(); calls = [];
    mount(null);
    fireEvent.change(await screen.findByLabelText("الصف"), { target: { value: "c2" } });
    fireEvent.click(within((await screen.findByText("واجب العاشر", { selector: "strong" })).closest("li")!).getByRole("button", { name: "فتح" }));
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"));
    const manual = { list: calls.filter(c => c.url.includes("/api/assignments") && c.method === "GET").length, saved: calls.filter(c => c.url.includes("/api/saved-exams")).length, results: resultsReads() };
    expect(drilled).toEqual({ list: 1, saved: 1, results: 1 });
    expect(manual).toEqual(drilled);
    expect(calls.some(c => c.url.includes("/api/teacher-today"))).toBe(false);
  });
});
