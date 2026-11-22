// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { validateStudentTools, defaultStudentToolConfig, csharpRunAllowedInExam, csharpRunAllowedInBook, validateBookStudentTools, STUDENT_TOOL_IDS, type StudentToolsSpecV1 } from "./studentToolsSpec";
import { studentToolHasUi } from "./studentToolsCatalog";
import { courseStudentTools } from "./courseTools";
import { studentToolAnswerRisks } from "./studentToolsRisk";
import { examCSharpRunner, bookCSharpRunner, CSharpToolRunError, type CSharpToolRunner } from "./csharpToolRun";
import StudentToolDock from "./StudentToolDock";
import StudentToolsEditor from "./StudentToolsEditor";
import CourseToolDock from "./CourseToolDock";
import type { CodeExecutionResult } from "../codingContract";

// Phase T14 (docs/enterprise-student-tools-csharp-editor-design.md) — «محرر C#» in the student tool bar: the contract, the run rule
// the dock shares with the server, the editor (write only / run / output / compiler and runtime messages / refusals), the transports,
// the Builder option and the answer-risk note.

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const RUN: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: true }] };
const WRITE_ONLY: StudentToolsSpecV1 = { version: 1, tools: [{ id: "csharpEditor", allowRun: false }] };
const ok = (stdout: string, extra: Partial<CodeExecutionResult> = {}): CodeExecutionResult => ({ status: "success", stdout, stderr: "", exitCode: 0, ...extra });
function fakeRunner(context: "exam" | "book", impl: (s: string, i: string) => Promise<CodeExecutionResult>, up: () => Promise<boolean> = async () => true) {
  const calls: [string, string][] = [];
  const checks: number[] = [];
  const runner: CSharpToolRunner = { context, run: (s, i) => { calls.push([s, i]); return impl(s, i); }, available: () => { checks.push(1); return up(); } };
  return { runner, calls, checks };
}
async function openEditor(spec: unknown, runner?: CSharpToolRunner, sectionId?: string) {
  render(<StudentToolDock studentTools={spec} csharpRunner={runner} sectionId={sectionId} />);
  fireEvent.click(screen.getByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
  const panel = screen.getByRole("dialog", { name: "محرر C#" });
  await within(panel).findByTestId("csharp-editor-tool");
  return panel;
}
const code = (panel: HTMLElement) => within(panel).getByLabelText("كود C#") as HTMLTextAreaElement;

describe("T14 — contract", () => {
  it("csharpEditor is the last contract id, has a UI, defaults to write only, and validates with closed keys", () => {
    expect(STUDENT_TOOL_IDS.at(-1)).toBe("csharpEditor");
    expect(studentToolHasUi("csharpEditor")).toBe(true);
    expect(defaultStudentToolConfig("csharpEditor")).toEqual({ id: "csharpEditor", allowRun: false });
    expect(validateStudentTools(RUN)).toMatchObject({ ok: true, value: RUN });
    for (const t of [{ id: "csharpEditor" }, { id: "csharpEditor", allowRun: "yes" }, { id: "csharpEditor", allowRun: true, source: "x" }, { id: "csharpEditor", allowRun: true, language: "python" }])
      expect(validateStudentTools({ version: 1, tools: [t] }).ok, JSON.stringify(t)).toBe(false);
  });
  it("the run rule: exam — allowRun and no section switches the editor off; book — allowRun", () => {
    expect(csharpRunAllowedInExam(RUN)).toBe(true);
    expect(csharpRunAllowedInExam(WRITE_ONLY)).toBe(false);
    expect(csharpRunAllowedInExam(undefined)).toBe(false);
    expect(csharpRunAllowedInExam({ version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] })).toBe(false);
    expect(csharpRunAllowedInExam({ ...RUN, sectionOverrides: { s2: { disabled: ["csharpEditor"] } } })).toBe(false);
    expect(csharpRunAllowedInExam({ version: 1, tools: [...RUN.tools, { id: "scratchPad", drawing: true }], sectionOverrides: { s2: { disabled: ["scratchPad"] } } })).toBe(true);
    expect(csharpRunAllowedInBook(RUN)).toBe(true);
    expect(csharpRunAllowedInBook(WRITE_ONLY)).toBe(false);
    expect(validateBookStudentTools(RUN).ok).toBe(true);
  });
  it("the C# books carry the editor with running on (owner decision); the networks book does not", () => {
    for (const course of ["899271d", "899371"]) expect(csharpRunAllowedInBook(courseStudentTools(course)), course).toBe(true);
    expect(courseStudentTools("791381")!.tools.some(t => t.id === "csharpEditor")).toBe(false);
  });
});

describe("T14 — the editor in the tool bar", () => {
  it("write only: the editor and a note, no run button, nothing sent", async () => {
    const f = fakeRunner("exam", async () => ok("x"));
    const panel = await openEditor(WRITE_ONLY, f.runner);
    expect(code(panel).value).toContain("public static void Main()");
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(within(panel).getByRole("note").textContent).toContain("محرر كتابة فقط");
    expect(f.calls).toHaveLength(0);
  });
  it("allowed but no transport (teacher preview): the note says so", async () => {
    const panel = await openEditor(RUN, undefined);
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(within(panel).getByRole("note").textContent).toContain("المعاينة");
  });
  it("an exam where a section switches the editor off: no run anywhere, with the reason", async () => {
    const f = fakeRunner("exam", async () => ok("x"));
    const panel = await openEditor({ ...RUN, sectionOverrides: { s2: { disabled: ["csharpEditor"] } } }, f.runner, "s1");
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    expect(within(panel).getByRole("note").textContent).toContain("معطّل في بعض أقسامه");
  });
  it("runs the learner's code with the input and shows the output (Output)", async () => {
    const f = fakeRunner("exam", async (_s, i) => ok("مرحبا " + i));
    const panel = await openEditor(RUN, f.runner);
    fireEvent.change(code(panel), { target: { value: "Console.WriteLine(Console.ReadLine());" } });
    fireEvent.change(within(panel).getByLabelText(/المدخلات/), { target: { value: "سارة" } });
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect((await within(panel).findByTestId("csharp-output")).textContent).toBe("مرحبا سارة");
    expect(f.calls).toEqual([["Console.WriteLine(Console.ReadLine());", "سارة"]]);
    expect(within(panel).getByRole("status").textContent).toBe("انتهى التشغيل بنجاح.");
  });
  it("a compile error shows the compiler's message with the line; a runtime error its message; a time-out its verdict", async () => {
    const results: CodeExecutionResult[] = [
      { status: "compile-error", stdout: "", stderr: "Program.cs(3,9): error CS1002: ; expected" },
      { status: "runtime-error", stdout: "قبل\n", stderr: "Unhandled exception. System.DivideByZeroException: Attempted to divide by zero." },
      { status: "timeout", stdout: "", stderr: "" },
    ];
    const f = fakeRunner("book", async () => results.shift()!);
    const panel = await openEditor(RUN, f.runner);
    const go = () => fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    go();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "رسالة المترجم" }).textContent).toContain("CS1002"));
    expect(within(panel).getByRole("status").textContent).toContain("خطأ ترجمة");
    go();
    await waitFor(() => expect(within(panel).getByRole("region", { name: "رسالة الخطأ" }).textContent).toContain("DivideByZeroException"));
    expect(within(panel).getByTestId("csharp-output").textContent).toBe("قبل\n");
    go();
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toContain("تجاوز الوقت"));
  });
  it("a refusal shows the server's message (with the wait when rate limited); the code is kept when the panel is closed and reopened", async () => {
    const f = fakeRunner("exam", async () => { throw new CSharpToolRunError("RATE_LIMITED", "شغّلت كثيرًا في وقت قصير.", 30); });
    const panel = await openEditor(RUN, f.runner);
    fireEvent.change(code(panel), { target: { value: "class P { static void Main() {} }" } });
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("شغّلت كثيرًا في وقت قصير. (بعد 30 ثانية تقريبًا)"));
    fireEvent.click(within(panel).getByRole("button", { name: "إغلاق محرر C#" }));
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    expect(code(screen.getByRole("dialog", { name: "محرر C#" })).value).toBe("class P { static void Main() {} }");
  });
  it("a blank source cannot be run", async () => {
    const f = fakeRunner("exam", async () => ok(""));
    const panel = await openEditor(RUN, f.runner);
    fireEvent.change(code(panel), { target: { value: "   " } });
    expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("T14 — a stopped runner is known up front", () => {
  it("the runner reports itself down: no run button, «متوقف حاليًا», the editor still writes; «التحقق مرة أخرى» asks again and brings the button back", async () => {
    let up = false;
    const f = fakeRunner("book", async () => ok("x"), async () => up);
    const panel = await openEditor(RUN, f.runner);
    expect((await within(panel).findByTestId("csharp-runner-down")).textContent).toContain("متوقف حاليًا");
    expect(within(panel).queryByRole("button", { name: "تشغيل" })).toBeNull();
    fireEvent.change(code(panel), { target: { value: "class P {}" } });
    expect(code(panel).value).toBe("class P {}");
    up = true;
    fireEvent.click(within(panel).getByRole("button", { name: "التحقق مرة أخرى" }));
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    expect(f.checks).toHaveLength(2);
    expect(f.calls).toHaveLength(0);
  });
  it("while checking, the run button waits; a run answered EXECUTION_UNAVAILABLE switches to «متوقف حاليًا»", async () => {
    let release: (v: boolean) => void = () => {};
    const f = fakeRunner("exam", async () => { throw new CSharpToolRunError("EXECUTION_UNAVAILABLE", "تشغيل الكود غير متاح الآن."); }, () => new Promise<boolean>(r => { release = r; }));
    const panel = await openEditor(RUN, f.runner);
    expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).getByRole("status").textContent).toBe("جارٍ التحقق من المشغّل…");
    release(true);
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect(await within(panel).findByTestId("csharp-runner-down")).toBeTruthy();
  });
  it("transport: GET on the run path; available:false → false; an unreadable answer → true (the server still decides every run)", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true, available: false }), { status: 200 }));
    expect(await examCSharpRunner(request, "asg-1").available()).toBe(false);
    expect(request.mock.calls[0]).toEqual(["/api/student-tools/csharp-run", { method: "GET" }]);
    expect(await examCSharpRunner(vi.fn(async () => new Response(JSON.stringify({ ok: true, available: true }), { status: 200 })), "a").available()).toBe(true);
    expect(await examCSharpRunner(vi.fn(async () => new Response("<html>", { status: 502 })), "a").available()).toBe(true);
    expect(await examCSharpRunner(vi.fn(async () => { throw new Error("offline"); }), "a").available()).toBe(true);
  });
});

describe("T14 — transports", () => {
  it("exam: the attempt seam, the run path, exactly { context, assignmentId, source, stdin }", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: ok("1\n") }), { status: 200 }));
    const r = examCSharpRunner(request, "asg-1");
    expect(r.context).toBe("exam");
    expect(await r.run("SRC", "IN")).toMatchObject({ status: "success", stdout: "1\n" });
    const [path, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/student-tools/csharp-run");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ context: "exam", assignmentId: "asg-1", source: "SRC", stdin: "IN" });
  });
  it("book: the session headers, exactly { context, courseId, source, stdin }; a refusal becomes the server's Arabic message", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "RUN_NOT_ALLOWED", error: "تشغيل الكود غير مفعّل هنا." }), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = bookCSharpRunner({ Authorization: "Bearer T" }, "899271d");
    await expect(r.run("SRC", "")).rejects.toMatchObject({ code: "RUN_NOT_ALLOWED", message: "تشغيل الكود غير مفعّل هنا." });
    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/student-tools/csharp-run");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer T");
    expect(JSON.parse(String(init.body))).toEqual({ context: "book", courseId: "899271d", source: "SRC", stdin: "" });
  });
  it("the book tool bar runs through the Reader's session headers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: ok("BOOK\n") }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer S" }} />);
    fireEvent.click(screen.getByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
    const panel = screen.getByRole("dialog", { name: "محرر C#" });
    await waitFor(() => expect((within(panel).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(panel).getByRole("button", { name: "تشغيل" }));
    expect((await within(panel).findByTestId("csharp-output")).textContent).toBe("BOOK\n");
    const post = fetchMock.mock.calls.map(c => c as unknown as [string, RequestInit]).find(([, init]) => init.method === "POST")!;
    expect(JSON.parse(String(post[1].body)).context).toBe("book");
  });
});

describe("T14 — Builder and answer risk", () => {
  it("switching the editor on adds it write only; «السماح بتشغيل الكود» turns running on", () => {
    const onChange = vi.fn<(next: StudentToolsSpecV1 | undefined) => void>();
    const r = render(<StudentToolsEditor value={undefined} sections={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "محرر C#" }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(WRITE_ONLY);
    r.rerender(<StudentToolsEditor value={WRITE_ONLY} sections={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /السماح بتشغيل الكود/ }));
    expect(onChange.mock.calls.at(-1)![0]).toEqual(RUN);
  });
  it("a running editor names «what does it print» questions; a write-only editor names none", () => {
    const exam = { sections: [{ id: "s1", title: "البرمجة", questions: [
      { examQuestionId: "q1", presentationType: "shortAnswer", text: "ما ناتج تنفيذ المقطع التالي؟ Console.WriteLine(3 + 4);" },
      { examQuestionId: "q2", presentationType: "shortAnswer", text: "عرّف المصفوفة." }] }] };
    expect(studentToolAnswerRisks(exam, RUN)).toEqual([{ tool: "csharpEditor", hits: [{ sectionId: "s1", questionId: "q1", label: "البرمجة · السؤال 1" }] }]);
    expect(studentToolAnswerRisks(exam, WRITE_ONLY)).toEqual([]);
  });
});
