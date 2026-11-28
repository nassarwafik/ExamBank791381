// AUTO-A8 — the automatonDesign@1 contract (shared with the server): the public rules, the private reference (checked against the example
// words), the student projection, the answer's SHAPE (a machine that breaks a rule is kept — the grader judges it), "answered", and the
// authority the grader reads. Pure.
import { describe, expect, it } from "vitest";
import {
  automatonDesignAuthority, bindAutomatonDesignAnswerToQuestion, defaultAutomatonDesignConfig, isAutomatonDesignAnswerAnswered, normalizeAutomatonDesignAnswer,
  projectAutomatonDesignConfigForStudent, validateAutomatonDesignAnswerKey, validateAutomatonDesignConfig, validateAutomatonDesignQuestion,
} from "./automatonDesignQuestion";
import { newQuestion } from "./examBuilderState";
import { AUTOMATON_LAYOUT_GRID_MAX, readAutomatonLayout } from "./automatonDesignQuestion";
import { GRID_MAX } from "./studentTools/automataLab";

const CFG = { v: 1, machine: "DFA", alphabet: ["0", "1"], maxStates: 3, complete: true, examples: { accept: ["1", "01"], reject: ["", "10"] } };
const REF = { states: ["q0", "q1"], start: "q0", accept: ["q1"], transitions: [["q0", "0", "q0"], ["q0", "1", "q1"], ["q1", "0", "q0"], ["q1", "1", "q1"]] };
const node = (cfg: unknown = CFG, answer: unknown = { reference: REF }) => ({ presentationType: "automatonDesign", questionTypeVersion: 1, automatonDesign: cfg, answer });
const codes = (n: Record<string, unknown>) => validateAutomatonDesignQuestion(n).map(i => i.code);

describe("A8 — the rules (public config)", () => {
  it("a valid config is returned canonical; the defaults are valid rules", () => {
    expect(validateAutomatonDesignConfig(CFG)).toEqual({ ok: true, config: CFG, issues: [] });
    expect(validateAutomatonDesignConfig({ v: 1, machine: "NFA", alphabet: ["a"], maxStates: 1, examples: { accept: [], reject: [] } })).toEqual({ ok: true, config: { v: 1, machine: "NFA", alphabet: ["a"], maxStates: 1 }, issues: [] });
    expect(validateAutomatonDesignConfig(defaultAutomatonDesignConfig()).ok).toBe(true);
  });
  it("refuses what does not read: the type, the alphabet, the state limit, completeness for an NFA, foreign fields, example words", () => {
    const bad = (over: Record<string, unknown>) => { const r = validateAutomatonDesignConfig({ ...CFG, ...over }); return r.ok ? [] : r.issues.map(i => i.code); };
    expect(bad({ machine: "PDA" })).toContain("AUTOMATON_MACHINE_INVALID");
    expect(bad({ alphabet: [] })).toContain("AUTOMATON_ALPHABET_INVALID");
    expect(bad({ alphabet: ["a", "a"] })).toContain("AUTOMATON_ALPHABET_INVALID");
    expect(bad({ alphabet: ["ab"] })).toContain("AUTOMATON_ALPHABET_INVALID");
    expect(bad({ alphabet: ["ε"] })).toContain("AUTOMATON_ALPHABET_INVALID");
    expect(bad({ alphabet: ["a", "b", "c", "d", "e", "f", "g"] })).toContain("AUTOMATON_ALPHABET_INVALID");
    expect(bad({ maxStates: 0 })).toContain("AUTOMATON_MAX_STATES_INVALID");
    expect(bad({ maxStates: 13 })).toContain("AUTOMATON_MAX_STATES_INVALID");
    expect(bad({ maxStates: 2.5 })).toContain("AUTOMATON_MAX_STATES_INVALID");
    expect(bad({ machine: "NFA" })).toContain("AUTOMATON_COMPLETE_NFA");
    expect(bad({ complete: false })).toContain("AUTOMATON_COMPLETE_INVALID");
    expect(bad({ reference: REF })).toContain("AUTOMATON_UNKNOWN_KEY");
    expect(bad({ examples: { accept: ["2"] } })).toContain("AUTOMATON_EXAMPLES_INVALID");
    expect(bad({ examples: { accept: ["1"], reject: ["1"] } })).toContain("AUTOMATON_EXAMPLES_CONFLICT");
    expect(bad({ examples: { accept: Array.from({ length: 9 }, (_, i) => "1".repeat(i + 1)) } })).toContain("AUTOMATON_EXAMPLES_INVALID");
    expect(bad({ v: 2 })).toContain("AUTOMATON_VERSION");
  });
  it("the student projection is the canonical rules — a smuggled field withholds the whole config", () => {
    expect(projectAutomatonDesignConfigForStudent(CFG)).toEqual(CFG);
    expect(projectAutomatonDesignConfigForStudent({ ...CFG, reference: REF })).toBeNull();
    // the stored copy is not what is sent: duplicate example words are sent once, empty example lists not at all
    expect(projectAutomatonDesignConfigForStudent({ ...CFG, examples: { accept: ["1", "1", "01"], reject: [] } })).toEqual({ ...CFG, examples: { accept: ["1", "01"], reject: [] } });
    expect(projectAutomatonDesignConfigForStudent({ v: 1, machine: "NFA", alphabet: ["a"], maxStates: 2, examples: { accept: [], reject: [] } })).toEqual({ v: 1, machine: "NFA", alphabet: ["a"], maxStates: 2 });
    expect(projectAutomatonDesignConfigForStudent({ ...CFG, examples: { accept: ["1"], reject: [], correct: ["x"] } })).toBeNull();
  });
});

describe("A8 — the reference (private key)", () => {
  it("a valid question has no issue; the defaults (no reference yet) block finalization", () => {
    expect(codes(node())).toEqual([]);
    const fresh = newQuestion("automatonDesign" as never) as unknown as Record<string, unknown>;
    expect(fresh.automatonDesign).toEqual(defaultAutomatonDesignConfig());
    expect(codes(fresh)).toEqual(["AUTOMATON_KEY_INVALID"]);
  });
  it("the reference must read: states, start, accepting states, arrows between its states, symbols of the alphabet (ε allowed), ≤ 12 states", () => {
    expect(codes(node(CFG, {}))).toEqual(["AUTOMATON_KEY_INVALID"]);
    expect(codes(node(CFG, { reference: REF, extra: 1 }))).toEqual(["AUTOMATON_KEY_INVALID"]);
    expect(codes(node(CFG, { reference: { ...REF, start: "q9" } }))).toEqual(["AUTOMATON_KEY_START"]);
    expect(codes(node(CFG, { reference: { ...REF, states: ["q0", "1x"] } }))).toEqual(["AUTOMATON_KEY_STATES"]);
    expect(codes(node(CFG, { reference: { ...REF, states: ["q0", "q0"] } }))).toEqual(["AUTOMATON_KEY_STATES"]);
    expect(codes(node(CFG, { reference: { ...REF, accept: ["q7"] } }))).toEqual(["AUTOMATON_KEY_INVALID"]);
    expect(codes(node(CFG, { reference: { ...REF, transitions: [...REF.transitions, ["q0", "0", "q9"]] } }))).toEqual(["AUTOMATON_KEY_INVALID"]);
    expect(codes(node(CFG, { reference: { ...REF, transitions: [...REF.transitions, ["q0", "2", "q1"]] } }))).toEqual(["AUTOMATON_KEY_SYMBOL"]);
    expect(codes(node(CFG, { reference: { ...REF, transitions: [...REF.transitions, ["q0", "ε", "q1"]] } }))).toEqual(["AUTOMATON_KEY_EXAMPLE"]);   // now accepts ε, a rejected example
    const big = Array.from({ length: 13 }, (_, i) => "q" + i);
    const { examples: _e, ...noExamples } = CFG; void _e;
    expect(codes(node(noExamples, { reference: { states: big, start: "q0", accept: [], transitions: [] } }))).toEqual(["AUTOMATON_KEY_TOO_BIG"]);
  });
  it("the example words are checked against the reference (ε arrows followed), with the word named", () => {
    const r = validateAutomatonDesignAnswerKey({ reference: { ...REF, accept: ["q0"] } }, CFG);
    expect(r.ok ? "" : r.issues[0].message).toContain("«1»");
    const nfa = { v: 1, machine: "NFA", alphabet: ["a"], maxStates: 3, examples: { accept: ["", "a"], reject: ["aa"] } };
    expect(validateAutomatonDesignAnswerKey({ reference: { states: ["p", "r"], start: "p", accept: ["r"], transitions: [["p", "ε", "r"], ["p", "a", "r"]] } }, nfa).ok).toBe(true);
    expect(validateAutomatonDesignAnswerKey({ reference: REF }, { ...CFG, machine: "PDA" })).toMatchObject({ ok: false, issues: [{ code: "AUTOMATON_KEY_CONFIG_INVALID" }] });
  });
  it("the grading authority: canonical rules + reference, or null (the grader then fails closed)", () => {
    expect(automatonDesignAuthority(CFG, { reference: REF })).toEqual({ config: CFG, key: { reference: REF } });
    expect(automatonDesignAuthority({ ...CFG, machine: "TM" }, { reference: REF })).toBeNull();
    expect(automatonDesignAuthority(CFG, { reference: { ...REF, start: "x" } })).toBeNull();
  });
});

describe("AUTO-A9 — the drawing's layout (presentation only)", () => {
  const A = (machine: unknown, layout?: unknown) => ({ kind: "automatonDesign", machine, ...(layout !== undefined ? { layout } : {}) });
  it("a layout of the machine's own states, in the grid, travels with the answer", () => {
    expect(normalizeAutomatonDesignAnswer(A(REF, { q0: [0, 0], q1: [3, 2] }))).toEqual({ ok: true, answer: A(REF, { q0: [0, 0], q1: [3, 2] }) });
    expect(readAutomatonLayout({ q0: [20, 20] }, ["q0"])).toEqual({ q0: [20, 20] });
    expect(AUTOMATON_LAYOUT_GRID_MAX).toBe(GRID_MAX);                              // parity with the drawing editor's grid
  });
  // AUTO-A16b — the drawing editor moves a state freely: a place between the grid's cells reads (it did not in A9, where [1.5, 0] was dropped)
  it("A16b — a place between the cells reads, kept to two decimals; whole cells read exactly as before; the bounds are the same", () => {
    expect(normalizeAutomatonDesignAnswer(A(REF, { q0: [1.5, 0], q1: [3.25, 2.75] }))).toEqual({ ok: true, answer: A(REF, { q0: [1.5, 0], q1: [3.25, 2.75] }) });
    expect(readAutomatonLayout({ q0: [0.123456, 19.999] }, ["q0"])).toEqual({ q0: [0.12, 20] });
    expect(readAutomatonLayout({ q0: [0, 20] }, ["q0"])).toEqual({ q0: [0, 20] });
    expect([readAutomatonLayout({ q0: [20.004, 0] }, ["q0"]), readAutomatonLayout({ q0: [-0.004, 0] }, ["q0"])]).toEqual([null, null]);   // out of the grid, however little
  });
  it("a layout that does not read is dropped — the machine (the answer) is kept", () => {
    for (const bad of [{ q9: [0, 0] }, { q0: [21, 0] }, { q0: [-1, 0] }, { q0: [20.01, 0] }, { q0: [-0.01, 0] }, { q0: [NaN, 0] }, { q0: [Infinity, 0] }, { q0: ["1", 0] }, { q0: [null, 0] }, { q0: [0, 0, 0] }, { q0: [0] }, { q0: "0,0" }, [[0, 0]], { q0: [0, 0], q1: [1, 1], q2: [2, 2] }, { __proto__: [0, 0] }])
      expect(normalizeAutomatonDesignAnswer(A(REF, bad)), JSON.stringify(bad)).toEqual({ ok: true, answer: A(REF) });
    expect(normalizeAutomatonDesignAnswer(A(REF, {}))).toEqual({ ok: true, answer: A(REF) });
    expect(normalizeAutomatonDesignAnswer({ ...A(REF, { q0: [0, 0] }), score: 5 })).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });   // other fields still refused
  });
  it("the reference's layout is part of the key: one that does not read is an issue; the grading authority keeps it as given", () => {
    expect(codes(node(CFG, { reference: REF, layout: { q0: [0, 0], q1: [2, 0] } }))).toEqual([]);
    expect(codes(node(CFG, { reference: REF, layout: { q7: [0, 0] } }))).toEqual(["AUTOMATON_KEY_LAYOUT"]);
    expect(automatonDesignAuthority(CFG, { reference: REF, layout: { q1: [2, 0] } })).toEqual({ config: CFG, key: { reference: REF, layout: { q1: [2, 0] } } });
  });
  it("answered: a layout alone is not an answer", () => {
    expect(isAutomatonDesignAnswerAnswered(A({ states: ["q0"], start: "q0", accept: [], transitions: [] }, { q0: [3, 3] }))).toBe(false);
  });
});

describe("A8 — the answer", () => {
  const A = (machine: unknown) => ({ kind: "automatonDesign", machine });
  it("the SHAPE only: a machine that breaks a rule of the question (too many states, a foreign symbol, two arrows) is kept", () => {
    const wild = { states: ["a1", "a2", "a3", "a4", "a5"], start: "a1", accept: [], transitions: [["a1", "z", "a2"], ["a1", "z", "a3"]] };
    expect(normalizeAutomatonDesignAnswer(A(wild))).toEqual({ ok: true, answer: A(wild) });
    expect(bindAutomatonDesignAnswerToQuestion(A(wild), node())).toEqual({ ok: true, answer: A(wild) });
  });
  it("refuses what is not a machine: extra fields, a prototype state, an oversized machine, a wrong kind", () => {
    const bad = (a: unknown) => normalizeAutomatonDesignAnswer(a);
    expect(bad({ ...A(REF), score: 5 })).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, verdict: "right" }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, states: ["__proto__"] }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, states: Array.from({ length: 25 }, (_, i) => "q" + i) }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, transitions: Array.from({ length: 201 }, () => ["q0", "0", "q0"]) }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, transitions: [["q0", "0"]] }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad(A({ ...REF, start: "q".repeat(9) }))).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
    expect(bad({ kind: "meshPartSelection", machine: REF })).toEqual({ ok: false, code: "AUTOMATON_ANSWER_INVALID" });
  });
  it("answered: anything beyond the empty start state", () => {
    expect(isAutomatonDesignAnswerAnswered(A({ states: ["q0"], start: "q0", accept: [], transitions: [] }))).toBe(false);
    expect(isAutomatonDesignAnswerAnswered(A({ states: ["q0"], start: "q0", accept: ["q0"], transitions: [] }))).toBe(true);
    expect(isAutomatonDesignAnswerAnswered(A({ states: ["q0", "q1"], start: "q0", accept: [], transitions: [] }))).toBe(true);
    expect(isAutomatonDesignAnswerAnswered(A({ states: ["q0"], start: "q0", accept: [], transitions: [["q0", "0", "q0"]] }))).toBe(true);
    expect(isAutomatonDesignAnswerAnswered({ kind: "automatonDesign" })).toBe(false);
  });
});
