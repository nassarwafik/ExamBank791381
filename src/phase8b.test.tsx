// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 8B — UI polish, activity limits & student communication. Focused regression tests for the six parts:
//   A. student achievements: newest 10 first, «عرض المزيد» reveals the next 10 already loaded (no re-fetch), a silent
//      refresh never collapses what the student expanded, and a teacher-recognition notification for a post beyond the
//      first 10 still reaches (renders, focuses, highlights) that post;
//   B. activity (سجل النشاط): more than 30 records → exactly the newest 30 are shown, newest first;
//   C. teacher page titles: every destination carries its sidebar icon, decorative, the <h1> name unchanged;
//   D. student messages: direct + announcements + unread callbacks unchanged inside the new card layout;
//   E. projects: both roots own a symmetric logical gutter (never flush with the sidebar or the screen edge);
//   F. unified filter controls: one scoped rule set, native select appearance kept, visible focus.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, act, waitFor, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import AchievementFeed from "./student/AchievementFeed";
import { FEED_PAGE, visiblePostCount } from "./student/achievementFeedPaging";
import AuditHistoryPanel from "./AuditHistoryPanel";
import { AUDIT_VISIBLE_LIMIT, newestAuditEvents, type AuditEvent } from "./auditLog";
import TeacherAppShell from "./shell/TeacherAppShell";
import { NAV_LABELS, type TeacherNavId, type TeacherNavState } from "./shell/teacherNav";
import StudentMessagesPage from "./messages/StudentMessagesPage";
import type { MessageView, StudentMessagesClient, StudentUnread } from "./messages/messagesClient";
import StudentPortal from "./StudentPortal";
import type { FeedPost } from "./achievements";

vi.mock("./student/StudentReader", () => ({ default: () => <div data-testid="reader">READER</div> }));

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const norm = (s: string) => s.replace(/\s+/g, "");
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const flush = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

// ---------------------------------------------------------------------------------------------------------------
// A. Achievements
const NOW = Date.parse("2026-09-20T10:00:00.000Z");
/** n posts, newest first (server order): p1 is the newest. */
function makePosts(n: number, prefix = "p"): FeedPost[] {
  return Array.from({ length: n }, (_, i) => ({
    postId: prefix + (i + 1), eventType: "medal", studentId: "s" + i, studentDisplayName: "طالب " + (i + 1), assignmentTitle: "واجب " + (i + 1),
    tier: "gold", createdAt: new Date(NOW - (i + 1) * 3600000).toISOString(), isOwnPost: false, reactionCounts: { heart: 0, clap: 0, cheer: 0, fire: 0 },
    myReaction: null, teacherReaction: null, teacherNote: ""
  }) as unknown as FeedPost);
}
const feedIds = () => Array.from(document.querySelectorAll(".eb-sp-feed-list article")).map(a => a.getAttribute("data-post-id"));
const moreButton = () => screen.queryByRole("button", { name: "عرض المزيد" });
function Feed({ posts, highlight }: { posts: FeedPost[]; highlight?: string }) {
  return <AchievementFeed posts={posts} error="" shareOn shareSaving={false} now={NOW} onToggleShare={() => {}} onReact={() => {}} highlightPostId={highlight} />;
}

describe("8B-A achievements — newest 10 + «عرض المزيد»", () => {
  it("shows the newest 10 first, in server order, with a «عرض المزيد» button", () => {
    render(<Feed posts={makePosts(25)} />);
    expect(FEED_PAGE).toBe(10);
    expect(feedIds()).toEqual(makePosts(10).map(p => p.postId));
    expect(moreButton()).toBeTruthy();
    expect(screen.getByText("يُعرض 10 من 25")).toBeTruthy();
  });
  it("each click reveals the next batch already loaded (no fetch), order unchanged; the button disappears at the end", () => {
    const fetchSpy = vi.fn(); globalThis.fetch = fetchSpy as unknown as typeof fetch;
    render(<Feed posts={makePosts(25)} />);
    fireEvent.click(moreButton()!);
    expect(feedIds()).toEqual(makePosts(20).map(p => p.postId));
    fireEvent.click(moreButton()!);
    expect(feedIds()).toEqual(makePosts(25).map(p => p.postId));
    expect(moreButton()).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("keyboard focus moves to the first newly revealed post", () => {
    render(<Feed posts={makePosts(25)} />);
    fireEvent.click(moreButton()!);
    expect(document.activeElement?.id).toBe("eb-sp-post-p11");
  });
  it("no «عرض المزيد» with 10 or fewer posts", () => {
    const { rerender } = render(<Feed posts={makePosts(10)} />);
    expect(feedIds()).toHaveLength(10);
    expect(moreButton()).toBeNull();
    rerender(<Feed posts={makePosts(3)} />);
    expect(feedIds()).toHaveLength(3);
    expect(moreButton()).toBeNull();
  });
  it("a silent refresh (a new posts array, a new post on top) keeps what the student expanded", () => {
    const { rerender } = render(<Feed posts={makePosts(25)} />);
    fireEvent.click(moreButton()!);
    expect(feedIds()).toHaveLength(20);
    const refreshed = [...makePosts(1, "new"), ...makePosts(25)];
    rerender(<Feed posts={refreshed} />);
    expect(feedIds()).toHaveLength(20);
    expect(feedIds()[0]).toBe("new1");                                        // newest first still
  });
  it("a highlighted post beyond the first 10 is rendered in the same render, and stays revealed after the highlight clears", () => {
    const posts = makePosts(25);
    const { rerender } = render(<Feed posts={posts} />);
    rerender(<Feed posts={posts} highlight="p23" />);
    expect(document.getElementById("eb-sp-post-p23")).toBeTruthy();
    expect(document.getElementById("eb-sp-post-p23")!.className).toContain("is-highlighted");
    expect(feedIds()).toHaveLength(25);
    rerender(<Feed posts={posts} />);
    expect(feedIds()).toHaveLength(25);
  });
  it("visiblePostCount widens (never narrows) to the page holding the highlighted post", () => {
    expect(visiblePostCount(25, 10, -1)).toBe(10);
    expect(visiblePostCount(25, 10, 9)).toBe(10);
    expect(visiblePostCount(25, 10, 10)).toBe(20);
    expect(visiblePostCount(25, 20, 3)).toBe(20);
    expect(visiblePostCount(25, 10, 22)).toBe(25);
    expect(visiblePostCount(4, 10, -1)).toBe(4);
  });
});

// A (portal): real StudentPortal — routing + silent refresh.
const counts = (events: number) => ({ ok: true, messages: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false }, events: { unread: events, capped: false }, bell: { unread: events, capped: false } });
function installPortalFetch(feed: () => FeedPost[], center: () => unknown) {
  const gets: string[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    if (method === "GET") gets.push(url);
    if (url.includes("/api/student-dashboard")) return res(200, { student: { userId: "u", code: "C", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null } });
    if (url.includes("/api/student-notifications") && method === "POST") return res(200, counts(0));
    if (url.includes("/api/student-notifications?view=unread")) return res(200, counts(1));
    if (url.includes("/api/student-notifications")) return res(200, center());
    if (url.includes("/api/student-messages")) return res(200, { ok: true, directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: feed() });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  return gets;
}
describe("8B-A achievements in the real portal", () => {
  beforeEach(() => { (window as unknown as { scrollTo: () => void }).scrollTo = () => {}; });
  it("a teacher-recognition notification for a post beyond the first 10 reaches it (rendered, focused, highlighted)", async () => {
    const posts = makePosts(25);
    const item = { id: "s-90000000001-aaaaaaaaaaaaaaaa", type: "teacher_reaction", postId: "p18", reaction: "clap", createdAt: "2026-09-01T08:00:00.000Z", unread: true };
    installPortalFetch(() => posts, () => ({ ...counts(1), items: [item] }));
    render(<StudentPortal token="tok" displayName="أحمد" onLogout={() => {}} />);
    await screen.findByText(/مرحبًا أحمد/);
    await flush();
    expect(document.getElementById("eb-sp-post-p18")).toBeNull();                   // outside the first 10
    const bell = screen.getByRole("button", { name: /^الإشعارات/ });
    fireEvent.click(bell);
    const panel = document.getElementById(bell.getAttribute("aria-controls") || "")!;
    const entry = await waitFor(() => { const b = within(panel).queryAllByRole("button").find(x => x.classList.contains("eb-notif-item")); if (!b) throw new Error("no item"); return b; });
    fireEvent.click(entry);
    await waitFor(() => expect(document.activeElement?.id).toBe("eb-sp-post-p18"));
    expect(document.getElementById("eb-sp-post-p18")!.className).toContain("is-highlighted");
  });
  it("the 15 s silent refresh re-reads the feed but never collapses an expanded list", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let posts = makePosts(25);
    const gets = installPortalFetch(() => posts, () => ({ ...counts(0), items: [] }));
    render(<StudentPortal token="tok" displayName="أحمد" onLogout={() => {}} />);
    await screen.findByText(/مرحبًا أحمد/);
    await flush();
    fireEvent.click(await screen.findByRole("button", { name: "عرض المزيد" }));
    expect(feedIds()).toHaveLength(20);
    const feedReads = gets.filter(u => u.includes("/api/achievement-feed")).length;
    posts = [...makePosts(1, "fresh"), ...makePosts(25)];
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await flush();
    expect(gets.filter(u => u.includes("/api/achievement-feed")).length).toBeGreaterThan(feedReads);
    await waitFor(() => expect(feedIds()[0]).toBe("fresh1"));
    expect(feedIds()).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// B. Activity — newest 30
const auditEvent = (i: number): AuditEvent => ({ eventId: "e" + i, timestamp: new Date(Date.parse("2026-01-01T00:00:00.000Z") + i * 3600000).toISOString(), actor: "t", action: "class.create", targetType: "class", targetId: "c" + i, targetLabel: "صف رقم " + i, details: {} }) as AuditEvent;
describe("8B-B activity — the newest 30 records", () => {
  it("newestAuditEvents: >30 records in any order → exactly the newest 30, newest first; input untouched", () => {
    const all = Array.from({ length: 47 }, (_, i) => auditEvent(i + 1));
    const shuffled = [...all].sort((a, b) => ((Number(a.eventId.slice(1)) * 7919) % 47) - ((Number(b.eventId.slice(1)) * 7919) % 47));
    const before = shuffled.map(e => e.eventId);
    const out = newestAuditEvents(shuffled);
    expect(AUDIT_VISIBLE_LIMIT).toBe(30);
    expect(out).toHaveLength(30);
    expect(out.map(e => e.eventId)).toEqual(Array.from({ length: 30 }, (_, i) => "e" + (47 - i)));
    expect(shuffled.map(e => e.eventId)).toEqual(before);
  });
  // Paging fixture: `n` events in SERVER order (newest first). Odd ids are student archives, even ids class creations;
  // every label is unique ("سجل-007") so a search hits exactly one record.
  const pad = (i: number) => String(i).padStart(3, "0");
  const mixedEvent = (i: number): AuditEvent => ({ eventId: "e" + i, timestamp: new Date(Date.parse("2026-01-01T00:00:00.000Z") + i * 3600000).toISOString(), actor: "t",
    action: i % 2 ? "student.archive" : "class.create", targetType: i % 2 ? "student" : "class", targetId: "t" + i, targetLabel: "سجل-" + pad(i), details: {} }) as AuditEvent;
  const serverWindow = (newest: number, n = 100) => Array.from({ length: n }, (_, k) => mixedEvent(newest - k));
  function auditServer(initial: AuditEvent[]) {
    let events = initial;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => { calls.push(String(input)); return res(200, { ok: true, events, count: events.length, limit: 100 }); }) as unknown as typeof fetch;
    return { calls, set: (next: AuditEvent[]) => { events = next; } };
  }
  const rowLabels = (c: HTMLElement) => Array.from(c.querySelectorAll(".audit-history-table tbody tr")).map(r => r.children[3].textContent);
  /** The expected newest-first labels among `ids` (descending), first `k`. */
  const newestLabels = (ids: number[], k: number) => [...ids].sort((a, b) => b - a).slice(0, k).map(i => "سجل-" + pad(i));
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);
  const more = () => screen.queryByRole("button", { name: "عرض المزيد" });
  const note = () => screen.queryByRole("note")?.textContent;

  it("100 loaded → 30 newest; «عرض المزيد» 30 → 60 → 90 → 100 from the loaded data (no fetch), newest-first at every step, focus on the first new row", async () => {
    const srv = auditServer(serverWindow(100));
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("سجل-100");
    const all = range(1, 100);
    expect(rowLabels(container)).toEqual(newestLabels(all, 30));
    expect(note()).toBe("يُعرض أحدث 30 من 100 سجلًا مطابقًا.");
    for (const [shown, firstNew] of [[60, 70], [90, 40], [100, 10]] as const) {
      fireEvent.click(more()!);
      expect(rowLabels(container)).toEqual(newestLabels(all, shown));
      const focused = document.activeElement as HTMLElement;
      expect(focused.tagName).toBe("TR");
      expect(focused.children[3].textContent).toBe("سجل-" + pad(firstNew));
      if (shown < 100) expect(note()).toBe("يُعرض أحدث " + shown + " من 100 سجلًا مطابقًا.");
    }
    expect(more()).toBeNull();                                                                       // everything visible
    expect(note()).toBeUndefined();
    expect(srv.calls).toEqual(["/api/audit-history?limit=100"]);                                     // the ONE bounded request
  });
  it("search / action / type filters reset the window to 30", async () => {
    auditServer(serverWindow(100));
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("سجل-100");
    fireEvent.click(more()!);
    expect(rowLabels(container)).toHaveLength(60);
    // type filter → the 50 student records, newest 30 first
    fireEvent.change(screen.getByLabelText("تصفية حسب النوع"), { target: { value: "student" } });
    const odd = range(1, 100).filter(i => i % 2);
    expect(rowLabels(container)).toEqual(newestLabels(odd, 30));
    expect(note()).toBe("يُعرض أحدث 30 من 50 سجلًا مطابقًا.");
    fireEvent.click(more()!);
    expect(rowLabels(container)).toEqual(newestLabels(odd, 50));
    expect(more()).toBeNull();
    // action filter → reset again
    fireEvent.change(screen.getByLabelText("تصفية حسب النوع"), { target: { value: "" } });
    expect(rowLabels(container)).toHaveLength(30);
    fireEvent.click(more()!);
    fireEvent.change(screen.getByLabelText("تصفية حسب العملية"), { target: { value: "class.create" } });
    expect(rowLabels(container)).toEqual(newestLabels(range(1, 100).filter(i => i % 2 === 0), 30));
    // search → reset again
    fireEvent.change(screen.getByLabelText("تصفية حسب العملية"), { target: { value: "" } });
    fireEvent.click(more()!);
    expect(rowLabels(container)).toHaveLength(60);
    fireEvent.change(screen.getByLabelText("ابحث في سجل النشاط"), { target: { value: "سجل-0" } });   // 1..99 match
    expect(rowLabels(container)).toEqual(newestLabels(range(1, 99), 30));
  });
  it("searching for an older record (beyond the first 30) finds it without a fetch", async () => {
    const srv = auditServer(serverWindow(100));
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("سجل-100");
    expect(screen.queryByText("سجل-007")).toBeNull();
    fireEvent.change(screen.getByLabelText("ابحث في سجل النشاط"), { target: { value: "سجل-007" } });
    expect(rowLabels(container)).toEqual(["سجل-007"]);
    expect(more()).toBeNull();
    expect(srv.calls).toHaveLength(1);
  });
  it("a reload keeps the expansion but always shows the NEWEST records first (never older instead of newer)", async () => {
    const srv = auditServer(serverWindow(100));
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("سجل-100");
    fireEvent.click(more()!);
    srv.set(serverWindow(105));                                                                      // 5 newer events arrived
    fireEvent.click(screen.getByRole("button", { name: /تحديث/ }));
    await screen.findByText("سجل-105");
    expect(rowLabels(container)).toEqual(newestLabels(range(6, 105), 60));
    expect(srv.calls).toHaveLength(2);
  });
  it("30 or fewer records → all shown, no truncation note and no «عرض المزيد»", async () => {
    auditServer(serverWindow(30, 30));
    const { container } = render(<AuditHistoryPanel token="t" />);
    await screen.findByText("سجل-030");
    expect(rowLabels(container)).toEqual(newestLabels(range(1, 30), 30));
    expect(note()).toBeUndefined();
    expect(more()).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// C. Teacher page-title icons
const NAV_STATE: Record<TeacherNavId, Partial<TeacherNavState>> = {
  dashboard: { teacherView: "platform", workspaceTab: "dashboard" }, students: { teacherView: "platform", workspaceTab: "students" },
  assignments: { teacherView: "platform", workspaceTab: "assignments" }, audit: { teacherView: "platform", workspaceTab: "audit" },
  learning: { teacherView: "learning" }, messages: { teacherView: "messages" }, projects: { teacherView: "project" }, reports: { teacherView: "reports" },
  games: { teacherView: "games" }, bank: { teacherView: "bank" }, builder: { teacherView: "builder" }, import: { teacherView: "import" }
};
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
describe("8B-C every teacher page title carries its sidebar icon", () => {
  const state = (over: Partial<TeacherNavState>): TeacherNavState => ({ teacherView: "platform", workspaceTab: "dashboard", projectCode: "", projectList: [], ...over });
  it("each destination: h1 text/name unchanged, one decorative svg icon identical to its sidebar icon, no emoji", () => {
    const svgs = new Set<string>();
    for (const id of Object.keys(NAV_STATE) as TeacherNavId[]) {
      const { unmount } = render(<TeacherAppShell nav={state(NAV_STATE[id])} projectReadyTotal={0} displayName="م" onNavigate={() => {}} onLogout={() => {}}><p>x</p></TeacherAppShell>);
      const h1 = screen.getByRole("heading", { level: 1, name: NAV_LABELS[id] });              // accessible name = the text only
      expect(h1.textContent, id).toBe(NAV_LABELS[id]);
      const icons = h1.querySelectorAll(".eb-page-header-icon");
      expect(icons, id).toHaveLength(1);
      expect(icons[0].getAttribute("aria-hidden"), id).toBe("true");
      const svg = icons[0].querySelector("svg")!;
      expect(svg, id).toBeTruthy();
      expect(EMOJI.test(h1.textContent || ""), id).toBe(false);
      // the SAME icon as the destination's sidebar entry
      const navButton = screen.getAllByRole("button").find(b => b.getAttribute("aria-current") === "page") || null;
      if (navButton) expect(navButton.querySelector("svg")?.innerHTML, id).toBe(svg.innerHTML);
      svgs.add(svg.innerHTML);
      unmount();
    }
    expect(svgs.size).toBeGreaterThanOrEqual(10);                                            // distinct icons per destination
  });
  it("the icon mapping is the ONE central ICONS table (no per-page conditional chain)", () => {
    const src = read("./shell/TeacherAppShell.tsx");
    expect(src).toMatch(/function pageIcon\(id: TeacherNavId\)[\s\S]*ICONS\[id\]/);
    expect(src).not.toMatch(/active === "dashboard" \?/);
    const ui = read("./ui/ui.css");
    expect(norm(ui)).toContain(".eb-page-header-icon{display:inline-flex;");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// D. Student messages
const U = (d: number, a: number): StudentUnread => ({ directUnread: { unread: d, capped: false }, announcementUnread: { unread: a, capped: false }, totalUnread: d + a, totalCapped: false });
let msgSeq = 0;
// Real id format (13-digit ms prefix) so the unchanged 5D read-acknowledgement logic applies.
const msg = (id: string, body: string, senderRole: "teacher" | "student"): MessageView => ({ messageId: String(1800000000000 + ++msgSeq) + "-" + id.padEnd(16, "b"), body, senderRole, senderDisplayName: senderRole === "teacher" ? "أ. أحمد" : "سارة", createdAt: "2026-09-01T08:00:0" + id.slice(-1) + ".000Z" }) as MessageView;
describe("8B-D student messages — new card layout, same behaviour", () => {
  it("direct + announcements render inside one card; tabs/tabpanel/thread/composer semantics and unread callbacks unchanged", async () => {
    const onUnread = vi.fn();
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: [msg("m1", "مرحبا", "teacher"), msg("m2", "أهلًا أستاذ", "student")], announcements: [msg("a1", "اختبار الأحد", "teacher")], classroom: { classId: "c1", name: "الحادي عشر", archived: false }, canSend: true, readOnlyReason: "" })),
      sendDirect: vi.fn(async (body: string) => msg("m3", body, "student")),
      getUnread: vi.fn(async () => U(1, 2)),
      markRead: vi.fn(async (stream: string) => (stream === "direct" ? U(0, 2) : U(0, 0)))
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} onUnreadChange={onUnread} />);
    const list = await screen.findByRole("list", { name: "المحادثة مع المعلم" });
    const card = document.querySelector(".eb-msg-student-card") as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.contains(list)).toBe(true);
    expect(within(card).getByRole("tablist", { name: "أقسام الرسائل" })).toBeTruthy();
    expect(within(card).getByRole("tabpanel")).toBeTruthy();
    expect(list.getAttribute("tabindex")).toBeNull();                                 // still not a follow/scroll region
    expect(document.querySelector(".eb-msg-workspace")).toBeNull();
    // bubbles: the student's own vs the teacher's, sender as visible text
    const items = within(list).getAllByRole("listitem");
    expect(items[0].className).toContain("is-theirs"); expect(items[1].className).toContain("is-mine");
    expect(items[1].textContent).toContain("أنت");
    // the composer is the card footer, still a labelled textarea + submit
    const foot = card.querySelector(".eb-msg-student-foot") as HTMLElement;
    expect(within(foot).getByLabelText("رسالتك إلى المعلم")).toBeTruthy();
    // unread: the direct stream is acknowledged on open (unchanged 5D rule) and the callback gets the server counts
    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith("direct", expect.anything()));
    await waitFor(() => expect(onUnread).toHaveBeenLastCalledWith(U(0, 2)));
    expect(client.markRead).not.toHaveBeenCalledWith("announcements", expect.anything());
    // announcements tab: read-only thread + note, then acknowledged only once selected
    fireEvent.click(screen.getByRole("tab", { name: /إعلانات الصف/ }));
    expect(await screen.findByRole("list", { name: "إعلانات الصف" })).toBeTruthy();
    expect(screen.getByText("اختبار الأحد")).toBeTruthy();
    expect(screen.queryByLabelText("رسالتك إلى المعلم")).toBeNull();
    await waitFor(() => expect(client.markRead).toHaveBeenCalledWith("announcements", expect.anything()));
    await waitFor(() => expect(onUnread).toHaveBeenLastCalledWith(U(0, 0)));
  });
  it("sending a reply still works from the card footer", async () => {
    const client: StudentMessagesClient = {
      load: vi.fn(async () => ({ direct: [msg("m1", "مرحبا", "teacher")], announcements: [], classroom: { classId: "c1", name: "ص", archived: false }, canSend: true, readOnlyReason: "" })),
      sendDirect: vi.fn(async (body: string) => msg("m9", body, "student")), getUnread: vi.fn(async () => U(0, 0)), markRead: vi.fn(async () => U(0, 0))
    };
    render(<StudentMessagesPage token="t" onBack={() => {}} client={client} />);
    fireEvent.change(await screen.findByLabelText("رسالتك إلى المعلم"), { target: { value: "شكرًا" } });
    fireEvent.click(screen.getByRole("button", { name: "إرسال" }));
    await waitFor(() => expect(client.sendDirect).toHaveBeenCalledWith("شكرًا"));
    expect(await screen.findByText("شكرًا")).toBeTruthy();
  });
  it("the card styles are scoped to the student view, logical properties only, token colours", () => {
    const css = read("./messages/messages.css");
    const block = css.slice(css.indexOf("Phase 8B — student messages"), css.indexOf("Phase 5D — unread indicators"));
    expect(block).toContain(".eb-msg-student-card{");
    expect(block).not.toMatch(/(?:margin|padding)-(?:left|right)\s*:|#[0-9a-fA-F]{3,6}\b/);
    expect(block).not.toContain(".eb-msg-workspace");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// E. Projects gutter + F. unified controls (CSS is stubbed under Vitest → structural source assertions)
describe("8B-E projects never sit flush with the sidebar or the screen edge", () => {
  it("hub + workspace: one grouped symmetric logical gutter at every width, widened at 768px; shell wrapper stays padding-free", () => {
    const css = norm(read("./projects-pro.css"));
    expect(css).toContain(".eb-projects-hub,.eb-project-workspace{box-sizing:border-box;min-width:0;padding-inline:var(--eb-space-4);");
    expect(css).toContain("@media(min-width:768px){.eb-projects-hub,.eb-project-workspace{padding-inline:var(--eb-space-5);}}");
    expect(css).not.toMatch(/padding-inline-start:|margin-(?:left|right):|padding-(?:left|right):/);
    expect(norm(read("./shell.css"))).toContain(norm(".eb-shell-content{flex:1 1 auto;min-width:0;}"));
  });
  it("the project roots are the components' top-level wrappers (the gutter reaches hub, workspace and every opened view)", () => {
    expect(read("./projects/ProjectHub.tsx")).toMatch(/<section className="eb-projects-hub"/);
    expect(read("./projects/ProjectTracker.tsx")).toMatch(/<section className="eb-project-workspace">/);
  });
});

describe("8B-F unified filter controls", () => {
  const ui = read("./ui/ui.css");
  const block = ui.slice(ui.lastIndexOf("/*", ui.indexOf("Phase 8B — unified filter")));
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");                                          // declarations only (no comments)
  it("one scoped rule set covers the dashboard / reports / projects / bank / roster / audit / messages selectors and the search boxes", () => {
    for (const sel of [".eb-dash-field", ".eb-report-filter-row", ".eb-project-class-field", ".eb-bank-filter", ".eb-field-inline", ".eb-source-select", ".eb-msg-field", "select.student-status-select", ".eb-search-field"]) expect(block, sel).toContain(sel);
    expect(norm(block)).toContain("min-height:40px;");
    expect(norm(block)).toContain("min-height:44px;");
    expect(norm(block)).toContain("select:focus-visible,");
    expect(norm(block)).toContain("outline:var(--eb-focus-ring);outline-offset:var(--eb-focus-offset);");
  });
  it("keeps the native select appearance (mobile pickers), uses tokens only, logical properties only", () => {
    expect(rules).not.toMatch(/appearance\s*:/);
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,6}\b|rgba?\(/);
    expect(rules).not.toMatch(/(?:margin|padding)-(?:left|right)\s*:|!important/);
  });
  it("the activity page's search box now uses the same control (icon + borderless input inside the bordered box)", () => {
    expect(read("./AuditHistoryPanel.tsx")).toMatch(/className="student-search-field eb-search-field">\s*<IconSearch/);
  });
});
