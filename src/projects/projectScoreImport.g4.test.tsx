// @vitest-environment happy-dom
/// <reference types="node" />
// Phase G4 — «استيراد من Excel» in the class matrix (docs: docs/enterprise-projects-gradebook-g.md; owner decisions D-G4a…d),
// over the REAL project-tracker handler (in-memory container):
//   • reports/xlsxRead reads what the export writes (STORED, inline strings) and what Excel writes back (DEFLATE, shared strings,
//     namespace prefixes), bounded, and fails with a message on anything else;
//   • scoreImport plans against the server's board: a row matches by name AND the code's last four characters (D-G4c), an empty
//     cell leaves the saved score (D-G4a), an invalid value is left out and named (D-G4b), two rows for one student import none;
//   • the matrix previews the plan and, on «تعبئة الجدول», turns it into ordinary unsaved drafts: «حفظ العلامات» saves them with
//     score.bulk (the stale guard) and approves per the approve-on-save switch (D-G4d); an archived class has no import.
import { createRequire } from "node:module";
import { deflateRawSync } from "node:zlib";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

import ProjectBulkReview from "./ProjectBulkReview";
import { projectScoresRows, SCORE_EXPORT_HEADER_ROW } from "./scoreExport";
import { importCode, planScoreImport, ScoreImportError } from "./scoreImport";
import { crc32, toXlsx, type XlsxCell } from "../reports/xlsx";
import { MAX_FILE_BYTES, readXlsxRows, XlsxReadError } from "../reports/xlsxRead";
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
/** A ZIP as Excel writes it: every part DEFLATE-compressed (method 8), with a central directory. */
function zipDeflated(files: Record<string, string>, opts: { method?: number; flags?: number; declaredSize?: number } = {}): Uint8Array {
  const enc = new TextEncoder(), locals: Uint8Array[] = [], centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content), data = new Uint8Array(deflateRawSync(raw)), n = enc.encode(name);
    const method = opts.method ?? 8, flags = opts.flags ?? 0, size = opts.declaredSize ?? raw.length, crc = crc32(raw);
    const lh = new Uint8Array(30 + n.length), lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, flags, true); lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, size, true); lv.setUint16(26, n.length, true); lh.set(n, 30);
    const ch = new Uint8Array(46 + n.length), cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, flags, true); cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, size, true); cv.setUint16(28, n.length, true); cv.setUint32(42, offset, true); ch.set(n, 46);
    locals.push(lh, data); centrals.push(ch); offset += lh.length + data.length;
  }
  const cdSize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const all = [...locals, ...centrals, end], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let o = 0; for (const c of all) { out.set(c, o); o += c.length; }
  return out;
}
/** The same workbook as Excel saves it: shared strings, prefixed namespaces, a phonetic run, an entity, numbers as <v>. */
function excelWorkbook(rows: XlsxCell[][], opts: Parameters<typeof zipDeflated>[1] = {}): Uint8Array {
  const strings: string[] = [];
  const sIndex = (s: string) => { const i = strings.indexOf(s); if (i >= 0) return i; strings.push(s); return strings.length - 1; };
  const col = (i: number) => String.fromCharCode(65 + (i % 26)).padStart(i >= 26 ? 2 : 1, "A");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const sheet = rows.map((r, ri) => '<x:row r="' + (ri + 1) + '">' + r.map((v, ci) => v === "" ? "" : typeof v === "number"
    ? '<x:c r="' + col(ci) + (ri + 1) + '"><x:v>' + v + "</x:v></x:c>"
    : '<x:c r="' + col(ci) + (ri + 1) + '" t="s"><x:v>' + sIndex(v) + "</x:v></x:c>").join("") + "</x:row>").join("");
  return zipDeflated({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": '<x:workbook xmlns:x="m" xmlns:r="r"><x:sheets><x:sheet name="علامات" sheetId="7" r:id="rId9"/></x:sheets></x:workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId9" Target="/xl/worksheets/data.xml"/></Relationships>',
    "xl/worksheets/data.xml": '<x:worksheet xmlns:x="m"><x:sheetData>' + sheet + "</x:sheetData></x:worksheet>",
    "xl/sharedStrings.xml": '<x:sst xmlns:x="m">' + strings.map(s => "<x:si><x:t>" + esc(s) + "</x:t><x:rPh><x:t>ﾌﾘｶﾞﾅ</x:t></x:rPh></x:si>").join("") + "</x:sst>",
  }, opts);
}
const fileOf = (bytes: Uint8Array, name = "علامات.xlsx") => new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

describe("G4 — reports/xlsxRead", () => {
  it("reads the export's own STORED workbook back, cell for cell (numbers as numbers, an empty cell as null)", async () => {
    const rows: XlsxCell[][] = [["المشروع", "مشروع 1"], [], ["الطالب", "رقم", "BK01"], ["بيان", "•••••9876", 40], ["أحمد", "•••••1234", ""], ["=1+1", "x & <y>", 66.5]];
    const read = await readXlsxRows(toXlsx(rows, { rtl: true, boldRows: [2] }));
    expect(read).toEqual([["المشروع", "مشروع 1"], [], ["الطالب", "رقم", "BK01"], ["بيان", "•••••9876", 40], ["أحمد", "•••••1234"], ["=1+1", "x & <y>", 66.5]]);
  });
  it("reads what Excel writes back: DEFLATE parts, shared strings, namespace prefixes, the first sheet by its relationship", async () => {
    const read = await readXlsxRows(excelWorkbook([["الطالب", "رقم"], ["بيان & ليث", "•••••9876", 93], ["", "", 0]]));
    expect(read).toEqual([["الطالب", "رقم"], ["بيان & ليث", "•••••9876", 93], [null, null, 0]]);
  });
  it("anything else fails with a message, never an empty sheet: not a zip, encrypted, an unknown method, too large", async () => {
    const fail = async (bytes: Uint8Array) => { try { await readXlsxRows(bytes); return ""; } catch (e) { expect(e).toBeInstanceOf(XlsxReadError); return (e as Error).message; } };
    expect(await fail(new TextEncoder().encode("الطالب,رقم\nبيان,1"))).toBe("الملف ليس ملف Excel صالحًا (xlsx).");
    expect(await fail(excelWorkbook([["الطالب"]], { flags: 1 }))).toContain("محمي بكلمة مرور");
    expect(await fail(excelWorkbook([["الطالب"]], { method: 12 }))).toContain("طريقة ضغط غير مدعومة");
    expect(await fail(excelWorkbook([["الطالب"]], { declaredSize: 50 * 1024 * 1024 }))).toContain("أكبر من الحد المسموح");
    expect(await fail(new Uint8Array(MAX_FILE_BYTES + 1))).toContain("5 ميغابايت");
  });
});

// ---------------------------------------------------------------------------------------------------------------
const STAGES = [{ stageId: "A1", track: "t", groupId: "g", title: "الأولى", order: 1, required: true }, { stageId: "A2", track: "t", groupId: "g", title: "الثانية", order: 2, required: true }];
const pureBoard = (): Board => ({ readOnly: false, groups: [], stages: STAGES, students: [
  { studentId: "s1", displayName: "بيان", code: "STU-9876", cells: { A1: { status: "approved", score: 40 } } },
  { studentId: "s2", displayName: "أحمد  علي", code: "STU-0123", cells: {} },
  { studentId: "s3", displayName: "ليث", code: "A-5555", cells: {} }, { studentId: "s4", displayName: "ليث", code: "B-5555", cells: {} },
] });
const head = ["الطالب", "رقم الطالب (آخر 4 خانات)", "المسار · A1 الأولى — العلامة من 100", "المسار · A1 الأولى — الحالة", "المسار · A2 الثانية — العلامة من 100", "المسار · Z9 قديمة — العلامة من 100", "التقدّم %"];
const sheet = (...data: XlsxCell[][]) => [["المشروع", "م"], [], [], [], head, ...data] as (string | number | null)[][];

describe("G4 — scoreImport (pure)", () => {
  it("matches by name AND the code's last four; a number code is padded back; spaces and the mask do not matter", () => {
    const plan = planScoreImport(sheet(["بيان", "•••••9876", 41, "x", 50], [" أحمد علي ", 123, "", "", "٨٥"]), pureBoard());
    expect(plan.changes).toEqual([{ studentId: "s1", stageId: "A1", score: 41, previous: 40 }, { studentId: "s1", stageId: "A2", score: 50, previous: null }, { studentId: "s2", stageId: "A2", score: 85, previous: null }]);
    expect(plan.issues).toEqual([]);
    expect(plan.stages.map(s => s.stageId)).toEqual(["A1", "A2"]);
    expect(plan.unknownColumns).toEqual(["المسار · Z9 قديمة — العلامة من 100"]);
    expect(importCode(123)).toBe("0123");
  });
  it("an empty cell leaves the saved score; a saved value is no change; an invalid value is named and only that cell is left out", () => {
    const plan = planScoreImport(sheet(["بيان", "•••••9876", "", "", 120], ["أحمد علي", "•••••0123", "abc", "", -1], ["بيان2", "•••••9876", 40]), pureBoard());
    expect(plan.changes).toEqual([]);
    expect(plan.empty).toBe(1);
    expect(plan.issues.map(i => [i.row, i.kind, i.stageId, i.value])).toEqual([[6, "invalid", "A2", "120"], [7, "invalid", "A1", "abc"], [7, "invalid", "A2", "-1"], [8, "unmatched", undefined, undefined]]);
    expect(planScoreImport(sheet(["بيان", "•••••9876", 40]), pureBoard()).unchanged).toBe(1);
  });
  it("a name with a wrong code, two students sharing name and code, and two rows for one student import nothing for those rows", () => {
    const board = pureBoard();
    board.students[3].code = "A-5555";                                                                              // two «ليث» ending 5555
    const plan = planScoreImport(sheet(["بيان", "•••••1111", 10], ["ليث", "5555", 20], ["أحمد علي", "0123", 30], ["أحمد علي", "0123", 31]), board);
    expect(plan.changes).toEqual([]);
    expect(plan.issues.map(i => [i.row, i.kind])).toEqual([[6, "unmatched"], [7, "ambiguous"], [8, "duplicate"], [9, "duplicate"]]);
  });
  it("a file that is not the export's says so", () => {
    expect(() => planScoreImport([["اسم", "علامة"], ["بيان", 3]], pureBoard())).toThrow(ScoreImportError);
    expect(() => planScoreImport([["الطالب", "رقم", "شيء آخر"]], pureBoard())).toThrow("لا يحوي الملف أي عمود علامات");
  });
});

// ---------------------------------------------------------------------------------------------------------------
type Grid = { students: { studentId: string; displayName: string; code: string }[] };
async function openMatrix(classId = "c1", readOnly = false) {
  render(<ProjectBulkReview token="t" projectCode={CODE} classId={classId} tracks={TRACKS} readOnly={readOnly} />);
  fireEvent.click(await screen.findByRole("button", { name: "جدول العلامات" }));
  await screen.findByRole("region", { name: "جدول العلامات" });
}
/** The export of the board the server returns now, edited like a teacher in Excel (DEFLATE, shared strings). */
async function exportedFile(s: ReturnType<typeof server>, edit: (rows: XlsxCell[][], col: (stageId: string) => number) => void, excel = true) {
  const r = await s.get("resource=board&classId=c1");
  const board = r.jsonBody as Board & Grid;
  const rows = projectScoresRows(board, TRACKS, { title: "م", className: "العاشر أ", exportedAt: new Date(NOW) });
  const headRow = rows[SCORE_EXPORT_HEADER_ROW] as string[];
  edit(rows, stageId => headRow.findIndex(h => h.includes(" · " + stageId + " ") && h.endsWith("العلامة من 100")));
  return fileOf(excel ? excelWorkbook(rows) : toXlsx(rows));
}
const rowOf = (rows: XlsxCell[][], name: string) => rows.find(r => r[0] === name)!;
async function pick(file: File) {
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  return await screen.findByRole("dialog", { name: "استيراد العلامات من Excel" });
}
const posts = () => (globalThis.fetch as unknown as { mock: { calls: [RequestInfo, RequestInit?][] } }).mock.calls.filter(([, i]) => i?.method === "POST").map(([, i]) => JSON.parse(String(i!.body)) as Body);

describe("G4 — «استيراد من Excel» in the class matrix", () => {
  it("previews, fills the matrix as unsaved drafts, and «حفظ العلامات» saves them and approves (the switch is on)", async () => {
    const s = server();
    await openMatrix();
    const file = await exportedFile(s, (rows, col) => { rowOf(rows, "أحمد")[col(B1)] = 77; rowOf(rows, "أحمد")[col(B2)] = 64.5; rowOf(rows, "بيان")[col(B1)] = ""; });
    const dialog = await pick(file);
    await within(dialog).findByRole("list", { name: "ملخّص الاستيراد" });
    expect(within(dialog).getByRole("list", { name: "ملخّص الاستيراد" }).textContent).toContain("2 علامة ستُعبّأ في الجدول كتغييرات غير محفوظة");
    expect(within(dialog).getByText(/تبقى علامتها المحفوظة كما هي/).textContent).toMatch(/^\d+ خلية فارغة/);             // بيان's B1 40 stays
    expect(within(dialog).getByText(/تُعتمد كل مرحلة تأخذ علامة/)).toBeTruthy();
    expect(posts()).toHaveLength(0);                                                                                   // nothing written by reading
    fireEvent.click(within(dialog).getByRole("button", { name: "تعبئة الجدول (2)" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("textbox", { name: new RegExp("^أحمد — " + B1 + " ") }) as HTMLInputElement).value).toBe("77");
    expect((screen.getByRole("textbox", { name: new RegExp("^بيان — " + B1 + " ") }) as HTMLInputElement).value).toBe("40");
    expect(screen.getByText(/عُبّئت 2 علامة من الملف كتغييرات غير محفوظة/)).toBeTruthy();
    expect(posts()).toHaveLength(0);                                                                                   // still nothing written
    fireEvent.click(screen.getByRole("button", { name: /^حفظ العلامات/ }));
    await waitFor(() => expect(posts().map(p => p.action)).toEqual(["score.bulk", "progress.bulk"]));
    const doc = s.ctx.getJson(NS.progressName("c1", "s2")) as { stages: Record<string, { score?: number; status?: string }> };
    expect([doc.stages[B1].score, doc.stages[B1].status, doc.stages[B2].score, doc.stages[B2].status]).toEqual([77, "approved", 64.5, "approved"]);
    expect((s.ctx.getJson(NS.progressName("c1", "s1")) as { stages: Record<string, { score?: number }> }).stages[B1].score).toBe(40);
  });
  it("with the switch off the import saves scores only; an invalid value and an unknown row are named and left out", async () => {
    try { window.localStorage.setItem("eb.projects.approveOnSave", "0"); } catch { /* */ }
    const s = server();
    await openMatrix();
    const file = await exportedFile(s, (rows, col) => { rowOf(rows, "أحمد")[col(B1)] = 55; rowOf(rows, "بيان")[col(B2)] = "١٢٠"; rows.push(["غريب", "•••••0000", 90]); }, false);
    const dialog = await pick(file);
    const issues = await within(dialog).findByRole("list", { name: "ما لن يُستورد" });
    expect(within(issues).getAllByRole("listitem").map(li => li.textContent)).toEqual([
      expect.stringMatching(new RegExp("^الصف \\d+ — بيان — " + B2 + " «١٢٠»: ليست علامة من 0 إلى 100$")),
      expect.stringMatching(/^الصف \d+ — غريب: لا يطابق أي طالب في الصف/)]);
    expect(within(dialog).getByText(/تُحفظ العلامات فقط ولا تتغيّر حالة أي مرحلة/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "تعبئة الجدول (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: /^حفظ العلامات/ }));
    await waitFor(() => expect(posts().map(p => p.action)).toEqual(["score.bulk"]));
    const doc = s.ctx.getJson(NS.progressName("c1", "s2")) as { stages: Record<string, { score?: number; status?: string }> };
    expect([doc.stages[B1].score, doc.stages[B1].status]).toEqual([55, "in_progress"]);
  });
  it("a score changed on the server after the import is refused as stale at save, as a typed one is", async () => {
    const s = server();
    await openMatrix();
    const file = await exportedFile(s, (rows, col) => { rowOf(rows, "بيان")[col(B1)] = 45; });
    fireEvent.click(await within(await pick(file)).findByRole("button", { name: "تعبئة الجدول (1)" }));
    await s.post({ action: "score.set", classId: "c1", studentId: "s1", stageId: B1, score: "48" });                // another write meanwhile
    fireEvent.click(await screen.findByRole("button", { name: /^حفظ العلامات/ }));
    expect(await screen.findByText(/تغيّرت العلامة على الخادم إلى 48/)).toBeTruthy();
    expect((s.ctx.getJson(NS.progressName("c1", "s1")) as { stages: Record<string, { score?: number }> }).stages[B1].score).toBe(48);
  });
  it("cancel changes nothing; a file that is not a workbook says so; an existing draft stays unless the file overlaps it", async () => {
    const s = server();
    await openMatrix();
    fireEvent.change(screen.getByRole("textbox", { name: new RegExp("^بيان — " + B2 + " ") }), { target: { value: "33" } });
    let dialog = await pick(fileOf(new TextEncoder().encode("الطالب,رقم"), "علامات.csv"));
    expect((await within(dialog).findByRole("alert")).textContent).toBe("الملف ليس ملف Excel صالحًا (xlsx).");
    fireEvent.click(within(dialog).getByRole("button", { name: "إغلاق" }));
    dialog = await pick(await exportedFile(s, (rows, col) => { rowOf(rows, "أحمد")[col(B2)] = 70; }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("textbox", { name: new RegExp("^أحمد — " + B2 + " ") }) as HTMLInputElement).value).toBe("");
    dialog = await pick(await exportedFile(s, (rows, col) => { rowOf(rows, "أحمد")[col(B2)] = 70; }));
    expect(await within(dialog).findByText(/لديك 1 تغيير غير محفوظ في الجدول؛ يبقى كما هو/)).toBeTruthy();
    fireEvent.click(await within(dialog).findByRole("button", { name: "تعبئة الجدول (1)" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByRole("textbox", { name: new RegExp("^بيان — " + B2 + " ") }) as HTMLInputElement).value).toBe("33");
    expect((screen.getByRole("textbox", { name: new RegExp("^أحمد — " + B2 + " ") }) as HTMLInputElement).value).toBe("70");
    expect(screen.getByText("2 تغيير جاهز للحفظ")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
  it("an archived class has no import (export stays)", async () => {
    server();
    await openMatrix("c9", true);
    expect(screen.queryByRole("button", { name: "استيراد من Excel" })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByRole("button", { name: "تصدير إلى Excel" })).toBeTruthy();
  });
});
