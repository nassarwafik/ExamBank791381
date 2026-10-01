import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17D-B2 — DURABLE API-SIDE DELIVERY of official coding grading jobs. The committed attempt stays the ONLY grading
// authority (attempt.codingGrading.targets); the job record platform/coding-grading-jobs/<jobId>.json (server-only,
// identifiers + state) gains a bounded DELIVERY LEASE so that only one dispatcher (post-commit hook, teacher retry, bulk retry,
// recovery sweep — on any Functions instance) sends a given job at a time; the lease expires, so a crashed dispatcher never
// strands a job. Delivery is at-least-once; the runner journal and the API callback authority make it idempotent.
// Fail-first on a6e26ac: the job record has no delivery state, concurrent dispatchers both send, a held lease is ignored, the
// runner request carries no revision / opaque target reference.
const require_ = createRequire(import.meta.url);
const X = require_("./fixtures/coding-17d-a.js");
const { F, MIN } = X;
const official = () => require_("../src/lib/coding/official-grading.js");
const grading = () => require_("../src/functions/coding-grading.js");

const JOBS = "platform/coding-grading-jobs/";
const IDS = { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 };
const seedNoDoc = () => F.seed({ a: F.assignment({}, { short: false }), doc: null });
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
const jobDoc = (ctx, jobId) => ctx.getJson(JOBS + jobId + ".json");
const recorder = () => { const logs = []; return { logs, obs: { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) } }; };
const dispatch = (ctx, deps, opts = {}) => official().ensureCodingGradingJobs(ctx.container, IDS, { env: X.ENV, ...deps }, { targets: ["auto1"], states: ["pending", "retryable", "dispatched"], ...opts });
/** A runner double whose answer can be held open (to observe the lease while a delivery is in flight). */
function gatedRunner() {
  let release;
  const gate = new Promise(r => { release = r; });
  const fetch = F.runnerFetch(async () => { await gate; return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; });
  return { fetch, release: () => release() };
}

describe("DD — durable API delivery (lease / CAS on the job record)", () => {
  it("DD1 a dispatch durably CLAIMS the delivery before sending (state delivering, owner, bounded expiry) and releases it with the outcome", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const g = gatedRunner();
    const p = dispatch(ctx, { fetch: g.fetch, now });
    for (let i = 0; i < 50 && g.fetch.calls.length === 0; i++) await new Promise(r => setTimeout(r, 2));
    expect(g.fetch.calls).toHaveLength(1);
    const during = jobDoc(ctx, t.jobId).delivery;                                          // observed WHILE the runner request is open
    expect(during.state).toBe("delivering");
    expect(typeof during.leaseOwner).toBe("string");
    expect(during.leaseOwner.length).toBeGreaterThanOrEqual(8);
    const ttl = Date.parse(during.leaseExpiresAt) - now();
    expect(ttl).toBeGreaterThan(1000);
    expect(ttl).toBeLessThanOrEqual(2 * MIN);
    expect(during.attempt).toBe(1);
    g.release();
    const [r] = await p;
    expect(r.state).toBe("dispatched");
    const after = jobDoc(ctx, t.jobId).delivery;
    expect(after).toMatchObject({ state: "received", attempt: 1, leaseOwner: null, leaseExpiresAt: null, lastDeliveryCode: "ACCEPTED" });
    expect(Number.isFinite(Date.parse(after.lastDeliveryAt))).toBe(true);
    expect(X.target(ctx).state).toBe("dispatched");
  });

  it("DD2 concurrent dispatchers of the same job (post-commit hook, teacher retry, bulk retry, sweep — any instance) → exactly ONE runner request", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const g = gatedRunner(), { logs, obs } = recorder();
    const all = Promise.all(Array.from({ length: 4 }, () => dispatch(ctx, { fetch: g.fetch, now }, { obs })));
    for (let i = 0; i < 50; i++) await new Promise(r => setTimeout(r, 2));
    g.release();
    const results = (await all).flat();
    expect(g.fetch.jobs()).toHaveLength(1);
    expect(g.fetch.jobs()[0].jobId).toBe(t.jobId);
    expect(jobDoc(ctx, t.jobId).delivery.attempt).toBe(1);
    expect(results.filter(r => r.deliverySkipped === "leased")).toHaveLength(3);
    expect(logs.filter(l => l[0] === "coding.runner.delivery.claimed")).toHaveLength(1);
    expect(logs.filter(l => l[0] === "coding.runner.delivery.duplicate")).toHaveLength(3);
    expect(X.target(ctx).state).toBe("dispatched");
  });

  it("DD3 a lease left by a crashed dispatcher blocks delivery only until it expires; then delivery recovers; a far-future lease is not honoured", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch();
    // a dispatcher claimed the job and died before sending (its lease is still valid for 20 s)
    ctx.setJson(JOBS + t.jobId + ".json", { schemaVersion: 1, jobId: t.jobId, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, targetKey: "auto1", revision: 1, gradingKey: t.gradingKey, state: "pending", dispatchCount: 1, createdAt: new Date(now()).toISOString(), delivery: { state: "delivering", attempt: 1, leaseOwner: "dl_crashed_owner_000001", leaseExpiresAt: new Date(now() + 20000).toISOString() } });
    const [blocked] = await dispatch(ctx, { fetch, now });
    expect(blocked.deliverySkipped).toBe("leased");
    expect(fetch.jobs()).toHaveLength(0);
    now.advance(21000);                                                                      // the lease expired
    const [r] = await dispatch(ctx, { fetch, now });
    expect(r.state).toBe("dispatched");
    expect(fetch.jobs()).toHaveLength(1);
    expect(jobDoc(ctx, t.jobId).delivery).toMatchObject({ state: "received", attempt: 2, leaseOwner: null, leaseExpiresAt: null });
    // a lease claiming to be valid for hours (clock skew / corruption) is bounded: it never strands the job
    const doc = jobDoc(ctx, t.jobId);
    doc.delivery = { ...doc.delivery, state: "delivering", leaseOwner: "dl_far_future_0000001", leaseExpiresAt: new Date(now() + 6 * 60 * MIN).toISOString() };
    ctx.setJson(JOBS + t.jobId + ".json", doc);
    const [r2] = await dispatch(ctx, { fetch, now });
    expect(r2.deliverySkipped).toBeUndefined();
    expect(fetch.jobs()).toHaveLength(2);
    expect(jobDoc(ctx, t.jobId).delivery).toMatchObject({ attempt: 3, leaseOwner: null });
  });

  it("DD4 the same job / revision is idempotent: every delivery sends the same job id and identical bytes; one job record; attempts are counted", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch(async () => ({ status: 202, json: { ok: true, accepted: true, duplicate: fetch.calls.length > 1 } }));
    await dispatch(ctx, { fetch, now });
    now.advance(MIN);
    const [r] = await dispatch(ctx, { fetch, now });
    expect(r.state).toBe("dispatched");
    const jobs = fetch.jobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual(jobs[1]);
    expect(jobs[0].jobId).toBe(t.jobId);
    expect(ctx.names(JOBS)).toEqual([JOBS + t.jobId + ".json"]);
    const d = jobDoc(ctx, t.jobId);
    expect(d.delivery).toMatchObject({ attempt: 2, lastDeliveryCode: "DUPLICATE", state: "received" });
    expect(d.dispatchCount).toBe(2);
  });

  it("DD5 an older revision is never delivered after a force regrade, and its late result is refused", async () => {
    const ctx = seedNoDoc(), t1 = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch();
    await dispatch(ctx, { fetch, now });
    const rev1Job = fetch.jobs()[0];
    const fr = await official().regradeTarget(ctx.container, { ...IDS, questionId: "auto1", action: "force", actor: F.CANARY.teacherId }, { env: X.ENV, fetch, now });
    expect(fr).toMatchObject({ status: 200, revision: 2 });
    const t2 = X.target(ctx);
    expect(t2.jobId).not.toBe(t1.jobId);
    // a recovery decided on an older read (bound to revision 1) delivers nothing
    const before = fetch.jobs().length;
    const out = await dispatch(ctx, { fetch, now }, { expect: { revision: 1, jobId: t1.jobId } });
    expect(out).toEqual([]);
    expect(fetch.jobs()).toHaveLength(before);
    expect(jobDoc(ctx, t1.jobId).state).toBe("superseded");
    // the runner learns the ordering from the SIGNED request: same opaque target reference, higher revision
    const rev2Job = fetch.jobs()[before - 1];
    expect(rev1Job.revision).toBe(1);
    expect(rev2Job.revision).toBe(2);
    expect(rev2Job.targetRef).toBe(rev1Job.targetRef);
    expect(rev2Job.jobId).toBe(t2.jobId);
    // a late revision-1 result never becomes official
    const late = await official().applyOfficialCallback(ctx.container, F.callbackBody(rev1Job, F.CANARY.expected), {}, null);
    expect(late).toMatchObject({ status: 409, body: { code: "STALE_RESULT" } });
    expect(X.target(ctx)).toMatchObject({ revision: 2, jobId: t2.jobId });
    expect(X.target(ctx).state).not.toBe("complete");
  });

  it("DD6 a newer revision has its own isolated delivery lifecycle (an old revision's stuck lease never blocks it)", async () => {
    const ctx = seedNoDoc(), t1 = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch();
    await dispatch(ctx, { fetch, now });
    const d1 = jobDoc(ctx, t1.jobId);
    d1.delivery = { ...d1.delivery, state: "delivering", leaseOwner: "dl_stuck_rev1_00000001", leaseExpiresAt: new Date(now() + 60000).toISOString() };
    ctx.setJson(JOBS + t1.jobId + ".json", d1);
    await official().regradeTarget(ctx.container, { ...IDS, questionId: "auto1", action: "force", actor: F.CANARY.teacherId }, { env: X.ENV, fetch, now });
    const t2 = X.target(ctx);
    expect(t2.state).toBe("dispatched");
    expect(fetch.jobs().at(-1).jobId).toBe(t2.jobId);
    expect(jobDoc(ctx, t2.jobId).delivery).toMatchObject({ state: "received", attempt: 1, leaseOwner: null });
    expect(jobDoc(ctx, t1.jobId).delivery.leaseOwner).toBe("dl_stuck_rev1_00000001");   // untouched
    expect(jobDoc(ctx, t1.jobId).state).toBe("superseded");
    expect(jobDoc(ctx, t2.jobId).revision).toBe(2);
  });

  it("DD7 no source, hidden test, expected output, key or signature in the job record, the delivery state or the attempt; the runner gets only an opaque target reference", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch(), { logs, obs } = recorder();
    await dispatch(ctx, { fetch, now }, { obs });
    const recordText = JSON.stringify(jobDoc(ctx, t.jobId));
    const attemptText = JSON.stringify(X.target(ctx));
    const forbidden = [X.SOURCE.trim(), "SUM=", "1 2\n", "-1 -2", F.CANARY.reference, F.CANARY.teacherNote, F.CANARY.title, F.ENV.CODING_RUNNER_HMAC_KEY, F.ENV.CODING_GRADING_CALLBACK_HMAC_KEY, "v1=", F.CANARY.studentName];
    for (const s of forbidden) { expect(recordText).not.toContain(s); expect(JSON.stringify(logs)).not.toContain(s); }
    expect(jobDoc(ctx, t.jobId).delivery).toBeTruthy();
    expect(attemptText).not.toMatch(/leaseOwner|leaseExpiresAt|deliveryAttempt|"delivery"/);
    for (const e of ["CANARY", ...F.CANARY.expected]) expect(fetch.calls[0].body).not.toContain(e);
    const job = fetch.jobs()[0];
    expect(Object.keys(job).sort()).toEqual(["cases", "jobId", "language", "languageVersion", "limits", "revision", "source", "targetRef"]);
    expect(job.targetRef).toMatch(/^tr_[0-9a-f]{40}$/);
    for (const id of [F.AID, F.S1, "auto1"]) expect(job.targetRef).not.toContain(id);
    expect(Object.keys(jobDoc(ctx, t.jobId).delivery).sort()).toEqual(expect.arrayContaining(["attempt", "leaseExpiresAt", "leaseOwner", "state"]));
  });

  it("CR1 the runner never accepts (down / refuses): the target stays recoverable, the lease is released, a later delivery succeeds", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const [down] = await dispatch(ctx, { fetch: F.runnerFetch("throw"), now });
    expect(down.state).toBe("retryable");
    expect(X.target(ctx)).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_FAILED" });
    expect(jobDoc(ctx, t.jobId).delivery).toMatchObject({ state: "failed", attempt: 1, leaseOwner: null, leaseExpiresAt: null, lastDeliveryErrorClass: "network" });
    const busy = F.runnerFetch(async () => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));
    now.advance(MIN);
    await dispatch(ctx, { fetch: busy, now });
    expect(jobDoc(ctx, t.jobId).delivery).toMatchObject({ state: "failed", attempt: 2, leaseOwner: null, lastDeliveryCode: "RUNNER_BUSY", lastDeliveryErrorClass: "busy" });
    now.advance(MIN);
    const ok = F.runnerFetch();
    const [r] = await dispatch(ctx, { fetch: ok, now });
    expect(r.state).toBe("dispatched");
    expect(ok.jobs()).toHaveLength(1);
    expect(jobDoc(ctx, t.jobId).delivery).toMatchObject({ state: "received", attempt: 3, leaseOwner: null });
  });
});

describe("CB4 — repeated callback is idempotent (runner retries after restart / lost response)", () => {
  it("CB4 the same result re-sent with fresh request ids applies ONCE; after a force regrade the old revision's result is refused", async () => {
    const ctx = seedNoDoc(), t = X.commitAttempt(ctx), now = clock();
    const fetch = F.runnerFetch();
    await dispatch(ctx, { fetch, now });
    const job = fetch.jobs()[0], body = F.callbackBody(job, F.CANARY.expected);
    const { logs, obs } = recorder();
    const send = () => grading().callbackHandler(F.callbackRequest(body), { env: X.ENV, getContainer: () => ctx.container }, obs);
    const first = await send();
    expect(first.status).toBe(200);
    expect(first.jsonBody).toMatchObject({ ok: true, applied: true, state: "complete" });
    const applied = JSON.parse(JSON.stringify(X.target(ctx).result));
    const grade = JSON.parse(JSON.stringify(X.grade(ctx)));
    for (let i = 0; i < 3; i++) {
      const again = await send();
      expect(again.status).toBe(200);
      expect(again.jsonBody).toEqual({ ok: true, alreadyApplied: true });
    }
    expect(X.target(ctx).result).toEqual(applied);
    expect(X.grade(ctx)).toEqual(grade);
    expect(logs.filter(l => l[0] === "coding.autoGrade.callback.applied")).toHaveLength(1);
    expect(logs.filter(l => l[0] === "coding.autoGrade.callback.duplicate")).toHaveLength(3);
    // a newer revision: the previous revision's (re-sent) result can never override it
    await official().regradeTarget(ctx.container, { ...IDS, questionId: "auto1", action: "force", actor: F.CANARY.teacherId }, { env: X.ENV, fetch, now });
    const stale = await send();
    expect(stale.status).toBe(409);
    expect(stale.jsonBody).toMatchObject({ code: "STALE_RESULT" });
    expect(X.target(ctx)).toMatchObject({ revision: 2 });
    expect(X.target(ctx).state).not.toBe("complete");
    expect(t.jobId).toBe(job.jobId);
  });
});
