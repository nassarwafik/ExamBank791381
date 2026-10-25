// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import { mergeStaleDraft } from "./student/exam/draftMerge";

// QA-8 — the same attempt open on two devices. The page asserts the server draft revision its whole-draft snapshot was composed
// from (expectedDraftRevision); when another device saved since, the server refuses with 409 DRAFT_STALE and this page merges
// per question (the other device's newer draft + only what THIS page changed) and saves the merged draft against the new base.
// A blocked submit or pause tells the student their answers were merged instead of sending the older copy.
//
// Real StudentExamPage with a mocked fetch (same harness as StudentExamPage.save.test.tsx).

const START = "2026-01-01T10:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z";
const baseState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: SERVER_NOW,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", draftRevision: 0, latestResult: null, attempts: []
};
const exam = { title: "امتحان", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال الأول", marks: 50 },
    { examQuestionId: "q2", presentationType: "shortAnswer", text: "السؤال الثاني", marks: 50 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 2, totalMarks: 100, exam };
const OTHER = { kind: "text", value: "من الجهاز الآخر" };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let gets = 0, saves: Array<Record<string, unknown>> = [], submits: Array<Record<string, unknown>> = [], pauses: Array<Record<string, unknown>> = [];
let getHandler: (n: number) => Promise<Response>, saveHandler: (n: number, b: Record<string, unknown>) => Promise<Response>, submitHandler: (n: number) => Promise<Response>;
function installFetch() {
  gets = 0; saves = []; submits = []; pauses = [];
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { gets++; return getHandler(gets); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "saveDraft") { saves.push(b); return saveHandler(saves.length, b); }
      if (b.action === "submit") { submits.push(b); return submitHandler(submits.length); }
      if (b.action === "pauseAttempt") { pauses.push(b); return json(409, { ok: false, error: "x", code: "DRAFT_STALE" }); }
      return json(200, { ok: true, state: baseState });
    }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function mount() {
  return render(<StudentExamPage token="t" assignment={assignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
async function typeFirst(r: ReturnType<typeof mount>, value: string) {
  const ta = (await r.findAllByPlaceholderText("اكتب إجابتك هنا..."))[0] as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value } });
}
const answerValue = (a: unknown) => (a as { value?: string } | undefined)?.value;

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  installFetch();
  getHandler = n => json(200, { ok: true, state: n === 1 ? baseState : { ...baseState, draftRevision: 1, draftAnswers: { q2: OTHER } } });
  saveHandler = n => n === 1 ? json(409, { ok: false, error: "x", code: "DRAFT_STALE" }) : json(200, { ok: true, savedAt: SERVER_NOW, draftRevision: n, serverNow: SERVER_NOW });
  submitHandler = () => json(200, { ok: true, result: { attemptNumber: 1, submittedAt: SERVER_NOW, score: 1, totalMarks: 100, percentage: 1, manualReviewMarks: 0, finalized: true }, state: { ...baseState, activeAttempt: null } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("QA-8 StudentExamPage — a stale whole-draft write is merged, never lost", () => {
  it("every save asserts its base; a DRAFT_STALE autosave re-reads, merges per question and saves BOTH answers against the new base", async () => {
    const r = mount();
    await typeFirst(r, "إجابتي هنا");
    await waitFor(() => expect(saves.length).toBe(2), { timeout: 4000 });
    expect(saves[0]).toMatchObject({ expectedDraftRevision: 0 });
    expect(answerValue((saves[0].answers as Record<string, unknown>).q1)).toBe("إجابتي هنا");
    expect(saves[1]).toMatchObject({ expectedDraftRevision: 1 });
    const merged = saves[1].answers as Record<string, unknown>;
    expect(answerValue(merged.q1)).toBe("إجابتي هنا");
    expect(merged.q2).toEqual(OTHER);
    expect(gets).toBe(2);
    expect(r.container.querySelector(".platform-error")).toBeNull();                       // an autosave merge is silent
  });

  it("the next save uses the base the server returned", async () => {
    saveHandler = n => json(200, { ok: true, savedAt: SERVER_NOW, draftRevision: n, serverNow: SERVER_NOW });
    const r = mount();
    await typeFirst(r, "أ");
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    await typeFirst(r, "أب");
    await waitFor(() => expect(saves.length).toBe(2), { timeout: 4000 });
    expect(saves.map(s => s.expectedDraftRevision)).toEqual([0, 1]);
  });

  it("a stale submit is not sent again: the answers are merged, saved, and the student is asked to review", async () => {
    saveHandler = n => json(200, { ok: true, savedAt: SERVER_NOW, draftRevision: n + 1, serverNow: SERVER_NOW });
    submitHandler = () => json(409, { ok: false, error: "x", code: "DRAFT_STALE" });
    getHandler = n => json(200, { ok: true, state: n === 1 ? baseState : { ...baseState, draftRevision: 5, draftAnswers: { q2: OTHER } } });
    const r = mount();
    await typeFirst(r, "إجابتي");
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    fireEvent.click(await screen.findByRole("button", { name: "التالي" }));
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await waitFor(() => expect(r.container.textContent).toContain("دُمجت مع إجاباتك هنا"), { timeout: 4000 });
    expect(submits.length).toBe(1);
    expect(submits[0]).toMatchObject({ expectedDraftRevision: 2 });
    await waitFor(() => expect(saves.length).toBe(2), { timeout: 4000 });
    expect(saves[1]).toMatchObject({ expectedDraftRevision: 5 });
    expect((saves[1].answers as Record<string, unknown>).q2).toEqual(OTHER);
  });

  it("unchanged: a server that reports no draftRevision gets no expectedDraftRevision (and no merge)", async () => {
    const { draftRevision: _omit, ...noRevision } = baseState;
    void _omit;
    getHandler = () => json(200, { ok: true, state: noRevision });
    saveHandler = () => json(200, { ok: true, savedAt: SERVER_NOW, serverNow: SERVER_NOW });
    const r = mount();
    await typeFirst(r, "أ");
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    expect("expectedDraftRevision" in saves[0]).toBe(false);
  });
});

describe("QA-8 mergeStaleDraft", () => {
  const t = (value: string) => ({ kind: "text", value });
  it("keeps the other device's answers, re-applies this page's edits and clears", () => {
    const base = { q1: t("old"), q3: t("gone") };
    const local = { q1: t("mine") };                          // edited q1, cleared q3
    const server = { q1: t("theirs"), q2: t("theirs2"), q3: t("gone") };
    expect(mergeStaleDraft(base, local, server)).toEqual({ q1: t("mine"), q2: t("theirs2") });
  });
  it("an untouched question keeps the server value even when it differs from this page's copy", () => {
    expect(mergeStaleDraft({ q1: t("a") }, { q1: t("a") }, { q1: t("b") })).toEqual({ q1: t("b") });
  });
  it("a question this page added that the server lacks is added; inputs are not mutated", () => {
    const server = { q2: t("x") };
    const out = mergeStaleDraft({}, { q1: t("new") }, server);
    expect(out).toEqual({ q1: t("new"), q2: t("x") });
    expect(server).toEqual({ q2: t("x") });
  });
});
