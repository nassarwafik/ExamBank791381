// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 9F — the queue context inside the 9E focus banner of ProjectStudentDetail (REAL project-tracker handler):
// position text, previous / next buttons with Arabic aria-labels (omitted at the ends), the completion CTA versus the
// final-student text, the one-time completion report (after load and after the completing save), no queue UI without
// focus mode or without a session, a score of 0 graded, and a read-only profile exposing navigation only.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { queueNeighbour, queueView, type ProjectEvaluationQueue, type ProjectEvaluationQueueView } from "./drillTarget";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const NOW = "2026-03-01T00:00:00.000Z";
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: ["899373"], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const NS = getStorageNamespace("899373");
const DEF = getProjectDefinition("899373") as { tracks: TrackMeta[]; stages: { stageId: string; active?: boolean }[] };
const active = DEF.stages.filter(s => s.active === true).map(s => s.stageId);
const progress = (cid: string, sid: string, scores: Record<string, number>) => ({ schemaVersion: 1, programCode: "899373", classId: cid, studentId: sid, stages: Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, { status: "in_progress", score: v, updatedAt: NOW }])), history: [], updatedAt: NOW });
const allButLast = () => Object.fromEntries(active.slice(0, -1).map(id => [id, 60]));
const allGraded = () => Object.fromEntries(active.map(id => [id, 60]));
/** Test control: hold the NEXT `student` read of the given studentId until `release()` (a deferred promise, never a timer). */
const hold: { studentId: string; release: () => void; pending: boolean } = { studentId: "", release: () => {}, pending: false };
function server(seed: Record<string, unknown>) {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"), "platform/users/s3.json": user("s3", "c1"), "platform/classes/c9.json": room("c9", { status: "archived", active: false }), "platform/users/s9.json": user("s9", "c9"), ...seed });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const reads: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "GET" && url.includes("resource=student&")) {
      const sid = new URL(url, "http://x").searchParams.get("studentId") || "";
      reads.push(sid);
      if (hold.studentId === sid) { hold.studentId = ""; hold.pending = true; await new Promise<void>(r => { hold.release = () => { hold.pending = false; r(); }; }); }
    }
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { reads };
}
const item = (studentId: string, displayName: string) => ({ projectCode: "899373", classId: "c1", studentId, displayName });
const Q: ProjectEvaluationQueueView = { position: 2, total: 5, previous: item("s0", "أحمد"), next: item("s2", "ليان") };
const banner = () => document.querySelector(".eb-eval-focus") as HTMLElement | null;
const heading = (sid = "s1") => screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + sid });
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const el = (seq: number, queue: ProjectEvaluationQueueView | null, over: Partial<{ onMove: (d: -1 | 1) => void; onComplete: () => void; sid: string; cid: string }> = {}) =>
  <ProjectStudentDetail token="t" projectCode="899373" classId={over.cid || "c1"} studentId={over.sid || "s1"} tracks={DEF.tracks} onBack={() => {}} evaluationFocusSeq={seq} evaluationQueue={queue} onEvaluationQueueMove={over.onMove} onEvaluationComplete={over.onComplete} />;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9F queue helpers — pure, server order preserved", () => {
  it("queueNeighbour skips completed items in both directions and returns null at the ends; queueView derives position and neighbours", () => {
    const q: ProjectEvaluationQueue = { id: 1, items: [item("a", "أ"), item("b", "ب"), item("c", "ج"), item("d", "د")], index: 2, completed: ["899373|c1|b"] };
    expect(queueNeighbour(q, -1)).toEqual({ index: 0, item: item("a", "أ") });
    expect(queueNeighbour(q, 1)).toEqual({ index: 3, item: item("d", "د") });
    expect(queueNeighbour({ ...q, index: 3 }, 1)).toBeNull();
    expect(queueNeighbour({ ...q, index: 0 }, -1)).toBeNull();
    expect(queueView(q)).toEqual({ position: 3, total: 4, previous: item("a", "أ"), next: item("d", "د") });
    expect(queueView(null)).toBeNull(); expect(queueView({ id: 1, items: [], index: 0, completed: [] })).toBeNull();
  });
});

describe("9F review fix — a previous student's detail can never act as the current student's", () => {
  it("R1 A (ungraded) → B (fully graded, reported) → C (ungraded, response DEFERRED): while C is pending nothing is reported, C's focus seq is not consumed against B, C is not completed; on release C's own first ungraded stage is focused", async () => {
    const srv = server({
      [NS.progressName("c1", "s1")]: progress("c1", "s1", { [active[0]]: 70 }),          // A: first ungraded = active[1]
      [NS.progressName("c1", "s2")]: progress("c1", "s2", allGraded()),                   // B: fully graded on the server
      [NS.progressName("c1", "s3")]: progress("c1", "s3", { [active[0]]: 50, [active[1]]: 0 })   // C: first ungraded = active[2] (0 IS graded)
    });
    const onComplete = vi.fn(), onMove = vi.fn();
    const queueAt = (pos: number, prev: string | null, next: string | null): ProjectEvaluationQueueView => ({ position: pos, total: 3, previous: prev ? item(prev, "طالب " + prev) : null, next: next ? item(next, "طالب " + next) : null });
    const view = render(el(1, queueAt(1, null, "s2"), { sid: "s1", onComplete, onMove }));
    await heading("s1");
    await waitFor(() => expect(document.activeElement).toBe(within(document.querySelector('[data-stage-id="' + active[1] + '"]') as HTMLElement).getByRole("spinbutton")));
    expect(onComplete).not.toHaveBeenCalled();
    // → B (a fresh seq, as App does): completion is reported exactly once, for B
    view.rerender(el(2, queueAt(2, "s1", "s3"), { sid: "s2", onComplete, onMove }));
    await heading("s2");
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي."));
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
    // CTA → C, whose `student` read is held (deferred promise)
    hold.studentId = "s3";
    fireEvent.click(within(banner()!).getByRole("button", { name: "الطالب التالي في قائمة التقييم: طالب s3" }));
    expect(onMove).toHaveBeenCalledWith(1);
    view.rerender(el(3, queueAt(3, "s2", null), { sid: "s3", onComplete, onMove }));   // App moved: new ids, new seq, B's detail still in memory for one render
    await flush(); await flush();
    expect(hold.pending).toBe(true);                                                     // C's response is still pending
    expect(onComplete).toHaveBeenCalledTimes(1);                                         // NO new completion report from B's stale detail
    expect(document.querySelector(".eb-eval-focus")).toBeNull();                         // nothing of B is shown as C (view was reset)
    expect(screen.queryByRole("heading", { level: 2, name: "ملف المشروع: طالب s2" })).toBeNull();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);                   // only A's focus so far — C's seq was NOT consumed against B
    // release C: its own detail arrives → its own first ungraded stage (active[2]) is focused, C is not completed
    await act(async () => { hold.release(); });
    await heading("s3");
    await waitFor(() => expect(document.activeElement).toBe(within(document.querySelector('[data-stage-id="' + active[2] + '"]') as HTMLElement).getByRole("spinbutton")));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(banner()!.textContent).toContain("الطالب 3 من 3 — بقيت");
    expect(srv.reads).toEqual(["s1", "s2", "s3"]);
  });
});

describe("9F ProjectStudentDetail — queue context in the focus banner", () => {
  it("D1 position + remaining text, «الطالب السابق» / «الطالب التالي» as real buttons with Arabic labels; moves go to the callback with the direction", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [active[0]]: 0 }) });                 // 0 IS graded → one graded, rest ungraded
    const onMove = vi.fn();
    render(el(1, Q, { onMove }));
    await heading();
    await waitFor(() => expect(banner()).toBeTruthy());
    expect(banner()!.textContent).toContain("وضع التقييم — الطالب 2 من 5 — بقيت " + (active.length - 1) + " مراحل بدون علامة.");
    const nav = within(banner()!).getByRole("group", { name: "التنقل في قائمة التقييم" });
    fireEvent.click(within(nav).getByRole("button", { name: "الطالب السابق في قائمة التقييم: أحمد" }));
    fireEvent.click(within(nav).getByRole("button", { name: "الطالب التالي في قائمة التقييم: ليان" }));
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
    expect(document.querySelector('[data-stage-id="' + active[0] + '"]')!.className).not.toContain("is-evaluation-pending");   // the 0 is graded
  });
  it("D2 ends of the queue: no previous at the first item, no next at the last; no queue → the plain 9E banner", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", {}) });
    const view = render(el(1, { position: 1, total: 3, previous: null, next: item("s2", "ليان") }));
    await heading(); await waitFor(() => expect(banner()).toBeTruthy());
    expect(within(banner()!).queryByRole("button", { name: /السابق/ })).toBeNull();
    expect(within(banner()!).getByRole("button", { name: /التالي في قائمة التقييم/ })).toBeTruthy();
    view.rerender(el(1, { position: 3, total: 3, previous: item("s2", "ليان"), next: null }));
    expect(within(banner()!).queryByRole("button", { name: /التالي في قائمة التقييم/ })).toBeNull();
    expect(within(banner()!).getByRole("button", { name: /السابق/ })).toBeTruthy();
    view.rerender(el(1, null));
    expect(banner()!.textContent).toBe("وضع التقييم — " + "بقيت " + active.length + " مراحل بدون علامة." + "المرحلة التالية غير المقيّمة");
    expect(document.querySelector(".eb-eval-queue-nav")).toBeNull();
  });
  it("D3 a fully graded student: CTA «اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي.» with the primary next button; completion reported ONCE; last item → final text, no next", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allGraded()) });
    const onComplete = vi.fn(), onMove = vi.fn();
    const view = render(el(1, Q, { onComplete, onMove }));
    await heading();
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي."));
    const next = within(banner()!).getByRole("button", { name: "الطالب التالي في قائمة التقييم: ليان" });
    expect(next.textContent).toBe("انتقل إلى الطالب التالي: ليان"); expect(next.className).toContain("is-primary");
    expect(within(banner()!).queryByRole("button", { name: "المرحلة التالية غير المقيّمة" })).toBeNull();
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
    view.rerender(el(1, Q, { onComplete, onMove }));
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);                                                        // never re-reported for the same selection
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();                                     // nothing to focus
    fireEvent.click(next); expect(onMove).toHaveBeenCalledWith(1);
    view.rerender(el(1, { position: 5, total: 5, previous: item("s0", "أحمد"), next: null }, { onComplete, onMove }));
    expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — لا يوجد طالب آخر في قائمة التقييم.");
    expect(within(banner()!).queryByRole("button", { name: /التالي/ })).toBeNull();
  });
  it("D4 completing the LAST ungraded stage by saving turns the banner into the CTA and reports completion once — without any navigation", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allButLast()) });
    const onComplete = vi.fn(), onMove = vi.fn();
    render(el(1, Q, { onComplete, onMove }));
    await heading();
    const last = active[active.length - 1];
    await waitFor(() => expect(document.activeElement).toBe(within(document.querySelector('[data-stage-id="' + last + '"]') as HTMLElement).getByRole("spinbutton")));
    expect(onComplete).not.toHaveBeenCalled();
    fireEvent.change(document.activeElement as HTMLInputElement, { target: { value: "75" } });
    fireEvent.click(within(document.querySelector('[data-stage-id="' + last + '"]') as HTMLElement).getByRole("button", { name: "حفظ علامة المرحلة " + last }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(banner()!.textContent).toContain("اكتمل تقييم هذا الطالب — انتقل إلى الطالب التالي."));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onMove).not.toHaveBeenCalled();
  });
  it("D5 no focus mode (seq 0): no banner and no queue UI even when a queue view is passed; D6 read-only profile: navigation buttons only, no mutation control", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", {}), [NS.progressName("c9", "s9")]: progress("c9", "s9", { [active[0]]: 40 }) });
    render(el(0, Q));
    await heading(); await flush();
    expect(banner()).toBeNull(); expect(document.querySelector(".eb-eval-queue-nav")).toBeNull();
    cleanup();
    server({ [NS.progressName("c9", "s9")]: progress("c9", "s9", { [active[0]]: 40 }) });
    render(el(1, Q, { sid: "s9", cid: "c9" }));
    await heading("s9"); await waitFor(() => expect(banner()).toBeTruthy());
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /حفظ علامة|اعتماد المرحلة|مسح العلامة|المرحلة التالية غير المقيّمة/ })).toBeNull();
    expect(within(banner()!).getByRole("button", { name: /التالي في قائمة التقييم/ })).toBeTruthy();
    expect(within(banner()!).getByRole("button", { name: /السابق في قائمة التقييم/ })).toBeTruthy();
  });
});
