// AUTO-A1 — the automaton engine (automaton.ts): the strict config reader, the four runners on machines taken from the course
// «מודלים חישוביים» (task 11 of session 2, the PDA of the PDA-simulation deck, a Turing machine in the course's «a/A,R» notation),
// ε-closure, the stuck / non-halting endings, the drawn arrows and the automatic layout. Pure; no DOM.
import { describe, it, expect } from "vitest";
import {
  readAutomatonConfig, runAutomaton, splitWord, epsilonClosure, drawnEdges, gridLayout, edgeKey, LIMITS,
  type FaMachine, type Machine,
} from "./automaton";

const machineOf = (automaton: unknown, extra: Record<string, unknown> = {}): Machine => {
  const c = readAutomatonConfig({ automaton, ...extra });
  if (!c) throw new Error("config rejected");
  return c.machine;
};
const run = (m: Machine, w: string) => {
  const s = splitWord(m, w);
  if (!s.ok) throw new Error("bad word");
  return runAutomaton(m, s.symbols);
};

// Session 2, task 11: words over {a,b,c} that start with aa and whose length divides by 3 (q4 = trap, q5 = «باقي 1»).
const TASK11 = {
  kind: "DFA", states: ["q0", "q1", "q2", "q3", "q4", "q5"], alphabet: ["a", "b", "c"], start: "q0", accept: ["q3"],
  transitions: [
    ["q0", "a", "q1"], ["q0", "b", "q4"], ["q0", "c", "q4"],
    ["q1", "a", "q2"], ["q1", "b", "q4"], ["q1", "c", "q4"],
    ["q2", "a", "q3"], ["q2", "b", "q3"], ["q2", "c", "q3"],
    ["q3", "a", "q5"], ["q3", "b", "q5"], ["q3", "c", "q5"],
    ["q5", "a", "q2"], ["q5", "b", "q2"], ["q5", "c", "q2"],
    ["q4", "a", "q4"], ["q4", "b", "q4"], ["q4", "c", "q4"],
  ],
  stateLabels: { q4: "مصيدة", q5: "باقي 1" },
};
// The PDA-simulation deck: L = { aⁿbⁿ | 0 ≤ n }, accept by final state (q0 for n = 0, q2 after the last b).
const ANBN = {
  kind: "PDA", states: ["q0", "q1", "q2", "q3"], alphabet: ["a", "b"], start: "q0", accept: ["q0", "q2"], stackAlphabet: ["S", "A"],
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
// A Turing machine for { aⁿbⁿ | n ≥ 1 }: mark an a as A, run right to the first b, mark it B, return; accept when only marks remain.
const TM_ANBN = {
  kind: "TM", states: ["q0", "q1", "q2", "q3", "q4"], alphabet: ["a", "b"], start: "q0", accept: ["q4"], blank: "∆", tapeAlphabet: ["A", "B"],
  transitions: [
    { from: "q0", read: "a", write: "A", move: "R", to: "q1" },
    { from: "q0", read: "B", write: "B", move: "R", to: "q3" },
    { from: "q1", read: "a", write: "a", move: "R", to: "q1" },
    { from: "q1", read: "B", write: "B", move: "R", to: "q1" },
    { from: "q1", read: "b", write: "B", move: "L", to: "q2" },
    { from: "q2", read: "a", write: "a", move: "L", to: "q2" },
    { from: "q2", read: "B", write: "B", move: "L", to: "q2" },
    { from: "q2", read: "A", write: "A", move: "R", to: "q0" },
    { from: "q3", read: "B", write: "B", move: "R", to: "q3" },
    { from: "q3", read: "∆", write: "∆", move: "S", to: "q4" },
  ],
};

describe("DFA — session 2, task 11", () => {
  const m = machineOf(TASK11);
  it("accepts exactly the words that start with aa and whose length divides by 3", () => {
    for (const w of ["aaa", "aab", "aac", "aabcab", "aaaaaa"]) expect(run(m, w).verdict, w).toBe("accept");
    for (const w of ["", "a", "aa", "aaab", "abc", "baa", "caaaaa", "aaaa"]) expect(run(m, w).verdict, w).toBe("reject");
  });
  it("records one step per symbol plus a start and an end step, with the arrow used and the symbol read", () => {
    const r = run(m, "aab");
    expect(r.steps.map(s => s.active[0])).toEqual(["q0", "q1", "q2", "q3", "q3"]);
    expect(r.steps.map(s => s.read)).toEqual([0, 1, 2, 3, 3]);
    expect(r.steps[1].used).toEqual([edgeKey("q0", "q1")]);
    expect(r.steps[3]).toMatchObject({ used: [edgeKey("q2", "q3")], move: "b" });
    expect(r.steps[0].used).toEqual([]);
    expect(r.summary).toBe("انتهت الكلمة في q3، وهي حالة قبول: الكلمة aab مقبولة.");
  });
  it("names the empty word ε", () => {
    expect(run(m, "").summary).toBe("انتهت الكلمة في q0، وهي ليست حالة قبول: الكلمة ε مرفوضة.");
  });
  it("a partial automaton stops on a missing arrow and rejects (never invents a trap state)", () => {
    const partial = machineOf({ kind: "DFA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"]] });
    const r = run(partial, "ab");
    expect(r.verdict).toBe("stuck");
    expect(r.summary).toContain("لا انتقال من q1 بالرمز b");
    expect(r.steps.at(-1)).toMatchObject({ read: 1, active: ["q1"] });
  });
});

describe("NFA — every possible state at once, with ε-arrows", () => {
  // words over {a,b} that end with ab (the classic NFA), plus an ε-arrow from s to q0
  const m = machineOf({ kind: "NFA", states: ["s", "q0", "q1", "q2"], alphabet: ["a", "b"], start: "s", accept: ["q2"],
    transitions: [["s", "ε", "q0"], ["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "a", "q1"], ["q1", "b", "q2"]] }) as FaMachine;
  it("follows ε-arrows from the start", () => {
    expect(epsilonClosure(m, ["s"]).states).toEqual(["s", "q0"]);
    expect(run(m, "").steps[0]).toMatchObject({ active: ["s", "q0"], used: [edgeKey("s", "q0")] });
  });
  it("tracks the set of possible states and accepts when one of them accepts", () => {
    const r = run(m, "aab");
    expect(r.steps.map(s => s.active)).toEqual([["s", "q0"], ["q0", "q1"], ["q0", "q1"], ["q0", "q2"], ["q0", "q2"]]);
    expect(r.verdict).toBe("accept");
    expect(run(m, "aba").verdict).toBe("reject");
  });
  it("λ is read as ε; every path dying ends the run", () => {
    const n = machineOf({ kind: "NFA", states: ["p", "r"], alphabet: ["a"], start: "p", accept: ["r"], transitions: [["p", "λ", "r"]] });
    expect(run(n, "").verdict).toBe("accept");
    const r = run(n, "a");
    expect(r.verdict).toBe("stuck");
    expect(r.steps.at(-1)!.active).toEqual([]);
  });
});

describe("PDA — the course's aⁿbⁿ machine (PDA-simulation deck)", () => {
  const m = machineOf(ANBN);
  it("accepts aⁿbⁿ and rejects the rest", () => {
    for (const w of ["", "ab", "aabb", "aaabbb"]) expect(run(m, w).verdict, w).toBe("accept");
    for (const w of ["a", "b", "aab", "abb", "abab", "ba"]) expect(run(m, w).verdict, w).not.toBe("accept");
  });
  it("shows the stack after every step exactly as the deck draws it (bottom first)", () => {
    const r = run(m, "aaabbb");
    expect(r.steps.map(s => s.stack!.join(""))).toEqual(["⏊", "⏊S", "⏊SA", "⏊SAA", "⏊SA", "⏊S", "⏊", "⏊"]);
    expect(r.steps[1]).toMatchObject({ move: "ادفع a,⏊/S", active: ["q1"] });
    expect(r.steps[4]).toMatchObject({ move: "اسحب b,A/A", active: ["q3"] });
    expect(r.steps[1].note).toBe("نقرأ a وفي القمة ⏊: ندفع S إلى المكدّس، وننتقل من q0 إلى q1.");
  });
  it("pushes several symbols left to right (the last one ends on top) and «بلا تغيير» leaves the stack", () => {
    const p = machineOf({ kind: "PDA", states: ["q0"], alphabet: ["a", "c"], start: "q0", accept: ["q0"],
      transitions: [{ from: "q0", read: "a", top: "⏊", op: "push", write: "SAAA", to: "q0" }, { from: "q0", read: "c", top: "A", op: "none", to: "q0" }] });
    expect(run(p, "ac").steps.map(s => s.stack!.join(""))).toEqual(["⏊", "⏊SAAA", "⏊SAAA", "⏊SAAA"]);
  });
  it("stops when no move matches the symbol and the top", () => {
    const r = run(m, "abb");
    expect(r.verdict).toBe("stuck");
    expect(r.summary).toContain("وفي قمة المكدّس ⏊");
  });
});

describe("Turing machine — «a/A,R» moves on a tape", () => {
  const m = machineOf(TM_ANBN);
  it("accepts aⁿbⁿ (n ≥ 1) by halting in an accepting state", () => {
    for (const w of ["ab", "aabb", "aaabbb"]) expect(run(m, w).verdict, w).toBe("accept");
    for (const w of ["", "a", "aab", "abb", "ba"]) expect(run(m, w).verdict, w).toBe("reject");
  });
  it("records the tape, the head and the move", () => {
    const r = run(m, "ab");
    expect(r.steps[0].tape).toEqual({ cells: ["∆", "a", "b", "∆"], head: 1 });
    expect(r.steps[1]).toMatchObject({ move: "a/A,R", tape: { cells: ["∆", "A", "b", "∆"], head: 2 } });
    expect(r.steps.at(-1)!.tape).toEqual({ cells: ["∆", "A", "B", "∆", "∆"], head: 3 });   // halted on the blank after the word
  });
  it("gives up after the step limit and says the machine may never halt", () => {
    const loop = machineOf({ kind: "TM", states: ["q0"], alphabet: ["a"], start: "q0", accept: [], transitions: [{ from: "q0", read: "∆", write: "∆", move: "R", to: "q0" }, { from: "q0", read: "a", write: "a", move: "R", to: "q0" }] });
    const r = run(loop, "a");
    expect(r.verdict).toBe("nohalt");
    expect(r.steps).toHaveLength(LIMITS.tmSteps + 2);
  });
});

describe("Turing machine — the course's left boundary ├", () => {
  // the course's own example (session 5, slides 58–59): L = { awb | w over {a,b} }, the tape «├ a b b ∆ …», the head on the first letter
  const AWB = { kind: "TM", states: ["q0", "q1", "q2", "q3"], alphabet: ["a", "b"], start: "q0", accept: ["q3"], leftEnd: "├",
    transitions: [{ from: "q0", read: "a", write: "a", move: "R", to: "q1" }, { from: "q1", read: "a", write: "a", move: "R", to: "q1" },
      { from: "q1", read: "b", write: "b", move: "R", to: "q1" }, { from: "q1", read: "∆", write: "∆", move: "L", to: "q2" },
      { from: "q2", read: "b", write: "b", move: "R", to: "q3" }] };
  const m = machineOf(AWB);
  it("starts with ├ before the word and the head on its first letter, as slide 59 traces abb", () => {
    const r = run(m, "abb");
    expect(r.steps[0].tape).toEqual({ cells: ["├", "a", "b", "b", "∆"], head: 1 });
    expect(r.steps[0].note).toBe("نبدأ من q0، والرأس على أول رمز في الكلمة بعد علامة بداية الشريط ├.");
    expect(r.verdict).toBe("accept");
    for (const w of ["ab", "aab", "abab"]) expect(run(m, w).verdict, w).toBe("accept");
    for (const w of ["", "a", "b", "ba", "aba"]) expect(run(m, w).verdict, w).not.toBe("accept");
  });
  it("refuses a move that overwrites ├, writes it elsewhere, or moves left of it", () => {
    const tm = (t: Record<string, unknown>) => readAutomatonConfig({ automaton: { ...AWB, transitions: [t] } });
    expect(tm({ from: "q0", read: "├", write: "a", move: "R", to: "q1" })).toBeNull();
    expect(tm({ from: "q0", read: "a", write: "├", move: "R", to: "q1" })).toBeNull();
    expect(tm({ from: "q0", read: "├", write: "├", move: "L", to: "q1" })).toBeNull();
    expect(tm({ from: "q0", read: "├", write: "├", move: "R", to: "q1" })).not.toBeNull();
    expect(readAutomatonConfig({ automaton: { ...AWB, leftEnd: "a" } })).toBeNull();
  });
});

describe("the config reader refuses anything it cannot run faithfully", () => {
  const ok = { automaton: TASK11 };
  const bad = (patch: Record<string, unknown>, top: Record<string, unknown> = {}) => readAutomatonConfig({ ...ok, ...top, automaton: { ...TASK11, ...patch } });
  it("reads a valid config, its example words and its first word", () => {
    const c = readAutomatonConfig({ ...ok, words: ["aab", "", "aab", "ba"] })!;
    expect(c.words).toEqual(["aab", "", "ba"]);
    expect(c.word).toBe("aab");
    expect(readAutomatonConfig({ ...ok, sampleWords: ["aac"] })!.words).toEqual(["aac"]);
  });
  it("rejects a malformed machine", () => {
    expect(readAutomatonConfig(undefined)).toBeNull();
    expect(readAutomatonConfig({ automaton: [] })).toBeNull();
    expect(bad({ kind: "Mealy" })).toBeNull();
    expect(bad({ states: [] })).toBeNull();
    expect(bad({ states: ["q0", "q0"] })).toBeNull();
    expect(bad({ states: ["q 0"] })).toBeNull();
    expect(bad({ start: "q9" })).toBeNull();
    expect(bad({ accept: ["q9"] })).toBeNull();
    expect(bad({ alphabet: ["ab"] })).toBeNull();                           // one symbol per letter
    expect(bad({ alphabet: ["a", "ε"] })).toBeNull();
    expect(bad({ transitions: [["q0", "d", "q1"]] })).toBeNull();            // not in the alphabet
    expect(bad({ transitions: [["q0", "a", "q1"], ["q0", "a", "q2"]] })).toBeNull();  // a DFA with two arrows for one symbol
    expect(bad({ transitions: [["q0", "ε", "q1"]] })).toBeNull();            // ε in a DFA
    expect(bad({ transitions: [["q0", "a"]] })).toBeNull();
    expect(bad({ stateLabels: { q9: "x" } })).toBeNull();
  });
  it("rejects a PDA move it cannot honour", () => {
    const pda = (t: Record<string, unknown>) => readAutomatonConfig({ automaton: { ...ANBN, transitions: [t] } });
    expect(pda({ from: "q0", read: "a", top: "⏊", op: "pop", to: "q1" })).toBeNull();             // never pop the empty stack
    expect(pda({ from: "q0", read: "a", top: "⏊", op: "push", write: "", to: "q1" })).toBeNull();  // a push pushes something
    expect(pda({ from: "q0", read: "a", top: "⏊", op: "push", write: "S⏊", to: "q1" })).toBeNull(); // never push the bottom
    expect(pda({ from: "q1", read: "b", top: "A", op: "pop", write: "S", to: "q1" })).toBeNull();  // «اسحب b,A/S»
    expect(pda({ from: "q0", read: "a", top: "⏊", op: "none", write: "S", to: "q1" })).toBeNull();
    expect(pda({ from: "q0", read: "ε", top: "⏊", op: "none", to: "q1" })).toBeNull();            // no ε-moves in v1
    expect(readAutomatonConfig({ automaton: { ...ANBN, transitions: [...ANBN.transitions, ANBN.transitions[0]] } })).toBeNull();
  });
  it("rejects a non-deterministic Turing machine and a bad move", () => {
    const tm = (ts: unknown[]) => readAutomatonConfig({ automaton: { ...TM_ANBN, transitions: ts } });
    expect(tm([{ from: "q0", read: "a", write: "A", move: "U", to: "q1" }])).toBeNull();
    expect(tm([TM_ANBN.transitions[0], { ...TM_ANBN.transitions[0], to: "q2" }])).toBeNull();
  });
  it("rejects example words outside the alphabet or too long, and a layout that is partial or overlapping", () => {
    expect(readAutomatonConfig({ ...ok, words: ["abd"] })).toBeNull();
    expect(readAutomatonConfig({ ...ok, word: "a".repeat(LIMITS.word + 1) })).toBeNull();
    expect(readAutomatonConfig({ ...ok, layout: { q0: [0, 0] } })).toBeNull();
    const full = Object.fromEntries(TASK11.states.map((s, i) => [s, [i, 0]]));
    expect(readAutomatonConfig({ ...ok, layout: full })!.layout).toEqual(full);
    expect(readAutomatonConfig({ ...ok, layout: { ...full, q1: [0, 0] } })).toBeNull();
  });
  it("splitWord names the first symbol outside the alphabet", () => {
    expect(splitWord(machineOf(TASK11), "abd")).toEqual({ ok: false, bad: "d" });
  });
});

describe("drawing", () => {
  it("draws one arrow per pair of states, its symbols joined as the course writes them", () => {
    const edges = drawnEdges(machineOf(TASK11));
    expect(edges.find(e => e.key === edgeKey("q0", "q4"))!.labels).toEqual(["b,c"]);
    expect(edges.find(e => e.key === edgeKey("q4", "q4"))!.labels).toEqual(["a,b,c"]);
    expect(edges).toHaveLength(8);
  });
  it("keeps one line per PDA / TM move on a shared arrow", () => {
    const pda = drawnEdges(machineOf(ANBN));
    expect(pda.find(e => e.key === edgeKey("q1", "q1"))!.labels).toEqual(["ادفع a,S/A", "ادفع a,A/A"]);
    expect(drawnEdges(machineOf(TM_ANBN)).find(e => e.key === edgeKey("q1", "q1"))!.labels).toEqual(["a/a,R", "B/B,R"]);
  });
  it("lays states out by distance from the start; unreachable states go last; an author's layout wins", () => {
    const m = machineOf(TASK11);
    const g = gridLayout(m);
    expect(g.q0).toEqual([0, 0]);
    expect(g.q1).toEqual([1, 0]);
    expect(g.q4).toEqual([1, 1]);
    expect(g.q5).toEqual([4, 0]);
    const orphan = machineOf({ kind: "DFA", states: ["q0", "z"], alphabet: ["a"], start: "q0", accept: [], transitions: [] });
    expect(gridLayout(orphan)).toEqual({ q0: [0, 0], z: [1, 0] });
    expect(gridLayout(m, { q0: [3, 3] } as never)).toEqual({ q0: [3, 3] });
  });
});
