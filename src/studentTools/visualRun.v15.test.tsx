// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { readLabTrace, type LabTraceResult } from "./labTrace";
import LabTraceView from "./LabTraceView";
import CSharpEditorTool from "./CSharpEditorTool";
import DsTraceView from "../learning/activities/DsTraceView";
import type { CSharpToolRunner } from "./csharpToolRun";
import type { DsTrace } from "../learning/activities/ds";
import { conditionOf, fillValues, runtimeErrorOf, traceKey, traceTable, traceTableText } from "./traceInsights";
import { resetDeviceLabForTests, DESKTOP_QUERY } from "./deviceCSharpLab";

// Visual lab V15 (docs/enterprise-csharp-visual-lab-plan.md §25) — the player made for long programs:
//   • the editor: «تشغيل مرئي» folds the program to one line (opened again by it, the text kept), the run buttons and the player's
//     navigation in ONE sticky strip; a program changed after it was recorded is said, with «أعد التشغيل المرئي»;
//   • the keyboard (← next, → previous — RTL —, Home / End, space), never taken from an input;
//   • the condition with the step's values and its result; a changed value's former value; what the step printed; a run-time error
//     explained (which index, which range); «جدول التتبّع» built up to the step shown, a row a way back to its step, copied as text.
// Everything is read from the recorded steps: what cannot be read with certainty is left out, never guessed.

afterEach(() => { cleanup(); resetDeviceLabForTests(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q === DESKTOP_QUERY, media: q, addEventListener() {}, removeEventListener() {} }))));

// the owner's example: how many even numbers an array of 6 holds
const SOURCE = [
  "using System;", "", "class Program", "{", "    static void Main()", "    {",
  "        int[] arr = { 4, 7, 10, 3, 8, 15 };", "        int count = 0;", "",
  "        for (int i = 0; i < arr.Length; i++)", "        {", "            if (arr[i] % 2 == 0)", "            {",
  "                count++;", "            }", "        }", "", "        Console.WriteLine(\"count: \" + count);", "    }", "}",
].join("\n");
const v = (s: string) => ({ t: "v", s });
const ARR = { id: 1, k: "array", type: "int[]", items: ["4", "7", "10", "3", "8", "15"] };
const main = (vars: unknown[]) => [{ name: "Main", vars, types: vars.map(() => null) }];
const vars = (i: string | null, count: string) => [["arr", { t: "ref", id: 1 }], ["count", v(count)], ...(i === null ? [] : [["i", v(i)]])];
const STEPS = [
  { line: 5, note: "تبدأ العملية `Main`.", frames: main([]), objs: [], out: "" },
  { line: 7, note: "", frames: main([["arr", { t: "ref", id: 1 }]]), objs: [ARR], out: "" },
  { line: 8, note: "", frames: main(vars(null, "0")), objs: [ARR], out: "" },
  { line: 10, note: "الشرط `i < arr.Length` صحيح.", frames: main(vars("0", "0")), objs: [ARR], out: "" },
  { line: 12, note: "الشرط `arr[i] % 2 == 0` صحيح.", frames: main(vars("0", "0")), objs: [ARR], out: "", evals: [["arr[i] % 2", "0"], ["arr[i] % 2 == 0", "true"]] },
  { line: 14, note: "", frames: main(vars("0", "1")), objs: [ARR], out: "" },
  { line: 10, note: "الشرط `i < arr.Length` صحيح.", frames: main(vars("1", "1")), objs: [ARR], out: "" },
  { line: 12, note: "الشرط `arr[i] % 2 == 0` غير صحيح.", frames: main(vars("1", "1")), objs: [ARR], out: "" },
  { line: 18, note: "", frames: main(vars(null, "1")), objs: [ARR], out: "count: 1\n" },
  { line: 19, note: "تنتهي العملية `Main`.", frames: main(vars(null, "1")), objs: [ARR], out: "count: 1\n" },
];
const LAB = { status: "success", stdout: "count: 1\n", stderr: "", steps: STEPS, pointers: [["arr", "i"]] };
const read = (raw: unknown = LAB) => readLabTrace(raw, SOURCE, "");
const TRACE = read().trace as DsTrace;

describe("V15 — read from the steps, never guessed", () => {
  it("the condition with this step's values and its result (a[i], a.Length, a plain variable)", () => {
    expect(TRACE).not.toBeNull();
    expect(conditionOf(TRACE.steps[3])).toEqual({ text: "i < arr.Length", value: true, withValues: "0 < 6" });
    expect(conditionOf(TRACE.steps[4])).toEqual({ text: "arr[i] % 2 == 0", value: true, withValues: "4 % 2 == 0" });
    expect(conditionOf(TRACE.steps[7])).toEqual({ text: "arr[i] % 2 == 0", value: false, withValues: "7 % 2 == 0" });
    expect(conditionOf(TRACE.steps[5])).toBeNull();                       // not a condition step
  });

  it("a name it cannot read with certainty → no «بالقيم» at all; strings, members and methods are left as written; one pass", () => {
    const f = (vs: [string, unknown][]) => ({ name: "Main", vars: vs as DsTrace["steps"][0]["frames"][0]["vars"] });
    expect(fillValues("k > 0 && p != null", f([["k", v("3")], ["p", { t: "ref", id: 9 }]]), [])).toBeNull();          // a reference
    expect(fillValues("a[i] > 0", f([["a", { t: "ref", id: 1 }], ["i", v("9")]]), [ARR as never])).toBeNull();          // outside the array
    // a method the trace knows nothing about stays as written, its arguments read (V17 computes Math.Abs / Max / Min: visualRun.v17)
    expect(fillValues("s == \"k\" && Check(k) > x.k", f([["k", v("3")], ["s", v("\"k\"")]]), [])).toBe("\"k\" == \"k\" && Check(3) > x.k");
    // a value put in is never read again as a name (a cell «x» while a variable x exists)
    const names = { id: 2, k: "array", type: "string[]", items: ["x", "y"] };
    expect(fillValues("n[j] == x", f([["n", { t: "ref", id: 2 }], ["j", v("0")], ["x", v("\"y\"")]]), [names as never])).toBe("\"x\" == \"y\"");
    expect(conditionOf({ ...TRACE.steps[3], note: "ننفّذ السطر." })).toBeNull();
  });

  it("a run-time error in Arabic; an index outside the array names the index and the range", () => {
    const err = { ...TRACE.steps[6], line: 12, error: true, frames: [{ name: "Main", vars: [["arr", { t: "ref", id: 1 }], ["count", v("3")], ["i", v("6")]] as never }] };
    expect(runtimeErrorOf("System.IndexOutOfRangeException: Index was outside the bounds of the array.\n   at Program.Main()", err, TRACE.lines))
      .toBe("الفهرس خارج حدود المصفوفة. i = 6، والفهارس المسموحة في arr هي 0–5.");
    expect(runtimeErrorOf("System.DivideByZeroException: Attempted to divide by zero.", err, TRACE.lines)).toBe("قسمة على صفر.");
    expect(runtimeErrorOf("System.Weird.OddException: x", err, TRACE.lines)).toBe("حدث استثناء OddException.");
    expect(runtimeErrorOf("System.DivideByZeroException", TRACE.steps[6], TRACE.lines)).toBeNull();   // not the error step
  });

  it("«جدول التتبّع»: the variables then a[i]; a row where a value changed, a condition was tested or something printed; up to the step", () => {
    const t = traceTable(TRACE, TRACE.steps.length - 1);
    expect(t.columns).toEqual(["count", "i", "arr[i]"]);
    expect(t.rows.map(r => r.step)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(t.rows[2]).toMatchObject({ step: 4, cells: ["0", "0", "4"], test: { value: true, withValues: "4 % 2 == 0" } });
    expect(t.rows[3]).toMatchObject({ step: 5, cells: ["1", "0", "4"], changed: [true, false, false] });
    expect(t.rows[6]).toMatchObject({ step: 8, printed: "count: 1\n" });
    expect(traceTable(TRACE, 4).rows.map(r => r.step)).toEqual([2, 3, 4]);       // built up to the step shown
    expect(traceTableText(traceTable(TRACE, 4)).split("\n")).toEqual([
      "الخطوة\tالسطر\tcount\ti\tarr[i]\tالشرط\tالناتج", "3\t8\t0\t\t\t\t", "4\t10\t0\t0\t4\ti < arr.Length → true\t", "5\t12\t0\t0\t4\tarr[i] % 2 == 0 → true\t"]);
  });

  it("the keys: ← next and → previous (RTL), Home / End, space — never with a modifier, inside an input, or space on a button", () => {
    const k = (key: string, extra: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, ...extra });
    const body = document.body, input = document.createElement("textarea"), button = document.createElement("button");
    expect(traceKey(k("ArrowLeft"), body)).toBe("next");
    expect(traceKey(k("ArrowRight"), body)).toBe("prev");
    expect(traceKey(k("Home"), button)).toBe("first");
    expect(traceKey(k("End"), body)).toBe("last");
    expect(traceKey(k(" "), body)).toBe("play");
    expect(traceKey(k(" "), button)).toBeNull();
    expect(traceKey(k("ArrowLeft"), input)).toBeNull();
    expect(traceKey(k("ArrowLeft", { ctrlKey: true }), body)).toBeNull();
    expect(traceKey(k("a"), body)).toBeNull();
  });
});

describe("V15 — the player", () => {
  const counter = () => within(screen.getByTestId("lab-trace-nav")).getByText(/\d+ \/ 10/).textContent;

  it("the keyboard moves the steps from the page; not from an input of the page", () => {
    render(<><textarea aria-label="other" /><LabTraceView trace={TRACE} epoch={1} /></>);
    expect(counter()).toBe("1 / 10");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(counter()).toBe("3 / 10");
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(counter()).toBe("2 / 10");
    fireEvent.keyDown(document.body, { key: "End" });
    expect(counter()).toBe("10 / 10");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "other" }), { key: "Home" });
    expect(counter()).toBe("10 / 10");
    fireEvent.keyDown(document.body, { key: "Home" });
    expect(counter()).toBe("1 / 10");
  });

  it("the condition with its values; a changed value's former one; what this step printed is marked", () => {
    render(<LabTraceView trace={TRACE} epoch={1} />);
    for (let i = 0; i < 4; i++) fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    const test = screen.getByTestId("lab-trace-test");
    expect(test.textContent).toContain("arr[i] % 2 == 0");
    expect(test.textContent).toContain("4 % 2 == 0");
    expect(test.textContent).toContain("صحيح ✓");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });                 // count++ : 0 → 1
    expect(screen.queryByTestId("lab-trace-test")).toBeNull();
    expect(screen.getByTestId("lab-var-was").textContent).toBe("كانت 0");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(screen.getByTestId("lab-trace-test").textContent).toContain("غير صحيح ✗");
    expect(screen.queryByTestId("lab-trace-printed")).toBeNull();
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });                 // the WriteLine
    expect(screen.getByTestId("lab-trace-printed").textContent).toBe("count: 1\n");
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });                 // nothing new printed
    expect(screen.queryByTestId("lab-trace-printed")).toBeNull();
  });

  it("the error step: the line marked and the error explained", () => {
    const steps = [...STEPS.slice(0, 7), { ...STEPS[6], line: 12, note: "خطأ في التشغيل: البرنامج يتوقّف هنا.", error: true, frames: main(vars("6", "3")) }];
    const r = read({ ...LAB, status: "runtime-error", steps });
    render(<LabTraceView trace={r.trace!} epoch={1} stderr={"System.IndexOutOfRangeException: Index was outside the bounds of the array."} />);
    expect(screen.queryByTestId("lab-trace-error")).toBeNull();
    fireEvent.keyDown(document.body, { key: "End" });
    expect(screen.getByTestId("lab-trace-error").textContent).toContain("i = 6، والفهارس المسموحة في arr هي 0–5");
    expect(document.querySelector(".learning-trace-line.is-current.is-error")).not.toBeNull();
  });

  it("«جدول التتبّع»: grows with the steps, a row takes you back to its step, copied as a table", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<LabTraceView trace={TRACE} epoch={1} />);
    expect(screen.queryByTestId("lab-trace-table")).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "جدول التتبّع" }));
    const rows = () => within(screen.getByTestId("lab-trace-table")).getAllByRole("row").length - 1;
    expect(rows()).toBe(0);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(rows()).toBe(4);
    fireEvent.click(screen.getByRole("button", { name: "انتقل إلى الخطوة 4" }));
    expect(counter()).toBe("4 / 10");
    expect(rows()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "نسخ الجدول" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect((writeText.mock.calls[0] as unknown as [string])[0].split("\n")).toHaveLength(3);
  });

  it("the course's own trace view (no `explain`) shows none of it", () => {
    render(<DsTraceView cfg={TRACE} epoch={1} at={4} controls={false} />);
    expect(screen.queryByTestId("lab-trace-test")).toBeNull();
    render(<DsTraceView cfg={TRACE} epoch={1} at={8} controls={false} />);
    expect(screen.queryByTestId("lab-trace-printed")).toBeNull();
    expect(screen.queryByTestId("lab-var-was")).toBeNull();
  });
});

describe("V15 — the editor: the program folds, the strip stays on top", () => {
  function runner(answer: () => LabTraceResult) {
    const calls: string[] = [];
    const r: CSharpToolRunner = { where: "device", available: async () => true, run: async () => ({ status: "success", stdout: "", stderr: "" }),
      trace: async (s: string) => { calls.push(s); return answer(); } };
    return { r, calls };
  }
  const program = () => screen.getByTestId("csharp-editor-program");

  it("«تشغيل مرئي» folds the program; «▸ البرنامج» opens it; the navigation is in the sticky strip with the run buttons", async () => {
    const { r } = runner(() => read());
    render(<CSharpEditorTool runner={r} />);
    expect(screen.queryByTestId("csharp-editor-fold")).toBeNull();
    const visual = await screen.findByRole("button", { name: "تشغيل مرئي" });
    await waitFor(() => expect((visual as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(visual);
    await screen.findByTestId("csharp-trace", {}, { timeout: 5000 });
    const strip = screen.getByTestId("csharp-run-strip");
    expect(strip.className).toContain("is-sticky");
    expect(within(strip).getByRole("button", { name: "تشغيل" })).toBeTruthy();
    await waitFor(() => expect(within(strip).getByTestId("lab-trace-nav")).toBeTruthy());
    expect((program() as HTMLElement).hidden).toBe(true);
    const fold = screen.getByTestId("csharp-editor-fold");
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(fold.textContent).toContain("البرنامج (10 سطرًا)");
    fireEvent.click(fold);
    expect((program() as HTMLElement).hidden).toBe(false);
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "مسح الناتج" }));   // no steps → the program is simply there, no fold
    expect(screen.queryByTestId("csharp-editor-fold")).toBeNull();
    expect((program() as HTMLElement).hidden).toBe(false);
    expect(screen.getByTestId("csharp-run-strip").className).not.toContain("is-sticky");
  });

  it("a compile error keeps the program open; a program changed after recording is said, and «أعد التشغيل المرئي» records it again", async () => {
    let answer = readLabTrace({ status: "compile-error", stdout: "", stderr: "Program.cs(3,1): error CS1002", steps: [] }, SOURCE, "");
    const { r, calls } = runner(() => answer);
    render(<CSharpEditorTool runner={r} />);
    const visual = await screen.findByRole("button", { name: "تشغيل مرئي" });
    await waitFor(() => expect((visual as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(visual);
    await screen.findByTestId("csharp-errors");
    expect((program() as HTMLElement).hidden).toBe(false);
    answer = read();
    fireEvent.click(visual);
    await screen.findByTestId("csharp-trace", {}, { timeout: 5000 });
    expect(screen.queryByTestId("lab-trace-stale")).toBeNull();
    fireEvent.click(screen.getByTestId("csharp-editor-fold"));
    fireEvent.change(within(program()).getByRole("textbox"), { target: { value: "class P { static void Main() {} }" } });
    const stale = await screen.findByTestId("lab-trace-stale");
    fireEvent.click(within(stale).getByRole("button", { name: "أعد التشغيل المرئي" }));
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toBe("class P { static void Main() {} }");
  });
});
