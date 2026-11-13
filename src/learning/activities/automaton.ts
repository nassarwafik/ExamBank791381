// AUTO-A1 (docs/enterprise-automata-simulator-a1.md) — the DATA and the RUNNERS of «تتبّع الآلة خطوة بخطوة»
// (simulation / automaton-trace / v1). Pure: no React, no network, no timers. Shared by AutomatonTraceActivity.tsx and its tests.
//
// A block's config carries ONE machine in the authoring shape of the course prompt (the same shape ChatGPT writes and the
// conversion keeps): a finite automaton (DFA / NFA) as [from, symbol, to] triples, a push-down automaton in the course's notation
// («ادفع a,⏊/S» = read a with ⏊ on top, push S) and a Turing machine as «a/A,R». `readAutomatonConfig` checks every field and
// returns null on anything unexpected (the activity then says it is unavailable — it never guesses). `runAutomaton` executes the
// machine on one word and records every step (the active states, the arrows just used, the stack or the tape, and one Arabic
// sentence). Nothing from content is ever executed: the machine is a table of data and these runners only look it up.

export type AutomatonKind = "DFA" | "NFA" | "PDA" | "TM";
export const AUTOMATON_KINDS: readonly AutomatonKind[] = ["DFA", "NFA", "PDA", "TM"];

export type FaTransition = { from: string; symbol: string; to: string };
export type PdaOp = "push" | "pop" | "none";
export type PdaTransition = { from: string; read: string; top: string; op: PdaOp; write: string[]; to: string };
export type TmMove = "L" | "R" | "S";
export type TmTransition = { from: string; read: string; write: string; move: TmMove; to: string };

interface MachineBase {
  states: string[];
  alphabet: string[];
  start: string;
  accept: string[];
  /** Words written beside a state on the source diagram, translated («باقي 1»). Display only. */
  stateLabels: Record<string, string>;
}
export interface FaMachine extends MachineBase { kind: "DFA" | "NFA"; transitions: FaTransition[] }
export interface PdaMachine extends MachineBase { kind: "PDA"; transitions: PdaTransition[]; bottom: string; stackAlphabet: string[] }
export interface TmMachine extends MachineBase {
  kind: "TM"; transitions: TmTransition[]; blank: string; tapeAlphabet: string[];
  /** The course's left boundary mark ├ just before the input (the head starts on the first input letter after it). Never overwritten. */
  leftEnd?: string;
}
export type Machine = FaMachine | PdaMachine | TmMachine;

export type AutomatonConfig = {
  machine: Machine;
  /** Example words offered as one-tap chips (each already checked against the alphabet). */
  words: string[];
  /** The word loaded first (defaults to the first example word, else the empty word). */
  word: string;
  /** Optional grid placement {state: [column, row]} that overrides the automatic layout (to match the source drawing). */
  layout?: Record<string, [number, number]>;
};

export const LIMITS = { states: 24, transitions: 240, symbols: 12, word: 40, words: 12, tmSteps: 1000, stackShown: 40 } as const;
/** How the course writes the empty word on an arrow of a non-deterministic automaton. */
export const EPSILON_SYMBOLS: readonly string[] = ["ε", "λ"];

const isStr = (v: unknown): v is string => typeof v === "string";
const chars = (s: string): string[] => [...s];
/** One printable symbol (one code point, not a space, not a separator used in labels). */
const isSymbol = (v: unknown): v is string => isStr(v) && chars(v).length === 1 && !/[\s,/|]/.test(v);
/** A state name as drawn: q0, p1, q0q1, {q0,q1}, q0new … — short, no spaces. */
const isStateName = (v: unknown): v is string => isStr(v) && v.length >= 1 && v.length <= 16 && /^[\p{L}\p{N}_'{},]+$/u.test(v);
const unique = (xs: string[]) => new Set(xs).size === xs.length;
const OPS: Record<string, PdaOp> = { push: "push", pop: "pop", none: "none" };

function readBase(a: Record<string, unknown>): MachineBase | null {
  const { states, alphabet, start, accept } = a;
  if (!Array.isArray(states) || states.length < 1 || states.length > LIMITS.states || !states.every(isStateName) || !unique(states as string[])) return null;
  if (!Array.isArray(alphabet) || alphabet.length < 1 || alphabet.length > LIMITS.symbols || !alphabet.every(isSymbol) || !unique(alphabet as string[])) return null;
  if ((alphabet as string[]).some(s => EPSILON_SYMBOLS.includes(s))) return null;
  if (!isStr(start) || !(states as string[]).includes(start)) return null;
  if (!Array.isArray(accept) || !accept.every(s => isStr(s) && (states as string[]).includes(s)) || !unique(accept as string[])) return null;
  const labels: Record<string, string> = {};
  if (a.stateLabels !== undefined) {
    if (!a.stateLabels || typeof a.stateLabels !== "object" || Array.isArray(a.stateLabels)) return null;
    for (const [k, v] of Object.entries(a.stateLabels as Record<string, unknown>)) {
      if (!(states as string[]).includes(k) || !isStr(v) || v.length > 24) return null;
      labels[k] = v;
    }
  }
  return { states: states as string[], alphabet: alphabet as string[], start, accept: accept as string[], stateLabels: labels };
}

function readFa(kind: "DFA" | "NFA", base: MachineBase, raw: unknown[]): FaMachine | null {
  const out: FaTransition[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (!Array.isArray(t) || t.length !== 3) return null;
    const [from, symbol, to] = t;
    if (!isStr(from) || !isStr(to) || !base.states.includes(from) || !base.states.includes(to) || !isStr(symbol)) return null;
    const eps = EPSILON_SYMBOLS.includes(symbol);
    if (!eps && !base.alphabet.includes(symbol)) return null;
    if (kind === "DFA" && eps) return null;                              // a deterministic automaton reads one symbol per arrow
    const key = JSON.stringify(kind === "DFA" ? [from, symbol] : [from, symbol, to]);
    if (seen.has(key)) return null;                                      // DFA: one arrow per (state, symbol); NFA: no duplicate arrow
    seen.add(key);
    out.push({ from, symbol: eps ? "ε" : symbol, to });
  }
  return { kind, ...base, transitions: out };
}

function readPda(base: MachineBase, a: Record<string, unknown>, raw: unknown[]): PdaMachine | null {
  const bottom = a.bottom === undefined ? "⏊" : a.bottom;
  if (!isSymbol(bottom) || base.alphabet.includes(bottom)) return null;
  const declared = a.stackAlphabet === undefined ? [] : a.stackAlphabet;
  if (!Array.isArray(declared) || !declared.every(isSymbol) || declared.includes(bottom)) return null;
  const stackAlphabet = new Set<string>(declared as string[]);
  const out: PdaTransition[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const o = (t ?? {}) as Record<string, unknown>;
    const { from, read, top, to } = o;
    const op = isStr(o.op) ? OPS[o.op] : undefined;
    const write = o.write === undefined ? "" : o.write;
    if (!isStr(from) || !isStr(to) || !base.states.includes(from) || !base.states.includes(to)) return null;
    if (!isStr(read) || !base.alphabet.includes(read) || !isSymbol(top) || !op || !isStr(write) || /\s/.test(write) || chars(write).length > 8) return null;
    const w = chars(write);
    if (w.includes(bottom)) return null;                                 // the bottom of the stack is never pushed again
    if (op === "push" && w.length === 0) return null;                    // «ادفع» pushes at least one symbol
    if (op === "pop" && (top === bottom || (w.length > 0 && write !== top))) return null;  // never pop an empty stack; «اسحب b,A/A»
    if (op === "none" && w.length > 0) return null;
    const key = JSON.stringify([from, read, top]);
    if (seen.has(key)) return null;                                      // deterministic: one move per (state, symbol, top)
    seen.add(key);
    if (top !== bottom) stackAlphabet.add(top);
    if (op === "push") for (const s of w) stackAlphabet.add(s);
    out.push({ from, read, top, op, write: w, to });   // a pop keeps its label as written («اسحب b,A/A»); only push uses it
  }
  return { kind: "PDA", ...base, transitions: out, bottom, stackAlphabet: [...stackAlphabet] };
}

function readTm(base: MachineBase, a: Record<string, unknown>, raw: unknown[]): TmMachine | null {
  const blank = a.blank === undefined ? "∆" : a.blank;
  if (!isSymbol(blank) || base.alphabet.includes(blank)) return null;
  const leftEnd = a.leftEnd;
  if (leftEnd !== undefined && (!isSymbol(leftEnd) || leftEnd === blank || base.alphabet.includes(leftEnd))) return null;
  const declared = a.tapeAlphabet === undefined ? [] : a.tapeAlphabet;
  if (!Array.isArray(declared) || !declared.every(isSymbol)) return null;
  const tapeAlphabet = new Set<string>([...base.alphabet, ...(declared as string[]), blank]);
  const out: TmTransition[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const o = (t ?? {}) as Record<string, unknown>;
    const { from, read, write, move, to } = o;
    if (!isStr(from) || !isStr(to) || !base.states.includes(from) || !base.states.includes(to)) return null;
    if (!isSymbol(read) || !isSymbol(write) || (move !== "L" && move !== "R" && move !== "S")) return null;
    if (leftEnd !== undefined && (read === leftEnd) !== (write === leftEnd)) return null;   // ├ is never written over nor written elsewhere
    if (leftEnd !== undefined && read === leftEnd && move === "L") return null;          // nothing lies left of ├
    const key = JSON.stringify([from, read]);
    if (seen.has(key)) return null;                                      // deterministic: one move per (state, symbol under the head)
    seen.add(key);
    tapeAlphabet.add(read); tapeAlphabet.add(write);
    out.push({ from, read, write, move, to });
  }
  if (leftEnd !== undefined) tapeAlphabet.add(leftEnd);
  return { kind: "TM", ...base, transitions: out, blank, tapeAlphabet: [...tapeAlphabet], ...(leftEnd !== undefined ? { leftEnd } : {}) };
}

/** The word's symbols, or the first symbol that is not in the alphabet. */
export function splitWord(machine: Machine, word: string): { ok: true; symbols: string[] } | { ok: false; bad: string } {
  const symbols = chars(word);
  const bad = symbols.find(s => !machine.alphabet.includes(s));
  return bad === undefined ? { ok: true, symbols } : { ok: false, bad };
}

/** Validates a block config; anything unexpected → null. Pure. */
export function readAutomatonConfig(config: unknown): AutomatonConfig | null {
  const c = (config ?? {}) as Record<string, unknown>;
  const a = (c.automaton ?? null) as Record<string, unknown> | null;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const kind = a.kind === "eNFA" ? "NFA" : a.kind;
  if (!isStr(kind) || !(AUTOMATON_KINDS as readonly string[]).includes(kind)) return null;
  const base = readBase(a);
  const raw = a.transitions;
  if (!base || !Array.isArray(raw) || raw.length > LIMITS.transitions) return null;
  const machine = kind === "PDA" ? readPda(base, a, raw) : kind === "TM" ? readTm(base, a, raw) : readFa(kind as "DFA" | "NFA", base, raw);
  if (!machine) return null;

  const rawWords = c.words === undefined ? (c.sampleWords === undefined ? [] : c.sampleWords) : c.words;
  if (!Array.isArray(rawWords) || rawWords.length > LIMITS.words) return null;
  const words: string[] = [];
  for (const w of rawWords) {
    if (!isStr(w) || chars(w).length > LIMITS.word || !splitWord(machine, w).ok) return null;
    if (!words.includes(w)) words.push(w);
  }
  const word = c.word === undefined ? (words[0] ?? "") : c.word;
  if (!isStr(word) || chars(word).length > LIMITS.word || !splitWord(machine, word).ok) return null;

  let layout: Record<string, [number, number]> | undefined;
  if (c.layout !== undefined) {
    if (!c.layout || typeof c.layout !== "object" || Array.isArray(c.layout)) return null;
    layout = {};
    const used = new Set<string>();
    for (const [s, p] of Object.entries(c.layout as Record<string, unknown>)) {
      if (!machine.states.includes(s) || !Array.isArray(p) || p.length !== 2 || !p.every(n => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 20)) return null;
      const cellKey = p.join(":");
      if (used.has(cellKey)) return null;                                // two states never share a cell
      used.add(cellKey);
      layout[s] = [p[0] as number, p[1] as number];
    }
    if (Object.keys(layout).length !== machine.states.length) return null; // a layout places every state or none
  }
  return { machine, words, word, ...(layout ? { layout } : {}) };
}

// ────────────────────────────────────────────────────────────────────────────
// Running a word
// ────────────────────────────────────────────────────────────────────────────

/** The arrow an edge of the drawing stands for (all symbols between two states share one drawn arrow). */
export const edgeKey = (from: string, to: string) => from + " " + to;   // a space never occurs in a state name

export type TapeView = { cells: string[]; head: number };
export type RunStep = {
  /** How many symbols of the word have been read (finite and push-down automata). */
  read: number;
  /** The current state(s): one for DFA / PDA / TM, a set for an NFA (empty when every path died). */
  active: string[];
  /** The drawn arrows used to reach this step (none on the first step). */
  used: string[];
  /** The stack from bottom to top (push-down automaton only). */
  stack?: string[];
  /** The visible part of the tape and the head's index in it (Turing machine only). */
  tape?: TapeView;
  /** What this step did: the symbol read (DFA / NFA) or the move label («ادفع a,⏊/S», «a/A,R»). Marks the row in the table. */
  move?: string;
  note: string;
};
export type Verdict = "accept" | "reject" | "stuck" | "nohalt";
export type RunResult = { steps: RunStep[]; verdict: Verdict; summary: string };

const OP_WORD: Record<PdaOp, string> = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };
export const pdaLabel = (t: PdaTransition) => OP_WORD[t.op] + " " + t.read + "," + t.top + "/" + t.write.join("");
export const tmLabel = (t: TmTransition) => t.read + "/" + t.write + "," + t.move;
const setText = (xs: string[]) => "{" + xs.join(", ") + "}";
const shown = (w: string) => (w === "" ? "ε" : w);
const acceptText = (m: Machine, s: string) => (m.accept.includes(s) ? "وهي حالة قبول" : "وهي ليست حالة قبول");

function runDfa(m: FaMachine, symbols: string[]): RunResult {
  const word = symbols.join("");
  let state = m.start;
  const steps: RunStep[] = [{ read: 0, active: [state], used: [], note: "نبدأ من حالة البداية " + state + "." }];
  for (let i = 0; i < symbols.length; i++) {
    const t = m.transitions.find(x => x.from === state && x.symbol === symbols[i]);
    if (!t) {
      const summary = "لا انتقال من " + state + " بالرمز " + symbols[i] + "، فالأوتومات يتوقف قبل نهاية الكلمة: الكلمة " + shown(word) + " مرفوضة.";
      steps.push({ read: i, active: [state], used: [], note: summary });
      return { steps, verdict: "stuck", summary };
    }
    state = t.to;
    steps.push({ read: i + 1, active: [state], used: [edgeKey(t.from, t.to)], move: symbols[i], note: "نقرأ " + symbols[i] + ": من " + t.from + " إلى " + t.to + "." });
  }
  const ok = m.accept.includes(state);
  const summary = "انتهت الكلمة في " + state + "، " + acceptText(m, state) + ": الكلمة " + shown(word) + (ok ? " مقبولة." : " مرفوضة.");
  steps.push({ read: symbols.length, active: [state], used: [], note: summary });
  return { steps, verdict: ok ? "accept" : "reject", summary };
}

/** The states reachable from `from` by ε-arrows alone (including `from`), in the order of the automaton's state list. */
export function epsilonClosure(m: FaMachine, from: string[]): { states: string[]; used: string[] } {
  const reach = new Set(from);
  const used = new Set<string>();
  const todo = [...from];
  while (todo.length) {
    const s = todo.pop() as string;
    for (const t of m.transitions) {
      if (t.from !== s || t.symbol !== "ε") continue;
      used.add(edgeKey(t.from, t.to));
      if (!reach.has(t.to)) { reach.add(t.to); todo.push(t.to); }
    }
  }
  return { states: m.states.filter(s => reach.has(s)), used: [...used] };
}

function runNfa(m: FaMachine, symbols: string[]): RunResult {
  const word = symbols.join("");
  const start = epsilonClosure(m, [m.start]);
  let current = start.states;
  const steps: RunStep[] = [{
    read: 0, active: current, used: start.used,
    note: start.states.length > 1 ? "نبدأ من " + m.start + "، ومعها كل حالة نصلها بأسهم ε: " + setText(current) + "." : "نبدأ من حالة البداية " + m.start + ".",
  }];
  for (let i = 0; i < symbols.length; i++) {
    const moved = m.transitions.filter(t => current.includes(t.from) && t.symbol === symbols[i]);
    const targets = m.states.filter(s => moved.some(t => t.to === s));
    const closure = epsilonClosure(m, targets);
    current = closure.states;
    const used = [...new Set([...moved.map(t => edgeKey(t.from, t.to)), ...closure.used])];
    if (current.length === 0) {
      const summary = "لا انتقال بالرمز " + symbols[i] + " من أي حالة ممكنة، فلا يبقى أي مسار: الكلمة " + shown(word) + " مرفوضة.";
      steps.push({ read: i + 1, active: [], used: [], note: summary });
      return { steps, verdict: "stuck", summary };
    }
    steps.push({ read: i + 1, active: current, used, move: symbols[i], note: "نقرأ " + symbols[i] + ": الحالات الممكنة الآن " + setText(current) + "." });
  }
  const hit = current.filter(s => m.accept.includes(s));
  const ok = hit.length > 0;
  const summary = "انتهت الكلمة والحالات الممكنة " + setText(current) + "، " + (ok ? "ومنها حالة القبول " + hit.join("، ") + ": الكلمة " + shown(word) + " مقبولة." : "وليس بينها حالة قبول: الكلمة " + shown(word) + " مرفوضة.");
  steps.push({ read: symbols.length, active: current, used: [], note: summary });
  return { steps, verdict: ok ? "accept" : "reject", summary };
}

function runPda(m: PdaMachine, symbols: string[]): RunResult {
  const word = symbols.join("");
  let state = m.start;
  const stack = [m.bottom];
  const steps: RunStep[] = [{ read: 0, active: [state], used: [], stack: [...stack], note: "نبدأ من حالة البداية " + state + "، والمكدّس فارغ (في القاع " + m.bottom + " فقط)." }];
  for (let i = 0; i < symbols.length; i++) {
    const top = stack[stack.length - 1];
    const t = m.transitions.find(x => x.from === state && x.read === symbols[i] && x.top === top);
    if (!t) {
      const summary = "لا انتقال من " + state + " بالرمز " + symbols[i] + " وفي قمة المكدّس " + top + "، فالأوتومات يتوقف: الكلمة " + shown(word) + " مرفوضة.";
      steps.push({ read: i, active: [state], used: [], stack: [...stack], note: summary });
      return { steps, verdict: "stuck", summary };
    }
    if (t.op === "push") stack.push(...t.write);
    if (t.op === "pop") stack.pop();
    state = t.to;
    const what = t.op === "push" ? "ندفع " + t.write.join("") + " إلى المكدّس" : t.op === "pop" ? "نسحب " + t.top + " من قمة المكدّس" : "لا نغيّر المكدّس";
    steps.push({ read: i + 1, active: [state], used: [edgeKey(t.from, t.to)], stack: [...stack], move: pdaLabel(t),
      note: "نقرأ " + symbols[i] + " وفي القمة " + top + ": " + what + "، وننتقل من " + t.from + " إلى " + t.to + "." });
  }
  const ok = m.accept.includes(state);
  const summary = "انتهت الكلمة في " + state + "، " + acceptText(m, state) + ": الكلمة " + shown(word) + (ok ? " مقبولة." : " مرفوضة.");
  steps.push({ read: symbols.length, active: [state], used: [], stack: [...stack], note: summary });
  return { steps, verdict: ok ? "accept" : "reject", summary };
}

function runTm(m: TmMachine, symbols: string[]): RunResult {
  const word = symbols.join("");
  const tape = new Map<number, string>();
  symbols.forEach((s, i) => tape.set(i, s));
  if (m.leftEnd !== undefined) tape.set(-1, m.leftEnd);
  let head = 0;
  let state = m.start;
  let lo = m.leftEnd !== undefined ? -1 : 0, hi = Math.max(symbols.length - 1, 0);
  const view = (): TapeView => {
    const from = Math.min(lo, head) - (m.leftEnd !== undefined ? 0 : 1), to = Math.max(hi, head) + 1;   // nothing is shown left of ├
    const cells: string[] = [];
    for (let p = from; p <= to; p++) cells.push(tape.get(p) ?? m.blank);
    return { cells, head: head - from };
  };
  const steps: RunStep[] = [{ read: 0, active: [state], used: [], tape: view(),
    note: "نبدأ من " + state + "، والرأس على " + (symbols.length ? "أول رمز في الكلمة" : "أول خانة") + (m.leftEnd !== undefined ? " بعد علامة بداية الشريط " + m.leftEnd : "") + "." }];
  for (let n = 0; n < LIMITS.tmSteps; n++) {
    const under = tape.get(head) ?? m.blank;
    const t = m.transitions.find(x => x.from === state && x.read === under);
    if (!t) {
      const ok = m.accept.includes(state);
      const summary = "لا انتقال من " + state + " والرمز تحت الرأس " + under + "، فالآلة تتوقف في " + state + "، " + acceptText(m, state) + ": الكلمة " + shown(word) + (ok ? " مقبولة." : " مرفوضة.");
      steps.push({ read: 0, active: [state], used: [], tape: view(), note: summary });
      return { steps, verdict: ok ? "accept" : "reject", summary };
    }
    tape.set(head, t.write);
    head += t.move === "R" ? 1 : t.move === "L" ? -1 : 0;
    lo = Math.min(lo, head); hi = Math.max(hi, head);
    state = t.to;
    const moveText = t.move === "R" ? "ونتحرك يمينًا" : t.move === "L" ? "ونتحرك يسارًا" : "ولا نتحرك";
    steps.push({ read: 0, active: [state], used: [edgeKey(t.from, t.to)], tape: view(), move: tmLabel(t),
      note: "نقرأ " + under + "، نكتب " + t.write + " " + moveText + "، وننتقل من " + t.from + " إلى " + t.to + "." });
  }
  const summary = "لم تتوقف الآلة خلال " + LIMITS.tmSteps + " خطوة. قد لا تتوقف أبدًا على هذه الكلمة.";
  steps.push({ read: 0, active: [state], used: [], tape: view(), note: summary });
  return { steps, verdict: "nohalt", summary };
}

/** Runs the machine on a word already split into alphabet symbols (see `splitWord`). Deterministic and pure. */
export function runAutomaton(m: Machine, symbols: string[]): RunResult {
  if (m.kind === "PDA") return runPda(m, symbols);
  if (m.kind === "TM") return runTm(m, symbols);
  return m.kind === "DFA" ? runDfa(m, symbols) : runNfa(m, symbols);
}

// ────────────────────────────────────────────────────────────────────────────
// Drawing: state positions and one arrow per (from, to)
// ────────────────────────────────────────────────────────────────────────────

export type DrawnEdge = { key: string; from: string; to: string; labels: string[] };
/** One drawn arrow per ordered pair of states, carrying every label between them (a,b,c — or one line per PDA / TM move). */
export function drawnEdges(m: Machine): DrawnEdge[] {
  const out: DrawnEdge[] = [];
  const at = new Map<string, DrawnEdge>();
  for (const t of m.transitions) {
    const key = edgeKey(t.from, t.to);
    let e = at.get(key);
    if (!e) { e = { key, from: t.from, to: t.to, labels: [] }; at.set(key, e); out.push(e); }
    const label = m.kind === "PDA" ? pdaLabel(t as PdaTransition) : m.kind === "TM" ? tmLabel(t as TmTransition) : (t as FaTransition).symbol;
    if (!e.labels.includes(label)) e.labels.push(label);
  }
  if (m.kind === "DFA" || m.kind === "NFA") for (const e of out) e.labels = [e.labels.join(",")];
  return out;
}

/**
 * Grid cells {state: [column, row]}: the author's layout when given, otherwise columns by distance from the start state (as the
 * course draws: the start on the left, the flow to the right), rows in the order states are reached; unreachable states share a
 * last column. Deterministic.
 */
export function gridLayout(m: Machine, given?: Record<string, [number, number]>): Record<string, [number, number]> {
  if (given) return given;
  const dist = new Map<string, number>([[m.start, 0]]);
  const order = [m.start];
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    for (const t of m.transitions) {
      if (t.from === s && !dist.has(t.to)) { dist.set(t.to, (dist.get(s) as number) + 1); order.push(t.to); }
    }
  }
  const maxCol = Math.max(...dist.values());
  for (const s of m.states) if (!dist.has(s)) { dist.set(s, maxCol + 1); order.push(s); }
  const rowsUsed = new Map<number, number>();
  const out: Record<string, [number, number]> = {};
  for (const s of order) {
    const col = dist.get(s) as number;
    const row = rowsUsed.get(col) ?? 0;
    rowsUsed.set(col, row + 1);
    out[s] = [col, row];
  }
  return out;
}
