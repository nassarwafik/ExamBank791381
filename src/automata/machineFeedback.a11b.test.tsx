// @vitest-environment happy-dom
// AUTO-A11b — the two places a machineDesign@1 verdict is shown: the teacher's review (both machines drawn, the STORED verdict in words —
// nothing re-judged) and the student's released breakdown (one line per machine question; nothing about the reference). The verdicts:
// agreement up to a length (full marks — «not a proof», the teacher may change the mark), the separating word or a function's answers,
// a broken rule, and a Turing machine that did not halt (not a certain wrong — the teacher sets the mark).
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import MachineDesignReview from "./MachineDesignReview";
import ResultBreakdown, { type QuestionBreakdown } from "../student/exam/ResultBreakdown";

afterEach(() => { cleanup(); });
const tm = (from: string, read: string, write: string, move: string, to: string) => ({ from, read, write, move, to });
const PDA_CFG = { v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 };
const ANBN = { states: ["q0", "q1", "q2"], start: "q0", accept: ["q0", "q2"], transitions: [{ from: "q0", read: "a", top: "⏊", op: "push", write: "S", to: "q1" }, { from: "q1", read: "b", top: "S", op: "pop", write: "S", to: "q2" }] };
const MINE = { kind: "machineDesign", machine: { ...ANBN, states: ["s0", "s1", "s2"], start: "s0", accept: ["s2"], transitions: ANBN.transitions.map(t => ({ ...t, from: "s" + t.from.slice(1), to: "s" + t.to.slice(1) })) } };
const TM_CFG = { v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10 };
const PLUS = { states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [tm("q0", "1", "$", "R", "q1"), tm("q1", "∆", "$", "S", "q2")] };
const names = (el: HTMLElement) => [...el.querySelectorAll("g.learning-automaton-state text")].map(t => t.textContent);
const verdict = () => screen.getByTestId("machine-review-verdict").textContent ?? "";

describe("A11b — the teacher's review", () => {
  it("both machines drawn; a separating word in words; the rules line", () => {
    render(<MachineDesignReview answer={MINE} answerKey={{ reference: ANBN }} config={PDA_CFG} feedback={{ counterexample: { word: "", shouldAccept: true } }} />);
    expect(names(screen.getByTestId("machine-review-student"))).toEqual(["s0", "s1", "s2"]);
    expect(names(screen.getByTestId("machine-review-reference"))).toEqual(["q0", "q1", "q2"]);
    expect(verdict()).toMatch(/الكلمة ε \(الكلمة الفارغة\) يجب أن تُقبل، لكن آلة الطالب ترفضها — أقصر كلمة تختلف فيها الآلتان/);
    expect(screen.getByText(/أوتومات مكدّس · الأبجدية/)).toBeTruthy();
  });
  it("full marks: agreement up to the length — «a check, not a proof», the teacher may change the mark; a function says «inputs»", () => {
    render(<MachineDesignReview answer={MINE} answerKey={{ reference: ANBN }} config={PDA_CFG} feedback={{ agreesUpTo: { length: 8, words: 511 } }} />);
    expect(verdict()).toBe("تتفق آلة الطالب مع الآلة النموذجية على كل الكلمات حتى الطول 8 (511 كلمة): العلامة كاملة. هذا فحص وليس برهانًا، ولك أن تعدّل العلامة.");
    cleanup();
    render(<MachineDesignReview answer={{ kind: "machineDesign", machine: PLUS }} answerKey={{ reference: PLUS }} config={TM_CFG} feedback={{ agreesUpTo: { length: 10, words: 11 } }} />);
    expect(verdict()).toContain("على كل المدخلات حتى الطول 10 (11 مدخلًا)");
    expect(screen.getByText(/آلة تورنغ تحسب دالة · الأبجدية/).textContent).toContain("بداية الشريط ├");
  });
  it("a function's expected and given answers; a machine that did not halt — not a certain wrong; a broken rule", () => {
    render(<MachineDesignReview answer={{ kind: "machineDesign", machine: PLUS }} answerKey={{ reference: PLUS }} config={TM_CFG} feedback={{ counterexample: { word: "1", expected: "111", got: null } }} />);
    expect(verdict()).toBe("على المدخل 1 الجواب الصحيح «111»، وآلة الطالب تعطي لا جواب بين علامتي $ — أقصر مدخل تختلف فيه الآلتان.");
    cleanup();
    render(<MachineDesignReview answer={{ kind: "machineDesign", machine: PLUS }} answerKey={{ reference: PLUS }} config={TM_CFG} feedback={{ nohalt: { word: "11" } }} />);
    expect(verdict()).toMatch(/لم تتوقف على الكلمة 11 .* هذا ليس خطأً مؤكدًا: ضع العلامة بنفسك/);
    cleanup();
    render(<MachineDesignReview answer={MINE} answerKey={{ reference: ANBN }} config={PDA_CFG} feedback={{ issue: { code: "too-many-states", max: 6 } }} />);
    expect(verdict()).toContain("عدد الحالات أكبر من المسموح (6)");
  });
  it("a machine that breaks the rules is not drawn but said so; no answer said plainly; unreadable rules → a note; no feedback → no verdict", () => {
    const twoMoves = { kind: "machineDesign", machine: { ...ANBN, transitions: [...ANBN.transitions, { ...ANBN.transitions[0], to: "q2" }] } };
    render(<MachineDesignReview answer={twoMoves} answerKey={{ reference: ANBN }} config={PDA_CFG} />);
    expect(screen.getByTestId("machine-review-student").textContent).toContain("لا يمكن رسم هذه الآلة");
    expect(screen.queryByTestId("machine-review-verdict")).toBeNull();
    cleanup();
    render(<MachineDesignReview answer={undefined} answerKey={{ reference: ANBN }} config={PDA_CFG} />);
    expect(screen.getByText("لم يُسجّل الطالب آلة.")).toBeTruthy();
    cleanup();
    render(<MachineDesignReview answer={MINE} answerKey={{ reference: ANBN }} config={{ v: 9 }} />);
    expect(screen.getByRole("note").textContent).toContain("تعذّر عرض قواعد السؤال");
  });
});

describe("A11b — the student's released breakdown", () => {
  const breakdown = (machine: NonNullable<QuestionBreakdown["questions"][number]["machine"]>, status: "full" | "zero" = "zero"): QuestionBreakdown =>
    ({ sections: [{ id: "s1", title: "قسم", capped: false }], questions: [{ number: 1, sectionId: "s1", status, maxMarks: 6, score: status === "full" ? 6 : 0, machine }] });
  const line = (b: QuestionBreakdown) => { render(<ResultBreakdown breakdown={b} />); fireEvent.click(screen.getByTestId("result-breakdown").querySelector("summary")!); const t = screen.getByTestId("breakdown-machine").textContent ?? ""; cleanup(); return t; };
  it("one line per machine question — the agreement (not a proof), the separating word, a function's answers, a rule, not halting", () => {
    expect(line(breakdown({ agreesUpTo: { length: 8, words: 511 } }, "full"))).toBe("تصميم الآلة: آلتك تتفق مع الآلة النموذجية في كل ما فُحص حتى الطول 8 (511 كلمة). هذا فحص وليس برهانًا.");
    expect(line(breakdown({ word: "ab", shouldAccept: false }))).toBe("تصميم الآلة: الكلمة ab كان يجب أن تُرفض، لكن آلتك تقبلها.");
    expect(line(breakdown({ word: "1", expected: "111", got: "11" }))).toBe("تصميم الآلة: على المدخل 1 الجواب الصحيح «111»، وآلتك تعطي «11».");
    expect(line(breakdown({ issue: { code: "too-many-states", max: 6 } }))).toBe("تصميم الآلة: آلتك تخالف قاعدة في السؤال: عدد الحالات أكبر من المسموح (6).");
    expect(line(breakdown({ nohalt: { word: "b" } }, "full"))).toContain("آلتك لم تتوقف على الكلمة b");
  });
  it("a question without a machine line shows none", () => {
    render(<ResultBreakdown breakdown={{ sections: [{ id: "s1", title: "قسم", capped: false }], questions: [{ number: 1, sectionId: "s1", status: "full", maxMarks: 2, score: 2 }] }} />);
    expect(screen.queryByTestId("breakdown-machine")).toBeNull();
    void within;
  });
});
