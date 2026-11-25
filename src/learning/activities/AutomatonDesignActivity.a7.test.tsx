// @vitest-environment happy-dom
// AUTO-A7 (docs/enterprise-automata-lab-a4.md §10) — the automata lab inside «صمّم الآلة»; the server's judge does not change:
//   • a desktop (fine pointer): «آلتك» is the lab's drawing editor (within the exercise's state limit); the table stays. Where a state is
//     put is the drawing's only: «تحقّق» sends exactly the machine, and moving a state keeps the verdict (the machine did not change);
//   • «فحص سريع لآلتك»: states no path reaches, a complete automaton's missing arrows and «أضف حالة مصيدة» (within the limit) — the
//     learner's own machine only, never a word on whether it is right, and never a check request;
//   • «افتح في مختبر الآلات»: only while the page's tool bar provides the lab for this kind; it hands a COPY; the book's tool bar opens
//     its lab with it (and says it is a copy); an exam's tool bar never provides it; the lab refuses a kind it does not allow.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";
import AutomatonDesignActivity from "./AutomatonDesignActivity";
import type { ActivityCheck, ActivityCheckResult } from "./engine";
import type { SimulationBlock } from "../content/types";
import StudentToolDock from "../../studentTools/StudentToolDock";
import AutomataLabTool from "../../studentTools/AutomataLabTool";
import { courseStudentTools } from "../../studentTools/courseTools";
import { initialDraft, type LabDraft } from "../../studentTools/automataLab";
import { provideLabOpener } from "../../studentTools/automataLabHandoff";

const fine = (on: boolean) => vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: on && q === "(pointer: fine)", media: q, addEventListener() {}, removeEventListener() {} })));
let withdraw: (() => void) | null = null;
beforeEach(() => { fine(true); });
afterEach(() => { cleanup(); withdraw?.(); withdraw = null; vi.unstubAllGlobals(); });

const DFA_TASK = { intro: "صمّم أوتومات حتميًا كاملًا للكلمات التي تنتهي بـ 1.", machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true };
const OPEN_DFA = { intro: "صمّم أوتومات حتميًا للكلمات التي تبدأ بـ a.", machine: "DFA", alphabet: ["a", "b"], maxStates: 4 };
const NFA_TASK = { intro: "صمّم أوتومات غير حتمي للكلمات التي تنتهي بـ ab.", machine: "NFA", alphabet: ["a", "b"], maxStates: 4 };
const blockFor = (task: Record<string, unknown>): SimulationBlock => ({
  id: "d1", type: "simulation", origin: "teacher-enrichment", simulationType: "automaton-design", version: 1, title: "صمّم الآلة",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config: { task },
});
const props = (block: SimulationBlock, check?: ActivityCheck) => ({ block, courseId: "899271", reducedMotion: true, fullscreen: false, commands: { reset: 0, replay: 0 }, emit: () => {}, check });
const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const cell = (from: string, symbol: string) => screen.getByRole("combobox", { name: "من " + from + " بالرمز " + symbol + " إلى" }) as HTMLSelectElement;
const quick = () => screen.getByTestId("autodesign-quick");
const OPEN_LAB = "افتح في مختبر الآلات";

/** «ends with 1», complete: q0 —0→ q0, q0 —1→ q1, q1 —1→ q1, q1 —0→ q0; q1 accepting (the table, as on a phone). */
function buildEndsWith1() {
  fireEvent.click(btn(/إضافة حالة/));
  fireEvent.click(screen.getAllByRole("checkbox", { name: "قبول" })[1]);
  fireEvent.change(cell("q0", "0"), { target: { value: "q0" } });
  fireEvent.change(cell("q0", "1"), { target: { value: "q1" } });
  fireEvent.change(cell("q1", "1"), { target: { value: "q1" } });
  fireEvent.change(cell("q1", "0"), { target: { value: "q0" } });
}
const circleOf = (q: string) => [...screen.getByTestId("alab-canvas").querySelectorAll("g.learning-automaton-state")].find(g => g.querySelector("text")?.textContent === q)?.querySelector("circle");

describe("A7 — the drawing editor in the activity", () => {
  it("a desktop: «آلتك» is the lab's editor and the table stays; a phone: the drawing only", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    const mine = screen.getByRole("heading", { name: "٣. آلتك" }).closest("section") as HTMLElement;
    expect(within(mine).getByTestId("alab-canvas")).toBeTruthy();
    expect(screen.getByRole("region", { name: "جدول الانتقالات" })).toBeTruthy();
    cleanup();
    fine(false);
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(screen.queryByTestId("alab-canvas")).toBeNull();
    expect(document.querySelector("svg.learning-automaton-svg")).toBeTruthy();
  });

  it("the editor's controls edit the same machine as the table (start, accept, delete)", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    fireEvent.click(btn(/إضافة حالة/));
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(screen.getByRole("group", { name: "أدوات الرسم" })).getByRole("button", { name: "قبول" }));
    expect((screen.getAllByRole("checkbox", { name: "قبول" })[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "أدوات الرسم" })).getByRole("button", { name: "بداية" }));
    expect((screen.getAllByRole("radio", { name: "بداية" })[1] as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(screen.getByRole("group", { name: "أدوات الرسم" })).getByRole("button", { name: "حذف" }));
    expect(screen.queryByRole("combobox", { name: "من q1 بالرمز 0 إلى" })).toBeNull();
    expect((screen.getAllByRole("radio", { name: "بداية" })[0] as HTMLInputElement).checked).toBe(true);
  });

  it("moving a state is the drawing's only: «تحقّق» sends exactly the machine, and the verdict stays after a move", async () => {
    const reply: ActivityCheckResult = { correct: true, study: true, persisted: true };
    const check = vi.fn<ActivityCheck>(async () => reply);
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    buildEndsWith1();
    const x0 = Number(circleOf("q1")?.getAttribute("cy"));
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(screen.getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    expect(Number(circleOf("q1")?.getAttribute("cy"))).toBeGreaterThan(x0);
    fireEvent.click(btn("تحقّق من الآلة"));
    await screen.findByText(/آلتك صحيحة/);
    const sent = check.mock.calls[0][0] as { kind: string; machine: Record<string, unknown> };
    expect(Object.keys(sent).sort()).toEqual(["kind", "machine"]);
    expect(Object.keys(sent.machine).sort()).toEqual(["accept", "start", "states", "transitions"]);
    fireEvent.click(within(screen.getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "يمينًا" }));
    expect(screen.getByText(/آلتك صحيحة/)).toBeTruthy();                       // the same machine: the verdict is still its own
    fireEvent.change(cell("q1", "0"), { target: { value: "q1" } });              // a real edit clears it, as before
    expect(screen.queryByText(/آلتك صحيحة/)).toBeNull();
  });
});

describe("A7 — «فحص سريع لآلتك»", () => {
  it("a complete automaton's missing arrows, and «أضف حالة مصيدة» completes it (the book's step) without asking the server", () => {
    const check = vi.fn<ActivityCheck>(async () => ({ correct: true }));
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK), check)} />);
    fireEvent.click(btn(/إضافة حالة/));
    fireEvent.change(cell("q0", "1"), { target: { value: "q1" } });
    expect(quick().textContent).toContain("ينقص أسهم ليكون الأوتومات كاملًا");
    expect(quick().textContent).toContain("(q0, 0) (q1, 0) (q1, 1)");
    fireEvent.click(within(quick()).getByRole("button", { name: "أضف حالة مصيدة" }));
    expect(cell("q0", "0").value).toBe("qT");
    expect(cell("qT", "0").value).toBe("qT");
    expect(cell("qT", "1").value).toBe("qT");
    expect(cell("q0", "1").value).toBe("q1");                                      // nothing else changes
    expect(quick().textContent).toContain("لا ملاحظات على شكل الآلة");
    expect(quick().textContent).toContain("هذا ما يقرّره «تحقّق من الآلة»");     // never «right»
    expect(quick().textContent).not.toMatch(/صحيح/);
    expect(check).not.toHaveBeenCalled();
  });

  it("the trap state keeps the exercise's limit", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);       // maxStates 3
    fireEvent.click(btn(/إضافة حالة/));
    fireEvent.click(btn(/إضافة حالة/));
    const trap = within(quick()).getByRole("button", { name: "أضف حالة مصيدة" });
    expect((trap as HTMLButtonElement).disabled).toBe(true);
    expect(quick().textContent).toContain("لا مكان لحالة أخرى: الحد 3");
  });

  it("states no path reaches; an automaton that need not be complete has no missing-arrows note", () => {
    render(<AutomatonDesignActivity {...props(blockFor(OPEN_DFA))} />);
    fireEvent.click(btn(/إضافة حالة/));
    expect(quick().textContent).toContain("لا يصل مسار من البداية إلى q1");
    expect(quick().textContent).not.toContain("ينقص");
    fireEvent.change(cell("q0", "a"), { target: { value: "q1" } });
    expect(quick().textContent).toContain("لا ملاحظات على شكل الآلة");
  });
});

describe("A7 — «افتح في مختبر الآلات»", () => {
  it("no tool bar lab on the page: no button", () => {
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(screen.queryByRole("button", { name: OPEN_LAB })).toBeNull();
  });

  it("an opener for the kind: the button hands a COPY of the machine (with where states were put); the activity's machine stays", () => {
    const open = vi.fn<(d: LabDraft) => void>();
    withdraw = provideLabOpener({ kinds: ["DFA"], open });
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    buildEndsWith1();
    fireEvent.change(screen.getByLabelText("الحالة"), { target: { value: "q1" } });
    fireEvent.click(within(screen.getByRole("group", { name: "انقل q1 خانة" })).getByRole("button", { name: "أسفل" }));
    fireEvent.click(btn(OPEN_LAB));
    expect(open).toHaveBeenCalledTimes(1);
    const d = open.mock.calls[0][0];
    expect(d.kind).toBe("DFA");
    expect(d.alphabet).toEqual(["0", "1"]);
    expect(d.states).toEqual(["q0", "q1"]);
    expect(d.accept).toEqual(["q1"]);
    expect(d.cells["q0|1"]).toEqual(["q1"]);
    expect(d.layout?.q1).toBeTruthy();
    d.cells["q0|1"] = ["q0"];                                                        // the lab's copy is its own
    d.states.push("qX");
    expect(cell("q0", "1").value).toBe("q1");
    expect(screen.queryByRole("combobox", { name: "من qX بالرمز 0 إلى" })).toBeNull();
  });

  it("a lab that does not allow the kind, or an opener withdrawn: no button", () => {
    withdraw = provideLabOpener({ kinds: ["DFA"], open: () => {} });
    render(<AutomatonDesignActivity {...props(blockFor(NFA_TASK))} />);
    expect(screen.queryByRole("button", { name: OPEN_LAB })).toBeNull();
    cleanup();
    render(<AutomatonDesignActivity {...props(blockFor(DFA_TASK))} />);
    expect(btn(OPEN_LAB)).toBeTruthy();
    act(() => { withdraw?.(); });
    withdraw = null;
    expect(screen.queryByRole("button", { name: OPEN_LAB })).toBeNull();
  });

  it("the book's tool bar opens its lab with the copy and says so; an exam's tool bar gives no button", async () => {
    const tools = courseStudentTools("899271");
    render(<><AutomatonDesignActivity {...props(blockFor(DFA_TASK))} /><StudentToolDock studentTools={tools} labHandoff /></>);
    buildEndsWith1();
    fireEvent.click(btn(OPEN_LAB));
    const panel = screen.getByTestId("tool-panel-automataLab");
    expect(panel.hidden).toBe(false);
    expect((await within(panel).findByTestId("alab-from-activity")).textContent).toContain("نسخة من آلتك في التمرين");
    expect(within(panel).getAllByText("q1").length).toBeGreaterThan(0);
    expect((within(panel).getByRole("combobox", { name: "من q0 بالرمز 1 إلى" }) as HTMLSelectElement).value).toBe("q1");
    fireEvent.change(within(panel).getByRole("combobox", { name: "من q0 بالرمز 1 إلى" }), { target: { value: "q0" } });
    const activity = document.querySelector(".learning-autodesign") as HTMLElement;   // the activity's root (the lab's is «alab»)
    expect(panel.contains(activity)).toBe(false);
    expect((within(activity).getByRole("combobox", { name: "من q0 بالرمز 1 إلى" }) as HTMLSelectElement).value).toBe("q1");
    cleanup();
    render(<><AutomatonDesignActivity {...props(blockFor(DFA_TASK))} /><StudentToolDock studentTools={tools} /></>);
    expect(screen.queryByRole("button", { name: OPEN_LAB })).toBeNull();
  });

  it("the lab takes a copy only of a kind it allows", () => {
    const nfa: LabDraft = { ...initialDraft("NFA"), states: ["q0", "q9"] };
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["DFA"] }} incoming={{ draft: nfa, seq: 1 }} />);
    expect(screen.queryByTestId("alab-from-activity")).toBeNull();
    expect(screen.queryByText("q9")).toBeNull();
  });
});
