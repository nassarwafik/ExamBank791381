// AUTO-A8 (docs/enterprise-automata-lab-a4.md §11) — the learner's finite-automaton draft and the machine it stands for: shared by the
// book's «صمّم الآلة» activity, the exam's automatonDesign@1 question (the student's answer and the teacher's reference) and their
// builder (AutomatonBuilder.tsx). The draft is the lab's own (automataLab.ts LabDraft), so the lab's pure edits apply to it. Pure.
// AUTO-A9 — the draft's layout (where states were put by mouse) travels beside the machine: layoutOfDraft / draftOfMachine(…, layout).
import type { LabDraft } from "../../studentTools/automataLab";

export type FaRules = { machine: "DFA" | "NFA"; alphabet: string[]; maxStates: number; complete: boolean };
/** The machine the server reads: transitions [from, symbol, to] in table order (never the drawing's layout). */
export type FaMachine = { states: string[]; start: string; accept: string[]; transitions: [string, string, string][] };

export const EPS = "ε";
const cellKey = (state: string, symbol: string) => state + "|" + symbol;
/** The table's columns: the alphabet, and ε for a non-deterministic automaton. */
export const symbolsOf = (rules: Pick<FaRules, "machine" | "alphabet">): string[] => (rules.machine === "NFA" ? [...rules.alphabet, EPS] : [...rules.alphabet]);

/** One empty start state q0. */
export const initialFaDraft = (rules: Pick<FaRules, "machine" | "alphabet">): LabDraft =>
  ({ kind: rules.machine, alphabet: [...rules.alphabet], states: ["q0"], start: "q0", accept: [], labels: {}, cells: {}, pda: [], tm: [], leftEnd: false });

export function machineOfDraft(d: LabDraft, rules: Pick<FaRules, "machine" | "alphabet">): FaMachine {
  const transitions: [string, string, string][] = [];
  for (const q of d.states) for (const s of symbolsOf(rules)) for (const t of d.cells[cellKey(q, s)] ?? []) if (d.states.includes(t)) transitions.push([q, s, t]);
  return { states: [...d.states], start: d.start, accept: d.accept.filter(q => d.states.includes(q)), transitions };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/**
 * A stored machine (a saved answer, the teacher's reference) back into a draft, keeping only what the builder can show: distinct string
 * states, a start among them (else the first), accepting states among them, and the arrows whose ends are states and whose symbol is a
 * column of the table (a deterministic automaton keeps the first arrow of a state and symbol). Anything else → null (start afresh).
 */
export function draftOfMachine(rules: Pick<FaRules, "machine" | "alphabet">, raw: unknown, layout?: unknown): LabDraft | null {
  if (!isObj(raw) || !Array.isArray(raw.states)) return null;
  const states = [...new Set(raw.states.filter((q): q is string => typeof q === "string" && q.length > 0 && q.length <= 8))];
  if (!states.length) return null;
  const start = typeof raw.start === "string" && states.includes(raw.start) ? raw.start : states[0];
  const accept = Array.isArray(raw.accept) ? [...new Set(raw.accept.filter((q): q is string => typeof q === "string" && states.includes(q)))] : [];
  const symbols = symbolsOf(rules), cells: Record<string, string[]> = {};
  for (const t of Array.isArray(raw.transitions) ? raw.transitions : []) {
    if (!Array.isArray(t) || t.length !== 3) continue;
    const [from, sym, to] = t;
    if (typeof from !== "string" || typeof sym !== "string" || typeof to !== "string" || !states.includes(from) || !states.includes(to) || !symbols.includes(sym)) continue;
    const k = cellKey(from, sym), now = cells[k] ?? [];
    if (rules.machine === "DFA" ? now.length === 0 : !now.includes(to)) cells[k] = [...now, to];
  }
  // AUTO-A9 — where the states were put on the drawing (cells of these states only; the rest is the book's automatic layout)
  const cellsOf: Record<string, [number, number]> = {};
  if (isObj(layout)) for (const q of states) { const c = layout[q]; if (Array.isArray(c) && c.length === 2 && c.every(v => Number.isInteger(v) && v >= 0 && v <= 20)) cellsOf[q] = [c[0], c[1]]; }
  return { ...initialFaDraft(rules), states, start, accept, cells, ...(Object.keys(cellsOf).length ? { layout: cellsOf } : {}) };
}

/** AUTO-A9 — the draft's chosen cells for its own states (what is saved beside the machine), or undefined when none. */
export function layoutOfDraft(d: LabDraft): Record<string, [number, number]> | undefined {
  if (!d.layout) return undefined;
  const out: Record<string, [number, number]> = {};
  for (const q of d.states) { const c = d.layout[q]; if (c) out[q] = [c[0], c[1]]; }
  return Object.keys(out).length ? out : undefined;
}
