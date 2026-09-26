// @vitest-environment happy-dom
//
// UX-6a review regression — the global ready-for-review summary is App-owned and must be re-read (exactly one
// aggregated `projects-summary` GET) after a successful project mutation that can change ready counts, so the
// ProjectHub cards and the sidebar badge show the authoritative value when the teacher returns. Note-only
// updates, failed mutations and cancelled resets never refresh it; the project catalog is never re-fetched.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import App from "./App";

const TRACKS = [{ trackId: "book", title: "الكتاب", icon: "📘" }];
const PROJECTS = [{ projectCode: "794589", title: "مشروع 794589", tracks: TRACKS }];
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2025-2026", status: "active", studentCount: 1 }];
const STAGES = [{ stageId: "B01", track: "book", groupId: "g1", title: "مقدمة الشبكات", order: 1, weight: 1, required: true, active: true }];
const GROUPS = [{ groupId: "g1", track: "book", title: "الوحدة الأولى", order: 1 }];
const CARD = { studentId: "s1", displayName: "زيد صالح", code: "P1", overallProgress: 20, trackProgress: { book: 20 }, counts: { not_started: 0, in_progress: 0, ready_for_review: 1, approved: 0 }, readyForReviewCount: 1, complete: false, updatedAt: "2026-03-01T10:00:00.000Z", stale: false };
const DETAIL = { ok: true, readOnly: false, projectCode: "794589", student: { studentId: "s1", displayName: "زيد صالح", code: "P1" }, tracks: TRACKS, summary: CARD, stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40, balanceWarningThreshold: 30 }, progress: { B01: { status: "ready_for_review", note: "", updatedAt: "2026-03-01T10:00:00.000Z" } }, history: [], nextStages: { book: null }, balance: null };
const TEMPLATE = { stages: STAGES, groups: GROUPS, trackWeights: { book: 1 }, config: { staleDays: 7, lateThreshold: 40 } };

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[] = [];
let ready = 2;
let failProgress = false;
const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);

function installFetch() {
  globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, "");
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/project-tracker")) {
      if (method === "POST") {
        if (body?.action === "progress.update") {
          if (failProgress) return res(503, { ok: false, error: "تعارض مؤقت." });
          if (body.status !== undefined) ready -= 1;                                                 // server-side truth after the approval
          return res(200, { ok: true, summary: { ...CARD, readyForReviewCount: 0 }, stage: { stageId: "B01", status: body.status ?? "ready_for_review", note: body.note ?? "", updatedAt: "2026-03-05T10:00:00.000Z" }, nextStages: { book: null }, balance: null, history: [] });
        }
        if (body?.action === "template.update") { return res(200, { ok: true, template: TEMPLATE }); }
        if (body?.action === "project.reset") { ready = 0; return res(200, { ok: true, deletedProgressCount: 1 }); }
        return res(400, { ok: false, error: "x" });
      }
      const u = new URL(url, "http://x");
      const resource = u.searchParams.get("resource");
      if (resource === "projects-summary") return res(200, { ok: true, totalReadyForReview: ready, byProject: { "794589": ready } });
      if (resource === "projects") return res(200, { ok: true, projects: PROJECTS });
      if (resource === "classes") return res(200, { ok: true, projectCode: "794589", title: "مشروع 794589", tracks: TRACKS, classes: CLASSES });
      if (resource === "summary") return res(200, { ok: true, summary: { studentCount: 1, avgOverall: 20, trackAverages: { book: 20 }, completedCount: 0, studentsReadyForReview: 1, totalReadyStages: 1, staleCount: 0, trackWeights: { book: 1 }, staleDays: 7 } });
      if (resource === "students") return res(200, { ok: true, students: [CARD], tracks: TRACKS, config: { lateThreshold: 40 } });
      if (resource === "student") return res(200, DETAIL);
      if (resource === "template") return res(200, { ok: true, template: TEMPLATE, tracks: TRACKS, readOnly: false });
      return res(400, { ok: false });
    }
    if (url.includes("/api/classrooms")) return res(200, { ok: true, classes: [] });
    if (url.includes("/api/students")) return res(200, { ok: true, students: [] });
    if (url.includes("/api/assignments")) return res(200, { ok: true, assignments: [] });
    if (url.includes("/api/saved-exams")) return res(200, { ok: true, exams: [] });
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    return res(200, { ok: true });
  }) as unknown as typeof fetch;
}

const summaryReads = () => calls.filter(c => c.method === "GET" && c.url === "/api/project-tracker?resource=projects-summary").length;
const catalogReads = () => calls.filter(c => c.method === "GET" && c.url === "/api/project-tracker?resource=projects").length;
const posts = () => calls.filter(c => c.method === "POST" && c.url.includes("/api/project-tracker")).map(c => c.body);
const sidebar = () => screen.getByRole("complementary", { name: "التنقل الرئيسي" });
const projectsNav = () => within(sidebar()).getByRole("button", { name: /^المشاريع/ });
const hubCard = () => screen.getByRole("heading", { level: 2, name: "مشروع 794589" }).closest(".eb-project-card") as HTMLElement;

async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy());
  await waitFor(() => expect(summaryReads()).toBe(1));
}
async function openHub() { fireEvent.click(projectsNav()); return await screen.findByRole("button", { name: "فتح المشروع" }); }
async function openProjectStudents() {
  fireEvent.click(await openHub());
  await screen.findByRole("region", { name: "مساحة عمل المشروع" });
  fireEvent.click(await screen.findByRole("button", { name: "تقدّم الطلاب" }));
  await screen.findByText("زيد صالح");
  fireEvent.click(screen.getByRole("button", { name: "فتح ملف الطالب" }));
  await screen.findByRole("heading", { level: 2, name: "ملف المشروع: زيد صالح" });
  // Phase 8C: the B01 row carries the grading controls inline; open its details / note disclosure too.
  const row = document.querySelector('[data-stage-id="B01"]') as HTMLElement;
  fireEvent.click(within(row).getByRole("button", { name: "تفاصيل وملاحظة المرحلة B01" }));
  return row;
}
function backToHub() {
  const crumbs = screen.getByRole("navigation", { name: "مسار الصفحة" });
  fireEvent.click(within(crumbs).getByRole("button", { name: "المشاريع" }));
}

beforeEach(() => {
  calls = []; ready = 2; failProgress = false;
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  installFetch();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("UX-6a review — App-owned ready summary invalidation", () => {
  it("status mutation: hub shows 2 → approve one stage → exactly one extra projects-summary GET → hub card and sidebar badge show the authoritative 1; catalog read stays at 1", async () => {
    render(<App />); await login();
    expect(within(await openHub()).getByText("فتح المشروع")).toBeTruthy();
    expect(within(hubCard()).getByText("2 مراحل بانتظار الفحص")).toBeTruthy();
    expect(projectsNav().textContent).toMatch(/2/);
    const panel = await openProjectStudents();
    // Entering the projects view already re-checks the summary (pre-existing teacherView dependency); everything
    // below is measured against that baseline — opening the project, a view or a student adds nothing.
    const base = summaryReads();
    expect(base).toBe(2);
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة B01" }));
    await waitFor(() => expect(posts()).toEqual([{ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", status: "approved" }]));
    await waitFor(() => expect(summaryReads()).toBe(base + 1));                                       // exactly one refresh
    await waitFor(() => expect(projectsNav().textContent).toMatch(/1\s*مراحل بانتظار الفحص/));         // sidebar badge updated
    backToHub();
    await screen.findByRole("button", { name: "فتح المشروع" });
    expect(within(hubCard()).getByText("1 مراحل بانتظار الفحص")).toBeTruthy();                        // hub renders the App-owned value
    expect(summaryReads()).toBe(base + 1);                                                             // returning to the hub adds no read
    expect(catalogReads()).toBe(1);
  });
  it("note-only update → no summary refresh; failed status mutation → no summary refresh", async () => {
    render(<App />); await login();
    const panel = await openProjectStudents();
    const base = summaryReads();
    fireEvent.change(within(panel).getByLabelText("ملاحظة المعلم"), { target: { value: "أحسنت" } });
    fireEvent.click(within(panel).getByRole("button", { name: "حفظ الملاحظة" }));
    await screen.findByText("تم حفظ الملاحظة.");
    expect(posts()).toEqual([{ projectCode: "794589", action: "progress.update", classId: "c1", studentId: "s1", stageId: "B01", note: "أحسنت" }]);
    expect(summaryReads()).toBe(base);
    failProgress = true;
    fireEvent.click(within(panel).getByRole("button", { name: "اعتماد المرحلة B01" }));
    await screen.findByText(/تعارض مؤقت/);
    expect(posts()).toHaveLength(2);
    expect(summaryReads()).toBe(base);
    expect(catalogReads()).toBe(1);
  });
  it("template.update → one summary refresh; reset cancel → none; confirmed project.reset → one more; hub shows 0", async () => {
    render(<App />); await login();
    fireEvent.click(await openHub());
    await screen.findByRole("region", { name: "مساحة عمل المشروع" });
    fireEvent.click(await screen.findByRole("button", { name: "إعداد المراحل" }));
    const bar = await screen.findByRole("region", { name: "أدوات إعداد المراحل" });
    const base = summaryReads();
    fireEvent.click(within(bar).getByRole("button", { name: "حفظ التغييرات" }));
    await screen.findByText("✓ تم حفظ إعداد المراحل.");
    await waitFor(() => expect(summaryReads()).toBe(base + 1));
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    let dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(summaryReads()).toBe(base + 1);
    fireEvent.click(screen.getByRole("button", { name: "تصفير المشروع…" }));
    dialog = await screen.findByRole("dialog", { name: "تصفير المشروع للصف" });
    fireEvent.click(within(dialog).getByRole("button", { name: "نعم، صفّر المشروع" }));
    await screen.findByText(/تم تصفير المشروع لهذا الصف/);
    await waitFor(() => expect(summaryReads()).toBe(base + 2));
    expect(posts().map(b => b?.action)).toEqual(["template.update", "project.reset"]);
    backToHub();
    await screen.findByRole("button", { name: "فتح المشروع" });
    expect(within(hubCard()).getByText("لا مراحل بانتظار الفحص")).toBeTruthy();
    expect(projectsNav().querySelector(".eb-nav-badge")).toBeNull();
    expect(catalogReads()).toBe(1);
  });
});
