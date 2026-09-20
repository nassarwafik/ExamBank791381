// @vitest-environment happy-dom
//
// Class Learning Materials — «موادي التعليمية» in the Student Portal: placement after the "now" section, the
// released-only course card, the empty state, local degrade (never a logout), opening the SAME LearningReader
// full-screen with the restricted content API, open-time entitlement revalidation, back to the portal, and the
// untouched neighbours (dashboard session authority, assignments, projects, achievements). Plus static guards:
// one Reader (no student fork), the Reader is lazy from the portal, and no book body is imported eagerly.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync, existsSync } from "fs";
import path from "path";
import StudentPortal from "./StudentPortal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const SLOW = { timeout: 8000 }, T = 20000;
const M01 = "791381-m01", M02 = "791381-m02", M07 = "791381-m07";
const MOD = { [M01]: { moduleId: M01, title: "أساسيات الشبكات", order: 1 }, [M02]: { moduleId: M02, title: "الأعداد والموازين", order: 2 }, [M07]: { moduleId: M07, title: "عناوين IP", order: 3 } };
const materials = (ids: string[]) => ({ ok: true, materials: ids.length ? [{ courseId: "791381", title: "شبكات الاتصال", modules: ids.map(id => MOD[id as keyof typeof MOD]) }] : [] });
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
const stats = { assigned: 1, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
const assignment = { assignmentId: "A1", title: "واجب الشبكات", instructions: "", openAt: "", dueAt: "", questionCount: 3, totalMarks: 10, availability: "open", dashboardState: "available", gradingStatus: "notSubmitted", attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, latestScore: null, latestPercentage: null, createdAt: "" };
const PROJECT = { ok: true, enrolled: true, className: "الصف", projects: [{ projectCode: "794589", title: "مشروع الكتاب", tracks: [{ trackId: "book", title: "الكتاب", icon: "" }], summary: { studentId: "u1", displayName: "أحمد", code: "C1", overallProgress: 10, trackProgress: { book: 10 }, counts: { not_started: 1, in_progress: 0, ready_for_review: 0, approved: 0 }, readyForReviewCount: 0, complete: false }, stages: [{ stageId: "B01", track: "book", groupId: "g1", title: "قراءة", order: 1 }], groups: [{ groupId: "g1", track: "book", title: "المرحلة", order: 1 }], progress: {}, nextStages: { book: null } }] };

type Calls = { url: string; method: string }[];
function mount(opts: { materials?: (n: number) => unknown; dashboardStatus?: number } = {}) {
  const calls: Calls = [];
  let materialCalls = 0;
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url: url.replace(/\?.*$/, ""), method });
    if (url.includes("/api/student-dashboard")) return res(opts.dashboardStatus || 200, opts.dashboardStatus === 401 ? { ok: false, error: "انتهت الجلسة" } : { student, classroom, assignments: [assignment], stats });
    if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
    if (url.includes("/api/student-project-tracker")) return res(200, PROJECT);
    if (url.includes("/api/student-learning-materials")) { materialCalls += 1; const r = opts.materials ? opts.materials(materialCalls) : materials([M01, M02]); return r instanceof Promise ? r : res(200, r); }
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
  const onLogout = vi.fn();
  const utils = render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  return { ...utils, calls, onLogout, materialGets: () => calls.filter(c => c.method === "GET" && c.url === "/api/student-learning-materials").length };
}
const section = () => screen.findByRole("region", { name: "موادي التعليمية" });

describe("placement, card, empty state, degrade", () => {
  it("sits right after «ماذا عليّ أن أفعل الآن؟» and before «تقدّمي»; the card shows ONLY the released titles and count (m07 hidden, no hidden count)", async () => {
    mount();
    const s = await section();
    expect(s.previousElementSibling?.getAttribute("aria-labelledby")).toBe("eb-sp-now-title");
    expect(s.nextElementSibling?.textContent).toContain("تقدّمي");
    const card = await within(s).findByRole("article", { name: "شبكات الاتصال" });
    expect(within(card).getByText("كتاب 791381")).toBeTruthy();
    expect(within(card).getByText(/الوحدات المتاحة الآن:/).textContent).toBe("الوحدات المتاحة الآن: 2");
    expect(within(card).getAllByRole("listitem").map(li => li.textContent)).toEqual(["أساسيات الشبكات", "الأعداد والموازين"]);
    expect(card.textContent).not.toContain("عناوين IP");
    expect(card.textContent).not.toMatch(/أخرى|مخفي|%|تقدم/);
    expect(within(card).getByRole("button", { name: "فتح المادة" })).toBeTruthy();
  });
  it("nothing released → the exact empty state (shared EmptyState) and no card", async () => {
    mount({ materials: () => materials([]) });
    const s = await section();
    expect(await within(s).findByText("لا توجد مواد تعليمية مضافة لصفك حاليًا")).toBeTruthy();
    expect(within(s).getByText("ستظهر هنا تلقائيًا عندما ينشر المعلم مادة تعليمية لصفك.")).toBeTruthy();
    expect(s.querySelector(".eb-empty")).toBeTruthy();
    expect(within(s).queryByRole("article")).toBeNull();
  });
  it("a local API failure (500) degrades the panel only: error text, no alert, no logout, the rest of the portal intact", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { onLogout } = mount({ materials: () => res(500, { ok: false, error: "x" }) });
    const s = await section();
    expect(await within(s).findByText("تعذر تحميل موادك التعليمية الآن.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onLogout).not.toHaveBeenCalled();
    expect(await screen.findByRole("region", { name: /المهام والواجبات/ })).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });
  it("a 401 from the secondary endpoint is silent (empty state), NEVER a logout; a dashboard 401 still logs out (session authority unchanged)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = mount({ materials: () => res(401, { ok: false }) });
    expect(await within(await section()).findByText("لا توجد مواد تعليمية مضافة لصفك حاليًا")).toBeTruthy();
    expect(a.onLogout).not.toHaveBeenCalled();
    cleanup();
    const b = mount({ dashboardStatus: 401 });
    await waitFor(() => expect(b.onLogout).toHaveBeenCalledTimes(1));
  });
  it("neighbours untouched: assignments, projects and achievements still render with exactly one GET each; materials read once", async () => {
    const { calls, materialGets } = mount();
    await section();
    expect((await screen.findAllByText("واجب الشبكات")).length).toBeGreaterThan(0);   // now section + task list
    expect(await screen.findByRole("region", { name: "مشاريعي" })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "إنجازات الصف" })).toBeTruthy();
    await waitFor(() => expect(calls.filter(c => c.method === "GET").length).toBe(4));
    expect(materialGets()).toBe(1);
    expect(calls.filter(c => c.method === "POST")).toEqual([]);
  });
});

describe("open flow — the same LearningReader, revalidated entitlement, back to the portal", () => {
  it("«فتح المادة» re-reads the entitlement, opens the Reader full-screen with the student exit label and only released modules; back returns to the portal", async () => {
    const { materialGets } = mount();
    const card = await within(await section()).findByRole("article", { name: "شبكات الاتصال" });
    fireEvent.click(within(card).getByRole("button", { name: "فتح المادة" }));
    await waitFor(() => expect(materialGets()).toBe(2));                              // open-time revalidation
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);   // the Reader (first released page)
    expect(document.querySelector(".learning-reader")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "موادي التعليمية" })).toBeNull();      // full-screen: the portal is replaced
    const toc = within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" }));
    expect(toc.getAllByText("الأعداد والموازين").length).toBeGreaterThan(0);
    expect(toc.queryByText("عناوين IP")).toBeNull();
    const back = screen.getByRole("button", { name: "العودة إلى موادي التعليمية" });
    expect(screen.queryByRole("button", { name: "العودة إلى نظرة الكتاب" })).toBeNull();
    fireEvent.click(back);
    expect(await section()).toBeTruthy();
    expect(document.querySelector(".learning-reader")).toBeNull();
    expect(await screen.findByRole("region", { name: /المهام والواجبات/ })).toBeTruthy();
  }, T);
  it("OPEN-TIME REVALIDATION: portal loaded with m01,m02,m07; the server hides m07 before the click → the Reader has no m07", async () => {
    mount({ materials: n => materials(n === 1 ? [M01, M02, M07] : [M01, M02]) });
    const card = await within(await section()).findByRole("article", { name: "شبكات الاتصال" });
    expect(within(card).getByText(/الوحدات المتاحة الآن:/).textContent).toBe("الوحدات المتاحة الآن: 3");   // stale portal state
    fireEvent.click(within(card).getByRole("button", { name: "فتح المادة" }));
    await screen.findByRole("heading", { level: 2, name: "أساسيات الشبكات" }, SLOW);
    const toc = within(screen.getByRole("complementary", { name: "فهرس الكتاب (سطح المكتب)" }));
    expect(toc.queryByText("عناوين IP")).toBeNull();
    expect((screen.getByLabelText("انتقل إلى صفحة") as HTMLSelectElement).options.length).toBe(7 + 10);   // m01 (7) + m02 (10) pages only
  }, T);
  it("if the course was hidden entirely before the click, the Reader does not open and the panel explains", async () => {
    mount({ materials: n => materials(n === 1 ? [M01] : []) });
    const card = await within(await section()).findByRole("article", { name: "شبكات الاتصال" });
    fireEvent.click(within(card).getByRole("button", { name: "فتح المادة" }));
    expect(await within(await section()).findByText("لم تعد هذه المادة متاحة لصفك حاليًا.")).toBeTruthy();
    expect(document.querySelector(".learning-reader")).toBeNull();
    expect(within(await section()).queryByRole("article")).toBeNull();                 // the fresh (empty) entitlement replaced the stale card
  });
});

describe("architecture guards — one Reader, lazy from the portal, no eager book bodies", () => {
  const root = path.join(process.cwd(), "src") + path.sep;
  const read = (rel: string) => readFileSync(root + rel, "utf8");
  it("the student flow renders the SAME LearningReader; no duplicate Reader implementation exists", () => {
    // The student Reader mounts the SHARED Reader-plus-training host (the same one the teacher's Learning Materials
    // uses), and that host mounts the one LearningReader — the student side never re-implements either.
    const studentReader = read("student/StudentReader.tsx"), host = read("learning/training/LearningReaderWithTraining.tsx");
    expect(studentReader).toContain('from "../learning/training/LearningReaderWithTraining"');
    expect(studentReader).toContain("createRestrictedReaderContentApi");
    expect(studentReader).toMatch(/<LearningReaderWithTraining/);
    expect(host).toContain('from "../reader/LearningReader"');
    expect(host).toMatch(/<LearningReader\s/);
    expect(read("learning/LearningMaterialsPage.tsx")).toContain('import("./training/LearningReaderWithTraining")');
    for (const src of [studentReader, host]) expect(src).not.toMatch(/flattenPageRefs|nextPage|previousPage|LearningPageRenderer|learning-reader-/);   // no re-implemented navigation/rendering
    for (const forbidden of ["student/StudentLearningReader.tsx", "learning/reader/StudentLearningReader.tsx", "learning/reader/StudentReader.tsx"]) expect(existsSync(root + forbidden), forbidden).toBe(false);
    expect(read("learning/reader/LearningReader.tsx")).toContain("exitLabel");
  });
  it("StudentPortal code-splits the Reader and neither the portal nor the section imports a module body or the Reader eagerly", () => {
    const portal = read("StudentPortal.tsx"), section = read("student/StudentLearningMaterials.tsx");
    // Code-split via lazy(), now wrapped in the deployment-recovery helper (still one dynamic import of StudentReader).
    expect(portal).toContain('lazy(lazyWithRetry(() => import("./student/StudentReader"), "student-reader"))');
    for (const src of [portal, section]) {
      expect(src).not.toMatch(/from "\.\.?\/learning\/reader\/LearningReader"/);
      expect(src).not.toMatch(/content\/791381\/modules|content\/791381\/manifest|content\/registry/);
    }
    expect(section.match(/fetch\(/g)?.length).toBe(1);
    expect(section).toContain('fetch("/api/student-learning-materials"');
    expect(section).not.toMatch(/onLogout|localStorage|sessionStorage|classId/);
    expect(portal.match(/onLogout\(\)/g)?.length).toBe(4);
  });
  it("student card CSS: mobile-first single column, full-width 44px CTA, no fixed pixel widths, no horizontal overflow", () => {
    const css = read("studentportal-pro.css");
    const block = css.slice(css.indexOf("موادي التعليمية (Class Learning Materials)"));
    expect(block).toContain(".eb-sp-learning-list{ list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr;");
    expect(block).toContain(".eb-sp-learning-open{ width:100%; min-height:44px; }");
    expect(block).not.toMatch(/(?<!min-|max-)width:\s*\d{3,}px/);
    expect(block).not.toMatch(/overflow-x:\s*(scroll|auto)/);
    expect(block).toMatch(/@media \(min-width:768px\)/);
  });
});
