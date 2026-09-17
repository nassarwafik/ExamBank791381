// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Roadmap #9 — frontend correlation integration tests. They drive the REAL StudentExamPage with a mocked
// fetch whose failing responses carry an X-Request-ID header, and prove that an UNEXPECTED 5xx surfaces the
// subtle "(رمز التتبع: …)" tracking code (start/save/submit/finalize) while expected 401/409 do not — and
// that no token / answer / request body is ever written to the console.

const ASSIGNMENT_ID = "asg1";
const START = "2026-01-01T10:00:00.000Z";
const END = "2026-01-01T11:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z";

const preStartState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 90, timed: true, serverNow: SERVER_NOW, activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
const startedState = { ...preStartState, activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: END }, effectiveAttemptEndsAt: END, canStartAttempt: false, canWrite: true };
const expiredActiveState = { ...startedState, attemptExpired: true, canWrite: false, canStartAttempt: false, serverNow: "2026-01-01T11:05:00.000Z", effectiveAttemptEndsAt: END };
const timedOutResult = { attemptNumber: 1, submittedAt: "2026-01-01T11:05:00.000Z", score: 0, totalMarks: 100, percentage: 0, manualReviewMarks: 0, finalized: true, timedOut: true };
const priorResult = { attemptNumber: 1, submittedAt: "2026-01-01T09:00:00.000Z", score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0, finalized: true, timedOut: false };
const finalizedState = { ...startedState, activeAttempt: null, attemptExpired: false, canWrite: false, canStartAttempt: false, latestResult: timedOutResult, attempts: [timedOutResult] };

const preStartAssignment = {
  assignmentId: ASSIGNMENT_ID, title: "امتحان مؤقت", instructions: "تعليمات", openAt: "", dueAt: END, effectiveDueAt: "",
  maxAttempts: 1, durationMinutes: 90, requiresStart: true, timed: true,
  marksDistribution: { rows: [{ title: "القسم الأول", marks: 100 }], total: 100 },
  exam: { title: "امتحان مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true, showDuration: true } }
};
const fullExam = { title: "امتحان مؤقت", metadata: {}, presentationTheme: "classic", coverPage: { enabled: true },
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
const fullAssignment = { ...preStartAssignment, requiresStart: false, exam: fullExam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
// A response WITH an X-Request-ID header (what the backend observability wrapper always sets).
const jsonH = (status: number, body: unknown, requestId: string) => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k: string) => (String(k).toLowerCase() === "x-request-id" ? requestId : null) },
  json: async () => body
} as unknown as Response);

let startCalls = 0, examCalls = 0, finalizeCalls = 0, subGetCalls = 0, submitCalls = 0, saveCalls = 0, onLogout: ReturnType<typeof vi.fn>;
let examHandler: (n: number) => Promise<Response>, startHandler: (n: number) => Promise<Response>, finalizeHandler: (n: number) => Promise<Response>, subGetHandler: (n: number) => Promise<Response>, submitHandler: (n: number) => Promise<Response>, saveHandler: (n: number) => Promise<Response>;
function installFetch() {
  startCalls = 0; examCalls = 0; finalizeCalls = 0; subGetCalls = 0; submitCalls = 0; saveCalls = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { startCalls++; return startHandler(startCalls); }
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; return finalizeHandler(finalizeCalls); }
      if (b.action === "submit") { submitCalls++; return submitHandler(submitCalls); }
      if (b.action === "saveDraft") { saveCalls++; return saveHandler(saveCalls); }
      return json(200, { ok: true, state: startedState });
    }
    if (url.includes("/api/student-assignment/")) { examCalls++; return examHandler(examCalls); }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount(assignment: unknown = preStartAssignment, token = "t") {
  onLogout = vi.fn();
  return render(<StudentExamPage token={token} assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={() => {}} onLogout={onLogout as unknown as () => void} />);
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  installFetch();
  subGetHandler = () => json(200, { ok: true, state: preStartState });
  startHandler = () => json(200, { ok: true, state: startedState });
  finalizeHandler = () => json(200, { ok: true, result: timedOutResult, state: finalizedState });
  submitHandler = () => json(200, { ok: true, result: priorResult, state: finalizedState });
  saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z", serverNow: "2026-01-01T10:31:00.000Z", effectiveAttemptEndsAt: END });
  examHandler = () => json(200, { ok: true, assignment: { ...preStartAssignment, requiresStart: false, exam: fullExam } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// UX-7b-2: the final submit lives on the review screen (last question → "مراجعة الإجابات" → "تسليم الامتحان"); the shared ConfirmDialog stays the gate.
async function pressSubmit() { fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" })); fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" })); }
describe("R9 frontend correlation — StudentExamPage", () => {
  it("TEST A: a finalizeTimedOutAttempt 5xx keeps the timeout/offline wording AND appends the tracking code; attempt stays locked", async () => {
    // Reach finalize via the proven retry-after-expiry path, but finalize fails 500 with a request id.
    examHandler = () => json(500, { ok: false, error: "تعذر تحميل الأسئلة." });   // body never loads → gate stays
    startHandler = n => (n === 1 ? json(200, { ok: true, state: startedState }) : json(409, { ok: false, error: "انتهى وقت المحاولة." }));
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: preStartState }) : json(200, { ok: true, state: expiredActiveState }));
    finalizeHandler = () => jsonH(500, { ok: false, error: "تعذر إنهاء المحاولة." }, "finalize-500-id");
    const r = mount();
    fireEvent.click(await r.findByText("ابدأ الامتحان"));
    await waitFor(() => expect(examCalls).toBe(1));
    fireEvent.click(await r.findByText("ابدأ الامتحان"));         // retry → 409 → confirm expired → finalize 500
    await waitFor(() => expect(finalizeCalls).toBe(1));
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("رمز التتبع: finalize-500-id"));
    const err = r.container.querySelector(".iex-error")?.textContent || "";
    expect(err).toContain("انتهى الوقت. سيتم إنهاء المحاولة تلقائيًا عند عودة الاتصال."); // wording preserved
    expect(r.container.textContent).not.toContain("سؤال الاختبار السري");                 // answers never revealed
    expect(r.container.querySelector(".iex-result-card")).toBeNull();                     // no timed-out result minted
  });

  it("TEST B: a submit 5xx appends the tracking code", async () => {
    subGetHandler = () => json(200, { ok: true, state: startedState }); // active, writable
    submitHandler = () => jsonH(500, { ok: false, error: "تعذر تسليم الواجب." }, "submit-500-id");
    const r = mount(fullAssignment);
    await r.findByText("سؤال الاختبار السري");
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect(submitCalls).toBe(1));
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("رمز التتبع: submit-500-id"));
  });

  it("TEST C: an autosave that ultimately fails 5xx appends the tracking code after retry exhaustion", async () => {
    // Real timers: the autosave debounce (800ms) + 3 backoff waits (1000/2000/4000) run to exhaustion, so
    // this test allows up to ~15s.
    subGetHandler = () => json(200, { ok: true, state: startedState }); // active, writable
    saveHandler = () => jsonH(500, { ok: false, error: "تعذر الحفظ التلقائي." }, "save-500-id");
    const r = mount(fullAssignment);
    const ta = (await r.findByPlaceholderText("اكتب إجابتك هنا...")) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "إجابة الطالب" } });   // schedules the debounced autosave
    await waitFor(() => expect(saveCalls).toBeGreaterThanOrEqual(4), { timeout: 12000 }); // retried to exhaustion
    await waitFor(() => expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("رمز التتبع: save-500-id"), { timeout: 3000 });
  }, 20000);

  it("TEST D: an expected 409 shows the normal Arabic message with NO tracking code", async () => {
    // requiresStart is true for a timed assignment, so a submit 409 reconciles against server state; make the
    // reconcile GET report a still-live attempt with a DIFFERENT id — the 409 path must not show a code.
    submitHandler = () => jsonH(409, { ok: false, error: "حدث تعارض مؤقت أثناء حفظ البيانات. حاول مرة أخرى." }, "conflict-409-id");
    subGetHandler = n => (n === 1 ? json(200, { ok: true, state: startedState }) : json(200, { ok: true, state: startedState }));
    const r = mount(fullAssignment);
    await r.findByText("سؤال الاختبار السري");
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect(submitCalls).toBe(1));
    await waitFor(() => expect(subGetCalls).toBeGreaterThan(1));   // reconcile happened
    expect(r.container.textContent).not.toContain("رمز التتبع");   // no tracking code for an expected 409
    expect(finalizeCalls).toBe(0);
  });

  it("TEST E: a 401 logs the student out with the normal message and NO tracking code", async () => {
    subGetHandler = () => json(200, { ok: true, state: startedState }); // active, writable
    submitHandler = () => jsonH(401, { ok: false, error: "انتهت الجلسة." }, "unauth-401-id");
    const r = mount(fullAssignment);
    await r.findByText("سؤال الاختبار السري");
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect(onLogout).toHaveBeenCalled());
    expect(r.container.textContent).not.toContain("رمز التتبع");
  });

  it("TEST F: no token / answers / request body are written to the console during a failing submit", async () => {
    const logs: string[] = [];
    for (const m of ["log", "warn", "error", "info", "debug"] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { logs.push(args.map(a => { try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); } }).join(" ")); });
    }
    // Active, writable, with the student's answer already in server-provided draft state (so submit sends it
    // in the request body without a debounced-save race).
    subGetHandler = () => json(200, { ok: true, state: { ...startedState, draftAnswers: { q1: { kind: "text", value: "SECRET_ANSWER_XYZ" } } } });
    submitHandler = () => jsonH(500, { ok: false, error: "تعذر تسليم الواجب." }, "priv-500-id");
    const r = mount(fullAssignment, "secret-token-XYZ");
    await r.findByText("سؤال الاختبار السري");
    await pressSubmit();
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect(submitCalls).toBe(1));
    const all = logs.join("\n");
    expect(all).not.toContain("secret-token-XYZ");
    expect(all).not.toContain("SECRET_ANSWER_XYZ");
    expect(all).not.toContain("\"action\":\"submit\"");   // request body never console-logged
  });
});
