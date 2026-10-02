// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, act, fireEvent } from "@testing-library/react";
import StudentExamPage from "../StudentExamPage";
import StudentAssignmentCard from "../student/StudentAssignmentCard";

// Phase 17E-C — the student result screen while OFFICIAL automatic coding grading runs asynchronously on the server.
//   • the SERVER is the only authority: the page renders `latestResult.autoGradingStatus` (queued | processing | retrying |
//     delayed | complete) next to — never merged with — the canonical gradingStatus (final vs provisional mark);
//   • it refreshes by re-reading the EXISTING read-only GET /api/student-submission/{id}: bounded, polite polling only while the
//     result screen shows OPEN automatic grading — one chain, no overlap, back-off, paused while hidden, aborted on unmount,
//     stopped on completion / another attempt / after a foreground window;
//   • a failed refresh is never "retrying" and never erases the last known result; a late / older read never overwrites a newer
//     one, and never pulls the student out of a newly started attempt;
//   • nothing technical (job ids, runner codes, recovery internals, hidden tests) and no student action on official grading.
// Fail-first on b41451ea: the page shows one generic sentence and never refreshes while the result is open.

const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "ق", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الامتحان الأول", marks: 10 }] }] };
const ASSIGNMENT = { assignmentId: "a1", title: "واجب", instructions: "ت", openAt: "", dueAt: "", effectiveDueAt: "", maxAttempts: 2, durationMinutes: 0, requiresStart: true, timed: false, questionCount: 1, totalMarks: 10, exam: EXAM };
const BASE = { attemptsUsed: 1, allowedAttempts: 2, canAttempt: true, dueClosed: false, availability: "open", durationMinutes: 0, timed: false, attemptModelVersion: 3, attemptPolicy: "continuous", requiresStart: true, serverNow: "2026-03-01T12:00:00.000Z", activeAttempt: null, effectiveAttemptEndsAt: "", attemptExpired: false, canStartAttempt: true, canWrite: false, draftAnswers: {}, draftSavedAt: "" };
type R = Record<string, unknown>;
const result = (over: R = {}): R => ({ attemptNumber: 1, submittedAt: "2026-03-01T10:00:00.000Z", score: 2, totalMarks: 10, percentage: 20, manualReviewMarks: 8, finalized: false, gradingStatus: "pendingReview", teacherFeedback: "", timedOut: false, endReason: "submitted", ...over });
const open = (status: string, over: R = {}) => result({ autoGradingStatus: status, autoGradingPending: true, ...over });
const stateWith = (latest: R | null, over: R = {}): R => ({ ...BASE, latestResult: latest, attempts: latest ? [latest] : [], ...over });
const TECH = /RUNNER|CALLBACK|SWEEP|EXECUTION_|503|jobId|cg_|revision|technicalCode|lease|stale|hidden|اختبار مخفي|المخرجات المتوقعة|Docker/i;

type Deferred = { resolve: (v: unknown) => void; reject: (e: unknown) => void };
type Call = { url: string; method: string; body: R | null; signal?: AbortSignal | null };
/** A scripted server: GET returns `server.state` (or a held / failing response); POSTs and the exam body are routed. */
function makeServer(initial: R) {
  const server = { state: initial, calls: [] as Call[], hold: false, fail: false as false | "500" | "network", held: [] as Deferred[], onPost: null as null | ((b: R) => R) };
  const json = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, json: async () => body }) as unknown as Response;
  globalThis.fetch = vi.fn((url: string, init: RequestInit = {}) => {
    const method = (init.method || "GET").toUpperCase(), body = init.body ? JSON.parse(String(init.body)) as R : null;
    server.calls.push({ url: String(url), method, body, signal: init.signal });
    if (String(url).startsWith("/api/student-assignment/")) return Promise.resolve(json(200, { ok: true, assignment: { exam: EXAM, requiresStart: false } }));
    if (method === "POST") return Promise.resolve(json(200, server.onPost ? server.onPost(body!) : { ok: true, state: server.state }));
    if (server.fail === "network") return Promise.reject(new TypeError("Failed to fetch"));
    if (server.fail === "500") return Promise.resolve(json(500, { ok: false, error: "x" }));
    const snapshot = { ok: true, state: JSON.parse(JSON.stringify(server.state)) };
    if (server.hold) return new Promise((resolve, reject) => { server.held.push({ resolve: () => resolve(json(200, snapshot)), reject }); init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))); });
    return Promise.resolve(json(200, snapshot));
  }) as unknown as typeof fetch;
  return server;
}
const gets = (s: ReturnType<typeof makeServer>) => s.calls.filter(c => c.method === "GET" && c.url.startsWith("/api/student-submission/")).length;
const posts = (s: ReturnType<typeof makeServer>) => s.calls.filter(c => c.method === "POST");
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const settle = async () => { for (let i = 0; i < 6; i++) await flush(0); };
const mount = async (_server: ReturnType<typeof makeServer>, assignment: R = ASSIGNMENT) => {
  const utils = render(<StudentExamPage token="t" assignment={assignment as never} studentName="أ" className="ص" onBack={() => {}} onLogout={() => {}} />);
  await settle();
  return utils;
};
const panel = () => screen.queryByTestId("coding-grading-status");
const statusOf = () => panel()?.getAttribute("data-status") ?? null;
const setVisibility = async (v: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
  Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" });
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
};

beforeEach(() => { vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }); vi.spyOn(console, "error").mockImplementation(() => {}); localStorage.clear(); sessionStorage.clear(); });
afterEach(async () => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); });

describe("17E-C polling policy (pure)", () => {
  it("3 s for 30 s, 5 s until 2 min, then 10 s; a 5-minute foreground window; only automatically-progressing states are polled", async () => {
    const { codingPollDelayMs, CODING_POLL_WINDOW_MS, shouldPollCodingGrading } = await import(/* @vite-ignore */ "../codingGradingStatus" + "");
    expect([0, 29999, 30000, 119999, 120000, 3600000].map(codingPollDelayMs)).toEqual([3000, 3000, 5000, 5000, 10000, 10000]);
    expect(CODING_POLL_WINDOW_MS).toBe(300000);
    expect(["queued", "processing", "retrying", "delayed", "complete", undefined].map(x => shouldPollCodingGrading(x as never))).toEqual([true, true, true, false, false, false]);
  });
});

describe("17E-C UI1–UI8 — one safe status panel, separate from mark finality", () => {
  it("UI1 queued: submitted + waiting for automatic grading to start; you may leave", async () => {
    await mount(makeServer(stateWith(open("queued"))));
    expect(statusOf()).toBe("queued");
    expect(panel()!.textContent).toMatch(/تم تسليم الامتحان بنجاح/);
    expect(panel()!.textContent).toMatch(/بانتظار بدء التصحيح الآلي لأسئلة البرمجة/);
    expect(panel()!.textContent).toMatch(/يمكنك مغادرة الصفحة بأمان/);
  });
  it("UI2 processing: a workflow status (never 'your code is running in Docker'); the result is stored in the account", async () => {
    await mount(makeServer(stateWith(open("processing"))));
    expect(statusOf()).toBe("processing");
    expect(panel()!.textContent).toMatch(/جارٍ التصحيح الآلي لأسئلة البرمجة/);
    expect(panel()!.textContent).toMatch(/ستُحفظ النتيجة في حسابك/);
    expect(document.body.textContent).not.toMatch(TECH);
  });
  it("UI3 retrying: calm, non-technical, no resubmission, no student retry / regrade control", async () => {
    await mount(makeServer(stateWith(open("retrying"))));
    expect(statusOf()).toBe("retrying");
    expect(panel()!.textContent).toMatch(/يتم استكمال التصحيح الآلي بعد تأخير تقني مؤقت/);
    expect(panel()!.textContent).toMatch(/لا تحتاج إلى إعادة تسليم الامتحان/);
    expect(document.body.textContent).not.toMatch(TECH);
    expect(screen.queryByRole("button", { name: /إعادة التصحيح|أعد التصحيح|تصحيح مجددًا|إعادة المحاولة/ })).toBeNull();
  });
  it("UI3b delayed (recovery exhausted): stays under review, no action needed", async () => {
    await mount(makeServer(stateWith(open("delayed"))));
    expect(statusOf()).toBe("delayed");
    expect(panel()!.textContent).toMatch(/تعذّر إكمال التصحيح الآلي حاليًا، وستبقى النتيجة قيد المراجعة/);
    expect(document.body.textContent).not.toMatch(TECH);
  });
  it("UI4 / UI5 complete + pendingReview: automatic grading done, the mark is STILL provisional (never 'final')", async () => {
    await mount(makeServer(stateWith(result({ autoGradingStatus: "complete" }))));
    expect(statusOf()).toBe("complete");
    expect(panel()!.textContent).toMatch(/اكتمل التصحيح الآلي لأسئلة البرمجة/);
    expect(panel()!.textContent).toMatch(/العلامة ما زالت مؤقتة بانتظار مراجعة المعلم/);
    expect(document.body.textContent).toMatch(/علامة مؤقتة/);
    expect(document.body.textContent).not.toMatch(/العلامة النهائية/);
  });
  it("UI6 complete + final: the canonical helper says final", async () => {
    await mount(makeServer(stateWith(result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, score: 10, percentage: 100 }))));
    expect(statusOf()).toBe("complete");
    expect(document.body.textContent).toMatch(/العلامة النهائية/);
    expect(panel()!.textContent).not.toMatch(/مؤقتة/);
  });
  it("UI7 / POLL3 a no-coding exam: no coding panel and NO extra request, ever", async () => {
    const s = makeServer(stateWith(result({ gradingStatus: "final", finalized: true, manualReviewMarks: 0 })));
    await mount(s);
    const n = gets(s);
    await flush(10 * 60 * 1000);
    expect(panel()).toBeNull();
    expect(gets(s)).toBe(n);
  });
  it("UI8 a manual-mode coding question (pendingReview, no automatic target): no coding panel, no polling", async () => {
    const s = makeServer(stateWith(result()));
    await mount(s);
    const n = gets(s);
    await flush(5 * 60 * 1000);
    expect(panel()).toBeNull();
    expect(screen.queryByTestId("coding-grading-pending")).toBeNull();
    expect(gets(s)).toBe(n);
  });
  it("backward compatibility: an older payload with only autoGradingPending keeps the 17C sentence and does not poll", async () => {
    const s = makeServer(stateWith(result({ autoGradingPending: true })));
    await mount(s);
    const n = gets(s);
    expect(screen.getByTestId("coding-grading-pending").textContent).toMatch(/جارٍ استكمال التصحيح الآلي/);
    await flush(60 * 1000);
    expect(gets(s)).toBe(n);
  });
  it("accessibility: the panel is a polite status region with TEXT (any spinner is decorative)", async () => {
    await mount(makeServer(stateWith(open("processing"))));
    const live = panel()!.closest("[role=status]") || panel()!.querySelector("[role=status]");
    expect(live).not.toBeNull();
    expect(live!.getAttribute("aria-live") === null || live!.getAttribute("aria-live") === "polite").toBe(true);
    for (const el of Array.from(panel()!.querySelectorAll(".iex-coding-spinner"))) expect(el.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("17E-C POLL1–POLL10 — bounded, read-only, race-safe refresh", () => {
  it("POLL1 / POLL2 open grading polls the read-only GET; completion stops polling and updates the result atomically", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    const n = gets(s);
    await flush(3000);
    expect(gets(s)).toBe(n + 1);
    s.state = stateWith(result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, score: 10, percentage: 100 }));
    await flush(3000);
    await settle();
    expect(statusOf()).toBe("complete");
    expect(document.body.textContent).toMatch(/10\s*\/ 10/);
    expect(document.body.textContent).toMatch(/100%/);
    expect(document.body.textContent).toMatch(/العلامة النهائية/);
    const done = gets(s);
    await flush(10 * 60 * 1000);
    expect(gets(s)).toBe(done);
    expect(posts(s)).toHaveLength(0);                                                       // observing never operates grading
  });
  it("cadence: ~3 s at first, then ~5 s, then ~10 s; the foreground window ends with a calm 'come back later' note", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    const base = gets(s);
    await flush(30 * 1000);
    const first30 = gets(s) - base;
    expect(first30).toBeGreaterThanOrEqual(8); expect(first30).toBeLessThanOrEqual(11);
    await flush(90 * 1000);
    const next90 = gets(s) - base - first30;
    expect(next90).toBeGreaterThanOrEqual(15); expect(next90).toBeLessThanOrEqual(19);
    await flush(180 * 1000);
    const total5min = gets(s) - base;
    expect(total5min).toBeLessThanOrEqual(50);
    await flush(30 * 60 * 1000);
    expect(gets(s) - base).toBe(total5min);                                                   // window over: no more background reads
    expect(panel()!.textContent).toMatch(/لا يزال التصحيح جاريًا\. يمكنك مغادرة الصفحة والعودة لاحقًا لرؤية النتيجة/);
    expect(statusOf()).toBe("processing");                                                    // a polling timeout is NOT a grading timeout
  });
  it("POLL4 one chain: a slow read is never overlapped by another poll", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    const n = gets(s);
    s.hold = true;
    await flush(3000);
    expect(gets(s)).toBe(n + 1);
    await flush(60 * 1000);
    expect(gets(s)).toBe(n + 1);
    s.hold = false; s.held.splice(0).forEach(d => d.resolve(null));
    await settle();
    await flush(5000);                                                                         // > 60 s into the window: ~5 s cadence
    expect(gets(s)).toBe(n + 2);
  });
  it("POLL5 unmount aborts the in-flight poll and stops the chain", async () => {
    const s = makeServer(stateWith(open("processing")));
    const u = await mount(s);
    s.hold = true;
    await flush(3000);
    const last = s.calls[s.calls.length - 1];
    expect(last.signal).toBeTruthy();
    u.unmount();
    expect(last.signal!.aborted).toBe(true);
    const n = gets(s);
    await flush(5 * 60 * 1000);
    expect(gets(s)).toBe(n);
  });
  it("POLL6 / POLL7 hidden tab pauses polling; returning refreshes immediately and polling resumes", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    await setVisibility("hidden");
    const n = gets(s);
    await flush(10 * 60 * 1000);
    expect(gets(s)).toBe(n);
    s.state = stateWith(open("retrying"));
    await setVisibility("visible");
    await settle();
    expect(gets(s)).toBe(n + 1);
    expect(statusOf()).toBe("retrying");
    await flush(3000);
    expect(gets(s)).toBe(n + 2);
  });
  it("POLL8 / POLL9 a failed refresh keeps the last known result and is NEVER shown as server 'retrying'", async () => {
    for (const fail of ["network", "500"] as const) {
      const s = makeServer(stateWith(open("processing", { score: 7 })));
      const u = await mount(s);
      s.fail = fail;
      await flush(3000);
      await settle();
      expect(statusOf(), fail).toBe("processing");
      expect(document.body.textContent).toMatch(/7\s*\/ 10/);
      expect(screen.getByTestId("coding-grading-refresh-note").textContent).toMatch(/قد يستمر التصحيح على الخادم حتى عند انقطاع اتصال جهازك/);
      expect(document.body.textContent).not.toMatch(/فشل التصحيح|تعذّر التصحيح/);
      s.fail = false;
      await flush(10 * 1000);
      await settle();
      expect(screen.queryByTestId("coding-grading-refresh-note")).toBeNull();
      u.unmount();
    }
  });
  it("POLL10 a late, OLDER read can never overwrite a newer authoritative result", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    s.hold = true;
    await flush(3000);                                                                         // poll A (sees "processing") is held
    s.hold = false;
    s.state = stateWith(result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, score: 10, percentage: 100 }));
    await setVisibility("visible");                                                            // read B → complete (newer)
    await settle();
    expect(statusOf()).toBe("complete");
    s.held.splice(0).forEach(d => d.resolve(null));                                            // A finally answers with OLD data
    await settle();
    expect(statusOf()).toBe("complete");
    expect(document.body.textContent).toMatch(/العلامة النهائية/);
  });
  it("POLL10b the read TICKET (not the abort) protects order: a newer still-open read wins over a late older one", async () => {
    const s = makeServer(stateWith(open("processing", { score: 2 })));
    await mount(s);
    s.hold = true;
    await flush(3000);                                                                         // poll A holds the OLD snapshot
    s.hold = false;
    s.state = stateWith(open("retrying", { score: 5 }));
    await setVisibility("visible");                                                            // read B → retrying (still open: chain stays alive)
    await settle();
    expect(statusOf()).toBe("retrying");
    s.held.splice(0).forEach(d => d.resolve(null));
    await settle();
    expect(statusOf()).toBe("retrying");
    expect(document.body.textContent).toMatch(/5\s*\/ 10/);
  });
});

describe("17E-C RACE1–RACE3 — attempt identity and other tabs", () => {
  it("RACE1 attempt 1 grading open → the student starts attempt 2 → a late attempt-1 poll can NOT pull them out of attempt 2", async () => {
    const s = makeServer(stateWith(open("processing")));
    const active2 = { attemptNumber: 2, startedAt: "2026-03-01T12:00:00.000Z", endsAt: "", status: "draft", attemptEpoch: 1 };
    s.onPost = b => (b.action === "startAttempt" ? { ok: true, state: stateWith(open("processing"), { attemptsUsed: 1, activeAttempt: active2, canWrite: true, canStartAttempt: false }) } : { ok: true });
    await mount(s);
    s.hold = true;
    await flush(3000);                                                                         // attempt-1 poll in flight (old state: no active attempt)
    s.hold = false;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /بدء محاولة جديدة/ })); });
    await settle();
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();                               // attempt 2 is on screen
    s.held.splice(0).forEach(d => d.resolve(null));                                            // the stale attempt-1 read lands
    await settle();
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();
    expect(panel()).toBeNull();
    expect(screen.queryByText(/تم تسليم المحاولة 1/)).toBeNull();
    const n = gets(s);
    await flush(60 * 1000);
    expect(gets(s)).toBe(n);                                                                   // no polling during attempt 2
  });
  it("RACE1b a NON-abortable visibility resync issued before «start» lands after attempt 2 is shown → ignored (read invalidated)", async () => {
    const s = makeServer(stateWith(open("delayed")));                                          // delayed: no polling chain at all
    const active2 = { attemptNumber: 2, startedAt: "2026-03-01T12:00:00.000Z", endsAt: "", status: "draft", attemptEpoch: 1 };
    s.onPost = b => (b.action === "startAttempt" ? { ok: true, state: stateWith(open("delayed"), { activeAttempt: active2, canWrite: true, canStartAttempt: false }) } : { ok: true });
    await mount(s);
    s.hold = true;
    await setVisibility("visible");                                                            // the page's own resync (old state) is in flight
    s.hold = false;
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /بدء محاولة جديدة/ })); });
    await settle();
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();
    s.held.splice(0).forEach(d => d.resolve(null));
    await settle();
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();
    expect(screen.queryByText(/تم تسليم المحاولة 1/)).toBeNull();
  });
  it("RACE1c — a read issued DURING «start new attempt» (start request still in flight) cannot resurrect the previous result once attempt 2 is shown", async () => {
    // Independent-review probe U1: attempt 1 result visible → «بدء محاولة جديدة» → the start POST is still unresolved → a
    // visibility resync GET goes out and is answered with PRE-START server state → the start resolves and attempt 2 (timed) is
    // revealed → the student types → only THEN does the stale GET land. It must not touch attempt 2 in any way.
    const s = makeServer(stateWith(open("delayed")));                                          // delayed: no poll chain, only the resync
    const active2 = { attemptNumber: 2, startedAt: "2026-03-01T12:00:00.000Z", endsAt: "2026-03-01T12:30:00.000Z", status: "draft", attemptEpoch: 1 };
    const started2 = stateWith(open("delayed"), { timed: true, durationMinutes: 30, activeAttempt: active2, effectiveAttemptEndsAt: "2026-03-01T12:30:00.000Z", serverNow: "2026-03-01T12:00:00.000Z", canWrite: true, canStartAttempt: false });
    let releaseStart!: () => void;
    const startGate = new Promise<void>(r => { releaseStart = r; });
    s.onPost = () => ({ ok: true, state: started2 });
    const scripted = globalThis.fetch;
    let startRequests = 0;
    globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if ((init.method || "GET").toUpperCase() === "POST" && String(init.body || "").includes("startAttempt")) { startRequests++; await startGate; }
      return (scripted as unknown as (u: string, i: RequestInit) => Promise<Response>)(url, init);
    }) as unknown as typeof fetch;
    await mount(s);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /بدء محاولة جديدة/ })); });
    await settle();
    expect(startRequests).toBe(1);                                                             // the start request is in flight
    expect(screen.queryByText("سؤال الامتحان الأول")).toBeNull();
    s.hold = true;
    await setVisibility("visible");                                                            // resync DURING the start window
    s.hold = false;
    expect(s.held).toHaveLength(1);
    releaseStart();
    await settle();
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();                               // attempt 2 revealed
    const timerBefore = screen.getByRole("timer").textContent;
    const box = screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "ANSWER-ATTEMPT-2" } });
    await settle();
    s.held.splice(0).forEach(d => d.resolve(null));                                            // the stale pre-start read lands
    await settle();
    expect(screen.queryByText(/تم تسليم المحاولة 1/)).toBeNull();                              // no setResult(attempt 1) / setStarted(false)
    expect(panel()).toBeNull();
    expect(screen.queryByRole("button", { name: /بدء محاولة جديدة/ })).toBeNull();            // attempt 2 not closed
    expect(screen.getByText("سؤال الامتحان الأول")).toBeTruthy();                               // attempt 2 still active and visible
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("ANSWER-ATTEMPT-2"); // answers not wiped
    expect(screen.getByRole("timer").textContent).toBe(timerBefore);                          // timer not reset
    // …while a NEW authoritative read after the transition is still adopted (reconciliation is not disabled): the teacher ends
    // attempt 2 elsewhere → the next visibility resync shows attempt 2's result.
    const ended2 = result({ attemptNumber: 2, submittedAt: "2026-03-01T12:10:00.000Z", endReason: "teacherEnded", autoGradingStatus: "complete" });
    s.state = { ...stateWith(ended2), attemptsUsed: 2, attempts: [result(), ended2], canStartAttempt: false };
    await setVisibility("visible");
    await settle();
    expect(screen.getByText(/تم تسليم المحاولة 2/)).toBeTruthy();
  });
  it("RACE2 another tab finished grading / review: this stale pending tab adopts the authoritative result safely", async () => {
    const s = makeServer(stateWith(open("retrying")));
    await mount(s);
    s.state = stateWith(result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, score: 9, percentage: 90, teacherFeedback: "أحسنت" }));
    await flush(3000);
    await settle();
    expect(statusOf()).toBe("complete");
    expect(document.body.textContent).toMatch(/أحسنت/);
  });
  it("RACE2b another tab STARTED attempt 2: the poll adopts it through the existing reconciliation and polling stops", async () => {
    const s = makeServer(stateWith(open("processing")));
    await mount(s);
    s.state = stateWith(open("processing"), { activeAttempt: { attemptNumber: 2, startedAt: "2026-03-01T12:00:00.000Z", endsAt: "", status: "draft", attemptEpoch: 1 }, canWrite: true, canStartAttempt: false });
    await flush(3000);
    await settle();
    expect(panel()).toBeNull();
    expect(screen.queryByText(/تم تسليم المحاولة 1/)).toBeNull();
    const n = gets(s);
    await flush(60 * 1000);
    expect(gets(s)).toBe(n);
  });
  it("RACE3 the same attempt's score changes after the callback: score, percentage, badge and finality update together", async () => {
    const s = makeServer(stateWith(open("processing", { score: 2, percentage: 20 })));
    await mount(s);
    expect(document.body.textContent).toMatch(/2\s*\/ 10/);
    s.state = stateWith(result({ autoGradingStatus: "complete", score: 6, percentage: 60, manualReviewMarks: 4 }));
    await flush(3000);
    await settle();
    expect(document.body.textContent).toMatch(/6\s*\/ 10/);
    expect(document.body.textContent).toMatch(/60%/);
    expect(document.body.textContent).toMatch(/4 علامة قيد المراجعة/);
    expect(document.body.textContent).toMatch(/علامة مؤقتة/);
  });
});

describe("17E-C RET / recovery / strict — server state only, read-only observing", () => {
  it("RET1 / RET3 a reload during processing recovers everything from the server; nothing is kept in browser storage", async () => {
    const s = makeServer(stateWith(open("processing")));
    const u = await mount(s);
    expect(statusOf()).toBe("processing");
    u.unmount();
    await mount(s);
    expect(statusOf()).toBe("processing");
    const stored = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stored).not.toMatch(/processing|codingGrading|queued|retrying/);
  });
  it("RET2 returning after completion shows the final result immediately and never polls", async () => {
    const s = makeServer(stateWith(result({ autoGradingStatus: "complete", gradingStatus: "final", finalized: true, manualReviewMarks: 0, score: 10, percentage: 100 })));
    await mount(s);
    expect(document.body.textContent).toMatch(/العلامة النهائية/);
    const n = gets(s);
    await flush(5 * 60 * 1000);
    expect(gets(s)).toBe(n);
  });
  it("recovery flow queued → processing → retrying → processing → complete renders each step; no internals; no student action", async () => {
    const s = makeServer(stateWith(open("queued")));
    await mount(s);
    const seen = [statusOf()];
    for (const next of ["processing", "retrying", "processing"]) { s.state = stateWith(open(next)); await flush(3000); await settle(); seen.push(statusOf()); expect(document.body.textContent).not.toMatch(TECH); }
    s.state = stateWith(result({ autoGradingStatus: "complete" }));
    await flush(3000); await settle(); seen.push(statusOf());
    expect(seen).toEqual(["queued", "processing", "retrying", "processing", "complete"]);
    expect(posts(s)).toHaveLength(0);
  });
  it("§54 strict exam: on the result screen hiding the tab sends NO integrity exit and polling stays read-only", async () => {
    const s = makeServer(stateWith(open("processing"), { attemptPolicy: "strict" }));
    await mount(s, { ...ASSIGNMENT, attemptPolicy: "strict" });
    await setVisibility("hidden");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    await setVisibility("visible");
    await flush(30 * 1000);
    await settle();
    expect(posts(s)).toHaveLength(0);
    expect(statusOf()).toBe("processing");
  });
  it("§51 no beforeunload warning merely because grading is pending", async () => {
    await mount(makeServer(stateWith(open("processing"))));
    const ev = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("17E-C §50 — student portal card: compact safe line", () => {
  const item = (latestResult: R | null) => ({ assignmentId: "a1", title: "واجب", instructions: "", openAt: "", dueAt: "", effectiveDueAt: "", questionCount: 1, totalMarks: 10, durationMinutes: 0, availability: "open", dashboardState: "awaitingReview", gradingStatus: "pendingReview", attemptsUsed: 1, allowedAttempts: 1, canAttempt: false, latestScore: 2, latestPercentage: 20, latestResult });
  it("open automatic grading is named on the card; complete / absent shows nothing extra; never technical", () => {
    vi.useRealTimers();
    const { unmount } = render(<StudentAssignmentCard item={item(open("retrying")) as never} busy={false} onOpen={() => {}} />);
    expect(screen.getByTestId("card-coding-grading").textContent).toMatch(/التصحيح الآلي لأسئلة البرمجة جارٍ/);
    expect(document.body.textContent).not.toMatch(TECH);
    unmount();
    for (const lr of [result({ autoGradingStatus: "complete" }), result()]) {
      const r = render(<StudentAssignmentCard item={item(lr) as never} busy={false} onOpen={() => {}} />);
      expect(screen.queryByTestId("card-coding-grading")).toBeNull();
      r.unmount();
    }
  });
});
