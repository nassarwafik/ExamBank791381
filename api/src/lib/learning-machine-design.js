// AUTO-A10 (docs/enterprise-automata-lab-a4.md §14) — the SERVER judge of a book «صمّم الآلة» exercise for a PUSH-DOWN automaton or a
// TURING machine (`simulation` / `machine-design` v1). Owner decisions (2026-11-25): book exercises first (no exam grading); the verdict
// is «your machine agrees with the reference on every word up to length N» — honest, not a proof — or the SHORTEST word on which they
// certainly disagree; Turing machines both RECOGNISE languages and COMPUTE functions (the answer on the tape between two $).
//
//   • The key is { kind: "machine-design", rules, reference } from the check index — never served. `rules` are the public task rules
//     (machine, alphabet, state limit, the TM's mode, the longest word tried); `reference` is the private reference machine in the
//     book's automaton-trace format. A key that does not read is NOT the learner's fault → `unavailable` (retryable, nothing written).
//   • Machines run in the book's OWN engine (shared-finalization/learning/activities/automaton, compiled from the player's
//     src/learning/activities/automaton.ts): a machine behaves here exactly as in the book's step-by-step player.
//   • Only `machine` is read from the response; the alphabet is the TASK's. A machine the course's strict reader refuses (a push-down
//     automaton with two moves for one state / symbol / top, a move from an unknown state…) is wrong with `issue: malformed`; one with
//     too many states, `too-many-states` — public rules.
//   • Every word of length 0…N over the alphabet, in shortlex order (shorter first, then the alphabet's order), is run on both machines.
//     N = the task's `maxLength` (default 8), lowered until at most WORD_BUDGET words are tried. The first word on which their verdicts
//     (or, for a function, their answers) differ is the counterexample — certain, since both runs halted.
//   • AUTO-A10b (owner decision 2026-11-25, «Only inputs the model accepts»): for a FUNCTION the reference also fixes its domain. A word
//     on which the reference halts WITHOUT accepting (an input of the wrong form, e.g. «##» for x + y over {1, #}) is outside the
//     function: skipped and counted like a word the reference does not halt on, never judged. Only answers on the domain are compared.
//   • A Turing machine may run forever: a run is cut at the engine's step limit (LIMITS.tmSteps). A word on which the REFERENCE does not
//     halt is skipped (counted, never judged); one on which the LEARNER's does not halt while the reference does is reported as
//     `nohalt: { word }` — it does not certainly disagree, so it is not a counterexample, and the verdict is not «agrees».
//   • No difference → { correct: true, agreesUpTo: { length: N, words } } — the UI says «agrees on every word up to length N», never
//     «proved right».
// Practice only: nothing here grades an exam or writes storage. Pure; never throws.
const { readAutomatonConfig, runAutomaton, LIMITS: ENGINE } = require("./shared-finalization/learning/activities/automaton");

const KIND = "machine-design";
const SYMBOL = /^[A-Za-z0-9#*+@]$/;
const LIMITS = Object.freeze({ states: 12, symbols: 4, transitions: 80, maxLength: 10, wordBudget: 2000, referenceStates: 24 });
const DEFAULT_LENGTH = 8;
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/** The task rules of a key, or null when they do not read. */
function readRules(raw) {
  if (!isPlainObject(raw)) return null;
  if (raw.machine !== "PDA" && raw.machine !== "TM") return null;
  if (!Array.isArray(raw.alphabet) || raw.alphabet.length === 0 || raw.alphabet.length > LIMITS.symbols) return null;
  const alphabet = [];
  for (const s of raw.alphabet) { if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) return null; alphabet.push(s); }
  const maxStates = raw.maxStates === undefined ? LIMITS.states : raw.maxStates;
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > LIMITS.states) return null;
  const mode = raw.mode === undefined ? "recognize" : raw.mode;
  if (mode !== "recognize" && mode !== "compute") return null;
  if (mode === "compute" && raw.machine !== "TM") return null;
  const maxLength = raw.maxLength === undefined ? DEFAULT_LENGTH : raw.maxLength;
  if (!Number.isInteger(maxLength) || maxLength < 1 || maxLength > LIMITS.maxLength) return null;
  return { machine: raw.machine, alphabet, maxStates, mode, maxLength, leftEnd: raw.leftEnd === true };
}

/** A machine read by the book's engine under the task's alphabet, or { issue }. */
function readMachine(raw, rules, { reference = false } = {}) {
  if (!isPlainObject(raw) || !Array.isArray(raw.states) || !Array.isArray(raw.transitions)) return { issue: { code: "malformed" } };
  if (raw.states.length > (reference ? LIMITS.referenceStates : rules.maxStates)) return { issue: { code: "too-many-states", max: rules.maxStates } };
  if (raw.transitions.length > LIMITS.transitions) return { issue: { code: "malformed" } };
  const automaton = {
    kind: rules.machine, states: raw.states, alphabet: rules.alphabet, start: raw.start, accept: raw.accept, transitions: raw.transitions,
    ...(rules.machine === "PDA" ? { bottom: "⏊" } : { blank: "∆", ...(rules.leftEnd ? { leftEnd: "├" } : {}) }),
  };
  const read = readAutomatonConfig({ automaton });
  return read ? { machine: read.machine } : { issue: { code: "malformed" } };
}

/** A Turing machine's halt: the verdict and the written tape (the lab's tmHalt, pinned equal to the engine's verdict). */
function tmHalt(tm, symbols) {
  const tape = new Map();
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
  for (let n = 0; n < ENGINE.tmSteps; n++) {
    const under = tape.get(head) ?? tm.blank;
    const t = tm.transitions.find(x => x.from === q && x.read === under);
    if (!t) return { verdict: tm.accept.includes(q) ? "accept" : "reject", tape: written() };
    tape.set(head, t.write);
    head += t.move === "R" ? 1 : t.move === "L" ? -1 : 0;
    q = t.to;
  }
  return { verdict: "nohalt", tape: "" };
}
/** The course's convention for «حساب دوال»: the answer is what stands between the first two $ on the tape (null when there are not two). */
function answerOnTape(tape) {
  const cells = [...tape];
  const first = cells.indexOf("$");
  const second = first < 0 ? -1 : cells.indexOf("$", first + 1);
  return second < 0 ? null : cells.slice(first + 1, second).join("");
}

/** What a machine does on a word: { halted: false } or { halted: true, accept, answer? }. */
function outcome(m, rules, word) {
  const symbols = [...word];
  if (m.kind === "PDA") return { halted: true, accept: runAutomaton(m, symbols).verdict === "accept" };
  const h = tmHalt(m, symbols);
  if (h.verdict === "nohalt") return { halted: false };
  return { halted: true, accept: h.verdict === "accept", ...(rules.mode === "compute" ? { answer: answerOnTape(h.tape) } : {}) };
}

/** The longest length whose words (all lengths 0…n) fit the budget. */
function lengthFor(rules) {
  const k = rules.alphabet.length;
  let n = rules.maxLength;
  const count = len => { let total = 0, p = 1; for (let i = 0; i <= len; i++) { total += p; p *= k; } return total; };
  while (n > 1 && count(n) > LIMITS.wordBudget) n--;
  return n;
}
/** Every word of length 0…n over the alphabet, in shortlex order. */
function* shortlex(alphabet, n) {
  let level = [""];
  for (let len = 0; len <= n; len++) {
    for (const w of level) yield w;
    if (len < n) level = level.flatMap(w => alphabet.map(s => w + s));
  }
}

/**
 * key: { kind: "machine-design", rules, reference } · response: { kind: "machine-design", machine }.
 * → { status: "judged", correct, issue?, counterexample?, nohalt?, agreesUpTo? } | { status: "unavailable" }. Pure; never throws.
 */
function evaluateMachineDesign(key, response) {
  try {
    if (!isPlainObject(key) || key.kind !== KIND) return { status: "unavailable" };
    const rules = readRules(key.rules);
    if (!rules) return { status: "unavailable" };
    const ref = readMachine(key.reference, rules, { reference: true });
    if (!ref.machine) return { status: "unavailable" };
    const raw = isPlainObject(response) && response.kind === KIND ? response.machine : undefined;
    if (raw === undefined) return { status: "judged", correct: false, issue: { code: "malformed" } };
    const mine = readMachine(raw, rules);
    if (!mine.machine) return { status: "judged", correct: false, issue: mine.issue };
    const length = lengthFor(rules);
    let words = 0, skipped = 0, nohalt = null;
    for (const w of shortlex(rules.alphabet, length)) {
      const r = outcome(ref.machine, rules, w);
      if (!r.halted) { skipped++; continue; }
      if (rules.mode === "compute" && !r.accept) { skipped++; continue; }   // A10b — outside the function's domain: never judged
      words++;
      const l = outcome(mine.machine, rules, w);
      if (!l.halted) { if (!nohalt) nohalt = { word: w }; continue; }
      if (rules.mode === "compute") {
        if (r.answer !== l.answer) return { status: "judged", correct: false, counterexample: { word: w, expected: r.answer, got: l.answer } };
      } else if (r.accept !== l.accept) {
        return { status: "judged", correct: false, counterexample: { word: w, shouldAccept: r.accept } };
      }
    }
    if (nohalt) return { status: "judged", correct: false, nohalt };
    if (words === 0) return { status: "unavailable" };
    return { status: "judged", correct: true, agreesUpTo: { length, words, ...(skipped ? { skipped } : {}) } };
  } catch {
    return { status: "unavailable" };
  }
}

module.exports = { evaluateMachineDesign, readRules, readMachine, tmHalt, answerOnTape, lengthFor, MACHINE_DESIGN_LIMITS: LIMITS };
