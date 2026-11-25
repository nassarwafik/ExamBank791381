// AUTO-A8 — the automatonDesign@1 contract (shared with the server): the public rules, the private reference (checked against the example
// words), the student projection, the answer's SHAPE (a machine that breaks a rule is kept — the grader judges it), "answered", and the
// authority the grader reads. Pure.
import { describe, expect, it } from "vitest";
import {
  automatonDesignAuthority, bindAutomatonDesignAnswerToQuestion, defaultAutomatonDesignConfig, isAutomatonDesignAnswerAnswered, normalizeAutomatonDesignAnswer,
  projectAutomatonDesignConfigForStudent, validateAutomatonDesignAnswerKey, validateAutomatonDesignConfig, validateAutomatonDesignQuestion,
} from "./automatonDesignQuestion";
import { newQuestion } from "./examBuilderState";

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
