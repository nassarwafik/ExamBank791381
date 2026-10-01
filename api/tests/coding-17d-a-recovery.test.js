import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17D-A — the scheduler-agnostic coding grading RECOVERY ENGINE, driven against the in-memory blob container with the REAL
// Phase 17C planner / dispatcher / callback applier and a recording double of the runner (executes NOTHING). The authority is
// the committed attempt (platform/submissions/… → attempt.codingGrading.targets), never the job store. Invariants:
//   • recovery re-dispatches the SAME revision with the SAME deterministic job id / grading key — it never force-regrades;
//   • eligibility is a pure function of the stored target and the clock (pending grace, stale dispatched, retryable backoff,
//     bounded automatic attempts); complete / superseded / no-answer targets are never touched;
//   • a technical failure is never a zero; exhaustion keeps the target retryable (no zero, no deletion);
//   • races: a callback during the sweep wins, a force regrade invalidates an old recovery, a manual override always wins;
//   • dispatch uses the key-separation resolver (equal runner / callback keys → nothing is sent).
// Fail-first on e9a3ddb: lib/coding/grading-recovery.js does not exist, dispatch still reads the callback key without separation.
const require_ = createRequire(import.meta.url);
const X = require_("./fixtures/coding-17d-a.js");
const { F, MIN } = X;
const official = () => require_("../src/lib/coding/official-grading.js");
const R = () => require_("../src/lib/coding/grading-recovery.js");
const grading = () => require_("../src/functions/coding-grading.js");

const JOBS = "platform/coding-grading-jobs/";
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const seedNoDoc = () => F.seed({ a: F.assignment({}, { short: false }), doc: null });
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

async function sweep(ctx, { fetch = F.runnerFetch(), env = X.ENV, now = clock(), limits, logs = [], requestId = "sw_test_" + Math.random().toString(36).slice(2, 10) } = {}) {
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  return R().runCodingGradingRecoverySweep(ctx.container, { requestId, ...(limits ? { limits } : {}), obs }, { env, fetch, now });
}
const callbackFor = (ctx, job, outputs = F.CANARY.expected) => official().applyOfficialCallback(ctx.container, F.callbackBody(job, outputs), {}, null);
const etag = (ctx, name = F.SUB) => ctx.store.get(name).etag;

describe("R1 / R3–R7 — pure recovery policy (deterministic, no I/O)", () => {
  it("R1 retry backoff is a pure deterministic schedule: 5 / 10 / 20 / 40 min, then capped at 60 min", () => {
    const { retryBackoffMs, RECOVERY_POLICY } = R();
    expect([0, 1, 2, 3, 4, 5, 7, 50].map(n => retryBackoffMs(n) / MIN)).toEqual([5, 10, 20, 40, 60, 60, 60, 60]);
    expect(retryBackoffMs(2)).toBe(retryBackoffMs(2));
    for (const bad of [-1, NaN, undefined, "3", 1.5]) expect(retryBackoffMs(bad)).toBe(5 * MIN);
    expect(RECOVERY_POLICY).toMatchObject({ pendingGraceMs: 2 * MIN, staleDispatchedMs: 30 * MIN, maxAutomaticRecoveries: 8 });
    expect(Object.isFrozen(RECOVERY_POLICY)).toBe(true);
  });

  const T = (state, minutesAgo, extra = {}) => ({ mode: "hiddenTests", state, revision: 1, jobId: "cg_" + "a".repeat(40), gradingKey: "k", updatedAt: new Date(Date.now() - minutesAgo * MIN).toISOString(), ...extra });
  it("R3 complete / superseded / unknown / malformed targets are NEVER eligible", () => {
    const { recoveryDecision } = R(), now = Date.now();
    expect(recoveryDecision(T("complete", 600), now)).toMatchObject({ eligible: false, reason: "complete" });
    for (const s of ["superseded", "weird", undefined]) expect(recoveryDecision(T(s, 600), now).eligible).toBe(false);
    for (const bad of [null, undefined, "x", [], { state: "pending" }]) expect(recoveryDecision(bad, now).eligible).toBe(false);
  });
  it("R4 pending: inside the ~2 min grace window → wait (the post-commit dispatch may be in flight); after it → eligible", () => {
    const { recoveryDecision } = R(), now = Date.now();
    expect(recoveryDecision(T("pending", 1), now)).toMatchObject({ eligible: false, reason: "pending-grace" });
    expect(recoveryDecision(T("pending", 3), now)).toMatchObject({ eligible: true, state: "pending" });
  });
  it("R5 dispatched: fresh → wait for the callback; older than ~30 min → stale → eligible (same revision)", () => {
    const { recoveryDecision } = R(), now = Date.now();
    expect(recoveryDecision(T("dispatched", 10), now)).toMatchObject({ eligible: false, reason: "dispatched-fresh" });
    expect(recoveryDecision(T("dispatched", 31), now)).toMatchObject({ eligible: true, state: "dispatched", reason: "stale-dispatched" });
  });
  it("R6 retryable: backoff grows with automatic attempts (and counts from the later of updatedAt / lastAutomaticAttemptAt)", () => {
    const { recoveryDecision } = R(), now = Date.now();
    expect(recoveryDecision(T("retryable", 4), now)).toMatchObject({ eligible: false, reason: "retryable-backoff" });
    expect(recoveryDecision(T("retryable", 6), now)).toMatchObject({ eligible: true, state: "retryable" });
    expect(recoveryDecision(T("retryable", 15, { recovery: { automaticAttempts: 2 } }), now).eligible).toBe(false);      // needs 20
    expect(recoveryDecision(T("retryable", 21, { recovery: { automaticAttempts: 2 } }), now).eligible).toBe(true);
    const lastAuto = new Date(now - 3 * MIN).toISOString();
    expect(recoveryDecision(T("retryable", 100, { recovery: { automaticAttempts: 1, lastAutomaticAttemptAt: lastAuto } }), now).eligible).toBe(false);
  });
  it("R7 after MAX_AUTOMATIC_RECOVERIES (8) a due target is reported exhausted — never dispatched again automatically", () => {
    const { recoveryDecision } = R(), now = Date.now();
    expect(recoveryDecision(T("retryable", 600, { recovery: { automaticAttempts: 8 } }), now)).toMatchObject({ eligible: false, reason: "exhausted" });
    expect(recoveryDecision(T("dispatched", 600, { recovery: { automaticAttempts: 9 } }), now)).toMatchObject({ eligible: false, reason: "exhausted" });
    expect(recoveryDecision(T("retryable", 600, { recovery: { automaticAttempts: 7 } }), now).eligible).toBe(true);
    // not yet due → still just waiting (exhaustion is only decided when another automatic attempt would be due)
    expect(recoveryDecision(T("dispatched", 5, { recovery: { automaticAttempts: 8 } }), now)).toMatchObject({ eligible: false, reason: "dispatched-fresh" });
  });
});

describe("R8–R15 — the engine re-dispatches the SAME revision from the committed attempt and never breaks a 17C invariant", () => {
  it("R8 a pending target (no job blob) is dispatched with the SAME deterministic job id, grading key and revision", async () => {
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    const expectedId = official().officialJobId({ assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, submittedAt: ctx.getJson(F.SUB).attempts[0].submittedAt, targetKey: "auto1", revision: 1 });
    expect(planned.jobId).toBe(expectedId);
    expect(ctx.names(JOBS)).toEqual([]);
    const fetch = F.runnerFetch();
    const r = await sweep(ctx, { fetch });
    expect(r).toMatchObject({ status: "completed", dispatched: 1, eligible: 1 });
    expect(fetch.jobs().map(j => j.jobId)).toEqual([expectedId]);
    const t = X.target(ctx);
    expect(t).toMatchObject({ state: "dispatched", revision: 1, jobId: expectedId, gradingKey: planned.gradingKey, answerHash: planned.answerHash });
    expect(t.recovery).toMatchObject({ automaticAttempts: 1, exhausted: false });
    expect(typeof t.recovery.lastAutomaticAttemptAt).toBe("string");
    expect(ctx.getJson(JOBS + expectedId + ".json")).toMatchObject({ jobId: expectedId, revision: 1, state: "dispatched" });
  });

  it("R9 complete, no-answer, non-coding and legacy attempts are skipped without a single write", async () => {
    const ctx = seedNoDoc();
    X.commitAttempt(ctx, { studentId: F.S1, answers: {} });                                        // no-answer → complete, 0
    expect(X.target(ctx)).toMatchObject({ state: "complete" });
    expect(X.grade(ctx)).toMatchObject({ score: 0 });
    X.commitAttempt(ctx, { studentId: X.sid(2) }); X.age(ctx, { studentId: X.sid(2), state: "complete", minutesAgo: 600 });
    ctx.setJson(X.subName(F.AID, X.sid(3)), { schemaVersion: 1, assignmentId: F.AID, studentId: X.sid(3), attempts: [{ attemptNumber: 1, submittedAt: "2020-01-01T00:00:00.000Z", questionGrades: [], answers: {} }], activeAttempt: null });
    ctx.setJson(X.subName(F.AID, X.sid(4)), { legacy: true });
    ctx.setJson(X.subName(F.AID, X.sid(5)), { schemaVersion: 1, assignmentId: F.AID, studentId: X.sid(5), attempts: [], activeAttempt: { attemptNumber: 1 } });
    const before = ctx.names("platform/").map(n => n + "@" + etag(ctx, n)).join();
    const fetch = F.runnerFetch(), r = await sweep(ctx, { fetch });
    expect(fetch.calls).toHaveLength(0);
    expect(r).toMatchObject({ status: "completed", dispatched: 0, eligible: 0, scanned: 5 });
    const after = ctx.names("platform/").filter(n => !n.startsWith("platform/system/")).map(n => n + "@" + etag(ctx, n)).join();
    expect(after).toBe(before);
    expect(X.grade(ctx)).toMatchObject({ score: 0 });
  });

  it("R10 a runner outage during recovery makes the target retryable with a technical code — never a zero, never final", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    const before = X.grade(ctx);
    const r = await sweep(ctx, { fetch: F.runnerFetch("throw") });
    expect(r).toMatchObject({ dispatched: 0, retryable: 1 });
    expect(X.target(ctx)).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_FAILED", revision: 1 });
    const g = X.grade(ctx), attempt = ctx.getJson(F.SUB).attempts[0];
    expect(g.manualReview).toBe(true);
    expect(g.score).toBe(before.score);
    expect(attempt.finalized).toBe(false);
    for (const code of ["RUNNER_BUSY", "LANGUAGE_UNAVAILABLE", "RUNNER_UNAUTHORIZED"]) {
      const c2 = seedNoDoc(); X.commitAttempt(c2);
      const status = code === "RUNNER_UNAUTHORIZED" ? 401 : code === "LANGUAGE_UNAVAILABLE" ? 422 : 503;
      await sweep(c2, { fetch: F.runnerFetch(() => ({ status, json: { ok: false, code } })) });
      expect(X.target(c2)).toMatchObject({ state: "retryable", technicalCode: code });
      expect(X.grade(c2).manualReview).toBe(true);
      expect(c2.getJson(F.SUB).attempts[0].finalized).toBe(false);
    }
  });

  it("R11 exhaustion keeps the target retryable (exhausted flag, technical code kept) — no zero, no deletion, no more writes", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600, recovery: { automaticAttempts: 8, exhausted: false } });
    const fetch = F.runnerFetch(), logs = [];
    const r = await sweep(ctx, { fetch, logs });
    expect(fetch.calls).toHaveLength(0);
    expect(r).toMatchObject({ dispatched: 0, exhausted: 1 });
    const t = X.target(ctx);
    expect(t).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_FAILED", revision: 1 });
    expect(t.recovery).toMatchObject({ automaticAttempts: 8, exhausted: true });
    expect(X.grade(ctx).manualReview).toBe(true);
    expect(ctx.getJson(F.SUB).attempts[0].finalized).toBe(false);
    const e1 = etag(ctx);
    await sweep(ctx, { fetch });
    expect(etag(ctx)).toBe(e1);                                                                    // already marked: no rewrite
    // a stale dispatched target that is exhausted becomes retryable (still not a zero)
    const c2 = seedNoDoc(); X.commitAttempt(c2);
    X.age(c2, { state: "dispatched", minutesAgo: 600, recovery: { automaticAttempts: 8 } });
    await sweep(c2, { fetch });
    expect(X.target(c2)).toMatchObject({ state: "retryable", technicalCode: "RECOVERY_EXHAUSTED", recovery: { exhausted: true } });
    expect(X.grade(c2).manualReview).toBe(true);
  });

  it("R12 a teacher retry resets exhaustion / backoff but never changes revision, job id or grading key", async () => {
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600, recovery: { automaticAttempts: 8, exhausted: true } });
    const fetch = F.runnerFetch();
    const res = await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", { action: "retry", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: X.ENV, fetch });
    expect(res.status).toBe(200);
    const t = X.target(ctx);
    expect(t).toMatchObject({ state: "dispatched", revision: 1, jobId: planned.jobId, gradingKey: planned.gradingKey });
    expect(t.recovery).toMatchObject({ automaticAttempts: 0, exhausted: false });
    expect(fetch.jobs().map(j => j.jobId)).toEqual([planned.jobId]);
  });

  it("R13 a force regrade invalidates an old recovery: the old revision is never re-dispatched, even mid-sweep", async () => {
    const { ensureCodingGradingJobs } = official();
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600, recovery: { automaticAttempts: 3 } });
    const down = F.runnerFetch("throw");
    const res = await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", { action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: X.ENV, fetch: down });
    expect(res.status).toBe(200);
    const forced = X.target(ctx);
    expect(forced.revision).toBe(2);
    expect(forced.jobId).not.toBe(planned.jobId);
    expect(forced.recovery).toBeUndefined();                                                       // a new revision starts clean
    // an ensure bound to the OLD (revision, job) is refused
    const fetch = F.runnerFetch();
    const out = await ensureCodingGradingJobs(ctx.container, { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 }, { env: X.ENV, fetch }, { targets: ["auto1"], states: ["retryable"], expect: { revision: 1, jobId: planned.jobId } });
    expect(out).toEqual([]);
    expect(fetch.calls).toHaveLength(0);
    // a later sweep only ever sends the NEW revision's job
    const later = clock(Date.now() + 10 * MIN);
    await sweep(ctx, { fetch, now: later });
    expect(fetch.jobs().map(j => j.jobId)).toEqual([forced.jobId]);

    // mid-sweep: a force regrade lands between the sweep's read and its claim → nothing is dispatched
    let fired = false;
    const c2 = F.seed({ a: F.assignment({}, { short: false }), doc: null, hooks: { beforeConditionalUpload: (name, api) => {
      if (fired || name !== F.SUB) return;
      fired = true;
      const doc = api.getJson(F.SUB), t = doc.attempts[0].codingGrading.targets.auto1;
      t.revision = 2; t.jobId = "cg_" + "f".repeat(40); t.state = "pending"; t.updatedAt = new Date().toISOString(); delete t.technicalCode; delete t.recovery;
      api.setJson(F.SUB, doc);
    } } });
    X.commitAttempt(c2); X.age(c2, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600 });
    const f2 = F.runnerFetch();
    const r2 = await sweep(c2, { fetch: f2 });
    expect(fired).toBe(true);
    expect(f2.calls).toHaveLength(0);
    expect(r2.dispatched).toBe(0);
    expect(X.target(c2)).toMatchObject({ revision: 2, state: "pending" });
  });

  it("R14 a callback that lands during the sweep wins: the target never moves backward from complete", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "RUNNER_BUSY", minutesAgo: 600 });
    const fetch = F.runnerFetch(async call => {
      await callbackFor(ctx, JSON.parse(call.body));                                              // the runner answers before 202 returns
      return { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    });
    await sweep(ctx, { fetch });
    const t = X.target(ctx);
    expect(t.state).toBe("complete");
    expect(t.technicalCode).toBeUndefined();
    expect(X.grade(ctx).score).toBe(10);
    expect(ctx.getJson(JOBS + t.jobId + ".json").state).toBe("complete");
  });

  it("R15 a manual override always wins over the recovered automatic result", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    const doc = ctx.getJson(F.SUB); doc.attempts[0].manualOverrides = { auto1: { score: 4, comment: "تعديل المعلم" } }; ctx.setJson(F.SUB, doc);
    X.age(ctx, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600 });
    const fetch = F.runnerFetch();
    await sweep(ctx, { fetch });
    await callbackFor(ctx, fetch.jobs()[0]);
    expect(X.target(ctx).state).toBe("complete");
    expect(X.target(ctx).result.automaticScore).toBe(10);
    expect(X.grade(ctx).score).toBe(4);
  });
});

describe("R32 / R34 — dispatch hardening", () => {
  it("R32 dispatch uses the key-separation resolver: EQUAL runner / callback keys → nothing is sent, retryable EXECUTION_UNAVAILABLE", async () => {
    const SAME = "test-only-shared-key-for-both-directions-0123456789";
    for (const via of ["sweep", "direct"]) {
      const ctx = seedNoDoc(); X.commitAttempt(ctx);
      const env = { ...X.ENV, CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME };
      const fetch = F.runnerFetch();
      if (via === "sweep") await sweep(ctx, { fetch, env });
      else await official().ensureCodingGradingJobs(ctx.container, { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 }, { env, fetch }, {});
      expect(fetch.calls, via).toHaveLength(0);
      expect(X.target(ctx), via).toMatchObject({ state: "retryable", technicalCode: "EXECUTION_UNAVAILABLE" });
      expect(X.grade(ctx).manualReview, via).toBe(true);
    }
    const d = await official().dispatchOfficialJob({ jobId: "cg_" + "a".repeat(40) }, { env: { ...X.ENV, CODING_RUNNER_HMAC_KEY: SAME, CODING_GRADING_CALLBACK_HMAC_KEY: SAME }, fetch: F.runnerFetch() });
    expect(d).toEqual({ state: "retryable", technicalCode: "EXECUTION_UNAVAILABLE", errorClass: "config" });                 // errorClass: Phase 17D-B2 delivery state
  });

  it("R34 authority is re-derived before every recovery dispatch: a changed stored answer fails closed (no runner call)", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600 });
    const doc = ctx.getJson(F.SUB); doc.attempts[0].answers.auto1 = F.code("print('tampered')\n"); ctx.setJson(F.SUB, doc);
    const fetch = F.runnerFetch();
    await sweep(ctx, { fetch });
    expect(fetch.calls).toHaveLength(0);
    expect(X.target(ctx)).toMatchObject({ state: "retryable", technicalCode: "AUTHORITY_CHANGED", revision: 1 });
    expect(X.grade(ctx).manualReview).toBe(true);
  });
});

describe("§56–§59 — vertical recovery scenarios", () => {
  it("§56 crash-after-commit: committed attempt, target pending, NO job blob, NO dispatch hook ran → sweep → same job id → graded", async () => {
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    expect(X.target(ctx).state).toBe("pending");
    expect(ctx.names(JOBS)).toEqual([]);
    const fetch = F.runnerFetch();
    // inside the grace window nothing happens (the post-commit dispatch could still be in flight)
    const early = clock(Date.parse(X.target(ctx).updatedAt) + 60 * 1000);
    expect((await sweep(ctx, { fetch, now: early })).dispatched).toBe(0);
    expect(fetch.calls).toHaveLength(0);
    await sweep(ctx, { fetch });
    expect(fetch.jobs().map(j => j.jobId)).toEqual([planned.jobId]);
    expect(X.target(ctx)).toMatchObject({ state: "dispatched", jobId: planned.jobId, revision: 1 });
    expect((await callbackFor(ctx, fetch.jobs()[0])).status).toBe(200);
    expect(X.target(ctx).state).toBe("complete");
    expect(X.grade(ctx).score).toBe(10);
  });

  it("§57 stale callback loss: dispatched long ago, callback never arrived → re-dispatch of the SAME job (runner dedupes) → graded", async () => {
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    const first = F.runnerFetch();
    await official().ensureCodingGradingJobs(ctx.container, { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 }, { env: X.ENV, fetch: first }, {});
    expect(X.target(ctx).state).toBe("dispatched");
    X.age(ctx, { state: "dispatched", minutesAgo: 10 });
    const fetch = F.runnerFetch(() => ({ status: 202, json: { ok: true, accepted: true, duplicate: true } }));
    await sweep(ctx, { fetch });
    expect(fetch.calls).toHaveLength(0);                                                           // not stale yet
    X.age(ctx, { state: "dispatched", minutesAgo: 45 });
    const r = await sweep(ctx, { fetch });
    expect(r.dispatched).toBe(1);
    expect(fetch.jobs().map(j => j.jobId)).toEqual([planned.jobId]);
    expect(ctx.getJson(JOBS + planned.jobId + ".json").dispatchCount).toBe(2);
    await callbackFor(ctx, fetch.jobs()[0]);
    expect(X.target(ctx)).toMatchObject({ state: "complete", revision: 1 });
    expect(X.grade(ctx).score).toBe(10);
  });

  it("§58 runner outage: repeated sweeps respect the backoff, count automatic attempts and never zero the question", async () => {
    const ctx = seedNoDoc(); X.commitAttempt(ctx);
    const down = F.runnerFetch("throw"), now = clock();
    await sweep(ctx, { fetch: down, now });
    expect(X.target(ctx)).toMatchObject({ state: "retryable", recovery: { automaticAttempts: 1 } });
    await sweep(ctx, { fetch: down, now });                                                         // inside the 10 min backoff
    expect(down.calls).toHaveLength(1);
    now.advance(11 * MIN);
    await sweep(ctx, { fetch: down, now });
    expect(down.calls).toHaveLength(2);
    expect(X.target(ctx).recovery.automaticAttempts).toBe(2);
    expect(X.grade(ctx).manualReview).toBe(true);
    expect(ctx.getJson(F.SUB).attempts[0].finalized).toBe(false);
  });

  it("§59 recovery after the runner returns: the next due sweep dispatches the same job and the callback grades it", async () => {
    const ctx = seedNoDoc(), planned = X.commitAttempt(ctx);
    X.age(ctx, { state: "retryable", technicalCode: "RUNNER_BUSY", minutesAgo: 41, recovery: { automaticAttempts: 3 }, lastAutomaticMinutesAgo: 41 });
    const fetch = F.runnerFetch();
    const r = await sweep(ctx, { fetch });
    expect(r.dispatched).toBe(1);
    expect(fetch.jobs().map(j => j.jobId)).toEqual([planned.jobId]);
    expect(X.target(ctx)).toMatchObject({ state: "dispatched", revision: 1, recovery: { automaticAttempts: 4 } });
    await callbackFor(ctx, fetch.jobs()[0]);
    expect(X.target(ctx).state).toBe("complete");
    expect(X.grade(ctx).score).toBe(10);
    expect(ctx.getJson(F.SUB).attempts[0].finalized).toBe(true);
  });
});
