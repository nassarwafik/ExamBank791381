#!/usr/bin/env node
// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — the SERVER's trace index: the recorded question traces
// (src/learning/content/899371/question-traces/runs.json, written by scripts/trace-899371-questions.mjs with Docker) joined to what
// the served course shows, for the learning-trace route (api/src/lib/learning-trace.js):
//   node scripts/build-learning-trace-index.mjs     → api/src/data/learning-trace/899371.json
// Each trace: its module, its kind (exercise → after the student answers it; book → after the teacher releases the module, D1), the
// exercise's activity, the program exactly as the page shows it, its input, where the run's values come from (a book question: its
// text, its teacher clarification, or chosen because the page gives none) and the steps. A run whose program or input is no longer
// what the page shows (its sha differs) is refused: re-record it. Deterministic; no network, no Docker.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { targets, runSource, runSha, RUNS_FILE } from "./trace-899371-questions.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CID = "899371";
export const INDEX_FILE = join(ROOT, "api", "src", "data", "learning-trace", CID + ".json");

/** The index object (pure over the recorded runs and the current targets). Throws on a stale or unknown run. */
export function buildTraceIndex(runsFile = JSON.parse(readFileSync(RUNS_FILE, "utf8")), all = targets()) {
  const byKey = new Map(all.map(t => [t.key, t]));
  const traces = {};
  for (const key of Object.keys(runsFile.runs).sort()) {
    const run = runsFile.runs[key], t = byKey.get(key);
    if (!t) throw new Error(key + ": a recorded trace for no program of the course");
    if (run.sha !== runSha(runSource(t).source, t.stdin)) throw new Error(key + ": the program or its input changed since it was recorded — re-record it");
    traces[key] = {
      moduleId: t.moduleId, kind: t.kind, ...(t.activityId ? { activityId: t.activityId } : {}), ...(t.questionId ? { questionId: t.questionId } : {}),
      code: t.program, ...(t.stdin !== undefined ? { stdin: t.stdin } : {}), ...(t.valuesFrom ? { valuesFrom: t.valuesFrom } : {}), steps: run.steps,
    };
  }
  return { schemaVersion: 1, courseId: CID, traces };
}

function main() {
  const index = buildTraceIndex();
  mkdirSync(dirname(INDEX_FILE), { recursive: true });
  const text = JSON.stringify(index) + "\n";
  writeFileSync(INDEX_FILE, text);
  const kinds = Object.values(index.traces).reduce((o, t) => ({ ...o, [t.kind]: (o[t.kind] || 0) + 1 }), {});
  console.log(`wrote ${INDEX_FILE}: ${Object.keys(index.traces).length} traces (${Object.entries(kinds).map(([k, n]) => n + " " + k).join(", ")}), ${Math.round(text.length / 1024)} KB`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
