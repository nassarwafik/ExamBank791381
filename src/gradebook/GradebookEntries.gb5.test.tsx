// @vitest-environment happy-dom
//
// Class gradebook GB5 — «تعديل العلامات» through the REAL panel and table with a routed fetch mock: a typed manual score and a decision
// are saved together with the values the teacher saw; «اعتبار غير المسلِّمين صفرًا» reaches only the students with nothing; an invalid
// score blocks the save; a cell changed elsewhere keeps the teacher's value and shows the server's; leaving with unsaved edits asks
// first; and no edit is offered to an archived class or a teacher without grading. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import type { GbGradebook, GbRow } from "./types";

const row = (studentId: string, cells: GbRow["cells"]): GbRow => ({ studentId, cells, categories: { k: { value: null, display: null } }, final: { value: null, display: null, status: "incomplete" } });
const BOOK = (over: Partial<GbGradebook> = {}): GbGradebook => ({
  ok: true, classId: "c1", className: "العاشر", readOnly: false, withheld: [], warnings: [], schemeStatus: "active", etags: { scheme: "e1", entries: "x1" },
  students: [{ studentId: "s1", displayName: "سارة", code: "" }, { studentId: "s2", displayName: "أحمد", code: "" }, { studentId: "s3", displayName: "باسل", code: "" }],
  scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "k", title: "الفصل", weight: 100, items: [{ itemId: "hw", weight: 50, source: { kind: "assignment", assignmentId: "a1" } }, { itemId: "paper", weight: 50, source: { kind: "manual", title: "ورقي", maxScore: 20 } }] }] },
  columns: [
    { itemId: "hw", categoryId: "k", weight: 50, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة" },
    { itemId: "paper", categoryId: "k", weight: 50, source: { kind: "manual", title: "ورقي", maxScore: 20 }, title: "ورقي" }
  ],
  rows: [
    row("s1", { hw: { state: "graded", percent: 80, display: 80 }, paper: { state: "graded", percent: 50, display: 50 } }),
    row("s2", { hw: { state: "pending" }, paper: { state: "missing" } }),
    row("s3", { hw: { state: "missing" }, paper: { state: "missing" } })
  ],
  entries: { paper: { s1: { score: 10 } } },
  ...over
});

let calls: { method: string; body: Record<string, unknown> | null }[] = [];
let book: GbGradebook;
let saveReply: () => Response;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  calls = []; book = BOOK();
  saveReply = () => json({ ok: true, revision: 2, applied: [], stale: [] });
  globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, body });
    if (method === "POST") return saveReply();
    return json(book);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (props: Partial<{ classActive: boolean }> = {}, access: string[] | null = null) =>
  render(<TeacherAccessContext.Provider value={access ? { status: "ok", enforced: true, capabilities: access } : null}><ClassGradebookPanel token="t" classroom={{ classId: "c1", name: "العاشر" }} classActive {...props} /></TeacherAccessContext.Provider>);
const posts = () => calls.filter(c => c.method === "POST");
const startEditing = async () => { fireEvent.click(await screen.findByRole("button", { name: "تعديل العلامات" })); };

describe("GB5 — editing marks in the table", () => {
  it("a typed score and a decision are saved together, each with the value the teacher saw; the gradebook is read again", async () => {
    mount();
    await startEditing();
    fireEvent.change(screen.getByLabelText("علامة سارة في «ورقي» (من 20)"), { target: { value: "١٥" } });
    fireEvent.change(screen.getByLabelText("قرار «الوظيفة» للطالب باسل"), { target: { value: "excused" } });
    expect(screen.getAllByText("غير محفوظ")).toHaveLength(2);
    const before = calls.length;
    fireEvent.click(screen.getByRole("button", { name: "حفظ العلامات (2)" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ action: "entries.save", classId: "c1", items: [
      { itemId: "paper", studentId: "s1", expected: { score: 10 }, value: { score: 15 } },
      { itemId: "hw", studentId: "s3", expected: null, value: { decision: "excused" } }
    ] });
    await waitFor(() => expect(calls.slice(before).filter(c => c.method === "GET")).toHaveLength(1));
    expect(await screen.findByText(/حُفظ 0 من التعديلات/)).toBeTruthy();
  });
  it("«اعتبار غير المسلِّمين صفرًا» reaches only the students with nothing (not the graded, not the pending)", async () => {
    mount();
    await startEditing();
    fireEvent.click(screen.getByRole("button", { name: "إجراءات العمود الوظيفة" }));
    fireEvent.click(await screen.findByRole("button", { name: "اعتبار غير المسلِّمين صفرًا" }));
    expect((screen.getByLabelText("قرار «الوظيفة» للطالب باسل") as HTMLSelectElement).value).toBe("zero");
    expect((screen.getByLabelText("قرار «الوظيفة» للطالب أحمد") as HTMLSelectElement).value).toBe("");     // pending: untouched
    expect((screen.getByLabelText("قرار «الوظيفة» للطالب سارة") as HTMLSelectElement).value).toBe("");     // graded: untouched
    expect(screen.getByRole("button", { name: "حفظ العلامات (1)" })).toBeTruthy();
  });
  it("an invalid score blocks the save, with the reason", async () => {
    mount();
    await startEditing();
    fireEvent.change(screen.getByLabelText("علامة أحمد في «ورقي» (من 20)"), { target: { value: "25" } });
    expect((screen.getByRole("button", { name: "حفظ العلامات (1)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("صحّح 1 من العلامات قبل الحفظ.")).toBeTruthy();
    expect(screen.getByText("العلامة من 0 إلى 20")).toBeTruthy();
    expect(posts()).toHaveLength(0);
  });
  it("a cell changed elsewhere (409 STALE_ENTRIES): the teacher's value stays, the server's is shown, and the next save is over it", async () => {
    saveReply = () => json({ ok: false, code: "STALE_ENTRIES", error: "تغيّرت هذه الخلايا في مكان آخر؛ لم يُحفظ شيء." }, 409);
    mount();
    await startEditing();
    fireEvent.change(screen.getByLabelText("قرار «الوظيفة» للطالب باسل"), { target: { value: "zero" } });
    book = BOOK({ entries: { paper: { s1: { score: 10 } }, hw: { s3: { decision: "excused" } } } });
    fireEvent.click(screen.getByRole("button", { name: "حفظ العلامات (1)" }));
    expect(await screen.findByText("تغيّر في مكان آخر: معفى")).toBeTruthy();
    expect((screen.getByLabelText("قرار «الوظيفة» للطالب باسل") as HTMLSelectElement).value).toBe("zero");
    saveReply = () => json({ ok: true, revision: 3, applied: [{ itemId: "hw", studentId: "s3" }], stale: [] });
    fireEvent.click(screen.getByRole("button", { name: "حفظ العلامات (1)" }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1].body!.items).toEqual([{ itemId: "hw", studentId: "s3", expected: { decision: "excused" }, value: { decision: "zero" } }]);
  });
  it("leaving the edit mode with unsaved edits asks first; «تجاهل التغييرات» drops them", async () => {
    mount();
    await startEditing();
    fireEvent.change(screen.getByLabelText("قرار «الوظيفة» للطالب باسل"), { target: { value: "zero" } });
    fireEvent.click(screen.getByRole("button", { name: "إنهاء التعديل" }));
    fireEvent.click(await screen.findByRole("button", { name: "متابعة التعديل" }));
    expect(screen.getByRole("button", { name: "حفظ العلامات (1)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تجاهل التغييرات" }));
    expect(screen.getByRole("button", { name: "حفظ العلامات (0)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إنهاء التعديل" }));
    expect(await screen.findByRole("button", { name: "تعديل العلامات" })).toBeTruthy();
  });
  it("no edit for an archived class or a teacher without grading; a withheld project column is not editable", async () => {
    book = BOOK({ readOnly: true });
    mount({ classActive: false });
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "تعديل العلامات" })).toBeNull();
    cleanup();
    book = BOOK();
    mount({}, ["assignments.assignment.view"]);
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "تعديل العلامات" })).toBeNull();
    cleanup();
    book = BOOK({ withheld: ["projects"], columns: [...BOOK().columns, { itemId: "proj", categoryId: "k", weight: 0, source: { kind: "project", projectCode: "794589" }, title: "المشروع" }],
      rows: BOOK().rows.map(r => ({ ...r, cells: { ...r.cells, proj: { state: "withheld" } } })) });
    mount();
    await startEditing();
    expect(screen.queryByLabelText("قرار «المشروع» للطالب سارة")).toBeNull();
    expect(within(screen.getByRole("table")).getAllByText("محجوب")).toHaveLength(3);
  });
});
