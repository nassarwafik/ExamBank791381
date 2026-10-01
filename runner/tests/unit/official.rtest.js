"use strict";
// Phase 17C — runner unit tests (node:test, no Docker) for OFFICIAL grading execution:
//   • a strict, bounded official job request (no expected output / weight / identity / image / command / mount / callback URL);
//   • a bounded in-process queue: dedupe by jobId + payload hash (same → idempotent, different → JOB_ID_CONFLICT), bounded
//     pending / active jobs, bounded per-suite case concurrency, a server-owned job hard wall;
//   • compile ONCE per job for compiled languages, a FRESH runtime sandbox per hidden case;
//   • raw-runtime authority: the status comes from the gateway's observation of the process (exec marker, exit code, wall clock,
//     byte counts) — never from anything the program prints;
//   • callback delivery: fixed trusted destination, HMAC-signed, bounded retry with backoff, no redirects, result cache.
// Fail-first on 543fa9f4: runner/gateway/official.js, runner/gateway/callback.js and the official sandbox path do not exist.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { signRequest } = require("../../gateway/auth.js");
const { resolveLanguage } = require("../../gateway/registry.js");
const { createGatewayServer } = require("../../gateway/server.js");

const official = () => require("../../gateway/official.js");
const callback = () => require("../../gateway/callback.js");
const sandboxMod = () => require("../../gateway/sandbox.js");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";
const CB_KEY = "test-only-callback-hmac-key-fedcba9876543210";
const LIMITS = { timeMs: 2000, memoryMb: 128, outputBytes: 17408 };
const JOB = { jobId: "cg_abcdefghijklmnopqrstuv", language: "python", languageVersion: 1, source: "print(input())", cases: [{ token: "c01", stdin: "1\n" }, { token: "c02", stdin: "2\n" }], limits: LIMITS };
const ts = () => String(Math.floor(Date.now() / 1000));
const rid = n => "req_official_" + String(n).padStart(8, "0");
const sleep = ms => new Promise(r => setTimeout(r, ms));

test("F1 strict official request: exactly {jobId, language, languageVersion, source, cases[{token, stdin}], limits}; everything else refused", () => {
  const { validateOfficialJobRequest, OFFICIAL_BOUNDS } = official();
  assert.deepEqual(validateOfficialJobRequest(JOB), { ok: true, job: JOB });
  const bad = [
    { ...JOB, image: "alpine" }, { ...JOB, command: ["sh"] }, { ...JOB, entrypoint: "/bin/sh" }, { ...JOB, flags: ["--privileged"] }, { ...JOB, mounts: ["/:/host"] },
    { ...JOB, volume: "/x" }, { ...JOB, env: { A: "1" } }, { ...JOB, network: "host" }, { ...JOB, user: "0:0" }, { ...JOB, callbackUrl: "https://evil.test" },
    { ...JOB, limits: { ...LIMITS, memoryCeilingMb: 4096 } }, { ...JOB, limits: { ...LIMITS, cpus: 8 } }, { ...JOB, limits: { ...LIMITS, pidsLimit: 9999 } },
    { ...JOB, cases: [{ token: "c01", stdin: "1", expectedOutput: "1" }] }, { ...JOB, cases: [{ token: "c01", stdin: "1", weight: 3 }] }, { ...JOB, cases: [{ token: "c01", stdin: "1", title: "t" }] },
    { ...JOB, studentId: "s1" }, { ...JOB, marks: 10 }, { ...JOB, score: 1 },
    { ...JOB, jobId: "bad id" }, { ...JOB, language: "javascript" }, { ...JOB, languageVersion: 2 }, { ...JOB, source: "x".repeat(65537) },
    { ...JOB, cases: [] }, { ...JOB, cases: Array.from({ length: 51 }, (_, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin: "" })) },
    { ...JOB, cases: [{ token: "c01", stdin: "x".repeat(16385) }] }, { ...JOB, cases: [{ token: "x01", stdin: "" }] }, { ...JOB, cases: [{ token: "c01", stdin: "" }, { token: "c01", stdin: "" }] },
    { ...JOB, cases: Array.from({ length: 20 }, (_, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin: "y".repeat(16000) })) },
    { ...JOB, limits: { ...LIMITS, outputBytes: OFFICIAL_BOUNDS.outputBytes[1] + 1 } }, { ...JOB, limits: { ...LIMITS, timeMs: 10001 } }, { ...JOB, limits: { ...LIMITS, memoryMb: 1024 } },
    null, [], "x", Object.create({ jobId: "x" })
  ];
  for (const b of bad) assert.equal(validateOfficialJobRequest(b).ok, false, JSON.stringify(b)?.slice(0, 90));
});

/** A fake official sandbox: records every suite it is asked to run; `behaviour(job)` decides the raw evidence. */
function fakeSandbox(behaviour) {
  const suites = [];
  return {
    suites,
    availableLanguages: async () => [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }],
    run: async () => ({ status: "success", stdout: "", stderr: "" }),
    async runOfficialSuite(entry, job, opts = {}) {
      suites.push({ entry, job, opts });
      if (behaviour) return behaviour(job, opts);
      return { cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "out:" + c.stdin, stderr: "", exitCode: 0, durationMs: 1 })) };
    },
    sweep: async () => 0
  };
}

/** Phase 17D-B2 — the official queue requires a DURABLE journal: a real one in a fresh temporary directory, started (recovered). */
async function journaledQueue(opts) {
  const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
  const { createJournal } = require("../../gateway/journal.js");
  const journal = createJournal({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "sa-17c-journal-")) });
  await journal.open();
  const q = official().createOfficialGradingQueue({ journal, ...opts });
  await q.start();
  return q;
}

test("F2 queue: dedupe by jobId + payload hash; bounded pending; results delivered once; the DURABLE journal answers a re-dispatch without re-running", async () => {
  const delivered = [];
  let open;
  const gate = new Promise(r => { open = r; });                                                  // keeps the first job running
  const sb = fakeSandbox(async job => { await gate; return { cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "out:" + c.stdin, stderr: "", exitCode: 0, durationMs: 1 })) }; });
  const q = await journaledQueue({ sandbox: sb, deliver: async r => { delivered.push(r); return { delivered: true }; }, maxPending: 2, maxActive: 1, logger: { info() {}, warn() {} } });
  assert.equal((await q.submit(JOB)).status, "accepted");
  assert.equal((await q.submit(JSON.parse(JSON.stringify(JOB)))).status, "duplicate");
  assert.equal((await q.submit({ ...JOB, source: "print('replacement code')" })).status, "conflict");
  assert.equal((await q.submit({ ...JOB, jobId: "cg_second00000000000000" })).status, "accepted");
  assert.equal((await q.submit({ ...JOB, jobId: "cg_third000000000000000" })).status, "busy");    // maxPending 2 (one active, one queued)
  open();
  await q.idle();
  assert.equal(sb.suites.length, 2);
  assert.deepEqual(delivered.map(d => d.jobId).sort(), ["cg_abcdefghijklmnopqrstuv", "cg_second00000000000000"]);
  assert.equal(delivered[0].outcome, "completed");
  for (const d of delivered) for (const c of d.cases) assert.deepEqual(Object.keys(c).sort().filter(k => !["durationMs", "exitCode"].includes(k)), ["status", "stderr", "stdout", "token"]);
  // completed job re-dispatched: answered from the journal WITHOUT re-running student code; SmartAssess already CONFIRMED the
  // result, so it is not delivered again (Phase 17D-B2 — an UNconfirmed result is retried from the journal instead)
  assert.equal((await q.submit(JOB)).status, "duplicate");
  await q.idle();
  assert.equal(sb.suites.length, 2);
  assert.equal(delivered.length, 2);
  assert.equal((await q.submit({ ...JOB, source: "print('swap after completion')" })).status, "conflict");
  q.stop();
});

test("F3 the job hard wall is server-owned and bounded; a suite that overruns it is a TECHNICAL failure (never a partial grade)", async () => {
  const { officialJobWallMs, OFFICIAL_JOB_MAX_MS } = official();
  const java = resolveLanguage("java", 1);
  const maxJob = { ...JOB, language: "java", cases: Array.from({ length: 50 }, (_, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin: "" })), limits: { ...LIMITS, timeMs: 10000 } };
  assert.ok(officialJobWallMs(java, maxJob) <= OFFICIAL_JOB_MAX_MS);
  assert.ok(OFFICIAL_JOB_MAX_MS <= 30 * 60 * 1000);
  assert.ok(officialJobWallMs(java, JOB) < officialJobWallMs(java, maxJob));
  const delivered = [];
  const hang = fakeSandbox((job, opts) => new Promise((_, reject) => { opts.signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
  const q = await journaledQueue({ sandbox: hang, deliver: async r => { delivered.push(r); return { delivered: true }; }, jobWallMsFor: () => 50, logger: { info() {}, warn() {} } });
  await q.submit(JOB);
  await q.idle();
  q.stop();
  assert.equal(delivered.length, 1);
  assert.deepEqual({ outcome: delivered[0].outcome, technicalCode: delivered[0].technicalCode, cases: delivered[0].cases }, { outcome: "failed", technicalCode: "SUITE_TIMEOUT", cases: [] });
});

test("F4 an internal sandbox failure is reported as a technical outcome, never as a student failure / zero", async () => {
  const delivered = [];
  const q = await journaledQueue({ sandbox: fakeSandbox(() => { throw new Error("docker daemon gone"); }), deliver: async r => { delivered.push(r); return { delivered: true }; }, logger: { info() {}, warn() {} } });
  await q.submit(JOB); await q.idle(); q.stop();
  assert.equal(delivered[0].outcome, "failed"); assert.equal(delivered[0].technicalCode, "RUNNER_INTERNAL");
});

/** A fake docker CLI that answers official runtime sandboxes with raw process evidence. `program(job, stdin)` → { stdout, stderr, code, hang, marker }. */
function officialDocker(program) {
  const spawned = [];
  const spawnImpl = (cmd, argv, opts) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    const rec = { cmd, argv, opts, stdin: Buffer.alloc(0), killed: false }; spawned.push(rec);
    child.kill = () => { rec.killed = true; setImmediate(() => { child.stdout.end(); child.stderr.end(); child.emit("close", null, "SIGKILL"); }); };
    child.stdin.on("data", d => { rec.stdin = Buffer.concat([rec.stdin, d]); });
    child.stdin.on("finish", () => setImmediate(() => {
      if (argv[0] !== "run") { child.stdout.end(""); child.stderr.end(); child.emit("close", 0, null); return; }
      const text = rec.stdin.toString("utf8");
      if (text.startsWith("{")) {                                                                    // compile sandbox (trusted compiler envelope)
        const job = JSON.parse(text);
        child.stdout.end(JSON.stringify(job.phase === "compile" ? { status: "compiled", artifact: [{ path: "Main.class", data: Buffer.from("cafebabe").toString("base64") }] } : { status: "internal-error", stdout: "", stderr: "" }) + "\n");
        child.stderr.end(); child.emit("close", 0, null); return;
      }
      const m = /^SAOFF1 (\d{10})\n/.exec(text);
      const setup = JSON.parse(rec.stdin.subarray(18, 18 + Number(m[1])).toString("utf8"));
      const stdin = rec.stdin.subarray(18 + Number(m[1])).toString("utf8");
      rec.setup = setup; rec.caseStdin = stdin;
      const p = program(setup, stdin);
      if (p.hang) { if (p.marker !== false) child.stdout.write(sandboxMod().OFFICIAL_EXEC_MARKER); if (p.stdout) child.stdout.write(p.stdout); return; }
      child.stdout.end(Buffer.concat([p.marker === false ? Buffer.alloc(0) : Buffer.from(sandboxMod().OFFICIAL_EXEC_MARKER, "latin1"), Buffer.from(p.stdout || "", "utf8")]));
      child.stderr.end(p.stderr || "");
      child.emit("close", p.code === undefined ? 0 : p.code, null);
    }));
    return child;
  };
  return { spawnImpl, spawned };
}

test("F5 raw-runtime AUTHORITY: status comes from the gateway's observation (marker, exit code, wall clock, bytes) — never from the program's stdout", async () => {
  const fake = officialDocker((setup, stdin) => {
    if (stdin === "fake-success\n") return { stdout: '{"status":"success","passed":true,"score":100}\n', code: 1 };
    if (stdin === "fake-json-ok\n") return { stdout: '{"score":100}\n', code: 0 };
    if (stdin === "flood\n") return { stdout: "x".repeat(40000), code: 0 };
    if (stdin === "oom\n") return { stdout: "partial", code: 137 };
    if (stdin === "nomarker\n") return { stdout: "", code: 125, marker: false };
    if (stdin === "hang\n") return { hang: true, stdout: "still running" };
    return { stdout: "echo:" + stdin, stderr: "warn", code: 0 };
  });
  const sb = sandboxMod().createDockerSandbox({ spawnImpl: fake.spawnImpl, env: {}, officialWallOverrideMs: 400 });
  const job = { ...JOB, cases: ["fake-success\n", "fake-json-ok\n", "flood\n", "oom\n", "nomarker\n", "hang\n", "plain\n"].map((stdin, i) => ({ token: "c0" + (i + 1), stdin })) };
  const r = await sb.runOfficialSuite(resolveLanguage("python", 1), job, { signal: new AbortController().signal });
  const by = Object.fromEntries(r.cases.map(c => [c.token, c]));
  assert.equal(by.c01.status, "runtime-error"); assert.equal(by.c01.exitCode, 1); assert.equal(by.c01.stdout, '{"status":"success","passed":true,"score":100}\n');
  assert.equal(by.c02.status, "success"); assert.equal(by.c02.stdout, '{"score":100}\n');            // just stdout; the API decides with the comparator
  assert.equal(by.c03.status, "output-limit"); assert.ok(Buffer.byteLength(by.c03.stdout) <= LIMITS.outputBytes);
  assert.equal(by.c04.status, "runtime-error"); assert.equal(by.c04.exitCode, 137);
  assert.equal(by.c05.status, "internal-error");                                                    // no exec marker → student code never ran
  assert.equal(by.c06.status, "timeout");
  assert.deepEqual([by.c07.status, by.c07.stdout, by.c07.stderr], ["success", "echo:plain\n", "warn"]);
  for (const c of r.cases) for (const k of Object.keys(c)) assert.ok(["token", "status", "stdout", "stderr", "exitCode", "durationMs"].includes(k), k);
});

test("F6 compile ONCE, then a FRESH runtime sandbox per case (never reused), the artifact in memory only, hardened argv for every container", async () => {
  const fake = officialDocker((setup, stdin) => ({ stdout: "ok:" + stdin, code: 0 }));
  const sb = sandboxMod().createDockerSandbox({ spawnImpl: fake.spawnImpl, env: {} });
  const job = { ...JOB, language: "java", source: "public class Main{}", cases: [1, 2, 3, 4].map(i => ({ token: "c0" + i, stdin: i + "\n" })) };
  const r = await sb.runOfficialSuite(resolveLanguage("java", 1), job, { signal: new AbortController().signal });
  assert.deepEqual(r.compile && r.compile.status, "compiled");
  assert.equal(r.cases.length, 4);
  const runs = fake.spawned.filter(s => s.argv[0] === "run");
  assert.equal(runs.length, 5);                                                                        // 1 compile + 4 runtime
  const compile = runs.filter(s => s.stdin.toString("utf8").startsWith("{"));
  assert.equal(compile.length, 1);
  const runtimes = runs.filter(s => s.setup);
  const names = runtimes.map(s => s.argv[s.argv.indexOf("--name") + 1]);
  assert.equal(new Set(names).size, 4);                                                                // a fresh container per case
  for (const s of runtimes) {
    assert.ok(!("source" in s.setup), "a compiled language's runtime never receives the source");
    assert.deepEqual(s.setup.artifact, [{ path: "Main.class", data: Buffer.from("cafebabe").toString("base64") }]);
    for (const f of ["--rm", "--network", "--read-only", "--cap-drop", "--pids-limit", "--user", "--memory", "--tmpfs"]) assert.ok(s.argv.includes(f), f);
    assert.doesNotMatch(s.argv.join(" "), /--entrypoint|-v |--volume|--mount|docker\.sock|--env|--privileged|--cidfile/);
    assert.equal(s.opts.shell, false);
    assert.equal(s.argv[s.argv.indexOf("--memory") + 1], (128 + resolveLanguage("java", 1).runtimeOverheadMb) + "m");   // 17B runtime ceiling unchanged
    assert.ok(fake.spawned.some(x => x.argv[0] === "rm" && x.argv.includes(s.argv[s.argv.indexOf("--name") + 1])), "every runtime container is force-removed");
  }
  // a compile error stops the suite: NO runtime sandbox
  const fail = officialDocker(() => ({ stdout: "", code: 0 }));
  const failSpawn = (cmd, argv, opts) => { const c = fail.spawnImpl(cmd, argv, opts); if (argv[0] === "run") { const rec = fail.spawned.at(-1); c.stdin.removeAllListeners("finish"); c.stdin.on("finish", () => setImmediate(() => { c.stdout.end(JSON.stringify({ status: "compile-error", stdout: "", stderr: "Main.java:1: error" }) + "\n"); c.stderr.end(); c.emit("close", 0, null); rec.done = true; })); } return c; };
  const sb2 = sandboxMod().createDockerSandbox({ spawnImpl: failSpawn, env: {} });
  const r2 = await sb2.runOfficialSuite(resolveLanguage("java", 1), job, { signal: new AbortController().signal });
  assert.deepEqual([r2.compile.status, r2.cases.length], ["compile-error", 0]);
  assert.match(r2.compile.stderr, /Main\.java:1: error/);
  assert.equal(fail.spawned.filter(s => s.argv[0] === "run").length, 1);
});

test("F7 the official frame keeps setup data and the case stdin apart (exact length prefix, no interpolation)", () => {
  const { encodeOfficialFrame } = sandboxMod();
  const frame = encodeOfficialFrame({ phase: "official", source: "print(1)", limits: LIMITS }, Buffer.from("SAOFF1 9999999999\n{evil}\n", "utf8"));
  const m = /^SAOFF1 (\d{10})\n/.exec(frame.toString("utf8"));
  assert.ok(m);
  const len = Number(m[1]);
  assert.deepEqual(JSON.parse(frame.subarray(18, 18 + len).toString("utf8")), { phase: "official", source: "print(1)", limits: LIMITS });
  assert.equal(frame.subarray(18 + len).toString("utf8"), "SAOFF1 9999999999\n{evil}\n");                       // stdin is opaque data
});

/** Starts a gateway with an official queue around a fake sandbox. */
async function startGateway(opts = {}) {
  const delivered = [];
  const sandbox = opts.sandbox || fakeSandbox();
  const officialQueue = opts.officialQueue === null ? undefined : await journaledQueue({ sandbox, deliver: async r => { delivered.push(r); return { delivered: true }; }, maxPending: opts.maxPending || 4, logger: { info() {}, warn() {} } });
  const server = createGatewayServer({ key: KEY, sandbox, maxConcurrency: 2, logger: { info() {}, warn() {} }, officialQueue });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  return { server, port: server.address().port, delivered, sandbox, officialQueue };
}
function post(port, body, { sign = true, path = "/v1/official-grading-jobs", requestId = rid(Math.floor(Math.random() * 1e8)) } = {}) {
  const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const headers = { "content-type": "application/json", "content-length": String(raw.length), ...(sign ? signRequest({ key: KEY, method: "POST", path, timestamp: ts(), requestId, body: raw }) : {}) };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "POST", path, headers }, res => { const parts = []; res.on("data", d => parts.push(d)); res.on("end", () => { let json = null; try { json = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { json = null; } resolve({ status: res.statusCode, json }); }); });
    req.on("error", reject); req.end(raw);
  });
}

test("F8 HTTP: signed POST /v1/official-grading-jobs → 202; unsigned 401; invalid 400; same id + same body → 202 duplicate; same id + other body → 409 JOB_ID_CONFLICT; full → 503 RUNNER_BUSY; no callback configured → 503 GRADING_UNAVAILABLE", async () => {
  const g = await startGateway({ maxPending: 1, sandbox: fakeSandbox(async job => { await sleep(150); return { cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "", stderr: "", exitCode: 0, durationMs: 1 })) }; }) });
  try {
    const a = await post(g.port, JOB);
    assert.equal(a.status, 202); assert.deepEqual(a.json, { ok: true, accepted: true, duplicate: false });
    assert.equal((await post(g.port, JOB, { sign: false })).status, 401);
    assert.equal((await post(g.port, { ...JOB, jobId: "cg_other0000000000000000", expectedOutput: "x" })).status, 400);
    const dup = await post(g.port, JOB);
    assert.equal(dup.status, 202); assert.equal(dup.json.duplicate, true);
    const conflict = await post(g.port, { ...JOB, source: "print('attacker replacement')" });
    assert.equal(conflict.status, 409); assert.deepEqual(conflict.json, { ok: false, code: "JOB_ID_CONFLICT" });
    const busy = await post(g.port, { ...JOB, jobId: "cg_busy0000000000000000" });
    assert.equal(busy.status, 503); assert.deepEqual(busy.json, { ok: false, code: "RUNNER_BUSY" });
    await g.officialQueue.idle();
    assert.equal(g.delivered.length, 1);
  } finally { g.server.close(); }
  const off = await startGateway({ officialQueue: null });
  try {
    const r = await post(off.port, JOB);
    assert.equal(r.status, 503); assert.deepEqual(r.json, { ok: false, code: "GRADING_UNAVAILABLE" });
  } finally { off.server.close(); }
});

test("F9 callback config fails CLOSED: HTTPS only (loopback http for local dev), fixed host, strong key, never enumerable", () => {
  const { readCallbackConfig } = callback();
  const ok = readCallbackConfig({ SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY });
  assert.equal(ok.enabled, true); assert.equal(ok.url, "https://app.example.test/api/coding/grade-callback");
  assert.equal(JSON.stringify(ok).includes(CB_KEY), false); assert.equal(Object.keys(ok).includes("key"), false);
  for (const env of [{}, { SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test" }, { SMARTASSESS_CALLBACK_BASE_URL: "http://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }, { SMARTASSESS_CALLBACK_BASE_URL: "https://u:p@app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }, { SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test?x=1", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }, { SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: "short" }, { SMARTASSESS_CALLBACK_BASE_URL: "ftp://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }]) {
    assert.equal(readCallbackConfig(env).enabled, false, JSON.stringify(env));
  }
  assert.equal(readCallbackConfig({ SMARTASSESS_CALLBACK_BASE_URL: "http://127.0.0.1:7071", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY }).enabled, true);
});

test("F10 callback delivery: signed over the exact body, fixed URL, no redirects, bounded retry with backoff on 5xx / network, stop on 2xx / 4xx", async () => {
  const { createCallbackDeliverer, readCallbackConfig, CALLBACK_PROTOCOL } = callback();
  const config = readCallbackConfig({ SMARTASSESS_CALLBACK_BASE_URL: "https://app.example.test", SMARTASSESS_CALLBACK_HMAC_KEY: CB_KEY });
  const calls = [], waits = [];
  const answers = ["throw", 503, 500, 200];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); const a = answers.shift(); if (a === "throw") throw new TypeError("network"); return new Response("{}", { status: a }); };
  const d = createCallbackDeliverer({ config, fetch: fetchImpl, sleep: async ms => { waits.push(ms); }, logger: { info() {}, warn() {} } });
  const result = { jobId: JOB.jobId, outcome: "completed", cases: [{ token: "c01", status: "success", stdout: "1\n", stderr: "", exitCode: 0, durationMs: 2 }] };
  const r = await d.deliver(result);
  assert.deepEqual([r.delivered, r.attempts], [true, 4]);
  assert.deepEqual(waits.slice(0, 3), [...waits.slice(0, 3)].sort((a, b) => a - b));                  // non-decreasing backoff
  assert.ok(waits.every(w => w > 0 && w <= 60000));
  for (const c of calls) {
    assert.equal(c.url, "https://app.example.test/api/coding/grade-callback");
    assert.equal(c.init.redirect, "error"); assert.equal(c.init.method, "POST");
    const h = new Headers(c.init.headers), body = Buffer.from(c.init.body, "utf8");
    const canonical = [CALLBACK_PROTOCOL, "POST", "/api/coding/grade-callback", h.get("x-sa-callback-timestamp"), h.get("x-sa-callback-request-id"), crypto.createHash("sha256").update(body).digest("hex")].join("\n");
    assert.equal(h.get("x-sa-callback-signature"), "v1=" + crypto.createHmac("sha256", CB_KEY).update(canonical).digest("hex"));
    assert.deepEqual(JSON.parse(c.init.body), result);
    assert.doesNotMatch(c.init.body, /score|passed|weight|expected|percentage/);
  }
  // 4xx (stale / unknown / malformed on the API side) is final: no retry storm
  const once = []; const d2 = createCallbackDeliverer({ config, fetch: async (u, i) => { once.push(i); return new Response("{}", { status: 409 }); }, sleep: async () => {}, logger: { info() {}, warn() {} } });
  assert.equal((await d2.deliver(result)).delivered, false); assert.equal(once.length, 1);
  // bounded: a permanently failing destination gives up after the attempt budget
  const many = []; const d3 = createCallbackDeliverer({ config, fetch: async (u, i) => { many.push(i); return new Response("{}", { status: 503 }); }, sleep: async () => {}, logger: { info() {}, warn() {} } });
  const r3 = await d3.deliver(result);
  assert.equal(r3.delivered, false); assert.ok(many.length >= 3 && many.length <= 8);
});

test("F11 the callback body is bounded and carries raw evidence only", () => {
  const { encodeCallbackBody, CALLBACK_MAX_BYTES } = callback();
  const huge = { jobId: JOB.jobId, outcome: "completed", cases: Array.from({ length: 50 }, (_, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), status: "success", stdout: "\u0001".repeat(17408), stderr: "\u0001".repeat(4096), exitCode: 0, durationMs: 1 })) };
  const text = encodeCallbackBody(huge);
  assert.ok(Buffer.byteLength(text) <= CALLBACK_MAX_BYTES);
  assert.ok(CALLBACK_MAX_BYTES <= 8 * 1024 * 1024);
  assert.throws(() => encodeCallbackBody({ ...huge, score: 100 }));
  assert.throws(() => encodeCallbackBody({ ...huge, cases: [{ ...huge.cases[0], passed: true }] }));
});
