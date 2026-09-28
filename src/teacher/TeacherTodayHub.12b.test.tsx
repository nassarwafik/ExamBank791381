// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import TeacherTodayHub, { type TeacherToday, type ProjectEvaluationAttention } from "./TeacherTodayHub";
import { recentActivityTarget, gradebookFilterFor } from "../assignments/drillTarget";

// Phase 12B — the attention / activity rows of the teacher's Today Hub become real buttons that hand App a TYPED target
// (exact assignment + gradebook intent, identifiers only). The card actions stay the generic «الواجبات»; without the new
// callback the rows stay plain text; the project-evaluation chain (9F → 9D → 9C → projects) is untouched.
const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const SUMMARY: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 3 },
  attention: {
    activeAttempts: { count: 2, items: [
      { assignmentId: "P2", title: "واجب P2", className: "صف 1", studentId: "s02", studentName: "طالب s02", startedAt: "2026-03-10T09:55:00.000Z", status: "started" },
      { assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s03", studentName: "طالب s03", startedAt: "2026-03-10T08:00:00.000Z", status: "paused" }] },
    notStarted: { count: 5, assignments: 2, items: [
      { assignmentId: "P2", title: "واجب P2", className: "صف 1", dueAt: "2026-03-15T10:00:00.000Z", notStarted: 4, expected: 6 },
      { assignmentId: "P1", title: "واجب P1", className: "صف 1", dueAt: "2026-03-20T10:00:00.000Z", notStarted: 1, expected: 6 }] },
    pendingReview: { count: 5, assignments: 2, items: [
      { assignmentId: "P1", title: "واجب P1", className: "صف 1", pendingReview: 3 },
      { assignmentId: "P3", title: "واجب P3", className: "صف 2", pendingReview: 2 }] },
    unreadMessages: { total: 0, capped: false }
  },
  recent: [
    { kind: "submitted", at: "2026-03-10T10:00:00.000Z", assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s01", studentName: "طالب s01", percentage: 92 },
    { kind: "started", at: "2026-03-10T09:55:00.000Z", assignmentId: "P2", title: "واجب P2", className: "صف 1", studentId: "s02", studentName: "طالب s02" },
    { kind: "teacherEnded", at: "2026-03-10T09:50:00.000Z", assignmentId: "P2", title: "واجب P2", className: "صف 1", studentId: "s05", studentName: "طالب s05", percentage: 40 },
    { kind: "mysteryKind", at: "2026-03-10T09:40:00.000Z", assignmentId: "P3", title: "واجب P3", className: "صف 2", studentId: "s06", studentName: "طالب s06" }],
  partial: []
};
const PE: ProjectEvaluationAttention = {
  studentsWithUngradedStages: 1, totalUngradedStages: 2, attentionTotal: 1, capped: false,
  projects: [{ projectCode: "899373", title: "AquaSense", studentsWithUngradedStages: 1, totalUngradedStages: 2 }],
  attention: [{ studentId: "s9", displayName: "ليان", classId: "c1", className: "صف c1", projectCode: "899373", projectTitle: "AquaSense", gradedStages: 5, totalStages: 7, ungradedStages: 2, evaluationProgress: 71 }]
};
let todayReads = 0;
beforeEach(() => {
  todayReads = 0;
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/teacher-today")) { todayReads++; return json({ ok: true, ...SUMMARY, projectEvaluation: PE }); }
    return json({ ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = (name: RegExp) => within(screen.getByRole("article", { name }));
const recent = () => within(screen.getByRole("region", { name: "آخر نشاط في صفوفك" }));
async function mount(extra: Partial<Parameters<typeof TeacherTodayHub>[0]> = {}) {
  const onNavigate = vi.fn(), onOpenAssignmentTarget = vi.fn();
  render(<TeacherTodayHub token="tok" onNavigate={onNavigate} onOpenAssignmentTarget={onOpenAssignmentTarget} {...extra} />);
  await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
  return { onNavigate, onOpenAssignmentTarget };
}

describe("12B Today Hub — attention rows are real buttons that emit a typed target", () => {
  it("1+2 an active-attempt row is a <button> that emits exactly {assignmentId, mode:'active', studentId} — one call, no navigation", async () => {
    const { onNavigate, onOpenAssignmentTarget } = await mount();
    const btn = card(/محاولات نشطة الآن/).getByRole("button", { name: "افتح واجب واجب P2 للطالب طالب s02 — محاولة جارية" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.getAttribute("type")).toBe("button");
    fireEvent.click(btn);
    expect(onOpenAssignmentTarget).toHaveBeenCalledTimes(1);
    expect(onOpenAssignmentTarget.mock.calls[0]).toEqual([{ assignmentId: "P2", mode: "active", studentId: "s02" }]);
    // the paused attempt names its real state
    fireEvent.click(card(/محاولات نشطة الآن/).getByRole("button", { name: "افتح واجب واجب P1 للطالب طالب s03 — محاولة متوقفة مؤقتًا" }));
    expect(onOpenAssignmentTarget.mock.calls[1]).toEqual([{ assignmentId: "P1", mode: "active", studentId: "s03" }]);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("3 a not-started row emits {assignmentId, mode:'notSubmitted'} — no student ids invented", async () => {
    const { onOpenAssignmentTarget } = await mount();
    fireEvent.click(card(/لم يبدؤوا بعد/).getByRole("button", { name: "افتح واجب واجب P2 — 4 طلاب لم يبدؤوا" }));
    expect(onOpenAssignmentTarget.mock.calls[0]).toEqual([{ assignmentId: "P2", mode: "notSubmitted" }]);
    fireEvent.click(card(/لم يبدؤوا بعد/).getByRole("button", { name: "افتح واجب واجب P1 — طالب واحد لم يبدأ" }));
    expect(onOpenAssignmentTarget.mock.calls[1]).toEqual([{ assignmentId: "P1", mode: "notSubmitted" }]);
  });
  it("4 a pending-review row emits {assignmentId, mode:'pendingReview'} — never a guessed attempt/student", async () => {
    const { onOpenAssignmentTarget } = await mount();
    fireEvent.click(card(/بانتظار التصحيح/).getByRole("button", { name: "افتح واجب واجب P1 — 3 تسليمات بانتظار التصحيح" }));
    fireEvent.click(card(/بانتظار التصحيح/).getByRole("button", { name: "افتح واجب واجب P3 — تسليمان بانتظار التصحيح" }));
    expect(onOpenAssignmentTarget.mock.calls).toEqual([[{ assignmentId: "P1", mode: "pendingReview" }], [{ assignmentId: "P3", mode: "pendingReview" }]]);
  });
  it("5 recent activity: each row is one button with the SAME text + time, and emits the safe target for its kind", async () => {
    const { onOpenAssignmentTarget } = await mount();
    const items = recent().getAllByRole("listitem");
    expect(items.length).toBe(4);
    const buttons = recent().getAllByRole("button");
    expect(buttons.length).toBe(4);
    expect(buttons[0].textContent).toContain("طالب s01 سلّم «واجب P1» · 92% · صف 1");
    expect(buttons[0].querySelector("time")?.getAttribute("dateTime")).toBe("2026-03-10T10:00:00.000Z");
    expect(buttons[0].getAttribute("aria-label")).toBe("افتح واجب واجب P1 — طالب s01 سلّم");
    buttons.forEach(b => fireEvent.click(b));
    expect(onOpenAssignmentTarget.mock.calls.map(c => c[0])).toEqual([
      { assignmentId: "P1", mode: "student", studentId: "s01" },           // submitted → that student's current row
      { assignmentId: "P2", mode: "active", studentId: "s02" },            // started → active, the destination decides if still running
      { assignmentId: "P2", mode: "student", studentId: "s05" },           // teacherEnded → that student's current row
      { assignmentId: "P3", mode: "assignment" },                          // unknown kind → the assignment only, no filter forced
    ]);
  });
  it("6 the card-level «الواجبات» buttons and the quick action still open the ordinary assignments destination", async () => {
    const { onNavigate, onOpenAssignmentTarget } = await mount();
    for (const name of [/محاولات نشطة الآن/, /لم يبدؤوا بعد/, /بانتظار التصحيح/]) fireEvent.click(card(name).getByRole("button", { name: "الواجبات" }));
    fireEvent.click(within(screen.getByRole("group", { name: "إجراءات سريعة" })).getByRole("button", { name: "الواجبات" }));
    expect(onNavigate.mock.calls.map(c => c[0])).toEqual(["assignments", "assignments", "assignments", "assignments"]);
    expect(onOpenAssignmentTarget).not.toHaveBeenCalled();
  });
  it("7 without the 12B callback the rows degrade to plain text (no buttons), the card actions still work", async () => {
    const onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} />);
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    for (const name of [/محاولات نشطة الآن/, /لم يبدؤوا بعد/, /بانتظار التصحيح/]) {
      const c = card(name);
      expect(c.getAllByRole("button").map(b => b.textContent)).toEqual(["الواجبات"]);   // only the card action
      expect(c.getAllByRole("listitem").every(li => li.classList.contains("eb-today-row"))).toBe(true);
    }
    expect(card(/محاولات نشطة الآن/).getByText("طالب s02")).toBeTruthy();                // same visible text as before
    expect(recent().queryAllByRole("button")).toEqual([]);
    expect(recent().getAllByRole("listitem")[0].className).toBe("eb-today-recent-item");
    fireEvent.click(card(/بانتظار التصحيح/).getByRole("button", { name: "الواجبات" }));
    expect(onNavigate).toHaveBeenCalledWith("assignments");
  });
  it("8 project evaluation keeps 9F → 9D → 9C → projects precedence; assignment rows never use the project callbacks", async () => {
    const onStartEvaluationQueue = vi.fn(), onOpenProjectStudent = vi.fn(), onOpenProject = vi.fn();
    const { onOpenAssignmentTarget, onNavigate } = await mount({ onStartEvaluationQueue, onOpenProjectStudent, onOpenProject });
    fireEvent.click(card(/تقييم المشاريع/).getByRole("button", { name: /لتقييم ليان/ }));
    expect(onStartEvaluationQueue).toHaveBeenCalledTimes(1);
    expect(onStartEvaluationQueue.mock.calls[0]).toEqual([[{ projectCode: "899373", classId: "c1", studentId: "s9", displayName: "ليان" }], 0]);
    expect(onOpenProjectStudent).not.toHaveBeenCalled(); expect(onOpenProject).not.toHaveBeenCalled();
    expect(onOpenAssignmentTarget).not.toHaveBeenCalled();
    fireEvent.click(card(/بانتظار التصحيح/).getByRole("button", { name: /واجب P1 — 3 تسليمات/ }));
    expect(onOpenAssignmentTarget).toHaveBeenCalledTimes(1);
    expect(onStartEvaluationQueue).toHaveBeenCalledTimes(1); expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(card(/تقييم المشاريع/).getByRole("button", { name: "المشاريع" }));
    expect(onNavigate).toHaveBeenCalledWith("projects");
  });
  it("9 no nested interactive controls: every row button holds only text/time, never another control; cards are not clickable", async () => {
    await mount();
    const hub = screen.getByRole("region", { name: "ما الذي يحتاج انتباهي الآن؟" });
    for (const b of hub.querySelectorAll("button")) {
      expect(b.querySelector("button, a, input, select, textarea, [tabindex]"), b.textContent || "").toBeNull();
      expect(b.parentElement?.closest("button"), b.textContent || "").toBeNull();
    }
    for (const art of hub.querySelectorAll("article")) { expect(art.getAttribute("onclick")).toBeNull(); expect(art.getAttribute("role")).toBeNull(); expect(art.hasAttribute("tabindex")).toBe(false); }
    // every actionable row is a semantic <button type=button> (not a clickable div/span)
    for (const el of hub.querySelectorAll(".eb-today-row-action, .eb-today-recent-action")) { expect(el.tagName).toBe("BUTTON"); expect(el.getAttribute("type")).toBe("button"); }
    expect(hub.querySelectorAll(".eb-today-row-action").length).toBe(6);             // 2 active + 2 not started + 2 pending
    expect(hub.querySelectorAll(".eb-today-recent-action").length).toBe(4);
  });
  it("10 accessible Arabic labels name student + assignment + state and never expose internal ids", async () => {
    await mount();
    const labels = [...document.querySelectorAll(".eb-today-row-action, .eb-today-recent-action")].map(b => b.getAttribute("aria-label") || "");
    // exactly the visible title / name / state words — nothing else (no ids, keys or internal fields)
    expect(labels).toEqual([
      "افتح واجب واجب P2 للطالب طالب s02 — محاولة جارية",
      "افتح واجب واجب P1 للطالب طالب s03 — محاولة متوقفة مؤقتًا",
      "افتح واجب واجب P2 — 4 طلاب لم يبدؤوا",
      "افتح واجب واجب P1 — طالب واحد لم يبدأ",
      "افتح واجب واجب P1 — 3 تسليمات بانتظار التصحيح",
      "افتح واجب واجب P3 — تسليمان بانتظار التصحيح",
      "افتح واجب واجب P1 — طالب s01 سلّم",
      "افتح واجب واجب P2 — طالب s02 بدأ محاولة",
      "افتح واجب واجب P2 — طالب s05 أنهى المعلم محاولته",
      "افتح واجب واجب P3 — طالب s06 mysteryKind",
    ]);
    for (const l of labels) expect(l).not.toMatch(/assignmentId|studentId|:/);
  });
  it("performance: rows add NO request — one Today read, clicks issue nothing", async () => {
    await mount();
    const before = (globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    for (const b of document.querySelectorAll<HTMLButtonElement>(".eb-today-row-action, .eb-today-recent-action")) fireEvent.click(b);
    expect((globalThis.fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(before);
    expect(todayReads).toBe(1);
  });
});

describe("12B drill contract helpers (pure)", () => {
  it("modes map onto Gradebook's EXISTING filters only", () => {
    expect(gradebookFilterFor("active")).toBe("active");
    expect(gradebookFilterFor("notSubmitted")).toBe("notSubmitted");
    expect(gradebookFilterFor("pendingReview")).toBe("pendingReview");
    expect(gradebookFilterFor("student")).toBe("all");
    expect(gradebookFilterFor("assignment")).toBe("all");
  });
  it("recent events never infer grading state from the event name; missing ids degrade safely", () => {
    expect(recentActivityTarget({ kind: "submitted", assignmentId: "A", studentId: "s" })).toEqual({ assignmentId: "A", mode: "student", studentId: "s" });
    expect(recentActivityTarget({ kind: "timedOut", assignmentId: "A", studentId: "s" })).toEqual({ assignmentId: "A", mode: "student", studentId: "s" });
    expect(recentActivityTarget({ kind: "integrityExit", assignmentId: "A", studentId: "s" })).toEqual({ assignmentId: "A", mode: "student", studentId: "s" });
    expect(recentActivityTarget({ kind: "started", assignmentId: "A", studentId: "s" })).toEqual({ assignmentId: "A", mode: "active", studentId: "s" });
    expect(recentActivityTarget({ kind: "started", assignmentId: "A", studentId: "" })).toEqual({ assignmentId: "A", mode: "assignment" });
    expect(recentActivityTarget({ kind: "submitted", assignmentId: "", studentId: "s" })).toBeNull();
  });
});
