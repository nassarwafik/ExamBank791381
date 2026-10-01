import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// Phase 17D-A — Independent Reliability Review Fix 1: a teacher Bulk Retry request is bounded in EVERY dimension, not only in
// dispatches: submissions listed / downloaded (BULK_RETRY_MAX_SCANNED), targets dispatched (BULK_RETRY_LIMIT), concurrency
// (BULK_RETRY_CONCURRENCY) and wall clock (BULK_RETRY_DEADLINE_MS). Progress across calls is owned by a server-side,
// CAS-protected per-assignment operation cursor (never the cooldown, never the client): repeated calls walk the assignment
// exactly once per operation — resuming mid-page, mid-submission and mid-attempt — without restarting from submission #1 and
// without starving later targets after the cooldown expires.
// Fail-first on 81d7733: one call lists + downloads all 1000 submissions; later calls restart from the beginning; after the
// cooldown the first batch is re-sent forever; there is no deadline and no cursor.
const require_ = createRequire(import.meta.url);
const X = require_("./fixtures/coding-17d-a.js");
const { F, MIN } = X;
const R = () => require_("../src/lib/coding/grading-recovery.js");
const routes = () => require_("../src/functions/coding-grading-recovery.js");
const { gradeExam } = require_("../src/lib/assignment-grading.js");
const { planCodingGrading } = require_("../src/lib/coding/official-grading.js");

const SP = "platform/submissions/" + F.AID + "/";
const teacher = F.CANARY.teacherId;
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };
const down = () => F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));

/** Wraps a container: records every submission download (by name) and every listed blob name (paged or not). */
function instrument(ctx) {
  const stats = { downloads: [], listed: 0 };
  const container = new Proxy(ctx.container, {
    get(t, p) {
      if (p === "getBlobClient") return name => { const c = t.getBlobClient(name); return { ...c, download: async (...a) => { if (name.startsWith(SP)) stats.downloads.push(name); return c.download(...a); } }; };
      if (p === "listBlobsFlat") return opts => {
        const it = t.listBlobsFlat(opts);
        return {
          async *[Symbol.asyncIterator]() { for await (const b of it) { stats.listed++; yield b; } },
          byPage(o) { const g = it.byPage(o); return { async next() { const s = await g.next(); if (!s.done) stats.listed += s.value.segment.blobItems.length; return s; }, [Symbol.asyncIterator]() { return this; } }; }
        };
      };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    }
  });
  return { container, stats };
}
const bulk = (container, { fetch = F.runnerFetch(), now = clock(), logs = [] } = {}) => {
  const obs = { logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) };
  return R().bulkRetryAssignment(container, { assignmentId: F.AID, actor: teacher }, { env: X.ENV, fetch, now }, obs);
};
function population(n, { hooks, state } = {}) {
  const ctx = F.seed({ a: F.assignment({}, { short: false }), doc: null, hooks });
  for (let i = 1; i <= n; i++) { X.commitAttempt(ctx, { studentId: X.sid(i) }); if (state) X.age(ctx, { studentId: X.sid(i), ...state }); }
  return ctx;
}
const jobsOf = fetch => fetch.jobs().map(j => j.jobId);
async function untilDone(ctx, { fetch, now = clock(), between, max = 20 } = {}) {
  const calls = [];
  for (let i = 0; i < max; i++) {
    const before = fetch.calls.length;
    const { container, stats } = instrument(ctx);
    const r = await bulk(container, { fetch, now });
    calls.push({ r, jobs: jobsOf(fetch).slice(before), stats });
    if (!r.hasMore) break;
    if (between) between(now);
  }
  return calls;
}

describe("BR — teacher Bulk Retry is bounded in reads, dispatches, concurrency and time", () => {
  it("BR1 1000 submissions: ONE call downloads ≤ BULK_RETRY_MAX_SCANNED, lists ≤ that many names, dispatches ≤ 12, concurrency ≤ 4", async () => {
    const ctx = population(1000);
    let inFlight = 0, peak = 0;
    const fetch = F.runnerFetch(async () => { inFlight++; peak = Math.max(peak, inFlight); await new Promise(r => setTimeout(r, 2)); inFlight--; return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; });
    const { container, stats } = instrument(ctx);
    const r = await bulk(container, { fetch });
    // the read bound first (literal server limits), so the fail-first evidence is the read count itself
    expect(new Set(stats.downloads).size, "distinct submissions downloaded").toBeLessThanOrEqual(100);
    expect(stats.listed, "blob names listed").toBeLessThanOrEqual(100);
    expect(fetch.calls.length).toBeLessThanOrEqual(12);
    expect(peak).toBeLessThanOrEqual(4);
    expect(r).toMatchObject({ status: 200, scheduled: 12, dispatched: 12, hasMore: true });
    const M = R();
    expect([M.BULK_RETRY_MAX_SCANNED, M.BULK_RETRY_LIMIT, M.BULK_RETRY_CONCURRENCY, M.BULK_RETRY_DEADLINE_MS]).toEqual([100, 12, 4, 20000]);
  }, 60000);

  it("BR2 repeated calls schedule every eligible target exactly once per operation and never restart from submission #1", async () => {
    const ctx = population(30), fetch = down(), now = clock();
    const calls = await untilDone(ctx, { fetch, now });
    expect(calls.map(c => c.r.scheduled)).toEqual([12, 12, 6]);
    expect(calls.map(c => c.r.hasMore)).toEqual([true, true, false]);
    const all = calls.flatMap(c => c.jobs);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    for (let i = 1; i < calls.length; i++) {
      const firstRead = [...calls[i].stats.downloads].sort()[0];
      expect(firstRead >= X.subName(F.AID, X.sid(12 * i)), "call " + (i + 1) + " restarted at " + firstRead).toBe(true);
      expect(new Set(calls[i].stats.downloads).size).toBeLessThanOrEqual(R().BULK_RETRY_MAX_SCANNED);
    }
    expect(ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => e.action === "coding.autoGrade.bulkRetry")).toHaveLength(3);
  });

  it("BR3 cooldown expiry between calls does not starve later targets: the cursor, not the cooldown, owns progress", async () => {
    const ctx = population(30, { state: { state: "retryable", technicalCode: "RUNNER_BUSY", minutesAgo: 1 } }), fetch = down();
    const calls = await untilDone(ctx, { fetch, between: now => now.advance(R().BULK_RETRY_COOLDOWN_MS + 1000) });
    const all = calls.flatMap(c => c.jobs);
    expect(calls.length).toBe(3);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    expect(calls[calls.length - 1].r.hasMore).toBe(false);
  });

  it("BR4 a dispatch limit hit mid-page, mid-submission and mid-attempt resumes exactly at the first unprocessed target", async () => {
    const exam = { title: "two coding", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", questions: [F.autoQ(), F.autoQ({ examQuestionId: "auto2" })] }] };
    const ctx = F.seed({ a: F.assignment({ examSnapshot: exam, totalMarks: 20, questionCount: 2 }), doc: null });
    const a = ctx.getJson("platform/assignments/" + F.AID + ".json");
    const commit = (studentId, attemptAnswers) => {
      const attempts = attemptAnswers.map((answers, i) => {
        const submittedAt = new Date(Date.now() - (90 - i) * MIN).toISOString(), g = gradeExam(a.examSnapshot, answers);
        const at = { attemptNumber: i + 1, submittedAt, score: g.score, totalMarks: g.totalMarks, percentage: g.percentage, manualReviewMarks: g.manualReviewMarks, finalized: g.finalized, questionGrades: g.questions, sections: g.sections, answers, manualOverrides: {}, teacherFeedback: "", timedOut: false, startedAt: submittedAt, endsAt: "", extendedEndsAt: "", endedAt: submittedAt, endReason: "submitted" };
        planCodingGrading(a.examSnapshot, at, { assignmentId: F.AID, studentId, now: submittedAt });
        return at;
      });
      ctx.setJson(X.subName(F.AID, studentId), { schemaVersion: 1, assignmentId: F.AID, studentId, classId: a.classId, draftAnswers: {}, attempts, activeAttempt: null });
    };
    const both = { auto1: F.code(X.SOURCE), auto2: F.code(X.SOURCE) };
    commit(X.sid(1), [{ auto1: F.code(X.SOURCE) }]);                                         // 1 target (auto2 no-answer → complete)
    for (let i = 2; i <= 6; i++) commit(X.sid(i), [both, both]);                             // 4 targets each (2 attempts × 2)
    const ordered = [];
    for (let i = 1; i <= 6; i++) for (const at of ctx.getJson(X.subName(F.AID, X.sid(i))).attempts) for (const k of Object.keys(at.codingGrading.targets).sort()) if (at.codingGrading.targets[k].state !== "complete") ordered.push(at.codingGrading.targets[k].jobId);
    expect(ordered).toHaveLength(21);
    const fetch = down(), calls = await untilDone(ctx, { fetch });
    expect(calls.map(c => c.r.scheduled)).toEqual([12, 9]);
    expect(new Set(calls[0].jobs)).toEqual(new Set(ordered.slice(0, 12)));                  // …sid4 attempt 2 auto1
    expect(new Set(calls[1].jobs)).toEqual(new Set(ordered.slice(12)));                     // resumes at sid4 attempt 2 auto2
    const complete = ctx.getJson(X.subName(F.AID, X.sid(1))).attempts[0].codingGrading.targets.auto2;
    expect(complete.state).toBe("complete");
    expect(complete.recovery).toBeUndefined();
  });

  it("BR5 the internal deadline stops the call early with hasMore and resumable progress — nothing lost, nothing repeated", async () => {
    const ctx = population(30), now = clock();
    const slow = F.runnerFetch(async () => { now.advance(7000); return { status: 202, json: { ok: true, accepted: true, duplicate: false } }; });
    const { container } = instrument(ctx);
    const r1 = await bulk(container, { fetch: slow, now });
    expect(r1.hasMore).toBe(true);
    expect(r1.scheduled).toBeLessThan(12);
    expect(r1.scheduled).toBeGreaterThanOrEqual(1);
    // no NEW claim starts after the deadline: only claims already in flight (≤ concurrency) may end up claimed-but-undispatched
    const claimedOnly = Array.from({ length: 30 }, (_, i) => X.target(ctx, { studentId: X.sid(i + 1) })).filter(t => t.recovery && t.state === "pending").length;
    expect(claimedOnly).toBeLessThanOrEqual(R().BULK_RETRY_CONCURRENCY);
    const fetch = F.runnerFetch(), rest = await untilDone(ctx, { fetch, now });
    const all = [...jobsOf(slow), ...rest.flatMap(c => c.jobs)];
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
  });

  it("BR5b the deadline passes while the page downloads: NO claim starts afterwards (no CAS write, no dispatch); later calls finish everything", async () => {
    const DEADLINE = R().BULK_RETRY_DEADLINE_MS, now = clock();
    const ctx = population(6);
    let armed = true, writesAfter = 0;
    const slowRead = new Proxy(ctx.container, { get(t, p) {
      if (p === "getBlobClient") return name => { const c = t.getBlobClient(name); return { ...c, download: async (...a) => { if (armed && name.startsWith(SP) && !name.includes("system")) { armed = false; now.advance(DEADLINE + 1000); } return c.download(...a); } }; };
      if (p === "getBlockBlobClient") return name => { const c = t.getBlockBlobClient(name); return { ...c, upload: async (...a) => { if (name.startsWith(SP) && now() - callStart >= DEADLINE) writesAfter++; return c.upload(...a); } }; };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const fetch = F.runnerFetch(), callStart = now();
    const r1 = await bulk(slowRead, { fetch, now });
    expect(armed).toBe(false);
    expect(r1).toMatchObject({ scheduled: 0, hasMore: true });
    expect(writesAfter, "submission CAS writes (claims) started after the deadline").toBe(0);
    expect(fetch.calls).toHaveLength(0);
    for (let i = 0; i < 3; i++) { const r = await bulk(ctx.container, { fetch, now }); if (!r.hasMore) break; }
    expect(new Set(jobsOf(fetch)).size).toBe(6);
    expect(jobsOf(fetch)).toHaveLength(6);
  });

  it("BR6 hasMore means unscanned assignment space remains — not 'more candidates than 12 after a full scan'", async () => {
    const ctx = population(150, { state: { state: "complete", minutesAgo: 30 } });
    X.age(ctx, { studentId: X.sid(150), state: "retryable", technicalCode: "RUNNER_BUSY", minutesAgo: 1 });
    const fetch = down();
    const r1 = await bulk(instrument(ctx).container, { fetch });
    expect(r1).toMatchObject({ scheduled: 0, hasMore: true });
    const r2 = await bulk(instrument(ctx).container, { fetch });
    expect(r2).toMatchObject({ scheduled: 1, hasMore: false });
  });

  it("BR7 race with a callback: a target completed after the scan is skipped by the CAS, never moved backward, and not revisited", async () => {
    let fired = false;
    const target = X.subName(F.AID, X.sid(2));
    const ctx = population(5, { hooks: { beforeConditionalUpload: (name, api) => {
      if (fired || name !== target) return;
      fired = true;
      const doc = api.getJson(name); doc.attempts[0].codingGrading.targets.auto1.state = "complete"; api.setJson(name, doc);
    } } });
    const completedJob = X.target(ctx, { studentId: X.sid(2) }).jobId;
    const fetch = F.runnerFetch(), r = await bulk(ctx.container, { fetch });
    expect(fired).toBe(true);
    expect(r).toMatchObject({ scheduled: 4, hasMore: false });
    expect(jobsOf(fetch)).not.toContain(completedJob);
    expect(X.target(ctx, { studentId: X.sid(2) }).state).toBe("complete");
    expect(X.target(ctx, { studentId: X.sid(2) }).recovery).toBeUndefined();
  });

  it("BR8 race with a force regrade: the old (revision, job) expectation fails; the new revision stays authoritative", async () => {
    let fired = false;
    const target = X.subName(F.AID, X.sid(3));
    const ctx = population(5, { hooks: { beforeConditionalUpload: (name, api) => {
      if (fired || name !== target) return;
      fired = true;
      const doc = api.getJson(name), t = doc.attempts[0].codingGrading.targets.auto1;
      t.revision = 2; t.jobId = "cg_" + "e".repeat(40); t.state = "pending"; t.updatedAt = new Date().toISOString(); delete t.recovery;
      api.setJson(name, doc);
    } } });
    const oldJob = X.target(ctx, { studentId: X.sid(3) }).jobId;
    const fetch = F.runnerFetch(), r = await bulk(ctx.container, { fetch });
    expect(fired).toBe(true);
    expect(jobsOf(fetch)).not.toContain(oldJob);
    expect(jobsOf(fetch)).not.toContain("cg_" + "e".repeat(40));
    expect(X.target(ctx, { studentId: X.sid(3) })).toMatchObject({ revision: 2, jobId: "cg_" + "e".repeat(40), state: "pending" });
    expect(r.scheduled).toBe(4);
  });

  it("BR9 concurrent Bulk Retries on one assignment: one proceeds, the other is BUSY; no new revision, no job-id change, no lost progress", async () => {
    const ctx = population(30);
    const planned = Array.from({ length: 30 }, (_, i) => X.target(ctx, { studentId: X.sid(i + 1) }));
    const fetch = down();
    const [a, b] = await Promise.all([bulk(ctx.container, { fetch }), bulk(ctx.container, { fetch })]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect([a, b].find(x => x.status === 409).code).toBe("BULK_RETRY_BUSY");
    const rest = await untilDone(ctx, { fetch });
    const all = jobsOf(fetch);
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
    expect(rest[rest.length - 1].r.hasMore).toBe(false);
    planned.forEach((p, i) => expect(X.target(ctx, { studentId: X.sid(i + 1) })).toMatchObject({ revision: p.revision, jobId: p.jobId, gradingKey: p.gradingKey }));
  });

  it("BR11 the deadline expires DURING the claim: no dispatch starts after it; the target is not lost and is dispatched exactly once later", async () => {
    const DEADLINE = R().BULK_RETRY_DEADLINE_MS, JOBS = "platform/coding-grading-jobs/", now = clock();
    let armed = false, fired = false, claimAt = null;
    // storage / CAS latency: the FIRST claim write of the call carries the clock past the deadline (the write still succeeds)
    const ctx = population(3, { hooks: { beforeConditionalUpload: name => {
      if (!armed || fired || !name.startsWith(SP)) return;
      fired = true; claimAt = now(); now.advance(DEADLINE + 1000);
    } } });
    X.commitAttempt(ctx, { studentId: X.sid(4) }); X.age(ctx, { studentId: X.sid(4), state: "complete", minutesAgo: 30 });
    X.commitAttempt(ctx, { studentId: X.sid(5), answers: {} });                                            // no-answer → complete
    X.commitAttempt(ctx, { studentId: X.sid(6) }); X.age(ctx, { studentId: X.sid(6), state: "dispatched", minutesAgo: 5 });  // fresh
    const planned = [1, 2, 3].map(i => X.target(ctx, { studentId: X.sid(i) }));
    const bystanders = () => [4, 5, 6].map(i => ctx.store.get(X.subName(F.AID, X.sid(i))).etag);
    const before = bystanders();
    const fetch = F.runnerFetch();
    armed = true;
    const callStart = now();
    const r1 = await bulk(ctx.container, { fetch, now });
    armed = false;
    expect(fired).toBe(true);
    expect(claimAt - callStart, "below the deadline when the claim began").toBeLessThan(DEADLINE);
    expect(now() - callStart, "the claim carried the call past the deadline").toBeGreaterThanOrEqual(DEADLINE);
    expect(fetch.calls, "no runner dispatch after the deadline").toHaveLength(0);
    expect(ctx.names(JOBS), "the dispatch path was not even entered").toEqual([]);
    expect(r1).toMatchObject({ status: 200, scheduled: 0, dispatched: 0, hasMore: true });
    const r2 = await bulk(ctx.container, { fetch, now });                                                   // same operation resumes
    expect(r2).toMatchObject({ status: 200, scheduled: 3, dispatched: 3, hasMore: false });
    expect(jobsOf(fetch).sort()).toEqual(planned.map(t => t.jobId).sort());                                  // each exactly once
    planned.forEach((p, i) => expect(X.target(ctx, { studentId: X.sid(i + 1) })).toMatchObject({ state: "dispatched", revision: p.revision, jobId: p.jobId, gradingKey: p.gradingKey }));
    expect(bystanders()).toEqual(before);                                                                    // complete / no-answer / fresh untouched
    const audits = ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => e.action === "coding.autoGrade.bulkRetry");
    expect(audits).toHaveLength(2);
    for (const a of audits) {
      expect(Object.keys(a.details).sort()).toEqual(["assignmentId", "dispatched", "hasMore", "retryable", "scheduled"]);
      expect(JSON.stringify(a)).not.toMatch(/22222222-|cg_|gradingKey/);
    }
  });

  it("BR11b concurrent claims finishing OUT OF ORDER around the deadline: none dispatched after it; every target exactly once, even after the cooldown", async () => {
    const DEADLINE = R().BULK_RETRY_DEADLINE_MS, now = clock();
    const ctx = population(8), slowClaim = X.subName(F.AID, X.sid(2));
    let armed = true;
    // the 2nd target's claim write is slow in REAL time; meanwhile the other workers claim + dispatch; when it lands the clock
    // has crossed the deadline, so the 2nd target is deferred AFTER later targets already finished (out-of-order completion)
    const slow = new Proxy(ctx.container, { get(t, p) {
      if (p === "getBlockBlobClient") return name => { const c = t.getBlockBlobClient(name); return { ...c, upload: async (...a) => { if (armed && name === slowClaim) { armed = false; await new Promise(r => setTimeout(r, 30)); now.advance(DEADLINE + 1000); } return c.upload(...a); } }; };
      const v = t[p]; return typeof v === "function" ? v.bind(t) : v;
    } });
    const callStart = now(), late = [];
    let firstCall = true;
    // a BUSY runner keeps every attempted target retryable (still eligible) — so only the operation cursor prevents a repeat
    const fetch = F.runnerFetch(async () => { if (firstCall && now() - callStart >= DEADLINE) late.push(now()); return { status: 503, json: { ok: false, code: "RUNNER_BUSY" } }; });
    const r1 = await bulk(slow, { fetch, now });
    firstCall = false;
    const deferredJob = X.target(ctx, { studentId: X.sid(2) }).jobId;
    expect(armed).toBe(false);
    expect(late, "runner dispatches that started after the deadline").toEqual([]);
    expect(r1.hasMore).toBe(true);
    expect(r1.scheduled, "later targets finished while the 2nd was still claiming").toBeGreaterThanOrEqual(1);
    expect(jobsOf(fetch)).not.toContain(deferredJob);
    for (let i = 0; i < 5; i++) {
      now.advance(R().BULK_RETRY_COOLDOWN_MS + 1000);                                        // only the cursor can prevent repeats
      const r = await bulk(ctx.container, { fetch, now });
      if (!r.hasMore) break;
    }
    const all = jobsOf(fetch);
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    expect(all).toContain(deferredJob);
  });

  it("BR10 the route never lets the client select targets or progress, and the reply stays aggregate-only", async () => {
    const { bulkRetryHandler } = routes();
    const ctx = population(3);
    const call = body => bulkRetryHandler(F.teacherRequest("/api/coding/bulk-retry", body), { requireBuilderAuth: () => ({ ok: true, user: { sub: teacher } }), getContainer: () => ctx.container, env: X.ENV, fetch: F.runnerFetch() }, null);
    for (const extra of [{ studentId: X.sid(1) }, { questionId: "auto1" }, { jobId: "cg_x" }, { revision: 2 }, { cursor: "x" }, { limit: 500 }, { states: ["complete"] }]) {
      const r = await call({ assignmentId: F.AID, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
    }
    const ok = await call({ assignmentId: F.AID });
    expect(Object.keys(ok.jsonBody).sort()).toEqual(["dispatched", "hasMore", "ok", "retryable", "scheduled"]);
    expect(JSON.stringify(ok.jsonBody)).not.toMatch(/22222222-|cg_|platform\//);
  });
});
