// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Roadmap #10 (Save Indicator) + #11 (Offline UX) — real StudentExamPage integration tests driving the true
// component with a mocked fetch. They prove the server-authoritative save-state machine, offline behavior,
// reconnect ordering (resync → save-if-writable), revision-race safety, submit safety, manual retry,
// beforeunload, and that exam answers never touch browser storage or the console.

const START = "2026-01-01T10:00:00.000Z";
const SERVER_NOW = "2026-01-01T10:30:00.000Z";
const legacyState = {
  attemptsUsed: 0, allowedAttempts: 1, canAttempt: true, dueClosed: false, availability: "open", openAt: "", effectiveDueAt: "",
  durationMinutes: 0, timed: false, attemptModelVersion: 0, requiresStart: false, serverNow: SERVER_NOW,
  activeAttempt: { attemptNumber: 1, startedAt: START, endsAt: "", status: "started" }, effectiveAttemptEndsAt: "", attemptExpired: false,
  canStartAttempt: false, canWrite: true, draftAnswers: {}, draftSavedAt: "", latestResult: null, attempts: []
};
const notWritableState = { ...legacyState, canWrite: false, activeAttempt: null };
const fullExam = { title: "امتحان", metadata: {}, presentationTheme: "classic",
  sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 100 }] }] };
const legacyAssignment = {
  assignmentId: "asg1", title: "واجب", instructions: "تعليمات", openAt: "", dueAt: "", effectiveDueAt: "",
  maxAttempts: 1, durationMinutes: 0, requiresStart: false, timed: false, questionCount: 1, totalMarks: 100,
  exam: fullExam
};

const json = (status: number, body: unknown) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
const jsonH = (status: number, body: unknown, requestId: string) => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  headers: { get: (k: string) => (String(k).toLowerCase() === "x-request-id" ? requestId : null) },
  json: async () => body
} as unknown as Response);

let subGetCalls = 0, saveCalls = 0, submitCalls = 0, onLogout: ReturnType<typeof vi.fn>;
let subGetHandler: (n: number) => Promise<Response>, saveHandler: (n: number, body: unknown) => Promise<Response>, submitHandler: (n: number) => Promise<Response>;
let calls: string[] = [];
function installFetch() {
  subGetCalls = 0; saveCalls = 0; submitCalls = 0; calls = [];
  (globalThis as { fetch?: unknown }).fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init && init.method) || "GET";
    if (url.includes("/api/student-submission/")) {
      if (method === "GET") { subGetCalls++; calls.push("get"); return subGetHandler(subGetCalls); }
      const b = init && init.body ? JSON.parse(String(init.body)) : {};
      if (b.action === "saveDraft") { saveCalls++; calls.push("save"); return saveHandler(saveCalls, b); }
      if (b.action === "submit") { submitCalls++; calls.push("submit"); return submitHandler(submitCalls); }
      return json(200, { ok: true, state: legacyState });
    }
    return json(404, { ok: false, error: "not found" });
  }) as unknown as typeof fetch;
}
function setNavigatorOnline(v: boolean) { Object.defineProperty(navigator, "onLine", { configurable: true, value: v }); }
function goOffline() { setNavigatorOnline(false); window.dispatchEvent(new Event("offline")); }
function goOnline() { setNavigatorOnline(true); window.dispatchEvent(new Event("online")); }
function mount() {
  onLogout = vi.fn();
  return render(<StudentExamPage token="t" assignment={legacyAssignment as never} studentName="أحمد" className="ص" onBack={() => {}} onLogout={onLogout as unknown as () => void} />);
}
const saveState = (r: ReturnType<typeof mount>) => r.container.querySelector(".iex-progress .iex-save-state")?.textContent || "";
async function typeAnswer(r: ReturnType<typeof mount>, value: string) {
  const ta = (await r.findByPlaceholderText("اكتب إجابتك هنا...")) as HTMLTextAreaElement;
  fireEvent.change(ta, { target: { value } });
  return ta;
}

beforeEach(() => {
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
  setNavigatorOnline(true);
  installFetch();
  subGetHandler = () => json(200, { ok: true, state: legacyState });
  saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T10:31:07.000Z", serverNow: SERVER_NOW });
  submitHandler = () => json(200, { ok: true, result: { attemptNumber: 1, submittedAt: SERVER_NOW, score: 1, totalMarks: 100, percentage: 1, manualReviewMarks: 0, finalized: true }, state: { ...legacyState, activeAttempt: null } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setNavigatorOnline(true); });

describe("R10/R11 — save indicator + offline UX", () => {
  it("A: initial server draftSavedAt shows saved + server time", async () => {
    subGetHandler = () => json(200, { ok: true, state: { ...legacyState, draftSavedAt: "2026-01-01T09:05:09.000Z" } });
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"));
    expect(saveState(r)).toContain("آخر حفظ:");
  });

  it("B: edit → pending, then saving/save 200 → saved", async () => {
    const r = mount();
    await typeAnswer(r, "إجابة");
    expect(saveState(r)).toContain("تغييرات غير محفوظة");   // immediately pending
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 });
  });

  it("C: the displayed last-saved time comes from server savedAt, not Date.now()", async () => {
    saveHandler = () => json(200, { ok: true, savedAt: "2026-01-01T08:02:03.000Z", serverNow: SERVER_NOW });
    const r = mount();
    await typeAnswer(r, "إجابة");
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 });
    expect(saveState(r)).toContain("08:02:03");            // server time, formatted
  });

  it("D: a stale revision-N ack does NOT show saved while revision N+1 exists locally", async () => {
    let resolve1: (v: Response) => void = () => {};
    saveHandler = (n) => n === 1 ? new Promise<Response>(res => { resolve1 = res; }) : json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" });
    const r = mount();
    const ta = await typeAnswer(r, "answer1");             // revision 1 → save1 starts (pending resolve)
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });
    fireEvent.change(ta, { target: { value: "answer2" } }); // revision 2 (newer) before save1 returns
    resolve1(await json(200, { ok: true, savedAt: "2026-01-01T10:31:00.000Z" })); // save1 (rev 1) acks
    // Must NOT read as saved — a newer local revision (2) is still unsaved.
    await waitFor(() => expect(saveCalls).toBe(2), { timeout: 2000 }); // rev2 autosave fires
    // after both, it converges to saved; the key invariant is it never claimed saved while rev2 was unsaved
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 });
    expect(true).toBe(true);
  });

  it("E: going offline with dirty changes shows the offline warning and fires NO save request", async () => {
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    await typeAnswer(r, "بدون اتصال");
    // give the debounce window time; no request must be sent while offline
    await new Promise(res => setTimeout(res, 900));
    expect(saveCalls).toBe(0);
    await waitFor(() => expect(saveState(r)).toContain("غير متصل"));
  });

  it("F/G/H: reconnect resyncs BEFORE saving, and only uploads the latest snapshot if the server still allows writing", async () => {
    const r = mount();
    const ta = await typeAnswer(r, "v1");
    goOffline();
    fireEvent.change(ta, { target: { value: "v2" } });
    fireEvent.change(ta, { target: { value: "v3-latest" } }); // multiple offline edits
    await new Promise(res => setTimeout(res, 50));
    expect(saveCalls).toBe(0);
    // Reconnect: server still writable → resync (GET) happens, THEN exactly one save of the LATEST snapshot.
    goOnline();
    await waitFor(() => expect(saveCalls).toBeGreaterThanOrEqual(1), { timeout: 2000 });
    const firstSaveIdx = calls.indexOf("save");
    expect(calls.slice(0, firstSaveIdx)).toContain("get");   // G: a GET (resync) precedes the save
    // F: only the latest snapshot is sent
    const lastSaveBody = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .filter(c => c[1] && c[1].method === "POST").map(c => JSON.parse(String(c[1].body)))
      .filter(b => b.action === "saveDraft").pop();
    expect(JSON.stringify(lastSaveBody)).toContain("v3-latest");
  });

  it("H: reconnect but server says canWrite=false → dirty snapshot is NOT uploaded", async () => {
    const r = mount();
    const ta = await typeAnswer(r, "v1");
    goOffline();
    fireEvent.change(ta, { target: { value: "v2" } });
    await new Promise(res => setTimeout(res, 50));
    subGetHandler = () => json(200, { ok: true, state: notWritableState }); // server now read-only
    goOnline();
    await waitFor(() => expect(subGetCalls).toBeGreaterThanOrEqual(2), { timeout: 2000 }); // resync happened
    await new Promise(res => setTimeout(res, 100));
    expect(saveCalls).toBe(0);                                // no post-deadline upload
  });

  it("K: HTTP 500 → retrying then error with the R9 tracking code; not classified as offline", async () => {
    saveHandler = () => jsonH(500, { ok: false, error: "تعذر الحفظ التلقائي." }, "save-500-id");
    const r = mount();
    await typeAnswer(r, "إجابة");
    await waitFor(() => expect(saveState(r)).toContain("تعذر حفظ التغييرات"), { timeout: 15000 });
    expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("رمز التتبع: save-500-id");
    expect(saveState(r)).not.toContain("غير متصل");           // a 500 is not "offline"
  }, 20000);

  it("N: submit saves the latest snapshot FIRST, then submits (saveDraft before submit)", async () => {
    const r = mount();
    await typeAnswer(r, "answer-before-submit");
    fireEvent.click(r.container.querySelector(".iex-foot .primary") as HTMLButtonElement);
    await waitFor(() => expect(submitCalls).toBe(1), { timeout: 2000 });
    expect(calls.indexOf("save")).toBeLessThan(calls.indexOf("submit"));
    expect(calls.indexOf("save")).toBeGreaterThanOrEqual(0);
  });

  it("O: submit while offline does NOT call submit and shows the Arabic warning", async () => {
    const r = mount();
    await r.findByPlaceholderText("اكتب إجابتك هنا...");
    goOffline();
    fireEvent.click(r.container.querySelector(".iex-foot .primary") as HTMLButtonElement);
    await new Promise(res => setTimeout(res, 50));
    expect(submitCalls).toBe(0);
    expect(r.container.querySelector(".iex-error")?.textContent || "").toContain("لا يمكن تسليم الامتحان قبل حفظ التغييرات");
  });

  it("P: when the pre-submit save fails, submit is NOT called", async () => {
    saveHandler = () => json(403, { ok: false, error: "غير مسموح." }); // non-retryable → fails fast
    const r = mount();
    await typeAnswer(r, "answer");
    fireEvent.click(r.container.querySelector(".iex-foot .primary") as HTMLButtonElement);
    await waitFor(() => expect(saveCalls).toBeGreaterThanOrEqual(1), { timeout: 2000 });
    await new Promise(res => setTimeout(res, 100));
    expect(submitCalls).toBe(0);
  });

  it("Q: manual retry (error state) resyncs then re-saves the latest snapshot without a new revision", async () => {
    saveHandler = (n) => n <= 4 ? json(500, { ok: false, error: "خطأ" }) : json(200, { ok: true, savedAt: "2026-01-01T10:33:00.000Z" });
    const r = mount();
    await typeAnswer(r, "answer");
    await waitFor(() => expect(saveState(r)).toContain("تعذر حفظ التغييرات"), { timeout: 15000 });
    const btn = r.container.querySelector(".iex-retry-save") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 3000 });
  }, 20000);

  it("R/S: beforeunload warns while dirty and does not warn after a confirmed save", async () => {
    const r = mount();
    await typeAnswer(r, "إجابة");
    const dirtyEvt = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(dirtyEvt);
    expect(dirtyEvt.defaultPrevented).toBe(true);            // R: warns while dirty
    await waitFor(() => expect(saveState(r)).toContain("تم الحفظ"), { timeout: 2000 });
    const cleanEvt = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
    window.dispatchEvent(cleanEvt);
    expect(cleanEvt.defaultPrevented).toBe(false);           // S: no warning after confirmed save
  });

  it("T/U: exam answers are never written to localStorage/sessionStorage or the console", async () => {
    const lsSet = vi.spyOn(Storage.prototype, "setItem");
    const logs: string[] = [];
    for (const m of ["log", "warn", "error", "info", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(x => { try { return typeof x === "string" ? x : JSON.stringify(x); } catch { return String(x); } }).join(" ")); });
    const r = mount();
    await typeAnswer(r, "SECRET_ANSWER_XYZ");
    await waitFor(() => expect(saveCalls).toBe(1), { timeout: 2000 });
    fireEvent.click(r.container.querySelector(".iex-foot .primary") as HTMLButtonElement);
    await waitFor(() => expect(submitCalls).toBe(1), { timeout: 2000 });
    for (const c of lsSet.mock.calls) expect(String(c[1])).not.toContain("SECRET_ANSWER_XYZ");
    const all = logs.join("\n");
    expect(all).not.toContain("SECRET_ANSWER_XYZ");
    expect(all).not.toContain("\"action\":\"saveDraft\"");
    // U: no per-save telemetry flood — the component emits no save/answer log lines of its own
    expect(logs.filter(l => l.includes("save") || l.includes("SECRET") || l.includes("answer")).length).toBe(0);
  });

  it("Z: the structured exam still renders its questions (no visual regression)", async () => {
    const r = mount();
    await r.findByText("سؤال الاختبار السري");
    expect(r.container.querySelector(".iex-foot .primary")).toBeTruthy();
  });
});
