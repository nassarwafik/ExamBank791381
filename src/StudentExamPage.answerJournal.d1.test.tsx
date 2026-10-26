// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";
import StudentPortal from "./StudentPortal";
import { readJournal, writeJournal } from "./student/exam/answerJournal";

// D1 — answers the server has not confirmed survive closing the page on this device. The connection drops, the student types, the
// page is closed; the next open of the SAME live attempt on this device merges that copy onto the server draft, shows it and saves
// it through the ordinary saveDraft path. Another attempt, a closed attempt or another student never receives it; a confirmed save,
// a submit and an explicit logout remove it.
//
// Real StudentExamPage with a mocked fetch (same harness as StudentExamPage.draftRevision.qa8.test.tsx).

const START = "2026-01-01T10:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z";
const legacyState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: SERVER_NOW,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", draftRevision: 0, latestResult: null, attempts: []
};
const modernState = { ...legacyState, attemptModelVersion: 2, attemptPolicy: "standard", activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started", attemptEpoch: 1 } };
const exam = { title: "امتحان", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "shortAnswer", text: "السؤال الأول", marks: 50 },
    { examQuestionId: "q2", presentationType: "shortAnswer", text: "السؤال الثاني", marks: 50 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 2, totalMarks: 100, exam };
const tokenFor = (sub: string) => btoa(JSON.stringify({ ver: 2, role: "student", sub, sv: 1 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") + ".sig";
const S1 = tokenFor("stu-1"), S2 = tokenFor("stu-2");
const text = (value: string) => ({ kind: "text", value });
const answerValue = (a: unknown) => (a as { value?: string } | undefined)?.value;

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let saves: Array<Record<string, unknown>> = [], submits = 0;
let serverState: Record<string, unknown> = legacyState, startState: Record<string, unknown> = legacyState;
let saveHandler: (n: number) => Promise<Response>;
function installFetch() {
  saves = []; submits = 0;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") return json(200, { ok: true, state: serverState });
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "saveDraft") { saves.push(b); return saveHandler(saves.length); }
      if (b.action === "startAttempt") return json(200, { ok: true, state: startState });
      if (b.action === "submit") { submits++; return json(200, { ok: true, result: { attemptNumber: 1, submittedAt: SERVER_NOW, score: 1, totalMarks: 100, percentage: 1, manualReviewMarks: 0, finalized: true }, state: { ...serverState, activeAttempt: null, attemptsUsed: 1, canWrite: false, canAttempt: false } }); }
      return json(200, { ok: true, state: serverState });
    }
    if (url.includes("/api/student-assignment/")) return json(200, { ok: true, assignment: { ...assignment, requiresStart: false } });
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
const setOnline = (value: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, value });
function mount(token = S1, asg: unknown = assignment) {
  return render(<StudentExamPage token={token} assignment={asg as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={() => {}} />);
}
async function typeFirst(r: ReturnType<typeof mount>, value: string) {
  const ta = (await r.findAllByPlaceholderText("اكتب إجابتك هنا..."))[0] as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value } });
}
// Offline: the edit cannot reach the server; the page is then closed (unmounted) with the answer unsent.
async function typeOfflineAndClose(value: string, token = S1) {
  setOnline(false);
  const r = mount(token);
  await typeFirst(r, value);
  await new Promise(res => setTimeout(res, 900));                     // past the autosave debounce: skipped offline
  expect(saves.length).toBe(0);
  cleanup();
  setOnline(true);
}
const journalOf = (sub = "stu-1") => readJournal<unknown>(sub, "asg1");

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  setOnline(true);
  serverState = legacyState; startState = legacyState;
  installFetch();
  saveHandler = n => json(200, { ok: true, savedAt: SERVER_NOW, draftRevision: n, serverNow: SERVER_NOW });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("D1 — unsent answers survive closing the page on this device", () => {
  it("offline edit → page closed → reopened: the answer is restored, shown, saved, and the device copy is removed once confirmed", async () => {
    await typeOfflineAndClose("إجابة لم تُرسل");
    expect(answerValue(journalOf()!.answers.q1)).toBe("إجابة لم تُرسل");
    const r = mount();
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    expect(answerValue((saves[0].answers as Record<string, unknown>).q1)).toBe("إجابة لم تُرسل");
    expect(saves[0]).toMatchObject({ expectedDraftRevision: 0 });
    expect(((await r.findAllByPlaceholderText("اكتب إجابتك هنا..."))[0] as HTMLTextAreaElement).value).toBe("إجابة لم تُرسل");
    expect((await screen.findByTestId("journal-restored")).textContent).toContain("على هذا الجهاز");
    await waitFor(() => expect(journalOf()).toBeNull());
  });

  it("modern attempt: restored for the SAME attempt identity, merged per question with what another device saved meanwhile", async () => {
    serverState = modernState;
    await typeOfflineAndClose("من هذا الجهاز");
    serverState = { ...modernState, draftRevision: 3, draftAnswers: { q2: text("من الجهاز الآخر") } };
    mount();
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    const sent = saves[0].answers as Record<string, unknown>;
    expect(answerValue(sent.q1)).toBe("من هذا الجهاز");
    expect(sent.q2).toEqual(text("من الجهاز الآخر"));
    expect(saves[0]).toMatchObject({ expectedAttemptNumber: 1, expectedStartedAt: START, expectedAttemptEpoch: 1, expectedDraftRevision: 3 });
  });

  it("a DIFFERENT attempt (new startedAt) never receives the copy; it is removed", async () => {
    serverState = modernState;
    await typeOfflineAndClose("المحاولة القديمة");
    serverState = { ...modernState, activeAttempt: { ...modernState.activeAttempt, attemptNumber: 2, startedAt: "2026-01-02T10:00:00.000Z" } };
    const r = mount();
    await r.findAllByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 300));
    expect(saves.length).toBe(0);
    expect(screen.queryByTestId("journal-restored")).toBeNull();
    expect(journalOf()).toBeNull();
  });

  it("an attempt the server no longer lets this student write (canWrite false) never receives the copy", async () => {
    serverState = modernState;
    await typeOfflineAndClose("بعد الإغلاق");
    serverState = { ...modernState, canWrite: false };
    mount();
    await new Promise(res => setTimeout(res, 400));
    expect(saves.length).toBe(0);
    expect(screen.queryByTestId("journal-restored")).toBeNull();
    expect(journalOf()).toBeNull();
  });

  it("legacy untimed: an attempt submitted elsewhere meanwhile (attemptsUsed advanced) never receives the copy", async () => {
    await typeOfflineAndClose("الجيل القديم");
    serverState = { ...legacyState, attemptsUsed: 1, allowedAttempts: 2, activeAttempt: null };
    mount();
    await new Promise(res => setTimeout(res, 400));
    expect(saves.length).toBe(0);
    expect(journalOf()).toBeNull();
  });

  it("another student on the same device never receives it (and does not erase it)", async () => {
    await typeOfflineAndClose("إجابة الطالب الأول");
    const r = mount(S2);
    await r.findAllByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 300));
    expect(saves.length).toBe(0);
    expect(((await r.findAllByPlaceholderText("اكتب إجابتك هنا..."))[0] as HTMLTextAreaElement).value).toBe("");
    expect(answerValue(journalOf("stu-1")!.answers.q1)).toBe("إجابة الطالب الأول");
  });

  it("the server already has everything: nothing is re-sent, no notice, the copy is removed", async () => {
    await typeOfflineAndClose("وصلت فعلًا");
    serverState = { ...legacyState, draftRevision: 1, draftAnswers: { q1: text("وصلت فعلًا") } };
    mount();
    await new Promise(res => setTimeout(res, 400));
    expect(saves.length).toBe(0);
    expect(screen.queryByTestId("journal-restored")).toBeNull();
    expect(journalOf()).toBeNull();
  });

  it("online: the copy exists only while the edit is unsent — written at the edit, removed by the confirmed save", async () => {
    const r = mount();
    await typeFirst(r, "سريع");
    expect(answerValue(journalOf()!.answers.q1)).toBe("سريع");
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    await waitFor(() => expect(journalOf()).toBeNull());
  });

  it("a failed save keeps the copy (the server never confirmed it)", async () => {
    saveHandler = () => json(500, { ok: false, error: "x" });
    const r = mount();
    await typeFirst(r, "لم يُحفظ");
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    await new Promise(res => setTimeout(res, 200));
    expect(answerValue(journalOf()!.answers.q1)).toBe("لم يُحفظ");
    setOnline(false); window.dispatchEvent(new Event("offline"));      // stop this page's retry loop before the next test
  });

  it("a submit removes the copy", async () => {
    const r = mount();
    await typeFirst(r, "للتسليم");
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    writeJournal({ studentId: "stu-1", assignmentId: "asg1", attempt: null, generation: 0, base: {}, answers: { q1: text("للتسليم") } });
    fireEvent.click(await screen.findByRole("button", { name: "التالي" }));
    fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await waitFor(() => expect(submits).toBe(1), { timeout: 4000 });
    await waitFor(() => expect(journalOf()).toBeNull());
  });
});

describe("D1 — the copy follows the page's own merges and hydrations", () => {
  it("after a stale-draft merge whose save fails, the copy is rebased on the server draft it was merged with", async () => {
    const other = text("من الجهاز الآخر");
    saveHandler = n => {
      if (n === 1) { serverState = { ...legacyState, draftRevision: 1, draftAnswers: { q2: other } }; return json(409, { ok: false, error: "x", code: "DRAFT_STALE" }); }
      return json(400, { ok: false, error: "x" });
    };
    const r = mount();
    await typeFirst(r, "إجابتي");
    await waitFor(() => expect(saves.length).toBe(2), { timeout: 4000 });
    await waitFor(() => expect(journalOf()!.base).toEqual({ q2: other }));
    expect(answerValue(journalOf()!.answers.q1)).toBe("إجابتي");
    expect(journalOf()!.answers.q2).toEqual(other);
  });

  it("timed exam reopened at the «متابعة المحاولة» gate: a restore whose save failed is merged again after the continue hydration and saved", async () => {
    const attempt = { attemptNumber: 1, startedAt: START, endsAt: "2026-01-01T11:00:00.000Z", status: "started" };
    serverState = { ...legacyState, timed: true, requiresStart: true, durationMinutes: 60, attemptModelVersion: 2, activeAttempt: attempt, effectiveAttemptEndsAt: "2026-01-01T11:00:00.000Z" };
    startState = serverState;
    writeJournal({ studentId: "stu-1", assignmentId: "asg1", attempt: { attemptNumber: 1, startedAt: START }, generation: 0, base: {}, answers: { q1: text("قبل الانقطاع") } });
    saveHandler = n => n === 1 ? json(400, { ok: false, error: "x" }) : json(200, { ok: true, savedAt: SERVER_NOW, draftRevision: n, serverNow: SERVER_NOW });
    const preStart = { ...assignment, requiresStart: true, timed: true, durationMinutes: 60, exam: { title: "امتحان", metadata: {}, presentationTheme: "classic", coverPage: { enabled: false } } };
    mount(S1, preStart);
    await waitFor(() => expect(saves.length).toBe(1), { timeout: 4000 });
    expect(journalOf()).not.toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "متابعة المحاولة" }));
    await waitFor(() => expect(saves.length).toBe(2), { timeout: 4000 });
    expect(answerValue((saves[1].answers as Record<string, unknown>).q1)).toBe("قبل الانقطاع");
    expect(saves[1]).toMatchObject({ expectedAttemptNumber: 1, expectedStartedAt: START });
    await waitFor(() => expect(journalOf()).toBeNull());
  });
});

describe("D1 — the explicit logout removes every device copy", () => {
  it("«تسجيل الخروج» in the portal clears all students' copies and still logs out", async () => {
    writeJournal({ studentId: "stu-1", assignmentId: "asg1", attempt: null, generation: 0, base: {}, answers: { q1: text("أ") } });
    writeJournal({ studentId: "stu-2", assignmentId: "asg9", attempt: null, generation: 0, base: {}, answers: { q1: text("ب") } });
    localStorage.setItem("unrelated", "kept");
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/student-dashboard")) return json(200, { ok: true, student: { userId: "stu-1", code: "C1", displayName: "أحمد", classId: "c1", avatarId: "a1", shareAchievements: true }, classroom: { classId: "c1", name: "الصف", grade: "11", schoolYear: "2026" }, assignments: [], stats: { assigned: 0, completed: 0, average: null, pendingReview: 0, finalized: 0, inProgress: 0, averageFinalized: null }, strength: null, recognition: null, study: { lastActivity: null } });
      return json(404, { ok: false });
    }) as unknown as typeof fetch;
    const onLogout = vi.fn();
    render(<StudentPortal token={S1} displayName="أحمد" onLogout={onLogout} />);
    fireEvent.click(await screen.findByRole("button", { name: /تسجيل الخروج/ }, { timeout: 8000 }));
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(readJournal("stu-1", "asg1")).toBeNull();
    expect(readJournal("stu-2", "asg9")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("kept");
  }, 20000);
});
