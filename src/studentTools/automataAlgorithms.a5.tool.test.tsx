// @vitest-environment happy-dom
// AUTO-A5 — «مختبر الآلات»: «آلاتي» and «الخوارزميات خطوة خطوة» in the tool:
//   • «حوّل إلى حتمي» row by row («الخطوة التالية», «أظهر كل الخطوات»), then «افتح الناتج في المحرر»: the editor holds the DFA,
//     the NFA is kept in «آلاتي» as A, and the new machine accepts the same words;
//   • with a kept machine: the complement, then the intersection with it (empty) and the union (every word), and the comparison
//     (the shortest word, by whom it is accepted);
//   • «التصغير» on a machine already small says so; an incomplete DFA is refused with the reason (never guessed);
//   • a result belongs to its machine (an edit clears it); a result of a kind the teacher did not offer is shown, not opened;
//     a push-down automaton or a Turing machine: the algorithms are for finite automata.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import AutomataLabTool from "./AutomataLabTool";
import type { AutomataLabToolV1 } from "./studentToolsSpec";

afterEach(cleanup);
const ALL: AutomataLabToolV1 = { id: "automataLab", kinds: ["DFA", "NFA", "PDA", "TM"] };
const section = (heading: RegExp) => screen.getByRole("heading", { name: heading, level: 3 }).closest("section") as HTMLElement;
const algos = () => section(/الخوارزميات خطوة خطوة/);
const click = (name: string | RegExp, within_: HTMLElement = algos()) => fireEvent.click(within(within_).getByRole("button", { name }));
const bodyRows = (el: HTMLElement) => within(within(el).getByRole("region", { name: /^خطوات/ })).getAllByRole("row").slice(1).map(r => r.textContent);
const runAll = (words: string) => {
  fireEvent.change(screen.getByLabelText(/^الكلمات/), { target: { value: words } });
  fireEvent.click(screen.getByRole("button", { name: "شغّل الكل" }));
  return within(section(/كلمات كثيرة/)).getAllByRole("row").slice(1).map(r => r.textContent);
};

describe("A5 — the algorithms in the tool", () => {
  it("«حوّل إلى حتمي» step by step, then open the result: a DFA in the editor, the NFA kept as A, the same words accepted", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: "أوتومات منتهٍ غير حتمي" }));
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: تنتهي بـ ab/ }));
    const before = runAll("ab aab ba b ε");
    click("حوّل إلى حتمي");
    expect(bodyRows(algos())).toEqual(["q0{q0}—q0q1q0"]);
    expect(within(algos()).getByText("الخطوة 1 من 3.")).toBeTruthy();
    click("الخطوة التالية");
    expect(bodyRows(algos())).toHaveLength(2);
    click("أظهر كل الخطوات");
    expect(bodyRows(algos())).toEqual(["q0{q0}—q0q1q0", "q0q1{q0, q1}—q0q1q0q2", "q0q2{q0, q2}✓q0q1q0"]);
    expect(within(algos()).getByText("أوتومات حتمي من 3 حالات.")).toBeTruthy();
    click("افتح الناتج في المحرر");
    expect((screen.getByRole("radio", { name: "أوتومات منتهٍ حتمي" }) as HTMLInputElement).checked).toBe(true);
    expect(section(/آلاتي/).textContent).toMatch(/الآلة السابقة محفوظة في «آلاتي» باسم A/);
    expect(runAll("ab aab ba b ε")).toEqual(before);
  });
  it("with a kept machine: the complement, the intersection (empty), the union (every word), the comparison", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    click("احفظ هذه الآلة", section(/آلاتي/));
    expect(within(section(/آلاتي/)).getByRole("button", { name: "الآلة محفوظة باسم A" })).toBeTruthy();
    click("المتمّم");
    click("افتح الناتج في المحرر");
    expect(runAll("ε a aa")).toEqual(["ε✗ تُرفض", "a✓ تُقبل", "aa✗ تُرفض"]);
    click("هل آلتاي متكافئتان؟");
    expect(algos().textContent).toMatch(/✗ ليستا متكافئتين\. أقصر كلمة تختلفان فيها: ε — ترفضها الآلة الحالية وتقبلها A\./);
    click("التقاطع");
    click("أظهر كل الخطوات");
    expect(bodyRows(algos()).every(r => r!.includes("—"))).toBe(true);   // no pair accepts in both: the empty language
    click("الاتحاد");
    click("أظهر كل الخطوات");
    expect(bodyRows(algos()).every(r => r!.includes("✓"))).toBe(true);   // every pair accepts in one: every word
  });
  it("«التصغير» of a machine already small says so; an incomplete DFA is refused with its reason", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    click("التصغير");
    click("أظهر كل الخطوات");
    expect(within(algos()).getByText("الأوتومات صغير أصلًا: لا حالتين متكافئتين ولا حالة لا نصلها.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "آلة جديدة" }));
    expect(algos().textContent).toMatch(/تحتاج أوتومات كاملًا: أضف حالة مصيدة أولًا/);
    click("المتمّم");
    expect(within(algos()).getByRole("alert").textContent).toBe("المتمّم: الآلة يجب أن تكون أوتومات كاملًا: ينقص سهم من q0 بالرمز a (أضف حالة مصيدة).");
  });
  it("a result belongs to its machine: an edit clears it", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: عدد a زوجي/ }));
    click("المتمّم");
    expect(within(algos()).queryByRole("region", { name: /^خطوات/ })).toBeTruthy();
    fireEvent.click(within(section(/الحالات/)).getAllByRole("checkbox", { name: "قبول" })[1]);
    expect(within(algos()).queryByRole("region", { name: /^خطوات/ })).toBeNull();
  });
  it("only the teacher's kinds: an NFA-only lab shows the DFA it converts to, but does not open it", () => {
    render(<AutomataLabTool config={{ id: "automataLab", kinds: ["NFA"] }} />);
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: تنتهي بـ ab/ }));
    click("حوّل إلى حتمي");
    expect((within(algos()).getByRole("button", { name: "افتح الناتج في المحرر" }) as HTMLButtonElement).disabled).toBe(true);
    expect(algos().textContent).toMatch(/«أوتومات منتهٍ حتمي» ليس من الآلات التي أتاحها المعلّم/);
  });
  it("a push-down automaton: the algorithms are for finite automata", () => {
    render(<AutomataLabTool config={ALL} />);
    fireEvent.click(screen.getByRole("radio", { name: "أوتومات مكدّس" }));
    fireEvent.click(screen.getByRole("button", { name: /^افتح مثالًا: aⁿbⁿ/ }));
    expect(algos().textContent).toMatch(/الخوارزميات للأوتومات المنتهي/);
    expect(within(algos()).queryByRole("button", { name: "حوّل إلى حتمي" })).toBeNull();
  });
});
