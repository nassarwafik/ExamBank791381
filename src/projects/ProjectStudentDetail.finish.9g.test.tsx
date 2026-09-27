// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 9G — the final-session panel at the end of the evaluation queue (REAL project-tracker handler): the pure
// summary contract, the derived finish state (focus mode + no next item + THIS student fully graded per the server),
// its wording, the return button (real, labelled, never autofocused), reversibility (a previous item hides it), the
// one-time completion report, read-only profiles (summary + return, no mutation control), and its absence while the
// last student still has ungraded stages or outside a queue session.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { queueSummary, queueView, type ProjectEvaluationQueue, type ProjectEvaluationQueueView } from "./drillTarget";
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
function server(seed: Record<string, unknown>) {
  const ctx = createMemoryContainer({ "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/classes/c9.json": room("c9", { status: "archived", active: false }), "platform/users/s9.json": user("s9", "c9"), ...seed });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
}
const item = (studentId: string, displayName = "طالب " + studentId) => ({ projectCode: "899373", classId: "c1", studentId, displayName });
const view = (over: Partial<ProjectEvaluationQueueView> = {}): ProjectEvaluationQueueView => ({ position: 5, total: 5, previous: item("s0", "أحمد"), next: null, summary: { total: 5, completed: 3, remaining: 2 }, ...over });
const finish = () => document.querySelector(".eb-eval-finish") as HTMLElement | null;
const banner = () => document.querySelector(".eb-eval-focus") as HTMLElement | null;
const heading = (sid = "s1") => screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + sid });
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const el = (seq: number, queue: ProjectEvaluationQueueView | null, over: Partial<{ onMove: (d: -1 | 1) => void; onComplete: () => void; onFinish: () => void; sid: string; cid: string }> = {}) =>
  <ProjectStudentDetail token="t" projectCode="899373" classId={over.cid || "c1"} studentId={over.sid || "s1"} tracks={DEF.tracks} onBack={() => {}} evaluationFocusSeq={seq} evaluationQueue={queue} onEvaluationQueueMove={over.onMove} onEvaluationComplete={over.onComplete} onEvaluationQueueFinish={over.onFinish} />;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("G1 queueSummary — pure, validated, order-free", () => {
  it("total = items; completed = UNIQUE keys that exist in the queue (duplicates and foreign keys ignored); remaining = total − completed; queueView carries it", () => {
    const items = [item("a"), item("b"), item("c"), item("d"), item("e")];
    const q: ProjectEvaluationQueue = { id: 1, items, index: 4, completed: ["899373|c1|a", "899373|c1|c", "899373|c1|a", "899373|c1|zzz", "other|c1|a"] };
    expect(queueSummary(q)).toEqual({ total: 5, completed: 2, remaining: 3 });
    expect(queueSummary({ ...q, completed: [] })).toEqual({ total: 5, completed: 0, remaining: 5 });
    expect(queueSummary({ ...q, completed: items.map(i => "899373|c1|" + i.studentId) })).toEqual({ total: 5, completed: 5, remaining: 0 });
    expect(queueView(q)!.summary).toEqual({ total: 5, completed: 2, remaining: 3 });
    expect(q.items.map(i => i.studentId)).toEqual(["a", "b", "c", "d", "e"]);                        // never re-ordered
  });
});

describe("9G final-session panel", () => {
  it("G2 the LAST student still has ungraded stages → normal focus, no final panel, no return button", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allButLast()) });
    render(el(1, view()));
    await heading();
    await waitFor(() => expect(banner()).toBeTruthy());
    await flush();
    expect(finish()).toBeNull();
    expect(screen.queryByRole("button", { name: /العودة إلى لوحة اليوم/ })).toBeNull();
    expect(banner()!.textContent).toContain("الطالب 5 من 5 — بقيت مرحلة واحدة بدون علامة.");
  });
  it("G3 saving the last ungraded score completes the LAST student → the final panel appears, nothing navigates, no autofocus on the return button", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allButLast()) });
    const onFinish = vi.fn(), onMove = vi.fn(), onComplete = vi.fn();
    render(el(1, view({ summary: { total: 5, completed: 4, remaining: 1 } }), { onFinish, onMove, onComplete }));
    await heading();
    const last = active[active.length - 1];
    await waitFor(() => expect(document.activeElement).toBe(within(document.querySelector('[data-stage-id="' + last + '"]') as HTMLElement).getByRole("spinbutton")));
    expect(finish()).toBeNull();
    fireEvent.change(document.activeElement as HTMLInputElement, { target: { value: "80" } });
    fireEvent.click(within(document.querySelector('[data-stage-id="' + last + '"]') as HTMLElement).getByRole("button", { name: "حفظ علامة المرحلة " + last }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(finish()).toBeTruthy());
    expect(finish()!.getAttribute("role")).toBe("status");
    expect(within(finish()!).getByRole("heading", { level: 3, name: "اكتملت جلسة تقييم المشاريع." })).toBeTruthy();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled(); expect(onMove).not.toHaveBeenCalled();
    const btn = within(finish()!).getByRole("button", { name: "إنهاء جلسة التقييم والعودة إلى لوحة اليوم" });
    expect(btn.textContent).toBe("العودة إلى لوحة اليوم");
    expect(document.activeElement).not.toBe(btn);                                                     // never autofocused
    fireEvent.click(btn);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it("G4/G5 the LAST student was already complete at load → the panel appears after the server detail; completion reported once; counts read from the view («3 من 5», بقي طالبان)", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allGraded()) });
    const onComplete = vi.fn();
    const v = render(el(1, view({ summary: { total: 5, completed: 3, remaining: 2 } }), { onComplete }));
    await heading();
    await waitFor(() => expect(finish()).toBeTruthy());
    expect(finish()!.textContent).toContain("تم تقييم 3 من 5 طلاب في هذه الجلسة.");
    expect(finish()!.textContent).toContain("بقي طالبان في القائمة لم يُسجَّل اكتمال تقييمهم خلال هذه الجلسة.");
    expect(finish()!.getAttribute("data-remaining")).toBe("2");
    await flush();
    expect(onComplete).toHaveBeenCalledTimes(1);
    v.rerender(el(1, view({ summary: { total: 5, completed: 5, remaining: 0 } }), { onComplete }));   // App recorded the rest
    expect(finish()!.textContent).toContain("تم تقييم 5 من 5 طلاب في هذه الجلسة.");
    expect(finish()!.textContent).toContain("اكتمل تقييم جميع الطلاب في قائمة هذه الجلسة.");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(banner()!.textContent).toContain("لا يوجد طالب آخر في قائمة التقييم.");                    // the 9F banner text is unchanged
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
  it("G6 reversibility: «الطالب السابق» stays available on the final panel and asks App to move; a view with a next item hides the panel", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allGraded()) });
    const onMove = vi.fn();
    const v = render(el(1, view(), { onMove }));
    await heading();
    await waitFor(() => expect(finish()).toBeTruthy());
    const prev = within(banner()!).getByRole("button", { name: "الطالب السابق في قائمة التقييم: أحمد" });
    fireEvent.click(prev);
    expect(onMove).toHaveBeenCalledWith(-1);
    v.rerender(el(1, view({ position: 4, next: item("s5", "ليان") }), { onMove }));                     // App moved: no longer the last item
    expect(finish()).toBeNull();
    expect(within(banner()!).getByRole("button", { name: "الطالب التالي في قائمة التقييم: ليان" })).toBeTruthy();
    v.rerender(el(1, view(), { onMove }));                                                             // back to the last item → the panel returns
    expect(finish()).toBeTruthy();
  });
  it("G8 read-only (archived) last student, fully graded → summary + return button, no mutation control; without a queue or outside focus mode → no panel", async () => {
    server({ [NS.progressName("c9", "s9")]: progress("c9", "s9", allGraded()) });
    const onFinish = vi.fn();
    render(el(1, view(), { sid: "s9", cid: "c9", onFinish }));
    await heading("s9");
    await waitFor(() => expect(finish()).toBeTruthy());
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /حفظ علامة|اعتماد المرحلة|مسح العلامة|المرحلة التالية غير المقيّمة/ })).toBeNull();
    fireEvent.click(within(finish()!).getByRole("button", { name: "إنهاء جلسة التقييم والعودة إلى لوحة اليوم" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    cleanup();
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allGraded()) });
    const v = render(el(1, null));                                                                     // focus mode, no queue session
    await heading(); await flush(); await flush();
    expect(finish()).toBeNull(); expect(banner()!.textContent).toContain("اكتمل تقييم جميع مراحل المشروع لهذا الطالب.");
    v.rerender(el(0, view()));                                                                         // queue view but no focus mode (manual opening)
    await flush();
    expect(finish()).toBeNull(); expect(banner()).toBeNull();
  });
});
