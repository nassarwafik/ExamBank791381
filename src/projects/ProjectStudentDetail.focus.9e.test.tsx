// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 9E — Evaluation Focus Mode. A student opened from the Today Hub's «تقييم المشاريع» row (Phase 9D drill, seq > 0)
// lands on the first ungraded ACTIVE stage (server `evaluation.stages` order): its track is selected, its group opened,
// its score input focused and revealed. A banner shows how many stages still lack a score (latest evaluation) with a
// «المرحلة التالية غير المقيّمة» action, or the completion state. Ungraded rows carry `is-evaluation-pending`. Manual
// openings (seq 0) keep the 8C behaviour exactly (heading focus, no banner, no highlight). The browser talks to the REAL
// project-tracker handler over the in-memory container, so `evaluation` is the server's (0 IS a grade).
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import ProjectTracker from "./ProjectTracker";
import type { TrackMeta } from "./types";
import type { ProjectDrillTarget } from "./drillTarget";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const NOW = "2026-03-01T00:00:00.000Z";
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, codes: string[], over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: codes, schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const ALL = ["899373", "883589", "794589"];
const NS = getStorageNamespace("899373");
const DEF = getProjectDefinition("899373") as { tracks: TrackMeta[]; stages: { stageId: string; track: string; groupId: string; active?: boolean }[] };
const active = DEF.stages.filter(s => s.active === true);
const bookIds = active.filter(s => s.track === "book").map(s => s.stageId);
const accessIds = active.filter(s => s.track === "access").map(s => s.stageId);
/** A progress document with the given stage scores (status in_progress) — the 9B storage model, no history. */
const progress = (cid: string, sid: string, scores: Record<string, number>) => ({ schemaVersion: 1, programCode: "899373", classId: cid, studentId: sid, stages: Object.fromEntries(Object.entries(scores).map(([id, v]) => [id, { status: "in_progress", score: v, updatedAt: NOW }])), history: [], updatedAt: NOW });
const allBookGraded = () => Object.fromEntries(bookIds.map(id => [id, 80]));
const allGraded = () => Object.fromEntries(active.map(s => [s.stageId, 80]));

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1", ALL), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"),
    "platform/classes/c9.json": room("c9", ALL, { status: "archived", active: false }), "platform/users/s9.json": user("s9", "c9"), ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const calls: { url: string; method: string; body?: Body }[] = [];
  const control = { holdStudent: false, release: () => {} };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    calls.push({ url, method, body });
    if (method === "GET" && url.includes("resource=student&") && control.holdStudent) { control.holdStudent = false; await new Promise<void>(r => { control.release = r; }); }
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, calls, control };
}
const studentReads = (calls: { url: string; method: string }[]) => calls.filter(c => c.method === "GET" && c.url.includes("resource=student&")).map(c => new URL(c.url, "http://x").searchParams.get("studentId"));
const row = (stageId: string) => document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement | null;
const scoreInput = (stageId: string) => within(row(stageId)!).getByRole("spinbutton") as HTMLInputElement;
const pressedTrack = () => within(screen.getByRole("group", { name: "مسارات المشروع" })).getAllByRole("button").find(b => b.getAttribute("aria-pressed") === "true")?.textContent;
const banner = () => document.querySelector(".eb-eval-focus") as HTMLElement | null;
const heading = (sid = "s1") => screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + sid });
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const el = (seq: number, sid = "s1", cid = "c1", code = "899373") => <ProjectStudentDetail token="t" projectCode={code} classId={cid} studentId={sid} tracks={DEF.tracks} onBack={() => {}} evaluationFocusSeq={seq} />;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("9E ProjectStudentDetail — Evaluation Focus Mode", () => {
  it("E1 seq > 0: after the detail loads, the FIRST ungraded stage's score input is focused and revealed; the banner counts the remaining stages; heading focus is replaced", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70, [bookIds[1]]: 0 }) });   // B01 graded, B02 graded with 0 → first ungraded is B03
    render(el(1));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[2])));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(banner()!.textContent).toBe("وضع التقييم — بقيت " + (active.length - 2) + " مراحل بدون علامة.المرحلة التالية غير المقيّمة");
    expect(banner()!.getAttribute("role")).toBe("status");
    expect(pressedTrack()).toBe("الكتاب");
  });
  it("E2 the first ungraded stage lives in ANOTHER track: the track switches automatically, its group is open and its input focused", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allBookGraded()) });                        // every الكتاب stage graded → first ungraded is the first Access stage
    render(el(1));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(accessIds[0])));
    expect(pressedTrack()).toBe("Access");
    const group = row(accessIds[0])!.closest(".eb-stage-group")!;
    expect(within(group as HTMLElement).getByRole("button", { expanded: true })).toBeTruthy();
    expect(row(accessIds[0])!.className).toContain("is-evaluation-pending");
  });
  it("E3 a manual opening (seq 0) is exactly the 8C profile: heading focused, no banner, no highlight, no scroll", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    render(el(0));
    const h = await heading();
    await flush();
    expect(document.activeElement).toBe(h);
    expect(banner()).toBeNull();
    expect(document.querySelector(".is-evaluation-pending")).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
  it("E4/E5 a score of 0 IS graded (not pending); only the ungraded rows carry `is-evaluation-pending`; status semantics untouched", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 0, [bookIds[1]]: 55 }) });
    render(el(1));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[2])));
    expect(row(bookIds[0])!.className).not.toContain("is-evaluation-pending");
    expect(row(bookIds[1])!.className).not.toContain("is-evaluation-pending");
    for (const id of bookIds.slice(2)) expect(row(id)!.className, id).toContain("is-evaluation-pending");
    expect(row(bookIds[0])!.className).toContain("is-in-progress");                               // the workflow class is still the status's
    expect(scoreInput(bookIds[0]).value).toBe("0");
  });
  it("E6 «المرحلة التالية غير المقيّمة» uses the LATEST evaluation: after grading the focused stage it moves to the next still-ungraded one; the banner count follows", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    render(el(1));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[1])));
    const before = banner()!.getAttribute("data-ungraded");
    fireEvent.change(scoreInput(bookIds[1]), { target: { value: "88" } });
    fireEvent.click(within(row(bookIds[1])!).getByRole("button", { name: "حفظ علامة المرحلة " + bookIds[1] }));
    await screen.findByText("تم حفظ العلامة.");
    await waitFor(() => expect(banner()!.getAttribute("data-ungraded")).toBe(String(Number(before) - 1)));
    expect(row(bookIds[1])!.className).not.toContain("is-evaluation-pending");
    fireEvent.click(within(banner()!).getByRole("button", { name: "المرحلة التالية غير المقيّمة" }));
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[2])));
  });
  it("E7 every stage graded → the completion banner, no next-stage button, no focus attempt (heading keeps focus)", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", allGraded()) });
    render(el(1));
    const h = await heading();
    await flush(); await flush();
    expect(banner()!.textContent).toBe("اكتمل تقييم جميع مراحل المشروع لهذا الطالب.");
    expect(banner()!.className).toContain("is-complete");
    expect(within(banner()!).queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(h);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.querySelector(".is-evaluation-pending")).toBeNull();
  });
  it("E8 archived / read-only: the banner is informational only (no next-stage button), no input exists, no focus attempt, no mutation control", async () => {
    server({ [NS.progressName("c9", "s9")]: progress("c9", "s9", { [bookIds[0]]: 40 }) });
    render(el(1, "s9", "c9"));
    const h = await heading("s9");
    await flush(); await flush();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(banner()!.textContent).toContain("وضع التقييم — بقيت");
    expect(within(banner()!).queryByRole("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /حفظ علامة|اعتماد المرحلة|مسح العلامة/ })).toBeNull();
    expect(document.activeElement).toBe(h);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
  it("E9/E10 a NEW seq for the same student re-runs the focus (after the teacher moved away); the SAME seq never re-focuses", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    const view = render(el(1));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[1])));
    fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: "Access" }));   // teacher wanders off
    (document.activeElement as HTMLElement)?.blur();
    expect(pressedTrack()).toBe("Access");
    view.rerender(el(1));                                                                               // same seq → nothing happens
    await flush();
    expect(pressedTrack()).toBe("Access"); expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    view.rerender(el(2));                                                                               // new seq → back to the first ungraded stage
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[1])));
    expect(pressedTrack()).toBe("الكتاب"); expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
  });
  it("E11 a stale student response can never focus an element of the NEW student; the new student gets its own focus only from its own detail", async () => {
    const srv = server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }), [NS.progressName("c1", "s2")]: progress("c1", "s2", allBookGraded()) });
    srv.control.holdStudent = true;
    const view = render(el(1));                                                                          // s1's detail is held
    await flush();
    view.rerender(el(2, "s2"));                                                                          // drill moved to s2 (new seq) while s1 is in flight
    await heading("s2");
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(accessIds[0])));                 // s2's own first ungraded stage (Access)
    await act(async () => { srv.control.release(); });                                                  // s1's stale detail arrives late
    await flush();
    expect(screen.getByRole("heading", { level: 2, name: "ملف المشروع: طالب s2" })).toBeTruthy();
    expect(pressedTrack()).toBe("Access");
    expect(document.activeElement).toBe(scoreInput(accessIds[0]));                                      // never re-aimed at s1's B02
    expect(studentReads(srv.calls)).toEqual(["s1", "s2"]);
  });
});

describe("9E ProjectTracker — the focus seq follows the drill and clears on ordinary navigation", () => {
  let seq = 0;
  const target = (studentId: string): ProjectDrillTarget => ({ projectCode: "899373", classId: "c1", studentId, seq: ++seq });
  const mountTracker = (t: ProjectDrillTarget | null) => render(<ProjectTracker token="t" projectCode="899373" drillTarget={t} />);
  beforeEach(() => { seq = 0; });
  it("T1 a valid 9D drill: classes validate first, the exact student opens, and the first ungraded stage's input is focused (banner shown)", async () => {
    const srv = server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    mountTracker(target("s1"));
    await heading();
    await waitFor(() => expect(document.activeElement).toBe(scoreInput(bookIds[1])));
    expect(banner()).toBeTruthy();
    expect(srv.calls.findIndex(c => c.url.includes("resource=student&"))).toBeGreaterThan(srv.calls.findIndex(c => c.url.includes("resource=classes")));
  });
  it("T2 back → open a student by hand: no focus mode (heading focus, no banner); changing class / view / project clears it too", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    const view = mountTracker(target("s1"));
    await heading();
    await waitFor(() => expect(banner()).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "عودة إلى تقدّم الطلاب" }));
    await screen.findByRole("heading", { level: 2, name: "تقدّم الطلاب" });
    const card = screen.getByText("طالب s2").closest(".eb-student-card") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "فتح ملف الطالب" }));
    const h = await heading("s2");
    await flush(); await flush();
    expect(banner()).toBeNull();
    expect(document.activeElement).toBe(h);
    // a drill again → focus mode; then a view change clears it (no profile, and the next manual open is plain)
    view.rerender(<ProjectTracker token="t" projectCode="899373" drillTarget={target("s1")} />);
    await heading("s1");
    await waitFor(() => expect(banner()).toBeTruthy());
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام المشروع" })).getByRole("button", { name: "لوحة المشروع" }));
    await flush();
    expect(screen.queryByRole("heading", { level: 2, name: /ملف المشروع/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("group", { name: "أقسام المشروع" })).getByRole("button", { name: "تقدّم الطلاب" }));
    await screen.findByText("طالب s1");
    fireEvent.click(within(screen.getByText("طالب s1").closest(".eb-student-card") as HTMLElement).getByRole("button", { name: "فتح ملف الطالب" }));
    await heading("s1");
    await flush(); await flush();
    expect(banner()).toBeNull();
  });
  it("T3 a project switch while a focused profile is open clears the focus mode (no banner on the new project's tracker)", async () => {
    server({ [NS.progressName("c1", "s1")]: progress("c1", "s1", { [bookIds[0]]: 70 }) });
    const view = mountTracker(target("s1"));
    await heading();
    await waitFor(() => expect(banner()).toBeTruthy());
    view.rerender(<ProjectTracker token="t" projectCode="883589" drillTarget={{ projectCode: "899373", classId: "c1", studentId: "s1", seq }} />);
    await screen.findByText("مشروع 883589");
    await flush();
    expect(banner()).toBeNull();
    expect(screen.queryByRole("heading", { level: 2, name: /ملف المشروع/ })).toBeNull();
  });
});
