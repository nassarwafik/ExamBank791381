"use strict";
// Phase 17B — the Coding Runner Gateway HTTP surface. It knows NOTHING about students, classes, exams, storage, hidden tests or
// marks: it authenticates the SmartAssess API (auth.js), validates the minimal request (validate.js), maps the contract to a
// fixed image (registry.js) and runs ONE disposable sandbox (sandbox.js) — with a hard cap on concurrent sandboxes (beyond it:
// 503 RUNNER_BUSY immediately; no queue, no retry).
//     GET  /healthz           → { ok: true }                               (no auth; reveals nothing)
//     GET  /v1/capabilities   → { ok, available, languages: [{ key, languageVersion }] }   (signed)
//     POST /v1/execute        → { ok: true, result } | { ok: false, code }                  (signed)
// Telemetry is limited to request id, language, status, duration and refusal reasons — never source, stdin, stdout, stderr,
// signatures or keys.
const http = require("node:http");
const { verifyRequest, createReplayGuard, HEADERS } = require("./auth.js");
const { validateExecuteRequest } = require("./validate.js");
const { resolveLanguage } = require("./registry.js");

const MAX_BODY_BYTES = 512 * 1024;
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };

class BodyTooLarge extends Error {}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > max) { reject(new BodyTooLarge()); req.resume(); return; }
    const parts = []; let size = 0, failed = false;
    req.on("data", d => { if (failed) return; size += d.length; if (size > max) { failed = true; reject(new BodyTooLarge()); return; } parts.push(d); });
    req.on("end", () => { if (!failed) resolve(Buffer.concat(parts)); });
    req.on("error", e => { if (!failed) { failed = true; reject(e); } });
  });
}

function createGateway({ key, sandbox, maxConcurrency = 2, now = () => Date.now(), logger = console, replay = createReplayGuard() }) {
  if (typeof key !== "string" || key.length < 32) throw new Error("gateway key missing or too short");
  let active = 0;
  const log = (level, event, fields) => { try { (logger[level] || logger.info).call(logger, JSON.stringify({ event, ...fields })); } catch { /* telemetry never breaks a request */ } };
  const send = (res, status, body) => { res.writeHead(status, JSON_HEADERS); res.end(JSON.stringify(body)); };

  async function handle(req, res) {
    const url = new URL(req.url || "/", "http://gateway.invalid");
    const route = req.method + " " + url.pathname;
    if (route === "GET /healthz") return send(res, 200, { ok: true });
    if (route !== "GET /v1/capabilities" && route !== "POST /v1/execute") return send(res, 404, { ok: false, code: "NOT_FOUND" });

    let body;
    try { body = await readBody(req, MAX_BODY_BYTES); }
    catch (e) { if (e instanceof BodyTooLarge) { log("warn", "runner.request.refused", { reason: "body-too-large" }); return send(res, 413, { ok: false, code: "REQUEST_INVALID" }); } throw e; }

    const auth = verifyRequest({ key, method: req.method, path: url.pathname, headers: req.headers, body, nowMs: now(), replay });
    if (!auth.ok) { log("warn", "runner.request.unauthorized", { reason: auth.reason }); return send(res, 401, { ok: false, code: "UNAUTHORIZED" }); }

    if (route === "GET /v1/capabilities") {
      let languages = [];
      try { languages = await sandbox.availableLanguages(); } catch { languages = []; }
      const offered = languages.filter(l => resolveLanguage(l.key, l.languageVersion)).map(l => ({ key: l.key, languageVersion: l.languageVersion }));
      return send(res, 200, { ok: true, available: offered.length > 0, languages: offered });
    }

    let parsed;
    try { parsed = JSON.parse(body.toString("utf8")); } catch { return send(res, 400, { ok: false, code: "REQUEST_INVALID" }); }
    if (!parsed || typeof parsed !== "object" || parsed.requestId !== auth.requestId) {
      if (parsed && typeof parsed === "object" && typeof parsed.requestId === "string") { log("warn", "runner.request.unauthorized", { reason: "request-id-binding" }); return send(res, 401, { ok: false, code: "UNAUTHORIZED" }); }
      return send(res, 400, { ok: false, code: "REQUEST_INVALID" });
    }
    const v = validateExecuteRequest(parsed);
    if (!v.ok) { log("warn", "runner.request.refused", { requestId: auth.requestId, reason: "invalid" }); return send(res, 400, { ok: false, code: "REQUEST_INVALID" }); }
    const request = v.request, entry = resolveLanguage(request.language, request.languageVersion);
    let offered = [];
    try { offered = await sandbox.availableLanguages(); } catch { offered = []; }
    if (!offered.some(l => l.key === entry.key && l.languageVersion === entry.languageVersion)) return send(res, 422, { ok: false, code: "LANGUAGE_UNAVAILABLE" });

    if (active >= maxConcurrency) { log("warn", "runner.execute.busy", { requestId: request.requestId, active }); return send(res, 503, { ok: false, code: "RUNNER_BUSY" }); }
    active++;
    const t0 = now();
    try {
      const result = await sandbox.run(entry, request);
      log("info", "runner.execute.completed", { requestId: request.requestId, language: entry.key, status: result.status, durationMs: now() - t0 });
      return send(res, 200, { ok: true, result });
    } catch {
      log("warn", "runner.execute.failed", { requestId: request.requestId, language: entry.key, durationMs: now() - t0 });
      return send(res, 200, { ok: true, result: { status: "internal-error", stdout: "", stderr: "" } });
    } finally {
      active--;
    }
  }

  return {
    handle(req, res) { handle(req, res).catch(() => { if (!res.headersSent) send(res, 500, { ok: false, code: "INTERNAL" }); else res.destroy(); }); },
    activeCount: () => active
  };
}

function createGatewayServer(options) {
  const gateway = createGateway(options);
  const server = http.createServer({ requestTimeout: 120000, headersTimeout: 15000 }, (req, res) => gateway.handle(req, res));
  server.maxHeadersCount = 50;
  return server;
}

module.exports = { createGateway, createGatewayServer, MAX_BODY_BYTES, HEADERS };
