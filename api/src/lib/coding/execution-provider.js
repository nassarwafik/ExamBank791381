// Phase 17A / 17B — the server-owned CodingExecutionProvider contract.
//
// SECURITY: student code is NEVER executed inside Azure Functions. This process holds application secrets, storage
// credentials, auth configuration and production network access; it is not a sandbox (no eval / new Function / node:vm /
// child_process / worker_threads / Docker — architecture-guarded by api/tests/coding-guards-17a.test.js and
// api/tests/coding-guards-17b.test.js). A provider is reached ONLY through this interface:
//     provider.capabilities() → { available, languages: [{ key, languageVersion, ... }] }   (may be async)
//     provider.execute(request: CodingExecutionRequest) → CodeExecutionResult-like (normalised here)
//     provider.checkSuite(check) → { suite } | { unsupported: true }   (OPTIONAL; 899371 enrichment P18, decision D4-b — one program on
//                                   a few inputs, compiled once; a provider without it is driven one execute() per input instead)
// Phase 17B adds the REMOTE provider: a signed HTTPS client of the Coding Runner Gateway (runner/), which runs each request in
// ONE disposable, hardened Docker sandbox. It is enabled only by a complete, well-formed configuration (runner-config.js);
// otherwise resolveCodingExecutionProvider() returns the UNAVAILABLE provider — a normal state, never a local fallback, never a
// fake success. Transport is single-shot (no automatic retry), bounded in time and in response size, refuses redirects, and
// sends only the minimal request (no identity, token, exam, other answers or hidden tests). Tests inject a deterministic fake
// through `deps.codingExecutionProvider` or a fetch double through `deps.fetch`.
const crypto = require("crypto");
const { buildExecutionRequest, normalizeExecutionResult } = require("../shared-finalization/codingContract");
const { codingLanguage } = require("../shared-finalization/codingQuestion");
const { readCodingRunnerConfig } = require("./runner-config");
const { signRunnerRequest } = require("./runner-protocol");

const UNAVAILABLE = Object.freeze({ available: false, languages: [] });
const UNAVAILABLE_PROVIDER = Object.freeze({
  id: "unavailable",
  capabilities: () => ({ available: false, languages: [] }),
  execute: async () => { const e = new Error("EXECUTION_UNAVAILABLE"); e.code = "EXECUTION_UNAVAILABLE"; throw e; }
});

const isProvider = p => !!p && typeof p === "object" && typeof p.capabilities === "function" && typeof p.execute === "function";
const codeError = code => { const e = new Error(code); e.code = code; return e; };

// ── Remote provider (Phase 17B) ───────────────────────────────────────────────────────────────────────────────────────
const CAPABILITIES_TIMEOUT_MS = 5000;
const EXECUTE_TIMEOUT_MS = 60000;              // > the gateway's hard wall (compile timeout + run limit + start-up slack ≤ 40 s)
const CAPABILITIES_TTL_MS = 30000, CAPABILITIES_FAILURE_TTL_MS = 5000;
const CAPABILITIES_MAX_BYTES = 16 * 1024;
const executeResponseCap = outputBytes => 12 * outputBytes + 64 * 1024;     // stdout + stderr ≤ outputBytes each, JSON-escaped
// 899371 P18 — the synchronous practice check: under the Static Web Apps API ceiling (45 s, docs/enterprise-coding-assessment-17f-a1.md
// P1); a gateway without the route answers 404 and is not asked again for a while (the caller then runs one input at a time)
const CHECK_TIMEOUT_MS = 40000;
const CHECK_UNSUPPORTED_TTL_MS = 5 * 60 * 1000;
const checkResponseCap = (outputBytes, cases) => cases * (12 * outputBytes + 16 * 1024) + 64 * 1024;

async function readBounded(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== "function") {
    const text = await res.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw codeError("RESPONSE_TOO_LARGE");
    return text;
  }
  const reader = res.body.getReader(), parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw codeError("RESPONSE_TOO_LARGE"); }
    parts.push(Buffer.from(value));
  }
  return Buffer.concat(parts).toString("utf8");
}

function createRemoteExecutionProvider(config, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const now = deps.now || Date.now;
  const executeTimeoutMs = deps.executeTimeoutMs || EXECUTE_TIMEOUT_MS;
  const capabilitiesTimeoutMs = deps.capabilitiesTimeoutMs || CAPABILITIES_TIMEOUT_MS;
  const checkTimeoutMs = deps.checkTimeoutMs || CHECK_TIMEOUT_MS;
  let cache = null;
  let checkUnsupportedUntil = 0;

  async function call(method, path, bodyText, requestId, timeoutMs, maxBytes) {
    const body = Buffer.from(bodyText, "utf8");
    const headers = signRunnerRequest({ key: config.key, method, path, timestamp: String(Math.floor(now() / 1000)), requestId, body });
    if (method === "POST") headers["content-type"] = "application/json";
    const res = await fetchImpl(config.baseUrl + path, { method, headers, body: method === "POST" ? bodyText : undefined, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    const text = await readBounded(res, maxBytes);
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return { status: res.status, json };
  }

  return {
    id: "remote",
    async capabilities() {
      if (cache && now() - cache.at < cache.ttl) return cache.value;
      let value = UNAVAILABLE, ttl = CAPABILITIES_FAILURE_TTL_MS;
      try {
        const r = await call("GET", "/v1/capabilities", "", "caps_" + crypto.randomBytes(12).toString("base64url"), capabilitiesTimeoutMs, CAPABILITIES_MAX_BYTES);
        if (r.status === 200 && r.json && r.json.ok === true && r.json.available === true && Array.isArray(r.json.languages)) { value = { available: true, languages: r.json.languages }; ttl = CAPABILITIES_TTL_MS; }
      } catch { value = UNAVAILABLE; }
      cache = { at: now(), ttl, value };
      return value;
    },
    async execute(request) {
      let r;
      try { r = await call("POST", "/v1/execute", JSON.stringify(request), request.requestId, executeTimeoutMs, executeResponseCap(request.limits.outputBytes)); }
      catch { throw codeError("EXECUTION_FAILED"); }
      const code = r.json && typeof r.json.code === "string" ? r.json.code : "";
      if (r.status === 503 && code === "RUNNER_BUSY") throw codeError("RUNNER_BUSY");
      if (r.status === 422 && code === "LANGUAGE_UNAVAILABLE") throw codeError("LANGUAGE_UNAVAILABLE");
      if (r.status !== 200 || !r.json || r.json.ok !== true || !r.json.result || typeof r.json.result !== "object") throw codeError("EXECUTION_FAILED");
      return r.json.result;
    },
    async checkSuite(check) {
      if (now() < checkUnsupportedUntil) return { unsupported: true };
      let r;
      try { r = await call("POST", "/v1/check", JSON.stringify(check), check.requestId, checkTimeoutMs, checkResponseCap(check.limits.outputBytes, check.cases.length)); }
      catch { throw codeError("EXECUTION_FAILED"); }
      const code = r.json && typeof r.json.code === "string" ? r.json.code : "";
      // a gateway that predates the route (the live Runner until the owner deploys P18) answers 404 NOT_FOUND, and the VM's reverse
      // proxy a BARE 404 for a path it does not forward: either way the route is not there — the caller falls back, no harm done
      if (r.status === 404) { checkUnsupportedUntil = now() + CHECK_UNSUPPORTED_TTL_MS; return { unsupported: true }; }
      if (r.status === 503 && code === "RUNNER_BUSY") throw codeError("RUNNER_BUSY");
      if (r.status === 422 && code === "LANGUAGE_UNAVAILABLE") throw codeError("LANGUAGE_UNAVAILABLE");
      if (r.status !== 200 || !r.json || r.json.ok !== true || !r.json.suite || typeof r.json.suite !== "object") throw codeError("EXECUTION_FAILED");
      return { suite: r.json.suite };
    }
  };
}

// One remote provider per configuration per Function host, so the short capability cache is shared across invocations.
const remoteProviders = new Map();
function remoteProviderFor(config, deps) {
  if (deps.fetch || deps.now || deps.executeTimeoutMs || deps.capabilitiesTimeoutMs || deps.checkTimeoutMs) return createRemoteExecutionProvider(config, deps);
  const id = config.baseUrl + "\n" + crypto.createHash("sha256").update(config.key).digest("hex");
  if (!remoteProviders.has(id)) { if (remoteProviders.size > 8) remoteProviders.clear(); remoteProviders.set(id, createRemoteExecutionProvider(config, {})); }
  return remoteProviders.get(id);
}

/** The trusted provider for this request context: an injected provider object (tests), else the remote gateway client when —
 *  and only when — the runner configuration is complete and well-formed, else UNAVAILABLE. */
function resolveCodingExecutionProvider(deps = {}) {
  const d = deps && typeof deps === "object" ? deps : {};
  if (isProvider(d.codingExecutionProvider)) return d.codingExecutionProvider;
  if (d.codingExecutionProvider !== undefined) return UNAVAILABLE_PROVIDER;                 // a malformed injection never falls through
  const config = readCodingRunnerConfig(d.env || process.env);
  return config.enabled ? remoteProviderFor(config, d) : UNAVAILABLE_PROVIDER;
}

/** Factual capability report: only languages the registry knows, reduced to { key, languageVersion }; nothing else a provider
 *  says is forwarded. Unavailable → { available: false, languages: [] } (never advertise an unconfigured language). */
function normalizeCapabilities(raw) {
  if (!raw || raw.available !== true || !Array.isArray(raw.languages)) return { available: false, languages: [] };
  const languages = [];
  for (const l of raw.languages) {
    const def = l && codingLanguage(l.key);
    if (def && def.capabilities.run && l.languageVersion === def.version && !languages.some(x => x.key === def.key)) languages.push({ key: def.key, languageVersion: def.version });
  }
  return { available: languages.length > 0, languages };
}
/** Synchronous report for providers whose capabilities() is synchronous (17A contract). */
function codingCapabilities(provider) {
  let raw;
  try { raw = provider.capabilities(); } catch { return { available: false, languages: [] }; }
  return normalizeCapabilities(raw);
}
/** The same report for any provider (awaits an asynchronous capabilities(), e.g. the remote gateway). Never throws. */
async function loadCodingCapabilities(provider) {
  let raw;
  try { raw = await provider.capabilities(); } catch { return { available: false, languages: [] }; }
  return normalizeCapabilities(raw);
}

/** Runs ONE request through the provider. Order: provider available? → request built from an allow-list and validated →
 *  language offered by the provider? → execute → normalise. Never retries on the API host, never executes locally. */
async function runCodingExecution(provider, input) {
  const caps = await loadCodingCapabilities(provider);
  if (!caps.available) return { ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" };
  const built = buildExecutionRequest(input);
  if (!built.ok) return { ok: false, status: 400, code: "REQUEST_INVALID" };
  const req = built.request;
  if (!caps.languages.some(l => l.key === req.language && l.languageVersion === req.languageVersion)) return { ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" };
  let raw;
  try { raw = await provider.execute(req); }
  catch (e) {
    const code = e && e.code;
    if (code === "RUNNER_BUSY") return { ok: false, status: 503, code: "RUNNER_BUSY" };
    if (code === "LANGUAGE_UNAVAILABLE") return { ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" };
    if (code === "EXECUTION_UNAVAILABLE") return { ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" };
    return { ok: false, status: 502, code: "EXECUTION_FAILED" };
  }
  return { ok: true, result: normalizeExecutionResult(raw, req.limits.outputBytes) };
}

const CHECK_TOKEN = i => "c" + String(i + 1).padStart(2, "0");
const COMPILE_STATUSES = ["compiled", "compile-error"];
const CASE_STATUSES = ["success", "runtime-error", "timeout", "output-limit", "internal-error"];

/**
 * 899371 P18 (decision D4-b) — runs ONE program on several inputs through the provider's synchronous check, when it has one.
 *   → { ok: true, unsupported: true }   the provider (or the live gateway) has no check: the caller runs one input at a time;
 *   → { ok: true, compileError: { stderr } }   the program does not compile (nothing ran);
 *   → { ok: true, results: [CodeExecutionResult-like, …] }   one normalised result per input, in order;
 *   → { ok: false, status, code }   no verdict at all (busy, unavailable, or evidence that is not exactly what was asked).
 * The request is built from the same allow-list as one practice run; the reply is checked case by case (count, tokens, statuses,
 * bounded output) — anything else is EXECUTION_FAILED, never a partial result.
 */
async function runCodingCheck(provider, { requestId, language, languageVersion, source, inputs, limits }) {
  const caps = await loadCodingCapabilities(provider);
  if (!caps.available) return { ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" };
  if (typeof provider.checkSuite !== "function") return { ok: true, unsupported: true };
  const built = buildExecutionRequest({ requestId, language, languageVersion, source, stdin: "", limits });
  if (!built.ok || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 12 || inputs.some(x => typeof x !== "string")) return { ok: false, status: 400, code: "REQUEST_INVALID" };
  const req = built.request;
  if (!caps.languages.some(l => l.key === req.language && l.languageVersion === req.languageVersion)) return { ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" };
  const check = { requestId: req.requestId, language: req.language, languageVersion: req.languageVersion, source: req.source, cases: inputs.map((stdin, i) => ({ token: CHECK_TOKEN(i), stdin })), limits: req.limits };
  let r;
  try { r = await provider.checkSuite(check); }
  catch (e) {
    const code = e && e.code;
    if (code === "RUNNER_BUSY") return { ok: false, status: 503, code: "RUNNER_BUSY" };
    if (code === "LANGUAGE_UNAVAILABLE") return { ok: false, status: 422, code: "LANGUAGE_UNAVAILABLE" };
    if (code === "EXECUTION_UNAVAILABLE") return { ok: false, status: 503, code: "EXECUTION_UNAVAILABLE" };
    return { ok: false, status: 502, code: "EXECUTION_FAILED" };
  }
  if (r && r.unsupported === true) return { ok: true, unsupported: true };
  const failed = { ok: false, status: 502, code: "EXECUTION_FAILED" };
  const suite = r && r.suite;
  if (!suite || typeof suite !== "object" || !Array.isArray(suite.cases)) return failed;
  if (suite.compile !== undefined && (!suite.compile || !COMPILE_STATUSES.includes(suite.compile.status))) return failed;
  if (suite.compile && suite.compile.status === "compile-error") {
    if (suite.cases.length !== 0) return failed;
    return { ok: true, compileError: { stderr: normalizeExecutionResult({ status: "compile-error", stdout: "", stderr: typeof suite.compile.stderr === "string" ? suite.compile.stderr : "" }, req.limits.outputBytes).stderr } };
  }
  if (suite.cases.length !== inputs.length) return failed;
  const results = [];
  for (let i = 0; i < inputs.length; i++) {
    const c = suite.cases[i];
    if (!c || typeof c !== "object" || c.token !== CHECK_TOKEN(i) || !CASE_STATUSES.includes(c.status) || typeof c.stdout !== "string" || typeof c.stderr !== "string") return failed;
    results.push(normalizeExecutionResult({ status: c.status, stdout: c.stdout, stderr: c.stderr, ...(Number.isInteger(c.exitCode) ? { exitCode: c.exitCode } : {}), ...(Number.isFinite(c.durationMs) ? { durationMs: c.durationMs } : {}) }, req.limits.outputBytes));
  }
  return { ok: true, results };
}

module.exports = { UNAVAILABLE_PROVIDER, resolveCodingExecutionProvider, createRemoteExecutionProvider, codingCapabilities, loadCodingCapabilities, runCodingExecution, runCodingCheck };
