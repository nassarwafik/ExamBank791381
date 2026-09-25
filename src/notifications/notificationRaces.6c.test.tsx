// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, waitFor, within } from "@testing-library/react";
import StudentPortal from "../StudentPortal";

// Phase 6C — race conditions around the notification center inside the real StudentPortal. Every server response is a
// deferred promise the test resolves in a chosen order; a stale response must never resurrect old items or an old count.

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
type Body = Record<string, unknown>;
type Reply = Body | Promise<Body>;
const res = (body: Body) => ({ status: body.__status ? Number(body.__status) : 200, ok: !body.__status, json: async () => body }) as Response;
const summary = (total: number) => ({ ok: true, directUnread: { unread: total, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: total, totalCapped: false });
const item = (id: string, preview: string, unread = true) => ({ id: "18000000000" + id + "-aaaaaaaaaaaaaaaa", type: "direct", senderDisplayName: "أ. أحمد", preview, createdAt: "2026-09-01T08:00:00.000Z", unread });
const notifications = (total: number, previews: string[]) => ({ ...summary(total), items: previews.map((p, i) => item(String(10 + i), p)) });

let unreadQueue: Reply[], notifQueue: Reply[], unreadDefault: Body, notifDefault: Body;
let marks: Body[];
const tokenOf = (init?: RequestInit) => ((init?.headers || {}) as Record<string, string>)["x-student-token"] || "";
let requests: Array<{ url: string; token: string }>;

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  unreadQueue = []; notifQueue = []; marks = []; requests = [];
  unreadDefault = summary(0); notifDefault = notifications(0, []);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    requests.push({ url, token: tokenOf(init) });
    if (url.includes("/api/student-dashboard")) {
      const name = tokenOf(init) === "tok-B" ? "بسمة" : "أحمد";
      return res({ student: { userId: "u", code: "C", displayName: name, classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: null, assignments: [], stats: { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null } });
    }
    // The queues belong to the FIRST session (tok-A); a second session (tok-B) always gets the defaults.
    const first = tokenOf(init) !== "tok-B";
    if (url.includes("view=unread")) return res(await ((first && unreadQueue.shift()) || unreadDefault));
    if (url.includes("view=notifications")) return res(await ((first && notifQueue.shift()) || notifDefault));
    if (url.includes("/api/student-messages") && method === "POST") { const b = JSON.parse(String(init?.body)); marks.push(b); return res({ ...summary(0), stream: b.stream, unread: 0, capped: false }); }
    if (url.includes("/api/student-messages")) return res({ ok: true, direct: [{ messageId: "1800000000010-aaaaaaaaaaaaaaaa", kind: "direct", senderRole: "teacher", senderDisplayName: "أ. أحمد", body: "د", createdAt: "" }], announcements: [], classroom: null, canSend: true, readOnlyReason: "" });
    if (url.includes("/api/achievement-feed")) return res({ ok: true, posts: [] });
    return res({ __status: 404, ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const bell = () => screen.getByRole("button", { name: /^الإشعارات/ });
const bellCount = () => bell().querySelector(".eb-nav-badge")?.textContent || "";
const panel = () => document.getElementById(bell().getAttribute("aria-controls") || "")!;
const previews = () => within(panel()).queryAllByRole("button").filter(b => b.classList.contains("eb-notif-item")).map(b => b.querySelector(".eb-notif-preview")?.textContent);
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
async function mount(token = "tok-A") {
  const view = render(<StudentPortal token={token} displayName="أحمد" onLogout={() => {}} />);
  await screen.findByText(/مرحبًا أحمد/);
  await flush();
  return view;
}

describe("notification center — stale responses never win", () => {
  it("a stale preview (older request) resolving AFTER a newer one never resurrects old items or an old count", async () => {
    await mount();
    const older = deferred<Body>(), newer = deferred<Body>();
    notifQueue.push(older.promise, newer.promise);
    fireEvent.click(bell());                                      // request 1 (older)
    fireEvent.click(bell());                                      // close
    fireEvent.click(bell());                                      // request 2 (newer)
    await act(async () => { newer.resolve(notifications(1, ["الجديدة"])); });
    await waitFor(() => expect(previews()).toEqual(["الجديدة"]));
    expect(bellCount()).toBe("1");
    await act(async () => { older.resolve(notifications(9, ["القديمة"])); });
    await flush();
    expect(previews()).toEqual(["الجديدة"]);
    expect(bellCount()).toBe("1");
  });

  it("unread poll vs preview out of order: an older badge poll resolving last never overwrites the newer preview's count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    const poll = deferred<Body>(), preview = deferred<Body>();
    unreadQueue.push(poll.promise);
    notifQueue.push(preview.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });   // badge poll starts (panel closed)
    fireEvent.click(bell());                                                // preview starts LATER
    await act(async () => { preview.resolve(notifications(1, ["م"])); });
    await waitFor(() => expect(bellCount()).toBe("1"));
    await act(async () => { poll.resolve(summary(5)); });                   // older poll resolves last
    await flush();
    expect(bellCount()).toBe("1");
  });

  it("…and the reverse: a newer badge poll wins over an older preview's count (the preview's items still apply)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    const preview = deferred<Body>(), poll = deferred<Body>();
    notifQueue.push(preview.promise);
    unreadQueue.push(poll.promise);
    fireEvent.click(bell());                                                // preview starts first
    fireEvent.click(bell());                                                // closed → the next tick is a badge poll
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await act(async () => { poll.resolve(summary(2)); });
    await waitFor(() => expect(bellCount()).toBe("2"));
    await act(async () => { preview.resolve(notifications(7, ["أ", "ب"])); });
    await flush();
    expect(bellCount()).toBe("2");
    fireEvent.click(bell());
    expect(previews()).toEqual(["أ", "ب"]);
  });

  it("opening and closing the panel during a request: no error, the result is kept for the next open, nothing is marked", async () => {
    await mount();
    const d = deferred<Body>();
    notifQueue.push(d.promise);
    fireEvent.click(bell());
    expect(within(panel()).getByRole("status").textContent).toBe("جارٍ تحميل الإشعارات...");
    fireEvent.click(bell());
    await act(async () => { d.resolve(notifications(2, ["س", "ص"])); });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    const next = deferred<Body>();
    notifQueue.push(next.promise);
    fireEvent.click(bell());
    expect(previews()).toEqual(["س", "ص"]);                                // last-good shown while refreshing
    expect(within(panel()).getByText("جارٍ تحديث الإشعارات...")).toBeTruthy();
    await act(async () => { next.resolve(notifications(2, ["س", "ص"])); });
    expect(marks).toEqual([]);
  });

  it("navigating into Student Messages while a preview is in flight: the stale preview never restores the pre-read count or items", async () => {
    await mount();
    const d = deferred<Body>();
    notifQueue.push(d.promise);
    unreadDefault = summary(0);
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole("button", { name: "فتح الرسائل" }));
    await screen.findByRole("heading", { name: "الرسائل" });
    await waitFor(() => expect(marks).toHaveLength(1));                       // the page's own acknowledgement
    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    await act(async () => { d.resolve(notifications(3, ["قبل القراءة"])); });   // resolves after the student read everything
    await flush();
    expect(bellCount()).toBe("");
    const fresh = deferred<Body>();
    notifQueue.push(fresh.promise);
    fireEvent.click(bell());
    expect(previews()).toEqual([]);                                          // no resurrected pre-read items…
    expect(within(panel()).getByRole("status").textContent).toBe("جارٍ تحميل الإشعارات...");
    await act(async () => { fresh.resolve({ ...notifications(0, []), items: [item("20", "قبل القراءة", false)] }); });
    await waitFor(() => expect(previews()).toEqual(["قبل القراءة"]));          // …only the fresh, read state
  });

  it("a preview that resolves while Student Messages is open is dropped on return (the page's counts own the badge)", async () => {
    await mount();
    const d = deferred<Body>();
    notifQueue.push(d.promise);
    fireEvent.click(bell());
    fireEvent.click(within(panel()).getByRole("button", { name: "فتح الرسائل" }));
    await screen.findByRole("heading", { name: "الرسائل" });
    await waitFor(() => expect(marks).toHaveLength(1));
    await act(async () => { d.resolve(notifications(4, ["قديمة"])); });
    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    await flush();
    expect(bellCount()).toBe("");
    notifQueue.push(deferred<Body>().promise);
    fireEvent.click(bell());
    expect(previews()).toEqual([]);
  });

  it("session change while a request is in flight: the previous student's count and items never appear", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = await mount("tok-A");
    const a = deferred<Body>(), aPoll = deferred<Body>();
    unreadQueue.push(aPoll.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });   // A's badge poll in flight
    notifQueue.push(a.promise);
    fireEvent.click(bell());                                                // A's preview in flight
    expect(requests.filter(r => r.token === "tok-A" && /view=(unread|notifications)/.test(r.url)).length).toBeGreaterThanOrEqual(3);
    view.rerender(<StudentPortal token="tok-B" displayName="بسمة" onLogout={() => {}} />);   // same component, new session
    await screen.findByText(/مرحبًا بسمة/);
    await flush();
    await act(async () => { a.resolve(notifications(7, ["رسالة أحمد"])); aPoll.resolve(summary(7)); });
    await flush();
    expect(bellCount()).toBe("");
    notifQueue.push(deferred<Body>().promise);
    if (bell().getAttribute("aria-expanded") !== "true") fireEvent.click(bell());
    expect(previews()).toEqual([]);
    expect(screen.queryByText("رسالة أحمد")).toBeNull();
  });

  it("logout (unmount) with requests in flight: late responses are ignored without errors", async () => {
    const view = await mount();
    const d = deferred<Body>();
    notifQueue.push(d.promise);
    fireEvent.click(bell());
    const errors = vi.spyOn(console, "error");
    view.unmount();
    await act(async () => { d.resolve(notifications(3, ["x"])); });
    expect(errors).not.toHaveBeenCalled();
  });
});
