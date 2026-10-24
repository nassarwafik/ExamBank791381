// @vitest-environment happy-dom
/// <reference types="node" />
// Phase G1 — the class matrix (docs: docs/enterprise-projects-gradebook-g.md; owner decisions of 2026-10-23),
// over the REAL project-tracker handler (in-memory container):
//   • the board carries each student's server summary (progress, weighted grade) — the same figures as the student cards —
//     and the matrix shows them at the end of every row;
//   • the whole track by default, the groups as bands; one group can still be chosen;
//   • every cell is a score AND a «منجز» decision (toggle / Space); with «اعتماد المرحلة عند حفظ العلامة» on (default, shared
//     with the student profile) a new score approves the stage, a cleared one never does; an explicit decision wins;
//   • statuses are written by progress.bulk AFTER the scores, never for a cell whose score failed;
//   • the column menu (done for the students shown / fill empty scores / clear) only creates unsaved changes;
//   • filters; the leave guard counts a «منجز»-only change; an archived class shows no controls.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ProjectBulkReview from "./ProjectBulkReview";
import { gridRowMatches, gridStatusChanges, scoreGridChanges } from "./scoreGrid";
import type { Board } from "./ProjectBulkReview";
import type { TrackMeta } from "./types";

const nodeRequire = createRequire(import.meta.url);
const { handler: tracker } = nodeRequire("../../api/src/functions/project-tracker.js");
const { getProjectDefinition, getStorageNamespace } = nodeRequire("../../api/src/lib/project-tracker/registry.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");

type Body = Record<string, unknown>;
const CODE = "899373";
const NS = getStorageNamespace(CODE);
const NOW = "2026-10-01T00:00:00.000Z";
const DEF = getProjectDefinition(CODE);
const TRACKS: TrackMeta[] = DEF.tracks;
type G = { groupId: string; track: string; order: number; title: string };
const BOOK_GROUPS = (DEF.groups as G[]).filter(g => g.track === "book").sort((a, b) => a.order - b.order);
const stagesOf = (groupId: string) => (DEF.stages as { stageId: string; groupId: string; order: number; active?: boolean }[]).filter(s => s.groupId === groupId && s.active === true).sort((a, b) => a.order - b.order).map(s => s.stageId);
const GRID_GROUP = BOOK_GROUPS.find(g => stagesOf(g.groupId).length >= 3)!.groupId;
const [B1, B2, B3] = stagesOf(GRID_GROUP);
const BOOK_STAGES = BOOK_GROUPS.flatMap(g => stagesOf(g.groupId));
const user = (id: string, cid: string, name: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: name, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
const progress = (sid: string, cid: string, stages: Record<string, Body>) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, startedAt: NOW, updatedAt: NOW, stages, history: [] });

function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"),
    "platform/users/s1.json": user("s1", "c1", "أحمد"), "platform/users/s2.json": user("s2", "c1", "بيان"), "platform/users/s3.json": user("s3", "c1", "جواد"),
    [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 40 } }),
    [NS.progressName("c1", "s2")]: progress("s2", "c1", { [B2]: { status: "ready_for_review" } }),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [];
  const call = async (method: string, url: string, body?: Body) => tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") posts.push(body!);
    const r = await call(method, url, body);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  return { ctx, posts, call, doc: (sid: string) => ctx.getJson(NS.progressName("c1", sid)) };
}
const cell = (name: string, stageId: string) => screen.getByRole("textbox", { name: new RegExp("^" + name + " — " + stageId + " ") }) as HTMLInputElement;
const done = (name: string, stageId: string) => screen.getByRole("button", { name: name + " — " + stageId + ": منجز" });
const saveBtn = () => within(screen.getByRole("region", { name: "حفظ العلامات" })).getByRole("button", { name: /حفظ العلامات/ });
async function openMatrix(readOnly = false, onReadyChanged?: () => void) {
  const view = render(<ProjectBulkReview token="t" projectCode={CODE} classId="c1" tracks={TRACKS} readOnly={readOnly} onReadyChanged={onReadyChanged} />);
  fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
  await screen.findByRole("region", { name: "جدول العلامات" });
  return view;
}
const posted = (s: { posts: Body[] }, action: string) => s.posts.filter(p => p.action === action);

beforeEach(() => { try { window.localStorage.removeItem("eb.projects.approveOnSave"); } catch { /* default ON without storage */ } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("G1 — the board carries the server's summary", () => {
  it("each student's progress and weighted grade equal the student cards' figures (one calculator)", async () => {
    const s = server();
    const board = (await s.call("GET", "/api/project-tracker?resource=board&classId=c1&projectCode=" + CODE)).jsonBody as { students: { studentId: string; summary: { overallProgress: number; grade: number } }[] };
    const cards = (await s.call("GET", "/api/project-tracker?resource=students&classId=c1&projectCode=" + CODE)).jsonBody as { students: { studentId: string; overallProgress: number; grade: number }[] };
    expect(board.students).toHaveLength(3);
    for (const b of board.students) {
      const c = cards.students.find(x => x.studentId === b.studentId)!;
      expect(b.summary, b.studentId).toEqual({ overallProgress: c.overallProgress, grade: c.grade });
    }
    expect(board.students.find(x => x.studentId === "s1")!.summary.grade).toBeGreaterThan(0);   // the approved 40 counts
  });
});

describe("G1 — the pure decisions", () => {
  const board: Board = { readOnly: false, groups: [], stages: [{ stageId: "a", track: "t", groupId: "g", title: "", order: 1, required: true }, { stageId: "b", track: "t", groupId: "g", title: "", order: 2, required: true }, { stageId: "c", track: "t", groupId: "g", title: "", order: 3, required: true }],
    students: [{ studentId: "s", displayName: "س", code: "", cells: { a: { status: "approved", score: 50 }, b: { status: "ready_for_review", score: null }, c: { status: "in_progress", score: 30 } } }] };
  it("a new score approves only with the switch on, never a cleared one; an explicit decision wins; an equal toggle writes nothing", () => {
    const scored = scoreGridChanges({ "s|b": "70" }, board);
    expect(gridStatusChanges({}, scored, board, true)).toEqual([{ key: "s|b", studentId: "s", stageId: "b", to: "approved", implied: true }]);
    expect(gridStatusChanges({}, scored, board, false)).toEqual([]);
    expect(gridStatusChanges({ "s|b": false }, scored, board, true)).toEqual([]);                  // explicit «not done» = saved state
    expect(gridStatusChanges({}, scoreGridChanges({ "s|a": "" }, board), board, true)).toEqual([]); // a cleared score never approves
    expect(gridStatusChanges({}, scoreGridChanges({ "s|c": "" }, board), board, true)).toEqual([]); // …nor on a stage not yet approved
    expect(gridStatusChanges({ "s|a": false }, [], board, false)).toEqual([{ key: "s|a", studentId: "s", stageId: "a", to: "in_progress", implied: false }]);
    expect(gridStatusChanges({ "s|a": true }, [], board, false)).toEqual([]);
  });
  it("filters: waiting = a stage ready for review or marked by the student; unscored = a stage without a score", () => {
    const st = board.students[0];
    expect(gridRowMatches("all", st, ["a"])).toBe(true);
    expect(gridRowMatches("waiting", st, ["a"])).toBe(false);
    expect(gridRowMatches("waiting", st, ["a", "b"])).toBe(true);
    expect(gridRowMatches("unscored", st, ["a"])).toBe(false);
    expect(gridRowMatches("unscored", st, ["b"])).toBe(true);
    expect(gridRowMatches("waiting", { ...st, cells: { a: { status: "approved", score: 1, selfReported: true } } }, ["a"])).toBe(true);
  });
});

describe("G1 — «جدول العلامات» as the class matrix", () => {
  it("opens on the whole track: every book stage, the groups as bands, and each row ends with the server's progress · grade", async () => {
    const s = server();
    await openMatrix();
    for (const id of BOOK_STAGES) expect(cell("أحمد", id)).toBeTruthy();
    const bands = screen.getAllByRole("columnheader").filter(h => h.getAttribute("scope") === "colgroup").map(h => h.textContent);
    expect(bands).toEqual(BOOK_GROUPS.filter(g => stagesOf(g.groupId).length).map(g => g.title));
    const board = (await s.call("GET", "/api/project-tracker?resource=board&classId=c1&projectCode=" + CODE)).jsonBody as { students: { studentId: string; summary: { overallProgress: number; grade: number } }[] };
    const a = board.students.find(x => x.studentId === "s1")!.summary;
    expect(screen.getByLabelText("التقدّم " + a.overallProgress + "٪، العلامة " + a.grade)).toBeTruthy();
  });

  it("switch ON (default): a new score is saved, THEN the stage approved (progress.bulk); the row's grade is re-read", async () => {
    const s = server();
    await openMatrix();
    expect((screen.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(cell("بيان", B2), { target: { value: "90" } });
    expect(done("بيان", B2).getAttribute("aria-pressed")).toBe("true");          // the implied approval shows before saving
    expect(saveBtn().textContent).toContain("(1)");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة، اعتُمدت 1 مرحلة/);
    const order = s.posts.map(p => p.action);
    expect(order).toEqual(["score.bulk", "progress.bulk"]);
    expect(posted(s, "progress.bulk")[0]).toEqual({ projectCode: CODE, action: "progress.bulk", classId: "c1", items: [{ studentId: "s2", stageId: B2 }], status: "approved" });
    expect(s.doc("s2").stages[B2]).toMatchObject({ status: "approved", score: 90 });
    const board = (await s.call("GET", "/api/project-tracker?resource=board&classId=c1&projectCode=" + CODE)).jsonBody as { students: { studentId: string; summary: { overallProgress: number; grade: number } }[] };
    const b = board.students.find(x => x.studentId === "s2")!.summary;
    expect(await screen.findByLabelText("التقدّم " + b.overallProgress + "٪، العلامة " + b.grade)).toBeTruthy();
  });

  it("a cleared score never approves; an explicit «not done» on a new score keeps it a score-only save", async () => {
    const s = server();
    await openMatrix();
    fireEvent.change(cell("أحمد", B1), { target: { value: "" } });              // clear an approved 40
    fireEvent.change(cell("جواد", B3), { target: { value: "70" } });
    fireEvent.click(done("جواد", B3));                                          // implied ✓ → explicitly not done
    expect(done("جواد", B3).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 2 علامة/);
    expect(posted(s, "progress.bulk")).toHaveLength(0);
    expect(s.doc("s1").stages[B1].status).toBe("approved");
    expect(s.doc("s1").stages[B1].score ?? null).toBeNull();
    expect(s.doc("s3").stages[B3].score).toBe(70);
    expect(s.doc("s3").stages[B3].status ?? "not_started").not.toBe("approved");
  });

  it("switch OFF: Space marks a stage done without a score; the toggle reopens an approved stage — statuses only", async () => {
    try { window.localStorage.setItem("eb.projects.approveOnSave", "0"); } catch { /* */ }
    const s = server();
    const ready = vi.fn();
    await openMatrix(false, ready);
    fireEvent.keyDown(cell("بيان", B2), { key: " " });
    expect(done("بيان", B2).getAttribute("aria-pressed")).toBe("true");
    expect(cell("بيان", B2).value).toBe("");                                    // a space is never typed into the score
    fireEvent.click(done("أحمد", B1));                                          // approved → reopen
    expect(saveBtn().textContent).toContain("(2)");
    fireEvent.click(saveBtn());
    await screen.findByText(/اعتُمدت 1 مرحلة، أُعيدت 1 مرحلة إلى قيد التنفيذ/);
    expect(posted(s, "score.bulk")).toHaveLength(0);
    expect(posted(s, "progress.bulk").map(p => [p.status, p.items])).toEqual([["approved", [{ studentId: "s2", stageId: B2 }]], ["in_progress", [{ studentId: "s1", stageId: B1 }]]]);
    expect(s.doc("s2").stages[B2]).toMatchObject({ status: "approved" });
    expect(s.doc("s2").stages[B2].score ?? null).toBeNull();                    // done without a grade: no zero is written
    expect(s.doc("s1").stages[B1]).toMatchObject({ status: "in_progress", score: 40 });
    await waitFor(() => expect(ready).toHaveBeenCalled());                       // the global ready counts are re-read
  });

  it("a score that fails (stale) keeps its approval unsent: no status write for that cell, the change stays for the retry", async () => {
    const s = server();
    await openMatrix();
    fireEvent.change(cell("أحمد", B2), { target: { value: "66" } });
    fireEvent.change(cell("جواد", B2), { target: { value: "77" } });
    s.ctx.setJson(NS.progressName("c1", "s1"), progress("s1", "c1", { [B1]: { status: "approved", score: 40 }, [B2]: { status: "in_progress", score: 12 } }));   // another write meanwhile
    fireEvent.click(saveBtn());
    await screen.findByText(/تعذر حفظ 1/);
    expect(posted(s, "progress.bulk")).toHaveLength(1);
    expect(posted(s, "progress.bulk")[0].items).toEqual([{ studentId: "s3", stageId: B2 }]);
    expect(s.doc("s1").stages[B2]).toMatchObject({ status: "in_progress", score: 12 });   // the newer score survives, not approved
    expect(cell("أحمد", B2).value).toBe("66");                                  // the teacher's value stays for the retry
    expect(within(screen.getByRole("list", { name: "علامات لم تُحفظ" })).getByText(/تغيّرت العلامة على الخادم إلى 12/)).toBeTruthy();
  });

  it("the column menu creates unsaved changes only: done for the students shown, fill empty scores, clear scores", async () => {
    const s = server();
    await openMatrix();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات المرحلة " + B1 }));
    fireEvent.click(await screen.findByRole("button", { name: "تعبئة العلامات الفارغة…" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "١٠١" } });
    expect((within(dialog).getByRole("button", { name: "تعبئة" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "٦٠" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "تعبئة" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect([cell("أحمد", B1).value, cell("بيان", B1).value, cell("جواد", B1).value]).toEqual(["40", "60", "60"]);   // a saved score is never overwritten
    fireEvent.click(screen.getByRole("button", { name: "إجراءات المرحلة " + B3 }));
    fireEvent.click(await screen.findByRole("button", { name: "تحديد المرحلة منجزة للطلاب المعروضين" }));
    for (const n of ["أحمد", "بيان", "جواد"]) expect(done(n, B3).getAttribute("aria-pressed")).toBe("true");
    expect(s.posts).toHaveLength(0);                                            // nothing is written before «حفظ العلامات»
    fireEvent.click(screen.getByRole("button", { name: "إجراءات المرحلة " + B1 }));
    fireEvent.click(await screen.findByRole("button", { name: "مسح علامات المرحلة" }));
    expect(cell("أحمد", B1).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "تجاهل التغييرات" }));
    expect([cell("أحمد", B1).value, cell("بيان", B1).value]).toEqual(["40", ""]);
    expect(done("جواد", B3).getAttribute("aria-pressed")).toBe("false");
    expect(s.posts).toHaveLength(0);
  });

  it("filters narrow the rows: «بانتظار الاعتماد» shows the student with a stage ready for review", async () => {
    server();
    await openMatrix();
    fireEvent.click(screen.getByRole("button", { name: "بانتظار الاعتماد" }));
    const rows = within(screen.getByRole("region", { name: "جدول العلامات" })).getAllByRole("rowheader").map(r => r.textContent || "");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("بيان");
    fireEvent.click(screen.getByRole("button", { name: "الكل" }));
    expect(within(screen.getByRole("region", { name: "جدول العلامات" })).getAllByRole("rowheader")).toHaveLength(3);
  });

  it("a «منجز»-only change is unsaved work: changing the group asks first", async () => {
    try { window.localStorage.setItem("eb.projects.approveOnSave", "0"); } catch { /* */ }
    server();
    await openMatrix();
    fireEvent.click(done("بيان", B1));
    fireEvent.change(screen.getByRole("combobox", { name: /المجموعة/ }), { target: { value: GRID_GROUP } });
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain("1 تغيير");
    fireEvent.click(within(dialog).getByRole("button", { name: "متابعة الإدخال" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(done("بيان", B1).getAttribute("aria-pressed")).toBe("true");
  });

  it("turning the switch off here turns it off for the student profile too (one remembered setting)", async () => {
    server();
    await openMatrix();
    fireEvent.click(screen.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" }));
    expect(window.localStorage.getItem("eb.projects.approveOnSave")).toBe("0");
  });

  it("an archived class shows scores and ✓ without any input, toggle, menu or save bar", async () => {
    server({ "platform/classes/c1.json": room("c1", { status: "archived", active: false }) });
    await openMatrix(true);
    await within(screen.getByRole("region", { name: "جدول العلامات" })).findByText("40");
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /: منجز$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^إجراءات المرحلة/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "حفظ العلامات" })).toBeNull();
    expect(screen.getAllByLabelText("منجز").length).toBeGreaterThan(0);
  });
});
