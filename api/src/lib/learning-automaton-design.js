// AUTO-A3 (docs/enterprise-automata-design-a3.md) — the SERVER judge of a «صمّم الآلة» exercise (`simulation` /
// `automaton-design` v1): the learner builds a finite automaton (DFA or NFA) in the Reader; the server decides whether it
// accepts EXACTLY the language of the authored reference machine.
//
//   • The key is { kind: "automaton-design", rules, reference } from the check index — never served. `rules` are the public task
//     rules (machine type, alphabet, state limit, completeness); `reference` is the private reference machine. A key that does
//     not read (a broken reference or rules) is NOT the learner's fault: the result is `unavailable` (the API answers a retryable
//     error and writes nothing; never a "wrong", AGENTS.md §10 grading safety).
//   • Only `machine` is read from the response. Any verdict, score or flag the browser sends is ignored.
//   • A machine that breaks a PUBLIC rule of the task (a symbol outside the alphabet, two arrows for one symbol in a DFA, a missing
//     arrow when the task asks for a complete DFA, too many states…) is judged wrong with an `issue` that names the rule — the
//     rules are the task statement, so naming one reveals nothing of the key.
//   • A machine that follows the rules is compared with the reference by the product of the two determinised machines, explored
//     breadth-first in shortlex order (shorter words first, then the alphabet's order). The first reachable pair where one accepts
//     and the other does not gives the SHORTEST word on which they disagree: `counterexample: { word, shouldAccept }`. This is
//     the exam's «מילה מפרידה» and the course's own feedback style («الكلمة abb يجب أن تُقبل»); it says one word, never the key.
//     No such pair → the languages are equal → right.
//   • Everything is bounded (states, transitions, alphabet, explored pairs). A learner machine has at most 12 states, so at most
//     2¹² state sets; the pair bound (60 000) leaves room for a reference of up to 14 reachable sets beside the worst learner NFA.
//     Reaching the bound anyway is treated as a judge that could not run (`unavailable`, retryable), never as a wrong answer.
//
// Practice only: nothing here grades an exam, writes storage or knows about Strength. Pure; never throws.

const KIND = "automaton-design";
const EPSILON = new Set(["ε", "λ"]);
const STATE_ID = /^[A-Za-z][A-Za-z0-9_]{0,7}$/;
const SYMBOL = /^[A-Za-z0-9#$*+@]$/;
const LIMITS = Object.freeze({ states: 12, symbols: 6, transitions: 200, pairs: 60000, referenceStates: 24 });
const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v);

/** The task rules of a key, or null when they do not read. */
function readRules(raw) {
  if (!isPlainObject(raw)) return null;
  const type = raw.machine;
  if (type !== "DFA" && type !== "NFA") return null;
  if (!Array.isArray(raw.alphabet) || raw.alphabet.length === 0 || raw.alphabet.length > LIMITS.symbols) return null;
  const alphabet = [];
  for (const s of raw.alphabet) { if (typeof s !== "string" || !SYMBOL.test(s) || alphabet.includes(s)) return null; alphabet.push(s); }
  const maxStates = raw.maxStates === undefined ? LIMITS.states : raw.maxStates;
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > LIMITS.states) return null;
  if (raw.complete !== undefined && typeof raw.complete !== "boolean") return null;
  if (raw.complete === true && type !== "DFA") return null;
  return { type, alphabet, maxStates, complete: raw.complete === true };
}

/**
 * A machine (learner's or reference) → { ok: true, m } with m = { states, start, accept:Set, delta: Map("q|s" → Set) } or
 * { ok: false, issue }. `type` is the machine type the TASK asks for; `maxStates` the state limit; `complete` the completeness
 * rule (DFA only). The issue codes are public rule names.
 */
function readMachine(raw, { type, alphabet, maxStates, complete }) {
  const bad = (code, extra) => ({ ok: false, issue: { code, ...(extra || {}) } });
  if (!isPlainObject(raw)) return bad("malformed");
  if (!Array.isArray(raw.states) || raw.states.length === 0) return bad("no-states");
  if (raw.states.length > maxStates) return bad("too-many-states", { max: maxStates });
  const states = [];
  for (const q of raw.states) { if (typeof q !== "string" || !STATE_ID.test(q) || states.includes(q)) return bad("malformed"); states.push(q); }
  if (typeof raw.start !== "string" || !states.includes(raw.start)) return bad("no-start");
  if (!Array.isArray(raw.accept) || raw.accept.length > states.length) return bad("malformed");
  const accept = new Set();
  for (const q of raw.accept) { if (typeof q !== "string" || !states.includes(q) || accept.has(q)) return bad("malformed"); accept.add(q); }
  if (!Array.isArray(raw.transitions) || raw.transitions.length > LIMITS.transitions) return bad("malformed");
  const delta = new Map();
  const seen = new Set();
  for (const t of raw.transitions) {
    if (!Array.isArray(t) || t.length !== 3 || t.some(x => typeof x !== "string")) return bad("malformed");
    const [from, sym, to] = t;
    if (!states.includes(from) || !states.includes(to)) return bad("malformed");
    const eps = EPSILON.has(sym);
    if (eps && type === "DFA") return bad("epsilon-in-dfa");
    if (!eps && !alphabet.includes(sym)) return bad("symbol-outside-alphabet", { symbol: sym.slice(0, 4) });
    const s = eps ? "ε" : sym;
    const k = from + "|" + s;
    const edge = k + "|" + to;
    if (seen.has(edge)) continue;                       // the same arrow twice is the same machine
    seen.add(edge);
    if (type === "DFA" && delta.has(k)) return bad("two-arrows", { state: from, symbol: s });
    if (!delta.has(k)) delta.set(k, new Set());
    delta.get(k).add(to);
  }
  if (complete) {
    for (const q of states) for (const s of alphabet) if (!delta.has(q + "|" + s)) return bad("incomplete", { state: q, symbol: s });
  }
  return { ok: true, m: { states, start: raw.start, accept, delta } };
}

/** The ε-closure of a set of states (an array, sorted) — the identity for a machine without ε arrows. */
function closure(m, set) {
  const out = new Set(set), stack = [...set];
  while (stack.length) {
    const q = stack.pop();
    for (const r of m.delta.get(q + "|ε") || []) if (!out.has(r)) { out.add(r); stack.push(r); }
  }
  return [...out].sort();
}
const step = (m, set, s) => {
  const next = new Set();
  for (const q of set) for (const r of m.delta.get(q + "|" + s) || []) next.add(r);
  return closure(m, next);
};
const accepts = (m, set) => set.some(q => m.accept.has(q));

/**
 * Compare two read machines over `alphabet`. → { equal: true } | { equal: false, word, referenceAccepts } |
 * { overflow: true }. Breadth-first over pairs of determinised state sets, symbols in alphabet order: the first differing pair
 * is reached by a shortest word, and among the shortest by the first in that order.
 */
function compare(learner, reference, alphabet) {
  const startPair = [closure(learner, [learner.start]), closure(reference, [reference.start])];
  const keyOf = ([a, b]) => a.join(",") + "/" + b.join(",");
  const seen = new Set([keyOf(startPair)]);
  let frontier = [{ pair: startPair, word: [] }];
  while (frontier.length) {
    const next = [];
    for (const { pair, word } of frontier) {
      const la = accepts(learner, pair[0]), ra = accepts(reference, pair[1]);
      if (la !== ra) return { equal: false, word: word.join(""), referenceAccepts: ra };
    }
    for (const { pair, word } of frontier) {
      for (const s of alphabet) {
        const p = [step(learner, pair[0], s), step(reference, pair[1], s)];
        const k = keyOf(p);
        if (seen.has(k)) continue;
        if (seen.size >= LIMITS.pairs) return { overflow: true };
        seen.add(k);
        next.push({ pair: p, word: [...word, s] });
      }
    }
    frontier = next;
  }
  return { equal: true };
}

/**
 * key: { kind: "automaton-design", rules, reference } · response: { kind: "automaton-design", machine }.
 * → { status: "judged", correct, issue?, counterexample? } | { status: "unavailable" }. Pure; never throws.
 */
function evaluateAutomatonDesign(key, response) {
  try {
    if (!isPlainObject(key) || key.kind !== KIND) return { status: "unavailable" };
    const rules = readRules(key.rules);
    if (!rules) return { status: "unavailable" };
    // The reference is read with the task's machine type only for its symbols; it may itself be an NFA (an author's NFA for a
    // DFA task is still the same language), so it is read as an NFA, without the learner's state limit or completeness rule.
    const ref = readMachine(key.reference, { type: "NFA", alphabet: rules.alphabet, maxStates: LIMITS.referenceStates, complete: false });
    if (!ref.ok) return { status: "unavailable" };
    const machine = isPlainObject(response) && response.kind === KIND ? response.machine : undefined;
    if (machine === undefined) return { status: "judged", correct: false, issue: { code: "malformed" } };
    const mine = readMachine(machine, rules);
    if (!mine.ok) return { status: "judged", correct: false, issue: mine.issue };
    const c = compare(mine.m, ref.m, rules.alphabet);
    if (c.overflow) return { status: "unavailable" };
    if (c.equal) return { status: "judged", correct: true };
    return { status: "judged", correct: false, counterexample: { word: c.word, shouldAccept: c.referenceAccepts } };
  } catch {
    return { status: "unavailable" };
  }
}

module.exports = { evaluateAutomatonDesign, readRules, readMachine, compare, AUTOMATON_DESIGN_LIMITS: LIMITS };
