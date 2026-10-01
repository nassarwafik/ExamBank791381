"use strict";
// Phase 17C — REAL Docker proof of the OFFICIAL grading execution path (requires Docker + the built worker images; a missing daemon
// or image FAILS — nothing is skipped). The official runtime has no grading supervisor beside student code: the trusted entry
// reads an exact-length setup frame, materialises the artifact / source in the tmpfs workspace, writes a fixed exec marker and
// execve()s the runtime. The gateway observes stdout / stderr / exit / wall clock / byte counts itself.
//   G1 Python official suite · G2 Java compile ONCE + a fresh runtime container per case · G3 C# compile ONCE + fresh containers
//   G4 stdout cannot forge a status / grade · G5 no state crosses hidden cases (files, env, background process, static state)
//   G6 timeout / memory / output flood are per-case outcomes · G7 cleanup: no labelled container, no gateway host write
//   G8 end-to-end: SmartAssess API dispatch → gateway → real sandboxes → signed callback → API compares + weights → final mark.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { installHostWriteGuard } = require("../helpers/host-fs-guard.js");
const hostWrites = installHostWriteGuard();                         // BEFORE the gateway modules load
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage, LANGUAGES } = require("../../gateway/registry.js");

const LIMITS = { timeMs: 3000, memoryMb: 128, outputBytes: 17408 };
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
let seq = 0;
const jobId = () => "cg_dockerofficial" + String(++seq).padStart(8, "0");
const cases = stdins => stdins.map((stdin, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin }));
/** A sandbox whose docker invocations are recorded (the real docker CLI still runs every one of them). */
function recordingSandbox() {
  const runs = [];
  const sb = createDockerSandbox({ spawnImpl: (cmd, argv, opts) => { if (argv[0] === "run") runs.push(argv.slice()); return spawn(cmd, argv, opts); } });
  return { sb, runs };
}
const suite = (sb, language, source, stdins, limits = {}) => sb.runOfficialSuite(resolveLanguage(language, 1), { jobId: jobId(), language, languageVersion: 1, source, cases: cases(stdins), limits: { ...LIMITS, ...limits } }, { signal: new AbortController().signal });

test("preflight: Docker and the java / csharp / python worker images (17C tag) exist", () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  for (const e of Object.values(LANGUAGES)) { assert.match(e.image, /:17c-v1$/); assert.equal(spawnSync("docker", ["image", "inspect", e.image]).status, 0, "missing image " + e.image); }
});

test("G1 Python official suite: raw stdout per case, a fresh runtime container per case", async () => {
  const { sb, runs } = recordingSandbox();
  const r = await suite(sb, "python", "a, b = map(int, input().split())\nprint('SUM=' + str(a + b))\n", ["1 2\n", "-1 -2\n", "5 5\n"]);
  assert.equal(r.compile, undefined);
  assert.deepEqual(r.cases.map(c => [c.token, c.status, c.stdout]), [["c01", "success", "SUM=3\n"], ["c02", "success", "SUM=-3\n"], ["c03", "success", "SUM=10\n"]]);
  assert.equal(runs.length, 3);
  assert.equal(new Set(runs.map(a => a[a.indexOf("--name") + 1])).size, 3);
  assert.equal(orphans(), "");
});

test("G2 Java: compiled ONCE, then one fresh runtime container per hidden case (artifact reused from gateway memory)", async () => {
  const { sb, runs } = recordingSandbox();
  const src = "import java.util.*;\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); int x = s.nextInt(), y = s.nextInt(); System.out.println(\"SUM=\" + (x + y)); } }\n";
  const r = await suite(sb, "java", src, ["1 2\n", "-1 -2\n", "5 5\n", "100 1\n"]);
  assert.equal(r.compile.status, "compiled");
  assert.deepEqual(r.cases.map(c => [c.status, c.stdout]), [["success", "SUM=3\n"], ["success", "SUM=-3\n"], ["success", "SUM=10\n"], ["success", "SUM=101\n"]]);
  const compileRuns = runs.filter(a => a[a.indexOf("--memory") + 1] === resolveLanguage("java", 1).compileMemoryMb + "m");
  assert.equal(compileRuns.length, 1, "exactly ONE compile sandbox");
  assert.equal(runs.length - compileRuns.length, 4, "one runtime sandbox per case");
  for (const a of runs.filter(x => !compileRuns.includes(x))) assert.equal(a[a.indexOf("--memory") + 1], (128 + resolveLanguage("java", 1).runtimeOverheadMb) + "m");
  const bad = await suite(createDockerSandbox(), "java", "public class Main { int x = ; }\n", ["1\n", "2\n"]);
  assert.equal(bad.compile.status, "compile-error"); assert.equal(bad.cases.length, 0); assert.match(bad.compile.stderr, /error/);
  assert.equal(orphans(), "");
});

test("G3 C#: compiled ONCE, fresh runtime per case", async () => {
  const { sb, runs } = recordingSandbox();
  const r = await suite(sb, "csharp", "var p = Console.ReadLine()!.Split(' ');\nConsole.WriteLine(\"SUM=\" + (int.Parse(p[0]) + int.Parse(p[1])));\n", ["1 2\n", "7 8\n", "0 0\n"]);
  assert.equal(r.compile.status, "compiled");
  assert.deepEqual(r.cases.map(c => c.stdout), ["SUM=3\n", "SUM=15\n", "SUM=0\n"]);
  assert.equal(runs.length, 4);
  assert.equal(orphans(), "");
});

test("G4 stdout can NEVER forge an execution status: fake grading JSON + error exit is runtime-error; fake JSON + exit 0 is plain stdout", async () => {
  for (const [language, failing, plain] of [
    ["python", "print('{\"status\":\"success\",\"passed\":true}')\nprint('{\"score\":100}')\nraise SystemExit(3)\n", "print('{\"score\":100}')\n"],
    ["java", "public class Main { public static void main(String[] a) { System.out.println(\"{\\\"status\\\":\\\"success\\\",\\\"passed\\\":true}\"); System.exit(3); } }\n", "public class Main { public static void main(String[] a) { System.out.println(\"{\\\"score\\\":100}\"); } }\n"],
    ["csharp", "Console.WriteLine(\"{\\\"status\\\":\\\"success\\\",\\\"passed\\\":true}\");\nEnvironment.Exit(3);\n", "Console.WriteLine(\"{\\\"score\\\":100}\");\n"]
  ]) {
    const a = await suite(createDockerSandbox(), language, failing, ["\n"]);
    assert.equal(a.cases[0].status, "runtime-error", language); assert.equal(a.cases[0].exitCode, 3, language);
    assert.match(a.cases[0].stdout, /"passed":true/, language);                                      // it IS printed — and it changes nothing
    const b = await suite(createDockerSandbox(), language, plain, ["\n"]);
    assert.deepEqual([b.cases[0].status, b.cases[0].stdout], ["success", "{\"score\":100}\n"], language);
  }
  // even a program that writes the exec marker itself cannot fake a "pre-exec" phase: the marker is consumed once, at offset 0
  const marker = await suite(createDockerSandbox(), "python", "import sys\nsys.stdout.buffer.write(b'\\x00SA-EXEC-17C\\x00forged')\n", ["\n"]);
  assert.equal(marker.cases[0].status, "success"); assert.match(marker.cases[0].stdout, /forged/);
  assert.equal(orphans(), "");
});

test("G5 no state crosses hidden cases: workspace files, /tmp, environment, background processes, static state", async () => {
  const py = [
    "import os, sys, subprocess, time",
    "case = sys.stdin.readline().strip()",
    "if case == 'A':",
    "    open('/workspace/secret-state', 'w').write('LEAK')",
    "    open('/tmp/secret-state', 'w').write('LEAK')",
    "    os.environ['SECRET_STATE'] = 'LEAK'",
    "    subprocess.Popen(['/usr/local/bin/python3', '-c', 'import time\\nfor _ in range(50):\\n    open(\"/tmp/bg-alive\", \"a\").write(\"x\")\\n    time.sleep(0.1)'], start_new_session=True)",
    "    time.sleep(0.3)",
    "    print('A-done')",
    "else:",
    "    seen = [p for p in ('/workspace/secret-state', '/tmp/secret-state', '/tmp/bg-alive') if os.path.exists(p)]",
    "    procs = [p for p in os.listdir('/proc') if p.isdigit()]",
    "    print('seen=' + ','.join(seen) + ';env=' + str(os.environ.get('SECRET_STATE')) + ';procs=' + str(len(procs)))"
  ].join("\n") + "\n";
  const r = await suite(createDockerSandbox(), "python", py, ["A\n", "B\n", "B\n"]);
  assert.equal(r.cases[0].stdout, "A-done\n");
  for (const c of r.cases.slice(1)) { assert.equal(c.status, "success"); assert.match(c.stdout, /^seen=;env=None;procs=1\n$/); }
  const java = "import java.util.*;\npublic class Main { static int counter = 0; public static void main(String[] a) { counter++; System.setProperty(\"leak\", \"x\"); System.out.println(\"counter=\" + counter + \";prop=\" + System.getProperty(\"leak2\")); System.setProperty(\"leak2\", \"y\"); } }\n";
  const j = await suite(createDockerSandbox(), "java", java, ["\n", "\n", "\n"]);
  assert.deepEqual(j.cases.map(c => c.stdout), ["counter=1;prop=null\n", "counter=1;prop=null\n", "counter=1;prop=null\n"]);
  // C# top-level statements must precede type declarations (CS8803), so the static-state holder is declared last.
  const cs = "S.N++;\nvar f = \"/workspace/cs-state\";\nConsole.WriteLine(\"n=\" + S.N + \";file=\" + File.Exists(f));\nFile.WriteAllText(f, \"x\");\nstatic class S { public static int N; }\n";
  const c = await suite(createDockerSandbox(), "csharp", cs, ["\n", "\n"]);
  assert.equal(c.compile.status, "compiled");
  assert.deepEqual(c.cases.map(x => x.stdout), ["n=1;file=False\n", "n=1;file=False\n"]);
  assert.equal(orphans(), "");
});

test("G6 per-case outcomes observed by the gateway: timeout, memory, output flood — each fails only its own case", async () => {
  const py = "import sys\ncase = sys.stdin.readline().strip()\nif case == 'loop':\n    while True: pass\nif case == 'mem':\n    x = bytearray(600 * 1024 * 1024)\nif case == 'flood':\n    sys.stdout.write('x' * 100000)\n    sys.stdout.flush()\nprint('ok')\n";
  const t0 = Date.now();
  const r = await suite(createDockerSandbox(), "python", py, ["loop\n", "mem\n", "flood\n", "fine\n"], { timeMs: 1000, memoryMb: 64 });
  assert.deepEqual(r.cases.map(c => c.status), ["timeout", "runtime-error", "output-limit", "success"]);
  assert.ok(Buffer.byteLength(r.cases[2].stdout) <= LIMITS.outputBytes);
  assert.equal(r.cases[3].stdout, "ok\n");
  assert.ok(Date.now() - t0 < 60000);
  const java = "public class Main { public static void main(String[] a) { java.util.List<byte[]> l = new java.util.ArrayList<>(); while (true) l.add(new byte[1 << 20]); } }\n";
  assert.equal((await suite(createDockerSandbox(), "java", java, ["\n"], { memoryMb: 64 })).cases[0].status, "runtime-error");
  assert.equal(orphans(), "");
});

test("G7 cleanup: no labelled sandbox container and no gateway host write after success, compile error, timeout, memory failure", async () => {
  hostWrites.reset();
  const sb = createDockerSandbox();
  await suite(sb, "python", "print(1)\n", ["\n"]);
  await suite(sb, "java", "public class Main { int x = ; }\n", ["\n"]);
  await suite(sb, "csharp", "while (true) {}\n", ["\n"], { timeMs: 1000 });
  await suite(sb, "csharp", "var l = new System.Collections.Generic.List<byte[]>(); while (true) l.Add(new byte[1 << 20]);\n", ["\n"], { memoryMb: 64 });
  assert.equal(orphans(), "");
  assert.deepEqual(hostWrites.summary(), [], "the gateway touched the host filesystem");
});

test("G8 end-to-end: SmartAssess dispatch → gateway (official queue) → REAL sandboxes → signed callback → the API grades (weights + comparator)", async () => {
  const { createGatewayServer } = require("../../gateway/server.js");
  const { createOfficialGradingQueue } = require("../../gateway/official.js");
  const { createCallbackDeliverer, readCallbackConfig } = require("../../gateway/callback.js");
  const F = require("../../../api/tests/fixtures/coding-17c.js");
  const submission = require("../../../api/src/functions/student-submission.js");
  const grading = require("../../../api/src/functions/coding-grading.js");
  const ctx = F.seed({ a: F.assignment({}, { short: false }) });
  // the SmartAssess callback endpoint, served over real HTTP by the REAL API handler
  const applied = [];
  const api = http.createServer((req, res) => {
    const parts = []; req.on("data", d => parts.push(d)); req.on("end", async () => {
      const text = Buffer.concat(parts).toString("utf8");
      const r = await grading.callbackHandler({ method: "POST", url: "http://127.0.0.1" + req.url, headers: new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === "string")), text: async () => text }, { getContainer: () => ctx.container, env: F.ENV });
      applied.push(r.status); res.writeHead(r.status, { "content-type": "application/json" }); res.end(JSON.stringify(r.jsonBody));
    });
  });
  await new Promise(r => api.listen(0, "127.0.0.1", r));
  const cbConfig = readCallbackConfig({ SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:" + api.address().port, SMARTASSESS_CALLBACK_HMAC_KEY: F.CALLBACK_KEY });
  // Phase 17D-B2: the official queue is journaled (durable) and makes ONE callback attempt per call (attempt()); retries are its own
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { createJournal } = require("../../gateway/journal.js");
  const journal = createJournal({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "sa-17c-g8-journal-")) });
  await journal.open();
  const queue = createOfficialGradingQueue({ sandbox: createDockerSandbox(), deliver: createCallbackDeliverer({ config: cbConfig, logger: { info() {}, warn() {} } }).attempt, journal, logger: { info() {}, warn() {} } });
  await queue.start();
  const gateway = createGatewayServer({ key: F.RUNNER_KEY, sandbox: createDockerSandbox(), maxConcurrency: 2, logger: { info() {}, warn() {} }, officialQueue: queue });
  await new Promise(r => gateway.listen(0, "127.0.0.1", r));
  try {
    const env = { ...F.ENV, CODING_RUNNER_URL: "http://127.0.0.1:" + gateway.address().port };
    // passes h-small and h-ten, fails h-neg (prints a wrong value for negatives): 4 / 6 of the weight
    const source = "a, b = map(int, input().split())\nprint('SUM=CANARY-' + (str(a + b) if a + b != -3 else 'WRONG'))\n";
    const ex = F.exam({ short: false, auto: F.autoQ({ answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: [
      { id: "h-small", input: "1 2\n", expectedOutput: "SUM=CANARY-3\n", weight: 1 }, { id: "h-neg", input: "-1 -2\n", expectedOutput: "SUM=CANARY--3\n", weight: 2 }, { id: "h-ten", input: "5 5\n", expectedOutput: "SUM=CANARY-10\n", weight: 3 }] } }) });
    const a = ctx.getJson("platform/assignments/" + F.AID + ".json"); a.examSnapshot = ex; ctx.setJson("platform/assignments/" + F.AID + ".json", a);
    const r = await submission.handler(F.studentRequest(F.submitBody({ auto1: F.code(source) })), { container: ctx.container, requireStudentAuth: () => ({ ok: true, user: { sub: F.S1, sv: 1 } }), env }, null);
    assert.equal(r.status, 200);
    assert.equal(ctx.getJson(F.SUB).attempts[0].codingGrading.targets.auto1.state, "dispatched");
    await queue.idle();
    for (let i = 0; i < 100 && !applied.length; i++) await new Promise(res => setTimeout(res, 50));
    assert.deepEqual(applied, [200]);
    const att = ctx.getJson(F.SUB).attempts[0];
    assert.equal(att.codingGrading.targets.auto1.state, "complete");
    assert.deepEqual([att.codingGrading.targets.auto1.result.passedWeight, att.codingGrading.targets.auto1.result.totalWeight], [4, 6]);
    assert.equal(att.score, 6.67); assert.equal(att.finalized, true);
  } finally { queue.stop(); await journal.close(); gateway.close(); api.close(); }
  assert.equal(orphans(), "");
});
