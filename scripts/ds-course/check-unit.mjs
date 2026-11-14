#!/usr/bin/env node
// DS-A2 — checks ONE authored unit while it is being written:  node scripts/ds-course/check-unit.mjs 5
// It builds the unit alone (so every TRACE is recorded and every figure / lab config is produced), compiles and runs the unit's
// programs with the real C# compiler and compares each output with the course interpreter's, then prints a summary. It writes
// nothing into the repository (the course's proofs.json is written by prove-dotnet.mjs for the whole course).
import { buildCourse } from "../build-ds-course.mjs";
import { coursePrograms, runWithDotnet } from "./prove-dotnet.mjs";
import { execute } from "./dsl.mjs";

const n = String(process.argv[2] ?? "").padStart(2, "0");
const unit = (await import("./u" + n + ".mjs")).default;
const { modules, raw } = buildCourse([unit]);
const pages = modules[0].lessons.flatMap(l => l.pages);
const count = {};
for (const r of raw) { const k = r.block.type === "simulation" ? r.block.simulationType : r.block.type === "interactive-diagram" ? "ds-figure" : r.block.guidedType === "ds-solution" ? "ds-solution" : r.block.type; count[k] = (count[k] ?? 0) + 1; }
console.log("unit " + unit.n + " «" + unit.title + "»: " + modules[0].lessons.length + " lessons, " + pages.length + " pages, " + raw.length + " blocks");
console.log(Object.entries(count).map(([k, v]) => k + " " + v).join(" · "));
for (const r of raw.filter(x => x.block.simulationType === "ds-trace")) console.log("  trace " + r.block.id + " «" + r.block.title + "»: " + r.block.config.steps.length + " steps, " + JSON.stringify(r.block.config).length + " bytes" + (r.block._error ? " — ends with a run-time error: " + r.block._error : ""));
for (const r of raw.filter(x => x.block.guidedType === "ds-solution")) console.log("  solution " + r.block.id + " «" + r.block.title + "»" + (r.block.config.trace ? ": trace of " + r.block.config.trace.steps.length + " steps" : r.block.config.code ? ": code proven by a run" : ""));
let bad = 0;
// every exercise proof on the interpreter
for (const r of raw.filter(x => x.block._prove)) {
  const p = r.block._prove, res = execute(p.prog, 2000);
  if (p.type === "output" && res.out !== p.out) { bad++; console.log("  ✗ " + r.block.id + ": the exercise says the output is " + JSON.stringify(p.out) + " but the program prints " + JSON.stringify(res.out)); }
  if (p.type === "count") { const lines = p.prog.code.split("\n"); const c = res.steps.filter(s => s.line > 0 && lines[s.line - 1].trim() === p.line).length; if (c !== p.count) { bad++; console.log("  ✗ " + r.block.id + ": the statement runs " + c + " time(s), the exercise says " + p.count); } }
}
const programs = coursePrograms([unit]);
const real = runWithDotnet(programs).programs;
for (const prog of programs) {
  const mine = execute(prog, 2000), theirs = real[prog.id];
  if (!theirs || theirs.out !== mine.out || !!theirs.error !== !!mine.error) { bad++; console.log("  ✗ real C# and the interpreter disagree on the program starting «" + prog.code.split("\n")[0] + "»:\n      C#: " + JSON.stringify(theirs) + "\n      interpreter: " + JSON.stringify({ out: mine.out, error: mine.error })); }
}
console.log(programs.length + " programs compiled and run by real C#; " + (bad ? bad + " PROBLEM(S)" : "all agree with the interpreter and the exercise keys"));
process.exit(bad ? 1 : 0);
