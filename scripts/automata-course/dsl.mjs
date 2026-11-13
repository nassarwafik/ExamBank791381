// AUTO-A2 — the AUTHORING helpers of the course «الوحدة الخامسة: الأتمتة» (docs/enterprise-automata-course-a2.md).
//
// A unit is written once, compactly, in scripts/automata-course/uNN.mjs with these helpers; scripts/build-automata-course.mjs turns
// it into the site's content files (manifest + one module per unit). Nothing here runs in the browser.
//
// Inline text: `…` = a left-to-right run (symbols, words, formal notation: q0, Σ = {a,b}, aab) · **…** = bold · __…__ = a term.
// Provenance: blocks translated from the source slides are origin "book" (the course's source is the slides of the teacher-training
// course «מודלים חישוביים», translated to Arabic); every block the author ADDS (exercises, «نحلّ معًا», the simulator, illustrations,
// clarifications) is origin "teacher-enrichment". Every simulator machine may carry `lang` (a JS predicate of the language it is
// meant to accept) and every machine exercise a `prove`: automata-course.proof.test.ts runs them all on the real engine.

/** Inline mini-markup → safe spans. */
export function spans(md) {
  const out = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__)/g;
  let at = 0, m;
  while ((m = re.exec(md))) {
    if (m.index > at) out.push({ text: md.slice(at, m.index) });
    const tok = m[0];
    if (tok.startsWith("`")) out.push({ text: tok.slice(1, -1), dir: "ltr" });
    else if (tok.startsWith("**")) out.push({ text: tok.slice(2, -2), style: "strong" });
    else out.push({ text: tok.slice(2, -2), style: "term" });
    at = m.index + tok.length;
  }
  if (at < md.length) out.push({ text: md.slice(at) });
  return out;
}
/** Plain text of a markup string (for prompts / options, which are plain strings in the content model). */
export const plain = md => md.replace(/`([^`]+)`/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");

const book = b => ({ ...b, origin: "book" });
const enr = b => ({ ...b, origin: "teacher-enrichment" });

// ── book blocks (translated from the slides) ─────────────────────────────────────────────────────────────────────────
export const P = md => book({ type: "text", spans: spans(md) });
export const H = (text, level = 3) => book({ type: "heading", level, text });
const callout = kind => (title, md) => (md === undefined ? book({ type: "callout", kind, spans: spans(title) }) : book({ type: "callout", kind, title, spans: spans(md) }));
export const DEF = callout("important");
export const NOTE = callout("warning");
export const REM = callout("remember");
export const TIP = callout("tip");
export const SUM = callout("summary");
export const LIST = (items, opts = {}) => book({
  type: "list", variant: opts.variant ?? "plain", ...(opts.title ? { title: opts.title } : {}),
  items: items.map((it, i) => (Array.isArray(it) ? { id: "i" + (i + 1), term: it[0], text: spans(it[1]) } : { id: "i" + (i + 1), text: spans(it) })),
});
export const OL = (items, opts = {}) => LIST(items, { ...opts, variant: "ordered" });
export const TABLE = (headers, rows, opts = {}) => book({
  type: "table", ...(opts.caption ? { caption: opts.caption } : {}), headers, rows,
  ...(opts.ltr ? { columnDirs: headers.map((_, i) => (opts.ltr.includes(i) ? "ltr" : "rtl")) } : {}),
});
export const CODE = code => book({ type: "code", language: "text", dir: "ltr", code });
/** A solved example / task of the slides (steps = the slides' build-up). `mode: "practice"` for a task shown without a solution. */
export const EX = ({ title, prompt, steps = [], result, explanation, mode = "solved" }) => book({
  type: "example", mode, ...(title ? { title } : {}), ...(prompt ? { prompt: plain(prompt) } : {}),
  steps: steps.map(s => (typeof s === "string" ? { text: plain(s) } : { text: plain(s.text), ...(s.note ? { note: plain(s.note) } : {}) })),
  ...(result ? { result: plain(result) } : {}), ...(explanation ? { explanation: plain(explanation) } : {}),
});

// ── enrichment blocks ─────────────────────────────────────────────────────────────────────────────────────────────────
export const CLAR = (title, md) => enr({ type: "callout", kind: "clarification", ...(md === undefined ? { spans: spans(title) } : { title, spans: spans(md) }) });
export const VIS = (visualId, alt, opts = {}) => enr({ type: "visual", visualId, alt, ...(opts.title ? { title: opts.title } : {}), ...(opts.caption ? { caption: opts.caption } : {}), ...(opts.motion ? { motion: true } : {}) });

/**
 * The simulator «تتبّع الآلة خطوة بخطوة» on a machine (automaton.ts shape). `lang` (not emitted) is the language the machine must
 * accept; the proof test compares the machine with it on every word up to a length. `sameAs` (not emitted) says the machine is a
 * slide's diagram (the page names the slide); it stays enrichment — the interactive layer over the slide's drawing.
 */
export const SIM = (automaton, opts = {}) => enr({
  type: "simulation", simulationType: "automaton-trace", version: 1, title: opts.title ?? "تتبّع الآلة خطوة بخطوة",
  ...(opts.description ? { description: opts.description } : {}),
  capabilities: { fullscreen: true, reset: true, interactive: true },
  config: { automaton, ...(opts.words ? { words: opts.words } : {}), ...(opts.word !== undefined ? { word: opts.word } : {}), ...(opts.layout ? { layout: opts.layout } : {}) },
  fallback: { text: opts.fallback ?? "رسم الآلة التفاعلي: " + automaton.kind + " بحالات " + automaton.states.join("، ") + "." },
  ...(opts.lang ? { _lang: opts.lang, _langMax: opts.langMax ?? 7 } : {}),
});

/** «حل مع المعلم»: prompt → think first → steps revealed one by one → result. */
export const GUIDED = ({ title, prompt, steps, result, explanation }) => enr({
  type: "guided", guidedType: "reveal", version: 1, title,
  ...(prompt ? { prompt: spans(prompt) } : {}),
  steps: steps.map((s, i) => ({ id: "s" + (i + 1), text: spans(s) })),
  ...(result ? { result: spans(result) } : {}), ...(explanation ? { explanation: plain(explanation) } : {}),
});

// ── self-check exercises (enrichment; the server holds the keys once served) ─────────────────────────────────────────
const fb = (explanation, hints) => ({ explanation: plain(explanation), ...(hints?.length ? { hints: hints.map(plain) } : {}) });
const practice = (question, extra = {}) => enr({ type: "practice", reveal: true, question, ...(extra.prove ? { _prove: extra.prove } : {}) });
/** Multiple choice: the correct option starts with "*". */
export const MC = (prompt, options, explanation, extra = {}) => practice({
  kind: "multipleChoice", prompt: plain(prompt),
  options: options.map((o, i) => (o.startsWith("*") ? { id: "o" + (i + 1), text: plain(o.slice(1)), correct: true } : { id: "o" + (i + 1), text: plain(o) })),
  feedback: fb(explanation, extra.hints),
}, extra);
export const TF = (prompt, answer, explanation, extra = {}) => practice({ kind: "trueFalse", prompt: plain(prompt), answer, feedback: fb(explanation, extra.hints) }, extra);
export const SHORT = (prompt, answer, explanation, extra = {}) => enr({ type: "practice", question: { kind: "shortInput", prompt: plain(prompt), answer, feedback: fb(explanation, extra.hints) }, ...(extra.prove ? { _prove: extra.prove } : {}) });
/** Classify: groups = labels; items = [text, groupIndex]. */
export const CLASSIFY = (prompt, groups, items, explanation, extra = {}) => practice({
  kind: "classify", prompt: plain(prompt),
  groups: groups.map((g, i) => ({ id: "g" + (i + 1), text: g })),
  items: items.map(([t], i) => ({ id: "c" + (i + 1), text: t === "" ? "ε" : t })),
  assign: Object.fromEntries(items.map(([, g], i) => ["c" + (i + 1), "g" + (g + 1)])),
  feedback: fb(explanation, extra.hints),
}, { ...extra, prove: extra.prove === "words" ? { type: "classify", words: items.map(([t, g]) => [t, g]) } : extra.prove });
/** Matching: pairs in the right order (the generator shows the right side in a fixed scrambled order). */
export const MATCH = (prompt, pairs, explanation, extra = {}) => {
  const left = pairs.map(([l], i) => ({ id: "l" + (i + 1), text: plain(l) }));
  const right = pairs.map(([, r], i) => ({ id: "r" + (i + 1), text: plain(r) }));
  const order = right.map((_, i) => i).sort((a, b) => ((a * 7 + 3) % right.length) - ((b * 7 + 3) % right.length));
  return practice({ kind: "matching", prompt: plain(prompt), left, right: order.map(i => right[i]), pairs: Object.fromEntries(left.map((l, i) => [l.id, "r" + (i + 1)])), feedback: fb(explanation, extra.hints) }, extra);
};
/** Ordering: items in the RIGHT order; shown in a fixed scrambled order. */
export const ORDER = (prompt, inOrder, explanation, extra = {}) => {
  const items = inOrder.map((t, i) => ({ id: "s" + (i + 1), text: plain(t) }));
  const n = items.length;
  const shown = items.map((_, i) => i).sort((a, b) => ((a * 5 + 2) % n) - ((b * 5 + 2) % n));
  if (shown.every((v, i) => v === i)) shown.reverse();
  return practice({ kind: "ordering", prompt: plain(prompt), items: shown.map(i => items[i]), order: items.map(i => i.id), feedback: fb(explanation, extra.hints) }, extra);
};
/** Word bank: text with [[answer]] blanks; distractors added to the bank. */
export const WORDS = (prompt, text, distractors, explanation, extra = {}) => {
  const segments = [], answers = {};
  let at = 0, k = 0, m;
  const re = /\[\[([^\]]+)\]\]/g;
  while ((m = re.exec(text))) {
    if (m.index > at) segments.push(text.slice(at, m.index));
    const id = "w" + ++k;
    segments.push({ blank: id });
    answers[id] = m[1];
    at = m.index + m[0].length;
  }
  if (at < text.length) segments.push(text.slice(at));
  const bank = [...new Set([...Object.values(answers), ...distractors])].sort((a, b) => a.localeCompare(b, "ar"));
  return practice({ kind: "wordBank", prompt: plain(prompt), segments, bank, answers, feedback: fb(explanation, extra.hints) }, extra);
};
/** Worksheet table: a cell {sel: [options], key} is answered by the learner. */
export const PTABLE = (headers, rows, opts = {}) => enr({
  type: "practice-table", ...(opts.caption ? { caption: opts.caption } : {}), headers,
  rows: rows.map(r => r.map(c => (typeof c === "string" ? c : { kind: "select", options: c.sel, key: c.key }))),
  ...(opts.ltr ? { columnDirs: headers.map((_, i) => (opts.ltr.includes(i) ? "ltr" : "rtl")) } : {}),
});
export const TRUE_FALSE = ["صحيحة", "غير صحيحة"];

/** A finite automaton in the course's usual shape: transitions as "q0 a q1" strings or [from, symbols, to] with symbols "a,b". */
export function dfa(spec) { return fa("DFA", spec); }
export function nfa(spec) { return fa("NFA", spec); }
function fa(kind, { states, alphabet, start = "q0", accept, t, labels }) {
  const transitions = [];
  for (const row of t) {
    const [from, syms, to] = typeof row === "string" ? row.trim().split(/\s+/) : row;
    for (const s of syms.split(",")) transitions.push([from, s, to]);
  }
  return { kind, states, alphabet, start, accept, transitions, ...(labels ? { stateLabels: labels } : {}) };
}
/** A push-down automaton in the course's arrow notation: "q0 → q1 : ادفع a,⏊/S" lines (ادفع / اسحب / بلا تغيير). */
export function pda({ states, alphabet, start = "q0", accept, t, stack, labels }) {
  const OPS = { "ادفع": "push", "اسحب": "pop", "بلا": "none" };
  const transitions = t.map(line => {
    const m = /^(\S+)\s*→\s*(\S+)\s*:\s*(ادفع|اسحب|بلا تغيير)\s+(\S),(\S)\/(\S*)$/.exec(line.trim());
    if (!m) throw new Error("bad PDA arrow: " + line);
    return { from: m[1], read: m[4], top: m[5], op: OPS[m[3].split(" ")[0]], write: m[6], to: m[2] };
  });
  return { kind: "PDA", states, alphabet, start, accept, transitions, ...(stack ? { stackAlphabet: stack } : {}), ...(labels ? { stateLabels: labels } : {}) };
}
/** A Turing machine in the course's notation: "q0 → q1 : a/A,R" lines; blank ∆; the left boundary ├. */
export function tm({ states, alphabet, start = "q0", accept, t, tape, leftEnd = "├", labels }) {
  const transitions = t.map(line => {
    const m = /^(\S+)\s*→\s*(\S+)\s*:\s*(\S)\/(\S),([LRS])$/.exec(line.trim());
    if (!m) throw new Error("bad TM arrow: " + line);
    return { from: m[1], read: m[3], write: m[4], move: m[5], to: m[2] };
  });
  return { kind: "TM", states, alphabet, start, accept, transitions, blank: "∆", ...(leftEnd ? { leftEnd } : {}), ...(tape ? { tapeAlphabet: tape } : {}), ...(labels ? { stateLabels: labels } : {}) };
}

/**
 * The course's algorithm for the intersection / union automaton (اللقاء 2، الشرائح 69–73): states are tuples of the given DFAs'
 * states (written q0p0t0), the start is the tuple of starts, a symbol moves every component; accepting = all components accept
 * (intersection) or at least one (union). Only states reachable from the start are kept (step 4).
 */
export function product(machines, mode = "intersection") {
  const alphabet = machines[0].alphabet;
  const delta = machines.map(m => Object.fromEntries(m.transitions.map(([f, s, t]) => [f + " " + s, t])));
  const name = tuple => tuple.join("");
  const start = machines.map(m => m.start);
  const seen = new Map([[name(start), start]]), order = [start], transitions = [];
  for (let i = 0; i < order.length; i++) {
    const cur = order[i];
    for (const s of alphabet) {
      const next = cur.map((q, k) => delta[k][q + " " + s]);
      if (!seen.has(name(next))) { seen.set(name(next), next); order.push(next); }
      transitions.push([name(cur), s, name(next)]);
    }
  }
  const acc = tuple => (mode === "intersection" ? tuple.every((q, k) => machines[k].accept.includes(q)) : tuple.some((q, k) => machines[k].accept.includes(q)));
  return { kind: "DFA", states: order.map(name), alphabet, start: name(start), accept: order.filter(acc).map(name), transitions };
}
/** Step 5 and the slides' remark: every state from which no accepting state can be reached becomes ONE trap; then states are renamed q0, q1 … in reading order. */
export function tidy(m, trapLabel = "مصيدة") {
  const canAccept = new Set(m.accept);
  for (let changed = true; changed;) {
    changed = false;
    for (const [f, , t] of m.transitions) if (canAccept.has(t) && !canAccept.has(f)) { canAccept.add(f); changed = true; }
  }
  const TRAP = "__trap";
  const map = s => (canAccept.has(s) ? s : TRAP);
  const kept = [...m.states.filter(s => canAccept.has(s)), ...(m.states.some(s => !canAccept.has(s)) ? [TRAP] : [])];
  const rename = Object.fromEntries(kept.map((s, i) => [s, "q" + i]));
  const seen = new Set(), transitions = [];
  for (const [f, s, t] of m.transitions) {
    const k = map(f) + " " + s;
    if (seen.has(k)) continue;
    seen.add(k);
    transitions.push([rename[map(f)], s, rename[map(t)]]);
  }
  return { kind: "DFA", states: kept.map(s => rename[s]), alphabet: m.alphabet, start: rename[map(m.start)], accept: m.accept.map(s => rename[s]), transitions, ...(kept.includes(TRAP) ? { stateLabels: { [rename[TRAP]]: trapLabel } } : {}) };
}

/**
 * The course's conversion of a non-deterministic automaton to a deterministic one (اللقاء 3، الشرائح 21–28): a new state per SET
 * of states reached (named by joining them: q0q1), built from the start; accepting = the set holds an accepting state; a missing
 * set (no move) becomes a trap state when `complete` (step 6). No ε-arrows (as in the course).
 */
export function subsets(m, { complete = true, trapName = "qT" } = {}) {
  const key = set => m.states.filter(s => set.includes(s)).join("");
  const start = [m.start];
  const seen = new Map([[key(start), start]]), order = [start], transitions = [];
  let needTrap = false;
  for (let i = 0; i < order.length; i++) {
    const cur = order[i];
    for (const s of m.alphabet) {
      const next = m.states.filter(q => m.transitions.some(([f, x, t]) => cur.includes(f) && x === s && t === q));
      if (!next.length) { if (complete) { needTrap = true; transitions.push([key(cur), s, trapName]); } continue; }
      if (!seen.has(key(next))) { seen.set(key(next), next); order.push(next); }
      transitions.push([key(cur), s, key(next)]);
    }
  }
  if (needTrap) for (const s of m.alphabet) transitions.push([trapName, s, trapName]);
  const states = [...order.map(key), ...(needTrap ? [trapName] : [])];
  return { kind: "DFA", states, alphabet: m.alphabet, start: key(start), accept: order.filter(set => set.some(q => m.accept.includes(q))).map(key), transitions, ...(needTrap ? { stateLabels: { [trapName]: "مصيدة" } } : {}) };
}
