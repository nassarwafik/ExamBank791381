// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the recorded QUESTION traces, re-checked without Docker:
//   • WHICH: exactly the 77 self-study exercises that show a program and the 77 programs of the book's tracing questions (P10 work list,
//     track B; a method header the student is asked to write is not a program to trace) — every one traced, none skipped or failed;
//   • SHORT: at most 30 steps (owner, 2026-11-10); a longer run shows its first 21 and last 9 recorded steps, the cut said;
//   • a program that draws random numbers runs with a generator fixed to one sequence (a hidden class, never printing), so its run is
//     reproducible, and the learner is told it is one example run;
//   • BOUND: each run is bound (sha256) to the very source that ran and its input; an exercise's run is the SAME program and input as its
//     P4 output proof and printed exactly what that independent proof printed;
//   • FAITHFUL: every trace reads back through the tracer's own validator on the page's program; its lines are the page's lines; the
//     output only grows and never exceeds what the program printed; every step has a sentence with balanced direction isolates;
//   • the book specs: one per book program that needs one, with where its values come from;
//   • the server's index is exactly the build of these runs (regenerating changes no byte).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import specsFile from "./question-traces/specs.json";
import practiceProofs from "./practice/proofs.json";
import { readTraceConfig } from "../../activities/csharpTrace";
// @ts-expect-error — plain ESM tools shared with the recorder; untyped on purpose.
import { targets, runSource, runSha, MAX_STEPS, SHOWN_STEPS, HEAD_STEPS } from "../../../../scripts/trace-899371-questions.mjs";
// @ts-expect-error — plain ESM tools shared with the recorder; untyped on purpose.
import { buildTraceIndex, INDEX_FILE } from "../../../../scripts/build-learning-trace-index.mjs";
// @ts-expect-error — plain ESM tools shared with the recorder; untyped on purpose.
import { LRI, FSI, PDI } from "../../../../scripts/lib/trace-notes.mjs";

// read at run time (not imported): a typed import of this large file would make the type-checker infer it whole
const runsFile = JSON.parse(readFileSync(new URL("./question-traces/runs.json", import.meta.url), "utf8")) as { runs: unknown; skipped: unknown };
type Step = { line: number; note: string; frames: { name: string; vars: [string, unknown][] }[]; eval: unknown[]; heap: unknown[]; out: string };
type Run = { kind: "exercise" | "book"; sha: string; stdin?: string; stdout: string; steps: Step[] };
type Target = { key: string; kind: "exercise" | "book"; program: string; stdin?: string; questionId?: string; blockId: string; proofKey?: string; programKind?: string; valuesFrom?: string };
const runs = runsFile.runs as unknown as Record<string, Run>;
const skipped = runsFile.skipped as Record<string, string>;
const all = targets() as Target[];
const specs = specsFile.specs as Record<string, { stdin?: string; setup?: string; call?: string; source?: string; skip?: string; quote?: string }>;
const proofs = practiceProofs.proofs as Record<string, { sha: string; stdout: string }>;

describe("899371 P13 — the recorded question traces", () => {
  it("cover exactly the 77 exercises with a program and the 77 book tracing programs: every one traced", () => {
    expect(all.filter(t => t.kind === "exercise")).toHaveLength(77);
    expect(all.filter(t => t.kind === "book")).toHaveLength(77);
    expect(Object.keys(runs).sort()).toEqual(all.map(t => t.key).sort());
    expect(skipped).toEqual({});
    expect(Object.keys(runs)).toHaveLength(154);
  });

  it("at most 30 steps a grade-10 learner can follow; a longer run shows its head and its end, and says what it skipped", () => {
    expect([MAX_STEPS, SHOWN_STEPS, HEAD_STEPS]).toEqual([30, 30, 21]);
    const cut = Object.entries(runs).filter(([, r]) => r.steps.some(s => s.note.startsWith("⋯ تخطّينا هنا ")));
    expect(cut.length).toBeGreaterThan(0);
    for (const [key, r] of Object.entries(runs)) {
      expect(r.steps.length, key).toBeLessThanOrEqual(30);
      const marks = r.steps.map((s, i) => [i, s.note] as const).filter(([, n]) => n.includes("تخطّينا هنا"));
      if (marks.length) {
        expect(r.steps.length, key).toBe(30);
        expect(marks.map(([i]) => i), key + ": the cut is said once, on the first step after the head").toEqual([HEAD_STEPS]);
        expect(marks[0][1], key).toMatch(/^⋯ تخطّينا هنا \d+ من الخطوات المتشابهة، ونكمل قرب النهاية\. /);
      }
    }
    // the 1 … 100 counting loop exercise: 30 steps, ending with the count printed
    const loop = runs["899371-m05-l04-p02/m05-l04-p02-q08-code"];
    expect(loop.steps.length).toBe(30);
    expect(loop.steps[loop.steps.length - 1].out).toBe("100\n");
  });

  it("a program that draws random numbers runs with a fixed-sequence generator (hidden, the book's code unchanged), said to the learner", () => {
    const random = all.filter(t => /\bnew\s+Random\s*\(/.test(t.program));
    expect(random.map(t => t.key).sort()).toEqual(["899371-m05-l02-p05/m05-l02-p05-b02", "899371-m08-l02-p04/m08-l02-p04-b03"]);
    for (const t of random) {
      const spec = specs[t.questionId + "/" + t.blockId] as { extra?: string; random?: boolean };
      expect(spec.random, t.key).toBe(true);
      expect(spec.extra, t.key).toMatch(/^class Random : System\.Random \{ public Random\(\) : base\(\d+\) \{ \} \}$/);
      const src = runSource(t).source;
      expect(src.indexOf(spec.extra!), t.key + ": after the page's lines").toBeGreaterThan(src.indexOf(t.program.split("\n").at(-2)!.trim()));
      expect(runs[t.key], t.key).toBeDefined();
    }
  });

  it("a method header the student is asked to write is not traced (P14 «حلّ وافحص» takes it)", () => {
    expect(all.some(t => t.key === "899371-m09-l03-p05/m09-l03-p05-b03")).toBe(false);
    expect(Object.keys(specs)).not.toContain("c09-p-q5/m09-l03-p05-b03");
  });

  it("each run is bound to the source that ran and its input; an exercise's run is its P4 proof's program and printed what it printed", () => {
    for (const t of all) {
      const run = runs[t.key];
      if (!run) continue;
      expect(run.kind, t.key).toBe(t.kind);
      expect(run.sha, t.key).toBe(runSha(runSource(t).source, t.stdin));
      expect(run.stdin, t.key).toBe(t.stdin);
      if (t.kind === "exercise") {
        const proof = proofs[t.proofKey!];
        expect(proof, t.key).toBeDefined();
        expect(run.sha, t.key + " — the same program and input as its P4 proof").toBe(proof.sha);
        expect(run.stdout, t.key).toBe(proof.stdout);
      }
    }
  });

  it("each trace reads back through the tracer's validator on the page's own program; lines are the page's; the output only grows", () => {
    for (const t of all) {
      const run = runs[t.key];
      if (!run) continue;
      const cfg = readTraceConfig({ code: t.program, ...(t.stdin !== undefined ? { stdin: t.stdin } : {}), steps: run.steps });
      expect(cfg, t.key).not.toBeNull();
      expect(run.steps.length, t.key).toBeLessThanOrEqual(MAX_STEPS);
      const n = t.program.split("\n").length;
      let out = "";
      for (const s of run.steps) {
        expect(s.line >= 1 && s.line <= n, t.key + " line " + s.line).toBe(true);
        expect(s.out.startsWith(out), t.key + ": the output only grows").toBe(true);
        out = s.out;
        expect(s.note.trim().length, t.key).toBeGreaterThan(3);
        expect(s.note, t.key).not.toContain("`");
        const opens = [...s.note].filter(c => c === LRI || c === FSI).length, closes = [...s.note].filter(c => c === PDI).length;
        expect(opens, t.key + ": balanced isolates in «" + s.note + "»").toBe(closes);
      }
      expect(run.stdout.startsWith(out), t.key + ": the last step printed no more than the program").toBe(true);
    }
  });

  it("a book program that needs values has its spec (stdin for input, setup for a fragment, call for a method), with its source", () => {
    const book = all.filter(t => t.kind === "book");
    for (const t of book) {
      const spec = specs[t.questionId + "/" + t.blockId];
      const reads = /Console\s*\.\s*ReadLine/.test(t.program);
      expect(spec?.skip, t.key + ": nothing skipped").toBeUndefined();
      if (reads) expect(typeof spec?.stdin, t.key + ": a program that reads input has its input").toBe("string");
      if (t.programKind === "method") expect(typeof spec?.call, t.key + ": a method has the call that runs it").toBe("string");
      if (spec) {
        expect(["question", "clarification", "chosen"], t.key).toContain(spec.source);
        if (spec.source !== "chosen") expect((spec.quote || "").length, t.key + ": the quoted words").toBeGreaterThan(0);
        for (const hidden of [spec.setup, spec.call, (spec as { extra?: string }).extra]) if (hidden) expect(hidden, t.key + ": hidden code never prints or reads").not.toMatch(/Console\s*\.\s*(Write|Read)/);
      }
    }
    expect(Object.keys(specs).every(k => book.some(t => t.questionId + "/" + t.blockId === k)), "no spec for a program that is not there").toBe(true);
  });

  it("the server's trace index is exactly the build of these runs (regenerating changes no byte)", () => {
    expect(JSON.stringify(buildTraceIndex()) + "\n").toBe(readFileSync(INDEX_FILE, "utf8"));
  });

  it("the index builder refuses a run whose program or input changed since it was recorded, and a run for no program", () => {
    const key = Object.keys(runs)[0];
    const stale = { ...runsFile, runs: { ...runs, [key]: { ...runs[key], sha: "0".repeat(64) } } };
    expect(() => buildTraceIndex(stale)).toThrow(/changed since it was recorded/);
    const changed = all.map(t => (t.key === key ? { ...t, program: t.program + "\n// edited" } : t));
    expect(() => buildTraceIndex(runsFile, changed)).toThrow(/changed since it was recorded/);
    expect(() => buildTraceIndex({ ...runsFile, runs: { ...runs, "899371-m01-l99-p01/x": runs[key] } })).toThrow(/for no program/);
  });
});
