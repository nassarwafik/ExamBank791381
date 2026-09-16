// @vitest-environment happy-dom
// UX-7a — Student Portal: mobile-first, task-first home on the shared primitives. Behavioural coverage of the
// task ordering, the aria-pressed filters, the finalized-only medals, the personal rank (>= 10 finalized, never a
// leaderboard), the finalized-only average ring, the avatar Dialog, the share toggle, reactions and the request
// counts (every write maps to one explicit action; browsing costs nothing).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import StudentPortal from "./StudentPortal";
import type { FeedPost } from "./achievements";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

const asg = (id: string, over: Record<string, unknown>) => ({
  assignmentId: id, title: id, instructions: "تعليمات", openAt: "", dueAt: "2026-05-01T10:30:00.000Z", effectiveDueAt: "",
  questionCount: 4, totalMarks: 100, durationMinutes: 0, availability: "open", attemptsUsed: 1, allowedAttempts: 3,
  canAttempt: true, attemptStatus: "submitted", hasActiveAttempt: false, latestScore: null, latestPercentage: null,
  latestResult: null, createdAt: "", ...over
});
const finalLR = (pct: number) => ({ attemptNumber: 1, score: pct, totalMarks: 100, percentage: pct, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" });
const pendingLR = (pct: number) => ({ attemptNumber: 1, score: pct, totalMarks: 100, percentage: pct, submittedAt: "2026-03-01T10:00:00.000Z", manualReviewMarks: 10, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "" });
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const baseStats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const post = (over: Partial<FeedPost>): FeedPost => ({ postId: "p1", studentDisplayName: "ليان", assignmentTitle: "واجب 1", tier: "gold", createdAt: new Date().toISOString(), isOwnPost: false, reactionCounts: { heart: 0, clap: 0, cheer: 0, fire: 0 }, myReaction: null, teacherReaction: null, teacherNote: "", ...over });

type Calls = { url: string; method: string; body: unknown }[];
function mount(dashboard: Record<string, unknown>, opts: { posts?: FeedPost[]; profile?: (body: any) => unknown; react?: (body: any) => unknown; dashboardStatus?: number } = {}) {
  const calls: Calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-dashboard")) return res(opts.dashboardStatus || 200, opts.dashboardStatus && opts.dashboardStatus !== 200 ? { ok: false, error: "خطأ في الخادم" } : dashboard);
    if (url.includes("/api/achievement-feed") && method === "GET") return res(200, { ok: true, posts: opts.posts || [] });
    if (url.includes("/api/achievement-feed") && method === "POST") return res(200, opts.react ? opts.react(body) : { ok: true, reactionCounts: { heart: 1, clap: 0, cheer: 0, fire: 0 }, myReaction: body.reaction });
    if (url.includes("/api/student-profile")) return res(200, opts.profile ? opts.profile(body) : (body.action === "setAvatar" ? { ok: true, avatarId: body.avatarId } : { ok: true, shareAchievements: body.share }));
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { ...utils, calls, onLogout };
}
const titles = () => Array.from(document.querySelectorAll(".student-assignment-card .eb-sp-task-title")).map(h => h.textContent);
const gets = (calls: Calls) => calls.filter(c => c.method === "GET").map(c => c.url.replace(/\?.*$/, ""));
const posts = (calls: Calls) => calls.filter(c => c.method === "POST");

describe("UX-7a StudentPortal — task-first home", () => {
  it("orders the tasks by what needs action now (inProgress, available, awaitingReview, scheduled, completed, closed) and keeps the server order inside a group", async () => {
    mount({ student, classroom, assignments: [
      asg("CO", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(84) }),
      asg("CL", { dashboardState: "closedUnsubmitted", availability: "closed" }),
      asg("AR", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR(60) }),
      asg("SC", { dashboardState: "scheduled", availability: "scheduled" }),
      asg("AV2", { dashboardState: "available", gradingStatus: "notSubmitted", attemptStatus: "notStarted" }),
      asg("IP", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "started" }),
      asg("AV1", { dashboardState: "available", gradingStatus: "notSubmitted", attemptStatus: "notStarted" })
    ], stats: { ...baseStats, assigned: 7 } });
    await screen.findByText("IP");
    expect(titles()).toEqual(["IP", "AV2", "AV1", "AR", "SC", "CO", "CL"]);
    // the identity card still precedes the task list (shell contract) and the tasks are one labelled section
    const html = document.body.innerHTML;
    expect(html.indexOf("student-welcome-card")).toBeLessThan(html.indexOf("student-assignment-list"));
    expect(screen.getByRole("region", { name: /المهام والواجبات/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /المهام والواجبات/ }).textContent).toContain("7");
    // every card carries a tonal status badge with the server label and exactly one action button
    const sc = screen.getByText("SC").closest(".student-assignment-card") as HTMLElement;
    expect(within(sc).getByText("قريبًا").className).toContain("eb-badge");
    expect((within(sc).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(within(sc).getByRole("button").textContent).toBe("لم يفتح بعد");
    // ISO / Western-digit due date
    expect(within(sc).getByText(/التسليم: 2026-05-01 \d\d:30/)).toBeTruthy();
  });

  it("filters are aria-pressed chips in one labelled group (no tablist) and browsing costs no request", async () => {
    const { calls } = mount({ student, classroom, assignments: [
      asg("AV", { dashboardState: "available" }), asg("CO", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(84) })
    ], stats: { ...baseStats, assigned: 2, finalized: 1, averageFinalized: 84 } });
    await screen.findByText("AV");
    const group = screen.getByRole("group", { name: "تصفية المهام" });
    expect(screen.queryByRole("tablist")).toBeNull();
    const all = within(group).getByRole("button", { name: "الكل" });
    expect(all.getAttribute("aria-pressed")).toBe("true");
    const before = calls.length;
    fireEvent.click(within(group).getByRole("button", { name: "مكتملة" }));
    expect(within(group).getByRole("button", { name: "مكتملة" }).getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
    expect(titles()).toEqual(["CO"]);
    fireEvent.click(within(group).getByRole("button", { name: "قيد الحل" }));
    expect(titles()).toEqual([]);
    expect(screen.getByText("لا توجد مهام في هذا التصنيف")).toBeTruthy();
    expect(calls.length).toBe(before);
  });

  it("issues exactly one dashboard GET, one feed GET and the project panel's GET on mount — and no POST", async () => {
    const { calls, onLogout } = mount({ student, classroom, assignments: [], stats: baseStats });
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(gets(calls).length).toBe(3));
    expect(gets(calls).sort()).toEqual(["/api/achievement-feed", "/api/student-dashboard", "/api/student-project-tracker"]);
    expect(posts(calls)).toEqual([]);
    expect(onLogout).not.toHaveBeenCalled();
    // the empty state keeps the list container (shell contract) and uses the shared EmptyState
    expect(document.querySelector(".student-assignment-list .eb-empty")).toBeTruthy();
    expect(screen.getByText("لا توجد مهام منشورة الآن")).toBeTruthy();
  });

  it("shows a loading status, then an alert (never a logout) when the dashboard fails with a server error", async () => {
    const { onLogout } = mount({}, { dashboardStatus: 500 });
    expect(screen.getByRole("status").textContent).toContain("جارٍ تحميل حسابك");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("خطأ في الخادم");
    expect(onLogout).not.toHaveBeenCalled();
    expect(screen.queryByText(/مرحبًا/)).toBeNull();
  });
});

describe("UX-7a StudentPortal — identity, medals, average ring and personal rank", () => {
  it("medals count ONLY final results (a provisional 95% earns nothing; a bare latestPercentage earns nothing)", async () => {
    mount({ student, classroom, assignments: [
      asg("F95", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(95), latestPercentage: 95 }),
      asg("P95", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR(95), latestPercentage: 95 }),
      asg("F75", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(75), latestPercentage: 75 }),
      asg("L99", { latestScore: 99, latestPercentage: 99 }),                                             // legacy payload: no result object → no medal
      asg("F60", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(60), latestPercentage: 60 })
    ], stats: { ...baseStats, assigned: 5, finalized: 3, pendingReview: 1, averageFinalized: 76.7 } });
    const list = await screen.findByRole("list", { name: "ميدالياتك" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map(li => li.textContent)).toEqual(["×11 ميدالية ذهبية", "×11 ميدالية برونزية"]);   // visible ×n + hidden label; no silver
    expect(list.querySelector(".eb-sp-medal.is-gold")).toBeTruthy();
    expect(list.querySelector(".eb-sp-medal.is-silver")).toBeNull();
  });

  it("the average ring is the finalized-only average from the server stats (progressbar), and an explicit empty figure when there is none", async () => {
    const { unmount } = mount({ student, classroom, assignments: [asg("A", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR(100) })], stats: { ...baseStats, assigned: 1, completed: 1, average: 100, pendingReview: 1, averageFinalized: null } });
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.queryByRole("progressbar", { name: "المعدل النهائي" })).toBeNull();         // the 100 legacy average is never shown
    expect(screen.getByRole("img", { name: /المعدل النهائي: لا يوجد معدل نهائي بعد/ })).toBeTruthy();
    expect(screen.queryByText("100%")).toBeNull();
    unmount();
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 2, finalized: 2, averageFinalized: 84 } });
    await screen.findByText(/مرحبًا أحمد/);
    const ring = screen.getByRole("progressbar", { name: "المعدل النهائي" });
    expect(ring.getAttribute("aria-valuenow")).toBe("84");
    expect((screen.getByText("المعدل النهائي").closest("article") as HTMLElement).textContent).toContain("84%");
    expect(screen.getByText("من الواجبات النهائية فقط")).toBeTruthy();
  });

  it("no rank before 10 finalized assignments: shows the progression instead (pending results never count)", async () => {
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 20, finalized: 9, pendingReview: 6, averageFinalized: 95 } });
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.queryByText(/الرتبة:/)).toBeNull();
    const bar = screen.getByRole("progressbar", { name: "الطريق إلى رتبتك" });
    expect(bar.getAttribute("aria-valuenow")).toBe("90");
    expect(screen.getByText("9 من 10 واجبات نهائية لفتح الرتبة")).toBeTruthy();
    expect(document.querySelector(".eb-sp-avatar-frame")?.className).not.toMatch(/is-rank-/);
  });

  it("at 10+ finalized the personal rank badge and avatar frame appear, from the finalized average only; nothing compares students", async () => {
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 14, finalized: 10, pendingReview: 4, average: 40, averageFinalized: 91.2 } });
    await screen.findByText(/مرحبًا أحمد/);
    expect(screen.getByText(/الرتبة: متفوّق/).className).toContain("eb-badge");
    expect(document.querySelector(".eb-sp-avatar-frame.is-rank-gold")).toBeTruthy();
    expect(screen.queryByRole("progressbar", { name: "الطريق إلى رتبتك" })).toBeNull();
    expect(screen.getByRole("progressbar", { name: "المعدل النهائي" }).getAttribute("aria-valuenow")).toBe("91");
    expect(document.body.textContent).not.toMatch(/ترتيب|المركز|leaderboard/i);
  });

  it("the avatar opens the shared Dialog; picking posts setAvatar once, closes and updates the avatar; Escape / إغلاق cost no request", async () => {
    const { calls } = mount({ student, classroom, assignments: [], stats: baseStats });
    await screen.findByText(/مرحبًا أحمد/);
    const opener = screen.getByRole("button", { name: /تغيير الأيقونة/ });
    expect(opener.getAttribute("aria-label")).toBe("تغيير الأيقونة (الحالية: ثعلب)");
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "اختر أيقونتك" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const grid = within(dialog).getByRole("group", { name: "الأيقونات المتاحة" });
    expect(within(grid).getAllByRole("button").length).toBe(12);
    expect(within(grid).getByRole("button", { name: "ثعلب" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(grid).getByRole("button", { name: "قطة" }).getAttribute("aria-pressed")).toBe("false");
    const before = calls.length;
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls.length).toBe(before);
    expect(document.activeElement).toBe(opener);                                     // focus returns to the opener
    fireEvent.click(opener);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "قطة" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts(calls)).toEqual([{ url: "/api/student-profile", method: "POST", body: { action: "setAvatar", avatarId: "a2" } }]);
    expect(screen.getByRole("button", { name: "تغيير الأيقونة (الحالية: قطة)" })).toBeTruthy();
    expect(gets(calls).length).toBe(3);                                                // no re-read after the write
  });

  it("the share toggle is a real checkbox that posts setShareAchievements once per change", async () => {
    const { calls } = mount({ student, classroom, assignments: [], stats: baseStats });
    await screen.findByText(/مرحبًا أحمد/);
    const box = screen.getByRole("checkbox", { name: "شارك إنجازاتي مع الصف" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(box.checked).toBe(false));
    expect(posts(calls)).toEqual([{ url: "/api/student-profile", method: "POST", body: { action: "setShareAchievements", share: false } }]);
  });
});

describe("UX-7a StudentPortal — achievement feed", () => {
  it("marks recent posts جديد, the student's own post إنجازك (reactions disabled), surfaces the teacher's reaction and note", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mount({ student, classroom, assignments: [], stats: baseStats }, { posts: [
      post({ postId: "p1", createdAt: new Date().toISOString(), teacherReaction: "cheer", teacherNote: "أحسنت يا ليان", reactionCounts: { heart: 2, clap: 0, cheer: 0, fire: 0 }, myReaction: "heart" }),
      post({ postId: "p2", studentDisplayName: "أحمد", assignmentTitle: "واجب 2", tier: "bronze", createdAt: old, isOwnPost: true })
    ] });
    const feedTitle = await screen.findByText("إنجازات الصف");
    expect(feedTitle.tagName).toBe("H2");
    const items = screen.getAllByRole("article").filter(a => a.className.includes("eb-sp-feed-item"));
    expect(items.length).toBe(2);
    const [p1, p2] = items;
    expect(within(p1).getByText("جديد").className).toContain("eb-badge");
    expect(within(p1).queryByText("إنجازك")).toBeNull();
    expect(within(p1).getByText(/مبروك من المعلم/)).toBeTruthy();
    expect(within(p1).getByText("كلمة من المعلم: أحسنت يا ليان")).toBeTruthy();
    const reactions = within(p1).getByRole("group", { name: "ردود الفعل" });
    const heart = within(reactions).getByRole("button", { name: /أحببته/ });
    expect(heart.getAttribute("aria-pressed")).toBe("true");
    expect(heart.textContent).toContain("2");
    expect(within(reactions).getByRole("button", { name: /أحسنت/ }).getAttribute("aria-pressed")).toBe("false");
    expect(within(p2).queryByText("جديد")).toBeNull();
    expect(within(p2).getByText("إنجازك")).toBeTruthy();
    expect(p2.className).toContain("is-own");
    for (const b of within(p2).getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(p1.querySelector(".eb-sp-medal-icon.is-gold")).toBeTruthy();
    expect(p2.querySelector(".eb-sp-medal-icon.is-bronze")).toBeTruthy();
  });

  it("reacting posts once and applies the server counts / myReaction without re-reading the feed", async () => {
    const { calls } = mount({ student, classroom, assignments: [], stats: baseStats }, { posts: [post({})], react: body => ({ ok: true, reactionCounts: { heart: 0, clap: 3, cheer: 0, fire: 0 }, myReaction: body.reaction }) });
    await screen.findByText("إنجازات الصف");
    const clap = screen.getByRole("button", { name: /أحسنت/ });
    fireEvent.click(clap);
    await waitFor(() => expect(clap.getAttribute("aria-pressed")).toBe("true"));
    expect(clap.textContent).toContain("3");
    expect(posts(calls)).toEqual([{ url: "/api/achievement-feed", method: "POST", body: { action: "react", postId: "p1", reaction: "clap" } }]);
    expect(gets(calls).filter(u => u === "/api/achievement-feed").length).toBe(1);
  });

  it("feed 401 keeps the session (shared EmptyState, no alert, no logout)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const calls: Calls = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, method: init?.method || "GET", body: null });
      if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats: baseStats });
      if (url.includes("/api/achievement-feed")) return res(401, { ok: false });
      return res(200, { ok: true, enrolled: false });
    }) as unknown as typeof fetch;
    const onLogout = vi.fn();
    render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
    expect(await screen.findByText("لا توجد إنجازات بعد")).toBeTruthy();
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onLogout).not.toHaveBeenCalled();
  });
});

describe("UX-7a source guards", () => {
  const sources = import.meta.glob("./{StudentPortal,student/StudentIdentityCard,student/StudentAssignmentCard,student/AchievementFeed,student/AvatarPickerDialog}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const presentation = import.meta.glob("./{student/portalPresentation,studentRank}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("the portal files carry no emoji glyphs, no ad-hoc tablist, no locale digit formatting and no inline medal colours", () => {
    expect(Object.keys(sources).length).toBe(5);
    for (const [file, src] of Object.entries(sources)) {
      expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(src), file + " must not carry emoji glyphs (reactions/avatars come from their content modules)").toBe(false);
      expect(src, file).not.toMatch(/role="tab(list)?"/);
      expect(src, file).not.toMatch(/toLocaleString\(/);
      expect(src, file).not.toMatch(/MEDAL_COLORS/);
      expect(src, file).not.toMatch(/outline\s*:\s*none/);
    }
  });
  it("grading is never inferred from a score, medals are finalized-only and the rank reads only finalized stats", () => {
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");   // code only, not the module comments
    const pres = strip(presentation["./student/portalPresentation.ts"]), rank = strip(presentation["./studentRank.ts"]);
    expect(pres).toContain("resolveGradingStatus(item.latestResult || null)");
    expect(pres).not.toMatch(/medalTier\(\s*(item|a)\.latestPercentage/);
    expect(pres).toMatch(/gradingOf\(item\) !== "final"\) continue/);
    expect(rank).toContain("RANK_MIN_FINALIZED = 10");
    expect(rank).not.toMatch(/pendingReview|latestPercentage|score|assignments/);
    expect(rank).not.toMatch(/sort\(|leaderboard|classmates/i);
    for (const src of Object.values(sources)) expect(src).not.toMatch(/latestScore\s*[>!=<]/);
  });
  it("the portal keeps the single session authority and reuses the shared primitives", () => {
    const portal = sources["./StudentPortal.tsx"];
    expect(portal.match(/onLogout\(\)/g)?.length).toBe(4);                     // dashboard, avatar, share, open — never the feed
    expect(portal).toMatch(/"\/api\/achievement-feed"[\s\S]*?if \(r\.status === 401\) \{ setFeedError\(""\); return; \}/);
    expect(portal).toContain('from "./ui/StatCard"'); expect(portal).toContain('from "./ui/SectionHeader"'); expect(portal).toContain('from "./ui/EmptyState"');
    expect(sources["./student/AvatarPickerDialog.tsx"]).toContain('from "../ui/Dialog"');
    expect(sources["./student/StudentIdentityCard.tsx"]).toContain('from "../ui/ProgressRing"');
    expect(sources["./student/StudentAssignmentCard.tsx"]).toContain('from "../ui/StatusBadge"');
  });
});
