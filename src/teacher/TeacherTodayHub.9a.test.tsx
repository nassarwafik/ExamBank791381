// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import TeacherTodayHub, { type TeacherToday } from "./TeacherTodayHub";
import TeacherPlatform from "../TeacherPlatform";

// Phase 9A — the teacher's Today Hub / Command Center over GET /api/teacher-today: attention counts, unread messages,
// quick actions through the shell's navigation, recent activity, empty / partial / error states, and its place at the
// top of the dashboard workspace inside TeacherPlatform.
type Call = { url: string; method: string };
let calls: Call[] = [];
const json = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data } as Response);
const SUMMARY: TeacherToday = {
  generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 6, publishedAssignments: 3 },
  attention: {
    activeAttempts: { count: 2, items: [{ assignmentId: "P2", title: "واجب P2", className: "صف 1", studentId: "s02", studentName: "طالب s02", startedAt: "2026-03-10T09:55:00.000Z", status: "started" }, { assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s03", studentName: "طالب s03", startedAt: "2026-03-10T08:00:00.000Z", status: "paused" }] },
    notStarted: { count: 2, assignments: 2, items: [{ assignmentId: "P2", title: "واجب P2", className: "صف 1", dueAt: "2026-03-15T10:00:00.000Z", notStarted: 1, expected: 4 }, { assignmentId: "P1", title: "واجب P1", className: "صف 1", dueAt: "2026-03-20T10:00:00.000Z", notStarted: 1, expected: 4 }] },
    pendingReview: { count: 3, assignments: 3, items: [{ assignmentId: "P1", title: "واجب P1", className: "صف 1", pendingReview: 1 }] },
    unreadMessages: { total: 3, capped: false }
  },
  recent: [{ kind: "submitted", at: "2026-03-10T10:00:00.000Z", assignmentId: "P1", title: "واجب P1", className: "صف 1", studentId: "s01", studentName: "طالب s01", percentage: 92 }, { kind: "started", at: "2026-03-10T09:55:00.000Z", assignmentId: "P2", title: "واجب P2", className: "صف 1", studentId: "s02", studentName: "طالب s02" }],
  partial: []
};
const EMPTY: TeacherToday = { ...SUMMARY, attention: { activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] }, pendingReview: { count: 0, assignments: 0, items: [] }, unreadMessages: { total: 0, capped: false } }, recent: [] };

function mockFetch(today: () => Response | Promise<Response>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/api/teacher-today")) return today();
    if (url.includes("/api/teacher-analytics")) return json({ ok: false, error: "خادم التحليلات غير متاح للاختبار" }, 500);
    if (url.includes("/api/teacher-achievement-feed")) return json({ ok: true, posts: [] });
    if (url.includes("/api/classrooms")) return json({ ok: true, classes: [] });
    return json({ ok: true, projects: [], students: [], assignments: [], exams: [] });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  calls = [];
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const todayReads = () => calls.filter(c => c.method === "GET" && c.url === "/api/teacher-today").length;
const hub = () => screen.getByRole("region", { name: "ما الذي يحتاج انتباهي الآن؟" });

describe("9A TeacherTodayHub — attention, quick actions, recent activity", () => {
  it("ONE authenticated read; renders the four attention cards with counts, items and status text, plus the recent list", async () => {
    mockFetch(() => json({ ok: true, ...SUMMARY }));
    const onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} />);
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    expect(todayReads()).toBe(1);
    const init = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(new Headers(init.headers).get("x-builder-token")).toBe("tok");
    const active = within(screen.getByRole("article", { name: /محاولات نشطة الآن/ }));
    expect(active.getByText("2")).toBeTruthy();
    expect(active.getByText("طالب s02")).toBeTruthy();
    expect(active.getByText(/واجب P1 · صف 1 · متوقفة مؤقتًا/)).toBeTruthy();
    const ns = within(screen.getByRole("article", { name: /لم يبدؤوا بعد/ }));
    expect(ns.getByText(/1 من 4 · صف 1 · التسليم 2026-03-15/)).toBeTruthy();
    expect(within(screen.getByRole("article", { name: /بانتظار التصحيح/ })).getByText("3")).toBeTruthy();
    const msgs = within(screen.getByRole("article", { name: /رسائل غير مقروءة/ }));
    expect(msgs.getByText("3")).toBeTruthy();
    expect(msgs.getByText(/3 رسالة من طلابك بانتظار الرد/)).toBeTruthy();
    const recent = within(screen.getByRole("region", { name: "آخر نشاط في صفوفك" }));
    expect(recent.getAllByRole("listitem").length).toBe(2);
    expect(recent.getAllByRole("listitem")[0].textContent).toContain("طالب s01");
    expect(recent.getAllByRole("listitem")[0].textContent).toContain("سلّم «واجب P1» · 92%");
    expect(screen.queryByText("لا توجد عناصر تحتاج تدخلك الآن.")).toBeNull();
  });

  it("quick actions and card actions navigate through the shell (existing destinations), «تقدير طالب» jumps to the achievements feed", async () => {
    mockFetch(() => json({ ok: true, ...SUMMARY }));
    const onNavigate = vi.fn();
    render(<TeacherTodayHub token="tok" onNavigate={onNavigate} />);
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    const actions = within(screen.getByRole("group", { name: "إجراءات سريعة" }));
    fireEvent.click(actions.getByRole("button", { name: "فتح الرسائل" }));
    fireEvent.click(actions.getByRole("button", { name: "الواجبات" }));
    fireEvent.click(actions.getByRole("button", { name: "الصفوف والطلاب" }));
    fireEvent.click(actions.getByRole("button", { name: "التقارير" }));
    fireEvent.click(actions.getByRole("button", { name: "المشاريع" }));
    expect(onNavigate.mock.calls.map(c => c[0])).toEqual(["messages", "assignments", "students", "reports", "projects"]);
    fireEvent.click(within(screen.getByRole("article", { name: /رسائل غير مقروءة/ })).getByRole("button", { name: "فتح الرسائل" }));
    expect(onNavigate).toHaveBeenLastCalledWith("messages");
    fireEvent.click(within(screen.getByRole("article", { name: /محاولات نشطة الآن/ })).getByRole("button", { name: "الواجبات" }));
    expect(onNavigate).toHaveBeenLastCalledWith("assignments");
    const anchor = document.createElement("h2"); anchor.id = "eb-achievements-title"; document.body.appendChild(anchor);
    const scroll = vi.fn(); (anchor as unknown as { scrollIntoView: () => void }).scrollIntoView = scroll;
    fireEvent.click(actions.getByRole("button", { name: "تقدير طالب" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    anchor.remove();
    // Every quick action is a real ≥44px-on-phone button (CSS contract) with a text name.
    const css = readFileSync(path.join(process.cwd(), "src", "teacher", "teacherToday.css"), "utf8");
    expect(css).toMatch(/\.eb-today-actions \.eb-button\{ min-height:44px; \}/);
    expect(actions.getAllByRole("button").every(b => b.tagName === "BUTTON" && /\p{L}/u.test(b.textContent || ""))).toBe(true);
  });

  it("empty state: zero everywhere → «لا توجد عناصر تحتاج تدخلك الآن.» + the normal quick actions, no recent list", async () => {
    mockFetch(() => json({ ok: true, ...EMPTY }));
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    expect((await screen.findByText("لا توجد عناصر تحتاج تدخلك الآن.")).getAttribute("role")).toBe("status");
    expect(screen.getByRole("group", { name: "إجراءات سريعة" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "آخر نشاط في صفوفك" })).toBeNull();
    expect(within(screen.getByRole("article", { name: /لم يبدؤوا بعد/ })).getByText("بدأ الجميع واجباتهم المفتوحة.")).toBeTruthy();
  });

  it("partial source: unreadMessages null → only the messages card degrades (count —, note), the other cards stay", async () => {
    mockFetch(() => json({ ok: true, ...SUMMARY, attention: { ...SUMMARY.attention, unreadMessages: null }, partial: ["messages"] }));
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    const msgs = within(await screen.findByRole("article", { name: /رسائل غير مقروءة/ }));
    expect(msgs.getByText("—")).toBeTruthy();
    expect(msgs.getByText(/تعذر قراءة الرسائل الآن/)).toBeTruthy();
    expect(within(screen.getByRole("article", { name: /محاولات نشطة الآن/ })).getByText("2")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("error / malformed payload: an alert with an accessible retry that re-reads; a later failure keeps the last-good summary", async () => {
    let n = 0;
    mockFetch(() => { n += 1; return n === 1 ? json({ ok: false, error: "تعذر تحميل ملخص اليوم حاليًا." }, 500) : n === 2 ? json({ ok: true, projects: [] }) : n === 3 ? json({ ok: true, ...SUMMARY }) : json({ ok: false }, 500); });
    render(<TeacherTodayHub token="tok" onNavigate={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("تعذر تحميل ملخص اليوم حاليًا.");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));                       // malformed body → still an error, never a crash
    await waitFor(() => expect(todayReads()).toBe(2));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByRole("heading", { level: 3, name: /محاولات نشطة الآن/ });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /تحديث/ }));                                // manual refresh fails → last-good stays
    await waitFor(() => expect(todayReads()).toBe(4));
    expect(screen.getByRole("heading", { level: 3, name: /محاولات نشطة الآن/ })).toBeTruthy();
  });

  it("inside TeacherPlatform: the hub is the FIRST thing on the dashboard workspace, above the lazy analytics Dashboard, and reads its summary once", async () => {
    mockFetch(() => json({ ok: true, ...EMPTY }));
    render(<TeacherPlatform token="t" projects={[]} currentExam={null} workspaceTab="dashboard" onNavigate={vi.fn()} />);
    await screen.findByText("لا توجد عناصر تحتاج تدخلك الآن.");
    const alert = await screen.findByText(/خادم التحليلات غير متاح للاختبار/);                     // the (mocked-failing) analytics dashboard below
    expect(hub().compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hub().closest(".teacher-platform-inner")).toBeTruthy();
    expect(todayReads()).toBe(1);
  });
});
