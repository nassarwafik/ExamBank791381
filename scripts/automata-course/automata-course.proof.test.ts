// AUTO-A2 — every machine and every machine exercise of the course «الوحدة الخامسة: الأتمتة» is PROVEN on the real simulator engine
// (src/learning/activities/automaton.ts), never trusted:
//   • each simulator block's config is readable (the activity would otherwise show «غير متوفر»);
//   • a machine that declares its language (`lang`) accepts EXACTLY that language on every word over its alphabet up to a length;
//   • each example word of a simulator is a valid word of its alphabet;
//   • each exercise with a `prove` is checked against the machine shown above it on the same page (accepts / finalState /
//     stateSet / shortest / classify).
import { describe, it, expect } from "vitest";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { buildCourse } from "../build-automata-course.mjs";
import { readAutomatonConfig, runAutomaton, splitWord, type Machine } from "../../src/learning/activities/automaton";

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
      const above = page.slice(0, at).reverse().find(x => x.block.type === "simulation");
      expect(above, "no simulator above the exercise on its page").toBeTruthy();
      const m = machineOf(above!.block);
      const p = r.block._prove as { type: string; word?: string; expect?: unknown; words?: [string, number][] };
      const q = r.block.question as Record<string, unknown>;
      switch (p.type) {
        case "accepts": expect(accepted(m, p.word!)).toBe(p.expect); break;
        case "finalState": expect(run(m, p.word!).steps.at(-1)!.active).toEqual([p.expect]); break;
        case "stateSet": expect(run(m, p.word!).steps.at(-1)!.active).toEqual(p.expect); break;
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
