// @vitest-environment happy-dom
//
// Class gradebook GB10c — «تعديل المخطط الحالي» through the REAL panel, builder and AI window with a routed fetch mock that answers BY THE
// KEYS OF THE DRAFT IT RECEIVED, as the server does: the window opens on «تعديل المخطط الحالي» when a scheme exists; the draft is sent
// by its keys, titles and weights (never its ids); «ما سيتغيّر» is shown and nothing changes before «طبّق التعديلات»; applying keeps every
// existing part's and column's id (manual marks are stored under them) and gives a new one only to what is added; «تراجع» restores the
// draft; a reply with nothing to apply cannot be applied and «رجوع» keeps the description. Plus the pure apply. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import { applyAiEdit, fromScheme, toAiCurrent } from "./schemeDraft";
import type { GbAiCurrent, GbGradebook, GbScheme } from "./types";

const SOURCES = { ok: true, classId: "c2", assignments: [{ assignmentId: "x1", title: "الوظيفة 1", status: "published", totalMarks: 10, publishedAt: "" }, { assignmentId: "x2", title: "امتحان 1", status: "published", totalMarks: 20, publishedAt: "" }], projects: [], withheld: [] };
const SCHEME: GbScheme = { revision: 3, updatedAt: "", categories: [
  { categoryId: "monthly", title: "الشهري", weight: 40, items: [{ itemId: "hw", weight: 100, source: { kind: "assignment", assignmentId: "x1" } }] },
  { categoryId: "term", title: "الفصل", weight: 60, items: [{ itemId: "att", weight: 100, source: { kind: "manual", title: "الحضور", maxScore: 10 } }] }
] };
const book = (): GbGradebook => ({ ok: true, classId: "c2", className: "العاشر ب", readOnly: false, students: [], etags: { scheme: "e3", entries: null }, withheld: [], scheme: SCHEME, columns: [], rows: [], warnings: [] });

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let aiAnswer: (current: GbAiCurrent) => unknown;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
const EDIT = (cur: GbAiCurrent) => {
  const [monthly, term] = cur.categories;
  return { ok: true, classId: "c2", edit: {
    ops: [
      { op: "renameCategory", categoryKey: monthly.key, title: "علامة الشهري" },
      { op: "addItem", categoryKey: monthly.key, source: { kind: "assignment", assignmentId: "x2" }, weight: 50 },
      { op: "setItemWeight", categoryKey: monthly.key, itemKey: monthly.items[0].key, weight: 50 },
      { op: "setCategoryWeight", categoryKey: term.key, weight: 60 }
    ],
    changes: ["إعادة تسمية «الشهري» إلى «علامة الشهري».", "إضافة «امتحان 1» إلى «الشهري» بوزن 50%.", "وزن «الوظيفة 1» في «الشهري»: من 100% إلى 50%.", "نسبة «الفصل» من العلامة النهائية: من 60% إلى 60%."],
    unmatched: [{ category: "الفصل", title: "امتحان 4", weight: null, code: "NOT_FOUND", reason: "لا يوجد في هذا الصف واجب أو امتحان أو مشروع يطابق هذا الوصف." }],
    notes: [], assumptions: ["افترضت أن «الامتحان» هو امتحان 1."]
  } };
};
beforeEach(() => {
  calls = []; aiAnswer = EDIT;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/gradebook-scheme-ai")) return json(aiAnswer(body.current));
    if (method === "POST") return json({ ok: true, etag: "e4", revision: 4, status: "active", sumIssues: [] });
    if (url.includes("resource=sources")) return json(SOURCES);
    return json(book());
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const AI = "بناء المخطط بالذكاء الاصطناعي";
const mount = () => render(<TeacherAccessContext.Provider value={null}><ClassGradebookPanel token="t" classroom={{ classId: "c2", name: "العاشر ب" }} classActive /></TeacherAccessContext.Provider>);
const aiCalls = () => calls.filter(c => c.url.includes("/api/gradebook-scheme-ai"));
const saves = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/class-gradebook"));
const titles = (builder: HTMLElement) => (within(builder).getAllByLabelText("عنوان القسم") as HTMLInputElement[]).map(i => i.value);
async function askEdit(description = "أضف امتحان 1 إلى الشهري وغيّر اسمه") {
  fireEvent.click(await screen.findByRole("button", { name: "تعديل مخطط العلامات" }));
  const builder = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
  fireEvent.click(within(builder).getByRole("button", { name: AI }));
  const ai = await screen.findByRole("dialog", { name: AI });
  expect((within(ai).getByRole("radio", { name: "تعديل المخطط الحالي" }) as HTMLInputElement).checked).toBe(true);
  fireEvent.change(within(ai).getByLabelText("وصف التعديل"), { target: { value: description } });
  fireEvent.click(within(ai).getByRole("button", { name: "اقترح التعديلات" }));
  return { builder, ai };
}

describe("GB10c — editing the current scheme", () => {
  it("the draft goes by its keys (no id); «ما سيتغيّر» first; applying keeps every existing id and adds a new one only for the new column", async () => {
    mount();
    const { builder, ai } = await askEdit();
    expect(await within(ai).findByText("ما سيتغيّر")).toBeTruthy();
    const sent = aiCalls()[0].body!;
    expect(sent).toMatchObject({ classId: "c2", mode: "edit", description: "أضف امتحان 1 إلى الشهري وغيّر اسمه" });
    expect((sent.current as GbAiCurrent).categories.map(c => [c.title, c.weight, c.items.map(i => [i.weight, i.source])])).toEqual([
      ["الشهري", 40, [[100, { kind: "assignment", assignmentId: "x1" }]]], ["الفصل", 60, [[100, { kind: "manual", title: "الحضور", maxScore: 10 }]]]
    ]);
    expect(JSON.stringify(sent)).not.toMatch(/monthly|"term"|"hw"|"att"|categoryId|itemId/);
    expect(within(ai).getByText("إضافة «امتحان 1» إلى «الشهري» بوزن 50%.")).toBeTruthy();
    expect(within(ai).getByText(/«الفصل» · امتحان 4 — /)).toBeTruthy();
    expect(titles(builder)).toEqual(["الشهري", "الفصل"]);                                    // nothing applied yet
    fireEvent.click(within(ai).getByRole("button", { name: "طبّق التعديلات" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: AI })).toBeNull());
    expect(titles(builder)).toEqual(["علامة الشهري", "الفصل"]);
    expect(within(builder).getByText("طبّق الذكاء الاصطناعي 4 من التعديلات. لم يُطبَّق 1:")).toBeTruthy();
    expect(within(builder).getByRole("list", { name: "ما تغيّر" })).toBeTruthy();
    expect(saves()).toHaveLength(0);
    fireEvent.click(within(builder).getByRole("button", { name: "حفظ المخطط" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    const scheme = saves()[0].body!.scheme as { categories: { categoryId: string; title: string; weight: number; items: { itemId: string; weight: number; source: unknown }[] }[] };
    expect(scheme.categories.map(c => [c.categoryId, c.title, c.weight, c.items.map(i => [i.itemId.startsWith("i_") ? "NEW" : i.itemId, i.weight])])).toEqual([
      ["monthly", "علامة الشهري", 40, [["hw", 50], ["NEW", 50]]],
      ["term", "الفصل", 60, [["att", 100]]]                                                  // the manual column keeps its id: its marks stay
    ]);
  });
  it("«تراجع» restores the draft as it was before the changes", async () => {
    mount();
    const { builder, ai } = await askEdit();
    fireEvent.click(await within(ai).findByRole("button", { name: "طبّق التعديلات" }));
    await waitFor(() => expect(titles(builder)).toEqual(["علامة الشهري", "الفصل"]));
    fireEvent.click(within(builder).getByRole("button", { name: "تراجع عن تعديلات الذكاء الاصطناعي" }));
    expect(titles(builder)).toEqual(["الشهري", "الفصل"]);
    expect(within(builder).queryByText(/طبّق الذكاء الاصطناعي/)).toBeNull();
    expect((within(builder).getByRole("button", { name: "حفظ المخطط" }) as HTMLButtonElement).disabled).toBe(true);   // back to the saved scheme: nothing to save
  });
  it("nothing that can be applied: «طبّق» is disabled; «رجوع» returns to the description, kept", async () => {
    aiAnswer = () => ({ ok: true, classId: "c2", edit: { ops: [], changes: [], unmatched: [{ category: "", title: "امتحان 9", weight: null, code: "UNKNOWN_SOURCE", reason: "لم يُعثر على هذا المصدر بين واجبات الصف ومشاريعه." }], notes: [], assumptions: [] } });
    mount();
    const { ai } = await askEdit("أضف امتحان 9");
    expect(await within(ai).findByText("لا تعديل يمكن تطبيقه.")).toBeTruthy();
    expect((within(ai).getByRole("button", { name: "طبّق التعديلات" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(ai).getByRole("button", { name: "رجوع" }));
    expect((within(ai).getByLabelText("وصف التعديل") as HTMLTextAreaElement).value).toBe("أضف امتحان 9");
  });
  it("a refusal keeps the window open with the server's message", async () => {
    aiAnswer = () => ({ ok: false, code: "AI_NO_CHANGE", message: "لم أفهم من الوصف تعديلًا على المخطط." });
    mount();
    const { ai } = await askEdit("مرحبا");
    expect(await within(ai).findByText("لم أفهم من الوصف تعديلًا على المخطط.")).toBeTruthy();
  });
});

describe("GB10c — applying the changes (pure)", () => {
  it("by the draft's keys: a new part is mapped from new_1 for the later changes; equalizing uses the builder's rule; an unknown key is skipped", () => {
    const d = fromScheme(SCHEME);
    const cur = toAiCurrent(d);
    const out = applyAiEdit(d, [
      { op: "addCategory", categoryKey: "new_1", title: "المشاركة", weight: null },
      { op: "addItem", categoryKey: "new_1", source: { kind: "manual", title: "المشاركة الصفية", maxScore: 5 }, weight: 100 },
      { op: "addItem", categoryKey: cur.categories[0].key, source: { kind: "assignment", assignmentId: "x2" }, weight: null },
      { op: "equalizeItems", categoryKey: cur.categories[0].key },
      { op: "removeCategory", categoryKey: "no-such-key" },
      { op: "equalizeCategories" }
    ]);
    expect(out.categories.map(c => [c.categoryId.startsWith("c_") ? "NEW" : c.categoryId, c.title, c.weightText, c.items.map(i => [i.itemId.startsWith("i_") ? "NEW" : i.itemId, i.weightText])])).toEqual([
      ["monthly", "الشهري", "33.34", [["hw", "50"], ["NEW", "50"]]],
      ["term", "الفصل", "33.33", [["att", "100"]]],
      ["NEW", "المشاركة", "33.33", [["NEW", "100"]]]
    ]);
  });
  it("a null weight becomes an empty field, never a number the page invents", () => {
    const d = fromScheme(SCHEME);
    const key = toAiCurrent(d).categories[1].key;
    const out = applyAiEdit(d, [{ op: "setCategoryWeight", categoryKey: key, weight: null }]);
    expect(out.categories[1].weightText).toBe("");
  });
});
