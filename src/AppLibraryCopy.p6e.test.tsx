// @vitest-environment happy-dom
//
// Tadris+ P6-E — an exam the owner imported into the library is a STRUCTURED exam (sections). A teacher's «فتح نسخة في الباني»
// on it opens an editable copy in the structured builder (a new draft); before P6-E the copy silently did nothing (the handler only
// read a flat exam's questions[]). Mocked API, test data only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";
import TEMPLATE from "../public/templates/structured-exam-template.json";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const IMPORTED = { libraryItemId: "IMP-001", title: "امتحان مستورد", category: "final", description: "", tags: [], questionCount: 5, totalMarks: 100, conversionStatus: "ready", publishable: true };

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/exam-library/IMP-001")) return res(200, { ok: true, item: { ...IMPORTED, examSnapshot: { ...TEMPLATE, examId: "LIB-IMP-001", title: "امتحان مستورد", status: "final" } } });
    if (url.includes("/api/exam-library")) return res(200, { ok: true, catalog: [IMPORTED] });
    if (url.includes("/api/bank-questions")) return res(200, { ok: true, questions: [] });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true, classes: [], students: [], assignments: [] });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("P6-E — a teacher copies an imported (structured) library exam into the builder", () => {
  it("«فتح نسخة في الباني» opens the structured builder on a new draft copy named after the library exam", async () => {
    render(<App />);
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
    fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
    await screen.findByRole("heading", { level: 1 });
    fireEvent.click(within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: "بنك الامتحانات" }));
    fireEvent.click(await screen.findByRole("button", { name: "المكتبة الرسمية" }));
    fireEvent.click(await screen.findByRole("button", { name: "فتح نسخة في الباني" }));
    const builder = await screen.findByRole("dialog", {}, { timeout: 8000 });
    expect(builder.className).toContain("structured-builder-overlay");
    expect(await within(builder).findByDisplayValue("امتحان مستورد (نسخة قابلة للتعديل)", {}, { timeout: 8000 })).toBeTruthy();
  }, 30000);
});
