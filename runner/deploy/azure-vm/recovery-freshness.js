"use strict";
// Phase 17F-A1 — RECOVERY SWEEP FRESHNESS check. GitHub scheduled workflows are BEST-EFFORT: the "Coding Grading Recovery" cron
// is configured every 10 minutes, but only 3 runs were observed in ~9.5 hours (17F-A audit). This reads the time of the last
// SUCCESSFUL run of .github/workflows/coding-grading-recovery.yml from the GitHub REST API and fails when it is older than the
// agreed maximum interval. No application change, no secret beyond an optional read-only token.
//     GITHUB_TOKEN=<read-only, optional for a public repo> node deploy/azure-vm/recovery-freshness.js --repo=owner/name [--max-age-min=240] [--json]
// Exit: 0 fresh · 3 stale (no successful sweep within the interval) · 2 usage / API error.
const WORKFLOW = "coding-grading-recovery.yml";
const DEFAULT_MAX_AGE_MIN = 240;

async function lastSuccessfulSweep({ repo, token, fetchImpl = globalThis.fetch }) {
  const url = "https://api.github.com/repos/" + repo + "/actions/workflows/" + WORKFLOW + "/runs?status=success&per_page=1";
  const res = await fetchImpl(url, { headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: "Bearer " + token } : {}) }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (res.status !== 200) return { error: "GitHub API HTTP " + res.status };
  const json = await res.json();
  const run = json && Array.isArray(json.workflow_runs) ? json.workflow_runs[0] : null;
  if (!run) return { lastSuccessAt: null };
  return { lastSuccessAt: run.updated_at || run.created_at, event: run.event };
}

/** → { fresh, ageMinutes, lastSuccessAt } at nowMs. */
function judge({ lastSuccessAt }, { nowMs = Date.now(), maxAgeMin = DEFAULT_MAX_AGE_MIN } = {}) {
  const t = lastSuccessAt ? Date.parse(lastSuccessAt) : NaN;
  if (!Number.isFinite(t)) return { fresh: false, ageMinutes: null, lastSuccessAt: null };
  const ageMinutes = Math.floor((nowMs - t) / 60000);
  return { fresh: ageMinutes <= maxAgeMin, ageMinutes, lastSuccessAt };
}

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] === undefined ? true : m[2]] : ["bad", a]; }));
  const repo = typeof args.repo === "string" ? args.repo : process.env.GITHUB_REPOSITORY;
  const maxAgeMin = Number(args["max-age-min"]) || DEFAULT_MAX_AGE_MIN;
  if (args.bad || !repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) { console.error("usage: recovery-freshness.js --repo=owner/name [--max-age-min=N] [--json]"); process.exit(2); }
  lastSuccessfulSweep({ repo, token: process.env.GITHUB_TOKEN }).then(r => {
    if (r.error) { console.error("recovery-freshness: " + r.error); process.exit(2); }
    const j = judge(r, { maxAgeMin });
    console.log(args.json ? JSON.stringify({ event: "runner.recovery.freshness", maxAgeMin, ...j }) : (j.fresh ? "FRESH" : "STALE") + " — last successful recovery sweep " + (j.lastSuccessAt ? j.lastSuccessAt + " (" + j.ageMinutes + " min ago)" : "never") + "; maximum " + maxAgeMin + " min");
    process.exit(j.fresh ? 0 : 3);
  }, () => { console.error("recovery-freshness: request failed"); process.exit(2); });
}

module.exports = { WORKFLOW, DEFAULT_MAX_AGE_MIN, lastSuccessfulSweep, judge };
