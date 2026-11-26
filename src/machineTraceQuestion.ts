// AUTO-A15a (docs/enterprise-automata-lab-a4.md §22) — machineTrace@1: «تتبّع تشغيل الآلة» in an exam. The question GIVES a machine — a
// finite automaton (deterministic or not), a push-down automaton or a Turing machine, in the book simulator's own format — and a word; the
// student writes the run, one row per configuration, and the verdict (accept / reject). Owner decisions (2026-11-26):
//   • all four machines;
//   • partial credit, and an error is NEVER counted twice: row k is right when it is the configuration the machine reaches in one step from
//     the student's OWN row k − 1 (or, failing that, the true row k); the verdict is one more part. Score = marks × right parts / parts,
//     the parts being the true run's rows plus the verdict.
// This module is the PUBLIC contract (compiled for the server by scripts/build-shared-finalization.mjs):
//   • the config (`node.machineTrace`) — the machine and the word — is PUBLIC: the student must see the machine. It is projected unchanged;
//   • the true run is not stored anywhere: the server computes it from the config with `stepTrace`, the book engine's semantics (the parity
//     test runs every machine of the course with both); finalization requires a run that ends within MACHINE_TRACE_LIMITS.rows rows;
//   • the key (`node.answer`) holds nothing (`{}`): there is no secret beyond the work the question asks for;
//   • the answer is `{ kind: "machineTrace", rows, verdict }`, each row in the kind's own fields (a state, a set of states, the stack, the
//     tape with the head in [ ]). Its SHAPE is bounded at ingest; whether a row is a configuration of this machine is the grader's to judge.
// The student's page never runs the machine (no player): the run IS the answer.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { readAutomatonConfig, epsilonClosure, splitWord, type Machine, type FaMachine, type PdaMachine, type TmMachine } from "./learning/activities/automaton";

export const MACHINE_TRACE_TYPE_KEY = "machineTrace";
export const MACHINE_TRACE_LIMITS = Object.freeze({ wordChars: 12, rows: 32, stateChars: 8, stackChars: 40, tapeChars: 48 });
export type MachineTraceKind = "DFA" | "NFA" | "PDA" | "TM";
/** The machine exactly as the book's simulator stores it (`config.automaton`), canonical keys only. */
export type MachineTraceMachine = Record<string, unknown> & { kind: MachineTraceKind };
export type MachineTraceConfigV1 = { v: 1; machine: MachineTraceMachine; word: string };
/** A row as the student writes it: the kind decides which field counts. */
export type TraceRow = { state?: string; states?: string[]; stack?: string; tape?: string };
export type MachineTraceAnswer = { kind: "machineTrace"; rows: TraceRow[]; verdict: "accept" | "reject" | null };
export type MachineTraceIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): MachineTraceIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const isPlain = (v: unknown): v is Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN.has(k));
const chars = (s: string) => [...s];
const str = (v: unknown, max: number): v is string => typeof v === "string" && chars(v).length <= max;

export const machineTraceQuestionVersion = (node: unknown): number | undefined => isPlain(node) ? effectiveQuestionTypeVersion(MACHINE_TRACE_TYPE_KEY, node.questionTypeVersion) : undefined;
export const defaultMachineTraceConfig = (): MachineTraceConfigV1 => ({ v: 1, machine: { kind: "DFA", states: ["q0", "q1"], alphabet: ["a", "b"], start: "q0", accept: ["q1"], transitions: [["q0", "a", "q1"], ["q0", "b", "q0"], ["q1", "a", "q1"], ["q1", "b", "q0"]] }, word: "ab" });

const MACHINE_KEYS: Record<MachineTraceKind, readonly string[]> = {
  DFA: ["kind", "states", "alphabet", "start", "accept", "transitions"],
  NFA: ["kind", "states", "alphabet", "start", "accept", "transitions"],
  PDA: ["kind", "states", "alphabet", "start", "accept", "transitions", "bottom", "stackAlphabet"],
  TM: ["kind", "states", "alphabet", "start", "accept", "transitions", "blank", "tapeAlphabet", "leftEnd"],
};
/** The machine in the engine, or null when the book's own strict reader refuses it. */
export function engineOfTraceMachine(raw: unknown): Machine | null {
  if (!isPlain(raw) || typeof raw.kind !== "string" || !(raw.kind in MACHINE_KEYS) || !onlyKeys(raw, MACHINE_KEYS[raw.kind as MachineTraceKind])) return null;
  const read = readAutomatonConfig({ automaton: raw });
  return read ? read.machine : null;
}
/** A canonical copy of the machine (its own keys, rebuilt — never the caller's object). */
const canonicalMachine = (raw: Record<string, unknown>): MachineTraceMachine => JSON.parse(JSON.stringify(Object.fromEntries(MACHINE_KEYS[raw.kind as MachineTraceKind].filter(k => k in raw).map(k => [k, raw[k]])))) as MachineTraceMachine;

// ── configurations and one step of the machine (the book engine's semantics, src/learning/activities/automaton.ts) ──────────────────────────
/** A configuration: the state(s), how many symbols were read (finite / push-down automata), the stack (bottom → top), the tape and head. */
export type TraceConfig = { states: string[]; read: number; stack?: string[]; cells?: string[]; head?: number };
/** A Turing machine's tape, normalized: the blanks at both ends dropped (never the head's cell), so equal tapes compare equal wherever
 *  they sit. ├ is a symbol like any other here (the engine never writes over it nor moves left of it). */
function normalizeTape(cells: string[], head: number, blank: string): { cells: string[]; head: number } {
  let lo = 0, hi = cells.length - 1;
  while (lo < head && cells[lo] === blank) lo++;
  while (hi > head && cells[hi] === blank) hi--;
  return { cells: cells.slice(lo, hi + 1), head: head - lo };
}
export function initialTrace(m: Machine, symbols: string[]): TraceConfig {
  if (m.kind === "DFA") return { states: [m.start], read: 0 };
  if (m.kind === "NFA") return { states: epsilonClosure(m, [m.start]).states, read: 0 };
  if (m.kind === "PDA") return { states: [m.start], read: 0, stack: [m.bottom] };
  const tm = m as TmMachine;
  const cells = [...(tm.leftEnd !== undefined ? [tm.leftEnd] : []), ...(symbols.length ? symbols : [tm.blank])];
  return { states: [tm.start], read: 0, ...normalizeTape(cells, tm.leftEnd !== undefined ? 1 : 0, tm.blank) };
}
/** The configuration one step later, or null when the machine stops here (the word read, no move, or a dead NFA). Pure. */
export function stepTrace(m: Machine, c: TraceConfig, symbols: string[]): TraceConfig | null {
  if (m.kind === "DFA") {
    if (c.read >= symbols.length || c.states.length !== 1) return null;
    const t = (m as FaMachine).transitions.find(x => x.from === c.states[0] && x.symbol === symbols[c.read]);
    return t ? { states: [t.to], read: c.read + 1 } : null;
  }
  if (m.kind === "NFA") {
    if (c.read >= symbols.length || c.states.length === 0) return null;
    const fa = m as FaMachine;
    const moved = fa.transitions.filter(t => c.states.includes(t.from) && t.symbol === symbols[c.read]);
    const targets = fa.states.filter(s => moved.some(t => t.to === s));
    return { states: epsilonClosure(fa, targets).states, read: c.read + 1 };
  }
  if (m.kind === "PDA") {
    const pda = m as PdaMachine;
    const stack = c.stack ?? [];
    if (c.read >= symbols.length || c.states.length !== 1 || stack.length === 0) return null;
    const t = pda.transitions.find(x => x.from === c.states[0] && x.read === symbols[c.read] && x.top === stack[stack.length - 1]);
    if (!t) return null;
    const next = [...stack];
    if (t.op === "push") next.push(...t.write);
    if (t.op === "pop") next.pop();
    return { states: [t.to], read: c.read + 1, stack: next };
  }
  const tm = m as TmMachine;
  if (c.states.length !== 1 || !c.cells || c.head === undefined) return null;
  const under = c.cells[c.head] ?? tm.blank;
  const t = tm.transitions.find(x => x.from === c.states[0] && x.read === under);
  if (!t) return null;
  let cells = [...c.cells], head = c.head;
  cells[head] = t.write;
  head += t.move === "R" ? 1 : t.move === "L" ? -1 : 0;
  if (head < 0) { cells = [tm.blank, ...cells]; head = 0; }
  if (head >= cells.length) cells.push(tm.blank);
  return { states: [t.to], read: 0, ...normalizeTape(cells, head, tm.blank) };
}
/** Accepts, once the machine has stopped in `c`? (finite / push-down: the whole word read and an accepting state; Turing: an accepting state.) */
export function acceptsAt(m: Machine, c: TraceConfig, symbols: string[]): boolean {
  if (m.kind !== "TM" && c.read < symbols.length) return false;
  return c.states.some(s => m.accept.includes(s));
}
export type TrueRun = { rows: TraceConfig[]; verdict: "accept" | "reject" };
/** The true run: every configuration from the start until the machine stops, and its verdict; null when it is longer than `maxRows`. */
export function trueTrace(m: Machine, symbols: string[], maxRows: number = MACHINE_TRACE_LIMITS.rows): TrueRun | null {
  const rows = [initialTrace(m, symbols)];
  for (let next = stepTrace(m, rows[0], symbols); next; next = stepTrace(m, rows[rows.length - 1], symbols)) {
    rows.push(next);
    if (rows.length > maxRows) return null;
  }
  return { rows, verdict: acceptsAt(m, rows[rows.length - 1], symbols) ? "accept" : "reject" };
}

// ── a row as the student writes it ⇄ a configuration ──────────────────────────────────────────────────────────────────────────────────────
/** The tape as written: its cells with the head's cell in [ ] (exactly one), e.g. «├A[a]bb». */
export function parseTape(text: string): { cells: string[]; head: number } | null {
  const cs = chars(text.replace(/\s+/g, ""));
  const cells: string[] = [];
  let head = -1;
  for (let i = 0; i < cs.length; i++) {
    if (cs[i] === "[") {
      if (head >= 0 || cs[i + 2] !== "]" || cs[i + 1] === undefined || cs[i + 1] === "[" || cs[i + 1] === "]") return null;
      head = cells.length; cells.push(cs[i + 1]); i += 2;
    } else if (cs[i] === "]") return null;
    else cells.push(cs[i]);
  }
  return head >= 0 ? { cells, head } : null;
}
export const tapeText = (cells: readonly string[], head: number): string => cells.map((c, i) => (i === head ? "[" + c + "]" : c)).join("");
/** The configuration a row means at index `k`, or null when it is not one of this machine (a wrong field is a wrong row, never guessed). */
export function configOfRow(m: Machine, row: unknown, k: number): TraceConfig | null {
  if (!isPlain(row)) return null;
  const state = (v: unknown) => typeof v === "string" && m.states.includes(v);
  if (m.kind === "DFA") return state(row.state) ? { states: [row.state as string], read: k } : null;
  if (m.kind === "NFA") {
    if (!Array.isArray(row.states) || !row.states.every(state)) return null;
    return { states: m.states.filter(s => (row.states as string[]).includes(s)), read: k };
  }
  if (m.kind === "PDA") {
    const pda = m as PdaMachine;
    if (!state(row.state) || typeof row.stack !== "string") return null;
    const stack = chars(row.stack.replace(/\s+/g, ""));
    if (stack[0] !== pda.bottom || stack.slice(1).some(s => s === pda.bottom || !pda.stackAlphabet.includes(s))) return null;
    return { states: [row.state as string], read: k, stack };
  }
  const tm = m as TmMachine;
  if (!state(row.state) || typeof row.tape !== "string") return null;
  const t = parseTape(row.tape);
  if (!t || !t.cells.every(c => c === tm.blank || tm.tapeAlphabet.includes(c))) return null;
  return { states: [row.state as string], read: 0, ...normalizeTape(t.cells, t.head, tm.blank) };
}
/** The row that writes a configuration (the teacher's view of the true run). */
export function rowOfConfig(m: Machine, c: TraceConfig): TraceRow {
  if (m.kind === "NFA") return { states: [...c.states] };
  if (m.kind === "PDA") return { state: c.states[0], stack: (c.stack ?? []).join("") };
  if (m.kind === "TM") return { state: c.states[0], tape: tapeText(c.cells ?? [], c.head ?? 0) };
  return { state: c.states[0] };
}
/** A row as one line of text (the review, the released breakdown): «q1», «{p, q}» / «∅», «q1 ⏊SA», «q1 ├A[b]»; «—» for an empty row. */
export function rowLabel(row: unknown): string {
  if (!isPlain(row)) return "—";
  if (Array.isArray(row.states)) return row.states.length ? "{" + (row.states as unknown[]).filter(s => typeof s === "string").join(", ") + "}" : "∅";
  const parts = [row.state, row.stack, row.tape].filter((v): v is string => typeof v === "string" && v !== "");
  return parts.length ? parts.join(" ").slice(0, 60) : "—";
}
const sameConfig = (a: TraceConfig | null, b: TraceConfig | null) => !!a && !!b && JSON.stringify([a.states, a.read, a.stack ?? null, a.cells ?? null, a.head ?? null]) === JSON.stringify([b.states, b.read, b.stack ?? null, b.cells ?? null, b.head ?? null]);

// ── grading: partial, and an error is never counted twice ─────────────────────────────────────────────────────────────────────────────────
export type TraceGrade = { parts: number; right: number; rows: boolean[]; verdict: boolean; trueRows: number; truth: string[]; trueVerdict: "accept" | "reject" };
/** Row k (0 … N of the true run) is right when it is the configuration the machine reaches in ONE step from the student's own row k − 1, or
 *  the true row k (row 0: the true start). Rows past the true run's length are not graded. The verdict is one more part. Pure. */
export function gradeTrace(m: Machine, word: string, answer: MachineTraceAnswer): TraceGrade | null {
  const split = splitWord(m, word);
  if (!split.ok) return null;
  const run = trueTrace(m, split.symbols);
  if (!run) return null;
  const mine = answer.rows.map((r, k) => configOfRow(m, r, k));
  const rows = run.rows.map((truth, k) => {
    const got = mine[k] ?? null;
    if (!got) return false;
    if (sameConfig(got, truth)) return true;
    const prev = k > 0 ? mine[k - 1] ?? null : null;
    return !!prev && sameConfig(got, stepTrace(m, prev, split.symbols));
  });
  const verdict = answer.verdict === run.verdict;
  return { parts: run.rows.length + 1, right: rows.filter(Boolean).length + (verdict ? 1 : 0), rows, verdict, trueRows: run.rows.length,
    truth: run.rows.map(c => rowLabel(rowOfConfig(m, c))), trueVerdict: run.verdict };
}

// ── the question: config, key, validation, projection, answer ─────────────────────────────────────────────────────────────────────────────
export type MachineTraceConfigResult = { ok: true; config: MachineTraceConfigV1; machine: Machine; run: TrueRun; issues: [] } | { ok: false; issues: MachineTraceIssue[] };
export function validateMachineTraceConfig(raw: unknown): MachineTraceConfigResult {
  if (!isPlain(raw) || !onlyKeys(raw, ["v", "machine", "word"])) return { ok: false, issues: [err("TRACE_CONFIG_INVALID", "إعداد سؤال التتبّع غير صالح.", "machineTrace")] };
  if (raw.v !== 1) return { ok: false, issues: [err("TRACE_CONFIG_VERSION", "إصدار إعداد التتبّع غير مدعوم.", "machineTrace.v")] };
  const m = engineOfTraceMachine(raw.machine);
  if (!m) return { ok: false, issues: [err("TRACE_MACHINE_INVALID", "الآلة غير صالحة: تحقّق من الحالات وحالة البداية وحالات القبول والانتقالات.", "machineTrace.machine")] };
  if (!str(raw.word, MACHINE_TRACE_LIMITS.wordChars)) return { ok: false, issues: [err("TRACE_WORD_INVALID", "الكلمة حتى " + MACHINE_TRACE_LIMITS.wordChars + " رمزًا.", "machineTrace.word")] };
  const split = splitWord(m, raw.word);
  if (!split.ok) return { ok: false, issues: [err("TRACE_WORD_ALPHABET", "الكلمة فيها رمز ليس من أبجدية الآلة: " + split.bad, "machineTrace.word")] };
  const run = trueTrace(m, split.symbols);
  if (!run) return { ok: false, issues: [err("TRACE_RUN_TOO_LONG", "تشغيل الآلة على هذه الكلمة أطول من " + (MACHINE_TRACE_LIMITS.rows - 1) + " خطوة (أو لا يتوقف): اختر كلمة أقصر.", "machineTrace.word")] };
  return { ok: true, config: { v: 1, machine: canonicalMachine(raw.machine as Record<string, unknown>), word: raw.word }, machine: m, run, issues: [] };
}
/** The key holds nothing: absent or `{}`. Anything else is refused (no answer data may hide in it). */
const keyOk = (raw: unknown) => raw === undefined || (isPlain(raw) && Object.keys(raw).length === 0);
export function validateMachineTraceQuestion(node: Record<string, unknown>): MachineTraceIssue[] {
  const out: MachineTraceIssue[] = [];
  if (machineTraceQuestionVersion(node) === undefined) out.push(err("TRACE_VERSION_UNSUPPORTED", "إصدار السؤال غير مدعوم.", "questionTypeVersion"));
  const cfg = validateMachineTraceConfig(node.machineTrace); if (!cfg.ok) out.push(...cfg.issues);
  if (!keyOk(node.answer)) out.push(err("TRACE_KEY_INVALID", "مفتاح سؤال التتبّع يبقى فارغًا: الخادم يحسب التشغيل الصحيح من الآلة والكلمة.", "answer"));
  return out;
}
/** The student projection: the canonical config — the machine and the word are the question. null when it is not valid. */
export function projectMachineTraceConfigForStudent(raw: unknown): MachineTraceConfigV1 | null {
  const r = validateMachineTraceConfig(raw);
  return r.ok ? r.config : null;
}
/** The grading authority: the canonical config, the machine and its true run, or null (the grader then fails closed). */
export function machineTraceAuthority(rawConfig: unknown, rawKey: unknown): { config: MachineTraceConfigV1; machine: Machine; run: TrueRun } | null {
  if (!keyOk(rawKey)) return null;
  const cfg = validateMachineTraceConfig(rawConfig);
  return cfg.ok ? { config: cfg.config, machine: cfg.machine, run: cfg.run } : null;
}

export type MachineTraceAnswerResult = { ok: true; answer: MachineTraceAnswer } | { ok: false; code: string };
/** The answer's SHAPE only (bounded): whether a row is a configuration of the machine is the grader's to judge, never dropped here. */
export function normalizeMachineTraceAnswer(a: unknown): MachineTraceAnswerResult {
  const bad = { ok: false as const, code: "TRACE_ANSWER_INVALID" };
  if (!isPlain(a) || a.kind !== "machineTrace" || !onlyKeys(a, ["kind", "rows", "verdict"])) return bad;
  if (!Array.isArray(a.rows) || a.rows.length > MACHINE_TRACE_LIMITS.rows) return bad;
  if (a.verdict !== null && a.verdict !== undefined && a.verdict !== "accept" && a.verdict !== "reject") return bad;
  const rows: TraceRow[] = [];
  for (const r of a.rows) {
    if (!isPlain(r) || !onlyKeys(r, ["state", "states", "stack", "tape"])) return bad;
    const row: TraceRow = {};
    if (r.state !== undefined) { if (!str(r.state, MACHINE_TRACE_LIMITS.stateChars)) return bad; row.state = r.state; }
    if (r.states !== undefined) {
      if (!Array.isArray(r.states) || r.states.length > 24 || !r.states.every(s => str(s, MACHINE_TRACE_LIMITS.stateChars))) return bad;
      row.states = [...new Set(r.states as string[])];
    }
    if (r.stack !== undefined) { if (!str(r.stack, MACHINE_TRACE_LIMITS.stackChars)) return bad; row.stack = r.stack; }
    if (r.tape !== undefined) { if (!str(r.tape, MACHINE_TRACE_LIMITS.tapeChars)) return bad; row.tape = r.tape; }
    rows.push(row);
  }
  return { ok: true, answer: { kind: "machineTrace", rows, verdict: a.verdict === "accept" || a.verdict === "reject" ? a.verdict : null } };
}
export function bindMachineTraceAnswerToQuestion(a: unknown, question: unknown): MachineTraceAnswerResult {
  void question;
  return normalizeMachineTraceAnswer(a);
}
/** Answered: a verdict, or a row with something written in it. */
export const isMachineTraceAnswerAnswered = (a: unknown): boolean => {
  if (!isPlain(a) || a.kind !== "machineTrace") return false;
  if (a.verdict === "accept" || a.verdict === "reject") return true;
  return Array.isArray(a.rows) && a.rows.some(r => isPlain(r) && ((typeof r.state === "string" && r.state !== "") || (Array.isArray(r.states) && r.states.length > 0) || (typeof r.stack === "string" && r.stack !== "") || (typeof r.tape === "string" && r.tape !== "")));
};
