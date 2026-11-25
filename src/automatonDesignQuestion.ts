// AUTO-A8 (docs/enterprise-automata-lab-a4.md §11) — automatonDesign@1: «صمّم أوتومات» in an exam. The student BUILDS a finite automaton
// (deterministic or not, as the question asks) for a language the stem describes; the server decides whether it accepts EXACTLY the language
// of the teacher's reference machine — the same judge as the book's «صمّم الآلة» exercises (api/src/lib/learning-automaton-design.js),
// called by the exam grader (api/src/lib/automaton-design-grading.js). Owner decisions (2026-11-25):
//   • full marks or zero: a machine that accepts the reference's language gets the question's marks, any other machine 0;
//   • the shortest word on which the two machines disagree is kept for the teacher (and shown to the student only after the results are
//     published — phase A8b);
//   • finite automata only (DFA / NFA): their equivalence is decidable, so the automatic mark is exact.
// This module is the PUBLIC contract and its validation (compiled for the server by scripts/build-shared-finalization.mjs):
//   • the config (`node.automatonDesign`) is the task's public rules — the machine type, the alphabet, the state limit, completeness and
//     optional example words; it holds no answer data and is projected to the student unchanged (canonical copy);
//   • the key (`node.answer`) is `{ reference }`, the teacher's machine — removed by the student sanitizer, never sent;
//   • the answer is `{ kind: "automatonDesign", machine }`: the student's states, start, accepting states and arrows. A machine that breaks
//     a public rule (too many states, a symbol outside the alphabet, …) is KEPT as answered and judged wrong by the grader — never dropped.
import { effectiveQuestionTypeVersion } from "./questionTypeCatalog";

export const AUTOMATON_DESIGN_TYPE_KEY = "automatonDesign";
export const AUTOMATON_DESIGN_LIMITS = Object.freeze({ states: 12, symbols: 6, transitions: 200, words: 8, wordChars: 20, stateChars: 8 });
export type AutomatonDesignMachineType = "DFA" | "NFA";
export type AutomatonDesignConfigV1 = { v: 1; machine: AutomatonDesignMachineType; alphabet: string[]; maxStates: number; complete?: true; examples?: { accept: string[]; reject: string[] } };
export type AutomatonMachine = { states: string[]; start: string; accept: string[]; transitions: [string, string, string][] };
export type AutomatonDesignAnswerKeyV1 = { reference: AutomatonMachine };
export type AutomatonDesignAnswer = { kind: "automatonDesign"; machine: AutomatonMachine };
export type AutomatonDesignIssue = { code: string; message: string; severity: "error"; path?: string };

const err = (code: string, message: string, path?: string): AutomatonDesignIssue => ({ code, message, severity: "error", ...(path ? { path } : {}) });
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
const isPlain = (v: unknown): v is Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[]) => Object.keys(o).every(k => allowed.includes(k) && !FORBIDDEN.has(k));
const own = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** The judge's own rules (learning-automaton-design.js): state names and symbols. */
const STATE_ID = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
const SYMBOL = /^[A-Za-z0-9#$*+@]$/;
const EPSILON = "ε";

export const automatonDesignQuestionVersion = (node: unknown): number | undefined => isPlain(node) ? effectiveQuestionTypeVersion(AUTOMATON_DESIGN_TYPE_KEY, node.questionTypeVersion) : undefined;
export const defaultAutomatonDesignConfig = (): AutomatonDesignConfigV1 => ({ v: 1, machine: "DFA", alphabet: ["a", "b"], maxStates: 4 });
export const defaultAutomatonDesignAnswerKey = (): AutomatonDesignAnswerKeyV1 => ({ reference: { states: ["q0"], start: "q0", accept: [], transitions: [] } });

function readWords(raw: unknown, alphabet: string[]): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > AUTOMATON_DESIGN_LIMITS.words) return null;
  const out: string[] = [];
  for (const w of raw) {
    if (typeof w !== "string" || w.length > AUTOMATON_DESIGN_LIMITS.wordChars || ![...w].every(c => alphabet.includes(c))) return null;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export type AutomatonDesignConfigResult = { ok: true; config: AutomatonDesignConfigV1; issues: [] } | { ok: false; issues: AutomatonDesignIssue[] };
export function validateAutomatonDesignConfig(raw: unknown): AutomatonDesignConfigResult {
  if (!isPlain(raw)) return { ok: false, issues: [err("AUTOMATON_CONFIG_MISSING", "إعداد سؤال تصميم الأوتومات مفقود.", "automatonDesign")] };
  const issues: AutomatonDesignIssue[] = [];
  if (!onlyKeys(raw, ["v", "machine", "alphabet", "maxStates", "complete", "examples"])) issues.push(err("AUTOMATON_UNKNOWN_KEY", "إعداد السؤال يحتوي حقولًا غير معروفة.", "automatonDesign"));
  if (raw.v !== 1) issues.push(err("AUTOMATON_VERSION", "إصدار إعداد السؤال غير مدعوم.", "automatonDesign.v"));
  const machine = raw.machine;
  if (machine !== "DFA" && machine !== "NFA") issues.push(err("AUTOMATON_MACHINE_INVALID", "نوع الآلة: أوتومات منتهٍ حتمي أو غير حتمي.", "automatonDesign.machine"));
  const alphabet: string[] = [];
  if (!Array.isArray(raw.alphabet) || raw.alphabet.length === 0 || raw.alphabet.length > AUTOMATON_DESIGN_LIMITS.symbols) issues.push(err("AUTOMATON_ALPHABET_INVALID", "الأبجدية من رمز واحد إلى " + AUTOMATON_DESIGN_LIMITS.symbols + " رموز.", "automatonDesign.alphabet"));
  else for (const s of raw.alphabet) {
    if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) { issues.push(err("AUTOMATON_ALPHABET_INVALID", "كل رمز في الأبجدية حرف أو رقم واحد (أو # $ * + @)، بلا تكرار.", "automatonDesign.alphabet")); break; }
    alphabet.push(s);
  }
  const max = raw.maxStates;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > AUTOMATON_DESIGN_LIMITS.states) issues.push(err("AUTOMATON_MAX_STATES_INVALID", "الحد الأقصى للحالات من 1 إلى " + AUTOMATON_DESIGN_LIMITS.states + ".", "automatonDesign.maxStates"));
  if (own(raw, "complete") && raw.complete !== true) issues.push(err("AUTOMATON_COMPLETE_INVALID", "«أوتومات كامل» قيمته true أو يُحذف الحقل.", "automatonDesign.complete"));
  if (raw.complete === true && machine !== "DFA") issues.push(err("AUTOMATON_COMPLETE_NFA", "الأوتومات الكامل حتمي فقط.", "automatonDesign.complete"));
  let examples: { accept: string[]; reject: string[] } | undefined;
  if (own(raw, "examples")) {
    const ex = raw.examples;
    const accept = isPlain(ex) && onlyKeys(ex, ["accept", "reject"]) ? readWords(ex.accept, alphabet) : null, reject = isPlain(ex) ? readWords(ex.reject, alphabet) : null;
    if (!accept || !reject) issues.push(err("AUTOMATON_EXAMPLES_INVALID", "الكلمات الأمثلة حتى " + AUTOMATON_DESIGN_LIMITS.words + " لكل قائمة، من رموز الأبجدية فقط، وحتى " + AUTOMATON_DESIGN_LIMITS.wordChars + " رمزًا.", "automatonDesign.examples"));
    else if (accept.some(w => reject.includes(w))) issues.push(err("AUTOMATON_EXAMPLES_CONFLICT", "كلمة في الأمثلة المقبولة والمرفوضة معًا.", "automatonDesign.examples"));
    else if (accept.length || reject.length) examples = { accept, reject };
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, config: { v: 1, machine: machine as AutomatonDesignMachineType, alphabet, maxStates: max as number, ...(raw.complete === true ? { complete: true as const } : {}), ...(examples ? { examples } : {}) }, issues: [] };
}

/** A machine's shape (the reference, or a student's answer): bounded, well-typed. Symbols are NOT checked against the alphabet here. */
function readMachineShape(raw: unknown): AutomatonMachine | null {
  if (!isPlain(raw) || !onlyKeys(raw, ["states", "start", "accept", "transitions"])) return null;
  const { states, start, accept, transitions } = raw;
  if (!Array.isArray(states) || states.length === 0 || states.length > AUTOMATON_DESIGN_LIMITS.states * 2) return null;
  if (states.some(q => typeof q !== "string" || q.length === 0 || q.length > AUTOMATON_DESIGN_LIMITS.stateChars || FORBIDDEN.has(q))) return null;
  if (typeof start !== "string" || start.length > AUTOMATON_DESIGN_LIMITS.stateChars) return null;
  if (!Array.isArray(accept) || accept.length > states.length || accept.some(q => typeof q !== "string" || q.length > AUTOMATON_DESIGN_LIMITS.stateChars)) return null;
  if (!Array.isArray(transitions) || transitions.length > AUTOMATON_DESIGN_LIMITS.transitions) return null;
  const out: [string, string, string][] = [];
  for (const t of transitions) {
    if (!Array.isArray(t) || t.length !== 3 || t.some(x => typeof x !== "string" || x.length > AUTOMATON_DESIGN_LIMITS.stateChars)) return null;
    out.push([t[0], t[1], t[2]]);
  }
  return { states: [...(states as string[])], start, accept: [...(accept as string[])], transitions: out };
}

/** Accepts `word`? — the reference simulated as a non-deterministic automaton (ε arrows followed). */
function runs(m: AutomatonMachine, word: string): boolean {
  const close = (set: Set<string>) => { const st = [...set]; while (st.length) { const q = st.pop() as string; for (const [f, s, t] of m.transitions) if (f === q && s === EPSILON && !set.has(t)) { set.add(t); st.push(t); } } return set; };
  let now = close(new Set([m.start]));
  for (const c of word) { const next = new Set<string>(); for (const [f, s, t] of m.transitions) if (s === c && now.has(f)) next.add(t); now = close(next); }
  return [...now].some(q => m.accept.includes(q));
}

type KeyResult = { ok: true; key: AutomatonDesignAnswerKeyV1; issues: [] } | { ok: false; issues: AutomatonDesignIssue[] };
function checkKey(raw: unknown, config: AutomatonDesignConfigV1 | null): KeyResult {
  const bad = (code: string, message: string): KeyResult => ({ ok: false, issues: [err(code, message, "answer.reference")] });
  if (!isPlain(raw) || !onlyKeys(raw, ["reference"])) return { ok: false, issues: [err("AUTOMATON_KEY_INVALID", "الآلة النموذجية (مفتاح التصحيح) مفقودة أو غير صالحة.", "answer")] };
  if (raw.reference === undefined) return { ok: false, issues: [err("AUTOMATON_KEY_INVALID", "الآلة النموذجية (مفتاح التصحيح) مفقودة: ابنِها في محرر السؤال.", "answer")] };
  const m = readMachineShape(raw.reference);
  if (!m) return bad("AUTOMATON_KEY_INVALID", "الآلة النموذجية غير صالحة.");
  if (m.states.length > AUTOMATON_DESIGN_LIMITS.states) return bad("AUTOMATON_KEY_TOO_BIG", "الآلة النموذجية حتى " + AUTOMATON_DESIGN_LIMITS.states + " حالة.");
  if (m.states.some(q => !STATE_ID.test(q)) || new Set(m.states).size !== m.states.length) return bad("AUTOMATON_KEY_STATES", "أسماء حالات الآلة النموذجية: حرف ثم حروف أو أرقام، بلا تكرار.");
  if (!m.states.includes(m.start)) return bad("AUTOMATON_KEY_START", "اختر حالة البداية في الآلة النموذجية.");
  if (m.accept.some(q => !m.states.includes(q)) || new Set(m.accept).size !== m.accept.length) return bad("AUTOMATON_KEY_INVALID", "حالات القبول في الآلة النموذجية غير صالحة.");
  if (m.transitions.some(([f, , t]) => !m.states.includes(f) || !m.states.includes(t))) return bad("AUTOMATON_KEY_INVALID", "سهم في الآلة النموذجية من حالة أو إلى حالة غير موجودة.");
  if (config) {
    const odd = m.transitions.find(([, s]) => s !== EPSILON && !config.alphabet.includes(s));
    if (odd) return bad("AUTOMATON_KEY_SYMBOL", "الرمز «" + odd[1].slice(0, 4) + "» في الآلة النموذجية ليس في أبجدية السؤال.");
    const ex = config.examples;
    if (ex) {
      const w = ex.accept.find(x => !runs(m, x));
      if (w !== undefined) return bad("AUTOMATON_KEY_EXAMPLE", "الكلمة «" + (w || "ε") + "» في الأمثلة المقبولة، لكن الآلة النموذجية ترفضها.");
      const r = ex.reject.find(x => runs(m, x));
      if (r !== undefined) return bad("AUTOMATON_KEY_EXAMPLE", "الكلمة «" + (r || "ε") + "» في الأمثلة المرفوضة، لكن الآلة النموذجية تقبلها.");
    }
  }
  return { ok: true, key: { reference: m }, issues: [] };
}
export function validateAutomatonDesignAnswerKey(raw: unknown, rawConfig: unknown): KeyResult {
  const cfg = validateAutomatonDesignConfig(rawConfig);
  if (!cfg.ok) return { ok: false, issues: [err("AUTOMATON_KEY_CONFIG_INVALID", "لا يمكن فحص الآلة النموذجية لأن إعداد السؤال غير صالح.", "automatonDesign")] };
  return checkKey(raw, cfg.config);
}
export function validateAutomatonDesignQuestion(node: Record<string, unknown>): AutomatonDesignIssue[] {
  const out: AutomatonDesignIssue[] = [];
  if (automatonDesignQuestionVersion(node) === undefined) out.push(err("AUTOMATON_VERSION_UNSUPPORTED", "إصدار السؤال غير مدعوم.", "questionTypeVersion"));
  const cfg = validateAutomatonDesignConfig(node.automatonDesign); if (!cfg.ok) out.push(...cfg.issues);
  const key = checkKey(node.answer, cfg.ok ? cfg.config : null); if (!key.ok) out.push(...key.issues);
  return out;
}

/** The student projection: the canonical config (it holds no answer data). null when the config is not valid. */
export function projectAutomatonDesignConfigForStudent(raw: unknown): AutomatonDesignConfigV1 | null {
  const r = validateAutomatonDesignConfig(raw);
  return r.ok ? r.config : null;
}

/** The grading authority: the canonical config and reference, or null (the grader then fails closed: teacher review, never a mark). */
export function automatonDesignAuthority(rawConfig: unknown, rawKey: unknown): { config: AutomatonDesignConfigV1; key: AutomatonDesignAnswerKeyV1 } | null {
  const cfg = validateAutomatonDesignConfig(rawConfig); if (!cfg.ok) return null;
  const key = checkKey(rawKey, cfg.config); return key.ok ? { config: cfg.config, key: key.key } : null;
}

export type AutomatonDesignAnswerResult = { ok: true; answer: AutomatonDesignAnswer } | { ok: false; code: string };
/** The answer's SHAPE only (bounded strings and arrays): a machine that breaks a rule of the question is kept, and judged wrong. */
export function normalizeAutomatonDesignAnswer(a: unknown): AutomatonDesignAnswerResult {
  if (!isPlain(a) || a.kind !== "automatonDesign" || !onlyKeys(a, ["kind", "machine"])) return { ok: false, code: "AUTOMATON_ANSWER_INVALID" };
  const m = readMachineShape(a.machine);
  return m ? { ok: true, answer: { kind: "automatonDesign", machine: m } } : { ok: false, code: "AUTOMATON_ANSWER_INVALID" };
}
/** Draft / submission binding: the shape (the question's rules are the grader's to judge, so an answer is never dropped for breaking one). */
export function bindAutomatonDesignAnswerToQuestion(a: unknown, question: unknown): AutomatonDesignAnswerResult {
  void question;
  return normalizeAutomatonDesignAnswer(a);
}
/** Answered: the student did something beyond the empty start state — an arrow, an accepting state or another state. */
export const isAutomatonDesignAnswerAnswered = (a: unknown): boolean => {
  if (!isPlain(a) || a.kind !== "automatonDesign" || !isPlain(a.machine)) return false;
  const m = a.machine;
  return (Array.isArray(m.transitions) && m.transitions.length > 0) || (Array.isArray(m.accept) && m.accept.length > 0) || (Array.isArray(m.states) && m.states.length > 1);
};
