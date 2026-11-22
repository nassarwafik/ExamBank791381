// @vitest-environment happy-dom
//
// Class gradebook GB10 — «بناء المخطط بالذكاء الاصطناعي» through the REAL panel, builder and AI window with a routed fetch mock: the
// teacher writes a description, the proposal fills the builder (replacing a scheme asks first), what was not built is listed with why,
// the server's notes are shown, a weight the teacher still has to type is an empty field that blocks the save, the save carries NEW ids
// and the proposed weights, nothing is saved before «حفظ», a refusal keeps the window open with its message, and the button is not
// offered without AI authoring, on a read-only scheme or a locked one. Plus the pure draft and report. TEST data only.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ClassGradebookPanel from "./ClassGradebookPanel";
import { TeacherAccessContext } from "../shell/teacherAccessContext";
import type { TeacherAccessView } from "../shell/teacherAccess";
import { aiReport, fromAiProposal } from "./schemeDraft";
import type { GbAiProposal, GbGradebook } from "./types";

const SOURCES = { ok: true, classId: "c2", assignments: [{ assignmentId: "t1", title: "الوظيفة 1", status: "published", totalMarks: 10, publishedAt: "" }, { assignmentId: "t2", title: "امتحان 1", status: "published", totalMarks: 20, publishedAt: "" }], projects: [], withheld: [] };
const PROPOSAL: GbAiProposal = {
  categories: [
    { title: "الشهري", weight: 20, items: [{ weight: 10, source: { kind: "assignment", assignmentId: "t1" }, title: "الوظيفة 1" }, { weight: 90, source: { kind: "assignment", assignmentId: "t2" }, title: "امتحان 1" }] },
    { title: "الفصل", weight: 80, items: [{ weight: null, source: { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 }, title: "الحضور والمشاركة" }] }
  ],
  unmatched: [{ category: "الفصل", title: "امتحان 4", weight: null, code: "NOT_FOUND", reason: "لا يوجد في هذا الصف واجب أو امتحان أو مشروع يطابق هذا الوصف.", candidates: ["امتحان 1"] }],
  notes: ["لم يبقَ من 100 ما يُوزَّع على بعض عناصر «الفصل»؛ اكتب أوزانها."],
  assumptions: ["افترضت أن «الشهري» يشمل الوظائف والامتحانات القصيرة."],
  built: 3
};
const book = (over: Partial<GbGradebook> = {}): GbGradebook => ({ ok: true, classId: "c2", className: "العاشر ب", readOnly: false, students: [], etags: { scheme: null, entries: null }, withheld: [], scheme: null, columns: [], rows: [], warnings: [], ...over });

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
let current: GbGradebook;
let aiReply: unknown;
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body } as unknown as Response);
beforeEach(() => {
  calls = []; current = book(); aiReply = { ok: true, classId: "c2", proposal: PROPOSAL };
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (url.includes("/api/gradebook-scheme-ai")) return typeof aiReply === "function" ? (aiReply as () => Response)() : json(aiReply);
    if (method === "POST") return json({ ok: true, etag: "e2", revision: 1, status: "draft", sumIssues: [{ path: "categories.x.items", sum: 50 }] });
    if (url.includes("resource=sources")) return json(SOURCES);
    return json(current);
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mount = (props: Partial<{ classActive: boolean }> = {}, access: TeacherAccessView | null = null) =>
  render(<TeacherAccessContext.Provider value={access}><ClassGradebookPanel token="t" classroom={{ classId: "c2", name: "العاشر ب" }} classActive {...props} /></TeacherAccessContext.Provider>);
const saves = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/class-gradebook"));
const aiCalls = () => calls.filter(c => c.url.includes("/api/gradebook-scheme-ai"));
const AI = "بناء المخطط بالذكاء الاصطناعي";
async function openAi(button = "إنشاء مخطط العلامات") {
  fireEvent.click(await screen.findByRole("button", { name: button }));
  const builder = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
  fireEvent.click(within(builder).getByRole("button", { name: AI }));
  const ai = await screen.findByRole("dialog", { name: AI });
  return { builder, ai };
}

describe("GB10 — building the scheme from a description", () => {
  it("description → proposal in the builder, with what was not built and the notes; empty weights block the save; then the save carries new ids", async () => {
    mount();
    const { builder, ai } = await openAi();
    const propose = within(ai).getByRole("button", { name: "اقترح المخطط" }) as HTMLButtonElement;
    expect(propose.disabled).toBe(true);                                                     // nothing to send yet
    fireEvent.change(within(ai).getByLabelText("وصف توزيع العلامات"), { target: { value: "  الشهري 20% والفصل 80%  " } });
    fireEvent.click(propose);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: AI })).toBeNull());       // the window closes on a proposal
    expect(aiCalls()).toHaveLength(1);
    expect(aiCalls()[0]).toMatchObject({ method: "POST", body: { classId: "c2", description: "الشهري 20% والفصل 80%" } });
    expect(within(builder).getByText("بنى الذكاء الاصطناعي 2 من الأقسام و3 من العناصر. لم يُبنَ 1، أضفه بنفسك ثم احفظ:")).toBeTruthy();
    expect(within(builder).getByText(/«الفصل» · امتحان 4 — .*ربما تقصد: «امتحان 1»\./)).toBeTruthy();
    expect(within(builder).getByText("لم يبقَ من 100 ما يُوزَّع على بعض عناصر «الفصل»؛ اكتب أوزانها.")).toBeTruthy();
    expect(within(builder).getByText("افترضت أن «الشهري» يشمل الوظائف والامتحانات القصيرة.")).toBeTruthy();
    expect((within(builder).getAllByLabelText("عنوان القسم") as HTMLInputElement[]).map(i => i.value)).toEqual(["الشهري", "الفصل"]);
    const attendance = within(builder).getByLabelText("وزن الحضور والمشاركة (من 10)") as HTMLInputElement;
    expect(attendance.value).toBe("");                                                        // never filled in by the page
    expect(saves()).toHaveLength(0);
    fireEvent.click(within(builder).getByRole("button", { name: "حفظ كمسودة" }));              // incomplete: the label says it
    expect(await within(builder).findByText(/وزن كل عنصر في «الفصل» يجب أن يكون رقمًا/)).toBeTruthy();
    expect(saves()).toHaveLength(0);                                                          // blocked: the teacher types the weight
    fireEvent.change(attendance, { target: { value: "100" } });
    fireEvent.click(within(builder).getByRole("button", { name: "حفظ المخطط" }));
    await waitFor(() => expect(saves()).toHaveLength(1));
    const scheme = saves()[0].body!.scheme as { categories: { categoryId: string; weight: number; items: { itemId: string; weight: number; source: unknown }[] }[] };
    expect(scheme.categories.map(c => [c.weight, c.items.map(i => [i.weight, i.source])])).toEqual([
      [20, [[10, { kind: "assignment", assignmentId: "t1" }], [90, { kind: "assignment", assignmentId: "t2" }]]],
      [80, [[100, { kind: "manual", title: "الحضور والمشاركة", maxScore: 10 }]]]
    ]);
    for (const c of scheme.categories) { expect(c.categoryId).toMatch(/^c_/); for (const i of c.items) expect(i.itemId).toMatch(/^i_/); }
  });
  it("over an existing scheme, the proposal asks first; «إلغاء» keeps the scheme", async () => {
    current = book({ scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "old", title: "قديم", weight: 100, items: [{ itemId: "x", weight: 100, source: { kind: "manual", title: "م", maxScore: 10 } }] }] }, etags: { scheme: "e1", entries: null } });
    mount();
    const { builder, ai } = await openAi("تعديل مخطط العلامات");
    fireEvent.click(within(ai).getByRole("button", { name: "مثال 1" }));
    expect((within(ai).getByLabelText("وصف توزيع العلامات") as HTMLTextAreaElement).value).toContain("ثلاثة أقسام");
    fireEvent.click(within(ai).getByRole("button", { name: "اقترح المخطط" }));
    const ask = await screen.findByRole("dialog", { name: "استبدال المخطط؟" });
    fireEvent.click(within(ask).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "استبدال المخطط؟" })).toBeNull());
    expect((within(builder).getAllByLabelText("عنوان القسم") as HTMLInputElement[]).map(i => i.value)).toEqual(["قديم"]);
    expect(within(builder).queryByText(/بنى الذكاء الاصطناعي/)).toBeNull();
  });
  it("a description with no scheme, or a refused request, keeps the window open with the server's message", async () => {
    aiReply = { ok: false, code: "AI_NO_SCHEME", message: "لم أفهم من الوصف مخططًا للعلامات." };
    mount();
    const { ai } = await openAi();
    fireEvent.change(within(ai).getByLabelText("وصف توزيع العلامات"), { target: { value: "قصيدة" } });
    fireEvent.click(within(ai).getByRole("button", { name: "اقترح المخطط" }));
    expect(await within(ai).findByText("لم أفهم من الوصف مخططًا للعلامات.")).toBeTruthy();
    aiReply = () => json({ ok: false, code: "RATE_LIMITED", error: "طلبات كثيرة للذكاء الاصطناعي خلال وقت قصير؛ أعد المحاولة بعد قليل." }, 429);
    fireEvent.click(within(ai).getByRole("button", { name: "اقترح المخطط" }));
    expect(await within(ai).findByText("طلبات كثيرة للذكاء الاصطناعي خلال وقت قصير؛ أعد المحاولة بعد قليل.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: AI })).toBeTruthy();
    expect(saves()).toHaveLength(0);
  });
  it("not offered without AI authoring, on an archived class, or on a scheme an approval locks", async () => {
    mount({}, { status: "ok", enforced: true, capabilities: ["assignments.assignment.view", "assignments.grading.grade"] });
    fireEvent.click(await screen.findByRole("button", { name: "إنشاء مخطط العلامات" }));
    let builder = await screen.findByRole("dialog", { name: /مخطط العلامات/ });
    expect(within(builder).getByRole("button", { name: "نسخ من صف آخر" })).toBeTruthy();       // the builder is editable…
    expect(within(builder).queryByRole("button", { name: AI })).toBeNull();                   // …but AI authoring is not this teacher's
    cleanup();
    current = book({ readOnly: true, scheme: { revision: 1, updatedAt: "", categories: [] } });
    mount({ classActive: false });
    fireEvent.click(await screen.findByRole("button", { name: "عرض مخطط العلامات" }));
    expect(within(await screen.findByRole("dialog")).queryByRole("button", { name: AI })).toBeNull();
    cleanup();
    current = book({ scheme: { revision: 1, updatedAt: "", categories: [{ categoryId: "m", title: "م", weight: 100, items: [] }] }, approvals: { revision: 1, parts: { m: { approvedAt: "x", schemeRevision: 1, drift: { structure: false, students: 0 } } }, final: null, history: [] }, readiness: { parts: {}, final: { ready: false, issues: [] } } });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "تعديل مخطط العلامات" }));
    builder = await screen.findByRole("dialog");
    expect(within(builder).queryByRole("button", { name: AI })).toBeNull();
  });
});

describe("GB10 — the draft and the report (pure)", () => {
  it("new ids every time; a proposed weight is kept, a missing one is an empty field", () => {
    const a = fromAiProposal(PROPOSAL), b = fromAiProposal(PROPOSAL);
    expect(a.categories.map(c => [c.title, c.weightText, c.items.map(i => i.weightText)])).toEqual([["الشهري", "20", ["10", "90"]], ["الفصل", "80", [""]]]);
    expect(a.categories[0].categoryId).not.toBe(b.categories[0].categoryId);
    expect(a.categories[0].items[0].itemId).not.toBe(b.categories[0].items[0].itemId);
  });
  it("a complete proposal says so without a list; a listed weight is shown", () => {
    expect(aiReport({ ...PROPOSAL, unmatched: [], notes: [], assumptions: [] })).toEqual({ summary: "بنى الذكاء الاصطناعي 2 من الأقسام و3 من العناصر. راجعه ثم احفظ.", notes: [], missing: [] });
    expect(aiReport({ ...PROPOSAL, unmatched: [{ category: "", title: "", weight: 33.33, code: "UNKNOWN_SOURCE", reason: "س." }] }).missing).toEqual(["عنصر (33.33%) — س."]);
  });
});
