// @vitest-environment happy-dom
//
// Phase 21E.1 (slice 1) — App.tsx's confirmations are the SHARED accessible dialog (useDeferredConfirm / a lazy Dialog), never a
// native window.confirm / window.prompt. Real App, real teacher session (stored token validated by /api/platform-session), mocked
// teacher API. Per site: the dialog is modal, RTL, titled and labelled in Arabic; the keep / Escape path changes nothing and sends
// nothing; the confirm path does exactly what the native confirmation did before (same request, same state change).
// Fail-first: on main 66b8a9f every flow below calls window.confirm / window.prompt (spied) and no dialog appears.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const q = (id: string, text: string, marks: number, difficulty: number) => ({ examQuestionId: id, origin: "bank", sourceId: "S-" + id, section: "BASIC", topic: "IPv4", secondaryTopics: [], difficulty, difficultyLabel: "", familyKey: "f-" + id, hasCLI: false, requiresCalculation: false, presentationType: "multipleChoice", marks, locked: false, text, options: [{ value: "a", text: "أ" }, { value: "b", text: "ب" }], fields: [], parts: [], answer: { correctOptionValue: "a" }, teacherNote: "", aiInstruction: "", wasModified: false, image: { exists: false, visible: false, origin: null, assets: [], prompt: null }, history: [], redoStack: [] });
const legacyExam = () => ({ schemaVersion: 1, examId: "E1", title: "امتحان الشبكات", originalRequest: "", plan: null, totalMarks: 20, status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z",
  metadata: { school: "", subject: "شبكات", grade: "", className: "", teacherName: "", date: "", duration: "", semester: "", generalInstructions: "تعليمات قائمة" },
  questions: [q("q1", "السؤال الأول", 10, 2), q("q2", "السؤال الثاني", 10, 4)],
  summary: { sections: { BASIC: 2 }, difficulty: {}, topics: {}, types: {}, images: 0, cli: 0, calculations: 0 }, warnings: [], revisionHistory: [] });
const SAVED = [{ blobName: "exams/e1.json", examId: "E1", title: "امتحان الشبكات", savedAt: "2026-10-01T10:00:00Z", questionCount: 2, totalMarks: 20 }];
const TEMPLATES = [{ blobName: "templates/t1.json", templateId: "T1", title: "قالب نهائي", savedAt: "2026-10-01T10:00:00Z", totalMarks: 50, totalQuestions: 10 }];

let posts: { url: string; body: Record<string, unknown> }[] = [];
function installFetch() {
  posts = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === "POST") posts.push({ url: url.replace(/^https?:\/\/[^/]+/, ""), body });
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    if (url.includes("/api/saved-exams")) {
      if (method === "GET") return res(200, { ok: true, exams: SAVED });
      if (body.action === "load") return res(200, { ok: true, exam: legacyExam(), savedAt: "2026-10-01T10:00:00Z" });
      return res(200, { ok: true, deleted: true });
    }
    if (url.includes("/api/templates")) return res(200, method === "GET" ? { ok: true, templates: TEMPLATES } : { ok: true, deleted: true });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}
let nativeConfirm: ReturnType<typeof vi.fn>, nativePrompt: ReturnType<typeof vi.fn>;
beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  sessionStorage.setItem("examBankBuilderToken", "teacher-token");
  sessionStorage.setItem("examBankSessionRole", "teacher");
  sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  // The test DOM has no native dialogs: install recorders so any window.confirm / window.prompt call is caught (the baseline's calls).
  nativeConfirm = vi.fn(() => false); nativePrompt = vi.fn(() => null);
  Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: nativeConfirm });
  Object.defineProperty(window, "prompt", { configurable: true, writable: true, value: nativePrompt });
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const escape = async () => { await act(async () => { fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" }); }); };
async function openSavedExams() {
  render(<App />);
  await click(await screen.findByRole("button", { name: /الامتحانات المحفوظة/ }, { timeout: 5000 }));
  return await screen.findByRole("heading", { name: /الامتحانات المحفوظة/ });
}
const savedPanel = () => document.querySelector(".saved-exams-panel") as HTMLElement;
async function expectSharedDialog(title: string) {
  const dialog = await screen.findByRole("dialog", { name: title }, { timeout: 5000 });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(dialog.closest("[dir='rtl']")).toBeTruthy();
  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(nativePrompt).not.toHaveBeenCalled();
  return dialog;
}
async function openLegacyEditor() {
  await openSavedExams();
  await click(within(savedPanel()).getByRole("button", { name: /فتح وتعديل/ }));
  await screen.findByText("السؤال الأول", {}, { timeout: 5000 });
}

describe("21E.1 — App.tsx confirmations through the shared dialog (real App, teacher session)", () => {
  it("delete a saved exam: danger dialog starts on «إبقاء الامتحان»; Escape sends nothing; «حذف الامتحان» posts the same delete as before", async () => {
    await openSavedExams();
    const del = savedPanel().querySelector(".saved-delete-button") as HTMLButtonElement;
    del.focus();
    await click(del);
    await expectSharedDialog("حذف امتحان محفوظ");
    expect(document.activeElement?.textContent).toBe("إبقاء الامتحان");
    await escape();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(del);
    expect(posts.filter(p => p.body.action === "delete")).toEqual([]);
    await click(del);
    await click(within(await expectSharedDialog("حذف امتحان محفوظ")).getByRole("button", { name: "حذف الامتحان" }));
    expect(posts.filter(p => p.body.action === "delete")).toEqual([{ url: "/api/saved-exams", body: { action: "delete", blobName: "exams/e1.json" } }]);
  });

  it("delete a template: «إبقاء القالب» keeps it; «حذف القالب» posts the delete", async () => {
    render(<App />);
    await click(await screen.findByRole("button", { name: /القوالب/ }, { timeout: 5000 }));
    await screen.findByText("قالب نهائي", {}, { timeout: 5000 });
    const del = document.querySelector(".templates-panel .saved-delete-button") as HTMLButtonElement;
    await click(del);
    await click(within(await expectSharedDialog("حذف قالب")).getByRole("button", { name: "إبقاء القالب" }));
    expect(posts.filter(p => p.url === "/api/templates")).toEqual([]);
    await click(del);
    await click(within(await expectSharedDialog("حذف قالب")).getByRole("button", { name: "حذف القالب" }));
    expect(posts.filter(p => p.url === "/api/templates")).toEqual([{ url: "/api/templates", body: { action: "delete", blobName: "templates/t1.json" } }]);
  });

  it("delete a question in the legacy editor: keep leaves both questions; «حذف السؤال» removes exactly that question", async () => {
    await openLegacyEditor();
    const minis = () => document.querySelectorAll(".question-delete-mini");
    expect(minis().length).toBe(2);
    await click(minis()[0]);
    await click(within(await expectSharedDialog("حذف سؤال من الامتحان")).getByRole("button", { name: "إبقاء السؤال" }));
    expect(minis().length).toBe(2);
    await click(minis()[0]);
    await click(within(await expectSharedDialog("حذف سؤال من الامتحان")).getByRole("button", { name: "حذف السؤال" }));
    expect(minis().length).toBe(1);
    expect(screen.queryByText("السؤال الأول")).toBeNull();
    expect(screen.getByText("السؤال الثاني")).toBeTruthy();
  });

  it("distribute marks: a three-choice dialog (no prompt) starting on «حسب الصعوبة»; «إلغاء» changes nothing; a choice applies it", async () => {
    await openLegacyEditor();
    await click(screen.getByRole("button", { name: /توزيع العلامات/ }));
    const dialog = await expectSharedDialog("توزيع العلامات تلقائيًا");
    expect(within(dialog).getAllByRole("button").map(b => b.textContent?.trim()).filter(Boolean)).toEqual(["إلغاء", "توزيع متساوٍ", "حسب الصعوبة"]);
    expect(document.activeElement?.textContent).toBe("حسب الصعوبة");
    await click(within(dialog).getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByText(/تم توزيع العلامات/)).toBeNull();
    await click(screen.getByRole("button", { name: /توزيع العلامات/ }));
    await click(within(await expectSharedDialog("توزيع العلامات تلقائيًا")).getByRole("button", { name: "توزيع متساوٍ" }));
    expect(await screen.findByText(/تم توزيع العلامات/)).toBeTruthy();
  });

  it("general-instructions template over existing text: «إبقاء التعليمات» keeps the text; «استبدال التعليمات» replaces it", async () => {
    await openLegacyEditor();
    const select = screen.getByLabelText("قوالب التعليمات العامة") as HTMLSelectElement;
    const value = select.querySelectorAll("option")[1].getAttribute("value") as string;
    const text = () => (document.querySelector("textarea") && [...document.querySelectorAll("textarea")].map(t => (t as HTMLTextAreaElement).value).find(v => v.length > 0)) || "";
    await act(async () => { fireEvent.change(select, { target: { value } }); });
    const keepFirst = await expectSharedDialog("استبدال التعليمات العامة");
    expect(document.activeElement?.textContent).toBe("إبقاء التعليمات");          // 21E.1 slice 2: opens on the action that keeps the text
    await click(within(keepFirst).getByRole("button", { name: "إبقاء التعليمات" }));
    expect([...document.querySelectorAll("textarea")].some(t => (t as HTMLTextAreaElement).value === "تعليمات قائمة")).toBe(true);
    await act(async () => { fireEvent.change(select, { target: { value } }); });
    await click(within(await expectSharedDialog("استبدال التعليمات العامة")).getByRole("button", { name: "استبدال التعليمات" }));
    expect([...document.querySelectorAll("textarea")].some(t => (t as HTMLTextAreaElement).value === "تعليمات قائمة")).toBe(false);
    expect(text().length).toBeGreaterThan(0);
  });
});
