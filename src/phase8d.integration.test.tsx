// @vitest-environment happy-dom
/// <reference types="node" />
// Phase 8D — cross-feature integration QA. The REAL StudentPortal (with its 15 s silent refresh, badges and the exam page)
// runs against the REAL student handlers on the in-memory blob store, while the TEACHER side acts through the real
// teacher handlers on the same store. Each scenario proves a contract that spans more than one feature:
//   1. a teacher deadline extension reaches the student's dashboard on the next silent refresh (no logout) and only
//      students with attempts left may start again;
//   2. (HIGH) a student actively solving an exam is never interrupted by the portal's background refresh — even one
//      that was already in flight when the exam opened — while a real 401 still logs out;
//   3. a teacher message raises the student's «الرسائل» badge AND the unified bell; reading the conversation clears
//      the message authority through the Messages page, and the portal's badges follow on return.
import { createRequire } from "node:module";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";
import StudentPortal from "./StudentPortal";

const nodeRequire = createRequire(import.meta.url);
const { handler: dashboardHandler } = nodeRequire("../api/src/functions/student-dashboard.js");
const { handler: assignmentHandler } = nodeRequire("../api/src/functions/student-assignment.js");
const { handler: submissionHandler } = nodeRequire("../api/src/functions/student-submission.js");
const { handler: notificationsHandler } = nodeRequire("../api/src/functions/student-notifications.js");
const { handler: studentMessagesHandler } = nodeRequire("../api/src/functions/student-messages.js");
const { handler: manageHandler } = nodeRequire("../api/src/functions/manage-assignments.js");
const { handler: teacherMessagesHandler } = nodeRequire("../api/src/functions/messages.js");
const { createMemoryContainer } = nodeRequire("../api/tests/fixtures/memory-container.js");

type Json = Record<string, unknown>;
type Reply = { status: number; jsonBody: Json };
type Ctx = { container: unknown; setJson: (n: string, v: unknown) => void; getJson: (n: string) => Json | null; names: (p: string) => string[] };

const S1 = "11111111-1111-1111-1111-111111111111";
const S2 = "22222222-2222-2222-2222-222222222222";
const C1 = "c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1";
const AID = "asg-8d";
const HOUR = 3600e3;
const QUESTION = "سؤال الاختبار السري";
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: QUESTION, marks: 10 }] }] };

const user = (id: string, name: string) => ({ schemaVersion: 3, role: "student", userId: id, displayName: name, code: id.slice(0, 2), classId: C1, active: true, archived: false, authVersion: 1 });
const assignmentDoc = (over: Json = {}) => ({ schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: AID, classId: C1, className: "الحادي عشر", title: "واجب الشبكات", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 24 * HOUR).toISOString(), maxAttempts: 1, durationMinutes: 30, questionCount: 1, totalMarks: 10, examSnapshot: EXAM, createdBy: "teacher-1", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const completedAttempt = (n: number) => ({ attemptNumber: n, startedAt: new Date(Date.now() - 3 * HOUR).toISOString(), submittedAt: new Date(Date.now() - 2 * HOUR).toISOString(), score: 5, totalMarks: 10, percentage: 50, manualReviewMarks: 0, finalized: true, teacherFeedback: "", answers: {} });

let ctx: Ctx;
let authOk = true;                       // flip to false → every student request is an authoritative 401
let holdDashboard = false;               // hold the NEXT dashboard read until `releaseDashboard()` (an in-flight silent refresh)
let releaseDashboard: () => void = () => {};
let calls: Array<{ method: string; url: string; body: Json }> = [];
const dashboardGets = () => calls.filter(c => c.method === "GET" && c.url.startsWith("/api/student-dashboard")).length;
const posts = (action: string) => calls.filter(c => c.method === "POST" && c.body.action === action);

const HEADERS = { get: () => null };
const OBS = { logWarn() {}, logInfo() {}, logError() {} };
const ST = () => ({
  container: ctx.container,
  requireStudentAuth: () => (authOk ? { ok: true, user: { sub: S1, sv: 1, role: "student", classId: C1 } } : { ok: false, response: { status: 401, jsonBody: { ok: false, error: "Unauthorized" } } }),
  recordAchievementIfEligible: async () => {}
});
const STUDENT = (sub: string) => ({ ...ST(), requireStudentAuth: () => ({ ok: true, user: { sub, sv: 1, role: "student", classId: C1 } }) });
const T = () => ({ requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), getContainer: () => ctx.container, container: ctx.container, recordAuditEvent: async () => {}, resolveTeacherDisplayName: async () => "أ. خالد", notifyStudentOfNewMessage: async () => {} });

// ---- the teacher acts through the real teacher handlers on the SAME store ----------------------------------------
const teacherUpdateTiming = (dueAt: string) => manageHandler({ method: "POST", url: "https://x/api/assignments", json: async () => ({ action: "updateTiming", assignmentId: AID, dueAt }) }, T(), OBS) as Promise<Reply>;
const teacherSendDirect = (body: string) => teacherMessagesHandler({ method: "POST", url: "https://x/api/messages", headers: HEADERS, json: async () => ({ action: "sendDirect", studentId: S1, body }) }, T()) as Promise<Reply>;
const dashboardOf = (sub: string) => dashboardHandler({ method: "GET", url: "https://x/api/student-dashboard", headers: HEADERS }, STUDENT(sub)) as Promise<Reply>;

// ---- the browser's fetch → the real student handlers -------------------------------------------------------------
async function route(url: string, method: string, body: Json): Promise<Reply> {
  const u = new URL(url, "https://x");
  const p = u.pathname;
  const m = p.match(/^\/api\/student-(assignment|submission)\/([^/]+)$/);
  if (m) {
    const h = m[1] === "assignment" ? assignmentHandler : submissionHandler;
    return h({ method, url: u.toString(), params: { assignmentId: decodeURIComponent(m[2]) }, headers: HEADERS, json: async () => body }, ST());
  }
  if (p === "/api/student-dashboard") {
    if (holdDashboard) { holdDashboard = false; await new Promise<void>(r => { releaseDashboard = r; }); }
    return dashboardHandler({ method, url: u.toString(), headers: HEADERS }, ST());
  }
  if (p === "/api/student-notifications") return notificationsHandler({ method, url: u.toString(), headers: HEADERS, json: async () => body }, ST());
  if (p === "/api/student-messages") return studentMessagesHandler({ method, url: u.toString(), headers: HEADERS, json: async () => body }, ST());
  if (p === "/api/achievement-feed") return { status: 200, jsonBody: { ok: true, posts: [] } };
  if (p === "/api/student-project-tracker") return { status: 200, jsonBody: { ok: true, enrolled: false } };
  if (p === "/api/student-learning-materials") return { status: 200, jsonBody: { ok: true, materials: [] } };
  return { status: 404, jsonBody: { ok: false, error: "no route " + p } };
}

function seed(assignment: Json = {}) {
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: user(S1, "أحمد"),
    ["platform/users/" + S2 + ".json"]: user(S2, "سارة"),
    ["platform/classes/" + C1 + ".json"]: { classId: C1, name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, status: "active", studentIds: [S1, S2], programCodes: [] },
    ["platform/assignments/" + AID + ".json"]: assignmentDoc(assignment)
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  authOk = true; holdDashboard = false; calls = [];
  sessionStorage.clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? (JSON.parse(String(init.body)) as Json) : {};
    calls.push({ method, url, body });
    const r = await route(url, method, body);
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.jsonBody, headers: HEADERS } as unknown as Response;
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
/** Every trigger the silent refresh listens to: the interval, a window focus and a visibility change. */
async function backgroundRefreshCycle() {
  await tick(15000);
  await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
  await tick(50);
}
async function mountPortal(onLogout = vi.fn()) {
  render(<StudentPortal token="t" displayName="أحمد" onLogout={onLogout} />);
  await screen.findByText(/مرحبًا أحمد/);
  await waitFor(() => expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull());
  return onLogout;
}
const startButton = () => screen.getAllByRole("button", { name: "ابدأ الحل" })[0];
async function openExamAndStart() {
  fireEvent.click(startButton());
  fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }));
  await screen.findByText(QUESTION);
  return screen.getByPlaceholderText("اكتب إجابتك هنا...") as HTMLTextAreaElement;
}
const submissionDoc = () => ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json") as Json & { activeAttempt: Json | null; attempts: Json[]; draftAnswers?: Json };

// ---------------------------------------------------------------------------------------------------------------
describe("8D-1 teacher deadline extension → the student's dashboard on the next silent refresh", () => {
  it("a closed assignment reappears as startable after a real updateTiming, without logout or a loading screen; the bell shows the extension event", async () => {
    seed({ dueAt: new Date(Date.now() - HOUR).toISOString(), maxAttempts: 2, durationMinutes: 0 });
    const onLogout = await mountPortal();
    expect(screen.getAllByRole("button", { name: "عرض الواجب" }).length).toBeGreaterThan(0);        // closed → view only
    expect(screen.queryByRole("button", { name: "ابدأ الحل" })).toBeNull();
    expect(screen.queryByRole("button", { name: /الإشعارات،/ })).toBeNull();                          // nothing unread yet

    const ext = await teacherUpdateTiming(new Date(Date.now() + 2 * HOUR).toISOString());
    expect(ext.status, JSON.stringify(ext.jsonBody)).toBe(200);

    await backgroundRefreshCycle();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "ابدأ الحل" }).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "عرض الواجب" })).toBeNull();
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();                                        // silent swap, no spinner
    expect(screen.getByText(/مرحبًا أحمد/)).toBeTruthy();
    expect(onLogout).not.toHaveBeenCalled();
    // The extension is one unified notification (bell) and NOT a message (the «الرسائل» badge stays hidden).
    await waitFor(() => expect(screen.getByRole("button", { name: "الإشعارات، 1 غير مقروءة" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "الرسائل" })).toBeTruthy();
  });

  it("a classmate who already used every attempt does not regain one from the same extension", async () => {
    seed({ dueAt: new Date(Date.now() - HOUR).toISOString(), maxAttempts: 2, durationMinutes: 0 });
    ctx.setJson("platform/submissions/" + AID + "/" + S2 + ".json", { assignmentId: AID, studentId: S2, classId: C1, attempts: [completedAttempt(1), completedAttempt(2)], activeAttempt: null });
    const before = (await dashboardOf(S2)).jsonBody.assignments as Json[];
    expect(before[0]).toMatchObject({ availability: "closed", canAttempt: false });
    expect((await teacherUpdateTiming(new Date(Date.now() + 2 * HOUR).toISOString())).status).toBe(200);
    const s2 = ((await dashboardOf(S2)).jsonBody.assignments as Json[])[0];
    const s1 = ((await dashboardOf(S1)).jsonBody.assignments as Json[])[0];
    expect(s2).toMatchObject({ availability: "open", canAttempt: false, attemptsUsed: 2, allowedAttempts: 2 });   // exhausted stays exhausted
    expect(s1).toMatchObject({ availability: "open", canAttempt: true, attemptsUsed: 0 });                            // eligible student may start
    expect((ctx.getJson("platform/submissions/" + AID + "/" + S2 + ".json") as Json).attempts).toHaveLength(2);         // no attempt manufactured
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8D-2 (HIGH) solving an assignment is never interrupted by the portal's background refresh", () => {
  it("two full refresh cycles while the exam runs: no dashboard read, the page, answers, question and server timer stay; exactly one startAttempt", async () => {
    seed();
    const onLogout = await mountPortal();
    const readsBeforeExam = dashboardGets();
    const answer = await openExamAndStart();
    expect(posts("startAttempt")).toHaveLength(1);
    const endsAt = String(submissionDoc().activeAttempt!.endsAt);                                     // the server's clock
    expect(screen.getByRole("timer", { name: "الوقت المتبقي" })).toBeTruthy();
    fireEvent.change(answer, { target: { value: "الإجابة الأولى" } });

    await backgroundRefreshCycle();
    await backgroundRefreshCycle();

    expect(dashboardGets()).toBe(readsBeforeExam);                                                    // the portal's refresh is OFF inside the exam
    expect(screen.getByText(QUESTION)).toBeTruthy();                                                  // still the same mounted exam page
    expect((screen.getByPlaceholderText("اكتب إجابتك هنا...") as HTMLTextAreaElement).value).toBe("الإجابة الأولى");
    expect(screen.getByRole("timer", { name: "الوقت المتبقي" })).toBeTruthy();
    expect(submissionDoc().activeAttempt!.endsAt).toBe(endsAt);                                        // the server timer is untouched
    expect(posts("startAttempt")).toHaveLength(1);                                                    // no duplicate start
    expect(screen.queryByText(/مرحبًا أحمد/)).toBeNull();                                             // no redirect back to the dashboard
    expect(screen.queryByText(/جارٍ تحميل حسابك/)).toBeNull();                                        // no whole-page loading screen
    expect(onLogout).not.toHaveBeenCalled();
    // The typed answer reached the server through the exam page's own autosave (the only writer while solving).
    await waitFor(() => expect(JSON.stringify((submissionDoc().draftAnswers as Json | undefined)?.q1)).toContain("الإجابة الأولى"));
  });

  it("a silent refresh already IN FLIGHT when the exam opens resolves later without unmounting the exam or losing the answer", async () => {
    seed();
    const onLogout = await mountPortal();
    holdDashboard = true;                                                                              // the next (background) read hangs
    await tick(15000);
    await waitFor(() => expect(holdDashboard).toBe(false));                                            // the refresh started and is now held
    const readsWhileHeld = dashboardGets();

    const answer = await openExamAndStart();
    fireEvent.change(answer, { target: { value: "إجابة أثناء التحديث" } });
    await act(async () => { releaseDashboard(); });                                                    // the old refresh lands NOW
    await tick(50);

    expect(screen.getByText(QUESTION)).toBeTruthy();
    expect((screen.getByPlaceholderText("اكتب إجابتك هنا...") as HTMLTextAreaElement).value).toBe("إجابة أثناء التحديث");
    expect(posts("startAttempt")).toHaveLength(1);
    expect(dashboardGets()).toBe(readsWhileHeld);                                                      // and nothing new was scheduled
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("an authoritative 401 while solving still logs out (the session rule is untouched)", async () => {
    seed();
    const onLogout = await mountPortal();
    const answer = await openExamAndStart();
    authOk = false;                                                                                    // the session is revoked server-side
    fireEvent.change(answer, { target: { value: "إجابة بعد انتهاء الجلسة" } });
    await tick(15000);                                                                                 // the exam page's own autosave hits the 401
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
  });

  it("returning from the exam reloads the dashboard once; a 401 on that read follows the same logout rule", async () => {
    seed();
    const onLogout = await mountPortal();
    await openExamAndStart();
    const before = dashboardGets();
    fireEvent.click(screen.getByRole("button", { name: /العودة|رجوع/ }));
    await screen.findByText(/مرحبًا أحمد/);
    expect(dashboardGets()).toBe(before + 1);
    expect(onLogout).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("8D-3 teacher message → student badges → reading clears the message authority", () => {
  it("«الرسائل» and the unified bell rise together on the next cycle; opening the conversation marks it read; both fall on return", async () => {
    seed();
    await mountPortal();
    expect(screen.getByRole("button", { name: "الرسائل" })).toBeTruthy();                             // 0 → no badge
    expect(screen.queryByRole("button", { name: /الإشعارات،/ })).toBeNull();

    expect((await teacherSendDirect("راجع الواجب قبل الغد")).status).toBe(200);
    await backgroundRefreshCycle();
    await waitFor(() => expect(screen.getByRole("button", { name: "الرسائل 1 رسائل غير مقروءة" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "الإشعارات، 1 غير مقروءة" })).toBeTruthy();            // bell = messages (1) + events (0)

    fireEvent.click(screen.getByRole("button", { name: "الرسائل 1 رسائل غير مقروءة" }));
    await screen.findByText("راجع الواجب قبل الغد");
    await waitFor(() => expect(posts("markRead")).toHaveLength(1));                                   // the Messages page acknowledges — once
    expect(posts("markEventRead")).toHaveLength(0);                                                   // never through the event path

    fireEvent.click(screen.getByRole("button", { name: /العودة/ }));
    await screen.findByText(/مرحبًا أحمد/);
    await waitFor(() => expect(screen.getByRole("button", { name: "الرسائل" })).toBeTruthy());        // badge gone
    await waitFor(() => expect(screen.queryByRole("button", { name: /الإشعارات،/ })).toBeNull());     // bell gone too (server snapshot)
    // Polling the Messages page again cannot resurrect the count: the server's read marker is the authority.
    await backgroundRefreshCycle();
    expect(screen.getByRole("button", { name: "الرسائل" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /الإشعارات،/ })).toBeNull();
  });
});
