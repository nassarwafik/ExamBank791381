// @vitest-environment happy-dom
//
// Phase 12C — the phone quick navigation inside the REAL StudentPortal: it exists only on the ordinary main portal
// (never over the Reader, the exam page, Messages, Games, nor under the avatar picker), it follows the student's
// EXISTING motion preference, it reads nothing (request parity), and it leaves the neighbours exactly as they were:
// the top-bar badges, the Today Hub's continuation, assignment opening and the project panel's own state.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";
import { MOTION_OVERRIDE_KEY } from "./ui/motionPreference";

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
const stats = { assigned: 1, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const COURSE = { courseId: "791381", title: "شبكات الاتصال", modules: [{ moduleId: "791381-m01", title: "أساسيات الشبكات", order: 1 }] };
const project = (code: string, title: string) => ({ projectCode: code, title, tracks: [{ trackId: "book", title: "الكتاب", icon: "" }], summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 10, trackProgress: { book: 10 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false }, stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة", order: 1 }], progress: {}, nextStages: { book: null } });
const PROJECTS = { ok: true, enrolled: true, className: "الصف", projects: [project("P1", "مشروع الكتاب"), project("P2", "مشروع الشبكة")] };
const counts = (unread: number, events: number) => ({ ok: true, messages: { directUnread: { unread, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: unread, totalCapped: false }, events: { unread: events, capped: false }, bell: { unread: unread + events, capped: false } });

type Calls = { url: string; method: string }[];
function mount(opts: { assignments?: unknown[]; projects?: unknown } = {}) {
  const calls: Calls = [];
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url: url.replace(/\?.*$/, ""), method });
    if (url.includes("/api/student-dashboard")) return res(200, { ok: true, student, classroom, assignments: opts.assignments ?? [asg("A1")], stats, strength: null, recognition: null, study: { lastActivity: null } });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-notifications")) return res(200, counts(7, 3));
    if (url.includes("/api/student-project-tracker")) return res(200, opts.projects ?? PROJECTS);
    if (url.includes("/api/student-learning-materials")) return res(200, { ok: true, materials: [COURSE] });
    if (url.includes("/api/student-assignment/")) return res(200, { ok: true, assignment: { assignmentId: "A1", title: "A1", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 0, totalMarks: 0, exam: { questions: [] } } });
    if (url.includes("/api/student-messages")) return res(200, { ok: true, messages: [], announcements: [], unread: { directUnread: { unread: 0, capped: false }, announcementUnread: { unread: 0, capped: false }, totalUnread: 0, totalCapped: false } });
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
  return { ...utils, calls, gets: (part: string) => calls.filter(c => c.method === "GET" && c.url.includes(part)).length };
}
const quickNav = () => document.querySelector("nav.eb-sp-quicknav");
const navItem = (label: string) => within(screen.getByRole("navigation", { name: "التنقل السريع في بوابة الطالب" })).getAllByRole("button").find(b => b.textContent === label)!;
const ready = async () => { await screen.findByRole("navigation", { name: "التنقل السريع في بوابة الطالب" }, SLOW); await screen.findByRole("region", { name: /^مشاريعي/ }, SLOW); };
let scrolls: { id: string; behavior?: string }[] = [];

beforeEach(() => {
  scrolls = [];
  try { localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, o?: boolean | ScrollIntoViewOptions) { scrolls.push({ id: this.id, behavior: (o as ScrollIntoViewOptions)?.behavior }); };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("12C in the real portal — where the bar exists", () => {
  it("the ordinary main portal renders ONE bar (inside the student shell, after the content) with five items; the shell gets has-quick-nav", async () => {
    mount();
    await ready();
    expect(document.querySelectorAll("nav.eb-sp-quicknav")).toHaveLength(1);
    const main = document.querySelector("main.eb-student-shell")!;
    expect(main.classList.contains("has-quick-nav")).toBe(true);
    expect(quickNav()!.parentElement).toBe(main);
    expect(main.querySelector(".student-shell")!.compareDocumentPosition(quickNav()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(quickNav() as HTMLElement).getAllByRole("button").map(b => b.textContent)).toEqual(["اليوم", "المواد", "الواجبات", "التقدم", "المشاريع"]);
    // every target is a real section heading of this page
    for (const b of within(quickNav() as HTMLElement).getAllByRole("button")) expect(document.getElementById(b.getAttribute("data-target")!)?.tagName).toBe("H2");
  }, T);

  it("(13) no bar over the Reader", async () => {
    mount();
    await ready();
    const card = await within(await screen.findByRole("region", { name: "موادي التعليمية" })).findByRole("article", { name: "شبكات الاتصال" });
    fireEvent.click(within(card).getByRole("button", { name: "فتح المادة" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "موادي التعليمية" })).toBeNull(), SLOW);
    expect(quickNav()).toBeNull();
    expect(document.querySelector(".has-quick-nav")).toBeNull();
  }, T);

  it("(14 · 23) no bar over the exam page — and opening an assignment is unchanged (one /api/student-assignment read, the exam view replaces the portal)", async () => {
    const m = mount();
    await ready();
    const card = within(screen.getByRole("region", { name: /المهام والواجبات/ })).getByText("A1", { selector: ".eb-sp-task-title" }).closest(".student-assignment-card") as HTMLElement;
    fireEvent.click(within(card).getByRole("button"));
    await waitFor(() => expect(m.gets("/api/student-assignment/A1")).toBe(1));
    await waitFor(() => expect(screen.queryByRole("region", { name: /المهام والواجبات/ })).toBeNull(), SLOW);
    expect(quickNav()).toBeNull();
    expect(document.querySelector(".has-quick-nav")).toBeNull();
  }, T);

  it("(15) no bar over Messages; back on the portal it returns", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^الرسائل/ }));
    await screen.findByRole("heading", { level: 1, name: "الرسائل" }, SLOW);
    expect(quickNav()).toBeNull();
    fireEvent.click(screen.getAllByRole("button").find(b => /العودة/.test(b.textContent || ""))!);
    await screen.findByRole("navigation", { name: "التنقل السريع في بوابة الطالب" }, SLOW);
  }, T);

  it("(16) no bar over Games", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "الألعاب التعليمية" }));
    await screen.findByRole("heading", { level: 1, name: "الألعاب التعليمية" }, SLOW);
    expect(quickNav()).toBeNull();
  }, T);

  it("the avatar picker (a screen-takeover dialog) hides the bar; closing it shows the same bar again", async () => {
    mount();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: /^تغيير الأيقونة/ }));
    await screen.findByRole("dialog", {}, SLOW);
    expect(quickNav()!.hasAttribute("hidden")).toBe(true);
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(quickNav()!.hasAttribute("hidden")).toBe(false);
  }, T);

  it("no bar while the portal is still loading (its targets do not exist yet)", async () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
    await screen.findByText("جارٍ تحميل حسابك...");
    expect(quickNav()).toBeNull();
    expect(document.querySelector(".has-quick-nav")).toBeNull();
  });
});

describe("12C motion follows the student's EXISTING preference", () => {
  it("(8) the device-level «off» choice (examBankMotion) → instant scroll", async () => {
    localStorage.setItem(MOTION_OVERRIDE_KEY, "off");
    mount();
    await ready();
    fireEvent.click(navItem("الواجبات"));
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-tasks-title", behavior: "auto" });
  }, T);

  it("(8b) the OS reduced-motion hint → instant scroll", async () => {
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    mount();
    await ready();
    fireEvent.click(navItem("التقدم"));
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-progress-title", behavior: "auto" });
  }, T);

  it("(9) no preference → smooth; the heading receives focus", async () => {
    mount();
    await ready();
    fireEvent.click(navItem("المواد"));
    expect(scrolls.at(-1)).toEqual({ id: "eb-sp-learning-title", behavior: "smooth" });
    expect(document.activeElement?.id).toBe("eb-sp-learning-title");
  }, T);
});

describe("12C leaves the neighbours unchanged", () => {
  it("request parity: tapping all five items reads NOTHING (no API call of any kind)", async () => {
    const m = mount();
    await ready();
    await act(async () => { await Promise.resolve(); });
    const before = m.calls.length;
    for (const label of ["الواجبات", "المشاريع", "التقدم", "المواد", "اليوم"]) fireEvent.click(navItem(label));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(m.calls.length).toBe(before);
  }, T);

  it("(21) the top bar keeps both badges (bell = unified, «الرسائل» = message-only) with the bar present", async () => {
    mount();
    await ready();
    const top = document.querySelector(".student-topbar") as HTMLElement;
    await waitFor(() => expect(within(top).getByRole("button", { name: /^الرسائل/ }).textContent).toContain("7"));
    expect(top.querySelector(".eb-notif-bell")!.textContent).toContain("10");
    expect(within(top).getByRole("button", { name: /تسجيل الخروج/ })).toBeTruthy();
    expect(quickNav()!.contains(top)).toBe(false);
    expect(within(quickNav() as HTMLElement).queryByText(/الرسائل|الإشعارات|الألعاب|الإنجازات/)).toBeNull();   // messages/games/achievements are not in the bar
  }, T);

  it("(22) the Today Hub continuation is unchanged: its CTA opens the assignment through the same single read", async () => {
    const m = mount({ assignments: [asg("SOON", { dueAt: iso(NOW + 2 * H) })] });
    await ready();
    const hero = (await screen.findByRole("region", { name: "أكمل من حيث توقفت" })).querySelector("[data-continue-type]") as HTMLElement;
    expect(hero.getAttribute("data-continue-type")).toBe("assignment");
    fireEvent.click(navItem("المشاريع"));                                   // nav use first: no effect on the hub's choice
    fireEvent.click(within(hero).getByRole("button"));
    await waitFor(() => expect(m.gets("/api/student-assignment/SOON")).toBe(1));
  }, T);

  it("(24) the project panel keeps its own state: «المشاريع» only scrolls to the section; an opened project stays open, cards are never re-read", async () => {
    const m = mount();
    await ready();
    const region = screen.getByRole("region", { name: /^مشاريعي/ });
    fireEvent.click(within(within(region).getByRole("article", { name: "مشروع الشبكة" })).getByRole("button", { name: "فتح المشروع" }));
    expect(region.querySelector('[data-project-code="P2"]')).toBeTruthy();
    const tracker = m.gets("/api/student-project-tracker");
    fireEvent.click(navItem("المشاريع"));
    expect(scrolls.at(-1)?.id).toBe("eb-sp-projects-title");
    expect(region.querySelector('[data-project-code="P2"]')).toBeTruthy();       // still the opened project
    expect(m.gets("/api/student-project-tracker")).toBe(tracker);
    // the Today Hub's own «تقدمك» shortcut still works exactly as before (the portal's existing helper)
    fireEvent.click(within(screen.getByRole("region", { name: "أكمل من حيث توقفت" })).getByRole("button", { name: "تقدمك" }));
    await waitFor(() => expect(scrolls.at(-1)?.id).toBe("eb-sp-progress-title"));
  }, T);

  it("a student without projects: «المشاريع» stays in the bar but is marked unavailable", async () => {
    mount({ projects: { ok: true, enrolled: false } });
    await screen.findByRole("navigation", { name: "التنقل السريع في بوابة الطالب" }, SLOW);
    await screen.findByRole("region", { name: /المهام والواجبات/ });
    await waitFor(() => expect(navItem("المشاريع").getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(navItem("المشاريع"));
    expect(scrolls.some(s => s.id === "eb-sp-projects-title")).toBe(false);
  }, T);
});
