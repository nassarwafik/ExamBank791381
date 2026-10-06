import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import { compositeCsExam, CS_HIDDEN } from "../../src/composite/compositeFixtures";

// Phase 20D — a coding child of composite@1 participates in the EXISTING official hidden-test lifecycle (plan inside the attempt CAS, durable
// target, signed dispatch, HMAC callback, server-side scoring, canonical rebuild, recovery, teacher retry / regrade, teacher evidence) under a
// NEW server-owned target identity `<questionId>::part::<partId>`. The Runner protocol is untouched (opaque job id + target ref only) and
// every existing top-level target key / fingerprint / grading key / job id stays byte-identical (PINS captured on caac213).
// Fail-first on caac213: a composite question is unknown there, so no child target is ever planned and the coding child is never graded.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const recovery = () => require_("../src/lib/coding/grading-recovery.js");
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const comp = (parts, contexts = {}) => ({ kind: "composite", parts, contexts });
const KEY = "cs1::part::c1";
const CS_ANSWER = (source = "a,b=map(int,input().split())\nprint('SUM='+str(a+b))\n") => comp({ t1: { kind: "choice", index: 1 }, t2: { kind: "text", value: "6" }, c1: F.code(source), e1: { kind: "text", value: "تجمع الحلقة الأعداد." } });

function harness({ exam = compositeCsExam(), fetch = F.runnerFetch() } = {}) {
  const ctx = F.seed({ a: F.assignment({ examSnapshot: { title: "cs", metadata: {}, presentationTheme: "classic", sections: exam.sections }, totalMarks: 18, questionCount: 1 }) });
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch };
  const cDeps = { getContainer: () => ctx.container, env: F.ENV };
  return {
    ctx, fetch,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    reviewGet: () => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", null, "GET"), tDeps, quiet),
    saveReview: overrides => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "" }), tDeps, quiet),
    regrade: body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, quiet),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, quiet),
    sweep: now => recovery().runCodingGradingRecoverySweep(ctx.container, { requestId: "sw_20d_" + Math.random().toString(36).slice(2, 10), obs: quiet }, { env: F.ENV, fetch, now }),
    attempt: () => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1),
    target: (k = KEY) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1).codingGrading.targets[k],
    partGrade: pid => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1).questionGrades[0].parts.find(p => p.partId === pid)
  };
}

describe("20D-C1 top-level coding identities stay byte-identical (PINS captured on caac213)", () => {
  const attempt = (q, answer) => ({ attemptNumber: 1, submittedAt: "2026-01-01T00:00:00.000Z", answers: { auto1: answer }, questionGrades: [{ questionId: "auto1", score: 0, maxMarks: q.marks, countedMaxMarks: q.marks, manualReview: true }] });
  const exam = q => ({ sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [q] }] });
  const ids = { assignmentId: "asg-pin", studentId: "stu-pin", revision: 1 };
  const pick = a => ({ ok: a.ok, jobId: a.jobId, targetRef: a.targetRef, gradingKey: a.gradingKey, questionFingerprint: a.questionFingerprint, answerHash: a.answerHash, maxMarks: a.maxMarks });
  it("coding@1 and coding@2 top-level targets: job id, target ref, fingerprint, answer hash and grading key unchanged", () => {
    const v1 = F.autoQ(), v2 = F.autoQ({ questionTypeVersion: 2, answer: { ...F.autoQ().answer, compileErrorPolicy: "manualReview" } });
    const a1 = official().targetAuthority(exam(v1), attempt(v1, F.code("print(1)\n")), "auto1", ids);
    const a2 = official().targetAuthority(exam(v2), attempt(v2, F.code("print(2)\n", "java")), "auto1", ids);
    expect({ v1: pick(a1), v2: pick(a2) }).toEqual(PIN.topLevel);
  });
});

describe("20D-C2 composite coding child — the full official lifecycle", () => {
  it("submit plans ONE durable child target keyed <questionId>::part::<partId>; the Runner gets only opaque identifiers + stdin", async () => {
    const h = harness();
    expect((await h.submit({ cs1: CS_ANSWER() })).status).toBe(200);
    const t = h.target();
    expect(t).toMatchObject({ mode: "hiddenTests", revision: 1 });
    expect(["pending", "dispatched"]).toContain(t.state);
    expect(Object.keys(h.attempt().codingGrading.targets)).toEqual([KEY]);
    const jobs = h.fetch.jobs();
    expect(jobs).toHaveLength(1);
    expect(Object.keys(jobs[0]).sort()).toEqual(["cases", "jobId", "language", "languageVersion", "limits", "revision", "source", "targetRef"]);
    const wire = JSON.stringify(jobs[0]);
    expect(wire).not.toMatch(/SUM=10|HIDDEN-TITLE-20D|REFERENCE-SOLUTION-20D|cs1|::part::|"weight"|"marks"/);
    expect(jobs[0].cases.map(c => c.stdin)).toEqual(CS_HIDDEN.map(t => t.input));
    expect(h.partGrade("c1")).toMatchObject({ score: 0, manualReview: true });
    expect(h.attempt()).toMatchObject({ score: 4, manualReviewMarks: 14, finalized: false });
  });
  it("callback → child score applied → parent composite rebuilt → attempt total rebuilt; duplicate callback is idempotent; stale refused", async () => {
    const h = harness();
    await h.submit({ cs1: CS_ANSWER() });
    const job = h.fetch.jobs()[0];
    const r = await h.callback(F.callbackBody(job, ["SUM=3\n", "SUM=10\n"]));
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: true, applied: true, state: "complete" });
    expect(h.partGrade("c1")).toMatchObject({ score: 10, manualReview: false, correct: true });
    expect(h.attempt().questionGrades[0]).toMatchObject({ score: 14, manualReview: true });
    expect(h.attempt()).toMatchObject({ score: 14, manualReviewMarks: 4, finalized: false });
    const before = JSON.stringify(h.ctx.getJson(F.SUB));
    const dup = await h.callback(F.callbackBody(job, ["WRONG\n", "WRONG\n"]));
    expect(dup.status).toBe(200); expect(dup.jsonBody.alreadyApplied).toBe(true);
    expect(JSON.stringify(h.ctx.getJson(F.SUB))).toBe(before);
    const stale = await h.callback(F.callbackBody({ ...job, jobId: "cg_" + "0".repeat(40) }, ["SUM=3\n", "SUM=10\n"]));
    expect([404, 409]).toContain(stale.status);
    expect(JSON.stringify(h.ctx.getJson(F.SUB))).toBe(before);
  });
  it("a superseded revision's result is refused (409 STALE_RESULT) after a teacher force regrade of the child", async () => {
    const h = harness();
    await h.submit({ cs1: CS_ANSWER() });
    const first = h.fetch.jobs()[0];
    const rg = await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: KEY });
    expect(rg.status).toBe(200); expect(h.target().revision).toBe(2);
    const late = await h.callback(F.callbackBody(first, ["SUM=3\n", "SUM=10\n"]));
    expect(late.status).toBe(409); expect(late.jsonBody.code).toBe("STALE_RESULT");
    expect(h.partGrade("c1").score).toBe(0);
  });
  it("Runner unavailable → retryable target, the child stays in manual review — never a zero; the recovery sweep re-dispatches it", async () => {
    const down = F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));
    const h = harness({ fetch: down });
    await h.submit({ cs1: CS_ANSWER() });
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "RUNNER_BUSY" });
    expect(h.partGrade("c1")).toMatchObject({ manualReview: true, score: 0 });
    expect(h.attempt()).toMatchObject({ finalized: false });
    expect(h.attempt().manualReviewMarks).toBeGreaterThanOrEqual(10);
    const later = Date.now() + 60 * 60 * 1000;
    await h.sweep(() => later);
    expect(down.jobs().length).toBeGreaterThanOrEqual(2);
  });
  it("a compile error under the child's coding@2 manualReview policy holds the CHILD for the teacher (reviewRequired), never a zero", async () => {
    const h = harness();
    await h.submit({ cs1: CS_ANSWER() });
    const job = h.fetch.jobs()[0];
    const r = await h.callback({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr: "SyntaxError: invalid syntax" }, cases: [] });
    expect(r.status).toBe(200);
    expect(h.target().state).toBe("reviewRequired");
    expect(h.partGrade("c1")).toMatchObject({ score: 0, manualReview: true });
  });
  it("the teacher's per-part override is authoritative over the automatic child result (before and after the callback)", async () => {
    const h = harness();
    await h.submit({ cs1: CS_ANSWER() });
    expect((await h.saveReview({ [KEY]: { score: 7, comment: "يدوي" } })).status).toBe(200);
    const job = h.fetch.jobs()[0];
    await h.callback(F.callbackBody(job, ["SUM=3\n", "SUM=10\n"]));
    expect(h.partGrade("c1").score).toBe(7);
    expect(h.attempt().questionGrades[0].score).toBe(11);
    const st = official().studentCodingGradingStatus(h.attempt());
    expect(st).toBe("complete");
  });
  it("teacher review exposes the child's coding evidence under its child key (never job ids / grading keys); retry works on the child", async () => {
    const h = harness();
    await h.submit({ cs1: CS_ANSWER() });
    await h.callback(F.callbackBody(h.fetch.jobs()[0], ["SUM=3\n", "WRONG\n"]));
    const rq = (await h.reviewGet()).jsonBody.questions[0];
    const c1 = rq.compositeReview.parts.find(p => p.partId === "c1");
    expect(c1.childKey).toBe(KEY);
    expect(c1.codingEvidence).toMatchObject({ phase: "complete" });
    expect(JSON.stringify(rq)).not.toMatch(/"gradingKey"|"answerHash"|"questionFingerprint"|cg_[A-Za-z0-9]{20}/);
    const retry = await h.regrade({ action: "retry", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: KEY });
    expect(retry.status).toBe(409); expect(retry.jsonBody.code).toBe("ALREADY_COMPLETE");
  });
  it("an IGNORED (excess first-N) coding child or an unanswered child never generates a job", async () => {
    const e = compositeCsExam();
    const q = e.sections[0].questions[0];
    const code2 = JSON.parse(JSON.stringify(q.composite.groups[1].parts[0])); code2.id = "c2";
    q.composite.groups[1] = { id: "gCode", title: "x", gradingPolicy: "firstNAnswered", requiredAnswers: 1, maxMarks: 10, parts: [q.composite.groups[1].parts[0], code2] };
    q.composite.groups.push({ id: "gExp", gradingPolicy: "all", requiredAnswers: null, maxMarks: null, parts: [JSON.parse(JSON.stringify(compositeCsExam().sections[0].questions[0].composite.groups[1].parts[1]))] });
    const h = harness({ exam: e });
    await h.submit({ cs1: comp({ c1: F.code("print(1)\n"), c2: F.code("print(2)\n") }) });
    expect(Object.keys(h.attempt().codingGrading.targets)).toEqual(["cs1::part::c1"]);
    expect(h.fetch.jobs()).toHaveLength(1);
    const h2 = harness();
    await h2.submit({ cs1: comp({ t1: { kind: "choice", index: 1 } }) });
    expect(h2.fetch.jobs()).toHaveLength(0);
    expect(h2.target()).toMatchObject({ state: "complete", result: { outcome: "no-answer" } });
    expect(h2.partGrade("c1")).toMatchObject({ score: 0, manualReview: false });
  });
  it("the Runner tree is untouched by this phase (no runner/** import or protocol change needed)", () => {
    const src = fs.readFileSync(new URL("../src/lib/coding/official-grading.js", import.meta.url), "utf8");
    expect(src).not.toMatch(/require\("\.\.\/\.\.\/\.\.\/\.\.\/runner/);
  });
});

const PIN = {
  topLevel: {"v1":{"ok":true,"jobId":"cg_3c38009eccce4ee48d75e2d40d2142aa77c37d73","targetRef":"tr_aa95bf3a861e9411543e485af8ef042352a39efc","gradingKey":"c9b017ae8254b3950ca394481c3d24bbe70c8f827c65f114679b367e85410334","questionFingerprint":"b1a589805ccb1d5215ce71dd0ccba6d5672754c4cc20bac974cdb0ad5d3ea0ac","answerHash":"14228e9c641faa5f46c4501e1cc4af5a74506cd11fc848f30126b38f261d6feb","maxMarks":10},"v2":{"ok":true,"jobId":"cg_3c38009eccce4ee48d75e2d40d2142aa77c37d73","targetRef":"tr_aa95bf3a861e9411543e485af8ef042352a39efc","gradingKey":"3593899bb87ea0420f95d0bd3e037f3a68ee94ec2f00a8728e976a13d83000f9","questionFingerprint":"d71b8ee7a2d66dfa9e641e007d44dde26a41059e26c9afed3e20fe370184eb4a","answerHash":"9019bbd448e628a0dded6043832beaffd62c7c48debaa5a1a1d72446421056a5","maxMarks":10}}
};
