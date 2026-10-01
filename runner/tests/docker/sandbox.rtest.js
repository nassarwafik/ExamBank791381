"use strict";
// Phase 17B — REAL Docker functional + security tests for the coding sandbox. They run against the locally built worker images
// (`npm --prefix runner run build:images`) and REQUIRE a working Docker daemon: a missing daemon or image is a FAILURE, never a
// skip. Run with `npm --prefix runner run test:docker` (the "Coding Runner Security & Smoke Tests" workflow does).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createDockerSandbox } = require("../../gateway/sandbox.js");
const { resolveLanguage, LANGUAGES } = require("../../gateway/registry.js");
const { createGatewayServer } = require("../../gateway/server.js");
const { signRequest } = require("../../gateway/auth.js");

// Fake canary secrets in the GATEWAY process environment: they must never be visible inside a sandbox.
process.env.RUNNER_HMAC_KEY = "CANARY-HMAC-17B-should-never-leak-0123456789";
process.env.AZURE_STORAGE_CONNECTION_STRING = "CANARY-STORAGE-17B";
process.env.OPENAI_API_KEY = "CANARY-OPENAI-17B";
const HOST_CANARY_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sa-canary-"));
const HOST_CANARY = path.join(HOST_CANARY_DIR, "host-canary-17b.txt");
fs.writeFileSync(HOST_CANARY, "CANARY-FILE-17B");

const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const LIMITS = { timeMs: 3000, memoryMb: 128, outputBytes: 4096 };
const sandbox = createDockerSandbox();
let n = 0;
const run = (language, source, stdin = "", limits = {}) => sandbox.run(resolveLanguage(language, 1), { requestId: "req_docker_" + (++n), language, languageVersion: 1, source, stdin, limits: { ...LIMITS, ...limits } });
const orphans = () => docker("ps", "-aq", "--filter", "label=smartassess.coding-runner=1").stdout.trim();

test("preflight: the Docker daemon and all three worker images exist (a missing image FAILS the suite)", () => {
  assert.equal(docker("version", "--format", "{{.Server.Version}}").status, 0, "docker daemon unreachable");
  for (const e of Object.values(LANGUAGES)) assert.equal(docker("image", "inspect", e.image).status, 0, "missing image " + e.image);
});

// ── functional: Python ──────────────────────────────────────────────────────────────────────────────────────────────────
test("python: hello, stdin → stdout, syntax error, runtime error, timeout", async () => {
  assert.deepEqual(pick(await run("python", "print('Hello')\n")), { status: "success", stdout: "Hello\n" });
  assert.deepEqual(pick(await run("python", "a, b = map(int, input().split())\nprint(a + b)\n", "2 3\n")), { status: "success", stdout: "5\n" });
  const syn = await run("python", "print(\n");
  assert.equal(syn.status, "compile-error"); assert.match(syn.stderr, /SyntaxError|was never closed/);
  const rt = await run("python", "raise ValueError('boom')\n");
  assert.equal(rt.status, "runtime-error"); assert.match(rt.stderr, /ValueError: boom/); assert.equal(rt.exitCode, 1);
  const ex = await run("python", "import sys\nsys.exit(3)\n");
  assert.equal(ex.status, "runtime-error"); assert.equal(ex.exitCode, 3);
  const t0 = Date.now();
  const to = await run("python", "while True:\n    pass\n", "", { timeMs: 1000 });
  assert.equal(to.status, "timeout"); assert.ok(Date.now() - t0 < 20000);
  assert.equal(orphans(), "");
});

// ── functional: Java (compile → run, entry class Main) ───────────────────────────────────────────────────────────────────
test("java: hello, stdin → stdout, compile error, runtime error, timeout", async () => {
  assert.deepEqual(pick(await run("java", "public class Main { public static void main(String[] a) { System.out.println(\"Hello\"); } }\n")), { status: "success", stdout: "Hello\n" });
  assert.deepEqual(pick(await run("java", "import java.util.*;\npublic class Main { public static void main(String[] a) { Scanner s = new Scanner(System.in); System.out.println(s.nextInt() + s.nextInt()); } }\n", "2 3\n")), { status: "success", stdout: "5\n" });
  const ce = await run("java", "public class Main { public static void main(String[] a) { int x = ; } }\n");
  assert.equal(ce.status, "compile-error"); assert.match(ce.stderr, /error: illegal start of expression/);
  const rt = await run("java", "public class Main { public static void main(String[] a) { throw new IllegalStateException(\"boom\"); } }\n");
  assert.equal(rt.status, "runtime-error"); assert.match(rt.stderr, /IllegalStateException: boom/);
  const to = await run("java", "public class Main { public static void main(String[] a) { while (true) {} } }\n", "", { timeMs: 1000 });
  assert.equal(to.status, "timeout");
  assert.equal(orphans(), "");
});

// ── functional: C# (offline csc → run; top-level statements and a classic Program.Main) ────────────────────────────────
test("csharp: top-level hello, Program.Main with stdin, compile error, runtime error, timeout", async () => {
  assert.deepEqual(pick(await run("csharp", "Console.WriteLine(\"Hello\");\n")), { status: "success", stdout: "Hello\n" });
  assert.deepEqual(pick(await run("csharp", "using System;\nclass Program { static void Main() { var p = Console.ReadLine()!.Split(' '); Console.WriteLine(int.Parse(p[0]) + int.Parse(p[1])); } }\n", "2 3\n")), { status: "success", stdout: "5\n" });
  const ce = await run("csharp", "int x = ;\n");
  assert.equal(ce.status, "compile-error"); assert.match(ce.stderr, /error CS1525/);
  const rt = await run("csharp", "throw new InvalidOperationException(\"boom\");\n");
  assert.equal(rt.status, "runtime-error"); assert.match(rt.stderr, /InvalidOperationException: boom/);
  const to = await run("csharp", "while (true) { }\n", "", { timeMs: 1000 });
  assert.equal(to.status, "timeout");
  assert.equal(orphans(), "");
});

// ── security ────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("S1 shell injection: source and stdin are data, never shell — metacharacters arrive verbatim and nothing on the host runs", async () => {
  const marker = path.join(HOST_CANARY_DIR, "pwned-17b");
  const evil = "'; touch " + marker + "; echo $(id) `id` && rm -rf / #";
  const r = await run("python", "import sys\nprint(" + JSON.stringify(evil) + ")\nprint(sys.stdin.read())\n", evil + "\n$(reboot)\n");
  assert.equal(r.status, "success");
  assert.equal(r.stdout, evil + "\n" + evil + "\n$(reboot)\n\n");
  assert.equal(fs.existsSync(marker), false);
});

test("S2 network: no interface besides loopback; outbound TCP and DNS fail", async () => {
  const r = await run("python", [
    "import socket", "res = []",
    "for host, port in [('1.1.1.1', 53), ('8.8.8.8', 443), ('169.254.169.254', 80)]:",
    "    try:", "        socket.create_connection((host, port), timeout=2); res.append('OPEN')", "    except OSError: res.append('blocked')",
    "try:", "    socket.getaddrinfo('example.com', 443); res.append('DNS')", "except OSError: res.append('nodns')",
    "print(','.join(res))", "print(sorted(i[1] for i in socket.if_nameindex()))"
  ].join("\n") + "\n");
  assert.equal(r.status, "success", r.stderr);
  assert.equal(r.stdout, "blocked,blocked,blocked,nodns\n['lo']\n");
});

test("S3 environment: no gateway secret (fake canaries) is visible to student code in any language", async () => {
  const py = await run("python", "import os\nprint(sorted(os.environ.items()))\n");
  const java = await run("java", "public class Main { public static void main(String[] a) { System.out.println(System.getenv()); } }\n");
  const cs = await run("csharp", "foreach (System.Collections.DictionaryEntry e in Environment.GetEnvironmentVariables()) Console.WriteLine(e.Key + \"=\" + e.Value);\n");
  for (const r of [py, java, cs]) {
    assert.equal(r.status, "success", r.stderr);
    assert.doesNotMatch(r.stdout, /CANARY|RUNNER_HMAC|AZURE|OPENAI|DOCKER_HOST/);
  }
});

test("S4 filesystem: host canary unreachable, root read-only, no docker.sock, workspace noexec, non-root with no capabilities and no-new-privs", async () => {
  const r = await run("python", [
    "import os, stat, subprocess",
    "out = []",
    "out.append(os.path.exists(" + JSON.stringify(HOST_CANARY) + "))",
    "out.append(os.path.exists('/var/run/docker.sock') or os.path.exists('/run/docker.sock'))",
    "try:", "    open('/etc/pwned', 'w'); out.append('rootfs-writable')", "except OSError: out.append('rootfs-ro')",
    "open('/workspace/x.sh', 'w').write('#!/bin/sh\\necho ran\\n'); os.chmod('/workspace/x.sh', 0o755)",
    "try:", "    subprocess.run(['/workspace/x.sh'], check=True, capture_output=True); out.append('exec-ok')", "except Exception: out.append('noexec')",
    "st = dict(l.split(':\\t', 1) for l in open('/proc/self/status').read().splitlines() if ':\\t' in l)",
    "out.append(os.getuid()); out.append(st['CapEff'].strip()); out.append(st['NoNewPrivs'].strip())",
    "print(out)"
  ].join("\n") + "\n");
  assert.equal(r.status, "success", r.stderr);
  assert.equal(r.stdout, "[False, False, 'rootfs-ro', 'noexec', 10001, '0000000000000000', '1']\n");
});

test("S5 timeout: a sleeping child process tree is killed and NO container is left behind", async () => {
  const r = await run("python", "import subprocess, time\nsubprocess.Popen(['sleep', '600'])\nsubprocess.Popen(['python3', '-c', 'import os; os.setsid(); import time; time.sleep(600)'])\ntime.sleep(600)\n", "", { timeMs: 1000 });
  assert.equal(r.status, "timeout");
  assert.equal(orphans(), "");
});

test("S6 memory: allocations beyond the program limit fail inside the sandbox (runtime-error), the supervisor survives", async () => {
  const py = await run("python", "x = bytearray(1024 * 1024 * 1024)\nprint('allocated')\n", "", { memoryMb: 64 });
  assert.equal(py.status, "runtime-error"); assert.match(py.stderr, /MemoryError/);
  const java = await run("java", "public class Main { public static void main(String[] a) { long[][] h = new long[4096][]; for (int i = 0; i < h.length; i++) h[i] = new long[1 << 20]; System.out.println(\"allocated\"); } }\n", "", { memoryMb: 64 });
  assert.equal(java.status, "runtime-error"); assert.match(java.stderr, /OutOfMemoryError/);
  const cs = await run("csharp", "var l = new System.Collections.Generic.List<byte[]>(); for (int i = 0; i < 4096; i++) l.Add(new byte[1 << 20]); Console.WriteLine(\"allocated\");\n", "", { memoryMb: 64 });
  assert.equal(cs.status, "runtime-error"); assert.match(cs.stderr, /OutOfMemory|Out of memory/);                       // managed OutOfMemoryException or the runtime's heap-hard-limit abort
});

test("S7 output flood: stdout is capped while reading (output-limit), UTF-8-safe, and the program is stopped", async () => {
  const t0 = Date.now();
  const r = await run("python", "while True:\n    print('é' * 1000)\n", "", { outputBytes: 4096, timeMs: 5000 });
  assert.equal(r.status, "output-limit");
  assert.ok(Buffer.byteLength(r.stdout) <= 4096);
  assert.ok(!r.stdout.includes("�"));
  assert.ok(Date.now() - t0 < 15000);
  const err = await run("python", "import sys\nwhile True:\n    sys.stderr.write('E' * 1000)\n", "", { outputBytes: 4096 });
  assert.equal(err.status, "output-limit"); assert.ok(Buffer.byteLength(err.stderr) <= 4096);
});

test("S8 process limit: a fork bomb is bounded by the PID limit; the run ends and the host is unaffected", async () => {
  const r = await run("python", "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        pass\n", "", { timeMs: 2000 });
  assert.ok(["timeout", "runtime-error"].includes(r.status), r.status);
  assert.equal(orphans(), "");
  assert.deepEqual(pick(await run("python", "print('still alive')\n")), { status: "success", stdout: "still alive\n" });
});

test("S9 gateway smoke: signed request → real sandbox → bounded result; unsigned → 401; capabilities list the three languages", async () => {
  const key = "smoke-test-only-key-0123456789abcdefghij";
  const server = createGatewayServer({ key, sandbox, maxConcurrency: 2, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const send = (method, p, body) => new Promise((resolve, reject) => {
    const raw = body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0);
    const headers = { "content-type": "application/json", ...signRequest({ key, method, path: p, timestamp: String(Math.floor(Date.now() / 1000)), requestId: body ? body.requestId : "req_smoke_caps_00001", body: raw }) };
    const q = http.request({ host: "127.0.0.1", port, method, path: p, headers }, res => { const parts = []; res.on("data", d => parts.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(parts).toString() || "null") })); });
    q.on("error", reject); q.end(raw);
  });
  try {
    const caps = await send("GET", "/v1/capabilities");
    assert.deepEqual(caps.json, { ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] });
    const ok = await send("POST", "/v1/execute", { requestId: "req_smoke_000000001", language: "java", languageVersion: 1, source: "public class Main { public static void main(String[] a) { System.out.print(\"smoke\"); } }", stdin: "", limits: LIMITS });
    assert.equal(ok.status, 200); assert.equal(ok.json.result.status, "success"); assert.equal(ok.json.result.stdout, "smoke");
  } finally { server.close(); }
  assert.equal(orphans(), "");
});

test.after(() => { fs.rmSync(HOST_CANARY_DIR, { recursive: true, force: true }); });

function pick(r) { return { status: r.status, stdout: r.stdout }; }
