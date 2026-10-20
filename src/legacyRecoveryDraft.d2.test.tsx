// @vitest-environment happy-dom
//
// Batch 4 (D2) — the legacy builder's local recovery draft (the whole unsaved exam, answer keys included) was kept under
// ONE fixed localStorage key, shared by every teacher on the browser and kept after logout. Through the REAL App:
//   • another teacher signing in on the same browser is never offered (and cannot restore) a colleague's draft;
//   • the old draft under the shared key is deleted (it cannot be attributed to a teacher);
//   • the teacher's own draft is still offered to them, and logging out deletes it.
// Fail-first: run against 791f8118 (one shared key, kept after logout).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
// The keys, written out (this file must not import the module it proves, so it also runs on the baseline): the old shared
// key, and the per-teacher key of the fix.
const LEGACY_RECOVERY_KEY = "ExamBank791381-Recovery-V1";
const recoveryDraftKey = (teacherId: string) => "ExamBank791381-Recovery-V2:" + encodeURIComponent(teacherId);

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const SLOW = { timeout: 8000 };
const DRAFT = (title: string) => JSON.stringify({ exam: { title, questions: [{ id: "q1", text: "سؤال", correctAnswer: "الإجابة السرية" }], metadata: {} }, plan: null, examPrompt: "", savedAt: "2026-10-20T08:00:00.000Z" });

function installFetch(teacherId: string) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "token-" + teacherId, displayName: "المعلم " + teacherId });
    if (url.includes("/api/teacher-profile")) return res(200, { ok: true, profile: { teacherId, displayName: "المعلم " + teacherId } });
    return res(200, { ok: true, classes: [], students: [], assignments: [], projects: [], items: [], posts: [], exams: [], totalUnread: 0, capped: false, byProject: {}, totalReadyForReview: 0 });
  }) as unknown as typeof fetch;
}
async function signIn(teacherId: string) {
  try { sessionStorage.clear(); } catch { /* a fresh sign-in on the same browser (localStorage is kept) */ }
  installFetch(teacherId);
  vi.resetModules();
  const { default: App } = await import("./App");
  render(<App />);
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: teacherId } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy(), SLOW);
  // the teacher profile (the draft's owner) arrives after the session: let it settle
  await waitFor(() => expect((globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(c => String(c[0]).includes("/api/teacher-profile"))).toBe(true), SLOW);
  await act(async () => { await new Promise(r => setTimeout(r, 30)); });
}
const recoveryBar = () => document.querySelector(".recovery-draft-bar");

beforeEach(() => {
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("D2 — the recovery draft belongs to one teacher", () => {
  it("a colleague's draft is never offered to another teacher on the same browser; the teacher's own draft is", async () => {
    localStorage.setItem(recoveryDraftKey("teacher-a"), DRAFT("امتحان المعلّم أ"));
    await signIn("teacher-b");
    expect(recoveryBar()).toBeNull();
    expect(localStorage.getItem(recoveryDraftKey("teacher-a"))).not.toBeNull();       // A's own draft is not B's to delete
    cleanup();
    await signIn("teacher-a");
    await waitFor(() => expect(recoveryBar()).not.toBeNull(), SLOW);
  });

  it("the old draft under the shared key is deleted and never offered", async () => {
    localStorage.setItem(LEGACY_RECOVERY_KEY, DRAFT("مسودة قديمة مشتركة"));
    await signIn("teacher-b");
    expect(recoveryBar()).toBeNull();
    expect(localStorage.getItem(LEGACY_RECOVERY_KEY)).toBeNull();
  });

  it("logging out deletes the teacher's draft (no answer key left in the browser)", async () => {
    localStorage.setItem(recoveryDraftKey("teacher-a"), DRAFT("امتحان المعلّم أ"));
    await signIn("teacher-a");
    await waitFor(() => expect(recoveryBar()).not.toBeNull(), SLOW);
    await act(async () => { fireEvent.click(document.querySelector(".app-sidebar-logout") as HTMLElement); });
    await waitFor(() => expect(localStorage.getItem(recoveryDraftKey("teacher-a"))).toBeNull(), SLOW);
    expect(Object.keys(localStorage).filter(k => k.includes("Recovery"))).toEqual([]);
  });
});
