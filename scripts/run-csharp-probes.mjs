// 899371 P0 — C# PROBES: compile and run short C# programs with the SAME compiler settings the Coding Runner's csharp@1 worker
// uses, to prove what a piece of book code really does (an answer key, a compile error, a runtime error) instead of computing
// it by hand. Docs: docs/enterprise-899371-learning-plan.md §12.
//
// What it is: an author's verification tool for learning content (Phase P0 findings, Phase P4 answer keys). It is NOT part of
// grading, never talks to the Runner gateway, the API or production, and never runs in the browser.
//
// How it runs code: one disposable container per probe, from the digest-pinned official .NET SDK image that the csharp worker
// Dockerfile copies its SDK from (the digest is READ from that Dockerfile). The compile / run argv are DERIVED from
// runner/workers/csharp/toolchain.json (same csc flags, GlobalUsings.cs, runtimeconfig, invariant globalization), so a probe
// cannot silently drift from the worker. Container: --network none, all capabilities dropped, no-new-privileges, read-only root,
// non-root user, memory / pid limits, a wall-clock timeout per step.
//
// A probe is a directory with:
//   Program.cs   — the program (book code wrapped in a class when the book prints only `static void Main`);
//   probe.json   — { id, source, verbatim, finding?, bookClaim?, runs: [ { stdin?, expect } ] } or, for a compile error,
//                  { …, expect: { compile: "error", diagnostics: ["CS0165"] } }.
// `expect` is written BEFORE the probe is run (it is a prediction); the report says whether reality matched it.
//
// Usage: node scripts/run-csharp-probes.mjs [probesDir] [--only id1,id2] [--json out.json]
// Exit code: 0 when every probe matched its expectation, 1 otherwise, 2 on a usage / environment error.
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync, chmodSync, cpSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const WORKER_DIR = join(ROOT, "runner", "workers", "csharp");
export const DEFAULT_PROBES_DIR = join(ROOT, "docs", "enterprise-899371-learning", "probes");
const PROBE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DIAGNOSTIC = /^CS\d{4}$/;
const EXCEPTION = /^[A-Z][A-Za-z]+Exception$/;
const STDIN_MAX = 16384;

/** The SDK image the csharp worker copies its toolchain from — read from the worker Dockerfile, never hard-coded here. */
export function sdkImageFromDockerfile(dockerfileText) {
  const m = /^FROM\s+(mcr\.microsoft\.com\/dotnet\/sdk@sha256:[0-9a-f]{64})\s+AS\s+dotnet\s*$/m.exec(dockerfileText);
  if (!m) throw new Error("worker Dockerfile: no digest-pinned 'FROM mcr.microsoft.com/dotnet/sdk@sha256:… AS dotnet' line");
  return m[1];
}

/**
 * The compile and run argv for the probe container, derived from the worker's toolchain.json. The worker's fixed paths are
 * mapped onto the probe container's layout: the Roslyn compiler and the reference-assembly response file are located by the
 * container script (same files the worker Dockerfile links), and the worker's GlobalUsings.cs / runtimeconfig are mounted
 * read-only at /opt/runner. Every compiler FLAG is kept verbatim.
 */
export function probeArgv(toolchain) {
  if (!toolchain || toolchain.language !== "csharp" || toolchain.languageVersion !== 1) throw new Error("toolchain.json: not csharp@1");
  const compile = toolchain.compile && toolchain.compile.argv, run = toolchain.run && toolchain.run.argv;
  if (!Array.isArray(compile) || !Array.isArray(run)) throw new Error("toolchain.json: compile.argv / run.argv missing");
  const map = a => a === "/opt/runner/roslyn/csc.dll" ? "$CSC" : a === "@/opt/runner/references.rsp" ? "@/work/references.rsp" : a.split("/workspace/").join("/work/");
  const mapped = { compile: compile.map(map), run: run.map(map) };
  for (const required of ["$CSC", "@/work/references.rsp", "/opt/runner/GlobalUsings.cs", "/work/Program.cs"]) {
    if (!mapped.compile.includes(required)) throw new Error("toolchain.json: compile argv no longer has " + required);
  }
  if (!mapped.run.includes("/opt/runner/Main.runtimeconfig.json")) throw new Error("toolchain.json: run argv no longer has the runtimeconfig");
  if ([...mapped.compile, ...mapped.run].some(a => a.includes("/workspace"))) throw new Error("toolchain.json: a worker path was not mapped");
  return mapped;
}

/** Validate one probe.json (pure). Returns a list of problems (empty = valid). */
export function validateProbe(probe, dirName) {
  const bad = [];
  if (!probe || typeof probe !== "object") return ["probe.json is not an object"];
  if (!PROBE_ID.test(String(probe.id))) bad.push("id must match " + PROBE_ID);
  if (dirName !== undefined && probe.id !== dirName) bad.push("id must equal its directory name");
  if (typeof probe.source !== "string" || !probe.source.trim()) bad.push("source (where in the book) is required");
  if (typeof probe.verbatim !== "boolean") bad.push("verbatim must be true (book code as printed) or false (a written harness)");
  const hasCompileError = probe.expect && probe.expect.compile === "error";
  if (hasCompileError) {
    if (probe.runs !== undefined) bad.push("a compile-error probe has no runs");
    const d = probe.expect.diagnostics;
    if (!Array.isArray(d) || !d.length || !d.every(x => DIAGNOSTIC.test(x))) bad.push("expect.diagnostics must list CS#### codes");
  } else {
    if (!Array.isArray(probe.runs) || !probe.runs.length) bad.push("runs must be a non-empty array");
    else probe.runs.forEach((r, i) => {
      if (r.stdin !== undefined && (typeof r.stdin !== "string" || r.stdin.length > STDIN_MAX)) bad.push(`runs[${i}].stdin must be a string ≤ ${STDIN_MAX} chars`);
      const e = r.expect || {};
      const kinds = ["stdout" in e, "runtimeError" in e].filter(Boolean).length;
      if (kinds !== 1) bad.push(`runs[${i}].expect must have exactly one of stdout / runtimeError`);
      if ("stdout" in e && typeof e.stdout !== "string") bad.push(`runs[${i}].expect.stdout must be a string`);
      if ("runtimeError" in e && !EXCEPTION.test(String(e.runtimeError))) bad.push(`runs[${i}].expect.runtimeError must be an exception type name`);
    });
  }
  return bad;
}

/** The Runner's default comparator (trimTrailingWhitespace): trailing whitespace of every line and trailing empty lines ignored. */
export function normalizeOutput(s) {
  const lines = String(s).replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/[ \t]+$/, ""));
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

/** Compare one observed run with its expectation (pure). */
export function judgeRun(expect, observed) {
  if ("runtimeError" in expect) {
    const ok = observed.exitCode !== 0 && new RegExp("\\b" + expect.runtimeError + "\\b").test(observed.stderr || "");
    return { ok, detail: ok ? "runtime error " + expect.runtimeError : "expected " + expect.runtimeError + ", got exit " + observed.exitCode };
  }
  if (observed.exitCode !== 0) return { ok: false, detail: "exit " + observed.exitCode + ": " + firstLine(observed.stderr) };
  const ok = normalizeOutput(observed.stdout) === normalizeOutput(expect.stdout);
  return { ok, detail: ok ? "stdout matches" : "stdout differs" };
}

/** Compare a compile result with a compile-error expectation (pure). */
export function judgeCompile(expect, compile) {
  const found = [...new Set((String(compile.output).match(/\berror (CS\d{4})\b/g) || []).map(s => s.slice(6)))];
  if (expect && expect.compile === "error") {
    const ok = compile.exitCode !== 0 && expect.diagnostics.every(d => found.includes(d));
    return { ok, found, detail: ok ? "compile error " + found.join(",") : "expected " + expect.diagnostics.join(",") + ", got " + (found.join(",") || "exit " + compile.exitCode) };
  }
  return { ok: compile.exitCode === 0, found, detail: compile.exitCode === 0 ? "compiled" : "compile failed " + found.join(",") };
}

const firstLine = s => String(s || "").split("\n").find(l => l.trim()) || "";

export function loadProbes(dir, only) {
  if (!existsSync(dir)) throw new Error("probes directory not found: " + dir);
  const ids = readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
  const probes = [];
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    const pdir = join(dir, id);
    const probe = JSON.parse(readFileSync(join(pdir, "probe.json"), "utf8"));
    const problems = validateProbe(probe, id);
    if (!existsSync(join(pdir, "Program.cs"))) problems.push("Program.cs is missing");
    if (problems.length) throw new Error(id + ": " + problems.join("; "));
    probes.push({ dir: pdir, probe });
  }
  return probes;
}

/** The script the probe container runs: locate csc + references (as the worker Dockerfile does), compile, run each stdin. */
function containerScript(argv, runCount) {
  const q = a => a.startsWith("$") ? `"${a}"` : "'" + a.replace(/'/g, "'\\''") + "'";
  const lines = [
    "set -u",
    'CSC="$(ls -d /usr/share/dotnet/sdk/10.0.*/Roslyn/bincore/csc.dll | head -n 1)"',
    'for f in /usr/share/dotnet/packs/Microsoft.NETCore.App.Ref/10.0.*/ref/net10.0/*.dll; do echo "-r:$f"; done > /work/references.rsp',
    "mkdir -p /work/out",
    `timeout 60 ${argv.compile.map(q).join(" ")} > /work/compile.txt 2>&1; echo $? > /work/compile.exit`,
    'if [ "$(cat /work/compile.exit)" = "0" ]; then',
    "  :",
  ];
  for (let i = 0; i < runCount; i++) {
    lines.push(`  timeout 10 ${argv.run.map(q).join(" ")} < /work/stdin${i}.txt > /work/stdout${i}.txt 2> /work/stderr${i}.txt; echo $? > /work/exit${i}.txt`);
  }
  lines.push("fi");
  return lines.join("\n") + "\n";
}

function runProbe({ dir, probe }, image, argv, env) {
  const work = mkdtempSync(join(tmpdir(), "csharp-probe-"));
  try {
    cpSync(join(dir, "Program.cs"), join(work, "Program.cs"));
    const runs = probe.runs || [];
    runs.forEach((r, i) => writeFileSync(join(work, `stdin${i}.txt`), r.stdin || ""));
    writeFileSync(join(work, "probe.sh"), containerScript(argv, runs.length));
    chmodSync(work, 0o777);
    const envArgs = Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
    const res = spawnSync("docker", ["run", "--rm", "--network", "none", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
      "--read-only", "--tmpfs", "/tmp:rw,size=64m", "--memory", "1g", "--pids-limit", "256", "--user", "10001:10001",
      "-e", "HOME=/work", ...envArgs,
      "-v", `${work}:/work`, "-v", `${join(WORKER_DIR, "GlobalUsings.cs")}:/opt/runner/GlobalUsings.cs:ro`,
      "-v", `${join(WORKER_DIR, "Main.runtimeconfig.json")}:/opt/runner/Main.runtimeconfig.json:ro`,
      "--entrypoint", "/bin/sh", image, "/work/probe.sh"], { encoding: "utf8", timeout: 180000 });
    if (res.error || res.status !== 0) throw new Error("docker run failed: " + (res.error ? res.error.message : firstLine(res.stderr)));
    const read = f => existsSync(join(work, f)) ? readFileSync(join(work, f), "utf8") : "";
    const compile = { exitCode: Number(read("compile.exit").trim() || 1), output: read("compile.txt") };
    const c = judgeCompile(probe.expect, compile);
    if (probe.expect && probe.expect.compile === "error") return { id: probe.id, ok: c.ok, steps: [c.detail], compile, observed: [] };
    if (!c.ok) return { id: probe.id, ok: false, steps: [c.detail + " " + firstLine(compile.output)], compile, observed: [] };
    const observed = runs.map((r, i) => ({ stdin: r.stdin || "", exitCode: Number(read(`exit${i}.txt`).trim() || 1), stdout: read(`stdout${i}.txt`), stderr: read(`stderr${i}.txt`) }));
    const verdicts = runs.map((r, i) => judgeRun(r.expect, observed[i]));
    return { id: probe.id, ok: verdicts.every(v => v.ok), steps: verdicts.map(v => v.detail), compile, observed };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const only = opt("--only"), jsonOut = opt("--json");
  const dir = resolve(args[0] || DEFAULT_PROBES_DIR);
  let probes, image, argv, toolchain;
  try {
    toolchain = JSON.parse(readFileSync(join(WORKER_DIR, "toolchain.json"), "utf8"));
    argv = probeArgv(toolchain);
    image = sdkImageFromDockerfile(readFileSync(join(WORKER_DIR, "Dockerfile"), "utf8"));
    probes = loadProbes(dir, only ? only.split(",") : undefined);
  } catch (e) { console.error(e.message); process.exit(2); }
  const docker = spawnSync("docker", ["image", "inspect", image], { encoding: "utf8" });
  if (docker.status !== 0) { console.error("SDK image not available locally: docker pull " + image); process.exit(2); }
  const env = { ...toolchain.env };
  const results = [];
  for (const p of probes) {
    let r;
    try { r = runProbe(p, image, argv, env); } catch (e) { console.error(p.probe.id + ": " + e.message); process.exit(2); }
    results.push(r);
    console.log(`${r.ok ? "MATCH   " : "MISMATCH"} ${r.id.padEnd(28)} ${r.steps.join(" | ")}`);
    if (!r.ok) r.observed.forEach((o, i) => console.log(`         run ${i}: exit ${o.exitCode}\n         stdout: ${JSON.stringify(o.stdout)}\n         stderr: ${JSON.stringify(firstLine(o.stderr))}`));
  }
  const matched = results.filter(r => r.ok).length;
  console.log(`\n${matched}/${results.length} probes matched their expectation · image ${image.slice(0, 40)}… · toolchain ${toolchain.toolchain}`);
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ image, toolchain: toolchain.toolchain, results }, null, 2) + "\n");
  process.exit(matched === results.length ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
