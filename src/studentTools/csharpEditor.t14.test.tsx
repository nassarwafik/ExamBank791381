// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { validateStudentTools, defaultStudentToolConfig, csharpRunAllowedInBook, validateBookStudentTools, STUDENT_TOOL_IDS, type StudentToolsSpecV1 } from "./studentToolsSpec";
import { studentToolHasUi } from "./studentToolsCatalog";
import { courseStudentTools } from "./courseTools";
import { studentToolAnswerRisks } from "./studentToolsRisk";
import { bookCSharpRunner, CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";
import StudentToolDock from "./StudentToolDock";
import StudentToolsEditor from "./StudentToolsEditor";
import CourseToolDock from "./CourseToolDock";
import type { CodeExecutionResult } from "../codingContract";
import { readFileSync } from "node:fs";

// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — «محرر C#» in the student tool bar. Owner decision: in a course
// BOOK (practice) the editor may run code; in exams and assignments it is a WRITING aid only (copy the code into the answer), never run.
// Covered: the contract, the book run rule, the editor (write only / copy / run / output / compiler and runtime messages / refusals /
// a stopped runner), the book transport, the Builder (no run option for an exam, the option for a book) and the answer-risk note.

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const RUN: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: true }] };
const WRITE_ONLY: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: false }] };
const ok = (stdout: string, extra: Partial<CodeExecutionResult> = {}): CodeExecutionResult => ({ status: "success", stdout, stderr: "", exitCode: 0, ...extra });
function fakeRunner(impl: (s: string, i: string) => Promise<CodeExecutionResult>, up: () => Promise<boolean> = async () => true) {
  const calls: [string, string][] = [];
  const checks: number[] = [];
  const runner: CSharpToolRunner = { run: (s, i) => { calls.push([s, i]); return impl(s, i); }, available: () => { checks.push(1); return up(); } };
  return { runner, calls, checks };
}
async function openEditor(spec: unknown, runner?: CSharpToolRunner) {
  render(<StudentToolDock studentTools={spec} csharpRunner={runner} />);
  fireEvent.click(screen.getByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
  const panel = screen.getByRole("dialog", { name: "محرر C#" });
  await within(panel).findByTestId("csharp-editor-tool");
  return panel;
}
const code = (panel: HTMLElement) => within(panel).getByLabelText("كود C#") as HTMLTextAreaElement;
const runReady = (panel: HTMLElement) => waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));

describe("T14 — contract", () => {
  it("csharpEditor is the last contract id, has a UI, defaults to write only, and validates with closed keys", () => {
    expect(STUDENT_TOOL_IDS.at(-1)).toBe("csharpEditor");
    expect(studentToolHasUi("csharpEditor")).toBe(true);
    expect(defaultStudentToolConfig("csharpEditor")).toEqual({ id: "csharpEditor", allowRun: false });
    expect(validateStudentTools(RUN)).toMatchObject({ ok: true, value: RUN });
    for (const t of [{ id: "csharpEditor" }, { id: "csharpEditor", allowRun: "yes" }, { id: "csharpEditor", allowRun: true, source: "x" }, { id: "csharpEditor", allowRun: true, language: "python" }])
      expect(validateStudentTools({ version: 1, tools: [t] }).ok, JSON.stringify(t)).toBe(false);
  });
  it("the book run rule: allowRun; the C# books carry it with running on; the networks book does not", () => {
    expect(csharpRunAllowedInBook(RUN)).toBe(true);
    expect(csharpRunAllowedInBook(WRITE_ONLY)).toBe(false);
    expect(csharpRunAllowedInBook(undefined)).toBe(false);
    expect(validateBookStudentTools(RUN).ok).toBe(true);
    for (const course of ["899271d", "899371"]) expect(csharpRunAllowedInBook(courseStudentTools(course)), course).toBe(true);
    expect(courseStudentTools("791381")!.tools.some(t => t.id === "csharpEditor")).toBe(false);
  });
});

describe("T14 — exams and assignments: a writing aid only", () => {
  it("no runner (the exam page passes none): the editor, «نسخ الكود», a note — no run button, even if a spec says allowRun", async () => {
    const panel = await openEditor(RUN, undefined);
    expect(code(panel).value).toContain("public static void Main()");
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(within(panel).queryByLabelText(/المدخلات/)).toBeNull();
    expect(within(panel).getByRole("note").textContent).toContain("لكتابة الكود فقط");
    expect(within(panel).getByRole("button", { name: "نسخ الكود" })).toBeTruthy();
  });
  it("«نسخ الكود» copies the current code to the clipboard and says where to paste it; a refused clipboard says how to copy by hand", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const panel = await openEditor(WRITE_ONLY, undefined);
    fireEvent.change(code(panel), { target: { value: "Console.WriteLine(42);" } });
    fireEvent.click(within(panel).getByRole("button", { name: "نسخ الكود" }));
    await waitFor(() => expect(within(panel).getByTestId("csharp-copy-status").textContent).toContain("نُسخ الكود"));
    expect(writeText).toHaveBeenCalledWith("Console.WriteLine(42);");
    fireEvent.change(code(panel), { target: { value: "x" } });
    expect(within(panel).getByTestId("csharp-copy-status").textContent).toBe("");                    // an edit clears the message
    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(within(panel).getByRole("button", { name: "نسخ الكود" }));
    await waitFor(() => expect(within(panel).getByTestId("csharp-copy-status").textContent).toContain("Ctrl+C"));
    fireEvent.change(code(panel), { target: { value: "  " } });
    expect((within(panel).getByRole("button", { name: "نسخ الكود" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("guard: the exam page and the exam preview never hand the tool bar a run transport (only the book reader does)", () => {
    for (const f of ["src/StudentExamPage.tsx", "src/ExamPreview.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect({ f, wiresRunner: /csharpRunner|csharpToolRun|CSharpRunner/.test(src) }).toEqual({ f, wiresRunner: false });
    }
    expect(readFileSync("src/studentTools/CourseToolDock.tsx", "utf8")).toMatch(/bookCSharpRunner/);
  });
  it("a book runner with a write-only book set still runs nothing", async () => {
    const f = fakeRunner(async () => ok("x"));
    const panel = await openEditor(WRITE_ONLY, f.runner);
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(f.calls).toHaveLength(0);
    expect(f.checks).toHaveLength(0);
  });
});

describe("T14 — books: running for practice", () => {
  it("runs the learner's code with the input and shows the output (Output)", async () => {
    const f = fakeRunner(async (_s, i) => ok("مرحبا " + i));
    const panel = await openEditor(RUN, f.runner);
    fireEvent.change(code(panel), { target: { value: "Console.WriteLine(Console.ReadLine());" } });
    fireEvent.change(within(panel).getByLabelText(/المدخلات/), { target: { value: "سارة" } });
    await runReady(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect((await within(panel).findByTestId("csharp-output")).textContent).toBe("مرحبا سارة");
    expect(f.calls).toEqual([["Console.WriteLine(Console.ReadLine());", "سارة"]]);
    expect(within(panel).getAllByRole("status").map(e => e.textContent)).toContain("انتهى التشغيل بنجاح.");
  });
  it("a compile error shows the compiler's message with the line; a runtime error its message; a time-out its verdict", async () => {
    const results: CodeExecutionResult[] = [
      { status: "compile-error", stdout: "", stderr: "Program.cs(3,9): error CS1002: ; expected" },
      { status: "runtime-error", stdout: "قبل\n", stderr: "Unhandled exception. System.DivideByZeroException: Attempted to divide by zero." },
      { status: "timeout", stdout: "", stderr: "" },
    ];
    const f = fakeRunner(async () => results.shift()!);
    const panel = await openEditor(RUN, f.runner);
    const go = () => fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    await runReady(panel);
    go();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "رسالة المترجم" }).textContent).toContain("CS1002"));
    go();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "رسالة الخطأ" }).textContent).toContain("DivideByZeroException"));
    expect(within(panel).getByTestId("csharp-output").textContent).toBe("قبل\n");
    go();
    await waitFor(() => expect(within(panel).getAllByRole("status").map(e => e.textContent).join(" ")).toContain("تجاوز الوقت"));
  });
  it("a refusal shows the server's message (with the wait when rate limited); the code is kept when the panel is closed and reopened", async () => {
    const f = fakeRunner(async () => { throw new CSharpToolRunError("RATE_LIMITED", "شغّلت كثيرًا في وقت قصير.", 30); });
    const panel = await openEditor(RUN, f.runner);
    fireEvent.change(code(panel), { target: { value: "class P { static void Main() {} }" } });
    await runReady(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    await waitFor(() => expect(within(panel).getAllByRole("status").map(e => e.textContent)).toContain("شغّلت كثيرًا في وقت قصير. (بعد 30 ثانية تقريبًا)"));
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق محرر C#" }));
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    expect(code(screen.getByRole("dialog", { name: "محرر C#" })).value).toBe("class P { static void Main() {} }");
  });
  it("a stopped runner is known up front: «متوقف حاليًا», no run button, «التحقق مرة أخرى» asks again", async () => {
    let up = false;
    const f = fakeRunner(async () => ok("x"), async () => up);
    const panel = await openEditor(RUN, f.runner);
    expect((await within(panel).findByTestId("csharp-runner-down")).textContent).toContain("متوقف حاليًا");
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    up = true;
    fireEvent.click(within(panel).getByRole("button", { name: "التحقق مرة أخرى" }));
    await runReady(panel);
    expect(f.checks).toHaveLength(2);
    expect(f.calls).toHaveLength(0);
  });
  it("while checking, the run button waits; a run answered EXECUTION_UNAVAILABLE switches to «متوقف حاليًا»", async () => {
    let release: (v: boolean) => void = () => {};
    const f = fakeRunner(async () => { throw new CSharpToolRunError("EXECUTION_UNAVAILABLE", "تشغيل الكود غير متاح الآن."); }, () => new Promise<boolean>(r => { release = r; }));
    const panel = await openEditor(RUN, f.runner);
    expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getAllByRole("status").map(e => e.textContent)).toContain("جارٍ التحقق من المشغّل…");
    release(true);
    await runReady(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect(await within(panel).findByTestId("csharp-runner-down")).toBeTruthy();
  });
});

describe("T14 — the book transport", () => {
  it("POST: the session headers, exactly { context: book, courseId, source, stdin }; a refusal becomes the server's Arabic message", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "RUN_NOT_ALLOWED", error: "تشغيل الكود غير مفعّل هنا." }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = bookCSharpRunner({ Authorization: "Bearer T" }, "899271d");
    await expect(r.run("SRC", "")).rejects.toMatchObject({ code: "RUN_NOT_ALLOWED", message: "تشغيل الكود غير مفعّل هنا." });
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/student-tools/csharp-run");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer T");
    expect(JSON.parse(String(init.body))).toEqual({ context: "book", courseId: "899271d", source: "SRC", stdin: "" });
  });
  it("GET: available:false → false; an unreadable answer → true (the server still decides every run)", async () => {
    const answer = (body: string, status = 200) => { vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status }))); return bookCSharpRunner({}, "899271d").available(); };
    expect(await answer(JSON.stringify({ ok: true, available: false }))).toBe(false);
    expect(await answer(JSON.stringify({ ok: true, available: true }))).toBe(true);
    expect(await answer("<html>", 502)).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await bookCSharpRunner({}, "x").available()).toBe(true);
  });
  it("the book tool bar runs through the Reader's session headers", async () => {
    const fetchMock = vi.fn(async (_p: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "GET" ? { ok: true, available: true } : { ok: true, result: ok("BOOK\n") }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer S" }} />);
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    const panel = screen.getByRole("dialog", { name: "محرر C#" });
    await within(panel).findByTestId("csharp-editor-tool");
    await runReady(panel);
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect((await within(panel).findByTestId("csharp-output")).textContent).toBe("BOOK\n");
    const post = fetchMock.mock.calls.map(c => c as unknown as [string, RequestInit]).find(([, init]) => init.method === "POST")!;
    expect(JSON.parse(String(post[1].body)).context).toBe("book");
  });
});

describe("T14 — Builder and answer risk", () => {
  it("in an exam: switching the editor on adds it write only, and there is NO run option — only the write-only note", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={undefined} sections={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "محرر C#" }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(WRITE_ONLY);
    r.rerender(<StudentToolsEditor value={WRITE_ONLY} sections={[]} onChange={onChange} />);
    expect(screen.queryByRole("checkbox", { name: /السماح بتشغيل الكود/ })).toBeNull();
    expect(screen.getByText(/محرر لكتابة الكود فقط/)).toBeTruthy();
  });
  it("in a book's tools dialog: «السماح بتشغيل الكود للتدريب» turns running on", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    render(<StudentToolsEditor value={WRITE_ONLY} sections={[]} place="book" onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /السماح بتشغيل الكود للتدريب/ }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(RUN);
  });
  it("the editor never names an exam question as answerable (it never runs in an exam), whatever its flag", () => {
    const exam = { sections: [{ id: "s1", title: "البرمجة", questions: [
      { examQuestionId: "q1", presentationType: "shortAnswer", text: "ما ناتج تنفيذ المقطع التالي؟ Console.WriteLine(3 + 4);" }] }] };
    expect(studentToolAnswerRisks(exam, RUN)).toEqual([]);
    expect(studentToolAnswerRisks(exam, WRITE_ONLY)).toEqual([]);
  });
});
