"use strict";
// Phase 17F-A1 — RECOVERY SWEEP FRESHNESS check. GitHub scheduled workflows are BEST-EFFORT: the "Coding Grading Recovery" cron
// is configured every 10 minutes, but only 3 runs were observed in ~9.5 hours (17F-A audit). This reads the time of the last
// SUCCESSFUL run of .github/workflows/coding-grading-recovery.yml from the GitHub REST API and fails when it is older than the
// agreed maximum interval. No application change, no secret beyond an optional read-only token.
//     GITHUB_TOKEN=<read-only, optional for a public repo> node deploy/azure-vm/recovery-freshness.js --repo=owner/name [--max-age-min=240] [--json]
// Exit: 0 FRESH · 3 STALE (no successful sweep within the interval) · 2 usage (incl. a non-positive-integer --max-age-min) /
// UNKNOWN (API or request failure, or a last-success timestamp in the future — never fresh).
const WORKFLOW = "coding-grading-recovery.yml";
const DEFAULT_MAX_AGE_MIN = 240;
/** Review Fix 2 — a last-success timestamp may lead the local clock by at most this much (ordinary skew); beyond it the
 *  value is impossible and the verdict is UNKNOWN, never FRESH. */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

/**
 * Review Fix 2 — the freshness policy must be a finite POSITIVE INTEGER number of minutes. `undefined` (argument absent) is the
 * default 240; anything else that is not a positive integer (Infinity, NaN, text, 0, negatives, fractions) → null, so a CLI can
 * refuse it as a usage error and a library caller can fall back to the default — an invalid value never widens the window.
 */
function parseMaxAgeMin(raw) {
  if (raw === undefined) return DEFAULT_MAX_AGE_MIN;
  if (typeof raw === "number") return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string" || !/^[0-9]{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}

async function lastSuccessfulSweep({ repo, token, fetchImpl = globalThis.fetch }) {
  const url = "https://api.github.com/repos/" + repo + "/actions/workflows/" + WORKFLOW + "/runs?status=success&per_page=1";
  const res = await fetchImpl(url, { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: "Bearer " + token } : {}) }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (res.status !== 200) return { error: "GitHub API HTTP " + res.status };
  const json = await res.json();
  const run = json && Array.isArray(json.workflow_runs) ? json.workflow_runs[0] : null;
  if (!run) return { lastSuccessAt: null };
  return { lastSuccessAt: run.updated_at || run.created_at, event: run.event };
}

/**
 * → { state: "FRESH" | "STALE" | "UNKNOWN", fresh, ageMinutes, lastSuccessAt } at nowMs. No / unparsable timestamp = STALE; a
 * timestamp more than CLOCK_SKEW_TOLERANCE_MS in the future = UNKNOWN (impossible value — fail closed); within the tolerance the
 * age is clamped to 0. An invalid maxAgeMin falls back to the default policy (it can never widen the window).
 */
function judge({ lastSuccessAt }, { nowMs = Date.now(), maxAgeMin = DEFAULT_MAX_AGE_MIN } = {}) {
  const policy = parseMaxAgeMin(maxAgeMin) ?? DEFAULT_MAX_AGE_MIN;
  const t = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  if (!Number.isFinite(t)) return { state: "STALE", fresh: false, ageMinutes: null, lastSuccessAt: null };
  if (t > nowMs + CLOCK_SKEW_TOLERANCE_MS) return { state: "UNKNOWN", fresh: false, ageMinutes: null, lastSuccessAt, error: "last success is in the future" };
  const ageMinutes = Math.max(0, Math.floor((nowMs - t) / 60000));
  const fresh = ageMinutes <= policy;
  return { state: fresh ? "FRESH" : "STALE", fresh, ageMinutes, lastSuccessAt };
}

/**
 * 17F-B1 — the machine-readable operational result for ANY outcome of lastSuccessfulSweep (or of a failed request):
 *   FRESH   a successful sweep within maxAgeMin          STALE   none within maxAgeMin (or never)
 *   UNKNOWN the GitHub API / request failed or the input is not a sweep result — NEVER reported as fresh (fail closed)
 */
function freshnessState(result, opts = {}) {
  if (!result || typeof result !== "object" || typeof result.error === "string") return { state: "UNKNOWN", fresh: false, ageMinutes: null, lastSuccessAt: null, ...(result && typeof result === "object" && typeof result.error === "string" ? { error: result.error } : {}) };
  return judge(result, opts);
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : ["bad", a]; }));
  const repo = typeof args.repo === "string" ? args.repo : process.env.GITHUB_REPOSITORY;
  const maxAgeMin = parseMaxAgeMin(args["max-age-min"] === true ? "" : args["max-age-min"]);   // absent → 240; malformed → usage
  if (args.bad || !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || maxAgeMin === null) { console.error("usage: recovery-freshness.js --repo=owner/name [--max-age-min=N] [--json]   (N: a positive integer number of minutes; default 240)"); process.exit(2); }
  // `checkedAt` dates the verdict so coding-telemetry.js --recovery= can judge whether the result is still current (RF3)
  const emit = j => JSON.stringify({ event: "runner.recovery.freshness", maxAgeMin, checkedAt: new Date().toISOString(), ...j });
  const unknown = reason => { const j = freshnessState({ error: reason }, { maxAgeMin }); if (args.json) console.log(emit(j)); console.error("recovery-freshness: UNKNOWN — " + reason); process.exit(2); };
  lastSuccessfulSweep({ repo, token: process.env.GITHUB_TOKEN }).then(r => {
    if (r.error) return unknown(r.error);
    const j = freshnessState(r, { maxAgeMin });
    console.log(args.json ? emit(j) : j.state + " — last successful recovery sweep " + (j.lastSuccessAt ? j.lastSuccessAt + " (" + j.ageMinutes + " min ago)" : "never") + "; maximum " + maxAgeMin + " min");
    process.exit(j.fresh ? 0 : 3);
  }, () => unknown("request failed"));
}

module.exports = { WORKFLOW, DEFAULT_MAX_AGE_MIN, CLOCK_SKEW_TOLERANCE_MS, parseMaxAgeMin, lastSuccessfulSweep, judge, freshnessState };
