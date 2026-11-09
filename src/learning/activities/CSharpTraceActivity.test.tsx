// @vitest-environment happy-dom
// 899371 P6 — simulation/csharp-trace/v1 (CSharpTraceActivity): exact identity, lazy load through the host, and the step-through on
// REAL recorded traces (src/learning/content/899371/traces/runs.json): the current line, memory boxes and what changed, arrays as
// numbered cells, a matrix as a grid, a string as its letters, the call stack (running method on top), references and objects,
// evaluated expressions, the output so far and the input; «السابق» / «التالي» at the ends; the shell reset; an unreadable config.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import { readTraceConfig } from "./csharpTrace";
import type { SimulationBlock } from "../content/types";
import runsFile from "../content/899371/traces/runs.json";
import m05 from "../content/899371/guided/m05.json";
import m06 from "../content/899371/guided/m06.json";
import m07 from "../content/899371/guided/m07.json";
import m08 from "../content/899371/guided/m08.json";
import m09 from "../content/899371/guided/m09.json";
import m10 from "../content/899371/guided/m10.json";
import m11 from "../content/899371/guided/m11.json";

afterEach(() => { cleanup(); });
const runs = runsFile.runs as Record<string, { steps: unknown[] }>;
const blockFor = (program: string, key: string, stdin?: string): SimulationBlock => ({
  id: "t-" + key, type: "simulation", origin: "teacher-enrichment", simulationType: "csharp-trace", version: 1, title: "تتبّع البرنامج خطوة خطوة",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config: { code: program, ...(stdin ? { stdin } : {}), steps: runs[key].steps },
});
const mount = async (b: SimulationBlock) => {
  const r = render(<LearningActivityHost block={b} courseId="899371" />);
  await waitFor(() => { if (!r.container.querySelector(".learning-trace")) throw new Error("not yet"); });
  return r;
};
const next = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة التالية" }));
const prev = () => fireEvent.click(screen.getByRole("button", { name: "الخطوة السابقة" }));
const current = (c: HTMLElement) => [...c.querySelectorAll(".learning-trace-line")].findIndex(l => l.getAttribute("aria-current") === "step") + 1;
const note = (c: HTMLElement) => c.querySelector(".learning-trace-note")!.textContent!.replace(/\s+/g, " ").trim();
const varBox = (c: HTMLElement, name: string) => [...c.querySelectorAll(".learning-trace-frame.is-top .learning-trace-var")].find(v => v.querySelector(".learning-trace-name")?.textContent === name) as HTMLElement | undefined;

describe("registry identity", () => {
  it("resolves simulation/csharp-trace/v1 only", () => {
    const b = blockFor(m05.walkthroughs[3].program, "m05/g04");
    expect(productionActivityRegistry.resolve(b)?.key).toBe("csharp-trace");
    expect(productionActivityRegistry.resolve({ ...b, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...b, simulationType: "trace" })).toBeUndefined();
  });
});

describe("stepping through a recorded trace", () => {
  it("starts at the first step, moves one step at a time, and the buttons stop at both ends", async () => {
    const { container } = await mount(blockFor(m05.walkthroughs[3].program, "m05/g04"));
    const total = runs["m05/g04"].steps.length;
    expect(container.querySelector(".learning-trace-counter")!.textContent).toContain("1 / " + total);
    expect(current(container)).toBe(1);
    expect((screen.getByRole("button", { name: "الخطوة السابقة" }) as HTMLButtonElement).disabled).toBe(true);
    next();
    expect(current(container)).toBe(3);   // the first loop step: is 12 % 1 zero?
    expect(container.querySelector(".learning-trace-counter")!.textContent).toContain("2 / " + total);
    prev();
    expect(current(container)).toBe(1);
    for (let i = 0; i < total + 3; i++) next();
    expect(container.querySelector(".learning-trace-counter")!.textContent).toContain(total + " / " + total);
    expect((screen.getByRole("button", { name: "الخطوة التالية" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".learning-trace-out")!.textContent).toBe("6\n");
  });

  it("marks what changed, and shows each evaluated expression for its step only", async () => {
    const { container } = await mount(blockFor(m05.walkthroughs[3].program, "m05/g04"));
    next();   // i = 1, 12 % 1 → 0
    expect(varBox(container, "i")!.className).toContain("is-changed");
    expect(container.querySelector(".learning-trace-evals")!.textContent).toContain("12 % i");
    next();   // count++ → 1
    expect(varBox(container, "count")!.className).toContain("is-changed");
    expect(varBox(container, "count")!.textContent).toContain("1");
    expect(varBox(container, "i")!.className).not.toContain("is-changed");
    expect(container.querySelector(".learning-trace-evals")).toBeNull();
  });

  it("the shell reset returns to the first step", async () => {
    const { container } = await mount(blockFor(m05.walkthroughs[3].program, "m05/g04"));
    next(); next(); next();
    fireEvent.click(screen.getByRole("button", { name: "إعادة تعيين" }));
    expect(container.querySelector(".learning-trace-counter")!.textContent).toContain("1 / ");
    expect(current(container)).toBe(1);
  });
});

describe("the nine views on real traces", () => {
  it("arrays as numbered cells (the counter array of chapter 9)", async () => {
    const { container } = await mount(blockFor(m09.walkthroughs[0].program, "m09/g01"));
    next();
    const cells = [...varBox(container, "count")!.querySelectorAll(".learning-trace-cell")].map(c => c.textContent);
    expect(cells).toEqual(["0", "0", "0", "0"]);
    expect([...varBox(container, "count")!.querySelectorAll(".learning-trace-idx")].map(c => c.textContent)).toEqual(["0", "1", "2", "3"]);
    for (let i = 0; i < 6; i++) next();
    expect([...varBox(container, "count")!.querySelectorAll(".learning-trace-cell")].map(c => c.textContent)).toEqual(["0", "2", "3", "1"]);
  });

  it("a two-dimensional array as a grid (chapter 10)", async () => {
    const { container } = await mount(blockFor(m10.walkthroughs[1].program, "m10/g02"));
    const grid = varBox(container, "m")!.querySelector("table.learning-trace-matrix")!;
    expect([...grid.querySelectorAll("tbody tr")].map(r => [...r.querySelectorAll("td")].map(td => td.textContent))).toEqual([["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]]);
  });

  it("a string as its letters with indexes (chapter 8)", async () => {
    const { container } = await mount(blockFor(m08.walkthroughs[0].program, "m08/g01"));
    expect([...varBox(container, "s")!.querySelectorAll(".learning-trace-cell")].map(c => c.textContent)).toEqual(["A", "B", "Z"]);
    expect(varBox(container, "s")!.querySelector("[role=group]")!.getAttribute("aria-label")).toBe("s: \"ABZ\"");
  });

  it("the call stack: the running method on top, then back to its caller (chapter 7)", async () => {
    const { container } = await mount(blockFor(m07.walkthroughs[2].program, "m07/g03"));
    const stack = () => [...container.querySelectorAll(".learning-trace-frame .learning-trace-framename")].map(f => f.textContent!.replace(/\s+/g, " ").trim());
    expect(stack()).toEqual(["Main"]);
    next(); next();
    expect(stack()).toEqual(["G — تعمل الآن", "F", "Main"]);
    next();
    expect(stack()).toEqual(["F — تعمل الآن", "Main"]);
  });

  it("references and objects: two variables, one object (chapter 11)", async () => {
    const { container } = await mount(blockFor(m11.walkthroughs[3].program, "m11/g04"));
    for (let i = 0; i < 5; i++) next();
    expect(varBox(container, "a")!.textContent).toContain("→ #1");
    expect(varBox(container, "b")!.textContent).toContain("→ #1");
    expect(varBox(container, "c")!.textContent).toContain("→ #2");
    const objects = [...container.querySelectorAll(".learning-trace-object")].map(o => [o.querySelector(".learning-trace-framename")!.textContent,
      ...[...o.querySelectorAll(".learning-trace-var")].map(v => v.querySelector(".learning-trace-name")!.textContent + " = " + v.querySelector(".learning-trace-box")!.textContent)]);
    expect(objects).toEqual([["#1 Counter", "n = 2"], ["#2 Counter", "n = 1"]]);
  });

  it("an array of references: null until new (chapter 11)", async () => {
    const { container } = await mount(blockFor(m11.walkthroughs[1].program, "m11/g02"));
    expect([...varBox(container, "shelf")!.querySelectorAll(".learning-trace-cell")].map(c => c.textContent)).toEqual(["null", "null"]);
    next();
    expect([...varBox(container, "shelf")!.querySelectorAll(".learning-trace-cell")].map(c => c.textContent)).toEqual(["→ #1", "null"]);
  });

  it("the input and the output so far (chapter 6, the initial-value trap)", async () => {
    const w = m06.walkthroughs[0];
    const { container } = await mount(blockFor(w.program, "m06/g01", w.stdin));
    expect(container.querySelector(".learning-trace-stdin")!.textContent).toContain("5 3 8 0");
    expect(container.querySelector(".learning-trace-out")!.textContent!.trim()).toBe("");
    expect(note(container)).toContain("السطر 1");
    for (let i = 0; i < 20; i++) next();
    expect(container.querySelector(".learning-trace-out")!.textContent).toBe("0\n");
  });
});

describe("an unreadable config never guesses", () => {
  it("refuses a step outside the program, a missing frame, a bad value and too many steps", () => {
    const steps = runs["m05/g04"].steps as Record<string, unknown>[];
    const code = m05.walkthroughs[3].program;
    expect(readTraceConfig({ code, steps })).not.toBeNull();
    expect(readTraceConfig({ code, steps: [{ ...steps[0], line: 99 }] })).toBeNull();
    expect(readTraceConfig({ code, steps: [{ ...steps[0], frames: [] }] })).toBeNull();
    expect(readTraceConfig({ code, steps: [{ ...steps[0], frames: [{ name: "Main", vars: [["x", { t: "html", s: "<b>" }]] }] }] })).toBeNull();
    expect(readTraceConfig({ code, steps: Array(201).fill(steps[0]) })).toBeNull();
    expect(readTraceConfig({ code: "", steps })).toBeNull();
  });
  it("shows a short note instead of the tracer", async () => {
    const b = { ...blockFor(m05.walkthroughs[3].program, "m05/g04"), config: { code: "x", steps: [] } };
    const r = render(<LearningActivityHost block={b} courseId="899371" />);
    await waitFor(() => { if (!r.container.querySelector(".learning-trace-empty")) throw new Error("not yet"); });
    expect(r.container.querySelector(".learning-trace-empty")!.textContent).toContain("غير متوفر");
  });
});
