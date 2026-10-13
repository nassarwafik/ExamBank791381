// @vitest-environment happy-dom
// Phase 21E.3 — the student exam page, end to end with a mocked API:
//   A  a failing question renderer (render error, lazy chunk failure) shows a recovery card for THAT question only; the exam,
//      the other questions and every answer stay intact; a failure or a retry sends no save and no submit; nothing internal leaks;
//      a reload is offered only after a failed retry, only when it is safe (all saved, not strict) — never automatically;
//   B  focus moves after the major transitions (start → question heading, submit → result heading) and never while typing / saving;
//   C  the timer thresholds (5 min, 1 min) are announced once each through the page's one polite announcer;
//   D  the save cycle of an edit is silent; going offline and coming back are announced;
//   F  the CLI fill block is a semantic LTR island.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act, within } from "@testing-library/react";

const ctl = vi.hoisted(() => ({ mode: "ok" as "ok" | "throw" }));
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
import StudentExamPage from "./StudentExamPage";

const restoreLocation = window.location;
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); Object.defineProperty(window, "location", { configurable: true, value: restoreLocation }); });
const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => "" } } as unknown as Response);

const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const QN = { examQuestionId: "qn", type: "numericResponse", questionTypeVersion: 1, text: "كم عدد طبقات نموذج OSI؟", marks: 1 };
const Q3 = { examQuestionId: "q3", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const QCLI = { examQuestionId: "qc", presentationType: "cliFill", text: "أكمل الأمر", marks: 1, cli: "Router(config)# ip address [[ip]] 255.255.255.0", fields: [{ id: "ip" }] };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, QN, Q3] };
const baseAssignment = { assignmentId: "asg21e3", title: "واجب الشبكات", instructions: "أجب عن كل الأسئلة.", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 6, exam: flatExam };
const baseState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: false, durationMinutes: 0 };
const result = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 5, totalMarks: 6, percentage: 83, manualReviewMarks: 0, finalized: true, gradingStatus: "final", teacherFeedback: "" };

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
      if (body.action === "submit") return json(200, { ok: true, result, state: { ...baseState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: result, attempts: [result] } });
      return json(200, { ok: true, state: stateBody });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: { ...baseAssignment, requiresStart: false, exam: examBody } });
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
const saves = () => calls.filter(c => c.body?.action === "saveDraft").length;
const submits = () => calls.filter(c => c.body?.action === "submit").length;
beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  stateBody = baseState; examBody = flatExam; ctl.mode = "ok";
  installFetch();
});
function mount(assignment: unknown = baseAssignment) {
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
}
const goNext = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));
const goPrev = () => fireEvent.click(screen.getByRole("button", { name: "السابق" }));
const announcer = () => screen.getByTestId("exam-announcer").textContent || "";
const saveText = () => document.querySelector(".iex-progress .iex-save-state")?.textContent || "";

describe("21E.3 A — a failing question renderer never takes down the exam", () => {
  it("shows a recovery card for THAT question; the exam, the other questions and the answers stay; no save / submit; nothing leaks", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /القدس/ }));
    await waitFor(() => expect(saveText()).toContain("تم الحفظ"));
    const savesBefore = saves();
    goNext();                                                                     // → the failing question
    const card = await screen.findByTestId("question-recovery");
    expect(card.textContent).toContain("تعذّر عرض هذا السؤال الآن");
    expect(card.textContent).toContain("إجاباتك كما هي");
    expect(card.textContent).not.toMatch(/expectedAnswer|42|https?:|assets|\.js|Error|stack/);
    expect(document.querySelector("header.iex-topbar")).toBeTruthy();             // the exam is still mounted
    expect(screen.getByRole("navigation", { name: "التنقل بين الأسئلة" })).toBeTruthy();
    expect(screen.getByText("كم عدد طبقات نموذج OSI؟")).toBeTruthy();             // the card header / prompt stay; only the body failed
    expect(announcer()).toBe("تعذّر عرض هذا السؤال الآن");                          // announced once, politely
    // The sanitized log carries the fixed code only.
    const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.filter(c => c[0] === "[QuestionErrorBoundary]");
    expect(logged.length).toBeGreaterThan(0);
    for (const c of logged) expect(c[1]).toEqual({ code: "runtime" });
    goPrev();                                                                     // the other question is usable, its answer kept
    expect((screen.getByRole("radio", { name: /القدس/ }) as HTMLInputElement).checked).toBe(true);
    goNext(); goNext();
    fireEvent.change(await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }), { target: { value: "شبكة" } });
    await waitFor(() => expect(saves()).toBe(savesBefore + 1));                   // the only new save is the student's own edit
    expect(submits()).toBe(0);
  });

  it("«إعادة المحاولة» renders the question again in place (no reload); focus moves into the recovered question", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    const savesBefore = saves();
    ctl.mode = "ok";                                                                 // the cause went away (e.g. the network is back)
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();                                                                   // a keyboard user is on the action
    expect(document.activeElement).toBe(retry);
    fireEvent.click(retry);
    const input = await screen.findByRole("textbox", { name: "الإجابة الرقمية" });
    expect(screen.queryByTestId("question-recovery")).toBeNull();
    // Review fix 1: focus follows the recovered part (its first control), not the page heading far above it.
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: "7" } });
    await waitFor(() => expect(saves()).toBe(savesBefore + 1));
    expect(reload).not.toHaveBeenCalled();
    expect(submits()).toBe(0);
  });

  it("after a failed retry the card offers a reload ONLY when everything is saved and the attempt is not strict", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();      // never before a retry
    const retry = screen.getByRole("button", { name: "إعادة المحاولة" });
    retry.focus();                                                                          // a click / Enter leaves focus on it
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByTestId("question-recovery").textContent).toContain("ما زال التحميل متعذّرًا"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "إعادة المحاولة" }));   // focus stays on the action
    expect(document.activeElement?.getAttribute("aria-describedby")).toBeTruthy();            // …which the guidance describes
    fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل الصفحة" }));
    expect(reload).toHaveBeenCalledTimes(1);                                                  // only by the student's own click
  });

  it("an answer not yet confirmed by the server: no reload action after a failed retry (the edit could be lost)", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    mount();
    fireEvent.click(await screen.findByRole("radio", { name: /القدس/ }));
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });  // the edit cannot reach the server
    act(() => { window.dispatchEvent(new Event("offline")); });
    fireEvent.click(screen.getByRole("radio", { name: /رام الله/ }));
    await waitFor(() => expect(saveText()).toContain("غير متصل"));
    goNext();
    await screen.findByTestId("question-recovery");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByTestId("question-recovery").textContent).toContain("ما زال التحميل متعذّرًا"));
    expect(screen.getByTestId("question-recovery").textContent).toContain("تابع الأسئلة الأخرى");
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();
  });

  it("strict attempt: never a reload action, and the card says not to leave the page", async () => {
    ctl.mode = "throw";
    vi.spyOn(console, "error").mockImplementation(() => {});
    stateBody = { ...baseState, attemptPolicy: "strict", attemptModelVersion: 2, activeAttempt: { attemptNumber: 1, startedAt: "2026-03-01T10:00:00.000Z", endsAt: "2026-03-01T11:00:00.000Z", status: "started" } };
    mount({ ...baseAssignment, attemptPolicy: "strict" });
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext();
    await screen.findByTestId("question-recovery");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByTestId("question-recovery").textContent).toContain("لا تغادر صفحة الامتحان"));
    expect(screen.queryByRole("button", { name: "إعادة تحميل الصفحة" })).toBeNull();
  });
});

describe("21E.3 B — focus after the major transitions", () => {
  it("opening the page never moves focus; starting the attempt focuses the question heading", async () => {
    stateBody = { ...baseState, attemptModelVersion: 2, requiresStart: true, canWrite: false, canStartAttempt: true };
    mount({ ...baseAssignment, requiresStart: true, exam: { title: "امتحان", metadata: {} } });
    const start = await screen.findByRole("button", { name: "بدء المحاولة" });
    expect(document.activeElement).toBe(document.body);
    fireEvent.click(start);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await waitFor(() => expect(document.activeElement?.className).toContain("iex-page-heading"));
    expect(document.activeElement?.textContent).toBe("السؤال 1 من 3");
  });

  it("a page that opens directly on the questions (legacy untimed) does not move focus", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(document.activeElement).toBe(document.body);
  });

  it("typing and the autosave that follows never move focus", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }) as HTMLTextAreaElement;
    ta.focus();
    fireEvent.change(ta, { target: { value: "شبكة محلية" } });
    await waitFor(() => expect(saveText()).toContain("تم الحفظ · آخر حفظ"));
    expect(document.activeElement).toBe(ta);
  });

  it("submitting focuses the result heading (exactly one submit)", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    while (screen.queryByRole("button", { name: "التالي" })) goNext();
    fireEvent.click(screen.getByRole("button", { name: "مراجعة الإجابات" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    const h = await screen.findByRole("heading", { level: 1, name: /تم تسليم المحاولة 1/ });
    await waitFor(() => expect(document.activeElement).toBe(h));
    expect(h.getAttribute("tabindex")).toBe("-1");
    expect(submits()).toBe(1);
  });
});

describe("21E.3 C — timer thresholds announced once", () => {
  const timedAt = (msLeft: number) => {
    const now = new Date().toISOString(), end = new Date(Date.now() + msLeft).toISOString();
    stateBody = { ...baseState, timed: true, requiresStart: true, durationMinutes: 30, attemptModelVersion: 2, serverNow: now, canWrite: true, activeAttempt: { attemptNumber: 1, startedAt: now, endsAt: end, status: "started" }, effectiveAttemptEndsAt: end };
    return { ...baseAssignment, durationMinutes: 30, requiresStart: true, timed: true };
  };
  it("crossing 5 minutes is announced once; nothing every second; nothing before the threshold", async () => {
    mount(timedAt(300_000 + 1_200));
    await screen.findByText("ما هي عاصمة فلسطين؟");
    expect(announcer()).toBe("");
    await waitFor(() => expect(announcer()).toBe("تنبيه: بقيت 5 دقائق على انتهاء وقت المحاولة."), { timeout: 4000 });
    const region = screen.getByTestId("exam-announcer");
    const changes: string[] = [];
    const mo = new MutationObserver(() => changes.push(region.textContent || ""));
    mo.observe(region, { subtree: true, childList: true, characterData: true });
    await act(async () => { await new Promise(r => setTimeout(r, 2300)); });       // two more ticks
    mo.disconnect();
    expect(changes).toEqual([]);                                                       // no repeat, no per-second text
    expect(document.querySelector(".iex-countdown")?.getAttribute("aria-live")).toBeNull();
  }, 10000);

  it("crossing 1 minute is announced once, and a remount in the same tab (reload / resync) does not repeat it", async () => {
    const assignment = timedAt(60_000 + 1_200);
    const first = mount(assignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    // Below 5 minutes from the start: the lower band is announced as "less than 5", then the 1-minute crossing.
    await waitFor(() => expect(announcer()).toBe("تنبيه: بقيت دقيقة واحدة على انتهاء وقت المحاولة."), { timeout: 4000 });
    first.unmount();
    mount(assignment);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await act(async () => { await new Promise(r => setTimeout(r, 1500)); });
    expect(announcer()).toBe("");
  }, 10000);

  it("an untimed exam never announces time", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟");
    await act(async () => { await new Promise(r => setTimeout(r, 1200)); });
    expect(announcer()).toBe("");
  });
});

describe("21E.3 D — calm save announcements", () => {
  it("an ordinary edit is silent; going offline is announced; saving again after it is announced", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." });
    fireEvent.change(ta, { target: { value: "أ" } });
    await waitFor(() => expect(saveText()).toContain("تم الحفظ · آخر حفظ"));
    expect(announcer()).toBe("");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    act(() => { window.dispatchEvent(new Event("offline")); });
    fireEvent.change(ta, { target: { value: "أب" } });
    await waitFor(() => expect(announcer()).toContain("انقطع الاتصال"));
    expect(saveText()).toContain("غير متصل");                                          // the visible label keeps its wording
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    act(() => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(announcer()).toBe("تم حفظ إجاباتك على الخادم."), { timeout: 4000 });
  });
});

describe("21E.3 F — the CLI block is a semantic LTR island", () => {
  it("the command block and its blanks carry dir=ltr; the typed value is stored as typed (no bidi control character)", async () => {
    examBody = { ...flatExam, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [QCLI] }], questions: undefined };
    mount({ ...baseAssignment, questionCount: 1, exam: examBody });
    const input = await screen.findByRole("textbox", { name: /الفراغ ip/ });
    expect(input.getAttribute("dir")).toBe("ltr");
    expect(input.closest("pre")?.getAttribute("dir")).toBe("ltr");
    fireEvent.change(input, { target: { value: "192.168.1.1" } });
    await waitFor(() => expect(saves()).toBe(1));
    const saved = calls.find(c => c.body?.action === "saveDraft")!.body as unknown as { answers: Record<string, { values: Record<string, string> }> };
    const value = Object.values(saved.answers)[0].values.ip;
    expect(value).toBe("192.168.1.1");
    expect(value).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
    expect(within(document.querySelector(".iex-cli") as HTMLElement).getByText(/Router\(config\)# ip address/)).toBeTruthy();
  });
});

describe("21E.3 G — a control reached with the keyboard partly under the sticky bars is revealed; pointer focus never scrolls", () => {
  const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() { return {}; } }) as DOMRect;
  const frame = () => act(async () => { await new Promise(r => requestAnimationFrame(() => r(null))); });
  it("Tab to a field partly under the bottom navigation → the smallest scroll clear of the bar; typing and a visible field never scroll", async () => {
    mount();
    await screen.findByText("ما هي عاصمة فلسطين؟"); goNext(); goNext();
    const ta = await screen.findByRole("textbox", { name: "اشرح مفهوم الشبكة المحلية." }) as HTMLTextAreaElement;
    (document.querySelector(".iex-bottom-nav") as HTMLElement).getBoundingClientRect = () => rect(818, 900);
    (document.querySelector(".iex-topbar") as HTMLElement).getBoundingClientRect = () => rect(0, 64);
    const scrollBy = vi.fn(); window.scrollBy = scrollBy as unknown as typeof window.scrollBy;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    ta.getBoundingClientRect = () => rect(772, 912);                              // the 1280×900 Chromium measurement
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => { ta.focus(); });
    await frame();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith({ top: 912 - (818 - 8), left: 0, behavior: "smooth" });
    fireEvent.change(ta, { target: { value: "شبكة" } });                          // typing: no further scrolling
    await frame();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    act(() => { ta.blur(); });
    ta.getBoundingClientRect = () => rect(300, 440);                              // fully visible → focus never scrolls
    fireEvent.keyDown(document.body, { key: "Tab" });
    act(() => { ta.focus(); });
    await frame();
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });
});
