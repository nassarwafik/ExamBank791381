// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, waitFor, within } from "@testing-library/react";
import StudentPortal from "../StudentPortal";

// Phase 6C — the notification center inside the REAL StudentPortal. /api/student-messages is served by the REAL backend
// handler (hardened student session + Phase 5D read state) against the in-memory blob container, so navigation,
// read/unread integrity and synchronization are checked end to end. Nothing leaves the process.

const nodeRequire = createRequire(import.meta.url);
const { handler: studentApi } = nodeRequire("../../api/src/functions/student-messages.js");
const { handler: teacherApi } = nodeRequire("../../api/src/functions/messages.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");
const { READ_STATE_PREFIX } = nodeRequire("../../api/src/lib/message-read-state.js");

const S1 = "11111111-1111-1111-1111-111111111111";
const CA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TOKENS: Record<string, string> = { "tok-1": S1 };

type Call = { method: string; url: string; body: Record<string, unknown> };
let ctx: ReturnType<typeof createMemoryContainer>;
let calls: Call[];
let onLogout: ReturnType<typeof vi.fn<() => void>>;

const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const student = { userId: S1, code: "C1", displayName: "أحمد", classId: CA, avatarId: "a1", shareAchievements: true };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const T = { requireBuilderAuth: () => ({ ok: true, user: { sub: "builder-1" } }), resolveTeacherDisplayName: async () => "أ. أحمد", recordAuditEvent: async () => {} };
const teacherSend = async (body: Record<string, unknown>) => {
  const r = await teacherApi({ method: "POST", url: "https://x/api/messages", headers: { get: () => null }, json: async () => body }, { ...T, container: ctx.container });
  expect(r.status).toBe(200);
};
const readState = () => JSON.stringify(ctx.names(READ_STATE_PREFIX).map((n: string) => [n, ctx.store.get(n).etag]));

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", classId: CA, active: true, archived: false, authVersion: 1 },
    ["platform/classes/" + CA + ".json"]: { classId: CA, name: "الصف", active: true, studentIds: [] }
  });
  calls = [];
  onLogout = vi.fn<() => void>();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const headers = (init?.headers || {}) as Record<string, string>;
    if (url.includes("/api/student-dashboard")) return res(200, { student, classroom: { classId: CA, name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats });
    if (url.includes("/api/student-messages")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ method, url, body });
      const token = headers["x-student-token"] || "";
      const r = await studentApi({ method, url: "https://x" + url, headers: { get: () => null }, json: async () => body }, {
        container: ctx.container,
        requireStudentAuth: () => (TOKENS[token] ? { ok: true, user: { sub: TOKENS[token], sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } })
      });
      return res(r.status, r.jsonBody);
    }
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

async function mountPortal() {
  render(<StudentPortal token="tok-1" displayName="أحمد" onLogout={onLogout} />);
  await screen.findByText(/مرحبًا أحمد/);
}
const bell = () => screen.getByRole("button", { name: /^الإشعارات/ });
const bellCount = () => bell().querySelector(".eb-nav-badge")?.textContent || "";
const panel = () => document.getElementById(bell().getAttribute("aria-controls") || "")!;
const items = () => within(panel()).queryAllByRole("button").filter(b => b.classList.contains("eb-notif-item"));
const notificationReads = () => calls.filter(c => c.url.includes("view=notifications"));
const unreadReads = () => calls.filter(c => c.url.includes("view=unread"));
const marks = () => calls.filter(c => c.method === "POST" && c.body.action === "markRead");
async function openPanel() {
  fireEvent.click(bell());
  await waitFor(() => expect(items().length + within(panel()).queryAllByText("لا توجد إشعارات جديدة.").length).toBeGreaterThan(0));
}
async function seedTwoAndOne() {
  await teacherSend({ action: "sendDirect", studentId: S1, body: "راجع الواجب الثاني" });
  await teacherSend({ action: "sendDirect", studentId: S1, body: "أحسنت اليوم" });
  await teacherSend({ action: "sendAnnouncement", classId: CA, body: "لا حصة غدًا" });
}

describe("navigation from a notification", () => {
  it("15. a direct-message notification opens Student Messages on the DIRECT conversation", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await openPanel();
    fireEvent.click(items().find(b => b.textContent?.includes("أحسنت اليوم"))!);
    await screen.findByRole("heading", { name: "الرسائل" });
    expect(screen.getByRole("tab", { name: /المحادثة مع المعلم/ }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("أحسنت اليوم")).toBeTruthy();
  });

  it("16. an announcement notification opens Student Messages on «إعلانات الصف» — and only that stream is acknowledged", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await openPanel();
    fireEvent.click(items().find(b => b.textContent?.includes("لا حصة غدًا"))!);
    await screen.findByRole("heading", { name: "الرسائل" });
    expect(screen.getByRole("tab", { name: /إعلانات الصف/ }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => expect(marks().map(m => m.body.stream)).toEqual(["announcements"]));
    expect(await screen.findByText("لا حصة غدًا")).toBeTruthy();
  });

  it("17. the ordinary «الرسائل» entry still opens the default DIRECT view", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await openPanel();
    fireEvent.click(items().find(b => b.textContent?.includes("لا حصة غدًا"))!);   // a previous visit to announcements…
    await screen.findByRole("heading", { name: "الرسائل" });
    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    fireEvent.click(screen.getByRole("button", { name: /^الرسائل/ }));              // …never leaks into the plain entry
    await screen.findByRole("heading", { name: "الرسائل" });
    expect(screen.getByRole("tab", { name: /المحادثة مع المعلم/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("read-state integrity", () => {
  it("18. opening / closing / reopening the panel (and seeing items) marks NOTHING read — no POST, no read-state write", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await waitFor(() => expect(bellCount()).toBe("3"));
    const before = readState();
    for (let i = 0; i < 3; i++) {
      await openPanel();
      expect(items().filter(b => b.getAttribute("data-unread") === "true")).toHaveLength(3);
      fireEvent.pointerOver(items()[0]);
      fireEvent.focus(items()[0]);
      fireEvent.click(bell());                                                     // close
    }
    expect(marks()).toHaveLength(0);
    expect(calls.every(c => c.method === "GET")).toBe(true);
    expect(readState()).toBe(before);
    expect(bellCount()).toBe("3");
  });

  it("19. the bell count is the SERVER's: it follows the server even when the list shows fewer items", async () => {
    for (let i = 1; i <= 20; i++) await teacherSend({ action: "sendDirect", studentId: S1, body: "رسالة " + i });
    await mountPortal();
    await waitFor(() => expect(bellCount()).toBe("20"));
    await openPanel();
    expect(items()).toHaveLength(15);                                              // a bounded preview…
    expect(bellCount()).toBe("20");                                                // …never a client-side recount
    expect(notificationReads().length).toBe(1);
  });

  it("20/22. opening the real tab uses the EXISTING mark-read path; back in the portal the bell shows the server's remainder", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await waitFor(() => expect(bellCount()).toBe("3"));
    await openPanel();
    fireEvent.click(items().find(b => b.textContent?.includes("راجع الواجب"))!);
    await screen.findByRole("heading", { name: "الرسائل" });
    await waitFor(() => expect(marks()).toHaveLength(1));
    const [mark] = marks();
    expect(mark.body.stream).toBe("direct");
    expect(Array.isArray(mark.body.seenIdsAtBoundary)).toBe(true);                  // the Phase 5D snapshot acknowledgement
    await waitFor(() => expect(screen.getByRole("tab", { name: /المحادثة مع المعلم/ }).textContent).not.toContain("غير مقروءة"));
    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(bellCount()).toBe("1"));                              // the announcement is still unread
    await openPanel();                                                             // the pre-read preview was dropped: fresh read
    await waitFor(() => expect(items().filter(b => b.getAttribute("data-unread") === "true").map(b => b.textContent?.includes("لا حصة غدًا"))).toEqual([true]));
  });
});

describe("synchronization", () => {
  it("23/24. a new message reaches the bell on the silent 15s cycle — no logout, no reset, no duplicate reads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await teacherSend({ action: "sendDirect", studentId: S1, body: "الأولى" });
    await mountPortal();
    await waitFor(() => expect(bellCount()).toBe("1"));
    await teacherSend({ action: "sendAnnouncement", classId: CA, body: "إعلان جديد" });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await waitFor(() => expect(bellCount()).toBe("2"));
    expect(screen.queryByText("جارٍ تحميل حسابك...")).toBeNull();                 // never back to the blocking spinner

    await openPanel();
    const unreadBefore = unreadReads().length, notifBefore = notificationReads().length;
    await teacherSend({ action: "sendDirect", studentId: S1, body: "الثالثة" });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await waitFor(() => expect(items().some(b => b.textContent?.includes("الثالثة"))).toBe(true));
    expect(bellCount()).toBe("3");
    expect(bell().getAttribute("aria-expanded")).toBe("true");                       // the panel stays open through a refresh
    expect(notificationReads().length).toBe(notifBefore + 1);                        // the open panel's read REPLACES…
    expect(unreadReads().length).toBe(unreadBefore);                                 // …the badge-only read (no duplicate)
    expect(screen.getByText(/مرحبًا أحمد/)).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("14 (portal). a failed preview refresh keeps the last-good items, shows a small error, and never logs out", async () => {
    await seedTwoAndOne();
    await mountPortal();
    await openPanel();
    expect(items()).toHaveLength(3);
    fireEvent.click(bell());
    const real = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => (String(input).includes("view=notifications") ? res(401, { ok: false, error: "Unauthorized" }) : real(input, init))) as unknown as typeof fetch;
    fireEvent.click(bell());
    await waitFor(() => expect(panel().textContent).toContain("تعذر تحديث الإشعارات حاليًا."));
    expect(items()).toHaveLength(3);
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.getByText(/مرحبًا أحمد/)).toBeTruthy();
  });

  it("works without any notification permission / push support (Phase 6B is a separate channel)", async () => {
    expect("Notification" in window && (window as unknown as { Notification?: { permission?: string } }).Notification?.permission === "granted").toBe(false);
    await seedTwoAndOne();
    await mountPortal();
    await openPanel();
    expect(items()).toHaveLength(3);
    expect(calls.some(c => c.url.includes("student-push"))).toBe(false);
  });
});
