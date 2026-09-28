// @vitest-environment happy-dom
//
// Phase 12D — «تابع المشروع» in the REAL StudentPortal opens the EXACT project through the already-mounted project
// panel's own read: zero extra requests, a calm notice for a stale / failed target (never a logout), no replay after
// a sub-view round trip or a silent dashboard refresh, the same project again on a new click, the neighbours unchanged
// (evaluation chip, assignment / Reader continuations, 12C mobile nav) and motion from the existing preference.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";
import { MOTION_OVERRIDE_KEY } from "./ui/motionPreference";
import { saveReaderPosition } from "./student/today/readerPosition";
import { selectTodayContinue } from "./student/today/todayPriority";

const SLOW = { timeout: 8000 }, T = 20000;
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const NOW = Date.now(), H = 3600e3, iso = (ms: number) => new Date(ms).toISOString();
const asg = (id: string, over: Record<string, unknown> = {}) => ({
  assignmentId: id, title: id, instructions: "تعليمات", openAt: "", dueAt: iso(NOW + 10 * 24 * H), effectiveDueAt: "",
  questionCount: 4, totalMarks: 100, durationMinutes: 0, availability: "open", attemptsUsed: 0, allowedAttempts: 1,
  canAttempt: true, attemptStatus: "notStarted", hasActiveAttempt: false, latestScore: null, latestPercentage: null,
  latestResult: null, createdAt: "", dashboardState: "available", gradingStatus: "notSubmitted", ...over
});
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const strength = (projects: { projectCode: string; overallProgress: number; strengthPoints: number }[]) => ({
  rawTotalPoints: 900, totalPoints: 900, examPoints: 300, practicePoints: 400, studyPoints: 100, projectPoints: 100,
  stagePoints: 900, stageMaxPoints: 2000, stageNumber: 17, stageCount: 25, stageBlockSize: 80, stageFloor: 1280, withinStagePoints: 11, stagePercent: 14,
  nextStageNumber: 18, nextStageRemaining: 69, pointsToMaximum: 1100, isMaximumStage: false, pathComplete: false, legacyRank: null, projects,
});
const project = (code: string, title: string, evaluation?: unknown) => ({ projectCode: code, title, tracks: [{ trackId: "book", title: "الكتاب", icon: "" }], summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 40, trackProgress: { book: 40 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false }, stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة", order: 1 }], progress: {}, nextStages: { book: null }, ...(evaluation ? { evaluation } : {}) });
const TWO = { ok: true, enrolled: true, className: "الصف", projects: [project("P1", "مشروع الكتاب"), project("P2", "مشروع الشبكة")] };
const COURSE = { courseId: "791381", title: "شبكات الحاسوب", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }] };

type Opts = { tracker?: () => Promise<Response>; dash?: Record<string, unknown>; code?: string | null; codes?: string[] };
type Calls = { url: string; method: string }[];
function mount(opts: Opts = {}) {
  const calls: Calls = [];
  let dashReads = 0;
  const codeFor = () => (opts.codes ? opts.codes[Math.min(dashReads++, opts.codes.length - 1)] : opts.code === undefined ? "P2" : opts.code);
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url: url.replace(/\?.*$/, ""), method });
    if (url.includes("/api/student-dashboard")) { const code = codeFor(); return res(200, { ok: true, student, classroom, assignments: [], stats, strength: strength(code === null ? [] : [{ projectCode: code, overallProgress: 40, strengthPoints: 160 }]), recognition: null, study: { lastActivity: null }, ...opts.dash }); }
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-notifications")) return res(200, { ok: true, messages: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false }, events: { unread: 0, capped: false }, bell: { unread: 0, capped: false } });
    if (url.includes("/api/student-project-tracker")) return opts.tracker ? opts.tracker() : res(200, TWO);
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [COURSE] });
    if (url.includes("/api/student-assignment/")) return res(200, { ok: true, assignment: { assignmentId: "A1", title: "A1", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 0, totalMarks: 0, exam: { questions: [] } } });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { ...utils, calls, onLogout, gets: (part: string) => calls.filter(c => c.method === "GET" && c.url.includes(part)).length };
}
const hero = async () => (await screen.findByRole("region", { name: "أكمل من حيث توقفت" }, SLOW)).querySelector("[data-continue-type]") as HTMLElement;
const heroCta = async () => within(await hero()).getByRole("button");
const openCode = () => document.querySelector(".eb-sp-project[data-project-code]")?.getAttribute("data-project-code") ?? null;
const cards = () => [...document.querySelectorAll(".eb-sp-project-card h3")].map(h => h.textContent);
const projectsReady = () => screen.findByRole("region", { name: /^مشاريعي/ }, SLOW);
const notice = () => document.querySelector(".eb-sp-notice")?.textContent ?? "";
let scrolls: { id: string; behavior?: string }[] = [];
/** Find the hero CTA first, THEN click inside act (never await a findBy* inside act — it deadlocks). */
async function clickCta() { const b = await heroCta(); await act(async () => { fireEvent.click(b); }); }

beforeEach(() => {
  scrolls = [];
  try { localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, o?: boolean | ScrollIntoViewOptions) { scrolls.push({ id: this.id || this.className, behavior: (o as ScrollIntoViewOptions)?.behavior }); };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("12D Today «تابع المشروع» → the exact project", () => {
  it("(1 · 20) the Today candidate is unchanged: a project in progress → type project, same label/reason, WITH its projectCode", () => {
    const c = selectTodayContinue({ assignments: [], now: NOW, readerPosition: null, studyLastActivity: null, courses: null, projects: [{ projectCode: "P2", overallProgress: 40, strengthPoints: 160 }] });
    expect(c).toMatchObject({ type: "project", priority: 4, label: "تابع المشروع", title: "مشروع صفك", projectCode: "P2" });
  });

  it("(2 · 3 · 5 · 18) the CTA opens P2 (not P1) from the panel's one read — zero extra project-tracker GETs; the section heading is focused", async () => {
    const m = mount();
    await projectsReady();
    expect(cards()).toEqual(["مشروع الكتاب", "مشروع الشبكة"]);
    expect(m.gets("/api/student-project-tracker")).toBe(1);
    const cta = await heroCta();
    expect(cta.textContent).toBe("تابع المشروع");
    await act(async () => { fireEvent.click(cta); });
    expect(openCode()).toBe("P2");
    expect(cards()).toEqual([]);
    expect(m.gets("/api/student-project-tracker")).toBe(1);
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-projects-title", behavior: "smooth" });
    expect(document.activeElement?.id).toBe("eb-sp-projects-title");
    expect(document.getElementById("eb-sp-projects-title")!.getAttribute("tabindex")).toBe("-1");
    expect(notice()).toBe("");
  }, T);

  it("(4) a click while the panel's read is still in flight waits for it, then opens P2 (still one read)", async () => {
    let release: (() => void) | null = null;
    const m = mount({ tracker: () => new Promise<Response>(r => { release = () => r({ status: 200, ok: true, json: async () => TWO } as Response); }) });
    await clickCta();
    expect(openCode()).toBeNull();
    await act(async () => { release!(); await Promise.resolve(); await Promise.resolve(); });
    await waitFor(() => expect(openCode()).toBe("P2"));
    expect(m.gets("/api/student-project-tracker")).toBe(1);
  }, T);

  it("(8 · 7) a stale code (Today says P7, the panel's list has no P7): no project opens, cards stay, calm notice — no alert", async () => {
    mount({ code: "P7" });
    await projectsReady();
    await clickCta();
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(notice()).toContain("هذا المشروع لم يعد متاحًا.");
    expect(document.querySelector(".eb-sp-notice")!.getAttribute("role")).toBe("status");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(scrolls.at(-1)?.id).toBe("eb-sp-projects-title");                  // the list is brought into view
  }, T);

  it("(9) not enrolled: consumed safely with the calm notice", async () => {
    mount({ tracker: () => res(200, { ok: true, enrolled: false }) });
    await screen.findByRole("region", { name: /المهام والواجبات/ }, SLOW);
    await clickCta();
    await waitFor(() => expect(notice()).toContain("هذا المشروع لم يعد متاحًا."));
    expect(document.querySelector(".eb-sp-projects")).toBeNull();
  }, T);

  it("(10 · 11) a failed project read (500 / 401) consumes the drill with a calm notice and NEVER logs out", async () => {
    for (const status of [500, 401]) {
      cleanup();
      const m = mount({ tracker: () => res(status, { ok: false }) });
      await screen.findByRole("region", { name: /المهام والواجبات/ }, SLOW);
      await clickCta();
      await waitFor(() => expect(notice()).toContain("تعذر فتح المشروع حاليًا"));
      expect(m.onLogout).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(m.gets("/api/student-project-tracker")).toBe(1);                  // no retry loop
    }
  }, T);

  it("(28) a project continuation without a projectCode falls back to the section (no crash, no invented code)", async () => {
    // A strength project entry with an empty code normalizes to projectCode "" → the continuation carries no code.
    mount({ code: "" });
    await projectsReady();
    const cta = await heroCta();
    expect(cta.textContent).toBe("تابع المشروع");
    await act(async () => { fireEvent.click(cta); });
    await waitFor(() => expect(scrolls.at(-1)?.id).toBe("eb-sp-projects-title"));
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(notice()).toBe("");
  }, T);
});

describe("12D newest intent wins in the portal (deferred project read)", () => {
  async function twoIntents(codes: string[]) {
    let release: (() => void) | null = null;
    const m = mount({ codes, tracker: () => new Promise<Response>(r => { release = () => r({ status: 200, ok: true, json: async () => TWO } as Response); }) });
    await clickCta();                                                           // intent 1 (read still in flight)
    const dash = m.gets("/api/student-dashboard");
    await act(async () => { window.dispatchEvent(new Event("focus")); });      // a silent refresh: Today now names another project
    await waitFor(() => expect(m.gets("/api/student-dashboard")).toBe(dash + 1));
    await clickCta();                                                           // intent 2
    const seen = new Set<string>();
    const obs = new MutationObserver(() => { const c = openCode(); if (c) seen.add(c); });
    obs.observe(document.body, { childList: true, subtree: true });
    await act(async () => { release!(); await Promise.resolve(); await Promise.resolve(); });
    await projectsReady();
    obs.disconnect();
    return { m, seen };
  }

  it("(12 · race A) P1 then P2 before the panel's read resolves → ONLY P2 opens (P1 never renders), one read", async () => {
    const { m, seen } = await twoIntents(["P1", "P2"]);
    expect(openCode()).toBe("P2");
    expect([...seen]).toEqual(["P2"]);
    expect(notice()).toBe("");
    expect(m.gets("/api/student-project-tracker")).toBe(1);
  }, T);

  it("(13 · race B) P1 then a GONE project → no project opens, the list shows, calm notice, P1 never resurrects", async () => {
    const { seen } = await twoIntents(["P1", "GONE"]);
    expect(openCode()).toBeNull();
    expect([...seen]).toEqual([]);
    expect(cards()).toHaveLength(2);
    expect(notice()).toContain("هذا المشروع لم يعد متاحًا.");
  }, T);
});

describe("12D no replay, no snap-back, repeatable", () => {
  it("(14 · 15) back to the list survives a silent dashboard refresh; a Games round trip never replays the drill", async () => {
    const m = mount();
    await projectsReady();
    await clickCta();
    expect(openCode()).toBe("P2");
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    const dash = m.gets("/api/student-dashboard");
    await act(async () => { window.dispatchEvent(new Event("focus")); });     // the portal's silent refresh
    await waitFor(() => expect(m.gets("/api/student-dashboard")).toBe(dash + 1));
    await act(async () => { await Promise.resolve(); });
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    // leave the main view and come back: the panel remounts (its own ordinary read) — no drill replays
    fireEvent.click(screen.getByRole("button", { name: "الألعاب التعليمية" }));
    await screen.findByRole("heading", { level: 1, name: "الألعاب التعليمية" }, SLOW);
    fireEvent.click(screen.getAllByRole("button").find(b => /العودة/.test(b.textContent || ""))!);
    await projectsReady();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
  }, T);

  it("(16) drilled P2, then the student opens P1 by hand: a silent refresh keeps P1", async () => {
    const m = mount();
    await projectsReady();
    await clickCta();
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    fireEvent.click(within(screen.getByRole("article", { name: "مشروع الكتاب" })).getByRole("button", { name: "فتح المشروع" }));
    expect(openCode()).toBe("P1");
    const dash = m.gets("/api/student-dashboard");
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(m.gets("/api/student-dashboard")).toBe(dash + 1));
    await act(async () => { await Promise.resolve(); });
    expect(openCode()).toBe("P1");
  }, T);

  it("(17 · 18) Today → P2, back to the list, Today → P2 again opens it again; manual switching too — still ONE project read", async () => {
    const m = mount();
    await projectsReady();
    await clickCta();
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    expect(openCode()).toBeNull();
    await clickCta();
    expect(openCode()).toBe("P2");
    fireEvent.click(screen.getByRole("button", { name: /العودة إلى المشاريع/ }));
    fireEvent.click(within(screen.getByRole("article", { name: "مشروع الكتاب" })).getByRole("button", { name: "فتح المشروع" }));
    expect(openCode()).toBe("P1");
    expect(m.gets("/api/student-project-tracker")).toBe(1);
  }, T);

  it("(27 · race C) a new session (token) before the project read resolves: the old drill is dropped and never opens in the new session", async () => {
    const releases: (() => void)[] = [];
    const m = mount({ tracker: () => new Promise<Response>(r => { releases.push(() => r({ status: 200, ok: true, json: async () => TWO } as Response)); }) });
    await clickCta();           // drill P2 pending (read in flight)
    m.rerender(<StudentPortal token="t2" displayName="أحمد" onLogout={m.onLogout} />);
    await screen.findByRole("region", { name: /المهام والواجبات/ }, SLOW);
    await waitFor(() => expect(releases.length).toBeGreaterThanOrEqual(2));   // the new session's own read started
    // (the portal's ordinary session reload remounts the optional panel: each mount makes its one read, as on main)
    const last = releases.length - 1;
    await act(async () => { releases[0](); await Promise.resolve(); await Promise.resolve(); });   // the OLD read lands late
    expect(openCode()).toBeNull();
    for (let i = 1; i < last; i++) await act(async () => { releases[i](); await Promise.resolve(); });
    await act(async () => { releases[last](); await Promise.resolve(); await Promise.resolve(); });
    await projectsReady();
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
    expect(notice()).toBe("");
  }, T);
});

describe("12D neighbours unchanged", () => {
  it("(19) the evaluation chip «مشاريعي» still only scrolls to the section (aggregate text, no project guessed)", async () => {
    const ev = { gradedStages: 1, ungradedStages: 1, totalStages: 2, projectScore: 80, stages: [] };
    mount({ tracker: () => res(200, { ...TWO, projects: [project("P1", "مشروع الكتاب", ev), project("P2", "مشروع الشبكة", ev)] }) });
    await projectsReady();
    const chip = await within(await screen.findByRole("region", { name: "أكمل من حيث توقفت" })).findByRole("button", { name: "مشاريعي" }, SLOW);
    fireEvent.click(chip);
    await waitFor(() => expect(scrolls.at(-1)?.id).toBe("eb-sp-projects-title"));
    expect(openCode()).toBeNull();
    expect(cards()).toHaveLength(2);
  }, T);

  it("(21) the assignment continuation is unchanged (one /api/student-assignment read, no project drill)", async () => {
    const m = mount({ dash: { assignments: [asg("SOON", { dueAt: iso(NOW + 2 * H) })] } });
    expect((await hero()).getAttribute("data-continue-type")).toBe("assignment");
    fireEvent.click(await heroCta());
    await waitFor(() => expect(m.gets("/api/student-assignment/SOON")).toBe(1));
  }, T);

  it("(22) the Reader continuation is unchanged (entitlement re-read, the Reader opens)", async () => {
    saveReaderPosition("u1", { courseId: "791381", pageId: "791381-m01-l01-p02" });
    const m = mount();
    await waitFor(async () => expect((await hero()).getAttribute("data-continue-type")).toBe("reader"), SLOW);
    const before = m.gets("/api/student-learning-materials");
    fireEvent.click(await heroCta());
    await waitFor(() => expect(m.gets("/api/student-learning-materials")).toBe(before + 1));
    await waitFor(() => expect(screen.queryByRole("region", { name: "موادي التعليمية" })).toBeNull(), SLOW);
    expect(m.gets("/api/student-project-tracker")).toBe(1);
  }, T);

  it("(23 · 24) the 12C bar stays with the exact project open (five items) and «المشاريع» still goes to the section", async () => {
    mount();
    await projectsReady();
    await clickCta();
    const nav = screen.getByRole("navigation", { name: "التنقل السريع في بوابة الطالب" });
    expect(within(nav).getAllByRole("button").map(b => b.textContent)).toEqual(["اليوم", "المواد", "الواجبات", "التقدم", "المشاريع"]);
    fireEvent.click(within(nav).getAllByRole("button").find(b => b.textContent === "المشاريع")!);
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-projects-title", behavior: "smooth" });
    expect(openCode()).toBe("P2");                                              // the bar never changes the panel
  }, T);

  it("(25) reduced motion (the existing device preference) → «auto»", async () => {
    localStorage.setItem(MOTION_OVERRIDE_KEY, "off");
    mount();
    await projectsReady();
    await clickCta();
    expect(openCode()).toBe("P2");
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-projects-title", behavior: "auto" });
  }, T);

  it("(26) normal motion → «smooth»", async () => {
    mount();
    await projectsReady();
    await clickCta();
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-projects-title", behavior: "smooth" });
  }, T);
});
