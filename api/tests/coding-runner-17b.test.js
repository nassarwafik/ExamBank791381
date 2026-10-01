import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import { createRequire } from "node:module";

// Phase 17B — the REMOTE execution provider (API side) and the Coding Runner Gateway (runner/ subtree), P1–P12.
//   API ──(minimal request, HMAC-SHA256 over protocol + method + path + timestamp + requestId + body hash)──▶ Gateway ──▶ ONE
//   disposable Docker sandbox per execution.
// The API never executes code and never falls back to local execution; the gateway never trusts an unsigned / stale / altered /
// replayed request, never lets a request choose an image / command / flag, and launches every sandbox with fixed hardening.
// Fail-first on fe086e36: the remote provider, the runner configuration and the runner/ gateway do not exist.
const require_ = createRequire(import.meta.url);
const provider = () => require_("../src/lib/coding/execution-provider.js");
const runnerConfig = () => require_("../src/lib/coding/runner-config.js");
const gatewayAuth = () => require_("../../runner/gateway/auth.js");
const gatewayServer = () => require_("../../runner/gateway/server.js");
const gatewaySandbox = () => require_("../../runner/gateway/sandbox.js");
const gatewayRegistry = () => require_("../../runner/gateway/registry.js");
const gatewayValidate = () => require_("../../runner/gateway/validate.js");

const KEY = "test-only-runner-hmac-key-0123456789abcdef";            // TEST key — never a real secret
const ENV = { CODING_RUNNER_URL: "https://runner.example.test", CODING_RUNNER_HMAC_KEY: KEY };
const LIMITS = { timeMs: 2000, memoryMb: 256, outputBytes: 65536 };
const REQ = { requestId: "req_abcdefghijklmnop", language: "python", languageVersion: 1, source: "print(input())", stdin: "7\n", limits: LIMITS };
const CAPS_BODY = { ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] };

/** A recording fetch double: answers capabilities and execute like a gateway would, and keeps every call. */
function fakeFetch({ execute, capabilities } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, init = {}) => {
    const u = new URL(url), body = typeof init.body === "string" ? init.body : "";
    calls.push({ url: u.toString(), path: u.pathname, method: init.method || "GET", headers: Object.fromEntries(new Headers(init.headers || {}).entries()), body, redirect: init.redirect, signal: init.signal });
    const respond = u.pathname.endsWith("/v1/capabilities") ? (capabilities || (() => ({ status: 200, json: CAPS_BODY }))) : (execute || (() => ({ status: 200, json: { ok: true, result: { status: "success", stdout: "7\n", stderr: "", exitCode: 0, durationMs: 12 } } })));
    const r = await respond(calls[calls.length - 1]);
    if (r instanceof Response) return r;
    return new Response(r.text !== undefined ? r.text : JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  });
  fn.calls = calls;
  return fn;
}
const remote = (fetchImpl, env = ENV, extra = {}) => provider().resolveCodingExecutionProvider({ env, fetch: fetchImpl, ...extra });

describe("P1 — runner configuration fails CLOSED", () => {
  it("no URL / no key / explicitly disabled → no remote provider (capabilities unavailable, run 503 EXECUTION_UNAVAILABLE)", async () => {
    const { readCodingRunnerConfig } = runnerConfig();
    expect(readCodingRunnerConfig({}).enabled).toBe(false);
    expect(readCodingRunnerConfig({ CODING_RUNNER_URL: ENV.CODING_RUNNER_URL }).enabled).toBe(false);
    expect(readCodingRunnerConfig({ CODING_RUNNER_HMAC_KEY: KEY }).enabled).toBe(false);
    expect(readCodingRunnerConfig({ ...ENV, CODING_RUNNER_ENABLED: "false" }).enabled).toBe(false);
    expect(readCodingRunnerConfig({ ...ENV, CODING_RUNNER_ENABLED: "0" }).enabled).toBe(false);
    expect(readCodingRunnerConfig(ENV).enabled).toBe(true);
    expect(readCodingRunnerConfig({ ...ENV, CODING_RUNNER_ENABLED: "true" }).enabled).toBe(true);
    const f = fakeFetch();
    for (const env of [{}, { ...ENV, CODING_RUNNER_ENABLED: "false" }]) {
      const p = remote(f, env);
      expect(await provider().loadCodingCapabilities(p)).toEqual({ available: false, languages: [] });
      expect(await provider().runCodingExecution(p, REQ)).toEqual({ ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("malformed configuration → disabled: http to a non-local host, credentials / query / fragment in the URL, unparseable URL, short or whitespace key, garbage ENABLED", () => {
    const { readCodingRunnerConfig } = runnerConfig();
    for (const env of [
      { ...ENV, CODING_RUNNER_URL: "http://runner.example.test" },
      { ...ENV, CODING_RUNNER_URL: "https://user:pass@runner.example.test" },
      { ...ENV, CODING_RUNNER_URL: "https://runner.example.test/?x=1" },
      { ...ENV, CODING_RUNNER_URL: "https://runner.example.test/#frag" },
      { ...ENV, CODING_RUNNER_URL: "not a url" },
      { ...ENV, CODING_RUNNER_URL: "ftp://runner.example.test" },
      { ...ENV, CODING_RUNNER_HMAC_KEY: "short" },
      { ...ENV, CODING_RUNNER_HMAC_KEY: "x".repeat(20) + " " + "y".repeat(20) },
      { ...ENV, CODING_RUNNER_ENABLED: "maybe" }
    ]) expect(readCodingRunnerConfig(env).enabled, JSON.stringify(env)).toBe(false);
    // http is allowed ONLY for an explicit loopback host (local development / tests)
    for (const u of ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787"]) expect(readCodingRunnerConfig({ ...ENV, CODING_RUNNER_URL: u }).enabled, u).toBe(true);
  });
  it("the configuration object never exposes the key when serialised or logged", () => {
    const cfg = runnerConfig().readCodingRunnerConfig(ENV);
    expect(JSON.stringify(cfg)).not.toContain(KEY);
    expect(String(cfg)).not.toContain(KEY);
    expect(Object.keys(cfg)).not.toContain("key");
  });
});

describe("P2 / P3 — signed, minimal requests", () => {
  it("execute is a signed POST to /v1/execute whose signature the GATEWAY verifies (protocol + method + path + timestamp + requestId + body hash)", async () => {
    const f = fakeFetch();
    const r = await provider().runCodingExecution(remote(f), REQ);
    expect(r.ok).toBe(true);
    const call = f.calls.find(c => c.path.endsWith("/v1/execute"));
    expect(call.method).toBe("POST");
    expect(call.headers["x-sa-runner-protocol"]).toBe("1");
    expect(call.headers["x-sa-runner-timestamp"]).toMatch(/^\d{10}$/);
    expect(call.headers["x-sa-runner-request-id"]).toBe(REQ.requestId);
    expect(call.headers["x-sa-runner-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    const { verifyRequest, createReplayGuard } = gatewayAuth();
    const nowMs = Number(call.headers["x-sa-runner-timestamp"]) * 1000;
    expect(verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers: call.headers, body: Buffer.from(call.body), nowMs, replay: createReplayGuard() })).toMatchObject({ ok: true, requestId: REQ.requestId });
  });
  it("the body is EXACTLY the minimal execution request — no identity, no token, no exam, no hidden tests, no extra property", async () => {
    const f = fakeFetch();
    await provider().runCodingExecution(remote(f), { ...REQ, studentName: "أحمد", token: "secret-token", examSnapshot: { x: 1 }, hiddenTests: [{ id: "h" }], image: "evil:latest", command: ["sh"] });
    const call = f.calls.find(c => c.path.endsWith("/v1/execute"));
    expect(Object.keys(JSON.parse(call.body)).sort()).toEqual(["language", "languageVersion", "limits", "requestId", "source", "stdin"]);
    expect(JSON.parse(call.body).limits).toEqual(LIMITS);
    expect(call.body).not.toMatch(/أحمد|secret-token|examSnapshot|hiddenTests|evil|"command"/);
    for (const c of f.calls) for (const h of Object.keys(c.headers)) expect(h).not.toMatch(/^(authorization|cookie|x-student-token|x-builder-token)$/);
  });
  it("capabilities are a signed GET; only registry languages are forwarded and nothing else the gateway says (no URL / image / host)", async () => {
    const f = fakeFetch({ capabilities: () => ({ status: 200, json: { ok: true, available: true, languages: [{ key: "python", languageVersion: 1, image: "smartassess-coding-python:v1", host: "10.0.0.5" }, { key: "javascript", languageVersion: 1 }, { key: "java", languageVersion: 2 }] } }) });
    const caps = await provider().loadCodingCapabilities(remote(f));
    expect(caps).toEqual({ available: true, languages: [{ key: "python", languageVersion: 1 }] });
    const call = f.calls[0];
    expect(call.method).toBe("GET"); expect(call.path).toBe("/v1/capabilities");
    expect(call.headers["x-sa-runner-signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(JSON.stringify(caps)).not.toMatch(/runner\.example|smartassess-coding|10\.0\.0\.5/);
  });
});

describe("P4–P7 — the gateway authenticates every request", () => {
  const sign = (over = {}) => {
    const { signRequest } = gatewayAuth();
    const body = Buffer.from(JSON.stringify(REQ));
    const ts = String(Math.floor(Date.now() / 1000));
    return { body, headers: signRequest({ key: KEY, method: "POST", path: "/v1/execute", timestamp: ts, requestId: REQ.requestId, body, ...over }), nowMs: Number(ts) * 1000 };
  };
  it("P4 missing / malformed / wrong-key signatures are rejected", () => {
    const { verifyRequest, createReplayGuard } = gatewayAuth();
    const v = (headers, body, nowMs) => verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers, body, nowMs, replay: createReplayGuard() });
    const ok = sign();
    expect(v(ok.headers, ok.body, ok.nowMs).ok).toBe(true);
    for (const h of ["x-sa-runner-protocol", "x-sa-runner-timestamp", "x-sa-runner-request-id", "x-sa-runner-signature"]) {
      const headers = { ...ok.headers }; delete headers[h];
      expect(v(headers, ok.body, ok.nowMs).ok, "missing " + h).toBe(false);
    }
    expect(v({ ...ok.headers, "x-sa-runner-signature": "v1=zz" }, ok.body, ok.nowMs).ok).toBe(false);
    expect(v({ ...ok.headers, "x-sa-runner-signature": "v2=" + "0".repeat(64) }, ok.body, ok.nowMs).ok).toBe(false);
    expect(v({ ...ok.headers, "x-sa-runner-protocol": "2" }, ok.body, ok.nowMs).ok).toBe(false);
    expect(v({ ...ok.headers, "x-sa-runner-timestamp": "12x" }, ok.body, ok.nowMs).ok).toBe(false);
    expect(v({ ...ok.headers, "x-sa-runner-request-id": "../etc" }, ok.body, ok.nowMs).ok).toBe(false);
    const other = sign({ key: "another-test-only-key-0123456789abcdefgh" });
    expect(v(other.headers, other.body, other.nowMs).ok).toBe(false);
  });
  it("P5 stale or future timestamps (beyond ±60 s) are rejected", () => {
    const { verifyRequest, createReplayGuard } = gatewayAuth();
    const ok = sign();
    for (const skew of [61_000, -61_000, 3_600_000]) expect(verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers: ok.headers, body: ok.body, nowMs: ok.nowMs + skew, replay: createReplayGuard() }).ok, String(skew)).toBe(false);
    expect(verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers: ok.headers, body: ok.body, nowMs: ok.nowMs + 59_000, replay: createReplayGuard() }).ok).toBe(true);
  });
  it("P6 an altered body, method, path or request id is rejected, and a replayed request id is refused", () => {
    const { verifyRequest, createReplayGuard } = gatewayAuth();
    const ok = sign();
    const v = (o) => verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers: ok.headers, body: ok.body, nowMs: ok.nowMs, replay: createReplayGuard(), ...o });
    expect(v({ body: Buffer.from(JSON.stringify({ ...REQ, source: "import os" })) }).ok).toBe(false);
    expect(v({ method: "GET" }).ok).toBe(false);
    expect(v({ path: "/v1/capabilities" }).ok).toBe(false);
    expect(v({ headers: { ...ok.headers, "x-sa-runner-request-id": "req_other" } }).ok).toBe(false);
    const replay = createReplayGuard();
    expect(v({ replay }).ok).toBe(true);
    expect(v({ replay }).ok).toBe(false);                                                    // same request id again
  });
  it("P7 the signature comparison is timing-safe (constant-time compare of equal-length digests, never string equality)", async () => {
    const src = (await import("node:fs")).readFileSync(require_.resolve("../../runner/gateway/auth.js"), "utf8");
    expect(src).toMatch(/crypto\.timingSafeEqual\(/);
    expect(src).not.toMatch(/signature\s*[!=]==|[!=]==\s*signature|expected\s*[!=]==|[!=]==\s*expected/);
    const spy = vi.spyOn(crypto, "timingSafeEqual");
    const ok = sign();
    gatewayAuth().verifyRequest({ key: KEY, method: "POST", path: "/v1/execute", headers: ok.headers, body: ok.body, nowMs: ok.nowMs, replay: gatewayAuth().createReplayGuard() });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("the API signer and the gateway signer agree byte-for-byte (protocol parity)", () => {
    const { signRunnerRequest } = require_("../src/lib/coding/runner-protocol.js");
    const body = Buffer.from(JSON.stringify(REQ));
    const a = signRunnerRequest({ key: KEY, method: "POST", path: "/v1/execute", timestamp: "1790000000", requestId: REQ.requestId, body });
    const b = gatewayAuth().signRequest({ key: KEY, method: "POST", path: "/v1/execute", timestamp: "1790000000", requestId: REQ.requestId, body });
    expect(a).toEqual(b);
  });
});

describe("P8 / P9 — bounded, single-shot transport; errors never become a local fallback", () => {
  it("P8 a hung gateway is abandoned within the bounded timeout (EXECUTION_FAILED) and the request is NEVER retried", async () => {
    let executeCalls = 0;
    const f = fakeFetch({ execute: c => { executeCalls++; return new Promise((_, rej) => c.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")))); } });
    const p = remote(f, ENV, { executeTimeoutMs: 50 });
    const t0 = Date.now();
    expect(await provider().runCodingExecution(p, REQ)).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(executeCalls).toBe(1);
  });
  it("P9 RUNNER_BUSY → 503 RUNNER_BUSY; any other non-200 / unparseable / oversized answer → 502 EXECUTION_FAILED; redirects are refused", async () => {
    const run = async execute => provider().runCodingExecution(remote(fakeFetch({ execute })), REQ);
    expect(await run(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }))).toEqual({ ok: false, status: 503, code: "RUNNER_BUSY" });
    expect(await run(() => ({ status: 401, json: { ok: false, code: "UNAUTHORIZED" } }))).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    expect(await run(() => ({ status: 500, text: "<html>boom</html>" }))).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    expect(await run(() => ({ status: 200, text: "not json" }))).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    expect(await run(() => ({ status: 200, text: JSON.stringify({ ok: true, result: { status: "success", stdout: "x".repeat(3 * 1024 * 1024), stderr: "" } }) }))).toEqual({ ok: false, status: 502, code: "EXECUTION_FAILED" });
    const f = fakeFetch();
    await provider().runCodingExecution(remote(f), REQ);
    for (const c of f.calls) expect(c.redirect).toBe("error");
  });
  it("a gateway result is re-labelled and bounded on the API side (unknown status → internal-error; runner-internal fields dropped)", async () => {
    const r = await provider().runCodingExecution(remote(fakeFetch({ execute: () => ({ status: 200, json: { ok: true, result: { status: "pwned", stdout: "a", stderr: "", host: "10.0.0.5", env: { K: "v" } } } }) })), REQ);
    expect(r).toEqual({ ok: true, result: { status: "internal-error", stdout: "a", stderr: "" } });
  });
  it("capabilities failures are unavailable (never an exception, never an optimistic default)", async () => {
    const caps = async capabilities => provider().loadCodingCapabilities(remote(fakeFetch({ capabilities })));
    expect(await caps(() => ({ status: 500, text: "x" }))).toEqual({ available: false, languages: [] });
    expect(await caps(() => { throw new Error("ECONNREFUSED"); })).toEqual({ available: false, languages: [] });
    expect(await caps(() => ({ status: 200, json: { ok: true, available: false, languages: [{ key: "python", languageVersion: 1 }] } }))).toEqual({ available: false, languages: [] });
  });
});

// ── Gateway behaviour (pure units + the real HTTP server with an in-memory sandbox double that executes nothing) ──────────
function startGateway(opts = {}) {
  const runs = [];
  const sandbox = opts.sandbox || {
    availableLanguages: async () => [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }],
    run: async (entry, request) => { runs.push({ entry, request }); if (opts.hold) await opts.hold; return { status: "success", stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 }; }
  };
  const server = gatewayServer().createGatewayServer({ key: KEY, sandbox, maxConcurrency: opts.maxConcurrency ?? 2, logger: { info() {}, warn() {} } });
  return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve({ server, runs, port: server.address().port })));
}
let nonObjectCalls = 0;                                                     // each signed request needs its own id (the gateway refuses replays)
function call(port, { method = "POST", path = "/v1/execute", body = REQ, sign = true, headers = {} } = {}) {
  const raw = Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  const h = { "content-type": "application/json", ...(sign ? gatewayAuth().signRequest({ key: KEY, method, path, timestamp: String(Math.floor(Date.now() / 1000)), requestId: typeof body === "object" && body && body.requestId ? body.requestId : "req_nobody_" + String(++nonObjectCalls).padStart(10, "0"), body: method === "GET" ? Buffer.alloc(0) : raw }) : {}), ...headers };
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: h }, res => { const parts = []; res.on("data", d => parts.push(d)); res.on("end", () => { const text = Buffer.concat(parts).toString("utf8"); let json = null; try { json = JSON.parse(text); } catch { /* not json */ } resolve({ status: res.statusCode, json, text }); }); });
    req.on("error", reject);
    if (method !== "GET") req.end(raw); else req.end();
  });
}
const rid = n => "req_" + String(n).padStart(16, "0");

describe("P10 / P11 — the gateway validates, maps contracts to FIXED images and bounds concurrency", () => {
  it("P10 the gateway accepts exactly the minimal request; image / command / flags / entrypoint / extra fields / bad limits are REQUEST_INVALID", () => {
    const { validateExecuteRequest } = gatewayValidate();
    expect(validateExecuteRequest(REQ)).toEqual({ ok: true, request: REQ });
    for (const bad of [
      { ...REQ, image: "alpine" }, { ...REQ, command: ["sh", "-c", "id"] }, { ...REQ, flags: ["--privileged"] }, { ...REQ, entrypoint: "/bin/sh" }, { ...REQ, env: { A: "1" } },
      { ...REQ, language: "javascript" }, { ...REQ, language: "python", languageVersion: 2 }, { ...REQ, source: "x".repeat(65537) }, { ...REQ, stdin: "s".repeat(16385) },
      { ...REQ, limits: { ...LIMITS, timeMs: 10001 } }, { ...REQ, limits: { ...LIMITS, memoryMb: 4096 } }, { ...REQ, limits: { ...LIMITS, outputBytes: 999999 } }, { ...REQ, limits: { ...LIMITS, cpus: 8 } },
      { ...REQ, requestId: "bad id!" }, { ...REQ, source: 5 }, null, [], "x"
    ]) expect(validateExecuteRequest(bad).ok, JSON.stringify(bad)?.slice(0, 80)).toBe(false);
  });
  it("P11 the registry maps exactly python@1 / java@1 / csharp@1 to fixed, pinned worker images; nothing else resolves", () => {
    const { resolveLanguage, LANGUAGES } = gatewayRegistry();
    expect(Object.keys(LANGUAGES).sort()).toEqual(["csharp@1", "java@1", "python@1"]);
    for (const k of ["python", "java", "csharp"]) {
      const e = resolveLanguage(k, 1);
      expect(e.image).toMatch(/^smartassess-coding-(python|java|csharp):17c-v1$/);
      expect(Object.isFrozen(e)).toBe(true);
    }
    for (const [k, v] of [["javascript", 1], ["python", 2], ["__proto__", 1], ["constructor", 1], ["", 1]]) expect(resolveLanguage(k, v), k).toBeUndefined();
  });
  it("the HTTP gateway: signed execute runs ONE sandbox with the registry entry; unsigned → 401; invalid → 400; GET capabilities is signed too", async () => {
    const g = await startGateway();
    try {
      const ok = await call(g.port);
      expect(ok.status).toBe(200); expect(ok.json).toEqual({ ok: true, result: { status: "success", stdout: "ok", stderr: "", exitCode: 0, durationMs: 1 } });
      expect(g.runs).toHaveLength(1); expect(g.runs[0].entry.image).toBe("smartassess-coding-python:17c-v1"); expect(g.runs[0].request).toEqual(REQ);
      expect((await call(g.port, { sign: false, body: { ...REQ, requestId: rid(2) } })).status).toBe(401);
      expect((await call(g.port, { body: { ...REQ, requestId: rid(3), image: "alpine" } })).json).toEqual({ ok: false, code: "REQUEST_INVALID" });
      expect((await call(g.port, { body: "{not json" })).json).toEqual({ ok: false, code: "REQUEST_INVALID" });   // authentic but unparseable
      // an authentic signature whose header request id differs from the body's request id is refused (the id is bound)
      const raw = Buffer.from(JSON.stringify({ ...REQ, requestId: rid(4) }));
      const mismatched = gatewayAuth().signRequest({ key: KEY, method: "POST", path: "/v1/execute", timestamp: String(Math.floor(Date.now() / 1000)), requestId: rid(5), body: raw });
      expect((await call(g.port, { body: JSON.stringify({ ...REQ, requestId: rid(4) }), sign: false, headers: mismatched })).status).toBe(401);
      const caps = await call(g.port, { method: "GET", path: "/v1/capabilities", body: null });
      expect(caps.status).toBe(200); expect(caps.json).toEqual({ ok: true, available: true, languages: [{ key: "python", languageVersion: 1 }, { key: "java", languageVersion: 1 }, { key: "csharp", languageVersion: 1 }] });
      expect((await call(g.port, { method: "GET", path: "/v1/capabilities", body: null, sign: false })).status).toBe(401);
      expect((await call(g.port, { method: "GET", path: "/v1/nope", body: null })).status).toBe(404);
      expect(g.runs).toHaveLength(1);
    } finally { g.server.close(); }
  });
  it("P11 bounded concurrency: beyond the limit the gateway answers 503 RUNNER_BUSY immediately (no queue, no extra sandbox)", async () => {
    let release; const hold = new Promise(r => { release = r; });
    const g = await startGateway({ maxConcurrency: 1, hold });
    try {
      const first = call(g.port, { body: { ...REQ, requestId: rid(10) } });
      await new Promise(r => setTimeout(r, 50));
      // the busy answer must be IMMEDIATE: a request that waits for the held sandbox (no bound) fails within 3 s, never hangs
      const second = await Promise.race([call(g.port, { body: { ...REQ, requestId: rid(11) } }), new Promise(r => setTimeout(() => r({ status: "no-answer-within-3s", json: null }), 3000))]);
      expect(second.status).toBe(503); expect(second.json).toEqual({ ok: false, code: "RUNNER_BUSY" });
      release();
      expect((await first).status).toBe(200);
      expect(g.runs).toHaveLength(1);
      expect((await call(g.port, { body: { ...REQ, requestId: rid(12) } })).status).toBe(200);
    } finally { release(); g.server.close(); }
  });
  it("a language the host has no image for is LANGUAGE_UNAVAILABLE (capabilities report only real availability)", async () => {
    const g = await startGateway({ sandbox: { availableLanguages: async () => [{ key: "python", languageVersion: 1 }], run: async () => ({ status: "success", stdout: "", stderr: "" }) } });
    try {
      const r = await call(g.port, { body: { ...REQ, requestId: rid(20), language: "java" } });
      expect(r.status).toBe(422); expect(r.json).toEqual({ ok: false, code: "LANGUAGE_UNAVAILABLE" });
      expect((await call(g.port, { method: "GET", path: "/v1/capabilities", body: null })).json.languages).toEqual([{ key: "python", languageVersion: 1 }]);
    } finally { g.server.close(); }
  });
  it("an oversized body is refused before parsing (413) and never reaches a sandbox", async () => {
    const g = await startGateway();
    try {
      const r = await call(g.port, { body: { ...REQ, requestId: rid(30), source: "x".repeat(2 * 1024 * 1024) } });
      expect(r.status).toBe(413); expect(g.runs).toHaveLength(0);
    } finally { g.server.close(); }
  });
});

describe("P12 — every sandbox is launched with the fixed hardening profile", () => {
  const args = () => {
    const { buildDockerRunArgs } = gatewaySandbox();
    const { resolveLanguage } = gatewayRegistry();
    return buildDockerRunArgs({ name: "sa-coding-0123456789abcdef", entry: resolveLanguage("java", 1), limits: LIMITS });
  };
  const flag = (a, f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : undefined; };
  it("--rm, -i, no network, read-only root, all capabilities dropped, no-new-privileges, non-root user, pids / cpu / memory (= swap) limits, tmpfs workspace + tmp, no pull", () => {
    const a = args();
    expect(a[0]).toBe("run");
    for (const f of ["--rm", "-i", "--read-only"]) expect(a).toContain(f);
    expect(flag(a, "--network")).toBe("none");
    expect(flag(a, "--cap-drop")).toBe("ALL");
    expect(flag(a, "--security-opt")).toBe("no-new-privileges");
    expect(flag(a, "--user")).toMatch(/^[1-9]\d{3,}:[1-9]\d{3,}$/);
    expect(Number(flag(a, "--pids-limit"))).toBeGreaterThan(0); expect(Number(flag(a, "--pids-limit"))).toBeLessThanOrEqual(256);
    expect(flag(a, "--cpus")).toBe("1");
    expect(flag(a, "--memory")).toMatch(/^\d+m$/); expect(flag(a, "--memory-swap")).toBe(flag(a, "--memory"));
    expect(flag(a, "--pull")).toBe("never");
    expect(flag(a, "--log-driver")).toBe("none");
    const tmpfs = a.filter((x, i) => a[i - 1] === "--tmpfs");
    expect(tmpfs.map(t => t.split(":")[0]).sort()).toEqual(["/tmp", "/workspace"]);
    for (const t of tmpfs) { expect(t).toMatch(/noexec/); expect(t).toMatch(/nosuid/); expect(t).toMatch(/size=\d+m/); }
    expect(a[a.length - 1]).toBe("smartassess-coding-java:17c-v1");                                   // image last: no command / args after it
  });
  it("never: --privileged, host mounts (-v / --volume / --mount), docker.sock, env injection (-e / --env / --env-file), host namespaces, extra capabilities, entrypoint override", () => {
    const a = args().join(" ");
    expect(a).not.toMatch(/--privileged|(^| )-v |--volume|--mount|docker\.sock|(^| )-e |--env|--cap-add|--entrypoint|--network[= ]host|--pid[= ]host|--ipc[= ]host|--userns[= ]host|--device|seccomp[=:]unconfined|apparmor[=:]unconfined/);
  });
  it("the memory ceiling is FIXED by the registry (program limit + toolchain overhead), never by the request alone", () => {
    const { buildDockerRunArgs } = gatewaySandbox();
    const { resolveLanguage } = gatewayRegistry();
    const mem = l => Number(flag(buildDockerRunArgs({ name: "sa-coding-0123456789abcdef", entry: resolveLanguage("python", 1), limits: { ...LIMITS, memoryMb: l } }), "--memory").replace("m", ""));
    expect(mem(64)).toBeGreaterThan(64); expect(mem(512)).toBeGreaterThan(512); expect(mem(512)).toBeLessThanOrEqual(2048);
  });
  it("review fix: the RUNTIME sandbox ceiling is memoryMb + a fixed overhead — never the compile allowance (which only the compile sandbox gets)", () => {
    const { buildDockerRunArgs } = gatewaySandbox();
    const { resolveLanguage } = gatewayRegistry();
    const name = "sa-coding-0123456789abcdef";
    for (const key of ["python", "java", "csharp"]) {
      const e = resolveLanguage(key, 1);
      const runtime = Number(flag(buildDockerRunArgs({ name, entry: e, limits: { ...LIMITS, memoryMb: 64 } }), "--memory").replace("m", ""));
      expect(runtime, key).toBe(64 + e.runtimeOverheadMb);
      expect(e.runtimeOverheadMb, key).toBeLessThanOrEqual(128);
      if (e.compileSandbox) {
        const compile = buildDockerRunArgs({ name, entry: e, limits: { ...LIMITS, memoryMb: 64 }, phase: "compile" });
        expect(Number(flag(compile, "--memory").replace("m", "")), key).toBe(e.compileMemoryMb);
        expect(runtime, key).toBeLessThan(e.compileMemoryMb);
        for (const f of ["--rm", "--read-only"]) expect(compile, key).toContain(f);
        expect(flag(compile, "--network")).toBe("none"); expect(flag(compile, "--cap-drop")).toBe("ALL");
      } else expect(() => buildDockerRunArgs({ name, entry: e, limits: LIMITS, phase: "compile" }), key).toThrow();
    }
  });
  it("the sandbox module spawns docker with a FIXED argument array and never through a shell", async () => {
    const src = (await import("node:fs")).readFileSync(require_.resolve("../../runner/gateway/sandbox.js"), "utf8");
    expect(src).toMatch(/shell:\s*false/);
    expect(src).not.toMatch(/shell:\s*true|execSync|exec\(|execFile\(/);
    const spawned = [];
    const fakeSpawn = (cmd, argv, opts) => {
      spawned.push({ cmd, argv, opts });
      const { EventEmitter } = require_("node:events");
      const { PassThrough } = require_("node:stream");
      const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
      setTimeout(() => { if (argv[0] === "run") child.stdout.end(JSON.stringify({ status: "success", stdout: "hi", stderr: "", exitCode: 0, durationMs: 3 }) + "\n"); else child.stdout.end(); child.stderr.end(); child.emit("close", 0, null); }, 5);
      return child;
    };
    const sb = gatewaySandbox().createDockerSandbox({ spawnImpl: fakeSpawn, env: { PATH: "/usr/bin", CODING_RUNNER_HMAC_KEY: "leak", RUNNER_HMAC_KEY: "leak", AZURE_STORAGE_CONNECTION_STRING: "leak" } });
    const r = await sb.run(gatewayRegistry().resolveLanguage("python", 1), REQ);
    expect(r).toEqual({ status: "success", stdout: "hi", stderr: "", exitCode: 0, durationMs: 3 });
    const run = spawned.find(s => s.argv[0] === "run");
    expect(run.cmd).toBe("docker"); expect(run.opts.shell).toBe(false);
    expect(Array.isArray(run.argv)).toBe(true);
    expect(JSON.stringify(run.opts.env || {})).not.toContain("leak");                                  // the docker CLI never inherits gateway secrets
    expect(run.argv.join(" ")).not.toContain("print(input())");                                         // source travels over stdin, never argv
    expect(spawned.some(s => s.argv[0] === "rm" && s.argv.includes("-f"))).toBe(true);                // the named container is always force-removed
  });
});
