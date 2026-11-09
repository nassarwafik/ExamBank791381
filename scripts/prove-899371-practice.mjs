#!/usr/bin/env node
// 899371 P4 (docs/enterprise-899371-learning-plan.md §16) — proves the key of every PROGRAM exercise of «تدريبات الوحدة» by running
// the program, so no answer key rests on the author's reading of C#:
//   node scripts/prove-899371-practice.mjs     → src/learning/content/899371/practice/proofs.json   (needs Docker + the SDK image)
//
// Each exercise with a `program` is compiled and run once (with its `stdin`) by the same compiler settings as the csharp@1 worker
// (scripts/run-csharp-probes.mjs executeCSharp: no network, no capabilities, read-only, the worker's own argv and environment).
// A program printed as statements is wrapped in `static void Main()` of a class `Program`; one that prints its own `Main` in a
// class `Program`; one that declares its classes is run as printed. The observed exit code, stdout and exception are recorded with
// the sha256 of exactly what was run, and judged against the key (judgeItem). The test practice.p4.test.ts re-judges every key
// against the committed proofs and checks each proof still belongs to the program the course shows, without needing Docker.
// P5 (§17): the same for the walkthroughs «نحلّ معًا» (guided/mNN.json → guided/proofs.json): a walkthrough's `output` (its printed
// result, lines joined by « | ») or its `runtimeError` must be what the run gives, and its revealed result must say it (judgeGuided).
// Decisions §18: the inputs a teacher clarification adds to a book trace question (F9) are run through the BOOK's own program: it must
// end normally with them, and must NOT end without the last one (so every input is read) → clarifications.proofs.json. The output
// is recorded for the teacher's record only; the course never shows it (Q3).
//   node scripts/prove-899371-practice.mjs [--only practice|guided|clarify]
// Exit code: 0 when every key agrees with its run, 1 otherwise, 2 on an environment error.
import { writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";
import { readPractice, PRACTICE_DIR, readGuided, GUIDED_DIR, readClarifications, CLARIFICATIONS_FILE, convert, SOURCE_FILE } from "./convert-899371.mjs";
import { readDocxBody } from "./lib/docx-source.mjs";

/** The compilable program for an exercise's printed code. */
export function wrapProgram(code) {
  if (/\bclass\s+\w+/.test(code)) return code;
  const indent = s => s.split("\n").map(l => (l ? "    " + l : l)).join("\n");
  if (/\bstatic\s+[\w<>[\]]+\s+Main\s*\(/.test(code)) return "public class Program\n{\n" + indent(code) + "\n}\n";
  return "public class Program\n{\n    static void Main()\n    {\n" + indent(indent(code)) + "\n    }\n}\n";
}
/** What a proof is bound to: the exact program run and its input. */
export const proofSha = (program, stdin) => createHash("sha256").update(program + "\u0000" + (stdin ?? "")).digest("hex");
const norm = s => String(s).replace(/\s+/g, " ").trim();
/** The printed output as one line: the lines joined by « | » (how a multi-line output is written in an option). */
export const outputLine = stdout => stdout.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map(l => l.trimEnd()).join(" | ").trim();
/** The exception type of an unhandled exception in stderr (System.X → X), or null. */
export const exceptionOf = stderr => { const m = /Unhandled exception\.\s+(?:System\.)?([\w.]+)/.exec(stderr || ""); return m ? m[1] : null; };

/** Judges one exercise's key against its proof → list of problems (empty when the key is right). */
export function judgeItem(item, proof) {
  const q = item.question, problems = [];
  if (!proof) return ["no proof"];
  if (proof.sha !== proofSha(wrapProgram(item.program), item.stdin)) problems.push("the proof is for another program / input");
  if (proof.compileExit !== 0) return [...problems, "does not compile: " + proof.compileOutput];
  const out = outputLine(proof.stdout);
  if (item.prove === "runtime") {
    if (proof.exitCode === 0) problems.push("ran without an error");
    if (proof.exception !== item.runtimeError) problems.push(`exception ${proof.exception} ≠ ${item.runtimeError}`);
    const right = q.options.filter(o => o.correct);
    if (right.length !== 1 || !/^خطأ تنفيذ/.test(right[0].text)) problems.push("the right option is not the run-time error");
    if (!q.feedback.explanation.includes(item.runtimeError)) problems.push("the explanation does not name the exception");
    return problems;
  }
  if (proof.exitCode !== 0) return [...problems, `exit ${proof.exitCode}: ${proof.exception}`];
  if (item.prove === "output" && q.kind === "multipleChoice") {
    const hits = q.options.filter(o => norm(o.text) === norm(out));
    if (hits.length !== 1 || !hits[0].correct) problems.push(`output «${out}» is not exactly the right option`);
  } else if (item.prove === "output" && q.kind === "shortInput") {
    if (norm(q.answer) !== norm(out.split(" | ").join(" "))) problems.push(`output «${out}» ≠ answer «${q.answer}»`);
  } else if (item.prove === "claim" && q.kind === "trueFalse") {
    if (q.answer !== (norm(out) === norm(item.claimOutput))) problems.push(`output «${out}», claim «${item.claimOutput}», answer ${q.answer}`);
  } else problems.push(`unknown proof ${item.prove} for ${q.kind}`);
  return problems;
}

/** Judges one walkthrough's stated result against its proof → list of problems (empty when the walkthrough is right). */
export function judgeGuided(w, proof) {
  if (!proof) return ["no proof"];
  const problems = [];
  if (proof.sha !== proofSha(wrapProgram(w.program), w.stdin)) problems.push("the proof is for another program / input");
  if (proof.compileExit !== 0) return [...problems, "does not compile: " + proof.compileOutput];
  const shown = norm(w.result.replace(/`/g, ""));
  const spans = [...w.result.matchAll(/`([^`]+)`/g)].map(m => norm(m[1]));   // what the result shows as program text, in order
  if (w.runtimeError !== undefined) {
    if (proof.exitCode === 0) problems.push("ran without an error");
    if (proof.exception !== w.runtimeError) problems.push(`exception ${proof.exception} ≠ ${w.runtimeError}`);
    if (!shown.includes(w.runtimeError) || !spans.includes(w.runtimeError)) problems.push("the result does not name the exception");
    return problems;
  }
  if (proof.exitCode !== 0) return [...problems, `exit ${proof.exitCode}: ${proof.exception}`];
  const out = outputLine(proof.stdout);
  if (norm(out) !== norm(w.output)) problems.push(`printed «${out}» ≠ stated output «${w.output}»`);
  if (JSON.stringify(spans) !== JSON.stringify(out.split(" | ").map(norm))) problems.push(`the result shows ${JSON.stringify(spans)}, not the printed lines`);
  return problems;
}

/** The stdin of a clarification's inputs (written left to right, one value per line) and the same without its last value. */
export const clarificationStdins = inputs => { const v = inputs.trim().split(/\s+/); return [v.join("\n"), v.slice(0, -1).join("\n")]; };
/** Judges a clarification's proof: the book program, these inputs, a normal end — and no normal end without the last input. */
export function judgeClarification(c, program, proof) {
  if (!proof) return ["no proof"];
  const problems = [];
  if (proof.sha !== proofSha(wrapProgram(program), clarificationStdins(c.inputs)[0])) problems.push("the proof is for another program / inputs");
  if (proof.compileExit !== 0) return [...problems, "does not compile"];
  if (proof.exitCode !== 0 || proof.exception) problems.push(`does not end normally with these inputs (${proof.exception})`);
  if (!proof.stdout.trim()) problems.push("prints nothing");
  if (proof.withoutLastExitCode === 0) problems.push("ends without the last input (an input is never read)");
  return problems;
}

/** Runs one program and records its proof. */
function prove(env, program, stdin) {
  const wrapped = wrapProgram(program);
  const { compile, observed } = executeCSharp(wrapped, [stdin ?? ""], env);
  const o = observed[0] ?? { exitCode: null, stdout: "", stderr: "" };
  return { sha: proofSha(wrapped, stdin), ...(stdin !== undefined ? { stdin } : {}), compileExit: compile.exitCode,
    ...(compile.exitCode !== 0 ? { compileOutput: compile.output.slice(0, 400) } : {}), exitCode: o.exitCode, stdout: o.stdout, exception: exceptionOf(o.stderr) };
}

function main() {
  let env;
  try { env = csharpEnvironment(); } catch (e) { console.error("environment: " + e.message); process.exit(2); }
  const only = (i => (i >= 0 ? process.argv[i + 1] : null))(process.argv.indexOf("--only"));
  let bad = 0, runs = 0;
  const report = (key, problems, proof) => { runs++; if (problems.length) { bad++; console.log(`✗ ${key}: ${problems.join("; ")}`); } else console.log(`✓ ${key}  «${outputLine(proof.stdout) || proof.exception}»`); };
  const sets = [
    ["practice", PRACTICE_DIR, readPractice(), "q", judgeItem],
    ["guided", GUIDED_DIR, readGuided(), "g", judgeGuided],
  ];
  for (const [name, dir, files, letter, judge] of sets) {
    if (only && only !== name) continue;
    const proofs = {};
    for (const [mid, items] of Object.entries(files)) items.forEach((item, i) => {
      if (!item.program) return;
      const key = `${mid}/${letter}${String(i + 1).padStart(2, "0")}`;
      proofs[key] = prove(env, item.program, item.stdin);
      report(name + " " + key, judge(item, proofs[key]), proofs[key]);
    });
    writeFileSync(join(dir, "proofs.json"), JSON.stringify({ worker: "csharp@1", image: env.image, proofs }, null, 1) + "\n");
  }
  if (!only || only === "clarify") {
    const blocks = convert(readDocxBody(readFileSync(SOURCE_FILE))).modules.flatMap(m => m.lessons.flatMap(l => l.pages.flatMap(p => p.blocks)));
    const proofs = {};
    for (const c of readClarifications().filter(c => c.inputs !== undefined)) {
      const program = blocks.find(b => b.id === c.program && b.type === "code" && b.origin === "book")?.code;
      if (!program) { bad++; console.log(`✗ clarify ${c.after}: no book program ${c.program}`); continue; }
      const [all, withoutLast] = clarificationStdins(c.inputs);
      const wrapped = wrapProgram(program);
      const { compile, observed } = executeCSharp(wrapped, [all, withoutLast], env);
      const [o, w] = [observed[0] ?? { exitCode: null, stdout: "", stderr: "" }, observed[1] ?? { exitCode: null, stderr: "" }];
      proofs[c.after] = { sha: proofSha(wrapped, all), inputs: c.inputs, compileExit: compile.exitCode, exitCode: o.exitCode, stdout: o.stdout, exception: exceptionOf(o.stderr),
        withoutLastExitCode: w.exitCode, withoutLastException: exceptionOf(w.stderr) };
      report("clarify " + c.after, judgeClarification(c, program, proofs[c.after]), proofs[c.after]);
    }
    writeFileSync(CLARIFICATIONS_FILE.replace(/\.json$/, ".proofs.json"), JSON.stringify({ worker: "csharp@1", image: env.image, proofs }, null, 1) + "\n");
  }
  console.log(`${runs} programs run, ${bad} disagree`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
