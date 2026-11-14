// AUTO-A2 — every machine and every machine exercise of the course «الوحدة الخامسة: الأتمتة» is PROVEN on the real simulator engine
// (src/learning/activities/automaton.ts), never trusted:
//   • each simulator block's config is readable (the activity would otherwise show «غير متوفر»);
//   • a machine that declares its language (`lang`) accepts EXACTLY that language on every word over its alphabet up to a length;
//   • each example word of a simulator is a valid word of its alphabet;
//   • each exercise with a `prove` is checked against the machine shown above it on the same page (accepts / finalState /
//     stateSet / shortest / classify / stackAfter);
//   • AUTO-A3 — each «صمّم الآلة» exercise: its served task reads in the designer, its reference machine accepts EXACTLY its
//     declared language, its example words agree with that language, and the reference itself passes the REAL server judge
//     (api/src/lib/learning-automaton-design.js) under the task's own rules (the task can be met within its limits), while a
//     machine for another language is judged wrong with a separating word that the language really separates.
import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { buildCourse } from "../build-automata-course.mjs";
import { readAutomatonConfig, runAutomaton, splitWord, type Machine } from "../../src/learning/activities/automaton";
import { readDesignTask } from "../../src/learning/activities/automatonDesign";
import { automatonDesignKey } from "../../src/learning/study/eligibility";
import { servedBlock } from "../../src/learning/study/checkIndex";
import type { ContentBlock, SimulationBlock } from "../../src/learning/content/types";
import { evaluateAutomatonDesign } from "../../api/src/lib/learning-automaton-design.js";

type Raw = { unit: number; pageId: string; block: Record<string, unknown> & { id: string; type: string } };
const { raw } = buildCourse() as { raw: Raw[] };

const words = (alphabet: string[], max: number): string[] => {
  const out = [""];
  let layer = [""];
  for (let n = 1; n <= max; n++) {
    layer = layer.flatMap(w => alphabet.map(s => w + s));
    out.push(...layer);
    if (out.length > 60000) break;
  }
  return out;
};
const run = (m: Machine, w: string) => {
  const s = splitWord(m, w);
  if (!s.ok) throw new Error("word «" + w + "» is not over the alphabet");
  return runAutomaton(m, s.symbols);
};
const accepted = (m: Machine, w: string) => run(m, w).verdict === "accept";
const machineOf = (b: Raw["block"]): Machine => {
  const c = readAutomatonConfig(b.config);
  if (!c) throw new Error(b.id + ": unreadable simulator config");
  return c.machine;
};

const sims = raw.filter(r => r.block.type === "simulation" && r.block.simulationType === "automaton-trace");
const proven = raw.filter(r => r.block._prove);

describe("every simulator of the course runs", () => {
  it("there are simulators to prove", () => { expect(sims.length).toBeGreaterThan(0); });
  for (const r of sims) {
    it(r.block.id + " — readable, example words valid" + (r.block._lang ? ", accepts exactly its language" : ""), () => {
      const m = machineOf(r.block);
      const cfg = readAutomatonConfig(r.block.config)!;
      for (const w of cfg.words) expect(splitWord(m, w).ok, w).toBe(true);
      // a machine that COMPUTES (a Turing machine writing its answer): each [input, expected tape] is run and the tape compared
      for (const [input, expected] of (r.block._tapes as [string, string][] | undefined) ?? []) {
        const res = run(m, input);
        expect(res.verdict, "«" + input + "» halts in an accepting state").toBe("accept");
        const tape = res.steps.at(-1)!.tape!.cells.filter(c => c !== "├").join("").replace(/^∆+|∆+$/g, "");
        expect(tape, "tape after «" + input + "»").toBe(expected);
      }
      const lang = r.block._lang as ((w: string) => boolean) | undefined;
      if (!lang) return;
      const max = (r.block._langMax as number) ?? 7;
      const wrong = words(m.alphabet, max).filter(w => accepted(m, w) !== lang(w));
      expect(wrong.slice(0, 5), "words the machine judges differently from its language").toEqual([]);
    });
  }
});

describe("every machine exercise is proven on the machine above it", () => {
  for (const r of proven) {
    it(r.block.id + " — " + (r.block._prove as { type: string }).type, () => {
      const page = raw.filter(x => x.pageId === r.pageId);
      const at = page.indexOf(r);
      const above = page.slice(0, at).reverse().find(x => x.block.type === "simulation" && x.block.simulationType === "automaton-trace");
      expect(above, "no simulator above the exercise on its page").toBeTruthy();
      const m = machineOf(above!.block);
      const p = r.block._prove as { type: string; word?: string; expect?: unknown; words?: [string, number][] };
      const q = r.block.question as Record<string, unknown>;
      switch (p.type) {
        case "accepts": expect(accepted(m, p.word!)).toBe(p.expect); break;
        case "finalState": expect(run(m, p.word!).steps.at(-1)!.active).toEqual([p.expect]); break;
        case "stateSet": expect(run(m, p.word!).steps.at(-1)!.active).toEqual(p.expect); break;
        case "stackAfter": expect(run(m, p.word!).steps.at(-1)!.stack!.join("")).toBe(p.expect); break;
        case "classify": for (const [w, g] of p.words!) expect(accepted(m, w), "«" + w + "»").toBe(g === 0); break;
        case "shortest": {
          const all = words(m.alphabet, 8).filter(w => accepted(m, w));
          const min = Math.min(...all.map(w => [...w].length));
          expect(all.filter(w => [...w].length === min).sort()).toEqual([...(p.expect as string[])].sort());
          break;
        }
        default: throw new Error("unknown proof " + p.type);
      }
      // the key the learner is judged against agrees with the proof
      if (p.type === "accepts" && q.kind === "trueFalse") expect(q.answer).toBe(p.expect);
    });
  }
});

// ── AUTO-A3 — «صمّم الآلة» ──────────────────────────────────────────────────────────────────────────────────────────
const designs = raw.filter(r => r.block.type === "simulation" && r.block.simulationType === "automaton-design");
type DesignCfg = { task: { machine: "DFA" | "NFA"; alphabet: string[]; maxStates?: number; complete?: boolean; examples?: { accept?: string[]; reject?: string[] } }; reference: { states: string[]; start: string; accept: string[]; transitions: [string, string, string][] } };
describe("every «صمّم الآلة» exercise is proven through the real server judge", () => {
  it("the course has design exercises", () => { expect(designs.length).toBeGreaterThanOrEqual(10); });
  for (const r of designs) {
    it(r.block.id + " — reads, reference = its language, examples agree, the reference passes the judge, a wrong machine does not", () => {
      const cfg = r.block.config as unknown as DesignCfg;
      // the browser reads the SERVED task (the reference is not in it)
      const served = servedBlock(r.block as unknown as ContentBlock) as unknown as { config: Record<string, unknown>; serverCheck?: boolean };
      expect(Object.keys(served.config)).toEqual(["task"]);
      expect(served.serverCheck).toBe(true);
      expect(readDesignTask(served.config), "the designer reads the served task").not.toBeNull();
      // the reference accepts exactly the declared language
      const ref = readAutomatonConfig({ automaton: { kind: "NFA", alphabet: cfg.task.alphabet, ...cfg.reference } });
      expect(ref, "the reference is a readable machine").not.toBeNull();
      const m = ref!.machine;
      const lang = r.block._lang as (w: string) => boolean;
      expect(typeof lang).toBe("function");
      const all = words(cfg.task.alphabet, (r.block._langMax as number) ?? 7);
      expect(all.filter(w => accepted(m, w) !== lang(w)).slice(0, 5), "words the reference judges differently from its language").toEqual([]);
      for (const w of cfg.task.examples?.accept ?? []) expect(lang(w), "example «" + w + "» is accepted").toBe(true);
      for (const w of cfg.task.examples?.reject ?? []) expect(lang(w), "example «" + w + "» is rejected").toBe(false);
      // the key the server holds, and the real judge
      const key = automatonDesignKey(r.block as unknown as SimulationBlock);
      expect(key).not.toBeNull();
      // the task can be met within its own rules: the minimal DFA of the language fits (built from the reference by subsets)
      const dfa = minimalDfa(m, cfg.task.alphabet);
      if (cfg.task.machine === "DFA") expect(dfa.states.length, "the minimal complete DFA fits the state limit").toBeLessThanOrEqual(cfg.task.maxStates ?? 12);
      const limit = cfg.task.maxStates ?? 12;
      if (dfa.states.length <= limit) expect(evaluateAutomatonDesign(key, { kind: "automaton-design", machine: dfa })).toEqual({ status: "judged", correct: true });
      // an NFA task whose language needs more DFA states than the limit: the DFA is refused by the public rule (the task asks for
      // the small non-deterministic machine), never judged by its language
      else expect(evaluateAutomatonDesign(key, { kind: "automaton-design", machine: dfa })).toEqual({ status: "judged", correct: false, issue: { code: "too-many-states", max: limit } });
      if (cfg.task.machine === "NFA") expect(cfg.reference.states.length).toBeLessThanOrEqual(cfg.task.maxStates ?? 12);
      if (cfg.task.machine === "NFA") expect(evaluateAutomatonDesign(key, { kind: "automaton-design", machine: cfg.reference })).toEqual({ status: "judged", correct: true });
      // a machine that accepts everything is wrong, and the separating word really separates
      const everything = { states: ["q0"], start: "q0", accept: ["q0"], transitions: cfg.task.alphabet.map(a => ["q0", a, "q0"] as [string, string, string]) };
      const v = evaluateAutomatonDesign(key, { kind: "automaton-design", machine: everything }) as { status: string; correct: boolean; counterexample?: { word: string; shouldAccept: boolean } };
      expect(v.status).toBe("judged");
      expect(v.correct).toBe(false);
      expect(v.counterexample!.shouldAccept).toBe(false);
      expect(lang(v.counterexample!.word)).toBe(false);
    });
  }
});

/** The minimal complete DFA of a machine's language (subset construction, then Moore refinement), as a design answer. */
function minimalDfa(m: Machine, alphabet: string[]) {
  const key = (set: string[]) => [...set].sort().join(",");
  const startSet = run(m, "").steps.at(-1)!.active;
  const sets = new Map<string, string[]>([[key(startSet), startSet]]);
  const order = [key(startSet)];
  const delta = new Map<string, string>();
  for (let i = 0; i < order.length; i++) {
    const from = sets.get(order[i])!;
    for (const a of alphabet) {
      // the state set after one more symbol: run every word that reaches `from`? — simpler: step the NFA from the set directly
      const next = stepSet(m, from, a);
      const k = key(next);
      if (!sets.has(k)) { sets.set(k, next); order.push(k); }
      delta.set(order[i] + "|" + a, k);
    }
  }
  const acc = (k: string) => sets.get(k)!.some(q => m.accept.includes(q));
  let cls = new Map(order.map(k => [k, acc(k) ? "1" : "0"]));
  for (;;) {
    const sig = new Map(order.map(k => [k, cls.get(k)! + "/" + alphabet.map(a => cls.get(delta.get(k + "|" + a)!)).join(",")]));
    const ids = new Map<string, string>(); for (const s of sig.values()) if (!ids.has(s)) ids.set(s, String(ids.size));
    const next = new Map(order.map(k => [k, ids.get(sig.get(k)!)!]));
    if (new Set(next.values()).size === new Set(cls.values()).size) { cls = next; break; }
    cls = next;
  }
  const name = (k: string) => "c" + cls.get(k);
  const states = [...new Set(order.map(name))];
  const transitions: [string, string, string][] = [];
  const seen = new Set<string>();
  for (const k of order) for (const a of alphabet) { const e = name(k) + "|" + a; if (!seen.has(e)) { seen.add(e); transitions.push([name(k), a, name(delta.get(k + "|" + a)!)]); } }
  return { states, start: name(order[0]), accept: [...new Set(order.filter(acc).map(name))], transitions };
}
function stepSet(m: Machine, set: string[], a: string): string[] {
  const t = (m as { transitions: { from: string; symbol: string; to: string }[] }).transitions;
  const close = (xs: Set<string>) => { const st = [...xs]; while (st.length) { const q = st.pop()!; for (const e of t) if (e.from === q && (e.symbol === "ε" || e.symbol === "λ") && !xs.has(e.to)) { xs.add(e.to); st.push(e.to); } } return xs; };
  const out = new Set<string>();
  for (const q of set) for (const e of t) if (e.from === q && e.symbol === a) out.add(e.to);
  return [...close(out)].sort();
}
