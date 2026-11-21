// @vitest-environment happy-dom
//
// Class gradebook GB3 — the «سجل العلامات» panel and the scheme builder, through the REAL components and fetch path with a routed fetch mock:
// the empty state and the first scheme (POST over etag null), the draft notice, a stale save (409) that keeps the draft and offers a reload,
// guidance that blocks a malformed save before any request, read-only views (archived class, no grading access), access that hides the
// panel, and a class switch that never shows the previous class's data. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import type { GbGradebook, GbScheme } from "./types";

const CLASS = { classId: "c1", name: "الحادي عشر" };
const SOURCES = { ok: true, classId: "c1", assignments: [{ assignmentId: "a1", title: "الوظيفة 1", status: "published", totalMarks: 10, publishedAt: "" }, { assignmentId: "a2", title: "امتحان 1", status: "published", totalMarks: 20, publishedAt: "" }], projects: [], withheld: [] };
const gradebook = (over: Partial<GbGradebook> = {}): GbGradebook => ({ ok: true, classId: "c1", className: "الحادي عشر", readOnly: false, students: [], etags: { scheme: null, entries: null }, withheld: [], scheme: null, columns: [], rows: [], warnings: [], ...over });
const SCHEME: GbScheme = { revision: 2, updatedAt: "", categories: [{ categoryId: "c_1", title: "الفصل الأول", weight: 60, items: [{ itemId: "i_1", weight: 100, source: { kind: "assignment", assignmentId: "a1" } }] }] };

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let book: GbGradebook;
let saveReply: () => Response;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  calls = []; book = gradebook();
  saveReply = () => json({ ok: true, etag: "e2", revision: 1, status: "active", sumIssues: [] });
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "POST") return saveReply();
    if (url.includes("resource=sources")) return json(SOURCES);
    if (url.startsWith("/api/class-gradebook?classId=")) return json({ ...book, classId: new URL("http://x" + url).searchParams.get("classId") });
    return json({ ok: false, error: "unexpected" }, 500);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (props: Partial<{ classActive: boolean; classroom: typeof CLASS }> = {}, access: { enforced: boolean; capabilities: string[] } | null = null) =>
  render(<TeacherAccessContext.Provider value={access ? { status: "ok", ...access } : null}><ClassGradebookPanel token="t" classroom={CLASS} classActive {...props} /></TeacherAccessContext.Provider>);
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const posts = () => calls.filter(c => c.method === "POST");

describe("GB3 — the first scheme", () => {
  it("empty state → build one part with one assignment → saved over etag null, then the panel reloads", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قسم" }));
    type(within(dialog).getByLabelText("عنوان القسم"), "  الفصل الأول ");
    type(within(dialog).getByLabelText("النسبة من العلامة النهائية (%)"), "١٠٠");
    const picker = within(dialog).getByLabelText("إضافة واجب أو امتحان أو مشروع") as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getByRole("option", { name: "الوظيفة 1" })).toBeTruthy());
    fireEvent.change(picker, { target: { value: "assignment:a1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة" }));
    type(within(dialog).getByLabelText("وزن الوظيفة 1"), "100");
    expect(within(dialog).getAllByText("✓ صحيح")).toHaveLength(2);            // both sums say so in text
    book = gradebook({ scheme: { ...SCHEME, categories: [{ ...SCHEME.categories[0], weight: 100 }] }, schemeStatus: "active", etags: { scheme: "e2", entries: null } });
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ المخطط" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = posts()[0].body!;
    expect(body).toMatchObject({ action: "scheme.save", classId: "c1", etag: null });
    expect(body.scheme).toEqual({ categories: [{ categoryId: expect.stringMatching(/^c_/), title: "الفصل الأول", weight: 100, items: [{ itemId: expect.stringMatching(/^i_/), weight: 100, source: { kind: "assignment", assignmentId: "a1" } }] }] });
    expect(await screen.findByText("✓ حُفظ مخطط العلامات.")).toBeTruthy();
    expect(await screen.findByText("✓ المخطط مكتمل: مجموع النسب 100.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("a used source is not offered again; a manual column is added with its maximum", async () => {
    book = gradebook({ scheme: SCHEME, schemeStatus: "draft", etags: { scheme: "e1", entries: null }, columns: [{ itemId: "i_1", categoryId: "c_1", weight: 100, source: { kind: "assignment", assignmentId: "a1" }, title: "الوظيفة 1" }] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog");
    const picker = within(dialog).getByLabelText("إضافة واجب أو امتحان أو مشروع");
    await waitFor(() => expect(within(picker).getByRole("option", { name: "امتحان 1" })).toBeTruthy());
    expect(within(picker).queryByRole("option", { name: "الوظيفة 1" })).toBeNull();
    type(within(dialog).getByLabelText("العنوان"), "امتحان ورقي");
    type(within(dialog).getByLabelText("العلامة القصوى"), "٢٠");
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة علامة يرصدها المعلم" }));
    expect(within(dialog).getByRole("rowheader", { name: "امتحان ورقي (من 20)" })).toBeTruthy();
  });
});

describe("GB3 — guidance, drafts and conflicts", () => {
  it("a malformed scheme is refused before any request, with the reason shown", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قسم" }));
    type(within(dialog).getByLabelText("النسبة من العلامة النهائية (%)"), "40");
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ كمسودة" }));
    const alert = await within(dialog).findAllByRole("alert");
    expect(alert.map(a => a.textContent).join(" ")).toContain("اكتب عنوان القسم");
    expect(posts()).toHaveLength(0);
  });
  it("sums that are not 100: the button says «حفظ كمسودة», the page explains it, and the panel shows the draft", async () => {
    book = gradebook({ scheme: SCHEME, schemeStatus: "draft", etags: { scheme: "e1", entries: null } });
    mount();
    expect(await screen.findByText("مسودة: مجموع النسب ليس 100، فلا تُحسب علامة نهائية بعد.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تعديل مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("ما دام مجموع النسب ليس 100 يُحفظ المخطط مسودة، ولا تُحسب علامة نهائية للطلاب.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "حفظ كمسودة" }) as HTMLButtonElement).disabled).toBe(true);   // nothing changed yet
    type(within(dialog).getByLabelText("عنوان القسم"), "الفصل 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ كمسودة" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0].body).toMatchObject({ etag: "e1" });
  });
  it("a scheme changed elsewhere (409 STALE_SCHEME): the draft stays and a reload is offered", async () => {
    book = gradebook({ scheme: SCHEME, schemeStatus: "draft", etags: { scheme: "e1", entries: null } });
    saveReply = () => json({ ok: false, code: "STALE_SCHEME", error: "عُدّل المخطط في مكان آخر بعد أن فتحته. أعد التحميل ثم احفظ." }, 409);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText("عنوان القسم"), "عنوان جديد");
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ كمسودة" }));
    expect(await within(dialog).findByText(/عُدّل المخطط في مكان آخر/)).toBeTruthy();
    expect((within(dialog).getByLabelText("عنوان القسم") as HTMLInputElement).value).toBe("عنوان جديد");
    const before = calls.length;
    fireEvent.click(within(dialog).getByRole("button", { name: "إعادة التحميل" }));
    await waitFor(() => expect(calls.slice(before).some(c => c.method === "GET" && !c.url.includes("resource="))).toBe(true));
  });
  it("closing with unsaved changes asks first; «متابعة التعديل» keeps the dialog", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
    fireEvent.click(within(dialog).getByRole("button", { name: "إضافة قسم" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    fireEvent.click(await screen.findByRole("button", { name: "متابعة التعديل" }));
    expect(screen.getByRole("dialog", { name: /مخطط العلامات/ })).toBeTruthy();
  });
});

describe("GB3 — read-only and access (presentation only; the server enforces)", () => {
  it("an archived class: view only, no create / edit, inputs disabled", async () => {
    book = gradebook({ scheme: SCHEME, schemeStatus: "draft", readOnly: true, etags: { scheme: "e1", entries: null } });
    mount({ classActive: false });
    fireEvent.click(await screen.findByRole("button", { name: "عرض مخطط العلامات" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("للعرض فقط: هذا الصف في الأرشيف.")).toBeTruthy();
    expect((within(dialog).getByLabelText("عنوان القسم") as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).queryByRole("button", { name: /حفظ/ })).toBeNull();
  });
  it("without assignments.grading.grade: an empty gradebook offers nothing to create", async () => {
    mount({}, { enforced: true, capabilities: ["assignments.assignment.view"] });
    expect(await screen.findByText("لم يُعرَّف مخطط العلامات لهذا الصف بعد.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "إنشاء مخطط العلامات" })).toBeNull();
  });
  it("without assignments.assignment.view: no panel and no request", async () => {
    const { container } = mount({}, { enforced: true, capabilities: ["students.student.view"] });
    expect(container.innerHTML).toBe("");
    expect(calls).toHaveLength(0);
  });
  it("a load error is shown with a retry", async () => {
    globalThis.fetch = vi.fn(async () => json({ ok: false, error: "تعذّر قراءة سجل العلامات الآن." }, 503)) as unknown as typeof fetch;
    mount();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeTruthy();
  });
  it("a class switch never shows the previous class's gradebook", async () => {
    let release: (r: Response) => void = () => {};
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("classId=c1")) return new Promise<Response>(r => { release = r; });
      return Promise.resolve(json(gradebook({ classId: "c2", className: "العاشر" })));
    }) as unknown as typeof fetch;
    const view = mount();
    view.rerender(<TeacherAccessContext.Provider value={null}><ClassGradebookPanel token="t" classroom={{ classId: "c2", name: "العاشر" }} classActive /></TeacherAccessContext.Provider>);
    expect(await screen.findByText("لم يُعرَّف مخطط العلامات لهذا الصف بعد.")).toBeTruthy();
    release(json(gradebook({ scheme: SCHEME, schemeStatus: "draft" })));      // the late answer for c1
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText("الفصل الأول")).toBeNull();
    expect(screen.getByText("لم يُعرَّف مخطط العلامات لهذا الصف بعد.")).toBeTruthy();
  });
});
