// @vitest-environment happy-dom
// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — «حلّ وافحص» in the Reader (the server is a fetch double
// here; its authority is api/tests/learning-solve-p14.test.js). The exam's own coding renderers are replaced by plain text areas: this
// file proves the panel's behaviour, the real editors run in scripts/check-899371-browser-p14.mjs.
//   • only a starter block (`…-solve-qN`) asks the server, once per course; a block it does not list shows no button;
//   • «افحص حلي» sends the learner's program (version 2: the whole program; version 3: the gap values) and shows the verdict: the
//     public example in full when it fails, each hidden input as passed / failed only, the compiler's message; a passed check marks
//     «✓ حُلَّ» in this browser only;
//   • a run-only question has no check button and says why;
//   • the solution card: the server's refusal (not released) is shown; when open, the reference and its idea, and (version 2) a copy
//     into the editor;
//   • a rate-limit refusal says when to try again.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";
import type { CodeRunAccess } from "../run/runClient";

type Ans = { source?: string; values?: Record<string, string> };
vi.mock("../../questionTypes/student/CodingResponse", () => ({
  default: ({ answer, onAnswer }: { answer?: Ans; onAnswer: (a: unknown) => void }) => (
    <textarea aria-label="محرر البرنامج" defaultValue={answer?.source ?? ""} onChange={e => onAnswer({ kind: "code", language: "csharp", languageVersion: 1, source: e.target.value })} />
  ),
}));
vi.mock("../../questionTypes/student/CodingTemplateResponse", () => ({
  default: ({ onAnswer }: { onAnswer: (a: unknown) => void }) => (
    <input aria-label="الفراغ g1" onChange={e => onAnswer({ kind: "codeTemplate", language: "csharp", languageVersion: 1, values: { g1: e.target.value } })} />
  ),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* none */ } });
const PAGE = "899371-m02-l03-p01", BLOCK = "m02-l03-p01-solve-q3", KEY = PAGE + "/" + BLOCK;
const STARTER = "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        \n    }\n}\n";
const header: ReaderPageHeader = { courseId: "899371", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 } };
const page = (blockId = BLOCK): ContentPage => ({
  id: PAGE, moduleId: "899371-m02", lessonId: "899371-m02-l03", order: 1, title: "أسئلة الوحدة", layout: "lesson",
  blocks: [{ id: blockId, type: "code", origin: "teacher-enrichment", language: "csharp", code: STARTER }],
} as unknown as ContentPage);
const view = (over: Record<string, unknown> = {}) => ({
  questionId: "c02-p-q3", number: 3, version: 2, check: true, text: "اقرأ عددين واطبع `a + b`.", solution: "locked",
  node: { starterCode: { csharp: STARTER }, publicTests: [{ id: "p1", title: "المثال", input: "2\n3\n", sampleOutput: "5\n" }] }, ...over,
});
type Reply = { status?: number; json: unknown };
const listed = (v = view(), available = true): Reply => ({ json: { ok: true, actor: "student", available, questions: { [KEY]: v } } });
function server(list: Reply, replies: Reply[] = []) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method || "GET", ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    const r = url.startsWith("/api/learning-run/") ? { json: { ok: true, actor: "student", available: true, blocks: {} } }
      : url.startsWith("/api/learning-trace/") ? { json: { ok: true, actor: "student", traces: {} } }
      : url === "/api/learning-solve/899371" ? list : replies.shift()!;
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
const access = (): CodeRunAccess => ({ headers: { "x-student-token": "T" } });
const show = (blockId?: string) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page(blockId) }} codeRun={access()} />);
const open = async () => { show(); fireEvent.click(await screen.findByRole("button", { name: "حلّ وافحص" })); return screen.findByRole("region", { name: "حلّ وافحص: السؤال 3" }); };
const passed = { json: { ok: true, check: { outcome: "passed", passed: 4, total: 4, cases: [
  { kind: "public", input: "2\n3\n", expected: "5\n", actual: "5\n", passed: true }, { kind: "hidden", passed: true }, { kind: "hidden", passed: true }, { kind: "hidden", passed: true }] } } };
const failed = { json: { ok: true, check: { outcome: "failed", passed: 2, total: 4, cases: [
  { kind: "public", input: "2\n3\n", expected: "5\n", actual: "6\n", passed: false, why: "wrong-output" }, { kind: "hidden", passed: true }, { kind: "hidden", passed: false, why: "timeout" }, { kind: "hidden", passed: true }] } } };

describe("«حلّ وافحص» — when it appears", () => {
  it("only a starter block asks the server; a block it does not list, or a failed list, shows no button", async () => {
    let calls = server(listed());
    show("m02-l03-p01-b01");
    await screen.findByRole("button", { name: "نسخ الكود" });
    await waitFor(() => expect(calls.some(c => c.url.startsWith("/api/learning-trace/"))).toBe(true));
    expect(calls.some(c => c.url.startsWith("/api/learning-solve/"))).toBe(false);
    cleanup();
    for (const reply of [{ json: { ok: true, actor: "student", available: true, questions: {} } }, { status: 403, json: { ok: false, code: "UNAVAILABLE" } }]) {
      calls = server(reply);
      show();
      await waitFor(() => expect(calls.filter(c => c.url === "/api/learning-solve/899371")).toHaveLength(1));
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByRole("button", { name: "حلّ وافحص" }), JSON.stringify(reply)).toBeNull();
      cleanup();
    }
  });
  it("a listed starter opens the editor with what is checked, marked as enrichment, with no mark yet", async () => {
    server(listed());
    const region = await open();
    expect(within(region).getByText("إثراء تعليمي")).toBeTruthy();
    expect(within(region).getByText("a + b").closest("bdi")?.getAttribute("dir")).toBe("ltr");
    expect(await within(region).findByLabelText("محرر البرنامج")).toBeTruthy();
    expect(within(region).queryByText(/✓ حُلَّ/)).toBeNull();
    expect(screen.getByRole("button", { name: "إغلاق المحرر" }).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("«حلّ وافحص» — the check", () => {
  it("version 2: sends the whole program; a pass says so, lists each hidden input as passed only, and marks «✓ حُلَّ» here", async () => {
    const calls = server(listed(), [passed]);
    const region = await open();
    fireEvent.change(await within(region).findByLabelText("محرر البرنامج"), { target: { value: "MY-PROGRAM" } });
    fireEvent.click(within(region).getByRole("button", { name: "افحص حلي" }));
    await within(region).findByText(/نجح برنامجك في المثال وفي كل الحالات المخفية \(4 من 4\)/);
    expect(calls.filter(c => c.method === "POST")).toEqual([{ url: "/api/learning-solve/899371/check", method: "POST", body: { questionId: "c02-p-q3", source: "MY-PROGRAM" } }]);
    expect(within(region).getAllByText(/حالة مخفية \d: ✓ نجحت/)).toHaveLength(3);
    expect(within(region).getByText("المثال: ✓ نجح")).toBeTruthy();
    expect(within(region).getByText(/✓ حُلَّ$/)).toBeTruthy();
    expect(localStorage.getItem("eb.learning.solved.v1.899371.c02-p-q3")).toBe("1");
  });
  it("a failure shows the public example's expected and actual output, and each hidden input as failed with its reason only", async () => {
    server(listed(), [failed]);
    const region = await open();
    fireEvent.click(within(region).getByRole("button", { name: "افحص حلي" }));
    await within(region).findByText("نجح برنامجك في 2 من 4. راجع ما فشل وحاول مرة أخرى.");
    expect(within(region).getByText("المثال: ✗ لم ينجح — ناتج مختلف")).toBeTruthy();
    expect(within(region).getByRole("region", { name: "الناتج المتوقع" }).textContent).toBe("5\n");
    expect(within(region).getByRole("region", { name: "ناتج برنامجك" }).textContent).toBe("6\n");
    expect(within(region).getByText("حالة مخفية 2: ✗ فشلت — تجاوز الوقت")).toBeTruthy();
    expect(localStorage.getItem("eb.learning.solved.v1.899371.c02-p-q3")).toBeNull();
  });
  it("a compile error shows the compiler's message; a rate limit says when to try again", async () => {
    server(listed(), [{ json: { ok: true, check: { outcome: "compile-error", message: "Program.cs(3,1): error CS1002", passed: 0, total: 4, cases: [] } } },
      { status: 429, json: { ok: false, code: "RATE_LIMITED", error: "شغّلت أو فحصت كثيرًا في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.", retryAfterSeconds: 40 } }]);
    const region = await open();
    fireEvent.click(within(region).getByRole("button", { name: "افحص حلي" }));
    expect((await within(region).findByRole("region", { name: "رسالة المترجم" })).textContent).toBe("Program.cs(3,1): error CS1002");
    fireEvent.click(within(region).getByRole("button", { name: "افحص حلي" }));
    expect(await within(region).findByText(/انتظر قليلًا ثم حاول مرة أخرى\. \(بعد 40 ثانية تقريبًا\)/)).toBeTruthy();
  });
  it("version 3: sends the gap values only", async () => {
    const calls = server(listed(view({ version: 3, node: { template: { language: "csharp", segments: [{ kind: "locked", text: "class P {" }, { kind: "editable", id: "g1", starter: "" }, { kind: "locked", text: "}" }] }, publicTests: [] } })), [passed]);
    const region = await open();
    fireEvent.change(await within(region).findByLabelText("الفراغ g1"), { target: { value: "int x;" } });
    fireEvent.click(within(region).getByRole("button", { name: "افحص حلي" }));
    await within(region).findByText(/✓ حُلَّ!/);
    expect(calls.filter(c => c.method === "POST").map(c => c.body)).toEqual([{ questionId: "c02-p-q3", values: { g1: "int x;" } }]);
  });
  it("a run-only question has no check and says why; no runner disables the check", async () => {
    server(listed(view({ check: false })));
    let region = await open();
    expect(within(region).queryByRole("button", { name: "افحص حلي" })).toBeNull();
    expect(within(region).getByText(/هذا السؤال لا يُفحص آليًا/)).toBeTruthy();
    cleanup();
    server(listed(view(), false));
    region = await open();
    expect((within(region).getByRole("button", { name: "افحص حلي" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("«حلّ وافحص» — the solution card", () => {
  it("the server's refusal before the release is shown; nothing else", async () => {
    server(listed(), [{ status: 403, json: { ok: false, code: "NOT_RELEASED", error: "لم يفتح المعلم حلول هذا الفصل بعد." } }]);
    const region = await open();
    fireEvent.click(within(region).getByRole("button", { name: "الحل المقترح" }));
    expect(await within(region).findByText("لم يفتح المعلم حلول هذا الفصل بعد.")).toBeTruthy();
    expect(within(region).queryByRole("region", { name: "الحل المقترح" })).toBeNull();
  });
  it("open: the idea and the reference; version 2 copies it into the editor", async () => {
    const calls = server(listed(view({ solution: "open" })), [{ json: { ok: true, solution: { reference: "REFERENCE-PROGRAM", explanation: "نجمع `a + b` ثم نطبع." } } }]);
    const region = await open();
    fireEvent.click(within(region).getByRole("button", { name: "الحل المقترح" }));
    const card = await within(region).findByRole("region", { name: "الحل المقترح" });
    expect(calls.filter(c => c.url.includes("/solution")).map(c => c.url)).toEqual(["/api/learning-solve/899371/solution?questionId=c02-p-q3"]);
    expect(within(card).getByRole("region", { name: "برنامج الحل المقترح" }).textContent).toBe("REFERENCE-PROGRAM");
    expect(within(card).getByText("a + b").closest("bdi")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "انسخه إلى المحرر (يستبدل كودك)" }));
    expect(((await within(region).findByLabelText("محرر البرنامج")) as HTMLTextAreaElement).value).toBe("REFERENCE-PROGRAM");
    expect(screen.getByRole("button", { name: "إخفاء الحل المقترح" })).toBeTruthy();
  });
});
