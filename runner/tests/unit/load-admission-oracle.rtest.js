"use strict";
// Hotfix — the CERT-E admission ORACLE. The gateway's bound is on LIVE official jobs (received + running, runner/gateway/official.js);
// the harness measures over-admission as `accepted in the step − maxPending` (harness.js; re-derived by qualification RF3-B). That
// equality holds only while no accepted job can leave LIVE before the whole burst has been answered. On a slow CI runner a fast fake
// job finished mid-burst, a 4th acceptance was LEGITIMATE (peak live never above 3) and the harness reported "1 over" (PR #260:
// RA4 / Q7 measured [8, 4, 4, 1]). The fix makes the condition hold BY CONSTRUCTION in the harness-owned fake sandbox: official
// executions are held until the burst has been answered, so cumulative acceptances = peak live, and a genuinely non-atomic
// admission (B10-F1: 8 accepted at once) is still measured as over-admission. No gateway code and no qualification rule changes.
// Fail-first on 784a59e: sequential arrivals slower than an instant job measure accepted > 3 although the bound held, and the
// fake sandbox / local stack have no hold.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../load/lib/index.js");
const { createFakeSandbox } = require("../load/lib/fake-sandbox.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const noNet = () => { throw new Error("no remote network"); };
const INSTANT = { python: { compileMs: 0, runMs: 0, cpuMs: 0, timeoutMs: 0 }, java: { compileMs: 0, largeCompileMs: 0, runMs: 0, cpuMs: 0, timeoutMs: 0 }, csharp: { compileMs: 0, largeCompileMs: 0, runMs: 0, cpuMs: 0, timeoutMs: 0 } };

test("AO1 local CERT-E, SEQUENTIAL arrivals slower than an instant job: the bound holds and the harness reports 3 accepted / 5 busy / 0 over (Q-ADMISSION PASS)", async () => {
  const r = await L.runScenario({ scenario: "CERT-E", target: "local", env: {}, buildSha: SHA, params: { concurrency: 1, profile: INSTANT }, deps: { fetchImpl: noNet } });
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  const off = r.report.saturation.steps[1].official;
  assert.deepEqual([off.offered, off.accepted, off.busy, off.overAdmission], [8, 3, 5, 0], JSON.stringify(off));
  assert.equal(r.report.qualification.checks.find(c => c.id === "Q-ADMISSION").pass, true);
  assert.equal(r.report.verdict, "PASS", JSON.stringify(r.report.qualification));
});

test("AO2 the fake sandbox holds official executions until released; release is idempotent; an abort ends a held suite; practice runs are never held", async () => {
  const sb = createFakeSandbox({ profile: INSTANT });
  assert.equal(typeof sb.holdOfficial, "function");
  const release = sb.holdOfficial();
  let done = false;
  const job = { source: "LOAD-KIND:success\n", cases: [{ token: "c01", stdin: "1\n" }], limits: { timeMs: 1000, outputBytes: 4096 } };
  const p = sb.runOfficialSuite({ key: "python" }, job).then(o => { done = true; return o; });
  const practice = await sb.run({ key: "python" }, { source: "LOAD-KIND:success\n", stdin: "", limits: { timeMs: 1000, outputBytes: 4096 } });
  assert.equal(practice.status, "success", "practice is never held");
  await new Promise(r => setTimeout(r, 30));
  assert.equal(done, false, "held until released");
  release(); release();
  const out = await p;
  assert.equal(out.cases[0].status, "success");
  const r2 = sb.holdOfficial(); const ctrl = new AbortController();
  const aborted = sb.runOfficialSuite({ key: "python" }, job, { signal: ctrl.signal }).then(() => "resolved", () => "rejected");
  ctrl.abort();
  assert.equal(await aborted, "rejected", "an aborted held suite ends (never hangs)");
  r2();
});

test("AO3 a test-owned stack (a staging rehearsal) holds official executions until N official submissions were ANSWERED, then releases", async () => {
  const stack = L.createLocalStack({ maxConcurrency: 2, official: { maxPending: 3, maxActive: 1 }, profile: INSTANT });
  await stack.start();
  try {
    assert.equal(typeof stack.holdOfficialUntilAnswered, "function");
    stack.holdOfficialUntilAnswered(8);
    const c = L.createRunnerClient({ baseUrl: stack.baseUrl, key: stack.key, fetchImpl: globalThis.fetch });
    const job = i => ({ jobId: "cg_ao3" + String(i).padStart(18, "0"), language: "python", languageVersion: 1, source: L.BY_ID.P1.source, cases: [{ token: "c01", stdin: "1\n" }], limits: { timeMs: 3000, memoryMb: 128, outputBytes: 17408 } });
    const statuses = [];
    for (let i = 0; i < 8; i++) { statuses.push((await c.submitOfficial(job(i))).status); await new Promise(r => setTimeout(r, 15)); }   // arrivals slower than an instant job
    assert.deepEqual(statuses, ["accepted", "accepted", "accepted", "busy", "busy", "busy", "busy", "busy"]);
    await stack.idle();
    assert.equal(stack.journalStatus().counts.confirmed, 3, "released after the 8th answer: every accepted job executed and was confirmed");
  } finally { await stack.close(); }
});
