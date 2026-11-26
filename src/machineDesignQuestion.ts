// AUTO-A11a (docs/enterprise-automata-lab-a4.md §16) — machineDesign@1: «تصميم آلة: مكدّس أو تورنغ» in an exam. The student BUILDS a
// deterministic PUSH-DOWN automaton or a TURING machine — one that recognises a language, or (a Turing machine) one that COMPUTES a function,
// the answer on the tape between the first two $ — for a task the stem describes. The server runs it and the teacher's reference machine on
// every word up to a length with the book exercises' own judge (api/src/lib/learning-machine-design.js), called by the exam grader
// (api/src/lib/machine-design-grading.js). Owner decisions (2026-11-25):
//   • a NEW question type beside automatonDesign@1 (the finite automata, graded exactly), which is not touched;
//   • the sampled check is not a proof: a machine that agrees with the reference on every word up to length N gets FULL MARKS, and the
//     teacher is told «agrees up to length N (K words)» (A11b); a certain separating word → 0;
//   • a Turing machine that does not halt where the reference does is NOT a certain wrong: teacher review, never an automatic zero;
//   • three kinds: a push-down automaton, a Turing machine that recognises, a Turing machine that computes — for a function the reference
//     also fixes its domain (a word the reference halts on without accepting is outside it, never judged).
// This module is the PUBLIC contract and its validation (compiled for the server by scripts/build-shared-finalization.mjs):
//   • the config (`node.machineDesign`) is the task's public rules — the machine, the mode, the alphabet, the state limit, the book's left
//     end ├ (a Turing machine), the longest word tried, optional examples; it holds no answer data and is projected to the student unchanged;
//   • the key (`node.answer`) is `{ reference, layout? }`, the teacher's machine in the automaton-trace format — read by the book's OWN
//     engine (src/learning/activities/automaton.ts, the same reader the judge uses) and checked against the examples; removed by the student
//     sanitizer, never sent;
//   • the answer is `{ kind: "machineDesign", machine, layout? }`: the student's states, start, accepting states and transitions. A machine
//     that breaks a public rule (too many states, two moves for one state and symbol, …) is KEPT as answered and judged wrong by the grader.
// `layout` (state → grid cell) is presentation only, as in automatonDesign@1 (AUTO-A9): the grader never reads it.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import { readAutomatonLayout, type AutomatonLayout } from "./automatonDesignQuestion";
import { readAutomatonConfig, runAutomaton, type Machine } from "./learning/activities/automaton";

export const MACHINE_DESIGN_TYPE_KEY = "machineDesign";
/** The judge's bounds (learning-machine-design.js MACHINE_DESIGN_LIMITS — parity-tested) and the shape's. */
export const MACHINE_DESIGN_LIMITS = Object.freeze({ states: 12, symbols: 4, transitions: 80, maxLength: 10, words: 8, wordChars: 20, stateChars: 8, writeChars: 8, answerChars: 20 });
export type MachineDesignKind = "PDA" | "TM";
/** A function's example is `{ word, output }` — never a field named `answer`, which the student sanitizer strips as a key everywhere. */
export type MachineDesignExamples = { accept: string[]; reject: string[] } | { compute: { word: string; output: string }[] };
export type MachineDesignConfigV1 = { v: 1; machine: MachineDesignKind; mode?: "compute"; alphabet: string[]; maxStates: number; leftEnd?: true; maxLength?: number; examples?: MachineDesignExamples };
export type PdaMove = { from: string; read: string; top: string; op: "push" | "pop" | "none"; write: string; to: string };
export type TmMove = { from: string; read: string; write: string; move: "L" | "R" | "S"; to: string };
export type MachineDesignMachine = { states: string[]; start: string; accept: string[]; transitions: (PdaMove | TmMove)[] };
export type MachineDesignAnswerKeyV1 = { reference: MachineDesignMachine; layout?: AutomatonLayout };
export type MachineDesignAnswer = { kind: "machineDesign"; machine: MachineDesignMachine; layout?: AutomatonLayout };
export type MachineDesignIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): MachineDesignIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN.has(k));
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
/** The judge's alphabet symbols (no $: it marks a function's answer) and the course's fixed marks. */
const SYMBOL = /^[A-Za-z0-9#*+@]$/;
const STATE_ID = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
const BOTTOM = "⏊", BLANK = "∆", LEFT_END = "├";
const PDA_KEYS = ["from", "read", "top", "op", "write", "to"] as const;
const TM_KEYS = ["from", "read", "write", "move", "to"] as const;

export const machineDesignQuestionVersion = (node: unknown): number | undefined => isPlain(node) ? effectiveQuestionTypeVersion(MACHINE_DESIGN_TYPE_KEY, node.questionTypeVersion) : undefined;
export const defaultMachineDesignConfig = (): MachineDesignConfigV1 => ({ v: 1, machine: "PDA", alphabet: ["a", "b"], maxStates: 6 });

function readWords(raw: unknown, alphabet: string[]): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MACHINE_DESIGN_LIMITS.words) return null;
  const out: string[] = [];
  for (const w of raw) {
    if (!str(w, MACHINE_DESIGN_LIMITS.wordChars) || ![...w].every(c => alphabet.includes(c))) return null;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}
/** A function's example: a word of the alphabet and its output (bounded, no $ inside). */
function readComputeExamples(raw: unknown, alphabet: string[]): { word: string; output: string }[] | null {
  if (!Array.isArray(raw) || raw.length > MACHINE_DESIGN_LIMITS.words) return null;
  const out: { word: string; output: string }[] = [];
  for (const x of raw) {
    if (!isPlain(x) || !onlyKeys(x, ["word", "output"]) || !str(x.word, MACHINE_DESIGN_LIMITS.wordChars) || !str(x.output, MACHINE_DESIGN_LIMITS.answerChars)) return null;
    if (![...x.word].every(c => alphabet.includes(c)) || x.output.includes("$")) return null;
    if (out.some(y => y.word === x.word)) return null;
    out.push({ word: x.word, output: x.output });
  }
  return out;
}

export type MachineDesignConfigResult = { ok: true; config: MachineDesignConfigV1; issues: [] } | { ok: false; issues: MachineDesignIssue[] };
export function validateMachineDesignConfig(raw: unknown): MachineDesignConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("MACHINE_CONFIG_MISSING", "إعداد سؤال تصميم الآلة مفقود.", "machineDesign")] };
  const issues: MachineDesignIssue[] = [];
  if (!onlyKeys(raw, ["v", "machine", "mode", "alphabet", "maxStates", "leftEnd", "maxLength", "examples"])) issues.push(err("MACHINE_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "machineDesign"));
  if (raw.v !== 1) issues.push(err("MACHINE_VERSION", "إصدار إعداد السؤال غير مدعوم.", "machineDesign.v"));
  const machine = raw.machine;
  if (machine !== "PDA" && machine !== "TM") issues.push(err("MACHINE_KIND_INVALID", "نوع الآلة: أوتومات مكدّس أو آلة تورنغ.", "machineDesign.machine"));
  const compute = raw.mode === "compute";
  if (own(raw, "mode") && raw.mode !== "compute") issues.push(err("MACHINE_MODE_INVALID", "«تحسب دالة» قيمته compute، أو يُحذف الحقل لتمييز لغة.", "machineDesign.mode"));
  if (compute && machine !== "TM") issues.push(err("MACHINE_MODE_PDA", "حساب الدوال لآلة تورنغ فقط.", "machineDesign.mode"));
  const alphabet: string[] = [];
  if (!Array.isArray(raw.alphabet) || raw.alphabet.length === 0 || raw.alphabet.length > MACHINE_DESIGN_LIMITS.symbols) issues.push(err("MACHINE_ALPHABET_INVALID", "الأبجدية من رمز واحد إلى " + MACHINE_DESIGN_LIMITS.symbols + " رموز.", "machineDesign.alphabet"));
  else for (const s of raw.alphabet) {
    if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) { issues.push(err("MACHINE_ALPHABET_INVALID", "كل رمز في الأبجدية حرف أو رقم واحد (أو # * + @)، بلا تكرار؛ و $ لعلامة الجواب.", "machineDesign.alphabet")); break; }
    alphabet.push(s);
  }
  const max = raw.maxStates;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > MACHINE_DESIGN_LIMITS.states) issues.push(err("MACHINE_MAX_STATES_INVALID", "الحد الأقصى للحالات من 1 إلى " + MACHINE_DESIGN_LIMITS.states + ".", "machineDesign.maxStates"));
  if (own(raw, "leftEnd") && raw.leftEnd !== true) issues.push(err("MACHINE_LEFT_END_INVALID", "«بداية الشريط ├» قيمتها true أو يُحذف الحقل.", "machineDesign.leftEnd"));
  if (raw.leftEnd === true && machine !== "TM") issues.push(err("MACHINE_LEFT_END_PDA", "بداية الشريط ├ لآلة تورنغ فقط.", "machineDesign.leftEnd"));
  const len = raw.maxLength;
  if (own(raw, "maxLength") && (typeof len !== "number" || !Number.isInteger(len) || len < 1 || len > MACHINE_DESIGN_LIMITS.maxLength)) issues.push(err("MACHINE_MAX_LENGTH_INVALID", "أطول كلمة تُجرَّب من 1 إلى " + MACHINE_DESIGN_LIMITS.maxLength + ".", "machineDesign.maxLength"));
  let examples: MachineDesignExamples | undefined;
  if (own(raw, "examples")) {
    const ex = raw.examples;
    if (compute) {
      const list = isPlain(ex) && onlyKeys(ex, ["compute"]) ? readComputeExamples(ex.compute, alphabet) : null;
      if (!list) issues.push(err("MACHINE_EXAMPLES_INVALID", "أمثلة الدالة حتى " + MACHINE_DESIGN_LIMITS.words + "، كل مثال كلمة من الأبجدية وجوابها (بلا $)، بلا تكرار للكلمة.", "machineDesign.examples"));
      else if (list.length) examples = { compute: list };
    } else {
      const accept = isPlain(ex) && onlyKeys(ex, ["accept", "reject"]) ? readWords(ex.accept, alphabet) : null, reject = isPlain(ex) ? readWords(ex.reject, alphabet) : null;
      if (!accept || !reject) issues.push(err("MACHINE_EXAMPLES_INVALID", "الكلمات الأمثلة حتى " + MACHINE_DESIGN_LIMITS.words + " لكل قائمة، من رموز الأبجدية فقط، وحتى " + MACHINE_DESIGN_LIMITS.wordChars + " رمزًا.", "machineDesign.examples"));
      else if (accept.some(w => reject.includes(w))) issues.push(err("MACHINE_EXAMPLES_CONFLICT", "كلمة في الأمثلة المقبولة والمرفوضة معًا.", "machineDesign.examples"));
      else if (accept.length || reject.length) examples = { accept, reject };
    }
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, issues: [], config: {
    v: 1, machine: machine as MachineDesignKind, ...(compute ? { mode: "compute" as const } : {}), alphabet, maxStates: max as number,
    ...(raw.leftEnd === true ? { leftEnd: true as const } : {}), ...(own(raw, "maxLength") ? { maxLength: len as number } : {}), ...(examples ? { examples } : {}),
  } };
}

/** One transition's SHAPE for a kind (bounded strings, the move / operation among its values), or null. */
function readMove(t: unknown, kind: MachineDesignKind): PdaMove | TmMove | null {
  if (!isPlain(t)) return null;
  const L = MACHINE_DESIGN_LIMITS;
  if (kind === "PDA") {
    if (!onlyKeys(t, PDA_KEYS) || !PDA_KEYS.every(k => own(t, k))) return null;
    if (![t.from, t.to].every(x => str(x, L.stateChars)) || !str(t.read, 4) || !str(t.top, 4) || !str(t.write, L.writeChars)) return null;
    if (t.op !== "push" && t.op !== "pop" && t.op !== "none") return null;
    return { from: t.from as string, read: t.read as string, top: t.top as string, op: t.op, write: t.write as string, to: t.to as string };
  }
  if (!onlyKeys(t, TM_KEYS) || !TM_KEYS.every(k => own(t, k))) return null;
  if (![t.from, t.to].every(x => str(x, L.stateChars)) || !str(t.read, 4) || !str(t.write, 4)) return null;
  if (t.move !== "L" && t.move !== "R" && t.move !== "S") return null;
  return { from: t.from as string, read: t.read as string, write: t.write as string, move: t.move, to: t.to as string };
}
/** A machine's shape (the reference, or a student's answer) for a kind — or, without a kind, for either. Bounded; nothing judged here. */
function readMachineShape(raw: unknown, kind: MachineDesignKind | null): MachineDesignMachine | null {
  if (!isPlain(raw) || !onlyKeys(raw, ["states", "start", "accept", "transitions"])) return null;
  const { states, start, accept, transitions } = raw;
  const L = MACHINE_DESIGN_LIMITS;
  if (!Array.isArray(states) || states.length === 0 || states.length > L.states * 2) return null;
  if (states.some(q => typeof q !== "string" || q.length === 0 || q.length > L.stateChars || FORBIDDEN.has(q))) return null;
  if (!str(start, L.stateChars)) return null;
  if (!Array.isArray(accept) || accept.length > states.length || accept.some(q => !str(q, L.stateChars))) return null;
  if (!Array.isArray(transitions) || transitions.length > L.transitions) return null;
  const kinds: MachineDesignKind[] = kind ? [kind] : ["PDA", "TM"];
  for (const k of kinds) {
    const out: (PdaMove | TmMove)[] = [];
    let ok = true;
    for (const t of transitions) { const m = readMove(t, k); if (!m) { ok = false; break; } out.push(m); }
    if (ok) return { states: [...(states as string[])], start, accept: [...(accept as string[])], transitions: out };
  }
  return null;
}

/** The machine as the book's engine reads it (the judge's own reader), under the question's rules — or null. */
export function engineMachine(m: MachineDesignMachine, config: MachineDesignConfigV1): Machine | null {
  const automaton = {
    kind: config.machine, states: m.states, alphabet: config.alphabet, start: m.start, accept: m.accept, transitions: m.transitions,
    ...(config.machine === "PDA" ? { bottom: BOTTOM } : { blank: BLANK, ...(config.leftEnd ? { leftEnd: LEFT_END } : {}) }),
  };
  const read = readAutomatonConfig({ automaton });
  return read ? read.machine : null;
}
/** The course's «حساب دوال»: what stands between the first two $ of a tape, or null (the judge's answerOnTape — parity-tested). */
export function answerBetweenDollars(cells: readonly string[]): string | null {
  const first = cells.indexOf("$");
  const second = first < 0 ? -1 : cells.indexOf("$", first + 1);
  return second < 0 ? null : cells.slice(first + 1, second).join("");
}

type KeyResult = { ok: true; key: MachineDesignAnswerKeyV1; issues: [] } | { ok: false; issues: MachineDesignIssue[] };
function checkKey(raw: unknown, config: MachineDesignConfigV1 | null): KeyResult {
  const bad = (code: string, message: string): KeyResult => ({ ok: false, issues: [err(code, message, "answer.reference")] });
  if (!isPlain(raw) || !onlyKeys(raw, ["reference", "layout"])) return { ok: false, issues: [err("MACHINE_KEY_INVALID", "الآلة النموذجية (مفتاح التصحيح) مفقودة أو غير صالحة.", "answer")] };
  if (raw.reference === undefined) return { ok: false, issues: [err("MACHINE_KEY_INVALID", "الآلة النموذجية (مفتاح التصحيح) مفقودة: ابنِها في محرر السؤال.", "answer")] };
  const m = readMachineShape(raw.reference, config ? config.machine : null);
  if (!m) return bad("MACHINE_KEY_INVALID", "الآلة النموذجية غير صالحة.");
  if (m.states.length > MACHINE_DESIGN_LIMITS.states) return bad("MACHINE_KEY_TOO_BIG", "الآلة النموذجية حتى " + MACHINE_DESIGN_LIMITS.states + " حالة.");
  if (m.states.some(q => !STATE_ID.test(q)) || new Set(m.states).size !== m.states.length) return bad("MACHINE_KEY_STATES", "أسماء حالات الآلة النموذجية: حرف ثم حروف أو أرقام، بلا تكرار.");
  if (!m.states.includes(m.start)) return bad("MACHINE_KEY_START", "اختر حالة البداية في الآلة النموذجية.");
  if (m.accept.some(q => !m.states.includes(q)) || new Set(m.accept).size !== m.accept.length) return bad("MACHINE_KEY_INVALID", "حالات القبول في الآلة النموذجية غير صالحة.");
  if (m.transitions.some(t => !m.states.includes(t.from) || !m.states.includes(t.to))) return bad("MACHINE_KEY_INVALID", "انتقال في الآلة النموذجية من حالة أو إلى حالة غير موجودة.");
  if (config) {
    const machine = engineMachine(m, config);
    if (!machine) return bad("MACHINE_KEY_UNREADABLE", config.machine === "PDA"
      ? "الآلة النموذجية لا تُقرأ: أوتومات المكدّس حتمي (حركة واحدة لكل حالة ورمز وقمة)، والرموز من الأبجدية أو المكدّس."
      : "الآلة النموذجية لا تُقرأ: آلة تورنغ حتمية (حركة واحدة لكل حالة ورمز تحت الرأس)، و ├ لا يُكتب فوقه ولا حركة يسارًا منه.");
    const ex = config.examples;
    if (ex && "compute" in ex) {
      for (const x of ex.compute) {
        const r = runAutomaton(machine, [...x.word]);
        const last = r.steps[r.steps.length - 1];
        const got = r.verdict === "accept" && last && last.tape ? answerBetweenDollars(last.tape.cells) : null;
        if (got !== x.output) return bad("MACHINE_KEY_EXAMPLE", "على الكلمة «" + (x.word || "ε") + "» الجواب في الأمثلة «" + (x.output || "ε") + "»، والآلة النموذجية " + (r.verdict !== "accept" ? "لا تقبلها (ليست مدخلًا للدالة)." : "تعطي «" + (got === null ? "لا جواب بين علامتي $" : got || "ε") + "»."));
      }
    } else if (ex) {
      const w = ex.accept.find(x => runAutomaton(machine, [...x]).verdict !== "accept");
      if (w !== undefined) return bad("MACHINE_KEY_EXAMPLE", "الكلمة «" + (w || "ε") + "» في الأمثلة المقبولة، لكن الآلة النموذجية لا تقبلها.");
      const r = ex.reject.find(x => runAutomaton(machine, [...x]).verdict === "accept");
      if (r !== undefined) return bad("MACHINE_KEY_EXAMPLE", "الكلمة «" + (r || "ε") + "» في الأمثلة المرفوضة، لكن الآلة النموذجية تقبلها.");
    }
  }
  let layout: AutomatonLayout | undefined;
  if (raw.layout !== undefined) {
    const l = readAutomatonLayout(raw.layout, m.states);
    if (!l) return { ok: false, issues: [err("MACHINE_KEY_LAYOUT", "أماكن حالات الآلة النموذجية في الرسم غير صالحة.", "answer.layout")] };
    if (Object.keys(l).length) layout = l;
  }
  return { ok: true, key: { reference: m, ...(layout ? { layout } : {}) }, issues: [] };
}
export function validateMachineDesignAnswerKey(raw: unknown, rawConfig: unknown): KeyResult {
  const cfg = validateMachineDesignConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("MACHINE_KEY_CONFIG_INVALID", "لا يمكن فحص الآلة النموذجية لأن إعداد السؤال غير صالح.", "machineDesign")] };
  return checkKey(raw, cfg.config);
}
export function validateMachineDesignQuestion(node: Record<string, unknown>): MachineDesignIssue[] {
  const out: MachineDesignIssue[] = [];
  if (machineDesignQuestionVersion(node) === undefined) out.push(err("MACHINE_VERSION_UNSUPPORTED", "إصدار السؤال غير مدعوم.", "questionTypeVersion"));
  const cfg = validateMachineDesignConfig(node.machineDesign); if (!cfg.ok) out.push(...cfg.issues);
  const key = checkKey(node.answer, cfg.ok ? cfg.config : null); if (!key.ok) out.push(...key.issues);
  return out;
}

/** The student projection: the canonical config (it holds no answer data). null when the config is not valid. */
export function projectMachineDesignConfigForStudent(raw: unknown): MachineDesignConfigV1 | null {
  const r = validateMachineDesignConfig(raw);
  return r.ok ? r.config : null;
}
/** The grading authority: the canonical config and reference, or null (the grader then fails closed: teacher review, never a mark). */
export function machineDesignAuthority(rawConfig: unknown, rawKey: unknown): { config: MachineDesignConfigV1; key: MachineDesignAnswerKeyV1 } | null {
  const cfg = validateMachineDesignConfig(rawConfig); if (!cfg.ok) return null;
  const key = checkKey(rawKey, cfg.config); return key.ok ? { config: cfg.config, key: key.key } : null;
}

export type MachineDesignAnswerResult = { ok: true; answer: MachineDesignAnswer } | { ok: false; code: string };
/** The answer's SHAPE only (bounded strings and arrays): a machine that breaks a rule of the question is kept, and judged wrong. */
export function normalizeMachineDesignAnswer(a: unknown): MachineDesignAnswerResult {
  if (!isPlain(a) || a.kind !== "machineDesign" || !onlyKeys(a, ["kind", "machine", "layout"])) return { ok: false, code: "MACHINE_ANSWER_INVALID" };
  const m = readMachineShape(a.machine, null);
  if (!m) return { ok: false, code: "MACHINE_ANSWER_INVALID" };
  const layout = a.layout === undefined ? null : readAutomatonLayout(a.layout, m.states);   // presentation only: dropped alone when it does not read
  return { ok: true, answer: { kind: "machineDesign", machine: m, ...(layout && Object.keys(layout).length ? { layout } : {}) } };
}
/** Draft / submission binding: the shape (the question's rules are the grader's to judge, so an answer is never dropped for breaking one). */
export function bindMachineDesignAnswerToQuestion(a: unknown, question: unknown): MachineDesignAnswerResult {
  void question;
  return normalizeMachineDesignAnswer(a);
}
/** Answered: the student did something beyond the empty start state — a transition, an accepting state or another state. */
export const isMachineDesignAnswerAnswered = (a: unknown): boolean => {
  if (!isPlain(a) || a.kind !== "machineDesign" || !isPlain(a.machine)) return false;
  const m = a.machine;
  return (Array.isArray(m.transitions) && m.transitions.length > 0) || (Array.isArray(m.accept) && m.accept.length > 0) || (Array.isArray(m.states) && m.states.length > 1);
};
