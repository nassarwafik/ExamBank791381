// @vitest-environment happy-dom
//
// Phase S.3 — through the REAL App: a credential batch the teacher never downloaded or printed lives only in the mounted
// «الصفوف والطلاب» workspace. A shell navigation that would unmount the workspace (another page, the logout) asks first;
// «البقاء في الصفحة» keeps the batch, «مغادرة دون حفظ» leaves. Moving between the workspace's own tabs asks nothing, and a
// batch that was downloaded asks nothing.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

// The App's own confirmations use useDeferredConfirm: the dialog is a lazy chunk prefetched when the browser is idle after sign-in, and
// a confirm asked before that renders the lazy dialog on demand, which suspends once and is revealed only after React's Suspense
// throttle (~300 ms). Under a fully loaded parallel run that reveal outlived the default 1 s wait once (QA round 2). This test is about
// the leave guard, not the chunk: the App gets the eager useConfirm, whose contract and return shape are identical (useDeferredConfirm.tsx),
// so the guard's dialog renders in the same commit. The lazy path keeps its own tests (App.sharedConfirm.21e1, App.confirmPrefetch.21e1s2,
// deferredConfirmPrefetched.21e1s2).
vi.mock("./ui/useDeferredConfirm", async () => ({ useDeferredConfirm: (await import("./ui/useConfirm")).useConfirm }));

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active", studentCount: 2 }];
const S = (userId: string, firstName: string, identity: string) => ({ userId, code: identity, identityNumber: identity, firstName, familyName: "حسن", displayName: firstName + " حسن", classId: "c1", active: true, archived: false, createdAt: "", updatedAt: "", lastLoginAt: "", submittedAssignmentsCount: 0, likesCount: 0 });
const ROSTER = [S("s1", "علي", "111111111"), S("s2", "زيد", "222222222")];
const SLOW = { timeout: 8000 };
function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/classrooms") && method === "GET") return res(200, { ok: true, classes: CLASSES });
    if (url.includes("/api/students") && method === "GET") return res(200, { ok: true, students: ROSTER });
    if (url.includes("/api/students") && body.action === "bulkAction") return res(200, { ok: true, processed: 2, failed: 0, errors: [], rosterSynced: true, credentials: ROSTER.map(s => ({ userId: s.userId, firstName: s.firstName, familyName: s.familyName, identityNumber: s.identityNumber, code: s.code, password: "Pw-" + s.userId })) });
    return res(200, { ok: true, classes: [], students: [], assignments: [], projects: [], items: [], posts: [], exams: [], totalUnread: 0, capped: false, byProject: {}, totalReadyForReview: 0 });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy(), SLOW);
}
const nav = (label: RegExp) => act(async () => { fireEvent.click(within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: label })); });
const leaveConfirm = () => document.querySelector('.eb-confirm[role="dialog"]') as HTMLElement | null;
const batch = () => screen.queryByRole("region", { name: "بيانات الدخول الجديدة" });
const onStudents = () => !!screen.queryByRole("heading", { level: 2, name: "الحادي عشر" });

async function openUnsavedBatch(beforeCreate?: () => void) {
  vi.resetModules();
  const { default: App } = await import("./App");
  render(<App />);
  await login();
  await nav(/^الصفوف والطلاب/);
  await screen.findByText("علي", {}, SLOW);
  fireEvent.click(screen.getByLabelText("تحديد علي حسن"));
  fireEvent.click(screen.getByLabelText("تحديد زيد حسن"));
  fireEvent.click(within(await screen.findByRole("region", { name: "إجراءات جماعية" })).getByRole("button", { name: "كلمات مرور جديدة" }));
  const c = await waitFor(() => { const el = leaveConfirm(); if (!el) throw new Error("no confirm"); return el; });
  beforeCreate?.();
  fireEvent.click(c.querySelector(".eb-dialog-foot .is-primary") as HTMLElement);
  await waitFor(() => expect(batch()).not.toBeNull(), SLOW);
}

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  URL.createObjectURL = vi.fn(() => "blob:x") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  installFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("S.3 App — leaving the platform with an unsaved credential batch", () => {
  it("another page or the logout asks; «البقاء في الصفحة» keeps the batch; the workspace's own tabs never ask; «مغادرة دون حفظ» leaves", async () => {
    await openUnsavedBatch();
    await nav(/^التقارير/);
    const ask = await waitFor(() => { const el = leaveConfirm(); if (!el) throw new Error("no leave confirm"); return el; });
    expect(within(ask).getByRole("heading", { name: "كلمات مرور لم تُحفظ" })).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "البقاء في الصفحة" }));
    await waitFor(() => expect(leaveConfirm()).toBeNull());
    expect(onStudents()).toBe(true);
    expect(batch()).not.toBeNull();

    await nav(/^لوحة المتابعة/);                                                                  // same workspace: no question
    expect(leaveConfirm()).toBeNull();
    await nav(/^الصفوف والطلاب/);
    await waitFor(() => expect(batch()).not.toBeNull(), SLOW);                                     // still there (never unmounted)

    fireEvent.click(document.querySelector(".app-sidebar-logout") as HTMLElement);
    const askLogout = await waitFor(() => { const el = leaveConfirm(); if (!el) throw new Error("no logout confirm"); return el; });
    fireEvent.click(within(askLogout).getByRole("button", { name: "البقاء في الصفحة" }));
    await waitFor(() => expect(leaveConfirm()).toBeNull());
    expect(document.querySelector(".app-sidebar-logout")).toBeTruthy();                           // still logged in
    expect(batch()).not.toBeNull();

    await nav(/^التقارير/);
    fireEvent.click(within(await waitFor(() => { const el = leaveConfirm(); if (!el) throw new Error("no confirm"); return el; })).getByRole("button", { name: "مغادرة دون حفظ" }));
    await waitFor(() => expect(onStudents()).toBe(false), SLOW);
    expect(batch()).toBeNull();
  }, 20000);

  // Root cause of a Quality Gate failure ("no leave confirm"): the workspace reported the unsaved batch from a PASSIVE effect, which
  // React runs in a later task than the commit that shows the batch. A navigation handled in between read a stale "nothing pending"
  // and left without asking. Deterministic form: «التقارير» is clicked from a MutationObserver callback, i.e. as soon as the batch is
  // in the DOM and before any later task can run. The report must already be in place by then.
  it("a navigation right after the batch appears (before any later task) still asks", async () => {
    let clicked = false;
    const reports = () => within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: /^التقارير/ });
    await openUnsavedBatch(() => {
      const mo = new MutationObserver(() => {
        if (clicked || !batch()) return;
        clicked = true; mo.disconnect();
        reports().click();                                                                       // native click: no act(), no effect flush
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    expect(clicked).toBe(true);
    const ask = await waitFor(() => { const el = leaveConfirm(); if (!el) throw new Error("no leave confirm"); return el; });
    expect(within(ask).getByRole("heading", { name: "كلمات مرور لم تُحفظ" })).toBeTruthy();
    expect(onStudents()).toBe(true);
    expect(batch()).not.toBeNull();
  }, 20000);

  it("a batch that was downloaded asks nothing", async () => {
    await openUnsavedBatch();
    fireEvent.click(within(batch() as HTMLElement).getByRole("button", { name: "تنزيل CSV" }));
    await waitFor(() => expect(batch()?.textContent).toContain("✓ حُفظت نسخة منها"));
    await nav(/^التقارير/);
    await waitFor(() => expect(onStudents()).toBe(false), SLOW);
    expect(leaveConfirm()).toBeNull();
  }, 20000);
});
