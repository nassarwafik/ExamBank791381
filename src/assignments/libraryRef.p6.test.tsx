// @vitest-environment happy-dom
// Tadris+ P6-A / P6-C (owner decision D8) — the assignments composer against a mocked API (test data only):
//   a library item is assigned BY REFERENCE (`libraryRef`, never the exam the browser fetched); a saved exam still sends its
//   snapshot; an item the server sent WITHOUT its answer keys is never copied into the builder (a clear message instead).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AssignmentsPanel from "../AssignmentsPanel";

const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }];
const CATALOG = [{ libraryItemId: "L1", title: "شبكات VLAN", category: "infra", description: "", tags: [], questionCount: 2, totalMarks: 20, conversionStatus: "ready", publishable: true }];
const LIB_EXAM = { title: "شبكات VLAN", totalMarks: 20, questions: [{ examQuestionId: "q1", text: "س1", marks: 10 }, { examQuestionId: "q2", text: "س2", marks: 10 }] };
type Call = { url: string; method: string; body: Record<string, unknown> };
let calls: Call[] = [];
let keyless = false;
const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
function routed(input: RequestInfo | URL, init?: RequestInit) {
  const url = String(input); const method = (init?.method || "GET").toUpperCase();
  let body: Record<string, unknown> = {}; if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { /* ignore */ } }
  calls.push({ url, method, body });
  if (url.startsWith("/api/assignments") && method === "GET") return json({ ok: true, assignments: [] });
  if (url.startsWith("/api/assignments")) return json({ ok: true, assignment: { assignmentId: "a9", classId: "c1", className: "الحادي عشر", title: String(body.title), status: "draft", openAt: "", dueAt: "", maxAttempts: 1, durationMinutes: 0, questionCount: 2, totalMarks: 20 } });
  if (url === "/api/exam-library") return json({ ok: true, catalog: CATALOG });
  if (url.startsWith("/api/exam-library/")) return json({ ok: true, item: { examSnapshot: LIB_EXAM, ...(keyless ? { answerKeys: false } : {}) } });
  if (url.startsWith("/api/saved-exams")) return json({ ok: true, exams: [] });
  return json({ ok: true });
}
beforeEach(() => { calls = []; keyless = false; (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; globalThis.fetch = vi.fn(routed) as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const posts = (prefix: string) => calls.filter(c => c.method === "POST" && c.url.startsWith(prefix)).map(c => c.body);

async function chooseLibraryItem(copy?: (exam: unknown, title: string) => void) {
  render(<AssignmentsPanel token="t" classes={CLASSES as never} currentExam={null} onCopyLibraryExamToBuilder={copy} />);
  await waitFor(() => expect(calls.some(c => c.url.startsWith("/api/assignments"))).toBe(true));
  fireEvent.click((await screen.findAllByRole("button", { name: "إنشاء واجب" }))[0]);
  const composer = await screen.findByRole("region", { name: "إنشاء واجب جديد" });
  fireEvent.click(within(composer).getByRole("button", { name: "مكتبة 791381" }));
  const list = await within(composer).findByRole("list", { name: "عناصر المكتبة" });
  return { composer, list };
}

describe("P6 the composer and the library", () => {
  it("a library item is assigned by reference: `libraryRef`, never the exam the browser fetched", async () => {
    const { composer, list } = await chooseLibraryItem();
    fireEvent.click(within(list).getByRole("button", { name: /^L1 شبكات VLAN/ }));
    await within(composer).findByText("2 سؤال · 20 علامة");
    for (let i = 0; i < 4; i++) fireEvent.click(within(composer).getByRole("button", { name: "التالي" }));
    fireEvent.click(within(composer).getByRole("button", { name: "إنشاء الواجب" }));
    await waitFor(() => expect(posts("/api/assignments")).toHaveLength(1));
    const body = posts("/api/assignments")[0];
    expect(body).toMatchObject({ action: "create", classId: "c1", libraryRef: { itemId: "L1" } });
    expect("examSnapshot" in body).toBe(false);
  });

  it("an item sent WITHOUT its answer keys is never copied into the builder", async () => {
    keyless = true;
    const copy = vi.fn();
    const { composer, list } = await chooseLibraryItem(copy);
    fireEvent.click(within(list).getByRole("button", { name: "نسخ شبكات VLAN إلى الباني" }));
    expect(await screen.findByText(/يحتاج صلاحية «رؤية مفاتيح الإجابة»/)).toBeTruthy();
    expect(composer).toBeTruthy();
    expect(copy).not.toHaveBeenCalled();
  });

  it("an item WITH its keys is copied as before", async () => {
    const copy = vi.fn();
    const { list } = await chooseLibraryItem(copy);
    fireEvent.click(within(list).getByRole("button", { name: "نسخ شبكات VLAN إلى الباني" }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(LIB_EXAM, "شبكات VLAN"));
  });
});
