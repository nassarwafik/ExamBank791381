// @vitest-environment happy-dom
// AUTO-A3 — simulation/automaton-design/v1 («صمّم الآلة», AutomatonDesignActivity): the task statement and its rules; building a
// machine (states, start, accepting states, the transition table: one choice per cell for a DFA, any set of states and ε for an
// NFA); the live drawing; «جرّب كلمة» on the learner's OWN machine; «تحقّق من الآلة» through the host's `check` seam with exactly
// the machine (nothing else); the server's verdict in words (right, a broken public rule, the separating word); a new edit clears
// the verdict; a failed check says «تعذّر التحقق» (never a wrong answer); no seam → no check button; the shell's reset; an
// unreadable task; and through the real activity host and the page renderer's served-only seam.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import AutomatonDesignActivity from "./AutomatonDesignActivity";
import LearningActivityHost from "./LearningActivityHost";
import type { ActivityCheck, ActivityCheckResult } from "./engine";
import type { SimulationBlock } from "../content/types";
import { servedBlock } from "../study/checkIndex";
import { readDesignTask, issueText } from "./automatonDesign";

afterEach(() => { cleanup(); });

const DFA_TASK = { intro: "صمّم أوتومات حتميًا كاملًا للكلمات التي تنتهي بـ 1.", machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true, examples: { accept: ["1", "01"], reject: ["", "10"] } };
const NFA_TASK = { intro: "صمّم أوتومات غير حتمي للكلمات التي تنتهي بـ ab.", machine: "NFA", alphabet: ["a", "b"], maxStates: 4 };
const blockFor = (task: Record<string, unknown>, extra: Record<string, unknown> = {}): SimulationBlock => ({
  id: "d1", type: "simulation", origin: "teacher-enrichment", simulationType: "automaton-design", version: 1, title: "صمّم الآلة",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config: { task, ...extra },
});
const props = (block: SimulationBlock, check?: ActivityCheck, reset = 0) => ({ block, courseId: "899271", reducedMotion: true, fullscreen: false, commands: { reset, replay: 0 }, emit: () => {}, check });
const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const cell = (from: string, symbol: string) => screen.getByRole("combobox", { name: "من " + from + " بالرمز " + symbol + " إلى" }) as HTMLSelectElement;

/** Builds «ends with 1» as a complete 2-state DFA: q0 —0→ q0, q0 —1→ q1, q1 —1→ q1, q1 —0→ q0; q1 accepting. */
function buildEndsWith1() {
  fireEvent.click(btn(/إضافة حالة/));
  fireEvent.click(screen.getAllByRole("checkbox", { name: "قبول" })[1]);
  fireEvent.change(cell("q0", "0"), { target: { value: "q0" } });
  fireEvent.change(cell("q0", "1"), { target: { value: "q1" } });
  fireEvent.change(cell("q1", "1"), { target: { value: "q1" } });
  fireEvent.change(cell("q1", "0"), { target: { value: "q0" } });
}
const ENDS_WITH_1 = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "0", "q0"], ["q0", "1", "q1"], ["q1", "0", "q0"], ["q1", "1", "q1"]] };

describe("AUTO-A3 — the task and the builder", () => {
  it("shows the statement, its rules and its example words", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(screen.getByText(DFA_TASK.intro)).toBeTruthy();
    const rules = screen.getByRole("list", { name: "شروط التمرين" });
    expect(rules.textContent).toContain("أوتومات منتهٍ حتمي");
    expect(rules.textContent).toContain("{0, 1}");
    expect(rules.textContent).toContain("حتى 3 حالات");
    expect(rules.textContent).toContain("أوتومات كامل");
    expect(screen.getByText("تُقبل").parentElement!.textContent).toContain("01");
    expect(screen.getByText("تُرفض").parentElement!.textContent).toContain("ε");
  });

  it("starts from one start state; adds states up to the limit; removes one (its arrows go with it)", () => {
    const { container } = render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(container.querySelectorAll(".learning-autodesign-staterow")).toHaveLength(1);
    expect((screen.getByRole("radio", { name: "بداية" }) as HTMLInputElement).checked).toBe(true);
    expect((btn("احذف الحالة q0") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn(/إضافة حالة/));
    fireEvent.click(btn(/إضافة حالة/));
    expect(container.querySelectorAll(".learning-autodesign-staterow")).toHaveLength(3);
    expect((btn(/إضافة حالة/) as HTMLButtonElement).disabled).toBe(true);   // maxStates 3
    fireEvent.change(cell("q0", "0"), { target: { value: "q2" } });
    fireEvent.click(btn("احذف الحالة q2"));
    expect(container.querySelectorAll(".learning-autodesign-staterow")).toHaveLength(2);
    expect(cell("q0", "0").value).toBe("");
  });

  it("draws the machine live: states, the accepting ring, one arrow per pair", () => {
    const { container } = render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    buildEndsWith1();
    const svg = container.querySelector(".learning-automaton-svg")!;
    expect(svg.querySelectorAll(".learning-automaton-state")).toHaveLength(2);
    expect(svg.querySelectorAll(".learning-automaton-state.is-accept")).toHaveLength(1);
    expect(svg.querySelectorAll(".learning-automaton-arrow")).toHaveLength(4);
    expect(svg.getAttribute("aria-label")).toContain("القبول q1");
    expect(svg.getAttribute("aria-label")).not.toContain("الحالة الآن");
  });

  it("«جرّب كلمة» runs the learner's own machine (not a check), and says so", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    buildEndsWith1();
    const input = screen.getByLabelText("جرّب كلمة على آلتك");
    fireEvent.change(input, { target: { value: "0101" } });
    fireEvent.click(btn("شغّل"));
    expect(screen.getByRole("status").textContent).toContain("آلتك تقبل الكلمة 0101");
    expect(screen.getByRole("status").textContent).toContain("ليس فحصًا للحل");
    fireEvent.change(input, { target: { value: "10" } });
    fireEvent.click(btn("شغّل"));
    expect(screen.getByRole("status").textContent).toContain("آلتك ترفض الكلمة 10");
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.click(btn("شغّل"));
    expect(screen.getByRole("status").textContent).toContain("ليس في الأبجدية");
  });

  it("an NFA cell takes any set of target states, and the ε column", () => {
    render(<AutomatonDesignActivity {...props(blockFor(NFA_TASK))} />);
    fireEvent.click(btn(/إضافة حالة/));
    const q0a = screen.getByRole("group", { name: "من q0 بالرمز a إلى" });
    fireEvent.click(within(q0a).getByRole("button", { name: "q0" }));
    fireEvent.click(within(q0a).getByRole("button", { name: "q1" }));
    expect(within(q0a).getAllByRole("button").map(b => b.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    expect(screen.getByRole("group", { name: "من q0 بالرمز ε إلى" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("AUTO-A3 — the server check", () => {
  it("sends exactly the machine through the seam and shows a right verdict with the explanation", async () => {
    const reply: ActivityCheckResult = { correct: true, feedback: { explanation: "حالتان تكفيان." }, study: true, persisted: true };
    const check = vi.fn<ActivityCheck>(async () => reply);
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    buildEndsWith1();
    fireEvent.click(btn("تحقّق من الآلة"));
    await screen.findByText(/آلتك صحيحة/);
    expect(check).toHaveBeenCalledTimes(1);
    const sent = check.mock.calls[0][0] as { kind: string; machine: typeof ENDS_WITH_1 };
    expect(Object.keys(sent).sort()).toEqual(["kind", "machine"]);
    expect(sent.kind).toBe("automaton-design");
    expect({ ...sent.machine, transitions: [...sent.machine.transitions].sort() }).toEqual({ ...ENDS_WITH_1, transitions: [...ENDS_WITH_1.transitions].sort() });
    expect(screen.getByText("حالتان تكفيان.")).toBeTruthy();
  });

  it("a wrong verdict shows the separating word in words and the hints; an edit clears it", async () => {
    const check = vi.fn<ActivityCheck>(async () => ({ correct: false, counterexample: { word: "", shouldAccept: false }, feedback: { hints: ["هل ε في اللغة؟"] } }));
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "قبول" }));
    fireEvent.click(btn("تحقّق من الآلة"));
    const v = await screen.findByText(/ليست بعد/);
    const box = v.closest(".learning-autodesign-verdict")!;
    expect(box.textContent).toContain("ε (الكلمة الفارغة)");
    expect(box.textContent).toContain("يجب أن تُرفض، لكن آلتك تقبلها.");
    expect(box.textContent).toContain("هل ε في اللغة؟");
    fireEvent.click(screen.getByRole("checkbox", { name: "قبول" }));
    expect(screen.queryByText(/ليست بعد/)).toBeNull();
  });

  it("a broken public rule is named; the server's issue codes all have Arabic text", async () => {
    const check = vi.fn<ActivityCheck>(async () => ({ correct: false, issue: { code: "incomplete", state: "q0", symbol: "1" } }));
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    fireEvent.click(btn("تحقّق من الآلة"));
    await screen.findByText("الأوتومات ليس كاملًا: لا يوجد سهم من q0 بالرمز 1.");
    for (const code of ["incomplete", "two-arrows", "epsilon-in-dfa", "symbol-outside-alphabet", "too-many-states", "no-start", "no-states", "malformed"]) {
      expect(issueText({ code, state: "q0", symbol: "a", max: 4 }).length).toBeGreaterThan(5);
    }
  });

  it("a failed check is «تعذّر التحقق», never a wrong answer", async () => {
    const check = vi.fn<ActivityCheck>(async () => { throw new Error("503"); });
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    fireEvent.click(btn("تحقّق من الآلة"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("تعذّر التحقق");
    expect(alert.textContent).toContain("لم تُعتبر خطأ");
    expect(screen.queryByText(/ليست بعد/)).toBeNull();
  });

  it("without a seam there is no check button, and the designer says where the check happens", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(screen.queryByRole("button", { name: "تحقّق من الآلة" })).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("يُفحص تصميمك عند فتح المادة من المنصة");
  });

  it("the shell's reset returns to one empty start state and drops the verdict", async () => {
    const check = vi.fn<ActivityCheck>(async () => ({ correct: true }));
    const { rerender, container } = render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check, 0)} />);
    buildEndsWith1();
    fireEvent.click(btn("تحقّق من الآلة"));
    await screen.findByText(/آلتك صحيحة/);
    await act(async () => { rerender(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check, 1)} />); });
    expect(container.querySelectorAll(".learning-autodesign-staterow")).toHaveLength(1);
    expect(screen.queryByText(/آلتك صحيحة/)).toBeNull();
  });
});

describe("AUTO-A3 — served body, task reader, host", () => {
  it("the served block keeps the task only: no reference, no feedback", () => {
    const authored = blockFor(DFA_TASK, { reference: ENDS_WITH_1, feedback: { explanation: "سرّ" } });
    const served = servedBlock(authored) as SimulationBlock;
    expect(served.config).toEqual({ task: DFA_TASK });
    expect(served.serverCheck).toBe(true);
    expect(JSON.stringify(served)).not.toMatch(/reference|سرّ|"q1"/);
  });

  it("an unreadable task shows the fallback note, never a guess", () => {
    for (const task of [{}, { ...DFA_TASK, machine: "PDA" }, { ...DFA_TASK, alphabet: [] }, { ...DFA_TASK, maxStates: 13 }, { ...NFA_TASK, complete: true }, { ...DFA_TASK, examples: { accept: ["2"] } }]) {
      expect(readDesignTask({ task })).toBeNull();
    }
    render(<AutomatonDesignActivity {...props(blockFor({ ...DFA_TASK, machine: "PDA" }))} />);
    expect(screen.getByRole("note").textContent).toContain("تعذّر عرض هذا التمرين");
  });

  it("loads lazily through the real activity host", async () => {
    const r = render(<LearningActivityHost block={blockFor(DFA_TASK)} courseId="899271" />);
    await waitFor(() => { if (!r.container.querySelector(".learning-autodesign")) throw new Error("not yet"); });
    expect(screen.getByText(DFA_TASK.intro)).toBeTruthy();
  });
});
