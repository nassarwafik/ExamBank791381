import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17D-A — teacher operations on top of the Recovery Engine:
//   • POST /api/coding/bulk-retry { assignmentId } (builder auth): re-dispatches every pending / retryable / STALE dispatched
//     coding target of the assignment — never complete, never a freshly dispatched target — at the SAME revision, resetting
//     automatic backoff / exhaustion; bounded per call (hasMore) and resumable without a client cursor; ONE audit event.
//   • the Gradebook carries a server-derived aggregate coding status (pending / retryable / stale counts) per attempt and per
//     assignment — never a technical code, job id, grading key or recovery internals; the student payload is unchanged.
//   • the Phase 17C single-target retry / force semantics are unchanged.
// Fail-first on e9a3ddb: bulkRetryAssignment, the bulk route, codingGradingStatus and the Gradebook summary do not exist.
const require_ = createRequire(import.meta.url);
const X = require_("./fixtures/coding-17d-a.js");
const { F, MIN } = X;
const official = () => require_("../src/lib/coding/official-grading.js");
const R = () => require_("../src/lib/coding/grading-recovery.js");
const routes = () => require_("../src/functions/coding-grading-recovery.js");
const grading = () => require_("../src/functions/coding-grading.js");
const results = () => require_("../src/functions/assignment-results.js");
const submission = () => require_("../src/functions/student-submission.js");

const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
function addStudent(ctx, id) {
  ctx.setJson("platform/users/" + id + ".json", { schemaVersion: 3, role: "student", userId: id, displayName: "طالب " + id.slice(-3), code: "C" + id.slice(-3), classId: F.CLASS_ID, active: true, archived: false, authVersion: 1 });
}
/** Students sid(1..n) with one committed coding attempt each, aged into the given situations. */
function classroom(situations) {
  const ctx = F.seed({ a: F.assignment({}, { short: false }), doc: null });
  situations.forEach((s, i) => {
    const studentId = X.sid(i + 1);
    addStudent(ctx, studentId);
    X.commitAttempt(ctx, { studentId, ...(s === "no-answer" ? { answers: {} } : {}) });
    if (s === "pending" || s === "no-answer") return;
    if (s === "fresh") X.age(ctx, { studentId, state: "dispatched", minutesAgo: 5 });
    else if (s === "stale") X.age(ctx, { studentId, state: "dispatched", minutesAgo: 45 });
    else if (s === "complete") X.age(ctx, { studentId, state: "complete", minutesAgo: 30 });
    else if (s === "exhausted") X.age(ctx, { studentId, state: "retryable", technicalCode: "EXECUTION_FAILED", minutesAgo: 600, recovery: { automaticAttempts: 8, exhausted: true } });
    else if (s === "retryable") X.age(ctx, { studentId, state: "retryable", technicalCode: "RUNNER_BUSY", minutesAgo: 1 });
  });
  return ctx;
}
const bulk = (ctx, { fetch = F.runnerFetch(), now = clock(), logs = [], limit } = {}) => {
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  return R().bulkRetryAssignment(ctx.container, { assignmentId: F.AID, actor: F.CANARY.teacherId, ...(limit ? { limit } : {}) }, { env: X.ENV, fetch, now }, obs);
};
const audits = ctx => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => e && e.action === "coding.autoGrade.bulkRetry");

describe("R27–R29 — bulk retry", () => {
  it("R27 selects pending, retryable (incl. exhausted) and STALE dispatched; never complete / no-answer / fresh dispatched; same revision; recovery reset; one audit", async () => {
    const ctx = classroom(["pending", "retryable", "stale", "fresh", "complete", "no-answer", "exhausted"]);
    const planned = [1, 2, 3, 7].map(i => X.target(ctx, { studentId: X.sid(i) }));
    const untouched = [4, 5, 6].map(i => ctx.store.get(X.subName(F.AID, X.sid(i))).etag);
    const fetch = F.runnerFetch(), logs = [];
    const r = await bulk(ctx, { fetch, logs });
    expect(r).toMatchObject({ status: 200, scheduled: 4, dispatched: 4, retryable: 0, hasMore: false });
    expect(fetch.jobs().map(j => j.jobId).sort()).toEqual(planned.map(t => t.jobId).sort());
    [1, 2, 3, 7].forEach((i, k) => {
      const t = X.target(ctx, { studentId: X.sid(i) });
      expect(t).toMatchObject({ state: "dispatched", revision: planned[k].revision, jobId: planned[k].jobId, gradingKey: planned[k].gradingKey });
      expect(t.recovery).toMatchObject({ automaticAttempts: 0, exhausted: false });
    });
    expect([4, 5, 6].map(i => ctx.store.get(X.subName(F.AID, X.sid(i))).etag)).toEqual(untouched);
    const a = audits(ctx);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ actor: F.CANARY.teacherId, action: "coding.autoGrade.bulkRetry", targetType: "assignment", targetId: F.AID });
    expect(a[0].details).toMatchObject({ scheduled: 4, dispatched: 4, retryable: 0, hasMore: false });
    expect(JSON.stringify(a[0])).not.toMatch(/cg_|gradingKey|SUM=|22222222-/);
    const ev = logs.filter(l => l[0] === "coding.autoGrade.bulkRetry");
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(ev)).not.toMatch(/cg_|gradingKey|SUM=|22222222-/);
  });

  it("R28 bounded per call (hasMore) and resumable without a client cursor; bounded concurrency; never a zero while the runner is down", async () => {
    const ctx = classroom(Array.from({ length: 15 }, () => "retryable"));
    let inFlight = 0, peak = 0;
    const down = F.runnerFetch(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 3)); inFlight--; return { status: 503, json: { ok: false, code: "RUNNER_BUSY" } }; });
    const now = clock();
    const r1 = await bulk(ctx, { fetch: down, now });
    expect(R().BULK_RETRY_LIMIT).toBe(12);
    expect(r1).toMatchObject({ scheduled: 12, dispatched: 0, retryable: 12, hasMore: true });
    expect(peak).toBeLessThanOrEqual(4);
    const r2 = await bulk(ctx, { fetch: down, now });
    expect(r2).toMatchObject({ scheduled: 3, hasMore: false });
    expect(new Set(down.jobs().map(j => j.jobId)).size).toBe(15);                                   // every target once, no repeats
    const r3 = await bulk(ctx, { fetch: down, now });
    expect(r3).toMatchObject({ scheduled: 0, hasMore: false });
    now.advance(R().BULK_RETRY_COOLDOWN_MS + 1000);
    const r4 = await bulk(ctx, { fetch: down, now });
    expect(r4.scheduled).toBe(12);
    for (let i = 1; i <= 15; i++) {
      expect(X.target(ctx, { studentId: X.sid(i) })).toMatchObject({ state: "retryable", technicalCode: "RUNNER_BUSY", revision: 1 });
      expect(X.grade(ctx, { studentId: X.sid(i) }).manualReview).toBe(true);
    }
  });

  it("R29 route: builder auth, body exactly { assignmentId }, 404 for an unknown assignment, aggregate-only reply", async () => {
    const { bulkRetryHandler } = routes();
    const ctx = classroom(["retryable", "pending"]);
    const call = (body, auth = teacherAuth) => bulkRetryHandler(F.teacherRequest("/api/coding/bulk-retry", body), { requireBuilderAuth: auth, getContainer: () => ctx.container, env: X.ENV, fetch: F.runnerFetch() }, null);
    expect((await call({ assignmentId: F.AID }, () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }))).status).toBe(401);
    for (const bad of [{}, { assignmentId: F.AID, studentId: X.sid(1) }, { assignmentId: "../x" }, { assignmentId: 5 }, null, []]) {
      const r = await call(bad);
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.jsonBody).toEqual({ ok: false, code: "REQUEST_INVALID" });
    }
    const missing = await call({ assignmentId: "asg-missing" });
    expect(missing.status).toBe(404);
    expect(missing.jsonBody).toEqual({ ok: false, code: "NOT_FOUND" });
    const ok = await call({ assignmentId: F.AID });
    expect(ok.status).toBe(200);
    expect(ok.jsonBody).toEqual({ ok: true, scheduled: 2, dispatched: 2, retryable: 0, hasMore: false });
    expect(ok.headers["Cache-Control"]).toBe("no-store");
  });
});

describe("R30 — Gradebook aggregate coding status; student payload unchanged", () => {
  it("R30a codingGradingStatus is a pure aggregate (pending incl. fresh dispatched / retryable / stale), null when nothing is open", () => {
    const { codingGradingStatus } = official();
    const now = Date.now(), at = m => new Date(now - m * MIN).toISOString();
    const attempt = targets => ({ codingGrading: { version: 1, targets } });
    expect(codingGradingStatus(attempt({ a: { state: "pending", updatedAt: at(1) }, b: { state: "dispatched", updatedAt: at(5) }, c: { state: "dispatched", updatedAt: at(45) }, d: { state: "retryable", updatedAt: at(1), technicalCode: "RUNNER_BUSY" }, e: { state: "complete", updatedAt: at(1) } }), now)).toEqual({ pending: 2, retryable: 1, stale: 1 });
    expect(codingGradingStatus(attempt({ e: { state: "complete" } }), now)).toBeNull();
    expect(codingGradingStatus({}, now)).toBeNull();
    expect(codingGradingStatus(null, now)).toBeNull();
  });

  it("R30b the teacher GET carries per-attempt status + an assignment summary — never codes, job ids, keys or recovery internals", async () => {
    const ctx = classroom(["pending", "retryable", "stale", "complete", "exhausted"]);
    const res = await results().handler(F.teacherRequest("/api/assignment-results?assignmentId=" + F.AID, null, "GET"), { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container }, null);
    expect(res.status).toBe(200);
    const rows = Object.fromEntries(res.jsonBody.students.map(s => [s.studentId, s]));
    expect(rows[X.sid(1)].latestResult.codingGrading).toEqual({ pending: 1, retryable: 0, stale: 0 });
    expect(rows[X.sid(2)].latestResult.codingGrading).toEqual({ pending: 0, retryable: 1, stale: 0 });
    expect(rows[X.sid(3)].latestResult.codingGrading).toEqual({ pending: 0, retryable: 0, stale: 1 });
    expect(rows[X.sid(4)].latestResult.codingGrading).toBeUndefined();
    expect(rows[X.sid(5)].attempts[0].codingGrading).toEqual({ pending: 0, retryable: 1, stale: 0 });
    expect(res.jsonBody.codingSummary).toEqual({ pending: 1, retryable: 2, stale: 1 });
    const text = JSON.stringify(res.jsonBody);
    for (const leak of ["technicalCode", "RUNNER_BUSY", "EXECUTION_FAILED", "cg_", "gradingKey", "automaticAttempts", "recovery", "exhausted"]) expect(text).not.toContain(leak);
  });

  it("R30c the student's own payload never gains coding status / recovery internals", async () => {
    const ctx = classroom(["retryable"]);
    const studentAuth = () => ({ ok: true, user: { sub: X.sid(1), sv: 1, role: "student" } });
    const doc = ctx.getJson(X.subName(F.AID, X.sid(1)));
    doc.attempts[0].codingGrading.targets.auto1.recovery = { automaticAttempts: 3, exhausted: false, lastAutomaticAttemptAt: new Date().toISOString() };
    ctx.setJson(X.subName(F.AID, X.sid(1)), doc);
    const r = await submission().handler(F.studentRequest(null, "GET"), { container: ctx.container, requireStudentAuth: studentAuth, env: X.ENV }, null);
    const text = JSON.stringify(r.jsonBody || r.body || "");
    for (const leak of ["recovery", "automaticAttempts", "codingGrading", "technicalCode", "RUNNER_BUSY", "cg_", "gradingKey", "stale"]) expect(text).not.toContain(leak);
  });
});

describe("R31 — Phase 17C single-target retry / force semantics are unchanged", () => {
  it("R31 retry: same revision (also for a fresh dispatched target), complete → 409; force: a new audited revision", async () => {
    const ctx = classroom(["fresh", "complete", "retryable"]);
    const fetch = F.runnerFetch();
    const regrade = body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: X.ENV, fetch }, null);
    const body = (i, action) => ({ action, assignmentId: F.AID, studentId: X.sid(i), attemptNumber: 1, questionId: "auto1" });
    const fresh = X.target(ctx, { studentId: X.sid(1) });
    const r1 = await regrade(body(1, "retry"));
    expect(r1.jsonBody).toEqual({ ok: true, state: "dispatched", revision: 1 });
    expect(fetch.jobs().map(j => j.jobId)).toEqual([fresh.jobId]);
    const r2 = await regrade(body(2, "retry"));
    expect(r2.status).toBe(409);
    expect(r2.jsonBody).toEqual({ ok: false, code: "ALREADY_COMPLETE" });
    const r3 = await regrade(body(3, "force"));
    expect(r3.jsonBody).toEqual({ ok: true, state: "dispatched", revision: 2 });
    expect(X.target(ctx, { studentId: X.sid(3) }).revision).toBe(2);
    expect(ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => e.action === "coding.autoGrade.regraded")).toHaveLength(1);
  });
});
