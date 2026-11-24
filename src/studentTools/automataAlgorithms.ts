// AUTO-A5 (docs/enterprise-automata-lab-a4.md §7) — «مختبر الآلات»: the course's ALGORITHMS, step by step. Pure: no React, no DOM, no
// network, no timers, no storage.
//
// Each algorithm takes machines the lab has built (finite automata read by the course's strict reader) and returns the machine it
// produces — as a lab draft the learner can open, run and keep working on — together with the rows of its working, in the order the
// book shows them:
//   • «حوّل إلى حتمي» — the book's conversion by SETS of states (اللقاء 3، الشرائح 21–28): a new state per set reached, named by
//     joining its members (q0q1), built from the start; accepting when the set holds an accepting state; an empty set becomes the trap
//     «مصيدة». An ε arrow is followed by its ε-closure (the book's automata have none; then this is the book's algorithm exactly);
//   • «التقاطع» / «الاتحاد» — the book's product automaton (اللقاء 2، الشرائح 69–73): pairs of states (q0p0), only those reached;
//     accepting when both (intersection) or either (union) accept; then, as the book's step 5, «اجمع حالات المصيدة»: every state from
//     which no accepting state is reached becomes ONE trap, and the states are renamed q0, q1, … in reading order;
//   • «المتمّم» — a complete deterministic automaton with its accepting and non-accepting states swapped (the book's construction);
//   • «التصغير» — the owner's addition (not in the book): unreachable states removed, then the states split into groups that no word
//     tells apart (accepting / not, then by where each symbol leads) until nothing changes; one state per group;
//   • «هل آلتاي متكافئتان؟» — the shortest word (first in the alphabet's order) one machine accepts and the other does not, or none.
// The book's own implementations (scripts/automata-course/dsl.mjs) are the A5 suite's oracle, and «صمّم الآلة»'s server judge is the
// oracle of the comparison.

import { readAutomatonConfig, epsilonClosure, LIMITS, type FaMachine, type Machine } from "../learning/activities/automaton";
import { draftFromMachine, missingArrows, nextStateName, type LabDraft } from "./automataLab";

export type AlgoRow = {
  /** The new state's name as the book writes it (q0q1, q0p0, …). */
  name: string;
  /** What it stands for: the set of states (conversion), the pair (product), the group (minimization). */
  members: string[];
  accept: boolean;
  /** Where each symbol leads, by the new states' names. */
  moves: { symbol: string; to: string }[];
  /** A word for the row («مصيدة», «جديدة»). */
  note?: string;
};
export type AlgoResult =
  | { ok: true; machine: Machine; draft: LabDraft; rows: AlgoRow[]; rounds?: string[][][]; removed?: string[]; renamed: boolean; summary: string }
  | { ok: false; message: string };

const TRAP_LABEL = "مصيدة";
/** «حالة واحدة»، «حالتان»، «3 حالات» … «10 حالات»، «11 حالة» — Arabic counting of states. */
export function statesText(n: number, dual: "nom" | "acc" = "nom"): string {
  if (n === 1) return "حالة واحدة";
  if (n === 2) return dual === "nom" ? "حالتان" : "حالتين";
  return n + (n >= 3 && n <= 10 ? " حالات" : " حالة");
}
/** A state name the course's reader accepts (as automaton.ts): short, no spaces. */
const isName = (v: string) => v.length >= 1 && v.length <= 16 && /^[\p{L}\p{N}_'{},]+$/u.test(v);
const fail = (message: string): AlgoResult => ({ ok: false, message });
const isFa = (m: Machine): m is FaMachine => m.kind === "DFA" || m.kind === "NFA";

/**
 * Builds the result: the names as the book writes them when the course's reader accepts them (unique, at most 16 characters);
 * otherwise every state is renamed q0, q1, … and keeps its book name as the word beside it (so the drawing still says «q0q1q2…»).
 */
function finish(spec: { kind: "DFA" | "NFA"; alphabet: string[]; states: string[]; start: string; accept: string[]; transitions: [string, string, string][]; labels?: Record<string, string> },
  rows: AlgoRow[], summary: string, extra: { rounds?: string[][][]; removed?: string[] } = {}): AlgoResult {
  if (spec.states.length > LIMITS.states) return fail("الناتج " + spec.states.length + " حالة، والمختبر يتّسع لـ " + LIMITS.states + " حالة على الأكثر.");
  if (spec.transitions.length > LIMITS.transitions) return fail("الناتج أكثر من " + LIMITS.transitions + " انتقالًا.");
  const ok = new Set(spec.states).size === spec.states.length && spec.states.every(isName);
  const rename = new Map(spec.states.map((s, i) => [s, ok ? s : "q" + i]));
  const r = (s: string) => rename.get(s) as string;
  const labels: Record<string, string> = {};
  for (const s of spec.states) {
    const own = spec.labels?.[s];
    const word = ok ? own : (own ? own + " " : "") + (s.length > 18 ? s.slice(0, 17) + "…" : s);
    if (word) labels[r(s)] = word.length > 24 ? word.slice(0, 23) + "…" : word;
  }
  const read = readAutomatonConfig({ automaton: {
    kind: spec.kind, alphabet: spec.alphabet, states: spec.states.map(r), start: r(spec.start), accept: spec.accept.map(r),
    transitions: spec.transitions.map(([f, s, t]) => [r(f), s, r(t)]), ...(Object.keys(labels).length ? { stateLabels: labels } : {}),
  } });
  if (!read) return fail("تعذّر بناء الناتج.");
  return { ok: true, machine: read.machine, draft: draftFromMachine(read.machine), rows, renamed: !ok, summary, ...extra };
}

/** Where the finite automaton goes from the set `from` by `symbol`, then by ε arrows (a set, in the machine's state order). */
function move(m: FaMachine, from: readonly string[], symbol: string): string[] {
  const reached = m.states.filter(q => m.transitions.some(t => from.includes(t.from) && t.symbol === symbol && t.to === q));
  return epsilonClosure(m, reached).states;
}

// ────────────────────────────────────────────────────────────────────────────
// «حوّل إلى حتمي» — by sets of states (the book's conversion)
// ────────────────────────────────────────────────────────────────────────────

export function toDeterministic(m: Machine): AlgoResult {
  if (!isFa(m)) return fail("التحويل إلى حتمي لأوتومات منتهٍ فقط.");
  const key = (set: readonly string[]) => m.states.filter(s => set.includes(s)).join("");
  const start = epsilonClosure(m, [m.start]).states;
  const order: string[][] = [start];
  const seen = new Set([key(start)]);
  const rows: AlgoRow[] = [];
  const transitions: [string, string, string][] = [];
  const empty: { from: string; symbol: string }[] = [];
  for (let i = 0; i < order.length; i++) {
    if (order.length > LIMITS.states) return fail("الناتج أكثر من " + LIMITS.states + " حالة: المختبر لا يتّسع له.");
    const cur = order[i];
    const row: AlgoRow = { name: key(cur), members: cur, accept: cur.some(q => m.accept.includes(q)), moves: [] };
    for (const s of m.alphabet) {
      const next = move(m, cur, s);
      if (next.length === 0) { empty.push({ from: key(cur), symbol: s }); row.moves.push({ symbol: s, to: "" }); continue; }
      if (!seen.has(key(next))) { seen.add(key(next)); order.push(next); }
      transitions.push([key(cur), s, key(next)]);
      row.moves.push({ symbol: s, to: key(next) });
    }
    rows.push(row);
  }
  const names = order.map(key);
  let trap = "";
  if (empty.length) {
    trap = nextStateName(names, "qT");
    for (const e of empty) transitions.push([e.from, e.symbol, trap]);
    for (const s of m.alphabet) transitions.push([trap, s, trap]);
    for (const row of rows) for (const mv of row.moves) if (mv.to === "") mv.to = trap;
    rows.push({ name: trap, members: [], accept: false, moves: m.alphabet.map(s => ({ symbol: s, to: trap })), note: TRAP_LABEL });
  }
  const states = [...names, ...(trap ? [trap] : [])];
  return finish({ kind: "DFA", alphabet: m.alphabet, states, start: key(start), accept: order.filter(set => set.some(q => m.accept.includes(q))).map(key),
    transitions, ...(trap ? { labels: { [trap]: TRAP_LABEL } } : {}) }, rows,
  "أوتومات حتمي من " + statesText(states.length, "acc") + (trap ? "، منها حالة مصيدة" : "") + ".");
}

// ────────────────────────────────────────────────────────────────────────────
// «التقاطع» / «الاتحاد» — the product automaton, and the book's step 5
// ────────────────────────────────────────────────────────────────────────────

/** Why a machine cannot enter the product, the complement or the minimization (they need a COMPLETE deterministic automaton). */
export function needsCompleteDfa(m: Machine, which = "الآلة"): string | null {
  if (m.kind !== "DFA") return which + " يجب أن تكون أوتومات منتهيًا حتميًا (حوّلها إلى حتمي أولًا).";
  const missing = missingArrows(draftFromMachine(m));
  return missing.length ? which + " يجب أن تكون أوتومات كاملًا: ينقص سهم من " + missing[0].state + " بالرمز " + missing[0].symbol + " (أضف حالة مصيدة)." : null;
}

export function productOf(a: Machine, b: Machine, mode: "intersection" | "union"): AlgoResult {
  const why = needsCompleteDfa(a, "الآلة الأولى") ?? needsCompleteDfa(b, "الآلة الثانية");
  if (why) return fail(why);
  if (a.alphabet.length !== b.alphabet.length || a.alphabet.some(s => !b.alphabet.includes(s))) return fail("للآلتين الأبجدية نفسها شرط للتقاطع والاتحاد.");
  const A = a as FaMachine, B = b as FaMachine;
  const next = (m: FaMachine, q: string, s: string) => (m.transitions.find(t => t.from === q && t.symbol === s) as { to: string }).to;
  const name = (p: [string, string]) => p[0] + p[1];
  const start: [string, string] = [A.start, B.start];
  const order: [string, string][] = [start];
  const seen = new Set([name(start)]);
  const rows: AlgoRow[] = [];
  const transitions: [string, string, string][] = [];
  const acc = (p: [string, string]) => (mode === "intersection" ? A.accept.includes(p[0]) && B.accept.includes(p[1]) : A.accept.includes(p[0]) || B.accept.includes(p[1]));
  for (let i = 0; i < order.length; i++) {
    if (order.length > LIMITS.states) return fail("الناتج أكثر من " + LIMITS.states + " حالة: المختبر لا يتّسع له.");
    const cur = order[i];
    const row: AlgoRow = { name: name(cur), members: [...cur], accept: acc(cur), moves: [] };
    for (const s of A.alphabet) {
      const nx: [string, string] = [next(A, cur[0], s), next(B, cur[1], s)];
      if (!seen.has(name(nx))) { seen.add(name(nx)); order.push(nx); }
      transitions.push([name(cur), s, name(nx)]);
      row.moves.push({ symbol: s, to: name(nx) });
    }
    rows.push(row);
  }
  return finish({ kind: "DFA", alphabet: A.alphabet, states: order.map(name), start: name(start), accept: order.filter(acc).map(name), transitions }, rows,
    "أوتومات " + (mode === "intersection" ? "التقاطع" : "الاتحاد") + " من " + statesText(order.length, "acc") + " (الأزواج التي نصلها فقط).");
}

/**
 * The book's step 5 («اجمع حالات المصيدة»): every state from which no accepting state can be reached becomes ONE trap «مصيدة»; then
 * the states are renamed q0, q1, … in reading order. For a deterministic automaton.
 */
export function mergeTraps(m: Machine): AlgoResult {
  if (m.kind !== "DFA") return fail("جمع حالات المصيدة لأوتومات منتهٍ حتمي.");
  const canAccept = new Set(m.accept);
  for (let changed = true; changed;) {
    changed = false;
    for (const t of m.transitions) if (canAccept.has(t.to) && !canAccept.has(t.from)) { canAccept.add(t.from); changed = true; }
  }
  const TRAP = "\u0000trap";
  const map = (s: string) => (canAccept.has(s) ? s : TRAP);
  const dead = m.states.filter(s => !canAccept.has(s));
  const kept = [...m.states.filter(s => canAccept.has(s)), ...(dead.length ? [TRAP] : [])];
  const rename = new Map(kept.map((s, i) => [s, "q" + i]));
  const seen = new Set<string>();
  const transitions: [string, string, string][] = [];
  for (const t of m.transitions) {
    const k = map(t.from) + " " + t.symbol;
    if (seen.has(k)) continue;
    seen.add(k);
    transitions.push([rename.get(map(t.from)) as string, t.symbol, rename.get(map(t.to)) as string]);
  }
  const rows: AlgoRow[] = kept.map(s => ({
    name: rename.get(s) as string, members: s === TRAP ? dead : [s], accept: s !== TRAP && m.accept.includes(s),
    moves: transitions.filter(t => t[0] === rename.get(s)).map(t => ({ symbol: t[1], to: t[2] })), ...(s === TRAP ? { note: TRAP_LABEL } : {}),
  }));
  const trapName = dead.length ? (rename.get(TRAP) as string) : "";
  return finish({ kind: "DFA", alphabet: m.alphabet, states: kept.map(s => rename.get(s) as string), start: rename.get(map(m.start)) as string,
    accept: m.accept.map(s => rename.get(s) as string), transitions, ...(trapName ? { labels: { [trapName]: TRAP_LABEL } } : {}) }, rows,
  dead.length > 1 ? statesText(dead.length) + " لا توصل إلى قبول صارت حالة مصيدة واحدة." : dead.length === 1 ? "حالة واحدة لا توصل إلى قبول: صارت حالة المصيدة." : "كل حالة توصل إلى قبول: لا مصيدة.");
}

// ────────────────────────────────────────────────────────────────────────────
// «المتمّم» and «التصغير»
// ────────────────────────────────────────────────────────────────────────────

export function complementOf(m: Machine): AlgoResult {
  const why = needsCompleteDfa(m);
  if (why) return fail(why);
  const accept = m.states.filter(s => !m.accept.includes(s));
  const rows: AlgoRow[] = m.states.map(s => ({ name: s, members: [s], accept: accept.includes(s), moves: [], note: m.accept.includes(s) ? "كانت حالة قبول" : "صارت حالة قبول" }));
  const fa = m as FaMachine;
  return finish({ kind: "DFA", alphabet: m.alphabet, states: m.states, start: m.start, accept, transitions: fa.transitions.map(t => [t.from, t.symbol, t.to] as [string, string, string]),
    labels: m.stateLabels }, rows, "حالات القبول وغير القبول تبادلت: الآلة تقبل كل كلمة كانت ترفضها.");
}

export function minimize(m: Machine): AlgoResult {
  const why = needsCompleteDfa(m);
  if (why) return fail(why);
  const fa = m as FaMachine;
  const next = (q: string, s: string) => (fa.transitions.find(t => t.from === q && t.symbol === s) as { to: string }).to;
  // 1. the states no word reaches go
  const reached = new Set([fa.start]);
  const todo = [fa.start];
  while (todo.length) { const q = todo.pop() as string; for (const s of fa.alphabet) { const t = next(q, s); if (!reached.has(t)) { reached.add(t); todo.push(t); } } }
  const states = fa.states.filter(s => reached.has(s));
  const removed = fa.states.filter(s => !reached.has(s));
  // 2. split: accepting / not, then by the group each symbol leads to, until nothing changes
  let groups = [states.filter(s => fa.accept.includes(s)), states.filter(s => !fa.accept.includes(s))].filter(g => g.length);
  const rounds: string[][][] = [groups];
  for (;;) {
    const groupOf = (q: string) => groups.findIndex(g => g.includes(q));
    const split: string[][] = [];
    for (const g of groups) {
      const by = new Map<string, string[]>();
      for (const q of g) { const sig = fa.alphabet.map(s => groupOf(next(q, s))).join(","); (by.get(sig) ?? by.set(sig, []).get(sig)!).push(q); }
      split.push(...by.values());
    }
    split.sort((x, y) => states.indexOf(x[0]) - states.indexOf(y[0]));
    if (split.length === groups.length) break;
    groups = split;
    rounds.push(groups);
  }
  groups = [...groups].sort((x, y) => states.indexOf(x[0]) - states.indexOf(y[0]));
  const nameOf = (g: string[]) => g.join("");
  const groupName = (q: string) => nameOf(groups.find(g => g.includes(q)) as string[]);
  const rows: AlgoRow[] = groups.map(g => ({ name: nameOf(g), members: g, accept: fa.accept.includes(g[0]),
    moves: fa.alphabet.map(s => ({ symbol: s, to: groupName(next(g[0], s)) })), ...(g.length > 1 ? { note: "دُمجت" } : {}) }));
  const transitions = rows.flatMap(r => r.moves.map(mv => [r.name, mv.symbol, mv.to] as [string, string, string]));
  const labels: Record<string, string> = {};
  for (const g of groups) if (g.length === 1 && fa.stateLabels[g[0]]) labels[g[0]] = fa.stateLabels[g[0]];
  return finish({ kind: "DFA", alphabet: fa.alphabet, states: groups.map(nameOf), start: groupName(fa.start), accept: rows.filter(r => r.accept).map(r => r.name), transitions, labels },
    rows, groups.length === fa.states.length ? "الأوتومات صغير أصلًا: لا حالتين متكافئتين ولا حالة لا نصلها." : "من " + statesText(fa.states.length, "acc") + " إلى " + statesText(groups.length, "acc") + ".",
    { rounds, removed });
}

// ────────────────────────────────────────────────────────────────────────────
// «هل آلتاي متكافئتان؟»
// ────────────────────────────────────────────────────────────────────────────

export type Equivalence = { equal: true } | { equal: false; word: string; firstAccepts: boolean } | { overflow: true } | { error: string };
export const EQUIVALENCE_PAIRS = 20000;

/**
 * Breadth-first over pairs of state SETS (each machine run as a non-deterministic one, with its ε-closures), symbols in the first
 * machine's alphabet order then the second's: the first pair where one accepts and the other does not is reached by a shortest word,
 * and among the shortest the first in that order — the same answer «صمّم الآلة»'s judge gives (pinned by the A5 suite).
 */
export function equivalence(a: Machine, b: Machine): Equivalence {
  if (!isFa(a) || !isFa(b)) return { error: "المقارنة لأوتومات منتهية (حتمية أو غير حتمية)." };
  const alphabet = [...a.alphabet, ...b.alphabet.filter(s => !a.alphabet.includes(s))];
  const startPair = [epsilonClosure(a, [a.start]).states, epsilonClosure(b, [b.start]).states];
  const keyOf = (p: string[][]) => p[0].join(",") + "/" + p[1].join(",");
  const seen = new Set([keyOf(startPair)]);
  let frontier = [{ pair: startPair, word: [] as string[] }];
  while (frontier.length) {
    for (const { pair, word } of frontier) {
      const la = pair[0].some(q => a.accept.includes(q)), lb = pair[1].some(q => b.accept.includes(q));
      if (la !== lb) return { equal: false, word: word.join(""), firstAccepts: la };
    }
    const next: typeof frontier = [];
    for (const { pair, word } of frontier) for (const s of alphabet) {
      const p = [a.alphabet.includes(s) ? move(a, pair[0], s) : [], b.alphabet.includes(s) ? move(b, pair[1], s) : []];
      const k = keyOf(p);
      if (seen.has(k)) continue;
      if (seen.size >= EQUIVALENCE_PAIRS) return { overflow: true };
      seen.add(k);
      next.push({ pair: p, word: [...word, s] });
    }
    frontier = next;
  }
  return { equal: true };
}
