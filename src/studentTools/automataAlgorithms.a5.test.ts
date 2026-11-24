// AUTO-A5 (docs/enterprise-automata-lab-a4.md §7) — the lab's algorithms (automataAlgorithms.ts) against their oracles:
//   • the BOOK: its own implementations (scripts/automata-course/dsl.mjs — the code that built the book's machines) on the book's
//     machines: «حوّل إلى حتمي» = subsets (every NFA of unit 5), the product of unit 4 (A1 × A2 × A3 = RAW, 14 states) and its
//     step 5 (= FINAL, 9 states), the union of unit 4, «المتمّم» = complement (every complete DFA of the book);
//   • «صمّم الآلة»'s server judge (api/src/lib/learning-automaton-design.js `compare`): the same shortest word, for every pair of the
//     book's finite automata over the same alphabet;
//   • «التصغير» (the owner's addition): the same language, and no two states of the result that a word tells apart is missing;
//   • the refusals: an incomplete or non-deterministic machine, different alphabets, a result too large for the lab.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readAutomatonConfig, type Machine, type FaMachine } from "../learning/activities/automaton";
import { complementOf, equivalence, mergeTraps, minimize, productOf, toDeterministic, needsCompleteDfa, statesText } from "./automataAlgorithms";
import { checkDraft, languageUpTo, initialDraft } from "./automataLab";
// @ts-expect-error — the book's authoring helpers (plain ES modules of the build, no types)
import { subsets, product, tidy, complement, dfa } from "../../scripts/automata-course/dsl.mjs";
// @ts-expect-error — idem
import * as U04 from "../../scripts/automata-course/u04.mjs";
// @ts-expect-error — idem
import * as U05 from "../../scripts/automata-course/u05.mjs";

const require_ = createRequire(import.meta.url);
const { compare, readMachine } = require_("../../api/src/lib/learning-automaton-design.js");
const MODULES = import.meta.glob("../learning/content/899271/modules/*.ts", { eager: true }) as Record<string, { default: unknown }>;

const read = (automaton: unknown): Machine => {
  const c = readAutomatonConfig({ automaton });
  if (!c) throw new Error("not a machine: " + JSON.stringify(automaton).slice(0, 120));
  return c.machine;
};
const shape = (m: Machine) => ({
  kind: m.kind, states: m.states, alphabet: m.alphabet, start: m.start, accept: [...m.accept].sort(), labels: m.stateLabels,
  transitions: (m as FaMachine).transitions.map(t => t.from + " " + t.symbol + " " + t.to).sort(),
});
const ok = (r: ReturnType<typeof toDeterministic>) => { if (!r.ok) throw new Error(r.message); return r; };
function bookMachines(): Machine[] {
  const out: Machine[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (o.simulationType === "automaton-trace" && o.config) { const c = readAutomatonConfig(o.config); if (c) out.push(c.machine); }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v);
  };
  for (const mod of Object.values(MODULES)) walk(mod.default);
  return out;
}

describe("A5 — «حوّل إلى حتمي»: the book's conversion by sets", () => {
  const nfas = Object.entries(U05).filter(([, v]) => v && typeof v === "object" && (v as { kind?: string }).kind === "NFA") as [string, unknown][];
  it("the book's unit 5 has its automata", () => expect(nfas.length).toBeGreaterThanOrEqual(8));
  it("every NFA of unit 5: the lab's result IS the book's (subsets): the same states, names, start, accepting states and arrows", () => {
    for (const [name, nfa] of nfas) {
      const book = subsets(nfa);
      const lab = toDeterministic(read(nfa));
      if (book.states.length > 24) { expect(lab.ok, name).toBe(false); continue; }
      const r = ok(lab);
      if (!r.renamed) expect(shape(r.machine), name).toEqual(shape(read(book)));
      else { expect(r.machine.states.length, name).toBe(book.states.length); expect(equivalence(r.machine, read(book)), name).toEqual({ equal: true }); }
    }
  });
  it("the rows of the working: one per new state, each move named as the book names it; the trap last, «مصيدة»", () => {
    const r = ok(toDeterministic(read(U05.STARTS_A_ENDS_B)));
    expect(r.rows.map(x => [x.name, x.members, x.accept, x.moves.map(m => m.symbol + "→" + m.to).join(" "), x.note ?? ""])).toEqual([
      ["q0", ["q0"], false, "a→q1 b→qT", ""],
      ["q1", ["q1"], false, "a→q1 b→q1q2", ""],
      ["q1q2", ["q1", "q2"], true, "a→q1 b→q1q2", ""],
      ["qT", [], false, "a→qT b→qT", "مصيدة"],
    ]);
    expect(r.machine.stateLabels).toEqual({ qT: "مصيدة" });
  });
  it("an ε arrow is followed by its ε-closure (the book's automata have none): the same language", () => {
    const eps = read({ kind: "NFA", states: ["q0", "q1", "q2"], alphabet: ["a", "b"], start: "q0", accept: ["q2"], transitions: [["q0", "a", "q1"], ["q1", "ε", "q2"], ["q2", "b", "q0"]] });
    const r = ok(toDeterministic(eps));
    expect(r.machine.kind).toBe("DFA");
    expect(equivalence(r.machine, eps)).toEqual({ equal: true });
    expect(r.rows[1].members).toEqual(["q1", "q2"]);   // a from q0 reaches q1, and by ε q2
  });
});

describe("A5 — «التقاطع» / «الاتحاد» and the book's step 5", () => {
  it("unit 4: (A1 × A2) × A3 IS the book's product RAW (14 states, its names and order), and «اجمع حالات المصيدة» IS FINAL (9)", () => {
    const step1 = ok(productOf(read(U04.A1), read(U04.A2), "intersection"));
    const raw = ok(productOf(step1.machine, read(U04.A3), "intersection"));
    expect(shape(raw.machine)).toEqual(shape(read(U04.RAW)));
    expect(raw.machine.states).toHaveLength(14);
    const final = ok(mergeTraps(raw.machine));
    expect(shape(final.machine)).toEqual(shape(read(U04.FINAL)));
    expect(final.machine.states).toHaveLength(9);
  });
  it("the union of unit 4 is the book's (product … «union»)", () => {
    const X = dfa({ states: ["q0", "q1", "q2"], alphabet: ["a", "b"], accept: ["q1"], t: ["q0 a q1", "q0 b q2", "q1 a,b q1", "q2 a,b q2"] });
    expect(shape(ok(productOf(read(X), read(U04.A2), "union")).machine)).toEqual(shape(read(product([X, U04.A2], "union"))));
  });
  it("tidy = mergeTraps on every complete DFA of the book", () => {
    const dfas = bookMachines().filter(m => m.kind === "DFA" && !needsCompleteDfa(m));
    expect(dfas.length).toBeGreaterThan(10);
    for (const m of dfas) {
      const t = m as FaMachine;
      const book = tidy({ kind: "DFA", states: t.states, alphabet: t.alphabet, start: t.start, accept: t.accept, transitions: t.transitions.map(x => [x.from, x.symbol, x.to]) });
      expect(shape(ok(mergeTraps(m)).machine)).toEqual(shape(read(book)));
    }
  });
  it("refused: an incomplete or non-deterministic machine, or different alphabets — said why", () => {
    const partial = read(U04.NO_AA_PARTIAL);
    expect(productOf(partial, read(U04.A2), "intersection")).toEqual({ ok: false, message: "الآلة الأولى يجب أن تكون أوتومات كاملًا: ينقص سهم من q1 بالرمز a (أضف حالة مصيدة)." });
    expect(productOf(read(U05.ENDS_B), read(U04.A2), "union").ok).toBe(false);
    const abc = read({ kind: "DFA", states: ["q0"], alphabet: ["a", "b", "c"], start: "q0", accept: [], transitions: [["q0", "a", "q0"], ["q0", "b", "q0"], ["q0", "c", "q0"]] });
    expect(productOf(read(U04.A2), abc, "union")).toEqual({ ok: false, message: "للآلتين الأبجدية نفسها شرط للتقاطع والاتحاد." });
  });
});

describe("A5 — «المتمّم» and «التصغير»", () => {
  it("the complement is the book's (complement) on every complete DFA of the book, and accepts exactly the other words", () => {
    for (const m of bookMachines().filter(x => x.kind === "DFA" && !needsCompleteDfa(x))) {
      const t = m as FaMachine;
      const book = complement({ kind: "DFA", states: t.states, alphabet: t.alphabet, start: t.start, accept: t.accept, transitions: t.transitions.map(x => [x.from, x.symbol, x.to]) });
      const c = ok(complementOf(m));
      expect(shape(c.machine)).toEqual(shape(read({ ...book, stateLabels: m.stateLabels })));
      const all = languageUpTo(m, 4), comp = languageUpTo(c.machine, 4);
      expect(all.acceptedCount + comp.acceptedCount).toBe(all.tried);
    }
    expect(complementOf(read(U04.NO_AA_PARTIAL)).ok).toBe(false);   // incomplete: refused, not guessed
  });
  it("minimization: two equivalent states merged, an unreachable state removed; the rounds of the split shown", () => {
    // even number of a — written with 4 states: q0≡q2 (even), q1≡q3 (odd), and q4 unreachable
    const big = read({ kind: "DFA", states: ["q0", "q1", "q2", "q3", "q4"], alphabet: ["a", "b"], start: "q0", accept: ["q0", "q2"],
      transitions: [["q0", "a", "q1"], ["q0", "b", "q2"], ["q1", "a", "q2"], ["q1", "b", "q3"], ["q2", "a", "q3"], ["q2", "b", "q0"], ["q3", "a", "q0"], ["q3", "b", "q1"], ["q4", "a", "q4"], ["q4", "b", "q0"]] });
    const r = ok(minimize(big));
    expect([r.removed, r.rounds, r.machine.states, r.machine.start, r.machine.accept]).toEqual([["q4"], [[["q0", "q2"], ["q1", "q3"]]], ["q0q2", "q1q3"], "q0q2", ["q0q2"]]);
    expect(equivalence(r.machine, big)).toEqual({ equal: true });
    expect(r.summary).toBe("من 5 حالات إلى حالتين.");
  });
  it("minimization on every complete DFA of the book: the same language, and no two states left that no word tells apart", () => {
    for (const m of bookMachines().filter(x => x.kind === "DFA" && !needsCompleteDfa(x))) {
      const r = ok(minimize(m));
      expect(equivalence(r.machine, m)).toEqual({ equal: true });
      const fa = r.machine as FaMachine;
      for (const p of fa.states) for (const q of fa.states) if (p < q) {
        const from = (s: string) => ({ ...fa, start: s }) as Machine;
        expect(equivalence(from(p), from(q)), p + " ≢ " + q).not.toEqual({ equal: true });
      }
    }
  });
});

describe("A5 — the words", () => {
  it("states counted in Arabic", () => {
    expect([1, 2, 3, 10, 11, 24].map(n => statesText(n))).toEqual(["حالة واحدة", "حالتان", "3 حالات", "10 حالات", "11 حالة", "24 حالة"]);
    expect(statesText(2, "acc")).toBe("حالتين");
  });
});

describe("A5 — «هل آلتاي متكافئتان؟»", () => {
  it("the same shortest word as «صمّم الآلة»'s server judge, for every pair of the book's finite automata over one alphabet", () => {
    const fas = bookMachines().filter(m => m.kind === "DFA" || m.kind === "NFA") as FaMachine[];
    const toServer = (m: FaMachine) => readMachine({ states: m.states, start: m.start, accept: m.accept, transitions: m.transitions.map(t => [t.from, t.symbol, t.to]) },
      { type: "NFA", alphabet: m.alphabet, maxStates: 24, complete: false }).m;
    let pairs = 0, different = 0;
    for (const a of fas) for (const b of fas) {
      if (a === b || a.alphabet.join() !== b.alphabet.join()) continue;
      const server = compare(toServer(a), toServer(b), a.alphabet);
      const lab = equivalence(a, b);
      if (server.equal) expect(lab).toEqual({ equal: true });
      else { expect(lab).toEqual({ equal: false, word: server.word, firstAccepts: !server.referenceAccepts }); different++; }
      pairs++;
    }
    expect(pairs).toBeGreaterThan(500);
    expect(different).toBeGreaterThan(100);
  });
  it("a machine and its own conversion / minimization are equivalent; different alphabets: a foreign symbol is rejected", () => {
    const n = read(U05.HAS_AA);
    expect(equivalence(n, ok(toDeterministic(n)).machine)).toEqual({ equal: true });
    const onlyA = checkDraft({ ...initialDraft("DFA"), alphabet: ["a"], states: ["q0"], accept: ["q0"], cells: { "q0|a": ["q0"] } }).machine!;
    const ab = checkDraft({ ...initialDraft("DFA"), states: ["q0"], accept: ["q0"], cells: { "q0|a": ["q0"], "q0|b": ["q0"] } }).machine!;
    expect(equivalence(onlyA, ab)).toEqual({ equal: false, word: "b", firstAccepts: false });
  });
});
