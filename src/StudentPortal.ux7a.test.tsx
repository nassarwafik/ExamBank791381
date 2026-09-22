// @vitest-environment happy-dom
// UX-7a — Student Portal & Dashboard: mobile-first, actionable-first home on the shared primitives. Behavioural
// coverage of the section hierarchy, the "what should I do now" semantics, the task ordering, the aria-pressed
// filters, the finalized-only medals, the 25-stage Strength path (server stage, never a leaderboard), the finalized-only
// average ring, the read-only project section, the avatar Dialog, the share toggle, reactions and the request
// counts (every write maps to one explicit action; browsing costs nothing).
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import StudentPortal from "./StudentPortal";
import type { FeedPost } from "./achievements";
import { stageVisual } from "./studentStageVisuals";

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
function mount(dashboard: Record<string, unknown>, opts: { posts?: FeedPost[]; profile?: (body: any) => unknown; react?: (body: any) => unknown; dashboardStatus?: number; tracker?: unknown } = {}) {
  const calls: Calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-dashboard")) return res(opts.dashboardStatus || 200, opts.dashboardStatus && opts.dashboardStatus !== 200 ? { ok: false, error: "خطأ في الخادم" } : dashboard);
    if (url.includes("/api/achievement-feed") && method === "GET") return res(200, { ok: true, posts: opts.posts || [] });
    if (url.includes("/api/achievement-feed") && method === "POST") return res(200, opts.react ? opts.react(body) : { ok: true, reactionCounts: { heart: 1, clap: 0, cheer: 0, fire: 0 }, myReaction: body.reaction });
    if (url.includes("/api/student-profile")) return res(200, opts.profile ? opts.profile(body) : (body.action === "setAvatar" ? { ok: true, avatarId: body.avatarId } : { ok: true, shareAchievements: body.share }));
    if (url.includes("/api/student-project-tracker")) return res(200, opts.tracker || { ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [] });   // Class Learning Materials: optional panel, one GET
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { ...utils, calls, onLogout };
}
const titles = () => Array.from(document.querySelectorAll(".student-assignment-card .eb-sp-task-title")).map(h => h.textContent);
const list = async () => within(await screen.findByRole("region", { name: /المهام والواجبات/ }));
const nowSection = async () => within(await screen.findByRole("region", { name: /ماذا عليّ أن أفعل الآن؟/ }));
const PROJECT = {
  ok: true, enrolled: true, className: "الصف",
  projects: [{
    projectCode: "794589", title: "مشروع الكتاب",
    tracks: [{ trackId: "book", title: "الكتاب", icon: "📘" }, { trackId: "pt", title: "التدريب العملي", icon: "🛠️" }],
    summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 64.4, trackProgress: { book: 80, pt: 48.8 }, counts: { not_started: 1, in_progress: 1, ready_for_review: 0, approved: 1 }, readyForReviewCount: 0, complete: false },
    stages: [
      { stageId: "B01", track: "book", groupId: "g1", title: "قراءة الفصل الأول", order: 1 },
      { stageId: "B02", track: "book", groupId: "g1", title: "تلخيص الفصل", order: 2 },
      { stageId: "P01", track: "pt", groupId: "g2", title: "تجربة أولى", order: 1 }
    ],
    groups: [{ groupId: "g1", track: "book", title: "المرحلة الأولى", order: 1 }, { groupId: "g2", track: "pt", title: "الورشة", order: 1 }],
    progress: { B01: { status: "approved", note: "أحسنت" }, B02: { status: "in_progress" } },
    nextStages: { book: { stageId: "B02", track: "book", groupId: "g1", title: "تلخيص الفصل", order: 2 }, pt: null }
  }]
};
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
    await list();
    expect(titles()).toEqual(["IP", "AV2", "AV1", "AR", "SC", "CO", "CL"]);
    // the identity card still precedes the task list (shell contract) and the tasks are one labelled section
    const html = document.body.innerHTML;
    expect(html.indexOf("student-welcome-card")).toBeLessThan(html.indexOf("student-assignment-list"));
    expect(screen.getByRole("region", { name: /المهام والواجبات/ })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /المهام والواجبات/ }).textContent).toContain("7");
    // the primary section lists ONLY the actionable ones (live attempt first, then open), the scheduled one as upcoming with no action
    const now = await nowSection();
    expect(Array.from(now.getAllByRole("heading", { level: 3 })).map(h => h.textContent)).toEqual(["IP", "AV2", "AV1", "قريبًا"]);
    expect(now.getAllByRole("button").map(b => b.textContent)).toEqual(["متابعة المحاولة", "ابدأ الحل", "ابدأ الحل"]);
    expect(now.getByRole("list", { name: "واجبات لم تفتح بعد" }).textContent).toContain("SC");
    expect(now.queryByText("AR")).toBeNull(); expect(now.queryByText("CO")).toBeNull(); expect(now.queryByText("CL")).toBeNull();
    // every card carries a tonal status badge with the server label and exactly one action button
    const sc = (await list()).getByText("SC").closest(".student-assignment-card") as HTMLElement;
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
    await list();
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

  it("issues exactly one dashboard GET, one feed GET, the project panel's GET and the learning-materials GET on mount — and no POST", async () => {
    const { calls, onLogout } = mount({ student, classroom, assignments: [], stats: baseStats });
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(gets(calls).length).toBe(4));
    expect(gets(calls).sort()).toEqual(["/api/achievement-feed", "/api/student-dashboard", "/api/student-learning-materials", "/api/student-project-tracker"]);
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

describe("UX-7a StudentPortal — hierarchy and the primary section", () => {
  it("renders exactly the seven sections in order under the shell's single h1: identity → now → learning materials → progress → assignments → projects → achievements", async () => {
    mount({ student, classroom, assignments: [asg("AV", { dashboardState: "available" })], stats: { ...baseStats, assigned: 1 } }, { tracker: PROJECT, posts: [post({})] });
    await screen.findByRole("region", { name: "مشاريعي" });
    expect(document.querySelectorAll("h1").length).toBe(1);                                         // the shell's brand title only
    expect(document.querySelector(".eb-sp h1")).toBeNull();
    const h2s = Array.from(document.querySelectorAll(".eb-sp h2")).map(h => h.textContent?.replace(/\d+$/, "").trim());
    expect(h2s).toEqual(["مرحبًا أحمد", "ماذا عليّ أن أفعل الآن؟", "موادي التعليمية", "تقدّمي وقوتي", "المهام والواجبات", "مشاريعي", "إنجازات الصف"]);   // «تقدّمي» became the Achievement Hub «تقدّمي وقوتي»
    expect(screen.getByLabelText(/مرحبًا أحمد/).textContent).toContain("الصف · 11 · 2026");          // identity: class · grade · school year
    expect(screen.getByLabelText(/مرحبًا أحمد/).textContent).toContain("C1");
    expect(document.querySelector(".platform-hero, .student-next-panel")).toBeNull();                 // no hero, no marketing card
  });

  it("the primary section: available → ابدأ الحل, live attempt → متابعة المحاولة (even when canAttempt is false), scheduled → date and no action, pending / final never listed", async () => {
    mount({ student, classroom, assignments: [
      asg("OPEN", { dashboardState: "available", attemptStatus: "notStarted", attemptsUsed: 0 }),
      asg("LIVE", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "started", canAttempt: false }),
      asg("SOON", { dashboardState: "scheduled", availability: "scheduled", openAt: "2026-06-01T06:00:00.000Z" }),
      asg("WAIT", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: pendingLR(90) }),
      asg("DONE", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(90) })
    ], stats: { ...baseStats, assigned: 5, finalized: 1, pendingReview: 1, inProgress: 1, averageFinalized: 90 } });
    const now = await nowSection();
    expect(screen.getByRole("heading", { level: 2, name: /ماذا عليّ أن أفعل الآن؟/ }).textContent).toContain("2");
    const live = now.getByText("LIVE").closest("li") as HTMLElement;
    expect(within(live).getByRole("button").textContent).toBe("متابعة المحاولة");
    expect((within(live).getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    expect(within(live).getByText("قيد الحل").className).toContain("eb-badge");
    const open = now.getByText("OPEN").closest("li") as HTMLElement;
    expect(within(open).getByRole("button").textContent).toBe("ابدأ الحل");
    expect(within(open).getByText(/المحاولات: 0\/3/)).toBeTruthy();
    const soon = now.getByText("SOON").closest("li") as HTMLElement;
    expect(within(soon).queryByRole("button")).toBeNull();
    expect(within(soon).getByText(/يفتح في 2026-06-01 \d\d:00/)).toBeTruthy();
    expect(now.queryByText("WAIT")).toBeNull(); expect(now.queryByText("DONE")).toBeNull();
    expect(now.queryByText(/90/)).toBeNull();                                                          // no score in the action section
  });

  it("the primary section falls back to a calm EmptyState when nothing is actionable, and opening from it is the same navigation request as from a card", async () => {
    const { calls } = mount({ student, classroom, assignments: [asg("DONE", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(80) })], stats: { ...baseStats, assigned: 1, finalized: 1, averageFinalized: 80 } });
    const now = await nowSection();
    expect(now.getByText("لا يوجد ما يتطلب إجراءً الآن").className).toContain("eb-empty-title");
    expect(now.queryByRole("list")).toBeNull();
    // The project panel issues its own GET from an effect that runs in a scheduler task AFTER the commit that shows
    // the "now" section; on a loaded runner that task can land after this test resumes, so a count captured here
    // would be one short and "+1" could never match (Quality Gate run 375: expected 4 to be 3). Settle the three
    // mount GETs pinned above ("issues exactly one dashboard GET, one feed GET, the project panel's GET and the
    // learning-materials GET") first.
    await waitFor(() => expect(gets(calls).length).toBe(4));
    const before = calls.length;
    fireEvent.click((await list()).getByRole("button", { name: "النتيجة / محاولة جديدة" }));
    await waitFor(() => expect(calls.length).toBe(before + 1));
    expect(calls[calls.length - 1]).toMatchObject({ url: "/api/student-assignment/DONE", method: "GET" });   // unchanged exam/result navigation
  });
});

describe("UX-7a StudentPortal — projects (read-only, presentation on the shared primitives)", () => {
  it("shows the server's progress values unchanged, the next stage, stage rows with tonal badges and the teacher note — from the single tracker read", async () => {
    const { calls } = mount({ student, classroom, assignments: [], stats: baseStats }, { tracker: PROJECT });
    const sectionEl = await screen.findByRole("region", { name: "مشاريعي" });
    const region = within(sectionEl);
    expect(region.getByRole("progressbar", { name: "التقدم العام" }).getAttribute("aria-valuenow")).toBe("64");
    expect(region.getByText("64%")).toBeTruthy();
    const tracks = within(region.getByRole("list", { name: "تقدم المسارات" }));
    expect(tracks.getByRole("progressbar", { name: "الكتاب" }).getAttribute("aria-valuenow")).toBe("80");
    expect(tracks.getByRole("progressbar", { name: "التدريب العملي" }).getAttribute("aria-valuenow")).toBe("49");
    expect(region.getByText(/الخطوة التالية في الكتاب:/).textContent).toContain("B02 — تلخيص الفصل");
    const b01 = region.getByText("B01").closest("li") as HTMLElement;
    expect(within(b01).getByText("تم الاعتماد").className).toContain("eb-badge");
    expect(within(b01).getByText("ملاحظة من المعلم: أحسنت")).toBeTruthy();
    expect(b01.className).toContain("is-approved");
    const b02 = region.getByText("B02").closest("li") as HTMLElement;
    expect(within(b02).getByText("قيد التنفيذ")).toBeTruthy();
    expect(region.getByRole("heading", { level: 3, name: "المرحلة الأولى" })).toBeTruthy();
    expect(region.queryByText("P01")).toBeNull();                                                    // other track not shown until switched
    expect(gets(calls).filter(u => u === "/api/student-project-tracker").length).toBe(1);
    expect(posts(calls)).toEqual([]);
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(sectionEl.textContent || "")).toBe(false);   // track icons (emoji content) are not rendered
  });

  it("switching tracks is an aria-pressed group (no tablist) and costs no request; a tracker 401 hides the section without ending the session", async () => {
    const { calls, onLogout, unmount } = mount({ student, classroom, assignments: [], stats: baseStats }, { tracker: PROJECT });
    const region = within(await screen.findByRole("region", { name: "مشاريعي" }));
    expect(region.queryByRole("tablist")).toBeNull();
    const group = within(region.getByRole("group", { name: "مسارات المشروع" }));
    expect(group.getByRole("button", { name: "الكتاب" }).getAttribute("aria-pressed")).toBe("true");
    const before = calls.length;
    fireEvent.click(group.getByRole("button", { name: "التدريب العملي" }));
    expect(group.getByRole("button", { name: "التدريب العملي" }).getAttribute("aria-pressed")).toBe("true");
    expect(region.getByText("P01")).toBeTruthy();
    expect(region.queryByText("B01")).toBeNull();
    expect(region.queryByText(/الخطوة التالية/)).toBeNull();                                          // nextStages.pt is null → nothing invented
    expect(calls.length).toBe(before);
    expect(onLogout).not.toHaveBeenCalled();
    unmount();
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [], stats: baseStats });
      if (url.includes("/api/student-project-tracker")) return res(401, { ok: false });
      return res(200, { ok: true, posts: [] });
    }) as unknown as typeof fetch;
    const logout = vi.fn();
    render(<StudentPortal token="t" displayName="أحمد" onLogout={logout} />);
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.queryByRole("region", { name: "مشاريعي" })).toBeNull();
    expect(logout).not.toHaveBeenCalled();
  });
});

describe("UX-7a StudentPortal — identity, medals, average ring and the Strength stage", () => {
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

  // The SERVER's Strength payload (25 stages × 80). The helper mirrors the server formula ONLY to build realistic
  // mocks — the portal never computes any of these values (see StudentPortal.strengthAuthority.test.tsx).
  const serverStrength = (raw: number, over: Record<string, unknown> = {}) => {
    const stagePoints = Math.min(raw, 2000), max = stagePoints >= 1920, stageNumber = max ? 25 : Math.floor(stagePoints / 80) + 1, floor = (stageNumber - 1) * 80, within = Math.min(80, stagePoints - floor);
    return { rawTotalPoints: raw, totalPoints: raw, examPoints: raw, practicePoints: 0, studyPoints: 0, projectPoints: 0, stagePoints, stageMaxPoints: 2000, stageNumber, stageCount: 25, stageBlockSize: 80, stageFloor: floor, withinStagePoints: within, stagePercent: Math.round(within * 100 / 80), nextStageNumber: max ? null : stageNumber + 1, nextStageRemaining: max ? 0 : 80 - within, pointsToMaximum: 2000 - stagePoints, isMaximumStage: max, pathComplete: stagePoints >= 2000, legacyRank: null, projects: [], ...over };
  };
  const stageRegion = async () => within(await screen.findByRole("region", { name: /تقدّمي/ }));

  it("ZERO points is stage 1 — بذرة القوة · المرحلة 1 من 25 · 0 / 2000 · 0 / 80 · 0% · next شعلة صغيرة; never «no rank», never a locked preview", async () => {
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 20, finalized: 0, pendingReview: 6, averageFinalized: 99 }, strength: serverStrength(0) });
    const region = await stageRegion();
    expect(region.getByText("بذرة القوة")).toBeTruthy();
    expect(region.getByText("المرحلة 1 من 25")).toBeTruthy();
    expect(region.getByText("بداية الرحلة")).toBeTruthy();
    expect(region.getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 0 / 2000");
    expect(region.getByText("0 / 80")).toBeTruthy();
    expect(region.getByText("0%")).toBeTruthy();
    const ring = region.getByRole("progressbar", { name: "التقدم نحو المرحلة 2 — شعلة صغيرة" });
    expect(ring.getAttribute("aria-valuenow")).toBe("0"); expect(ring.getAttribute("aria-valuemax")).toBe("80");
    const art = region.getByRole("img", { name: "المرحلة 1 — بذرة القوة" }) as HTMLImageElement;
    expect(art.getAttribute("src")).toBe(stageVisual(1).image); expect(art.className).toContain("eb-sp-rankring-art");
    expect((document.querySelector(".eb-sp-rank-next-art") as HTMLImageElement).getAttribute("src")).toBe(stageVisual(2).image);
    expect(region.getByText("بقي 80 نقطة قوة للوصول إلى المرحلة 2 — شعلة صغيرة")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/لا رتبة|الرتبة القادمة|لفتح رتبتك|المستوى \d|من 10 |لفتح الرتبة/);
    expect(document.querySelector(".eb-sp-rankring.is-locked")).toBeNull();
    expect(document.querySelector(".eb-sp-avatar-frame.is-stage-group-1")).toBeTruthy();
    // the circular ring is the sole stage-progress representation — no horizontal bar
    expect(document.querySelector(".eb-sp-rank-progress .eb-progress-track")).toBeNull();
    expect(document.querySelector(".eb-sp-rankring .eb-sp-rankring-svg")).toBeTruthy();
  });

  it("510 points (server stage 7): ذئب الرياح · المرحلة 7 من 25 · مرحلة البناء · 510 / 2000 · 30 / 80 · 38% · «بقي 50 نقطة قوة للوصول إلى المرحلة 8 — سيد الأمواج» with the next icon; the average is irrelevant", async () => {
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 30, finalized: 5, pendingReview: 4, average: 40, averageFinalized: 12 }, strength: serverStrength(510, { examPoints: 500, studyPoints: 10 }) });
    const region = await stageRegion();
    expect(region.getByText("ذئب الرياح").className).toContain("eb-sp-stage-title");
    expect(region.getByText("المرحلة 7 من 25")).toBeTruthy();
    expect(region.getByText("مرحلة البناء")).toBeTruthy();
    expect(region.getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 510 / 2000");
    expect(region.getByText("30 / 80")).toBeTruthy();
    expect(region.getByText("38%")).toBeTruthy();
    const ring = region.getByRole("progressbar", { name: "التقدم نحو المرحلة 8 — سيد الأمواج" });
    expect(ring.getAttribute("aria-valuenow")).toBe("30"); expect(ring.getAttribute("aria-valuemin")).toBe("0"); expect(ring.getAttribute("aria-valuemax")).toBe("80");
    expect((region.getByRole("img", { name: "المرحلة 7 — ذئب الرياح" }) as HTMLImageElement).getAttribute("src")).toBe(stageVisual(7).image);
    const nextArt = document.querySelector(".eb-sp-rank-next-art") as HTMLImageElement;
    expect(nextArt.getAttribute("src")).toBe(stageVisual(8).image); expect(nextArt.getAttribute("aria-hidden")).toBe("true"); expect(nextArt.getAttribute("alt")).toBe("");
    expect(region.queryByRole("img", { name: /سيد الأمواج/ })).toBeNull();                 // the preview is decorative, not a second labelled image
    expect(region.getByText("بقي 50 نقطة قوة للوصول إلى المرحلة 8 — سيد الأمواج")).toBeTruthy();
    expect(document.querySelector(".eb-sp-avatar-frame.is-stage-group-2")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "المعدل النهائي" }).getAttribute("aria-valuenow")).toBe("12");   // average still shown unchanged
    expect(document.body.textContent).not.toMatch(/ترتيب|المركز|leaderboard|الرتبة:/i);
  });

  it("stage 25 in progress (1960): أسطورة القوة · مرحلة الأسطورة · 40 / 80 · 50% · «بقي 40 نقطة قوة لإكمال مسار القوة» · NO next icon, NO stage 26", async () => {
    mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 30, finalized: 19, averageFinalized: 30 }, strength: serverStrength(1960) });
    const region = await stageRegion();
    expect(region.getByText("أسطورة القوة")).toBeTruthy();
    expect(region.getByText("المرحلة 25 من 25")).toBeTruthy();
    expect(region.getByText("مرحلة الأسطورة")).toBeTruthy();
    expect(region.getByText("40 / 80")).toBeTruthy(); expect(region.getByText("50%")).toBeTruthy();
    expect(region.getByText(/نقاط القوة:/).textContent).toBe("نقاط القوة: 1960 / 2000");
    expect(region.getByRole("progressbar", { name: "التقدم نحو إكمال مسار القوة" }).getAttribute("aria-valuenow")).toBe("40");
    expect(region.getByText("بقي 40 نقطة قوة لإكمال مسار القوة")).toBeTruthy();
    expect(document.querySelector(".eb-sp-rank-next-art")).toBeNull();
    expect(document.body.textContent).not.toMatch(/المرحلة 26|بلغت أعلى رتبة/);
    expect(document.querySelector(".eb-sp-avatar-frame.is-stage-group-5")).toBeTruthy();
  });

  it("the path complete (2000) and beyond (raw 2675): 2000 / 2000 · 80 / 80 · 100% · «أكملت مسار القوة» · no next; the raw total is preserved and shown", async () => {
    for (const raw of [2000, 2675]) {
      const { unmount } = mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 30, finalized: 26, averageFinalized: 30 }, strength: serverStrength(raw) });
      const region = await stageRegion();
      expect(region.getByText("المرحلة 25 من 25"), String(raw)).toBeTruthy();
      expect(region.getByText(/نقاط القوة:/).textContent, String(raw)).toBe("نقاط القوة: 2000 / 2000");
      expect(region.getByText("80 / 80"), String(raw)).toBeTruthy(); expect(region.getByText("100%"), String(raw)).toBeTruthy();
      expect(region.getByText("أكملت مسار القوة"), String(raw)).toBeTruthy();
      expect(region.getByRole("progressbar", { name: "اكتمال مسار القوة" }).getAttribute("aria-valuenow"), String(raw)).toBe("80");
      expect(document.querySelector(".eb-sp-rank-next-art"), String(raw)).toBeNull();
      if (raw > 2000) expect(region.getByText(/إجمالي نقاطك الفعلي:/).textContent, String(raw)).toContain("2675"); else expect(region.queryByText(/إجمالي نقاطك الفعلي:/)).toBeNull();
      unmount();
    }
  });

  it("the stage, the ring value and the percentage come from the SERVER only — changing averageFinalized or finalized never moves them", async () => {
    for (const [averageFinalized, finalized] of [[0, 1], [99, 20], [null, 0]] as [number | null, number][]) {
      const { unmount } = mount({ student, classroom, assignments: [], stats: { ...baseStats, assigned: 30, finalized, averageFinalized }, strength: serverStrength(510) });
      const region = await stageRegion();
      const tag = String(averageFinalized) + "/" + finalized;
      expect(region.getByText("المرحلة 7 من 25"), tag).toBeTruthy();
      expect(region.getByText("38%"), tag).toBeTruthy();
      expect(region.getByRole("progressbar", { name: "التقدم نحو المرحلة 8 — سيد الأمواج" }).getAttribute("aria-valuenow"), tag).toBe("30");
      unmount();
    }
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
    expect(gets(calls).length).toBe(4);                                                // no re-read after the write
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
  const sources = import.meta.glob("./{StudentPortal,student/StudentIdentityCard,student/NowSection,student/StudentProgressSection,student/StudentAssignmentCard,student/AchievementFeed,student/AvatarPickerDialog,projects/StudentProjectPanel}.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const presentation = import.meta.glob("./{student/portalPresentation,studentRank}.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  it("the portal files carry no emoji glyphs, no ad-hoc tablist, no locale digit formatting and no inline medal colours", () => {
    expect(Object.keys(sources).length).toBe(8);
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
    expect(rank).toContain("RANK_STEP_FINALIZED = 4");
    expect(rank).toContain('["beginner", "bronze", "silver", "gold", "diamond", "legendary"]');
    expect(rank).not.toMatch(/bronze: 60, silver: 70, gold: 80, diamond: 90, legendary: 96/);            // the old average-threshold table is gone
    expect(rank).not.toMatch(/RANK_MIN_FINALIZED\s*=\s*10/);                                             // old 10-exam unlock removed
    expect(rank).toMatch(/Math\.floor\(count \/ RANK_STEP_FINALIZED\)/);                                // tier from the finalized count only
    expect(rank).not.toMatch(/pendingReview|latestPercentage|score|assignments/);
    expect(rank).not.toMatch(/sort\(|leaderboard|classmates/i);
    for (const src of Object.values(sources)) expect(src).not.toMatch(/latestScore\s*[>!=<]/);
  });

  it("medal icons use the new (slightly larger) sizes and keep a wrapping, overflow-safe layout", () => {
    const progress = sources["./student/StudentProgressSection.tsx"], feed = sources["./student/AchievementFeed.tsx"];
    // grouped medals 16->20, achievement feed 22->26; the old sizes must be gone from those spots (the six-rank badge is gone with the 25-stage path).
    expect(progress).toContain('size={20} className={"eb-sp-medal is-" + g.tier}');
    expect(progress).not.toContain('eb-sp-rank-badge');
    expect(feed).toContain('<IconMedal size={26} />');
    expect(progress).not.toContain("IconMedal size={16}");
    expect(progress).not.toContain("IconMedal size={14}");
    expect(feed).not.toContain("IconMedal size={22}");
  });
  it("the portal keeps the single session authority and reuses the shared primitives", () => {
    const portal = sources["./StudentPortal.tsx"];
    expect(portal.match(/onLogout\(\)/g)?.length).toBe(4);                     // dashboard, avatar, share, open — never the feed
    expect(portal).toMatch(/"\/api\/achievement-feed"[\s\S]*?if \(r\.status === 401\) \{ setFeedError\(""\); return; \}/);
    expect(portal).toContain('from "./ui/SectionHeader"'); expect(portal).toContain('from "./ui/EmptyState"');
    expect(sources["./student/StudentProgressSection.tsx"]).toContain('from "../ui/StatCard"');
    expect(sources["./student/AvatarPickerDialog.tsx"]).toContain('from "../ui/Dialog"');
    expect(sources["./student/StudentProgressSection.tsx"]).toContain('from "../ui/ProgressRing"');
    expect(sources["./student/StudentAssignmentCard.tsx"]).toContain('from "../ui/StatusBadge"');
    expect(sources["./student/NowSection.tsx"]).toContain('from "../ui/EmptyState"');
  });
  it("the student project panel is presentation-only on the shared primitives: same single read, no legacy p794 classes/helpers, no write, no recomputation", () => {
    const panel = sources["./projects/StudentProjectPanel.tsx"];
    expect(panel.match(/fetch\(/g)?.length).toBe(1);
    expect(panel).toContain('fetch("/api/student-project-tracker"');
    expect(panel).not.toMatch(/method:\s*"POST"|"p794-|ProjectProgressBar|StageStatusBadge|STATUS_META|trackIcon\(|analytics-view-tab/);
    expect(panel).toContain('from "../ui/ProgressBar"'); expect(panel).toContain('from "../ui/StatusBadge"'); expect(panel).toContain('from "../ui/SectionHeader"');
    expect(panel).toMatch(/value=\{s\.overallProgress\}/);                                           // server value passed through, never recomputed
    expect(panel).toMatch(/value=\{s\.trackProgress\[t\.trackId\] \|\| 0\}/);
    expect(panel).not.toMatch(/Math\.(round|max|min)|\*\s*100|\/\s*100/);
    expect(panel).toContain("if (!data || !data.enrolled || !data.projects || !data.projects.length) return null;");
  });
});
