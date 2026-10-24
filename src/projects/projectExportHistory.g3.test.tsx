// @vitest-environment happy-dom
/// <reference types="node" />
// Phase G3 — the export and the history (docs: docs/enterprise-projects-gradebook-g.md; owner decision D5), over the REAL
// project-tracker handler (in-memory container):
//   • «تصدير إلى Excel» in the class matrix writes the SAVED scores of the whole class (every track) from the server's board:
//     a score and a status column per stage, the server's progress and weighted grade, an empty cell never «0», no teacher
//     note, the last four characters of the student code, the project / class / date heading rows; unsaved drafts are named;
//   • «سجلّ التغييرات» in the student table's row menu reads `resource=stage-history`: every stored event of that stage (not only
//     the profile's newest 50), newest first, who as «أنت» / «معلم آخر» / «الطالب», membership-gated, readable when archived;
//   • the single-save path (`progress.update`) names itself in the audit (`details.via`), as the score and bulk paths do.
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

const xlsxCalls: { filename: string; rows: unknown[][]; options: Record<string, unknown> }[] = [];
vi.mock("../reports/xlsx", async importOriginal => {
  const real = await importOriginal<typeof import("../reports/xlsx")>();
  return { ...real, downloadXlsx: (filename: string, rows: unknown[][], options: Record<string, unknown>) => { xlsxCalls.push({ filename, rows, options }); } };
});

import ProjectBulkReview from "./ProjectBulkReview";
import ProjectStudentDetail from "./ProjectStudentDetail";
import { projectScoresRows, SCORE_EXPORT_HEADER_ROW } from "./scoreExport";
import { stageHistoryText } from "./stageHistory";
import { xlsxParts } from "../reports/xlsx";
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
type HistoryBody = { events: { eventId: string; type: string; by: string; fromScore?: number | null; toScore?: number | null; fromStatus?: string; toStatus?: string; verified?: boolean; createdAt: string }[] };

beforeEach(() => {
  xlsxCalls.length = 0;
  try { window.localStorage.removeItem("eb.projects.approveOnSave"); } catch { /* none */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
describe("G3 — the export's rows (pure, from the server's board)", () => {
  const board: Board = {
    readOnly: false, title: "مشروع 899373", className: "العاشر أ", schoolYear: "2026", groups: [],
    stages: [
      { stageId: "AC01", track: "access", groupId: "g2", title: "الجداول", order: 1, required: true },
      { stageId: "BK02", track: "book", groupId: "g1", title: "الفهرس", order: 2, required: true },
      { stageId: "BK01", track: "book", groupId: "g1", title: "الغلاف", order: 1, required: false }
    ],
    students: [
      { studentId: "s2", displayName: "ليث", code: "STU-0001-4321", cells: { BK01: { status: "in_progress", score: 0 } }, summary: { overallProgress: 10, grade: 0 } },
      { studentId: "s1", displayName: "أحمد", code: "", cells: { BK01: { status: "approved", score: 92.5 }, BK02: { status: "approved", score: null, selfReported: true } }, summary: { overallProgress: 40, grade: 31 } }
    ]
  };
  const rows = projectScoresRows(board, [{ trackId: "book", title: "الكتاب" }, { trackId: "access", title: "Access" }], { title: board.title, className: board.className, schoolYear: board.schoolYear, exportedAt: new Date("2026-10-24T08:00:00Z") });
  it("heading rows, then one column row: track then stage order, a score and a status column per stage, then the server's progress and grade", () => {
    expect(rows.slice(0, 2)).toEqual([["المشروع", "مشروع 899373"], ["الصف", "العاشر أ · 2026"]]);
    expect(rows[2][0]).toBe("تاريخ التصدير"); expect(String(rows[2][1])).toMatch(/^2026-10-24 \d\d:\d\d$/);
    expect(rows[3]).toEqual([]);
    expect(rows[SCORE_EXPORT_HEADER_ROW]).toEqual(["الطالب", "رقم الطالب (آخر 4 خانات)",
      "الكتاب · BK01 الغلاف — العلامة من 100", "الكتاب · BK01 الغلاف — الحالة", "الكتاب · BK02 الفهرس — العلامة من 100", "الكتاب · BK02 الفهرس — الحالة",
      "Access · AC01 الجداول — العلامة من 100", "Access · AC01 الجداول — الحالة", "التقدّم %", "العلامة الموزونة من 100"]);
  });
  it("one row per student (Arabic order); a missing score is an empty cell, never 0, while a saved 0 stays 0; the student's own mark is named", () => {
    expect(rows.slice(SCORE_EXPORT_HEADER_ROW + 1)).toEqual([
      ["أحمد", "", 92.5, "تم الاعتماد", "", "تم الاعتماد (حدّدها الطالب)", "", "لم يبدأ", 40, 31],
      ["ليث", "•••••4321", 0, "قيد التنفيذ", "", "لم يبدأ", "", "لم يبدأ", 10, 0]
    ]);
  });
  it("the workbook is right-to-left, its column row bold, and holds no formula (a value starting with «=» stays text)", () => {
    const sheet = xlsxParts([...rows, ["=1+1"]], { rtl: true, boldRows: [SCORE_EXPORT_HEADER_ROW] })["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).not.toMatch(/<f>/);
    expect(sheet).toContain('<c r="A5" t="inlineStr" s="1">');
    expect(sheet).toContain("=1+1</t>");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("G3 — the API", () => {
  it("the board carries the project title and the class name / year (additive) and never a teacher note", async () => {
    const s = server();
    const b = (await s.get("resource=board&classId=c1")).jsonBody as Board & Body;
    expect([b.title, b.className, b.schoolYear]).toEqual([DEF.title, "العاشر أ", "2026"]);
    expect(JSON.stringify(b)).not.toContain("ملاحظة سرية للمعلم");
  });
  it("progress.update names itself in every stage audit it records (status, note, score)", async () => {
    const s = server();
    expect((await s.post({ action: "progress.update", classId: "c1", studentId: "s2", stageId: B2, status: "approved", score: "70", note: "أحسنت" })).status).toBe(200);
    expect(s.audits.map(a => [a.action, (a.details as Body).via])).toEqual([["project.stage.approve", "progress.update"], ["project.stage.note", "progress.update"], ["project.stage.score", "progress.update"]]);
    await s.post({ action: "score.set", classId: "c1", studentId: "s2", stageId: B1, score: "50" });
    expect((s.audits.at(-1)!.details as Body).via).toBe("score.set");                                   // unchanged
  });
  it("stage-history: every event of THAT stage, newest first, even beyond the profile's newest 50; who as you / teacher / student; no id, no note text", async () => {
    const old = [ev(1, B1, { type: "score", fromScore: null, toScore: 30 }), ev(2, B1, { type: "status", fromStatus: "not_started", toStatus: "approved", source: "student", actor: "s1" }), ev(3, B1, { type: "status", fromStatus: "approved", toStatus: "approved", verified: true, actor: "teacher-2" })];
    const noise = Array.from({ length: 60 }, (_, i) => ev(10 + i, B2, { type: "note" }));
    const s = server({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 30, note: "سر" } }, [...old, ...noise, ev(99, B1, { type: "note" })]) });
    expect(((await s.get("resource=student&classId=c1&studentId=s1")).jsonBody as { history: Body[] }).history.some(e => e.eventId === "e1")).toBe(false);   // outside the newest 50
    const r = (await s.get("resource=stage-history&classId=c1&studentId=s1&stageId=" + B1)).jsonBody as HistoryBody & Body;
    expect(r.events.map(e => [e.eventId, e.type, e.by])).toEqual([["e99", "note", "you"], ["e3", "status", "teacher"], ["e2", "status", "student"], ["e1", "score", "you"]]);
    expect(r.events[3]).toMatchObject({ fromScore: null, toScore: 30 });
    expect(r.events[1]).toMatchObject({ verified: true, fromStatus: "approved", toStatus: "approved" });
    const text = JSON.stringify(r);
    expect(text).not.toContain("teacher-2"); expect(text).not.toContain("actor"); expect(text).not.toContain("سر");
  });
  it("stage-history is membership-gated, validates its parameters, and reads an archived class", async () => {
    const s = server();
    expect((await s.get("resource=stage-history&classId=c1&studentId=s9&stageId=" + B1)).status).toBe(404);      // not in this class
    expect((await s.get("resource=stage-history&classId=c1&studentId=s1&stageId=NOPE")).status).toBe(400);
    expect((await s.get("resource=stage-history&classId=c1&studentId=s1")).status).toBe(400);
    const a = await s.get("resource=stage-history&classId=c9&studentId=s9&stageId=" + B1);
    expect(a.status).toBe(200); expect((a.jsonBody as Body).readOnly).toBe(true); expect((a.jsonBody as HistoryBody).events).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("G3 — «تصدير إلى Excel» in the class matrix", () => {
  async function openMatrix(readOnly = false, classId = "c1") {
    render(<ProjectBulkReview token="t" projectCode={CODE} classId={classId} tracks={TRACKS} readOnly={readOnly} />);
    fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
    await screen.findByRole("region", { name: "جدول العلامات" });
  }
  it("writes the saved scores of the whole class (every track) as one RTL sheet named after the project and class", async () => {
    server();
    await openMatrix();
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    expect(xlsxCalls).toHaveLength(1);
    const { filename, rows, options } = xlsxCalls[0];
    expect(filename).toBe("TadrisPlus-علامات-المشروع-" + (DEF.title + " العاشر أ").replace(/\s/g, "-"));
    expect(options).toEqual({ sheetName: "علامات المشروع", rtl: true, boldRows: [SCORE_EXPORT_HEADER_ROW] });
    expect(rows[0]).toEqual(["المشروع", DEF.title]);
    const head = rows[SCORE_EXPORT_HEADER_ROW] as string[];
    expect(head.length).toBe(2 + ACTIVE.length * 2 + 2);                                                // every track, not only the shown one
    expect(rows.slice(SCORE_EXPORT_HEADER_ROW + 1).map(r => r[0])).toEqual(["أحمد", "بيان"]);
    expect(JSON.stringify(rows)).not.toContain("ملاحظة سرية للمعلم");
    expect(screen.getByText("صُدّرت علامات 2 طالب في كل المسارات إلى ملف Excel.")).toBeTruthy();
  });
  it("an unsaved change is not exported and is named in the notice", async () => {
    server();
    await openMatrix();
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp("^أحمد — " + B2 + " ") }), { target: { value: "77" } });
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    const rows = xlsxCalls[0].rows;
    const head = rows[SCORE_EXPORT_HEADER_ROW] as string[];
    const ahmad = rows.find(r => r[0] === "أحمد")!;
    expect(ahmad[head.findIndex(h => h.includes(B2 + " ") && h.endsWith("العلامة من 100"))]).toBe("");   // the draft 77 is not in the file
    expect(screen.getByText(/الملف يحمل العلامات المحفوظة فقط؛ لديك 1 تغيير لم يُحفظ بعد\./)).toBeTruthy();
  });
  it("an archived class can still export (a read)", async () => {
    server();
    render(<ProjectBulkReview token="t" projectCode={CODE} classId="c9" tracks={TRACKS} readOnly />);
    fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
    await screen.findByRole("region", { name: "جدول العلامات" });
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    expect(xlsxCalls).toHaveLength(1);
    expect(xlsxCalls[0].rows.slice(SCORE_EXPORT_HEADER_ROW + 1).map(r => r[0])).toEqual(["ليث"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("G3 — «سجلّ التغييرات» in the student table", () => {
  const mount = async (studentId = "s1", classId = "c1") => {
    render(<ProjectStudentDetail token="t" projectCode={CODE} classId={classId} studentId={studentId} tracks={TRACKS} onBack={() => {}} />);
    await screen.findByRole("table");
  };
  const openHistory = async (stageId: string) => {
    const row = document.querySelector('[data-stage-id="' + stageId + '"]') as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "إجراءات المرحلة " + stageId }));
    fireEvent.click(within(await screen.findByRole("group", { name: "إجراءات المرحلة " + stageId })).getByRole("button", { name: "سجلّ التغييرات" }));
    return await screen.findByRole("dialog");
  };
  it("lists the stage's changes, newest first, in words, with who made each; a save since shows on the next opening", async () => {
    const s = server({ [NS.progressName("c1", "s1")]: progress("s1", "c1", { [B1]: { status: "approved", score: 40 } }, [
      ev(1, B1, { type: "score", fromScore: null, toScore: 40 }), ev(2, B1, { type: "status", fromStatus: "not_started", toStatus: "approved", source: "student", actor: "s1" }),
      ev(3, B1, { type: "status", fromStatus: "approved", toStatus: "approved", verified: true, actor: "teacher-2" })]) });
    await mount();
    let dialog = await openHistory(B1);
    expect(within(dialog).getByRole("heading", { name: new RegExp("^سجلّ تغييرات المرحلة " + B1 + " — ") })).toBeTruthy();
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(3));
    expect(within(dialog).getAllByRole("listitem").map(li => li.querySelector(".eb-timeline-text")!.textContent + " · " + li.querySelector(".eb-stage-history-by")!.textContent)).toEqual([
      "تأكيد المعلم لما حدّده الطالب · معلم آخر", "حدّدها الطالب كمنفّذة · الطالب", "وُضعت العلامة 40 / 100 · أنت"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await s.post({ action: "score.set", classId: "c1", studentId: "s1", stageId: B1, score: "55" });
    dialog = await openHistory(B1);
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(4));
    expect(within(dialog).getAllByRole("listitem")[0].querySelector(".eb-timeline-text")!.textContent).toBe("تغيّرت العلامة من 40 / 100 إلى 55 / 100");
    expect(s.gets.filter(u => u.includes("resource=stage-history"))).toHaveLength(2);                 // read each time it opens
  });
  it("an empty history says so; a failed read offers a retry; an archived profile has the item too", async () => {
    server();
    await mount("s2");
    let dialog = await openHistory(B2);
    expect(await within(dialog).findByText("لا توجد تغييرات مسجّلة لهذه المرحلة.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => String(input).includes("stage-history")
      ? ({ ok: false, status: 503, json: async () => ({ ok: false, error: "تعذر الاتصال." }) } as Response) : real(input, init)) as unknown as typeof fetch;
    dialog = await openHistory(B1);
    expect((await within(dialog).findByRole("alert")).textContent).toContain("تعذر الاتصال.");
    globalThis.fetch = real;
    fireEvent.click(within(dialog).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
    cleanup();
    server();
    await mount("s9", "c9");
    dialog = await openHistory(B1);
    expect(await within(dialog).findByText("لا توجد تغييرات مسجّلة لهذه المرحلة.")).toBeTruthy();
  });
  it("the words for every event kind", () => {
    const base = { eventId: "x", createdAt: NOW, by: "you" as const };
    expect(stageHistoryText({ ...base, type: "score", fromScore: 40, toScore: null })).toBe("مُسحت العلامة (كانت 40 / 100)");
    expect(stageHistoryText({ ...base, type: "score", fromScore: 0, toScore: 12.5 })).toBe("تغيّرت العلامة من 0 / 100 إلى 12.5 / 100");
    expect(stageHistoryText({ ...base, type: "status", fromStatus: "in_progress", toStatus: "ready_for_review" })).toBe("الحالة: من «قيد التنفيذ» إلى «جاهز للفحص»");
    expect(stageHistoryText({ ...base, by: "student", type: "status", fromStatus: "approved", toStatus: "not_started" })).toBe("تراجع الطالب عن التحديد");
    expect(stageHistoryText({ ...base, type: "note" })).toBe("عُدّلت ملاحظة المعلم");
  });
});
