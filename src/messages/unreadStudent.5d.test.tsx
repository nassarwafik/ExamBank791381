// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, waitFor } from "@testing-library/react";
import StudentShell from "../shell/StudentShell";
import StudentPortal from "../StudentPortal";
import StudentMessagesPage from "./StudentMessagesPage";
import type { MessageView, StudentMessagesClient, StudentMessagesData, StudentUnread } from "./messagesClient";

// Phase 5D — student unread: top-bar badge (portal-owned, auxiliary), per-tab counts, and marking ONLY the visible
// stream after its snapshot loaded (direct on open; announcements only when that tab is selected).

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
const U = (d: number, a: number, dc = false): StudentUnread => ({ directUnread: { unread: d, capped: dc }, announcementUnread: { unread: a, capped: false }, totalUnread: Math.min(99, d + a), totalCapped: dc || d + a > 99 });

describe("StudentShell — «الرسائل» badge", () => {
  it("0 hidden; 3 → «3» with hidden «رسائل غير مقروءة»; capped → «99+»; Games entry unchanged", () => {
    const mount = (u?: { total: number; capped: boolean }) => render(<StudentShell studentName="أحمد" onLogout={() => {}} onOpenGames={() => {}} onOpenMessages={() => {}} messagesUnread={u}><p>x</p></StudentShell>);
    const a = mount({ total: 0, capped: false });
    expect(screen.getByRole("button", { name: "الرسائل" }).querySelector(".eb-nav-badge")).toBeNull();
    a.unmount();
    const b = mount({ total: 3, capped: false });
    expect(screen.getByRole("button", { name: /الرسائل/ }).querySelector(".eb-nav-badge")?.textContent).toBe("3 رسائل غير مقروءة");
    expect(screen.getByRole("button", { name: "الألعاب التعليمية" })).toBeTruthy();
    b.unmount();
    mount({ total: 99, capped: true });
    expect(screen.getByRole("button", { name: /الرسائل/ }).querySelector(".eb-nav-badge")?.textContent).toBe("99+ رسائل غير مقروءة");
  });
});

describe("StudentPortal — auxiliary unread summary", () => {
  const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
  const unified = (b: unknown) => {
    const o = b as { ok?: boolean; totalUnread?: number; totalCapped?: boolean };
    return o && o.ok ? { ok: true, messages: { ...o, directUnread: { unread: o.totalUnread, capped: false }, announcementUnread: { unread: 0, capped: false } }, events: { unread: 0, capped: false }, bell: { unread: o.totalUnread, capped: o.totalCapped === true } } : b;
  };
  const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
  const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
  function mount(unreadReplies: Array<[number, unknown]>) {
    const onLogout = vi.fn();
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, { student, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats });
      // Phase 6D — the portal's badge poll is the UNIFIED counts read; its `messages` part is exactly the Phase 5D summary
      // (no non-message events here, so the bell total equals it).
      if (url.includes("/api/student-notifications?view=unread")) { const [s, b] = unreadReplies.length > 1 ? unreadReplies.shift()! : unreadReplies[0]; return res(s, unified(b)); }
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false, projects: [] });
      if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });
      return res(404, { ok: false });
    }) as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
    return onLogout;
  }
  const badge = () => screen.getByRole("button", { name: /الرسائل/ }).querySelector(".eb-nav-badge")?.textContent || "";

  it("loads with the portal, refreshes on the 15s cycle, keeps last-good on failure, and a 401 never logs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onLogout = mount([[200, { ok: true, totalUnread: 2, totalCapped: false }], [200, { ok: true, totalUnread: 5, totalCapped: false }], [401, { ok: false, error: "Unauthorized" }]]);
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(badge()).toBe("2 رسائل غير مقروءة"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await waitFor(() => expect(badge()).toBe("5 رسائل غير مقروءة"));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });     // 401 from the auxiliary endpoint
    expect(badge()).toBe("5 رسائل غير مقروءة");
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("a capped total shows 99+", async () => {
    mount([[200, { ok: true, totalUnread: 99, totalCapped: true }]]);
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(badge()).toBe("99+ رسائل غير مقروءة"));
  });
});

let seq = 0;
const msg = (body: string, senderRole: "teacher" | "student", kind: "direct" | "announcement" = "direct"): MessageView => ({ messageId: String(1800000000000 + ++seq) + "-bbbbbbbbbbbbbbbb", kind, senderRole, senderDisplayName: "أ. أحمد", body, createdAt: "" });
const DIRECT = [msg("د1", "teacher"), msg("د2", "teacher"), msg("د3", "teacher")];
const ANNS = [msg("إ1", "teacher", "announcement"), msg("إ2", "teacher", "announcement")];
const data = (): StudentMessagesData => ({ direct: DIRECT, announcements: ANNS, classroom: { classId: "c1", name: "الصف", archived: false }, canSend: true, readOnlyReason: "" });
const client = (over: Partial<StudentMessagesClient> = {}): StudentMessagesClient => ({
  load: vi.fn(async () => data()),
  sendDirect: vi.fn(async (b: string) => msg(b, "student")),
  getUnread: vi.fn(async () => U(3, 2)),
  markRead: vi.fn(async (stream: "direct" | "announcements") => (stream === "direct" ? U(0, 2) : U(0, 0))),
  ...over
});
const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("StudentMessagesPage — per-tab unread + visible-only marking", () => {
  it("direct 3 + announcements 2: opening marks ONLY direct (→ 0 / 2); selecting announcements marks them", async () => {
    const c = client();
    const onUnreadChange = vi.fn();
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} onUnreadChange={onUnreadChange} />);
    await screen.findByText("د3");
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("direct", { throughMessageId: DIRECT[2].messageId, seenIdsAtBoundary: [DIRECT[2].messageId] }));
    await waitFor(() => expect(tab(/إعلانات الصف/).textContent).toContain("2 غير مقروءة"));
    expect(tab(/المحادثة مع المعلم/).textContent).not.toContain("غير مقروءة");
    expect(c.markRead).not.toHaveBeenCalledWith("announcements", expect.anything());
    expect(onUnreadChange).toHaveBeenLastCalledWith(U(0, 2));
    fireEvent.click(tab(/إعلانات الصف/));
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("announcements", { throughMessageId: ANNS[1].messageId, seenIdsAtBoundary: [ANNS[1].messageId] }));
    await waitFor(() => expect(tab(/إعلانات الصف/).textContent).not.toContain("غير مقروءة"));
  });

  it("a failed mark keeps the badge; a message that arrived after the marked id stays unread (server count)", async () => {
    const failing = client({ markRead: vi.fn(async () => { throw new Error("x"); }) });
    const view = render(<StudentMessagesPage token="t" onBack={() => {}} client={failing} />);
    await screen.findByText("د3");
    await waitFor(() => expect(failing.markRead).toHaveBeenCalled());
    expect(tab(/المحادثة مع المعلم/).textContent).toContain("3 غير مقروءة");
    view.unmount();
    const racing = client({ markRead: vi.fn(async () => U(1, 2)) });           // teacher sent Y during the mark through X
    render(<StudentMessagesPage token="t" onBack={() => {}} client={racing} />);
    await screen.findByText("د3");
    await waitFor(() => expect(tab(/المحادثة مع المعلم/).textContent).toContain("1 غير مقروءة"));
  });

  it("a load that resolves while ANOTHER tab is visible marks only the visible tab's stream", async () => {
    const pending = deferred<StudentMessagesData>();
    const c = client({ load: vi.fn(() => pending.promise) });
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} />);
    fireEvent.click(tab(/إعلانات الصف/));                                      // switch before the snapshot arrives
    await act(async () => { pending.resolve(data()); });
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("announcements", { throughMessageId: ANNS[1].messageId, seenIdsAtBoundary: [ANNS[1].messageId] }));
    expect(c.markRead).not.toHaveBeenCalledWith("direct", expect.anything());
  });

  it("RACE: mark A pending → poll starts mark B → B returns 1 → stale A returns 0 LAST → applyUnread ignores A", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onUnreadChange = vi.fn();
    const D4 = msg("د4", "teacher");
    const snapshots = [data(), { ...data(), direct: [...DIRECT, D4] }];
    const markA = deferred<StudentUnread>(), markB = deferred<StudentUnread>();
    const c = client({
      load: vi.fn(async () => snapshots.length > 1 ? snapshots.shift()! : snapshots[0]),
      markRead: vi.fn((_s: "direct" | "announcements", ack: { throughMessageId: string }) => (ack.throughMessageId === DIRECT[2].messageId ? markA.promise : markB.promise))
    });
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} onUnreadChange={onUnreadChange} />);
    await screen.findByText("د3");
    await waitFor(() => expect(tab(/المحادثة مع المعلم/).textContent).toContain("3 غير مقروءة"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });          // the 5s poll shows D4 → mark B starts
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("direct", { throughMessageId: D4.messageId, seenIdsAtBoundary: [D4.messageId] }));
    await act(async () => { markB.resolve(U(1, 2)); });                          // newest mark: another message arrived
    expect(tab(/المحادثة مع المعلم/).textContent).toContain("1 غير مقروءة");
    await act(async () => { markA.resolve(U(0, 2)); });                          // older mark resolves LAST
    expect(tab(/المحادثة مع المعلم/).textContent).toContain("1 غير مقروءة");
    expect(onUnreadChange).toHaveBeenLastCalledWith(U(1, 2));
    expect(onUnreadChange).not.toHaveBeenCalledWith(U(0, 2));
  });

  it("CROSS-STREAM: a slower direct mark never restores the announcement count a NEWER announcements mark cleared", async () => {
    const markD = deferred<StudentUnread>();
    const onUnreadChange = vi.fn();
    const c = client({ markRead: vi.fn((stream: "direct" | "announcements") => (stream === "direct" ? markD.promise : Promise.resolve(U(3, 0)))) });
    render(<StudentMessagesPage token="t" onBack={() => {}} client={c} onUnreadChange={onUnreadChange} />);
    await screen.findByText("د3");
    await waitFor(() => expect(c.markRead).toHaveBeenCalledWith("direct", expect.anything()));
    await waitFor(() => expect(tab(/إعلانات الصف/).textContent).toContain("2 غير مقروءة"));
    fireEvent.click(tab(/إعلانات الصف/));                                      // announcements mark starts AFTER the direct one
    await waitFor(() => expect(tab(/إعلانات الصف/).textContent).not.toContain("غير مقروءة"));
    await act(async () => { markD.resolve(U(0, 2)); });                         // its announcement part predates the newer mark
    expect(tab(/المحادثة مع المعلم/).textContent).not.toContain("غير مقروءة"); // its OWN stream still applies
    expect(tab(/إعلانات الصف/).textContent).not.toContain("غير مقروءة");        // no regression to 2
    expect(onUnreadChange).toHaveBeenLastCalledWith(U(0, 0));
  });

  it("after unmount (back) no further load or mark fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const c = client();
    const view = render(<StudentMessagesPage token="t" onBack={() => {}} client={c} />);
    await screen.findByText("د3");
    await waitFor(() => expect(c.markRead).toHaveBeenCalledTimes(1));
    view.unmount();
    (c.load as ReturnType<typeof vi.fn>).mockClear(); (c.markRead as ReturnType<typeof vi.fn>).mockClear(); (c.getUnread as ReturnType<typeof vi.fn>).mockClear();
    await act(async () => { await vi.advanceTimersByTimeAsync(40000); });
    expect(c.load).not.toHaveBeenCalled();
    expect(c.getUnread).not.toHaveBeenCalled();
    expect(c.markRead).not.toHaveBeenCalled();
  });
});
