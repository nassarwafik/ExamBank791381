#!/usr/bin/env node
// 899371 P6 (docs/enterprise-899371-learning-plan.md §19) — records the step-by-step TRACES the Reader's C# tracer shows
// (simulation / csharp-trace / v1) by RUNNING the programs, so no box, arrow or printed line rests on the author's reading of C#:
//   node scripts/trace-899371.mjs        → src/learning/content/899371/traces/runs.json   (needs Docker + the SDK image)
//
// An instrumented copy of a walkthrough program (traces/mNN.json) adds recorder lines only:
//   • a line whose code starts with `Tr.` (Tr.Begin(), Tr.S("note", "x", x, …), Tr.Enter("F"), Tr.Leave(), Tr.End(), Tr.At(n, …));
//   • a brace line ending with `//~` (only to give a one-statement loop / if body room for a recorder line).
// Removing them must give back EXACTLY the program the page shows (displayProgram; traces.p6.test.ts re-checks it). Each
// `Tr.S(` records the state after the display line just before it (`Tr.At(n, ` names the display line itself, e.g. a loop header);
// the recorder (scripts/lib/csharp-trace-helper.cs) captures the program's own output separately, and the run must print exactly
// what the clean program printed in its own proven run (guided/proofs.json). Exit 0 when every trace agrees, 1 otherwise.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";
import { wrapProgram } from "./prove-899371-practice.mjs";
import { readGuided, GUIDED_DIR } from "./convert-899371.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const TRACES_DIR = join(ROOT, "src", "learning", "content", "899371", "traces");
const HELPER = readFileSync(join(ROOT, "scripts", "lib", "csharp-trace-helper.cs"), "utf8");
export const MAX_STEPS = 120;

const isRecorder = line => /^\s*Tr\./.test(line) || /\/\/~\s*$/.test(line);
/** The program the page shows: the instrumented copy without its recorder lines. */
export const displayProgram = instrumented => instrumented.split("\n").filter(l => !isRecorder(l)).join("\n");
/** The instrumented copy with every recorder call numbered by its display line (Tr.S → Tr.SL(line, …); Tr.At(n, → Tr.SL(n, ). */
export function numberRecorders(instrumented) {
  let line = 0;
  return instrumented.split("\n").map(l => {
    if (!isRecorder(l)) { line++; return l; }
    return l.replace(/\bTr\.S\(/, `Tr.SL(${line}, `).replace(/\bTr\.At\((\d+),\s*/, "Tr.SL($1, ");
  }).join("\n");
}
/** The full C# source run for a trace: the numbered program (wrapped like any walkthrough) + the recorder. */
export function traceSource(instrumented) {
  const usings = HELPER.split("\n").filter(l => /^using /.test(l)).join("\n");
  const body = HELPER.split("\n").filter(l => !/^using /.test(l)).join("\n");
  return usings + "\n" + wrapProgram(numberRecorders(instrumented)) + "\n" + body;
}
export const traceSha = (source, stdin) => createHash("sha256").update(source + "\u0000" + (stdin ?? "")).digest("hex");
export function readTraces(dir = TRACES_DIR) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir).filter(f => /^m\d\d\.json$/.test(f)).sort()) {
    const file = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (file.module !== f.slice(0, 3)) throw new Error(f + ": module " + file.module);
    out[file.module] = file.traces;
  }
  return out;
}

function main() {
  const env = csharpEnvironment();
  const guided = readGuided();
  const proofs = JSON.parse(readFileSync(join(GUIDED_DIR, "proofs.json"), "utf8")).proofs;
  const runs = {};
  let bad = 0;
  for (const [mid, traces] of Object.entries(readTraces())) {
    for (const t of traces) {
      const key = `${mid}/g${String(t.walkthrough).padStart(2, "0")}`;
      const w = guided[mid][t.walkthrough - 1];
      const problems = [];
      if (displayProgram(t.program) !== w.program) problems.push("the instrumented copy does not strip to the page's program");
      const source = traceSource(t.program);
      const { compile, observed } = executeCSharp(source, [w.stdin ?? ""], env);
      const o = observed[0] ?? { exitCode: null, stdout: "", stderr: "" };
      const at = o.stdout.indexOf("\n\u0001TRACE\n");
      if (compile.exitCode !== 0) problems.push("does not compile: " + compile.output.slice(0, 300));
      else if (o.exitCode !== 0 || at < 0) problems.push(`run failed (exit ${o.exitCode}): ${o.stderr.slice(0, 200)}`);
      let steps = [];
      if (!problems.length) {
        steps = JSON.parse(o.stdout.slice(at + 8));
        const out = o.stdout.slice(0, at);
        if (out !== proofs[key]?.stdout) problems.push("the traced run prints other than the proven run of the clean program");
        if (steps.length < 2 || steps.length > MAX_STEPS) problems.push(`${steps.length} steps`);
        const lines = w.program.split("\n").length;
        if (steps.some(s => s.line < 1 || s.line > lines)) problems.push("a step points outside the program");
      }
      runs[key] = { sha: traceSha(source, w.stdin), steps };
      if (problems.length) { bad++; console.log(`✗ ${key}: ${problems.join("; ")}`); }
      else console.log(`✓ ${key}  ${steps.length} steps`);
    }
  }
  writeFileSync(join(TRACES_DIR, "runs.json"), JSON.stringify({ worker: "csharp@1", image: env.image, runs }, null, 1) + "\n");
  console.log(`${Object.keys(runs).length} traces, ${bad} disagree`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
