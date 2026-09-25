// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react";
import StudentExamPage from "./StudentExamPage";

// Phase 7A — the REAL StudentExamPage against the REAL student-submission / student-assignment handlers on the in-memory
// blob store. Strict: warning before start, exit signals only after the attempt runs (hidden / pagehide / unmount /
// back), idempotent, keepalive, never `blur`. Pausable: «حفظ مؤقت والخروج» saves + pauses before leaving; the paused
// card resumes the SAME attempt with its answers. Continuous: none of it.

const nodeRequire = createRequire(import.meta.url);
const { handler: submissionHandler } = nodeRequire("../api/src/functions/student-submission.js");
const { handler: assignmentHandler } = nodeRequire("../api/src/functions/student-assignment.js");
const { createMemoryContainer } = nodeRequire("../api/tests/fixtures/memory-container.js");

const S1 = "11111111-1111-1111-1111-111111111111";
const AID = "asg-7a";
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "سؤال الاختبار السري", marks: 10 }] }] };

type Call = { method: string; url: string; body: Record<string, unknown>; keepalive: boolean };
let ctx: ReturnType<typeof createMemoryContainer>, calls: Call[], vis: "visible" | "hidden";
const posts = (action: string) => calls.filter(c => c.method === "POST" && c.body.action === action);
const doc = () => ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json");

function seed(policy: string, durationMinutes = 30) {
  ctx = createMemoryContainer({
    ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
    ["platform/classes/c1.json"]: { classId: "c1", name: "الصف", active: true, studentIds: [] },
    ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: policy === "continuous" ? 2 : 3, attemptPolicy: policy, assignmentId: AID, classId: "c1", title: "امتحان السياسة", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 24 * 3600e3).toISOString(), maxAttempts: 1, durationMinutes, questionCount: 1, totalMarks: 10, examSnapshot: EXAM }
  });
}
const deps = () => ({ container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }), recordAchievementIfEligible: async () => {} });
const res = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body, headers: { get: () => null } }) as unknown as Response;

beforeEach(() => {
  vis = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => vis });
  (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
  sessionStorage.clear();
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ method, url, body, keepalive: init?.keepalive === true });
    if (url.includes("/api/student-submission/")) {
      const r = await submissionHandler({ method, params: { assignmentId: AID }, headers: { get: () => null }, json: async () => body }, deps());
      return res(r.status, r.jsonBody);
    }
    if (url.includes("/api/student-assignment/")) {
      const r = await assignmentHandler({ method, params: { assignmentId: AID }, headers: { get: () => null } }, deps());
      return res(r.status, r.jsonBody);
    }
    return res(404, { ok: false });
  }) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function preStartAssignment() {
  const r = await assignmentHandler({ method: "GET", params: { assignmentId: AID }, headers: { get: () => null } }, deps());
  return r.jsonBody.assignment;
}
async function mount(onBack = vi.fn()) {
  const assignment = await preStartAssignment();
  const view = render(<StudentExamPage token="t" assignment={assignment} studentName="أحمد" className="الصف" onBack={onBack} onLogout={() => {}} />);
  return { ...view, onBack };
}
async function startAttempt() {
  fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }));
  await screen.findByText("سؤال الاختبار السري");
}
function hide() { vis = "hidden"; act(() => { document.dispatchEvent(new Event("visibilitychange")); }); }
function show() { vis = "visible"; act(() => { document.dispatchEvent(new Event("visibilitychange")); }); }
async function type(value: string) {
  const ta = await screen.findByPlaceholderText("اكتب إجابتك هنا...");
  fireEvent.change(ta, { target: { value } });
}

describe("strict", () => {
  it("warning BEFORE start; hiding the page before the attempt runs sends nothing", async () => {
    seed("strict");
    await mount();
    expect(await screen.findByText(/هذا امتحان بوضع صارم/)).toBeTruthy();
    hide();
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await new Promise(r => setTimeout(r, 30));
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
    expect(doc()).toBeNull();
  });

  it("after start: badge shown; hidden + pagehide end the attempt ONCE (keepalive, identity + epoch); never continued", async () => {
    seed("strict");
    await mount();
    await startAttempt();
    expect(screen.getByText("وضع صارم")).toBeTruthy();
    hide();
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    hide();
    await waitFor(() => expect(doc().activeAttempt).toBeNull());
    const exits = posts("finalizeIntegrityExit");
    expect(exits).toHaveLength(1);
    expect(exits[0].keepalive).toBe(true);
    expect(exits[0].body).toMatchObject({ expectedAttemptNumber: 1, expectedAttemptEpoch: 1 });
    expect(Object.keys(exits[0].body)).not.toContain("answers");
    expect(doc().attempts[0].endReason).toBe("integrityExit");
    show();
    expect((await screen.findAllByText(/غادرت صفحة الامتحان/)).length).toBeGreaterThan(0);
    expect(screen.queryByText("سؤال الاختبار السري")).toBeNull();
  });

  it("blur / focus changes / typing never end the exam", async () => {
    seed("strict");
    await mount();
    await startAttempt();
    act(() => { window.dispatchEvent(new Event("blur")); });
    const ta = screen.getByPlaceholderText("اكتب إجابتك هنا...");
    fireEvent.focus(ta); fireEvent.blur(ta);
    await type("إجابة");
    await new Promise(r => setTimeout(r, 50));
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
    expect(doc().activeAttempt).not.toBeNull();
  });

  it("the explicit back action asks first, saves the latest edit, then ends the attempt and shows the result", async () => {
    seed("strict");
    const { onBack } = await mount();
    await startAttempt();
    await type("آخر تعديل");
    fireEvent.click(screen.getByRole("button", { name: /العودة|رجوع/ }));
    fireEvent.click(await screen.findByRole("button", { name: "إنهاء المحاولة والمغادرة" }));
    await waitFor(() => expect(doc().activeAttempt).toBeNull());
    expect(doc().attempts[0]).toMatchObject({ endReason: "integrityExit" });
    expect(doc().attempts[0].answers).toEqual({ q1: { kind: "text", value: "آخر تعديل" } });   // saved before the exit
    expect((await screen.findAllByText(/غادرت صفحة الامتحان/)).length).toBeGreaterThan(0);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("leaving the exam page inside the app (unmount) is an exit too", async () => {
    seed("strict");
    const view = await mount();
    await startAttempt();
    view.unmount();
    await waitFor(() => expect(posts("finalizeIntegrityExit")).toHaveLength(1));
    await waitFor(() => expect(doc().activeAttempt).toBeNull());
  });

  it("a LOST exit (network failure while leaving) is completed on the next load — the questions are never shown again", async () => {
    seed("strict");
    const first = await mount();
    await startAttempt();
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.action === "finalizeIntegrityExit") { calls.push({ method: "POST", url: String(input), body, keepalive: init?.keepalive === true }); throw new TypeError("Failed to fetch"); }
      return realFetch(input, init);
    }) as unknown as typeof fetch;
    hide();
    await waitFor(() => expect(posts("finalizeIntegrityExit")).toHaveLength(1));
    expect(doc().activeAttempt).not.toBeNull();                                                      // the request was lost
    expect(sessionStorage.getItem("examBankStrictExit:" + AID)).toBeTruthy();                       // … but remembered (identity only)
    expect(JSON.parse(sessionStorage.getItem("examBankStrictExit:" + AID)!)).toEqual({ attemptNumber: 1, startedAt: doc().activeAttempt.startedAt, attemptEpoch: 1 });
    first.unmount();
    globalThis.fetch = realFetch;
    vis = "visible";
    calls = [];
    await mount();
    await waitFor(() => expect(doc().activeAttempt).toBeNull());
    expect(doc().attempts[0].endReason).toBe("integrityExit");
    expect((await screen.findAllByText(/غادرت صفحة الامتحان/)).length).toBeGreaterThan(0);
    expect(calls.some(c => c.url.includes("/api/student-assignment/"))).toBe(false);          // questions never re-fetched
    expect(sessionStorage.getItem("examBankStrictExit:" + AID)).toBeNull();
  });

  it("an ordinary submit stays «submitted»; hiding afterwards sends no exit", async () => {
    seed("strict");
    await mount();
    await startAttempt();
    await type("حل");
    fireEvent.click(screen.getAllByRole("button", { name: /مراجعة|المراجعة/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: /تسليم/ }));
    fireEvent.click(await screen.findByRole("button", { name: "تسليم الآن" }));
    await waitFor(() => expect(doc().attempts?.[0]?.endReason).toBe("submitted"));
    hide();
    await new Promise(r => setTimeout(r, 30));
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
  });
});

describe("continuous", () => {
  it("no warning, no badge, no pause button; hiding the page ends nothing", async () => {
    seed("continuous");
    await mount();
    await startAttempt();
    expect(screen.queryByText(/بوضع صارم/)).toBeNull();
    expect(screen.queryByText("وضع صارم")).toBeNull();
    expect(screen.queryByRole("button", { name: "حفظ مؤقت والخروج" })).toBeNull();
    hide();
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await new Promise(r => setTimeout(r, 30));
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
    expect(doc().activeAttempt).not.toBeNull();
  });
});

describe("pausable", () => {
  it("«حفظ مؤقت والخروج» saves the latest answers + pauses on the server, THEN leaves the page", async () => {
    seed("pausable");
    const { onBack } = await mount();
    await startAttempt();
    await type("نصف الحل");
    fireEvent.click(screen.getByRole("button", { name: "حفظ مؤقت والخروج" }));
    fireEvent.click(await screen.findByRole("button", { name: "حفظ والخروج" }));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    const pause = posts("pauseAttempt")[0];
    expect(pause.body).toMatchObject({ answers: { q1: { kind: "text", value: "نصف الحل" } }, expectedAttemptNumber: 1, expectedAttemptEpoch: 1 });
    expect(doc().activeAttempt).toMatchObject({ status: "paused", attemptEpoch: 2, attemptNumber: 1 });
    expect(doc().draftAnswers).toEqual({ q1: { kind: "text", value: "نصف الحل" } });
    // Order: any in-flight autosave settled BEFORE the pause request.
    const lastSave = calls.map(c => c.body.action).lastIndexOf("saveDraft"), pauseAt = calls.map(c => c.body.action).indexOf("pauseAttempt");
    expect(lastSave).toBeLessThan(pauseAt);
  });

  it("a failed pause keeps the student on the page (never leaves before the server confirms)", async () => {
    seed("pausable");
    const { onBack } = await mount();
    await startAttempt();
    const d = doc(); d.activeAttempt.attemptEpoch = 9; ctx.setJson("platform/submissions/" + AID + "/" + S1 + ".json", d);   // another tab moved on
    fireEvent.click(screen.getByRole("button", { name: "حفظ مؤقت والخروج" }));
    fireEvent.click(await screen.findByRole("button", { name: "حفظ والخروج" }));
    await waitFor(() => expect(posts("pauseAttempt")).toHaveLength(1));
    await new Promise(r => setTimeout(r, 30));
    expect(onBack).not.toHaveBeenCalled();
  });

  it("paused card: remaining time and deadline, no questions; «متابعة المحاولة» resumes the SAME attempt with its answers", async () => {
    seed("pausable", 60);
    const first = await mount();
    await startAttempt();
    await type("محفوظ");
    fireEvent.click(screen.getByRole("button", { name: "حفظ مؤقت والخروج" }));
    fireEvent.click(await screen.findByRole("button", { name: "حفظ والخروج" }));
    await waitFor(() => expect(first.onBack).toHaveBeenCalled());
    first.unmount();
    calls = [];
    await mount();
    expect(await screen.findByText("لديك محاولة محفوظة مؤقتًا")).toBeTruthy();
    expect(screen.getByText("الوقت المتبقي")).toBeTruthy();
    expect(screen.getByText("الوقت المتبقي").nextElementSibling?.textContent).toMatch(/دقيقة|ساعة/);
    expect(screen.getByText("آخر موعد للواجب")).toBeTruthy();
    expect(screen.queryByText("سؤال الاختبار السري")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "متابعة المحاولة" }));
    await screen.findByText("سؤال الاختبار السري");
    expect((screen.getByPlaceholderText("اكتب إجابتك هنا...") as HTMLTextAreaElement).value).toBe("محفوظ");
    expect(doc().activeAttempt).toMatchObject({ attemptNumber: 1, attemptEpoch: 3, status: "draft" });
    expect(posts("resumeAttempt")[0].body).toMatchObject({ expectedAttemptNumber: 1, expectedAttemptEpoch: 2 });
    expect(posts("startAttempt")).toHaveLength(0);                                                     // never a new attempt
    // The next autosave carries the NEW epoch.
    await type("محفوظ + إضافة");
    await waitFor(() => expect(posts("saveDraft").length).toBeGreaterThan(0), { timeout: 3000 });
    expect(posts("saveDraft").at(-1)!.body).toMatchObject({ expectedAttemptEpoch: 3 });
    await waitFor(() => expect(doc().draftAnswers).toEqual({ q1: { kind: "text", value: "محفوظ + إضافة" } }), { timeout: 3000 });
  });

  it("hiding a pausable exam never pauses or ends it (pausing is an explicit action only)", async () => {
    seed("pausable");
    await mount();
    await startAttempt();
    hide();
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    await new Promise(r => setTimeout(r, 30));
    expect(posts("pauseAttempt")).toHaveLength(0);
    expect(posts("finalizeIntegrityExit")).toHaveLength(0);
    expect(doc().activeAttempt.status).not.toBe("paused");
  });
});
