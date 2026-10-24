// @vitest-environment happy-dom
/// <reference types="node" />
// Phase G4b — a cell's «سجلّ التغييرات» from the class matrix (docs: docs/enterprise-projects-gradebook-g.md), over the REAL
// project-tracker handler (in-memory container):
//   • the last focused cell is the matrix's active cell; «سجلّ الخلية» opens THAT student's stage history (the G3 read,
//     `resource=stage-history`), titled with the stage and the student; Shift+F10 / the context-menu key in the cell does too;
//   • the button names the active cell, and is disabled before a cell is chosen or once the cell is no longer shown;
//   • in an archived class every cell is a button that opens its history;
//   • the dialog is the student table's (one shared component): read at each opening, a response for an earlier opening dropped.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

import ProjectBulkReview from "./ProjectBulkReview";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const DEF = getProjectDefinition(CODE) as { title: string; tracks: TrackMeta[]; stages: { stageId: string; track: string; order: number; title: string; active?: boolean }[] };
const TRACKS: TrackMeta[] = DEF.tracks;
const ACTIVE = DEF.stages.filter(s => s.active === true);
const BOOK = ACTIVE.filter(s => s.track === "book").sort((a, b) => a.order - b.order);
const [B1, B2] = BOOK.map(s => s.stageId);
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "STU-" + id + "-9876" });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "العاشر أ", active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const progress = (sid: string, cid: string, stages: Record<string, Body>, history: Body[] = []) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history });
const ev = (n: number, stageId: string, over: Body) => ({ eventId: "e" + n, stageId, actor: "teacher-1", createdAt: new Date(Date.parse(NOW) + n * 60000).toISOString(), ...over });

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/classes/c9.json": room("c9", { status: "archived", active: false }),
    "platform/users/s1.json": user("s1", "c1", "بيان"), "platform/users/s2.json": user("s2", "c1", "أحمد"), "platform/users/s9.json": user("s9", "c9", "ليث"),
    [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 40, note: "ملاحظة سرية للمعلم" }, [B2]: { status: "approved", selfReportedAt: NOW, selfReportedBy: "s1" } }),
    [NS.progressName("c1", "s2")]: progress("s2", "c1", { [B1]: { status: "in_progress", score: 0 } }),
    ...seed
  });
  const audits: Body[] = [];
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async (_c: unknown, e: Body) => { audits.push(e); }, recordProjectMilestones: async () => {} };
  const call = async (method: string, url: string, body?: Body) => tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
  const gets: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "GET") gets.push(url);
    const r = await call(method, url, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const get = (q: string) => call("GET", "/api/project-tracker?projectCode=" + CODE + "&" + q);
  const post = (body: Body) => call("POST", "/api/project-tracker", { projectCode: CODE, ...body });
  return { ctx, audits, gets, get, post };
}

beforeEach(() => {
  try { window.localStorage.removeItem("eb.projects.approveOnSave"); } catch { /* none */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
const HISTORY = {
  [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 40 } }, [
    ev(1, B1, { type: "score", fromScore: null, toScore: 40 }), ev(2, B1, { type: "status", fromStatus: "not_started", toStatus: "approved", source: "student", actor: "s1" })]),
  [NS.progressName("c1", "s2")]: progress("s2", "c1", { [B1]: { status: "in_progress", score: 0 } }, [
    ev(3, B1, { type: "score", fromScore: null, toScore: 0, actor: "teacher-2" })]),
};
async function openMatrix(classId = "c1", readOnly = false) {
  render(<ProjectBulkReview token="t" projectCode={CODE} classId={classId} tracks={TRACKS} readOnly={readOnly} />);
  fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
  await screen.findByRole("region", { name: "جدول العلامات" });
}
const cell = (name: string, stageId: string) => screen.getByRole("textbox", { name: new RegExp("^" + name + " — " + stageId + " ") });
const historyButton = () => screen.getByRole("button", { name: /^سجلّ (تغييرات )?الخلية/ }) as HTMLButtonElement;
const lines = (dialog: HTMLElement) => within(dialog).getAllByRole("listitem").map(li => li.querySelector(".eb-timeline-text")!.textContent + " · " + li.querySelector(".eb-stage-history-by")!.textContent);

describe("G4b — «سجلّ الخلية» in the class matrix", () => {
  it("opens the focused cell's history: that student's stage only, titled with the stage and the student", async () => {
    const s = server(HISTORY);
    await openMatrix();
    expect(historyButton().disabled).toBe(true);                                                      // no cell chosen yet
    fireEvent.focus(cell("أحمد", B1));
    expect(historyButton().disabled).toBe(false);
    expect(historyButton().getAttribute("aria-label")).toBe("سجلّ تغييرات الخلية: أحمد — " + B1);
    fireEvent.click(historyButton());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: new RegExp("^سجلّ تغييرات المرحلة " + B1 + " — .+ · أحمد$") })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(1));
    expect(lines(dialog)).toEqual(["وُضعت العلامة 0 / 100 · معلم آخر"]);
    const reads = s.gets.filter(u => u.includes("resource=stage-history"));
    expect(reads).toHaveLength(1);
    expect(new URL(reads[0], "https://x").searchParams.get("studentId")).toBe("s2");
    expect(new URL(reads[0], "https://x").searchParams.get("stageId")).toBe(B1);
    expect(new URL(reads[0], "https://x").searchParams.get("classId")).toBe("c1");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.focus(cell("بيان", B1));                                                                // another row: its own history
    expect(historyButton().getAttribute("aria-label")).toBe("سجلّ تغييرات الخلية: بيان — " + B1);
    fireEvent.click(historyButton());
    const second = await screen.findByRole("dialog");
    await waitFor(() => expect(lines(second)).toEqual(["حدّدها الطالب كمنفّذة · الطالب", "وُضعت العلامة 40 / 100 · أنت"]));
    expect(within(second).getByRole("heading").textContent).toMatch(/ · بيان$/);
  });
  it("Shift+F10 or the context-menu key in a cell opens its history; the matrix keeps its drafts", async () => {
    server(HISTORY);
    await openMatrix();
    fireEvent.change(cell("أحمد", B2), { target: { value: "77" } });
    fireEvent.keyDown(cell("بيان", B1), { key: "F10", shiftKey: true });
    let dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(lines(dialog)).toEqual(["حدّدها الطالب كمنفّذة · الطالب", "وُضعت العلامة 40 / 100 · أنت"]));
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.keyDown(cell("أحمد", B1), { key: "ContextMenu" });
    dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(lines(dialog)).toEqual(["وُضعت العلامة 0 / 100 · معلم آخر"]));
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((cell("أحمد", B2) as HTMLInputElement).value).toBe("77");                                   // the draft is still there
    expect(screen.getByText("1 تغيير جاهز للحفظ")).toBeTruthy();
  });
  it("the button is disabled once the active cell is no longer shown (a filter hides its student, another track hides its stage)", async () => {
    server(HISTORY);
    await openMatrix();
    fireEvent.focus(cell("أحمد", B1));
    fireEvent.click(within(screen.getByRole("group", { name: "عرض الطلاب" })).getByRole("button", { name: "بانتظار الاعتماد" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: new RegExp("^أحمد — ") })).toBeNull());   // أحمد waits for nothing
    expect(historyButton().disabled).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "عرض الطلاب" })).getByRole("button", { name: "الكل" }));
    fireEvent.focus(cell("أحمد", B1));
    expect(historyButton().disabled).toBe(false);
    const other = TRACKS.find(t => t.trackId !== "book")!;
    fireEvent.click(within(screen.getByRole("group", { name: "المسار" })).getByRole("button", { name: other.title }));
    await waitFor(() => expect(historyButton().disabled).toBe(true));
    expect(historyButton().getAttribute("aria-label")).toBe("سجلّ الخلية (اختر خلية أولًا)");
  });
  it("in an archived class every cell is a button that opens its history", async () => {
    const s = server({ [NS.progressName("c9", "s9")]: progress("s9", "c9", { [B1]: { status: "approved", score: 70 } }, [ev(4, B1, { type: "score", fromScore: 60, toScore: 70 })]) });
    await openMatrix("c9", true);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: new RegExp("^ليث — " + B1 + " \\(.+\\): 70 من 100 — سجلّ التغييرات$") }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(lines(dialog)).toEqual(["تغيّرت العلامة من 60 / 100 إلى 70 / 100 · أنت"]));
    expect(new URL(s.gets.filter(u => u.includes("resource=stage-history"))[0], "https://x").searchParams.get("studentId")).toBe("s9");
  });
  it("a new opening never shows the previous cell's history while it reads its own", async () => {
    server(HISTORY);
    await openMatrix();
    fireEvent.keyDown(cell("بيان", B1), { key: "ContextMenu" });
    let dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(2));
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>(r => { release = r; });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("stage-history")) await gate;                                        // أحمد's read is slow
      return real(input, init);
    }) as unknown as typeof fetch;
    fireEvent.keyDown(cell("أحمد", B1), { key: "ContextMenu" });
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("status").textContent).toBe("جارٍ تحميل سجلّ التغييرات...");
    expect(within(dialog).queryAllByRole("listitem")).toHaveLength(0);                               // never بيان's two events
    release();
    await waitFor(() => expect(lines(dialog)).toEqual(["وُضعت العلامة 0 / 100 · معلم آخر"]));
  });
  it("a response for an earlier opening is dropped: the dialog shows the cell it was opened for", async () => {
    server(HISTORY);
    await openMatrix();
    const real = globalThis.fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>(r => { release = r; });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("stage-history") && url.includes("studentId=s1")) await gate;                // بيان's read is slow
      return real(input, init);
    }) as unknown as typeof fetch;
    fireEvent.keyDown(cell("بيان", B1), { key: "ContextMenu" });
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.keyDown(cell("أحمد", B1), { key: "ContextMenu" });
    dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(lines(dialog)).toEqual(["وُضعت العلامة 0 / 100 · معلم آخر"]));
    release();
    await new Promise(r => setTimeout(r, 20));
    expect(lines(dialog)).toEqual(["وُضعت العلامة 0 / 100 · معلم آخر"]);                               // بيان's late answer never lands
    expect(within(dialog).getByRole("heading").textContent).toMatch(/ · أحمد$/);
  });
});
