// @vitest-environment happy-dom
// Phase 1 auto-refresh — StudentPortal integration. Proves teacher-side dashboard changes appear on the 15s
// background cycle WITHOUT logout/login, without a full loading screen, with the 401 session authority intact, and
// gated off while a sub-view/modal owns the screen. Fake timers with shouldAdvanceTime so RTL async queries work;
// only explicit advances fire the interval (happy-dom never spontaneously focuses the window).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

const dash = (className: string) => ({
  student: { userId: "u1", code: "C-1", displayName: "أحمد", classId: "c1", avatarId: undefined, shareAchievements: true },
  classroom: { classId: "c1", name: className, grade: "11", schoolYear: "2026" },
  assignments: [],
  stats: { assigned: 0, completed: 0, average: null },
});

// Mutable server state the mock serves; tests flip these to simulate a teacher-side change / session revocation.
let dashStatus = 200;
let dashClassName = "صف-النسخة-الأولى";
let dashboardCalls = 0;

function installFetch() {
  dashboardCalls = 0;
  const fn = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) { dashboardCalls++; return res(dashStatus, dashStatus === 200 ? dash(dashClassName) : { ok: false, error: "انتهت الجلسة" }); }
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, courses: [] });
    return res(404, { ok: false });
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); dashStatus = 200; dashClassName = "صف-النسخة-الأولى"; vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("StudentPortal — Phase 1 auto-refresh integration", () => {
  it("9-11: first response shows old data; after 15s a teacher change appears in place (no remount, no logout)", async () => {
    const onLogout = vi.fn();
    installFetch();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);

    // (9) old teacher data
    expect((await screen.findAllByText(/صف-النسخة-الأولى/)).length).toBeGreaterThan(0);

    // teacher changes the class-side state server-side
    dashClassName = "صف-النسخة-الثانية";

    // (10) the 15s interval pulls it; (11) it swaps in place — same mounted portal, no logout
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect((await screen.findAllByText(/صف-النسخة-الثانية/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/صف-النسخة-الأولى/)).toBeNull();          // old value replaced
    expect(screen.getByText(/مرحبًا أحمد/)).toBeTruthy();                // still the same portal, never remounted to login
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("12: a background refresh does not replace the dashboard with a full loading screen", async () => {
    installFetch();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();          // initial load already settled

    dashClassName = "صف-محدَّث";
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    // during & after the silent refresh the blocking spinner never returns, and content stays present
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();
    expect((await screen.findAllByText(/صف-محدَّث/)).length).toBeGreaterThan(0);
  });

  it("13: a background dashboard 401 still triggers the existing onLogout authority", async () => {
    const onLogout = vi.fn();
    installFetch();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);
    await screen.findByText(/مرحبًا أحمد/);
    expect(onLogout).not.toHaveBeenCalled();

    dashStatus = 401;                                                    // session revoked server-side mid-session
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
  });

  it("14-15: auto-refresh is disabled while the avatar modal is open, and re-enabled after it closes", async () => {
    installFetch();
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={vi.fn()} />);
    await screen.findByText(/مرحبًا أحمد/);
    const callsAfterInitial = dashboardCalls;

    // open the avatar modal → autoRefreshEnabled becomes false
    fireEvent.click(screen.getByLabelText("تغيير الأيقونة"));
    expect(await screen.findByText("اختر أيقونتك")).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(dashboardCalls).toBe(callsAfterInitial);                     // (14) no background dashboard fetch while modal open

    // close the modal → gate re-enables (Dialog renders both a header ✕ and a footer button named "إغلاق"; either closes)
    fireEvent.click(screen.getAllByRole("button", { name: "إغلاق" })[0]);
    await waitFor(() => expect(screen.queryByText("اختر أيقونتك")).toBeNull());
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(dashboardCalls).toBeGreaterThan(callsAfterInitial);         // (15) refreshing works again on the main portal
  });
});
