"use strict";
// Phase 17F-B10-A — the ORCHESTRATOR: target → plan → safety → (dry run | execute) → settle → gates → report.
//   MODE 1 practice load · MODE 2 official load · MODE 3 mixed · MODE 4 callback burst · MODE 5 recovery · MODE 6 saturation
// The harness only MEASURES the Runner's and the receiver's behaviour; it never redefines an invariant, never decides a mark,
// never sends an expected output to the Runner, and never writes source / stdin / stdout / keys into a report. A dry run makes no
// network call at all. A production target is fail closed (targets.js) and bounded (safety.js). Official load is refused on the
// production target through the direct Runner protocol: an orphan callback would park in the production journal; production
// official grading is qualified through the SmartAssess API with the dedicated test class (manual procedure, see the document).
const { resolveTarget } = require("./targets.js");
const { createGovernor, runPool } = require("./safety.js");
const { planScenario } = require("./scenarios.js");
const { createPracticeAccumulator, percentiles, LANGUAGES } = require("./metrics.js");
const { createOfficialLedger, journalConsistency } = require("./accounting.js");
const { evaluateGates, p1Gate, P1_CEILING_MS } = require("./gates.js");
const { buildReport, HARNESS_VERSION } = require("./report.js");
const { recoveryVerdict } = require("./qualification.js");
const { PRACTICE_LIMITS, OFFICIAL_LIMITS, expectedStdout, officialStdins, expectedCaseStatus } = require("./workloads.js");
const { createRunnerClient, createCallbackSender, syntheticCallbackBody, rid } = require("./driver.js");
const { createLocalStack, createReceiver } = require("./local-stack.js");

const LEAK_KEYS = /^(score|passed|passedWeight|totalWeight|expected|expectedOutput|expectedOutputs|weight|mark|marks|grade)$/i;
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
/** `promise` or `ms` elapsed, whichever first — the losing timer is CLEARED (a dangling 60 s timer kept every suite process alive). */
function raceTimeout(promise, ms) { let t; const timer = new Promise(r => { t = setTimeout(r, ms); }); return Promise.race([promise, timer]).finally(() => clearTimeout(t)); }
const DEFAULT_SETTLE_MS = { local: 60000, staging: 10 * 60000, production: 10 * 60000 };
const refused = (code, detail) => ({ ok: false, code, ...(detail ? { detail } : {}) });

function p1Programs() { return require("../../../deploy/azure-vm/smoke.js").p1Programs(); }

/**
 * runScenario({ scenario, target, env, params, dryRun, buildSha, runnerSha, vmSku, attachments, notes, deps: { fetchImpl, now, sleep } })
 * → { ok: true, dryRun: true, target, plan } | { ok: true, report } | { ok: false, code, detail? }
 * With neither `scenario` nor `target` given the call is a DRY RUN of CERT-A against local (the non-destructive default).
 */
async function runScenario(options = {}) {
  const { env = {}, params = {}, buildSha, runnerSha, vmSku, attachments, notes = [], deps = {} } = options;
  const implicit = options.scenario === undefined && options.target === undefined;
  const scenario = options.scenario === undefined ? "CERT-A" : options.scenario;
  const targetName = options.target === undefined ? "local" : options.target;
  const dryRun = options.dryRun === undefined ? implicit : !!options.dryRun;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || (() => Date.now());
  const sleep = deps.sleep || sleepMs;

  const target = resolveTarget({ target: targetName, env });
  if (!target.ok) return target;
  const plan = planScenario({ scenario, target: target.name, params });
  if (!plan.ok) return plan;
  const def = plan.scenario;
  const hasOfficial = plan.totals.officialJobs > 0, hasRecovery = plan.steps.some(s => s.kind === "recovery"), hasBurst = plan.steps.some(s => s.kind === "callback-burst");
  if (!def.targets.includes(target.name)) {
    if (target.name === "production" && (hasOfficial || hasRecovery)) return refused("PRODUCTION_OFFICIAL_DIRECT_REFUSED", "official grading load never goes to the production Runner directly (an orphan callback would park in the production journal); use the SmartAssess API test-class procedure");
    if (hasRecovery) return refused("MODE_NOT_SUPPORTED_ON_TARGET", "recovery is executed in-process on the local target only; remote recovery is the manual crash-tests.md procedure");
    return refused("TARGET_NOT_ALLOWED", def.id + " may run on: " + def.targets.join(", "));
  }
  if (dryRun) return { ok: true, dryRun: true, target: { name: target.name, remote: target.remote, failClosed: target.failClosed, host: target.host || null }, scenario: { id: def.id, title: def.title, purpose: def.purpose, safety: def.safety }, plan: { config: plan.config, totals: { ...plan.totals }, steps: plan.steps.map(describeStep), ceilings: plan.ceilings } };
  if (typeof buildSha !== "string" || !/^[0-9a-f]{40}$/.test(buildSha)) return refused("BUILD_SHA_REQUIRED", "a qualification run records the 40-character git object id it tested");
  // official / idempotent callbacks on a remote target need the harness receiver (staging only); the callback burst on a remote
  // target needs the SmartAssess callback destination (every body names a job that cannot exist → 404 UNKNOWN_JOB, nothing written)
  let receiver = null, stack = null, callbackTarget = null;
  if (target.remote) {
    if (hasOfficial) {
      const port = Number(env.LOAD_CALLBACK_RECEIVER_PORT), rkey = env.LOAD_CALLBACK_HMAC_KEY;
      if (target.name !== "staging" || !Number.isInteger(port) || port < 1 || typeof rkey !== "string" || rkey.length < 32) return refused("TARGET_NOT_CONFIGURED", "official load on staging needs LOAD_CALLBACK_RECEIVER_PORT + LOAD_CALLBACK_HMAC_KEY (the staging Runner's SMARTASSESS_CALLBACK_* must point at this harness)");
    }
    if (hasBurst) {
      const base = env.SMARTASSESS_CALLBACK_BASE_URL, ckey = env.SMARTASSESS_CALLBACK_HMAC_KEY;
      if (typeof base !== "string" || !/^https:\/\//.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\/?$/.test(base) || typeof ckey !== "string" || ckey.length < 32) return refused("TARGET_NOT_CONFIGURED", "the callback burst on a remote target needs SMARTASSESS_CALLBACK_BASE_URL (https, or loopback http for a staging rehearsal) + SMARTASSESS_CALLBACK_HMAC_KEY");
      callbackTarget = { baseUrl: base, key: ckey, synthetic: "unknown" };
    }
  }

  const startedAt = new Date(now()).toISOString(), t0 = now();
  const governor = createGovernor(plan.ceilings, { now });
  const practice = createPracticeAccumulator(), ledger = createOfficialLedger();
  const expectations = new Map();                                                   // jobId → { statuses, stdouts } — harness side only
  const dispatchedAt = new Map();
  const canaries = [];
  let client, saturation = null, recovery = null, fairness = null, p1 = null, bursts = [], warnings = [];
  try {
    if (!target.remote) {
      stack = createLocalStack({ sandbox: plan.params.sandbox || "fake", profile: plan.params.profile, maxConcurrency: (plan.params.runner || {}).maxConcurrency || 4, official: { maxPending: (plan.params.runner || {}).maxPending || 16, maxActive: (plan.params.runner || {}).maxActive || 2, caseConcurrency: 2 }, callbackPolicy: plan.params.callbackPolicy || { baseMs: 50, capMs: 2000, maxAttemptsPerWindow: 6, maxRearms: 2, concurrency: 2 } });
      await stack.start();
      receiver = stack.receiver;
      if (typeof deps.onStack === "function") deps.onStack(stack);                      // tests: fault injection on the receiver
      client = createRunnerClient({ baseUrl: stack.baseUrl, key: stack.key, fetchImpl: deps.localFetch || globalThis.fetch, now });
      callbackTarget = { baseUrl: stack.callbackUrl, key: cbKeyOf(stack), synthetic: "applied" };
    } else {
      client = createRunnerClient({ baseUrl: target.baseUrl, key: target.key, fetchImpl, now });
      if (hasOfficial) { receiver = createReceiver({ key: env.LOAD_CALLBACK_HMAC_KEY }); await new Promise(r => receiver.server.listen(Number(env.LOAD_CALLBACK_RECEIVER_PORT), r)); }
      const h = await client.health();
      if (!h.ok) return refused("TARGET_UNREACHABLE", "/healthz answered HTTP " + h.httpStatus);
    }
    for (const w of plan.params.workloads) { canaries.push(w.source); if (w.stdin) canaries.push(w.stdin); for (const c of w.cases || []) canaries.push(c); for (const e of w.expectedOutputs || []) canaries.push(e); }

    const workloadOf = item => item.workload || plan.params.workloads.find(w => w.id === item.workloadId) || null;
    async function runPractice(item, w, extra = {}) {
      const stdin = w.stdin !== null && w.stdin !== undefined ? w.stdin : "21\n";
      const limits = { ...PRACTICE_LIMITS, ...w.limits, ...(extra.limits || {}) };
      const r = await client.execute({ language: w.language, source: w.source, stdin, limits });
      const rec = { language: w.language, workloadId: w.id, httpStatus: r.httpStatus, ms: r.ms, actor: item.actor, code: r.code, error: r.error };
      if (r.result) {
        rec.status = String(r.result.status);
        const exp = expectedStdout(w.fn, stdin);
        rec.mismatch = rec.status !== w.expect.status || (exp !== null && rec.status === "success" && String(r.result.stdout || "").trim() !== exp);
        rec.leak = Object.keys(r.result).some(k => LEAK_KEYS.test(k)) ? 1 : 0;
      }
      practice.record(rec);
      return rec;
    }
    async function runOfficial(item, w) {
      const jobId = "cg_load" + rid("").slice(0, 10) + Date.now().toString(36).slice(-6).padStart(6, "0");
      const stdins = w.cases ? w.cases.slice(0, item.casesPerJob) : officialStdins(item.casesPerJob);
      const limits = { ...OFFICIAL_LIMITS, ...w.limits }; limits.outputBytes = Math.min(limits.outputBytes, 17408);
      const job = { jobId, language: w.language, languageVersion: 1, source: w.source, cases: stdins.map((stdin, i) => ({ token: "c" + String(i + 1).padStart(2, "0"), stdin })), limits };
      const es = expectedCaseStatus(w);
      expectations.set(jobId, { compileError: w.kind === "compile-error", statuses: es ? stdins.map(() => es) : [], stdouts: stdins.map((s, i) => (w.expectedOutputs && w.expectedOutputs[i] !== undefined ? String(w.expectedOutputs[i]).trim() : w.fn === "large" ? "x".repeat(17000) : expectedStdout(w.fn, s))) });
      ledger.submitted(jobId, { language: w.language, workloadId: w.id, cases: stdins.length, actor: item.actor, assignment: item.assignment });
      const r = await client.submitOfficial(job);
      dispatchedAt.set(jobId, now());
      ledger.dispatched(jobId, { status: r.status, httpStatus: r.httpStatus, ms: r.ms });
      return { jobId, status: r.status, ms: r.ms };
    }
    const itemErrors = [];
    const runItem = async item => { try { const w = workloadOf(item); if (!w) throw new Error("unknown workload " + item.workloadId); return item.type === "official" ? await runOfficial(item, w) : await runPractice(item, w); } catch (e) { itemErrors.push(String(e && e.message || e).slice(0, 200)); throw e; } };

    let settledCalls = 0;
    function drainReceiver() {
      if (!receiver) return;
      for (; settledCalls < receiver.calls.length; settledCalls++) {
        const c = receiver.calls[settledCalls];
        if (!c.jobId || !expectations.has(c.jobId)) continue;
        if (c.answer === "error") continue;
        const e = expectations.get(c.jobId), applied = receiver.applied.get(c.jobId);
        let mismatch = false;
        if (c.answer === "applied" && c.state === "complete" && applied) {
          if (e.compileError) mismatch = applied.compile !== "compile-error";
          else { mismatch = applied.caseStatuses.length !== e.statuses.length || applied.caseStatuses.some((s, i) => s !== e.statuses[i]) || applied.stdouts.some((s, i) => e.stdouts[i] !== null && e.statuses[i] === "success" && s !== e.stdouts[i]); }
        }
        ledger.callbackReceived(c.jobId, { outcome: c.outcome, technicalCode: c.technicalCode, ms: c.at - (dispatchedAt.get(c.jobId) || c.at), caseStatuses: c.caseStatuses, leak: c.leak, mismatch });
        ledger.acknowledged(c.jobId, { answer: c.answer, state: c.state, score: c.score === undefined ? null : c.score });
      }
    }
    async function settle(timeoutMs) {
      const until = now() + timeoutMs;
      for (;;) {
        if (stack) await raceTimeout(stack.idle(), 200);
        drainReceiver();
        const r = ledger.reconcile();
        // every accepted job is acknowledged — but the queue commits `confirmed` AFTER the receiver answered, so the journal is only
        // read once the queue is idle (bounded by the remaining settlement budget)
        if (r.lost.length === 0) { if (stack) await raceTimeout(stack.idle(), Math.max(1000, until - now())); return true; }
        if (now() > until) return false;
        await sleep(stack ? 25 : 500);
      }
    }
    const steps = [];
    for (const step of plan.steps) {
      const st0 = now(), before = practice.summary().totals, beforeOff = ledger.reconcile();
      if (step.kind === "load") {
        if (stack && step.saturation && stack.sandbox.stats) stack.sandbox.statsBefore = stack.sandbox.stats();
        await runPool(step.items, step.concurrency, runItem, governor);
        if (step.saturation) {
          const after = practice.summary().totals, off = ledger.reconcile();
          const stats = stack && stack.sandbox.stats ? stack.sandbox.stats() : null;
          saturation = saturation || { steps: [] };
          // Independent Review Fix 3 (RF3-A): the admission bound comes from the harness-owned LOCAL Runner (effective configuration) or
          // from an EXPLICIT operator declaration for a remote Runner (--runner-max-pending=N) — never from a catalog default
          const declared = plan.params.runnerDeclared || null;
          const declaredMaxPending = declared && Number.isInteger(declared.maxPending) ? declared.maxPending : null;
          const maxPending = stack ? stack.config.official.maxPending : declaredMaxPending;
          const maxPendingSource = stack ? "local-effective" : (maxPending !== null ? "operator-declared" : null);
          const acceptedInStep = off.accepted - beforeOff.accepted;
          saturation.steps.push({ offeredConcurrency: step.concurrency, runnerMaxConcurrency: stack ? stack.config.maxConcurrency : (declared && Number.isInteger(declared.maxConcurrency) ? declared.maxConcurrency : null), officialMaxPending: maxPending, maxPendingSource, practice: { offered: after.offered - before.offered, completed: after.completed - before.completed, busy: after.busy - before.busy }, official: { offered: off.offered - beforeOff.offered, accepted: acceptedInStep, busy: off.busy - beforeOff.busy, overAdmission: maxPending === null ? null : Math.max(0, acceptedInStep - maxPending) }, peakActiveSandboxes: stats ? stats.peak : null });
          if (maxPending !== null && acceptedInStep > maxPending) warnings.push("B10-F1 observed: " + acceptedInStep + " concurrent official submissions accepted with RUNNER_OFFICIAL_MAX_PENDING=" + maxPending + " (" + maxPendingSource + "; admission check is not atomic across concurrent arrivals)");
        }
        if (step.fairness) { fairness = fairness || {}; fairness[step.fairness] = fairnessOf(step, practice.summary(), ledger.reconcile()); }
      } else if (step.kind === "p1") {
        const samples = { python: [], java: [], csharp: [] };
        for (let k = 0; k < step.repeats; k++) for (const prog of p1Programs()) { const w = { id: "P1GATE-" + prog.language, language: prog.language, kind: "success", fn: "none", source: prog.source, expect: { status: "success" }, limits: {}, stdin: "" }; canaries.push(prog.source); if (!governor.offer()) break; governor.enter(); try { const rec = await runPractice({ actor: "p1-probe" }, w, { limits: { timeMs: 10000, memoryMb: 256 } }); if (rec.status === "success") samples[prog.language].push(rec.ms); } finally { governor.leave(); } }
        p1 = { ...p1Gate(samples), samples: Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, percentiles(v)])) };
      } else if (step.kind === "callback-burst") {
        bursts.push(await callbackBurst({ step, callbackTarget, fetchImpl: stack ? (deps.localFetch || globalThis.fetch) : fetchImpl, governor, now, receiver, ledger }));
      } else if (step.kind === "recovery") {
        recovery = await recoveryScenario({ step, stack, runItem, governor, settle, ledger, now, sleep, dispatchedAt });
      }
      steps.push({ kind: step.kind, concurrency: step.concurrency, level: step.level || null, fairness: step.fairness || null, items: step.items ? step.items.length : (step.count || 3 * (step.repeats || 1)), durationMs: now() - st0, practice: diff(before, practice.summary().totals), governorStopped: governor.stopped() ? governor.stopped().reason : null });
      if (governor.stopped()) { warnings.push("hard stop: " + governor.stopped().reason); break; }
      if (step.cooldown && plan.ceilings.cooldownMs) await sleep(plan.ceilings.cooldownMs);
    }
    if (itemErrors.length) return refused("HARNESS_ERROR", itemErrors.slice(0, 5));          // a harness bug can never become a PASS
    const settled = await settle(plan.params.settleTimeoutMs || DEFAULT_SETTLE_MS[target.name]);
    if (!settled) warnings.push("settlement timed out: unsettled accepted jobs are reported as lost");
    const health = await client.health();
    const journal = stack ? journalConsistency(stack.journalStatus(), { expected: plan.params.journalExpected || {} }) : attachments && attachments.journalStatus ? journalConsistency(attachments.journalStatus, { expected: plan.params.journalExpected || {} }) : null;
    const practiceSummary = practice.summary(), official = ledger.reconcile();
    const gates = evaluateGates({ practice: practiceSummary, official, journal: stack ? stack.journalStatus() : attachments && attachments.journalStatus ? attachments.journalStatus : undefined, journalExpected: plan.params.journalExpected, responsive: health.ok, governor: governor.snapshot() });
    const report = buildReport({ target, buildSha, runnerSha: runnerSha || (target.remote ? null : buildSha), vmSku: vmSku || null, harnessVersion: HARNESS_VERSION, scenario: { id: def.id, title: def.title, config: plan.config }, startedAt, durationMs: now() - t0, gates, practice: practiceSummary, official, journal, recovery, saturation, fairness, p1, callbacks: bursts, attachments: attachments ? sanitizeAttachments(attachments) : null, notes: [...notes, ...warnings, "steps: " + JSON.stringify(steps)] }, { canaries });
    return { ok: true, report, steps, bursts };
  } finally {
    if (stack) await stack.close().catch(() => {});
    else if (receiver) await receiver.close().catch(() => {});
  }
}

const cbKeyOf = stack => stack.callbackKey;
const diff = (a, b) => Object.fromEntries(Object.keys(b).map(k => [k, b[k] - (a[k] || 0)]));
const describeStep = s => ({ kind: s.kind, concurrency: s.concurrency, level: s.level || null, saturation: !!s.saturation, fairness: s.fairness || null, items: s.items ? s.items.length : (s.count || (s.repeats ? 3 * s.repeats : 0)), practice: s.items ? s.items.filter(i => i.type === "practice").length : 0, official: s.items ? s.items.filter(i => i.type === "official").length : 0, callbacks: s.count || 0, nearMax: !!s.nearMax, idempotency: !!s.idempotency });
function sanitizeAttachments(a) { const out = JSON.parse(JSON.stringify(a)); return out; }
function fairnessOf(step, summary, official) {
  const actors = {};
  for (const it of step.items) { const a = it.actor; if (!actors[a]) actors[a] = { practice: summary.actors[a] || null, official: official.byActor[a] || null, probe: !!it.probe }; }
  const probe = step.items.find(i => i.probe);
  const burst = Object.entries(actors).filter(([, v]) => !v.probe && v.practice && v.practice.latency.count).map(([, v]) => v.practice.latency.p50);
  const pa = probe && summary.actors[probe.actor];
  return { actors, singleRequesterMs: pa ? pa.latency.max : null, singleRequesterBusy: pa ? pa.busy : null, burstP50Ms: burst.length ? percentiles(burst).p50 : null, note: "measured only — no fairness guarantee exists in the current code (B9 defines policy)" };
}

/** MODE 4 — many signed callbacks in a bounded interval (+ one idempotent re-delivery when the receiver applies). */
async function callbackBurst({ step, callbackTarget, fetchImpl, governor, now, receiver, ledger }) {
  const sender = createCallbackSender({ baseUrl: callbackTarget.baseUrl, key: callbackTarget.key, fetchImpl, now });
  const bodies = Array.from({ length: step.count }, () => syntheticCallbackBody({ nearMax: !!step.nearMax }));
  const answers = {}, lat = [];
  const results = await runPool(bodies, step.concurrency, async b => { const r = await sender.send(b); answers[r.answer] = (answers[r.answer] || 0) + 1; if (r.httpStatus) lat.push(r.ms); return r; }, governor);
  const out = { count: step.count, concurrency: step.concurrency, nearMax: !!step.nearMax, bytesPerBody: bodies[0] ? Buffer.byteLength(JSON.stringify(bodies[0])) : 0, expectedAnswer: callbackTarget.synthetic, answers, latency: percentiles(lat), transportOk: results.every(r => r && r.answer === callbackTarget.synthetic) };
  if (step.idempotency && callbackTarget.synthetic === "applied" && bodies[0]) {
    // Independent Review Fix 1 (RF2): 1. the first delivery applied → 2. SNAPSHOT the authoritative state BEFORE the re-delivery →
    // 3. re-deliver the EXACT same body → 4. snapshot AFTER → 5. alreadyApplied AND state / score / application count unchanged.
    const id = bodies[0].jobId;
    const snapshot = () => { const a = receiver ? receiver.applied.get(id) : null; return a ? { state: a.state, score: a.score, applications: a.applications } : null; };
    const before = snapshot();
    const again = await sender.send(bodies[0]);
    const after = snapshot();
    const same = k => !!before && !!after && before[k] === after[k];
    out.idempotency = { redeliveryAnswer: again.answer, before, after, stateUnchanged: same("state"), scoreUnchanged: same("score"), applicationsUnchanged: same("applications"), pass: again.answer === "alreadyApplied" && same("state") && same("score") && same("applications") };
    // the synthetic job is accounted like an official job: the first application with its ACTUAL first score, the re-delivery as
    // whatever the receiver answered with the state it then held (a drift or a second application is a G2 failure)
    ledger.submitted(id, { language: "python", workloadId: "SYNTHETIC-CALLBACK", cases: bodies[0].cases.length, actor: "callback-burst" });
    ledger.dispatched(id, { status: "accepted", httpStatus: 202, ms: 0 });
    const known = a => (["applied", "alreadyApplied", "stale", "unknown", "rejected", "error"].includes(a) ? a : "error");
    ledger.callbackReceived(id, { outcome: "completed", ms: results[0].ms }); ledger.acknowledged(id, { answer: known(results[0].answer), state: before ? before.state : "complete", score: before ? before.score : null });
    ledger.callbackReceived(id, { outcome: "completed", ms: again.ms }); ledger.acknowledged(id, { answer: known(again.answer), state: after ? after.state : "complete", score: after ? after.score : null });
    // a synthetic job is terminal the moment its burst ends: nothing more will ever arrive, so a failed transport is an EXPLICIT
    // failed terminal (settlement never waits for it) and Q-CALLBACK-TRANSPORT carries the verdict
    if (ledger.reconcile().lost.includes(id)) ledger.terminal(id, "failed");
  }
  return out;
}

/** MODE 5 — accepted work exists → the gateway dies → journal inspected → gateway returns → recovery → settle → applied once. */
async function recoveryScenario({ step, stack, runItem, governor, settle, ledger, now, sleep, dispatchedAt }) {
  if (!stack) throw new Error("recovery needs the local stack");
  const slow = stack.sandbox;
  const seen = new Map();
  if (slow.stats) { /* count physical official executions per job through the fake sandbox */ }
  const origSuite = slow.runOfficialSuite.bind(slow);
  slow.runOfficialSuite = async (entry, job, opts) => { seen.set(job.jobId, (seen.get(job.jobId) || 0) + 1); await sleep(250); return origSuite(entry, job, opts); };
  await runPool(step.items, step.concurrency, runItem, governor);
  // wait until at least one job is physically running and some are still waiting, then die
  const until = now() + 10000;
  while (now() < until) { const s = stack.queueStatus(); if (s && s.running >= 1) break; await sleep(10); }
  const atCrash = stack.journalStatus();
  await stack.crash();
  const outstanding = { received: atCrash.counts.received, running: atCrash.counts.running, executed: atCrash.counts.executed, confirmed: atCrash.counts.confirmed };
  const { recovery } = await stack.restart();
  for (const id of ledger.jobIds()) if (!dispatchedAt.has(id)) dispatchedAt.set(id, now());
  const settled = await settle(30000);
  const r = ledger.reconcile();
  const perJob = [...seen.values()];
  // ONE crash → an interrupted job may run at most once more (first run + 1); the shared recoveryVerdict() decides pass for the
  // scenario AND for Q-RECOVERY, so the two can never drift (Independent Review Fix 2)
  const evidence = { accepted: r.accepted, outstandingAtCrash: outstanding, recoveredAtRestart: recovery ? recovery.recovered : null, corruptAtRestart: recovery ? recovery.corrupt : null, settled, complete: r.complete, retryable: r.retryable, lost: r.lost.length, duplicateApplications: r.duplicateApplications, executionsPerJobMax: perJob.length ? Math.max(...perJob) : 0, maxExecutionsAllowed: 2, reExecutedJobs: perJob.filter(n => n > 1).length, resubmissionNeeded: r.lost.length > 0 || r.failedTerminal > 0 };
  return { ...evidence, pass: recoveryVerdict(evidence).pass };
}

module.exports = { runScenario, callbackBurst, P1_CEILING_MS, LANGUAGES };
