// @vitest-environment happy-dom
// Phase 21E.3 review fix 1 — regression tests for the confirmed defects of the independent review of 92f4326 (page level).
// Each case failed on 92f4326 (fail-first, recorded in docs/enterprise-ux-premium-21e3.md §12) and passes on the fix:
//   RF1-P1  a mouse press on a control partly under a sticky bar never scrolls (pointer coordinates stay put)    [blockers]
//   RF1-P2  a touch press likewise; and nothing scrolls while a pointer is down, even if Tab is pressed            [blockers]
//   RF1-P3  entering the questions uses an instant scroll (no smooth scroll carries the focused heading away)      [#80]
//   RF1-P4  no reload is offered while offline, even with every answer saved                                      [#64]
//   RF1-P5  resuming below a threshold announces it once the questions show (never consumed by the gate)          [#12]
//   RF1-P6  the first message waits until the announcer has settled                                               [#21]
//   RF1-P7  after a failed retry the guidance (strict: do not leave) is announced and describes the retry button  [#23]
//   RF1-P8  a failing review screen keeps the exam chrome and offers the way back to the questions                [#14]
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";

const ctl = vi.hoisted(() => ({ mode: "ok" as "ok" | "throw", review: "ok" as "ok" | "throw" }));
vi.mock("./questionTypes/studentRegistry", async importOriginal => {
  const orig = await importOriginal<typeof import("./questionTypes/studentRegistry")>();
  function Controlled({ onAnswer, labelPrefix }: { onAnswer: (a: unknown) => void; labelPrefix?: string }) {
    if (ctl.mode === "throw") throw new Error("internal detail");
    return <label>{labelPrefix} <input aria-label="الإجابة الرقمية" onChange={e => onAnswer({ kind: "text", value: e.target.value })} /></label>;
  }
  return { ...orig, resolveStudentRenderer: (raw: unknown, v: unknown) => (raw === "numericResponse" ? { key: "numericResponse", version: 1, label: "إجابة رقمية", ownsImage: false, Renderer: Controlled } : orig.resolveStudentRenderer(raw, v)) };
});
vi.mock("./student/exam/ExamReviewScreen", async importOriginal => {
  const orig = await importOriginal<{ default: (p: object) => import("react").ReactElement }>();
  return { default: (p: object) => { if (ctl.review === "throw") throw new Error("review internal"); return orig.default(p); } };
});
import StudentExamPage from "./StudentExamPage";

const restoreLocation = window.location;
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear(); Object.defineProperty(window, "location", { configurable: true, value: restoreLocation }); });
const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => "" } } as unknown as Response);
const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const QN = { examQuestionId: "qn", type: "numericResponse", questionTypeVersion: 1, text: "كم عدد طبقات نموذج OSI؟", marks: 1 };
const Q3 = { examQuestionId: "q3", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, QN, Q3] };
const baseAssignment = { assignmentId: "asgrf1", title: "واجب الشبكات", instructions: "أجب عن كل الأسئلة.", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 6, exam: flatExam };
const baseState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };

let calls: { url: string; method: string; body: { action?: string } | null }[] = [];
let stateBody: Record<string, unknown> = baseState;
let assignmentDelayMs = 0;
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
      if (body.action === "resumeAttempt") {
        const now = new Date().toISOString(), end = new Date(Date.now() + 180_000).toISOString();
        stateBody = { ...stateBody, canWrite: true, serverNow: now, effectiveAttemptEndsAt: end, activeAttempt: { attemptNumber: 1, startedAt: "2026-03-01T09:00:00.000Z", endsAt: end, status: "started", attemptEpoch: 2 } };
        return json(200, { ok: true, state: stateBody });
      }
      return json(200, { ok: true, state: stateBody });
    }
    if (url.includes("/api/student-assignment/")) {
      const reply = () => json(200, { ok: true, assignment: { ...baseAssignment, exam: flatExam } });
      return assignmentDelayMs ? new Promise(r => setTimeout(r, assignmentDelayMs)).then(reply) : reply();
    }
    return json(404, { ok: false });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  window.scrollTo = (() => {}) as unknown as typeof window.scrollTo;
  window.scrollBy = (() => {}) as unknown as typeof window.scrollBy;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  stateBody = baseState; ctl.mode = "ok"; ctl.review = "ok"; assignmentDelayMs = 0;
  installFetch();
});
const mount = (assignment: unknown = baseAssignment) => render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
const goNext = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));
const announcer = () => screen.getByTestId("exam-announcer").textContent || "";
const saveText = () => document.querySelector(".iex-progress .iex-save-state")?.textContent || "";
const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() { return {}; } }) as DOMRect;
const frames = (n = 2) => act(async () => { for (let i = 0; i < n; i++) await new Promise(r => requestAnimationFrame(() => r(null))); });

/** The open-answer field placed partly under the bottom navigation (the 1280×900 geometry); every scroll is recorded. */
async function partlyCoveredField() {
  mount();
  await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
  const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }) as HTMLTextAreaElement;
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  (document.querySelector(".iex-bottom-nav") as HTMLElement).getBoundingClientRect = () => rect(818, 900);
  (document.querySelector(".iex-topbar") as HTMLElement).getBoundingClientRect = () => rect(0, 64);
  ta.getBoundingClientRect = () => rect(772, 912);
  const scrolls = vi.fn();
  window.scrollBy = scrolls as unknown as typeof window.scrollBy;
  window.scrollTo = scrolls as unknown as typeof window.scrollTo;
  ta.scrollIntoView = scrolls;
  await frames();
  scrolls.mockClear();
  return { ta, scrolls };
}

describe("RF1-P1/P2 — pointer and touch focus never scroll; nothing scrolls while a pointer is down", () => {
  it("a mouse press (down → focus → up) on a field partly under the bottom navigation does not scroll", async () => {
    const { ta, scrolls } = await partlyCoveredField();
    fireEvent.pointerDown(ta, { pointerType: "mouse", button: 0 }); fireEvent.mouseDown(ta, { button: 0 });
    act(() => { ta.focus(); });                                                    // Chromium focuses during mousedown
    await frames();
    fireEvent.pointerUp(ta, { pointerType: "mouse" }); fireEvent.mouseUp(ta); fireEvent.click(ta);
    await frames();
    expect(scrolls).not.toHaveBeenCalled();
  });
  it("a touch press likewise", async () => {
    const { ta, scrolls } = await partlyCoveredField();
    fireEvent.pointerDown(ta, { pointerType: "touch" }); fireEvent.touchStart(ta);
    act(() => { ta.focus(); });
    await frames();
    fireEvent.pointerUp(ta, { pointerType: "touch" }); fireEvent.touchEnd(ta);
    await frames();
    expect(scrolls).not.toHaveBeenCalled();
  });
  it("Tab pressed while a pointer is still down: no scroll until the pointer is released", async () => {
    const { ta, scrolls } = await partlyCoveredField();
    fireEvent.pointerDown(document.body, { pointerType: "mouse" });
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => { ta.focus(); });
    await frames();
    expect(scrolls).not.toHaveBeenCalled();
    fireEvent.pointerUp(document.body, { pointerType: "mouse" });
  });
  it("the same field reached with Tab IS revealed (keyboard only)", async () => {
    const { ta, scrolls } = await partlyCoveredField();
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => { ta.focus(); });
    await frames();
    expect(scrolls).toHaveBeenCalledTimes(1);
  });
});

describe("RF1-P3 — entering the questions scrolls instantly (no competing smooth scroll)", () => {
  it("after «بدء المحاولة» the last page scroll is instant", async () => {
    const scrollTo = vi.fn(); window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    stateBody = { ...baseState, attemptModelVersion: 2, requiresStart: true, canWrite: false, canStartAttempt: true };
    mount({ ...baseAssignment, requiresStart: true, exam: { title: "امتحان", metadata: {} } });
    fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await waitFor(() => expect(document.activeElement?.className).toContain("iex-page-heading"));
    const last = scrollTo.mock.calls.at(-1)?.[0] as ScrollToOptions | undefined;
    expect(last?.behavior).toBe("auto");
  });
});

describe("RF1-P4 — no reload is offered while offline", () => {
  it("after a failed retry, offline with nothing unsaved: guidance to continue, no reload action", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => { window.dispatchEvent(new Event("offline")); });
    goNext();
    await screen.findByTestId("question-recovery");
    expect(saveText()).not.toContain("غير محفوظة");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByTestId("question-recovery").textContent).toContain("ما زال التحميل متعذّرًا"));
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();
  });
});

describe("RF1-P5/P6 — timer notices are heard, never consumed unheard", () => {
  it("resuming a paused attempt with 3 minutes left: «less than 5 minutes» is announced once the questions show", async () => {
    const S = "2026-03-01T09:00:00.000Z";
    stateBody = { ...baseState, timed: true, requiresStart: true, attemptModelVersion: 2, attemptPolicy: "pausable", durationMinutes: 30, canWrite: false,
      activeAttempt: { attemptNumber: 1, startedAt: S, endsAt: "2026-03-01T09:30:00.000Z", status: "paused", attemptEpoch: 1, pausedAt: "2026-03-01T09:27:00.000Z", pausedRemainingMs: 180_000 } };
    assignmentDelayMs = 300;                                                       // the start gate is on screen while the body loads
    mount({ ...baseAssignment, timed: true, requiresStart: true, durationMinutes: 30, attemptPolicy: "pausable", exam: { title: "امتحان", metadata: {} } });
    fireEvent.click(await screen.findByRole("button", { name: "متابعة المحاولة" }));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await waitFor(() => expect(announcer()).toContain("أقل من 5 دقائق"), { timeout: 3000 });
  });
  it("the first message is written only after the announcer has settled (not in the frame it was inserted)", async () => {
    const now = new Date().toISOString(), end = new Date(Date.now() + 200_000).toISOString();
    stateBody = { ...baseState, timed: true, requiresStart: true, durationMinutes: 30, attemptModelVersion: 2, serverNow: now, canWrite: true, activeAttempt: { attemptNumber: 1, startedAt: now, endsAt: end, status: "started" }, effectiveAttemptEndsAt: end };
    mount({ ...baseAssignment, durationMinutes: 30, requiresStart: true, timed: true });
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(announcer()).toBe("");                                                  // the region exists, still empty
    await waitFor(() => expect(announcer()).toContain("أقل من 5 دقائق"), { timeout: 3000 });
  });
});

describe("RF1-P7 — the guidance after a failed retry is announced and describes the retry button", () => {
  it("strict attempt: «لا تغادر صفحة الامتحان» is announced and linked to the focused action", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    stateBody = { ...baseState, attemptPolicy: "strict", attemptModelVersion: 2, activeAttempt: { attemptNumber: 1, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "2026-03-01T11:00:00.000Z", status: "started" } };
    mount({ ...baseAssignment, attemptPolicy: "strict" });
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus(); fireEvent.click(retry);
    await waitFor(() => expect(announcer()).toContain("لا تغادر صفحة الامتحان"), { timeout: 3000 });
    const button = screen.getByRole("button", { name: "إعادة المحاولة" });
    const described = document.getElementById(button.getAttribute("aria-describedby") || "");
    expect(described?.textContent).toContain("لا تغادر صفحة الامتحان");
  });
});

describe("RF1-P8 — a failing review screen never strands the student", () => {
  it("the exam chrome stays and «العودة إلى الأسئلة» returns to answering", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    ctl.review = "throw";
    while (screen.queryByRole("button", { name: "التالي" })) goNext();
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الإجابات" }));
    const card = await screen.findByTestId("question-recovery");
    expect(card.textContent).toContain("تعذّر عرض شاشة المراجعة الآن");
    expect(document.querySelector("header.iex-topbar")).toBeTruthy();             // timer / back / save status stay
    ctl.review = "ok";
    fireEvent.click(screen.getByRole("button", { name: "العودة إلى الأسئلة" }));
    expect(await screen.findByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeTruthy();
  });
});
