// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Roadmap #10/#11 reliability fix pass — retrying visibility, offline-timeout (no finalize storm),
// reconnect resync-first + failure semantics, cross-attempt safety, offline manual-retry gating, single
// aria-live region. Fake timers are used for the retry/backoff test; the timeout tests use an
// already-expired state so the countdown's first tick fires deterministically (no reliance on wall clock).
const START = "2026-01-01T10:00:00.000Z";
const legacyState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 2, requiresStart: false, serverNow: "2026-01-01T10:30:00.000Z",
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
// Attempt 2 (a DIFFERENT identity) — used for cross-attempt safety.
const attempt2State = { ...legacyState, activeAttempt: { attemptNumber: 2, startedAt: "2026-01-01T12:00:00.000Z", endsAt: "", status: "started" }, draftAnswers: { q1: { kind: "text", value: "ATTEMPT2_SERVER_DRAFT" } }, draftSavedAt: "2026-01-01T12:01:00.000Z" };
// SAME attempt-1 identity, but a NEWER server draft (another tab saved it) — used for clean-vs-dirty resync.
const sameAttemptNewDraft = { ...legacyState, draftAnswers: { q1: { kind: "text", value: "NEWER_FROM_OTHER_TAB" } }, draftSavedAt: "2026-01-01T10:45:00.000Z" };
// LEGACY untimed context (attemptModelVersion 1, no server start, no attempt identity) — used for legacy
// clean/dirty resync parity.
const legacyUntimed = { ...legacyState, attemptModelVersion: 1, timed: false, requiresStart: false, activeAttempt: null, canWrite: true, draftAnswers: {}, draftSavedAt: "" };
const timedExpiredState = {
  ...legacyState, durationMinutes: 60, timed: true,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "2026-01-01T10:05:00.000Z" },
  effectiveAttemptEndsAt: "2026-01-01T10:05:00.000Z", serverNow: "2026-01-01T10:30:00.000Z", attemptExpired: true, canWrite: false
};
const timedLiveState = {
  ...legacyState, durationMinutes: 60, timed: true,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "2026-01-01T11:00:00.000Z" },
  effectiveAttemptEndsAt: "2026-01-01T11:00:00.000Z", serverNow: "2026-01-01T10:30:00.000Z", attemptExpired: false, canWrite: true
};
// Timed LIVE attempt whose countdown expires ~1.5s after mount (effectiveEnd = serverNow + 1500ms) so the
// countdown tick fires triggerTimeout deterministically AFTER a user edit (used for the timeout-adoption tests).
const timedSoonState = {
  ...legacyState, durationMinutes: 60, timed: true,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "2026-01-01T10:30:01.500Z" },
  effectiveAttemptEndsAt: "2026-01-01T10:30:01.500Z", serverNow: "2026-01-01T10:30:00.000Z", attemptExpired: false, canWrite: true
};
const timedOutResult = { attemptNumber: 1, submittedAt: "2026-01-01T10:31:00.000Z", score: 0, totalMarks: 100, percentage: 0, manualReviewMarks: 0, finalized: true, timedOut: true };
const fullExam = { title: "امتحان", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam: fullExam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const rej = () => Promise.reject(new TypeError("network down"));
let subGetCalls = 0, saveCalls = 0, finalizeCalls = 0, startCalls = 0, submitCalls = 0, calls: string[] = [], lastSaveBody: Record<string, unknown> | null = null, onLogout: ReturnType<typeof vi.fn>;
let subGetHandler: (n: number) => Promise<Response>, saveHandler: (n: number) => Promise<Response>, finalizeHandler: (n: number) => Promise<Response>, startHandler: (n: number) => Promise<Response>, examHandler: () => Promise<Response>, submitHandler: (n: number) => Promise<Response>;
function installFetch() {
  subGetCalls = 0; saveCalls = 0; finalizeCalls = 0; startCalls = 0; submitCalls = 0; calls = []; lastSaveBody = null;
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-assignment/")) { calls.push("exam"); return examHandler(); }
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; calls.push("get"); return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "startAttempt") { startCalls++; calls.push("start"); return startHandler(startCalls); }
      if (b.action === "saveDraft") { saveCalls++; lastSaveBody = b; calls.push("save:" + JSON.stringify(b.answers)); return saveHandler(saveCalls); }
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; calls.push("finalize"); return finalizeHandler(finalizeCalls); }
      if (b.action === "submit") { submitCalls++; calls.push("submit"); return submitHandler(submitCalls); }
      return json(200, { ok: true, state: legacyState });
    }
    return json(404, { ok: false, error: "nf" });
  }) as unknown as typeof fetch;
}
const priorResult = { attemptNumber: 1, submittedAt: "2026-01-01T09:00:00.000Z", score: 80, totalMarks: 100, percentage: 80, manualReviewMarks: 0, finalized: true, timedOut: false };
const completedState = { ...legacyState, activeAttempt: null, canStartAttempt: true, canWrite: false, attemptsUsed: 1, allowedAttempts: 2, latestResult: priorResult, attempts: [priorResult] };
const startedState2 = { ...legacyState, activeAttempt: { attemptNumber: 2, startedAt: "2026-01-01T12:00:00.000Z", endsAt: "", status: "started" }, draftAnswers: {}, draftSavedAt: "", attemptsUsed: 1, allowedAttempts: 2, canStartAttempt: false, canWrite: true };
function setOnline(v: boolean) { Object.defineProperty(navigator, "onLine", { configurable: true, value: v }); }
const goOffline = () => { setOnline(false); window.dispatchEvent(new Event("offline")); };
const goOnline = () => { setOnline(true); window.dispatchEvent(new Event("online")); };
function mount(assignmentOverride: unknown = assignment) { onLogout = vi.fn(); return render(<StudentExamPage token="t" assignment={assignmentOverride as never} studentName="أ" className="ص" onBack={() => {}} onLogout={onLogout as unknown as () => void} />); }
const saveState = (r: ReturnType<typeof mount>) => r.container.querySelector(".iex-progress .iex-save-state")?.textContent || "";

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  setOnline(true); installFetch();
  subGetHandler = () => json(200, { ok: true, state: legacyState });
  saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" });
  finalizeHandler = () => json(200, { ok: true, result: timedOutResult, state: { ...timedExpiredState, activeAttempt: null, latestResult: timedOutResult } });
  startHandler = () => json(200, { ok: true, state: startedState2 });
  examHandler = () => json(200, { ok: true, assignment: { ...assignment, requiresStart: false, exam: fullExam } });
  submitHandler = () => json(200, { ok: true, result: timedOutResult, state: completedState });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); setOnline(true); });

// UX-7b-2: the final submit lives on the review screen (last question → "مراجعة الإجابات" → "تسليم الامتحان"); the shared ConfirmDialog stays the gate.
async function pressSubmit() { fireEvent.click(await screen.findByRole("button", { name: "مراجعة الإجابات" })); fireEvent.click(await screen.findByRole("button", { name: "تسليم الامتحان" })); }
describe("R10/R11 reliability", () => {
  it("1: RETRYING is visible during backoff (not masked by SAVING), then converges to saved", async () => {
    // First save 500 → backoff (RETRYING) → retry 200. The RETRYING label must appear during the backoff
    // window; SAVING is only shown while a request is actually in flight.
    saveHandler = (n) => n === 1 ? json(500, { ok: false, error: "خطأ" }) : json(200, { ok: true, savedAt: "2026-01-01T10:32:00.000Z" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "إجابة" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });       // first save attempt (500) done
    await waitFor(() => expect(saveState(r)).toContain("تتم إعادة المحاولة"), { timeout: 2000 }); // RETRYING during backoff
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 3000 }); // retry → saved
    expect(saveCalls).toBe(2);
  });

  it("3/4: reconnect resyncs BEFORE saving; a FAILED resync performs no save", async () => {
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "offline-edit" } });
    await new Promise(res => setTimeout(res, 30));
    expect(saveCalls).toBe(0);
    // Resync FAILS on reconnect → must NOT save on stale state.
    subGetHandler = () => rej();
    const before = calls.length;
    goOnline();
    await new Promise(res => setTimeout(res, 60));
    const after = calls.slice(before);
    expect(after).toContain("get");                    // a reconnect GET was attempted
    expect(after.some(c => c.startsWith("save"))).toBe(false); // …but no save on a failed resync
    expect(saveCalls).toBe(0);
  });

  it("3b: on a SUCCESSFUL reconnect the GET precedes the save (mount GET does not satisfy it)", async () => {
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "reconnect-edit" } });
    await new Promise(res => setTimeout(res, 30));
    const before = calls.length;                       // baseline AFTER mount GET, so mount cannot satisfy it
    goOnline();
    await waitFor(() => expect(calls.slice(before).some(c => c.startsWith("save"))).toBe(true), { timeout: 2000 });
    const seg = calls.slice(before);
    expect(seg.indexOf("get")).toBeGreaterThanOrEqual(0);
    expect(seg.indexOf("get")).toBeLessThan(seg.findIndex(c => c.startsWith("save")));
  });

  it("5: cross-attempt — a dirty attempt-1 snapshot is NEVER uploaded when the server now has attempt 2", async () => {
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await new Promise(res => setTimeout(res, 30));
    subGetHandler = () => json(200, { ok: true, state: attempt2State }); // server advanced to attempt 2
    goOnline();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    await new Promise(res => setTimeout(res, 80));
    // the attempt-1 snapshot must never be saved…
    expect(calls.some(c => c.startsWith("save") && c.includes("ATTEMPT1_LOCAL"))).toBe(false);
    // …and the UI adopts attempt 2's server draft
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement)?.value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
  });

  it("8: timed expiry while offline locks inputs and fires ZERO finalize calls (no storm)", async () => {
    subGetHandler = () => json(200, { ok: true, state: timedExpiredState });
    setOnline(false);
    const r = mount();
    await waitFor(() => expect(r.container.textContent || "").toContain("انتهى وقت المحاولة"), { timeout: 2000 }); // inputs locked
    await new Promise(res => setTimeout(res, 1200));   // let a countdown tick or two pass
    expect(finalizeCalls).toBe(0);                     // never finalized while offline
  });

  it("9: reconnect after offline expiry resyncs FIRST then finalizes exactly once", async () => {
    subGetHandler = () => json(200, { ok: true, state: timedExpiredState });
    setOnline(false);
    const r = mount();
    await waitFor(() => expect(r.container.textContent || "").toContain("انتهى وقت المحاولة"), { timeout: 2000 });
    expect(finalizeCalls).toBe(0);
    const before = calls.length;
    goOnline();
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 2000 });
    const seg = calls.slice(before);
    expect(seg.indexOf("get")).toBeGreaterThanOrEqual(0);
    expect(seg.indexOf("get")).toBeLessThan(seg.indexOf("finalize")); // resync BEFORE finalize
  });

  it("10: reconnect where the server EXTENDED the attempt (now live) → no finalize, exam resumes", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: timedExpiredState }) : json(200, { ok: true, state: timedLiveState });
    setOnline(false);
    const r = mount();
    await waitFor(() => expect(r.container.textContent || "").toContain("انتهى وقت المحاولة"), { timeout: 2000 });
    goOnline();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2), { timeout: 2000 });
    await new Promise(res => setTimeout(res, 80));
    expect(finalizeCalls).toBe(0);                     // extended attempt is not finalized
  });

  it("15: no manual-retry button while definitely offline (only the keep-page-open hint)", async () => {
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "x" } });
    await waitFor(() => expect(saveState(r)).toContain("غير متصل"), { timeout: 2000 });
    expect(r.container.querySelector(".iex-retry-save")).toBeNull();      // no doomed retry button offline
    expect(r.container.querySelector(".iex-progress .iex-save")?.textContent || "").toContain("أبقِ الصفحة مفتوحة حتى يعود الاتصال.");  // hint shown instead (UX-7b-1: next to the save status)
  });

  it("16: exactly ONE aria-live save-status region", async () => {
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    const live = r.container.querySelectorAll('[aria-live="polite"].iex-save-state');
    expect(live.length).toBe(1);
  });

  it("F: starting attempt 2 (no user edit) schedules NO autosave and inherits nothing from attempt 1", async () => {
    subGetHandler = () => json(200, { ok: true, state: completedState }); // attempt 1 done, can start 2
    const r = mount();
    await r.findByText(/تم تسليم المحاولة/);           // result screen
    fireEvent.click(await r.findByText(/بدء محاولة جديدة/));
    await r.findByText("سؤال الاختبار السري");         // attempt 2 revealed (empty server draft)
    const saveBaseline = saveCalls;
    await new Promise(res => setTimeout(res, 900));    // past the autosave debounce
    expect(saveCalls).toBe(saveBaseline);              // hydration did NOT schedule a save
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);           // clean: nothing unsaved
    expect(saveState(r)).toContain("تم الحفظ");
    expect(saveState(r)).not.toContain("آخر حفظ:");    // no inherited attempt-1 saved time (draftSavedAt "")
    // Now a real edit → exactly one save, carrying attempt-2 identity.
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "attempt2 answer" } });
    await waitFor(() => expect(saveCalls).toBe(saveBaseline + 1), { timeout: 2000 });
    expect(lastSaveBody && lastSaveBody.expectedAttemptNumber).toBe(2);
    expect(lastSaveBody && lastSaveBody.expectedStartedAt).toBe("2026-01-01T12:00:00.000Z");
  });

  it("H: a stale-attempt 409 save adopts attempt 2's server draft (no auto-save, no tracking suffix); a later edit uses attempt-2 identity", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: attempt2State });
    saveHandler = () => json(409, { ok: false, error: "تم بدء محاولة جديدة لهذا الواجب." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });        // save → 409 → reconcile
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
    expect(r.container.textContent).not.toContain("رمز التتبع");             // expected 409 → no tracking suffix
    const saveBaseline = saveCalls;
    await new Promise(res => setTimeout(res, 900));
    expect(saveCalls).toBe(saveBaseline);                                    // adoption did NOT auto-save
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "attempt2 edit" } });
    await waitFor(() => expect(saveCalls).toBe(saveBaseline + 1), { timeout: 2000 });
    expect(lastSaveBody && lastSaveBody.expectedAttemptNumber).toBe(2);       // attempt-2 identity only
  });

  it("I: a SAME-attempt 409 preserves legitimate unsaved local answers (not replaced by server draft)", async () => {
    // Both GETs return the SAME attempt-1 identity, but the (stale) server draft differs; local edits must win.
    subGetHandler = () => json(200, { ok: true, state: { ...legacyState, draftAnswers: { q1: { kind: "text", value: "SERVER_OLD_DRAFT" } } } });
    saveHandler = () => json(409, { ok: false, error: "تعارض مؤقت." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "LOCAL_UNSAVED_EDIT" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });        // save → 409 → reconcile (same attempt)
    await new Promise(res => setTimeout(res, 80));
    expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("LOCAL_UNSAVED_EDIT"); // preserved
  });

  it("A: same-attempt resync on a CLEAN tab adopts the newer server draft (server wins); no autosave; a later edit builds on it with attempt-1 identity", async () => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();                                 // attempt 1, empty server draft → clean
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    const saveBaseline = saveCalls;                     // 0
    // Another tab saved a NEWER draft under the SAME attempt; an authoritative resync arrives.
    subGetHandler = () => json(200, { ok: true, state: sameAttemptNewDraft });
    document.dispatchEvent(new Event("visibilitychange"));
    // Server wins for a clean tab: the newer draft is adopted…
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("NEWER_FROM_OTHER_TAB"), { timeout: 2000 });
    await waitFor(() => expect(saveState(r)).toContain("آخر حفظ:"), { timeout: 2000 }); // displays the server draftSavedAt
    await new Promise(res => setTimeout(res, 900));     // past the autosave debounce
    expect(saveCalls).toBe(saveBaseline);              // hydration scheduled ZERO saves
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);           // clean → no warning
    // A real edit now → exactly one save, built on the hydrated draft, carrying attempt-1 identity.
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "NEWER_FROM_OTHER_TAB +edit" } });
    await waitFor(() => expect(saveCalls).toBe(saveBaseline + 1), { timeout: 2000 });
    expect(lastSaveBody && lastSaveBody.expectedAttemptNumber).toBe(1);
    expect(lastSaveBody && lastSaveBody.expectedStartedAt).toBe(START);
    const saved = lastSaveBody && (lastSaveBody.answers as Record<string, { value?: string }>);
    expect(saved && saved.q1 && saved.q1.value).toBe("NEWER_FROM_OTHER_TAB +edit"); // started from the hydrated draft
  });

  it("C: another tab submitted — reconnect resync adopts the closed state, clears local answers, sends no stale save, stops warning", async () => {
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "DIRTY_LOCAL_ANSWER" } });
    await new Promise(res => setTimeout(res, 30));
    expect(saveCalls).toBe(0);                          // offline: dirty, nothing sent yet
    subGetHandler = () => json(200, { ok: true, state: completedState }); // another tab submitted → no active attempt
    const before = calls.length;
    goOnline();
    await r.findByText(/تم تسليم المحاولة/);             // authoritative closed state → result screen
    const seg = calls.slice(before);
    expect(seg.some(c => c.startsWith("save"))).toBe(false); // obsolete dirty snapshot NEVER uploaded
    await new Promise(res => setTimeout(res, 80));
    expect(saveCalls).toBe(0);
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);           // closed attempt → no stale-answer warning
  });

  it("D: reconcileTimed409 stopped path (attempt gone) adopts the closed state, uploads no stale answers, stops warning", async () => {
    saveHandler = () => json(409, { ok: false, error: "تم بدء محاولة جديدة لهذا الواجب." });
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: completedState });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "DIRTY_BEFORE_STOP" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });  // save → 409 → reconcile
    await r.findByText(/تم تسليم المحاولة/);                            // stopped → result screen
    const baseline = saveCalls;
    await new Promise(res => setTimeout(res, 120));
    expect(saveCalls).toBe(baseline);                                   // no stale save after closure
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);
  });

  it("A (epoch): a stale attempt-1 200 arriving after adopting attempt 2 never marks attempt 2 saved; attempt-2 edit needs its own confirmation", async () => {
    let resolve1: (v: Response) => void = () => {}, resolve2: (v: Response) => void = () => {};
    saveHandler = (n) => {
      if (n === 1) return new Promise<Response>(res => { resolve1 = res; });
      if (n === 2) return new Promise<Response>(res => { resolve2 = res; });
      return json(200, { ok: true, savedAt: "2026-01-01T13:30:00.000Z" });
    };
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: attempt2State });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });   // attempt-1 save in flight (held)
    document.dispatchEvent(new Event("visibilitychange"));               // another tab → attempt 2 authoritative
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
    resolve1(await json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" })); // stale attempt-1 200 (must be dropped)
    await new Promise(res => setTimeout(res, 80));
    expect(saveState(r)).toContain("تم الحفظ");                          // attempt 2 clean from its OWN server state
    // Edit attempt 2 → must not read saved until its own save confirms (proves savedRevision wasn't contaminated).
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "attempt2 edit" } });
    await waitFor(() => expect(saveCalls).toBe(2), { timeout: 2000 });   // attempt-2 save in flight (held)
    expect(saveState(r)).not.toContain("تم الحفظ");                      // pending/saving, NOT saved
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(true);                              // unsaved attempt-2 edit → warns
    expect(lastSaveBody && lastSaveBody.expectedAttemptNumber).toBe(2);  // attempt-2 identity
    expect(lastSaveBody && lastSaveBody.expectedStartedAt).toBe("2026-01-01T12:00:00.000Z");
    resolve2(await json(200, { ok: true, savedAt: "2026-01-01T12:30:00.000Z" }));
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 }); // now genuinely saved
  });

  it("B (epoch): a stale attempt-1 failure after adopting attempt 2 triggers no error/retry/reconcile on attempt 2", async () => {
    let reject1: (v: Response) => void = () => {};
    saveHandler = (n) => n === 1 ? new Promise<Response>(res => { reject1 = res; }) : json(200, { ok: true, savedAt: "x" });
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: attempt2State });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
    const getsBefore = subGetCalls;
    reject1(await json(500, { ok: false, error: "خطأ_قديم_بالخادم" }));  // stale attempt-1 5xx
    await new Promise(res => setTimeout(res, 120));
    expect(r.container.textContent).not.toContain("خطأ_قديم_بالخادم");   // no stale error surfaced
    expect(r.container.textContent).not.toContain("رمز التتبع");         // no stale tracking code
    expect(saveState(r)).toContain("تم الحفظ");                          // attempt 2 stays clean
    expect(subGetCalls).toBe(getsBefore);                               // no reconcile/resync from stale failure
    expect(saveCalls).toBe(1);                                          // no retry of the stale request
  });

  it("C (epoch): a pending autosave debounce is cancelled when an authoritative resync adopts a new context", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: attempt2State });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "PENDING_EDIT" } });        // schedules the 800ms debounce
    expect(saveCalls).toBe(0);                                          // not fired yet
    document.dispatchEvent(new Event("visibilitychange"));              // resync adopts attempt 2 mid-debounce
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
    await new Promise(res => setTimeout(res, 900));                     // well past the original debounce window
    expect(saveCalls).toBe(0);                                          // the obsolete snapshot was never sent
  });

  it("D (legacy): a CLEAN legacy untimed tab adopts the newer server draft on resync (server wins), no autosave", async () => {
    const legacyNewDraft = { ...legacyUntimed, draftAnswers: { q1: { kind: "text", value: "NEW_SERVER_DRAFT" } }, draftSavedAt: "2026-01-01T10:50:00.000Z" };
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyUntimed }) : json(200, { ok: true, state: legacyNewDraft });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");                 // clean legacy tab
    const saveBaseline = saveCalls;
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("NEW_SERVER_DRAFT"), { timeout: 2000 });
    await waitFor(() => expect(saveState(r)).toContain("آخر حفظ:"), { timeout: 2000 }); // server saved-time shown
    await new Promise(res => setTimeout(res, 900));
    expect(saveCalls).toBe(saveBaseline);                              // hydration scheduled no save
  });

  it("E (legacy): a legacy untimed tab with unsaved edits keeps them on resync (no overwrite)", async () => {
    subGetHandler = () => json(200, { ok: true, state: { ...legacyUntimed, draftAnswers: { q1: { kind: "text", value: "SERVER_OTHER_DRAFT" } }, draftSavedAt: "2026-01-01T10:55:00.000Z" } });
    saveHandler = () => new Promise<Response>(() => {});               // hold the save so the edit stays unsaved (dirty)
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "LOCAL_LEGACY_UNSAVED" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });  // dirty (save in flight, unacked)
    document.dispatchEvent(new Event("visibilitychange"));             // authoritative resync (same legacy context)
    await new Promise(res => setTimeout(res, 100));
    expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("LOCAL_LEGACY_UNSAVED"); // preserved
  });

  it("A (legacy gen): a fresh legacy untimed tab (activeAttempt=null) saves its offline-first edit on reconnect, GET first, no modern identity", async () => {
    subGetHandler = () => json(200, { ok: true, state: legacyUntimed });
    saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:40:00.000Z" });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "LEGACY_OFFLINE_ANSWER" } });
    await new Promise(res => setTimeout(res, 30));
    expect(saveCalls).toBe(0);                                        // offline: nothing sent
    const before = calls.length;
    goOnline();
    await waitFor(() => expect(calls.slice(before).some(c => c.startsWith("save"))).toBe(true), { timeout: 2000 });
    const seg = calls.slice(before);
    expect(seg.indexOf("get")).toBeGreaterThanOrEqual(0);
    expect(seg.indexOf("get")).toBeLessThan(seg.findIndex(c => c.startsWith("save"))); // authoritative GET before save
    expect(saveCalls).toBe(1);                                        // exactly one save
    expect((lastSaveBody!.answers as Record<string, { value?: string }>).q1.value).toBe("LEGACY_OFFLINE_ANSWER");
    expect("expectedAttemptNumber" in lastSaveBody!).toBe(false);     // legacy: no fake modern identity
    expect("expectedStartedAt" in lastSaveBody!).toBe(false);
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 });
  });

  it("B (legacy gen): a generation change (another tab submitted) discards the old local snapshot — no upload, result adopted, no warn", async () => {
    const legacyDone = { ...legacyUntimed, attemptsUsed: 1, canWrite: false, canAttempt: true, latestResult: priorResult, attempts: [priorResult] };
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyUntimed }) : json(200, { ok: true, state: legacyDone });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.change(ta, { target: { value: "OLD_GEN_ANSWER" } });
    await new Promise(res => setTimeout(res, 30));
    const before = calls.length;
    goOnline();
    await r.findByText(/تم تسليم المحاولة/);                          // authoritative result adopted
    const seg = calls.slice(before);
    expect(seg.some(c => c.startsWith("save"))).toBe(false);          // old-generation answers NEVER uploaded
    await new Promise(res => setTimeout(res, 80));
    expect(saveCalls).toBe(0);
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);                         // obsolete attempt → no warning
  });

  it("C (legacy gen): startNext begins a clean local attempt (no save, no inherited saved-time, no warn); first edit saves at the new generation", async () => {
    const legacyDone = { ...legacyUntimed, attemptsUsed: 1, canWrite: true, canAttempt: true, latestResult: priorResult, attempts: [priorResult], draftSavedAt: "2026-01-01T09:30:00.000Z" };
    subGetHandler = () => json(200, { ok: true, state: legacyDone });
    saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T11:00:00.000Z" });
    const r = mount();
    await r.findByText(/تم تسليم المحاولة/);                          // result screen
    fireEvent.click(await r.findByText(/بدء محاولة جديدة/));
    await r.findByText("سؤال الاختبار السري");                        // attempt 2 revealed locally
    const saveBaseline = saveCalls;
    await new Promise(res => setTimeout(res, 900));                   // past debounce
    expect(saveCalls).toBe(saveBaseline);                            // Start Next itself schedules no save
    expect(saveState(r)).not.toContain("آخر حفظ:");                   // no inherited attempt-1 saved-time
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);                         // clean → no warn
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "attempt2 legacy answer" } });
    await waitFor(() => expect(saveCalls).toBe(saveBaseline + 1), { timeout: 2000 });
    expect("expectedAttemptNumber" in lastSaveBody!).toBe(false);     // legacy generation → no modern identity
  });

  it("D (submit epoch): a pre-submit 409 that reconciles to a new attempt cancels the submit and leaves the reconciled UI (no stale error)", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: legacyState }) : json(200, { ok: true, state: attempt2State });
    saveHandler = () => json(409, { ok: false, error: "تم بدء محاولة جديدة لهذا الواجب." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "ATTEMPT1_DIRTY" } });
    await pressSubmit(); // submit → pre-save 409 → reconcile
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));                 // UX-7b-1: shared ConfirmDialog replaces window.confirm
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement).value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 });
    await new Promise(res => setTimeout(res, 80));
    expect(submitCalls).toBe(0);                                      // attempt 1 was NEVER submitted
    expect(r.container.textContent).not.toContain("تعذر حفظ إجاباتك");// no stale generic save error on attempt 2
    expect(r.container.textContent).not.toContain("رمز التتبع");
  });

  it("A (timeout): a successful timeout finalize adopts the closed state — result shown, no post-deadline save, no beforeunload warn", async () => {
    subGetHandler = () => json(200, { ok: true, state: timedSoonState });
    saveHandler = () => json(403, { ok: false, error: "الحفظ ممنوع مؤقتًا" });   // keep the edit unsaved (dirty) at timeout
    finalizeHandler = () => json(200, { ok: true, result: timedOutResult, state: { ...timedSoonState, activeAttempt: null, canWrite: false, attemptExpired: true, draftAnswers: {}, draftSavedAt: "", latestResult: timedOutResult, attempts: [timedOutResult] } });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 800));                       // edit before the ~2s countdown timeout
    fireEvent.change(ta, { target: { value: "DIRTY_BEFORE_TIMEOUT" } });
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 4000 });// countdown → finalize success
    await r.findByText(/تم تسليم المحاولة/);                              // result screen
    const baseline = saveCalls;
    await new Promise(res => setTimeout(res, 900));                       // well past any pending debounce
    expect(saveCalls).toBe(baseline);                                    // no post-deadline / post-result save
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);                             // obsolete dirty context cleared → no warn
  });

  it("B (timeout): finalize 409 with the SAME attempt live (extension) preserves local unsaved answers, resumes, no stale error", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: timedSoonState }) : json(200, { ok: true, state: timedLiveState });
    saveHandler = () => json(403, { ok: false, error: "الحفظ ممنوع مؤقتًا" });
    finalizeHandler = () => json(409, { ok: false, error: "انتهى وقت المحاولة." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 800));
    fireEvent.change(ta, { target: { value: "LOCAL_UNSAVED_TIMEOUT" } });
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 4000 });// timeout → finalize 409 → GET same live
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement)?.value).toBe("LOCAL_UNSAVED_TIMEOUT"), { timeout: 2000 }); // resumed, local preserved
    expect(r.container.textContent).not.toContain("انتهى الوقت");         // no stale timeout error
  });

  it("C (timeout): finalize 409 with a DIFFERENT live attempt adopts attempt 2 (discards attempt-1 answers); later edit uses attempt-2 identity", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: timedSoonState }) : json(200, { ok: true, state: attempt2State });
    saveHandler = () => json(403, { ok: false, error: "الحفظ ممنوع مؤقتًا" });
    finalizeHandler = () => json(409, { ok: false, error: "انتهى وقت المحاولة." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 800));
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 4000 });
    await waitFor(() => expect((r.container.querySelector(".iex-open") as HTMLTextAreaElement)?.value).toBe("ATTEMPT2_SERVER_DRAFT"), { timeout: 2000 }); // attempt 2 adopted
    const saveBaseline = saveCalls;
    await new Promise(res => setTimeout(res, 300));
    expect(saveCalls).toBe(saveBaseline);                                // no autosave merely from hydration
    fireEvent.change(r.container.querySelector(".iex-open") as HTMLTextAreaElement, { target: { value: "attempt2 edit" } });
    await waitFor(() => expect(saveCalls).toBe(saveBaseline + 1), { timeout: 2000 });
    expect(lastSaveBody && lastSaveBody.expectedAttemptNumber).toBe(2);   // attempt-2 identity
  });

  it("D (timeout): finalize 409 with no active attempt (already closed) shows the result, no retry, no warn, no stale error", async () => {
    subGetHandler = (n) => n === 1 ? json(200, { ok: true, state: timedSoonState }) : json(200, { ok: true, state: completedState });
    saveHandler = () => json(403, { ok: false, error: "الحفظ ممنوع مؤقتًا" });
    finalizeHandler = () => json(409, { ok: false, error: "انتهى وقت المحاولة." });
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    await new Promise(res => setTimeout(res, 800));
    fireEvent.change(ta, { target: { value: "ATTEMPT1_LOCAL" } });
    await waitFor(() => expect(finalizeCalls).toBe(1), { timeout: 4000 });
    await r.findByText(/تم تسليم المحاولة/);                              // authoritative result adopted
    expect(r.container.textContent).not.toContain("انتهى الوقت");         // no stale timeout error
    const be = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(be);
    expect(be.defaultPrevented).toBe(false);
    await new Promise(res => setTimeout(res, 300));
    expect(finalizeCalls).toBe(1);                                       // no finalize retry
  });

  it("J: a stale revision-N ack never shows saved while revision N+1 is still unsaved", async () => {
    let resolve1: (v: Response) => void = () => {};
    saveHandler = (n) => n === 1 ? new Promise<Response>(res => { resolve1 = res; }) : new Promise<Response>(() => {});
    const r = mount();
    const ta = await r.findByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.change(ta, { target: { value: "rev1" } });
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });        // rev1 save in flight (unresolved)
    fireEvent.change(ta, { target: { value: "rev2" } });                      // rev2 created before rev1 acks
    resolve1(await json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" })); // rev1 acks
    await new Promise(res => setTimeout(res, 60));
    expect(saveState(r)).not.toContain("تم الحفظ");                          // rev2 still unsaved → NOT saved
  });
});
