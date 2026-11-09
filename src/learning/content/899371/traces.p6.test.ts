// 899371 P6 (docs/enterprise-899371-learning-plan.md §19) — the C# tracer (simulation / csharp-trace / v1) on 22 walkthrough pages:
//   • place: 2 per chapter (1–11), right after the walkthrough's guided reveal, enrichment, the tracer's own identity and controls;
//   • fidelity to the program: each instrumented copy strips to EXACTLY the page's program, the tracer shows that program, and every
//     step is the recorded run (runs.json) of that very copy (sha bound) — whose output is exactly what the clean program printed in
//     its own proven run (guided/proofs.json);
//   • the nine views are really there across the course: memory boxes, evaluated expressions, loops, the call stack, strings as
//     letters, arrays, a matrix, references to objects, and the output;
//   • every config reads back through the tracer's own validator.
import { describe, it, expect } from "vitest";
import manifest from "./manifest";
import runsFile from "./traces/runs.json";
import guidedProofs from "./guided/proofs.json";
import { loadBundledModuleContent } from "../bundledModules";
import type { ContentBlock, ContentModule } from "../types";
import { readTraceConfig } from "../../activities/csharpTrace";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { readGuided, TRACE_TITLE } from "../../../../scripts/convert-899371.mjs";
// @ts-expect-error — plain ESM tools shared with the converter; untyped on purpose.
import { readTraces, displayProgram, traceSource, traceSha, MAX_STEPS } from "../../../../scripts/trace-899371.mjs";

const CID = "899371";
type Val = { t: string; s?: string; items?: Val[]; rows?: string[][]; id?: number };
type Step = { line: number; note: string; frames: { name: string; vars: [string, Val][] }[]; eval: [string, Val][]; heap: { id: number; type: string; fields: [string, Val][] }[]; out: string };
const runs = runsFile.runs as unknown as Record<string, { sha: string; steps: Step[] }>;
const traces = readTraces() as Record<string, { walkthrough: number; program: string }[]>;
const guided = readGuided() as Record<string, { title: string; program?: string; stdin?: string }[]>;
const proofs = guidedProofs.proofs as Record<string, { stdout: string }>;
type Sim = Extract<ContentBlock, { type: "simulation" }>;

async function tracers() {
  const out: { chapter: string; page: string; blocks: ContentBlock[]; block: Sim }[] = [];
  for (const m of manifest.modules) {
    const mod = (await loadBundledModuleContent(CID, m.id)) as ContentModule;
    for (const l of mod.lessons) for (const p of l.pages) for (const b of p.blocks)
      if (b.type === "simulation" && (b as Sim).simulationType === "csharp-trace") out.push({ chapter: m.id.slice(-3), page: p.id, blocks: p.blocks, block: b as Sim });
  }
  return out;
}

describe("899371 P6 — the C# tracer", () => {
  it("22 tracers, 2 per chapter 1–11, each right after its walkthrough, enrichment, with the tracer's own identity and controls", async () => {
    const all = await tracers();
    expect(all).toHaveLength(22);
    for (const ch of Array.from({ length: 11 }, (_, i) => "m" + String(i + 1).padStart(2, "0"))) expect(all.filter(t => t.chapter === ch), ch).toHaveLength(2);
    for (const { page, blocks, block } of all) {
      const at = blocks.indexOf(block);
      expect(blocks[at - 1]?.type, page).toBe("guided");
      expect(at, page).toBe(blocks.length - 1);
      expect([block.origin, block.version, block.title], page).toEqual(["teacher-enrichment", 1, TRACE_TITLE]);
      expect(block.capabilities, page).toEqual({ fullscreen: true, reset: true, interactive: true });
      expect(block.id, page).toBe(page.slice(CID.length + 1) + "-trace");
    }
  }, 30000);

  it("each tracer shows its page's program, and every step is the recorded run of the instrumented copy that strips to it", async () => {
    let checked = 0;
    for (const [mid, list] of Object.entries(traces)) for (const t of list) {
      const key = `${mid}/g${String(t.walkthrough).padStart(2, "0")}`;
      const w = guided[mid][t.walkthrough - 1];
      expect(displayProgram(t.program), key + " the instrumented copy strips to the page's program").toBe(w.program);
      const run = runs[key];
      expect(run, key).toBeDefined();
      expect(run.sha, key + " the recorded run belongs to this copy and input").toBe(traceSha(traceSource(t.program), w.stdin));
      const last = run.steps[run.steps.length - 1];
      expect(last.out, key + " the traced run printed what the clean program printed").toBe(proofs[key].stdout);
      expect(run.steps.length, key).toBeGreaterThanOrEqual(2);
      expect(run.steps.length, key).toBeLessThanOrEqual(MAX_STEPS);
      const lines = w.program!.split("\n").length;
      for (const s of run.steps) {
        expect(s.line, key).toBeGreaterThanOrEqual(1);
        expect(s.line, key).toBeLessThanOrEqual(lines);
        expect(s.note.trim().length, key).toBeGreaterThan(0);
        expect(last.out.startsWith(s.out), key + " the output only grows").toBe(true);
      }
      checked++;
    }
    expect(checked).toBe(22);
    expect(Object.keys(runs).sort()).toEqual(Object.entries(traces).flatMap(([m, l]) => l.map(t => `${m}/g${String(t.walkthrough).padStart(2, "0")}`)).sort());
    for (const { chapter, page, block } of await tracers()) {
      const cfg = block.config as { code: string; stdin?: string; steps: unknown };
      const i = guided[chapter].findIndex(w => w.program === cfg.code);
      expect(i, page + " the tracer shows one of the chapter's walkthrough programs").toBeGreaterThanOrEqual(0);
      const key = `${chapter}/g${String(i + 1).padStart(2, "0")}`;
      expect(cfg.steps, page + " the tracer's steps are that walkthrough's recorded run").toEqual(runs[key].steps);
      expect(cfg.stdin, page).toBe(guided[chapter][i].stdin);
      expect(readTraceConfig(block.config), page + " the tracer reads its config").not.toBeNull();
    }
  }, 30000);

  it("the nine views are all there: memory, expressions, loops, call stack, strings, arrays, a matrix, objects, output", () => {
    const steps = Object.values(runs).flatMap(r => r.steps);
    const values = steps.flatMap(s => [...s.frames.flatMap(f => f.vars.map(v => v[1])), ...s.eval.map(e => e[1])]);
    expect(steps.some(s => s.frames[0].vars.length >= 2), "memory boxes").toBe(true);
    expect(steps.some(s => s.eval.length > 0), "evaluated expressions").toBe(true);
    expect(Object.values(runs).some(r => new Set(r.steps.map(s => s.line)).size < r.steps.length - 4), "a loop (the same lines again)").toBe(true);
    expect(steps.some(s => s.frames.length >= 3), "a call stack three deep").toBe(true);
    expect(values.some(v => v.t === "str" && (v.s ?? "").length > 1), "a string as letters").toBe(true);
    expect(values.some(v => v.t === "arr" && (v.items ?? []).every(i => i.t === "v")), "an array").toBe(true);
    expect(values.some(v => v.t === "mat"), "a matrix").toBe(true);
    expect(steps.some(s => s.heap.length >= 2) && values.some(v => v.t === "arr" && (v.items ?? []).some(i => i.t === "null")), "objects and references").toBe(true);
    expect(steps.some(s => s.out.length > 0), "the output").toBe(true);
  });
});
