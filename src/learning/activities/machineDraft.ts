// AUTO-A11a — a push-down automaton / Turing machine between the automata lab's draft (what the row editors and the drawing edit) and the
// SHAPE an exam answer or a reference stores (machineDesign@1: states, start, accepting states, transitions in the automaton-trace format).
// `machineOfLabDraft` keeps every row as the student wrote it — a row that breaks a rule is the grader's to judge, never dropped here;
// `draftOfMachineShape` is its inverse for every shape the contract reads. Pure.
import { initialDraft, type LabDraft, type PdaRow, type TmRow } from "../../studentTools/automataLab";
import type { MachineDesignConfigV1, MachineDesignMachine, PdaMove, TmMove } from "../../machineDesignQuestion";

export type MachineRules = { machine: "PDA" | "TM"; alphabet: string[]; maxStates: number; leftEnd: boolean; mode?: "recognize" | "compute" };

export const initialMachineDraft = (r: MachineRules): LabDraft => ({ ...initialDraft(r.machine), alphabet: [...r.alphabet], leftEnd: r.leftEnd });

/** The draft as a machine shape: the states, the start, the accepting states among them, and every transition row as written. */
export function machineOfLabDraft(d: LabDraft): MachineDesignMachine {
  const transitions: (PdaMove | TmMove)[] = d.kind === "PDA"
    ? d.pda.map(r => ({ from: r.from, read: r.read, top: r.top, op: r.op, write: r.write, to: r.to }))
    : d.tm.map(r => ({ from: r.from, read: r.read, write: r.write, move: r.move, to: r.to }));
  return { states: [...d.states], start: d.start, accept: d.accept.filter(q => d.states.includes(q)), transitions };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
/** A stored machine shape back as a draft under the question's rules (with the drawing's saved cells), or null when it does not read. */
export function draftOfMachineShape(r: MachineRules, raw: unknown, layout?: unknown): LabDraft | null {
  if (!isObj(raw) || !strs(raw.states) || raw.states.length === 0 || typeof raw.start !== "string" || !strs(raw.accept) || !Array.isArray(raw.transitions)) return null;
  const d: LabDraft = { ...initialMachineDraft(r), states: [...raw.states], start: raw.start, accept: raw.accept.filter(q => (raw.states as string[]).includes(q)) };
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  if (r.machine === "PDA") {
    d.pda = raw.transitions.filter(isObj).map((t): PdaRow => ({ from: s(t.from), read: s(t.read), top: s(t.top), op: t.op === "pop" || t.op === "none" ? t.op : "push", write: s(t.write), to: s(t.to) }));
  } else {
    d.tm = raw.transitions.filter(isObj).map((t): TmRow => ({ from: s(t.from), read: s(t.read), write: s(t.write), move: t.move === "L" || t.move === "S" ? t.move : "R", to: s(t.to) }));
  }
  if (isObj(layout)) {
    const cells: Record<string, [number, number]> = {};
    for (const q of d.states) { const c = layout[q]; if (Array.isArray(c) && c.length === 2 && c.every(n => Number.isInteger(n))) cells[q] = [c[0] as number, c[1] as number]; }
    if (Object.keys(cells).length) d.layout = cells;
  }
  return d;
}

/** A machineDesign@1 config's rules for the builder (the student's state limit). */
export function rulesOfConfig(cfg: MachineDesignConfigV1): MachineRules {
  return { machine: cfg.machine, alphabet: [...cfg.alphabet], maxStates: cfg.maxStates, leftEnd: cfg.leftEnd === true, ...(cfg.mode === "compute" ? { mode: "compute" as const } : {}) };
}
/** A config's examples in the builder's shape (every list present, empty when the question has none). */
export function examplesOfConfig(cfg: MachineDesignConfigV1): { accept: string[]; reject: string[]; compute: { word: string; answer: string }[] } {
  const ex = cfg.examples;
  if (ex && "compute" in ex) return { accept: [], reject: [], compute: ex.compute.map(x => ({ word: x.word, answer: x.output })) };
  return { accept: ex ? [...ex.accept] : [], reject: ex ? [...ex.reject] : [], compute: [] };
}
