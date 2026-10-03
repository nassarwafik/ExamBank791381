"use strict";
// Phase 17F-B10-A — Independent Review Fix 1 (PR #249, reviewed head 4c1a416). FAIL-FIRST:
//   RF1 Q1–Q10  the top-level verdict is the SCENARIO QUALIFICATION (correctness G1–G11 + the scenario's own required checks:
//               Q-P1, Q-CALLBACK-TRANSPORT, Q-IDEMPOTENCY, Q-RECOVERY, Q-ADMISSION); a report can never say PASS while a required
//               check failed, and a required check that was not measured gives INCOMPLETE. Correctness stays separately reported.
//   RF2 I1–I5   the idempotency check snapshots the authoritative state BEFORE the duplicate delivery and compares state, score and
//               application count after it; the ledger records the FIRST application with the actual first score.
//   RF3 R1–R8   the harness callback receiver bounds the request body at the Runner protocol's CALLBACK_MAX_BYTES (8 MiB): wrong
//               method / path refused before reading, Content-Length above the bound refused immediately, streaming bytes counted and
//               the body discarded past the bound, exactly-at-limit accepted, the ≈ 6.45 MB P2 body still accepted, HMAC over the
//               exact accepted bytes, receiver usable afterwards.
// Fail-first on 4c1a416: no qualification layer, snapshot taken after the re-delivery, receiver buffers without a bound.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const L = require("../load/lib/index.js");
const { CALLBACK_MAX_BYTES, CALLBACK_PATH, signCallbackRequest } = require("../../gateway/callback.js");

const SHA = "0123456789abcdef0123456789abcdef01234567";
const noNet = () => { throw new Error("no remote network"); };
const run = (scenario, params = {}, deps = {}) => L.runScenario({ scenario, target: "local", env: {}, buildSha: SHA, params, deps: { fetchImpl: noNet, ...deps } });
const okReport = (r, label) => { assert.equal(r.ok, true, label + ": " + JSON.stringify(r).slice(0, 300)); return r.report; };
const correctnessPass = () => L.evaluateGates({ practice: L.createPracticeAccumulator().summary(), official: L.createOfficialLedger().reconcile(), journal: { counts: { received: 0, running: 0, executed: 0, confirmed: 1, callback_failed: 0, superseded: 0 }, quarantined: 0, corrupt: 0, truncated: false }, responsive: true, governor: { ceilingExceeded: false } });
const reportInput = (scenarioId, over = {}) => ({ target: { name: "local", remote: false }, buildSha: SHA, runnerSha: SHA, scenario: { id: scenarioId, config: { jobs: 1, concurrency: 1, languages: ["python"] } }, startedAt: "2026-01-01T00:00:00.000Z", durationMs: 1, gates: correctnessPass(), ...over });

// ── RF1 — qualification layer ───────────────────────────────────────────────────────────────────────────────────────────
test("Q1 CERT-J with one P1 sample > 40 000 ms: correctness PASS, qualification FAIL (Q-P1), top-level verdict FAIL", async () => {
  // a clock that makes every measured duration ≥ 41 s without waiting
  let t = Date.now(); const now = () => (t += 41000);
  const rep = okReport(await run("CERT-J", {}, { now }), "CERT-J slow");
  assert.equal(rep.correctness.verdict, "PASS", JSON.stringify(rep.correctness));
  assert.equal(rep.performance.p1.pass, false);
  assert.equal(rep.qualification.verdict, "FAIL");
  assert.ok(rep.qualification.failed.includes("Q-P1"), JSON.stringify(rep.qualification));
  assert.equal(rep.verdict, "FAIL");
  const md = L.toMarkdown(rep);
  assert.match(md, /Qualification/); assert.match(md, /Q-P1/); assert.match(md, /Verdict: FAIL/);
  // the same through the builder with a correctness-PASS gate set
  const built = L.buildReport(reportInput("CERT-J", { p1: { pass: false, violations: [{ language: "java", ms: 40001, ceilingMs: 40000 }], missing: [], ceilingMs: 40000 } }));
  assert.deepEqual([built.correctness.verdict, built.qualification.verdict, built.verdict], ["PASS", "FAIL", "FAIL"]);
});
test("Q2 CERT-J missing one language is never a top-level PASS", () => {
  const q = L.evaluateQualification({ scenarioId: "CERT-J", target: "local", correctness: correctnessPass(), p1: { pass: false, violations: [], missing: ["csharp"], ceilingMs: 40000 } });
  assert.notEqual(q.verdict, "PASS"); assert.ok(q.failed.includes("Q-P1"));
  const built = L.buildReport(reportInput("CERT-J", { p1: { pass: false, violations: [], missing: ["csharp"], ceilingMs: 40000 } }));
  assert.notEqual(built.verdict, "PASS");
});
test("Q3 CERT-F callback transport failure (network) → qualification FAIL, verdict FAIL", async () => {
  const localFetch = (url, init) => (String(url).includes(CALLBACK_PATH) ? Promise.reject(new TypeError("fetch failed")) : globalThis.fetch(url, init));
  const r = await run("CERT-F", { jobs: 4, concurrency: 2 }, { localFetch });
  const rep = okReport(r, "CERT-F net");
  assert.equal(rep.callbacks[0].transportOk, false);
  assert.ok(rep.qualification.failed.includes("Q-CALLBACK-TRANSPORT"), JSON.stringify(rep.qualification));
  assert.equal(rep.verdict, "FAIL");
});
test("Q4 CERT-F wrong callback answer (receiver answers UNKNOWN_JOB where applied is the contract) → qualification FAIL", async () => {
  const r = await run("CERT-F", { jobs: 4, concurrency: 2 }, { onStack: stack => stack.receiver.setMode("unknown") });
  const rep = okReport(r, "CERT-F unknown");
  assert.deepEqual(rep.callbacks[0].answers, { unknown: 4 });
  assert.equal(rep.callbacks[0].transportOk, false);
  assert.ok(rep.qualification.failed.includes("Q-CALLBACK-TRANSPORT"));
  assert.equal(rep.verdict, "FAIL");
});
test("Q5 CERT-F expects idempotency but the re-delivery is applied again → qualification FAIL (Q-IDEMPOTENCY)", async () => {
  const r = await run("CERT-F", { jobs: 3, concurrency: 1 }, { onStack: stack => stack.receiver.setMode("fault-reapply") });
  const rep = okReport(r, "CERT-F reapply");
  assert.equal(rep.callbacks[0].idempotency.redeliveryAnswer, "applied");
  assert.equal(rep.callbacks[0].idempotency.pass, false);
  assert.ok(rep.qualification.failed.includes("Q-IDEMPOTENCY"), JSON.stringify(rep.qualification));
  assert.equal(rep.verdict, "FAIL");
});
test("Q6 CERT-G recovery.pass = false → qualification FAIL (Q-RECOVERY)", () => {
  const rec = { accepted: 3, settled: true, complete: 2, retryable: 0, lost: 1, duplicateApplications: 0, executionsPerJobMax: 1, reExecutedJobs: 0, resubmissionNeeded: false, pass: false };
  const q = L.evaluateQualification({ scenarioId: "CERT-G", target: "local", correctness: correctnessPass(), recovery: rec });
  assert.equal(q.verdict, "FAIL"); assert.ok(q.failed.includes("Q-RECOVERY"));
  const built = L.buildReport(reportInput("CERT-G", { recovery: rec }));
  assert.equal(built.verdict, "FAIL"); assert.equal(built.correctness.verdict, "PASS");
});
test("Q7 CERT-E on the current Runner (B10-F1): correctness PASS, qualification FAIL on Q-ADMISSION, verdict FAIL, finding recorded", async () => {
  const rep = okReport(await run("CERT-E"), "CERT-E");
  const off = rep.saturation.steps[1].official;
  assert.ok(off.overAdmission > 0, "the current Runner over-admits concurrent official submissions (B10-F1): " + JSON.stringify(off));
  assert.equal(rep.correctness.verdict, "PASS", JSON.stringify(rep.correctness.failed));
  assert.equal(rep.qualification.verdict, "FAIL");
  assert.deepEqual(rep.qualification.failed, ["Q-ADMISSION"]);
  assert.equal(rep.verdict, "FAIL");
  const check = rep.qualification.checks.find(c => c.id === "Q-ADMISSION");
  assert.match(check.detail, /B10-F1|over-admi/i);
  assert.match(L.toMarkdown(rep), /Q-ADMISSION[^\n]*FAIL/);
});
test("Q8 CERT-E with no over-admission (sequential official arrivals) → Q-ADMISSION passes, qualification PASS", async () => {
  const q = L.evaluateQualification({ scenarioId: "CERT-E", target: "local", correctness: correctnessPass(), saturation: { steps: [{ offeredConcurrency: 8, officialMaxPending: 3, practice: { offered: 16, busy: 14, completed: 2 }, official: { offered: 0, accepted: 0, busy: 0, overAdmission: 0 } }, { offeredConcurrency: 8, officialMaxPending: 3, practice: { offered: 0, busy: 0, completed: 0 }, official: { offered: 8, accepted: 3, busy: 5, overAdmission: 0 } }] } });
  assert.equal(q.verdict, "PASS"); assert.equal(q.checks.find(c => c.id === "Q-ADMISSION").pass, true);
  const rep = okReport(await run("CERT-E", { concurrency: 1, jobs: 4, officialJobs: 6 }), "CERT-E sequential");
  assert.equal(rep.saturation.steps[1].official.overAdmission, 0);
  assert.ok(rep.saturation.steps[1].official.busy >= 1, "sequential arrivals are refused past maxPending");
  assert.equal(rep.qualification.verdict, "PASS"); assert.equal(rep.verdict, "PASS");
});
test("Q9 CERT-L with every applicable requirement satisfied → qualification PASS, verdict PASS, both layers visible", async () => {
  const rep = okReport(await run("CERT-L", { jobs: 8, officialJobs: 4, casesPerJob: 2, concurrency: 2, students: 4 }), "CERT-L");
  assert.equal(rep.correctness.verdict, "PASS"); assert.equal(rep.qualification.verdict, "PASS"); assert.equal(rep.verdict, "PASS");
  assert.ok(rep.qualification.checks.some(c => c.id === "Q-CORRECTNESS" && c.pass === true));
  assert.deepEqual(rep.qualification.failed, []); assert.deepEqual(rep.qualification.notEvaluated, []);
  const md = L.toMarkdown(rep);
  assert.match(md, /## Correctness gates/); assert.match(md, /## Qualification/);
});
test("Q10 a required scenario check that was not measured → INCOMPLETE, never PASS", () => {
  for (const [id, evidence] of [["CERT-J", {}], ["CERT-G", {}], ["CERT-F", {}], ["CERT-E", {}], ["CERT-E", { saturation: { steps: [{ official: { offered: 3, accepted: 3, busy: 0, overAdmission: null } }] } }]]) {
    const q = L.evaluateQualification({ scenarioId: id, target: "local", correctness: correctnessPass(), ...evidence });
    assert.equal(q.verdict, "INCOMPLETE", id + " " + JSON.stringify(q));
    assert.ok(q.notEvaluated.length >= 1);
    assert.notEqual(L.buildReport(reportInput(id, evidence)).verdict, "PASS", id);
  }
  // required checks are recorded per scenario and target (production CERT-F never requires idempotency: nothing is applied there)
  assert.deepEqual(L.requiredChecksFor("CERT-F", "local").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS", "Q-IDEMPOTENCY"]);
  assert.deepEqual(L.requiredChecksFor("CERT-F", "production").sort(), ["Q-CALLBACK-TRANSPORT", "Q-CORRECTNESS"]);
  assert.deepEqual(L.requiredChecksFor("CERT-A", "local"), ["Q-CORRECTNESS"]);
  // a report whose stated verdict contradicts the qualification is refused
  assert.throws(() => L.buildReport(reportInput("CERT-J", { verdict: "PASS", p1: { pass: false, violations: [{ language: "java", ms: 40001, ceilingMs: 40000 }], missing: [], ceilingMs: 40000 } })), /verdict/);
});

// ── RF2 — idempotency snapshot order ────────────────────────────────────────────────────────────────────────────────────
test("I1 ordinary duplicate: snapshot BEFORE re-delivery equals snapshot AFTER (state, score, applications), alreadyApplied, pass", async () => {
  const rep = okReport(await run("CERT-F", { jobs: 3, concurrency: 1 }), "CERT-F");
  const i = rep.callbacks[0].idempotency;
  assert.equal(i.redeliveryAnswer, "alreadyApplied");
  assert.deepEqual(i.before, { state: "complete", score: 1, applications: 1 });
  assert.deepEqual(i.after, { state: "complete", score: 1, applications: 1 });
  assert.deepEqual([i.stateUnchanged, i.scoreUnchanged, i.applicationsUnchanged, i.pass], [true, true, true, true]);
  assert.equal(JSON.stringify(rep).includes("stdout"), false);
});
test("I2 a receiver that mutates the score during the duplicate delivery → idempotency FAILS (and G2 catches the drift)", async () => {
  const rep = okReport(await run("CERT-F", { jobs: 3, concurrency: 1 }, { onStack: s => s.receiver.setMode("fault-mutate") }), "CERT-F mutate");
  const i = rep.callbacks[0].idempotency;
  assert.equal(i.redeliveryAnswer, "alreadyApplied");
  assert.equal(i.before.score, 1); assert.notEqual(i.after.score, 1);
  assert.deepEqual([i.scoreUnchanged, i.pass], [false, false]);
  assert.ok(rep.qualification.failed.includes("Q-IDEMPOTENCY"));
  assert.equal(rep.official.idempotencyViolations.length, 1);
  assert.equal(rep.verdict, "FAIL");
});
test("I3 a duplicate answered `applied` instead of `alreadyApplied` → idempotency FAILS, application count rose", async () => {
  const rep = okReport(await run("CERT-F", { jobs: 3, concurrency: 1 }, { onStack: s => s.receiver.setMode("fault-reapply") }), "CERT-F reapply");
  const i = rep.callbacks[0].idempotency;
  assert.equal(i.redeliveryAnswer, "applied"); assert.equal(i.before.applications, 1); assert.equal(i.after.applications, 2);
  assert.deepEqual([i.applicationsUnchanged, i.pass], [false, false]);
  assert.equal(rep.official.duplicateApplications, 1);
});
test("I4 the first-application score is captured BEFORE the duplicate is sent (a mutating receiver cannot make before == after)", async () => {
  const stack = L.createLocalStack({ maxConcurrency: 2 });
  await stack.start();
  try {
    stack.receiver.setMode("fault-mutate");
    const ledger = L.createOfficialLedger();
    const out = await L.callbackBurst({ step: { kind: "callback-burst", count: 1, concurrency: 1, idempotency: true }, callbackTarget: { baseUrl: stack.callbackUrl, key: stack.callbackKey, synthetic: "applied" }, fetchImpl: globalThis.fetch, governor: null, now: Date.now, receiver: stack.receiver, ledger });
    assert.equal(out.idempotency.before.score, 1, "captured before the re-delivery");
    assert.equal(out.idempotency.after.score, 1001, "the fault changed the score during the re-delivery");
    assert.equal(out.idempotency.pass, false);
  } finally { await stack.close(); }
});
test("I5 the ledger records the FIRST application with the actual first score, the re-delivery with the post-re-delivery score", async () => {
  const stack = L.createLocalStack({ maxConcurrency: 2 });
  await stack.start();
  try {
    stack.receiver.setMode("fault-mutate");
    const ledger = L.createOfficialLedger();
    await L.callbackBurst({ step: { kind: "callback-burst", count: 1, concurrency: 1, idempotency: true }, callbackTarget: { baseUrl: stack.callbackUrl, key: stack.callbackKey, synthetic: "applied" }, fetchImpl: globalThis.fetch, governor: null, now: Date.now, receiver: stack.receiver, ledger });
    const [id] = ledger.jobIds();
    const acks = ledger.acksOf(id);
    assert.equal(acks.length, 2);
    assert.deepEqual([acks[0].answer, acks[0].score], ["applied", 1]);
    assert.deepEqual([acks[1].answer, acks[1].score], ["alreadyApplied", 1001]);
    assert.deepEqual(ledger.reconcile().idempotencyViolations, [id]);
  } finally { await stack.close(); }
});

// ── RF3 — bounded receiver ──────────────────────────────────────────────────────────────────────────────────────────────
const KEY = "test-only-load-receiver-key-0123456789abcdef0123";
async function receiver() { const r = L.createReceiver({ key: KEY }); const port = await r.listen(); return { r, port, url: "http://127.0.0.1:" + port }; }
/** A raw request: `declaredLength` sets Content-Length (else chunked); `bytes` are streamed in chunks; resolves { status | error }. */
function rawPost({ port, path = CALLBACK_PATH, method = "POST", declaredLength, bytes, chunk = 64 * 1024, headers = {} }) {
  return new Promise(resolve => {
    const h = { "content-type": "application/json", ...headers };
    if (declaredLength !== undefined) h["content-length"] = String(declaredLength);
    const req = http.request({ host: "127.0.0.1", port, method, path, headers: h }, res => { const p = []; res.on("data", d => p.push(d)); res.on("end", () => resolve({ status: res.statusCode, text: Buffer.concat(p).toString("utf8") })); });
    req.on("error", e => resolve({ error: e.code || e.message }));
    req.setTimeout(8000, () => { req.destroy(new Error("client timeout")); });                 // an unbounded receiver would otherwise wait forever
    let sent = 0;
    const pump = () => { while (sent < bytes) { const n = Math.min(chunk, bytes - sent); sent += n; if (!req.write(Buffer.alloc(n, 0x78))) { req.once("drain", pump); return; } } req.end(); };
    pump();
  });
}
const signed = body => { const buf = Buffer.from(L.syntheticCallbackBodyText ? L.syntheticCallbackBodyText(body) : JSON.stringify(body), "utf8"); return { buf, headers: signCallbackRequest({ key: KEY, timestamp: Math.floor(Date.now() / 1000), requestId: "r" + crypto.randomBytes(8).toString("hex"), body: buf }) }; };
async function sendSigned(url, body) { const { buf, headers } = signed(body); const res = await fetch(url + CALLBACK_PATH, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: buf }); return { status: res.status, json: await res.json().catch(() => null), bytes: buf.length }; }
/** A legitimate callback body padded to EXACTLY `total` bytes (stderr padding). */
function bodyOfExactly(total) {
  const base = { jobId: "cg_rf3exact" + crypto.randomBytes(8).toString("hex"), outcome: "completed", cases: [{ token: "c01", status: "success", stdout: "42\n", stderr: "", exitCode: 0, durationMs: 1 }] };
  const pad = total - Buffer.byteLength(JSON.stringify(base), "utf8");
  base.cases[0].stderr = "y".repeat(pad);
  assert.equal(Buffer.byteLength(JSON.stringify(base), "utf8"), total);
  return base;
}

test("R1 a small signed callback is accepted (applied once; the duplicate answers alreadyApplied)", async () => {
  const { r, url } = await receiver();
  try {
    const body = L.syntheticCallbackBody();
    assert.deepEqual((await sendSigned(url, body)).json, { ok: true, applied: true, state: "complete" });
    assert.deepEqual((await sendSigned(url, body)).json, { ok: true, alreadyApplied: true });
    assert.equal(r.stats().oversizeRejected, 0);
  } finally { await r.close(); }
});
test("R2 the near-max P2 callback (≈ 6.45 MB, below 8 MiB) is still accepted and HMAC-verified over the exact bytes", async () => {
  const { r, url } = await receiver();
  try {
    const res = await sendSigned(url, L.syntheticCallbackBody({ nearMax: true }));
    assert.ok(res.bytes > 6 * 1024 * 1024 && res.bytes < CALLBACK_MAX_BYTES);
    assert.equal(res.status, 200); assert.equal(res.json.applied, true);
    assert.ok(r.stats().peakBufferedBytes <= CALLBACK_MAX_BYTES);
  } finally { await r.close(); }
});
test("R3 Content-Length above 8 MiB is refused immediately — nothing of the body is buffered", async () => {
  const { r, port } = await receiver();
  try {
    const res = await rawPost({ port, declaredLength: CALLBACK_MAX_BYTES + 1, bytes: 256 * 1024 });
    assert.ok(res.status === 413 || res.error, JSON.stringify(res));
    assert.equal(r.stats().oversizeRejected, 1);
    assert.equal(r.stats().peakBufferedBytes, 0, "no chunk retained for a request refused on Content-Length");
  } finally { await r.close(); }
});
test("R4 a chunked request exceeding 8 MiB is refused while streaming — retained bytes never exceed the bound", async () => {
  const { r, port } = await receiver();
  try {
    const res = await rawPost({ port, bytes: CALLBACK_MAX_BYTES + 512 * 1024 });
    assert.ok(res.status === 413 || res.error, JSON.stringify(res));
    assert.equal(r.stats().oversizeRejected, 1);
    assert.ok(r.stats().peakBufferedBytes <= CALLBACK_MAX_BYTES, "peak " + r.stats().peakBufferedBytes);
  } finally { await r.close(); }
});
test("R5 the exact boundary: exactly 8 MiB signed is accepted; one byte more is refused", async () => {
  const { r, url, port } = await receiver();
  try {
    const exact = await sendSigned(url, bodyOfExactly(CALLBACK_MAX_BYTES));
    assert.equal(exact.bytes, CALLBACK_MAX_BYTES); assert.equal(exact.status, 200); assert.equal(exact.json.applied, true);
    const over = await rawPost({ port, bytes: CALLBACK_MAX_BYTES + 1 });
    assert.ok(over.status === 413 || over.error, JSON.stringify(over));
    assert.ok(r.stats().peakBufferedBytes <= CALLBACK_MAX_BYTES);
  } finally { await r.close(); }
});
test("R6 wrong method / path is rejected BEFORE any body accumulation", async () => {
  const { r, port } = await receiver();
  try {
    assert.equal((await rawPost({ port, method: "GET", bytes: 0 })).status, 404);
    assert.equal((await rawPost({ port, path: "/api/other", bytes: 1024 * 1024 })).status, 404);
    assert.equal((await rawPost({ port, method: "PUT", bytes: 1024 * 1024 })).status, 404);
    assert.equal(r.stats().peakBufferedBytes, 0);
  } finally { await r.close(); }
});
test("R7 an oversize UNSIGNED request cannot force unbounded memory growth (20 MiB chunked → bounded refusal)", async () => {
  const { r, port } = await receiver();
  try {
    const res = await rawPost({ port, bytes: 20 * 1024 * 1024, chunk: 256 * 1024 });
    assert.ok(res.status === 413 || res.error, JSON.stringify(res));
    assert.ok(r.stats().peakBufferedBytes <= CALLBACK_MAX_BYTES);
    assert.equal(r.stats().oversizeRejected, 1);
    assert.equal(r.calls.length, 0, "nothing reached verification");
  } finally { await r.close(); }
});
test("R8 the receiver remains usable after an oversize request", async () => {
  const { r, url, port } = await receiver();
  try {
    await rawPost({ port, declaredLength: CALLBACK_MAX_BYTES + 1, bytes: 64 * 1024 });
    await rawPost({ port, bytes: CALLBACK_MAX_BYTES + 1 });
    const ok = await sendSigned(url, L.syntheticCallbackBody());
    assert.equal(ok.status, 200); assert.equal(ok.json.applied, true);
    assert.equal(r.stats().oversizeRejected, 2);
  } finally { await r.close(); }
});
