#!/usr/bin/env node
// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — proves «حلّ وافحص» by RUNNING it: for every question of
// scripts/learning-solve-899371 (scripts/lib/solve-899371.mjs), in the csharp@1 worker image with its compiler settings:
//   • the REFERENCE compiles and ends normally on every public and hidden input; its outputs ARE the expected outputs (never hand-written);
//   • for a checked question, the KNOWN-WRONG solution compiles and FAILS at least one hidden input under the comparator
//     (normalizeWhitespace) — the check can tell a wrong program from a right one;
//   • every run is bound to the sha256 of the exact program and inputs.
//   node scripts/prove-899371-solve.mjs [book …]   → scripts/learning-solve-899371/runs.json   (Docker + the SDK image)
// Exit 0 when every question passes, 1 otherwise.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";
import { programOf, runSha, COMPARATOR } from "./build-899371-coding-lab.mjs";
import { readSolve, SOLVE_DIR } from "./lib/solve-899371.mjs";

const require = createRequire(import.meta.url);
const { compareOutput } = require("../api/src/lib/shared-finalization/codingContract.js");
export const RUNS_FILE = join(SOLVE_DIR, "runs.json");

/** What is wrong with one question's recorded run (empty when it passes). Pure. */
export function judgeSolve(q, run) {
  const problems = [];
  if (!run) return ["no run"];
  if (run.compileExit !== 0) return ["the reference does not compile"];
  if (run.exitCodes.some(c => c !== 0)) problems.push("the reference does not end normally on every input");
  if (run.public.length !== q.public.length || run.hidden.length !== q.hidden.length) problems.push("the run is not for these inputs");
  if (q.check) {
    if (!run.wrong || run.wrong.compileExit !== 0) problems.push("the known-wrong solution must compile");
    else if (!run.wrong.fails.some(Boolean)) problems.push("the known-wrong solution passes every hidden input");
    if (new Set(q.hidden).size !== q.hidden.length) problems.push("two hidden inputs are the same");
  }
  return problems;
}

function main() {
  const only = new Set(process.argv.slice(2));
  const env = csharpEnvironment();
  const all = readSolve();
  const prior = existsSync(RUNS_FILE) ? JSON.parse(readFileSync(RUNS_FILE, "utf8")).runs : {};
  const runs = only.size ? { ...prior } : {};
  let bad = 0;
  for (const q of all) {
    if (only.size && !only.has(q.book)) continue;
    const inputs = [...q.public, ...q.hidden];
    const program = programOf(q, "reference");
    const r = executeCSharp(program, inputs, env);
    const run = { sha: runSha(program, inputs), compileExit: r.compile.exitCode, exitCodes: r.observed.map(o => o.exitCode),
      public: r.observed.slice(0, q.public.length).map(o => o.stdout), hidden: r.observed.slice(q.public.length).map(o => o.stdout) };
    if (q.check && r.compile.exitCode === 0) {
      const wrong = programOf(q, "wrong");
      const w = executeCSharp(wrong, q.hidden, env);
      run.wrong = { sha: runSha(wrong, q.hidden), compileExit: w.compile.exitCode,
        fails: w.compile.exitCode !== 0 ? [] : w.observed.map((o, k) => o.exitCode !== 0 || !compareOutput(o.stdout, run.hidden[k], COMPARATOR)) };
    }
    const problems = judgeSolve(q, run);
    if (problems.length) bad++;
    runs[q.book] = run;
    console.log((problems.length ? "  ✗ " : "  ✓ ") + q.book + (problems.length ? ": " + problems.join("; ") : q.check ? ` (${q.hidden.length} hidden, wrong fails ${run.wrong.fails.filter(Boolean).length})` : " (run only)"));
  }
  const live = new Set(all.map(q => q.book));
  for (const k of Object.keys(runs)) if (!live.has(k)) delete runs[k];
  writeFileSync(RUNS_FILE, JSON.stringify({ schemaVersion: 1, comparator: COMPARATOR, runs: Object.fromEntries(Object.keys(runs).sort().map(k => [k, runs[k]])) }, null, 1) + "\n");
  console.log(`\n${all.length - bad}/${all.length} questions proven`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
