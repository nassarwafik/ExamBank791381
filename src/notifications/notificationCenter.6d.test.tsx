// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, waitFor, within } from "@testing-library/react";
import StudentPortal from "../StudentPortal";
import StudentShell from "../shell/StudentShell";
import type { NotificationItem } from "./notificationsClient";
import { notificationItemOf, countsOf } from "./notificationsClient";
import { presentNotification } from "./notificationPresentation";

// Phase 6D — the unified notification center in the real StudentPortal (server replies are canned / deferred): two
// badges from one server snapshot, event acknowledgement with server-fresh counts, routing of every event kind through
// the existing authorities, and stale-response ordering. The Reader is a stub (routing only is under test here).
vi.mock("../student/StudentReader", () => ({ default: (p: { courseId: string; allowedModuleIds: string[] }) => <div data-testid="reader">READER {p.courseId} {p.allowedModuleIds.join(",")}</div> }));

type Body = Record<string, unknown>;
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const counts = (messages: number, events: number, bell = messages + events, bellCapped = false): Body => ({
  ok: true,
  messages: { directUnread: { unread: messages, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: messages, totalCapped: false },
  events: { unread: events, capped: false }, bell: { unread: bell, capped: bellCapped }
});
const T0 = "2026-09-01T08:00:00.000Z";
const ev = (id: string, type: string, extra: Body = {}, unread = true): Body => ({ id: "s-9000000000" + id + "-aaaaaaaaaaaaaaaa", type, createdAt: T0, unread, ...extra });
const DIRECT = { id: "1800000000001-aaaaaaaaaaaaaaaa", type: "direct", senderDisplayName: "أ. خالد", preview: "راجع الواجب", createdAt: T0, unread: true };
const asg = (id: string, over: Body = {}) => ({ assignmentId: id, title: "واجب " + id, instructions: "", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", questionCount: 1, totalMarks: 10, durationMinutes: 0, availability: "open", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null, latestResult: null, dashboardState: "available", gradingStatus: "notSubmitted", createdAt: "", ...over });

let countsQueue: Array<Body | Promise<Body>>, centerQueue: Array<Body | Promise<Body>>, countsDefault: Body, centerDefault: Body;
let posts: Body[], markReply: (b: Body) => Body | Promise<Body>, gets: string[], materials: Body, assignments: Body[], feedPosts: Body[];
let onLogout: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  countsQueue = []; centerQueue = []; posts = []; gets = [];
  countsDefault = counts(0, 0); centerDefault = { ...counts(0, 0), items: [] };
  markReply = () => counts(0, 0);
  materials = { ok: true, materials: [{ courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }] }] };
  assignments = [asg("a1"), asg("a2", { availability: "scheduled", dashboardState: "scheduled", openAt: "2026-12-01T08:00:00.000Z" })];
  feedPosts = [{ postId: "p1", eventType: "medal", studentId: "u", studentDisplayName: "أحمد", assignmentTitle: "واجب", tier: "gold", createdAt: T0, isOwnPost: true, reactionCounts: {}, myReaction: null, teacherReaction: "clap", teacherNote: "" }];
  onLogout = vi.fn<() => void>();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    if (method === "GET") gets.push(url);
    if (url.includes("/api/student-dashboard")) return res(200, { student: { userId: "u", code: "C", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments, stats: { assigned: 2, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null } });
    if (url.includes("/api/student-notifications") && method === "POST") { const b = JSON.parse(String(init?.body)); posts.push(b); const r = await markReply(b); return res(r.__status ? Number(r.__status) : 200, r); }
    if (url.includes("/api/student-notifications?view=unread")) { const r = await (countsQueue.shift() || countsDefault); return res(r.__status ? Number(r.__status) : 200, r); }
    if (url.includes("/api/student-notifications")) { const r = await (centerQueue.shift() || centerDefault); return res(r.__status ? Number(r.__status) : 200, r); }
    if (url.includes("/api/student-messages")) { if (method === "POST") posts.push(JSON.parse(String(init?.body))); return res(200, url.includes("view=unread") ? { ok: true, directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false } : { ok: true, direct: [], announcements: [], classroom: null, canSend: true, readOnlyReason: "" }); }
    if (url.includes("/api/student-learning-materials")) return res(200, materials);
    if (url.includes("/api/student-assignment/")) return res(404, { ok: false, error: "الواجب غير متاح." });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: feedPosts });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const bell = () => screen.getByRole("button", { name: /^الإشعارات/ });
const bellCount = () => bell().querySelector(".eb-nav-badge")?.textContent || "";
const mailCount = () => screen.getByRole("button", { name: /الرسائل/ }).querySelector(".eb-nav-badge")?.firstChild?.textContent || "";
const panel = () => document.getElementById(bell().getAttribute("aria-controls") || "")!;
const itemButtons = () => within(panel()).queryAllByRole("button").filter(b => b.classList.contains("eb-notif-item"));
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
async function mount() {
  const view = render(<StudentPortal token="tok" displayName="أحمد" onLogout={onLogout} />);
  await screen.findByText(/مرحبًا أحمد/);
  await flush();
  return view;
}
async function openWith(items: Body[], c: Body) {
  centerQueue.push({ ...c, items });
  fireEvent.click(bell());
  await waitFor(() => expect(itemButtons().length).toBe(items.length));
}

describe("two badges, one server snapshot", () => {
  it("🔔 shows the UNIFIED total; ✉️ stays message-only", async () => {
    countsDefault = counts(2, 3);
    await mount();
    await waitFor(() => expect(bellCount()).toBe("5"));
    expect(mailCount()).toBe("2");
    expect(bell().getAttribute("aria-label")).toBe("الإشعارات، 5 غير مقروءة");
  });

  it("capped bell → 99+ (mail badge keeps its own count)", async () => {
    countsDefault = counts(4, 99, 99, true);
    await mount();
    await waitFor(() => expect(bellCount()).toBe("99+"));
    expect(mailCount()).toBe("4");
  });

  it("a malformed count reply never turns the bell into the message count (last-good kept)", async () => {
    countsDefault = counts(1, 2);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    await waitFor(() => expect(bellCount()).toBe("3"));
    countsQueue.push({ ok: true, totalUnread: 1, totalCapped: false });                       // 5D-shaped only: no bell
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await flush();
    expect(bellCount()).toBe("3");
    expect(mailCount()).toBe("1");
  });

  it("a 401 from the notification endpoint keeps last-good data and never logs out", async () => {
    countsDefault = counts(0, 2);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await mount();
    await waitFor(() => expect(bellCount()).toBe("2"));
    countsQueue.push({ __status: 401, ok: false });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await flush();
    expect(bellCount()).toBe("2");
    expect(onLogout).not.toHaveBeenCalled();
  });
});

describe("panel — every kind, and nothing marked by opening", () => {
  const ALL = [
    DIRECT,
    { id: "1800000000002-bbbbbbbbbbbbbbbb", type: "announcement", senderDisplayName: "أ. خالد", preview: "لا حصة غدًا", createdAt: T0, unread: false },
    ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "واجب الشبكات" }),
    ev("02", "assignment_deadline_extended", { assignmentId: "a1", assignmentTitle: "واجب الشبكات", dueAt: "2026-12-05T10:00:00.000Z" }),
    ev("03", "assignment_reopened", { assignmentId: "a1", assignmentTitle: "واجب الشبكات", dueAt: "" }),
    ev("04", "assignment_retry_granted", { assignmentId: "a1", assignmentTitle: "واجب الشبكات" }),
    ev("05", "attempt_time_extended", { assignmentId: "a1", assignmentTitle: "واجب الشبكات", attemptNumber: 1 }),
    ev("06", "learning_module_published", { courseId: "791381", courseTitle: "شبكات الاتصال", moduleId: "791381-m01", moduleTitle: "أساسيات الشبكات" }),
    ev("07", "assignment_reviewed", { assignmentId: "a1", assignmentTitle: "واجب الشبكات", becameFinal: true, scoreChanged: true, feedbackChanged: true, finalized: true, percentage: 80 }),
    ev("08", "teacher_reaction", { postId: "p1", reaction: "clap" }),
    ev("09", "teacher_note", { postId: "p1", notePreview: "أحسنت يا بطل" }, false)
  ];
  it("each kind: icon, Arabic title, preview, «جديد» only when unread; no internal ids; opening POSTs nothing", async () => {
    await mount();
    await openWith(ALL, counts(1, 8));
    const text = itemButtons().map(b => b.textContent || "");
    for (const t of ["رسالة جديدة من المعلم", "إعلان للصف", "واجب جديد", "تم تمديد موعد الواجب", "تمت إعادة فتح الواجب", "محاولة إضافية", "تم تمديد وقت محاولتك", "مادة تعليمية جديدة", "تم تصحيح واجبك", "تفاعل المعلم مع إنجازك 👏", "ملاحظة من المعلم"]) {
      expect(text.some(x => x.includes(t)), t).toBe(true);
    }
    expect(text.find(x => x.includes("مادة تعليمية جديدة"))).toContain("أساسيات الشبكات — شبكات الاتصال");
    expect(text.find(x => x.includes("تم تصحيح واجبك"))).toContain("النتيجة 80%");
    expect(text.find(x => x.includes("تم تصحيح واجبك"))).toContain("مع ملاحظة جديدة من المعلم");
    expect(text.find(x => x.includes("ملاحظة من المعلم"))).not.toContain("جديد");
    for (const b of itemButtons()) expect(b.querySelector(".eb-notif-icon svg")).toBeTruthy();
    expect(itemButtons().find(b => b.dataset.type === "learning_module_published")!.querySelector(".eb-notif-icon.is-material")).toBeTruthy();
    expect(panel().textContent).not.toMatch(/9000000000|s-|p1|791381-m01|a1\b/);
    // Opening, closing and reopening marked nothing.
    fireEvent.click(bell()); fireEvent.click(bell());
    await flush();
    expect(posts).toEqual([]);
  });

  it("keyboard: Escape closes and returns focus to the bell; items are real buttons", async () => {
    await mount();
    await openWith([ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "واجب" })], counts(0, 1));
    expect(itemButtons()[0].tagName).toBe("BUTTON");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bell().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(bell());
  });
});

describe("selecting an event", () => {
  it("acknowledges it server-side and applies the server's FRESH counts (not total − 1)", async () => {
    countsDefault = counts(1, 3);
    await mount();
    markReply = () => counts(1, 5);                                                            // two new events arrived meanwhile
    await openWith([ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "واجب" })], counts(1, 3));
    fireEvent.click(itemButtons()[0]);
    await waitFor(() => expect(posts).toEqual([{ action: "markEventRead", eventId: "s-900000000001-aaaaaaaaaaaaaaaa" }]));
    await waitFor(() => expect(bellCount()).toBe("6"));
    expect(mailCount()).toBe("1");
  });

  it("a READ event is not acknowledged again; a message never goes through markEventRead", async () => {
    await mount();
    await openWith([ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "واجب" }, false)], counts(0, 0));
    fireEvent.click(itemButtons()[0]);
    await flush();
    expect(posts.filter(p => p.action === "markEventRead")).toEqual([]);
    await openWith([DIRECT], counts(1, 0));
    fireEvent.click(itemButtons()[0]);
    await screen.findByRole("heading", { name: "الرسائل" }).catch(() => null);
    await flush();
    expect(posts.filter(p => p.action === "markEventRead")).toEqual([]);
  });

  it("assignment → opens it through /api/student-assignment (server authority)", async () => {
    await mount();
    await openWith([ev("01", "assignment_reviewed", { assignmentId: "a1", assignmentTitle: "واجب", becameFinal: true, scoreChanged: true, feedbackChanged: false, finalized: true, percentage: 70 })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    await waitFor(() => expect(gets.some(u => u === "/api/student-assignment/a1")).toBe(true));
  });

  it("scheduled assignment → a small notice + its card focused; never opened early", async () => {
    await mount();
    await openWith([ev("01", "assignment_published", { assignmentId: "a2", assignmentTitle: "واجب مجدول" })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    expect(await screen.findByText(/لم يُفتح هذا الواجب بعد/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe("eb-sp-task-a2"));
    expect(gets.some(u => u.includes("/api/student-assignment/"))).toBe(false);
  });

  it("an assignment no longer on the dashboard → «لم يعد متاحًا», nothing opened", async () => {
    await mount();
    await openWith([ev("01", "assignment_retry_granted", { assignmentId: "gone", assignmentTitle: "قديم" })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    expect(await screen.findByText("هذا الواجب لم يعد متاحًا.")).toBeTruthy();
    expect(gets.some(u => u.includes("/api/student-assignment/"))).toBe(false);
  });

  it("learning material → re-validated with /api/student-learning-materials, then the Reader opens on that course", async () => {
    await mount();
    const before = gets.filter(u => u.includes("/api/student-learning-materials")).length;
    await openWith([ev("01", "learning_module_published", { courseId: "791381", courseTitle: "شبكات الاتصال", moduleId: "791381-m01", moduleTitle: "أساسيات الشبكات" })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    expect((await screen.findByTestId("reader")).textContent).toContain("791381 791381-m01");
    expect(gets.filter(u => u.includes("/api/student-learning-materials")).length).toBe(before + 1);
  });

  it("a module hidden since the notification → «لم تعد هذه المادة متاحة», the Reader never opens", async () => {
    await mount();
    materials = { ok: true, materials: [] };
    await openWith([ev("01", "learning_module_published", { courseId: "791381", courseTitle: "شبكات الاتصال", moduleId: "791381-m01", moduleTitle: "أساسيات الشبكات" })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    expect(await screen.findByText("لم تعد هذه المادة متاحة.")).toBeTruthy();
    expect(screen.queryByTestId("reader")).toBeNull();
  });

  it("teacher reaction → the student's achievement post is focused and highlighted", async () => {
    await mount();
    await openWith([ev("01", "teacher_reaction", { postId: "p1", reaction: "clap" })], counts(0, 1));
    fireEvent.click(itemButtons()[0]);
    await waitFor(() => expect(document.activeElement?.id).toBe("eb-sp-post-p1"));
    expect(document.getElementById("eb-sp-post-p1")!.className).toContain("is-highlighted");
  });
});

describe("ordering / races (two-count model)", () => {
  it("an older counts poll resolving AFTER a newer acknowledgement never resurrects the old bell count", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    countsDefault = counts(0, 4);
    await mount();
    await waitFor(() => expect(bellCount()).toBe("4"));
    const slow = deferred<Body>();
    countsQueue.push(slow.promise);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });                   // poll starts (older)
    markReply = () => counts(0, 3);
    await openWith([ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "واجب" })], counts(0, 4));
    fireEvent.click(itemButtons()[0]);                                                          // newer acknowledgement
    await waitFor(() => expect(bellCount()).toBe("3"));
    await act(async () => { slow.resolve(counts(0, 4)); });
    await flush();
    expect(bellCount()).toBe("3");
  });

  it("a stale preview never replaces newer items; Messages-page counts update ✉️ but never overwrite 🔔", async () => {
    countsDefault = counts(2, 3);
    await mount();
    await waitFor(() => expect(bellCount()).toBe("5"));
    // Stale vs newer preview.
    const older = deferred<Body>();
    centerQueue.push(older.promise, { ...counts(2, 3), items: [ev("02", "assignment_published", { assignmentId: "a1", assignmentTitle: "الأحدث" })] });
    fireEvent.click(bell()); fireEvent.click(bell()); fireEvent.click(bell());
    await waitFor(() => expect(itemButtons().map(b => b.textContent).join()).toContain("الأحدث"));
    await act(async () => { older.resolve({ ...counts(9, 9), items: [ev("01", "assignment_published", { assignmentId: "a1", assignmentTitle: "القديم" })] }); });
    await flush();
    expect(itemButtons().map(b => b.textContent).join()).not.toContain("القديم");
    expect(bellCount()).toBe("5");
    fireEvent.keyDown(document, { key: "Escape" });
    // The Messages page reads the student's message counts (0 now); on return the bell is re-read from the server —
    // until then it shows its last SERVER total, never the message count.
    const back = deferred<Body>();
    countsQueue.push(back.promise);
    fireEvent.click(screen.getByRole("button", { name: /الرسائل/ }));
    const backButton = await screen.findByRole("button", { name: /رجوع|العودة/ });
    fireEvent.click(backButton);
    await screen.findByText(/مرحبًا أحمد/);
    await flush();
    expect(mailCount()).toBe("");                                                               // ✉️: 0 from the Messages page
    expect(bellCount()).toBe("5");                                                              // 🔔: last server total, not 0
    await act(async () => { back.resolve(counts(0, 3)); });
    await waitFor(() => expect(bellCount()).toBe("3"));
  });
});

describe("client parsing + presentation units", () => {
  it("drops malformed items, keeps only routing fields; counts require the unified shape", () => {
    expect(notificationItemOf({ id: "x", type: "assignment_published" })).toBeNull();          // no assignment id
    expect(notificationItemOf({ id: "x", type: "teacher_reaction", postId: "p", reaction: "evil" })).toBeNull();
    expect(notificationItemOf({ id: "x", type: "bogus" })).toBeNull();
    expect(notificationItemOf({ id: "x", type: "teacher_note", postId: "p", notePreview: "n", studentId: "leak" })).toEqual({ id: "x", type: "teacher_note", postId: "p", notePreview: "n", createdAt: "", unread: false });
    expect(countsOf({ ok: true, totalUnread: 3 })).toBeNull();
    expect(countsOf(counts(1, 2))!.bell).toEqual({ total: 3, capped: false });
  });
  it("review presentation: feedback-only vs graded", () => {
    const base = { id: "i", createdAt: T0, unread: true, type: "assignment_reviewed", assignmentId: "a", assignmentTitle: "و", finalized: true, percentage: 90 } as const;
    expect(presentNotification({ ...base, becameFinal: false, scoreChanged: false, feedbackChanged: true } as NotificationItem).title).toBe("لديك ملاحظة جديدة من المعلم");
    expect(presentNotification({ ...base, becameFinal: true, scoreChanged: false, feedbackChanged: false } as NotificationItem).title).toBe("تم تصحيح واجبك");
  });
  it("StudentShell: the bell uses its own counts, the mail entry its own", () => {
    render(<StudentShell studentName="أحمد" onLogout={() => {}} onOpenMessages={() => {}} messagesUnread={{ total: 1, capped: false }} notifications={{ items: [], counts: { bell: { total: 7, capped: false }, messages: { total: 1, capped: false }, events: { total: 6, capped: false } }, loading: false, error: "", onSelect: () => {}, onOpenMessages: () => {} }}><p>x</p></StudentShell>);
    expect(bellCount()).toBe("7");
    expect(mailCount()).toBe("1");
  });
});
