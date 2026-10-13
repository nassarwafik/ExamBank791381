// @vitest-environment happy-dom
// Phase 21E.3 — assessment integrity at page level: a question whose renderer cannot recover is shown apart from a blank, the
// student is warned before submitting, the report rides with the save and the submit (and only then — an exam without any
// failure sends the historical body), and the result screen says the held question was not counted as a wrong answer.
// Fail-first on 593fd47: the review screen counted the question as «غير مُجاب», the dialog said nothing, the bodies carried nothing.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, act } from "@testing-library/react";

const ctl = vi.hoisted(() => ({ mode: "throw" as "ok" | "throw" }));
vi.mock("./questionTypes/studentRegistry", async importOriginal => {
  const orig = await importOriginal<typeof import("./questionTypes/studentRegistry")>();
  function Controlled({ onAnswer }: { onAnswer: (a: unknown) => void }) {
    if (ctl.mode === "throw") throw new Error("internal detail");
    return <label>رقم <input aria-label="الإجابة الرقمية" onChange={e => onAnswer({ kind: "numeric", value: e.target.value })} /></label>;
  }
  return { ...orig, resolveStudentRenderer: (raw: unknown, v: unknown) => (raw === "numericResponse" ? { key: "numericResponse", version: 1, label: "إجابة رقمية", ownsImage: false, Renderer: Controlled } : orig.resolveStudentRenderer(raw, v)) };
});
import StudentExamPage from "./StudentExamPage";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: { get: () => "" } } as unknown as Response);
const Q1 = { examQuestionId: "q1", presentationType: "multipleChoice", text: "ما هي عاصمة فلسطين؟", marks: 2, options: [{ text: "القدس" }, { text: "رام الله" }] };
const QN = { examQuestionId: "qn", type: "numericResponse", questionTypeVersion: 1, text: "كم عدد طبقات نموذج OSI؟", marks: 1 };
const Q3 = { examQuestionId: "q3", presentationType: "open", text: "اشرح مفهوم الشبكة المحلية.", marks: 3 };
const flatExam = { title: "امتحان", metadata: {}, presentationTheme: "default", questions: [Q1, QN, Q3] };
const assignment = { assignmentId: "asg21e3", title: "واجب الشبكات", instructions: "", openAt: "", dueAt: "2026-12-01T10:30:00.000Z", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 3, totalMarks: 6, exam: flatExam };
const baseState = { attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, canWrite: true, dueClosed: false, availability: "open", draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: [], timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: "2026-03-01T10:00:00.000Z", activeAttempt: null };
const heldResult = { attemptNumber: 1, submittedAt: "2026-03-01T10:05:00.000Z", score: 2, totalMarks: 6, percentage: 33.3, manualReviewMarks: 1, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "", technicalHolds: 1 };

let calls: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: baseState });
      if (body.action === "saveDraft") return json(200, { ok: true, savedAt: "2026-03-01T10:01:02.000Z" });
      if (body.action === "submit") return json(200, { ok: true, result: heldResult, state: { ...baseState, attemptsUsed: 1, canAttempt: false, canWrite: false, latestResult: heldResult, attempts: [heldResult] } });
      return json(200, { ok: true, state: baseState });
    }
    return json(404, { ok: false });
  }) as unknown as typeof fetch;
}
beforeEach(() => {
  window.scrollTo = (() => {}) as unknown as typeof window.scrollTo;
  window.scrollBy = (() => {}) as unknown as typeof window.scrollBy;
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  installFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
const posts = () => calls.filter(c => c.method === "POST").map(c => c.body!);
const next = () => fireEvent.click(screen.getByRole("button", { name: "التالي" }));
const cell = (label: string) => Array.from(document.querySelectorAll(".iex-review-stats > div")).find(d => d.querySelector("dt")?.textContent === label)?.querySelector("dd")?.textContent;

describe("a question whose renderer cannot recover", () => {
  it("is «تعذّر عرضه» (not «غير مُجاب») in the review and navigator, the submit confirmation warns, the save and the submit carry the report, and the result explains the hold", async () => {
    ctl.mode = "throw";
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByLabelText("القدس"));
    next();
    await screen.findByTestId("question-recovery");                           // qn's card: «تعذّر عرض هذا السؤال الآن»
    expect(screen.getByTestId("question-recovery").textContent).toContain("إجاباتك كما هي");
    // the server's draft record follows: ONE ordinary saveDraft of the same snapshot carrying the report (sync, debounced)
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft" && Array.isArray(b.renderFailures))).toBe(true), { timeout: 4000 });
    const synced = posts().find(b => b.action === "saveDraft" && Array.isArray(b.renderFailures))!;
    expect(synced.renderFailures).toEqual([{ questionId: "qn", code: "runtime" }]);
    expect(synced.answers).toEqual({ q1: { kind: "choice", index: 0 } });   // the answers are untouched by the failure
    next();
    await screen.findByText("اشرح مفهوم الشبكة المحلية.");
    // navigator: the state is said in words
    fireEvent.click(screen.getByRole("button", { name: /قائمة الأسئلة/ }));
    expect(await screen.findByRole("button", { name: "السؤال 2 — تعذّر عرضه" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "السؤال 3 — الحالي" })).toBeTruthy();
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    // review screen: counted apart from the blank q3
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    await screen.findByTestId("review-unavailable-note");
    expect(cell("مُجاب")).toBe("1");
    expect(cell("غير مُجاب")).toBe("1");
    expect(cell("تعذّر عرضه")).toBe("1");
    // the confirmation warns explicitly, in addition to the historical message
    fireEvent.click(screen.getByRole("button", { name: "تسليم الامتحان" }));
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(dialog.textContent).toContain("لم تُجب عن جميع الأسئلة. هل تريد التسليم الآن؟");
    expect(dialog.textContent).toContain("تعذّر عرض سؤال واحد بسبب مشكلة تقنية في التحميل");
    expect(dialog.textContent).toContain("لن يُحتسب ذلك كإجابة خاطئة");
    fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    const submit = posts().find(b => b.action === "submit")!;
    expect(submit.renderFailures).toEqual([{ questionId: "qn", code: "runtime" }]);
    expect(submit.answers).toEqual({ q1: { kind: "choice", index: 0 } });
    // the result screen: pending review + the technical hold explained (never a final zero)
    expect(screen.getByTestId("result-technical-holds").textContent).toContain("تعذّر عرض سؤال واحد");
    expect(screen.getByTestId("result-technical-holds").textContent).toContain("لم يُحتسب ذلك كإجابة خاطئة");
    expect(document.querySelector(".iex-provisional")?.textContent).toContain("بانتظار مراجعة المعلم");
  });

  it("after a successful retry the question is an ordinary question again: no «تعذّر عرضه», no warning, and the next save clears the server record", async () => {
    ctl.mode = "throw";
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    next();
    await screen.findByTestId("question-recovery");
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft" && Array.isArray(b.renderFailures) && b.renderFailures.length === 1)).toBe(true), { timeout: 4000 });
    ctl.mode = "ok";
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await screen.findByLabelText("الإجابة الرقمية");
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft" && Array.isArray(b.renderFailures) && b.renderFailures.length === 0)).toBe(true), { timeout: 4000 });
    fireEvent.click(screen.getByRole("button", { name: /قائمة الأسئلة/ }));
    expect(await screen.findByRole("button", { name: "السؤال 2 — الحالي" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /تعذّر عرضه/ })).toBeNull();
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    next();
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    await screen.findByRole("button", { name: "تسليم الامتحان" });
    expect(screen.queryByTestId("review-unavailable-note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "تسليم الامتحان" }));
    const dialog = await screen.findByRole("dialog", { name: "تسليم الامتحان" });
    expect(dialog.textContent).not.toContain("تعذّر عرض");
    fireEvent.click(screen.getByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    const submit = posts().find(b => b.action === "submit")!;
    expect(submit.renderFailures).toBeUndefined();                          // the record was cleared by the save above; nothing left to report
  });

  it("an exam without any failure sends the historical bodies (no report field at all)", async () => {
    ctl.mode = "ok";
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByLabelText("القدس"));
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft")).toBe(true), { timeout: 4000 });
    next(); next();
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await screen.findByText(/تم تسليم المحاولة 1/);
    await act(async () => {});
    for (const b of posts()) expect(Object.prototype.hasOwnProperty.call(b, "renderFailures")).toBe(false);
  });
});

describe("Review Fix 4 (P1) — a report the sync could not persist is retried", () => {
  it("offline when the card fails: nothing is marked synced; on reconnect the report is saved even though no answer changed", async () => {
    ctl.mode = "throw";
    render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="الحادي عشر" onBack={vi.fn()} onLogout={vi.fn()} />);
    await screen.findByText("ما هي عاصمة فلسطين؟");
    fireEvent.click(screen.getByLabelText("القدس"));
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft")).toBe(true), { timeout: 4000 });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    next();
    await screen.findByTestId("question-recovery");
    await act(async () => { await new Promise(r => setTimeout(r, 1600)); });               // the sync fires while offline → skipped
    expect(posts().some(b => b.action === "saveDraft" && Array.isArray(b.renderFailures))).toBe(false);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => { window.dispatchEvent(new Event("online")); });
    await waitFor(() => expect(posts().some(b => b.action === "saveDraft" && Array.isArray(b.renderFailures) && b.renderFailures.length === 1)).toBe(true), { timeout: 4000 });
  });
});
