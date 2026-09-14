// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
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
const timedOutResult = { attemptNumber: 1, submittedAt: "2026-01-01T10:31:00.000Z", score: 0, totalMarks: 100, percentage: 0, manualReviewMarks: 0, finalized: true, timedOut: true };
const fullExam = { title: "امتحان", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
const assignment = { assignmentId: "asg1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100, exam: fullExam };

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const rej = () => Promise.reject(new TypeError("network down"));
let subGetCalls = 0, saveCalls = 0, finalizeCalls = 0, calls: string[] = [], onLogout: ReturnType<typeof vi.fn>;
let subGetHandler: (n: number) => Promise<Response>, saveHandler: (n: number) => Promise<Response>, finalizeHandler: (n: number) => Promise<Response>;
function installFetch() {
  subGetCalls = 0; saveCalls = 0; finalizeCalls = 0; calls = [];
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; calls.push("get"); return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "saveDraft") { saveCalls++; calls.push("save:" + JSON.stringify(b.answers)); return saveHandler(saveCalls); }
      if (b.action === "finalizeTimedOutAttempt") { finalizeCalls++; calls.push("finalize"); return finalizeHandler(finalizeCalls); }
      return json(200, { ok: true, state: legacyState });
    }
    return json(404, { ok: false, error: "nf" });
  }) as unknown as typeof fetch;
}
function setOnline(v: boolean) { Object.defineProperty(navigator, "onLine", { configurable: true, value: v }); }
const goOffline = () => { setOnline(false); window.dispatchEvent(new Event("offline")); };
const goOnline = () => { setOnline(true); window.dispatchEvent(new Event("online")); };
function mount(assignmentOverride: unknown = assignment) { onLogout = vi.fn(); return render(<StudentExamPage token="t" assignment={assignmentOverride as never} studentName="أ" className="ص" onBack={() => {}} onLogout={onLogout as unknown as () => void} />); }
const saveState = (r: ReturnType<typeof mount>) => r.container.querySelector(".iex-progress .iex-save-state")?.textContent || "";
const footText = (r: ReturnType<typeof mount>) => r.container.querySelector(".iex-foot")?.textContent || "";

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  setOnline(true); installFetch();
  subGetHandler = () => json(200, { ok: true, state: legacyState });
  saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" });
  finalizeHandler = () => json(200, { ok: true, result: timedOutResult, state: { ...timedExpiredState, activeAttempt: null, latestResult: timedOutResult } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); setOnline(true); });

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
    expect(footText(r)).toContain("أبقِ الصفحة مفتوحة حتى يعود الاتصال.");  // hint shown instead
  });

  it("16: exactly ONE aria-live save-status region", async () => {
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    const live = r.container.querySelectorAll('[aria-live="polite"].iex-save-state');
    expect(live.length).toBe(1);
  });
});
