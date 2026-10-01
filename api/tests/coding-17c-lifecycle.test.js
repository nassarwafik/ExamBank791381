import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17C — 17C-D (attempt-ending lifecycle) and 17C-E (concurrency / idempotency), driven through the REAL handlers against
// the in-memory blob container (real CAS helpers, real student / teacher auth seams, real grading, real notification / achievement
// / audit writers). The runner is a recording double of its official endpoint that executes NOTHING; its "results" are signed
// callbacks built from the request it actually received. Invariants:
//   • every completed-attempt path (submit, timed-out, strict integrity exit, teacher-ended) records the durable grading intent
//     INSIDE the attempt CAS and dispatches only AFTER the commit — a runner outage never rejects / reopens a submission and is
//     never a zero;
//   • the API computes the official mark itself (comparator + weights) from the attempt answers and the assignment snapshot;
//   • callbacks are HMAC-authenticated, idempotent, bound to (job, revision, grading key); stale / foreign results never land;
//   • a teacher's manual override always wins; retry / force-regrade reload authority server-side.
// Fail-first on 543fa9f4: the grading intent, job store, dispatcher, callback / regrade routes do not exist.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const results = () => require_("../src/functions/assignment-results.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");

const JOBS = "platform/coding-grading-jobs/";
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });

function harness({ ctx = F.seed(), env = F.ENV, fetch = F.runnerFetch(), logs = [] } = {}) {
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env, fetch };
  const cDeps = { getContainer: () => ctx.container, env };
  return {
    ctx, fetch, logs, env,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, obs),
    student: body => submission().handler(F.studentRequest(body), sDeps, obs),
    results: body => results().handler(F.teacherRequest("/api/assignment-results", body), tDeps, obs),
    saveReview: (overrides, attemptNumber = 1) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber, overrides, teacherFeedback: "" }), tDeps, obs),
    reviewGet: (attemptNumber = 1) => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=" + attemptNumber, null, "GET"), tDeps, obs),
    regrade: body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, obs),
    callback: (body, opts) => grading().callbackHandler(F.callbackRequest(body, opts), cDeps, obs),
    doc: () => ctx.getJson(F.SUB),
    attempt: (n = 1) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n),
    target: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).codingGrading.targets[q],
    grade: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).questionGrades.find(g => g.questionId === q),
    jobs: () => ctx.names(JOBS).map(n => ctx.getJson(n)),
    events: () => ctx.names("platform/notifications/student/" + F.S1 + "/").map(n => ctx.getJson(n)).filter(e => e && e.type),
    audits: () => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => String(e.action).startsWith("coding.autoGrade"))
  };
}
const ANSWERS = { auto1: F.code("a,b=map(int,input().split());print('SUM='+str(a+b))\n"), sa1: { kind: "text", value: "x" } };
const ALL_PASS = F.CANARY.expected;
const regradeBody = (action, over = {}) => ({ action, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1", ...over });

describe("17C-D — every completed-attempt path records the durable intent and dispatches AFTER the commit", () => {
  it("D1 submit: attempt committed, intent stored atomically, job created, ONE dispatch with the authoritative source; pendingReview until graded", async () => {
    const h = harness();
    const r = await h.submit(ANSWERS);
    expect(r.status).toBe(200);
    const t = h.target();
    expect(t).toMatchObject({ mode: "hiddenTests", state: "dispatched", revision: 1 });
    expect(t.jobId).toMatch(/^cg_[A-Za-z0-9_-]{16,64}$/); expect(t.gradingKey).toMatch(/^[0-9a-f]{64}$/); expect(t.answerHash).toMatch(/^[0-9a-f]{64}$/); expect(t.questionFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(h.grade()).toMatchObject({ score: 0, manualReview: true });
    expect(h.attempt().finalized).toBe(false);
    expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
    expect(h.doc().activeAttempt).toBe(null);                                                        // the attempt is consumed
    const jobs = h.fetch.jobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe(t.jobId); expect(jobs[0].source).toBe(ANSWERS.auto1.source);
    expect(h.jobs()).toEqual([expect.objectContaining({ jobId: t.jobId, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, targetKey: "auto1", revision: 1, gradingKey: t.gradingKey, state: "dispatched" })]);
    // the job record never duplicates the source / hidden tests / expected outputs / reference solutions
    expect(JSON.stringify(h.jobs())).not.toMatch(/SUM=|CANARY-REFERENCE|hiddenTests|expectedOutput|print\(/);
    // the student response never exposes grading internals
    expect(JSON.stringify(r.jsonBody)).not.toMatch(/codingGrading|gradingKey|jobId|cg_|answerHash|questionFingerprint|hiddenTests|expectedOutput/);
  });
  it("D2 runner DOWN: the submission still succeeds and is immutable; the target is retryable; NO zero is committed", async () => {
    for (const [fetch, env, code] of [[F.runnerFetch("throw"), F.ENV, "EXECUTION_FAILED"], [F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })), F.ENV, "RUNNER_BUSY"], [F.runnerFetch(), { CODING_GRADING_CALLBACK_HMAC_KEY: F.CALLBACK_KEY }, "EXECUTION_UNAVAILABLE"]]) {
      const h = harness({ fetch, env });
      const r = await h.submit(ANSWERS);
      expect(r.status, code).toBe(200);
      expect(h.doc().activeAttempt).toBe(null);
      expect(h.attempt().answers.auto1).toEqual(ANSWERS.auto1);
      expect(h.target()).toMatchObject({ state: "retryable", technicalCode: code });
      expect(h.grade()).toMatchObject({ manualReview: true });
      expect(h.attempt()).toMatchObject({ finalized: false });
      expect(r.jsonBody.result.gradingStatus).toBe("pendingReview");
      // a second submit is refused (attempt consumed), never re-opened
      expect((await h.submit(ANSWERS)).status).toBe(409);
    }
  });
  it("D3 a counted automatic target with NO answer is graded 0 immediately (complete, no runner) and does not block finalization", async () => {
    const h = harness();
    const r = await h.submit({ sa1: { kind: "text", value: "x" } });
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "no-answer", automaticScore: 0 }) });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(h.attempt()).toMatchObject({ finalized: true, score: 2, manualReviewMarks: 0 });
    expect(h.fetch.calls).toHaveLength(0);
    // whitespace-only source is unanswered too
    const h2 = harness();
    await h2.submit({ auto1: F.code("   \n\t"), sa1: { kind: "text", value: "x" } });
    expect(h2.target().state).toBe("complete"); expect(h2.fetch.calls).toHaveLength(0);
  });
  it("D4 manual mode (and 17A questions without a mode) behave exactly as Phase 17A: score 0, manual review, NO intent, NO runner", async () => {
    const legacy = F.autoQ({ answer: { comparator: "exact", hiddenTests: F.HIDDEN } });
    for (const auto of [F.autoQ({ answer: { gradingMode: "manual", hiddenTests: F.HIDDEN } }), legacy]) {
      const h = harness({ ctx: F.seed({ a: F.assignment({}, { auto }) }) });
      expect((await h.submit(ANSWERS)).status).toBe(200);
      expect(h.attempt().codingGrading).toBeUndefined();
      expect(h.grade()).toMatchObject({ score: 0, manualReview: true });
      expect(h.fetch.calls).toHaveLength(0);
      expect(h.jobs()).toEqual([]);
    }
  });
  it("D5 finalizeTimedOutAttempt grades the SERVER draft and records + dispatches the intent", async () => {
    const doc = F.activeDoc({ auto1: ANSWERS.auto1 }, { activeAttempt: { attemptNumber: 1, startedAt: F.STARTED, endsAt: new Date(Date.now() - 1000).toISOString(), status: "draft", attemptEpoch: 1, pauseCount: 0 } });
    const h = harness({ ctx: F.seed({ doc, a: F.assignment({ durationMinutes: 5 }) }) });
    const r = await h.student({ action: "finalizeTimedOutAttempt", answers: { auto1: F.code("print('client answers are ignored')") } });
    expect(r.status).toBe(200);
    expect(h.attempt().endReason).toBe("timedOut");
    expect(h.target().state).toBe("dispatched");
    expect(h.fetch.jobs()[0].source).toBe(ANSWERS.auto1.source);
  });
  it("D6 strict finalizeIntegrityExit records + dispatches the intent", async () => {
    const h = harness({ ctx: F.seed({ doc: F.activeDoc({ auto1: ANSWERS.auto1 }), a: F.assignment({ attemptPolicy: "strict" }) }) });
    const r = await h.student({ action: "finalizeIntegrityExit", expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 });
    expect(r.status).toBe(200);
    expect(h.attempt().endReason).toBe("integrityExit");
    expect(h.target().state).toBe("dispatched"); expect(h.fetch.jobs()).toHaveLength(1);
  });
  it("D7 teacher endActiveAttempt records + dispatches the intent", async () => {
    const h = harness({ ctx: F.seed({ doc: F.activeDoc({ auto1: ANSWERS.auto1 }) }) });
    const r = await h.results({ action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 });
    expect(r.status).toBe(200);
    expect(h.attempt().endReason).toBe("teacherEnded");
    expect(h.target().state).toBe("dispatched"); expect(h.fetch.jobs()).toHaveLength(1);
    // a duplicate teacher end is idempotent and dispatches nothing new
    expect((await h.results({ action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 })).jsonBody.alreadyEnded).toBe(true);
    expect(h.fetch.jobs()).toHaveLength(1);
  });
  it("D8 a duplicate submit / finalize never creates a second attempt, intent or dispatch", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    expect((await h.submit(ANSWERS)).status).toBe(409);
    expect((await h.student({ action: "finalizeTimedOutAttempt" })).jsonBody.alreadyFinalized).toBe(true);
    expect(h.doc().attempts).toHaveLength(1); expect(h.fetch.jobs()).toHaveLength(1); expect(h.jobs()).toHaveLength(1);
  });
  it("D9 a storage conflict during the submit CAS is retried: exactly one attempt with exactly one intent", async () => {
    let fired = false;
    const ctx = F.seed({ hooks: { beforeConditionalUpload: (name, api) => { if (!fired && name === F.SUB) { fired = true; const d = api.getJson(name); d.updatedAt = new Date().toISOString(); api.setJson(name, d); } } } });
    const h = harness({ ctx });
    expect((await h.submit(ANSWERS)).status).toBe(200);
    expect(fired).toBe(true);
    expect(h.doc().attempts).toHaveLength(1);
    expect(Object.keys(h.attempt().codingGrading.targets)).toEqual(["auto1"]);
    expect(h.fetch.jobs()).toHaveLength(1);
  });
  it("D10 crash after commit (job document never written): the attempt intent alone reconstructs the job; ensureCodingGradingJobs is idempotent", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(ANSWERS);
    for (const n of h.ctx.names(JOBS)) h.ctx.store.delete(n);
    const ok = F.runnerFetch();
    const deps = { env: F.ENV, fetch: ok };
    await official().ensureCodingGradingJobs(h.ctx.container, { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 }, deps);
    await official().ensureCodingGradingJobs(h.ctx.container, { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1 }, deps);
    expect(h.jobs()).toHaveLength(1);
    expect(h.target().state).toBe("dispatched");
    const jobIds = ok.jobs().map(j => j.jobId);
    expect(new Set(jobIds).size).toBe(1);                                                          // re-dispatch reuses the SAME job id
  });
});

describe("17C-E — callback application: authoritative, idempotent, stale-safe; manual override wins", () => {
  async function graded(h, outputs = ALL_PASS, extra) {
    const job = h.fetch.jobs().at(-1);
    return h.callback(F.callbackBody(job, outputs, extra));
  }
  it("E1 a complete callback: the API compares + weights, applies the score, finalizes; achievement + ONE automatic notification + audit", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { short: false }) }) });
    await h.submit({ auto1: ANSWERS.auto1 });
    const r = await graded(h, [F.CANARY.expected[0], "SUM=wrong\n", F.CANARY.expected[2]]);
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ automaticScore: 6.67, passedWeight: 4, totalWeight: 6, testCount: 3, passedCount: 2 }) });
    expect(h.grade()).toMatchObject({ score: 6.67, manualReview: false });
    expect(h.attempt()).toMatchObject({ finalized: true, score: 6.67, manualReviewMarks: 0, percentage: 66.7 });
    const ev = h.events().filter(e => e.type === "assignment_reviewed");
    expect(ev).toHaveLength(1); expect(ev[0]).toMatchObject({ automatic: true, becameFinal: true, finalized: true });
    expect(h.audits().map(a => a.action)).toContain("coding.autoGrade.completed");
    expect(h.jobs()[0].state).toBe("complete");
  });
  it("E2 a duplicate valid callback is idempotent: 200, no second mutation, no second notification / achievement", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { short: false }) }) });
    await h.submit({ auto1: ANSWERS.auto1 });
    const job = h.fetch.jobs()[0], body = F.callbackBody(job, ALL_PASS);
    expect((await h.callback(body)).status).toBe(200);
    const etag = h.ctx.store.get(F.SUB).etag, events = h.events().length, feed = h.ctx.names("platform/feed/").length;
    const again = await h.callback(body);
    expect(again.status).toBe(200); expect(again.jsonBody.alreadyApplied).toBe(true);
    expect(h.ctx.store.get(F.SUB).etag).toBe(etag);
    expect(h.events().length).toBe(events); expect(h.ctx.names("platform/feed/").length).toBe(feed);
    expect(feed).toBe(1);                                                                            // 100 % → one medal post
  });
  it("E3 force regrade: new revision + new job; the OLD job's late callback is refused without any grade mutation; the new one applies", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    const oldJob = h.fetch.jobs()[0];
    await h.callback(F.callbackBody(oldJob, ALL_PASS));
    expect(h.grade().score).toBe(10);
    const rg = await h.regrade(regradeBody("force"));
    expect(rg.status).toBe(200);
    const t = h.target();
    expect(t).toMatchObject({ revision: 2, state: "dispatched" }); expect(t.jobId).not.toBe(oldJob.jobId);
    expect(h.grade().score).toBe(10);                                                               // the applied official result stays until the new revision lands
    const etag = h.ctx.store.get(F.SUB).etag;
    const stale = await h.callback(F.callbackBody(oldJob, ["x", "x", "x"]));
    expect(stale.status).toBe(409); expect(h.ctx.store.get(F.SUB).etag).toBe(etag);
    const newJob = h.fetch.jobs().at(-1);
    expect(newJob.jobId).toBe(t.jobId);
    expect((await h.callback(F.callbackBody(newJob, [F.CANARY.expected[0], "no", "no"]))).status).toBe(200);
    expect(h.grade().score).toBe(1.67);
    expect(h.audits().map(a => a.action)).toContain("coding.autoGrade.regraded");
  });
  it("E4 a result computed for a DIFFERENT answer / question (grading key no longer matches the authority) is never applied", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    const job = h.fetch.jobs()[0];
    const d = h.doc(); d.attempts[0].answers.auto1.source = "print('tampered after dispatch')\n"; h.ctx.setJson(F.SUB, d);
    const etag = h.ctx.store.get(F.SUB).etag;
    const r = await h.callback(F.callbackBody(job, ALL_PASS));
    expect(r.status).toBe(409); expect(h.ctx.store.get(F.SUB).etag).toBe(etag);
    // a changed hidden test in the snapshot is a different question fingerprint → refused too
    const h2 = harness();
    await h2.submit(ANSWERS);
    const a = h2.ctx.getJson("platform/assignments/" + F.AID + ".json"); a.examSnapshot.sections[0].questions[0].answer.hiddenTests[0].expectedOutput = "CHANGED"; h2.ctx.setJson("platform/assignments/" + F.AID + ".json", a);
    expect((await h2.callback(F.callbackBody(h2.fetch.jobs()[0], ALL_PASS))).status).toBe(409);
    expect(h2.grade().manualReview).toBe(true);
  });
  it("E5 a manual override wins: saved BEFORE the callback, kept after it, and kept across a forced regrade", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    expect((await h.saveReview({ auto1: { score: 4, comment: "تعديل المعلم" } })).status).toBe(200);
    await h.callback(F.callbackBody(h.fetch.jobs()[0], ALL_PASS));
    expect(h.grade()).toMatchObject({ score: 4, manualScore: 4 });
    expect(h.target().result.automaticScore).toBe(10);                                              // automatic evidence is still stored
    expect(h.attempt().score).toBe(6);                                                               // 4 (override) + 2 (short answer)
    await h.regrade(regradeBody("force"));
    await h.callback(F.callbackBody(h.fetch.jobs().at(-1), ["no", "no", "no"]));
    expect(h.grade().score).toBe(4); expect(h.attempt().manualOverrides.auto1.score).toBe(4);
  });
  it("E6 retry after a runner failure: retryable → dispatched (same revision / job) → complete", async () => {
    const h = harness({ fetch: F.runnerFetch("throw") });
    await h.submit(ANSWERS);
    expect(h.target().state).toBe("retryable");
    const ok = F.runnerFetch();
    const r = await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", regradeBody("retry")), { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container, env: F.ENV, fetch: ok });
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "dispatched", revision: 1 });
    expect(ok.jobs()[0].jobId).toBe(h.target().jobId);
    await h.callback(F.callbackBody(ok.jobs()[0], ALL_PASS));
    expect(h.target().state).toBe("complete"); expect(h.grade().score).toBe(10);
    expect(h.audits().map(a => a.action)).toEqual(expect.arrayContaining(["coding.autoGrade.retryable", "coding.autoGrade.dispatched", "coding.autoGrade.completed"]));
  });
  it("E7 INFRASTRUCTURE failure reported by the runner (failed outcome / an internal-error case / a missing case) → retryable, NO score", async () => {
    for (const make of [
      job => ({ jobId: job.jobId, outcome: "failed", cases: [], technicalCode: "SUITE_TIMEOUT" }),
      job => F.callbackBody(job, [F.CANARY.expected[0], F.CANARY.expected[1], { status: "internal-error" }]),
      job => ({ ...F.callbackBody(job, ALL_PASS), cases: F.callbackBody(job, ALL_PASS).cases.slice(0, 2) })
    ]) {
      const h = harness();
      await h.submit(ANSWERS);
      const r = await h.callback(make(h.fetch.jobs()[0]));
      expect(r.status).toBe(200);
      expect(h.target()).toMatchObject({ state: "retryable" });
      expect(h.target().result).toBeUndefined();
      expect(h.grade()).toMatchObject({ score: 0, manualReview: true });
      expect(h.attempt().finalized).toBe(false);
    }
  });
  it("E8 a callback carrying score / passed / percentage is refused and has ZERO effect", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    const job = h.fetch.jobs()[0], etag = h.ctx.store.get(F.SUB).etag;
    for (const body of [{ ...F.callbackBody(job, ["x", "x", "x"]), score: 100, passed: true, percentage: 100 }, { ...F.callbackBody(job, ["x", "x", "x"]), cases: F.callbackBody(job, ["x", "x", "x"]).cases.map(c => ({ ...c, passed: true, score: 100 })) }]) {
      const r = await h.callback(body);
      expect(r.status).toBe(400);
      expect(h.ctx.store.get(F.SUB).etag).toBe(etag);
    }
    expect(h.grade()).toMatchObject({ score: 0, manualReview: true });
  });
  it("E8b defense in depth: even a body that bypassed validation cannot carry a score into the grade (the server recomputes)", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { short: false }) }) });
    await h.submit({ auto1: ANSWERS.auto1 });
    const job = h.fetch.jobs()[0];
    const r = await official().applyOfficialCallback(h.ctx.container, { ...F.callbackBody(job, ["x", "x", F.CANARY.expected[2]]), score: 10, passed: true, automaticScore: 10 }, { env: F.ENV });
    expect(r.status).toBe(200);
    expect(h.target().result).toMatchObject({ automaticScore: 5, passedWeight: 3, totalWeight: 6 });               // 10 × 3 / 6 from evidence only
    expect(h.grade().score).toBe(5);
  });
  it("E9 compile error (compiled language) is a STUDENT outcome: complete with 0 and a bounded diagnostic preview", async () => {
    const h = harness({ ctx: F.seed({ a: F.assignment({}, { short: false }) }) });
    await h.submit({ auto1: F.code("public class Main { int x = ; }", "java") });
    const job = h.fetch.jobs()[0];
    expect(job.language).toBe("java");
    const r = await h.callback({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr: "Main.java:1: error: illegal start of expression\n" }, cases: [] });
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "compile-error", automaticScore: 0 }) });
    expect(h.target().result.compilePreview).toMatch(/illegal start of expression/);
    expect(h.attempt()).toMatchObject({ finalized: true, score: 0 });
  });
  it("E10 duplicate dispatch: a retry while already dispatched reuses the SAME job id (the runner dedupes), never a second revision", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    const first = h.target().jobId;
    expect((await h.regrade(regradeBody("retry"))).status).toBe(200);
    expect(h.target()).toMatchObject({ revision: 1, jobId: first });
    expect(new Set(h.fetch.jobs().map(j => j.jobId))).toEqual(new Set([first]));
    // the runner's own dedupe answer (202 duplicate) is a success, a conflict (same id, different body) is a technical failure
    const conflict = F.runnerFetch(() => ({ status: 409, json: { ok: false, code: "JOB_ID_CONFLICT" } }));
    await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", regradeBody("retry")), { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container, env: F.ENV, fetch: conflict });
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "JOB_ID_CONFLICT" });
  });
});

describe("17C-E — callback authentication (separate Runner→SmartAssess HMAC key)", () => {
  async function ready() { const h = harness(); await h.submit(ANSWERS); return { h, body: F.callbackBody(h.fetch.jobs()[0], ALL_PASS) }; }
  it("unsigned / wrong-key / tampered / stale / future / replayed-with-a-different-body callbacks are refused (401) with no mutation", async () => {
    const { h, body } = await ready();
    const etag = h.ctx.store.get(F.SUB).etag, text = JSON.stringify(body);
    expect((await h.callback(body, { unsigned: true })).status).toBe(401);
    expect((await h.callback(body, { key: "a-different-test-only-key-0123456789abcdef" })).status).toBe(401);
    expect((await h.callback(text.replace("SUM=", "SUM:"), { signBody: text })).status).toBe(401);
    expect((await h.callback(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await h.callback(body, { timestamp: Math.floor(Date.now() / 1000) + 3600 })).status).toBe(401);
    expect((await h.callback(body, { path: "/api/coding/run" })).status).toBe(401);
    // the RUNNER request key cannot sign callbacks (separate configuration concern)
    expect((await h.callback(body, { key: F.RUNNER_KEY })).status).toBe(401);
    expect(h.ctx.store.get(F.SUB).etag).toBe(etag);
  });
  it("malformed bodies are refused (400): not JSON, unknown fields, bad token / status, oversized output", async () => {
    const { h, body } = await ready();
    for (const bad of ["{not json", { ...body, extra: 1 }, { ...body, outcome: "great" }, { ...body, cases: body.cases.map((c, i) => (i ? c : { ...c, token: "../x" })) }, { ...body, cases: body.cases.map((c, i) => (i ? c : { ...c, status: "passed" })) }, { ...body, cases: body.cases.map((c, i) => (i ? c : { ...c, stdout: "x".repeat(200000) })) }, { ...body, jobId: 7 }]) {
      expect((await h.callback(bad)).status, String(JSON.stringify(bad)).slice(0, 60)).toBe(400);
    }
    expect(h.grade().manualReview).toBe(true);
  });
  it("an unknown job id is refused safely (404) and nothing is written", async () => {
    const { h, body } = await ready();
    const before = JSON.stringify(h.ctx.names("platform/").sort());
    expect((await h.callback({ ...body, jobId: "cg_unknownjob0000000000000000" })).status).toBe(404);
    expect(JSON.stringify(h.ctx.names("platform/").sort())).toBe(before);
  });
  it("no callback key configured → the callback route fails CLOSED (503), never accepts unauthenticated results", async () => {
    const { h, body } = await ready();
    const r = await grading().callbackHandler(F.callbackRequest(body), { getContainer: () => h.ctx.container, env: { CODING_RUNNER_URL: F.ENV.CODING_RUNNER_URL, CODING_RUNNER_HMAC_KEY: F.RUNNER_KEY } });
    expect(r.status).toBe(503);
    expect(h.grade().manualReview).toBe(true);
  });
});

describe("17C-E — teacher retry / regrade is server-authoritative", () => {
  it("only an authenticated teacher may call it; the body may never carry source, tests, limits or a score", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    const anon = await grading().regradeHandler(F.teacherRequest("/api/coding/regrade", regradeBody("retry")), { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }), getContainer: () => h.ctx.container, env: F.ENV, fetch: h.fetch });
    expect(anon.status).toBe(401);
    for (const extra of [{ source: "print(1)" }, { hiddenTests: [] }, { expectedOutputs: ["1"] }, { limits: { timeMs: 10000 } }, { score: 10 }, { language: "java" }]) {
      expect((await h.regrade(regradeBody("retry", extra))).status, JSON.stringify(extra)).toBe(400);
    }
    expect((await h.regrade(regradeBody("bogus"))).status).toBe(400);
    expect((await h.regrade(regradeBody("retry", { questionId: "sa1" }))).status).toBe(404);
    expect((await h.regrade(regradeBody("retry", { attemptNumber: 9 }))).status).toBe(404);
  });
  it("the regrade dispatch re-reads the AUTHORITATIVE source from the stored attempt", async () => {
    const h = harness();
    await h.submit(ANSWERS);
    await h.regrade(regradeBody("force"));
    expect(h.fetch.jobs().at(-1).source).toBe(ANSWERS.auto1.source);
  });
});
