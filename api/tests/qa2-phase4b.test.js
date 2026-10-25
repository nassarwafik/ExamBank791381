import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// QA round 2 (main 36dc60e9), phase 4b — grading notices and access edges.
//
// QA2-14  (owner decision) a forced regrade that changed a FINAL mark (10 → 1.67) told the student nothing: the automatic notice was
//         sent only when the attempt first became final.
// QA2-15  a compound question (an automatic part + a part awaiting the teacher): every rebuild (any review save) counted the WHOLE
//         question as pending, so «العلامات بانتظار المراجعة» doubled (5 → 10).
// QA2-21  a technical callback that landed during the dispatch HTTP call: the target kept its code (QA-12), but the job record was
//         then overwritten to «dispatched» and lost the code.
// QA2-22  «تشغيل الكود» told a student that an unpublished assignment exists (403) where a missing id answers 404 (QA-17 gap).
// QA2-23  a live-game room kept a student moved to another class, or a class archived during the game, as a player (frozen list).
//
// Real handlers on the in-memory container (the shared 17C fixtures; the real coding-run, review, callback and live-room routes).

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const review = require_("../src/functions/assignment-review.js");
const grading = require_("../src/functions/coding-grading.js");
const codingRun = require_("../src/functions/coding-run.js");
const { handler: studentLive } = require_("../src/functions/game-live-session-student.js");
const { newSessionDoc, sessionDocName, applyJoin, applyStart } = require_("../src/lib/live-challenge-session-store.js");
const { createMemoryContainer } = require_("./fixtures/memory-container.js");
const { createFakeCodingExecutionProvider } = require_("./fixtures/fake-coding-execution-provider.js");
const { rebuildAttemptGrades } = require_("../src/lib/attempt-grade-rebuild.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const exam = questions => ({ title: "t", metadata: {}, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });

function harness({ a, fetch = F.runnerFetch() } = {}) {
  const ctx = F.seed(a ? { a } : {});
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  return {
    ctx, fetch,
    submit: answers => submission.handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    saveReview: (overrides, teacherFeedback = "") => review.handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback }), tDeps, quiet),
    regrade: action => grading.regradeHandler(F.teacherRequest("/api/coding/regrade", { action, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" }), tDeps, quiet),
    callback: body => grading.callbackHandler(F.callbackRequest(body), { getContainer: () => ctx.container, env: F.ENV }, quiet),
    attempt: () => ctx.getJson(F.SUB).attempts[0],
    job: jobId => ctx.getJson("platform/coding-grading-jobs/" + jobId + ".json"),
    notices: () => ctx.names("platform/notifications/student/" + F.S1 + "/").map(n => ctx.getJson(n)).filter(e => e && e.type === "assignment_reviewed")
  };
}

describe("QA2-14 a forced regrade that changes a final mark is announced to the student", () => {
  const onlyCoding = () => F.assignment({ examSnapshot: exam([F.autoQ()]), totalMarks: 10 });
  const ANSWERS = { auto1: F.code("print(1)\n") };
  it("final 10 → regrade → final 1.67: one more notice, carrying the new mark as a score change", async () => {
    const h = harness({ a: onlyCoding() });
    await h.submit(ANSWERS);
    await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
    expect(h.attempt()).toMatchObject({ finalized: true, score: 10 });
    expect(h.notices()).toHaveLength(1);
    expect((await h.regrade("force")).status).toBe(200);
    const job2 = h.fetch.jobs().at(-1);
    await h.callback(F.callbackBody(job2, [F.CANARY.expected[0], "W\n", "W\n"]));
    expect(h.attempt()).toMatchObject({ finalized: true, score: 1.67 });
    const notices = h.notices();
    expect(notices).toHaveLength(2);
    expect(notices.find(n => n.score === 1.67), JSON.stringify(notices)).toMatchObject({ becameFinal: false, scoreChanged: true, finalized: true, percentage: 16.7 });
  });
  it("a repeated delivery of the same regrade result notifies nothing more", async () => {
    const h = harness({ a: onlyCoding() });
    await h.submit(ANSWERS);
    await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
    await h.regrade("force");
    const body = F.callbackBody(h.fetch.jobs().at(-1), [F.CANARY.expected[0], "W\n", "W\n"]);
    await h.callback(body);
    await h.callback(body);
    expect(h.notices()).toHaveLength(2);
  });
  it("unchanged: a regrade that lands on the same final mark sends no notice", async () => {
    const h = harness({ a: onlyCoding() });
    await h.submit(ANSWERS);
    await h.callback(F.callbackBody(h.fetch.jobs()[0], F.CANARY.expected));
    await h.regrade("force");
    await h.callback(F.callbackBody(h.fetch.jobs().at(-1), F.CANARY.expected));
    expect(h.attempt()).toMatchObject({ finalized: true, score: 10 });
    expect(h.notices()).toHaveLength(1);
  });
});

describe("QA2-15 a compound question's pending marks survive a rebuild", () => {
  const cq = { examQuestionId: "cq", presentationType: "compound", marks: 10, parts: [{ id: "a", type: "trueFalse", marks: 5, answer: { correct: true } }, { id: "b", type: "shortAnswer", marks: 5 }] };
  const ANSWERS = { cq: { kind: "compound", parts: { a: { kind: "choice", index: 0 }, b: { kind: "text", value: "شرح" } } }, sa1: { kind: "text", value: "x" } };
  it("a feedback-only review save keeps 5 pending marks (only part b awaits the teacher), the score and the hold", async () => {
    const h = harness({ a: F.assignment({ examSnapshot: exam([cq, F.shortQ()]), totalMarks: 12 }) });
    expect((await h.submit(ANSWERS)).status).toBe(200);
    const before = h.attempt();
    expect(before.manualReviewMarks).toBe(5);
    expect((await h.saveReview({}, "أحسنت")).status).toBe(200);
    expect(h.attempt()).toMatchObject({ score: before.score, manualReviewMarks: 5, finalized: false });
  });
  it("fail closed: a held grade whose parts do not explain the hold still owes its whole counted max (never finalized early)", () => {
    const att = { totalMarks: 10, manualOverrides: {}, questionGrades: [{ questionId: "cq", score: 5, maxMarks: 10, countedMaxMarks: 10, manualReview: true, parts: [{ partId: "a", maxMarks: 5, manualReview: false }, { partId: "b", maxMarks: 5, manualReview: false }] }] };
    rebuildAttemptGrades(att);
    expect({ manualReviewMarks: att.manualReviewMarks, finalized: att.finalized }).toEqual({ manualReviewMarks: 10, finalized: false });
  });
  it("unchanged: marking the compound question finalizes the attempt", async () => {
    const h = harness({ a: F.assignment({ examSnapshot: exam([cq, F.shortQ()]), totalMarks: 12 }) });
    await h.submit(ANSWERS);
    await h.saveReview({ cq: { score: 8, comment: "" } });
    expect(h.attempt()).toMatchObject({ manualReviewMarks: 0, finalized: true, score: 10 });
  });
});

describe("QA2-21 the job record follows the target when a callback lands during dispatch", () => {
  it("a technical failure during the HTTP call: the job record stays retryable with its code (not «dispatched»)", async () => {
    let h;
    h = harness({ fetch: F.runnerFetch(async call => {
      await h.callback({ jobId: JSON.parse(call.body).jobId, outcome: "failed", technicalCode: "SANDBOX_FAILED", cases: [] });
      return { status: 202, json: { ok: true, accepted: true, duplicate: false } };
    }) });
    expect((await h.submit({ auto1: F.code("print(1)\n"), sa1: { kind: "text", value: "x" } })).status).toBe(200);
    const target = h.attempt().codingGrading.targets.auto1;
    expect(target).toMatchObject({ state: "retryable", technicalCode: "SANDBOX_FAILED" });
    expect(h.job(target.jobId)).toMatchObject({ state: "retryable", technicalCode: "SANDBOX_FAILED" });
  });
  it("unchanged: an ordinary dispatch marks the job record dispatched", async () => {
    const h = harness();
    await h.submit({ auto1: F.code("print(1)\n"), sa1: { kind: "text", value: "x" } });
    const target = h.attempt().codingGrading.targets.auto1;
    expect(target.state).toBe("dispatched");
    expect(h.job(target.jobId).state).toBe("dispatched");
  });
});

describe("QA2-22 «تشغيل الكود» never confirms that an unpublished assignment exists", () => {
  const BODY = { assignmentId: F.AID, questionId: "auto1", language: "python", languageVersion: 1, source: "print(1)\n", stdin: "" };
  const req = body => ({ method: "POST", url: "https://example.invalid/api/coding/run", params: {}, headers: new Headers({ "content-type": "application/json" }), query: new URLSearchParams(), text: async () => JSON.stringify(body), json: async () => body });
  const run = (ctx, body = BODY) => codingRun.runHandler(req(body), { container: ctx.container, requireStudentAuth: studentAuth, codingExecutionProvider: createFakeCodingExecutionProvider({ languages: [{ key: "python", languageVersion: 1 }] }), env: {} }, null);
  it("a never-published (draft) assignment answers 404, exactly like an unknown id", async () => {
    const draft = await run(F.seed({ a: F.assignment({ status: "draft" }), doc: null }));
    const unknown = await run(F.seed({ doc: null }), { ...BODY, assignmentId: "asg-does-not-exist" });
    expect({ status: draft.status, code: draft.jsonBody.code }).toEqual({ status: unknown.status, code: unknown.jsonBody.code });
    expect(draft.status).toBe(404);
  });
  it("an archived assignment the student never opened answers 404; with their submission it stays 403 (they know it exists)", async () => {
    expect((await run(F.seed({ a: F.assignment({ status: "archived" }), doc: null }))).status).toBe(404);
    expect((await run(F.seed({ a: F.assignment({ status: "archived" }) }))).status).toBe(403);
  });
});

describe("QA2-23 a live room follows the student's CURRENT class", () => {
  const SNAPSHOT = { schemaVersion: 1, challengeId: "ch1", title: "شبكات", questions: [{ source: { kind: "manual" }, question: { examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال؟", marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 } } }] };
  function room({ classId = "c1", archived = false } = {}) {
    let doc = newSessionDoc({ joinCode: "K7MX4P", teacherId: "t1", challengeId: "ch1", challengeTitle: "شبكات", classId, participants: [{ studentId: "s1", displayName: "أحمد" }], challengeSnapshot: SNAPSHOT, now: "2026-10-01T08:00:00.000Z" });
    doc = applyStart(applyJoin(doc, "s1", "2026-10-01T08:00:01.000Z"), "2026-10-01T08:01:00.000Z");
    return createMemoryContainer({ [sessionDocName("K7MX4P")]: doc, "platform/classes/c1.json": { classId: "c1", name: "صف", active: !archived, ...(archived ? { status: "archived" } : {}) } });
  }
  const call = (ctx, action, studentClassId, body = {}) => studentLive({ method: "POST", params: { action }, json: async () => ({ joinCode: "K7MX4P", ...body }) }, {
    requireActiveStudentSession: async () => ({ ok: true, user: { sub: "s1" }, student: { userId: "s1", role: "student", active: true, archived: false, classId: studentClassId }, container: ctx.container }),
    container: ctx.container
  });
  const answer = { roundVersion: 1, response: { kind: "choice", index: 1 } };
  it("a student moved to another class can no longer read or answer in the old class's room (403 not-in-class), nothing written", async () => {
    const ctx = room();
    const before = JSON.stringify(ctx.getJson(sessionDocName("K7MX4P")));
    const g = await call(ctx, "get", "c2"), a = await call(ctx, "answer", "c2", answer), j = await call(ctx, "join", "c2");
    expect([g, a, j].map(r => [r.status, r.jsonBody.code])).toEqual([[403, "not-in-class"], [403, "not-in-class"], [403, "not-in-class"]]);
    expect(JSON.stringify(ctx.getJson(sessionDocName("K7MX4P")))).toBe(before);
  });
  it("after the class is archived mid-game, its students can no longer answer (403 class-archived)", async () => {
    const ctx = room({ archived: true });
    const a = await call(ctx, "answer", "c1", answer);
    expect([a.status, a.jsonBody.code]).toEqual([403, "class-archived"]);
    expect(ctx.getJson(sessionDocName("K7MX4P")).participants[0].answers || []).toHaveLength(0);
  });
  it("unchanged: a current member of an active class answers; a room without a recorded class keeps the participant-list rule", async () => {
    expect((await call(room(), "answer", "c1", answer)).status).toBe(200);
    expect((await call(room({ classId: "" }), "answer", "c9", answer)).status).toBe(200);
    expect((await call(room({ classId: "" }), "get", "c9")).status).toBe(200);
  });
  it("the poll of an archived class's room still reads (no class read per poll); only the actions are refused", async () => {
    expect((await call(room({ archived: true }), "get", "c1")).status).toBe(200);
  });
});
