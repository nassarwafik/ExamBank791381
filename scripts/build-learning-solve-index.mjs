#!/usr/bin/env node
// 899371 enrichment P14 (docs/enterprise-899371-enrichment-plan.md §11) — the SERVER's «حلّ وافحص» index: every authored question
// (scripts/lib/solve-899371.mjs) joined to its proven run (scripts/learning-solve-899371/runs.json, scripts/prove-899371-solve.mjs) and
// to its place in the served course (the P10 work list: its page; the starter block the converter adds after the question):
//   node scripts/build-learning-solve-index.mjs     → api/src/data/learning-solve/899371.json   (server-only; never served whole)
// Per question: what the editor may show (`node`: the coding question's PUBLIC projection — starter or locked template, the public
// example with the reference's own output, the limits), what only the server reads (`hidden`: inputs and expected outputs; the
// `reference` program and its `explanation` — the solution card, behind D1), and whether it is checked automatically. A question whose
// program or inputs changed since it was proven is refused: prove it again. Deterministic; no network, no Docker.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { programOf, runSha, LIMITS } from "./build-899371-coding-lab.mjs";
import { readSolve, STARTER } from "./lib/solve-899371.mjs";
import { RUNS_FILE, judgeSolve } from "./prove-899371-solve.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CID = "899371";
export const INDEX_FILE = join(ROOT, "api", "src", "data", "learning-solve", CID + ".json");
const WORKLIST = join(ROOT, "docs", "enterprise-899371-learning", "analysis", "enrichment-worklist.json");

/** The id of the starter block the converter adds after a question (its page's short id + the question number). */
export const solveBlockId = (pageId, number) => pageId.slice(CID.length + 1) + "-solve-q" + number;

/** The index object (pure over the authored questions, their proven runs and the work list). Throws on anything inconsistent. */
export function buildSolveIndex(all = readSolve(), runs = JSON.parse(readFileSync(RUNS_FILE, "utf8")).runs, worklist = JSON.parse(readFileSync(WORKLIST, "utf8"))) {
  const solve = new Map(worklist.questions.filter(q => q.solve).map(q => [q.id, q]));
  const seen = new Set(), questions = {};
  for (const q of all) {
    const w = solve.get(q.book);
    if (!w) throw new Error(q.book + ": not a writing question of the work list");
    if (seen.has(q.book)) throw new Error(q.book + ": authored twice");
    seen.add(q.book);
    if (q.check !== (w.solve === "check" || w.solve === "check-small-n")) throw new Error(q.book + ": check is " + q.check + " but the work list says " + w.solve);
    const run = runs[q.book];
    const program = programOf(q, "reference");
    if (!run || run.sha !== runSha(program, [...q.public, ...q.hidden])) throw new Error(q.book + ": the program or its inputs changed since it was proven — run scripts/prove-899371-solve.mjs");
    const problems = judgeSolve(q, run);
    if (problems.length) throw new Error(q.book + ": " + problems.join("; "));
    questions[q.book] = {
      moduleId: CID + "-" + q.module, pageId: w.pageId, blockId: solveBlockId(w.pageId, w.number), number: w.number, check: q.check,
      version: q.version, ...(q.title ? { title: q.title } : {}), ...(q.text ? { text: q.text } : {}),
      node: {
        allowedLanguages: ["csharp"], defaultLanguage: "csharp", starterCode: q.version === 3 ? {} : { csharp: STARTER },
        taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { ...LIMITS },
        publicTests: q.public.map((input, k) => ({ id: "p" + (k + 1), title: "المثال", input, sampleOutput: run.public[k] })),
        ...(q.version === 3 ? { template: { language: "csharp", segments: q.template } } : {}),
      },
      hidden: q.hidden.map((input, k) => ({ input, expected: run.hidden[k] })),
      reference: program, explanation: q.explanation,
    };
  }
  const missing = [...solve.keys()].filter(id => !seen.has(id));
  if (missing.length) throw new Error("writing questions with no authored question: " + missing.join(", "));
  return { schemaVersion: 1, courseId: CID, questions: Object.fromEntries(Object.keys(questions).sort().map(k => [k, questions[k]])) };
}

function main() {
  const index = buildSolveIndex();
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  const text = JSON.stringify(index) + "\n";
  writeFileSync(INDEX_FILE, text);
  const qs = Object.values(index.questions);
  console.log(`wrote ${INDEX_FILE}: ${qs.length} questions (${qs.filter(q => q.check).length} checked, ${qs.filter(q => !q.check).length} run-only), ${Math.round(text.length / 1024)} KB`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
