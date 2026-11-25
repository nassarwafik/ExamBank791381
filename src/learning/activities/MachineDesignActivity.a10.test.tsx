// @vitest-environment happy-dom
// AUTO-A10 — «صمّم الآلة» for a push-down automaton / a Turing machine (simulation / machine-design v1): the task and its rules; the
// machine built with the automata lab's own editors (states, the transitions in the course's notation); «تحقّق من الآلة» sends exactly
// the machine in the automaton-trace format (nothing else); the server's verdict in words — «agrees with the reference on every word up
// to length N», never «proved»; the separating word (a language) or the expected and given answers (a function); a Turing machine that
// did not halt; a broken public rule; an edit clears the verdict; a failed check says «تعذّر التحقق»; no seam → no check button.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import MachineDesignActivity from "./MachineDesignActivity";
import type { ActivityCheck, ActivityCheckResult } from "./engine";
import type { SimulationBlock } from "../content/types";
import { counterexampleText, readMachineTask } from "./machineDesign";

beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const PDA_TASK = { intro: "صمّم أوتومات مكدّس حتميًا للغة aⁿbⁿ.", machine: "PDA", alphabet: ["a", "b"], maxStates: 4, examples: { accept: ["", "ab"], reject: ["ba"] } };
const TM_TASK = { intro: "صمّم آلة تورنغ تحسب الدالة.", machine: "TM", alphabet: ["a"], mode: "compute", leftEnd: true, examples: { compute: [{ word: "aa", answer: "aaa" }] } };
const blockFor = (task: Record<string, unknown>): SimulationBlock => ({
  id: "md1", type: "simulation", origin: "teacher-enrichment", simulationType: "machine-design", version: 1, title: "صمّم الآلة",
  capabilities: { fullscreen: true, reset: true, interactive: true }, config: { task },
});
const props = (block: SimulationBlock, check?: ActivityCheck, reset = 0) => ({ block, courseId: "899271", reducedMotion: true, fullscreen: false, commands: { reset, replay: 0 }, emit: () => {}, check });
const btn = (name: string | RegExp) => screen.getByRole("button", { name });

/** q0 —ادفع a,⏊/S→ q1, q1 —اسحب b,S/S→ q2; q0 and q2 accepting: {ε, ab}. */
function buildSmallPda() {
  fireEvent.click(btn(/إضافة حالة/));
  fireEvent.click(btn(/إضافة حالة/));
  const accept = screen.getAllByRole("checkbox", { name: "قبول" });
  fireEvent.click(accept[0]); fireEvent.click(accept[2]);
  fireEvent.click(btn("إضافة انتقال"));
  fireEvent.change(screen.getByLabelText("الانتقال 1: يُكتب"), { target: { value: "S" } });
  fireEvent.change(screen.getByLabelText("الانتقال 1: إلى"), { target: { value: "q1" } });
  fireEvent.click(btn("إضافة انتقال"));
  fireEvent.change(screen.getByLabelText("الانتقال 2: من"), { target: { value: "q1" } });
  fireEvent.change(screen.getByLabelText("الانتقال 2: يقرأ"), { target: { value: "b" } });
  fireEvent.change(screen.getByLabelText("الانتقال 2: القمة"), { target: { value: "S" } });
  fireEvent.change(screen.getByLabelText("الانتقال 2: العملية"), { target: { value: "pop" } });
  fireEvent.change(screen.getByLabelText("الانتقال 2: يُكتب"), { target: { value: "S" } });
  fireEvent.change(screen.getByLabelText("الانتقال 2: إلى"), { target: { value: "q2" } });
}

describe("A10 — the task", () => {
  it("reads strictly: PDA / TM, alphabet ≤ 4, compute only for a TM, the left end only for a TM", () => {
    expect(readMachineTask({ task: PDA_TASK })).toMatchObject({ machine: "PDA", mode: "recognize", maxLength: 8, maxStates: 4 });
    expect(readMachineTask({ task: TM_TASK })).toMatchObject({ machine: "TM", mode: "compute", leftEnd: true });
    expect(readMachineTask({ task: { ...PDA_TASK, machine: "DFA" } })).toBeNull();
    expect(readMachineTask({ task: { ...PDA_TASK, mode: "compute" } })).toBeNull();
    expect(readMachineTask({ task: { ...PDA_TASK, leftEnd: true } })).toBeNull();
    expect(readMachineTask({ task: { ...PDA_TASK, alphabet: ["a", "b", "c", "d", "e"] } })).toBeNull();
    expect(readMachineTask({ task: { ...PDA_TASK, maxStates: 13 } })).toBeNull();
    expect(readMachineTask({ task: { ...PDA_TASK, examples: { accept: "ab" } } })).toBeNull();
  });
  it("the rules and the examples are shown; an unreadable task shows the fallback", () => {
    render(<MachineDesignActivity {...props(blockFor(TM_TASK))} />);
    const rules = screen.getByRole("list", { name: "شروط التمرين" }).textContent!;
    expect(rules).toMatch(/آلة تورنغ/);
    expect(rules).toMatch(/الجواب على الشريط بين علامتي \$/);
    expect(rules).toMatch(/بداية الشريط ├/);
    expect(screen.getByText("aa → $aaa$")).toBeTruthy();
    expect(screen.getByRole("region", { name: "انتقالات آلة تورنغ" })).toBeTruthy();
    cleanup();
    render(<MachineDesignActivity {...props(blockFor({ ...PDA_TASK, machine: "NFA" }))} />);
    expect(screen.getByRole("note").textContent).toContain("تعذّر عرض هذا التمرين");
  });
});

describe("A10 — the server check", () => {
  it("sends exactly the machine (automaton-trace format, the task's alphabet) and says «agrees up to length N» — never «proved»", async () => {
    const reply: ActivityCheckResult = { correct: true, agreesUpTo: { length: 8, words: 511 }, feedback: { explanation: "ندفع S." } };
    const check = vi.fn<ActivityCheck>(async () => reply);
    render(<MachineDesignActivity {...props(blockFor(PDA_TASK), check)} />);
    buildSmallPda();
    fireEvent.click(btn("تحقّق من الآلة"));
    const v = await screen.findByTestId("machine-design-verdict");
    expect(check).toHaveBeenCalledTimes(1);
    const sent = check.mock.calls[0][0] as { kind: string; machine: Record<string, unknown> };
    expect(Object.keys(sent).sort()).toEqual(["kind", "machine"]);
    expect(sent.kind).toBe("machine-design");
    expect(sent.machine).toMatchObject({ kind: "PDA", alphabet: ["a", "b"], states: ["q0", "q1", "q2"], start: "q0", accept: ["q0", "q2"], bottom: "⏊" });
    expect(sent.machine.transitions).toEqual([{ from: "q0", read: "a", top: "⏊", op: "push", write: "S", to: "q1" }, { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" }]);
    expect(v.textContent).toContain("آلتك تتفق مع النموذج على كل الكلمات حتى الطول 8 (511 كلمة)");
    expect(v.textContent).toContain("وليس برهانًا");
    expect(v.textContent).not.toMatch(/صحيحة/);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "قبول" })[0]);    // an edit clears the verdict
    expect(screen.queryByTestId("machine-design-verdict")).toBeNull();
  });
  it("wrong: the separating word; a function's expected and given answers; not halting; a broken rule", async () => {
    let reply: ActivityCheckResult = { correct: false, counterexample: { word: "aab", shouldAccept: false }, feedback: { hints: ["عدّ."] } };
    const check = vi.fn<ActivityCheck>(async () => reply);
    render(<MachineDesignActivity {...props(blockFor(PDA_TASK), check)} />);
    buildSmallPda();
    fireEvent.click(btn("تحقّق من الآلة"));
    expect((await screen.findByTestId("machine-design-verdict")).textContent).toContain("الكلمة aab يجب أن تُرفض، لكن آلتك تقبلها.");
    expect(screen.getByText("عدّ.")).toBeTruthy();
    for (const [r, text] of [
      [{ correct: false, nohalt: { word: "b" } }, "آلتك لم تتوقف على الكلمة b"],
      [{ correct: false, issue: { code: "too-many-states", max: 4 } }, "عدد الحالات أكبر من المسموح (4)"],
      [{ correct: false, issue: { code: "malformed" } }, "تعذّر قراءة الآلة"],
    ] as [ActivityCheckResult, string][]) {
      reply = r;
      fireEvent.click(screen.getAllByRole("checkbox", { name: "قبول" })[1]);   // a new machine
      fireEvent.click(btn("تحقّق من الآلة"));
      expect((await screen.findByTestId("machine-design-verdict")).textContent).toContain(text);
    }
    expect(counterexampleText({ word: "aa", expected: "aaa", got: null })).toBe("على الكلمة aa الجواب الصحيح «aaa»، وآلتك تعطي لا جواب بين علامتي $.");
    expect(counterexampleText({ word: "", expected: "", got: "a" })).toBe("على الكلمة ε (الكلمة الفارغة) الجواب الصحيح «ε»، وآلتك تعطي «a».");
  });
  it("a machine that does not read yet cannot be sent (the lab's issues are listed); a failed check is never a wrong; no seam → no button", async () => {
    const check = vi.fn<ActivityCheck>(async () => { throw new Error("503"); });
    render(<MachineDesignActivity {...props(blockFor(PDA_TASK), check)} />);
    fireEvent.click(btn("إضافة انتقال"));                                         // «ادفع» with nothing to push
    expect(screen.getByTestId("machine-design-issues").textContent).toContain("«ادفع» يدفع رمزًا واحدًا على الأقل");
    expect((btn("تحقّق من الآلة") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("الانتقال 1: يُكتب"), { target: { value: "S" } });
    fireEvent.click(btn("تحقّق من الآلة"));
    expect((await screen.findByRole("alert")).textContent).toContain("آلتك لم تُعتبر خطأ");
    cleanup();
    render(<MachineDesignActivity {...props(blockFor(PDA_TASK))} />);
    expect(screen.queryByRole("button", { name: "تحقّق من الآلة" })).toBeNull();
    expect(screen.getByRole("note").textContent).toContain("يُفحص تصميمك عند فتح المادة من المنصة");
  });
  it("the step-by-step player runs the learner's own machine", () => {
    render(<MachineDesignActivity {...props(blockFor(PDA_TASK))} />);
    buildSmallPda();
    const run = screen.getByRole("heading", { name: /شغّل آلتك خطوة خطوة/ }).closest("section") as HTMLElement;
    fireEvent.change(within(run).getByLabelText("الكلمة", { exact: true }), { target: { value: "ab" } });
    fireEvent.click(within(run).getByRole("button", { name: "شغّل", exact: true }));
    fireEvent.click(within(run).getByRole("button", { name: "النهاية" }));
    expect(within(run).getByText(/الكلمة مقبولة/)).toBeTruthy();
  });
});
