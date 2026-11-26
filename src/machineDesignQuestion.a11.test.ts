// AUTO-A11a — the machineDesign@1 contract: the public rules (strict, canonical), the private reference (read by the book's engine, the
// examples run on it), the student projection, the answer's shape (kept even when it breaks a rule), «answered», and parity with the judge.
import { describe, it, expect } from "vitest";
import {
  validateMachineDesignConfig, validateMachineDesignQuestion, validateMachineDesignAnswerKey, projectMachineDesignConfigForStudent, machineDesignAuthority,
  normalizeMachineDesignAnswer, bindMachineDesignAnswerToQuestion, isMachineDesignAnswerAnswered, answerBetweenDollars, defaultMachineDesignConfig, MACHINE_DESIGN_LIMITS,
} from "./machineDesignQuestion";

const pdaMove = (from: string, read: string, top: string, op: string, write: string, to: string) => ({ from, read, top, op, write, to });
const tmMove = (from: string, read: string, write: string, move: string, to: string) => ({ from, read, write, move, to });
// aⁿbⁿ: q0 —ادفع a,⏊/S→ q1, a/A pushes, b pops; q0 and q2 accept
const ANBN = { states: ["q0", "q1", "q2", "q3"], start: "q0", accept: ["q0", "q2"], transitions: [
  pdaMove("q0", "a", "⏊", "push", "S", "q1"), pdaMove("q1", "a", "S", "push", "A", "q1"), pdaMove("q1", "a", "A", "push", "A", "q1"),
  pdaMove("q1", "b", "S", "pop", "S", "q2"), pdaMove("q1", "b", "A", "pop", "A", "q3"), pdaMove("q3", "b", "A", "pop", "A", "q3"), pdaMove("q3", "b", "S", "pop", "S", "q2")] };
// f(x) = x + 2 in unary (the book's), on a tape with ├
const PLUS2 = { states: ["q0", "q1", "q2", "q3", "q4", "q5"], start: "q0", accept: ["q5"], transitions: [
  tmMove("q0", "1", "$", "R", "q1"), tmMove("q1", "1", "1", "R", "q1"), tmMove("q1", "∆", "1", "R", "q2"), tmMove("q2", "∆", "1", "R", "q3"),
  tmMove("q3", "∆", "1", "R", "q4"), tmMove("q4", "∆", "$", "R", "q5"), tmMove("q0", "∆", "$", "R", "q2")] };
const PDA_CFG = { v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6, examples: { accept: ["", "ab"], reject: ["ba"] } };
const TM_CFG = { v: 1, machine: "TM", mode: "compute", alphabet: ["1"], maxStates: 8, leftEnd: true, maxLength: 10, examples: { compute: [{ word: "111", output: "11111" }, { word: "", output: "11" }] } };
const q = (cfg: unknown, reference: unknown) => ({ presentationType: "machineDesign", questionTypeVersion: 1, machineDesign: cfg, answer: { reference } });
const codes = (issues: { code: string }[]) => issues.map(i => i.code);

describe("A11a — the public rules", () => {
  it("read canonically: a push-down automaton, a Turing machine that recognises, one that computes (on the book's tape)", () => {
    expect(validateMachineDesignConfig(PDA_CFG)).toEqual({ ok: true, issues: [], config: PDA_CFG });
    expect(validateMachineDesignConfig(TM_CFG)).toEqual({ ok: true, issues: [], config: TM_CFG });
    expect(validateMachineDesignConfig(defaultMachineDesignConfig()).ok).toBe(true);
    expect(validateMachineDesignConfig({ v: 1, machine: "TM", alphabet: ["a", "b"], maxStates: 6, leftEnd: true }).ok).toBe(true);
  });
  it("refuse what does not read — with one code each", () => {
    const bad = (patch: Record<string, unknown>) => { const r = validateMachineDesignConfig({ ...PDA_CFG, ...patch }); return r.ok ? [] : codes(r.issues); };
    expect(bad({ machine: "DFA" })).toContain("MACHINE_KIND_INVALID");
    expect(bad({ mode: "compute", examples: undefined })).toContain("MACHINE_MODE_PDA");               // a function is a Turing machine's
    expect(bad({ mode: "recognize" })).toContain("MACHINE_MODE_INVALID");                              // recognise = no field (canonical)
    expect(bad({ leftEnd: true })).toContain("MACHINE_LEFT_END_PDA");
    expect(bad({ alphabet: ["a", "$"] })).toContain("MACHINE_ALPHABET_INVALID");                       // $ marks a function's answer
    expect(bad({ alphabet: ["a", "b", "c", "d", "e"] })).toContain("MACHINE_ALPHABET_INVALID");        // the judge's 4 symbols
    expect(bad({ maxStates: 13 })).toContain("MACHINE_MAX_STATES_INVALID");
    expect(bad({ maxLength: 11 })).toContain("MACHINE_MAX_LENGTH_INVALID");
    expect(bad({ hint: "x" })).toContain("MACHINE_UNKNOWN_KEY");
    expect(bad({ examples: { accept: ["ab"], reject: ["ab"] } })).toContain("MACHINE_EXAMPLES_CONFLICT");
    expect(bad({ examples: { accept: ["abc"] } })).toContain("MACHINE_EXAMPLES_INVALID");               // c is not in the alphabet
    const tm = (patch: Record<string, unknown>) => { const r = validateMachineDesignConfig({ ...TM_CFG, ...patch }); return r.ok ? [] : codes(r.issues); };
    expect(tm({ examples: { compute: [{ word: "1", answer: "111" }] } })).toContain("MACHINE_EXAMPLES_INVALID");    // `answer` is never a field here
    expect(tm({ examples: { compute: [{ word: "1", output: "1$1" }] } })).toContain("MACHINE_EXAMPLES_INVALID");
    expect(tm({ examples: { accept: ["1"] } })).toContain("MACHINE_EXAMPLES_INVALID");                 // a function has word → output examples
  });
  it("the student projection is the canonical rules (no answer data), or nothing", () => {
    expect(projectMachineDesignConfigForStudent(TM_CFG)).toEqual(TM_CFG);
    // a REBUILT copy, never the stored object: repeated example words once, empty example lists dropped
    const raw = { ...PDA_CFG, examples: { accept: ["ab", "ab", ""], reject: [] } };
    const p = projectMachineDesignConfigForStudent(raw);
    expect(p).toEqual({ ...PDA_CFG, examples: { accept: ["ab", ""], reject: [] } });
    expect(p).not.toBe(raw);
    expect(projectMachineDesignConfigForStudent({ ...PDA_CFG, examples: { accept: [], reject: [] } })).toEqual({ v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 });
    expect(projectMachineDesignConfigForStudent({ ...TM_CFG, reference: PLUS2 })).toBeNull();
  });
});

describe("A11a — the private reference", () => {
  it("read by the book's engine and checked against the examples (a language, a function)", () => {
    expect(validateMachineDesignQuestion(q(PDA_CFG, ANBN))).toEqual([]);
    expect(validateMachineDesignQuestion(q(TM_CFG, PLUS2))).toEqual([]);
    expect(machineDesignAuthority(TM_CFG, { reference: PLUS2 })?.key.reference).toEqual(PLUS2);
  });
  it("refuses a missing reference, one the engine cannot read, and one the examples contradict", () => {
    expect(codes(validateMachineDesignQuestion(q(PDA_CFG, undefined)))).toEqual(["MACHINE_KEY_INVALID"]);
    const twoMoves = { ...ANBN, transitions: [...ANBN.transitions, pdaMove("q0", "a", "⏊", "push", "A", "q2")] };
    expect(codes(validateMachineDesignQuestion(q(PDA_CFG, twoMoves)))).toEqual(["MACHINE_KEY_UNREADABLE"]);
    expect(codes(validateMachineDesignQuestion(q(PDA_CFG, { ...ANBN, accept: ["q2"] })))).toEqual(["MACHINE_KEY_EXAMPLE"]);     // rejects ε
    const wrongOutput = { ...TM_CFG, examples: { compute: [{ word: "111", output: "1111" }] } };
    expect(validateMachineDesignQuestion(q(wrongOutput, PLUS2))[0].message).toContain("تعطي «11111»");
    const notInDomain = { ...TM_CFG, examples: { compute: [{ word: "1", output: "111" }] } };
    expect(validateMachineDesignQuestion(q(notInDomain, { ...PLUS2, accept: [] }))[0].message).toContain("لا تقبلها");
    expect(codes(validateMachineDesignQuestion(q(TM_CFG, ANBN)))).toEqual(["MACHINE_KEY_INVALID"]);   // a push-down shape for a Turing question
    expect(codes(validateMachineDesignAnswerKey({ reference: PLUS2 }, { v: 2 }).issues)).toEqual(["MACHINE_KEY_CONFIG_INVALID"]);
  });
  it("AUTO-A12 — the reference's layout: one that reads is a valid part of the key; one that does not is the teacher's to fix", () => {
    expect(validateMachineDesignQuestion({ ...q(TM_CFG, PLUS2), answer: { reference: PLUS2, layout: { q0: [0, 0], q5: [4, 2] } } })).toEqual([]);
    expect(machineDesignAuthority(TM_CFG, { reference: PLUS2, layout: { q0: [0, 0], q5: [4, 2] } })?.key.layout).toEqual({ q0: [0, 0], q5: [4, 2] });
    for (const layout of [{ q0: [0, 21] }, { nowhere: [1, 1] }, { q0: [1.5, 0] }, "x"]) {
      expect(codes(validateMachineDesignQuestion({ ...q(TM_CFG, PLUS2), answer: { reference: PLUS2, layout } })), JSON.stringify(layout)).toEqual(["MACHINE_KEY_LAYOUT"]);
    }
  });
  it("├ is the book's: a reference that steps left of it does not read", () => {
    const leftOfEnd = { ...PLUS2, transitions: [...PLUS2.transitions, tmMove("q5", "├", "├", "L", "q5")] };
    expect(codes(validateMachineDesignQuestion(q(TM_CFG, leftOfEnd)))).toEqual(["MACHINE_KEY_UNREADABLE"]);
  });
});

describe("A11a — the answer", () => {
  it("its shape only: a machine that breaks a rule of the question is kept (the grader judges it), a forged one is refused", () => {
    const seven = { states: ["a1", "a2", "a3", "a4", "a5", "a6", "a7"], start: "a1", accept: [], transitions: [] };
    expect(normalizeMachineDesignAnswer({ kind: "machineDesign", machine: seven })).toEqual({ ok: true, answer: { kind: "machineDesign", machine: seven } });
    expect(bindMachineDesignAnswerToQuestion({ kind: "machineDesign", machine: PLUS2 }, q(TM_CFG, PLUS2))).toEqual({ ok: true, answer: { kind: "machineDesign", machine: PLUS2 } });
    const refused = (a: unknown) => normalizeMachineDesignAnswer(a).ok;
    expect(refused({ kind: "machineDesign", machine: PLUS2, score: 5 })).toBe(false);
    expect(refused({ kind: "machineDesign", machine: { ...PLUS2, states: ["__proto__"] } })).toBe(false);
    expect(refused({ kind: "machineDesign", machine: { ...PLUS2, transitions: [{ ...PLUS2.transitions[0], move: "U" }] } })).toBe(false);
    expect(refused({ kind: "machineDesign", machine: { ...PLUS2, transitions: Array(MACHINE_DESIGN_LIMITS.transitions + 1).fill(PLUS2.transitions[0]) } })).toBe(false);
    expect(refused({ kind: "machineDesign", machine: { ...ANBN, transitions: [{ ...ANBN.transitions[0], op: "swap" }] } })).toBe(false);
    expect(refused({ kind: "automatonDesign", machine: PLUS2 })).toBe(false);
  });
  it("a layout is presentation only: kept when it reads, dropped alone when not", () => {
    expect(normalizeMachineDesignAnswer({ kind: "machineDesign", machine: PLUS2, layout: { q0: [1, 2] } })).toEqual({ ok: true, answer: { kind: "machineDesign", machine: PLUS2, layout: { q0: [1, 2] } } });
    expect(normalizeMachineDesignAnswer({ kind: "machineDesign", machine: PLUS2, layout: { q0: [99, 2] } })).toEqual({ ok: true, answer: { kind: "machineDesign", machine: PLUS2 } });
  });
  it("answered: anything beyond the empty start state", () => {
    expect(isMachineDesignAnswerAnswered({ kind: "machineDesign", machine: { states: ["q0"], start: "q0", accept: [], transitions: [] } })).toBe(false);
    expect(isMachineDesignAnswerAnswered({ kind: "machineDesign", machine: { states: ["q0"], start: "q0", accept: ["q0"], transitions: [] } })).toBe(true);
    expect(isMachineDesignAnswerAnswered({ kind: "machineDesign", machine: PLUS2 })).toBe(true);
    expect(isMachineDesignAnswerAnswered({ kind: "automatonDesign", machine: PLUS2 })).toBe(false);
  });
  it("the answer is what stands between the FIRST two $ (null without two) — parity with the judge: api/tests/certification-a11", () => {
    const cases: [string, string | null][] = [["$11$", "11"], ["ab$1$", "1"], ["$$", ""], ["$1", null], ["", null], ["1$11$1$", "11"]];
    for (const [tape, expected] of cases) expect(answerBetweenDollars([...tape]), tape).toBe(expected);
  });
});
