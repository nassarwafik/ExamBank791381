// @vitest-environment happy-dom
// Phase 11B — an OLDER /api/student-dashboard response must never overwrite a NEWER one. useAutoRefresh is
// single-flight only among its own triggers; the initial/manual load() and the Reader-return reload run beside it.
// Interleaving reproduced here: the initial load A is slow → the student re-focuses the window → the auto-refresh
// B starts, returns the teacher's NEWER state and is shown → A finally resolves with the OLDER state. Before 11B, A
// replaced B on screen (until the next 15 s poll). A 401 from any response still ends the session (authority kept).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const dash = (className: string) => ({
  student: { userId: "u1", code: "C-1", displayName: "أحمد", classId: "c1", avatarId: undefined, shareAchievements: true },
  classroom: { classId: "c1", name: className, grade: "11", schoolYear: "2026" },
  assignments: [],
  stats: { assigned: 0, completed: 0, average: null },
});

/** Dashboard responses are queued: each call gets the next scripted responder (a held promise or an immediate one). */
let script: (() => Promise<Response>)[] = [];
let dashboardCalls = 0;
function installFetch() {
  dashboardCalls = 0;
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) { dashboardCalls++; const next = script.shift(); return next ? next() : Promise.resolve(res(200, dash("—"))); }
    if (url.includes("/api/achievement-feed")) return Promise.resolve(res(200, { ok: true, posts: [] }));
    if (url.includes("/api/student-messages")) return Promise.resolve(res(200, { ok: true, totalUnread: 0, capped: false, counts: { total: 0, capped: false } }));
    return Promise.resolve(res(404, { ok: false }));
  }) as unknown as typeof fetch;
}
function held(body: () => Response) {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  return { responder: () => gate.then(body), release };
}

beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => {}); installFetch(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); script = []; });

describe("StudentPortal — an older dashboard response never overwrites a newer one (11B)", () => {
  it("slow initial load A + focus refresh B (newer): B is shown and stays shown after A resolves", async () => {
    const A = held(() => res(200, dash("صف-قديم")));
    script = [A.responder, () => Promise.resolve(res(200, dash("صف-جديد")))];
    const onLogout = vi.fn();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);
    await vi.waitFor(() => expect(dashboardCalls).toBe(1));                       // A in flight
    await act(async () => { window.dispatchEvent(new Event("focus")); });        // B starts beside A
    await vi.waitFor(() => expect(dashboardCalls).toBe(2));
    expect((await screen.findAllByText(/صف-جديد/)).length).toBeGreaterThan(0);    // newer state shown
    await act(async () => { A.release(); await new Promise(r => setTimeout(r, 30)); });
    expect(screen.queryByText(/صف-قديم/)).toBeNull();                              // the older response was discarded
    expect(screen.getAllByText(/صف-جديد/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();                     // A's loading flag still cleared
    expect(onLogout).not.toHaveBeenCalled();
  });
  it("an OLDER load that REJECTS (network / unreadable body) after a newer one was applied leaves no error banner over the newer data", async () => {
    let fail!: () => void;
    const gate = new Promise<void>(r => { fail = r; });
    script = [() => gate.then(() => { throw new TypeError("Failed to fetch"); }), () => Promise.resolve(res(200, dash("صف-جديد")))];
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    await vi.waitFor(() => expect(dashboardCalls).toBe(1));                       // A (the initial, non-silent load) in flight
    await act(async () => { window.dispatchEvent(new Event("focus")); });        // B starts beside A and wins
    expect((await screen.findAllByText(/صف-جديد/)).length).toBeGreaterThan(0);
    await act(async () => { fail(); await new Promise(r => setTimeout(r, 30)); });
    expect(screen.queryByRole("alert")).toBeNull();                                // the stale failure is not reported over newer data
    expect(screen.getAllByText(/صف-جديد/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();                     // its loading flag is still cleared
  });
  it("a failing load that is NOT stale still shows its error (the banner is only suppressed for superseded loads)", async () => {
    script = [() => Promise.reject(new TypeError("Failed to fetch"))];
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
  it("the NEWER load fails and the older one succeeds → the older data is shown (last-good), no banner from the silent failure", async () => {
    const A = held(() => res(200, dash("صف-أقدم")));
    script = [A.responder, () => Promise.resolve(res(500, { ok: false, error: "خطأ مؤقت" }))];
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    await vi.waitFor(() => expect(dashboardCalls).toBe(1));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await vi.waitFor(() => expect(dashboardCalls).toBe(2));
    await act(async () => { A.release(); await new Promise(r => setTimeout(r, 30)); });
    expect((await screen.findAllByText(/صف-أقدم/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("the in-order case is unchanged: a later response that arrives last is applied", async () => {
    script = [() => Promise.resolve(res(200, dash("صف-أول"))), () => Promise.resolve(res(200, dash("صف-ثانٍ")))];
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    expect((await screen.findAllByText(/صف-أول/)).length).toBeGreaterThan(0);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect((await screen.findAllByText(/صف-ثانٍ/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/صف-أول/)).toBeNull();
  });
  it("a 401 on an OLDER in-flight response still ends the session (session authority is never discarded)", async () => {
    const A = held(() => res(401, { ok: false, error: "انتهت الجلسة" }));
    script = [A.responder, () => Promise.resolve(res(200, dash("صف-جديد")))];
    const onLogout = vi.fn();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);
    await vi.waitFor(() => expect(dashboardCalls).toBe(1));
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect((await screen.findAllByText(/صف-جديد/)).length).toBeGreaterThan(0);
    await act(async () => { A.release(); await new Promise(r => setTimeout(r, 30)); });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
