// @vitest-environment happy-dom
//
// Class gradebook GB8 — «نسخ من صف آخر» through the REAL panel and builder with a routed fetch mock: the teacher picks one of their
// classes, the proposal fills the builder (replacing a scheme asks first), what was not copied is listed with why, the save carries NEW
// ids and the weights as they were, nothing is sent before «حفظ», and the copy is not offered on a read-only or locked scheme. Plus the
// pure draft and report. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import { copyReport, fromCopy } from "./schemeDraft";
import type { GbCopyProposal, GbGradebook } from "./types";

const SOURCES = { ok: true, classId: "c2", assignments: [{ assignmentId: "t1", title: "الوظيفة 1 (ب)", status: "published", totalMarks: 10, publishedAt: "" }], projects: [], withheld: [] };
const CLASSES = { ok: true, classId: "c2", classes: [
  { classId: "c1", name: "العاشر أ", schoolYear: "2025-2026", archived: true, categories: 2, items: 4, updatedAt: "2026-06-01" },
  { classId: "c3", name: "العاشر ج", schoolYear: "", archived: false, categories: 1, items: 1, updatedAt: "2026-05-01" }
] };
const PROPOSAL: GbCopyProposal = {
  ok: true, classId: "c2", from: { classId: "c1", name: "العاشر أ" }, copied: 2,
  categories: [
    { title: "الشهري", weight: 30, items: [{ weight: 50, source: { kind: "assignment", assignmentId: "t1" }, title: "الوظيفة 1 (ب)" }] },
    { title: "الفصل", weight: 70, items: [{ weight: 40, source: { kind: "manual", title: "ورقي", maxScore: 20 }, title: "ورقي" }] }
  ],
  unmatched: [
    { category: "الشهري", title: "الوظيفة 2", weight: 50, kind: "assignment", code: "AMBIGUOUS", reason: "يوجد في هذا الصف أكثر من واجب من الامتحان نفسه؛ اختر أحدها.", candidates: ["أ", "ب"] },
    { category: "الفصل", title: "الامتحان الشهري", weight: 60, kind: "assignment", code: "NO_MATCH", reason: "لا يوجد في هذا الصف واجب من الامتحان نفسه." }
  ]
};
const book = (over: Partial<GbGradebook> = {}): GbGradebook => ({ ok: true, classId: "c2", className: "العاشر ب", readOnly: false, students: [], etags: { scheme: null, entries: null }, withheld: [], scheme: null, columns: [], rows: [], warnings: [], ...over });

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let current: GbGradebook;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  calls = []; current = book();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === "POST") return json({ ok: true, etag: "e2", revision: 1, status: "draft", sumIssues: [{ path: "categories.x.items", sum: 50 }] });
    if (url.includes("resource=sources")) return json(SOURCES);
    if (url.includes("resource=copy-classes")) return json(CLASSES);
    if (url.includes("resource=copy&")) return json(PROPOSAL);
    return json(current);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (props: Partial<{ classActive: boolean }> = {}) =>
  render(<TeacherAccessContext.Provider value={null}><ClassGradebookPanel token="t" classroom={{ classId: "c2", name: "العاشر ب" }} classActive {...props} /></TeacherAccessContext.Provider>);
const posts = () => calls.filter(c => c.method === "POST");
const openCopy = async (button: RegExp | string) => {
  fireEvent.click(await screen.findByRole("button", { name: button }));
  const dialog = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
  fireEvent.click(within(dialog).getByRole("button", { name: "نسخ من صف آخر" }));
  return dialog;
};

describe("GB8 — copying another class's scheme", () => {
  it("pick a class → the builder is filled, the missing columns are listed with why; the save carries new ids and the weights as they were", async () => {
    mount();
    const dialog = await openCopy("إنشاء مخطط العلامات");
    const select = await within(dialog).findByLabelText("الصف المصدر") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map(o => o.textContent)).toEqual(["العاشر أ · 2025-2026 (مؤرشف) — 2 أقسام، 4 عناصر", "العاشر ج — 1 أقسام، 1 عناصر"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "نسخ" }));
    expect(await within(dialog).findByText("نُسخ مخطط «العاشر أ»: 2 من الأعمدة. لم يُنسخ 2، أضف بديلها ثم احفظ:")).toBeTruthy();
    expect(within(dialog).getByText(/«الشهري» · الوظيفة 2 \(50%\) — .*المرشحون: «أ»، «ب»\./)).toBeTruthy();
    expect(within(dialog).getByText(/«الفصل» · الامتحان الشهري \(60%\)/)).toBeTruthy();
    expect(calls.some(c => c.url.includes("resource=copy&from=c1"))).toBe(true);
    expect(posts()).toHaveLength(0);                                                       // nothing saved before «حفظ»
    expect((within(dialog).getAllByLabelText("عنوان القسم") as HTMLInputElement[]).map(i => i.value)).toEqual(["الشهري", "الفصل"]);
    fireEvent.click(within(dialog).getByRole("button", { name: "حفظ كمسودة" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const scheme = posts()[0].body!.scheme as { categories: { categoryId: string; weight: number; items: { itemId: string; weight: number; source: unknown }[] }[] };
    expect(scheme.categories.map(c => [c.weight, c.items.map(i => [i.weight, i.source])])).toEqual([
      [30, [[50, { kind: "assignment", assignmentId: "t1" }]]],
      [70, [[40, { kind: "manual", title: "ورقي", maxScore: 20 }]]]
    ]);
    for (const c of scheme.categories) { expect(c.categoryId).toMatch(/^c_/); for (const i of c.items) expect(i.itemId).toMatch(/^i_/); }
  });
  it("over an existing scheme, the copy asks first; «إلغاء» keeps the scheme in the builder", async () => {
    current = book({ scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "old", title: "قديم", weight: 100, items: [{ itemId: "x", weight: 100, source: { kind: "manual", title: "م", maxScore: 10 } }] }] }, etags: { scheme: "e1", entries: null } });
    mount();
    const dialog = await openCopy("تعديل مخطط العلامات");
    await within(dialog).findByLabelText("الصف المصدر");
    fireEvent.click(within(dialog).getByRole("button", { name: "نسخ" }));
    const ask = await screen.findByRole("dialog", { name: "استبدال المخطط؟" });
    fireEvent.click(within(ask).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "استبدال المخطط؟" })).toBeNull());
    expect((within(dialog).getAllByLabelText("عنوان القسم") as HTMLInputElement[]).map(i => i.value)).toEqual(["قديم"]);
    expect(within(dialog).queryByText(/نُسخ مخطط/)).toBeNull();
  });
  it("no other class with a scheme: said so; the copy is not offered on an archived class or a locked scheme", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("resource=copy-classes")) return json({ ok: true, classId: "c2", classes: [] });
      if (url.includes("resource=sources")) return json(SOURCES);
      return json(current);
    }) as unknown as typeof fetch;
    mount();
    const dialog = await openCopy("إنشاء مخطط العلامات");
    expect(await within(dialog).findByText("لا يوجد صف آخر له مخطط علامات.")).toBeTruthy();
    cleanup();
    current = book({ readOnly: true, scheme: { revision: 1, updatedAt: "", categories: [] } });
    mount({ classActive: false });
    fireEvent.click(await screen.findByRole("button", { name: "عرض مخطط العلامات" }));
    expect(within(await screen.findByRole("dialog")).queryByRole("button", { name: "نسخ من صف آخر" })).toBeNull();
    cleanup();
    current = book({ scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "m", title: "م", weight: 100, items: [] }] }, approvals: { revision: 1, parts: { m: { approvedAt: "x", schemeRevision: 1, drift: { structure: false, students: 0 } } }, final: null, history: [] }, readiness: { parts: {}, final: { ready: false, issues: [] } } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل مخطط العلامات" }));
    expect(within(await screen.findByRole("dialog")).queryByRole("button", { name: "نسخ من صف آخر" })).toBeNull();
  });
});

describe("GB8 — the draft and the report (pure)", () => {
  it("every part and column gets a new id; the weights are kept as they were", () => {
    const a = fromCopy(PROPOSAL), b = fromCopy(PROPOSAL);
    expect(a.categories.map(c => [c.title, c.weightText, c.items.map(i => i.weightText)])).toEqual([["الشهري", "30", ["50"]], ["الفصل", "70", ["40"]]]);
    expect(a.categories[0].categoryId).not.toBe(b.categories[0].categoryId);
    expect(a.categories[0].items[0].itemId).not.toBe(b.categories[0].items[0].itemId);
  });
  it("a full copy says so without a list", () => {
    expect(copyReport({ ...PROPOSAL, unmatched: [] })).toEqual({ summary: "نُسخ مخطط «العاشر أ»: 2 من الأعمدة. راجعه ثم احفظ.", missing: [] });
  });
});
