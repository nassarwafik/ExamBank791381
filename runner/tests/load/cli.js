#!/usr/bin/env node
"use strict";
// Phase 17F-B10-A — the operator CLI of the Coding Load, Capacity & Certification Harness.
//
//   node runner/tests/load/cli.js                                  → safe DRY RUN of CERT-A against the local stack (no network)
//   node runner/tests/load/cli.js catalog                          → the scenario catalog (Markdown)
//   node runner/tests/load/cli.js plan   --scenario=CERT-D --target=staging [params]
//   node runner/tests/load/cli.js run    --scenario=CERT-L --target=local --execute [params] [--out=DIR] [--attach=FILE.json]
//
//   params:  --jobs=N --official-jobs=N --cases-per-job=N --concurrency=N --levels=1,2,4 --languages=python,java --workloads=P1,J1
//            --sandbox=fake|docker (local only) --runner-max-concurrency=N --runner-max-pending=N --runner-max-active=N
//            --max-total-jobs=N --max-duration-ms=N --cooldown-ms=N (lower a ceiling; never raise one) --settle-timeout-ms=N
//            --vm-sku=Standard_D4s_v5 --runner-sha=<40 hex> --note=...
//
// SAFETY: without --execute every invocation is a dry run (a plan, no request). A remote target needs RUNNER_URL + RUNNER_HMAC_KEY in
// the environment; production ALSO needs SMARTASSESS_ALLOW_PRODUCTION_LOAD_TEST=I_UNDERSTAND and refuses official load through the
// Runner protocol. Secrets come only from the environment and are never printed. Results (JSON + Markdown) are written under
// runner/tests/load/results/ (git-ignored) with the build SHA in the file name. Exit: 0 PASS / dry run · 1 FAIL or INCOMPLETE · 2 refused / usage.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const L = require("./lib/index.js");

function parseArgs(argv) {
  const out = { _: [] };
  for (const a of argv) { const m = /^--([a-z0-9-]+)(?:=(.*))?$/.exec(a); if (!m) { out._.push(a); continue; } out[m[1]] = m[2] === undefined ? true : m[2]; }
  return out;
}
const int = v => (v === undefined ? undefined : Number(v));
const list = v => (v === undefined ? undefined : String(v).split(",").map(s => s.trim()).filter(Boolean));
function paramsFrom(a) {
  const p = {};
  if (a.jobs !== undefined) p.jobs = int(a.jobs);
  if (a["official-jobs"] !== undefined) p.officialJobs = int(a["official-jobs"]);
  if (a["cases-per-job"] !== undefined) p.casesPerJob = int(a["cases-per-job"]);
  if (a.concurrency !== undefined) p.concurrency = int(a.concurrency);
  if (a.levels !== undefined) p.levels = list(a.levels).map(Number);
  if (a.languages !== undefined) p.languages = list(a.languages);
  if (a.workloads !== undefined) p.workloadIds = list(a.workloads);
  if (a.sandbox !== undefined) p.sandbox = String(a.sandbox);
  const runner = {};
  if (a["runner-max-concurrency"] !== undefined) runner.maxConcurrency = int(a["runner-max-concurrency"]);
  if (a["runner-max-pending"] !== undefined) runner.maxPending = int(a["runner-max-pending"]);
  if (a["runner-max-active"] !== undefined) runner.maxActive = int(a["runner-max-active"]);
  if (Object.keys(runner).length) p.runner = runner;
  const ceilings = {};
  if (a["max-total-jobs"] !== undefined) ceilings.maxTotalJobs = int(a["max-total-jobs"]);
  if (a["max-duration-ms"] !== undefined) ceilings.maxDurationMs = int(a["max-duration-ms"]);
  if (a["cooldown-ms"] !== undefined) ceilings.cooldownMs = int(a["cooldown-ms"]);
  if (a["max-concurrency"] !== undefined) ceilings.maxConcurrency = int(a["max-concurrency"]);
  if (Object.keys(ceilings).length) p.ceilings = ceilings;
  if (a["settle-timeout-ms"] !== undefined) p.settleTimeoutMs = int(a["settle-timeout-ms"]);
  return p;
}
/** The git object id of the checked-out tree (the harness is test tooling; the gateway never spawns anything but docker). */
function gitSha(repo) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8", shell: false });
  const sha = r.status === 0 ? r.stdout.trim() : "";
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}
function readAttachment(file) {
  const text = fs.readFileSync(file, "utf8");
  const json = JSON.parse(text);
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new Error("attachment must be a JSON object");
  return json;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const cmd = a._[0] || "plan";
  if (!["catalog", "plan", "run"].includes(cmd)) { console.error("usage: cli.js catalog | plan --scenario=ID --target=local|staging|production [params] | run ... --execute"); process.exit(2); }
  if (cmd === "catalog") { console.log(L.catalogMarkdown()); return; }
  const repo = path.resolve(__dirname, "..", "..", "..");
  const scenario = a.scenario === undefined ? "CERT-A" : String(a.scenario);
  const target = a.target === undefined ? "local" : String(a.target);
  const execute = cmd === "run" && a.execute === true;
  const params = paramsFrom(a);
  const buildSha = typeof a["build-sha"] === "string" ? a["build-sha"] : gitSha(repo);
  const attachments = a.attach ? readAttachment(String(a.attach)) : undefined;
  const r = await L.runScenario({ scenario, target, env: process.env, params, dryRun: !execute, buildSha, runnerSha: typeof a["runner-sha"] === "string" ? a["runner-sha"] : undefined, vmSku: typeof a["vm-sku"] === "string" ? a["vm-sku"] : undefined, attachments, notes: a.note ? [String(a.note)] : [] });
  if (!r.ok) { console.error("REFUSED " + r.code + (r.detail ? " — " + (typeof r.detail === "string" ? r.detail : JSON.stringify(r.detail)) : "")); process.exit(2); }
  if (r.dryRun) {
    console.log("DRY RUN — no request was made. target=" + r.target.name + " scenario=" + r.scenario.id + " (" + r.scenario.title + ")");
    console.log("  purpose: " + r.scenario.purpose);
    console.log("  safety:  " + r.scenario.safety);
    console.log("  plan:    " + JSON.stringify({ totals: r.plan.totals, ceilings: r.plan.ceilings }));
    for (const s of r.plan.steps) console.log("  step:    " + JSON.stringify(s));
    console.log(execute ? "" : "Add --execute to run it" + (target === "production" ? " (production also needs " + L.PRODUCTION_ACK_ENV + "=" + L.PRODUCTION_ACK_VALUE + ")" : "") + ".");
    return;
  }
  const outDir = a.out ? path.resolve(String(a.out)) : path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = r.report.startedAt.replace(/[:.]/g, "-");
  const base = path.join(outDir, r.report.scenario.id + "." + r.report.target.name + "." + r.report.buildSha.slice(0, 12) + "." + stamp);
  fs.writeFileSync(base + ".json", JSON.stringify(r.report, null, 2) + "\n");
  fs.writeFileSync(base + ".md", L.toMarkdown(r.report));
  console.log(L.toMarkdown(r.report));
  console.log("written: " + base + ".json / .md");
  process.exit(r.report.verdict === "PASS" ? 0 : 1);
}

if (require.main === module) main().catch(e => { console.error("harness failed: " + String(e && e.message || e)); process.exit(2); });

module.exports = { parseArgs, paramsFrom };
