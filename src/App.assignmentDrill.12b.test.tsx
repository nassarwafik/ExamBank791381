// @vitest-environment happy-dom
//
// Phase 12B — the whole chain through the REAL App: teacher login → «لوحة المتابعة» (TeacherTodayHub inside the lazy
// TeacherPlatform) → a «بانتظار التصحيح» row → App's openAssignmentTarget → the assignments workspace with the EXACT
// assignment open and the EXISTING «بانتظار التصحيح» gradebook filter pressed. Then: ordinary shell navigation never
// replays the consumed target, the Today Hub is unmounted (no silent refresh) while the teacher works elsewhere, and a
// logout / new session starts clean.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
const CLASSES = [{ classId: "c1", name: "الحادي عشر", grade: "11", active: true, status: "active" }, { classId: "c2", name: "العاشر", grade: "10", active: true, status: "active" }];
const A = (assignmentId: string, classId: string, title: string) => ({ assignmentId, classId, className: classId === "c1" ? "الحادي عشر" : "العاشر", title, instructions: "x", status: "published", openAt: "", dueAt: "", questionCount: 1, totalMarks: 100, maxAttempts: 3, durationMinutes: 0 });
const lr = { attemptNumber: 1, score: 62, totalMarks: 100, percentage: 62, submittedAt: "2026-03-01T10:00:00.000Z", finalized: false, manualReviewMarks: 18, gradingStatus: "pendingReview" };
const ROSTER = [
  { studentId: "s1", studentName: "زيد", studentCode: "Z1", attemptsUsed: 1, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "submitted", gradingStatus: "pendingReview", activeAttempt: null, attempts: [lr], latestResult: lr },
  { studentId: "s3", studentName: "سعد", studentCode: "S3", attemptsUsed: 0, allowedAttempts: 3, dueAtOverride: null, attemptStatus: "notStarted", gradingStatus: "notSubmitted", activeAttempt: null, attempts: [], latestResult: null },
];
const TODAY = {
  ok: true, generatedAt: "2026-03-10T10:00:00.000Z", scope: { activeClasses: 2, students: 4, publishedAssignments: 2 },
  attention: {
    activeAttempts: { count: 0, items: [] }, notStarted: { count: 0, assignments: 0, items: [] },
    pendingReview: { count: 1, assignments: 1, items: [{ assignmentId: "a2", title: "واجب العاشر", className: "العاشر", pendingReview: 1 }] },
    unreadMessages: { total: 0, capped: false }
  },
  recent: [], partial: []
};
const SLOW = { timeout: 8000 };
let calls: { url: string; method: string }[] = [];
function installFetch() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("/api/platform-login")) return res(200, { ok: true, role: "teacher", token: "teacher-token", displayName: "المعلم" });
    if (url.includes("/api/teacher-today")) return res(200, TODAY);
    if (url.includes("/api/teacher-analytics")) return res(500, { ok: false, error: "x" });
    if (url.includes("/api/classrooms") && method === "GET") return res(200, { ok: true, classes: CLASSES });
    if (url.includes("/api/assignments") && method === "GET") return res(200, { ok: true, assignments: [A("a1", "c1", "واجب الحادي عشر"), A("a2", "c2", "واجب العاشر")] });
    if (url.includes("/api/assignment-results") && method === "GET") return res(200, { ok: true, stats: { students: 2, submitted: 1, pendingReview: 1, finalized: 0, notSubmitted: 1, active: 0, average: 62, highest: 62, lowest: 62 }, students: ROSTER });
    return res(200, { ok: true, classes: [], students: [], assignments: [], projects: [], items: [], posts: [], exams: [], totalUnread: 0, capped: false, byProject: {}, totalReadyForReview: 0 });
  }) as unknown as typeof fetch;
}
async function login() {
  fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: "T" } });
  fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: "pw" } });
  fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  await waitFor(() => expect(document.querySelector(".app-sidebar-logout")).toBeTruthy(), SLOW);
}
const nav = (label: RegExp) => act(async () => { fireEvent.click(within(screen.getByRole("complementary", { name: "التنقل الرئيسي" })).getByRole("button", { name: label })); });
const reads = (part: string) => calls.filter(c => c.method === "GET" && c.url.includes(part)).length;
const detailTitle = () => document.querySelector("#eb-assign-detail-title")?.textContent ?? null;
const pressedChip = () => [...document.querySelectorAll(".gradebook-chip")].filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.textContent);

beforeEach(() => {
  calls = [];
  try { sessionStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  installFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("12B App — Today Hub row → exact assignment + pending-review gradebook, with no replay", () => {
  it("a pending-review row opens the exact assignment (in its own class) with «بانتظار التصحيح» pressed; navigation away and back replays nothing", async () => {
    vi.resetModules();
    const { default: App } = await import("./App");
    render(<App />);
    await login();
    await nav(/^لوحة المتابعة/);
    const row = await screen.findByRole("button", { name: "افتح واجب واجب العاشر — تسليم واحد بانتظار التصحيح" }, SLOW);
    const todayBefore = reads("/api/teacher-today");
    await act(async () => { fireEvent.click(row); });
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"), SLOW);
    await waitFor(() => expect(pressedChip()).toEqual(["بانتظار التصحيح"]), SLOW);
    expect(screen.queryByRole("region", { name: "ما الذي يحتاج انتباهي الآن؟" })).toBeNull();   // Today unmounted: no silent refresh
    expect((screen.getByLabelText("الصف") as HTMLSelectElement).value).toBe("c2");
    expect(reads("/api/assignment-results")).toBe(1);
    expect(reads("/api/teacher-today")).toBe(todayBefore);                                     // Today never read results itself
    // the teacher takes over; the consumed target never snaps back
    fireEvent.click(screen.getByText("الكل", { selector: ".gradebook-chip" }));
    expect(pressedChip()).toEqual(["الكل"]);
    // leave through the shell and come back to «الواجبات»: a fresh, ordinary workspace (no replayed target)
    await nav(/^الصفوف والطلاب/);
    await nav(/^الواجبات/);
    await screen.findByText("واجب الحادي عشر", { selector: "strong" }, SLOW);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(detailTitle()).toBeNull();
    expect(reads("/api/assignment-results")).toBe(1);
  }, 20000);

  it("logout clears everything: a new session reaching «الواجبات» from the sidebar opens no assignment", async () => {
    vi.resetModules();
    const { default: App } = await import("./App");
    render(<App />);
    await login();
    await nav(/^لوحة المتابعة/);
    const row = await screen.findByRole("button", { name: /افتح واجب واجب العاشر/ }, SLOW);
    await act(async () => { fireEvent.click(row); });
    await waitFor(() => expect(detailTitle()).toBe("واجب العاشر"), SLOW);
    await act(async () => { fireEvent.click(document.querySelector(".app-sidebar-logout") as HTMLElement); });
    await waitFor(() => expect(document.querySelector("form.auth-form")).toBeTruthy(), SLOW);
    calls = [];
    await login();
    await nav(/^الواجبات/);
    await screen.findByText("واجب العاشر", { selector: "strong" }).catch(() => null);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(detailTitle()).toBeNull();
    expect(reads("/api/assignment-results")).toBe(0);
  }, 20000);
});
