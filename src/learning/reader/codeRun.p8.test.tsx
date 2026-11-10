// @vitest-environment happy-dom
// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — «جرّب الكود» in the Reader (the server is a fetch double here; its
// authority is api/tests/learning-run-899371.test.js):
//   • no transport, or the server not listing the block (or the runner unavailable, or the list failing) → no button, no run request;
//   • the list is asked ONCE per session and course, however many C# blocks a page has;
//   • a listed block → «جرّب الكود» opens an editable COPY; the book's code above never changes; «تشغيل» sends exactly
//     { pageId, blockId, source, stdin }; the output, the compiler message and the refusals are shown as the server says;
//   • «إعادة كود الكتاب» brings the book's code back; the toggle keeps its focus.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";
import type { CodeRunAccess } from "../run/runClient";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const CS = "static void Main(string[] args)\n{\n    int n = int.Parse(Console.ReadLine());\n    Console.WriteLine(n * 2);\n}";
const header: ReaderPageHeader = { courseId: "899371", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 } };
const page = (ids = ["b1"]): ContentPage => ({
  id: "899371-m04-l01-p05", moduleId: "899371-m04", lessonId: "899371-m04-l01", order: 1, title: "صفحة", layout: "standard",
  blocks: ids.map(id => ({ id, type: "code", origin: "book", language: "csharp", code: CS })),
} as unknown as ContentPage);
type Reply = { status?: number; json: unknown };
function server(list: Reply | (() => Reply), runs: Reply[] = []) {
  const calls: { url: string; method: string; body?: unknown; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> });
    const r = url.endsWith("/run") ? runs.shift() : typeof list === "function" ? list() : list;
    return new Response(JSON.stringify(r!.json), { status: r!.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
const LISTED = { json: { ok: true, actor: "student", available: true, blocks: { "899371-m04-l01-p05": ["b1"] } } };
const show = (access?: CodeRunAccess, ids?: string[]) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page(ids) }} codeRun={access} />);
const access = (): CodeRunAccess => ({ headers: { "x-student-token": "T" } });
const panelReady = () => screen.findByRole("button", { name: "نسخ الكود" });

describe("«جرّب الكود» — when it appears", () => {
  it("no transport → no button and no request", async () => {
    const calls = server(LISTED);
    show(undefined);
    await panelReady();
    expect(screen.queryByRole("button", { name: "جرّب الكود" })).toBeNull();
    expect(calls).toEqual([]);
  });
  it("the server does not list the block, the runner is unavailable, or the list fails → no button", async () => {
    for (const reply of [{ json: { ok: true, actor: "student", available: true, blocks: {} } }, { json: { ...LISTED.json, available: false } }, { status: 403, json: { ok: false, code: "UNAVAILABLE" } }]) {
      server(reply);
      show(access());
      await panelReady();
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByRole("button", { name: "جرّب الكود" }), JSON.stringify(reply)).toBeNull();
      cleanup();
    }
  });
  it("a listed block shows the button; the list is asked once for the course however many blocks the page has", async () => {
    const calls = server({ json: { ...LISTED.json, blocks: { "899371-m04-l01-p05": ["b1", "b2", "b3"] } } });
    show(access(), ["b1", "b2", "b3"]);
    expect(await screen.findAllByRole("button", { name: "جرّب الكود" })).toHaveLength(3);
    // once each for the course: the runnable list, and (899371 enrichment P13) the list of traces this learner may watch
    expect(calls.map(c => [c.method, c.url]).sort()).toEqual([["GET", "/api/learning-run/899371"], ["GET", "/api/learning-trace/899371"]]);
    for (const c of calls) expect(c.headers["x-student-token"]).toBe("T");
  });
});

describe("«جرّب الكود» — a run", () => {
  it("opens an editable copy, sends exactly the four fields, and shows the output; the book's code is untouched", async () => {
    const calls = server(LISTED, [{ json: { ok: true, result: { status: "success", stdout: "14\n", stderr: "", exitCode: 0 } } }]);
    show(access());
    const toggle = await screen.findByRole("button", { name: "جرّب الكود" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    const region = await screen.findByRole("region", { name: "جرّب الكود" });
    expect(screen.getByRole("button", { name: "إغلاق التجربة" })).toBe(toggle);              // the same element: focus stays
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(region.id);
    const [code, input] = within(region).getAllByRole("textbox") as HTMLTextAreaElement[];
    expect(code.value).toBe(CS);
    fireEvent.change(code, { target: { value: CS.replace("n * 2", "n * 3") } });
    fireEvent.change(input, { target: { value: "7\n" } });
    fireEvent.click(within(region).getByRole("button", { name: "تشغيل" }));
    expect(await within(region).findByText("انتهى التشغيل")).toBeTruthy();
    expect(within(region).getByRole("region", { name: "الناتج" }).textContent).toBe("14\n");
    const post = calls.find(c => c.method === "POST")!;
    expect(post.url).toBe("/api/learning-run/899371/run");
    expect(post.body).toEqual({ pageId: "899371-m04-l01-p05", blockId: "b1", source: CS.replace("n * 2", "n * 3"), stdin: "7\n" });
    expect(document.querySelector(".learning-reader-code code")!.textContent).toBe(CS);    // the book's code above is unchanged
    fireEvent.click(within(region).getByRole("button", { name: "إعادة كود الكتاب" }));
    expect(code.value).toBe(CS);
    expect((within(region).getByRole("button", { name: "إعادة كود الكتاب" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("a compile error shows the compiler's message (no output box: «لم يطبع البرنامج شيئًا»); a runtime error with no input says what is missing", async () => {
    server(LISTED, [
      { json: { ok: true, result: { status: "compile-error", stdout: "", stderr: "Program.cs(4,30): error CS1002: ; expected", exitCode: 1 } } },
      { json: { ok: true, result: { status: "runtime-error", stdout: "", stderr: "Unhandled exception. System.ArgumentNullException", exitCode: 134 } } },
    ]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: "جرّب الكود" }));
    const region = await screen.findByRole("region", { name: "جرّب الكود" });
    fireEvent.click(within(region).getByRole("button", { name: "تشغيل" }));
    expect(await within(region).findByRole("region", { name: "رسالة المترجم" })).toBeTruthy();
    expect(within(region).getByRole("region", { name: "رسالة المترجم" }).textContent).toContain("CS1002");
    expect(within(region).getByText(/خطأ ترجمة/)).toBeTruthy();
    expect(within(region).getByText("لم يطبع البرنامج شيئًا.")).toBeTruthy();
    expect(within(region).queryByRole("region", { name: "الناتج" })).toBeNull();
    fireEvent.click(within(region).getByRole("button", { name: "تشغيل" }));
    expect(await within(region).findByText(/البرنامج يقرأ مدخلات/)).toBeTruthy();
    expect(within(region).getByRole("region", { name: "رسالة الخطأ" }).textContent).toContain("ArgumentNullException");
  });
  it("a refusal shows the server's message (rate limit with its wait, a busy runner), and nothing is shown as output", async () => {
    server(LISTED, [
      { status: 429, json: { ok: false, code: "RATE_LIMITED", error: "شغّلت كثيرًا في وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.", retryAfterSeconds: 12 } },
      { status: 503, json: { ok: false, code: "RUNNER_BUSY", error: "المشغّل مشغول الآن، حاول بعد لحظات.", retryable: true } },
    ]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: "جرّب الكود" }));
    const region = await screen.findByRole("region", { name: "جرّب الكود" });
    fireEvent.click(within(region).getByRole("button", { name: "تشغيل" }));
    expect(await within(region).findByText(/شغّلت كثيرًا.*بعد 12 ثانية/)).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "تشغيل" }));
    expect(await within(region).findByText("المشغّل مشغول الآن، حاول بعد لحظات.")).toBeTruthy();
    expect(within(region).queryByRole("region", { name: "الناتج" })).toBeNull();
  });
  it("a blank code cannot be run", async () => {
    server(LISTED);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: "جرّب الكود" }));
    const region = await screen.findByRole("region", { name: "جرّب الكود" });
    fireEvent.change(within(region).getAllByRole("textbox")[0], { target: { value: "   " } });
    expect((within(region).getByRole("button", { name: "تشغيل" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
