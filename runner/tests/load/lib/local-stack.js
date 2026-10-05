"use strict";
// Phase 17F-B10-A — the LOCAL target: an in-process SmartAssess Coding stack the harness starts itself —
//   • the REAL gateway HTTP server (gateway/server.js), the REAL durable official queue (official.js), the REAL journal (journal.js,
//     in a private temporary directory — ephemeral by design for a load run) and the REAL callback deliverer (callback.js);
//   • a sandbox: the deterministic fake (fake-sandbox.js, default) or the real Docker sandbox (gateway/sandbox.js, `sandbox: "docker"`,
//     needs the worker images);
//   • a CALLBACK RECEIVER standing in for the SmartAssess API: verifies SA-CODING-CALLBACK-1 signatures, refuses non-evidence keys
//     (hidden-test leakage = a score / passed / expected field in a callback body), applies each job's result AT MOST ONCE
//     ({ ok, applied, state }) and answers { ok, alreadyApplied } to a re-delivery, mirroring api/src/functions/coding-grading.js;
//     a technical outcome ("failed") is applied as `retryable` (never a zero). It can be switched to fail (503) to park callbacks.
// `crash()` stops the gateway dead (no graceful drain, like a SIGKILL) and `restart()` opens a NEW gateway over the SAME journal
// directory — the recovery scenario. Nothing here is production code; keys are generated per stack and never printed.
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { createGatewayServer } = require("../../../gateway/server.js");
const { createOfficialGradingQueue } = require("../../../gateway/official.js");
const { createCallbackDeliverer, readCallbackConfig, CALLBACK_PATH, CALLBACK_MAX_BYTES } = require("../../../gateway/callback.js");
const { createJournal } = require("../../../gateway/journal.js");
const { journalStatus } = require("../../../deploy/azure-vm/journal-status.js");
const { createFakeSandbox } = require("./fake-sandbox.js");

const quiet = { info() {}, warn() {}, error() {} };
const EVIDENCE_TOP = new Set(["jobId", "outcome", "technicalCode", "compile", "cases"]);
const EVIDENCE_CASE = new Set(["token", "status", "stdout", "stderr", "exitCode", "durationMs"]);
const LEAK_KEYS = /^(score|passed|passedWeight|totalWeight|expected|expectedOutput|expectedOutputs|weight|mark|marks|grade)$/i;

/** The receiver's apply-once ledger mirrors the API's idempotent official application. */
function createReceiver({ key, scoreOf }) {
  const applied = new Map(), calls = [];
  let mode = "ok", slowMs = 0;
  const verify = (headers, raw) => {
    const canonical = ["SA-CODING-CALLBACK-1", "POST", CALLBACK_PATH, headers["x-sa-callback-timestamp"], headers["x-sa-callback-request-id"], crypto.createHash("sha256").update(raw).digest("hex")].join("\n");
    const mac = Buffer.from(crypto.createHmac("sha256", Buffer.from(key, "utf8")).update(canonical, "utf8").digest("hex"), "utf8");
    const given = Buffer.from(String(headers["x-sa-callback-signature"] || "").replace(/^v1=/, ""), "utf8");
    return given.length === mac.length && crypto.timingSafeEqual(given, mac);
  };
  const leakIn = body => { let n = 0; const scan = (o, allowed) => { for (const k of Object.keys(o || {})) if (!allowed.has(k) || LEAK_KEYS.test(k)) n++; }; scan(body, EVIDENCE_TOP); for (const c of Array.isArray(body.cases) ? body.cases : []) scan(c, EVIDENCE_CASE); return n; };
  // Independent Review Fix 1 (RF3): the body is BOUNDED by the Runner protocol's own callback ceiling (CALLBACK_MAX_BYTES, 8 MiB,
  // gateway/callback.js) BEFORE any verification — wrong method / path refused before reading; a Content-Length above the bound
  // refused at once; streamed bytes counted and the body dropped the moment it exceeds the bound (413); exactly-at-limit accepted;
  // HMAC still computed over the exact accepted bytes. No body, key or signature is ever logged.
  const stats = { oversizeRejected: 0, peakBufferedBytes: 0, refusedBeforeBody: 0 };
  const server = http.createServer((req, res) => {
    const answer = (status, json, { destroy = false } = {}) => { if (res.headersSent) return; res.writeHead(status, { "content-type": "application/json", connection: destroy ? "close" : "keep-alive" }); res.end(JSON.stringify(json), () => { if (destroy) req.destroy(); }); };
    if (req.method !== "POST" || req.url !== CALLBACK_PATH) { stats.refusedBeforeBody++; req.resume(); return answer(404, { ok: false, code: "NOT_FOUND" }, { destroy: true }); }
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > CALLBACK_MAX_BYTES) { stats.oversizeRejected++; return answer(413, { ok: false, code: "REQUEST_TOO_LARGE" }, { destroy: true }); }
    const parts = [];
    let size = 0, refused = false;
    req.on("error", () => { /* a destroyed oversize request */ });
    req.on("data", d => {
      if (refused) return;
      size += d.length;
      if (size > CALLBACK_MAX_BYTES) { refused = true; parts.length = 0; stats.oversizeRejected++; answer(413, { ok: false, code: "REQUEST_TOO_LARGE" }, { destroy: true }); return; }
      parts.push(d);
      if (size > stats.peakBufferedBytes) stats.peakBufferedBytes = size;
    });
    req.on("end", async () => {
      if (refused) return;
      const raw = Buffer.concat(parts, size);
      if (!verify(req.headers, raw)) return answer(401, { ok: false, code: "UNAUTHORIZED" });
      if (slowMs) await new Promise(r => setTimeout(r, slowMs));
      if (mode === "fail") { calls.push({ jobId: null, answer: "error", at: Date.now() }); return answer(503, { ok: false, code: "INTERNAL" }); }
      let body;
      try { body = JSON.parse(raw.toString("utf8")); } catch { return answer(400, { ok: false, code: "REQUEST_INVALID" }); }
      const leak = leakIn(body);
      const jobId = typeof body.jobId === "string" ? body.jobId : null;
      if (!jobId) return answer(400, { ok: false, code: "REQUEST_INVALID" });
      const cases = Array.isArray(body.cases) ? body.cases : [];
      const rec = { jobId, outcome: body.outcome, technicalCode: body.technicalCode || null, caseStatuses: cases.map(c => c.status), compile: body.compile ? body.compile.status : null, leak, at: Date.now(), bytes: raw.length };
      if (mode === "unknown") { calls.push({ ...rec, answer: "unknown" }); return answer(404, { ok: false, code: "UNKNOWN_JOB" }); }
      const prior = applied.get(jobId);
      if (prior) {
        // test-only FAULT modes (never the contract): "fault-mutate" answers alreadyApplied but silently changes the score;
        // "fault-reapply" applies the duplicate a second time. Both must be caught by the harness (RF2).
        if (mode === "fault-mutate") { prior.score = (prior.score || 0) + 1000; calls.push({ ...rec, answer: "alreadyApplied", score: prior.score }); return answer(200, { ok: true, alreadyApplied: true }); }
        if (mode === "fault-reapply") { prior.applications += 1; calls.push({ ...rec, answer: "applied", state: prior.state, score: prior.score }); return answer(200, { ok: true, applied: true, state: prior.state }); }
        calls.push({ ...rec, answer: "alreadyApplied", score: prior.score }); return answer(200, { ok: true, alreadyApplied: true });
      }
      const technical = body.outcome === "failed" || cases.some(c => c.status === "internal-error");
      const state = technical ? "retryable" : "complete";
      const score = technical ? null : (scoreOf ? scoreOf(body) : cases.filter(c => c.status === "success").length);
      applied.set(jobId, { state, score, applications: 1, outcome: body.outcome, caseStatuses: rec.caseStatuses, compile: rec.compile, stdouts: cases.map(c => String(c.stdout || "").trim()), at: Date.now() });
      calls.push({ ...rec, answer: "applied", state, score });
      return answer(200, { ok: true, applied: true, state });
    });
  });
  return {
    server, calls, applied, stats: () => ({ ...stats }),
    setMode(m) { mode = m; }, setSlow(ms) { slowMs = ms; },
    async listen() { await new Promise(r => server.listen(0, "127.0.0.1", r)); return server.address().port; },
    close: () => new Promise(r => server.close(() => r()))
  };
}

/** createLocalStack(options) → { start, close, crash, restart, baseUrl, key, receiver, journalDir, journalStatus, sandbox } */
function createLocalStack({ sandbox = "fake", profile, maxConcurrency = 4, official = {}, callbackPolicy, executionPolicy, logger = quiet, scoreOf, callbackBaseUrl = null, callbackKey = null } = {}) {
  const key = "load-harness-local-runner-key-" + crypto.randomBytes(16).toString("hex");            // generated per stack, never printed
  const cbKey = "load-harness-local-callback-key-" + crypto.randomBytes(16).toString("hex");
  const journalDir = fs.mkdtempSync(path.join(os.tmpdir(), "sa-load-journal-"));
  const sb = sandbox === "docker" ? require("../../../gateway/sandbox.js").createDockerSandbox() : createFakeSandbox({ profile });
  const receiver = createReceiver({ key: cbKey, scoreOf });
  const opts = { maxPending: official.maxPending || 8, maxActive: official.maxActive || 1, caseConcurrency: official.caseConcurrency || 2 };
  let gateway = null, queue = null, journal = null, port = null, generation = 0;
  // Hotfix (admission oracle) — a held burst: official executions wait until `remaining` further official submissions were ANSWERED
  // by this stack's gateway (accepted or busy), then are released; a safety timer releases anyway so a broken run fails, never hangs.
  let hold = null;
  const officialAnswered = () => { if (!hold) return; hold.remaining--; if (hold.remaining <= 0) { const h = hold; hold = null; clearTimeout(h.timer); h.release(); } };
  const stack = {
    journalDir, receiver, sandbox: sb, config: { sandbox, maxConcurrency, official: opts },
    get baseUrl() { return "http://127.0.0.1:" + port; },
    callbackUrl: null,
    async start() {
      if (!receiver.server.listening) stack.callbackUrl = "http://127.0.0.1:" + (await receiver.listen());
      generation++;
      journal = createJournal({ dir: journalDir });
      await journal.open();
      // by default the stack delivers to its OWN receiver; a test may point it at an external destination (e.g. the harness receiver of a
      // staging rehearsal, where this stack plays the remote Runner)
      const cb = readCallbackConfig({ SMARTASSESS_CALLBACK_BASE_URL: callbackBaseUrl || stack.callbackUrl, SMARTASSESS_CALLBACK_HMAC_KEY: callbackKey || cbKey });
      if (!cb.enabled) throw new Error("local stack: callback destination is not valid");
      stack.callbackDestination = callbackBaseUrl || stack.callbackUrl;
      queue = createOfficialGradingQueue({ sandbox: sb, deliver: createCallbackDeliverer({ config: cb, logger }).attempt, journal, ...opts, logger, ...(callbackPolicy ? { callbackPolicy } : {}), ...(executionPolicy ? { executionPolicy } : {}) });
      const recovery = await queue.start();
      gateway = createGatewayServer({ key, sandbox: sb, maxConcurrency, officialQueue: queue, logger });
      gateway.on("request", (req, res) => { if (req.method === "POST" && String(req.url || "").startsWith("/v1/official-grading-jobs")) res.on("finish", officialAnswered); });
      await new Promise((resolve, reject) => { gateway.once("error", reject); gateway.listen(port || 0, "127.0.0.1", () => { gateway.off("error", reject); resolve(); }); });
      port = gateway.address().port;
      return { generation, recovery };
    },
    queueStatus: () => (queue ? queue.status() : null),
    /** Holds official executions (fake sandbox only) until `n` further official submissions were answered; safety release after `maxMs`. */
    holdOfficialUntilAnswered(n, { maxMs = 30000 } = {}) {
      if (typeof sb.holdOfficial !== "function") throw new Error("local stack: holdOfficialUntilAnswered needs the fake sandbox");
      if (hold) { clearTimeout(hold.timer); hold.release(); }
      const release = sb.holdOfficial();
      const timer = setTimeout(() => { if (hold && hold.release === release) hold = null; release(); }, maxMs);
      if (timer.unref) timer.unref();
      hold = { remaining: n, release, timer };
    },
    idle: () => (queue ? queue.idle() : Promise.resolve()),
    journalStatus: () => journalStatus(journalDir),
    /** A dead stop (no drain, no further journal writes) — the process "died"; the receiver keeps running. */
    async crash() { if (queue) queue.stop(); if (gateway) await new Promise(r => gateway.close(() => r())); if (journal) await journal.close().catch(() => {}); gateway = null; queue = null; journal = null; },
    /** A new gateway over the same journal directory (startup recovery runs). */
    async restart() { await stack.crash(); return stack.start(); },
    async close() { if (hold) { clearTimeout(hold.timer); hold.release(); hold = null; } await stack.crash(); await receiver.close(); try { fs.rmSync(journalDir, { recursive: true, force: true }); } catch { /* temp */ } }
  };
  Object.defineProperty(stack, "key", { value: key, enumerable: false });
  Object.defineProperty(stack, "callbackKey", { value: cbKey, enumerable: false });
  return stack;
}

module.exports = { createLocalStack, createReceiver };
