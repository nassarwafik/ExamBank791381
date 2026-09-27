// @vitest-environment happy-dom
// Phase 9D — ProjectTracker applies App's transient drill target (project + class + student + seq) ONLY after the
// class list of the SAME project has loaded and contains the class: then it selects the class, switches to «تقدّم
// الطلاب» and opens the exact student (the normal profile: heading focus, one `student` read). No student read happens
// before the classes validate; an unknown class or another project's target never opens anything; a stale classes
// response (superseded project) can neither repopulate the selector nor apply an older target; every `seq` is
// observable (same row twice, student A → B in the same project); a project change clears the open student; without a
// target the tracker behaves exactly as before.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectTracker from "./ProjectTracker";
import type { ProjectDrillTarget } from "./drillTarget";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }];
const CLASSES = (code: string) => [
  { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 2 },
  { classId: "c2", name: "الثاني عشر", grade: "12", schoolYear: "2025-2026", status: "active", studentCount: 1 },
  ...(code === "883589" ? [{ classId: "c9", name: "صف المشروع الثاني", grade: "12", schoolYear: "2025-2026", status: "active", studentCount: 1 }] : [])
];
const STAGES = [{ stageId: "B01", track: "book", groupId: "g1", title: "مقدمة", order: 1, weight: 1, required: true, active: true }];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }];
const card = (id: string, name: string) => ({ studentId: id, displayName: name, code: "P" + id, overallProgress: 20, trackProgress: { book: 20 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false });
const NAMES: Record<string, string> = { s1: "زيد صالح", s2: "خالد عمر", s3: "نور علي" };
const detail = (code: string, sid: string) => ({ ok: true, readOnly: false, projectCode: code, student: { studentId: sid, displayName: NAMES[sid] || sid, code: "P" + sid }, tracks: TRACKS, summary: card(sid, NAMES[sid] || sid), stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 }, progress: {}, history: [], nextStages: { book: STAGES[0] }, balance: null });

type Call = { url: string; resource: string | null; projectCode: string | null; classId: string | null; studentId: string | null };
let calls: Call[] = [];
const holds = new Map<string, () => void>();          // key "classes:<code>" → release
let holdClasses = new Set<string>();
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
function installFetch() {
  calls = []; holds.clear(); holdClasses = new Set();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input), "http://x");
    const resource = u.searchParams.get("resource"), code = u.searchParams.get("projectCode") || "", classId = u.searchParams.get("classId"), studentId = u.searchParams.get("studentId");
    calls.push({ url: String(input), resource, projectCode: code, classId, studentId });
    if (resource === "classes") {
      if (holdClasses.has(code)) { holdClasses.delete(code); await new Promise<void>(r => { holds.set("classes:" + code, r); }); }
      return json({ ok: true, projectCode: code, title: "مشروع " + code, tracks: TRACKS, classes: CLASSES(code) });
    }
    if (resource === "summary") return json({ ok: true, summary: { studentCount: 2, avgOverall: 20, trackAverages: { book: 20 }, completedCount: 0, studentsReadyForReview: 0, totalReadyStages: 0, staleCount: 0, trackWeights: { book: 1 }, staleDays: 7 }, tracks: TRACKS, readOnly: false });
    if (resource === "students") return json({ ok: true, students: classId === "c2" ? [card("s3", NAMES.s3)] : [card("s1", NAMES.s1), card("s2", NAMES.s2)], tracks: TRACKS, config: { lateThreshold: 40 }, readOnly: false });
    if (resource === "student") return json(detail(code, String(studentId)));
    return json({ ok: true });
  }) as unknown as typeof fetch;
}
const studentReads = () => calls.filter(c => c.resource === "student");
const classReads = () => calls.filter(c => c.resource === "classes");
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const toolbar = () => screen.getByRole("region", { name: "مساحة عمل المشروع" });
const selectedClass = () => (within(toolbar()).getByRole("combobox") as HTMLSelectElement).value;
const pressedView = () => within(within(toolbar()).getByRole("group", { name: "أقسام المشروع" })).getAllByRole("button").find(b => b.getAttribute("aria-pressed") === "true")?.textContent;
let seq = 0;
const target = (projectCode: string, classId: string, studentId: string): ProjectDrillTarget => ({ projectCode, classId, studentId, seq: ++seq });

beforeEach(() => {
  seq = 0; installFetch();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9D ProjectTracker — drill target application", () => {
  it("C1 a valid target: classes first, then the exact class is selected, the view is «تقدّم الطلاب», the exact student is open (one student read, focus inside the profile)", async () => {
    render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c2", "s3")} />);
    const heading = await screen.findByRole("heading", { level: 2, name: "ملف المشروع: نور علي" });
    expect(selectedClass()).toBe("c2");
    expect(pressedView()).toBe("تقدّم الطلاب");
    expect(studentReads().map(c => [c.projectCode, c.classId, c.studentId])).toEqual([["899373", "c2", "s3"]]);
    expect(classReads().length).toBe(1);
    expect(calls.findIndex(c => c.resource === "student")).toBeGreaterThan(calls.findIndex(c => c.resource === "classes"));
    // Phase 9E: a drill opening is Evaluation Focus Mode — the focus lands on the first ungraded stage's score input (the
    // detail has no `evaluation` in this mock → no ungraded stage is known → the 8C heading focus stays). Both are inside the profile.
    expect(heading.closest(".eb-student-profile")!.contains(document.activeElement)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();                       // no modal, no duplicate view
  });
  it("C2 no student request before the classes validate the class: while the classes read is held nothing else is read; release → the student opens", async () => {
    holdClasses.add("899373");
    render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s2")} />);
    await flush(); await flush();
    expect(classReads().length).toBe(1); expect(studentReads().length).toBe(0);
    expect(calls.filter(c => c.resource === "students").length).toBe(0);
    await act(async () => { holds.get("classes:899373")!(); });
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: خالد عمر" });
    expect(studentReads().map(c => [c.classId, c.studentId])).toEqual([["c1", "s2"]]);
  });
  it("C3 an unknown class never opens the student: the tracker falls back to its normal state (first active class, dashboard) and issues no student read", async () => {
    render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c-missing", "s1")} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    await flush();
    expect(selectedClass()).toBe("c1"); expect(pressedView()).toBe("لوحة المشروع");
    expect(studentReads().length).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("C4 a target for ANOTHER project is ignored by the mounted tracker (normal state, no student read)", async () => {
    render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("883589", "c9", "s1")} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    await flush();
    expect(pressedView()).toBe("لوحة المشروع"); expect(studentReads().length).toBe(0);
    expect(classReads().map(c => c.projectCode)).toEqual(["899373"]);
  });
  it("C5 a target arriving AFTER mount (same project) applies without re-reading classes; student A → student B of the same project; the SAME row twice re-opens after the teacher went back", async () => {
    const view = render(<ProjectTracker token="t" projectCode="899373" drillTarget={null} />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s1")} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
    expect(classReads().length).toBe(1);
    // student A → student B (same project, same class): a new seq → the other profile
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s2")} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: خالد عمر" });
    expect(studentReads().map(c => c.studentId)).toEqual(["s1", "s2"]);
    // back to the list, then the SAME row again (same ids, new seq) → re-opens
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى تقدّم الطلاب" }));
    await screen.findByRole("heading", { level: 2, name: "تقدّم الطلاب" });
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s2")} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: خالد عمر" });
    expect(studentReads().map(c => c.studentId)).toEqual(["s1", "s2", "s2"]);
    // the same object again (same seq) is a no-op: nothing re-reads
    const before = calls.length;
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={{ projectCode: "899373", classId: "c1", studentId: "s2", seq }} />);
    await flush();
    expect(calls.length).toBe(before);
    expect(classReads().length).toBe(1);
  });
  it("C6 stale classes response: project A's held read resolves after the tracker moved to project B with a target → A's list never lands, A's target never applies, B's target applies on B's list", async () => {
    holdClasses.add("899373");
    const view = render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s1")} />);
    await flush();
    view.rerender(<ProjectTracker token="t" projectCode="883589" drillTarget={target("883589", "c9", "s3")} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: نور علي" });     // B applied on B's classes
    expect(selectedClass()).toBe("c9");
    await act(async () => { holds.get("classes:899373")!(); });                        // A's stale list arrives late
    await flush();
    expect(selectedClass()).toBe("c9");                                                  // still B's class list / selection
    expect(within(toolbar()).getByRole("combobox").textContent).toContain("صف المشروع الثاني");
    expect(studentReads().map(c => [c.projectCode, c.classId, c.studentId])).toEqual([["883589", "c9", "s3"]]);
    expect(screen.getByText("مشروع 883589")).toBeTruthy();                                // title from B, never overwritten by A
  });
  it("C7 target changing while the class load is in flight: only the LATEST target applies once the classes arrive", async () => {
    holdClasses.add("899373");
    const view = render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s1")} />);
    await flush();
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c2", "s3")} />);
    await flush();
    expect(studentReads().length).toBe(0);
    await act(async () => { holds.get("classes:899373")!(); });
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: نور علي" });
    expect(studentReads().map(c => [c.classId, c.studentId])).toEqual([["c2", "s3"]]);
    expect(classReads().length).toBe(1);
  });
  it("C8 changing the project clears the open student and view (existing reset) even while a target for the OLD project is still passed", async () => {
    const view = render(<ProjectTracker token="t" projectCode="899373" drillTarget={target("899373", "c1", "s1")} />);
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
    view.rerender(<ProjectTracker token="t" projectCode="883589" drillTarget={{ projectCode: "899373", classId: "c1", studentId: "s1", seq }} />);
    await screen.findByText("مشروع 883589");
    await flush();
    expect(screen.queryByRole("heading", { level: 2, name: /ملف المشروع/ })).toBeNull();
    expect(pressedView()).toBe("لوحة المشروع");
    // The OLD project's target is never re-applied: exactly one student read for 899373/c1/s1 (the drill), and after
    // 883589's classes arrived no profile is open. (The pre-existing reset issues no drill read for the new project.)
    expect(studentReads().filter(c => c.projectCode === "899373").map(c => [c.classId, c.studentId])).toEqual([["c1", "s1"]]);
    expect(studentReads().filter(c => c.projectCode === "883589" && c.studentId !== "s1").length).toBe(0);
    expect(classReads().map(c => c.projectCode)).toEqual(["899373", "883589"]);
  });
  it("C9 without a target the tracker is unchanged: dashboard view, first active class, one classes read, no student read", async () => {
    render(<ProjectTracker token="t" projectCode="899373" />);
    await screen.findByRole("heading", { level: 2, name: "لوحة المشروع" });
    await flush();
    expect(selectedClass()).toBe("c1"); expect(pressedView()).toBe("لوحة المشروع");
    expect(classReads().length).toBe(1); expect(studentReads().length).toBe(0);
    await waitFor(() => expect(calls.filter(c => c.resource === "summary").length).toBe(1));
  });
});
