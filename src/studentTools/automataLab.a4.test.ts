// AUTO-A4 (docs/enterprise-automata-lab-a4.md) — «مختبر الآلات», the data side (automataLab.ts):
//   • the book: EVERY machine of the course's simulators (899271) opens in the lab as a draft and reads back as the same machine, and
//     the lab's fast verdict equals the course runner's on every word up to length 4 (and the block's own words);
//   • the draft → machine reader names in Arabic what is wrong (a DFA's two arrows or ε, a PDA's empty push / pop of ⏊ / two moves,
//     a Turing machine's ├ rules / two moves) and builds nothing then;
//   • the course's checks: missing arrows, «أضف حالة مصيدة» (complete, same language), non-determinism, unreachable states;
//   • a batch of words, and «لغة آلتي» (shortlex, bounded, a Turing machine that does not halt said so).
import { describe, it, expect } from "vitest";
import { readAutomatonConfig, runAutomaton, splitWord, type Machine } from "../learning/activities/automaton";
import {
  addState, addTrapState, checkDraft, draftFromMachine, initialDraft, languageMaxLength, languageUpTo, missingArrows, nondeterminism,
  parseAlphabet, parseWords, removeState, runBatch, runWord, setAlphabet, unreachableStates, verdictOf, cellKey, BOTTOM, LEFT_END, BLANK,
  type LabDraft,
} from "./automataLab";
const MODULES = import.meta.glob("../learning/content/899271/modules/*.ts", { eager: true }) as Record<string, { default: unknown }>;

type Block = { activity?: { simulationType?: string; config?: unknown }; [k: string]: unknown };
function courseMachines(): { id: string; config: Record<string, unknown>; machine: Machine; words: string[] }[] {
  const out: { id: string; config: Record<string, unknown>; machine: Machine; words: string[] }[] = [];
  const walk = (node: unknown, id: string) => {
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, id + "/" + i)); return; }
    if (!node || typeof node !== "object") return;
    const o = node as Block & Record<string, unknown>;
    if (o.simulationType === "automaton-trace" && o.config && typeof o.config === "object") {
      const read = readAutomatonConfig(o.config);
      if (read) out.push({ id, config: o.config as Record<string, unknown>, machine: read.machine, words: read.words });
    }
    for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") walk(v, id + "." + k);
  };
  for (const [key, mod] of Object.entries(MODULES)) walk(mod.default, key.replace(/^.*\//, ""));
  return out;
}
const sameMachine = (a: Machine, b: Machine) => {
  const norm = (m: Machine) => ({
    kind: m.kind, states: m.states, alphabet: m.alphabet, start: m.start, accept: [...m.accept].sort(), labels: m.stateLabels,
    transitions: m.transitions.map(t => JSON.stringify(t)).sort(), ...(m.kind === "TM" ? { leftEnd: m.leftEnd ?? null, blank: m.blank } : {}),
    ...(m.kind === "PDA" ? { bottom: m.bottom } : {}),
  });
  expect(norm(a)).toEqual(norm(b));
};
const allWords = (alphabet: string[], n: number): string[][] => {
  const out: string[][] = [[]];
  let layer: string[][] = [[]];
  for (let i = 0; i < n; i++) { layer = layer.flatMap(w => alphabet.map(s => [...w, s])); out.push(...layer); }
  return out;
};
const built = (d: LabDraft): Machine => {
  const c = checkDraft(d);
  if (!c.machine) throw new Error("not built: " + c.issues.map(i => i.text).join(" | "));
  return c.machine;
};

describe("A4 — the book's machines in the lab", () => {
  const machines = courseMachines();
  it("the course has its simulators (every kind)", () => {
    expect(machines.length).toBeGreaterThanOrEqual(80);
    expect(new Set(machines.map(m => m.machine.kind))).toEqual(new Set(["DFA", "NFA", "PDA", "TM"]));
  });
  it("every machine opens as a draft and reads back as the same machine", () => {
    for (const { id, machine } of machines) {
      const c = checkDraft(draftFromMachine(machine));
      expect(c.issues, id).toEqual([]);
      sameMachine(c.machine as Machine, machine);
    }
  });
  it("the lab's verdict equals the course runner's on every word up to length 4 and on the block's own words", () => {
    let compared = 0;
    for (const { id, machine, words } of machines) {
      const lab = built(draftFromMachine(machine));
      const list = [...allWords(machine.alphabet, machine.alphabet.length > 3 ? 3 : 4), ...words.map(w => [...w])];
      for (const symbols of list) {
        const course = runAutomaton(machine, symbols).verdict;
        expect(verdictOf(lab, symbols), id + " «" + symbols.join("") + "»").toBe(course);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(2000);
  });
});

// An even number of a over {a,b}, but incomplete on purpose: no arrow from q1 by b, so a b after an odd number of a is rejected.
const evenA = (): LabDraft => ({ ...initialDraft("DFA"), states: ["q0", "q1"], accept: ["q0"], cells: { "q0|a": ["q1"], "q0|b": ["q0"], "q1|a": ["q0"] } });

describe("A4 — the draft becomes the machine, or says why not", () => {
  it("a deterministic automaton: two arrows for one state and symbol, or ε, are named and nothing is built", () => {
    const two = checkDraft({ ...evenA(), cells: { ...evenA().cells, "q0|a": ["q1", "q0"] } });
    expect([two.machine, two.issues.map(i => i.code)]).toEqual([null, ["two-arrows"]]);
    expect(two.issues[0].text).toBe("في الأوتومات الحتمي سهم واحد لكل حالة ولكل رمز، ومن q0 بالرمز a أكثر من سهم.");
    const eps = checkDraft({ ...evenA(), cells: { ...evenA().cells, "q1|ε": ["q0"] } });
    expect(eps.issues.map(i => i.code)).toEqual(["epsilon-in-dfa"]);
    // the same cells are a fine non-deterministic automaton
    expect(checkDraft({ ...evenA(), kind: "NFA", cells: { ...evenA().cells, "q0|a": ["q1", "q0"], "q1|ε": ["q0"] } }).issues).toEqual([]);
  });
  it("a push-down automaton in the course's notation (push A per a, pop one per b, accept in q1); its mistakes named", () => {
    const anbn: LabDraft = {
      ...initialDraft("PDA"), states: ["q0", "q1"], accept: ["q1"],
      pda: [
        { from: "q0", read: "a", top: BOTTOM, op: "push", write: "A", to: "q0" },
        { from: "q0", read: "a", top: "A", op: "push", write: "A", to: "q0" },
        { from: "q0", read: "b", top: "A", op: "pop", write: "A", to: "q1" },     // «اسحب b,A/A», as the course writes it
        { from: "q1", read: "b", top: "A", op: "pop", write: "", to: "q1" },      // or with nothing after the slash
      ],
    };
    // acceptance by state after the whole word (the course's PDA): «aab» ends in q1 too; «abb» finds ⏊ and stops; «ba» has no move
    expect(runBatch(built(anbn), ["ab", "aabb", "aab", "abb", "ba", ""]).map(r => r.verdict)).toEqual(["accept", "accept", "accept", "stuck", "stuck", "reject"]);
    const issue = (patch: Partial<LabDraft["pda"][number]>) => checkDraft({ ...anbn, pda: [{ ...anbn.pda[0], ...patch }] }).issues.map(i => i.code);
    expect(issue({ write: "" })).toEqual(["push-empty"]);
    expect(issue({ op: "pop", write: "" })).toEqual(["pop-bottom"]);
    expect(issue({ op: "none", write: "A" })).toEqual(["write-ignored"]);
    expect(issue({ write: BOTTOM })).toEqual(["row-write"]);
    expect(issue({ read: "" })).toEqual(["row-read"]);
    expect(checkDraft({ ...anbn, pda: [anbn.pda[2], { ...anbn.pda[2], write: "B" }] }).issues.map(i => i.code)).toEqual(["pop-write"]);
    expect(checkDraft({ ...anbn, pda: [anbn.pda[0], { ...anbn.pda[0], to: "q1" }] }).issues.map(i => i.code)).toEqual(["pda-two-moves"]);
  });
  it("a Turing machine with ├: ├ is never written over nor left of; two moves named; one that does not halt says so", () => {
    // accepts the words of a whose length is even: walk right, flip q0/q1, accept on the blank in q0
    const even: LabDraft = {
      ...initialDraft("TM"), alphabet: ["a"], states: ["q0", "q1", "q2"], accept: ["q2"],
      tm: [{ from: "q0", read: "a", write: "a", move: "R", to: "q1" }, { from: "q1", read: "a", write: "a", move: "R", to: "q0" }, { from: "q0", read: BLANK, write: BLANK, move: "S", to: "q2" }],
    };
    expect(runBatch(built(even), ["", "a", "aa", "aaa", "aaaa"]).map(r => r.verdict)).toEqual(["accept", "reject", "accept", "reject", "accept"]);
    const issue = (row: LabDraft["tm"][number]) => checkDraft({ ...even, tm: [row] }).issues.map(i => i.code);
    expect(issue({ from: "q0", read: LEFT_END, write: "a", move: "R", to: "q0" })).toEqual(["left-end"]);
    expect(issue({ from: "q0", read: "a", write: LEFT_END, move: "R", to: "q0" })).toEqual(["left-end"]);
    expect(issue({ from: "q0", read: LEFT_END, write: LEFT_END, move: "L", to: "q0" })).toEqual(["left-of-end"]);
    expect(checkDraft({ ...even, tm: [...even.tm, { ...even.tm[0], to: "q2" }] }).issues.map(i => i.code)).toEqual(["tm-two-moves"]);
    const forever = built({ ...even, tm: [{ from: "q0", read: BLANK, write: BLANK, move: "R", to: "q0" }, { from: "q0", read: "a", write: "a", move: "R", to: "q0" }] });
    expect(verdictOf(forever, ["a"])).toBe("nohalt");
    const lang = languageUpTo(forever, 2);
    expect([lang.accepted, lang.nohalt]).toEqual([[], ["", "a", "aa"]]);
  });
  it("the alphabet as typed: «a, b», «ab», «a b»; a reserved mark, a long symbol or an empty one refused", () => {
    expect(["a, b", "ab", "a b", " a ,b,a "].map(t => parseAlphabet(t))).toEqual(Array(4).fill({ ok: true, alphabet: ["a", "b"] }));
    for (const bad of ["", "ε", BOTTOM, "a, bc", "a,|"]) expect(parseAlphabet(bad).ok).toBe(false);
    expect(parseAlphabet("abcdefghijklm").ok).toBe(false);   // 13 > 12
  });
  it("editing: removing a state removes its arrows and rows; changing the alphabet drops the arrows of a symbol gone", () => {
    const d = removeState(evenA(), "q1");
    expect([d.states, d.cells]).toEqual([["q0"], { "q0|a": [], "q0|b": ["q0"] }]);
    expect(removeState({ ...initialDraft() }, "q0").states).toEqual(["q0"]);   // never the last one
    expect(setAlphabet(evenA(), ["a"]).cells).toEqual({ "q0|a": ["q1"], "q1|a": ["q0"] });
    expect(addState(evenA()).states).toEqual(["q0", "q1", "q2"]);
  });
});

describe("A4 — the course's checks", () => {
  it("missing arrows, then «أضف حالة مصيدة»: complete, the trap named «مصيدة», and the same language", () => {
    expect(missingArrows(evenA())).toEqual([{ state: "q1", symbol: "b" }]);
    const t = addTrapState(evenA());
    expect([t.states, t.labels, missingArrows(t), t.cells[cellKey("q1", "b")], t.cells[cellKey("qT", "a")]]).toEqual([["q0", "q1", "qT"], { qT: "مصيدة" }, [], ["qT"], ["qT"]]);
    expect(languageUpTo(built(t), 5).accepted).toEqual(languageUpTo(built(evenA()), 5).accepted);
    expect(addTrapState(t)).toBe(t);   // already complete: unchanged
  });
  it("non-determinism named (ε, two targets); a DFA-shaped draft is deterministic", () => {
    expect(nondeterminism({ ...evenA(), kind: "NFA", cells: { ...evenA().cells, "q0|a": ["q1", "q0"], "q1|ε": ["q0"] } }))
      .toEqual(["من q0 بالرمز a إلى أكثر من حالة (q1، q0)", "من q1 انتقال ε"]);
    expect(nondeterminism({ ...evenA(), kind: "NFA" })).toEqual([]);
  });
  it("unreachable states", () => {
    expect(unreachableStates(built({ ...evenA(), states: ["q0", "q1", "q2"] }))).toEqual(["q2"]);
  });
});

describe("A4 — many words at once", () => {
  it("a batch as typed (lines, spaces, commas; ε is the empty word); a foreign symbol or a long word said", () => {
    expect(parseWords("ab\naab, b  ε,ab")).toEqual(["ab", "aab", "b", ""]);
    const rows = runBatch(built(addTrapState(evenA())), ["", "aa", "ab", "c", "a".repeat(41)]);
    expect(rows).toEqual([{ word: "", verdict: "accept" }, { word: "aa", verdict: "accept" }, { word: "ab", verdict: "reject" },
      { word: "c", verdict: null, bad: "c" }, { word: "a".repeat(41), verdict: null, tooLong: true }]);
  });
  it("«لغة آلتي»: shortlex, the count, bounded by the kind's budget", () => {
    // «aba» is not there: its b after one a falls into the trap
    const lang = languageUpTo(built(addTrapState(evenA())), 3);
    expect(lang).toEqual({ maxLength: 3, tried: 15, accepted: ["", "b", "aa", "bb", "aab", "baa", "bbb"], acceptedCount: 7, nohalt: [] });
    const m = built(evenA());
    expect(languageMaxLength(m)).toBe(12);                                         // 2 symbols: 8191 words ≤ 20000
    expect(languageMaxLength({ ...m, alphabet: ["a", "b", "c", "d", "e", "f"] })).toBe(5);   // 9331 words; 6 would be 55987
    expect(languageUpTo(m, 99).maxLength).toBe(12);
  });
  it("one word step by step: the course's runner; a foreign symbol or a long word said", () => {
    const m = built(evenA());
    const r = runWord(m, "aa");
    expect(r.ok && r.run.verdict).toBe("accept");
    expect(r.ok && r.run.steps.length).toBe(runAutomaton(m, (splitWord(m, "aa") as { symbols: string[] }).symbols).steps.length);
    expect(runWord(m, "ac")).toEqual({ ok: false, message: "الرمز c ليس من الأبجدية {a, b}." });
  });
});
