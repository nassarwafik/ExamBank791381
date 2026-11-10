// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the recorded QUESTION traces, re-checked without Docker:
//   • WHICH: exactly the 77 self-study exercises that show a program and the 78 programs of the book's tracing questions (P10 work list,
//     track B) — every one traced or skipped for a stated reason (Random, longer than the tracer shows, not runnable), none failed;
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
import { targets, runSource, runSha, MAX_STEPS } from "../../../../scripts/trace-899371-questions.mjs";
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
  it("cover exactly the 77 exercises with a program and the 78 book tracing programs: traced, or skipped for a stated reason", () => {
    expect(all.filter(t => t.kind === "exercise")).toHaveLength(77);
    expect(all.filter(t => t.kind === "book")).toHaveLength(78);
    expect([...Object.keys(runs), ...Object.keys(skipped)].sort()).toEqual(all.map(t => t.key).sort());
    expect(Object.keys(runs).filter(k => k in skipped)).toEqual([]);
    for (const [key, why] of Object.entries(skipped)) expect(why, key).toMatch(/^(the program uses Random|longer than the tracer shows \(\d+ steps\)|Only a method header)/);
    expect(Object.keys(runs)).toHaveLength(151);
    expect(Object.keys(skipped)).toHaveLength(4);
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
      const reads = /Console\s*\.\s*ReadLine/.test(t.program), random = /\bRandom\b/.test(t.program);
      if (random) { expect(spec?.skip, t.key).toMatch(/Random/); continue; }
      if (spec?.skip) continue;
      if (reads) expect(typeof spec?.stdin, t.key + ": a program that reads input has its input").toBe("string");
      if (t.programKind === "method") expect(typeof spec?.call, t.key + ": a method has the call that runs it").toBe("string");
      if (spec) {
        expect(["question", "clarification", "chosen"], t.key).toContain(spec.source);
        if (spec.source !== "chosen") expect((spec.quote || "").length, t.key + ": the quoted words").toBeGreaterThan(0);
        for (const hidden of [spec.setup, spec.call]) if (hidden) expect(hidden, t.key + ": hidden code never prints or reads").not.toMatch(/Console\s*\.\s*(Write|Read)/);
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
