// @vitest-environment happy-dom
// Phase 21E.3 review fix 3 — the student exam page, end to end with a mocked API, for the final review of 593fd47:
//   RF3-P1  a successful retry never scrolls the page: not through the recovery itself, and not through the keyboard reveal
//           when a navigation key was pressed while the retry loaded (the student scrolled away; a jump moved the options
//           under a pointer about to press and a different option was recorded)                                 [RR2-3]  fail-first
//   RF3-P2  the reload offered after a failed retry disappears while the attempt is being paused                [RR2-5 M6]
//   RF3-P3  …and is never offered while the attempt is being submitted                                           [RR2-5 M6]
//   RF3-P4  a page-level (review) card recovers focus onto the review heading without scrolling                 [RR2-3]  fail-first
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";

const ctl = vi.hoisted(() => ({ mode: "ok" as "ok" | "throw", review: "ok" as "ok" | "throw" }));
// The numericResponse renderer is replaced by a controllable one (the registry stays code-owned; only this identity changes).
vi.mock("./questionTypes/studentRegistry", async importOriginal => {
  const orig = await importOriginal<typeof import("./questionTypes/studentRegistry")>();
  function Controlled({ onAnswer, labelPrefix }: { onAnswer: (a: unknown) => void; labelPrefix?: string }) {
    if (ctl.mode === "throw") {
      throw new Error("internal detail: expectedAnswer=42 at https://exam.example/assets/NumericResponseInput-abcd1234.js");
    }
    return <label>{labelPrefix} <input aria-label="الإجابة الرقمية" onChange={e => onAnswer({ kind: "text", value: e.target.value })} /></label>;
  }
  return { ...orig, resolveStudentRenderer: (raw: unknown, v: unknown) => (raw === "numericResponse" ? { key: "numericResponse", version: 1, label: "إجابة رقمية", ownsImage: false, Renderer: Controlled } : orig.resolveStudentRenderer(raw, v)) };
});
// The review screen is replaced by one that fails while a submit is in flight (the only way a card can show during a submit),
// or while `ctl.review` says so.
vi.mock("./student/exam/ExamReviewScreen", () => ({
  default: ({ onSubmit, submitBusy, headingRef }: { onSubmit: () => void; submitBusy: boolean; headingRef: { current: HTMLHeadingElement | null } }) => {
    if (submitBusy || ctl.review === "throw") throw new Error("review render failed");
    return <section><h2 tabIndex={-1} ref={headingRef}>مراجعة الإجابات</h2><button type="button" onClick={onSubmit}>تسليم الامتحان</button></section>;
  },
}));
import StudentExamPage from "./StudentExamPage";

const restoreLocation = window.location;
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); Object.defineProperty(window, "location", { configurable: true, value: restoreLocation }); });
const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => "" } } as unknown as Response);

const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const QN = { examQuestionId: "qn", type: "numericResponse", questionTypeVersion: 1, text: "كم عدد طبقات نموذج OSI؟", marks: 1 };
const Q3 = { examQuestionId: "q3", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, QN, Q3] };
const baseAssignment = { assignmentId: "asg21e3", title: "واجب الشبكات", instructions: "أجب عن كل الأسئلة.", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 6, exam: flatExam };
const baseState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const result = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 5, totalMarks: 6, percentage: 83, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" };

let releasePause: () => void = () => {}, releaseSubmit: () => void = () => {};
let calls: { url: string; method: string; body: { action?: string } | null }[] = [];
let stateBody: Record<string, unknown> = baseState;
let examBody: unknown = flatExam;
function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: stateBody });
      if (body.action === "saveDraft") return json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
      if (body.action === "startAttempt") { const now = new Date().toISOString(), end = new Date(Date.now() + 30 * 60_000).toISOString(); stateBody = { ...stateBody, activeAttempt: { attemptNumber: 1, startedAt: now, endsAt: end, status: "started" }, effectiveAttemptEndsAt: end, serverNow: now, canWrite: true, canStartAttempt: false }; return json(200, { ok: true, state: stateBody }); }
      if (body.action === "pauseAttempt") return new Promise(r => { releasePause = () => r(json(200, { ok: true, state: { ...stateBody, activeAttempt: { ...(stateBody.activeAttempt as object), status: "paused" } } })); });
      if (body.action === "submit") return new Promise(r => { releaseSubmit = () => r(json(200, { ok: true, result, state: { ...baseState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: result, attempts: [result] } })); });
      if (body.action === "submit-unheld") return json(200, { ok: true, result, state: { ...baseState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: result, attempts: [result] } });
      return json(200, { ok: true, state: stateBody });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: { ...baseAssignment, requiresStart: false, exam: examBody } });
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  stateBody = baseState; examBody = flatExam; ctl.mode = "ok"; ctl.review = "ok";
  installFetch();
});
function mount(assignment: unknown = baseAssignment) {
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
}
const goNext = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));

const frames = (n: number) => act(async () => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(() => r(null))); });

describe("RF3-P1 — a successful retry never scrolls the page", () => {
  const original = { into: HTMLElement.prototype.scrollIntoView, focus: HTMLElement.prototype.focus };
  afterEach(() => { HTMLElement.prototype.scrollIntoView = original.into; HTMLElement.prototype.focus = original.focus; });
  it("the student pressed «إعادة المحاولة», then scrolled with the keyboard while it loaded: no scroll at all after the recovery", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const scrollBy = vi.fn(), scrollTo = vi.fn(), into = vi.fn(), focused: { el: HTMLElement; opts?: FocusOptions }[] = [];
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    HTMLElement.prototype.scrollIntoView = into;
    HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) { focused.push({ el: this, opts }); return original.focus.call(this, opts); };
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    await frames(3);
    scrollBy.mockClear(); scrollTo.mockClear(); into.mockClear();                  // the navigation's own scroll is not under test
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    ctl.mode = "ok";
    fireEvent.keyDown(document, { key: "ArrowDown" });                              // scrolling the page with the keyboard
    await act(async () => { fireEvent.click(retry); });
    const line = await screen.findByTestId("recovery-landed");
    await waitFor(() => expect(document.activeElement).toBe(line));
    await frames(4);
    expect(scrollBy).not.toHaveBeenCalled();                                        // the defect: an instant jump to the line
    expect(scrollTo).not.toHaveBeenCalled();
    expect(into).not.toHaveBeenCalled();
    expect(focused.filter(f => f.el === line).every(f => f.opts?.preventScroll === true)).toBe(true);
    expect(screen.getByRole("textbox", { name: "الإجابة الرقمية" })).toBeTruthy();
  });
});

describe("RF3-P2 — no reload action while the attempt is being paused", () => {
  it("pausable attempt: the reload offered after a failed retry disappears while the pause request is in flight", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    stateBody = { ...baseState, attemptPolicy: "pausable", attemptModelVersion: 3, activeAttempt: { attemptNumber: 1, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "", status: "started" } };
    mount({ ...baseAssignment, attemptPolicy: "pausable" });
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "إعادة تحميل الصفحة" })).toBeTruthy());   // safe now: offered
    fireEvent.click(screen.getByRole("button", { name: "حفظ مؤقت والخروج" }));
    fireEvent.click(await screen.findByRole("button", { name: "حفظ والخروج" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "جارٍ الحفظ المؤقت..." })).toBeTruthy());
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();          // never while pausing
    await act(async () => { releasePause(); });
  });
});

describe("RF3-P3 — no reload action while the attempt is being submitted", () => {
  it("the review screen fails while the submit is in flight: its card retries, and never offers a reload until the submit settled", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
    fireEvent.click(await screen.findByRole("button", { name: /مراجعة الإجابات/ }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await screen.findByTestId("question-recovery");                                 // the review card, the submit still in flight
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByTestId("question-recovery").textContent).toContain("ما زال التحميل متعذّرًا"));
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();          // never while submitting
    await act(async () => { releaseSubmit(); });
  });
});

describe("RF3-P4 — a review-screen card recovers onto the review heading without scrolling", () => {
  const original = { into: HTMLElement.prototype.scrollIntoView, focus: HTMLElement.prototype.focus };
  afterEach(() => { HTMLElement.prototype.scrollIntoView = original.into; HTMLElement.prototype.focus = original.focus; });
  it("focus goes to the heading with preventScroll; nothing scrolls", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const scrollBy = vi.fn(), scrollTo = vi.fn(), into = vi.fn(), focused: { el: HTMLElement; opts?: FocusOptions }[] = [];
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    HTMLElement.prototype.scrollIntoView = into;
    HTMLElement.prototype.focus = function (this: HTMLElement, opts?: FocusOptions) { focused.push({ el: this, opts }); return original.focus.call(this, opts); };
    ctl.review = "throw";
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
    fireEvent.click(await screen.findByRole("button", { name: /مراجعة الإجابات/ }));
    await screen.findByTestId("question-recovery");
    await frames(3);
    scrollBy.mockClear(); scrollTo.mockClear(); into.mockClear();
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();
    ctl.review = "ok";
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(document.activeElement?.textContent).toBe("مراجعة الإجابات"));
    await frames(4);
    expect(scrollBy).not.toHaveBeenCalled();                                        // the defect: the heading revealed with a scroll
    expect(scrollTo).not.toHaveBeenCalled();
    expect(into).not.toHaveBeenCalled();
    expect(focused.filter(f => f.el === document.activeElement).every(f => f.opts?.preventScroll === true)).toBe(true);
  });
});
