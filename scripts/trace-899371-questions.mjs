#!/usr/bin/env node
// 899371 enrichment P13 (docs/enterprise-899371-enrichment-plan.md §9) — records the step-by-step traces of the QUESTIONS by RUNNING
// them: the 77 self-study exercises that show a program, and the programs of the book's tracing questions (P10 work list, track B).
//   node scripts/trace-899371-questions.mjs [key …]   → src/learning/content/899371/question-traces/runs.json   (Docker + the SDK image)
//
// For each program, exactly as the page shows it:
//   1. the run source: the program wrapped like any walkthrough; a book fragment gets its hidden `setup` lines first, a book method a
//      hidden Main with its `call` (question-traces/specs.json: values quoted from the question or its teacher clarification, or chosen
//      and said so; hidden code never prints and never reads input);
//   2. the instrumenter (scripts/lib/csharp-autotrace/AutoTrace.cs, Roslyn, offline) inserts recorder calls around the program's own
//      syntax; which variables a recorder reads, the compiler decides;
//   3. the CLEAN source and the INSTRUMENTED copy both run in the csharp@1 worker image with the same input: the instrumented run must
//      print exactly what the clean run printed (the recording changed nothing), else the trace is refused;
//   4. the steps on the page's own lines are kept (≤ 200, the tracer's limit), each with its sentence written from the recorded state
//      (scripts/lib/trace-notes.mjs).
// A trace is bound to its source and input (sha256); question-traces.p13.test.ts re-checks everything it can without Docker. Exit 0 when
// every program was traced or skipped for a stated reason, 1 otherwise.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { executeCSharp, csharpEnvironment } from "./run-csharp-probes.mjs";
import { wrapProgram } from "./prove-899371-practice.mjs";
import { readPractice } from "./convert-899371.mjs";
import { noteFor } from "./lib/trace-notes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CID = "899371";
export const QT_DIR = join(ROOT, "src", "learning", "content", CID, "question-traces");
export const RUNS_FILE = join(QT_DIR, "runs.json");
export const SPECS_FILE = join(QT_DIR, "specs.json");
const CONTENT = join(ROOT, "api", "src", "data", "learning-content", CID);
const WORKLIST = join(ROOT, "docs", "enterprise-899371-learning", "analysis", "enrichment-worklist.json");
export const HELPER_FILE = join(ROOT, "scripts", "lib", "csharp-autotrace-helper.cs");
const TOOL_DIR = join(ROOT, "scripts", "lib", "csharp-autotrace");
// A trace a grade-10 learner can follow (owner, 2026-11-10: «20 أو 30 خطوة تكفي»): at most SHOWN_STEPS steps. A longer run keeps its first
// HEAD_STEPS steps (the start and the first iterations) and its last SHOWN_STEPS − HEAD_STEPS (the end and the final output); the first
// step after the cut says how many similar steps were skipped. Every step shown is a real recorded state. The recorder writes at most 400
// raw steps: a run that reaches that limit is refused (its end would not be the program's end).
export const SHOWN_STEPS = 30, HEAD_STEPS = 21, RAW_LIMIT = 400;
export const MAX_STEPS = SHOWN_STEPS;

const indent = (s, n) => s.split("\n").map(l => (l ? " ".repeat(n) + l : l)).join("\n");
const lines = s => s.split("\n").length;

/** The served course: { pageId: { moduleId, blocks } }. */
export function servedPages(dir = CONTENT) {
  const out = {};
  for (const f of readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const m = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const l of m.lessons) for (const p of l.pages) out[p.id] = { moduleId: m.id, blocks: p.blocks };
  }
  return out;
}

/** Every program to trace: { key, kind, moduleId, pageId, blockId, program, stdin?, setup?, call?, extra?, activityId?, questionId? }. */
export function targets({ pages = servedPages(), practice = readPractice(), worklist = JSON.parse(readFileSync(WORKLIST, "utf8")), specs = readSpecs() } = {}) {
  const out = [];
  // the self-study exercises: the k-th practice block of a chapter is its k-th authored item; a program item has its code block above
  for (const [mod, items] of Object.entries(practice)) {
    const blocks = Object.entries(pages).filter(([id]) => id.startsWith(`${CID}-${mod}-l`) && pages[id].blocks.some(b => b.type === "practice"))
      .sort(([a], [b]) => a.localeCompare(b)).flatMap(([pageId, p]) => p.blocks.filter(b => b.type === "practice").map(b => ({ pageId, b, code: p.blocks.find(c => c.id === b.id + "-code") })));
    if (blocks.length !== items.length) throw new Error(mod + ": " + blocks.length + " practice blocks for " + items.length + " items");
    items.forEach((it, k) => {
      if (!it.program) return;
      const { pageId, b, code } = blocks[k];
      if (!code || code.code !== it.program) throw new Error(b.id + ": the code block above is not the item's program");
      out.push({ key: pageId + "/" + code.id, kind: "exercise", moduleId: pages[pageId].moduleId, pageId, blockId: code.id, activityId: b.id, proofKey: mod + "/q" + String(k + 1).padStart(2, "0"), program: it.program, ...(it.stdin !== undefined ? { stdin: it.stdin } : {}) });
    });
  }
  // the book's tracing questions (track B): every C# program on the question
  for (const q of worklist.questions) {
    if (!q.trace) continue;
    for (const pr of q.programs) {
      if (pr.kind === "signature") continue;   // a method header the student is asked to write: nothing runs (P14 «حلّ وافحص»)
      const block = pages[q.pageId]?.blocks.find(b => b.id === pr.blockId);
      if (!block) throw new Error(q.id + ": no block " + pr.blockId);
      const spec = specs[q.id + "/" + pr.blockId] ?? {};
      out.push({ key: q.pageId + "/" + pr.blockId, kind: "book", moduleId: pages[q.pageId].moduleId, pageId: q.pageId, blockId: pr.blockId, questionId: q.id, programKind: pr.kind, program: block.code,
        ...(spec.stdin !== undefined ? { stdin: spec.stdin } : {}), ...(spec.setup ? { setup: spec.setup } : {}), ...(spec.call ? { call: spec.call } : {}), ...(spec.extra ? { extra: spec.extra } : {}), ...(spec.skip ? { skip: spec.skip } : {}),
        // where the run's values come from, when the tracer adds any: the question's text, its teacher clarification, or chosen
        ...((spec.stdin !== undefined || spec.setup || spec.call) && spec.source ? { valuesFrom: spec.source } : {}),
        // a program that draws random numbers runs with a generator fixed to one sequence (a hidden `extra` class), so its one run
        // is reproducible; the learner is told it is one example run
        ...(spec.random ? { random: true } : {}) });
    }
  }
  const keys = new Set();
  for (const t of out) { if (keys.has(t.key)) throw new Error("two traces for " + t.key); keys.add(t.key); }
  return out;
}
export const readSpecs = (file = SPECS_FILE) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).specs : {});

/** The source that runs (clean) and how many of its lines come before the page's first line. */
export function runSource(t) {
  if (t.programKind === "method" || t.call !== undefined) {
    const head = "public class Program\n{\n    static void Main()\n    {\n" + indent(t.call ?? "", 8) + "\n    }\n" + (t.extra ? indent(t.extra, 4) + "\n" : "");
    return { source: head + indent(t.program, 4) + "\n}\n", offset: lines(head) - 1 };
  }
  const body = (t.setup ? t.setup + "\n" : "") + t.program;
  let wrapped = wrapProgram(body);
  // a hidden member (e.g. the fixed-sequence Random) goes inside the program's class, AFTER the page's lines: nothing shifts
  if (t.extra) { const at = wrapped.lastIndexOf("}"); wrapped = wrapped.slice(0, at) + indent(t.extra, 4) + "\n" + wrapped.slice(at); }
  const prefix = /\bclass\s+\w+/.test(body) ? 0 : /\bstatic\s+[\w<>[\]]+\s+Main\s*\(/.test(body) ? 2 : 4;
  return { source: wrapped, offset: prefix + (t.setup ? lines(t.setup) : 0) };
}
export const runSha = (source, stdin) => createHash("sha256").update(source + "\u0000" + (stdin ?? "")).digest("hex");

/** At most SHOWN_STEPS: the head and the tail of a longer trace, the cut said on the first tail step. Pure. */
export function shortenSteps(kept) {
  if (kept.length <= SHOWN_STEPS) return kept;
  const tail = kept.slice(kept.length - (SHOWN_STEPS - HEAD_STEPS));
  const skipped = kept.length - SHOWN_STEPS;
  return [...kept.slice(0, HEAD_STEPS), { ...tail[0], note: "⋯ تخطّينا هنا " + skipped + " من الخطوات المتشابهة، ونكمل قرب النهاية. " + tail[0].note }, ...tail.slice(1)];
}
/** The steps kept for the page (its own lines only), each with its sentence. */
export function keepSteps(recorded, displayLines) {
  const kept = [];
  for (const s of recorded) {
    if (s.line < 1 || s.line > displayLines) continue;
    const prev = kept.length ? kept[kept.length - 1] : null;
    kept.push({ line: s.line, note: noteFor(s, prev && { ...prev, frames: prev.frames, eval: prev.eval, heap: prev.heap, out: prev.out }), frames: s.frames, eval: s.eval, heap: s.heap, out: s.out });
  }
  return kept;
}

function buildTool(image) {
  const out = join(tmpdir(), "autotrace-899371");
  mkdirSync(out, { recursive: true });
  const r = spawnSync("docker", ["run", "--rm", "--network", "none", "-v", TOOL_DIR + ":/src:ro", "-v", out + ":/out", image, "sh", "-c", "cp -r /src /tmp/w && cd /tmp/w && dotnet build -c Release -o /out -nologo -v q"], { encoding: "utf8", timeout: 600000 });
  if (r.status !== 0) throw new Error("the instrumenter does not build: " + (r.stdout + r.stderr).split("\n").filter(l => /error/.test(l)).slice(0, 3).join(" | "));
  return out;
}

function main() {
  const only = new Set(process.argv.slice(2));
  const env = csharpEnvironment();
  const helper = readFileSync(HELPER_FILE, "utf8");
  const usings = helper.split("\n").filter(l => /^using /.test(l)).join("\n"), helperBody = helper.split("\n").filter(l => !/^using /.test(l)).join("\n");
  const all = targets();
  const todo = all.filter(t => !only.size || only.has(t.key));
  const prior = existsSync(RUNS_FILE) ? JSON.parse(readFileSync(RUNS_FILE, "utf8")) : { runs: {}, skipped: {} };
  const runs = only.size ? { ...prior.runs } : {}, skipped = only.size ? { ...prior.skipped } : {};
  const tool = buildTool(env.image);
  const items = todo.filter(t => !t.skip).map(t => ({ key: t.key, ...runSource(t) }));
  const res = spawnSync("docker", ["run", "--rm", "-i", "--network", "none", "-v", tool + ":/tool:ro", env.image, "dotnet", "/tool/AutoTrace.dll"],
    { input: JSON.stringify({ helper, items: items.map(({ key, source, offset }) => ({ key, source, offset })) }), encoding: "utf8", maxBuffer: 1 << 28, timeout: 1800000 });
  if (res.status !== 0) { console.error("the instrumenter failed: " + res.stderr.split("\n")[0]); process.exit(2); }
  const instrumented = Object.fromEntries(JSON.parse(res.stdout).map(r => [r.key, r]));
  let bad = 0;
  for (const t of todo) {
    delete runs[t.key]; delete skipped[t.key];
    if (t.skip) { skipped[t.key] = t.skip; console.log("  – " + t.key + ": " + t.skip); continue; }
    const { source } = runSource(t);
    const inst = instrumented[t.key];
    if (inst.error) { skipped[t.key] = "instrumenter: " + inst.error; bad++; console.log("  ✗ " + t.key + ": " + inst.error); continue; }
    const clean = executeCSharp(source, [t.stdin ?? ""], env);
    const rec = executeCSharp(usings + "\n" + inst.instrumented + "\n" + helperBody, [t.stdin ?? ""], env);
    const cleanRun = clean.observed?.[0], recRun = rec.observed?.[0];
    if (clean.compile.exitCode !== 0 || !cleanRun) { skipped[t.key] = "the program does not compile or run as given"; bad++; console.log("  ✗ " + t.key + ": clean run failed"); continue; }
    const [printed, json] = (recRun?.stdout ?? "").split("\n\u0001TRACE\n");
    if (json === undefined || printed !== cleanRun.stdout) { skipped[t.key] = "the recorded run did not print what the program prints"; bad++; console.log("  ✗ " + t.key + ": recorded output differs"); continue; }
    const raw = JSON.parse(json);
    if (raw.length > RAW_LIMIT) { skipped[t.key] = "the run is longer than the recorder keeps (" + raw.length + " raw steps)"; bad++; console.log("  ✗ " + t.key + ": too long"); continue; }
    const steps = shortenSteps(keepSteps(raw, lines(t.program)));
    if (!steps.length) { skipped[t.key] = "no step on the page's lines"; bad++; console.log("  ✗ " + t.key + ": no step"); continue; }
    runs[t.key] = { kind: t.kind, sha: runSha(source, t.stdin), ...(t.stdin !== undefined ? { stdin: t.stdin } : {}), stdout: cleanRun.stdout, ...(cleanRun.exitCode ? { exitCode: cleanRun.exitCode } : {}), steps };
    console.log("  ✓ " + t.key + ": " + steps.length + " steps");
  }
  // a program that is no longer a target (removed from the page, or now a header the student writes) leaves no run behind
  const live = new Set(all.map(t => t.key));
  for (const k of [...Object.keys(runs), ...Object.keys(skipped)]) if (!live.has(k)) { delete runs[k]; delete skipped[k]; }
  const sorted = o => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));
  mkdirSync(QT_DIR, { recursive: true });
  writeFileSync(RUNS_FILE, JSON.stringify({ schemaVersion: 1, courseId: CID, helperSha: createHash("sha256").update(helper).digest("hex"), runs: sorted(runs), skipped: sorted(skipped) }) + "\n");
  console.log(`\n${Object.keys(runs).length} traced, ${Object.keys(skipped).length} skipped (${bad} for a failure)`);
  process.exit(bad ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
