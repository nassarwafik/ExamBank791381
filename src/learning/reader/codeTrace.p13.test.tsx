// @vitest-environment happy-dom
// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — «شاهد التنفيذ خطوة بخطوة» in the Reader (the server is a fetch
// double here; its authority is api/tests/learning-trace-p13.test.js), on a REAL recorded trace:
//   • the server does not list the block (or the list fails, or there is no transport) → no button;
//   • an exercise listed «open» → the button opens the recorded steps in the C# tracer (its own lazy chunk), asked with the block's
//     page and id only; the panel says «إثراء تعليمي»;
//   • an exercise listed «answer-first» → the server's refusal is shown («أجب عن التمرين أولًا …») and the list is asked again;
//   • a book question → «تنبّأ ثم تحقّق» first: the comparison says whether the prediction is the program's output (spaces aside), shows
//     both when it is not, and «شاهد دون توقّع» goes straight to the steps; values chosen for the trace are said.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import LearningPageRenderer, { type ReaderPageHeader } from "./LearningPageRenderer";
import type { ContentPage } from "../content/types";
import type { CodeRunAccess } from "../run/runClient";
import { readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
type Run = { steps: { out: string }[]; stdin?: string };
// read at run time (not imported): a typed import of this large file would make the type-checker infer it whole
const runs = (JSON.parse(readFileSync(join(process.cwd(), "src/learning/content/899371/question-traces/runs.json"), "utf8")) as { runs: Record<string, Run> }).runs;
const KEY = "899371-m05-l04-p01/m05-l04-p01-q01-code";
const RUN = runs[KEY];
const CODE = "for (int i = 1; i <= 4; i++)\n    Console.Write(i * 2 + \" \");";
const header: ReaderPageHeader = { courseId: "899371", pageTitle: "صفحة", moduleTitle: "الوحدة", lessonTitle: "الدرس", position: { index: 1, total: 1 } };
const page = (): ContentPage => ({
  id: "899371-m05-l04-p01", moduleId: "899371-m05", lessonId: "899371-m05-l04", order: 1, title: "تدريبات الوحدة", layout: "practice",
  blocks: [{ id: "m05-l04-p01-q01-code", type: "code", origin: "teacher-enrichment", language: "csharp", code: CODE }],
} as unknown as ContentPage);
type Reply = { status?: number; json: unknown };
function server(list: Reply, steps: Reply[] = []) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    const r = url.startsWith("/api/learning-run/") ? { json: { ok: true, actor: "student", available: true, blocks: {} } }
      : url.includes("/steps?") ? steps.shift()! : list;
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }));
  return calls;
}
const listed = (state: string) => ({ json: { ok: true, actor: "student", traces: { [KEY]: state } } });
const trace = (kind: "exercise" | "book", extra = {}) => ({ json: { ok: true, trace: { kind, code: CODE, steps: RUN.steps, ...extra } } });
const access = (): CodeRunAccess => ({ headers: { "x-student-token": "T" } });
const show = (a?: CodeRunAccess) => render(<LearningPageRenderer header={header} body={{ kind: "ready", page: page() }} codeRun={a} />);
const WATCH = "شاهد التنفيذ خطوة بخطوة";
const counter = () => document.querySelector(".learning-trace-counter")?.textContent?.replace(/\s+/g, " ").trim();
const finalOut = RUN.steps[RUN.steps.length - 1].out;

describe("«شاهد التنفيذ» — when it appears", () => {
  it("no transport, not listed, or a failed list → no button", async () => {
    show(undefined);
    await screen.findByRole("button", { name: "نسخ الكود" });
    expect(screen.queryByRole("button", { name: WATCH })).toBeNull();
    cleanup();
    for (const reply of [{ json: { ok: true, actor: "student", traces: {} } }, { status: 403, json: { ok: false, code: "UNAVAILABLE" } }]) {
      const calls = server(reply);
      show(access());
      await waitFor(() => expect(calls.some(c => c === "/api/learning-trace/899371")).toBe(true));
      await screen.findByRole("button", { name: "نسخ الكود" });
      expect(screen.queryByRole("button", { name: WATCH })).toBeNull();
      cleanup();
    }
  });
});

describe("«شاهد التنفيذ» — an exercise", () => {
  it("listed open: the recorded steps in the tracer, asked with the block's page and id only", async () => {
    const calls = server(listed("open"), [trace("exercise")]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: WATCH }));
    await waitFor(() => expect(counter()).toBe("الخطوة 1 / " + RUN.steps.length));
    expect(calls.filter(c => c.includes("/steps?"))).toEqual(["/api/learning-trace/899371/steps?pageId=899371-m05-l04-p01&blockId=m05-l04-p01-q01-code"]);
    expect(within(document.querySelector(".learning-trace-panel") as HTMLElement).getByText("إثراء تعليمي")).toBeTruthy();
    expect(screen.queryByText(/تنبّأ ثم تحقّق/)).toBeNull();                     // an exercise: answered already, straight to the steps
    fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
    expect(counter()).toBe("الخطوة 2 / " + RUN.steps.length);
    fireEvent.click(screen.getByRole("button", { name: "من البداية" }));
    expect(counter()).toBe("الخطوة 1 / " + RUN.steps.length);
  });

  it("listed «answer-first»: the server's refusal is shown and the list is asked again", async () => {
    const calls = server(listed("answer-first"), [{ status: 409, json: { ok: false, code: "ANSWER_FIRST", error: "أجب عن التمرين أولًا، ثم شاهد التنفيذ خطوة بخطوة." } }]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: WATCH }));
    expect((await screen.findByText(/أجب عن التمرين أولًا/)).textContent).toContain("ثم شاهد التنفيذ");
    await waitFor(() => expect(calls.filter(c => c === "/api/learning-trace/899371").length).toBe(2));
    expect(document.querySelector(".learning-trace")).toBeNull();
  });
});

describe("«شاهد التنفيذ» — a book question: تنبّأ ثم تحقّق", () => {
  it("a prediction equal to the output (spaces aside) says so; a different one shows both", async () => {
    server(listed("open"), [trace("book"), trace("book")]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: WATCH }));
    const box = await screen.findByLabelText(/تنبّأ ثم تحقّق/);
    const compare = screen.getByRole("button", { name: "قارن توقّعي بالتنفيذ" }) as HTMLButtonElement;
    expect(compare.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "  " + finalOut.replace(/ /g, "   ") + "\n\n" } });
    fireEvent.click(compare);
    expect((await screen.findByText(/توقّعك يطابق ناتج البرنامج/)).textContent).toContain("✓");
    await waitFor(() => expect(counter()).toBe("الخطوة 1 / " + RUN.steps.length));
    fireEvent.click(screen.getByRole("button", { name: "توقّع من جديد" }));
    fireEvent.change(await screen.findByLabelText(/تنبّأ ثم تحقّق/), { target: { value: "2 4 6" } });
    fireEvent.click(screen.getByRole("button", { name: "قارن توقّعي بالتنفيذ" }));
    expect((await screen.findByText(/توقّعك يختلف عن ناتج البرنامج/))).toBeTruthy();
    expect(screen.getByRole("region", { name: "توقّعك" }).textContent).toBe("2 4 6");
    expect(screen.getByRole("region", { name: "ناتج البرنامج" }).textContent).toBe(finalOut);
  });

  it("«شاهد دون توقّع» goes straight to the steps; chosen values are said", async () => {
    server(listed("open"), [trace("book", { valuesFrom: "chosen" })]);
    show(access());
    fireEvent.click(await screen.findByRole("button", { name: WATCH }));
    fireEvent.click(await screen.findByRole("button", { name: "شاهد دون توقّع" }));
    await waitFor(() => expect(counter()).toBe("الخطوة 1 / " + RUN.steps.length));
    expect(screen.queryByText(/توقّعك/)).toBeNull();
    expect(screen.getByText(/قيم هذا التشغيل مقترحة/)).toBeTruthy();
  });
});
