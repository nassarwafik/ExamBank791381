// @vitest-environment happy-dom
// Phase 9A — the student Today Hub inside the REAL StudentPortal: the hero's single continuation (priority rules over
// the dashboard payload + released materials + this student's Reader marker), its CTA into the EXISTING flows (exam
// page / Reader at the saved page / messages), the unread strip, the empty state, cross-student scoping, user switch,
// partial API failure, silent-refresh safety and the mobile CSS contract.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import StudentPortal from "./StudentPortal";
import { saveReaderPosition } from "./student/today/readerPosition";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { window.localStorage.clear(); });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const NOW = Date.now(), H = 3600 * 1000;
const iso = (ms: number) => new Date(ms).toISOString();
const asg = (id: string, over: Record<string, unknown> = {}) => ({
  assignmentId: id, title: id, instructions: "تعليمات", openAt: "", dueAt: iso(NOW + 10 * 24 * H), effectiveDueAt: "",
  questionCount: 4, totalMarks: 100, durationMinutes: 0, availability: "open", attemptsUsed: 0, allowedAttempts: 1,
  canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null,
  latestResult: null, createdAt: "", dashboardState: "available", gradingStatus: "notSubmitted", ...over
});
const finalLR = (pct: number) => ({ attemptNumber: 1, score: pct, totalMarks: 100, percentage: pct, submittedAt: iso(NOW - H), manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" });
const student = (userId = "u1") => ({ userId, code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true });
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const COURSE = { courseId: "791381", title: "شبكات الحاسوب", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }, { moduleId: "791381-m02", title: "الأعداد والموازين", order: 2 }] };
const counts = (unread: number) => ({ ok: true, messages: { directUnread: { unread, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: unread, totalCapped: false }, events: { unread: 0, capped: false }, bell: { unread, capped: false } });

type Opts = { materials?: unknown; materialsStatus?: number; unread?: number; countsStatus?: number; study?: unknown; strength?: unknown };
type Calls = { url: string; method: string }[];
function mount(dashboard: Record<string, unknown>, opts: Opts = {}) {
  const calls: Calls = [];
  const dash = () => ({ ok: true, student: student(), classroom, assignments: [], stats, strength: opts.strength ?? null, recognition: null, study: opts.study ?? { lastActivity: null }, ...dashboard });
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/api/student-dashboard")) return res(200, dash());
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-notifications")) return res(opts.countsStatus || 200, opts.countsStatus ? { ok: false } : counts(opts.unread ?? 0));
    if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
    if (url.includes("/api/student-learning-materials")) return res(opts.materialsStatus || 200, opts.materialsStatus ? { ok: false } : { ok: true, materials: opts.materials ?? [COURSE] });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { ...utils, calls, onLogout, gets: (part: string) => calls.filter(c => c.method === "GET" && c.url.includes(part)).length };
}
const hub = async () => within(await screen.findByRole("region", { name: "أكمل من حيث توقفت" }));
const hero = async () => { const region = await screen.findByRole("region", { name: "أكمل من حيث توقفت" }); return region.querySelector("[data-continue-type]") as HTMLElement; };
const cta = async () => within(await hero()).getByRole("button");

describe("9A Student Today Hub — the hero's one continuation", () => {
  it("a live attempt wins over a due-soon assignment; «تابع المحاولة» opens the exam page through the existing assignment read", async () => {
    const m = mount({ assignments: [asg("SOON", { dueAt: iso(NOW + 2 * H) }), asg("LIVE", { dashboardState: "inProgress", hasActiveAttempt: true, attemptStatus: "started", canAttempt: false })] });
    expect((await hero()).getAttribute("data-continue-type")).toBe("activeAttempt");
    expect(within(await hero()).getByRole("heading", { level: 3 }).textContent).toBe("LIVE");
    const b = await cta();
    expect(b.textContent).toBe("تابع المحاولة");
    fireEvent.click(b);
    await waitFor(() => expect(m.gets("/api/student-assignment/LIVE")).toBe(1));
  });

  it("a due-soon assignment beats the Reader marker («ابدأ الحل» / «ابدأ الامتحان» when timed); a far deadline yields to the Reader", async () => {
    saveReaderPosition("u1", { courseId: "791381", pageId: "791381-m01-l01-p02" });
    mount({ assignments: [asg("SOON", { dueAt: iso(NOW + 5 * H), durationMinutes: 30 })] });
    expect((await hero()).getAttribute("data-continue-type")).toBe("assignment");
    expect((await cta()).textContent).toBe("ابدأ الامتحان");
    cleanup();
    mount({ assignments: [asg("FAR")] });
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("reader"));
    expect((await cta()).textContent).toBe("تابع القراءة");
    expect(within(await hero()).getByRole("heading", { level: 3 }).textContent).toBe("أساسيات الشبكات");
  });

  it("«تابع القراءة» re-validates the entitlement and opens the SAME Reader on the saved page (the marker is written from the Reader's own page signal)", async () => {
    saveReaderPosition("u1", { courseId: "791381", pageId: "791381-m01-l01-p02" });
    const m = mount({});
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("reader"));
    fireEvent.click(await cta());
    await waitFor(() => expect(m.gets("/api/student-learning-materials")).toBe(2));                 // panel read + open-time revalidation
    const jump = await screen.findByLabelText("انتقل إلى صفحة", {}, { timeout: 10000 }) as HTMLSelectElement;
    await waitFor(() => expect(jump.value).toBe("791381-m01-l01-p02"));
    // Moving to another page updates the marker for THIS student only.
    fireEvent.change(jump, { target: { value: "791381-m02-l00-p01" } });
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("examBankReaderPosition:v1:u1") || "{}").pageId).toBe("791381-m02-l00-p01"));
    expect(window.localStorage.getItem("examBankReaderPosition:v1:u2")).toBeNull();
    // A silent refresh trigger while the Reader is open changes nothing: no dashboard re-read, Reader stays.
    const before = m.gets("/api/student-dashboard");
    window.dispatchEvent(new Event("focus"));
    await new Promise(r => setTimeout(r, 30));
    expect(m.gets("/api/student-dashboard")).toBe(before);
    expect(screen.getByLabelText("انتقل إلى صفحة")).toBeTruthy();
  }, 15000);

  it("server fallback: with no device marker, the dashboard's study.lastActivity gives the Reader continuation — only for released modules", async () => {
    mount({}, { study: { lastActivity: { courseId: "791381", moduleId: "791381-m02", pageId: "791381-m02-l00-p01", completedAt: iso(NOW - H) } } });
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("reader"));
    expect(within(await hero()).getByRole("heading", { level: 3 }).textContent).toBe("الأعداد والموازين");
    cleanup();
    mount({}, { study: { lastActivity: { courseId: "791381", moduleId: "791381-m07", pageId: "791381-m07-l01-p01", completedAt: iso(NOW - H) } } });
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("study"));   // m07 not released → «ابدأ القراءة»
    expect((await cta()).textContent).toBe("ابدأ القراءة");
  });

  it("remaining-attempt eligibility: a final result WITH a remaining attempt → «ابدأ محاولة جديدة»; exhausted / awaiting review / closed → never", async () => {
    mount({ assignments: [asg("AGAIN", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(70), attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueAt: iso(NOW + 3 * H) })] }, { materials: [] });
    expect((await cta()).textContent).toBe("ابدأ محاولة جديدة");
    cleanup();
    mount({ assignments: [
      asg("DONE", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(90), attemptsUsed: 1, canAttempt: false }),
      asg("WAIT", { dashboardState: "awaitingReview", gradingStatus: "pendingReview", latestResult: { ...finalLR(50), finalized: false, manualReviewMarks: 5, gradingStatus: "pendingReview" } }),
      asg("LATE", { dashboardState: "closedUnsubmitted", availability: "closed", dueAt: iso(NOW - H), canAttempt: false })
    ] }, { materials: [] });
    expect((await hero()).getAttribute("data-continue-type")).toBe("none");
    // An extended (reopened) assignment comes back through the server's own fields → offered again.
    cleanup();
    mount({ assignments: [asg("EXT", { dueAt: iso(NOW - H), effectiveDueAt: iso(NOW + 4 * H), availability: "open", dashboardState: "available", canAttempt: true })] }, { materials: [] });
    expect((await hero()).getAttribute("data-continue-type")).toBe("assignment");
    expect(within(await hero()).getByText(/التسليم/)).toBeTruthy();
  });

  it("empty state: nothing to continue → «لا يوجد شيء عاجل الآن» with the tasks shortcut; no blank panel", async () => {
    mount({}, { materials: [] });
    const h = await hero();
    expect(h.getAttribute("data-continue-type")).toBe("none");
    expect(within(h).getByText("لا يوجد شيء عاجل الآن")).toBeTruthy();
    const anchor = document.getElementById("eb-sp-tasks-title") as HTMLElement;
    const scroll = vi.fn(); (anchor as unknown as { scrollIntoView: () => void }).scrollIntoView = scroll;
    fireEvent.click(within(h).getByRole("button", { name: "المهام والواجبات" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });
});

describe("9A Student Today Hub — messages, progress, scoping, failures, mobile", () => {
  it("the unread strip shows the canonical count and «افتح رسائل المعلم» opens the Messages page; zero → «لا رسائل جديدة»", async () => {
    const m = mount({}, { unread: 3, materials: [] });
    const h = await hub();
    await waitFor(() => expect(h.getByText("لديك 3 رسائل غير مقروءة من المعلم")).toBeTruthy());
    fireEvent.click(h.getByRole("button", { name: "افتح رسائل المعلم" }));
    await waitFor(() => expect(m.gets("/api/student-messages")).toBeGreaterThan(0));
    expect(screen.queryByRole("region", { name: "أكمل من حيث توقفت" })).toBeNull();                  // the dedicated Messages view replaced the portal
    cleanup();
    mount({}, { unread: 0, materials: [] });
    expect((await hub()).getByText("لا رسائل جديدة من المعلم")).toBeTruthy();
  });

  it("the progress strip is the server's stage + medals + last final result; «تقدمك» jumps to the progress section", async () => {
    const strength = { rawTotalPoints: 510, totalPoints: 510, examPoints: 90, practicePoints: 0, studyPoints: 0, gamePoints: 0, projectPoints: 0, stagePoints: 510, stageMaxPoints: 2000, stageCount: 25, stageBlockSize: 80, stageNumber: 7, stageFloor: 480, withinStagePoints: 30, stagePercent: 38, nextStageNumber: 8, nextStageRemaining: 50, pointsToMaximum: 1490, isMaximumStage: false, pathComplete: false, legacyRank: null, projects: [] };
    mount({ assignments: [asg("DONE", { dashboardState: "completed", gradingStatus: "final", latestResult: finalLR(90), attemptsUsed: 1, canAttempt: false })], stats: { ...stats, finalized: 1 }, recognition: { medals: { total: 2, gold: 1, silver: 1, bronze: 0 }, reactionsReceived: { total: 0, byType: { heart: 0, clap: 0, cheer: 0, fire: 0 } }, achievements: { total: 0, byType: { global_rank_up: 0, project_rank_up: 0, project_complete: 0 } } } }, { strength, materials: [] });
    const h = await hub();
    const strip = h.getByText(/آخر نتيجة: DONE 90%/);
    expect(strip.textContent).toContain("2 ميداليات");
    expect(strip.textContent).toContain("المرحلة 7 من 25");
    const anchor = document.getElementById("eb-sp-progress-title") as HTMLElement;
    const scroll = vi.fn(); (anchor as unknown as { scrollIntoView: () => void }).scrollIntoView = scroll;
    fireEvent.click(h.getByRole("button", { name: "تقدمك" }));
    await waitFor(() => expect(scroll).toHaveBeenCalled());
  });

  it("no cross-student leakage: another student's Reader marker on this device is never offered; switching users starts from the new student's own state", async () => {
    saveReaderPosition("u2", { courseId: "791381", pageId: "791381-m01-l01-p02" });
    mount({});                                                                                       // u1 logs in
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("study"));   // not u2's page → «ابدأ القراءة»
    expect((await cta()).textContent).toBe("ابدأ القراءة");
    cleanup();
    // Now u2 logs in on the same device → their own marker is the continuation.
    const calls: Calls = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, method: (init?.method || "GET").toUpperCase() });
      if (url.includes("/api/student-dashboard")) return res(200, { ok: true, student: student("u2"), classroom, assignments: [], stats, strength: null, recognition: null, study: { lastActivity: null } });
      if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [COURSE] });
      if (url.includes("/api/student-notifications")) return res(200, counts(0));
      return res(200, { ok: true, posts: [], enrolled: false });
    }) as unknown as typeof fetch;
    render(<StudentPortal token="t2" displayName="سارة" onLogout={vi.fn()} />);
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("reader"));
  });

  it("partial failures: materials 500 → the hub still shows the assignment; counts 500 → the strip shows «لا رسائل جديدة»; nothing blanks", async () => {
    mount({ assignments: [asg("FAR")] }, { materialsStatus: 500, countsStatus: 500 });
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("study"));
    expect(within(await hero()).getByRole("heading", { level: 3 }).textContent).toBe("FAR");
    expect((await hub()).getByText("لا رسائل جديدة من المعلم")).toBeTruthy();
    expect(screen.getByRole("region", { name: /المهام والواجبات/ })).toBeTruthy();
  });

  it("mobile-first markup and CSS contract: one real CTA (≥48px), 44px-friendly strip actions, no hover-only control, RTL inherited", async () => {
    mount({ assignments: [asg("FAR")] }, { materials: [] });
    const h = await hero();
    const buttons = within(h).getAllByRole("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].tagName).toBe("BUTTON");
    expect(buttons[0].className).toContain("eb-sp-today-cta");
    const css = readFileSync(path.join(process.cwd(), "src", "student", "today", "today.css"), "utf8");
    expect(css).toMatch(/\.eb-sp-today-cta\{ width:100%; min-height:48px;/);
    expect(css).not.toMatch(/:hover\s*\{[^}]*display/);
    expect(css).toMatch(/@media \(min-width: 768px\)/);
    expect(document.querySelector("main.student-portal")?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByRole("region", { name: "أكمل من حيث توقفت" }).querySelector("h2")?.textContent).toContain("أكمل من حيث توقفت");
  });
});
