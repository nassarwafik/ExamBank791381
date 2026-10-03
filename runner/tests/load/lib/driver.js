"use strict";
// Phase 17F-B10-A — the harness CLIENT of the Runner protocol (SA-CODING-RUNNER-1) and of the callback protocol
// (SA-CODING-CALLBACK-1). It reuses the gateway's own signers (gateway/auth.js, gateway/callback.js) — no second implementation —
// so the harness speaks EXACTLY the protocol the SmartAssess API speaks. Every answer is CLASSIFIED (never thrown) so the
// accumulators can attribute it: completed execution · RUNNER_BUSY · rejected · unauthorized · network error. The fetch
// implementation is injected: a dry run uses one that must never be called. Nothing here logs a body, a key or a signature.
const crypto = require("node:crypto");
const { signRequest } = require("../../../gateway/auth.js");
const { signCallbackRequest, encodeCallbackBody, CALLBACK_PATH } = require("../../../gateway/callback.js");

const rid = p => p + crypto.randomBytes(9).toString("hex");

function createRunnerClient({ baseUrl, key, fetchImpl, timeoutMs = 75000, now = () => Date.now() }) {
  if (typeof fetchImpl !== "function") throw new TypeError("runner client needs a fetch implementation");
  if (typeof key !== "string" || key.length < 32) throw new TypeError("runner client needs the runner key");
  const base = String(baseUrl).replace(/\/+$/, "");
  async function call(method, p, body, { unsigned = false } = {}) {
    const text = body === undefined ? "" : JSON.stringify(body);
    const buf = Buffer.from(text, "utf8");
    const requestId = body && body.requestId ? body.requestId : rid("ld_");
    const headers = { ...(unsigned ? {} : signRequest({ key, method, path: p, timestamp: Math.floor(now() / 1000), requestId, body: buf })), ...(method === "POST" ? { "content-type": "application/json", "content-length": String(buf.length) } : {}) };
    const t0 = now();
    try {
      const res = await fetchImpl(base + p, { method, headers, body: method === "POST" ? buf : undefined, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
      let json = null;
      try { json = JSON.parse(await res.text()); } catch { json = null; }
      return { httpStatus: res.status, json, ms: now() - t0 };
    } catch (e) {
      return { httpStatus: 0, json: null, ms: now() - t0, error: e && (e.name === "TimeoutError" || e.name === "AbortError") ? "timeout" : "network" };
    }
  }
  return {
    async health() { const r = await call("GET", "/healthz", undefined, { unsigned: true }); return { ok: r.httpStatus === 200 && !!r.json && r.json.ok === true, httpStatus: r.httpStatus, ms: r.ms }; },
    async capabilities() { const r = await call("GET", "/v1/capabilities"); return { ok: r.httpStatus === 200, httpStatus: r.httpStatus, languages: r.json && Array.isArray(r.json.languages) ? r.json.languages.map(l => l.key) : [], ms: r.ms }; },
    /** → { httpStatus, code?, result?, ms, error? } */
    async execute({ language, source, stdin, limits }) {
      const body = { requestId: rid("ld_"), language, languageVersion: 1, source, stdin, limits: { timeMs: limits.timeMs, memoryMb: limits.memoryMb, outputBytes: limits.outputBytes } };
      const r = await call("POST", "/v1/execute", body);
      if (r.error) return { httpStatus: 0, ms: r.ms, error: r.error };
      if (r.httpStatus === 200 && r.json && r.json.ok === true && r.json.result) return { httpStatus: 200, result: r.json.result, ms: r.ms };
      return { httpStatus: r.httpStatus, code: r.json && r.json.code ? String(r.json.code) : "UNKNOWN", ms: r.ms };
    },
    /** → { httpStatus, status: accepted | duplicate | busy | unavailable | conflict | stale | unauthorized | rejected | network, ms } */
    async submitOfficial(job) {
      const r = await call("POST", "/v1/official-grading-jobs", job);
      if (r.error) return { httpStatus: 0, status: "network", ms: r.ms };
      const code = r.json && r.json.code;
      let status = "rejected";
      if (r.httpStatus === 202 && r.json && r.json.accepted === true) status = r.json.duplicate ? "duplicate" : "accepted";
      else if (r.httpStatus === 503 && code === "RUNNER_BUSY") status = "busy";
      else if (r.httpStatus === 503) status = "unavailable";
      else if (r.httpStatus === 409 && code === "JOB_ID_CONFLICT") status = "conflict";
      else if (r.httpStatus === 409 && code === "STALE_REVISION") status = "stale";
      else if (r.httpStatus === 401) status = "unauthorized";
      return { httpStatus: r.httpStatus, status, code: code ? String(code) : null, ms: r.ms };
    }
  };
}

/** A signed CALLBACK sender (the Runner → SmartAssess direction) for callback-burst and idempotency scenarios. */
function createCallbackSender({ baseUrl, key, fetchImpl, timeoutMs = 60000, now = () => Date.now() }) {
  if (typeof fetchImpl !== "function") throw new TypeError("callback sender needs a fetch implementation");
  if (typeof key !== "string" || key.length < 32) throw new TypeError("callback sender needs the callback key");
  const url = new URL(baseUrl).origin + CALLBACK_PATH;
  return {
    /** → { httpStatus, answer: applied | alreadyApplied | unknown | unauthorized | stale | rejected | error | network, state?, ms, bytes } */
    async send(body) {
      const text = encodeCallbackBody(body), buf = Buffer.from(text, "utf8");
      const headers = { "content-type": "application/json; charset=utf-8", "content-length": String(buf.length), ...signCallbackRequest({ key, timestamp: Math.floor(now() / 1000), requestId: rid("ldcb_"), body: buf }) };
      const t0 = now();
      try {
        const res = await fetchImpl(url, { method: "POST", headers, body: buf, redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
        let json = null;
        try { json = JSON.parse(await res.text()); } catch { json = null; }
        const code = json && json.code;
        let answer = "error";
        if (res.status === 200 && json && json.applied === true) answer = "applied";
        else if (res.status === 200 && json && json.alreadyApplied === true) answer = "alreadyApplied";
        else if (res.status === 404 && code === "UNKNOWN_JOB") answer = "unknown";
        else if (res.status === 401) answer = "unauthorized";
        else if (res.status === 409 && code === "STALE_RESULT") answer = "stale";
        else if (res.status === 400 || res.status === 413) answer = "rejected";
        return { httpStatus: res.status, answer, state: json && json.state ? String(json.state) : null, ms: now() - t0, bytes: buf.length };
      } catch (e) { return { httpStatus: 0, answer: "network", ms: now() - t0, bytes: buf.length, error: e && e.name === "TimeoutError" ? "timeout" : "network" }; }
    }
  };
}

/** A synthetic callback body for a job id that cannot exist (`nearMax` fills 50 worst-case cases, ≈ 6.45 MB). */
function syntheticCallbackBody({ nearMax = false, jobId = "cg_loadprobe_" + crypto.randomBytes(12).toString("hex") } = {}) {
  if (!nearMax) return { jobId, outcome: "completed", cases: [{ token: "c01", status: "success", stdout: "42\n", stderr: "", exitCode: 0, durationMs: 1 }] };
  const cases = [];
  for (let i = 0; i < 50; i++) cases.push({ token: "c" + String(i + 1).padStart(2, "0"), status: "success", stdout: "\u0001".repeat(17408), stderr: "\u0001".repeat(4096), exitCode: 0, durationMs: 1 });
  return { jobId, outcome: "completed", cases };
}

module.exports = { createRunnerClient, createCallbackSender, syntheticCallbackBody, rid };
