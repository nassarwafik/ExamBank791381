#!/usr/bin/env node
// 899371 P8 (docs/enterprise-899371-learning-plan.md §21) — builds a course's RUN INDEX: the C# blocks a learner may run in the
// Reader with «جرّب الكود».
//   node scripts/build-learning-run-index.mjs 899371          (needs Docker + the SDK image of the csharp@1 worker)
//
// From the SERVED module bodies (api/src/data/learning-content/<courseId>/*.json) it takes every C# `code` block that declares a
// `static void Main`, wraps it exactly as the API does (api/src/lib/learning-run.js wrapProgram), and compiles and runs it once
// with the csharp@1 settings (run-csharp-probes.mjs executeCSharp, empty input). A block enters the index only when it COMPILES
// alone; one that needs code from another block (a method printed elsewhere) stays a plain code block. The starter of a writing
// question («حلّ وافحص», enrichment P14: `…-solve-qN`) is not a candidate: its own panel runs and checks it (learning-solve).
// Output:
//   api/src/data/learning-run/<courseId>.json   { schemaVersion, courseId, language, pages: { pageId: { blocks: { blockId: { moduleId, codeSha } } } } }
//   scripts/learning-run/<courseId>.json         every candidate with its compile result (the evidence), bound to the code's sha256
// Deterministic: rebuilding without a content change changes no byte. Exit 0 on success, 2 on an environment error.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { wrapProgram, codeSha, RUN_LANGUAGE } = require("../api/src/lib/learning-run.js");
export const CONTENT_DIR = id => join(ROOT, "api", "src", "data", "learning-content", id);
export const INDEX_FILE = id => join(ROOT, "api", "src", "data", "learning-run", id + ".json");
export const EVIDENCE_FILE = id => join(ROOT, "scripts", "learning-run", id + ".json");
const MAIN = /static\s+void\s+Main\s*\(/;

const SOLVE_STARTER = /-solve-q\d+$/;

/** Every C# block with a `Main` in the served bodies (a «حلّ وافحص» starter excepted), in module / lesson / page / block order →
 *  [{ moduleId, pageId, blockId, code }]. */
export function candidates(courseId) {
  const out = [];
  for (const f of readdirSync(CONTENT_DIR(courseId)).filter(f => f.endsWith(".json")).sort()) {
    const mod = JSON.parse(readFileSync(join(CONTENT_DIR(courseId), f), "utf8"));
    for (const lesson of mod.lessons || []) for (const page of lesson.pages || []) for (const b of page.blocks || [])
      if (b && b.type === "code" && b.language === "csharp" && MAIN.test(b.code || "") && !SOLVE_STARTER.test(b.id || "")) out.push({ moduleId: mod.id, pageId: page.id, blockId: b.id, code: b.code });
  }
  return out;
}

/** The index from the evidence: only the blocks that compiled. */
export function indexFrom(courseId, evidence) {
  const pages = {};
  for (const e of evidence) {
    if (e.compileExit !== 0) continue;
    (pages[e.pageId] ||= { blocks: {} }).blocks[e.blockId] = { moduleId: e.moduleId, codeSha: e.codeSha };
  }
  return { schemaVersion: 1, courseId, language: RUN_LANGUAGE.language + "@" + RUN_LANGUAGE.languageVersion, pages };
}

function main() {
  const courseId = process.argv[2];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(courseId || "")) { console.error("usage: node scripts/build-learning-run-index.mjs <courseId>"); process.exit(2); }
  let env;
  try { env = csharpEnvironment(); } catch (e) { console.error("environment: " + e.message); process.exit(2); }
  const evidence = [];
  for (const c of candidates(courseId)) {
    const { compile, observed } = executeCSharp(wrapProgram(c.code), [""], env);
    const e = { moduleId: c.moduleId, pageId: c.pageId, blockId: c.blockId, codeSha: codeSha(c.code), compileExit: compile.exitCode,
      ...(compile.exitCode !== 0 ? { diagnostics: [...new Set((compile.output.match(/error CS\d{4}/g) || []).map(s => s.slice(6)))] } : { runExit: observed[0].exitCode }) };
    evidence.push(e);
    console.log((e.compileExit === 0 ? "✓ " : "· ") + c.pageId + "/" + c.blockId + (e.diagnostics ? "  (" + e.diagnostics.join(", ") + ")" : ""));
  }
  mkdirSync(dirname(INDEX_FILE(courseId)), { recursive: true });
  mkdirSync(dirname(EVIDENCE_FILE(courseId)), { recursive: true });
  writeFileSync(EVIDENCE_FILE(courseId), JSON.stringify({ worker: "csharp@1", image: env.image, wrap: "learning-run.js wrapProgram", candidates: evidence }, null, 1) + "\n");
  const index = indexFrom(courseId, evidence);
  writeFileSync(INDEX_FILE(courseId), JSON.stringify(index, null, 1) + "\n");
  console.log(`${evidence.filter(e => e.compileExit === 0).length} of ${evidence.length} programs compile alone → the run index`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
