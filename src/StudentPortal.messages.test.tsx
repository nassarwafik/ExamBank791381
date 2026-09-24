// @vitest-environment happy-dom
// Phase 5C — «الرسائل» is a DEDICATED student destination reached from the shell top bar (a full-view swap like
// Educational Games). While it is open, the portal's own 15s dashboard auto-refresh is DISABLED (the messages view
// owns a 5s poll of /api/student-messages); Back returns to the portal. A messaging 401 never logs the student out.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
let calls: string[] = [];
let messagesStatus = 200;

function mount(onLogout = vi.fn()) {
  calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input); calls.push(url);
    if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false, projects: [] });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
    if (url.includes("/api/student-messages")) return messagesStatus === 200
      ? res(200, { ok: true, direct: [{ messageId: "1700000000000-aaaaaaaaaaaaaaaa", kind: "direct", senderRole: "teacher", senderDisplayName: "أ. أحمد", body: "أهلًا بك", createdAt: "2023-11-14T22:13:20.000Z" }], announcements: [], classroom: { classId: "c1", name: "الصف", archived: false }, canSend: true, readOnlyReason: "" })
      : res(messagesStatus, { ok: false, error: "Unauthorized" });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return onLogout;
}
const count = (part: string) => calls.filter(c => c.includes(part)).length;

describe("StudentPortal — «الرسائل» destination", () => {
  it("the shell has a «الرسائل» entry; opening swaps to the messages view, Back returns; Games entry unchanged", async () => {
    messagesStatus = 200;
    mount();
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.getByRole("button", { name: "الألعاب التعليمية" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "الرسائل" }));
    expect(await screen.findByRole("heading", { level: 1, name: "الرسائل" })).toBeTruthy();
    expect(await screen.findByText("أهلًا بك")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "تقدّمي وقوتي" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.getByRole("button", { name: "الرسائل" })).toBeTruthy();
  });

  it("the portal's dashboard auto-refresh is disabled while messages are open; the messages view polls instead", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    messagesStatus = 200;
    mount();
    await screen.findByText(/مرحبًا أحمد/);
    fireEvent.click(screen.getByRole("button", { name: "الرسائل" }));
    await screen.findByText("أهلًا بك");
    const dash = count("/api/student-dashboard"), msgs = count("/api/student-messages");
    await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
    expect(count("/api/student-dashboard")).toBe(dash);                            // portal refresh paused
    expect(count("/api/student-messages")).toBeGreaterThan(msgs);                 // messages view polls
  });

  it("a /api/student-messages 401 degrades inside the view and never logs the student out", async () => {
    messagesStatus = 401;
    const onLogout = mount();
    await screen.findByText(/مرحبًا أحمد/);
    fireEvent.click(screen.getByRole("button", { name: "الرسائل" }));
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر التحقق من الجلسة");
    expect(onLogout).not.toHaveBeenCalled();
  });
});
