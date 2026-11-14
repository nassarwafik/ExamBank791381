// DS-A2 — every program of the course «مبنى المعطيات» is PROVEN, never trusted (docs/enterprise-data-structures-course.md §4):
//   • the real C# compiler: scripts/ds-course/proofs.json holds what `dotnet` printed for every program (prove-dotnet.mjs compiles
//     each one with the book's classes, unit4/Unit4.cs). Each program of the course has a record under its id — a hash of its shown
//     code, hidden helpers, hidden driver and input — so a program that changed has no record until it is proven again;
//   • the course interpreter (cs-lite.mjs), which records the traces, printed EXACTLY what C# printed, and ended in a run-time error
//     exactly when C# did;
//   • a trace's recorded steps are that very run: the same number of steps, lines inside the shown program, the output growing
//     to the program's output;
//   • an exercise proven with a program states that program's real output: a short answer equals it, a multiple-choice key
//     contains it; «how many times does this statement run» equals the number of trace steps on that statement.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { buildCourse } from "../build-ds-course.mjs";
// @ts-expect-error — plain ESM authoring tools, untyped on purpose.
import { execute, bare } from "./dsl.mjs";
import { readDsTrace } from "../../src/learning/activities/ds";

type Prog = { id: string; code: string; lib: string | null; driver: string | null; stdin: string; shownLines: number; allowError: boolean };
type Run = { out: string; error: string | null; steps: { line: number; out: string }[] };
type Raw = { unit: number; pageId: string; block: Record<string, unknown> & { id: string; type: string; _prog?: Prog; _out?: string; _prove?: { type: "output" | "count"; prog: Prog; out?: string; loose?: boolean; line?: string; count?: number } } };
const { raw } = buildCourse() as { raw: Raw[] };
const proofs = JSON.parse(readFileSync(fileURLToPath(new URL("./proofs.json", import.meta.url)), "utf8")) as { compiler: string; programs: Record<string, { out: string; error?: string }> };
const run = (p: Prog) => execute(p, 2000) as Run;
const head = (p: Prog) => p.code.split("\n")[0];

const traces = raw.filter(r => r.block._prog);
const proven = raw.filter(r => r.block._prove);
const programs = new Map<string, Prog>();
for (const r of raw) for (const p of [r.block._prog, r.block._prove?.prog]) if (p) programs.set(p.id, p);

describe("the real C# compiler agrees with the course interpreter on every program", () => {
  it("the record names its compiler, and holds exactly the course's programs (none missing, none stale)", () => {
    expect(proofs.compiler).toMatch(/^dotnet \d+\.\d+/);
    expect(Object.keys(proofs.programs).sort()).toEqual([...programs.keys()].sort());
    expect(programs.size).toBeGreaterThan(20);
  });
  for (const p of programs.values()) {
    it(p.id + " — " + head(p), () => {
      const real = proofs.programs[p.id];
      expect(real, "no real-compiler record: run npm run prove:ds-course").toBeTruthy();
      const mine = run(p);
      expect(mine.out).toBe(real.out);
      expect(!!mine.error, "ends in a run-time error: " + (mine.error ?? real.error)).toBe(!!real.error);
      if (!p.allowError) expect(real.error ?? null).toBeNull();
    });
  }
});

describe("every trace is the recorded run of its program", () => {
  it("there are traces to prove", () => { expect(traces.length).toBeGreaterThan(15); });
  for (const r of traces) {
    it(r.block.id + " — «" + bare(String(r.block.title)) + "»", () => {
      const p = r.block._prog!;
      const cfg = r.block.config as { code: string; out: string; steps: unknown[] };
      const read = readDsTrace(cfg)!;
      expect(read, "the activity can read the trace").not.toBeNull();
      expect(cfg.code).toBe(p.code);
      const again = run(p);
      const shown = again.steps;
      expect(read.steps.length).toBe(shown.length);
      expect(read.steps.map(s => s.line)).toEqual(shown.map(s => s.line));
      expect(read.steps.every(s => s.line >= 0 && s.line <= p.shownLines)).toBe(true);
      expect(read.steps.at(-1)!.out).toBe(again.out);
      expect(cfg.out).toBe(proofs.programs[p.id]?.out);
    });
  }
});

describe("every exercise proven with a program states that program's real output", () => {
  for (const r of proven) {
    const pr = r.block._prove!;
    it(r.block.id + " — " + pr.type, () => {
      const res = run(pr.prog);
      const q = r.block.question as { kind: string; answer?: unknown; options?: { text: string; correct?: boolean }[] };
      if (pr.type === "count") {
        const lines = pr.prog.code.split("\n");
        expect(lines.some(l => l.trim() === pr.line), "the statement is a line of the shown program").toBe(true);
        expect(res.steps.filter(s => s.line > 0 && lines[s.line - 1].trim() === pr.line).length).toBe(pr.count);
        if (q.kind === "shortInput") expect(q.answer).toBe(String(pr.count));
        return;
      }
      expect(res.out).toBe(pr.out);
      expect(proofs.programs[pr.prog.id]?.out).toBe(pr.out);
      const out = pr.out!.trim();
      if (q.kind === "shortInput") expect(q.answer).toBe(out);
      if (q.kind === "multipleChoice" && !pr.loose) {
        const key = bare(q.options!.find(o => o.correct)!.text);
        expect(key.includes(out) || out.includes(key), "the correct option «" + key + "» is the program's output «" + out + "»").toBe(true);
        for (const o of q.options!.filter(x => !x.correct)) expect(bare(o.text) === out, "a wrong option equals the real output: " + o.text).toBe(false);
      }
    });
  }
});
