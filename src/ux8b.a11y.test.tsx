// @vitest-environment happy-dom
// UX-8b — Accessibility, Contrast & Reduced Motion Closure (behavioural half; the stylesheet/contrast guards live in
// api/tests/ux2-shell-foundation.test.js because Vite's ?raw import of a .css file is empty in vitest).
//   A. field-specific validation only: the login empty-field check names the empty field(s), an authentication failure
//      stays form-level; the student identity rule names the identity field; server errors never mark a field.
//   B. StudentPortal programmatic scroll honours prefers-reduced-motion.
//   C. TeacherDashboard live regions: only conditional async states (loading / busy / error) are live; a successful
//      dashboard render exposes none.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import App from "./App";
import { AddStudentDialog, EditStudentDialog } from "./students/StudentForms";
import StudentPortal from "./StudentPortal";
import { validIdentity, IDENTITY_ERROR } from "./students/identity";

const charts = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("react-chartjs-2", () => {
  const make = (type: string) => (props: unknown) => { charts.calls.push({ type, props }); return <div data-testid={"chart-" + type} />; };
  return { Line: make("line"), Doughnut: make("doughnut"), Bar: make("bar") };
});
import TeacherDashboard from "./TeacherDashboard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const res = (status: number, body: unknown) => Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body } as Response);
function stubMatchMedia(reduced: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes("prefers-reduced-motion"), media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}

// ---------------------------------------------------------------- A. login ----------------------------------------------------------------
describe("UX-8b — login: only the local empty-field check is field-specific; authentication failure stays form-level", () => {
  const codeInput = () => document.querySelector('input[autocomplete="username"]') as HTMLInputElement;
  const passInput = () => document.querySelector('input[type="password"]') as HTMLInputElement;
  const submit = () => fireEvent.submit(document.querySelector("form.auth-form") as HTMLFormElement);
  function mountLogin(loginStatus = 401) {
    const calls: { url: string; body: unknown }[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.includes("/api/platform-login")) return res(loginStatus, loginStatus === 200 ? { ok: true, role: "teacher", token: "t", displayName: "أ" } : { ok: false, error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
      return res(200, { ok: true });
    }) as unknown as typeof fetch;
    render(<App />);
    return calls;
  }

  it("both fields empty → both inputs aria-invalid and described by the visible error; typing in one field clears only that field's relationship", async () => {
    mountLogin();
    submit();
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("أدخل كود المستخدم وكلمة المرور.");
    expect(error.id).toBe("auth-login-error");
    expect(codeInput().getAttribute("aria-invalid")).toBe("true");
    expect(passInput().getAttribute("aria-invalid")).toBe("true");
    expect(codeInput().getAttribute("aria-describedby")).toBe("auth-login-error");
    expect(passInput().getAttribute("aria-describedby")).toBe("auth-login-error");
    expect(document.getElementById(codeInput().getAttribute("aria-describedby") || "")).toBe(error);   // reference resolves
    fireEvent.change(codeInput(), { target: { value: "T-1" } });
    expect(codeInput().hasAttribute("aria-invalid")).toBe(false);                                        // stale relationship removed
    expect(codeInput().hasAttribute("aria-describedby")).toBe(false);
    expect(passInput().getAttribute("aria-invalid")).toBe("true");                                       // the still-empty field keeps it
  });

  it("only the password empty → only the password is named invalid", async () => {
    mountLogin();
    fireEvent.change(codeInput(), { target: { value: "T-1" } });
    submit();
    await screen.findByRole("alert");
    expect(codeInput().hasAttribute("aria-invalid")).toBe(false);
    expect(passInput().getAttribute("aria-invalid")).toBe("true");
  });

  it("authentication failure: the error is a form-level alert and NEITHER field is marked invalid; the request body and autocomplete values are unchanged", async () => {
    const calls = mountLogin(401);
    fireEvent.change(codeInput(), { target: { value: "T-1" } });
    fireEvent.change(passInput(), { target: { value: "pw" } });
    submit();
    const error = await screen.findByRole("alert");
    expect(error.textContent).toContain("اسم المستخدم أو كلمة المرور غير صحيحة");
    expect(codeInput().hasAttribute("aria-invalid")).toBe(false);
    expect(passInput().hasAttribute("aria-invalid")).toBe(false);
    expect(codeInput().hasAttribute("aria-describedby")).toBe(false);
    expect(passInput().hasAttribute("aria-describedby")).toBe(false);
    const login = calls.find(c => c.url.includes("/api/platform-login"))!;
    expect(login.body).toEqual({ userCode: "T-1", password: "pw" });
    expect(codeInput().getAttribute("autocomplete")).toBe("username");
    expect(passInput().getAttribute("autocomplete")).toBe("current-password");
    // the role note carries no emoji: icons are hidden from assistive tech and the labels stay plain text
    const note = document.querySelector(".login-role-note") as HTMLElement;
    expect(note.textContent?.replace(/\s+/g, " ").trim()).toBe("معلم طالب");
    expect(note.querySelectorAll('svg[aria-hidden="true"]').length).toBe(2);
    expect(note.textContent || "").not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});

// ------------------------------------------------------------ A. student forms ------------------------------------------------------------
describe("UX-8b — student forms: the identity-number rule is the one field-specific validation; server errors stay form-level", () => {
  const noop = () => {};
  const addProps = (identityNumber: string) => ({ open: true, onClose: noop, classroom: { classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true } as never, classActive: true, firstName: "أحمد", familyName: "علي", identityNumber, password: "", onFirstName: noop, onFamilyName: noop, onIdentityNumber: noop, onPassword: noop, canSubmit: validIdentity(identityNumber), onSubmit: noop, busy: false });
  const identityInput = () => screen.getByLabelText(/رقم الهوية/) as HTMLInputElement;

  it("AddStudentDialog: a malformed identity marks the field invalid and describes it with the visible rule; empty or valid values leave no ARIA relationship", () => {
    const r = render(<AddStudentDialog {...addProps("12345")} />);
    const input = identityInput();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errId = input.getAttribute("aria-describedby") || "";
    const err = document.getElementById(errId) as HTMLElement;
    expect(err.textContent).toBe(IDENTITY_ERROR);
    expect(err.className).toContain("eb-field-error");
    expect(screen.getByRole("button", { name: /إنشاء حساب/ }).hasAttribute("disabled")).toBe(true);        // existing gate unchanged
    r.rerender(<AddStudentDialog {...addProps("123456789")} />);
    expect(identityInput().hasAttribute("aria-invalid")).toBe(false);
    expect(identityInput().hasAttribute("aria-describedby")).toBe(false);
    expect(document.getElementById(errId)).toBeNull();                                                   // no stale reference target
    r.rerender(<AddStudentDialog {...addProps("")} />);
    expect(identityInput().hasAttribute("aria-invalid")).toBe(false);                                     // empty is not "malformed"
    // the other fields are never marked invalid by this rule
    for (const name of [/^الاسم$/, /اسم العائلة/]) expect((screen.getByLabelText(name) as HTMLElement).hasAttribute("aria-invalid")).toBe(false);
  });

  it("EditStudentDialog: same rule, same wiring, other fields untouched", () => {
    render(<EditStudentDialog open onClose={noop} classes={[{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true } as never]} firstName="أحمد" familyName="علي" identityNumber="12" classId="c1" password="" onFirstName={noop} onFamilyName={noop} onIdentityNumber={noop} onClassId={noop} onPassword={noop} canSubmit={false} onSubmit={noop} busy={false} />);
    const input = identityInput();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby") || "")?.textContent).toBe(IDENTITY_ERROR);
    expect((screen.getByLabelText(/^الصف$/) as HTMLElement).hasAttribute("aria-invalid")).toBe(false);
  });

  it("the shared rule is the same 9-digit check TeacherPlatform gates on", () => {
    expect(validIdentity("123456789")).toBe(true);
    expect(validIdentity("12345678")).toBe(false);
    expect(validIdentity("12345678a")).toBe(false);
    expect(validIdentity("")).toBe(false);
  });
});

// -------------------------------------------------------- B. StudentPortal scroll ---------------------------------------------------------
describe("UX-8b — StudentPortal programmatic scroll honours reduced motion", () => {
  const student = { userId: "u1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true };
  const classroom = { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" };
  const stats = { assigned: 1, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null };
  const asg = { assignmentId: "asg1", title: "واجب الشبكات", instructions: "", openAt: "", dueAt: "2030-01-01T10:00:00.000Z", questionCount: 1, totalMarks: 5, availability: "open", dashboardState: "available", gradingStatus: "notSubmitted", attemptStatus: "notStarted", attemptsUsed: 0, allowedAttempts: 1, hasActiveAttempt: false, canAttempt: true, latestResult: null };
  const detail = { assignmentId: "asg1", title: "واجب الشبكات", instructions: "", openAt: "", dueAt: "2030-01-01T10:00:00.000Z", maxAttempts: 1, questionCount: 1, totalMarks: 5, exam: { title: "امتحان", questions: [{ examQuestionId: "q1", presentationType: "open", text: "نص السؤال الأول في الواجب", marks: 5 }] } };
  function mountPortal(reduced: boolean) {
    stubMatchMedia(reduced);
    const scrolls: unknown[] = [];
    (window as unknown as { scrollTo: (o: unknown) => void }).scrollTo = (o: unknown) => { scrolls.push(o); };
    const calls: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input); calls.push(url);
      if (url.includes("/api/student-dashboard")) return res(200, { student, classroom, assignments: [asg], stats });
      if (url.includes("/api/achievement-feed")) return res(200, { ok: true, posts: [] });
      if (url.includes("/api/student-project-tracker")) return res(200, { ok: true, enrolled: false });
      if (url.includes("/api/student-assignment/asg1")) return res(200, { ok: true, assignment: detail });
      if (url.includes("/api/student-submission/")) return res(200, { ok: true, state: { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false } });
      return res(404, { ok: false });
    }) as unknown as typeof fetch;
    render(<StudentPortal token="t" displayName="أحمد" onLogout={vi.fn()} />);
    return { scrolls, calls };
  }
  async function openAssignment() {
    const buttons = await screen.findAllByRole("button", { name: "ابدأ الحل" });
    fireEvent.click(buttons[0]);
    await screen.findByText("نص السؤال الأول في الواجب");                                                // the exam page mounted (same destination as before)
  }
  it("normal preference → smooth scroll to the top after opening an assignment (same request, same destination)", async () => {
    const { scrolls, calls } = mountPortal(false);
    await openAssignment();
    const top = scrolls.find(s => (s as { top?: number }).top === 0) as { top: number; behavior: string };
    expect(top.behavior).toBe("smooth");
    expect(calls.filter(u => u.includes("/api/student-assignment/asg1")).length).toBe(1);
  });
  it("reduced motion → the same scroll uses behavior 'auto'", async () => {
    const { scrolls } = mountPortal(true);
    await openAssignment();
    const top = scrolls.find(s => (s as { top?: number }).top === 0) as { top: number; behavior: string };
    expect(top.behavior).toBe("auto");
    expect(scrolls.every(s => (s as { behavior: string }).behavior !== "smooth")).toBe(true);
  });
});

// -------------------------------------------------------- C. dashboard live regions -------------------------------------------------------
describe("UX-8b — TeacherDashboard live regions are only the conditional async states", () => {
  const trendItem = (n: number, extra: Record<string, unknown> = {}) => ({ assignmentId: "a" + n, classId: "c1", className: "الحادي عشر", title: "واجب " + n, dueAt: "2026-09-0" + n + "T10:00:00.000Z", date: "2026-09-0" + n, students: 20, submitted: 15 + n, missing: 5 - n, pendingReview: n, completionRate: 70 + n, average: 60 + n * 5, highest: 95, lowest: 40, ...extra });
  const fixture = () => ({
    ok: true, generatedAt: "2026-09-10T08:30:00.000Z", scope: { classId: "", className: "كل الصفوف", from: "", to: "" },
    classes: [{ classId: "c1", name: "الحادي عشر", grade: "11", schoolYear: "2026", active: true, studentCount: 20 }, { classId: "c2", name: "العاشر", grade: "10", schoolYear: "2026", active: true, studentCount: 18 }],
    kpis: { activeClasses: 2, activeStudents: 38, publishedAssignments: 7, submissions: 51, expectedSubmissions: 60, missingSubmissions: 9, pendingReview: 4, lateSubmissions: 3, completionRate: 85, average: 72.4, highest: 98, lowest: 31, performanceChange: -6.5, followUpStudents: 5, neverLogged: 2 },
    submissionStatus: { submitted: 51, missing: 9, pendingReview: 4, late: 3 },
    gradeDistribution: [{ label: "90-100", count: 6 }, { label: "80-89", count: 10 }],
    assignmentTrend: [trendItem(1), trendItem(2)],
    classComparison: [{ classId: "c1", name: "الحادي عشر", grade: "11", students: 20, assignments: 4, expected: 40, submitted: 33, missing: 7, pendingReview: 2, completionRate: 82.5, average: 74.2 }],
    topicAnalytics: [{ topic: "موضوع 1", average: 45, gradedQuestions: 10 }],
    followUp: [{ userId: "u1", displayName: "سارة خالد", identityNumber: "123456789", classId: "c1", className: "الحادي عشر", average: 42, assigned: 5, completed: 2, missing: 3, completionRate: 40, trendDelta: -16, trend: "declining", lastLoginAt: "2026-09-01T00:00:00.000Z", severity: "high", reasons: ["المعدل منخفض"] }],
    topImprovers: [{ userId: "u3", displayName: "ليان أحمد", identityNumber: "555", classId: "c2", className: "العاشر", average: 80, assigned: 4, completed: 4, missing: 0, completionRate: 100, trendDelta: 12, trend: "improving", lastLoginAt: "2026-09-02T00:00:00.000Z", severity: "low", reasons: [] }],
    insights: [{ tone: "warning", title: "انتباه", text: "تراجع الأداء" }, { tone: "success", title: "جيد", text: "نسبة تسليم مرتفعة" }],
    students: [{ userId: "u1", displayName: "سارة خالد" }], studentDetail: null
  });
  function mountDash(analyticsStatus = 200) {
    stubMatchMedia(false);
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/teacher-analytics")) return res(analyticsStatus, analyticsStatus === 200 ? fixture() : { ok: false, error: "فشل التحميل" });
      if (url.startsWith("/api/teacher-achievement-feed")) return res(200, { ok: true, posts: [] });
      return res(404, { ok: false });
    }) as unknown as typeof fetch;
    render(<TeacherDashboard token="tkn-1" />);
  }
  it("while loading there is exactly one status region; after a successful load NO live region remains (KPIs, insights and cards are plain text)", async () => {
    mountDash();
    expect(screen.getAllByRole("status").length).toBe(1);                                                // the initial async load
    await screen.findByRole("heading", { level: 2, name: "يحتاج إلى انتباهك" });
    expect(screen.queryAllByRole("status").length).toBe(0);
    expect(screen.queryAllByRole("alert").length).toBe(0);
    expect(document.querySelectorAll("[aria-live]").length).toBe(0);
    expect(screen.getByText("تراجع الأداء")).toBeTruthy();                                               // static content still reachable in order
  });
  it("a load failure is still announced as an alert with the server message", async () => {
    mountDash(500);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("فشل التحميل");
    expect(screen.queryAllByRole("alert").length).toBe(1);
  });
  it("source guard: every live region in the dashboard is gated on a loading/busy/error condition (none is unconditional)", () => {
    const src = (import.meta.glob("./TeacherDashboard.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>)["./TeacherDashboard.tsx"];
    const lines = src.split("\n").filter(l => /role="(status|alert)"|aria-live/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line, line.trim().slice(0, 120)).toMatch(/loading|Busy|busy|error|Error/);
    expect(src).not.toMatch(/aria-live/);
    expect(within(document.body).queryAllByRole("status").length).toBe(0);
  });
});
