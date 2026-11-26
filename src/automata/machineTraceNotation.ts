// AUTO-A15a — the teacher writes the machine of a machineTrace@1 question in the BOOK's notation, one transition per line
// (scripts/automata-course/dsl.mjs): a finite automaton «q0 a q1» (several symbols «q0 a,b q1»; ε in a non-deterministic one), a push-down
// automaton «q0 → q1 : ادفع a,⏊/S» (اسحب / بلا تغيير), a Turing machine «q0 → q1 : a/A,R» («->» is accepted for «→»). The states are the start,
// then every state the lines name, then the accepting ones. Pure; the book's own reader (machineTraceQuestion.engineOfTraceMachine) decides
// whether the result is a machine — this module only turns text into the simulator's shape and back.
import type { MachineTraceKind, MachineTraceMachine } from "../machineTraceQuestion";

export type TraceNotation = { kind: MachineTraceKind; alphabet: string; start: string; accept: string; transitions: string; leftEnd: boolean };
export type ParsedNotation = { machine: MachineTraceMachine; badLines: number[] };

const list = (text: string) => [...new Set(text.split(/[\s,،]+/).map(s => s.trim()).filter(Boolean))];
const OPS: Record<string, "push" | "pop" | "none"> = { "ادفع": "push", "اسحب": "pop", "بلا": "none" };
const PDA_LINE = /^(\S+)\s*(?:→|->)\s*(\S+)\s*:\s*(ادفع|اسحب|بلا تغيير)\s+(\S),(\S)\/(\S*)$/u;
const TM_LINE = /^(\S+)\s*(?:→|->)\s*(\S+)\s*:\s*(\S)\/(\S),([LRS])$/u;

/** The text as the simulator's machine; `badLines` lists (1-based) the lines that are not a transition of this kind. */
export function parseTraceNotation(n: TraceNotation): ParsedNotation {
  const lines = n.transitions.split("\n").map(l => l.trim());
  const badLines: number[] = [];
  const named: string[] = [];
  const name = (q: string) => { if (!named.includes(q)) named.push(q); };
  const transitions: unknown[] = [];
  lines.forEach((line, i) => {
    if (!line) return;
    if (n.kind === "DFA" || n.kind === "NFA") {
      const parts = line.split(/\s+/);
      if (parts.length !== 3) { badLines.push(i + 1); return; }
      const [from, syms, to] = parts;
      name(from); name(to);
      for (const s of syms.split(",").filter(Boolean)) transitions.push([from, s, to]);
      return;
    }
    if (n.kind === "PDA") {
      const m = PDA_LINE.exec(line);
      if (!m) { badLines.push(i + 1); return; }
      name(m[1]); name(m[2]);
      transitions.push({ from: m[1], read: m[4], top: m[5], op: OPS[m[3].split(" ")[0]], write: m[6], to: m[2] });
      return;
    }
    const m = TM_LINE.exec(line);
    if (!m) { badLines.push(i + 1); return; }
    name(m[1]); name(m[2]);
    transitions.push({ from: m[1], read: m[3], write: m[4], move: m[5], to: m[2] });
  });
  const start = n.start.trim();
  const accept = list(n.accept);
  const states = [...new Set([start, ...named, ...accept].filter(Boolean))];
  const machine = { kind: n.kind, states, alphabet: list(n.alphabet), start, accept, transitions, ...(n.kind === "TM" && n.leftEnd ? { leftEnd: "├" } : {}) } as MachineTraceMachine;
  return { machine, badLines };
}

const OP_WORD: Record<string, string> = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };
/** The simulator's machine as the notation (for editing a stored question). Unknown shapes give empty text, never a throw. */
export function formatTraceNotation(m: Record<string, unknown> | undefined): TraceNotation {
  const kind = (m && ["DFA", "NFA", "PDA", "TM"].includes(m.kind as string) ? m.kind : "DFA") as MachineTraceKind;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const lines = arr(m?.transitions).map(t => {
    if (Array.isArray(t)) return t.join(" ");
    const o = (t ?? {}) as Record<string, string>;
    return kind === "PDA" ? `${o.from} → ${o.to} : ${OP_WORD[o.op] ?? "ادفع"} ${o.read},${o.top}/${o.write ?? ""}` : `${o.from} → ${o.to} : ${o.read}/${o.write},${o.move}`;
  });
  return { kind, alphabet: arr(m?.alphabet).join(", "), start: typeof m?.start === "string" ? m.start : "", accept: arr(m?.accept).join(", "), transitions: lines.join("\n"), leftEnd: m?.leftEnd !== undefined };
}
