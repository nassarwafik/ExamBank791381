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
//   dedupe:  jobId → sha256(canonical request) in the DURABLE journal (Phase 17D-B2, journal.js). Same id + same body →
//            idempotent (never a second execution lifecycle); same id + a different body (or revision) → JOB_ID_CONFLICT (a reused
//            id can never run replacement code). Optional { revision, targetRef } (both or neither — signed by SmartAssess) order
//            the revisions of ONE opaque target: an older revision after a newer one is refused (STALE_REVISION) or, if still
//            queued, superseded — never executed.
//   durability (17D-B2): RECEIVED (journaled before the 202) → RUNNING → EXECUTED (result durable = callback pending) →
//            CONFIRMED (SmartAssess acknowledged) | CALLBACK_FAILED (parked; re-armed only by a fresh delivery) | SUPERSEDED.
//            A restart re-runs RECEIVED, marks RUNNING as interrupted (bounded re-runs, then a technical outcome), retries the
//            callback of EXECUTED from the durable result (never re-executing), and does nothing for terminal records.
//   bounds:  pending + active jobs ≤ maxPending (else RUNNER_BUSY), active jobs ≤ maxActive, cases of one job run with bounded
//            concurrency through the sandbox's global official container slots; every job has a server-owned hard wall.
//            An overrun / an infrastructure failure is reported as outcome "failed" with a technical code — never a partial grade.
//   admission (17F-B3): EVERY decision over shared admission state — started / stopped, the truncated index, job identity,
//            the target revision authority, LIVE ≤ maxPending, records ≤ maxRecords, the durable commit and the install into
//            the in-memory records — runs inside ONE queue-wide admission critical section (withAdmission). Lock order, always:
//            ADMISSION → withJob(jobId) → journal; never withJob → admission. The section covers admission writes only, never
//            sandbox execution, callback delivery, job walls or lifecycle completion (pump / schedule only start tracked work).
//   target authority (17F-B3 review fix 1): the durable RECORD is the authority of a revision ({ targetRef, revision, jobId }
//            inside it); the target index (targets/<ref>.json + the in-memory `targets`) is a derived, monotonic cache that is
//            advanced ONLY AFTER the durable accepted commit — never by an admission that did not reach it (no phantom authority
//            on a failed writeRecord, nothing to roll back). A failed index write after the commit is explicit (logged, counted in
//            status().targetIndexLag), retried by maintenance and re-derived from the records at startup. EVERY mutation of the
//            index — admission, retention pruning, startup repair — runs under the ONE admission authority; the retention path
//            called from inside an admission transaction ({ locked }) never re-enters it (no ADMISSION → maintain → ADMISSION).
//   cache vs durable (review fix 2): the in-memory `targets` map is a CACHE of the durable index, never the only authority: its
//            warm load at startup is bounded (startupScanMax) and may be truncated — reported, never silent — because index
//            entries are retained longer (failedRetentionMs) than confirmed records. Under ADMISSION a cache miss is resolved from
//            journal.readTarget (loadTargetAuthority) before any stale / conflict / advance decision; an I/O error there fails
//            that submission closed (busy) and is never read as "no authority". Startup reasons per target by REVISION GROUP: a
//            unique highest record repairs a lagging entry; an existing durable entry that selects one of several same-revision
//            records is preserved (the competitors are held, never executed as the authority); several same-revision records
//            without such an entry are NEVER resolved by scan order — the target is blocked (fail closed: busy) and its live
//            records held until a durable authority exists. Pre-B3 gateways could race on same target / same revision (ADM20).
//   delivery authority (review fix 3): journal.readTarget is structured ({ target } | { missing } | { corrupt }); CORRUPT is never
//            "missing" (an unreadable entry may be the only surviving ordering evidence): the submission fails closed (busy /
//            target-authority-corrupt), the reference is blocked, the file is never rewritten or deleted. Target authority
//            guards DELIVERY as well as execution (deliverable): a record of a blocked target, or a held competitor, never sends,
//            retries or re-arms a callback; its durable result is preserved. The competitors of a durably SELECTED authority are
//            superseded durably at startup (or held and superseded once a higher authority advances) — never LIVE forever.
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
const VERSIONED_JOB_KEYS = ["cases", "jobId", "language", "languageVersion", "limits", "revision", "source", "targetRef"];
const TARGET_REF = /^tr_[0-9a-f]{40}$/;
const MAX_REVISION = 1000000;
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
  if (!isPlainObject(body)) return bad;
  const versioned = exactKeys(body, VERSIONED_JOB_KEYS);
  if (!versioned && !exactKeys(body, JOB_KEYS)) return bad;
  const { jobId, language, languageVersion, source, cases, limits } = body;
  if (versioned && (!Number.isInteger(body.revision) || body.revision < 1 || body.revision > MAX_REVISION || typeof body.targetRef !== "string" || !TARGET_REF.test(body.targetRef))) return bad;
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
  const job = { jobId, language, languageVersion, source, cases: out, limits: { timeMs: limits.timeMs, memoryMb: limits.memoryMb, outputBytes: limits.outputBytes } };
  if (versioned) { job.revision = body.revision; job.targetRef = body.targetRef; }
  return { ok: true, job };
}

/** The payload identity of a validated job (canonical key order). */
function officialPayloadHash(job) {
  const canonical = JSON.stringify({ jobId: job.jobId, language: job.language, languageVersion: job.languageVersion, source: job.source, cases: job.cases.map(c => [c.token, c.stdin]), limits: [job.limits.timeMs, job.limits.memoryMb, job.limits.outputBytes], ...(job.targetRef ? { revision: job.revision, targetRef: job.targetRef } : {}) });
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

// ── Phase 17D-B2 — the DURABLE official queue ─────────────────────────────────────────────────────────────────────────
// Callback retry: one signed attempt per call (callback.js attempt()); the attempt is RESERVED in the journal before it is
// sent (attempts++, next try after the backoff), so a crash never resets or under-counts the retry state. Retryable failures
// (network, timeout, 5xx, 408, 429) back off exponentially (baseMs · 2^(k−1), capped) inside a bounded window of attempts;
// a permanent failure (any other 4xx, a local protocol error) or an exhausted window PARKS the job (callback_failed) — only a
// fresh delivery of the same job by SmartAssess re-arms it, at most maxRearms times. SmartAssess answers decide confirmation:
// "complete" / "alreadyApplied" → done; "retryable" (a technical outcome the API could not grade) → the next delivery of the
// same job starts a NEW execution generation (bounded by maxGenerations). Physical execution: at most once per job and
// generation, plus bounded re-runs when the gateway process dies DURING execution. Official application: at most once (API).
const CALLBACK_POLICY = Object.freeze({ maxAttemptsPerWindow: 8, baseMs: 2000, capMs: 10 * 60 * 1000, maxRearms: 8, concurrency: 2 });
const EXECUTION_POLICY = Object.freeze({ maxInterruptions: 2, maxGenerations: 3 });
const MAINTENANCE_INTERVAL_MS = 60 * 1000;
const DEFAULT_LIMITS = Object.freeze({ maxRecords: 1024, startupScanMax: 2048, pruneBatch: 64, confirmedRetentionMs: 24 * 3600000, failedRetentionMs: 7 * 24 * 3600000 });
const iso = ms => new Date(ms).toISOString();
const timeOf = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const intIn = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LIVE = new Set(["received", "running"]);

function normalizeCallbackPolicy(p = {}) {
  const baseMs = intIn(p.baseMs, 1, 3600000, CALLBACK_POLICY.baseMs);
  return Object.freeze({ maxAttemptsPerWindow: intIn(p.maxAttemptsPerWindow, 1, 50, CALLBACK_POLICY.maxAttemptsPerWindow), baseMs, capMs: Math.max(baseMs, intIn(p.capMs, 1, 3600000, CALLBACK_POLICY.capMs)), maxRearms: intIn(p.maxRearms, 0, 50, CALLBACK_POLICY.maxRearms), concurrency: intIn(p.concurrency, 1, 8, CALLBACK_POLICY.concurrency) });
}
function normalizeExecutionPolicy(p = {}) {
  return Object.freeze({ maxInterruptions: intIn(p.maxInterruptions, 0, 10, EXECUTION_POLICY.maxInterruptions), maxGenerations: intIn(p.maxGenerations, 1, 10, EXECUTION_POLICY.maxGenerations) });
}
/** Counts only — never output, stdin or source. */
function summaryOf(result) {
  const statuses = {};
  for (const c of Array.isArray(result.cases) ? result.cases : []) statuses[c.status] = (statuses[c.status] || 0) + 1;
  return { cases: Array.isArray(result.cases) ? result.cases.length : 0, statuses, compile: result.compile ? result.compile.status : null };
}

function createOfficialGradingQueue({ sandbox, deliver, journal, maxPending = 8, maxActive = 1, caseConcurrency = 2, jobWallMsFor, now = () => Date.now(), logger = console, callbackPolicy, executionPolicy } = {}) {
  if (!sandbox || typeof sandbox.runOfficialSuite !== "function") throw new Error("official queue needs a sandbox with runOfficialSuite");
  if (typeof deliver !== "function") throw new Error("official queue needs a deliver function");
  if (!journal || typeof journal.writeRecord !== "function" || typeof journal.scan !== "function") throw new Error("official queue needs a durable journal (Phase 17D-B2)");
  const cp = normalizeCallbackPolicy(callbackPolicy || {}), ep = normalizeExecutionPolicy(executionPolicy || {});
  const L = { ...DEFAULT_LIMITS, ...(journal.limits || {}) };
  const records = new Map();                         // jobId → record (cache of the durable truth; disk is authoritative on restart)
  const targets = new Map();                         // targetRef → { targetRef, revision, jobId, updatedAt } (derived from the records)
  const dirtyTargets = new Set();                    // targetRefs whose in-memory authority is ahead of the durable index (write failed)
  const blockedTargets = new Map();                  // targetRef → "inconsistent" | "authority-unavailable" (fail closed, startup-decided)
  const held = new Set();                            // jobIds withheld from execution AND delivery (records of a blocked target; a competitor whose supersede failed)
  const corruptTargets = new Set();                  // targetRefs whose durable index entry is unreadable (blocked "authority-corrupt"; never deleted)
  const runQueue = [], queued = new Set(), sending = new Set(), work = new Set(), locks = new Map(), holdUntil = new Map();
  let active = 0, stopped = false, started = false, truncated = false, targetsTruncated = false, timer = null, maintenance = null;
  const log = (level, event, fields) => { try { (logger[level] || logger.info).call(logger, JSON.stringify({ event, ...fields })); } catch { /* telemetry never breaks grading */ } };
  const track = p => { const t = Promise.resolve(p).catch(() => {}); work.add(t); t.then(() => work.delete(t)); return t; };
  const stoppedError = () => Object.assign(new Error("official queue stopped"), { code: "QUEUE_STOPPED" });
  const freshCallback = (attempts = 0) => ({ attempts, windowEnd: attempts + cp.maxAttemptsPerWindow, rearms: 0, nextAt: null, lastAt: null, lastStatus: null, lastErrorClass: null, confirmedAt: null, confirmedAs: null });
  const statusOf = out => (out && Number.isInteger(out.status) ? out.status : null);
  const classOf = out => (out && typeof out.errorClass === "string" && /^[a-z]{1,16}$/.test(out.errorClass) ? out.errorClass : (out && out.delivered === false ? "unknown" : null));
  /** Backoff after the k-th attempt of the current window: baseMs · 2^(k−1), capped. */
  const backoffAfter = r => { const k = Math.max(1, r.callback.attempts - (r.callback.windowEnd - cp.maxAttemptsPerWindow)); return Math.min(cp.capMs, cp.baseMs * 2 ** Math.min(k - 1, 30)); };

  /** Serialises everything that reads-and-writes ONE job's record (receive, execution steps, callback steps, pruning). */
  function withJob(jobId, fn) {
    const prev = locks.get(jobId) || Promise.resolve();
    const run = prev.then(() => fn());
    const guard = run.catch(() => {});
    locks.set(jobId, guard);
    guard.then(() => { if (locks.get(jobId) === guard) locks.delete(jobId); });
    return run;
  }
  // ── Phase 17F-B3 — the ONE admission authority ───────────────────────────────────────────────────────────────────────
  // withJob() serialises ONE job id; the LIVE count, records.size and the target index are SHARED across job ids, so two
  // concurrent NEW jobs used to read the same stale count, both pass `live < maxPending`, both journal, both install (B10-F1:
  // maxPending 3, 8 concurrent → 8 accepted). withAdmission() is a queue-wide async mutex: one admission transaction at a time
  // reads the shared state, journals and installs; the next one sees the installed record. A rejection inside releases the
  // mutex exactly like a return (the chain continues through a swallowed catch), so a failed admission can never wedge it.
  let admissionChain = Promise.resolve();
  function withAdmission(fn) {
    const prev = admissionChain;
    const run = prev.then(() => fn());
    admissionChain = run.catch(() => {});
    return run;
  }
  const liveCount = () => { let n = 0; for (const r of records.values()) if (LIVE.has(r.state)) n++; return n; };
  const busy = (jobId, reason, extra = {}) => { log("warn", "runner.official.busy", { jobId, reason, ...extra }); return { status: "busy" }; };
  /**
   * Advances the target index to `doc` (caller holds ADMISSION; doc.revision is above the current entry). The authority of the
   * revision is the durable record this doc is derived from, so memory moves first (every later decision is correct) and the
   * durable index follows; a failed index write is never hidden: counted (dirtyTargets → status().targetIndexLag), logged
   * without the opaque reference, retried by every maintenance pass and re-derived from the records at the next start.
   */
  async function advanceTarget(doc, stage) {
    targets.set(doc.targetRef, doc);
    try { await journal.writeTarget(doc); dirtyTargets.delete(doc.targetRef); if (stage !== "receive") log("info", "coding.runner.target.repaired", { jobId: doc.jobId, revision: doc.revision, stage }); }
    catch { dirtyTargets.add(doc.targetRef); log("warn", "coding.runner.target.write-failed", { jobId: doc.jobId, revision: doc.revision, stage }); }
    // a held competitor below the new authority is unambiguously obsolete now: superseded (if that fails it stays held, retried at the next advance / start)
    for (const id of [...held]) { const r = records.get(id); if (r && r.targetRef === doc.targetRef && r.revision < doc.revision) await supersede(id, "advance"); }
  }
  const targetDoc = (targetRef, revision, jobId, at) => ({ schemaVersion: 1, targetRef, revision, jobId, updatedAt: at });
  /**
   * The authority of ONE target reference (caller holds ADMISSION). `targets` is a cache whose warm load is bounded and may be
   * truncated, so a miss is resolved from the durable index and installed; null means "no durable entry" ONLY when the read
   * succeeded with { missing }. A CORRUPT entry blocks the reference ("authority-corrupt", counted, logged without the
   * reference) and throws TARGET_CORRUPT; an I/O error propagates. Either way the caller fails closed — never "no authority".
   */
  async function loadTargetAuthority(targetRef, stage = "receive") {
    const cached = targets.get(targetRef);
    if (cached) return cached;
    const r = await journal.readTarget(targetRef);
    if (r.corrupt) {
      if (!corruptTargets.has(targetRef)) { corruptTargets.add(targetRef); blockedTargets.set(targetRef, "authority-corrupt"); log("warn", "coding.runner.target.corrupt", { reason: r.corrupt, stage }); }
      throw Object.assign(new Error("corrupt target index entry"), { code: "TARGET_CORRUPT" });
    }
    if (r.target) targets.set(targetRef, r.target);
    return r.target || null;
  }
  /** Delivery / execution authority of one record: never a record of a blocked target, never a held competitor (plain jobs: always). */
  const deliverable = rec => !(rec.targetRef && blockedTargets.has(rec.targetRef)) && !held.has(rec.jobId);
  /** Durably supersedes a record that is unambiguously NOT the authority of its revision (caller holds ADMISSION). → true when committed. */
  async function supersede(jobId, stage) {
    try {
      await withJob(jobId, async () => { const rec = records.get(jobId); if (!rec || rec.state === "superseded" || rec.state === "confirmed") return; await commit(jobId, r => { r.state = "superseded"; r.callback.nextAt = null; }); });
      held.delete(jobId); queued.delete(jobId);
      await journal.deleteInput(jobId).catch(() => {}); await journal.deleteResult(jobId).catch(() => {});
      log("info", "coding.runner.execution.superseded", { jobId, revision: records.get(jobId)?.revision ?? null, stage });
      return true;
    } catch { log("warn", "coding.runner.journal.write-failed", { jobId, stage: "supersede" }); return false; }
  }

  /** Durable write of the next version of a record (caller holds the job's lock): disk first, then the cache. */
  async function commit(jobId, mutate) {
    if (stopped) throw stoppedError();
    const next = JSON.parse(JSON.stringify(records.get(jobId)));
    mutate(next);
    next.updatedAt = iso(now());
    await journal.writeRecord(next);
    if (stopped) throw stoppedError();
    records.set(jobId, next);
    return next;
  }
  async function quarantineRecord(jobId, reason) {
    let moved = false;
    try { moved = await journal.quarantine(jobId + ".json", reason); } catch { moved = false; }
    try { await journal.deleteInput(jobId); await journal.deleteResult(jobId); } catch { /* best effort */ }
    records.delete(jobId); queued.delete(jobId);
    log("warn", "coding.runner.journal.corrupt", { jobId, reason, quarantined: moved });
  }
  function enqueue(jobId) { if (held.has(jobId)) return; if (!queued.has(jobId)) { queued.add(jobId); runQueue.push(jobId); } }   // a held record never enters the run queue
  function pump() {
    while (!stopped && active < maxActive && runQueue.length) {
      const jobId = runQueue.shift();
      queued.delete(jobId);
      active++;
      track(runJob(jobId).finally(() => { active--; if (!stopped) pump(); }));
    }
  }

  /** EXECUTED: the result is durable, the input is released, the callback is due now. */
  async function finalize(jobId, result, extra = {}) {
    const resultHash = await journal.writeResult(jobId, result);
    await commit(jobId, r => { Object.assign(r, extra); r.state = "executed"; r.executedAt = iso(now()); r.outcome = result.outcome; r.technicalCode = result.technicalCode || null; r.resultHash = resultHash; r.summary = summaryOf(result); r.callback.nextAt = iso(now()); });
    await journal.deleteInput(jobId).catch(() => {});
    schedule();
  }

  async function runJob(jobId) {
    let job = null;
    const go = await withJob(jobId, async () => {
      const rec = records.get(jobId);
      if (!rec || rec.state !== "received") return false;
      if (!deliverable(rec)) return false;                                                        // fail closed: no execution without a durable authority
      if (rec.targetRef) {
        const t = targets.get(rec.targetRef);
        if (t && t.revision > rec.revision) {                                       // a newer revision of the target arrived first
          await commit(jobId, r => { r.state = "superseded"; });
          await journal.deleteInput(jobId).catch(() => {});
          log("info", "coding.runner.execution.superseded", { jobId, revision: rec.revision });
          return false;
        }
      }
      const raw = await journal.readInput(jobId);
      const v = raw ? validateOfficialJobRequest(raw) : { ok: false };
      if (!v.ok || officialPayloadHash(v.job) !== rec.payloadHash) { await quarantineRecord(jobId, "input"); return false; }
      job = v.job;
      await commit(jobId, r => { r.state = "running"; r.startedAt = iso(now()); });     // durable BEFORE the sandbox starts
      return true;
    }).catch(() => { if (!stopped) log("warn", "coding.runner.journal.write-failed", { jobId, stage: "start" }); return false; });
    if (!go || stopped) return;
    const rec = records.get(jobId);
    log("info", "coding.runner.execution.started", { jobId, language: job.language, generation: rec ? rec.generation : 1 });
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
    if (stopped) return;                                                              // a stopped ("dead") instance never writes
    try { await withJob(jobId, () => finalize(jobId, result)); }
    catch {
      if (stopped) return;
      // the result could not be made durable: deliver it once from memory (at-least-once); the record stays RUNNING on disk, so
      // a restart re-runs the job (bounded by maxInterruptions) — the API applies at most one result.
      log("warn", "coding.runner.journal.write-failed", { jobId, stage: "result" });
      try { await deliver(result); } catch { /* the API's recovery re-dispatches */ }
    }
  }

  /** RUNNING found at startup: its process died → interrupted; re-run (bounded) or end as a TECHNICAL outcome. */
  async function interrupted(jobId) {
    const rec = records.get(jobId);
    const n = rec.interruptions + 1;
    log("warn", "coding.runner.execution.interrupted", { jobId, interruptions: n });
    if (n > ep.maxInterruptions) { await finalize(jobId, { jobId, outcome: "failed", technicalCode: "RUNNER_INTERRUPTED", cases: [] }, { interruptions: n }); return; }
    await commit(jobId, r => { r.state = "received"; r.interruptions = n; r.startedAt = null; });
    enqueue(jobId);
    log("info", "coding.runner.execution.resumed", { jobId, generation: rec.generation, interrupted: true });
  }

  function schedule() {
    if (stopped) return;
    if (timer) { clearTimeout(timer); timer = null; }
    const t = now();
    let next = Infinity;
    const due = [];
    for (const r of records.values()) {
      if (r.state !== "executed" || sending.has(r.jobId) || !deliverable(r)) continue;            // delivery obeys the target authority too
      const hold = holdUntil.get(r.jobId) || 0;
      const at = Math.max(r.callback.nextAt ? timeOf(r.callback.nextAt) : t, hold);
      if (at <= t) due.push(r); else next = Math.min(next, at);
    }
    due.sort((a, b) => timeOf(a.callback.nextAt) - timeOf(b.callback.nextAt));
    for (const r of due) { if (sending.size >= cp.concurrency) break; sendCallback(r.jobId); }
    if (next < Infinity) { timer = setTimeout(schedule, Math.max(1, Math.min(next - t, 2147483647))); if (timer.unref) timer.unref(); }
  }

  function sendCallback(jobId) {
    sending.add(jobId);
    track((async () => {
      let attemptNo = 0;
      try {
        let result = null;
        const reserved = await withJob(jobId, async () => {
          const rec = records.get(jobId);
          if (!rec || rec.state !== "executed" || !deliverable(rec)) return false;
          result = await journal.readResult(jobId, rec.resultHash);
          if (!result) { await quarantineRecord(jobId, "result-hash"); return false; }
          attemptNo = rec.callback.attempts + 1;
          // durable reservation BEFORE sending: never reset, never under-counted, the next try waits for the backoff
          await commit(jobId, r => { r.callback.attempts = attemptNo; r.callback.lastAt = iso(now()); r.callback.nextAt = iso(now() + backoffAfter(r)); });
          return true;
        });
        if (!reserved || stopped) return;
        let out;
        try { out = await deliver(result); } catch { out = { delivered: false, retryable: true, errorClass: "internal" }; }
        if (stopped) return;
        await withJob(jobId, async () => {
          const rec = records.get(jobId);
          if (!rec || rec.state !== "executed") return;
          if (out && out.delivered === true) {
            const as = out.confirmedAs === "retryable" ? "retryable" : "complete";
            await commit(jobId, r => { r.state = "confirmed"; r.callback.confirmedAt = iso(now()); r.callback.confirmedAs = as; r.callback.lastStatus = statusOf(out); r.callback.lastErrorClass = null; r.callback.nextAt = null; });
            await journal.deleteResult(jobId).catch(() => {});
            log("info", "coding.runner.callback.confirmed", { jobId, attempts: attemptNo, confirmedAs: as });
            return;
          }
          const permanent = !!out && out.retryable === false;
          if (permanent || rec.callback.attempts >= rec.callback.windowEnd) {
            await commit(jobId, r => { r.state = "callback_failed"; r.callback.lastStatus = statusOf(out); r.callback.lastErrorClass = classOf(out); r.callback.nextAt = null; });
            log("warn", "coding.runner.callback.failed", { jobId, attempts: attemptNo, status: statusOf(out), errorClass: classOf(out), reason: permanent ? "permanent" : "window-exhausted" });
            return;
          }
          const next = await commit(jobId, r => { r.callback.lastStatus = statusOf(out); r.callback.lastErrorClass = classOf(out); });
          log("warn", "coding.runner.callback.retry", { jobId, attempt: attemptNo, status: statusOf(out), errorClass: classOf(out), nextInMs: Math.max(0, timeOf(next.callback.nextAt) - now()) });
        });
        holdUntil.delete(jobId);
      } catch {
        if (!stopped) { holdUntil.set(jobId, now() + cp.baseMs); log("warn", "coding.runner.journal.write-failed", { jobId, stage: "callback" }); }
      } finally {
        sending.delete(jobId);
        if (!stopped) schedule();
      }
    })());
  }

  async function onDuplicate(existing, job, hash) {
    const jobId = existing.jobId;
    if (existing.payloadHash !== hash) { log("warn", "runner.official.conflict", { jobId }); return { status: "conflict" }; }
    log("info", "coding.runner.delivery.duplicate", { jobId, state: existing.state });
    if (existing.state === "superseded") return { status: "stale" };
    // review fix 3: a record of a blocked target, or a held competitor, is NOT the authority of its revision — a redelivery never
    // schedules or re-arms its callback (its durable result is preserved; the answer is the deterministic fail-closed busy)
    if ((existing.state === "executed" || existing.state === "callback_failed") && !deliverable(existing)) return busy(jobId, "target-" + (blockedTargets.get(existing.targetRef) || "inconsistent"), { stage: "callback" });
    if (existing.state === "executed") {
      if (!sending.has(jobId)) { await commit(jobId, r => { r.callback.nextAt = iso(now()); }); schedule(); }   // retry the callback now — never re-execute
      return { status: "duplicate", state: "executed" };
    }
    if (existing.state === "callback_failed") {
      if (existing.callback.rearms < cp.maxRearms) {
        if (!(await journal.readResult(jobId, existing.resultHash))) { await quarantineRecord(jobId, "result-hash"); return { status: "busy" }; }
        await commit(jobId, r => { r.state = "executed"; r.callback.rearms += 1; r.callback.windowEnd = r.callback.attempts + cp.maxAttemptsPerWindow; r.callback.nextAt = iso(now()); });
        log("info", "coding.runner.callback.rearmed", { jobId, rearms: existing.callback.rearms + 1 });
        schedule();
        return { status: "duplicate", state: "executed" };
      }
      return { status: "duplicate", state: "callback_failed" };
    }
    if (existing.state === "confirmed") {
      if (existing.callback.confirmedAs === "retryable" && existing.generation < ep.maxGenerations) {
        // SmartAssess could not grade the confirmed (technical) outcome and delivered the job again: a NEW, bounded generation.
        // 17F-B3: confirmed → received moves a NON-LIVE record back into LIVE state, so it is an admission against maxPending
        // (decided under the admission authority, like every new job). Full → busy now, nothing changes; the redelivery that
        // arrives once a slot is free regenerates exactly once.
        if (existing.targetRef && blockedTargets.has(existing.targetRef)) return busy(jobId, "target-" + blockedTargets.get(existing.targetRef), { stage: "regeneration" });
        const live = liveCount();
        if (live >= maxPending) return busy(jobId, "max-pending", { pending: live, stage: "regeneration" });
        await journal.writeInput(jobId, job);
        await commit(jobId, r => { r.state = "received"; r.generation += 1; r.interruptions = 0; r.startedAt = null; r.executedAt = null; r.outcome = null; r.technicalCode = null; r.resultHash = null; r.summary = null; r.callback = freshCallback(r.callback.attempts); });
        log("info", "coding.runner.execution.regenerated", { jobId, generation: existing.generation + 1 });
        enqueue(jobId); pump();
        return { status: "duplicate", state: "received" };
      }
      return { status: "duplicate", state: "confirmed" };
    }
    return { status: "duplicate", state: existing.state };                           // received / running: in progress
  }

  /** Expired terminal records (confirmed / callback_failed / superseded), oldest first, bounded; a record whose target index entry is still dirty is kept (the index must hold its revision before the record may go). */
  async function pruneRecords(t, locked) {
    let pruned = 0;
    const expired = [...records.values()].filter(r => !(r.targetRef && dirtyTargets.has(r.targetRef)) && ((r.state === "confirmed" && t - timeOf(r.updatedAt) >= L.confirmedRetentionMs) || ((r.state === "callback_failed" || r.state === "superseded") && t - timeOf(r.updatedAt) >= L.failedRetentionMs))).sort((a, b) => timeOf(a.updatedAt) - timeOf(b.updatedAt)).slice(0, L.pruneBatch);
    for (const r of expired) {
      if (stopped) break;
      const remove = async () => { const cur = records.get(r.jobId); if (!cur || cur.updatedAt !== r.updatedAt) return; await journal.removeJob(r.jobId); records.delete(r.jobId); pruned++; };
      try { if (r.jobId === locked) await remove(); else await withJob(r.jobId, remove); } catch { /* retried next pass */ }
    }
    return pruned;
  }
  /** Target index retention (caller holds ADMISSION): first the durable retry of every lagging entry, then at most `budget` deletes of entries older than failedRetentionMs that no LIVE / executed job references. */
  async function pruneTargets(t, budget) {
    let pruned = 0;
    for (const ref of [...dirtyTargets]) {
      if (stopped) break;
      const doc = targets.get(ref);
      if (doc) await advanceTarget(doc, "maintenance"); else dirtyTargets.delete(ref);
    }
    const liveRefs = new Set([...records.values()].filter(r => r.targetRef && (LIVE.has(r.state) || r.state === "executed")).map(r => r.targetRef));
    for (const doc of [...targets.values()]) {
      if (stopped || pruned >= budget) break;
      if (t - timeOf(doc.updatedAt) < L.failedRetentionMs || liveRefs.has(doc.targetRef) || dirtyTargets.has(doc.targetRef) || blockedTargets.has(doc.targetRef)) continue;
      try { await journal.deleteTarget(doc.targetRef); if (targets.get(doc.targetRef) === doc) targets.delete(doc.targetRef); pruned++; } catch { /* retried next pass */ }
    }
    return pruned;
  }

  const api = {
    /** Startup recovery over the durable journal (bounded scan). → { scanned, truncated, corrupt, recovered: { received, interrupted, executed }, targets: { repaired, inconsistent, blocked, held, superseded, corrupt, scanned, truncated } } */
    async start() {
      if (started) throw new Error("official queue already started");
      started = true;
      const scan = await journal.scan({ maxEntries: L.startupScanMax });
      truncated = scan.truncated;
      const summary = { scanned: scan.scanned, truncated, corrupt: 0, recovered: { received: 0, interrupted: 0, executed: 0 }, targets: { repaired: 0, inconsistent: 0, blocked: 0, held: 0, superseded: 0, corrupt: 0, scanned: 0, truncated: false } };
      for (const c of scan.corrupt) {
        let moved = false;
        try { moved = await journal.quarantine(c.file, c.reason); } catch { moved = false; }
        summary.corrupt++;
        log("warn", "coding.runner.journal.corrupt", { reason: c.reason, stage: "startup", quarantined: moved });
      }
      if (truncated) log("warn", "coding.runner.journal.truncated", { scanned: scan.scanned, limit: L.startupScanMax });
      for (const rec of scan.records) records.set(rec.jobId, rec);
      await withAdmission(async () => {
        // The warm cache of the durable index: BOUNDED, and its truncation is reported (entries beyond it are still authoritative
        // on disk — every cache miss is resolved through loadTargetAuthority under ADMISSION, so the queue stays usable).
        const listing = await journal.listTargets({ maxEntries: L.startupScanMax });
        for (const t of listing.targets) targets.set(t.targetRef, t);
        targetsTruncated = listing.truncated;
        summary.targets.scanned = listing.scanned; summary.targets.truncated = listing.truncated;
        if (listing.truncated) log("warn", "coding.runner.target.listing-truncated", { scanned: listing.scanned, limit: L.startupScanMax });
        // a corrupt validly-named entry is unreadable authority: blocked (fail closed), counted, never rewritten or deleted
        for (const c of listing.corrupt) { if (!corruptTargets.has(c.targetRef)) { corruptTargets.add(c.targetRef); blockedTargets.set(c.targetRef, "authority-corrupt"); log("warn", "coding.runner.target.corrupt", { reason: c.reason, stage: "startup" }); } }
        // Consistency of the index with the records (review fixes 1 + 2). The index is advanced after the accepted commit, so a
        // crash (or a failed index write) in between leaves a record ABOVE its index entry — repaired here, BEFORE anything runs.
        // Only unambiguous states are touched: an entry is pruned legitimately only once it is older than failedRetentionMs and
        // no LIVE / executed job references it, so a LIVE / executed record, or any record younger than that window, proves that
        // its revision reached the authority. Per target the HIGHEST relevant revision is a GROUP of records:
        //   one job id                          → repairs a missing / lower entry (an entry above it is simply newer history);
        //   several job ids, durable entry at   → the entry is preserved (never replaced by scan order); the competitors are
        //   that revision selecting one of them   SUPERSEDED durably (review fix 3) — never executed, never delivered, never
        //                                         LIVE forever; if that commit fails they are held and superseded on the next advance;
        //   several job ids, no such entry      → NEVER guessed: the target is blocked (fail closed: busy) and its records held
        //   (missing / lower / selecting none)    (no execution, no delivery, nothing superseded) until a durable authority exists
        //                                         (pre-B3 gateways could race here, ADM20).
        // An entry without a record (retained history) is never deleted. An I/O error or a CORRUPT entry blocks that target too.
        const t0 = now(), groups = new Map();
        for (const rec of records.values()) {
          if (!rec.targetRef || !(LIVE.has(rec.state) || rec.state === "executed" || t0 - timeOf(rec.receivedAt) < L.failedRetentionMs)) continue;
          const g = groups.get(rec.targetRef);
          if (!g || rec.revision > g.revision) groups.set(rec.targetRef, { revision: rec.revision, records: [rec] });
          else if (rec.revision === g.revision) g.records.push(rec);
        }
        const report = recs => { for (const r of recs) { summary.targets.inconsistent++; log("warn", "coding.runner.target.inconsistent", { jobId: r.jobId, revision: r.revision, stage: "startup" }); } };
        const hold = recs => { for (const r of recs) if (r.state !== "confirmed" && r.state !== "superseded" && !held.has(r.jobId)) { held.add(r.jobId); summary.targets.held++; } };
        const block = (ref, g, reason) => { if (!blockedTargets.has(ref)) blockedTargets.set(ref, reason); report(g.records); hold(g.records); log("warn", "coding.runner.target.blocked", { revision: g.revision, records: g.records.length, reason: blockedTargets.get(ref), stage: "startup" }); };
        const retire = async recs => { for (const r of recs) { if (await supersede(r.jobId, "startup")) summary.targets.superseded++; else hold([r]); } };
        for (const [ref, g] of groups) {
          if (blockedTargets.has(ref)) { hold(g.records); continue; }                             // corrupt entry (listing): nothing runs or delivers
          let doc;
          try { doc = await loadTargetAuthority(ref, "startup"); } catch (e) { block(ref, g, e && e.code === "TARGET_CORRUPT" ? "authority-corrupt" : "authority-unavailable"); continue; }
          if (doc && doc.revision > g.revision) continue;
          const ids = new Set(g.records.map(r => r.jobId));
          if (doc && doc.revision === g.revision) {
            if (ids.size === 1 && ids.has(doc.jobId)) continue;                                   // consistent
            if (ids.has(doc.jobId)) { const competing = g.records.filter(r => r.jobId !== doc.jobId); report(competing); await retire(competing); continue; }
            block(ref, g, "inconsistent");                                                        // the durable entry selects none of them
            continue;
          }
          if (ids.size === 1) { summary.targets.repaired++; await advanceTarget(targetDoc(ref, g.revision, g.records[0].jobId, iso(t0)), "startup"); continue; }
          block(ref, g, "inconsistent");
        }
        summary.targets.blocked = blockedTargets.size; summary.targets.corrupt = corruptTargets.size;
      });
      for (const rec of [...records.values()]) {
        try {
          if (rec.state === "received") { enqueue(rec.jobId); summary.recovered.received++; log("info", "coding.runner.execution.resumed", { jobId: rec.jobId, generation: rec.generation }); }
          else if (rec.state === "running") { summary.recovered.interrupted++; await withJob(rec.jobId, () => interrupted(rec.jobId)); }
          else if (rec.state === "executed") {
            if (await journal.readResult(rec.jobId, rec.resultHash)) { summary.recovered.executed++; await journal.deleteInput(rec.jobId); }
            else { summary.corrupt++; await withJob(rec.jobId, () => quarantineRecord(rec.jobId, "result-hash")); }
          }
          // a crash between a state commit and the release of what that state no longer needs leaves a file behind: release it now
          else if (rec.state === "callback_failed") await journal.deleteInput(rec.jobId);
          else if (rec.state === "confirmed" || rec.state === "superseded") { await journal.deleteInput(rec.jobId); await journal.deleteResult(rec.jobId); }
        } catch { log("warn", "coding.runner.journal.write-failed", { jobId: rec.jobId, stage: "recovery" }); }
      }
      // Orphan cleanup needs the COMPLETE index: after a truncated scan, an input / result whose record was simply not scanned is
      // not an orphan — deleting it would lose an EXECUTED-but-unconfirmed result. Skip it; admissions stay refused (fail closed).
      if (truncated) log("warn", "coding.runner.journal.orphans-skipped", { reason: "truncated" });
      else { try { const removed = await journal.removeOrphans(new Set(records.keys()), { maxEntries: L.startupScanMax }); if (removed) log("info", "coding.runner.journal.orphans", { removed }); } catch { /* bounded best effort */ } }
      log("info", "coding.runner.journal.recovered", { ...summary.recovered, scanned: summary.scanned, corrupt: summary.corrupt, truncated });
      pump(); schedule();
      maintenance = setInterval(() => { api.maintain().catch(() => {}); }, MAINTENANCE_INTERVAL_MS);
      if (maintenance.unref) maintenance.unref();
      return summary;
    },
    /** → { status: "accepted" | "duplicate" | "conflict" | "stale" | "busy", state? } — "accepted" only once journaled. */
    async submit(job) {
      if (!started || stopped) return { status: "busy" };
      const hash = officialPayloadHash(job);
      try {
        // 17F-B3 lock order: ADMISSION → withJob(jobId) → journal. The whole decision + durable commit + install is ONE
        // transaction over the shared admission state; execution and delivery start outside it (pump / schedule are async).
        return await withAdmission(() => withJob(job.jobId, async () => {
          if (stopped) return busy(job.jobId, "stopped");                                   // re-checked AFTER waiting for admission
          const existing = records.get(job.jobId);
          if (existing) return onDuplicate(existing, job, hash);
          if (truncated) return busy(job.jobId, "journal-truncated");
          let t = null;
          if (job.targetRef) {
            const block = blockedTargets.get(job.targetRef);
            if (block) return busy(job.jobId, "target-" + block);                                  // fail closed: no decision from a guessed authority
            try { t = (await loadTargetAuthority(job.targetRef)) || null; }                        // cache, then the durable index
            catch (e) { return busy(job.jobId, e && e.code === "TARGET_CORRUPT" ? "target-authority-corrupt" : "target-authority-unavailable"); }   // corrupt / I/O error: never "no authority"
            if (t && t.revision > job.revision) { log("warn", "coding.runner.delivery.stale", { jobId: job.jobId, revision: job.revision }); return { status: "stale" }; }
            if (t && t.revision === job.revision && t.jobId !== job.jobId) { log("warn", "runner.official.conflict", { jobId: job.jobId }); return { status: "conflict" }; }
          }
          const live = liveCount();
          if (live >= maxPending) return busy(job.jobId, "max-pending", { pending: live });
          if (records.size >= L.maxRecords) await api.maintain({ locked: job.jobId });
          if (records.size >= L.maxRecords) return busy(job.jobId, "journal-full");
          const at = iso(now());
          const rec = { schemaVersion: 1, jobId: job.jobId, payloadHash: hash, revision: job.targetRef ? job.revision : null, targetRef: job.targetRef || null, language: job.language, state: "received", generation: 1, interruptions: 0, receivedAt: at, startedAt: null, executedAt: null, updatedAt: at, outcome: null, technicalCode: null, resultHash: null, summary: null, callback: freshCallback(0) };
          try {
            await journal.writeInput(job.jobId, job);
            await journal.writeRecord(rec);                                           // the commit point of "accepted"
          } catch {
            // nothing durable, nothing in memory, the target index untouched: a failed admission leaves no phantom authority
            log("warn", "coding.runner.journal.write-failed", { jobId: job.jobId, stage: "receive" });
            try { await journal.deleteInput(job.jobId); } catch { /* orphan cleanup on the next start */ }
            return { status: "busy" };
          }
          // stop() landed during the durable write: the record is on disk (recovered at the next start, idempotent for
          // SmartAssess' redelivery) but a stopped instance installs and schedules nothing more — same rule as commit().
          if (stopped) return busy(job.jobId, "stopped");
          // the index follows the durable record (a crash before this line is repaired from the record at the next start)
          if (job.targetRef && (!t || job.revision > t.revision)) await advanceTarget(targetDoc(job.targetRef, job.revision, job.jobId, at), "receive");
          records.set(job.jobId, rec);
          log("info", "runner.official.accepted", { jobId: job.jobId, language: job.language, cases: job.cases.length });
          enqueue(job.jobId); pump();
          return { status: "accepted" };
        }));
      } catch { log("warn", "coding.runner.journal.write-failed", { jobId: job.jobId, stage: "duplicate" }); return { status: "busy" }; }
    },
    /**
     * ONE bounded retention pass: at most pruneBatch removals of expired terminal records and stale target index entries.
     * `{ locked }` = called from INSIDE the admission transaction of job `locked` (ADMISSION + withJob(locked) already held):
     * the pass then runs inline — it never re-enters the admission authority (ADMISSION → maintain → ADMISSION would deadlock).
     * The periodic pass prunes records under the per-job locks only (never holding ADMISSION while waiting for one) and then
     * takes ADMISSION for the index: every read of `targets` / the LIVE references and every delete happen under the same
     * authority as admissions, so a pass can never delete the entry of a revision admitted meanwhile.
     */
    async maintain({ locked } = {}) {
      const t = now();
      const pruned = await pruneRecords(t, locked);
      const prunedTargets = locked !== undefined ? await pruneTargets(t, L.pruneBatch - pruned) : await withAdmission(() => pruneTargets(t, L.pruneBatch - pruned));
      return { pruned, prunedTargets };
    },
    /** Resolves once nothing is queued, running, being called back or due (tests / graceful shutdown). */
    async idle() {
      for (;;) {
        if (stopped) return;
        const t = now();
        const due = [...records.values()].some(r => r.state === "executed" && deliverable(r) && !sending.has(r.jobId) && Math.max(r.callback.nextAt ? timeOf(r.callback.nextAt) : t, holdUntil.get(r.jobId) || 0) <= t);
        if (!runQueue.length && !active && !work.size && !sending.size && !due) return;
        await (work.size ? Promise.race([...work, sleep(5)]) : sleep(5));
      }
    },
    /** Aggregate operational state (counts only). */
    status() {
      const out = { received: 0, running: 0, executed: 0, confirmed: 0, callback_failed: 0, superseded: 0, queued: runQueue.length, active, sending: sending.size, truncated, targetIndexLag: dirtyTargets.size, targetIndexTruncated: targetsTruncated, targetIndexCorrupt: corruptTargets.size, targetsBlocked: blockedTargets.size, executionHeld: held.size };
      for (const r of records.values()) out[r.state] = (out[r.state] || 0) + 1;
      return out;
    },
    size() { const s = api.status(); return { pending: s.received + s.running, active, entries: records.size }; },
    /** Stops all scheduling; a stopped queue never writes the journal again (graceful shutdown / a simulated crash). */
    stop() { stopped = true; if (timer) clearTimeout(timer); if (maintenance) clearInterval(maintenance); timer = null; maintenance = null; }
  };
  return api;
}

module.exports = { OFFICIAL_BOUNDS, OFFICIAL_JOB_MAX_MS, CALLBACK_POLICY, EXECUTION_POLICY, validateOfficialJobRequest, officialPayloadHash, officialJobWallMs, createOfficialGradingQueue };
