// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react";
import StudentQuestionCard from "../StudentQuestionCard";
import StudentExamPage from "../StudentExamPage";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";

// Phase 17B — the student run experience (U1–U10): the lazy coding renderer reaches POST /api/coding/run and GET
// /api/coding/capabilities ONLY through the generic attempt context the exam page provides (the auth token stays inside the
// page's request function — never in context data, the Answer, storage or the builder). Practice results are text, LTR,
// bounded, announced politely, labelled «للتدريب فقط» when compared with a public sample, and never stored in the Answer.
// Fail-first on fe086e36: the attempt context, the run client and the route do not exist.
const nodeRequire = createRequire(import.meta.url);
const load = <T,>(p: string): Promise<T> => import(/* @vite-ignore */ p);
type CtxMod = typeof import("../questionTypes/studentAttemptContext");

const CFG = {
  allowedLanguages: ["python", "java"], defaultLanguage: "python",
  starterCode: { python: "print(sum(map(int, input().split())))\n" }, taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 4096, outputBytes: 4096, timeMs: 2000, memoryMb: 128 },
  publicTests: [{ id: "pub-1", title: "مثال أول", input: "2 3\n", sampleOutput: "5\n" }, { id: "pub-2", title: "مثال ثانٍ", input: "10 20\n", sampleOutput: "30\n" }]
};
const studentQ = (): Question => ({ examQuestionId: "q-code", presentationType: "coding", questionTypeVersion: 1, text: "اجمع عددين", marks: 5, coding: CFG } as unknown as Question);
type FetchCall = { path: string; init: RequestInit; body: Record<string, unknown> | null };

function makeApi(respond: (path: string, body: Record<string, unknown> | null) => { status: number; json: unknown; headers?: Record<string, string> }) {
  const calls: FetchCall[] = [];
  const api = vi.fn(async (p: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path: p, init, body });
    const r = respond(p, body);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json", ...(r.headers || {}) } });
  });
  return { api, calls };
}
const capsOk = { status: 200, json: { ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }] } };

function Harness({ wrap }: { wrap: (n: ReactNode) => ReactNode }) {
  const [a, setA] = useState<Answer | undefined>(undefined);
  const card = <StudentQuestionCard q={studentQ()} index={0} id="q-code" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} />;
  return <>{wrap(card)}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
async function mountWithApi(respond: Parameters<typeof makeApi>[0]) {
  const { StudentAttemptContext } = await load<CtxMod>("../questionTypes/studentAttemptContext");
  const { api, calls } = makeApi(respond);
  render(<Harness wrap={n => <StudentAttemptContext.Provider value={{ assignmentId: "asg-ui", request: api }}>{n}</StudentAttemptContext.Provider>} />);
  return { api, calls };
}
const runButton = () => screen.findByRole("button", { name: "تشغيل" }, { timeout: 3000 });
const tick = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("U1 / U2 — capabilities and run go through the attempt context to the authenticated routes", () => {
  it("capabilities are fetched once; «تشغيل» appears for an available language; the run body is minimal and server-bound (no limits, no token, no test id)", async () => {
    const { calls } = await mountWithApi((p) => p.endsWith("/capabilities") ? capsOk : { status: 200, json: { ok: true, result: { status: "success", stdout: "5\n", stderr: "", exitCode: 0, durationMs: 7 } } });
    const btn = await runButton();
    expect(calls.filter(c => c.path === "/api/coding/capabilities")).toHaveLength(1);
    fireEvent.click(btn); await tick();
    const run = calls.find(c => c.path === "/api/coding/run")!;
    expect(run.init.method).toBe("POST");
    expect(run.body).toEqual({ assignmentId: "asg-ui", questionId: "q-code", language: "python", languageVersion: 1, source: "print(sum(map(int, input().split())))\n", stdin: "2 3\n" });
    expect(JSON.stringify(run.body)).not.toMatch(/limits|timeMs|token|Bearer|testId|hidden/i);
  });
  it("U7 without an attempt context (teacher preview / builder) nothing is fetched and the run area is the unavailable notice", async () => {
    const f = vi.fn(); globalThis.fetch = f as unknown as typeof fetch;
    render(<Harness wrap={n => n} />);
    expect((await screen.findByTestId("coding-run-unavailable", {}, { timeout: 3000 })).textContent).toBe("تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.");
    await tick(50);
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "تشغيل" })).toBeNull();
  });
});

describe("U3 — every outcome has an Arabic message", () => {
  const outcome = async (run: { status: number; json: unknown; headers?: Record<string, string> }, caps = capsOk) => {
    await mountWithApi(p => p.endsWith("/capabilities") ? caps : run);
    if (caps === capsOk) { fireEvent.click(await runButton()); await tick(); }
  };
  it("runner unavailable (capabilities false) → the unavailable notice, no run button", async () => {
    await outcome({ status: 200, json: {} }, { status: 200, json: { ok: true, available: false, languages: [] } });
    expect((await screen.findByTestId("coding-run-unavailable")).textContent).toBe("تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.");
    expect(screen.queryByRole("button", { name: "تشغيل" })).toBeNull();
  });
  it("RUNNER_BUSY / RATE_LIMITED (with the server's retry time) / EXECUTION_UNAVAILABLE / EXECUTION_FAILED", async () => {
    const msg = async () => (await screen.findByTestId("coding-run-error")).textContent;
    await outcome({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } });
    expect(await msg()).toBe("بيئة التشغيل مشغولة حاليًا. حاول مرة أخرى بعد قليل.");
    cleanup();
    await outcome({ status: 429, json: { ok: false, code: "RATE_LIMITED", retryAfterSeconds: 42 }, headers: { "Retry-After": "42" } });
    expect(await msg()).toBe("تجاوزت الحد المسموح به لمرات التشغيل مؤقتًا. حاول مرة أخرى بعد 42 ثانية.");
    cleanup();
    await outcome({ status: 503, json: { ok: false, code: "EXECUTION_UNAVAILABLE" } });
    expect(await msg()).toBe("تشغيل الكود غير متاح حاليًا؛ يمكن حفظ الإجابة وتسليمها للمراجعة.");
    cleanup();
    await outcome({ status: 502, json: { ok: false, code: "EXECUTION_FAILED" } });
    expect(await msg()).toBe("تعذّر تشغيل الكود الآن. حاول مرة أخرى لاحقًا.");
  });
  it("compile-error / runtime-error / timeout / output-limit render their Arabic status labels", async () => {
    for (const [status, label] of [["compile-error", "خطأ في الترجمة"], ["runtime-error", "خطأ أثناء التشغيل"], ["timeout", "انتهى الوقت"], ["output-limit", "تجاوز حد المخرجات"]] as const) {
      await outcome({ status: 200, json: { ok: true, result: { status, stdout: "", stderr: "E" } } });
      const r = await screen.findByTestId("coding-result");
      expect(r.getAttribute("data-status")).toBe(status); expect(r.textContent).toContain(label);
      cleanup();
    }
  });
});

describe("U4 / U5 / U6 — text-only, LTR, accessible results that are never stored", () => {
  it("stdout / stderr are TEXT in LTR, bounded scroll regions; the result region is aria-live polite; focus stays on «تشغيل»", async () => {
    await mountWithApi(p => p.endsWith("/capabilities") ? capsOk : { status: 200, json: { ok: true, result: { status: "runtime-error", stdout: "<img src=x onerror=alert(1)>", stderr: "Traceback <b>x</b>", exitCode: 1 } } });
    const btn = await runButton();
    btn.focus(); fireEvent.click(btn); await tick();
    const res = await screen.findByTestId("coding-result");
    expect(res.querySelector("img")).toBeNull(); expect(res.querySelector("b")).toBeNull();
    expect(res.textContent).toContain("<img src=x onerror=alert(1)>"); expect(res.textContent).toContain("Traceback <b>x</b>");
    for (const pre of Array.from(res.querySelectorAll("pre"))) { expect(pre.getAttribute("dir")).toBe("ltr"); expect(pre.className).toContain("cx-run-output"); }
    expect(res.closest("[aria-live=polite]")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "تشغيل" }));
  });
  it("a public sample can be loaded as input; a match is labelled «للتدريب فقط» and never claims a grade", async () => {
    const { calls } = await mountWithApi(p => p.endsWith("/capabilities") ? capsOk : { status: 200, json: { ok: true, result: { status: "success", stdout: "30\n", stderr: "" } } });
    await runButton();
    fireEvent.click(screen.getByRole("button", { name: "استخدام مدخلات: مثال ثانٍ" }));
    expect((screen.getByRole("textbox", { name: "مدخلات التشغيل" }) as HTMLTextAreaElement).value).toBe("10 20\n");
    fireEvent.click(await runButton()); await tick();
    expect(calls.find(c => c.path === "/api/coding/run")!.body!.stdin).toBe("10 20\n");
    const res = await screen.findByTestId("coding-result");
    expect(res.textContent).toContain("يطابق المخرجات النموذجية (للتدريب فقط)");
    expect(res.textContent).not.toMatch(/درجة|علامة|ناجح في الاختبارات/);
  });
  it("custom input is allowed (bounded to 16 KB) and the result is never written into the Answer", async () => {
    const { calls } = await mountWithApi(p => p.endsWith("/capabilities") ? capsOk : { status: 200, json: { ok: true, result: { status: "success", stdout: "7\n", stderr: "" } } });
    await runButton();
    const stdin = screen.getByRole("textbox", { name: "مدخلات التشغيل" }) as HTMLTextAreaElement;
    expect(stdin.getAttribute("dir")).toBe("ltr");
    fireEvent.change(stdin, { target: { value: "3 4\n" } });
    fireEvent.click(await runButton()); await tick();
    expect(calls.find(c => c.path === "/api/coding/run")!.body!.stdin).toBe("3 4\n");
    expect(JSON.parse(screen.getByTestId("answer").textContent || "null")).toBeNull();                 // running is not answering
    fireEvent.change(stdin, { target: { value: "x".repeat(16385) } });
    expect((screen.getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("coding-stdin-too-large").textContent).toBe("المدخلات أكبر من الحد المسموح (16 كيلوبايت).");
  });
  it("a language the runner does not report is not runnable (no request), the rest of the question still works", async () => {
    const { calls } = await mountWithApi(p => p.endsWith("/capabilities") ? { status: 200, json: { ok: true, available: true, languages: [{ key: "java", languageVersion: 1 }] } } : { status: 500, json: {} });
    expect((await screen.findByTestId("coding-run-unavailable", {}, { timeout: 3000 })).textContent).toContain("غير متاح");
    expect(calls.filter(c => c.path === "/api/coding/run")).toHaveLength(0);
  });
});

// ── U8 / U9 / U10 — the REAL exam page + REAL handlers (student-assignment, student-submission, coding-run) ────────────────
const { handler: submissionHandler } = nodeRequire("../../api/src/functions/student-submission.js");
const { handler: assignmentHandler } = nodeRequire("../../api/src/functions/student-assignment.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");
const { createFakeCodingExecutionProvider } = nodeRequire("../../api/tests/fixtures/fake-coding-execution-provider.js");
const S1 = "11111111-1111-1111-1111-111111111111", AID = "asg-17b-ui";
const EXAM = { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "coding", questionTypeVersion: 1, text: "سؤال التشغيل", marks: 5, coding: CFG, answer: { hiddenTests: [{ id: "h1", input: "HIDDEN-UI-IN\n", expectedOutput: "HIDDEN-UI-OUT\n", weight: 1 }], comparator: "exact", referenceSolutions: {} } }] }] };

describe("U8 / U9 / U10 — end to end through the real exam page and handlers", () => {
  let ctx: ReturnType<typeof createMemoryContainer>, seen: { url: string; method: string; headers: Headers; body: string }[];
  const provider = createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }] });
  beforeEach(() => {
    (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
    ctx = createMemoryContainer({
      ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
      ["platform/classes/c1.json"]: { classId: "c1", name: "الصف", active: true, studentIds: [] },
      ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: AID, classId: "c1", title: "واجب التشغيل", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 5, examSnapshot: EXAM }
    });
    seen = [];
    const { runHandler, capabilitiesHandler } = nodeRequire("../../api/src/functions/coding-run.js");
    const deps = () => ({ container: ctx.container, requireStudentAuth: (r: { headers: Headers }) => r.headers.get("authorization") === "Bearer tok-17b" ? { ok: true, user: { sub: S1, sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }, codingExecutionProvider: provider, recordAchievementIfEligible: async () => {} });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {}), text = init.body ? String(init.body) : "";
      seen.push({ url, method, headers, body: text });
      const reqObj = { method, url, params: { assignmentId: AID }, headers, text: async () => text, json: async () => (text ? JSON.parse(text) : {}) };
      const r = url.includes("/api/coding/run") ? await runHandler(reqObj, deps())
        : url.includes("/api/coding/capabilities") ? await capabilitiesHandler(reqObj, deps())
        : url.includes("/api/student-submission/") ? await submissionHandler(reqObj, deps())
        : url.includes("/api/student-assignment/") ? await assignmentHandler(reqObj, deps())
        : { status: 404, jsonBody: { ok: false } };
      return new Response(JSON.stringify(r.jsonBody), { status: r.status, headers: { "content-type": "application/json", ...(r.headers || {}) } });
    }) as unknown as typeof fetch;
  });
  it("start → run: the request carries the token ONLY as a header, the server binds the question, the runner sees the question's limits, and nothing is stored", async () => {
    const a = await assignmentHandler({ method: "GET", params: { assignmentId: AID }, headers: new Headers({ authorization: "Bearer tok-17b" }) }, { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }) });
    render(<StudentExamPage token="tok-17b" assignment={a.jsonBody.assignment} studentName="أحمد" className="الصف" onBack={() => {}} onLogout={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }, { timeout: 4000 }));
    await screen.findByText("سؤال التشغيل", {}, { timeout: 4000 });
    fireEvent.click(await screen.findByRole("button", { name: "تشغيل" }, { timeout: 4000 }));
    const result = await screen.findByTestId("coding-result", {}, { timeout: 4000 });
    expect(result.getAttribute("data-status")).toBe("success");
    const run = seen.find(s => s.url.endsWith("/api/coding/run"))!;
    expect(run.headers.get("authorization")).toBe("Bearer tok-17b");
    expect(run.body).not.toContain("tok-17b");
    expect(JSON.parse(run.body)).toEqual({ assignmentId: AID, questionId: "q1", language: "python", languageVersion: 1, source: CFG.starterCode.python, stdin: "2 3\n" });
    expect(provider.requests.at(-1)!.limits).toEqual({ timeMs: 2000, memoryMb: 128, outputBytes: 4096 });
    expect(JSON.stringify(provider.requests)).not.toMatch(/HIDDEN-UI/);
    const doc = ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json");
    expect(JSON.stringify(doc.draftAnswers || {})).not.toMatch(/stdout|status|success/);
    for (const store of [localStorage, sessionStorage]) for (let i = 0; i < store.length; i++) expect(store.getItem(store.key(i) || "") || "").not.toContain("tok-17b");
    await waitFor(() => expect(seen.filter(s => s.url.includes("/api/coding/capabilities")).length).toBe(1));
  });
});
