// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readLabTrace, LAB_TRACE_LIMITS } from "./labTrace";
import { bookDeviceRunner, resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";
import { DS_LIMITS } from "../learning/activities/ds";
import CourseToolDock from "./CourseToolDock";
import StudentToolDock from "./StudentToolDock";
import type { CSharpToolRunner } from "./csharpToolRun";

// Visual lab V3 (docs/enterprise-csharp-visual-lab-plan.md §11) — «تشغيل مرئي» in the book's C# editor:
//   • the reader: the lab recorder's result → the course's own trace shape (readDsTrace), clipped to what the drawing holds and saying
//     so; anything unreadable → no trace, never a partial guess;
//   • the transport: a `trace` message to the SAME sandboxed lab frame, its answer read strictly;
//   • the editor: the button only when the runner can record; the steps drawn by the course's trace view; errors and limits said;
//   • who: the TEACHER's reader on a desktop (visualRun) — not a student's, not a phone.
// The recorder itself is proven in Chromium against all 219 traced programs of the course (tools/csharp-lab/golden.mjs).

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const desktop = (matches: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY ? matches : false, media: q, addEventListener() {}, removeEventListener() {} })));
beforeEach(() => desktop(true));

const SOURCE = "static void Main()\n{\n    Stack<int> s = new Stack<int>();\n    s.Push(1); s.Push(2);\n    Console.WriteLine(s);\n}";
const main = (vars: unknown[] = []) => [{ name: "Main", vars }];
const ref = { t: "ref", id: 7 };
const STEPS = [
  { line: 1, note: "تبدأ العملية `Main`.", frames: main(), objs: [], out: "" },
  { line: 3, note: "", frames: main([["s", ref]]), objs: [{ id: 7, k: "stack", items: [] }], out: "" },
  { line: 4, note: "", frames: main([["s", ref]]), objs: [{ id: 7, k: "stack", items: ["2", "1"] }], out: "" },
  { line: 5, note: "", frames: main([["s", ref]]), objs: [{ id: 7, k: "stack", items: ["2", "1"] }], out: "[2,1]\n" },
  { line: 6, note: "تنتهي العملية `Main`.", frames: main([["s", ref]]), objs: [{ id: 7, k: "stack", items: ["2", "1"] }], out: "[2,1]\n" },
];
const LAB = { status: "success", stdout: "[2,1]\n", stderr: "", compileMs: 300, runMs: 5, steps: STEPS };

describe("V3 — reading the recorder's result into the course's trace shape", () => {
  it("a recorded run → the course's DsTrace: the program's lines, every step, the structures and the output so far", () => {
    const r = readLabTrace(LAB, SOURCE, "");
    expect(r.status).toBe("success");
    expect(r.clipped).toBe(false);
    expect(r.trace!.lines).toEqual(SOURCE.split("\n"));
    expect(r.trace!.stdin).toBeUndefined();                                  // no input → no «المدخلات» line
    expect(r.trace!.steps.map(s => s.line)).toEqual([1, 3, 4, 5, 6]);
    expect(r.trace!.steps[2].objs).toEqual([{ id: 7, k: "stack", items: ["2", "1"] }]);
    expect(r.trace!.steps.map(s => s.out)).toEqual(["", "", "", "[2,1]\n", "[2,1]\n"]);
    expect(readLabTrace(LAB, SOURCE, "5\n").trace!.stdin).toBe("5\n");
  });

  it("what the drawing cannot hold is clipped AND said: long text, long structures, deep recursion, many variables, many objects", () => {
    const long = "x".repeat(200);
    const deep = Array.from({ length: 50 }, (_, i) => ({ name: "F" + i, vars: [["n", { t: "v", s: String(i) }]] }));
    const many = Array.from({ length: 35 }, (_, i) => ["v" + i, { t: "v", s: "1" }]);
    const objs = Array.from({ length: 90 }, (_, i) => ({ id: i + 1, k: "node", v: String(i), next: i + 2 <= 90 ? i + 2 : null }));
    const r = readLabTrace({ ...LAB, steps: [
      { line: 1, note: "", frames: main([["t", { t: "v", s: long }]]), objs: [{ id: 7, k: "queue", items: Array.from({ length: 60 }, (_, i) => String(i)) }], out: "" },
      { line: 2, note: "", frames: deep, objs: [], out: "" },
      { line: 3, note: "", frames: main(many), objs: [], out: "" },
      { line: 4, note: "", frames: main([["last", { t: "ref", id: 90 }], ["first", { t: "ref", id: 1 }]]), objs, out: "" },
    ] }, SOURCE, "");
    expect(r.clipped).toBe(true);
    const [a, b, c, d] = r.trace!.steps;
    expect((a.frames[0].vars[0][1] as { s: string }).s).toHaveLength(DS_LIMITS.text);
    expect((a.frames[0].vars[0][1] as { s: string }).s.endsWith("…")).toBe(true);
    expect((a.objs[0] as { items: string[] }).items).toHaveLength(DS_LIMITS.items);
    expect(b.frames).toHaveLength(DS_LIMITS.frames);
    expect(b.frames.at(-1)!.name).toBe("F49");                               // the newest frames are kept
    expect(c.frames[0].vars).toHaveLength(DS_LIMITS.vars);
    expect(d.objs).toHaveLength(DS_LIMITS.objs);
    expect(d.frames[0].vars[0]).toEqual(["last", { t: "v", s: "…" }]);       // a reference to a dropped object says «…»
    expect(d.frames[0].vars[1]).toEqual(["first", { t: "ref", id: 1 }]);
    expect(d.objs.at(-1)).toMatchObject({ id: 80, next: null });              // its link to a dropped cell ends the drawn chain
  });

  it("anything unreadable → no trace (never a partial guess); the status is kept, an unknown one is internal-error", () => {
    expect(readLabTrace({ ...LAB, steps: [] }, SOURCE, "").trace).toBeNull();
    expect(readLabTrace({ ...LAB, steps: [{ ...STEPS[0], line: 99 }] }, SOURCE, "").trace).toBeNull();          // a line past the program
    expect(readLabTrace({ ...LAB, steps: [STEPS[3], { ...STEPS[4], out: "other" }] }, SOURCE, "").trace).toBeNull();   // output not one story
    expect(readLabTrace({ ...LAB, steps: [{ ...STEPS[1], objs: [] }] }, SOURCE, "").trace).toBeNull();          // a reference to nothing
    expect(readLabTrace({ ...LAB, steps: Array.from({ length: LAB_TRACE_LIMITS.steps + 1 }, () => STEPS[0]) }, SOURCE, "").trace).toBeNull();
    expect(readLabTrace({ status: "compile-error", stdout: "", stderr: "Program.cs(3,1): error CS1002", steps: [] }, SOURCE, "")).toEqual(
      { status: "compile-error", stdout: "", stderr: "Program.cs(3,1): error CS1002", trace: null, clipped: false });
    expect(readLabTrace({ status: "weird", steps: STEPS }, SOURCE, "").status).toBe("internal-error");
    expect(readLabTrace(null, SOURCE, "").trace).toBeNull();
  });
});

// ── the editor ──
function fakeRunner(trace?: () => Promise<ReturnType<typeof readLabTrace>>) {
  const calls: [string, string][] = [];
  const runner: CSharpToolRunner = {
    where: "device", available: async () => true,
    run: async () => ({ status: "success", stdout: "", stderr: "" }),
    ...(trace ? { trace: async (s: string, i: string) => { calls.push([s, i]); return trace(); } } : {}),
  };
  return { runner, calls };
}
async function openEditor(runner: CSharpToolRunner) {
  render(<StudentToolDock studentTools={{ version: 1, tools: [{ id: "csharpEditor", allowRun: true }] }} csharpRunner={runner} />);
  fireEvent.click(screen.getByTestId("student-tools-button"));
  fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
  const panel = screen.getByRole("dialog", { name: "محرر C#" });
  await within(panel).findByTestId("csharp-editor-tool");
  return panel;
}

describe("V3 — «تشغيل مرئي» in the editor", () => {
  it("the button runs the recorder with the editor's code and input, and the course's trace view shows the steps", async () => {
    const { runner, calls } = fakeRunner(async () => readLabTrace(LAB, SOURCE, ""));
    const panel = await openEditor(runner);
    const button = await within(panel).findByRole("button", { name: "تشغيل مرئي" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    const view = await within(panel).findByTestId("csharp-trace", {}, { timeout: 5000 });
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("");
    expect(panel.textContent).toContain("سُجّل التنفيذ خطوة خطوة");
    expect(within(view).getByText("1 / 5")).toBeTruthy();
    fireEvent.click(within(view).getByRole("button", { name: "الخطوة التالية" }));
    fireEvent.click(within(view).getByRole("button", { name: "الخطوة التالية" }));
    expect(within(view).getByText("3 / 5")).toBeTruthy();
    expect(within(view).getByRole("region", { name: "مباني المعطيات" })).toBeTruthy();   // the stack is drawn
  });

  it("a compile error shows the compiler's message and no steps; a step-limit run says so and still shows its steps", async () => {
    let answer = readLabTrace({ status: "compile-error", stdout: "", stderr: "Program.cs(3,14): error CS1002: ; expected", steps: [] }, SOURCE, "");
    const { runner } = fakeRunner(async () => answer);
    const panel = await openEditor(runner);
    const button = await within(panel).findByRole("button", { name: "تشغيل مرئي" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(within(panel).getByTestId("csharp-errors").textContent).toContain("CS1002"));
    expect(within(panel).queryByTestId("csharp-trace")).toBeNull();
    expect(panel.textContent).toContain("خطأ ترجمة");
    answer = readLabTrace({ ...LAB, status: "step-limit" }, SOURCE, "");
    fireEvent.click(button);
    await within(panel).findByTestId("csharp-trace", {}, { timeout: 5000 });
    expect(panel.textContent).toContain("أطول من 5000 خطوة");
  });

  it("a runner that cannot record (a student's reader, the Runner) has no «تشغيل مرئي»", async () => {
    const panel = await openEditor(fakeRunner().runner);
    await within(panel).findByRole("button", { name: "تشغيل" });
    expect(within(panel).queryByRole("button", { name: "تشغيل مرئي" })).toBeNull();
  });
});

// ── who gets it, and the transport ──
const labFrame = () => document.querySelector<HTMLIFrameElement>('iframe[data-testid="teacher-csharp-lab"]');
const labWindow = () => {
  const f = labFrame()!;
  if (!(f as unknown as { __win?: unknown }).__win) {
    const win = { postMessage: vi.fn() };
    Object.defineProperty(f, "contentWindow", { value: win, configurable: true });
    (f as unknown as { __win?: unknown }).__win = win;
  }
  return f.contentWindow as unknown as { postMessage: ReturnType<typeof vi.fn> };
};
const fromLab = (data: unknown, over: { origin?: string } = {}) =>
  window.dispatchEvent(new MessageEvent("message", { data, origin: over.origin ?? "null", source: labWindow() as unknown as MessageEventSource }));
const stubLibrary = () => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, library: "public class Stack<T> { }", available: true }), { status: 200 })));

describe("V3 — the transport and who gets it", () => {
  it("only a `visual` runner can record; a trace is ONE `trace` message to the sandboxed lab, its answer read strictly", async () => {
    stubLibrary();
    expect(bookDeviceRunner("899271d", { Authorization: "Bearer S" }).trace).toBeUndefined();
    const r = bookDeviceRunner("899271d", { Authorization: "Bearer T" }, { visual: true });
    const pending = r.trace!(SOURCE, "");
    await waitFor(() => expect(labFrame()).toBeTruthy());
    expect(labFrame()!.getAttribute("sandbox")).toBe("allow-scripts");
    const post = labWindow().postMessage;
    fromLab({ type: "lab-ready" });
    await waitFor(() => expect(post).toHaveBeenCalled());
    const [msg] = post.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(msg).toMatchObject({ type: "trace", source: SOURCE, stdin: "", library: "public class Stack<T> { }", options: "{}" });
    expect(Object.keys(msg).sort()).toEqual(["id", "library", "options", "source", "stdin", "type"]);   // no session, no course id
    fromLab({ type: "result", id: msg.id, result: { ...LAB, stdout: "FORGED" } }, { origin: "https://evil.example" });   // not the lab
    fromLab({ type: "result", id: msg.id, result: LAB });
    const got = await pending;
    expect(got.stdout).toBe("[2,1]\n");
    expect(got.trace!.steps).toHaveLength(5);
  });

  it("the dock: the teacher's reader (visualRun) on a desktop records; a phone, or the student's reader, does not", async () => {
    stubLibrary();
    for (const [isDesktop, visual, expected] of [[true, true, true], [false, true, false], [true, false, false]] as const) {
      desktop(isDesktop);
      stubLibrary();
      render(<CourseToolDock courseId="899271d" runHeaders={{ Authorization: "Bearer X" }} visualRun={visual} />);
      fireEvent.click(await screen.findByTestId("student-tools-button"));
      fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "محرر C#" }));
      const panel = screen.getByRole("dialog", { name: "محرر C#" });
      await within(panel).findByRole("button", { name: "تشغيل" });
      expect({ isDesktop, visual, button: !!within(panel).queryByRole("button", { name: "تشغيل مرئي" }) }).toEqual({ isDesktop, visual, button: expected });
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
