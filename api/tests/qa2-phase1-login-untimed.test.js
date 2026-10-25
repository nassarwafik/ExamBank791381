import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";

// QA round 2 (main 36dc60e9), phase 1 — the two high findings.
//
// QA2-1  (a regression of QA-19, #447) the login throttle counted guesses per identity keyed on the code AS TYPED, while the
//        account lookup falls back to the canonical identity. Every other spelling of one identity («١٢٣٤٥٦٧٨٩», «123-456-789»,
//        Persian digits, «12345678»…) opened a fresh budget and reached the same password check — after the lockout too, and the
//        correct password through a new spelling opened a session (200 instead of 429).
// QA2-2  an UNTIMED attempt left open past the due date was neither writable (the assignment is closed) nor finalizable
//        («لم تنتهِ مدة المحاولة بعد»): the answers the student saved were never graded unless the teacher ended it by hand, and
//        the student stayed «قيد التنفيذ» / «لم يسلّم». The due date now closes it like a timed or paused attempt.
//
// Real handlers on the in-memory container (real reserveLoginAttempt / clearLoginThrottle; the shared 17C fixtures).

const require_ = createRequire(import.meta.url);
const { handler: students } = require_("../src/functions/manage-students.js");
const { handler: login } = require_("../src/functions/platform-login.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const results = require_("../src/functions/assignment-results.js");

beforeAll(() => { process.env.STUDENT_SESSION_SECRET = process.env.STUDENT_SESSION_SECRET || "qa2-phase1-session-secret-0123456789ab"; });

describe("QA2-1 the login guess budget belongs to the identity, however it is typed", () => {
  const AUTH = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }), recordAuditEvent: async () => {} };
  const sreq = body => ({ method: "POST", url: "https://x/api/students", json: async () => body });
  const lreq = body => ({ method: "POST", url: "https://x/api/platform-login", headers: new Map(), json: async () => body });
  const loginDeps = ctx => ({ getContainer: () => ctx.container, clientIdFromRequest: () => "203.0.113.7", validateBuilderCredentials: () => false });
  async function seed(identityNumber = "123456789") {
    const ctx = createMemoryContainer();
    ctx.setJson("platform/classes/c1.json", { classId: "c1", name: "صف", active: true, studentIds: [] });
    const created = await students(sreq({ action: "create", classId: "c1", firstName: "علي", familyName: "حسن", identityNumber, password: "secret12" }), { ...AUTH, container: ctx.container });
    expect(created.status).toBe(200);
    return ctx;
  }
  const exhaust = async (ctx, code = "123456789") => { let last; for (let i = 0; i < 25; i++) last = await login(lreq({ userCode: code, password: "wrong-" + i }), loginDeps(ctx)); return last; };

  it("after the budget is exhausted, every other spelling of the same identity is throttled too (429, no password check)", async () => {
    const ctx = await seed();
    expect((await exhaust(ctx)).status).toBe(429);
    const variants = ["١٢٣٤٥٦٧٨٩", "۱۲۳۴۵۶۷۸۹", "123-456-789", "12345 6789", "1.23456789", "1/23456789"];
    const statuses = [];
    for (const v of variants) statuses.push((await login(lreq({ userCode: v, password: "wrong-x" }), loginDeps(ctx))).status);
    expect(statuses).toEqual(variants.map(() => 429));
  });

  it("the correct password through a fresh spelling does not open a session while the identity is locked out", async () => {
    const ctx = await seed();
    await exhaust(ctx);
    expect((await login(lreq({ userCode: "123456789", password: "secret12" }), loginDeps(ctx))).status).toBe(429);
    expect((await login(lreq({ userCode: "1234-56789", password: "secret12" }), loginDeps(ctx))).status).toBe(429);
  });

  it("guesses spread over several spellings share ONE budget (the short identity without its leading zero included)", async () => {
    // 8 guesses over 4 spellings = 2 per spelling: under every per-spelling budget (5 free), over the identity's own.
    const ctx = await seed("012345678");
    const spellings = ["012345678", "12345678", "٠١٢٣٤٥٦٧٨", "12-345-678"];
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await login(lreq({ userCode: spellings[i % spellings.length], password: "wrong-" + i }), loginDeps(ctx))).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.slice(5)).toEqual([429, 429, 429]);
  });

  it("unchanged: the QA-19 login with Arabic-Indic digits still works, and a success clears the identity's budget", async () => {
    const ctx = await seed();
    for (let i = 0; i < 3; i++) expect((await login(lreq({ userCode: "123456789", password: "wrong-" + i }), loginDeps(ctx))).status).toBe(401);
    expect((await login(lreq({ userCode: "١٢٣٤٥٦٧٨٩", password: "secret12" }), loginDeps(ctx))).status).toBe(200);
    for (let i = 0; i < 5; i++) expect((await login(lreq({ userCode: "123-456-789", password: "wrong-y" + i }), loginDeps(ctx))).status).toBe(401);
  });

  it("unchanged: a code with letters keys on itself — exhausting one does not throttle another", async () => {
    const ctx = await seed();
    expect((await exhaust(ctx, "ABC-123")).status).toBe(429);
    expect((await login(lreq({ userCode: "123456789", password: "secret12" }), loginDeps(ctx))).status).toBe(200);
  });
});

describe("QA2-2 the due date closes an untimed attempt, and the saved answers are graded", () => {
  const MIN = 60000;
  const SA = { sa1: { kind: "text", value: "x" } };
  const shortExam = () => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [F.shortQ()] }] });
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-x" } });
  function setup({ dueAt, startedAgoMin = 120 } = {}) {
    const started = new Date(Date.now() - startedAgoMin * MIN).toISOString();
    const a = F.assignment({ attemptModelVersion: 2, attemptPolicy: undefined, durationMinutes: 0, dueAt, examSnapshot: shortExam(), totalMarks: 2 });
    const doc = F.activeDoc(SA, { draftRevision: 3, activeAttempt: { attemptNumber: 1, startedAt: started, endsAt: "", durationMinutes: 0, status: "draft", lastSavedAt: new Date(Date.now() - 2 * MIN).toISOString() } });
    const ctx = F.seed({ a, doc });
    const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() };
    return {
      started,
      student: body => submission.handler(F.studentRequest(body), sDeps, null),
      get: () => submission.handler(F.studentRequest(null, "GET"), sDeps, null),
      results: body => results.handler(F.teacherRequest("/api/assignment-results", body), tDeps, null),
      doc: () => ctx.getJson(F.SUB)
    };
  }

  it("past the due date: the state says expired (end = the due date), submit is refused, and finalizing grades the server draft", async () => {
    const dueAt = new Date(Date.now() - 1 * MIN).toISOString();
    const x = setup({ dueAt });
    const st = (await x.get()).jsonBody.state;
    expect({ expired: st.attemptExpired, endsAt: st.effectiveAttemptEndsAt, canWrite: st.canWrite }).toEqual({ expired: true, endsAt: dueAt, canWrite: false });
    expect((await x.student({ action: "submit", answers: SA, expectedAttemptNumber: 1, expectedStartedAt: x.started })).status).toBe(409);
    const fin = await x.student({ action: "finalizeTimedOutAttempt" });
    expect(fin.status, JSON.stringify(fin.jsonBody)).toBe(200);
    const doc = x.doc();
    expect(doc.activeAttempt).toBeNull();
    expect(doc.attempts).toHaveLength(1);
    expect(doc.attempts[0]).toMatchObject({ score: 2, timedOut: true, endReason: "timedOut", endedAt: dueAt });
    expect(doc.attempts[0].answers).toEqual(SA);
  });

  it("a teacher ending such an attempt records it as timed out (the due date had already closed it)", async () => {
    const x = setup({ dueAt: new Date(Date.now() - 1 * MIN).toISOString() });
    const r = await x.results({ action: "endActiveAttempt", assignmentId: F.AID, studentId: F.S1, expectedAttemptNumber: 1, expectedStartedAt: x.started });
    expect(r.status, JSON.stringify(r.jsonBody)).toBe(200);
    expect(x.doc().attempts[0]).toMatchObject({ timedOut: true, score: 2 });
  });

  it("unchanged before the due date: no end, nothing to count down, writable, and finalize is refused", async () => {
    const x = setup({ dueAt: new Date(Date.now() + 60 * MIN).toISOString() });
    const st = (await x.get()).jsonBody.state;
    expect({ expired: st.attemptExpired, endsAt: st.effectiveAttemptEndsAt, canWrite: st.canWrite, timed: st.timed }).toEqual({ expired: false, endsAt: "", canWrite: true, timed: false });
    expect((await x.student({ action: "finalizeTimedOutAttempt" })).status).toBe(409);
    expect(x.doc().attempts || []).toHaveLength(0);
  });

  it("unchanged without a due date: an untimed attempt never expires", async () => {
    const x = setup({ dueAt: "", startedAgoMin: 60 * 24 * 30 });
    const st = (await x.get()).jsonBody.state;
    expect({ expired: st.attemptExpired, endsAt: st.effectiveAttemptEndsAt, canWrite: st.canWrite }).toEqual({ expired: false, endsAt: "", canWrite: true });
    expect((await x.student({ action: "finalizeTimedOutAttempt" })).status).toBe(409);
  });
});
