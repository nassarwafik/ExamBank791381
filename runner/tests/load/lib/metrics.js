"use strict";
// Phase 17F-B10-A — deterministic AGGREGATION for the load harness. Percentiles use the NEAREST-RANK definition over a sorted
// copy of the sample (p(q) = sorted[ceil(q · n) − 1]); every reported percentile is therefore an actual sample value, the result is
// independent of input order, and small samples (0, 1, 2 values) never produce NaN / undefined. Averages are reported separately
// (mean) and are never used for a correctness decision: correctness lives in accounting.js / gates.js, not in a mean.
const LANGUAGES = Object.freeze(["python", "java", "csharp"]);
const EXECUTION_STATUSES = Object.freeze(["success", "compile-error", "runtime-error", "timeout", "output-limit", "internal-error"]);

/** → { count, min, p50, p90, p95, p99, max, mean } — nulls for an empty sample; throws on a non-finite value. */
function percentiles(values) {
  if (!Array.isArray(values)) throw new TypeError("percentiles: values must be an array");
  for (const v of values) if (typeof v !== "number" || !Number.isFinite(v)) throw new TypeError("percentiles: every value must be a finite number");
  const n = values.length;
  if (n === 0) return { count: 0, min: null, p50: null, p90: null, p95: null, p99: null, max: null, mean: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const rank = q => sorted[Math.max(0, Math.min(n - 1, Math.ceil(q * n) - 1))];
  const sum = sorted.reduce((s, v) => s + v, 0);
  return { count: n, min: sorted[0], p50: rank(0.5), p90: rank(0.9), p95: rank(0.95), p99: rank(0.99), max: sorted[n - 1], mean: Math.round((sum / n) * 1000) / 1000 };
}

const isLanguage = l => LANGUAGES.includes(l);
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/**
 * Accumulates PRACTICE requests. Every offered request lands in exactly ONE bucket:
 *   completed (HTTP 200 with an execution status, including internal-error) · busy (503 RUNNER_BUSY) · rejected (any other HTTP
 *   answer) · networkErrors (no HTTP answer at all). `failed` = internal-error executions + network errors (a second axis, so a
 *   collapse of RUNNER_BUSY into "failed" is visible). Latency samples are taken from completed executions only.
 */
function createPracticeAccumulator() {
  const totals = { offered: 0, completed: 0, busy: 0, rejected: 0, networkErrors: 0, failed: 0, mismatches: 0, leaks: 0 };
  const outcomes = {}, languages = {}, actors = {}, workloads = {};
  const lat = [], latByLanguage = {}, latByOutcome = {}, latByActor = {}, waitByActor = {};
  const lang = l => (languages[l] = languages[l] || { offered: 0, completed: 0, busy: 0, rejected: 0, networkErrors: 0, failed: 0, outcomes: {}, latency: [] });
  const actorOf = a => (actors[a] = actors[a] || { offered: 0, completed: 0, busy: 0, latency: [], queueWait: [] });
  return {
    /** { language, workloadId, httpStatus, status?, code?, error?, ms, actor?, queueWaitMs? } */
    record(r) {
      if (!r || !isLanguage(r.language)) throw new TypeError("practice record needs a supported language");
      if (typeof r.ms !== "number" || !Number.isFinite(r.ms) || r.ms < 0) throw new TypeError("practice record needs a finite ms");
      const L = lang(r.language), A = r.actor ? actorOf(r.actor) : null;
      totals.offered++; L.offered++; if (A) A.offered++;
      bump(workloads, r.workloadId || "unknown");
      if (r.httpStatus === 200 && typeof r.status === "string") {
        if (!EXECUTION_STATUSES.includes(r.status)) throw new TypeError("unknown execution status " + r.status);
        totals.completed++; L.completed++; if (A) { A.completed++; A.latency.push(r.ms); if (Number.isFinite(r.queueWaitMs)) A.queueWait.push(r.queueWaitMs); }
        bump(outcomes, r.status); bump(L.outcomes, r.status);
        lat.push(r.ms); L.latency.push(r.ms); (latByOutcome[r.status] = latByOutcome[r.status] || []).push(r.ms);
        if (r.status === "internal-error") { totals.failed++; L.failed++; }
        if (r.mismatch) totals.mismatches++;
        if (r.leak) totals.leaks += Number(r.leak) || 1;
      } else if (r.httpStatus === 503 && r.code === "RUNNER_BUSY") { totals.busy++; L.busy++; if (A) A.busy++; }
      else if (!r.httpStatus || r.error) { totals.networkErrors++; L.networkErrors++; totals.failed++; L.failed++; }
      else { totals.rejected++; L.rejected++; }
    },
    summary() {
      const out = { totals: { ...totals }, mismatches: totals.mismatches, leaks: totals.leaks, outcomes: { ...outcomes }, latency: percentiles(lat), latencyByOutcome: {}, languages: {}, actors: {}, workloads: { ...workloads } };
      for (const [k, v] of Object.entries(latByOutcome)) out.latencyByOutcome[k] = percentiles(v);
      for (const [k, v] of Object.entries(languages).sort()) out.languages[k] = { offered: v.offered, completed: v.completed, busy: v.busy, rejected: v.rejected, networkErrors: v.networkErrors, failed: v.failed, outcomes: { ...v.outcomes }, latency: percentiles(v.latency) };
      for (const [k, v] of Object.entries(actors).sort()) out.actors[k] = { offered: v.offered, completed: v.completed, busy: v.busy, latency: percentiles(v.latency), queueWait: percentiles(v.queueWait) };
      void latByLanguage; void latByActor; void waitByActor;
      return out;
    }
  };
}

module.exports = { LANGUAGES, EXECUTION_STATUSES, percentiles, createPracticeAccumulator };
