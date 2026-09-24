// @vitest-environment happy-dom
//
// Phase 5D — App owns the teacher's unread-messages badge: fetched only after the teacher session is validated,
// refreshed silently every ~15s, and a failed refresh keeps the last-good count (no logout on a non-401).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act, waitFor } from "@testing-library/react";
import App from "./App";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
let summaryCalls = 0;
let summaryReplies: Array<[number, unknown]> = [];

function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/messages?kind=unread-summary")) {
      summaryCalls++;
      const [status, body] = summaryReplies.length > 1 ? summaryReplies.shift()! : summaryReplies[0];
      return res(status, body);
    }
    if (url.includes("/api/project-tracker")) {
      if (url.includes("resource=projects-summary")) return res(200, { ok: true, totalReadyForReview: 0, byProject: {} });
      if (url.includes("resource=projects")) return res(200, { ok: true, projects: [] });
      return res(200, { ok: true });
    }
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
}
const messagesNav = () => within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: /الرسائل/ });

beforeEach(() => {
  summaryCalls = 0;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Phase 5D — App teacher unread badge", () => {
  it("no summary request before login; after a validated teacher login the badge shows; 15s refresh; a failure keeps the last-good count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    summaryReplies = [[200, { ok: true, totalUnread: 3, capped: false }], [200, { ok: true, totalUnread: 5, capped: false }], [500, { ok: false, error: "x" }]];
    installFetch();
    render(<App />);
    expect(summaryCalls).toBe(0);                                             // login screen: nothing teacher-only fires
    await login();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(messagesNav().querySelector(".eb-nav-badge")?.textContent).toBe("3 رسائل جديدة"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await waitFor(() => expect(messagesNav().querySelector(".eb-nav-badge")?.textContent).toBe("5 رسائل جديدة"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });     // 500 → keep last-good
    expect(summaryCalls).toBeGreaterThanOrEqual(3);
    expect(messagesNav().querySelector(".eb-nav-badge")?.textContent).toBe("5 رسائل جديدة");
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();           // still logged in
  });
});
