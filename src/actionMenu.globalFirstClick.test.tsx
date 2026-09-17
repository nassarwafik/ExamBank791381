// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("react-chartjs-2", () => ({
  Bar: () => <canvas data-chart="bar" />, Line: () => <canvas data-chart="line" />, Doughnut: () => <canvas data-chart="doughnut" />
}));

import ActionMenu from "./ui/ActionMenu";
import ClassesPane from "./students/ClassesPane";
import TeacherPlatform from "./TeacherPlatform";
import AssignmentsPanel from "./AssignmentsPanel";
import ProjectTracker from "./projects/ProjectTracker";
import type { Classroom, Student } from "./students/types";

/*
 * Final Acceptance — GLOBAL ActionMenu first-click regression.
 *
 * Owner-observed (every ⋯ on the site): click 1 jumps the page, click 2 looks inert, click 3 opens. Root cause in the
 * shared primitive: the portal used to mount with an EMPTY style (in normal flow at the end of <body>), the layout
 * effect focused the first control BEFORE the fixed coordinates were committed, the browser scrolled the document to
 * that control, and the menu's own scroll listener then closed it. happy-dom never scrolls on focus, so the failure
 * is instrumented here: `HTMLElement.prototype.focus` is patched to record, at the exact instant of every focus call
 * inside a menu panel, the panel's inline position / visibility / readiness and the FocusOptions — and to simulate
 * the browser consequence (an asynchronous document scroll event) whenever focus is requested without
 * `{ preventScroll: true }` or while the panel is not yet fixed and revealed. Under that instrumentation the old
 * implementation loses the menu after ONE click; the fixed one keeps it open.
 */

type FocusRecord = { inPanel: boolean; preventScroll: boolean; position: string; visibility: string; pointerEvents: string; ready: string | null; top: string };
let focusLog: FocusRecord[] = [];
let simulatedScrolls = 0;
let restoreFocus: (() => void) | null = null;
function installBrowserFocus() {
  const original = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    const panel = this.closest(".eb-menu-panel") as HTMLElement | null;
    if (panel) {
      const rec: FocusRecord = { inPanel: true, preventScroll: options?.preventScroll === true, position: panel.style.position, visibility: panel.style.visibility, pointerEvents: panel.style.pointerEvents, ready: panel.getAttribute("data-ready"), top: panel.style.top };
      focusLog.push(rec);
      const safe = rec.preventScroll && rec.position === "fixed" && rec.visibility !== "hidden";
      if (!safe) { simulatedScrolls++; setTimeout(() => window.dispatchEvent(new Event("scroll")), 0); }   // what a real browser does
    }
    return original.call(this, options);
  };
  restoreFocus = () => { HTMLElement.prototype.focus = original; };
}
const settle = () => new Promise(r => setTimeout(r, 15));               // lets any simulated scroll (or a real listener) land
const panelOf = (label: string) => screen.queryByRole("group", { name: label });
const inPanel = (label: string) => { const p = panelOf(label); return !!p && p.contains(document.activeElement); };

beforeEach(() => { focusLog = []; simulatedScrolls = 0; installBrowserFocus(); (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
afterEach(() => { cleanup(); restoreFocus?.(); restoreFocus = null; vi.restoreAllMocks(); });

function LongPage({ children }: { children: React.ReactNode }) {
  return <div>{Array.from({ length: 60 }, (_, i) => <p key={i} style={{ height: 40 }}>سطر {i + 1}</p>)}{children}<p style={{ height: 2000 }}>ذيل الصفحة</p></div>;
}
function Menu({ label = "إجراءات", onA = () => {}, onB = () => {} }: { label?: string; onA?: () => void; onB?: () => void }) {
  return <ActionMenu label={label}><button type="button" className="eb-menu-item" onClick={onA}>تعديل</button><button type="button" className="eb-menu-item" onClick={onB}>أرشفة</button></ActionMenu>;
}

describe("Shared ActionMenu — one click opens, positioned before focus, no opening scroll", () => {
  it("regression: ONE click on ⋯ on a long page leaves the menu open with its first action focused; focus was requested with preventScroll on an already-fixed, revealed panel; no simulated scroll", async () => {
    render(<LongPage><Menu /></LongPage>);
    const trigger = screen.getByRole("button", { name: "إجراءات" });
    const before = document.activeElement;
    fireEvent.click(trigger);                                            // exactly ONE click
    await settle();
    expect(panelOf("إجراءات")).not.toBeNull();                          // still open after the browser would have scrolled
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "تعديل" }));
    expect(document.activeElement).not.toBe(before);
    expect(focusLog).toHaveLength(1);
    expect(focusLog[0]).toMatchObject({ inPanel: true, preventScroll: true, position: "fixed", ready: "true" });
    expect(focusLog[0].visibility).not.toBe("hidden");
    expect(focusLog[0].pointerEvents).not.toBe("none");
    expect(focusLog[0].top).not.toBe("");                               // final coordinates already applied at focus time
    expect(simulatedScrolls).toBe(0);
  });

  it("the portal never participates in document flow: the panel's inline style carries position:fixed in every observed state", async () => {
    render(<LongPage><Menu /></LongPage>);
    fireEvent.click(screen.getByRole("button", { name: "إجراءات" }));
    const panel = panelOf("إجراءات") as HTMLElement;
    expect(panel.parentElement).toBe(document.body);                    // portal target unchanged
    expect(panel.style.position).toBe("fixed");
    expect(panel.getAttribute("data-ready")).toBe("true");
    expect(panel.style.visibility).not.toBe("hidden");
    expect(focusLog.every(r => r.position === "fixed")).toBe(true);
  });

  it("a genuine document scroll or resize AFTER the menu is open still closes it (listener preserved)", async () => {
    render(<LongPage><Menu /></LongPage>);
    fireEvent.click(screen.getByRole("button", { name: "إجراءات" }));
    await settle();
    expect(panelOf("إجراءات")).not.toBeNull();
    window.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(panelOf("إجراءات")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "إجراءات" }));
    await settle();
    expect(panelOf("إجراءات")).not.toBeNull();
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => expect(panelOf("إجراءات")).toBeNull());
  });

  it("repeated open/close: Escape, outside click, item activation — every reopen needs exactly ONE click, re-measures, and focuses the first action", async () => {
    const onA = vi.fn();
    render(<LongPage><button type="button">خارج</button><Menu onA={onA} /></LongPage>);
    const trigger = screen.getByRole("button", { name: "إجراءات" });
    const openOnce = async () => { fireEvent.click(trigger); await settle(); expect(panelOf("إجراءات")).not.toBeNull(); expect(inPanel("إجراءات")).toBe(true); expect((panelOf("إجراءات") as HTMLElement).getAttribute("data-ready")).toBe("true"); };
    await openOnce();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await openOnce();
    fireEvent.mouseDown(screen.getByRole("button", { name: "خارج" }));
    await waitFor(() => expect(panelOf("إجراءات")).toBeNull());
    await openOnce();
    fireEvent.click(screen.getByRole("button", { name: "تعديل" }));
    expect(onA).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(panelOf("إجراءات")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    await openOnce();
    expect(focusLog).toHaveLength(4);                                    // one first-action focus per open
    expect(focusLog.every(r => r.preventScroll && r.position === "fixed" && r.ready === "true")).toBe(true);
    expect(simulatedScrolls).toBe(0);
  });

  it("multiple menus: opening one never moves focus to another; closing A then opening B uses B's coordinates; focus returns to the right trigger", async () => {
    render(<LongPage><Menu label="إجراءات أ" /><Menu label="إجراءات ب" /></LongPage>);
    const a = screen.getByRole("button", { name: "إجراءات أ" }), b = screen.getByRole("button", { name: "إجراءات ب" });
    const rect = (el: HTMLElement, top: number, left: number, w = 36, h = 36) => vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top, left, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} } as DOMRect);
    rect(a, 100, 900); rect(b, 300, 500);
    fireEvent.click(a); await settle();
    expect(panelOf("إجراءات أ")).not.toBeNull(); expect(panelOf("إجراءات ب")).toBeNull();
    expect(inPanel("إجراءات أ")).toBe(true);
    const panelA = panelOf("إجراءات أ") as HTMLElement;
    expect(panelA.style.top).toBe(100 + 36 + 4 + "px");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات أ")).toBeNull());
    expect(document.activeElement).toBe(a);
    fireEvent.click(b); await settle();
    expect(panelOf("إجراءات ب")).not.toBeNull(); expect(panelOf("إجراءات أ")).toBeNull();
    expect(inPanel("إجراءات ب")).toBe(true);
    expect(document.activeElement).not.toBe(a);
    const panelB = panelOf("إجراءات ب") as HTMLElement;
    expect(panelB.style.top).toBe(300 + 36 + 4 + "px");                 // B's own measurement, not A's
    expect(panelB.style.right).toBe(Math.max(4, window.innerWidth - (500 + 36)) + "px");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات ب")).toBeNull());
    expect(document.activeElement).toBe(b);
    expect(simulatedScrolls).toBe(0);
  });

  it("positioning stays stable: below when there is room, flips upward near the viewport bottom, clamps at the inline edge in RTL, keeps maxHeight", async () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    render(<LongPage><Menu label="إجراءات أ" /><Menu label="إجراءات ب" /></LongPage>);
    const a = screen.getByRole("button", { name: "إجراءات أ" }), b = screen.getByRole("button", { name: "إجراءات ب" });
    const panelRect = vi.spyOn(HTMLDivElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return (this.classList.contains("eb-menu-panel") ? { top: 0, left: 0, right: 220, bottom: 200, width: 220, height: 200, x: 0, y: 0, toJSON() {} } : { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} }) as DOMRect;
    });
    const rect = (el: HTMLElement, top: number, left: number, w = 36, h = 36) => vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top, left, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} } as DOMRect);
    rect(a, vh - 60, 40);                                                // near the bottom AND near the left edge (RTL inline-end clamp)
    fireEvent.click(a); await settle();
    const pa = panelOf("إجراءات أ") as HTMLElement;
    expect(pa.style.top).toBe(Math.max(4, vh - 60 - 4 - 200) + "px");    // flipped upward
    expect(pa.style.right).toBe(Math.max(4, vw - 220 - 4) + "px");        // clamped so the 220px panel stays inside the viewport
    expect(pa.style.maxHeight).toBe(Math.max(120, vh - 8) + "px");
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات أ")).toBeNull());
    rect(b, 100, vw - 60);                                               // room below, at the right edge
    fireEvent.click(b); await settle();
    const pb = panelOf("إجراءات ب") as HTMLElement;
    expect(pb.style.top).toBe(100 + 36 + 4 + "px");
    expect(pb.style.right).toBe(Math.max(4, vw - (vw - 60 + 36)) + "px");
    panelRect.mockRestore();
    expect(simulatedScrolls).toBe(0);
  });
});

describe("Classes — class ⋯ opens on the first click without selecting the class", () => {
  const cls = (classId: string, name: string, over: Partial<Classroom> = {}): Classroom => ({ classId, name, grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 3, createdAt: "2026-01-01", ...over } as Classroom);
  it("one click → correct class menu open, first action (project checkbox) focused, no onSelect, no scroll", async () => {
    const onSelect = vi.fn(), onToggleProject = vi.fn();
    const rows = [cls("c1", "الحادي عشر 3"), cls("c2", "العاشر 1")];
    render(<LongPage><ClassesPane classes={rows} view="active" onViewChange={vi.fn()} activeCount={2} archivedCount={0} selectedClassId="c2" onSelect={onSelect} projects={[{ projectCode: "899373", title: "مشروع الكتاب" }]} projectTitle={() => "مشروع الكتاب"} isGraduationEligible={() => false} onToggleProject={onToggleProject} onToggleArchive={vi.fn()} onGraduate={vi.fn()} onCreate={vi.fn()} onRefresh={vi.fn()} loading={false} busy={false} fmtDate={v => v} /></LongPage>);
    const li = screen.getByText("الحادي عشر 3").closest("li") as HTMLElement;
    fireEvent.click(within(li).getByRole("button", { name: "إجراءات الصف الحادي عشر 3" }));
    await settle();
    const menu = panelOf("إجراءات الصف الحادي عشر 3") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(document.activeElement).toBe(within(menu).getByLabelText("مشروع الكتاب"));
    expect(onSelect).not.toHaveBeenCalled();                              // the layered trigger never reaches the stretched card target
    expect(panelOf("إجراءات الصف العاشر 1")).toBeNull();
    expect(simulatedScrolls).toBe(0);
    expect(focusLog).toEqual([expect.objectContaining({ preventScroll: true, position: "fixed", ready: "true" })]);
  });
});

describe("Students — long roster, ⋯ on the first click, edit dialog focus chain, second student", () => {
  const CLASSES = [{ classId: "c1", name: "الحادي عشر 3", grade: "11", schoolYear: "2026", active: true, status: "active", studentCount: 24, createdAt: "2026-01-03", programCodes: [] }];
  const stu = (i: number): Student => ({ userId: "s" + i, code: String(100000000 + i), displayName: "طالب " + i + " عائلة", firstName: "طالب " + i, familyName: "عائلة", identityNumber: String(100000000 + i), classId: "c1", className: "الحادي عشر 3", active: true, archived: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 } as Student);
  const ROSTER = Array.from({ length: 24 }, (_, i) => stu(i + 1));
  let calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = (init?.method || "GET").toUpperCase();
      let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
      calls.push({ url, method, body });
      const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
      if (url.includes("/api/project-tracker")) return json({ ok: true, projects: [] });
      if (url.includes("/api/classrooms")) return json({ ok: true, classes: CLASSES });
      if (url.includes("/api/students") && method === "GET") return json({ ok: true, students: ROSTER });
      return json({ ok: true });
    }) as unknown as typeof fetch;
  });
  const rowOf = (firstName: string) => screen.getByText(firstName).closest("tr") as HTMLElement;
  const triggerOf = (firstName: string) => within(rowOf(firstName)).getByRole("button", { name: "إجراءات " + firstName + " عائلة" });
  async function mount() {
    render(<TeacherPlatform token="t" currentExam={null} workspaceTab="students" />);
    await screen.findByText("طالب 24");
    await waitFor(() => expect(calls.some(c => c.url.includes("/api/students"))).toBe(true));
    calls = [];
  }

  it("A: one click opens A's menu immediately (no scroll) → تعديل opens the dialog with A's values → cancel returns focus to A's ⋯; then B: one click, B's menu, no stale focus/coordinates; نسخ works on the first opening", async () => {
    await mount();
    const a = "طالب 20", b = "طالب 21";                                  // deep in the long roster
    fireEvent.click(triggerOf(a)); await settle();
    expect(panelOf("إجراءات " + a + " عائلة")).not.toBeNull();
    expect(inPanel("إجراءات " + a + " عائلة")).toBe(true);
    expect(simulatedScrolls).toBe(0);
    fireEvent.click(within(panelOf("إجراءات " + a + " عائلة") as HTMLElement).getByRole("button", { name: "تعديل" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل تفاصيل الطالب" });
    expect((within(dialog).getByLabelText("الاسم") as HTMLInputElement).value).toBe(a);
    expect((within(dialog).getByLabelText("رقم الهوية") as HTMLInputElement).value).toBe("100000020");
    expect(panelOf("إجراءات " + a + " عائلة")).toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));   // the dialog owns focus, not the menu close
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "تعديل تفاصيل الطالب" })).toBeNull());
    expect(document.activeElement).toBe(triggerOf(a));
    // student B
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    fireEvent.click(triggerOf(b)); await settle();
    const menuB = panelOf("إجراءات " + b + " عائلة") as HTMLElement;
    expect(menuB).not.toBeNull();
    expect(menuB.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(triggerOf(a));
    expect(panelOf("إجراءات " + a + " عائلة")).toBeNull();
    expect(menuB.style.position).toBe("fixed"); expect(menuB.getAttribute("data-ready")).toBe("true");
    fireEvent.click(within(menuB).getByRole("button", { name: "نسخ رقم الهوية" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("100000021");
    expect(calls.filter(c => c.method === "POST")).toEqual([]);
    expect(simulatedScrolls).toBe(0);
    expect(focusLog.filter(r => r.inPanel)).toHaveLength(2);
    expect(focusLog.every(r => r.preventScroll && r.position === "fixed" && r.ready === "true")).toBe(true);
  });
});

describe("Assignments — row ⋯ and toolbar ⋯ open on the first click with their actions intact", () => {
  const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", status: "active", active: true, studentCount: 4 }];
  const A1 = { assignmentId: "a1", classId: "c1", className: "الحادي عشر", title: "اختبار الكسور", instructions: "x", status: "published", openAt: "2026-02-01T08:00:00.000Z", dueAt: "2026-03-01T10:00:00.000Z", questionCount: 5, totalMarks: 100, maxAttempts: 3, durationMinutes: 90 };
  const A2 = { ...A1, assignmentId: "a2", title: "واجب الجبر", status: "draft", durationMinutes: 0, maxAttempts: 1 };
  let calls: { url: string; method: string }[] = [];
  beforeEach(() => {
    calls = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = (init?.method || "GET").toUpperCase();
      calls.push({ url, method });
      const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
      if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [A1, A2] });
      if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
      if (url === "/api/exam-library") return json({ ok: true, catalog: [] });
      return json({ ok: true });
    }) as unknown as typeof fetch;
  });
  it("published row: one click → menu with إيقاف النشر / تعديل عدد المحاولات / أرشفة, first action focused, no request, no row selection, no scroll; draft row and toolbar ⋯ likewise", async () => {
    render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} />);
    await screen.findByText("اختبار الكسور");
    calls = [];
    const row = screen.getByText("اختبار الكسور").closest(".assignment-row") as HTMLElement;
    const openBtn = within(row).getByRole("button", { name: "فتح" });
    fireEvent.click(within(row).getByRole("button", { name: "إجراءات الواجب اختبار الكسور" })); await settle();
    const menu = panelOf("إجراءات الواجب اختبار الكسور") as HTMLElement;
    expect(menu).not.toBeNull();
    expect(within(menu).getAllByRole("button").map(b => b.textContent)).toEqual(["إيقاف النشر", "تعديل عدد المحاولات", "أرشفة"]);
    expect(document.activeElement).toBe(within(menu).getByRole("button", { name: "إيقاف النشر" }));
    expect(openBtn.getAttribute("aria-pressed")).toBe("false");           // no row open/selection side effect
    expect(calls.filter(c => c.method === "POST")).toEqual([]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات الواجب اختبار الكسور")).toBeNull());
    const draft = screen.getByText("واجب الجبر").closest(".assignment-row") as HTMLElement;
    fireEvent.click(within(draft).getByRole("button", { name: "إجراءات الواجب واجب الجبر" })); await settle();
    expect(within(panelOf("إجراءات الواجب واجب الجبر") as HTMLElement).getAllByRole("button").map(b => b.textContent)).toEqual(["نشر", "تعديل عدد المحاولات", "أرشفة"]);
    expect(inPanel("إجراءات الواجب واجب الجبر")).toBe(true);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Escape" });
    await waitFor(() => expect(panelOf("إجراءات الواجب واجب الجبر")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "المزيد من إجراءات الواجبات" })); await settle();
    expect(panelOf("المزيد من إجراءات الواجبات")).not.toBeNull();
    expect(inPanel("المزيد من إجراءات الواجبات")).toBe(true);
    expect(simulatedScrolls).toBe(0);
    expect(focusLog).toHaveLength(3);
    expect(focusLog.every(r => r.preventScroll && r.position === "fixed" && r.ready === "true")).toBe(true);
  });
});

describe("Projects — stage status ⋯ and toolbar ⋯ open on the first click; read-only class keeps no menu", () => {
  const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }, { trackId: "packetTracer", title: "Packet Tracer", icon: "🖧" }];
  const CLASSES = [
    { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 1 },
    { classId: "c2", name: "دفعة 2024", grade: "12", schoolYear: "2024-2025", status: "archived", archivedAt: "2025-06-01T00:00:00.000Z", studentCount: 1 }
  ];
  const SUMMARY = { studentCount: 1, avgOverall: 45, trackAverages: { book: 60, packetTracer: 30 }, completedCount: 0, studentsReadyForReview: 1, totalReadyStages: 1, staleCount: 0, trackWeights: { book: 1, packetTracer: 1 }, staleDays: 7 };
  const CARD = { studentId: "s1", displayName: "زيد صالح", code: "P1", overallProgress: 45, trackProgress: { book: 60, packetTracer: 30 }, counts: { not_started: 4, in_progress: 2, ready_for_review: 1, approved: 3 }, readyForReviewCount: 1, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false };
  const STAGES = [
    { stageId: "B01", track: "book", groupId: "g1", title: "مقدمة الشبكات", description: "اقرأ الفصل الأول", order: 1, weight: 1, required: true, active: true },
    { stageId: "P01", track: "packetTracer", groupId: "g2", title: "أول طوبولوجيا", order: 1, weight: 1, required: true, active: true }
  ];
  const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }, { groupId: "g2", track: "packetTracer", title: "مختبرات", order: 1 }];
  const DETAIL = (readOnly: boolean) => ({ ok: true, readOnly, projectCode: "794589", student: { studentId: "s1", displayName: "زيد صالح", code: "P1" }, tracks: TRACKS, summary: CARD, stages: STAGES, groups: GROUPS, trackWeights: { book: 1, packetTracer: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 }, progress: { B01: { status: "ready_for_review", note: "راجع القسم 2", updatedAt: "2026-03-01T10:00:00.000Z" } }, history: [], nextStages: { book: null, packetTracer: STAGES[1] }, balance: { leadingTrackId: "book", leadingTrackTitle: "الكتاب", laggingTrackId: "packetTracer", laggingTrackTitle: "Packet Tracer", diff: 30 } });
  let posts: Record<string, unknown>[] = [];
  beforeEach(() => {
    posts = [];
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const method = init?.method || "GET"; const u = new URL(url, "http://x");
      const json = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
      if (method === "GET") {
        const r = u.searchParams.get("resource"), classId = u.searchParams.get("classId");
        if (r === "classes") return json({ ok: true, projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, classes: CLASSES });
        if (r === "summary") return json({ ok: true, summary: SUMMARY, tracks: TRACKS, readOnly: classId === "c2" });
        if (r === "students") return json({ ok: true, students: [CARD], tracks: TRACKS, config: { lateThreshold: 40 }, readOnly: classId === "c2" });
        if (r === "student") return json(DETAIL(classId === "c2"));
        return json({ ok: true });
      }
      const body = init?.body ? JSON.parse(String(init.body)) : {}; posts.push(body);
      return json({ ok: true, projectCode: "794589", summary: CARD, stage: { stageId: body.stageId, status: body.status, updatedAt: "2026-03-05T10:00:00.000Z" }, nextStages: { book: null, packetTracer: STAGES[1] }, balance: DETAIL(false).balance, history: [] });
    }) as unknown as typeof fetch;
  });
  async function openStudentProfile() {
    render(<ProjectTracker token="t" projectCode="794589" />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    const toolbar = screen.getByRole("region", { name: "مساحة عمل المشروع" });
    fireEvent.click(within(within(toolbar).getByRole("group", { name: "أقسام المشروع" })).getByRole("button", { name: "تقدّم الطلاب" }));
    await screen.findByRole("heading", { level: 2, name: "تقدّم الطلاب" });
    fireEvent.click(within(screen.getByText("زيد صالح").closest(".eb-student-card") as HTMLElement).getByRole("button", { name: "فتح ملف الطالب" }));
    const heading = await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
    const profile = heading.closest(".eb-student-profile") as HTMLElement;
    fireEvent.click(within(profile).getByRole("button", { name: /B01/ }));
    return { profile, toolbar };
  }
  it("stage ⋯ (تغيير الحالة): one click → the three non-approved statuses, current one disabled, first enabled focused, no scroll; activation posts the unchanged progress.update body once", async () => {
    const { profile, toolbar } = await openStudentProfile();
    fireEvent.click(within(profile).getByRole("button", { name: "تغيير حالة المرحلة B01" })); await settle();
    const menu = panelOf("تغيير حالة المرحلة B01") as HTMLElement;
    expect(menu).not.toBeNull();
    const items = within(menu).getAllByRole("button");
    expect(items.map(b => b.textContent)).toEqual(["لم يبدأ", "قيد التنفيذ", "جاهز للفحص"]);
    expect((items[2] as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    expect(simulatedScrolls).toBe(0);
    fireEvent.click(items[1]);
    await waitFor(() => expect(posts).toEqual([{ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "in_progress" }]));
    await waitFor(() => expect(panelOf("تغيير حالة المرحلة B01")).toBeNull());
    fireEvent.click(within(toolbar).getByRole("button", { name: "المزيد من إجراءات المشروع" })); await settle();
    expect(panelOf("المزيد من إجراءات المشروع")).not.toBeNull();
    expect(inPanel("المزيد من إجراءات المشروع")).toBe(true);
    expect(simulatedScrolls).toBe(0);
    expect(focusLog.every(r => r.preventScroll && r.position === "fixed" && r.ready === "true")).toBe(true);
  });
});
