// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — review cluster K2 (A-F3), through the REAL App and the REAL (lazy) StructuredExamBuilder with a mocked teacher
// API: a saved STRUCTURED exam opened from «الامتحانات المحفوظة» → «فتح وتعديل». That row leaves the page in the same update
// (the panel closes), so the builder records no opener. Focus must be inside the aria-modal builder once it is open, and closing it
// with «رجوع» must put focus on «متابعة تحرير الامتحان المنظّم» (App's return target) — never on <body>.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const sq = (id: string, text: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } });
const structuredExam = () => ({ schemaVersion: 2, examId: "E9", title: "اختبار الوحدة الثانية", status: "draft", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", metadata: {},
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, instructions: "", questions: [sq("s1q1", "السؤال الأول"), sq("s1q2", "السؤال الثاني")] }] });
const SAVED = [{ blobName: "exams/e9.json", examId: "E9", title: "اختبار الوحدة الثانية", savedAt: "2026-10-01T10:00:00Z", questionCount: 2, totalMarks: 4 }];

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  sessionStorage.setItem("examBankBuilderToken", "teacher-token");
  sessionStorage.setItem("examBankSessionRole", "teacher");
  sessionStorage.setItem("examBankSessionDisplayName", "أ. أحمد");
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/api/platform-session")) return res(200, { ok: true, role: "teacher", displayName: "أ. أحمد" });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId: "t1", displayName: "أ. أحمد", hasCustomName: false, avatarId: "", profilePhoto: null, updatedAt: "" } });
    if (url.includes("/api/project-tracker")) return res(200, { ok: true, projects: [], totalReadyForReview: 0, byProject: {} });
    if (url.includes("/api/messages")) return res(200, { ok: true, totalUnread: 0, capped: false });
    if (url.includes("/api/saved-exams")) {
      if (method === "GET") return res(200, { ok: true, exams: SAVED });
      if (body.action === "load") return res(200, { ok: true, exam: structuredExam(), savedAt: "2026-10-01T10:00:00Z" });
    }
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const click = async (el: Element) => { await act(async () => { fireEvent.click(el); }); };
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });

describe("K2 A-F3 — App's builder overlay: focus in on open, onto a page control on close", () => {
  it("opened from a saved-exams row (gone with its panel): focus is inside the builder; «رجوع» lands on «متابعة تحرير الامتحان المنظّم»", async () => {
    render(<App />);
    await click(await screen.findByRole("button", { name: /الامتحانات المحفوظة/ }, { timeout: 5000 }));
    const panel = await screen.findByRole("heading", { name: /الامتحانات المحفوظة/ }).then(h => h.closest(".saved-exams-panel") as HTMLElement);
    const row = within(panel).getByRole("button", { name: /فتح وتعديل/ });
    row.focus();
    await click(row);
    const overlay = await screen.findByRole("dialog", { name: /باني الامتحان المنظّم: اختبار الوحدة الثانية/ }, { timeout: 15000 });
    await settle();
    expect(overlay.contains(document.activeElement)).toBe(true);

    const back = overlay.querySelector<HTMLButtonElement>(".sb-tb-exit")!;
    back.focus();
    await click(back);
    await settle();
    expect(screen.queryByRole("dialog", { name: /باني الامتحان المنظّم/ })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /متابعة تحرير الامتحان المنظّم/ }));
  }, 30000);
});
