// AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات»: the DATA side of the automata lab tool. Pure: no React, no DOM,
// no network, no timers, no storage.
//
// The learner builds a machine of one of the course's four kinds (a deterministic or non-deterministic finite automaton, a push-down
// automaton, a Turing machine) in a DRAFT. `checkDraft` turns the draft into the machine the course's own reader accepts
// (readAutomatonConfig — the same strict reader every simulator of the book uses), or names in Arabic each thing that keeps it from
// being one. Everything else works on that machine:
//   • the checks the course teaches — is the automaton complete, is it deterministic, which states cannot be reached — and
//     «أضف حالة مصيدة» (the course's trap state, for a deterministic automaton);
//   • a batch of words at once (accepted / rejected / did not halt);
//   • «لغة آلتي»: every word up to a length the machine accepts, shortest first (shortlex), bounded.
// The machine is a table of data: nothing is evaluated. A Turing machine is stopped after the runners' own step limit.

import {
  AUTOMATON_KINDS, EPSILON_SYMBOLS, LIMITS, epsilonClosure, gridLayout, readAutomatonConfig, runAutomaton, splitWord,
  type AutomatonKind, type FaMachine, type Machine, type PdaOp, type TmMachine, type TmMove, type Verdict,
} from "../learning/activities/automaton";

export { AUTOMATON_KINDS, type AutomatonKind };

/** The course's fixed marks: the bottom of the stack, the blank of the tape, the tape's left end. Never a letter of the alphabet. */
export const BOTTOM = "⏊";
export const BLANK = "∆";
export const LEFT_END = "├";
export const EPS = "ε";
const RESERVED = [BOTTOM, BLANK, LEFT_END, ...EPSILON_SYMBOLS];

/** One printable symbol a learner may use in an alphabet, a stack or a tape (a letter, a digit, or a few marks the course uses). */
const SYMBOL = /^[\p{L}\p{N}#$*+@()[\]<>=.!?_-]$/u;
export const isLabSymbol = (s: string): boolean => [...s].length === 1 && SYMBOL.test(s) && !RESERVED.includes(s);

export const KIND_LABEL: Record<AutomatonKind, string> = {
  DFA: "أوتومات منتهٍ حتمي",
  NFA: "أوتومات منتهٍ غير حتمي",
  PDA: "أوتومات مكدّس",
  TM: "آلة تورنغ",
};

export type PdaRow = { from: string; read: string; top: string; op: PdaOp; write: string; to: string };
export type TmRow = { from: string; read: string; write: string; move: TmMove; to: string };
/** The words of a row editor (the table's, and the arrow's window on the drawing). */
export const MOVE_TEXT: Record<TmMove, string> = { R: "يمينًا R", L: "يسارًا L", S: "بلا حركة S" };
export const OP_TEXT: Record<PdaOp, string> = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };

/** The learner's work. Each kind keeps its own transitions, so switching the kind and back loses nothing. */
export type LabDraft = {
  kind: AutomatonKind;
  alphabet: string[];
  states: string[];
  start: string;
  accept: string[];
  /** Words written beside a state («مصيدة»). */
  labels: Record<string, string>;
  /** Finite automata: «state|symbol» → the target states (a deterministic automaton: at most one; ε only in a non-deterministic one). */
  cells: Record<string, string[]>;
  pda: PdaRow[];
  tm: TmRow[];
  /** Turing machine: the course's left-end mark ├ before the input (the head starts on the input's first letter). */
  leftEnd: boolean;
  /** AUTO-A6b — where the learner placed states by mouse: grid cells [column, row] (the others are placed automatically). */
  layout?: Record<string, [number, number]>;
};

export const cellKey = (state: string, symbol: string): string => state + "|" + symbol;
export const MAX_STATES = LIMITS.states;
export const MAX_TRANSITIONS = LIMITS.transitions;
export const MAX_SYMBOLS = LIMITS.symbols;

export function initialDraft(kind: AutomatonKind = "DFA"): LabDraft {
  return { kind, alphabet: ["a", "b"], states: ["q0"], start: "q0", accept: [], labels: {}, cells: {}, pda: [], tm: [], leftEnd: true };
}

/** The first free name q0, q1, … (or a prefix of the caller's: qT, qT1, …). */
export function nextStateName(states: readonly string[], prefix = "q"): string {
  if (prefix !== "q" && !states.includes(prefix)) return prefix;
  for (let i = prefix === "q" ? 0 : 1; ; i++) if (!states.includes(prefix + i)) return prefix + i;
}

// ────────────────────────────────────────────────────────────────────────────
// Editing (pure: every function returns a new draft)
// ────────────────────────────────────────────────────────────────────────────

export function addState(d: LabDraft): LabDraft {
  if (d.states.length >= MAX_STATES) return d;
  return { ...d, states: [...d.states, nextStateName(d.states)] };
}

/** Removes a state and every arrow from or to it (the start moves to the first state left). The last state is never removed. */
export function removeState(d: LabDraft, q: string): LabDraft {
  if (d.states.length <= 1 || !d.states.includes(q)) return d;
  const states = d.states.filter(s => s !== q);
  const cells: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(d.cells)) if (!k.startsWith(q + "|")) cells[k] = v.filter(t => t !== q);
  const labels = { ...d.labels };
  delete labels[q];
  const layout = d.layout ? { ...d.layout } : undefined;
  if (layout) delete layout[q];
  return {
    ...d, states, start: d.start === q ? states[0] : d.start, accept: d.accept.filter(s => s !== q), labels, cells, ...(layout ? { layout } : {}),
    pda: d.pda.filter(r => r.from !== q && r.to !== q), tm: d.tm.filter(r => r.from !== q && r.to !== q),
  };
}

/** A new alphabet: the arrows of a symbol no longer in it go (they could never be used); the other kinds' rows that read it go too. */
export function setAlphabet(d: LabDraft, alphabet: string[]): LabDraft {
  const cells: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(d.cells)) {
    const sym = k.slice(k.lastIndexOf("|") + 1);
    if (sym === EPS || alphabet.includes(sym)) cells[k] = v;
  }
  return { ...d, alphabet, cells, pda: d.pda.filter(r => r.read === "" || alphabet.includes(r.read)) };
}

/** Parses what the learner typed as an alphabet («a, b» / «ab» / «a b»): its symbols, or the first one that cannot be a letter. */
export function parseAlphabet(text: string): { ok: true; alphabet: string[] } | { ok: false; message: string } {
  const parts = text.includes(",") || /\s/.test(text.trim()) ? text.split(/[\s,]+/).filter(Boolean) : [...text.trim()];
  const out: string[] = [];
  for (const p of parts) {
    if ([...p].length !== 1) return { ok: false, message: "كل رمز في الأبجدية حرف واحد: «" + p + "» أطول من ذلك." };
    if (RESERVED.includes(p)) return { ok: false, message: "«" + p + "» علامة محجوزة في المادة، لا تكون حرفًا في الأبجدية." };
    if (!isLabSymbol(p)) return { ok: false, message: "«" + p + "» لا يصلح رمزًا في الأبجدية." };
    if (!out.includes(p)) out.push(p);
  }
  if (out.length === 0) return { ok: false, message: "اكتب رمزًا واحدًا على الأقل في الأبجدية." };
  if (out.length > MAX_SYMBOLS) return { ok: false, message: "الأبجدية " + MAX_SYMBOLS + " رمزًا على الأكثر." };
  return { ok: true, alphabet: out };
}

// ────────────────────────────────────────────────────────────────────────────
// From the draft to the machine
// ────────────────────────────────────────────────────────────────────────────

export type LabIssue = { code: string; text: string };
/** `raw` (AUTO-A10): the machine in the automaton-trace format the course's reader read it from — what a «صمّم الآلة» exercise for a
 *  push-down automaton / Turing machine sends to the server judge. */
export type LabCheck = { machine: Machine | null; issues: LabIssue[]; raw?: Record<string, unknown> };

const OP_WORD: Record<PdaOp, string> = { push: "ادفع", pop: "اسحب", none: "بلا تغيير" };

/** The finite automaton's arrows, in table order (states, then the alphabet, then ε). */
function faTransitions(d: LabDraft): [string, string, string][] {
  const out: [string, string, string][] = [];
  const symbols = d.kind === "NFA" ? [...d.alphabet, EPS] : d.alphabet;
  for (const q of d.states) for (const s of symbols) for (const t of d.cells[cellKey(q, s)] ?? []) if (d.states.includes(t)) out.push([q, s, t]);
  return out;
}

/**
 * The machine the draft describes, read by the course's own strict reader, or null with every reason it is not one yet (in the
 * order the learner meets them). A draft that the checks below pass but the reader still refuses is reported, never guessed.
 */
export function checkDraft(d: LabDraft): LabCheck {
  const issues: LabIssue[] = [];
  const add = (code: string, text: string) => { if (issues.length < 12) issues.push({ code, text }); };
  if (d.alphabet.length === 0) add("no-alphabet", "اكتب أبجدية الآلة (رمز واحد على الأقل).");
  for (const s of d.alphabet) if (!isLabSymbol(s)) add("bad-symbol", "«" + s + "» لا يصلح رمزًا في الأبجدية.");
  if (!d.states.includes(d.start)) add("no-start", "اختر حالة البداية.");
  const has = (q: string) => d.states.includes(q);
  let transitions: unknown[] = [];

  if (d.kind === "DFA" || d.kind === "NFA") {
    if (d.kind === "DFA") {
      for (const q of d.states) {
        if ((d.cells[cellKey(q, EPS)] ?? []).some(has)) add("epsilon-in-dfa", "في الأوتومات الحتمي لا انتقالات ε (من " + q + ").");
        for (const s of d.alphabet) if ((d.cells[cellKey(q, s)] ?? []).filter(has).length > 1)
          add("two-arrows", "في الأوتومات الحتمي سهم واحد لكل حالة ولكل رمز، ومن " + q + " بالرمز " + s + " أكثر من سهم.");
      }
    }
    transitions = faTransitions(d);
  } else if (d.kind === "PDA") {
    const seen = new Set<string>();
    d.pda.forEach((r, i) => {
      const n = "الانتقال " + (i + 1) + ": ";
      if (!has(r.from) || !has(r.to)) { add("row-state", n + "اختر الحالة التي يبدأ منها والحالة التي ينتهي إليها."); return; }
      if (!d.alphabet.includes(r.read)) { add("row-read", n + "اختر الرمز الذي يُقرأ من الكلمة."); return; }
      if (r.top !== BOTTOM && !isLabSymbol(r.top)) { add("row-top", n + "اكتب رمز قمة المكدّس (حرفًا واحدًا، أو " + BOTTOM + ")."); return; }
      const w = [...r.write];
      if (w.some(c => !isLabSymbol(c))) { add("row-write", n + "ما يُكتب في المكدّس حروف فقط، ولا يُدفع " + BOTTOM + " من جديد."); return; }
      if (r.op === "push" && w.length === 0) { add("push-empty", n + "«ادفع» يدفع رمزًا واحدًا على الأقل."); return; }
      if (r.op === "push" && w.length > 8) { add("push-long", n + "«ادفع» يدفع 8 رموز على الأكثر."); return; }
      if (r.op === "pop" && r.top === BOTTOM) { add("pop-bottom", n + "لا نسحب من مكدّس فارغ (في القمة " + BOTTOM + ")."); return; }
      // the course writes a pop as «اسحب b,A/A» (the top again) and a no-change as «بلا تغيير b,A/» (nothing after the slash)
      if (r.op === "pop" && w.length > 0 && r.write !== r.top) { add("pop-write", n + "«اسحب» يسحب القمة " + r.top + ": بعد «/» اكتب " + r.top + " نفسها (كما في المادة: اسحب b,A/A) أو لا شيء."); return; }
      if (r.op === "none" && w.length > 0) { add("write-ignored", n + "«" + OP_WORD.none + "» لا يكتب شيئًا في المكدّس: امسح ما بعد «/»."); return; }
      const key = r.from + "|" + r.read + "|" + r.top;
      if (seen.has(key)) { add("pda-two-moves", n + "حركتان من " + r.from + " بالرمز " + r.read + " والقمة " + r.top + ": أوتومات المكدّس في المادة حتمي."); return; }
      seen.add(key);
    });
    transitions = d.pda.map(r => ({ from: r.from, read: r.read, top: r.top, op: r.op, write: r.write, to: r.to }));
  } else {
    const seen = new Set<string>();
    const tapeOk = (c: string) => c === BLANK || (d.leftEnd && c === LEFT_END) || isLabSymbol(c);
    d.tm.forEach((r, i) => {
      const n = "الانتقال " + (i + 1) + ": ";
      if (!has(r.from) || !has(r.to)) { add("row-state", n + "اختر الحالة التي يبدأ منها والحالة التي ينتهي إليها."); return; }
      if (!tapeOk(r.read) || !tapeOk(r.write)) { add("row-symbol", n + "ما يُقرأ وما يُكتب رمز واحد من الشريط (حرف، أو " + BLANK + (d.leftEnd ? "، أو " + LEFT_END : "") + ")."); return; }
      if (d.leftEnd && (r.read === LEFT_END) !== (r.write === LEFT_END)) { add("left-end", n + "علامة بداية الشريط " + LEFT_END + " لا يُكتب فوقها، ولا تُكتب في مكان آخر."); return; }
      if (d.leftEnd && r.read === LEFT_END && r.move === "L") { add("left-of-end", n + "لا شيء يسار " + LEFT_END + ": لا حركة يسارًا منها."); return; }
      const key = r.from + "|" + r.read;
      if (seen.has(key)) { add("tm-two-moves", n + "حركتان من " + r.from + " والرمز تحت الرأس " + r.read + ": آلة تورنغ في المادة حتمية."); return; }
      seen.add(key);
    });
    transitions = d.tm.map(r => ({ from: r.from, read: r.read, write: r.write, move: r.move, to: r.to }));
  }
  if (transitions.length > MAX_TRANSITIONS) add("too-many", "الآلة " + MAX_TRANSITIONS + " انتقالًا على الأكثر.");
  if (issues.length) return { machine: null, issues };

  const labels: Record<string, string> = {};
  for (const [q, l] of Object.entries(d.labels)) if (has(q) && l) labels[q] = l;
  const automaton: Record<string, unknown> = {
    kind: d.kind, states: d.states, alphabet: d.alphabet, start: d.start, accept: d.accept.filter(has), transitions,
    ...(Object.keys(labels).length ? { stateLabels: labels } : {}),
    ...(d.kind === "PDA" ? { bottom: BOTTOM } : {}),
    ...(d.kind === "TM" ? { blank: BLANK, ...(d.leftEnd ? { leftEnd: LEFT_END } : {}) } : {}),
  };
  const read = readAutomatonConfig({ automaton });
  if (!read) return { machine: null, issues: [{ code: "unreadable", text: "تعذّر قراءة الآلة. راجع الحالات والانتقالات." }] };
  return { machine: read.machine, issues: [], raw: automaton };
}

/** A machine as a draft (to open a machine in the lab): the exact inverse of `checkDraft` for every machine the course's reader reads. */
export function draftFromMachine(m: Machine): LabDraft {
  const d: LabDraft = { ...initialDraft(m.kind), alphabet: [...m.alphabet], states: [...m.states], start: m.start, accept: [...m.accept], labels: { ...m.stateLabels } };
  if (m.kind === "DFA" || m.kind === "NFA") {
    const cells: Record<string, string[]> = {};
    for (const t of m.transitions) (cells[cellKey(t.from, t.symbol)] ||= []).push(t.to);
    d.cells = cells;
  } else if (m.kind === "PDA") {
    d.pda = m.transitions.map(t => ({ from: t.from, read: t.read, top: t.top, op: t.op, write: t.write.join(""), to: t.to }));
  } else {
    const tm = m as TmMachine;
    d.tm = tm.transitions.map(t => ({ from: t.from, read: t.read, write: t.write, move: t.move, to: t.to }));
    d.leftEnd = tm.leftEnd !== undefined;
  }
  return d;
}

// ────────────────────────────────────────────────────────────────────────────
// The course's checks
// ────────────────────────────────────────────────────────────────────────────

/** A deterministic automaton's missing arrows (state, symbol), in table order: none means it is complete. */
export function missingArrows(d: LabDraft): { state: string; symbol: string }[] {
  if (d.kind !== "DFA") return [];
  const out: { state: string; symbol: string }[] = [];
  for (const q of d.states) for (const s of d.alphabet) if (!(d.cells[cellKey(q, s)] ?? []).some(t => d.states.includes(t))) out.push({ state: q, symbol: s });
  return out;
}

/**
 * «أضف حالة مصيدة» — the course's step for a complete deterministic automaton: a new state «مصيدة» that every missing arrow leads to,
 * and that loops to itself on every symbol. Nothing else changes. A complete automaton (or a full one) is returned as it is.
 */
export function addTrapState(d: LabDraft): LabDraft {
  const missing = missingArrows(d);
  if (d.kind !== "DFA" || missing.length === 0 || d.states.length >= MAX_STATES) return d;
  const trap = nextStateName(d.states, "qT");
  const cells = { ...d.cells };
  for (const m of missing) cells[cellKey(m.state, m.symbol)] = [trap];
  for (const s of d.alphabet) cells[cellKey(trap, s)] = [trap];
  return { ...d, states: [...d.states, trap], cells, labels: { ...d.labels, [trap]: "مصيدة" } };
}

/** Why a finite automaton is not deterministic (ε arrows; more than one arrow for a state and a symbol): empty when it is. */
export function nondeterminism(d: LabDraft): string[] {
  if (d.kind !== "NFA" && d.kind !== "DFA") return [];
  const out: string[] = [];
  for (const q of d.states) {
    if ((d.cells[cellKey(q, EPS)] ?? []).some(t => d.states.includes(t))) out.push("من " + q + " انتقال ε");
    for (const s of d.alphabet) {
      const ts = (d.cells[cellKey(q, s)] ?? []).filter(t => d.states.includes(t));
      if (ts.length > 1) out.push("من " + q + " بالرمز " + s + " إلى أكثر من حالة (" + ts.join("، ") + ")");
    }
  }
  return out;
}

/** The states no arrow path reaches from the start state, in state order. */
export function unreachableStates(m: Machine): string[] {
  const seen = new Set([m.start]);
  const todo = [m.start];
  while (todo.length) {
    const s = todo.pop() as string;
    for (const t of m.transitions) if (t.from === s && !seen.has(t.to)) { seen.add(t.to); todo.push(t.to); }
  }
  return m.states.filter(s => !seen.has(s));
}

// ────────────────────────────────────────────────────────────────────────────
// Running many words
// ────────────────────────────────────────────────────────────────────────────

export const MAX_BATCH = 40;

/** The words of a batch as typed: one per line, or separated by spaces or commas; «ε» (or «λ») is the empty word. Bounded. */
export function parseWords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,،]+/)) {
    if (!raw) continue;
    const w = EPSILON_SYMBOLS.includes(raw) ? "" : raw;
    if (!out.includes(w)) out.push(w);
    if (out.length >= MAX_BATCH) break;
  }
  return out;
}

/** For a Turing machine that halted: the tape at the halt (its written part, ├ and the blanks around it left out) and, by the book's
 *  convention for «حساب دوال» («الجواب يظهر على الشريط بين علامتي $»), the answer between the first two $ when there are two. */
export type BatchRow = { word: string; verdict: Verdict | null; bad?: string; tooLong?: boolean; tape?: string; answer?: string };

/** Each word's verdict on the machine (the runners of the course: the same as a step-by-step run), or why it could not run. */
export function runBatch(m: Machine, words: readonly string[]): BatchRow[] {
  return words.map(word => {
    if ([...word].length > LIMITS.word) return { word, verdict: null, tooLong: true };
    const split = splitWord(m, word);
    if (!split.ok) return { word, verdict: null, bad: split.bad };
    if (m.kind !== "TM") return { word, verdict: verdictOf(m, split.symbols) };
    const halt = tmHalt(m as TmMachine, split.symbols);
    if (halt.verdict === "nohalt") return { word, verdict: halt.verdict };
    const answer = answerOnTape(halt.tape);
    return { word, verdict: halt.verdict, tape: halt.tape, ...(answer !== null ? { answer } : {}) };
  });
}

/** The answer of «حساب دوال»: what lies between the first two $ on the tape (the book's convention), or null without two $. */
export function answerOnTape(tape: string): string | null {
  const cells = [...tape];
  const first = cells.indexOf("$");
  const second = first < 0 ? -1 : cells.indexOf("$", first + 1);
  return second < 0 ? null : cells.slice(first + 1, second).join("");
}

/**
 * The verdict alone, without recording steps — the same rules as the course's runners (`runAutomaton`), written lean so «لغة آلتي»
 * can try thousands of words. Pinned equal to `runAutomaton(...).verdict` by the A4 suite.
 */
export function verdictOf(m: Machine, symbols: readonly string[]): Verdict {
  if (m.kind === "DFA") {
    let q = m.start;
    for (const s of symbols) {
      const t = m.transitions.find(x => x.from === q && x.symbol === s);
      if (!t) return "stuck";
      q = t.to;
    }
    return m.accept.includes(q) ? "accept" : "reject";
  }
  if (m.kind === "NFA") {
    const fa = m as FaMachine;
    let cur = epsilonClosure(fa, [fa.start]).states;
    for (const s of symbols) {
      const targets = fa.states.filter(x => fa.transitions.some(t => cur.includes(t.from) && t.symbol === s && t.to === x));
      cur = epsilonClosure(fa, targets).states;
      if (cur.length === 0) return "stuck";
    }
    return cur.some(x => fa.accept.includes(x)) ? "accept" : "reject";
  }
  if (m.kind === "PDA") {
    let q = m.start;
    const stack = [m.bottom];
    for (const s of symbols) {
      const top = stack[stack.length - 1];
      const t = m.transitions.find(x => x.from === q && x.read === s && x.top === top);
      if (!t) return "stuck";
      if (t.op === "push") stack.push(...t.write);
      if (t.op === "pop") stack.pop();
      q = t.to;
    }
    return m.accept.includes(q) ? "accept" : "reject";
  }
  return tmHalt(m as TmMachine, symbols).verdict;
}

/** A Turing machine run to its halt (or the runners' step limit): the verdict and the written part of the tape, ├ and outer blanks left out. */
export function tmHalt(tm: TmMachine, symbols: readonly string[]): { verdict: Verdict; tape: string } {
  const tape = new Map<number, string>();
  symbols.forEach((s, i) => tape.set(i, s));
  if (tm.leftEnd !== undefined) tape.set(-1, tm.leftEnd);
  let head = 0, q = tm.start;
  const written = () => {
    const at = [...tape.keys()].filter(k => k >= 0 && tape.get(k) !== tm.blank);
    if (!at.length) return "";
    const lo = Math.min(...at), hi = Math.max(...at);
    let out = "";
    for (let p = lo; p <= hi; p++) out += tape.get(p) ?? tm.blank;
    return out;
  };
  for (let n = 0; n < LIMITS.tmSteps; n++) {
    const under = tape.get(head) ?? tm.blank;
    const t = tm.transitions.find(x => x.from === q && x.read === under);
    if (!t) return { verdict: tm.accept.includes(q) ? "accept" : "reject", tape: written() };
    tape.set(head, t.write);
    head += t.move === "R" ? 1 : t.move === "L" ? -1 : 0;
    q = t.to;
  }
  return { verdict: "nohalt", tape: "" };
}

/** The number of words of length 0 … n over k symbols. */
const wordsUpTo = (k: number, n: number) => { let total = 0, p = 1; for (let i = 0; i <= n; i++) { total += p; p *= k; } return total; };
/** How many words «لغة آلتي» tries at most (a Turing machine may run up to the step limit on each: fewer). */
export const LANGUAGE_BUDGET: Record<AutomatonKind, number> = { DFA: 20000, NFA: 8000, PDA: 20000, TM: 1500 };
export const LANGUAGE_MAX_LENGTH = 12;
export const LANGUAGE_SHOWN = 200;

/** The longest length n (≤ 12) whose every word up to n fits the kind's budget. At least 0 (the empty word alone). */
export function languageMaxLength(m: Machine): number {
  let n = 0;
  while (n < LANGUAGE_MAX_LENGTH && wordsUpTo(m.alphabet.length, n + 1) <= LANGUAGE_BUDGET[m.kind]) n++;
  return n;
}

export type LanguageListing = { maxLength: number; tried: number; accepted: string[]; acceptedCount: number; nohalt: string[] };

/** «لغة آلتي»: every word of length 0 … maxLength in shortlex order (shorter first, then the alphabet's order) the machine accepts. */
export function languageUpTo(m: Machine, maxLength: number): LanguageListing {
  const n = Math.max(0, Math.min(maxLength, languageMaxLength(m)));
  const accepted: string[] = [];
  const nohalt: string[] = [];
  let tried = 0, acceptedCount = 0;
  let layer: string[][] = [[]];
  for (let len = 0; len <= n; len++) {
    for (const symbols of layer) {
      tried++;
      const v = verdictOf(m, symbols);
      if (v === "accept") { acceptedCount++; if (accepted.length < LANGUAGE_SHOWN) accepted.push(symbols.join("")); }
      else if (v === "nohalt" && nohalt.length < LANGUAGE_SHOWN) nohalt.push(symbols.join(""));
    }
    if (len < n) layer = layer.flatMap(w => m.alphabet.map(s => [...w, s]));
  }
  return { maxLength: n, tried, accepted, acceptedCount, nohalt };
}

/** The step-by-step run of one word (the course's own runner), or why the word cannot run. */
export function runWord(m: Machine, word: string): { ok: true; run: ReturnType<typeof runAutomaton> } | { ok: false; message: string } {
  if ([...word].length > LIMITS.word) return { ok: false, message: "الكلمة طويلة: " + LIMITS.word + " رمزًا على الأكثر." };
  const split = splitWord(m, word);
  if (!split.ok) return { ok: false, message: "الرمز " + split.bad + " ليس من الأبجدية {" + m.alphabet.join(", ") + "}." };
  return { ok: true, run: runAutomaton(m, split.symbols) };
}

// ────────────────────────────────────────────────────────────────────────────
// AUTO-A6b — drawing with the mouse: the layout and the edits a drawing makes (pure)
// ────────────────────────────────────────────────────────────────────────────

export const GRID_MAX = 20;
type Cell = [number, number];
const sameCell = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

/**
 * Every state's grid cell: the course's automatic layout (columns by distance from the start), with the cells the learner chose by
 * mouse taking precedence; a state placed automatically on a chosen cell moves to the first free cell of its column, then to the right.
 * Two states never share a cell. Deterministic.
 */
export function labLayout(m: Machine, chosen?: Record<string, Cell>): Record<string, Cell> {
  const auto = gridLayout(m);
  const out: Record<string, Cell> = {};
  const used: Cell[] = [];
  for (const s of m.states) {
    const c = chosen?.[s];
    if (c && !used.some(u => sameCell(u, c))) { out[s] = [c[0], c[1]]; used.push(out[s]); }
  }
  for (const s of m.states) {
    if (out[s]) continue;
    let [col, row] = auto[s];
    while (used.some(u => sameCell(u, [col, row]))) { row++; if (row > GRID_MAX) { row = 0; col++; } }
    out[s] = [col, row];
    used.push(out[s]);
  }
  return out;
}

/** The grid cell under a point of the drawing (snapped, kept inside the grid). */
export function cellAt(point: { x: number; y: number }, cell: { w: number; h: number }): Cell {
  const clamp = (v: number) => Math.max(0, Math.min(GRID_MAX, v));
  return [clamp(Math.round(point.x / cell.w)), clamp(Math.round(point.y / cell.h))];
}

/** The state whose circle holds a point of the drawing, or null. */
export function stateAt(point: { x: number; y: number }, pos: Record<string, { x: number; y: number }>, r: number): string | null {
  for (const [s, p] of Object.entries(pos)) if (Math.hypot(point.x - p.x, point.y - p.y) <= r) return s;
  return null;
}

/** Moves a state to a cell; a state already there takes the moved state's old cell (they swap). The layout keeps both choices. */
export function moveStateTo(d: LabDraft, layoutNow: Record<string, Cell>, q: string, to: Cell): LabDraft {
  const from = layoutNow[q];
  if (!from || sameCell(from, to)) return d;
  const other = Object.keys(layoutNow).find(s => s !== q && sameCell(layoutNow[s], to));
  const layout: Record<string, Cell> = { ...layoutNow, [q]: [to[0], to[1]] };
  if (other) layout[other] = [from[0], from[1]];
  return { ...d, layout };
}

/** A new state at a free cell (double-click on the drawing); refused at the limit or on a taken cell. */
export function addStateAt(d: LabDraft, layoutNow: Record<string, Cell>, at: Cell): LabDraft {
  if (d.states.length >= MAX_STATES || Object.values(layoutNow).some(c => sameCell(c, at))) return d;
  const q = nextStateName(d.states);
  return { ...d, states: [...d.states, q], layout: { ...layoutNow, [q]: [at[0], at[1]] } };
}

/**
 * An arrow drawn from one state to another (or to itself). A finite automaton takes its symbol: a deterministic one REPLACES the arrow
 * of that state and symbol (one arrow each), a non-deterministic one adds a target (ε too). A push-down automaton or a Turing machine
 * gets a new row from → to, to be completed in the list (its symbol, the stack or the tape).
 */
export function addArrow(d: LabDraft, from: string, to: string, symbol?: string): LabDraft {
  if (!d.states.includes(from) || !d.states.includes(to)) return d;
  if (d.kind === "DFA" || d.kind === "NFA") {
    if (symbol === undefined || (symbol === EPS ? d.kind !== "NFA" : !d.alphabet.includes(symbol))) return d;
    const k = cellKey(from, symbol), now = d.cells[k] ?? [];
    return { ...d, cells: { ...d.cells, [k]: d.kind === "DFA" ? [to] : now.includes(to) ? now : [...now, to] } };
  }
  if (d.kind === "PDA") return { ...d, pda: [...d.pda, { from, read: d.alphabet[0] ?? "", top: BOTTOM, op: "none", write: "", to }] };
  return { ...d, tm: [...d.tm, { from, read: d.alphabet[0] ?? BLANK, write: d.alphabet[0] ?? BLANK, move: "R", to }] };
}

// ────────────────────────────────────────────────────────────────────────────
// AUTO-A16 — the arrows edited on the drawing itself (pure)
// ────────────────────────────────────────────────────────────────────────────

/** How far outside a state's circle its four link handles sit, and how close a press must be to take one (drawing units). */
export const HANDLE_GAP = 13;
export const HANDLE_HIT = 10;

/** The four link handles of a state (above, right, below, left), as in the diagram editor. */
export function handlesOf(center: { x: number; y: number }, r: number): { x: number; y: number }[] {
  const d = r + HANDLE_GAP;
  return [{ x: center.x, y: center.y - d }, { x: center.x + d, y: center.y }, { x: center.x, y: center.y + d }, { x: center.x - d, y: center.y }];
}

/** Whether a point of the drawing presses one of a state's link handles. */
export function onHandle(point: { x: number; y: number }, center: { x: number; y: number }, r: number): boolean {
  return handlesOf(center, r).some(h => Math.hypot(point.x - h.x, point.y - h.y) <= HANDLE_HIT);
}

/** The symbols a finite automaton's arrow from → to carries (ε last, in a non-deterministic one). */
export function arrowSymbols(d: LabDraft, from: string, to: string): string[] {
  const all = d.kind === "NFA" ? [...d.alphabet, EPS] : d.kind === "DFA" ? d.alphabet : [];
  return all.filter(s => (d.cells[cellKey(from, s)] ?? []).includes(to));
}

/** One symbol of a finite automaton's arrow, put on or taken off: putting goes through `addArrow` (a DFA replaces the state's arrow for it). */
export function toggleArrowSymbol(d: LabDraft, from: string, to: string, symbol: string): LabDraft {
  if (d.kind !== "DFA" && d.kind !== "NFA") return d;
  if (!arrowSymbols(d, from, to).includes(symbol)) return addArrow(d, from, to, symbol);
  const k = cellKey(from, symbol), cells = { ...d.cells }, left = (cells[k] ?? []).filter(t => t !== to);
  if (left.length) cells[k] = left; else delete cells[k];
  return { ...d, cells };
}

/** The whole arrow from → to removed: every symbol of it (finite automata), every row of it (push-down automaton, Turing machine). */
export function removeArrow(d: LabDraft, from: string, to: string): LabDraft {
  if (d.kind === "PDA") return d.pda.some(r => r.from === from && r.to === to) ? { ...d, pda: d.pda.filter(r => !(r.from === from && r.to === to)) } : d;
  if (d.kind === "TM") return d.tm.some(r => r.from === from && r.to === to) ? { ...d, tm: d.tm.filter(r => !(r.from === from && r.to === to)) } : d;
  return arrowSymbols(d, from, to).reduce((x, s) => toggleArrowSymbol(x, from, to, s), d);
}
