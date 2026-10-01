"use strict";
// Phase 17B — runner unit tests (node:test, no Docker): request authentication, request validation, the language registry, the
// sandbox argument builder, result bounding and the HTTP gateway with an in-memory sandbox double that executes nothing.
// Run with `npm --prefix runner test`.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { signRequest, verifyRequest, createReplayGuard, MAX_SKEW_SECONDS } = require("../../gateway/auth.js");
const { validateExecuteRequest } = require("../../gateway/validate.js");
const { LANGUAGES, resolveLanguage, containerMemoryMb, hardWallMs } = require("../../gateway/registry.js");
const { buildDockerRunArgs, createDockerSandbox, boundResult } = require("../../gateway/sandbox.js");
const { createGatewayServer } = require("../../gateway/server.js");
const { readGatewayConfig } = require("../../gateway/main.js");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";
const LIMITS = { timeMs: 2000, memoryMb: 256, outputBytes: 65536 };
const REQ = { requestId: "req_abcdefghijklmnop", language: "python", languageVersion: 1, source: "print(input())", stdin: "7\n", limits: LIMITS };
const ts = () => String(Math.floor(Date.now() / 1000));
const signed = (body = REQ, over = {}) => { const raw = Buffer.from(JSON.stringify(body)); return { raw, headers: signRequest({ key: KEY, method: "POST", path: "/v1/execute", timestamp: ts(), requestId: body.requestId, body: raw, ...over }) }; };

test("auth: a correctly signed request verifies; every tampering is refused", () => {
  const { raw, headers } = signed();
  const v = o => verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers, body: raw, nowMs: Date.now(), replay: createReplayGuard(), ...o });
  assert.equal(v().ok, true);
  assert.equal(v({ body: Buffer.from(raw.toString().replace("print", "exec!")) }).ok, false);
  assert.equal(v({ key: "x".repeat(40) }).ok, false);
  assert.equal(v({ method: "GET" }).ok, false);
  assert.equal(v({ path: "/v1/capabilities" }).ok, false);
  assert.equal(v({ nowMs: Date.now() + (MAX_SKEW_SECONDS + 5) * 1000 }).ok, false);
  assert.equal(v({ headers: {} }).ok, false);
  const replay = createReplayGuard();
  assert.equal(v({ replay }).ok, true);
  assert.equal(v({ replay }).ok, false);
});

test("auth: the replay guard is bounded (old entries expire, the map never grows without limit)", () => {
  const g = createReplayGuard({ ttlMs: 1000, max: 3 });
  assert.equal(g.seen("a", 0), false); assert.equal(g.seen("a", 10), true);
  assert.equal(g.seen("a", 5000), false);                                         // expired → accepted again (outside the skew window anyway)
  for (const id of ["b", "c", "d", "e"]) g.seen(id, 5000);
  assert.ok(g.size() <= 3);
});

test("validate: exactly the minimal request; no image / command / flags / env / unknown keys; bounded fields", () => {
  assert.deepEqual(validateExecuteRequest(REQ), { ok: true, request: REQ });
  for (const bad of [{ ...REQ, image: "x" }, { ...REQ, command: ["sh"] }, { ...REQ, args: [] }, { ...REQ, env: {} }, { ...REQ, limits: { ...LIMITS, pids: 10 } },
    { ...REQ, language: "node" }, { ...REQ, languageVersion: 2 }, { ...REQ, source: "x".repeat(65537) }, { ...REQ, stdin: "y".repeat(16385) }, { ...REQ, requestId: "a b" },
    { ...REQ, limits: { ...LIMITS, timeMs: 100 } }, { ...REQ, limits: { ...LIMITS, memoryMb: 1024 } }, { ...REQ, limits: { ...LIMITS, outputBytes: 1 } }, Object.create({ polluted: 1 })]) {
    assert.equal(validateExecuteRequest(bad).ok, false, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(validateExecuteRequest(JSON.parse('{"__proto__":{"x":1},"requestId":"r1","language":"python","languageVersion":1,"source":"","stdin":"","limits":{"timeMs":2000,"memoryMb":256,"outputBytes":65536}}')).ok, false);
});

test("registry: three frozen entries mapping contract → fixed image and fixed ceilings", () => {
  assert.deepEqual(Object.keys(LANGUAGES).sort(), ["csharp@1", "java@1", "python@1"]);
  for (const e of Object.values(LANGUAGES)) {
    assert.ok(Object.isFrozen(e));
    assert.match(e.image, /^smartassess-coding-(python|java|csharp):17b-v1$/);
    assert.ok(containerMemoryMb(e, 16) >= 128 && containerMemoryMb(e, 512) <= 2048);
    assert.ok(hardWallMs(e, 10000) <= 60000 && hardWallMs(e, 250) > 250);
  }
  assert.equal(resolveLanguage("constructor", 1), undefined);
  assert.equal(resolveLanguage("toString", 1), undefined);
});

test("sandbox args: hardened profile; image last; nothing from the request except bounded numbers", () => {
  const a = buildDockerRunArgs({ name: "sa-coding-00112233445566778899aabb", entry: resolveLanguage("csharp", 1), limits: LIMITS });
  const s = a.join(" ");
  for (const f of ["--rm", "-i", "--read-only", "--network none", "--cap-drop ALL", "--security-opt no-new-privileges", "--pull never", "--log-driver none", "--cpus 1", "--user 10001:10001"]) assert.ok(s.includes(f), f);
  assert.doesNotMatch(s, /--privileged|-v |--volume|--mount|docker\.sock|--env|-e |--entrypoint|--cap-add/);
  assert.equal(a[a.length - 1], "smartassess-coding-csharp:17b-v1");
  assert.throws(() => buildDockerRunArgs({ name: "bad name; rm -rf /", entry: resolveLanguage("python", 1), limits: LIMITS }));
  assert.throws(() => buildDockerRunArgs({ name: "sa-coding-00112233445566778899aabb", entry: { image: "alpine" }, limits: LIMITS }));
});

test("boundResult: unknown statuses → internal-error; output re-capped UTF-8-safely; only numeric metadata kept", () => {
  assert.deepEqual(boundResult({ status: "pwned", stdout: "a", stderr: "", host: "x" }, 1024), { status: "internal-error", stdout: "a", stderr: "" });
  const r = boundResult({ status: "success", stdout: "é".repeat(600), stderr: "", exitCode: 0, durationMs: 5, env: { K: 1 } }, 1001);
  assert.equal(r.status, "output-limit"); assert.equal(Buffer.byteLength(r.stdout), 1000); assert.ok(!r.stdout.includes("�"));
  assert.deepEqual(Object.keys(r).sort(), ["durationMs", "exitCode", "status", "stderr", "stdout"]);
  assert.deepEqual(boundResult(null, 10), { status: "internal-error", stdout: "", stderr: "" });
});

function fakeSpawnFactory({ result, hang = false, stdoutFlood = 0 } = {}) {
  const spawned = [];
  const spawnImpl = (cmd, argv, opts) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const rec = { cmd, argv, opts, stdin: "", killed: false }; spawned.push(rec);
    child.stdin.on("data", d => { rec.stdin += d; });
    child.kill = () => { rec.killed = true; setImmediate(() => { child.stdout.end(); child.stderr.end(); child.emit("close", null, "SIGKILL"); }); };
    if (argv[0] === "run") {
      if (stdoutFlood) setImmediate(() => { child.stdout.write("x".repeat(stdoutFlood)); });
      else if (!hang) setImmediate(() => { child.stdout.end(JSON.stringify(result) + "\n"); child.stderr.end(); child.emit("close", 0, null); });
    } else setImmediate(() => { child.stdout.end(argv[0] === "image" ? "sha256:abc\n" : ""); child.stderr.end(); child.emit("close", 0, null); });
    return child;
  };
  return { spawnImpl, spawned };
}

test("docker sandbox: the payload is written to stdin (never argv / env / files); docker gets a minimal env; the container is always force-removed", async () => {
  const { spawnImpl, spawned } = fakeSpawnFactory({ result: { status: "success", stdout: "7\n", stderr: "", exitCode: 0, durationMs: 4 } });
  const sb = createDockerSandbox({ spawnImpl, env: { PATH: "/usr/bin", HOME: "/home/runner", RUNNER_HMAC_KEY: "LEAK", SECRET: "LEAK" } });
  const r = await sb.run(resolveLanguage("python", 1), REQ);
  assert.deepEqual(r, { status: "success", stdout: "7\n", stderr: "", exitCode: 0, durationMs: 4 });
  const run = spawned.find(s => s.argv[0] === "run");
  assert.equal(run.opts.shell, false);
  assert.doesNotMatch(JSON.stringify(run.opts.env), /LEAK/);
  assert.doesNotMatch(run.argv.join(" "), /print\(input/);
  const job = JSON.parse(run.stdin);
  assert.deepEqual(Object.keys(job).sort(), ["limits", "source", "stdin"]);
  assert.equal(job.source, REQ.source); assert.equal(job.stdin, REQ.stdin);
  const name = run.argv[run.argv.indexOf("--name") + 1];
  assert.match(name, /^sa-coding-[0-9a-f]{24}$/);
  assert.ok(spawned.some(s => s.argv[0] === "rm" && s.argv.includes("-f") && s.argv.includes(name)));
});

test("docker sandbox: a hung container hits the hard wall → timeout, killed by name, removed", async () => {
  const { spawnImpl, spawned } = fakeSpawnFactory({ hang: true });
  const sb = createDockerSandbox({ spawnImpl, env: {}, hardWallOverrideMs: 60 });
  const t0 = Date.now();
  const r = await sb.run(resolveLanguage("python", 1), REQ);
  assert.equal(r.status, "timeout");
  assert.ok(Date.now() - t0 < 2000);
  const run = spawned.find(s => s.argv[0] === "run");
  const name = run.argv[run.argv.indexOf("--name") + 1];
  assert.ok(spawned.some(s => s.argv[0] === "kill" && s.argv.includes(name)));
  assert.ok(spawned.some(s => s.argv[0] === "rm" && s.argv.includes(name)));
});

test("docker sandbox: an oversized result stream is cut off while reading (never buffered unbounded) → internal-error", async () => {
  const { spawnImpl, spawned } = fakeSpawnFactory({ stdoutFlood: 8 * 1024 * 1024 });
  const sb = createDockerSandbox({ spawnImpl, env: {} });
  const r = await sb.run(resolveLanguage("python", 1), { ...REQ, limits: { ...LIMITS, outputBytes: 1024 } });
  assert.equal(r.status, "internal-error");
  assert.ok(spawned.find(s => s.argv[0] === "run").killed);
});

test("docker sandbox: capabilities report only images that exist on the host", async () => {
  const spawnImpl = (cmd, argv) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
    setImmediate(() => { child.stdout.end(); child.stderr.end(); child.emit("close", argv.includes("smartassess-coding-java:17b-v1") ? 1 : 0, null); });
    return child;
  };
  const sb = createDockerSandbox({ spawnImpl, env: {} });
  assert.deepEqual(await sb.availableLanguages(), [{ key: "python", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }]);
});

test("gateway HTTP: signed execute → one sandbox run; unsigned → 401; busy → 503 RUNNER_BUSY; body cap → 413; health reveals nothing", async () => {
  let release; const hold = new Promise(r => { release = r; });
  const runs = [];
  const sandbox = { availableLanguages: async () => [{ key: "python", languageVersion: 1 }], run: async (e, r) => { runs.push(r); await hold; return { status: "success", stdout: "ok", stderr: "" }; } };
  const server = createGatewayServer({ key: KEY, sandbox, maxConcurrency: 1, logger: { info() {}, warn() {} } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const send = (path, method, raw, headers) => new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port, path, method, headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(p).toString() })); });
    q.on("error", reject); q.end(raw);
  });
  try {
    const a = signed({ ...REQ, requestId: "req_0000000000000001" });
    const first = send("/v1/execute", "POST", a.raw, a.headers);
    await new Promise(r => setTimeout(r, 30));
    const b = signed({ ...REQ, requestId: "req_0000000000000002" });
    const busy = await Promise.race([send("/v1/execute", "POST", b.raw, b.headers), new Promise(r => setTimeout(() => r({ status: "no-answer-within-3s", body: "null" }), 3000))]);   // immediate, never queued
    assert.equal(busy.status, 503); assert.deepEqual(JSON.parse(busy.body), { ok: false, code: "RUNNER_BUSY" });
    release();
    assert.equal((await first).status, 200);
    assert.equal(runs.length, 1);
    assert.equal((await send("/v1/execute", "POST", a.raw, { "content-type": "application/json" })).status, 401);
    const huge = Buffer.alloc(2 * 1024 * 1024, 0x61);
    assert.equal((await send("/v1/execute", "POST", huge, signed().headers)).status, 413);
    const health = await send("/healthz", "GET", undefined, {});
    assert.equal(health.status, 200); assert.deepEqual(JSON.parse(health.body), { ok: true });
  } finally { release(); server.close(); }
});

test("main: the gateway refuses to start without a strong key; defaults bind to loopback; concurrency is bounded", () => {
  assert.throws(() => readGatewayConfig({}));
  assert.throws(() => readGatewayConfig({ RUNNER_HMAC_KEY: "short" }));
  const c = readGatewayConfig({ RUNNER_HMAC_KEY: KEY });
  assert.equal(c.host, "127.0.0.1"); assert.ok(c.maxConcurrency >= 1 && c.maxConcurrency <= 16);
  assert.equal(readGatewayConfig({ RUNNER_HMAC_KEY: KEY, RUNNER_MAX_CONCURRENCY: "999" }).maxConcurrency, 16);
  assert.doesNotMatch(JSON.stringify(c), new RegExp(KEY));
});
