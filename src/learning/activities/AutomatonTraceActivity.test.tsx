// @vitest-environment happy-dom
// AUTO-A1 — simulation/automaton-trace/v1 (AutomatonTraceActivity) through the real activity host: exact registry identity and lazy
// load; the diagram (states, accepting rings, the arrow used, the current state); typing a word, the symbol keys and the example
// chips; stepping to both ends; the verdict in words; a symbol outside the alphabet; the PDA stack and the TM tape; the
// transition table's current row; the shell's reset; an unreadable config.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import LearningActivityHost from "./LearningActivityHost";
import { productionActivityRegistry } from "./engine";
import type { SimulationBlock } from "../content/types";

afterEach(() => { cleanup(); });

const DFA = {
  kind: "DFA", states: ["q0", "q1", "q2"], alphabet: ["a", "b"], start: "q0", accept: ["q2"],
  transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q2"], ["q2", "a", "q1"], ["q2", "b", "q0"]],
  stateLabels: { q2: "تنتهي بـ ab" },
};
const PDA = {
  kind: "PDA", states: ["q0", "q1", "q2", "q3"], alphabet: ["a", "b"], start: "q0", accept: ["q0", "q2"],
  transitions: [
    { from: "q0", read: "a", top: "⏊", op: "push", write: "S", to: "q1" },
    { from: "q1", read: "a", top: "S", op: "push", write: "A", to: "q1" },
    { from: "q1", read: "a", top: "A", op: "push", write: "A", to: "q1" },
    { from: "q1", read: "b", top: "A", op: "pop", write: "A", to: "q3" },
    { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" },
    { from: "q3", read: "b", top: "A", op: "pop", write: "A", to: "q3" },
    { from: "q3", read: "b", top: "S", op: "pop", write: "S", to: "q2" },
  ],
};
const TM = {
  kind: "TM", states: ["q0", "q1"], alphabet: ["a"], start: "q0", accept: ["q1"],
  transitions: [{ from: "q0", read: "a", write: "A", move: "R", to: "q0" }, { from: "q0", read: "∆", write: "∆", move: "S", to: "q1" }],
};
const blockFor = (config: Record<string, unknown>, id = "fa"): SimulationBlock => ({
  id, type: "simulation", origin: "teacher-enrichment", simulationType: "automaton-trace", version: 1, title: "تتبّع الآلة خطوة بخطوة",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config,
});
const mount = async (b: SimulationBlock) => {
  const r = render(<LearningActivityHost block={b} courseId="AUTO" />);
  await waitFor(() => { if (!r.container.querySelector(".learning-automaton, .learning-automaton-empty")) throw new Error("not yet"); });
  return r;
};
const btn = (name: string) => screen.getByRole("button", { name });
const note = (c: HTMLElement) => c.querySelector(".learning-automaton-note")!.textContent!.trim();
const active = (c: HTMLElement) => [...c.querySelectorAll(".learning-automaton-state.is-active .learning-automaton-name")].map(n => n.textContent);
const usedLabels = (c: HTMLElement) => [...c.querySelectorAll(".learning-automaton-arrow.is-used .learning-automaton-label")].map(n => n.textContent);

describe("registry identity", () => {
  it("resolves simulation/automaton-trace/v1 only", () => {
    const b = blockFor({ automaton: DFA });
    expect(productionActivityRegistry.resolve(b)?.key).toBe("automaton-trace");
    expect(productionActivityRegistry.resolve({ ...b, version: 2 })).toBeUndefined();
    expect(productionActivityRegistry.resolve({ ...b, simulationType: "automaton" })).toBeUndefined();
  });
});

describe("a DFA run", () => {
  it("draws every state once, rings the accepting state, and shows its translated label", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab", "ba"] }));
    expect([...container.querySelectorAll(".learning-automaton-name")].map(n => n.textContent)).toEqual(["q0", "q1", "q2"]);
    expect(container.querySelectorAll(".learning-automaton-ring")).toHaveLength(1);
    expect(container.querySelector(".learning-automaton-state.is-accept .learning-automaton-name")!.textContent).toBe("q2");
    expect(container.querySelector(".learning-automaton-statelabel")!.textContent).toBe("تنتهي بـ ab");
    expect(container.querySelector("svg")!.getAttribute("aria-label")).toContain("البداية q0؛ القبول q2");
  });
  it("starts on the first example word, steps one symbol at a time, and gives the verdict in words at the end", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab", "ba"] }));
    expect(active(container)).toEqual(["q0"]);
    expect(note(container)).toBe("نبدأ من حالة البداية q0.");
    expect(btn("الخطوة السابقة")).toHaveProperty("disabled", true);
    expect(container.querySelector(".learning-automaton-verdict")).toBeNull();
    fireEvent.click(btn("الخطوة التالية"));
    expect(active(container)).toEqual(["q1"]);
    expect(usedLabels(container)).toEqual(["a"]);
    expect(container.querySelectorAll(".learning-automaton-sym.is-read")).toHaveLength(1);
    fireEvent.click(btn("الخطوة التالية"));
    fireEvent.click(btn("الخطوة التالية"));
    expect(active(container)).toEqual(["q2"]);
    expect(usedLabels(container)).toEqual(["b"]);
    fireEvent.click(btn("الخطوة التالية"));
    expect(btn("الخطوة التالية")).toHaveProperty("disabled", true);
    expect(note(container)).toBe("انتهت الكلمة في q2، وهي حالة قبول: الكلمة aab مقبولة.");
    expect(container.querySelector(".learning-automaton-verdict")!.textContent).toBe("✓ الكلمة مقبولة");
    fireEvent.click(btn("البداية"));
    expect(active(container)).toEqual(["q0"]);
  });
  it("an example chip runs its word; «النهاية» jumps to the verdict", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab", "ba"] }));
    fireEvent.click(btn("ba"));
    expect(btn("ba").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn("النهاية"));
    expect(container.querySelector(".learning-automaton-verdict")!.textContent).toBe("✗ الكلمة مرفوضة");
    expect(screen.getByText("4 / 4")).toBeTruthy();   // start, b, a, the verdict
  });
  it("the learner types a word or builds it with the symbol keys, then runs it", async () => {
    const { container } = await mount(blockFor({ automaton: DFA }));
    expect(container.querySelector(".learning-automaton-sym.is-empty")!.textContent).toBe("ε");   // no example word → ε
    fireEvent.click(btn("أضف b"));
    fireEvent.click(btn("أضف a"));
    fireEvent.click(btn("أضف b"));
    fireEvent.click(btn("احذف آخر رمز"));
    fireEvent.click(btn("أضف b"));
    const input = screen.getByRole("textbox", { name: "الكلمة" }) as HTMLInputElement;
    expect(input.value).toBe("bab");
    fireEvent.click(btn("شغّل"));
    expect(container.querySelectorAll(".learning-automaton-sym")).toHaveLength(3);
    fireEvent.click(btn("النهاية"));
    expect(container.querySelector(".learning-automaton-verdict")!.textContent).toBe("✓ الكلمة مقبولة");
    fireEvent.change(input, { target: { value: "a b" } });
    fireEvent.submit(input.closest("form")!);
    expect(container.querySelectorAll(".learning-automaton-sym")).toHaveLength(2);    // spaces are ignored
  });
  it("refuses a symbol outside the alphabet with a message and keeps the previous run", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab"] }));
    const input = screen.getByRole("textbox", { name: "الكلمة" });
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(btn("شغّل"));
    expect(screen.getByRole("alert").textContent).toBe("الرمز c ليس من الأبجدية {a, b}.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelectorAll(".learning-automaton-sym")).toHaveLength(3);    // still aab
  });
  it("marks the current row of the transition table", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab"] }));
    fireEvent.click(btn("الخطوة التالية"));
    const rows = [...container.querySelectorAll(".learning-automaton-table tbody tr")];
    const now = rows.filter(r => r.getAttribute("aria-current") === "step");
    expect(now).toHaveLength(1);
    expect([...now[0].querySelectorAll("td")].map(t => t.textContent)).toEqual(["q0", "a", "q1"]);
  });
  it("the shell's reset returns to the block's first word and step", async () => {
    const { container } = await mount(blockFor({ automaton: DFA, words: ["aab", "ba"] }));
    fireEvent.click(btn("ba"));
    fireEvent.click(btn("الخطوة التالية"));
    fireEvent.click(btn("إعادة تعيين"));
    expect(btn("aab").getAttribute("aria-pressed")).toBe("true");
    expect(active(container)).toEqual(["q0"]);
  });
});

describe("a PDA run shows the stack", () => {
  it("pushes and pops as the course's PDA-simulation deck shows, top first", async () => {
    const { container } = await mount(blockFor({ automaton: PDA, words: ["aabb"] }, "pda"));
    const stack = () => [...container.querySelectorAll(".learning-automaton-stackcell")].map(c => c.firstChild!.textContent);
    expect(stack()).toEqual(["⏊"]);
    fireEvent.click(btn("الخطوة التالية"));
    fireEvent.click(btn("الخطوة التالية"));
    expect(stack()).toEqual(["A", "S", "⏊"]);
    expect(within(container.querySelector(".learning-automaton-stack") as HTMLElement).getByText("القمة")).toBeTruthy();
    expect(note(container)).toBe("نقرأ a وفي القمة S: ندفع A إلى المكدّس، وننتقل من q1 إلى q1.");
    fireEvent.click(btn("الخطوة التالية"));
    expect(stack()).toEqual(["S", "⏊"]);
    expect(usedLabels(container)[0]).toBe("اسحب b,A/A");
    fireEvent.click(btn("النهاية"));
    expect(container.querySelector(".learning-automaton-verdict")!.textContent).toBe("✓ الكلمة مقبولة");
  });
});

describe("a Turing machine run shows the tape and the head", () => {
  it("writes on the tape and moves the head", async () => {
    const { container } = await mount(blockFor({ automaton: TM, words: ["aa"] }, "tm"));
    const tape = () => [...container.querySelectorAll(".learning-automaton-tapecell")].map(c => c.textContent).join("");
    const head = () => container.querySelector(".learning-automaton-tapecell.is-head")!.textContent;
    expect(container.querySelector(".learning-automaton-word")).toBeNull();
    expect(tape()).toBe("∆aa∆");
    expect(head()).toBe("a");
    fireEvent.click(btn("الخطوة التالية"));
    expect(tape()).toBe("∆Aa∆");
    fireEvent.click(btn("النهاية"));
    expect(tape()).toBe("∆AA∆∆");   // the head stopped on the blank after the word, one spare blank shown past it
    expect(head()).toBe("∆");
    expect(container.querySelector(".learning-automaton-verdict")!.textContent).toBe("✓ الكلمة مقبولة");
  });
});

describe("an unreadable config", () => {
  it("says the activity is unavailable instead of guessing", async () => {
    const { container } = await mount(blockFor({ automaton: { ...DFA, start: "q9" } }, "bad"));
    expect(container.querySelector(".learning-automaton-empty")!.textContent).toBe("هذا النشاط التفاعلي غير متوفر حاليًا.");
    expect(container.querySelector("svg.learning-automaton-svg")).toBeNull();
  });
});
