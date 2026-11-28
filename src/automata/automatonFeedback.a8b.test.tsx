// @vitest-environment happy-dom
// AUTO-A8b — the two places the separating word is shown: the teacher's review (both machines drawn, the stored word or broken rule in
// words — nothing re-judged) and the student's released breakdown (one line per automaton question; nothing else about the reference).
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import AutomatonDesignReview from "./AutomatonDesignReview";
import ResultBreakdown, { type QuestionBreakdown } from "../student/exam/ResultBreakdown";

afterEach(() => { cleanup(); });
const CFG = { v: 1, machine: "NFA", alphabet: ["a", "b"], maxStates: 4 };
const REF = { states: ["q0", "q1", "q2"], start: "q0", accept: ["q2"], transitions: [["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "a", "q1"], ["q1", "b", "q2"]] };
const MINE = { kind: "automatonDesign", machine: { states: ["p0", "p1"], start: "p0", accept: ["p1"], transitions: [["p0", "a", "p0"], ["p0", "b", "p0"], ["p0", "b", "p1"]] } };
const names = (el: HTMLElement) => [...el.querySelectorAll("g.learning-automaton-state text")].map(t => t.textContent);

describe("A8b — the teacher's review", () => {
  it("both machines drawn, the stored separating word in words", () => {
    render(<AutomatonDesignReview answer={MINE} answerKey={{ reference: REF }} config={CFG} feedback={{ counterexample: { word: "b", shouldAccept: false } }} />);
    expect(names(screen.getByTestId("automaton-review-student"))).toEqual(["p0", "p1"]);
    expect(names(screen.getByTestId("automaton-review-reference"))).toEqual(["q0", "q1", "q2"]);
    expect(screen.getByTestId("automaton-review-word").textContent).toMatch(/الكلمة\s*b\s*يجب أن تُرفض، لكن آلة الطالب تقبلها — أقصر كلمة تختلف فيها الآلتان/);
    expect(screen.getByText(/غير حتمي · الأبجدية/)).toBeTruthy();
  });
  it("a broken rule in words; the empty word named; no answer said plainly; unreadable rules → a note", () => {
    render(<AutomatonDesignReview answer={MINE} answerKey={{ reference: REF }} config={{ ...CFG, machine: "DFA" }} feedback={{ issue: { code: "two-arrows", state: "p0", symbol: "b" } }} />);
    expect(screen.getByTestId("automaton-review-issue").textContent).toContain("سهم واحد فقط لكل حالة ولكل رمز، ومن p0 بالرمز b أكثر من سهم");
    cleanup();
    render(<AutomatonDesignReview answer={MINE} answerKey={{ reference: REF }} config={CFG} feedback={{ counterexample: { word: "", shouldAccept: true } }} />);
    expect(screen.getByTestId("automaton-review-word").textContent).toContain("ε (الكلمة الفارغة)");
    cleanup();
    render(<AutomatonDesignReview answer={undefined} answerKey={{ reference: REF }} config={CFG} />);
    expect(screen.getByText("لم يُسجّل الطالب آلة.")).toBeTruthy();
    expect(screen.queryByTestId("automaton-review-word")).toBeNull();
    cleanup();
    render(<AutomatonDesignReview answer={MINE} answerKey={{ reference: REF }} config={{ v: 1, machine: "TM" }} />);
    expect(screen.getByRole("note").textContent).toContain("تعذّر عرض قواعد السؤال");
  });
});

describe("AUTO-A9 — the review draws each machine where its author put it", () => {
  const cy = (id: string, q: string) => Number([...screen.getByTestId(id).querySelectorAll("g.learning-automaton-state")].find(g => g.querySelector("text")?.textContent === q)!.querySelector("circle")!.getAttribute("cy"));
  it("a saved layout moves the drawn state; without one, the book's automatic layout", () => {
    render(<AutomatonDesignReview answer={MINE} answerKey={{ reference: REF }} config={CFG} />);
    const flat = [cy("automaton-review-student", "p1"), cy("automaton-review-reference", "q2")];
    cleanup();
    render(<AutomatonDesignReview answer={{ ...MINE, layout: { p1: [1, 2] } }} answerKey={{ reference: REF, layout: { q2: [2, 3] } }} config={CFG} />);
    expect(cy("automaton-review-student", "p1")).toBeGreaterThan(flat[0]);
    expect(cy("automaton-review-reference", "q2")).toBeGreaterThan(flat[1]);
  });
  it("AUTO-A16b — a place between the cells is drawn there (half a cell is half the distance of a whole one)", () => {
    const at = (layout: Record<string, [number, number]>) => { cleanup(); render(<AutomatonDesignReview answer={{ ...MINE, layout }} answerKey={{ reference: REF, layout: { q2: [2, layout.p1[1]] } }} config={CFG} />); return [cy("automaton-review-student", "p1"), cy("automaton-review-reference", "q2")]; };
    const zero = at({ p1: [1, 0] }), half = at({ p1: [1, 1.5] }), whole = at({ p1: [1, 3] });
    expect((half[0] - zero[0]) / (whole[0] - zero[0])).toBeCloseTo(0.5, 5);
    expect((half[1] - zero[1]) / (whole[1] - zero[1])).toBeCloseTo(0.5, 5);
  });
});

describe("A8b — the student's released breakdown", () => {
  const breakdown: QuestionBreakdown = { sections: [{ id: "s1", title: "قسم", capped: false }], questions: [
    { number: 1, sectionId: "s1", status: "zero", maxMarks: 5, score: 0, automaton: { word: "abb", shouldAccept: true } },
    { number: 2, sectionId: "s1", status: "zero", maxMarks: 5, score: 0, automaton: { issue: { code: "too-many-states", max: 4 } } },
    { number: 3, sectionId: "s1", status: "full", maxMarks: 2, score: 2 },
  ] };
  it("one line per automaton question: the word (should be accepted / rejected) or the broken rule", () => {
    render(<ResultBreakdown breakdown={breakdown} />);
    fireEvent.click(screen.getByText(/تفصيل العلامات/));
    const lines = screen.getAllByTestId("breakdown-automaton").map(l => l.textContent);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/الكلمة\s*abb\s*كان يجب أن تُقبل، لكن آلتك ترفضها/);
    expect(lines[1]).toContain("آلتك تخالف قاعدة في السؤال: عدد الحالات أكبر من المسموح (4)");
    const third = screen.getAllByRole("listitem")[2];
    expect(within(third).queryByTestId("breakdown-automaton")).toBeNull();
  });
});
