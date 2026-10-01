"use strict";
// Post-merge CI hotfix — the RF7 "no host artifact" proof, scoped to what the runner OWNS.
//
// Main run 36840521927 failed RF7 (runner/tests/docker/memory-isolation.rtest.js) with
//   new host temp entries: systemd-private-666df71a…-apport-coredump-hook@0-6226-0.service-M4TrX0
// RF7 diffed the complete os.tmpdir() of the shared GitHub Actions host before / after the batch and attributed every new
// entry to SmartAssess. That directory is created by systemd's PrivateTmp for the apport core-dump hook — a host service,
// not the runner — so the old assertion was nondeterministic without any runner defect.
//
// The architecture (docs/enterprise-coding-assessment-17b.md §11a): compile sandbox → GATEWAY MEMORY → runtime sandbox; the
// artifact is never written to host disk. These tests prove THAT property directly:
//   H1 the old global-tmpdir assumption misfires on unrelated host activity while the ownership-scoped guard stays silent;
//   H2 the guard is not vacuous — a gateway-style spill to a host temp file IS reported (both directions distinguished);
//   H3 the compile artifact stays the same in-memory value between the two sandbox invocations, reaches the runtime over the
//      container's stdin (never argv / env / a host path), the runtime gets no source, and the gateway performs no host write;
//   H4 sandbox.js depends on exactly child_process, crypto and the registry (require allow-list: no fs / os / path / stream, no
//      dynamic import, no process.binding) — the structural half of the guard, independent of what a test happens to exercise.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { installHostWriteGuard, isWriteFlag } = require("../helpers/host-fs-guard.js");

const TMP = os.tmpdir();                                  // read ONCE, before the guard: the tests never call os.tmpdir() themselves
const guard = installHostWriteGuard();                    // installed BEFORE the module under test is loaded (destructured imports included)
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage } = require("../../gateway/registry.js");

const JAVA = resolveLanguage("java", 1);
const REQ = { requestId: "req_host_scope", language: "java", languageVersion: 1, source: "public class Main { public static void main(String[] a) { System.out.println(1); } }", stdin: "in\n", limits: { timeMs: 2000, memoryMb: 64, outputBytes: 4096 } };
const ARTIFACT = [{ path: "Main.class", data: Buffer.from("cafebabe-" + "x".repeat(4000)).toString("base64") }, { path: "Main$Inner.class", data: Buffer.from("inner").toString("base64") }];

/** A fake docker CLI: the compile sandbox answers `compiled` + ARTIFACT, the runtime sandbox answers success; everything else "ok". */
function fakeDocker() {
  const spawned = [];
  const spawnImpl = (cmd, argv, opts) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    const rec = { cmd, argv, opts, stdin: "" }; spawned.push(rec);
    child.stdin.on("data", d => { rec.stdin += d; });
    child.stdin.on("finish", () => setImmediate(() => {
      let out = "";
      if (argv[0] === "run") { const job = JSON.parse(rec.stdin); out = JSON.stringify(job.phase === "compile" ? { status: "compiled", artifact: ARTIFACT } : { status: "success", stdout: "1\n", stderr: "", exitCode: 0, durationMs: 2 }) + "\n"; }
      child.stdout.end(out); child.stderr.end(); child.emit("close", 0, null);
    }));
    return child;
  };
  return { spawnImpl, spawned };
}
const unrelatedHostDir = () => fs.mkdtempSync(path.join(TMP, "systemd-private-" + "0".repeat(32) + "-apport-coredump-hook@0-" + process.pid + "-0.service-"));

test("H1 — a global os.tmpdir() diff blames the runner for unrelated host temp activity; the ownership-scoped guard does not", async () => {
  const before = new Set(fs.readdirSync(TMP));
  const unrelated = unrelatedHostDir();                                   // the HOST (systemd / apport / Docker / Actions), not the runner
  guard.reset();                                                          // the guarded window covers ONLY the production gateway path
  const { spawnImpl } = fakeDocker();
  const r = await createDockerSandbox({ spawnImpl, env: {} }).run(JAVA, REQ);
  const gatewayWrites = guard.summary();
  const globalDiff = fs.readdirSync(TMP).filter(f => !before.has(f));
  fs.rmdirSync(unrelated);
  assert.equal(r.status, "success");
  assert.deepEqual(globalDiff, [path.basename(unrelated)], "the OLD assumption: every new tmp entry is 'ours' → a false leak");
  assert.deepEqual(gatewayWrites, [], "the gateway performed no host write while the host's tmp changed underneath it");
});

test("H2 — the guard is not vacuous: a gateway-style spill of the artifact to a host temp file IS reported, with the API named", () => {
  guard.reset();
  const dir = fs.mkdtempSync(path.join(TMP, "sa-artifact-"));             // what a regressed gateway would do between the two sandboxes
  fs.writeFileSync(path.join(dir, "Main.class"), Buffer.from(ARTIFACT[0].data, "base64"));
  const seen = guard.summary();
  guard.reset();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(seen.some(s => s.startsWith("fs.mkdtempSync(")), seen.join("\n"));
  assert.ok(seen.some(s => s.startsWith("fs.writeFileSync(")), seen.join("\n"));
  assert.equal(isWriteFlag("r"), false); assert.equal(isWriteFlag(undefined), false);
  for (const f of ["w", "a", "r+", "wx", fs.constants.O_WRONLY | fs.constants.O_CREAT, fs.constants.O_RDWR]) assert.equal(isWriteFlag(f), true, String(f));
  assert.equal(isWriteFlag(fs.constants.O_RDONLY), false);
});

test("H3 — the compile artifact is the same in-memory value in both sandbox invocations, travels on container stdin, and the gateway touches no host path", async () => {
  guard.reset();
  const { spawnImpl, spawned } = fakeDocker();
  const r = await createDockerSandbox({ spawnImpl, env: { PATH: "/usr/bin", HOME: "/home/gateway" } }).run(JAVA, REQ);
  assert.deepEqual(guard.summary(), [], "host filesystem touched by the gateway");
  assert.deepEqual(r, { status: "success", stdout: "1\n", stderr: "", exitCode: 0, durationMs: 2 });
  const runs = spawned.filter(s => s.argv[0] === "run").map(s => ({ ...s, job: JSON.parse(s.stdin) }));
  assert.equal(runs.length, 2);
  const [compile, runtime] = runs;
  assert.equal(compile.job.phase, "compile"); assert.equal(compile.job.source, REQ.source); assert.equal("artifact" in compile.job, false);
  assert.equal(runtime.job.phase, "run");
  assert.deepEqual(Object.keys(runtime.job).sort(), ["artifact", "limits", "phase", "stdin"]);   // no source, no path, no handle
  assert.deepEqual(runtime.job.artifact, ARTIFACT, "the runtime receives exactly the compile sandbox's artifact, byte for byte");
  assert.equal(runtime.job.stdin, REQ.stdin);
  for (const s of spawned) {                                              // every docker invocation: fixed argv, no shell, no host path
    assert.equal(s.cmd, "docker"); assert.equal(s.opts.shell, false);
    for (const a of s.argv) { assert.ok(a !== TMP && !a.startsWith(TMP + path.sep), "host temp path in argv: " + a); assert.doesNotMatch(a, /^[>|<&]|^-(v|-volume|-mount)$/, a); }
    assert.ok(!s.argv.some((a, i) => a === "--mount" || a === "-v" || a === "--volume" || (a === "--tmpfs" && !/^\/(workspace|tmp):/.test(s.argv[i + 1]))), "mount flag in argv");
    assert.doesNotMatch(JSON.stringify(s.opts.env), /artifact|Main\.class/);
  }
  assert.ok(!spawned.some(s => s.argv[0] !== "run" && s.argv[0] !== "rm" && s.argv[0] !== "kill"), "only run / rm / kill are invoked during an execution");
});

test("H4 — sandbox.js depends on exactly child_process, crypto and the registry: no fs / os / path / stream, no dynamic import, no process.binding", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "gateway", "sandbox.js"), "utf8");
  const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");            // comments may describe anything
  const requires = [...code.matchAll(/\brequire\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g)].map(m => m[2]).sort();
  assert.deepEqual([...new Set(requires)], ["./registry.js", "node:child_process", "node:crypto"]);
  assert.equal((code.match(/\brequire\s*\(/g) || []).length, requires.length, "every require() must be a plain string literal");
  assert.doesNotMatch(code, /\bimport\s*\(|process\.binding|process\._linkedBinding|\beval\s*\(|new Function\s*\(/);
  assert.doesNotMatch(code, /\b(fs|os|path)\.(write|append|mkdtemp|mkdir|open|create|tmpdir|join|resolve)/, "no host filesystem / temp API call sites");
  assert.doesNotMatch(code, /shell:\s*true/);
});
