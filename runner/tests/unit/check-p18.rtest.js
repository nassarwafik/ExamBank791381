"use strict";
// 899371 enrichment P18 (decision D4-b) — the gateway's synchronous PRACTICE check, POST /v1/check (node:test, no Docker; a sandbox
// double that executes nothing):
//   • the request: exactly { requestId, language, languageVersion, source, cases: [{ token, stdin }], limits }; tokens c01, c02 … in
//     order; ≤ 12 cases, ≤ 16 KB per input, ≤ 64 KB in all; the official limit ranges; a hard wall that fits; signed, the request id
//     bound to the signature;
//   • the budget: a check holds exactly ONE practice slot (the /v1/execute budget; full → 503 RUNNER_BUSY at once, never queued) and
//     runs its cases one at a time through its OWN pool — never the official container slots;
//   • the answer: the sandbox's raw evidence, unchanged (the gateway never compares); a sandbox failure is 502 CHECK_FAILED; a client
//     that hangs up aborts the remaining cases; a gateway whose sandbox has no suite runner answers 404 (as an old gateway does);
//   • telemetry: ids, language, counts, statuses and durations only — never the source, an input or an output.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { signRequest } = require("../../gateway/auth.js");
const { validateCheckRequest, checkWallMs, CHECK_BOUNDS } = require("../../gateway/official.js");
const { resolveLanguage } = require("../../gateway/registry.js");
const { createGatewayServer } = require("../../gateway/server.js");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";
const LIMITS = { timeMs: 2000, memoryMb: 128, outputBytes: 16384 };
const token = i => "c" + String(i + 1).padStart(2, "0");
const CHECK = { requestId: "req_check_0000000001", language: "csharp", languageVersion: 1, source: "SRC-CANARY", cases: [{ token: "c01", stdin: "IN-CANARY-1\n" }, { token: "c02", stdin: "IN-CANARY-2\n" }], limits: LIMITS };
const ts = () => String(Math.floor(Date.now() / 1000));

test("validate: exactly the check shape, bounded, tokens in order, a wall that fits", () => {
  assert.deepEqual(validateCheckRequest(CHECK), { ok: true, check: CHECK });
  const many = n => ({ ...CHECK, cases: Array.from({ length: n }, (_, i) => ({ token: token(i), stdin: "1\n" })) });
  assert.equal(CHECK_BOUNDS.maxCases, 12);
  assert.equal(validateCheckRequest(many(12)).ok, true);
  assert.equal(validateCheckRequest(many(13)).ok, false, "13 inputs are one too many");
  const bad = [
    { ...CHECK, jobId: "cg_x" }, { ...CHECK, image: "x" }, (() => { const c = { ...CHECK }; delete c.requestId; return c; })(),
    { ...CHECK, requestId: "a b" }, { ...CHECK, language: "node" }, { ...CHECK, languageVersion: 2 }, { ...CHECK, source: "x".repeat(65537) },
    { ...CHECK, cases: [] }, many(CHECK_BOUNDS.maxCases + 1), { ...CHECK, cases: [{ token: "c02", stdin: "" }] }, { ...CHECK, cases: [{ token: "c01", stdin: 5 }] },
    { ...CHECK, cases: [{ token: "c01", stdin: "", extra: 1 }] }, { ...CHECK, cases: [{ token: "c01", stdin: "y".repeat(16385) }] },
    { ...CHECK, cases: Array.from({ length: 5 }, (_, i) => ({ token: token(i), stdin: "z".repeat(16000) })) },     // > 64 KB in all
    { ...CHECK, limits: { ...LIMITS, timeMs: 100 } }, { ...CHECK, limits: { ...LIMITS, memoryMb: 1024 } }, { ...CHECK, limits: { ...LIMITS, pids: 1 } },
    { ...many(12), limits: { ...LIMITS, timeMs: 10000 } },                                                            // its wall would not fit
    Object.create({ polluted: 1 }), null, [],
  ];
  for (const b of bad) assert.equal(validateCheckRequest(b).ok, false, JSON.stringify(b)?.slice(0, 80));
  const e = resolveLanguage("csharp", 1);
  assert.ok(checkWallMs(e, many(12)) <= CHECK_BOUNDS.maxWallMs);
});

function harness({ suite, maxConcurrency = 1, withSuite = true, holdExecute } = {}) {
  const suites = [], logs = [];
  let releaseExecute = () => {};
  const executeHeld = new Promise(r => { releaseExecute = r; });
  const sandbox = {
    availableLanguages: async () => [{ key: "csharp", languageVersion: 1 }],
    run: async () => { if (holdExecute) await executeHeld; return { status: "success", stdout: "", stderr: "" }; },
    ...(withSuite ? { runOfficialSuite: async (entry, job, options) => { suites.push({ entry, job, options }); return suite ? suite(job, options) : { compile: { status: "compiled", durationMs: 7 }, cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "OUT-CANARY", stderr: "", exitCode: 0, durationMs: 3 })) }; } } : {}),
  };
  const server = createGatewayServer({ key: KEY, sandbox, maxConcurrency, logger: { info: m => logs.push(m), warn: m => logs.push(m), error: m => logs.push(m) } });
  const ready = new Promise(r => server.listen(0, "127.0.0.1", r));
  const send = async (path, body, { sign = true, method = "POST", abortAfterMs } = {}) => {
    await ready;
    const raw = body === undefined ? undefined : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const headers = sign ? signRequest({ key: KEY, method, path, timestamp: ts(), requestId: (body && body.requestId) || "req_check_caps_0001", body: raw || Buffer.alloc(0) }) : {};
    return new Promise((resolve, reject) => {
      const q = http.request({ host: "127.0.0.1", port: server.address().port, path, method, headers }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(p).toString() || "null") })); });
      q.on("error", e => (abortAfterMs ? resolve({ status: "hung-up" }) : reject(e)));
      q.end(raw);
      if (abortAfterMs) setTimeout(() => q.destroy(), abortAfterMs);
    });
  };
  return { server, send, suites, logs, releaseExecute };
}

test("a check: the sandbox's raw evidence, unchanged; compiled once by the suite runner, ONE case at a time, never the official slots", async () => {
  const h = harness();
  try {
    const r = await h.send("/v1/check", CHECK);
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true, suite: { compile: { status: "compiled", durationMs: 7 }, cases: [{ token: "c01", status: "success", stdout: "OUT-CANARY", stderr: "", exitCode: 0, durationMs: 3 }, { token: "c02", status: "success", stdout: "OUT-CANARY", stderr: "", exitCode: 0, durationMs: 3 }] } });
    assert.equal(h.suites.length, 1);
    const { job, options } = h.suites[0];
    assert.deepEqual(job, CHECK);
    assert.equal(options.caseConcurrency, 1);
    assert.ok(options.slotPool && typeof options.slotPool.acquire === "function", "its own case pool, not the official slots");
    assert.ok(options.signal instanceof AbortSignal);
    const release = await options.slotPool.acquire();          // the practice pool never makes a case wait
    assert.equal(typeof release, "function");
  } finally { h.server.close(); }
});

test("the budget: a check holds the ONE practice slot — a run meanwhile is RUNNER_BUSY at once, and the other way round", async () => {
  const pending = [];
  const finish = () => { while (pending.length) pending.shift()(); };
  const h = harness({ suite: job => new Promise(r => { pending.push(() => r({ cases: job.cases.map(c => ({ token: c.token, status: "success", stdout: "", stderr: "" })) })); }), holdExecute: true });
  try {
    const first = h.send("/v1/check", CHECK);
    await new Promise(r => setTimeout(r, 50));
    const run = await h.send("/v1/execute", { requestId: "req_check_run_00001", language: "csharp", languageVersion: 1, source: "x", stdin: "", limits: LIMITS });
    assert.deepEqual([run.status, run.json], [503, { ok: false, code: "RUNNER_BUSY" }]);
    const secondP = h.send("/v1/check", { ...CHECK, requestId: "req_check_0000000002" });
    await new Promise(r => setTimeout(r, 50));
    finish();                                                        // (a mutant that admits it must not hang the test)
    const second = await secondP;
    assert.deepEqual([second.status, second.json], [503, { ok: false, code: "RUNNER_BUSY" }]);
    assert.equal((await first).status, 200);
    const running = h.send("/v1/execute", { requestId: "req_check_run_00002", language: "csharp", languageVersion: 1, source: "x", stdin: "", limits: LIMITS });
    await new Promise(r => setTimeout(r, 50));
    const blocked = await h.send("/v1/check", { ...CHECK, requestId: "req_check_0000000003" });
    assert.deepEqual([blocked.status, blocked.json], [503, { ok: false, code: "RUNNER_BUSY" }]);
    h.releaseExecute();
    assert.equal((await running).status, 200);
    assert.equal(h.suites.length, 1);
  } finally { h.releaseExecute(); h.server.close(); }
});

test("refusals: unsigned 401, the request id bound to the signature, an invalid body 400, a language not offered 422", async () => {
  const h = harness();
  try {
    assert.equal((await h.send("/v1/check", CHECK, { sign: false })).status, 401);
    const raw = Buffer.from(JSON.stringify({ ...CHECK, requestId: "req_check_other_0001" }));
    const headers = signRequest({ key: KEY, method: "POST", path: "/v1/check", timestamp: ts(), requestId: CHECK.requestId, body: raw });
    const bound = await new Promise(resolve => { const q = http.request({ host: "127.0.0.1", port: h.server.address().port, path: "/v1/check", method: "POST", headers }, res => { res.resume(); res.on("end", () => resolve(res.statusCode)); }); q.end(raw); });
    assert.equal(bound, 401);
    assert.equal((await h.send("/v1/check", { ...CHECK, requestId: "req_check_0000000021", cases: [] })).status, 400);
    assert.equal((await h.send("/v1/check", { ...CHECK, requestId: "req_check_0000000022", language: "python" })).status, 422);
    assert.equal(h.suites.length, 0);
  } finally { h.server.close(); }
});

test("a sandbox failure is 502 CHECK_FAILED (never a partial result); a sandbox without a suite runner answers 404 like an old gateway", async () => {
  const h = harness({ suite: () => { throw new Error("docker went away"); } });
  try {
    const r = await h.send("/v1/check", CHECK);
    assert.deepEqual([r.status, r.json], [502, { ok: false, code: "CHECK_FAILED" }]);
    const ok = await h.send("/v1/check", { ...CHECK, requestId: "req_check_0000000009" });   // the slot was released
    assert.equal(ok.status, 502);
  } finally { h.server.close(); }
  const old = harness({ withSuite: false });
  try {
    const r = await old.send("/v1/check", CHECK);
    assert.deepEqual([r.status, r.json], [404, { ok: false, code: "NOT_FOUND" }]);
  } finally { old.server.close(); }
});

test("a client that hangs up aborts the remaining cases; telemetry never carries the source, an input or an output", async () => {
  let seenSignal;
  const h = harness({ suite: (job, options) => new Promise((resolve, reject) => { seenSignal = options.signal; options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }); }) });
  try {
    const r = await h.send("/v1/check", CHECK, { abortAfterMs: 80 });
    assert.equal(r.status, "hung-up");
    await new Promise(res => setTimeout(res, 80));
    assert.equal(seenSignal.aborted, true);
    assert.ok(h.logs.some(l => /runner\.check\.failed/.test(l)), "the aborted check is logged");
    assert.equal(h.logs.some(l => /SRC-CANARY|IN-CANARY|OUT-CANARY/.test(l)), false);
  } finally { h.server.close(); }
});
