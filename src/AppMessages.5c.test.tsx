// @vitest-environment happy-dom
//
// Phase 5C — App-level navigation: «الرسائل» is a first-class teacher sidebar destination; clicking it opens the
// (lazy) TeacherMessagesPage through App's single teacherView authority, which reads classes/roster from the EXISTING
// /api/classrooms and /api/students APIs and the direct thread from /api/messages.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
let calls: string[] = [];

function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url.replace(/^https?:\/\/[^/]+/, ""));
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: [] });
      return res(200, { ok: true });
    }
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [{ classId: "c1", name: "الصف الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 1, createdAt: "" }] });
    if (url.includes("/api/students")) return res(200, { ok: true, students: [{ userId: "s1", displayName: "سارة", classId: "c1", active: true, archived: false }] });
    if (url.includes("/api/messages")) return res(200, { ok: true, canSend: true, readOnlyReason: "", messages: [{ messageId: "1700000000000-aaaaaaaaaaaaaaaa", kind: "direct", senderRole: "student", senderDisplayName: "سارة", body: "سؤال عن الواجب", createdAt: "2023-11-14T22:13:20.000Z" }] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });

beforeEach(() => {
  calls = [];
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Phase 5C — teacher «الرسائل» destination", () => {
  it("appears in the sidebar and opens TeacherMessagesPage using the existing roster APIs", async () => {
    render(<App />); await login();
    await screen.findByRole("heading", { level: 1 });
    const entry = within(sidebar()).getByRole("button", { name: "الرسائل" });
    fireEvent.click(entry);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("الرسائل");
    expect(within(sidebar()).getByRole("button", { name: "الرسائل" }).getAttribute("aria-current")).toBe("page");
    const select = await screen.findByRole("combobox", { name: "الصف" });
    expect(calls.some(c => c.startsWith("/api/classrooms"))).toBe(true);
    fireEvent.change(select, { target: { value: "c1" } });
    fireEvent.click(within(await screen.findByRole("list", { name: "طلاب الصف" })).getByRole("button", { name: /سارة/ }));
    expect(await screen.findByText("سؤال عن الواجب")).toBeTruthy();
    expect(calls).toContain("/api/students?classId=c1&includeArchived=1");
    expect(calls).toContain("/api/messages?studentId=s1");
  });
});
