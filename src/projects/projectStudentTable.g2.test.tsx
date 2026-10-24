// @vitest-environment happy-dom
/// <reference types="node" />
// Phase G2 — the student's stage table (docs: docs/enterprise-projects-gradebook-g.md; owner decisions of 2026-10-23), over the
// REAL project-tracker handler (in-memory container):
//   • the stages of the selected track are ONE table — الموضوع | منجز؟ | العلامة من 100 | الموزونة | الحالة | إجراءات — with each
//     group as a section row; the weighted value is the server's (`performance.stageValues`), never computed here;
//   • every row is a score AND a «منجز» decision, as a matrix cell (Phase G1): Enter moves to the next topic without writing, the
//     switch «اعتماد المرحلة عند حفظ العلامة» (default ON, shared) approves a typed score on save, a cleared score never does, an
//     explicit decision wins, a student's unconfirmed mark is confirmed by a typed score (the P8 rule);
//   • one save bar writes score.bulk (stale-guarded) THEN progress.bulk, never a status for a stage whose score failed, then
//     re-reads the profile; the row menu carries the details / note dialog, «مسح العلامة» and the two other workflow statuses;
//   • drafts are per stage, cleared on a selection change, confirmed before moving to a sibling; archived shows no control.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { gridStatusChanges, scoreGridChanges } from "./scoreGrid";
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
const DEF = getProjectDefinition(CODE) as { tracks: TrackMeta[]; groups: { groupId: string; track: string; title: string; order: number }[]; stages: { stageId: string; track: string; groupId: string; title: string; order: number; active?: boolean; required?: boolean }[] };
const active = DEF.stages.filter(s => s.active === true);
const bookStages = active.filter(s => s.track === "book").sort((a, b) => a.order - b.order);
const [B1, B2, B3] = bookStages.map(s => s.stageId);
const accessStages = active.filter(s => s.track === "access").sort((a, b) => a.order - b.order);
const A1 = accessStages[0].stageId;
const user = (id: string, cid: string) => ({ userId: id, role: "student", active: true, archived: false, authVersion: 1, classId: cid, displayName: "طالب " + id, code: "C" + id });
const room = (id: string, over: Body = {}) => ({ classId: id, name: "صف " + id, active: true, status: "active", studentIds: [], programCodes: [CODE], schoolYear: "2026", updatedAt: NOW, createdAt: NOW, ...over });
type Entry = { status: string; score?: number; note?: string; selfReportedAt?: string; selfReportedBy?: string; approvedAt?: string; updatedAt?: string };
const doc = (cid: string, sid: string, stages: Record<string, Entry>) => ({ schemaVersion: 1, programCode: CODE, classId: cid, studentId: sid, stages: Object.fromEntries(Object.entries(stages).map(([id, e]) => [id, { updatedAt: NOW, ...e }])), history: [], updatedAt: NOW, createdAt: NOW });
const docKey = (cid: string, sid: string): string => NS.progressName(cid, sid);

/** The real server behind `fetch`; every POST body and every GET url is recorded. */
function server(seed: Record<string, unknown> = {}) {
  const ctx = createMemoryContainer({
    "platform/classes/c1.json": room("c1"), "platform/users/s1.json": user("s1", "c1"), "platform/users/s2.json": user("s2", "c1"),
    "platform/classes/c9.json": room("c9", { status: "archived", active: false }), "platform/users/s9.json": user("s9", "c9"),
    [docKey("c1", "s1")]: doc("c1", "s1", { [B1]: { status: "approved", score: 40, approvedAt: NOW }, [B2]: { status: "ready_for_review" }, [B3]: { status: "approved", selfReportedAt: NOW, selfReportedBy: "s1" } }),
    [docKey("c9", "s9")]: doc("c9", "s9", { [B1]: { status: "approved", score: 40, approvedAt: NOW, note: "ممتاز" } }),
    ...seed
  });
  const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), container: ctx.container, getContainer: () => ctx.container, recordAuditEvent: async () => {}, recordProjectMilestones: async () => {} };
  const posts: Body[] = [], gets: string[] = [];
  const control = { failNext: "" };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Body : undefined;
    if (method === "POST") {
      posts.push(body!);
      if (control.failNext) { const msg = control.failNext; control.failNext = ""; return { ok: false, status: 503, json: async () => ({ ok: false, error: msg }) } as Response; }
    } else gets.push(url);
    const r = await tracker({ method, url: "https://x" + url, json: async () => body ?? {} }, deps);
    return { ok: r.status < 400, status: r.status, json: async () => r.jsonBody } as Response;
  }) as unknown as typeof fetch;
  const read = (sid: string, cid = "c1") => ctx.getJson(docKey(cid, sid)) as { stages: Record<string, Entry> };
  const posted = (action: string) => posts.filter(p => p.action === action);
  return { ctx, posts, gets, control, read, posted };
}

const el = (over: Partial<{ studentId: string; classId: string; seq: number; onChanged: () => void; onReadyChanged: () => void; onOpenSibling: (id: string) => void; siblings: { previous: { studentId: string; displayName: string } | null; next: { studentId: string; displayName: string } | null; position: number; total: number } | null }> = {}) => (
  <ProjectStudentDetail token="t" projectCode={CODE} classId={over.classId || "c1"} studentId={over.studentId || "s1"} tracks={DEF.tracks} onBack={() => {}}
    onChanged={over.onChanged} onReadyChanged={over.onReadyChanged} evaluationFocusSeq={over.seq || 0} siblings={over.siblings ?? null} onOpenSibling={over.onOpenSibling} />
);
async function mount(over: Parameters<typeof el>[0] = {}) {
  const view = render(el(over));
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب " + (over.studentId || "s1") });
  await screen.findByRole("table");
  return view;
}
const row = (stageId: string) => document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement;
const cell = (stageId: string) => within(row(stageId)).getByRole("textbox") as HTMLInputElement;
const done = (stageId: string) => within(row(stageId)).getByRole("button", { name: stageId + ": منجز" }) as HTMLButtonElement;
const type = (stageId: string, v: string) => fireEvent.change(cell(stageId), { target: { value: v } });
const saveBtn = () => within(screen.getByRole("region", { name: "حفظ تغييرات الطالب" })).getByRole("button", { name: /^حفظ التغييرات/ }) as HTMLButtonElement;
const openMenu = (stageId: string) => fireEvent.click(within(row(stageId)).getByRole("button", { name: "إجراءات المرحلة " + stageId }));

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* no storage */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("G2 — the pure decisions (the matrix's helpers over one student)", () => {
  const board: Board = { readOnly: false, groups: [], stages: [{ stageId: "a", track: "t", groupId: "g", title: "", order: 1, required: true }, { stageId: "b", track: "t", groupId: "g", title: "", order: 2, required: true }],
    students: [{ studentId: "s", displayName: "س", code: "", cells: { a: { status: "approved", score: 50, selfReported: true }, b: { status: "in_progress", score: null } } }] };
  it("a score typed on a stage the student marked confirms it (switch on); the toggle left on writes nothing; off reopens it", () => {
    expect(gridStatusChanges({}, scoreGridChanges({ "s|a": "70" }, board), board, true)).toEqual([{ key: "s|a", studentId: "s", stageId: "a", to: "approved", implied: true }]);
    expect(gridStatusChanges({}, scoreGridChanges({ "s|a": "70" }, board), board, false)).toEqual([]);
    expect(gridStatusChanges({ "s|a": true }, [], board, true)).toEqual([]);
    expect(gridStatusChanges({ "s|a": false }, [], board, true)).toEqual([{ key: "s|a", studentId: "s", stageId: "a", to: "in_progress", implied: false }]);
    expect(gridStatusChanges({}, scoreGridChanges({ "s|a": "" }, board), board, true)).toEqual([]);      // a cleared score never approves
  });
});

describe("G2 — the student's stage table", () => {
  it("one table per track: the column headers, every group as a section row, every active stage as a row with the server's weighted value", async () => {
    server();
    await mount();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map(h => h.textContent)).toEqual(["الموضوع", "منجز؟", "العلامة من 100", "الموزونة", "الحالة", "إجراءات"]);
    const bookGroups = DEF.groups.filter(g => g.track === "book" && bookStages.some(s => s.groupId === g.groupId)).sort((a, b) => a.order - b.order);
    expect(Array.from(table.querySelectorAll(".eb-stage-group-row")).map(r => r.querySelector(".eb-stage-group-title")?.textContent)).toEqual(bookGroups.map(g => g.title));
    expect(Array.from(table.querySelectorAll("[data-stage-id]")).map(r => r.getAttribute("data-stage-id"))).toEqual(bookStages.map(s => s.stageId));
    expect(cell(B1).value).toBe("40");
    expect(done(B1).getAttribute("aria-pressed")).toBe("true");
    expect(row(B1).querySelector(".eb-stage-cell-value")!.textContent).toMatch(/^\d/);                     // the server's contribution / max
    expect(within(row(B2)).getByText("جاهز للفحص")).toBeTruthy();
    expect(within(row(B3)).getByText("حدّدها الطالب")).toBeTruthy();
    expect(done(B3).getAttribute("aria-pressed")).toBe("true");
    // the other track is one click away; its rows replace these
    fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: DEF.tracks[1].title }));
    expect(row(A1)).toBeTruthy(); expect(row(B1)).toBeNull();
  });

  it("switch ON (default): typing scores, Enter moves to the next topic without writing; «حفظ التغييرات» sends score.bulk THEN progress.bulk and re-reads the profile", async () => {
    const s = server();
    const onChanged = vi.fn(), onReadyChanged = vi.fn();
    await mount({ onChanged, onReadyChanged });
    expect((screen.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" }) as HTMLInputElement).checked).toBe(true);
    type(B2, "70");
    fireEvent.keyDown(cell(B2), { key: "Enter" });
    expect(document.activeElement).toBe(cell(B3));
    expect(s.posts).toHaveLength(0);                                                                      // Enter never writes
    expect(done(B2).getAttribute("aria-pressed")).toBe("true");                                           // the implied approval shows before saving
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    const getsBefore = s.gets.length;
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة، اعتُمدت 1 مرحلة/);
    expect(s.posts.map(p => p.action)).toEqual(["score.bulk", "progress.bulk"]);
    expect(s.posts[0]).toEqual({ action: "score.bulk", projectCode: CODE, classId: "c1", items: [{ studentId: "s1", stageId: B2, score: 70, expected: null }] });
    expect(s.posts[1]).toEqual({ action: "progress.bulk", projectCode: CODE, classId: "c1", status: "approved", items: [{ studentId: "s1", stageId: B2 }] });
    expect(s.read("s1").stages[B2]).toMatchObject({ status: "approved", score: 70 });
    expect(s.gets.length).toBe(getsBefore + 1);                                                           // one re-read of the profile
    expect(onChanged).toHaveBeenCalledTimes(1); expect(onReadyChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(row(B2)).getByText("تم الاعتماد")).toBeTruthy());
    expect(saveBtn().textContent).toBe("حفظ التغييرات");                                                 // nothing left to save
  });

  it("a score typed on the stage the student marked confirms it (one progress.bulk); a cleared score never approves; an explicit «not done» wins", async () => {
    const s = server();
    await mount();
    type(B3, "90");                                                                                        // student-marked → confirmation implied
    type(B1, "");                                                                                          // clear an approved 40
    type(B2, "55"); fireEvent.click(done(B2));                                                             // implied ✓ → explicitly not done
    expect(done(B2).getAttribute("aria-pressed")).toBe("false");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (3)");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 3 علامة، اعتُمدت 1 مرحلة/);
    expect(s.posted("progress.bulk")).toEqual([{ action: "progress.bulk", projectCode: CODE, classId: "c1", status: "approved", items: [{ studentId: "s1", stageId: B3 }] }]);
    expect(s.read("s1").stages[B3]).toMatchObject({ status: "approved", score: 90 });
    expect(s.read("s1").stages[B3].selfReportedAt).toBeUndefined();                                       // confirmed by the teacher
    expect(s.read("s1").stages[B1].status).toBe("approved");
    expect(s.read("s1").stages[B1].score ?? null).toBeNull();
    expect(s.read("s1").stages[B2]).toMatchObject({ status: "ready_for_review", score: 55 });
  });

  it("switch OFF: Space marks a stage done without a score (progress.bulk only, no zero written); the toggle reopens an approved stage", async () => {
    try { window.localStorage.setItem("eb.projects.approveOnSave", "0"); } catch { /* */ }
    const s = server();
    const onReadyChanged = vi.fn();
    await mount({ onReadyChanged });
    fireEvent.keyDown(cell(B2), { key: " " });
    expect(cell(B2).value).toBe("");
    expect(done(B2).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(done(B1));                                                                             // approved → reopen
    expect(saveBtn().textContent).toBe("حفظ التغييرات (2)");
    fireEvent.click(saveBtn());
    await screen.findByText(/اعتُمدت 1 مرحلة، أُعيدت 1 مرحلة إلى قيد التنفيذ/);
    expect(s.posted("score.bulk")).toHaveLength(0);
    expect(s.posted("progress.bulk").map(p => [p.status, p.items])).toEqual([["approved", [{ studentId: "s1", stageId: B2 }]], ["in_progress", [{ studentId: "s1", stageId: B1 }]]]);
    expect(s.read("s1").stages[B2]).toMatchObject({ status: "approved" });
    expect(s.read("s1").stages[B2].score ?? null).toBeNull();
    expect(s.read("s1").stages[B1]).toMatchObject({ status: "in_progress", score: 40 });
    expect(onReadyChanged).toHaveBeenCalledTimes(1);
    // with the switch off a typed score alone changes no status
    type(B2, "60");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة\./);
    expect(s.posted("progress.bulk")).toHaveLength(2);
  });

  it("a score that fails (stale) keeps its draft, shows the server's value on the row and sends no status for that stage; the other stage saves", async () => {
    const s = server();
    await mount();
    type(B1, "45"); type(B2, "70");
    fireEvent.click(done(B1));                                                                             // an explicit reopening of B1 rides the same save
    expect(done(B1).getAttribute("aria-pressed")).toBe("false");
    // another write changes B1 meanwhile: the row still shows 40 as `expected`
    s.ctx.setJson(docKey("c1", "s1"), { ...s.read("s1"), stages: { ...s.read("s1").stages, [B1]: { status: "approved", score: 77, approvedAt: NOW, updatedAt: NOW } } });
    fireEvent.click(saveBtn());
    await screen.findByText(/وتعذر حفظ 1/);
    expect(s.posts[0]).toMatchObject({ action: "score.bulk", items: [{ studentId: "s1", stageId: B1, score: 45, expected: 40 }, { studentId: "s1", stageId: B2, score: 70, expected: null }] });
    expect(s.posted("progress.bulk")).toEqual([{ action: "progress.bulk", projectCode: CODE, classId: "c1", status: "approved", items: [{ studentId: "s1", stageId: B2 }] }]);   // no in_progress write for B1
    expect(within(row(B1)).getByRole("alert").textContent).toContain("تغيّرت العلامة على الخادم إلى 77");
    expect(cell(B1).value).toBe("45");                                                                     // the draft stays for the retry
    expect(done(B1).getAttribute("aria-pressed")).toBe("false");                                            // and so does the decision
    expect(s.read("s1").stages[B1]).toMatchObject({ status: "approved", score: 77 });
    expect(s.read("s1").stages[B2]).toMatchObject({ status: "approved", score: 70 });
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
  });

  it("an invalid value blocks the save and is named; Escape restores the row; «تجاهل التغييرات» drops every draft", async () => {
    const s = server();
    await mount();
    type(B2, "abc"); type(B1, "50");                                                                       // one invalid beside one valid
    expect(saveBtn().disabled).toBe(true);                                                                // the valid one does not unlock the bar
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    expect(screen.getByRole("alert").textContent).toContain("صحّح علامة واحدة");
    fireEvent.click(saveBtn());
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(s.posts).toHaveLength(0);
    fireEvent.keyDown(cell(B2), { key: "Escape" });
    expect(cell(B2).value).toBe("");
    expect(saveBtn().disabled).toBe(false);                                                               // B1's valid draft remains
    fireEvent.keyDown(cell(B1), { key: "Escape" });
    expect(saveBtn().disabled).toBe(true);                                                                // nothing to save
    type(B2, "٦٥");                                                                                        // Arabic-Indic digits are a value
    fireEvent.click(done(B1));
    expect(saveBtn().textContent).toBe("حفظ التغييرات (2)");
    fireEvent.click(screen.getByRole("button", { name: "تجاهل التغييرات" }));
    expect(cell(B2).value).toBe("");
    expect(done(B1).getAttribute("aria-pressed")).toBe("true");
    expect(s.posts).toHaveLength(0);
  });

  it("the row menu: the details dialog saves the note through progress.update; «مسح العلامة» is an unsaved change; «جاهز للفحص» is written at once", async () => {
    const s = server();
    const onReadyChanged = vi.fn();
    await mount({ onReadyChanged });
    openMenu(B1);
    fireEvent.click(screen.getByRole("button", { name: "التفاصيل والملاحظة" }));
    const dialog = await screen.findByRole("dialog", { name: new RegExp("^المرحلة " + B1) });
    expect(within(dialog).getByText(/^العلامة:/).textContent).toBe("العلامة: 40 / 100");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "ملاحظة المعلم" }), { target: { value: "أحسنت" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ الملاحظة" }));
    await screen.findByText("تم حفظ الملاحظة.");
    expect(s.posts).toEqual([{ action: "progress.update", projectCode: CODE, classId: "c1", studentId: "s1", stageId: B1, note: "أحسنت" }]);
    expect(s.read("s1").stages[B1].note).toBe("أحسنت");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    expect(within(row(B1)).getByText("ملاحظة")).toBeTruthy();
    openMenu(B1);
    fireEvent.click(screen.getByRole("button", { name: "مسح العلامة" }));
    expect(cell(B1).value).toBe("");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    expect(s.posts).toHaveLength(1);                                                                       // nothing written yet
    openMenu(B2);
    expect((screen.getByRole("button", { name: "جاهز للفحص" }) as HTMLButtonElement).disabled).toBe(true);                       // already that status
    fireEvent.click(screen.getByRole("button", { name: "لم يبدأ" }));
    await screen.findByText("تم تحديث حالة المرحلة.");
    expect(s.posts[1]).toEqual({ action: "progress.update", projectCode: CODE, classId: "c1", studentId: "s1", stageId: B2, status: "not_started" });
    expect(onReadyChanged).toHaveBeenCalledTimes(1);
  });

  it("the fields are disabled while a save is in flight and a double click sends one write; a failed request keeps the drafts", async () => {
    const s = server();
    await mount();
    type(B2, "70");
    s.control.failNext = "server down";
    const button = saveBtn();
    fireEvent.click(button); fireEvent.click(button);                                                     // the second click lands on the busy button
    expect(cell(B2).disabled).toBe(true);
    await screen.findByRole("alert");
    expect(cell(B2).disabled).toBe(false);
    expect(s.posts).toHaveLength(1);
    expect(cell(B2).value).toBe("70");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (1)");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة/);
    expect(s.read("s1").stages[B2].score).toBe(70);
  });

  it("drafts are per stage and per selection: a track switch keeps them, a student switch drops them; a slow write for the previous student never lands on the current one", async () => {
    const s = server({ [docKey("c1", "s2")]: doc("c1", "s2", {}) });
    const view = await mount();
    type(B2, "70");
    fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: DEF.tracks[1].title }));
    type(A1, "30");
    expect(saveBtn().textContent).toBe("حفظ التغييرات (2)");                                               // both tracks' changes count
    fireEvent.click(within(screen.getByRole("group", { name: "مسارات المشروع" })).getByRole("button", { name: DEF.tracks[0].title }));
    expect(cell(B2).value).toBe("70");
    view.rerender(el({ studentId: "s2" }));
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب s2" });
    await screen.findByRole("table");
    expect(cell(B2).value).toBe("");
    expect(saveBtn().textContent).toBe("حفظ التغييرات");
    expect(s.posts).toHaveLength(0);
  });

  it("moving to a sibling with unsaved changes asks first (a «منجز»-only change included); without changes it moves at once", async () => {
    server();
    const onOpenSibling = vi.fn();
    await mount({ onOpenSibling, siblings: { previous: null, next: { studentId: "s2", displayName: "طالب s2" }, position: 1, total: 2 } });
    fireEvent.click(done(B2));
    fireEvent.click(screen.getByRole("button", { name: "الطالب التالي: طالب s2" }));
    const dialog = await screen.findByRole("dialog", { name: "تغييرات لم تُحفظ" });
    fireEvent.click(within(dialog).getByRole("button", { name: "البقاء هنا" }));
    expect(onOpenSibling).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تجاهل التغييرات" }));
    fireEvent.click(screen.getByRole("button", { name: "الطالب التالي: طالب s2" }));
    expect(onOpenSibling).toHaveBeenCalledWith("s2");
  });

  it("focus mode (9E): the first ungraded stage's field is focused; after the save the banner counts the server's latest evaluation", async () => {
    server();
    await mount({ seq: 1 });
    await waitFor(() => expect(document.activeElement).toBe(cell(B2)));                                     // B1 is graded (40); B2 is the first ungraded
    const banner = document.querySelector(".eb-eval-focus") as HTMLElement;
    const before = Number(banner.getAttribute("data-ungraded"));
    type(B2, "70");
    fireEvent.click(saveBtn());
    await screen.findByText(/حُفظت 1 علامة/);
    await waitFor(() => expect(Number((document.querySelector(".eb-eval-focus") as HTMLElement).getAttribute("data-ungraded"))).toBe(before - 1));
    fireEvent.click(screen.getByRole("button", { name: "المرحلة التالية غير المقيّمة" }));
    await waitFor(() => expect(document.activeElement).toBe(cell(B3)));
  });

  it("the switch is shared with the matrix (one remembered setting)", async () => {
    server();
    await mount();
    fireEvent.click(screen.getByRole("switch", { name: "اعتماد المرحلة عند حفظ العلامة" }));
    expect(window.localStorage.getItem("eb.projects.approveOnSave")).toBe("0");
  });

  it("an archived class shows the scores, ✓ and the note as text: no field, toggle, save bar, switch or write", async () => {
    const s = server();
    render(el({ studentId: "s9", classId: "c9" }));
    await screen.findByRole("heading", { level: 2, name: "ملف المشروع: طالب s9" });
    await screen.findByRole("table");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("region", { name: "حفظ تغييرات الطالب" })).toBeNull();
    expect(within(row(B1)).getByText("40 / 100")).toBeTruthy();
    expect(within(row(B1)).getByLabelText("منجز")).toBeTruthy();
    openMenu(B1);
    expect(within(screen.getByRole("group", { name: "إجراءات المرحلة " + B1 })).getAllByRole("button").map(m => m.textContent)).toEqual(["التفاصيل", "سجلّ التغييرات"]);
    fireEvent.click(screen.getByRole("button", { name: "التفاصيل" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ملاحظة المعلم: ممتاز")).toBeTruthy();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(s.posts).toHaveLength(0);
  });
});
