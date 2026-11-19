// @vitest-environment happy-dom
//
// Class gradebook GB6b — «اعتماد العلامات» through the REAL panel with a routed fetch mock: approving asks first and sends the scheme
// revision the teacher saw; a part that is not ready offers no approval and says why; reopening needs a reason; an approved part's
// columns are not editable; an approved final makes the scheme read-only and blocks reopening a part; unsaved edits pause the actions;
// a teacher without «نشر النتائج» and an archived class get no action. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import type { GbGradebook, GbRow } from "./types";

const row = (studentId: string, cells: GbRow["cells"]): GbRow => ({ studentId, cells, categories: { m: { value: 80, display: 80 }, t: { value: null, display: null } }, final: { value: null, display: null, status: "incomplete" } });
const BOOK = (over: Partial<GbGradebook> = {}): GbGradebook => ({
  ok: true, classId: "c1", className: "العاشر", readOnly: false, withheld: [], warnings: [], schemeStatus: "active", etags: { scheme: "e1", entries: "x1" },
  students: [{ studentId: "s1", displayName: "سارة", code: "" }, { studentId: "s2", displayName: "أحمد", code: "" }],
  scheme: { revision: 4, updatedAt: "", categories: [
    { categoryId: "m", title: "الشهري", weight: 30, items: [{ itemId: "hw", weight: 100, source: { kind: "assignment", assignmentId: "a1" } }] },
    { categoryId: "t", title: "الفصل", weight: 70, items: [{ itemId: "paper", weight: 100, source: { kind: "manual", title: "ورقي", maxScore: 20 } }] }
  ] },
  columns: [
    { itemId: "hw", categoryId: "m", weight: 100, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة" },
    { itemId: "paper", categoryId: "t", weight: 100, source: { kind: "manual", title: "ورقي", maxScore: 20 }, title: "ورقي" }
  ],
  rows: [row("s1", { hw: { state: "graded", percent: 80, display: 80 }, paper: { state: "missing" } }), row("s2", { hw: { state: "graded", percent: 80, display: 80 }, paper: { state: "missing" } })],
  entries: {},
  approvals: { revision: 0, parts: {}, final: null, history: [] },
  readiness: {
    parts: { m: { ready: true, issues: [] }, t: { ready: false, issues: [{ code: "PART_INCOMPLETE", message: "x", cells: 2, students: 2 }] } },
    final: { ready: false, issues: [{ code: "PARTS_NOT_APPROVED", message: "x", categoryIds: ["m", "t"] }] }
  },
  ...over
});
const APPROVED_M = (over: Partial<GbGradebook["approvals"] & object> = {}) => ({ revision: 1, parts: { m: { approvedAt: "2026-11-18T10:00:00.000Z", schemeRevision: 4, drift: { structure: false, students: 0 } } }, final: null, history: [{ action: "part.approve", categoryId: "m", at: "2026-11-18T10:00:00.000Z" }], ...over });

let calls: { method: string; body: Record<string, unknown> | null }[] = [];
let book: GbGradebook;
let postReply: () => Response;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  calls = []; book = BOOK();
  postReply = () => json({ ok: true, revision: 1 });
  globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method || "GET").toUpperCase(), body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, body });
    if (method === "POST") return postReply();
    return json(book);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ALL = ["assignments.assignment.view", "assignments.grading.grade", "assignments.results.release"];
const mount = (props: Partial<{ classActive: boolean }> = {}, access: string[] = ALL) =>
  render(<TeacherAccessContext.Provider value={{ status: "ok", enforced: true, capabilities: access }}><ClassGradebookPanel token="t" classroom={{ classId: "c1", name: "العاشر" }} classActive {...props} /></TeacherAccessContext.Provider>);
const posts = () => calls.filter(c => c.method === "POST");
const section = async () => screen.findByRole("region", { name: "اعتماد العلامات" });

describe("GB6b — approving a part", () => {
  it("a ready part: «اعتماد الجزء» asks first, then sends the scheme revision the teacher saw, and the gradebook is read again", async () => {
    mount();
    const s = await section();
    expect(within(s).getByText("جاهز للاعتماد")).toBeTruthy();
    fireEvent.click(within(s).getByRole("button", { name: "اعتماد «الشهري»" }));
    const dialog = await screen.findByRole("dialog", { name: "اعتماد «الشهري»؟" });
    const before = calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "اعتماد" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ action: "part.approve", classId: "c1", categoryId: "m", schemeRevision: 4 });
    await waitFor(() => expect(calls.slice(before).filter(c => c.method === "GET")).toHaveLength(1));
    expect(await screen.findByText("✓ اعتُمد «الشهري». يراه الطلاب الآن.")).toBeTruthy();
  });
  it("cancelling the question sends nothing", async () => {
    mount();
    fireEvent.click(within(await section()).getByRole("button", { name: "اعتماد «الشهري»" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts()).toHaveLength(0);
  });
  it("a part that is not ready: the button is disabled and the reasons say what to fix; the final likewise", async () => {
    mount();
    const s = await section();
    expect((within(s).getByRole("button", { name: "اعتماد «الفصل»" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(s).getByText(/خانات غير مكتملة: 2 لدى 2 من الطلاب/)).toBeTruthy();
    expect((within(s).getByRole("button", { name: "اعتماد العلامة النهائية" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(s).getByText("اعتمد الأجزاء أولًا: «الشهري»، «الفصل».")).toBeTruthy();
  });
  it("a server refusal is shown as it says (nothing approved on the page)", async () => {
    postReply = () => json({ ok: false, code: "STALE_SCHEME", error: "تغيّر المخطط بعد أن فتحت السجل. أعد التحميل ثم اعتمد." }, 409);
    mount();
    fireEvent.click(within(await section()).getByRole("button", { name: "اعتماد «الشهري»" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "اعتماد" }));
    expect(await screen.findByText("تغيّر المخطط بعد أن فتحت السجل. أعد التحميل ثم اعتمد.")).toBeTruthy();
  });
});

describe("GB6b — an approved part", () => {
  it("shows its date and any change since; reopening needs a reason, which is sent", async () => {
    book = BOOK({ approvals: APPROVED_M({ parts: { m: { approvedAt: "2026-11-18T10:00:00.000Z", schemeRevision: 4, drift: { structure: false, students: 1 } } } }) });
    mount();
    const s = await section();
    expect(within(s).getByText(/^✓ معتمد · /)).toBeTruthy();
    expect(within(s).getByText(/تغيّرت علامات 1 من الطلاب بعد الاعتماد/)).toBeTruthy();
    fireEvent.click(within(s).getByRole("button", { name: "إعادة فتح «الشهري»" }));
    const dialog = await screen.findByRole("dialog", { name: "إعادة فتح «الشهري»" });
    const confirmBtn = within(dialog).getByRole("button", { name: "إعادة الفتح" }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("سبب إعادة الفتح"), { target: { value: "اب" } });
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("سبب إعادة الفتح"), { target: { value: "  تصحيح خطأ في الرصد " } });
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toEqual({ action: "part.reopen", classId: "c1", categoryId: "m", reason: "تصحيح خطأ في الرصد" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "إعادة فتح «الشهري»" })).toBeNull());
  });
  it("its columns are not editable and its band says «معتمد»; the other part stays editable", async () => {
    book = BOOK({ approvals: APPROVED_M() });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل العلامات" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("✓ معتمد")).toBeTruthy();
    expect(screen.queryByLabelText("قرار «الوظيفة» للطالب سارة")).toBeNull();
    expect(screen.queryByRole("button", { name: "إجراءات العمود الوظيفة" })).toBeNull();
    expect(screen.getByLabelText("قرار «ورقي» للطالب سارة")).toBeTruthy();
  });
  it("the history lists what happened, newest first, with the reason", async () => {
    book = BOOK({ approvals: APPROVED_M({ history: [
      { action: "part.approve", categoryId: "m", at: "2026-11-17T10:00:00.000Z" },
      { action: "part.reopen", categoryId: "m", at: "2026-11-17T11:00:00.000Z", reason: "خطأ" },
      { action: "part.approve", categoryId: "m", at: "2026-11-18T10:00:00.000Z" }
    ] }) });
    mount();
    const s = await section();
    const items = within(s.querySelector("details")!).getAllByRole("listitem").map(li => li.textContent);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatch(/^اعتماد «الشهري»/);
    expect(items[1]).toMatch(/^إعادة فتح «الشهري» · .+ · السبب: خطأ$/);
  });
});

describe("GB6b — the final, the lock and who may act", () => {
  it("an approved final: reopening a part waits for the final, and the scheme opens read-only with the reason", async () => {
    book = BOOK({ approvals: { revision: 3, parts: { m: APPROVED_M().parts.m, t: { approvedAt: "2026-11-18T11:00:00.000Z", schemeRevision: 4, drift: { structure: false, students: 0 } } }, final: { approvedAt: "2026-11-18T12:00:00.000Z", drift: { structure: false, students: 0 } }, history: [] },
      readiness: { parts: {}, final: { ready: true, issues: [] } } });
    mount();
    const s = await section();
    expect((within(s).getByRole("button", { name: "إعادة فتح «الشهري»" }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(s).getByRole("button", { name: "إعادة فتح «العلامة النهائية»" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "تعديل العلامات" })).toBeNull();          // every part is approved: nothing to edit
    fireEvent.click(screen.getByRole("button", { name: "تعديل مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
    expect(within(dialog).getByText("العلامة النهائية معتمدة: المخطط للعرض فقط حتى تعيد فتحها.")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /حفظ/ })).toBeNull();
  });
  it("unsaved mark edits pause approving (the approval would take the stored values)", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل العلامات" }));
    fireEvent.change(screen.getByLabelText("قرار «ورقي» للطالب سارة"), { target: { value: "excused" } });
    const s = await section();
    expect(within(s).getByText("احفظ تعديلات العلامات أو تجاهلها قبل الاعتماد أو إعادة الفتح.")).toBeTruthy();
    expect((within(s).getByRole("button", { name: "اعتماد «الشهري»" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("without «نشر النتائج», or in an archived class: the statuses are shown, no action is offered", async () => {
    mount({}, ["assignments.assignment.view", "assignments.grading.grade"]);
    let s = await section();
    expect(within(s).getByText("جاهز للاعتماد")).toBeTruthy();
    expect(within(s).queryByRole("button")).toBeNull();
    expect(within(s).getByText("الاعتماد وإعادة الفتح يحتاجان صلاحية «نشر النتائج».")).toBeTruthy();
    cleanup();
    book = BOOK({ readOnly: true, approvals: APPROVED_M() });
    mount({ classActive: false });
    s = await section();
    expect(within(s).queryByRole("button")).toBeNull();
  });
  it("an older API without approvals: no section", async () => {
    book = BOOK({ approvals: undefined, readiness: undefined });
    mount();
    await screen.findByRole("table");
    expect(screen.queryByRole("region", { name: "اعتماد العلامات" })).toBeNull();
  });
});
