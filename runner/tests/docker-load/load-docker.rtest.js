"use strict";
// Phase 17F-B10-A — REAL-DOCKER LOCAL LOAD QUALIFICATION (bounded; requires Docker + the three worker images; nothing is skipped).
// The same harness and the same scenarios as the fake-sandbox suite, now against the real sandbox (`sandbox: "docker"`): the
// in-process gateway, queue, journal and callback receiver are real in both cases; only the sandbox changes. Volumes are small on
// purpose (a CI runner has 2–4 vCPUs); the D4s_v5 numbers come from a staging / pilot VM run, never from this suite.
//   DL1 practice correctness (every workload) at concurrency 2                 DL2 official grading correctness (3 hidden cases)
//   DL3 concurrency ladder 1 → 4 (busy observable above the Runner limit)      DL4 saturation: RUNNER_BUSY + responsive afterwards
//   DL5 recovery under load (crash / restart over the same journal)            DL6 P2: a real 50-case ~17 KB/case official job + re-delivery
//   DL7 final mixed workload (exam-like, scaled down)
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const L = require("../load/lib/index.js");
const { LANGUAGES } = require("../../gateway/registry.js");

const SHA = (() => { const r = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }); return /^[0-9a-f]{40}$/.test(r.stdout.trim()) ? r.stdout.trim() : "0".repeat(40); })();
const orphans = () => spawnSync("docker", ["ps", "-aq", "--filter", "label=smartassess.coding-runner=1"], { encoding: "utf8" }).stdout.trim();
const run = (scenario, params) => L.runScenario({ scenario, target: "local", env: {}, buildSha: SHA, params: { sandbox: "docker", settleTimeoutMs: 240000, ...params } });
const expectPass = (r, label) => { assert.equal(r.ok, true, label + ": " + JSON.stringify(r).slice(0, 400)); assert.equal(r.report.verdict, "PASS", label + ": " + JSON.stringify(r.report.correctness.gates.filter(g => g.pass === false))); return r.report; };

test("preflight: Docker and the worker images exist", () => {
  assert.equal(spawnSync("docker", ["version"], { encoding: "utf8" }).status, 0, "docker daemon unreachable");
  for (const e of Object.values(LANGUAGES)) assert.equal(spawnSync("docker", ["image", "inspect", e.image]).status, 0, "missing image " + e.image);
});
test("DL1 practice correctness: every matrix workload through the real sandbox", { timeout: 600000 }, async () => {
  const rep = expectPass(await run("CERT-A", { concurrency: 2, runner: { maxConcurrency: 2 } }), "CERT-A");
  assert.equal(rep.totals.offered, 14); assert.equal(rep.totals.completed, 14); assert.equal(rep.totals.mismatches, 0);
  for (const l of ["python", "java", "csharp"]) assert.ok(rep.languages[l].latency.count >= 4, l);
  assert.equal(orphans(), "");
});
test("DL2 official grading correctness: accepted = complete + retryable + failed, applied once", { timeout: 600000 }, async () => {
  const rep = expectPass(await run("CERT-B", { officialJobs: 7, casesPerJob: 3, concurrency: 2, runner: { maxConcurrency: 1, maxPending: 16, maxActive: 1 } }), "CERT-B");
  assert.equal(rep.official.accepted, 7); assert.equal(rep.official.remainder, 0); assert.equal(rep.official.duplicateApplications, 0);
  assert.equal(orphans(), "");
});
test("DL3 concurrency ladder 1 → 4 with the Runner limited to 2: RUNNER_BUSY appears only above the limit", { timeout: 600000 }, async () => {
  const rep = expectPass(await run("CERT-D", { jobs: 4, levels: [1, 2, 4], runner: { maxConcurrency: 2 } }), "CERT-D");
  assert.equal(rep.totals.offered, 12);
  assert.ok(rep.totals.busy >= 1, "level 4 above a limit of 2 must refuse at least one request");
  assert.equal(rep.totals.lost, 0);
  assert.equal(orphans(), "");
});
test("DL4 saturation: safe refusal, peak sandboxes ≤ limit, Runner responsive afterwards", { timeout: 600000 }, async () => {
  const r = await run("CERT-E", { jobs: 8, officialJobs: 3, concurrency: 4, runner: { maxConcurrency: 1, maxPending: 2, maxActive: 1 } });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 400));
  const rep = r.report;
  // B3 (atomic admission) is in the Runner: correctness AND the scenario qualification must PASS — Q-ADMISSION included (the
  // pre-B3 allowance for finding B10-F1 is gone); any failure is a regression
  assert.equal(rep.correctness.verdict, "PASS", JSON.stringify(rep.correctness.failed));
  assert.deepEqual(rep.qualification.failed, [], JSON.stringify(rep.qualification));
  assert.equal(rep.qualification.checks.find(c => c.id === "Q-ADMISSION").pass, true, JSON.stringify(rep.qualification));
  assert.equal(rep.verdict, "PASS");
  const official = rep.saturation.steps[1].official;
  assert.equal(official.overAdmission, 0); assert.ok(official.accepted <= 2, "never more than maxPending accepted: " + JSON.stringify(official)); assert.equal(official.offered, official.accepted + official.busy);
  assert.ok(rep.saturation.steps[0].practice.busy >= 1);
  assert.equal(rep.correctness.gates.find(g => g.id === "G7").pass, true);
  assert.equal(orphans(), "");
});
test("DL5 recovery under load with real containers: crash while running, restart, every job applied once", { timeout: 600000 }, async () => {
  const rep = expectPass(await run("CERT-G", { officialJobs: 3, casesPerJob: 2, concurrency: 3, runner: { maxConcurrency: 1, maxPending: 16, maxActive: 1 } }), "CERT-G");
  assert.equal(rep.recovery.pass, true); assert.equal(rep.recovery.duplicateApplications, 0); assert.equal(rep.recovery.lost, 0);
  for (let i = 0; i < 60 && orphans() !== ""; i++) await new Promise(r => setTimeout(r, 500));
  assert.equal(orphans(), "");
});
test("DL6 P2 callback-size regression: near-max transport + a REAL 50-case ~17 KB/case job graded once, re-delivery alreadyApplied", { timeout: 900000 }, async () => {
  const rep = expectPass(await run("CERT-K", { runner: { maxConcurrency: 1, maxPending: 4, maxActive: 1 } }), "CERT-K");
  assert.equal(rep.official.accepted, 2, "the synthetic near-max job + the real 50-case job");
  assert.equal(rep.official.duplicateCallbackAcks, 1);
  assert.equal(rep.official.idempotencyViolations.length, 0);
  assert.equal(orphans(), "");
});
test("DL7 final mixed workload (scaled down): every job settles, journal clean", { timeout: 900000 }, async () => {
  const rep = expectPass(await run("CERT-L", { jobs: 8, officialJobs: 4, casesPerJob: 2, concurrency: 2, students: 4, runner: { maxConcurrency: 2, maxPending: 16, maxActive: 1 } }), "CERT-L");
  assert.equal(rep.totals.lost, 0); assert.equal(rep.journal.ok, true);
  assert.equal(orphans(), "");
});
