"use strict";
// Phase 17F-B10-A — PRODUCTION SAFETY LIMITS of the load harness. Every target class has HARD ceilings a scenario can lower but
// never raise: offered concurrency, total jobs, test duration, official submissions, hidden cases per job and the cool-down
// between steps. A plan above a ceiling is REFUSED (never clamped silently: the operator must see what was asked for); at run
// time a governor hands out admissions one by one and HARD-STOPS the run when a ceiling would be crossed, so no soak test and no
// retry storm can grow out of the configured envelope. The governor also records the peak concurrency it actually observed.
const CEILINGS = Object.freeze({
  local: Object.freeze({ maxConcurrency: 64, maxTotalJobs: 5000, maxDurationMs: 60 * 60 * 1000, maxOfficialJobs: 2000, maxCasesPerJob: 50, minCooldownMs: 0 }),
  staging: Object.freeze({ maxConcurrency: 32, maxTotalJobs: 2000, maxDurationMs: 45 * 60 * 1000, maxOfficialJobs: 500, maxCasesPerJob: 50, minCooldownMs: 0 }),
  production: Object.freeze({ maxConcurrency: 8, maxTotalJobs: 200, maxDurationMs: 15 * 60 * 1000, maxOfficialJobs: 50, maxCasesPerJob: 50, minCooldownMs: 2000 })
});
const FIELDS = ["maxConcurrency", "maxTotalJobs", "maxDurationMs", "maxOfficialJobs", "maxCasesPerJob"];
const posInt = (v, allowZero = false) => Number.isInteger(v) && (allowZero ? v >= 0 : v >= 1);

/**
 * Resolves the effective ceilings of a run: the target's hard ceilings, lowered by whatever the scenario / operator requested.
 * → { ok: true, ceilings } | { ok: false, code: "CEILING_EXCEEDED" | "CEILING_INVALID", field }
 */
function resolveCeilings(targetName, requested = {}) {
  const hard = CEILINGS[targetName];
  if (!hard) return { ok: false, code: "UNKNOWN_TARGET" };
  const out = { ...hard, cooldownMs: hard.minCooldownMs };
  delete out.minCooldownMs;
  for (const f of FIELDS) {
    if (requested[f] === undefined) continue;
    if (!posInt(requested[f])) return { ok: false, code: "CEILING_INVALID", field: f };
    if (requested[f] > hard[f]) return { ok: false, code: "CEILING_EXCEEDED", field: f, requested: requested[f], max: hard[f] };
    out[f] = requested[f];
  }
  if (requested.cooldownMs !== undefined) {
    if (!posInt(requested.cooldownMs, true)) return { ok: false, code: "CEILING_INVALID", field: "cooldownMs" };
    if (requested.cooldownMs < hard.minCooldownMs) return { ok: false, code: "CEILING_EXCEEDED", field: "cooldownMs", requested: requested.cooldownMs, min: hard.minCooldownMs };
    out.cooldownMs = requested.cooldownMs;
  }
  return { ok: true, ceilings: Object.freeze(out) };
}

/** Checks ONE plan against the effective ceilings. → null | { code, field, requested, max } */
function checkPlanAgainstCeilings(plan, ceilings) {
  const t = plan && plan.totals ? plan.totals : plan;
  if (t.jobs > ceilings.maxTotalJobs) return { code: "MAX_TOTAL_JOBS_EXCEEDED", requested: t.jobs, max: ceilings.maxTotalJobs };
  if (t.maxConcurrency > ceilings.maxConcurrency) return { code: "MAX_CONCURRENCY_EXCEEDED", requested: t.maxConcurrency, max: ceilings.maxConcurrency };
  if (t.officialJobs > ceilings.maxOfficialJobs) return { code: "MAX_OFFICIAL_JOBS_EXCEEDED", requested: t.officialJobs, max: ceilings.maxOfficialJobs };
  if (t.maxCasesPerJob > ceilings.maxCasesPerJob) return { code: "MAX_CASES_PER_JOB_EXCEEDED", requested: t.maxCasesPerJob, max: ceilings.maxCasesPerJob };
  return null;
}

/**
 * The run-time governor: `offer()` admits ONE more job or refuses (and stops the run) when the total-job or duration ceiling is
 * reached; `enter()` / `leave()` track live concurrency (an attempt to exceed the ceiling is refused AND recorded). `snapshot()`
 * is what the report records for gate G8 (ceilingExceeded must be false).
 */
function createGovernor(ceilings, { now = () => Date.now() } = {}) {
  if (!ceilings || !posInt(ceilings.maxTotalJobs) || !posInt(ceilings.maxConcurrency) || !posInt(ceilings.maxDurationMs)) throw new TypeError("governor needs positive integer ceilings: maxTotalJobs, concurrency (maxConcurrency ≥ 1), maxDurationMs");
  const startedAt = now();
  let offered = 0, active = 0, peak = 0, stopped = null, exceeded = false;
  const stop = reason => { if (!stopped) stopped = { reason, at: now() }; };
  return {
    offer() {
      if (stopped) return false;
      if (now() - startedAt >= ceilings.maxDurationMs) { stop("max-duration"); return false; }
      if (offered >= ceilings.maxTotalJobs) { stop("max-total-jobs"); return false; }
      offered++;
      if (offered >= ceilings.maxTotalJobs) { /* the LAST admission: later offers stop the run */ }
      return true;
    },
    enter() { if (active >= ceilings.maxConcurrency) { exceeded = true; stop("max-concurrency"); return false; } active++; peak = Math.max(peak, active); return true; },
    leave() { active = Math.max(0, active - 1); },
    hardStop(reason) { stop(reason || "operator"); },
    stopped: () => stopped,
    snapshot: () => ({ offered, peakConcurrency: peak, ceilingExceeded: exceeded, stopped: stopped ? stopped.reason : null, elapsedMs: now() - startedAt, ceilings: { ...ceilings } })
  };
}

/** A bounded worker pool: at most `concurrency` tasks in flight; every admission goes through the governor when one is given. */
async function runPool(items, concurrency, fn, governor) {
  if (!posInt(concurrency)) throw new TypeError("pool concurrency must be a positive integer");
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      if (governor && !governor.offer()) { results[i] = { skipped: "governor-stop" }; continue; }
      if (governor && !governor.enter()) { results[i] = { skipped: "concurrency-ceiling" }; continue; }
      try { results[i] = await fn(items[i], i); }
      catch (e) { results[i] = { error: String(e && e.message || e) }; }
      finally { if (governor) governor.leave(); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, worker));
  return results;
}

module.exports = { CEILINGS, resolveCeilings, checkPlanAgainstCeilings, createGovernor, runPool };
