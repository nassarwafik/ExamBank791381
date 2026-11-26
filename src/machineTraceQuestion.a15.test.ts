import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { buildCourse } from "../scripts/build-automata-course.mjs";
import { readAutomatonConfig, runAutomaton, splitWord, type Machine } from "./learning/activities/automaton";
import {
  MACHINE_TRACE_LIMITS, engineOfTraceMachine, initialTrace, stepTrace, trueTrace, configOfRow, rowOfConfig, gradeTrace, parseTape, tapeText,
  validateMachineTraceConfig, validateMachineTraceQuestion, projectMachineTraceConfigForStudent, machineTraceAuthority,
  normalizeMachineTraceAnswer, isMachineTraceAnswerAnswered, type MachineTraceAnswer, type TraceConfig,
} from "./machineTraceQuestion";

// AUTO-A15a — the machineTrace@1 contract: the one-step function is the book engine's semantics (parity on every simulator of the course),
// the grading is partial and never counts an error twice, the question validates, projects and binds as specified.
type Raw = { unit: number; pageId: string; block: Record<string, unknown> & { id: string; type: string } };
const { raw } = buildCourse() as { raw: Raw[] };
const sims = raw.filter(r => r.block.type === "simulation" && r.block.simulationType === "automaton-trace");
const blankOf = (m: Machine) => (m.kind === "TM" ? m.blank : "");
const trim = (cells: string[], head: number, blank: string) => { let lo = 0, hi = cells.length - 1; while (lo < head && cells[lo] === blank) lo++; while (hi > head && cells[hi] === blank) hi--; return { cells: cells.slice(lo, hi + 1), head: head - lo }; };
/** The engine's run as configurations: its final summary step repeats the last configuration (dropped); an NFA's dead set is kept. */
function engineConfigs(m: Machine, symbols: string[]): TraceConfig[] {
  const res = runAutomaton(m, symbols);
  const out = res.steps.map(s => ({ states: s.active, read: m.kind === "TM" ? 0 : s.read, ...(s.stack ? { stack: s.stack } : {}), ...(s.tape ? trim(s.tape.cells, s.tape.head, blankOf(m)) : {}) }));
  const key = (c: TraceConfig) => JSON.stringify(c);
  while (out.length > 1 && key(out[out.length - 1]) === key(out[out.length - 2])) out.pop();
  return out;
}
const dfa = { kind: "DFA", states: ["q0", "q1", "q2"], alphabet: ["a", "b"], start: "q0", accept: ["q2"], transitions: [["q0", "a", "q1"], ["q1", "b", "q2"], ["q2", "a", "q1"], ["q2", "b", "q0"], ["q0", "b", "q0"], ["q1", "a", "q1"]] };
const machineOf = (rawM: Record<string, unknown>) => engineOfTraceMachine(rawM)!;
const ans = (rows: object[], verdict: "accept" | "reject" | null = null): MachineTraceAnswer => ({ kind: "machineTrace", rows: rows as never, verdict });

describe("A15a — the one step is the book engine's semantics", () => {
  it("on every simulator of the course and each of its words, the trace IS the engine's run (states, stack, tape and head) and its verdict", () => {
    let runs = 0;
    const kinds = new Set<string>();
    for (const s of sims) {
      const cfg = readAutomatonConfig(s.block.config)!;
      const m = cfg.machine;
      for (const w of new Set([...cfg.words, cfg.word, ""])) {
        const split = splitWord(m, w);
        if (!split.ok) continue;
        const res = runAutomaton(m, split.symbols);
        if (res.verdict === "nohalt") continue;
        const run = trueTrace(m, split.symbols, 2000)!;
        expect(run.rows, s.block.id + " «" + w + "»").toEqual(engineConfigs(m, split.symbols));
        expect(run.verdict, s.block.id + " «" + w + "»").toBe(res.verdict === "accept" ? "accept" : "reject");
        runs++; kinds.add(m.kind);
      }
    }
    expect([...kinds].sort()).toEqual(["DFA", "NFA", "PDA", "TM"]);
    expect(runs).toBeGreaterThan(150);
  });

  it("each row reads back to its configuration: rowOfConfig then configOfRow is the identity on every true run", () => {
    for (const s of sims) {
      const cfg = readAutomatonConfig(s.block.config)!;
      const split = splitWord(cfg.machine, cfg.word);
      if (!split.ok) continue;
      const run = trueTrace(cfg.machine, split.symbols, 2000);
      if (!run) continue;
      run.rows.forEach((c, k) => expect(configOfRow(cfg.machine, rowOfConfig(cfg.machine, c), k), s.block.id + " row " + k).toEqual(c));
    }
  });
});

describe("A15a — the tape as written", () => {
  it("one cell in [ ] is the head; spaces ignored; anything else refused", () => {
    expect(parseTape("├A[a]bb")).toEqual({ cells: ["├", "A", "a", "b", "b"], head: 2 });
    expect(parseTape(" ├ A [a] b b ")).toEqual({ cells: ["├", "A", "a", "b", "b"], head: 2 });
    expect(parseTape("[∆]")).toEqual({ cells: ["∆"], head: 0 });
    for (const bad of ["├Aabb", "[a][b]", "[ab]", "a]", "[]", "[a"]) expect(parseTape(bad), bad).toBeNull();
    expect(tapeText(["├", "A", "a"], 1)).toBe("├[A]a");
  });
  it("blanks at both ends do not matter, the head's cell does", () => {
    const tm = machineOf({ kind: "TM", states: ["q0", "q1"], alphabet: ["a"], start: "q0", accept: ["q1"], transitions: [{ from: "q0", read: "a", write: "a", move: "R", to: "q0" }, { from: "q0", read: "∆", write: "∆", move: "S", to: "q1" }] });
    expect(configOfRow(tm, { state: "q0", tape: "∆∆a[a]∆∆" }, 3)).toEqual(configOfRow(tm, { state: "q0", tape: "a[a]" }, 0));
    expect(configOfRow(tm, { state: "q0", tape: "aa[∆]" }, 0)).toEqual({ states: ["q0"], read: 0, cells: ["a", "a", "∆"], head: 2 });
  });
});

describe("A15a — grading: partial, and an error is never counted twice", () => {
  const m = machineOf(dfa);   // abab: q0 -a→ q1 -b→ q2 -a→ q1 -b→ q2 → accept
  it("the true run and its verdict earn every part", () => {
    expect(trueTrace(m, [..."abab"])!.rows.map(c => c.states[0])).toEqual(["q0", "q1", "q2", "q1", "q2"]);
    expect(gradeTrace(m, "abab", ans(["q0", "q1", "q2", "q1", "q2"].map(state => ({ state })), "accept")))
      .toEqual({ parts: 6, right: 6, rows: [true, true, true, true, true], verdict: true, trueRows: 5 });
  });
  it("one wrong row costs ONE part: the next row, the true step from the student's own wrong row, is right", () => {
    // row 2 written q0 (wrong); from q0 reading «a» the machine goes to q1 — the student's q1 is right, then q2 (the true one) is right
    const g = gradeTrace(m, "abab", ans(["q0", "q1", "q0", "q1", "q2"].map(state => ({ state })), "accept"))!;
    expect(g.rows).toEqual([true, true, false, true, true]);
    expect(g.right).toBe(5);
  });
  it("a row that follows neither the student's previous row nor the truth is wrong; a missing or unreadable row is wrong", () => {
    expect(gradeTrace(m, "abab", ans([{ state: "q0" }, { state: "q2" }, { state: "q2" }, {}, { state: "zz" }], "reject"))!.rows).toEqual([true, false, true, false, false]);
    expect(gradeTrace(m, "abab", ans([{ state: "q0" }], null))).toMatchObject({ right: 1, verdict: false });
  });
  it("rows past the true run are not graded; the verdict is one part", () => {
    const rows = ["q0", "q1", "q2", "q1", "q2", "q0", "q1"].map(state => ({ state }));
    expect(gradeTrace(m, "abab", ans(rows, "reject"))).toMatchObject({ parts: 6, right: 5, verdict: false });
  });
  it("a push-down automaton: the stack must be the one the step makes; a Turing machine: the tape and the head", () => {
    const pda = machineOf({ kind: "PDA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [
      { from: "q0", read: "a", top: "⏊", op: "push", write: "A", to: "q0" }, { from: "q0", read: "a", top: "A", op: "push", write: "A", to: "q0" },
      { from: "q0", read: "b", top: "A", op: "pop", write: "A", to: "q1" }, { from: "q1", read: "b", top: "A", op: "pop", write: "A", to: "q1" }] });
    expect(trueTrace(pda, [..."aabb"])!.rows.map(c => rowOfConfig(pda, c))).toEqual([{ state: "q0", stack: "⏊" }, { state: "q0", stack: "⏊A" }, { state: "q0", stack: "⏊AA" }, { state: "q1", stack: "⏊A" }, { state: "q1", stack: "⏊" }]);
    const g = gradeTrace(pda, "aabb", ans([{ state: "q0", stack: "⏊" }, { state: "q0", stack: "⏊A" }, { state: "q0", stack: "⏊A" }, { state: "q1", stack: "⏊" }, { state: "q1", stack: "⏊" }], "accept"))!;
    expect(g.rows).toEqual([true, true, false, true, true]);   // row 3 is the step from the student's own (wrong) row 2: «⏊A» pop → «⏊»
    const tm = machineOf({ kind: "TM", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], leftEnd: "├", transitions: [
      { from: "q0", read: "a", write: "A", move: "R", to: "q0" }, { from: "q0", read: "b", write: "b", move: "S", to: "q1" }] });
    expect(trueTrace(tm, [..."ab"])!.rows.map(c => rowOfConfig(tm, c))).toEqual([{ state: "q0", tape: "├[a]b" }, { state: "q0", tape: "├A[b]" }, { state: "q1", tape: "├A[b]" }]);
    expect(gradeTrace(tm, "ab", ans([{ state: "q0", tape: "├[a]b" }, { state: "q0", tape: "├A[b]" }, { state: "q1", tape: "├A[b]∆∆" }], "accept"))!.right).toBe(4);
  });
  it("a non-deterministic automaton: the set of states (order free); an empty set is the dead end", () => {
    const nfa = machineOf({ kind: "NFA", states: ["p", "q", "r"], alphabet: ["a", "b"], start: "p", accept: ["r"], transitions: [["p", "a", "p"], ["p", "a", "q"], ["q", "b", "r"]] });
    expect(trueTrace(nfa, [..."ab"])!.rows.map(c => c.states)).toEqual([["p"], ["p", "q"], ["r"]]);
    expect(gradeTrace(nfa, "ab", ans([{ states: ["p"] }, { states: ["q", "p"] }, { states: ["r"] }], "accept"))!.right).toBe(4);
    expect(trueTrace(nfa, [..."bb"])!.rows.map(c => c.states)).toEqual([["p"], []]);
  });
});

describe("A15a — the question", () => {
  const node = (machineTrace: unknown, answer: unknown = {}) => ({ presentationType: "machineTrace", questionTypeVersion: 1, text: "تتبّع", marks: 4, machineTrace, answer });
  it("a valid config: the canonical machine and word; the key stays empty", () => {
    const r = validateMachineTraceConfig({ v: 1, machine: dfa, word: "abab" });
    expect(r.ok && r.config).toEqual({ v: 1, machine: dfa, word: "abab" });
    expect(validateMachineTraceQuestion(node({ v: 1, machine: dfa, word: "abab" }))).toEqual([]);
    expect(validateMachineTraceQuestion(node({ v: 1, machine: dfa, word: "abab" }, { run: ["q0"] })).map(i => i.code)).toEqual(["TRACE_KEY_INVALID"]);
    expect(machineTraceAuthority({ v: 1, machine: dfa, word: "abab" }, { run: 1 })).toBeNull();
  });
  it("refuses: an unknown key, a machine the book's reader refuses, a word outside the alphabet or too long, a run that does not end", () => {
    const code = (c: unknown) => validateMachineTraceQuestion(node(c)).map(i => i.code);
    expect(code({ v: 1, machine: dfa, word: "ab", extra: 1 })).toEqual(["TRACE_CONFIG_INVALID"]);
    expect(code({ v: 1, machine: { ...dfa, start: "zz" }, word: "ab" })).toEqual(["TRACE_MACHINE_INVALID"]);
    expect(code({ v: 1, machine: { ...dfa, stateLabels: {} }, word: "ab" })).toEqual(["TRACE_MACHINE_INVALID"]);
    expect(code({ v: 1, machine: dfa, word: "abc" })).toEqual(["TRACE_WORD_ALPHABET"]);
    expect(code({ v: 1, machine: dfa, word: "a".repeat(13) })).toEqual(["TRACE_WORD_INVALID"]);
    const loop = { kind: "TM", states: ["q0"], alphabet: ["a"], start: "q0", accept: [], transitions: [{ from: "q0", read: "a", write: "a", move: "S", to: "q0" }] };
    expect(code({ v: 1, machine: loop, word: "a" })).toEqual(["TRACE_RUN_TOO_LONG"]);
    expect(MACHINE_TRACE_LIMITS.rows).toBe(32);
  });
  it("the student sees the machine and the word — the canonical copy, never the caller's object", () => {
    const cfg = { v: 1, machine: { ...dfa }, word: "ab" };
    const p = projectMachineTraceConfigForStudent(cfg)!;
    expect(p).toEqual(cfg);
    expect(p.machine).not.toBe(cfg.machine);
  });
  it("the answer's shape is bounded at ingest; a row of the wrong kind is kept (the grader judges it)", () => {
    expect(normalizeMachineTraceAnswer({ kind: "machineTrace", rows: [{ state: "q0" }, { stack: "⏊A" }], verdict: "accept" })).toEqual({ ok: true, answer: { kind: "machineTrace", rows: [{ state: "q0" }, { stack: "⏊A" }], verdict: "accept" } });
    expect(normalizeMachineTraceAnswer({ kind: "machineTrace", rows: [], verdict: undefined })).toEqual({ ok: true, answer: { kind: "machineTrace", rows: [], verdict: null } });
    for (const bad of [
      { kind: "machineTrace", rows: [{ state: "q0", score: 4 }], verdict: null },
      { kind: "machineTrace", rows: Array(33).fill({ state: "q0" }), verdict: null },
      { kind: "machineTrace", rows: [{ state: "q".repeat(9) }], verdict: null },
      { kind: "machineTrace", rows: [], verdict: "maybe" },
      { kind: "machineTrace", rows: [], verdict: null, correct: true },
      { kind: "machineDesign", rows: [] },
    ]) expect(normalizeMachineTraceAnswer(bad).ok, JSON.stringify(bad).slice(0, 60)).toBe(false);
    expect(isMachineTraceAnswerAnswered({ kind: "machineTrace", rows: [{}, { state: "" }], verdict: null })).toBe(false);
    expect(isMachineTraceAnswerAnswered({ kind: "machineTrace", rows: [{ state: "q0" }], verdict: null })).toBe(true);
    expect(isMachineTraceAnswerAnswered({ kind: "machineTrace", rows: [], verdict: "reject" })).toBe(true);
  });
  it("the start configuration of each kind", () => {
    expect(initialTrace(machineOf(dfa), [..."ab"])).toEqual({ states: ["q0"], read: 0 });
    expect(stepTrace(machineOf(dfa), { states: ["q0"], read: 2 }, [..."ab"])).toBeNull();
  });
});
