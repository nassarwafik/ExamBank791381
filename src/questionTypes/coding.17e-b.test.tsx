// @vitest-environment happy-dom
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { render, cleanup, fireEvent, screen, waitFor, act } from "@testing-library/react";
import StudentQuestionCard from "../StudentQuestionCard";
import StudentExamPage from "../StudentExamPage";
import ExamPreview from "../ExamPreview";
import type { Answer } from "../answerState";
import type { Question } from "../studentQuestionTypes";
import * as sanitizer from "../../api/src/lib/student-exam-sanitize.js";

// Phase 17E-B — the student coding IDE & practice-run experience (IDE1–IDE28). The coding renderer stays the ONE lazy
// coding@1 student component: a workspace of language selector → editor → stdin → run controls → output → public tests. Practice
// runs go ONLY through the exam page's attempt seam to POST /api/coding/run (never to the official grading routes, never to the
// runner directly); results are ephemeral, bound to the source snapshot that was sent, single-flight per question, and can
// never overwrite a newer run. Per-language drafts live only in this exam-page session (memory); the canonical Answer stays
// { kind:"code", language, languageVersion, source }. Hidden tests / reference solutions / grading policy never reach the
// renderer, the DOM, a request, storage or the console (17EB canaries).
const nodeRequire = createRequire(import.meta.url);
const load = <T,>(p: string): Promise<T> => import(/* @vite-ignore */ p);
type CtxMod = typeof import("./studentAttemptContext");
type ExecMod = typeof import("../coding/codingExecution");
const sanitizeExamForStudent = (sanitizer as unknown as { sanitizeExamForStudent: (exam: unknown) => { sections: { questions: Question[] }[] } }).sanitizeExamForStudent;

const CANARY_RE = /HIDDEN_STDIN_CANARY_17EB|HIDDEN_EXPECTED_CANARY_17EB|HIDDEN_WEIGHT_CANARY_17EB|REFERENCE_SOLUTION_CANARY_17EB|HIDDEN_LABEL_CANARY_17EB|9\.17|allOrNothing|scoringPolicy|hiddenTests|referenceSolutions/;
const CFG = {
  allowedLanguages: ["python", "java"], defaultLanguage: "python",
  starterCode: { python: "a, b = map(int, input().split())\n", java: "public class Main {\n    public static void main(String[] args) {\n    }\n}\n" },
  taskMode: "program", inputMode: "stdin", outputMode: "stdout",
  limits: { sourceBytes: 4096, outputBytes: 4096, timeMs: 2000, memoryMb: 128 },
  publicTests: [{ id: "pub-1", title: "مثال أول", input: "2 3\n", sampleOutput: "5\n" }, { id: "pub-2", input: "10 20\n" }]
};
const KEY = { gradingMode: "hiddenTests", scoringPolicy: "allOrNothing", comparator: "exact", hiddenTests: [{ id: "hid-1", title: "HIDDEN_LABEL_CANARY_17EB", input: "HIDDEN_STDIN_CANARY_17EB\n", expectedOutput: "HIDDEN_EXPECTED_CANARY_17EB\n", weight: 9.17, note: "HIDDEN_WEIGHT_CANARY_17EB" }], referenceSolutions: { python: "REFERENCE_SOLUTION_CANARY_17EB\n" } };
const teacherQ = (coding: Record<string, unknown> = CFG, answer: Record<string, unknown> = KEY) => ({ examQuestionId: "q-code", presentationType: "coding", questionTypeVersion: 1, text: "اجمع عددين", marks: 5, coding, answer });
const exam = (q = teacherQ()) => ({ examId: "EX-17EB", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [q] }] });
const studentQ = (q = teacherQ()) => sanitizeExamForStudent(exam(q)).sections[0].questions[0];

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
const deferred = <T,>(): Deferred<T> => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const ok = (stdout: string, extra: Record<string, unknown> = {}) => ({ status: "success" as const, stdout, stderr: "", exitCode: 0, durationMs: 12, ...extra });
const tick = (ms = 20) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

function Harness({ q, initial, wrap, disabled }: { q: Question; initial?: Answer; wrap?: (n: ReactNode) => ReactNode; disabled?: boolean }) {
  const [a, setA] = useState<Answer | undefined>(initial);
  const card = <StudentQuestionCard q={q} index={0} id="q-code" answer={a} onChoice={() => {}} onSeq={() => {}} onTable={() => {}} onText={() => {}} onAnswer={setA} disabled={disabled} />;
  return <>{wrap ? wrap(card) : card}<output data-testid="answer">{JSON.stringify(a ?? null)}</output></>;
}
const answerOut = () => JSON.parse(screen.getByTestId("answer").textContent || "null");
const editorBox = async () => (await screen.findByRole("textbox", { name: /محرر الكود/ }, { timeout: 3000 })) as HTMLTextAreaElement;
const runButton = () => screen.findByRole("button", { name: "تشغيل" }, { timeout: 3000 });
const stdinBox = () => screen.getByRole("textbox", { name: "مدخلات التشغيل" }) as HTMLTextAreaElement;
const langSelect = () => screen.getByRole("combobox", { name: "لغة البرمجة" }) as HTMLSelectElement;

/** An injected execution service whose runs resolve only when the test says so. */
function controlledService(languages = [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }]) {
  const pending: { request: Record<string, unknown>; d: Deferred<ReturnType<typeof ok>> }[] = [];
  const run = vi.fn((request: Record<string, unknown>) => { const d = deferred<ReturnType<typeof ok>>(); pending.push({ request, d }); return d.promise; });
  return { service: { capabilities: { available: true, languages }, run }, run, pending };
}
async function mountInjected(opts: { q?: Question; initial?: Answer; languages?: { key: string; languageVersion: number }[] } = {}) {
  const { CodingExecutionContext } = await load<ExecMod>("../coding/codingExecution");
  const c = controlledService(opts.languages);
  const utils = render(<Harness q={opts.q ?? studentQ()} initial={opts.initial} wrap={n => <CodingExecutionContext.Provider value={c.service}>{n}</CodingExecutionContext.Provider>} />);
  return { ...c, utils };
}
type Call = { path: string; init: RequestInit; body: Record<string, unknown> | null };
function attemptApi(respond: (path: string, body: Record<string, unknown> | null) => Promise<{ status: number; json: unknown }> | { status: number; json: unknown }) {
  const calls: Call[] = [];
  const request = vi.fn(async (path: string, init: RequestInit = {}) => {
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, init, body });
    const r = await respond(path, body);
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  });
  return { api: { assignmentId: "asg-17eb", request }, calls };
}
const CAPS = { status: 200, json: { ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }] } };
async function mountWithApi(respond: Parameters<typeof attemptApi>[0], opts: { q?: Question; initial?: Answer; api?: ReturnType<typeof attemptApi> } = {}) {
  const { StudentAttemptContext } = await load<CtxMod>("./studentAttemptContext");
  const a = opts.api ?? attemptApi(respond);
  const utils = render(<Harness q={opts.q ?? studentQ()} initial={opts.initial} wrap={n => <StudentAttemptContext.Provider value={a.api}>{n}</StudentAttemptContext.Provider>} />);
  return { ...a, utils };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); localStorage.clear(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("17E-B IDE1–IDE7 — the workspace, languages, starter code, restore and per-language drafts", () => {
  it("IDE1 / IDE3 / IDE4 a workspace: language selector → editor → stdin → run controls → output → public tests; default language + its starter", async () => {
    await mountInjected();
    const ta = await editorBox();
    expect(langSelect().value).toBe("python");
    expect(ta.value).toBe(CFG.starterCode.python);
    const order = ["coding-language-bar", "coding-editor-panel", "coding-stdin-panel", "coding-run-controls", "coding-output-panel", "coding-public-tests"].map(id => screen.getByTestId(id));
    for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("IDE2 only the teacher-allowed languages, with registry labels", async () => {
    await mountInjected();
    await editorBox();
    expect(Array.from(langSelect().options).map(o => [o.value, o.textContent])).toEqual([["python", "Python"], ["java", "Java"]]);
  });
  it("IDE5 a restored student source (even an empty one) wins over the starter code, byte-for-byte", async () => {
    const src = "\tx = input()  \n\nprint('مرحبا 🙂')  \n";
    await mountInjected({ initial: { kind: "code", language: "java", languageVersion: 1, source: src } as unknown as Answer });
    expect((await editorBox()).value).toBe(src);
    expect(langSelect().value).toBe("java");
    cleanup();
    await mountInjected({ initial: { kind: "code", language: "python", languageVersion: 1, source: "" } as unknown as Answer });
    expect((await editorBox()).value).toBe("");
  });
  it("IDE6 an edit updates the canonical response { kind, language, languageVersion, source } and nothing else", async () => {
    await mountInjected();
    fireEvent.change(await editorBox(), { target: { value: "print(1)\n" } });
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "print(1)\n" });
  });
  it("IDE7 Python → Java → edit Java → Python → Java: each language's draft comes back; the saved answer is always the selected language", async () => {
    await mountInjected();
    fireEvent.change(await editorBox(), { target: { value: "print('py')\n" } });
    fireEvent.change(langSelect(), { target: { value: "java" } });
    expect(answerOut()).toMatchObject({ language: "java" });
    fireEvent.change(await editorBox(), { target: { value: "class Main {}\n" } });
    fireEvent.change(langSelect(), { target: { value: "python" } });
    expect(answerOut()).toEqual({ kind: "code", language: "python", languageVersion: 1, source: "print('py')\n" });
    expect((await editorBox()).value).toBe("print('py')\n");
    expect(screen.getByTestId("coding-drafts-note").textContent).toContain("تُحفظ وتُسلَّم إجابة لغة واحدة فقط");
    fireEvent.change(langSelect(), { target: { value: "java" } });
    expect(answerOut()).toEqual({ kind: "code", language: "java", languageVersion: 1, source: "class Main {}\n" });
  });
  it("IDE7b drafts survive page navigation within the same exam session (same attempt seam) and never cross to another session", async () => {
    const a = attemptApi(p => (p.endsWith("/capabilities") ? CAPS : { status: 200, json: { ok: true, result: ok("") } }));
    const first = await mountWithApi(() => CAPS, { api: a });
    fireEvent.change(await editorBox(), { target: { value: "print('mine')\n" } });
    fireEvent.change(langSelect(), { target: { value: "java" } });
    fireEvent.change(await editorBox(), { target: { value: "class J {}\n" } });
    const saved = answerOut();
    expect(saved).toMatchObject({ language: "java", source: "class J {}\n" });
    first.utils.unmount();
    await mountWithApi(() => CAPS, { api: a, initial: saved });                                       // back to the question
    fireEvent.change(langSelect(), { target: { value: "python" } });
    expect((await editorBox()).value).toBe("print('mine')\n");
    cleanup();
    await mountWithApi(() => CAPS, { initial: saved });                                               // another session / student
    fireEvent.change(langSelect(), { target: { value: "python" } });
    expect((await editorBox()).value).not.toBe("print('mine')\n");
  });
});

describe("17E-B IDE8–IDE18 — practice run identity, single flight, outcomes and races", () => {
  it("IDE8 the run sends the CURRENT source snapshot and the stdin box", async () => {
    const c = await mountInjected();
    fireEvent.change(await editorBox(), { target: { value: "print(42)\n" } });
    fireEvent.change(stdinBox(), { target: { value: "7\n" } });
    fireEvent.click(await runButton());
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(c.pending[0].request).toMatchObject({ language: "python", languageVersion: 1, source: "print(42)\n", stdin: "7\n" });
  });
  it("IDE9 a double click / double tap creates ONE active run; the button is aria-busy and «تشغيل» cannot start another", async () => {
    const c = await mountInjected();
    const btn = await runButton();
    fireEvent.click(btn); fireEvent.click(btn); fireEvent.click(btn);
    expect(c.run).toHaveBeenCalledTimes(1);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.getAttribute("type")).toBe("button");
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    expect(btn.getAttribute("aria-busy")).toBe("false");
    fireEvent.click(btn);
    expect(c.run).toHaveBeenCalledTimes(2);
  });
  it("IDE10 success: Arabic status, stdout as LTR text, practical meta (duration, exit code)", async () => {
    const c = await mountInjected();
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    const r = await screen.findByTestId("coding-result");
    expect(r.getAttribute("data-status")).toBe("success");
    expect(r.textContent).toContain("نجح");
    expect(r.querySelector("pre[dir=ltr]")!.textContent).toBe("5\n");
    expect(screen.getByTestId("coding-result-meta").textContent).toMatch(/12.*ملّي ثانية/);
  });
  it("IDE11 compile error: the compiler output is labelled as such, TEXT, LTR", async () => {
    const c = await mountInjected();
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve({ status: "compile-error", stdout: "", stderr: "Main.java:1: error: <b>';' expected</b>", exitCode: 1, durationMs: 5 } as never); });
    const r = await screen.findByTestId("coding-result");
    expect(r.getAttribute("data-status")).toBe("compile-error");
    expect(r.textContent).toContain("خطأ في الترجمة");
    expect(r.textContent).toContain("رسائل المترجم");
    expect(r.querySelector("b")).toBeNull();
  });
  it("IDE12 runtime error: stderr is shown as error messages, never as HTML", async () => {
    const c = await mountInjected();
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve({ status: "runtime-error", stdout: "partial\n", stderr: "Traceback <img src=x>", exitCode: 1 } as never); });
    const r = await screen.findByTestId("coding-result");
    expect(r.textContent).toContain("خطأ أثناء التشغيل");
    expect(r.textContent).toContain("رسائل الخطأ");
    expect(r.querySelector("img")).toBeNull();
  });
  it("IDE13 timeout and output-limit: distinct Arabic labels; a truncated output is explained", async () => {
    const c = await mountInjected();
    const btn = await runButton();
    fireEvent.click(btn);
    await act(async () => { c.pending[0].d.resolve({ status: "timeout", stdout: "", stderr: "" } as never); });
    expect((await screen.findByTestId("coding-result")).textContent).toContain("انتهى الوقت");
    fireEvent.click(btn);
    await act(async () => { c.pending[1].d.resolve({ status: "output-limit", stdout: "x".repeat(50), stderr: "" } as never); });
    expect((await screen.findByTestId("coding-result")).textContent).toContain("تجاوز حد المخرجات");
    expect(screen.getByTestId("coding-output-truncated").textContent).toBe("اقتُطعت المخرجات لأنها تجاوزت الحد المسموح.");
  });
  it("IDE14 runner unavailable is non-fatal: no run, the editor and the answer keep working; a mid-exam outage keeps code + stdin", async () => {
    await mountWithApi(p => (p.endsWith("/capabilities") ? { status: 200, json: { ok: true, available: false, languages: [] } } : { status: 500, json: {} }));
    expect((await screen.findByTestId("coding-run-unavailable", {}, { timeout: 3000 })).textContent).toContain("غير متاح");
    fireEvent.change(await editorBox(), { target: { value: "print(3)\n" } });
    expect(answerOut()).toMatchObject({ source: "print(3)\n" });
    cleanup();
    await mountWithApi(p => (p.endsWith("/capabilities") ? CAPS : { status: 503, json: { ok: false, code: "EXECUTION_UNAVAILABLE" } }));
    fireEvent.change(await editorBox(), { target: { value: "print(4)\n" } });
    fireEvent.change(stdinBox(), { target: { value: "9 9\n" } });
    fireEvent.click(await runButton()); await tick();
    expect((await screen.findByTestId("coding-run-error")).textContent).toContain("غير متاح");
    expect((await editorBox()).value).toBe("print(4)\n");
    expect(stdinBox().value).toBe("9 9\n");
    expect(answerOut()).toMatchObject({ source: "print(4)\n" });
  });
  it("IDE15 a network failure keeps the source, the stdin, and allows a retry", async () => {
    let fail = true;
    const { calls } = await mountWithApi(p => { if (p.endsWith("/capabilities")) return CAPS; if (fail) throw new TypeError("offline"); return { status: 200, json: { ok: true, result: ok("ok\n") } }; });
    fireEvent.change(await editorBox(), { target: { value: "print('n')\n" } });
    fireEvent.click(await runButton()); await tick();
    expect((await screen.findByTestId("coding-run-error")).textContent).toBe("تعذّر الاتصال بالخادم. تحقّق من الاتصال وحاول مرة أخرى.");
    expect((await editorBox()).value).toBe("print('n')\n");
    fail = false;
    fireEvent.click(await runButton()); await tick();
    expect((await screen.findByTestId("coding-result")).getAttribute("data-status")).toBe("success");
    expect(calls.filter(c => c.path === "/api/coding/run")).toHaveLength(2);
  });
  it("IDE16 a late Run A can never overwrite the newer Run B (language switch supersedes the in-flight run)", async () => {
    const c = await mountInjected();
    fireEvent.click(await runButton());                                            // A — python
    fireEvent.change(langSelect(), { target: { value: "java" } });                 // supersedes A
    fireEvent.click(await runButton());                                            // B — java
    expect(c.run).toHaveBeenCalledTimes(2);
    await act(async () => { c.pending[1].d.resolve(ok("RUN-B\n")); });
    expect((await screen.findByTestId("coding-result")).textContent).toContain("RUN-B");
    await act(async () => { c.pending[0].d.resolve(ok("RUN-A-LATE\n")); });
    await tick();
    expect(screen.getByTestId("coding-result").textContent).toContain("RUN-B");
    expect(document.body.textContent).not.toContain("RUN-A-LATE");
  });
  it("IDE17 editing during a run keeps the newest source; the result is marked as belonging to the earlier snapshot", async () => {
    const c = await mountInjected();
    fireEvent.change(await editorBox(), { target: { value: "v1\n" } });
    fireEvent.click(await runButton());
    fireEvent.change(await editorBox(), { target: { value: "v2\n" } });            // editing is never blocked
    await act(async () => { c.pending[0].d.resolve(ok("from v1\n")); });
    expect((await editorBox()).value).toBe("v2\n");
    expect(answerOut()).toMatchObject({ source: "v2\n" });
    expect(screen.getByTestId("coding-result-stale").textContent).toContain("لنسخة سابقة من الكود");
    fireEvent.click(await runButton());
    await act(async () => { c.pending[1].d.resolve(ok("from v2\n")); });
    expect(screen.queryByTestId("coding-result-stale")).toBeNull();
  });
  it("IDE18 the stdin survives a failed run (refusals keep the input)", async () => {
    await mountWithApi(p => (p.endsWith("/capabilities") ? CAPS : { status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));
    await runButton();
    fireEvent.change(stdinBox(), { target: { value: "keep\nme\n" } });
    fireEvent.click(await runButton()); await tick();
    expect((await screen.findByTestId("coding-run-error")).textContent).toContain("مشغولة");
    expect(stdinBox().value).toBe("keep\nme\n");
  });
});

describe("17E-B IDE19–IDE24 — public tests, secrecy, and practice ≠ official", () => {
  it("IDE19 public tests show only public data (title, input, sample output when the teacher gave one — never a manufactured one)", async () => {
    await mountInjected();
    await editorBox();
    const cards = screen.getAllByTestId("coding-sample-test");
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("مثال أول"); expect(cards[0].textContent).toContain("2 3"); expect(cards[0].textContent).toContain("الناتج المتوقع");
    expect(cards[1].textContent).toContain("مثال 2"); expect(cards[1].textContent).not.toContain("الناتج المتوقع");
  });
  it("IDE19b «تشغيل الأمثلة» runs every public input sequentially; actual output is shown beside the sample, labelled practice-only", async () => {
    const c = await mountInjected();
    fireEvent.click(await screen.findByRole("button", { name: "تشغيل الأمثلة" }));
    expect(c.run).toHaveBeenCalledTimes(1);                                        // sequential, one at a time
    expect(c.pending[0].request).toMatchObject({ stdin: "2 3\n" });
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    await waitFor(() => expect(c.run).toHaveBeenCalledTimes(2));
    expect(c.pending[1].request).toMatchObject({ stdin: "10 20\n" });
    await act(async () => { c.pending[1].d.resolve(ok("30\n")); });
    const rows = await screen.findAllByTestId("coding-public-result");
    expect(rows.map(r => [r.getAttribute("data-status"), r.getAttribute("data-match")])).toEqual([["success", "match"], ["success", "none"]]);
    expect(rows[0].textContent).toContain("5"); expect(rows[1].textContent).toContain("30");
    expect(screen.getByTestId("coding-public-results").textContent).toContain("نتائج الأمثلة للتدريب فقط ولا تؤثر في العلامة.");
  });
  it("IDE20 hidden canaries are absent from the props, DOM, every request, storage and the console", async () => {
    const logs: unknown[] = [];
    for (const m of ["log", "info", "warn", "debug"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a); });
    const { calls } = await mountWithApi(p => (p.endsWith("/capabilities") ? CAPS : { status: 200, json: { ok: true, result: ok("5\n") } }));
    fireEvent.click(await runButton()); await tick();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل الأمثلة" })); await tick(60);
    expect(JSON.stringify(studentQ())).not.toMatch(CANARY_RE);
    expect(document.body.innerHTML).not.toMatch(CANARY_RE);
    expect(JSON.stringify(calls.map(c => c.body))).not.toMatch(CANARY_RE);
    for (const c of calls.filter(c => c.path === "/api/coding/run")) expect(Object.keys(c.body!).sort()).toEqual(["assignmentId", "language", "languageVersion", "questionId", "source", "stdin"]);
    for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) expect(s.getItem(s.key(i) || "") || "").not.toMatch(CANARY_RE);
    expect(JSON.stringify(logs)).not.toMatch(CANARY_RE);
  });
  it("IDE21 / IDE22 a run never submits, never saves, never calls an official grading route and never changes the Answer", async () => {
    const { calls } = await mountWithApi(p => (p.endsWith("/capabilities") ? CAPS : { status: 200, json: { ok: true, result: ok("5\n") } }));
    fireEvent.change(await editorBox(), { target: { value: "print(5)\n" } });
    const before = answerOut();
    fireEvent.click(await runButton()); await tick();
    fireEvent.click(screen.getByRole("button", { name: "تشغيل الأمثلة" })); await tick(60);
    expect(answerOut()).toEqual(before);
    expect(calls.map(c => c.path).filter(p => p !== "/api/coding/capabilities" && p !== "/api/coding/run")).toEqual([]);
    expect(JSON.stringify(calls)).not.toMatch(/grade-callback|regrade|student-submission|official/);
  });
  it("IDE23 a MANUAL-grading question runs the same practice path; nothing in the IDE claims automatic grading", async () => {
    const q = studentQ(teacherQ(CFG, { ...KEY, gradingMode: "manual" }));
    const c = await mountInjected({ q });
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    expect(document.body.textContent).not.toMatch(/تصحيح تلقائي|الاختبارات المخفية|علامتك/);
  });
  it("IDE24 practice success never implies an official result: matches are «للتدريب فقط», no grade / mark / pass wording", async () => {
    const c = await mountInjected();
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    const r = await screen.findByTestId("coding-result");
    expect(r.textContent).toContain("يطابق المخرجات النموذجية (للتدريب فقط)");
    expect(document.body.textContent).not.toMatch(/درجتك|علامتك|نجحت في الاختبار|الاختبارات المخفية/);
  });
});

describe("17E-B IDE25–IDE28 — RTL/LTR, accessibility, mobile, teacher preview", () => {
  it("IDE25 the Arabic shell stays RTL while code, stdin and output are LTR", async () => {
    const c = await mountInjected();
    const root = screen.getByTestId("coding-response");
    expect(root.getAttribute("dir")).not.toBe("ltr");
    expect((await editorBox()).getAttribute("dir")).toBe("ltr");
    expect(stdinBox().getAttribute("dir")).toBe("ltr");
    fireEvent.click(await runButton());
    await act(async () => { c.pending[0].d.resolve(ok("5\n")); });
    for (const pre of Array.from(screen.getByTestId("coding-output-panel").querySelectorAll("pre"))) expect(pre.getAttribute("dir")).toBe("ltr");
  });
  it("IDE26 accessible names, labelled stdin / output, aria-live status, aria-busy, status in TEXT (never colour only), limits announced", async () => {
    const c = await mountInjected();
    await editorBox();
    expect(stdinBox()).toBeTruthy();
    const out = screen.getByTestId("coding-output-panel");
    expect(out.getAttribute("aria-live")).toBe("polite");
    expect(out.getAttribute("aria-label")).toBe("نتيجة التشغيل");
    const btn = await runButton();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    const progress = screen.getByTestId("coding-run-progress");
    expect(progress.getAttribute("role")).toBe("status");
    expect(progress.textContent).toContain("جارٍ التشغيل");
    await act(async () => { c.pending[0].d.resolve({ status: "timeout", stdout: "", stderr: "" } as never); });
    expect(screen.getByTestId("coding-result").textContent).toContain("انتهى الوقت");          // text, not only a colour
    expect(screen.getByTestId("coding-limits").textContent).toMatch(/2000.*128.*4096/s);
  });
  it("IDE27 mobile guard: the workspace never forces page overflow; code / output scroll inside their own boxes; controls wrap", () => {
    const css = readFileSync(process.cwd() + "/src/coding/coding.css", "utf8").replace(/\s+/g, " ");
    expect(css).toMatch(/\.cx-coding \{[^}]*min-width: 0[^}]*max-width: 100%/);
    expect(css).toMatch(/\.cx-run-output \{[^}]*overflow: auto/);
    expect(css).toMatch(/\.cx-run-controls \{[^}]*flex-wrap: wrap/);
    expect(css).toMatch(/@media \(max-width: 640px\) \{[^@]*\.cx-run-controls/);
  });
  it("IDE28 the teacher preview never runs code: a clear preview notice, no request, no run button, no private data", async () => {
    const f = vi.fn(); globalThis.fetch = f as unknown as typeof fetch;
    render(<ExamPreview exam={exam() as never} onClose={() => {}} />);
    expect((await screen.findByTestId("coding-run-preview", {}, { timeout: 3000 })).textContent).toBe("معاينة المعلم: التشغيل متاح للطالب داخل الامتحان فقط، ولا يُشغَّل أي كود من المعاينة.");
    expect(screen.queryByRole("button", { name: "تشغيل" })).toBeNull();
    await tick(40);
    expect(f).not.toHaveBeenCalled();
    expect(document.body.innerHTML).not.toMatch(CANARY_RE);
  });
});

// ── End to end: the REAL exam page + REAL handlers — autosave and practice run interleave without losing the newest edit ──
const { handler: submissionHandler } = nodeRequire("../../api/src/functions/student-submission.js");
const { handler: assignmentHandler } = nodeRequire("../../api/src/functions/student-assignment.js");
const { runHandler, capabilitiesHandler } = nodeRequire("../../api/src/functions/coding-run.js");
const { createMemoryContainer } = nodeRequire("../../api/tests/fixtures/memory-container.js");
const S1 = "11111111-1111-1111-1111-111111111111", AID = "asg-17eb-ui";
describe("17E-B E2E — autosave × run race, refresh restore, secrecy through the real page", () => {
  let ctx: ReturnType<typeof createMemoryContainer>, seen: { url: string; body: string }[], gate: Deferred<void> | null;
  beforeEach(() => {
    (window as unknown as { scrollTo: () => void }).scrollTo = () => {};
    gate = null;
    ctx = createMemoryContainer({
      ["platform/users/" + S1 + ".json"]: { schemaVersion: 3, role: "student", userId: S1, displayName: "أحمد", code: "S1", classId: "c1", active: true, archived: false, authVersion: 1 },
      ["platform/classes/c1.json"]: { classId: "c1", name: "الصف", active: true, studentIds: [] },
      ["platform/assignments/" + AID + ".json"]: { schemaVersion: 2, attemptModelVersion: 2, attemptPolicy: "continuous", assignmentId: AID, classId: "c1", title: "واجب", instructions: "", status: "published", openAt: "", dueAt: new Date(Date.now() + 864e5).toISOString(), maxAttempts: 1, durationMinutes: 0, questionCount: 1, totalMarks: 5, examSnapshot: { title: "امتحان", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [teacherQ()] }] } }
    });
    seen = [];
    const provider = { id: "test", capabilities: () => ({ available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }] }), execute: async (r: { stdin: string }) => { if (gate) await gate.promise; return ok("out:" + r.stdin); } };
    const deps = () => ({ container: ctx.container, requireStudentAuth: (r: { headers: Headers }) => r.headers.get("authorization") === "Bearer tok-17eb" ? { ok: true, user: { sub: S1, sv: 1, role: "student" } } : { ok: false, response: { status: 401, jsonBody: { ok: false } } }, codingExecutionProvider: provider, recordAchievementIfEligible: async () => {} });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input), method = (init.method || "GET").toUpperCase(), headers = new Headers(init.headers || {}), text = init.body ? String(init.body) : "";
      seen.push({ url, body: text });
      const reqObj = { method, url, params: { assignmentId: AID }, headers, text: async () => text, json: async () => (text ? JSON.parse(text) : {}) };
      const r = url.includes("/api/coding/run") ? await runHandler(reqObj, deps())
        : url.includes("/api/coding/capabilities") ? await capabilitiesHandler(reqObj, deps())
        : url.includes("/api/student-submission/") ? await submissionHandler(reqObj, deps())
        : url.includes("/api/student-assignment/") ? await assignmentHandler(reqObj, deps())
        : { status: 404, jsonBody: { ok: false } };
      return new Response(JSON.stringify(r.jsonBody), { status: r.status, headers: { "content-type": "application/json", ...(r.headers || {}) } });
    }) as unknown as typeof fetch;
  });
  const draft = () => ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json")?.draftAnswers?.["q-code"];
  async function openPage() {
    const a = await assignmentHandler({ method: "GET", params: { assignmentId: AID }, headers: new Headers({ authorization: "Bearer tok-17eb" }) }, { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: S1, sv: 1, role: "student" } }) });
    expect(JSON.stringify(a.jsonBody)).not.toMatch(CANARY_RE);
    return render(<StudentExamPage token="tok-17eb" assignment={a.jsonBody.assignment} studentName="أحمد" className="الصف" onBack={() => {}} onLogout={() => {}} />);
  }
  it("type → autosave → Run → keep typing → autosave + run resolve: the newest edit wins; refresh restores it byte-for-byte; no starter re-inserted", async () => {
    const first = await openPage();
    fireEvent.click(await screen.findByRole("button", { name: "بدء المحاولة" }, { timeout: 4000 }));
    fireEvent.change(await editorBox(), { target: { value: "print('A')\n" } });
    gate = deferred<void>();
    fireEvent.click(await screen.findByRole("button", { name: "تشغيل" }, { timeout: 4000 }));
    fireEvent.change(await editorBox(), { target: { value: "print('B')\n\t# آخر تعديل 🙂\n" } });
    await waitFor(() => expect(draft()?.source).toBe("print('B')\n\t# آخر تعديل 🙂\n"), { timeout: 5000 });
    await act(async () => { gate!.resolve(); });
    await screen.findByTestId("coding-result", {}, { timeout: 4000 });
    expect(screen.getByTestId("coding-result-stale")).toBeTruthy();
    await tick(50);
    expect((await editorBox()).value).toBe("print('B')\n\t# آخر تعديل 🙂\n");
    expect(draft()?.source).toBe("print('B')\n\t# آخر تعديل 🙂\n");
    expect(JSON.stringify(ctx.getJson("platform/submissions/" + AID + "/" + S1 + ".json"))).not.toMatch(/out:|"status":"success"|codingGrading/);
    expect(seen.map(s => s.body).join("\n")).not.toMatch(CANARY_RE);
    first.unmount(); cleanup();
    await openPage();
    expect((await editorBox()).value).toBe("print('B')\n\t# آخر تعديل 🙂\n");
  });
});
