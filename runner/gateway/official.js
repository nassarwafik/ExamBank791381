"use strict";
// Phase 17C — OFFICIAL grading jobs inside the long-lived Coding Runner Gateway.
//
// The gateway executes; SmartAssess grades. An official job is accepted (202) and executed in the background by a BOUNDED
// in-process queue; the raw evidence (per-case status / stdout / stderr / exit code / duration, plus the compile outcome for
// compiled toolchains) is delivered back to SmartAssess by the callback deliverer (callback.js). The runner never receives
// expected outputs, weights, titles, marks, the question, the exam or any identity, and never computes passed / score.
//
//   request (strict, exact keys):  { jobId, language, languageVersion, source, cases: [{ token, stdin }], limits: { timeMs,
//                                    memoryMb, outputBytes } }   — tokens are exactly c01, c02 … in order
//   dedupe:  jobId → sha256(canonical request) + state / result (bounded, time-limited cache). Same id + same body → idempotent
//            (a completed job is RE-DELIVERED from the cache without re-running student code); same id + a different body →
//            JOB_ID_CONFLICT (a reused id can never run replacement code).
//   bounds:  pending + active jobs ≤ maxPending (else RUNNER_BUSY), active jobs ≤ maxActive, cases of one job run with bounded
//            concurrency through the sandbox's global official container slots; every job has a server-owned hard wall.
//            An overrun / an infrastructure failure is reported as outcome "failed" with a technical code — never a partial grade.
const crypto = require("node:crypto");
const { resolveLanguage, compileWallMs, officialCaseWallMs } = require("./registry.js");

const OFFICIAL_BOUNDS = Object.freeze({
  sourceBytes: 65536,
  stdinBytes: 16384,                                 // CODING_TEST_LIMITS.ioBytes
  totalStdinBytes: 262144,                           // CODING_TEST_LIMITS.totalBytes
  maxCases: 50,                                      // CODING_TEST_LIMITS.hiddenTests
  timeMs: Object.freeze([250, 10000]),
  memoryMb: Object.freeze([16, 512]),
  outputBytes: Object.freeze([1024, 17408])          // OFFICIAL_STDOUT_CAPTURE_BYTES (ioBytes + 1024)
});
const OFFICIAL_JOB_MAX_MS = 20 * 60 * 1000;
const JOB_KEYS = ["cases", "jobId", "language", "languageVersion", "limits", "source"];
const LIMIT_KEYS = ["memoryMb", "outputBytes", "timeMs"];
const CASE_KEYS = ["stdin", "token"];
const JOB_ID = /^cg_[A-Za-z0-9_-]{16,64}$/;
const tokenFor = i => "c" + String(i + 1).padStart(2, "0");

const isPlainObject = v => !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exactKeys = (o, keys) => { const k = Object.keys(o).sort(); return k.length === keys.length && k.every((x, i) => x === keys[i]); };
const inRange = (v, [lo, hi]) => Number.isInteger(v) && v >= lo && v <= hi;

/** Validates the ONE official request shape. Returns { ok: true, job } (a fresh allow-listed copy) or { ok: false, code }. */
function validateOfficialJobRequest(body) {
  const bad = { ok: false, code: "REQUEST_INVALID" };
  if (!isPlainObject(body) || !exactKeys(body, JOB_KEYS)) return bad;
  const { jobId, language, languageVersion, source, cases, limits } = body;
  if (typeof jobId !== "string" || !JOB_ID.test(jobId)) return bad;
  if (!resolveLanguage(language, languageVersion)) return bad;
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") > OFFICIAL_BOUNDS.sourceBytes) return bad;
  if (!isPlainObject(limits) || !exactKeys(limits, LIMIT_KEYS) || !inRange(limits.timeMs, OFFICIAL_BOUNDS.timeMs) || !inRange(limits.memoryMb, OFFICIAL_BOUNDS.memoryMb) || !inRange(limits.outputBytes, OFFICIAL_BOUNDS.outputBytes)) return bad;
  if (!Array.isArray(cases) || cases.length < 1 || cases.length > OFFICIAL_BOUNDS.maxCases) return bad;
  let total = 0;
  const out = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!isPlainObject(c) || !exactKeys(c, CASE_KEYS) || c.token !== tokenFor(i) || typeof c.stdin !== "string") return bad;
    const n = Buffer.byteLength(c.stdin, "utf8");
    if (n > OFFICIAL_BOUNDS.stdinBytes) return bad;
    total += n;
    if (total > OFFICIAL_BOUNDS.totalStdinBytes) return bad;
    out.push({ token: c.token, stdin: c.stdin });
  }
  return { ok: true, job: { jobId, language, languageVersion, source, cases: out, limits: { timeMs: limits.timeMs, memoryMb: limits.memoryMb, outputBytes: limits.outputBytes } } };
}

/** The payload identity of a validated job (canonical key order). */
function officialPayloadHash(job) {
  const canonical = JSON.stringify({ jobId: job.jobId, language: job.language, languageVersion: job.languageVersion, source: job.source, cases: job.cases.map(c => [c.token, c.stdin]), limits: [job.limits.timeMs, job.limits.memoryMb, job.limits.outputBytes] });
  return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** The server-owned hard wall of one official job (compile + every case, at the bounded case concurrency), capped. */
function officialJobWallMs(entry, job, caseConcurrency = 2) {
  const rounds = Math.ceil(job.cases.length / Math.max(1, caseConcurrency));
  const ms = (entry.compileSandbox ? compileWallMs(entry) : 0) + rounds * officialCaseWallMs(entry, job.limits.timeMs) + 30000;
  return Math.min(OFFICIAL_JOB_MAX_MS, ms);
}

const RESULT_CASE_KEYS = new Set(["token", "status", "stdout", "stderr", "exitCode", "durationMs"]);
/** Reduces raw sandbox evidence to the callback contract (allow-list; nothing a sandbox adds survives). */
function toResult(jobId, evidence) {
  const cases = (Array.isArray(evidence && evidence.cases) ? evidence.cases : []).map(c => {
    const o = {};
    for (const k of Object.keys(c)) if (RESULT_CASE_KEYS.has(k)) o[k] = c[k];
    return o;
  });
  const out = { jobId, outcome: "completed", cases };
  if (evidence && evidence.compile) {
    out.compile = { status: evidence.compile.status === "compile-error" ? "compile-error" : "compiled" };
    if (typeof evidence.compile.stderr === "string" && out.compile.status === "compile-error") out.compile.stderr = evidence.compile.stderr;
    if (Number.isFinite(evidence.compile.durationMs)) out.compile.durationMs = evidence.compile.durationMs;
  }
  return out;
}

function createOfficialGradingQueue({ sandbox, deliver, maxPending = 8, maxActive = 1, caseConcurrency = 2, resultTtlMs = 60 * 60 * 1000, maxEntries = 512, jobWallMsFor, now = () => Date.now(), logger = console }) {
  if (!sandbox || typeof sandbox.runOfficialSuite !== "function") throw new Error("official queue needs a sandbox with runOfficialSuite");
  if (typeof deliver !== "function") throw new Error("official queue needs a deliver function");
  const entries = new Map();                          // jobId → { hash, state: "queued" | "running" | "completed", result?, at }
  const queue = [];
  let active = 0;
  const inFlight = new Set();
  const log = (level, event, fields) => { try { (logger[level] || logger.info).call(logger, JSON.stringify({ event, ...fields })); } catch { /* telemetry never breaks grading */ } };
  const track = p => { inFlight.add(p); p.finally(() => inFlight.delete(p)); return p; };
  const prune = () => {
    const t = now();
    for (const [id, e] of entries) if (e.state === "completed" && t - e.at > resultTtlMs) entries.delete(id);
    if (entries.size > maxEntries) for (const [id, e] of entries) { if (entries.size <= maxEntries) break; if (e.state === "completed") entries.delete(id); }
  };
  const pending = () => queue.length + active;
  const send = (result, redelivery) => track((async () => {
    try { const r = await deliver(result); log("info", "runner.official.callback", { jobId: result.jobId, outcome: result.outcome, delivered: !!(r && r.delivered), redelivery: !!redelivery }); }
    catch { log("warn", "runner.official.callback.failed", { jobId: result.jobId }); }
  })());

  async function runJob(job) {
    const entry = entries.get(job.jobId);
    entry.state = "running";
    const lang = resolveLanguage(job.language, job.languageVersion);
    const ac = new AbortController();
    const wall = (jobWallMsFor ? jobWallMsFor(lang, job) : officialJobWallMs(lang, job, caseConcurrency));
    const timer = setTimeout(() => ac.abort(), wall);
    const t0 = now();
    let result;
    try {
      const evidence = await sandbox.runOfficialSuite(lang, job, { signal: ac.signal, caseConcurrency });
      if (ac.signal.aborted) throw new Error("aborted");
      result = toResult(job.jobId, evidence);
      const counts = {};
      for (const c of result.cases) counts[c.status] = (counts[c.status] || 0) + 1;
      log("info", "runner.official.completed", { jobId: job.jobId, language: lang.key, compile: result.compile ? result.compile.status : "none", cases: result.cases.length, outcomes: counts, durationMs: now() - t0 });
    } catch {
      result = { jobId: job.jobId, outcome: "failed", technicalCode: ac.signal.aborted ? "SUITE_TIMEOUT" : "RUNNER_INTERNAL", cases: [] };
      log("warn", "runner.official.failed", { jobId: job.jobId, language: lang.key, technicalCode: result.technicalCode, durationMs: now() - t0 });
    } finally { clearTimeout(timer); }
    entry.state = "completed"; entry.result = result; entry.at = now();
    await send(result, false);
  }
  function pump() {
    while (active < maxActive && queue.length) {
      const job = queue.shift();
      active++;
      track(runJob(job).finally(() => { active--; pump(); }));
    }
  }
  return {
    /** → { status: "accepted" | "duplicate" | "conflict" | "busy" } */
    submit(job) {
      prune();
      const hash = officialPayloadHash(job), existing = entries.get(job.jobId);
      if (existing) {
        if (existing.hash !== hash) { log("warn", "runner.official.conflict", { jobId: job.jobId }); return { status: "conflict" }; }
        if (existing.state === "completed" && existing.result) send(existing.result, true);   // re-deliver; never re-run
        return { status: "duplicate" };
      }
      if (pending() >= maxPending) { log("warn", "runner.official.busy", { jobId: job.jobId, pending: pending() }); return { status: "busy" }; }
      entries.set(job.jobId, { hash, state: "queued", at: now() });
      queue.push(job);
      log("info", "runner.official.accepted", { jobId: job.jobId, language: job.language, cases: job.cases.length });
      pump();
      return { status: "accepted" };
    },
    /** Resolves once nothing is queued, running or being delivered (tests / graceful shutdown). */
    async idle() { while (queue.length || active || inFlight.size) await Promise.allSettled([...inFlight]); },
    size: () => ({ pending: pending(), active, entries: entries.size })
  };
}

module.exports = { OFFICIAL_BOUNDS, OFFICIAL_JOB_MAX_MS, validateOfficialJobRequest, officialPayloadHash, officialJobWallMs, createOfficialGradingQueue };
