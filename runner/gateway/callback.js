"use strict";
// Phase 17C — delivery of OFFICIAL grading evidence from the Coding Runner Gateway back to SmartAssess.
//
// The destination is FIXED by the gateway host's own configuration — never by a request:
//     SMARTASSESS_CALLBACK_BASE_URL   https://<host>[:port] (no credentials, path, query or fragment; plain http only for a
//                                     loopback host during local development)
//     SMARTASSESS_CALLBACK_HMAC_KEY   ≥ 32 characters, no whitespace; a key that exists ONLY for callbacks (independent of the
//                                     API → runner RUNNER_HMAC_KEY), configured with the same value as the SmartAssess API
//                                     callback verification key setting
// Missing / weak / non-HTTPS configuration fails CLOSED: the gateway does not accept official jobs at all.
//
// Wire protocol (SA-CODING-CALLBACK-1):
//     POST <base>/api/coding/grade-callback
//     x-sa-callback-protocol    "1"
//     x-sa-callback-timestamp   Unix seconds (10 digits)
//     x-sa-callback-request-id  /^[A-Za-z0-9_-]{1,64}$/ (fresh per attempt)
//     x-sa-callback-signature   "v1=" + hex(HMAC-SHA256(key, "SA-CODING-CALLBACK-1\nPOST\n/api/coding/grade-callback\n" +
//                                                         timestamp + "\n" + requestId + "\n" + hex(SHA-256(body))))
//     body = { jobId, outcome: "completed" | "failed", technicalCode?, compile?: { status, stderr?, durationMs? },
//              cases: [{ token, status, stdout, stderr, exitCode?, durationMs? }] }
// The body is RAW EVIDENCE ONLY: it never carries a score, a pass / fail verdict, a weight or an expected output (encodeCallbackBody
// refuses any other key). SmartAssess compares and scores on its own side.
//
// Delivery is at-least-once: bounded retries with exponential backoff on a network error / timeout / 5xx / 408 / 429; any other
// response (2xx accepted, 4xx stale / unknown / malformed) is final. Redirects are refused. The key, the body (which contains
// the program's stdout / stderr) and the signature are never logged.
// Phase 17D-B2: attempt() is ONE signed attempt that CLASSIFIES the answer (the durable official queue owns retries, backoff and
// their persistence): { delivered: true, status, confirmedAs: "complete" | "retryable" } from SmartAssess's bounded 2xx body
// ({ applied, state } / { alreadyApplied }), or { delivered: false, retryable, status?, errorClass: "network" | "timeout" |
// "http" | "protocol" }. Each attempt is freshly signed (new timestamp + request id) over the SAME body bytes.
const crypto = require("node:crypto");

const CALLBACK_PROTOCOL = "SA-CODING-CALLBACK-1";
const CALLBACK_PROTOCOL_VERSION = "1";
const CALLBACK_PATH = "/api/coding/grade-callback";
const CALLBACK_MAX_BYTES = 8 * 1024 * 1024;
const CALLBACK_HEADERS = Object.freeze({ protocol: "x-sa-callback-protocol", timestamp: "x-sa-callback-timestamp", requestId: "x-sa-callback-request-id", signature: "x-sa-callback-signature" });
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Reads the callback destination + key. Returns { enabled: false } or { enabled: true, url } with a NON-enumerable key. */
function readCallbackConfig(env) {
  const off = { enabled: false };
  const base = typeof env.SMARTASSESS_CALLBACK_BASE_URL === "string" ? env.SMARTASSESS_CALLBACK_BASE_URL.trim() : "";
  const key = typeof env.SMARTASSESS_CALLBACK_HMAC_KEY === "string" ? env.SMARTASSESS_CALLBACK_HMAC_KEY : "";
  if (!base || key.length < 32 || key.length > 512 || /\s/.test(key)) return off;
  let u;
  try { u = new URL(base); } catch { return off; }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return off;
  if (/[?#@]/.test(base)) return off;
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOOPBACK.has(u.hostname))) return off;
  const config = { enabled: true, url: u.origin + CALLBACK_PATH };
  Object.defineProperty(config, "key", { value: key, enumerable: false });
  return config;
}

const sha256Hex = body => crypto.createHash("sha256").update(body).digest("hex");
/** The four callback headers for (timestamp, request id, raw body). */
function signCallbackRequest({ key, timestamp, requestId, body }) {
  const canonical = [CALLBACK_PROTOCOL, "POST", CALLBACK_PATH, String(timestamp), String(requestId), sha256Hex(body)].join("\n");
  const mac = crypto.createHmac("sha256", Buffer.from(String(key), "utf8")).update(canonical, "utf8").digest("hex");
  return { [CALLBACK_HEADERS.protocol]: CALLBACK_PROTOCOL_VERSION, [CALLBACK_HEADERS.timestamp]: String(timestamp), [CALLBACK_HEADERS.requestId]: String(requestId), [CALLBACK_HEADERS.signature]: "v1=" + mac };
}

const TOP_KEYS = new Set(["jobId", "outcome", "technicalCode", "compile", "cases"]);
const COMPILE_KEYS = new Set(["status", "stderr", "durationMs"]);
const CASE_KEYS = new Set(["token", "status", "stdout", "stderr", "exitCode", "durationMs"]);
const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const only = (o, allowed, where) => { for (const k of Object.keys(o)) if (!allowed.has(k)) throw new Error("callback body refuses key " + where + "." + k); };

/** Serialises one result for the callback. Throws on ANY key outside the raw-evidence contract or on an oversize body. */
function encodeCallbackBody(result) {
  if (!isObj(result)) throw new Error("callback body must be an object");
  only(result, TOP_KEYS, "result");
  if (!Array.isArray(result.cases)) throw new Error("callback body needs cases");
  if (result.compile !== undefined) { if (!isObj(result.compile)) throw new Error("callback compile must be an object"); only(result.compile, COMPILE_KEYS, "compile"); }
  for (const c of result.cases) { if (!isObj(c)) throw new Error("callback case must be an object"); only(c, CASE_KEYS, "case"); }
  const text = JSON.stringify(result);
  if (Buffer.byteLength(text, "utf8") > CALLBACK_MAX_BYTES) throw new Error("callback body too large");
  return text;
}

const RETRYABLE = status => status >= 500 || status === 408 || status === 429;
const backoffMs = attempt => Math.min(30000, 1000 * 2 ** (attempt - 1));

const RESPONSE_MAX_BYTES = 4096;
async function readSmall(res) {
  try {
    if (!res.body || typeof res.body.getReader !== "function") { const t = await res.text(); return Buffer.byteLength(t, "utf8") > RESPONSE_MAX_BYTES ? "" : t; }
    const reader = res.body.getReader(), parts = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_MAX_BYTES) { try { await reader.cancel(); } catch { /* ignore */ } return ""; }
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts).toString("utf8");
  } catch { return ""; }
}

function createCallbackDeliverer({ config, fetch: fetchImpl = globalThis.fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), maxAttempts = 6, timeoutMs = 15000, logger = console }) {
  if (!config || !config.enabled || typeof config.key !== "string") throw new Error("callback delivery is not configured");
  const log = (level, event, fields) => { try { (logger[level] || logger.info).call(logger, JSON.stringify({ event, ...fields })); } catch { /* telemetry never breaks delivery */ } };
  /** ONE freshly signed attempt; classifies the outcome; never throws. */
  async function attempt(result) {
    let body;
    try { body = encodeCallbackBody(result); } catch { return { delivered: false, retryable: false, errorClass: "protocol" }; }
    const raw = Buffer.from(body, "utf8");
    const requestId = "cb_" + crypto.randomBytes(18).toString("base64url");
    const headers = { "content-type": "application/json; charset=utf-8", ...signCallbackRequest({ key: config.key, timestamp: Math.floor(now() / 1000), requestId, body: raw }) };
    let res;
    try { res = await fetchImpl(config.url, { method: "POST", headers, body, redirect: "error", signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { return { delivered: false, retryable: true, errorClass: e && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network" }; }
    const status = res.status;
    if (status >= 200 && status < 300) {
      let json = null;
      try { json = JSON.parse(await readSmall(res)); } catch { json = null; }
      const confirmedAs = json && json.ok === true && json.applied === true && json.state === "retryable" ? "retryable" : "complete";
      return { delivered: true, status, confirmedAs };
    }
    try { if (res.body && typeof res.body.cancel === "function") await res.body.cancel(); } catch { /* the response body is never needed */ }
    return { delivered: false, retryable: RETRYABLE(status), status, errorClass: "http" };
  }
  return {
    attempt,
    /** In-process bounded retry loop over attempt() (17C behaviour). → { delivered, attempts, status? } — never throws. */
    async deliver(result) {
      encodeCallbackBody(result);
      let attempts = 0, lastStatus;
      while (attempts < maxAttempts) {
        attempts++;
        const r = await attempt(result);
        lastStatus = r.status;
        if (r.delivered) { log("info", "runner.callback.delivered", { jobId: result.jobId, attempts, status: r.status }); return { delivered: true, attempts, status: r.status }; }
        if (r.status !== undefined) log("warn", "runner.callback.rejected", { jobId: result.jobId, attempt: attempts, status: r.status, final: !r.retryable });
        else log("warn", "runner.callback.unreachable", { jobId: result.jobId, attempt: attempts });
        if (!r.retryable) break;
        if (attempts < maxAttempts) await sleep(backoffMs(attempts));
      }
      log("warn", "runner.callback.gave-up", { jobId: result.jobId, attempts, status: lastStatus });
      return { delivered: false, attempts, status: lastStatus };
    }
  };
}

module.exports = { CALLBACK_PROTOCOL, CALLBACK_PROTOCOL_VERSION, CALLBACK_PATH, CALLBACK_MAX_BYTES, CALLBACK_HEADERS, readCallbackConfig, signCallbackRequest, encodeCallbackBody, createCallbackDeliverer };
