// @vitest-environment happy-dom
//
// Regression: a student with valid credentials must NOT be bounced to login when an OPTIONAL portal
// panel (achievement feed / project tracker) returns 401. Only a 401 from the PRIMARY
// /api/student-dashboard request may invalidate the session.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, waitFor } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

const DASHBOARD_OK = {
  student: { userId: "u1", code: "C-123", displayName: "أحمد محمد", classId: "c1", avatarId: undefined, shareAchievements: true },
  classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026" },
  assignments: [],
  stats: { assigned: 0, completed: 0, average: null }
};

// Route fetch by endpoint. `feed`/`tracker`/`dashboard` statuses are configurable per test.
function mockFetch(opts: { dashboard: number; feed: number; tracker: number }) {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/student-dashboard")) return res(opts.dashboard, opts.dashboard === 200 ? DASHBOARD_OK : { ok: false, error: "انتهت الجلسة" });
    if (url.includes("/api/achievement-feed")) return res(opts.feed, opts.feed === 200 ? { ok: true, posts: [] } : { ok: false, error: "غير مصرّح" });
    if (url.includes("/api/student-project-tracker")) return res(opts.tracker, opts.tracker === 200 ? { ok: true, enrolled: false } : { ok: false });
    return res(404, { ok: false });
  });
}

describe("StudentPortal — optional panels must not end the session (login-bounce regression)", () => {
  it("6 (CRITICAL): dashboard 200 + achievement-feed 401 → portal stays, dashboard shows, NO onLogout", async () => {
    const onLogout = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = mockFetch({ dashboard: 200, feed: 401, tracker: 401 }) as unknown as typeof fetch;

    render(<StudentPortal token="valid-token" displayName="أحمد محمد" onLogout={onLogout} />);

    // dashboard renders
    expect(await screen.findByText(/مرحبًا أحمد محمد/)).toBeTruthy();
    // the optional feed degraded to its empty state, not a logout
    expect(await screen.findByText(/لا توجد إنجازات بعد/)).toBeTruthy();
    // give any pending microtasks a chance, then assert the session was preserved
    await waitFor(() => expect(warn).toHaveBeenCalled()); // diagnostic fired (feed unavailable)
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("7: dashboard 401 → onLogout IS called (real session invalidation still works)", async () => {
    const onLogout = vi.fn();
    globalThis.fetch = mockFetch({ dashboard: 401, feed: 200, tracker: 200 }) as unknown as typeof fetch;

    render(<StudentPortal token="expired" displayName="أحمد" onLogout={onLogout} />);

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1));
    // the dashboard must NOT be shown for an invalid session
    expect(screen.queryByText(/مرحبًا/)).toBeNull();
  });

  it("8: project-tracker 401 (with feed 401 too) → no onLogout, portal alive, project panel absent", async () => {
    const onLogout = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = mockFetch({ dashboard: 200, feed: 401, tracker: 401 }) as unknown as typeof fetch;

    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);

    expect(await screen.findByText(/مرحبًا أحمد/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull());
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.queryByText(/📡 مشاريعي/)).toBeNull(); // optional project panel silently absent
  });

  it("all optional panels OK → dashboard renders and no logout", async () => {
    const onLogout = vi.fn();
    globalThis.fetch = mockFetch({ dashboard: 200, feed: 200, tracker: 200 }) as unknown as typeof fetch;
    render(<StudentPortal token="valid" displayName="أحمد" onLogout={onLogout} />);
    expect(await screen.findByText(/مرحبًا أحمد/)).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
  });
});
