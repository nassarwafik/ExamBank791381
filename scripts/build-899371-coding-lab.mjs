#!/usr/bin/env node
// 899371 P7 (docs/enterprise-899371-learning-plan.md §20) — builds «مختبر البرمجة»: runner-graded C# questions based on the book's
// programming questions, one Exam Library item per chapter, which a teacher assigns as homework (the server freezes the item,
// hidden tests included, into the assignment; grading is the existing official coding pipeline).
//   node scripts/build-899371-coding-lab.mjs        (needs Docker + the SDK image of the csharp@1 worker)
//
// Source: scripts/coding-lab-899371/mNN.json (authored; never served). For every question:
//   • coding@2 (a program: starter shell, reference program) or coding@3 (locked template: the student fills the gaps; the reference
//     program is the template with the reference gap values);
//   • the REFERENCE runs on every public and hidden input with the csharp@1 compiler settings (run-csharp-probes.mjs executeCSharp):
//     its output IS the expected output (never hand-written); it must end normally on every input;
//   • a KNOWN-WRONG solution (compiles, plausible logic slip) runs on the hidden inputs and must FAIL at least one of them under the
//     question's comparator; it is never shipped (test evidence only);
//   • the question node passes the shared validator (validateQuestionTypeNode — the same code the API runs);
//   • gradingMode hiddenTests, compileErrorPolicy manualReview (a compile error goes to the teacher, never a zero), comparator
//     normalizeWhitespace, proportional scoring.
// Output: api/src/data/exam-library/items/CL899371-NN.json (+ their catalog entries; entries of other repositories are kept as they
// are) and scripts/coding-lab-899371/runs.json (every run, bound to the sha256 of the exact program and inputs).
// Exit 0 when every question passes, 1 otherwise, 2 on an environment error.
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const LAB_DIR = join(ROOT, "scripts", "coding-lab-899371");
export const LIBRARY_DIR = join(ROOT, "api", "src", "data", "exam-library");
export const REPOSITORY = "899371";
export const CATEGORY = "coding-899371";
const { validateQuestionTypeNode } = require("../api/src/lib/shared-finalization/questionTypeValidation.js");
const { reconstructTemplateSource } = require("../api/src/lib/shared-finalization/codingTemplate.js");
const { compareOutput } = require("../api/src/lib/shared-finalization/codingContract.js");

export const COMPARATOR = "normalizeWhitespace";
export const LIMITS = Object.freeze({ sourceBytes: 65536, outputBytes: 16384, timeMs: 2000, memoryMb: 128 });
export const MARKS = 10;
export const BUILT_AT = "2026-11-09T00:00:00.000Z";   // fixed: the build is deterministic (regenerating changes no byte)
const STARTER = "using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        \n    }\n}\n";
const CHAPTER_TITLES = { m01: "الطباعة والمتغيرات", m02: "العوامل والتعابير المنطقية", m03: "المكتبة الرياضية", m04: "جملة الشرط", m05: "جملة التكرار for", m06: "جملة التكرار while", m07: "العمليات", m08: "النصوص", m09: "المصفوفات", m10: "مصفوفة ثنائية الابعاد", m11: "الكائنات" };

export function readLab(dir = LAB_DIR) {
  const out = {};
  for (const f of readdirSync(dir).filter(f => /^m\d\d\.json$/.test(f)).sort()) {
    const file = JSON.parse(readFileSync(join(dir, f), "utf8"));
    if (file.module !== f.slice(0, 3)) throw new Error(f + ": module " + file.module);
    out[file.module] = file.questions;
  }
  return out;
}
export const itemId = mid => "CL899371-" + mid.slice(1);
export const questionId = (mid, i) => `${itemId(mid)}-Q${String(i + 1).padStart(2, "0")}`;
/** The program the reference / wrong solution really is (coding@3: the template with those gap values). */
export function programOf(q, which) {
  if (q.version === 3) return reconstructTemplateSource({ language: "csharp", segments: q.template }, which === "reference" ? q.referenceGaps : q.wrongGaps);
  return which === "reference" ? q.reference : q.wrong;
}
export const runSha = (program, inputs) => createHash("sha256").update(program + "\u0000" + JSON.stringify(inputs)).digest("hex");

/** The question node exactly as the library ships it (expected outputs from the reference runs). */
export function questionNode(mid, i, q, run) {
  const id = questionId(mid, i);
  const coding = {
    allowedLanguages: ["csharp"], defaultLanguage: "csharp", starterCode: q.version === 3 ? {} : { csharp: STARTER },
    taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { ...LIMITS },
    publicTests: q.public.map((input, k) => ({ id: "p" + (k + 1), input, sampleOutput: run.reference.public[k] })),
    ...(q.version === 3 ? { template: { language: "csharp", segments: q.template } } : {}),
  };
  return {
    examQuestionId: id, origin: "imported", sourceId: itemId(mid), sourceQuestionId: q.book, presentationType: "coding", questionTypeVersion: q.version,
    marks: MARKS, locked: false, text: q.title + "\n\n" + q.text, coding,
    answer: {
      gradingMode: "hiddenTests", comparator: COMPARATOR, scoringPolicy: "proportional", compileErrorPolicy: "manualReview",
      hiddenTests: q.hidden.map((input, k) => ({ id: "h" + (k + 1), input, expectedOutput: run.reference.hidden[k], weight: 1 })),
      referenceSolutions: { csharp: programOf(q, "reference") },
    },
  };
}
const contentHash = v => createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** One chapter's library item + its catalog entry. */
export function libraryItem(mid, nodes) {
  const id = itemId(mid);
  const title = "مختبر البرمجة — الفصل " + Number(mid.slice(1)) + ": " + CHAPTER_TITLES[mid];
  const examSnapshot = { schemaVersion: 1, examId: "LIB-" + id, title, questions: nodes, totalMarks: nodes.length * MARKS, status: "final", createdAt: BUILT_AT, updatedAt: BUILT_AT };
  const entry = {
    libraryItemId: id, title, category: CATEGORY,
    description: "أسئلة برمجة بلغة C# من وظائف الفصل " + Number(mid.slice(1)) + " في «أسس علم الحاسوب»، يصحّحها المشغّل بحالات اختبار مخفية؛ خطأ الترجمة يذهب لمراجعة المعلم.",
    tags: ["برمجة", "C#", "تصحيح آلي"], questionCount: nodes.length, totalMarks: nodes.length * MARKS, pageRange: "", parserFamily: "coding-lab-899371-v1",
    conversionStatus: "ready", publishable: true, autoGradableCount: nodes.length, manualReviewCount: 0, libraryVersion: 1,
    sourceSha: contentHash(readFileSync(join(LAB_DIR, mid + ".json"), "utf8")), contentHash: contentHash(examSnapshot), convertedAt: BUILT_AT,
    source: { repository: REPOSITORY, sourceFile: "scripts/coding-lab-899371/" + mid + ".json" },
  };
  return { entry, item: { ...entry, schemaVersion: 1, examSnapshot } };
}
/** Judges one question's runs → problems (empty when the reference is clean and the wrong solution fails somewhere). */
export function judgeQuestion(q, run) {
  const problems = [];
  if (!run) return ["no run"];
  if (run.reference.compileExit !== 0) return ["the reference does not compile: " + run.reference.compileOutput];
  if (run.reference.exitCodes.some(c => c !== 0)) problems.push("the reference does not end normally on every input");
  if (run.reference.hidden.some(o => !o.trim())) problems.push("the reference prints nothing for some input");
  if (run.wrong.compileExit !== 0) problems.push("the known-wrong solution must compile (a logic slip, not a syntax error)");
  else if (q.hidden.every((_, k) => compareOutput(run.wrong.hidden[k], run.reference.hidden[k], COMPARATOR))) problems.push("the known-wrong solution passes every hidden test");
  if (new Set(q.hidden).size !== q.hidden.length) problems.push("two hidden tests have the same input");
  return problems;
}

function run(env, program, inputs) {
  const { compile, observed } = executeCSharp(program, inputs, env);
  return { compileExit: compile.exitCode, ...(compile.exitCode !== 0 ? { compileOutput: compile.output.slice(0, 400) } : {}), exitCodes: observed.map(o => o.exitCode), outputs: observed.map(o => o.stdout) };
}

function main() {
  let env;
  try { env = csharpEnvironment(); } catch (e) { console.error("environment: " + e.message); process.exit(2); }
  const lab = readLab();
  const runs = {};
  let bad = 0;
  const built = [];
  for (const [mid, questions] of Object.entries(lab)) {
    const nodes = [];
    questions.forEach((q, i) => {
      const key = questionId(mid, i);
      const ref = programOf(q, "reference"), wrong = programOf(q, "wrong");
      const r = run(env, ref, [...q.public, ...q.hidden]);
      const w = run(env, wrong, q.hidden);
      const rec = {
        book: q.book, version: q.version, sha: runSha(ref, [q.public, q.hidden]), wrongSha: runSha(wrong, q.hidden),
        reference: { compileExit: r.compileExit, ...(r.compileOutput ? { compileOutput: r.compileOutput } : {}), exitCodes: r.exitCodes, public: r.outputs.slice(0, q.public.length), hidden: r.outputs.slice(q.public.length) },
        wrong: { compileExit: w.compileExit, exitCodes: w.exitCodes, hidden: w.outputs, failsHidden: q.hidden.map((_, k) => !compareOutput(w.outputs[k] ?? "", r.outputs[q.public.length + k] ?? "", COMPARATOR)) },
      };
      runs[key] = rec;
      const problems = judgeQuestion(q, rec);
      const node = problems.length ? null : questionNode(mid, i, q, rec);
      if (node) problems.push(...validateQuestionTypeNode(node, "coding", q.version).filter(x => x.severity === "error").map(x => x.code + " " + (x.message || "")));
      if (problems.length) { bad++; console.log(`✗ ${key} (${q.book}): ${problems.join("; ")}`); }
      else { nodes.push(node); console.log(`✓ ${key} (${q.book}, coding@${q.version})  wrong fails ${rec.wrong.failsHidden.filter(Boolean).length}/${q.hidden.length}`); }
    });
    if (nodes.length === questions.length) built.push(libraryItem(mid, nodes));
  }
  writeFileSync(join(LAB_DIR, "runs.json"), JSON.stringify({ worker: "csharp@1", image: env.image, comparator: COMPARATOR, runs }, null, 1) + "\n");
  if (bad) { console.log(`${bad} question(s) failed — library unchanged`); process.exit(1); }
  for (const f of readdirSync(join(LIBRARY_DIR, "items")).filter(f => f.startsWith("CL899371-"))) rmSync(join(LIBRARY_DIR, "items", f));
  for (const { item } of built) writeFileSync(join(LIBRARY_DIR, "items", item.libraryItemId + ".json"), JSON.stringify(item, null, 2));   // like the 791381 items: no final newline
  const catalogPath = join(LIBRARY_DIR, "catalog.json");
  const others = existsSync(catalogPath) ? JSON.parse(readFileSync(catalogPath, "utf8")).filter(e => e.source?.repository !== REPOSITORY) : [];
  writeFileSync(catalogPath, JSON.stringify([...others, ...built.map(b => b.entry)], null, 2));
  console.log(`${built.length} library items, ${Object.keys(runs).length} questions`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
