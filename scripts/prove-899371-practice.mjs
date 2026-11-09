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
// Exit code: 0 when every key agrees with its run, 1 otherwise, 2 on an environment error.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";
import { readPractice, PRACTICE_DIR } from "./convert-899371.mjs";

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

function main() {
  let env;
  try { env = csharpEnvironment(); } catch (e) { console.error("environment: " + e.message); process.exit(2); }
  const practice = readPractice();
  const proofs = {};
  let bad = 0, runs = 0;
  for (const [mid, items] of Object.entries(practice)) {
    items.forEach((item, i) => {
      if (!item.program) return;
      const key = `${mid}/q${String(i + 1).padStart(2, "0")}`;
      const program = wrapProgram(item.program);
      const { compile, observed } = executeCSharp(program, [item.stdin ?? ""], env);
      const o = observed[0] ?? { exitCode: null, stdout: "", stderr: "" };
      proofs[key] = { sha: proofSha(program, item.stdin), ...(item.stdin !== undefined ? { stdin: item.stdin } : {}), compileExit: compile.exitCode,
        ...(compile.exitCode !== 0 ? { compileOutput: compile.output.slice(0, 400) } : {}), exitCode: o.exitCode, stdout: o.stdout, exception: exceptionOf(o.stderr) };
      runs++;
      const problems = judgeItem(item, proofs[key]);
      if (problems.length) { bad++; console.log(`✗ ${key}: ${problems.join("; ")}`); } else console.log(`✓ ${key}  «${outputLine(o.stdout) || proofs[key].exception}»`);
    });
  }
  writeFileSync(join(PRACTICE_DIR, "proofs.json"), JSON.stringify({ worker: "csharp@1", image: env.image, proofs }, null, 1) + "\n");
  console.log(`${runs} programs run, ${bad} key(s) disagree`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
