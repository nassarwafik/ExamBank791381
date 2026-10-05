import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";

// Phase 17F-C2 — Independent Review Fix 1: MIXED-VERSION / ROLLBACK SAFETY of the compile-error review policy (MV1–MV26).
//   RF1-A  a cached PRE-C2 (B1) student client must still WITHHOLD the score of a review-required result → the public payload keeps
//          the historical `autoGradingPending: true` as a score-withhold compatibility bit next to the modern `autoGradingStatus`.
//   RF1-B  manualReview semantics live in coding@2 (the versioned Question Type Catalog): coding@1 stays the historical contract
//          (absent / "zero" ⇒ automatic 0, byte-identical fingerprint); coding@1 + manualReview is REFUSED; coding@2 requires an
//          explicit, valid policy; a PRE-C2 server refuses coding@2 (fail closed — never an academic zero).
//   RF1-C  a review-required target is stored in its OWN terminal state "reviewRequired" (never overloading "complete"), so the
//          PRE-C2 status logic treats it as "not complete" (score withheld, no redispatch) after a rollback.
//   RF1-D  ONE canonical review-required derivation (state + current revision + outcome + flag; a teacher override resolves it).
// The "old server" / "old client" are the FROZEN pre-C2 functions in ./fixtures/pre-c2-status.js (verbatim from d2ae703).
// Fail-first on bd4a9389 (PR #251 head): compatibility pins pass; everything that needs RF1 fails.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const OLD = require_("./fixtures/pre-c2-status.js");
const submission = () => require_("../src/functions/student-submission.js");
const dashboard = () => require_("../src/functions/student-dashboard.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const recovery = () => require_("../src/lib/coding/grading-recovery.js");
const graders = () => require_("../src/lib/question-type-graders.js");
const sq = () => require_("../src/lib/shared-finalization/codingQuestion.js");
const catalog = () => require_("../src/lib/shared-finalization/questionTypeCatalog.js");
const defaults = () => require_("../src/lib/shared-finalization/questionTypeDefaults.js");
const { stableStringify } = require_("../src/lib/exam-canonical.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const sha256 = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const clock = (start = Date.now()) => { let t = start; const now = () => t; now.advance = ms => { t += ms; }; return now; };

function harness({ ctx = F.seed(), env = F.ENV, fetch = F.runnerFetch() } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env, fetch };
  const cDeps = { getContainer: () => ctx.container, env };
  return {
    ctx, fetch, env,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    studentGet: () => submission().handler(F.studentRequest(null, "GET"), sDeps, quiet),
    dashboard: () => dashboard().handler({ method: "GET", url: "https://app.example.test/api/student-dashboard", params: {}, headers: new Headers({}), query: new URLSearchParams() }, { container: ctx.container, requireStudentAuth: studentAuth }, quiet),
    reviewGet: (n = 1) => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=" + n, null, "GET"), tDeps, quiet),
    saveReview: (overrides, attemptNumber = 1) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber, overrides, teacherFeedback: "" }), tDeps, quiet),
    regrade: body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, quiet),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, quiet),
    sweep: (now = clock()) => recovery().runCodingGradingRecoverySweep(ctx.container, { requestId: "sw_rf1_" + Math.random().toString(36).slice(2, 10), obs: quiet }, { env, fetch, now }),
    doc: () => ctx.getJson(F.SUB),
    attempt: (n = 1) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n),
    target: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).codingGrading.targets[q],
    grade: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).questionGrades.find(g => g.questionId === q),
    jobs: () => fetch.jobs(),
    audits: () => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => String(e.action).startsWith("coding.autoGrade")),
    async evidence(q = "auto1", n = 1) { const r = await this.reviewGet(n); expect(r.status).toBe(200); return r.jsonBody.questions.find(x => x.questionId === q).codingEvidence; },
    async latest() { const r = await this.studentGet(); expect(r.status).toBe(200); return r.jsonBody.state.latestResult; }
  };
}
const JAVA_MISSING_SEMICOLON = "public class Main {\n    public static void main(String[] args) {\n        int x = 5\n        System.out.println(x);\n    }\n}\n";
const JAVAC_STDERR = "Main.java:3: error: ';' expected\n        int x = 5\n                 ^\n1 error\n";
const ANSWERS = (source = JAVA_MISSING_SEMICOLON, language = "java") => ({ auto1: F.code(source, language), sa1: { kind: "text", value: "x" } });
const KEY = () => ({ gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: JSON.parse(JSON.stringify(F.HIDDEN)), referenceSolutions: { python: F.CANARY.reference } });
/** A coding question at an explicit type version with an explicit (or absent) compile-error policy. */
const vQ = (version, compileErrorPolicy, over = {}) => F.autoQ({ questionTypeVersion: version, answer: { ...KEY(), ...(compileErrorPolicy === undefined ? {} : { compileErrorPolicy }) }, ...over });
const V1_LEGACY = () => vQ(1, undefined), V1_ZERO = () => vQ(1, "zero"), V2_ZERO = () => vQ(2, "zero"), V2_REVIEW = () => vQ(2, "manualReview");
const seeded = q => harness({ ctx: F.seed({ a: F.assignment({}, { auto: q }) }) });
const compileErrorCallback = (job, stderr = JAVAC_STDERR) => ({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr }, cases: [] });
async function submitted(h, answers = ANSWERS()) { const r = await h.submit(answers); expect(r.status).toBe(200); return h.jobs()[h.jobs().length - 1]; }
/** submit + compile-error callback on a coding@2 manualReview question → the review-required attempt. */
async function reviewRequired(h = seeded(V2_REVIEW())) { const job = await submitted(h); const r = await h.callback(compileErrorCallback(job)); expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true); return { h, job }; }
/** The pre-C2 (17E-A) fingerprint formula, written out independently — the compatibility pin for every coding@1 question. */
const legacyFingerprint = (q, maxMarks) => sha256(stableStringify({ v: 1, questionId: q.examQuestionId, type: "coding", questionTypeVersion: 1, mode: "hiddenTests", comparator: q.answer.comparator, tests: q.answer.hiddenTests.map(t => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput, weight: t.weight })), limits: official().officialLimits(q.coding), allowedLanguages: q.coding.allowedLanguages, maxMarks, counted: maxMarks > 0, ...(q.answer.scoringPolicy === "allOrNothing" ? { scoringPolicy: "allOrNothing" } : {}) }));
const codes = q => sq().validateCodingQuestion(q).map(i => i.code);

describe("RF1-A — a cached PRE-C2 (B1) student client must still withhold the score of a review-required result", () => {
  it("MV1 the public result carries BOTH the modern autoGradingStatus 'reviewRequired' AND the legacy withhold bit autoGradingPending: true (submission GET and dashboard)", async () => {
    const { h } = await reviewRequired();
    const lr = await h.latest();
    expect(lr).toMatchObject({ autoGradingStatus: "reviewRequired", autoGradingPending: true, gradingStatus: "pendingReview" });
    const d = await h.dashboard();
    const item = d.jsonBody.assignments.find(a => a.assignmentId === F.AID);
    expect(item.latestResult).toMatchObject({ autoGradingStatus: "reviewRequired", autoGradingPending: true });
    expect(JSON.stringify(lr)).not.toMatch(/compileErrorPolicy|compilePreview|';' expected|Main\.java|reviewRequired"\s*:/);   // the bit is the ONLY addition
  });
  it("MV2 the EXACT pre-C2 scoreWithheld resolver, fed the NEW server payload, withholds the score", async () => {
    const { h } = await reviewRequired();
    const lr = await h.latest();
    expect(OLD.codingGradingStatusOf(lr)).toBeUndefined();            // "reviewRequired" is unknown to the B1 client …
    expect(OLD.scoreWithheld(lr)).toBe(true);                         // … yet the legacy bit still withholds
  });
  it("MV3 the B1 headline rule never renders '0 / 12' for a review-required result (the attempt's provisional total stays hidden)", async () => {
    const { h } = await reviewRequired();
    const lr = await h.latest();
    expect(lr.score).toBe(2);                                         // provisional (the other question) — never shown by the old client either
    expect(OLD.headline(lr)).toBe("— / 12");
    expect(OLD.headline(lr)).not.toMatch(/^(0|2) \//);
  });
  it("MV4 the modern server helper is ONE function for both endpoints: legacyAutoGradingWithhold = pending || reviewRequired; the modern autoGradingPending stays false (execution is complete)", async () => {
    const { h } = await reviewRequired();
    const o = official();
    expect(typeof o.legacyAutoGradingWithhold).toBe("function");
    expect(o.legacyAutoGradingWithhold(h.attempt())).toBe(true);
    expect(o.autoGradingPending(h.attempt())).toBe(false);
    expect(o.studentCodingGradingStatus(h.attempt())).toBe("reviewRequired");
  });
  it("MV5 queued / processing / retrying / delayed keep their pre-RF1 projection exactly (status + autoGradingPending: true)", async () => {
    const h = seeded(V2_REVIEW());
    await submitted(h);                                                  // dispatched → processing
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "processing", autoGradingPending: true });
    const t = h.target();
    for (const [state, status] of [["pending", "queued"], ["retryable", "retrying"]]) {
      const doc = h.doc(); doc.attempts[0].codingGrading.targets.auto1 = { ...t, state, technicalCode: state === "retryable" ? "EXECUTION_FAILED" : undefined }; h.ctx.setJson(F.SUB, doc);
      expect(await h.latest()).toMatchObject({ autoGradingStatus: status, autoGradingPending: true });
    }
    const doc = h.doc(); doc.attempts[0].codingGrading.targets.auto1 = { ...t, state: "retryable", technicalCode: "RECOVERY_EXHAUSTED", recovery: { exhausted: true, automaticAttempts: 8 } }; h.ctx.setJson(F.SUB, doc);
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "delayed", autoGradingPending: true });
  });
  it("MV6 an ordinary complete result (a REAL automatic 0 under the historical policy) carries NO withhold bit: the old and new clients show 0 / 12", async () => {
    const h = seeded(V1_LEGACY());
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    const lr = await h.latest();
    expect(lr).toMatchObject({ autoGradingStatus: "complete", score: 2, gradingStatus: "final" });
    expect(lr.autoGradingPending).toBeUndefined();
    expect(OLD.scoreWithheld(lr)).toBe(false);
    expect(OLD.headline(lr)).toBe("2 / 12");
  });
});

describe("RF1-B — coding@1 is the historical contract, coding@2 carries the compile-error policy", () => {
  it("MV7 / MV16 legacy coding@1 (absent policy): same validation, byte-identical pre-C2 fingerprint, zero compile-error behaviour; an explicit V1 'zero' is identical", async () => {
    expect(codes(V1_LEGACY())).toEqual([]);
    expect(codes(V1_ZERO())).toEqual([]);
    const legacy = seeded(V1_LEGACY()), zero = seeded(V1_ZERO());
    const j1 = await submitted(legacy), j2 = await submitted(zero);
    const expected = legacyFingerprint(V1_LEGACY(), 10);
    expect(legacy.target().questionFingerprint).toBe(expected);
    expect(zero.target().questionFingerprint).toBe(expected);
    for (const [h, job] of [[legacy, j1], [zero, j2]]) {
      expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
      expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "compile-error", automaticScore: 0 }) });
      expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
      expect(h.attempt()).toMatchObject({ finalized: true, manualReviewMarks: 0 });
    }
  });
  it("MV8 coding@1 + manualReview is NEVER silently accepted: validation blocks it (explicit upgrade required) and the server authority fails closed (no zero, no runner call)", async () => {
    const q = vQ(1, "manualReview");
    expect(codes(q)).toContain("CODING_COMPILE_ERROR_POLICY_REQUIRES_V2");
    const h = seeded(q);
    expect((await h.submit(ANSWERS())).status).toBe(200);
    expect(h.jobs().length).toBe(0);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "QUESTION_INVALID" });
    expect(h.grade()).toMatchObject({ manualReview: true, score: 0 });
    expect(h.attempt().finalized).toBe(false);
  });
  it("MV9 the NEW-authoring defaults are coding@2 + manualReview (shared defaults registry, server copy)", () => {
    // Phase 19F — coding@3 (locked template) is the CURRENT version, but a NEW coding question is still AUTHORED at coding@2.
    expect(catalog().currentQuestionTypeVersion("coding")).toBe(3);
    expect(catalog().authoringQuestionTypeVersion("coding")).toBe(2);
    expect(defaults().hasRegisteredTypeDefaults("coding", 1)).toBe(true);
    expect(defaults().hasRegisteredTypeDefaults("coding", 2)).toBe(true);
    const seed = v => { const out = {}; defaults().applyRegisteredTypeDefaults("coding", v, (k, val) => { if (out[k] === undefined) out[k] = val; }, p => p + "-x"); return out; };
    expect(seed(2).answer).toMatchObject({ compileErrorPolicy: "manualReview" });
    expect(seed(1).answer.compileErrorPolicy).toBeUndefined();          // a V1 node seeded today keeps the historical shape
    expect(sq().defaultCodingAnswerKey()).toMatchObject({ compileErrorPolicy: "manualReview" });
  });
  it("MV10 coding@2 + zero is valid and grades a compile error as the historical automatic 0", async () => {
    expect(codes(V2_ZERO())).toEqual([]);
    const h = seeded(V2_ZERO());
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "compile-error", automaticScore: 0 }) });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "final" });
  });
  it("MV11 coding@2 + manualReview is valid and routes a compile error to teacher review", async () => {
    expect(codes(V2_REVIEW())).toEqual([]);
    const { h } = await reviewRequired();
    expect(h.grade()).toMatchObject({ score: 0, manualReview: true });
    expect(h.attempt()).toMatchObject({ finalized: false, manualReviewMarks: 10 });
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "reviewRequired", gradingStatus: "pendingReview" });
  });
  it("MV12 coding@2 with a MISSING or UNKNOWN policy fails closed: validation blocks finalization, the authority refuses to grade (never resolves to zero)", async () => {
    expect(codes(vQ(2, undefined))).toContain("CODING_COMPILE_ERROR_POLICY_REQUIRED");
    for (const bad of ["halfCredit", "", 1, null, true]) expect(codes(vQ(2, bad)), JSON.stringify(bad)).toContain("CODING_COMPILE_ERROR_POLICY_UNKNOWN");
    expect(sq().codingCompileErrorPolicy({}, 2)).toBeUndefined();
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "halfCredit" }, 2)).toBeUndefined();
    for (const q of [vQ(2, undefined), vQ(2, "halfCredit")]) {
      const h = seeded(q);
      expect((await h.submit(ANSWERS())).status).toBe(200);
      expect(h.jobs().length).toBe(0);
      expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "QUESTION_INVALID" });
      expect(h.grade()).toMatchObject({ manualReview: true });
    }
  });
  it("MV13 a PRE-C2 server supports coding@1 ONLY: coding@2 is unsupported (fail closed) — it can never execute a manualReview question as a zero-policy one", () => {
    expect(OLD.effectiveQuestionTypeVersion(undefined)).toBe(1);
    expect(OLD.effectiveQuestionTypeVersion(1)).toBe(1);
    expect(OLD.effectiveQuestionTypeVersion(2)).toBeUndefined();
    expect(OLD.versionUnsupported(V2_REVIEW())).toBe(true);           // gradeableQuestion → QUESTION_INVALID (retryable, no zero), regrade → QUESTION_UNSUPPORTED
    expect(OLD.versionUnsupported(V1_LEGACY())).toBe(false);
    // and the pre-C2 model had no notion of the policy at all: nothing in a V1 question can mean manualReview to it
    expect(sq().codingCompileErrorPolicy(V1_LEGACY().answer, 1)).toBe("zero");
  });
  it("MV14 every V1 runtime registry still resolves coding@1 (catalog, server grader, defaults, validator)", () => {
    const c = catalog();
    expect(c.supportsQuestionTypeVersion("coding", 1)).toBe(true);
    expect(c.effectiveQuestionTypeVersion("coding", undefined)).toBe(1);
    expect(c.effectiveQuestionTypeVersion("coding", 1)).toBe(1);
    expect(typeof graders().resolveGrader("coding", 1)).toBe("function");
    expect(typeof graders().resolveGrader("coding", undefined)).toBe("function");
    expect(defaults().hasRegisteredTypeDefaults("coding", 1)).toBe(true);
    expect(official().targetAuthority(F.exam({ auto: V1_LEGACY() }), { attemptNumber: 1, submittedAt: "2026-10-03T10:00:00.000Z", answers: ANSWERS(), questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] }, "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 }).ok).toBe(true);
  });
  // Phase 19F — coding@3 is now a supported version (the locked template); the "next, unsupported" version this pin guards is coding@4.
  it("MV15 every required V2 runtime registry resolves coding@2 (catalog, server grader, defaults, grading authority); coding@4 stays unsupported", () => {
    const c = catalog();
    expect(c.supportsQuestionTypeVersion("coding", 2)).toBe(true);
    expect(c.effectiveQuestionTypeVersion("coding", 2)).toBe(2);
    expect(c.effectiveQuestionTypeVersion("coding", 4)).toBeUndefined();
    expect(typeof graders().resolveGrader("coding", 2)).toBe("function");
    expect(graders().resolveGrader("coding", 4)).toBeUndefined();
    expect(defaults().hasRegisteredTypeDefaults("coding", 2)).toBe(true);
    const att = { attemptNumber: 1, submittedAt: "2026-10-03T10:00:00.000Z", answers: ANSWERS(), questionGrades: [{ questionId: "auto1", maxMarks: 10, score: 0, manualReview: true }] };
    expect(official().targetAuthority(F.exam({ auto: V2_REVIEW() }), att, "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 }).ok).toBe(true);
    expect(official().targetAuthority(F.exam({ auto: vQ(4, "manualReview") }), att, "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 })).toMatchObject({ ok: false, code: "QUESTION_INVALID" });
  });
  it("MV17 coding@2 zero and coding@2 manualReview have DIFFERENT fingerprints / grading keys, and both differ from coding@1", async () => {
    const fp = async q => { const h = seeded(q); await submitted(h); return h.target(); };
    const v1 = await fp(V1_LEGACY()), z2 = await fp(V2_ZERO()), r2 = await fp(V2_REVIEW());
    expect(new Set([v1.questionFingerprint, z2.questionFingerprint, r2.questionFingerprint]).size).toBe(3);
    expect(new Set([v1.gradingKey, z2.gradingKey, r2.gradingKey]).size).toBe(3);
  });
});

describe("RF1-C — the review-required target has its OWN terminal state (never an overloaded 'complete')", () => {
  it("MV18 new server: target state 'reviewRequired' (complete evidence, no automatic score) → student status reviewRequired, modern open = false, teacher aggregates see nothing open", async () => {
    const { h, job } = await reviewRequired();
    const t = h.target();
    expect(t.state).toBe("reviewRequired");
    expect(t.technicalCode).toBeUndefined();
    expect(t.result).toMatchObject({ revision: 1, jobId: job.jobId, outcome: "compile-error", reviewRequired: true });
    expect(t.result.automaticScore).toBeUndefined();
    const o = official();
    expect(o.studentCodingGradingStatus(h.attempt())).toBe("reviewRequired");
    expect(o.autoGradingPending(h.attempt())).toBe(false);
    expect(o.codingGradingStatus(h.attempt())).toBeNull();                                            // 17D-A gradebook aggregate: nothing open
    expect(o.teacherCodingSummary(h.attempt())).toMatchObject({ status: "complete", openTargets: 0, delayedTargets: 0 });
    const ev = await h.evidence();
    expect(ev).toMatchObject({ status: "complete", automaticStatus: "complete", reviewRequired: true, automaticScore: null, effectiveScore: null, resultCurrent: true, incomplete: false, outcome: "compile-error" });
    expect(h.ctx.getJson("platform/coding-grading-jobs/" + job.jobId + ".json").state).toBe("complete");       // the Runner JOB is acknowledged complete
  });
  it("MV19 the FROZEN pre-C2 server status logic applied to that stored attempt: not complete → autoGradingPending true, status 'processing' (generic, withheld — never 'complete')", async () => {
    const { h } = await reviewRequired();
    expect(OLD.autoGradingPending(h.attempt())).toBe(true);
    expect(OLD.studentCodingGradingStatus(h.attempt())).toBe("processing");
    expect(OLD.publicProjection(h.attempt())).toEqual({ autoGradingPending: true, autoGradingStatus: "processing" });
  });
  it("MV20 the FROZEN pre-C2 client applied to the pre-C2 server's projection of that attempt: score withheld, headline '— / 12'", async () => {
    const { h } = await reviewRequired();
    const oldPayload = { ...(await h.latest()), ...OLD.publicProjection(h.attempt()) };               // what a rolled-back API would send
    delete oldPayload.autoGradingStatus; Object.assign(oldPayload, OLD.publicProjection(h.attempt()));
    expect(OLD.scoreWithheld(oldPayload)).toBe(true);
    expect(OLD.headline(oldPayload)).toBe("— / 12");
  });
  it("MV20b the pre-C2 recovery sweep never redispatches the stored review-required target (not an active state)", async () => {
    const { h } = await reviewRequired();
    expect(OLD.recoveryDecision(h.target(), Date.now() + 10 * 60 * 60 * 1000)).toMatchObject({ eligible: false });
  });
  it("MV21 a duplicate compile-error callback is idempotent: alreadyApplied, no mutation, no second audit", async () => {
    const { h, job } = await reviewRequired();
    const before = JSON.stringify(h.doc()), audits = h.audits().length;
    const r = await h.callback(compileErrorCallback(job));
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: true, alreadyApplied: true });
    expect(JSON.stringify(h.doc())).toBe(before);
    expect(h.audits().length).toBe(audits);
    expect(h.target().state).toBe("reviewRequired");
  });
  it("MV22 the automatic recovery sweep does not touch a review-required target (not eligible; no dispatch), even far in the future", async () => {
    const { h, job } = await reviewRequired();
    expect(recovery().recoveryDecision(h.target(), Date.now() + 10 * 60 * 60 * 1000)).toMatchObject({ eligible: false });
    const jobsBefore = h.jobs().length, before = JSON.stringify(h.target());
    const now = clock(Date.now() + 10 * 60 * 60 * 1000);
    const r = await h.sweep(now);
    expect(r.dispatched || 0).toBe(0);
    expect(h.jobs().length).toBe(jobsBefore);
    expect(JSON.stringify(h.target())).toBe(before);
    expect(h.target().jobId).toBe(job.jobId);
  });
  it("MV23 a teacher 'retry' does not treat review-required as technical retryable work (409 ALREADY_COMPLETE; nothing dispatched)", async () => {
    const { h } = await reviewRequired();
    const jobsBefore = h.jobs().length;
    const r = await h.regrade({ action: "retry", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" });
    expect(r.status).toBe(409); expect(r.jsonBody.code).toBe("ALREADY_COMPLETE");
    expect(h.jobs().length).toBe(jobsBefore);
    expect(h.target().state).toBe("reviewRequired");
  });
  it("MV24 a teacher FORCE regrade creates revision 2 correctly (new job, previous result kept until the new callback; a compiling resubmission grades normally)", async () => {
    const { h } = await reviewRequired();
    const r = await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" });
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ revision: 2, state: "dispatched" });
    const t = h.target();
    expect(t).toMatchObject({ revision: 2, state: "dispatched" });
    expect(t.result).toMatchObject({ revision: 1, reviewRequired: true });                            // historical result stays until revision 2 lands
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "processing", autoGradingPending: true });
    const job2 = h.jobs()[h.jobs().length - 1];
    expect(job2.jobId).not.toBe(t.result.jobId);
    expect((await h.callback(compileErrorCallback(job2))).status).toBe(200);
    expect(h.target()).toMatchObject({ revision: 2, state: "reviewRequired", result: expect.objectContaining({ revision: 2, reviewRequired: true }) });
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "reviewRequired", autoGradingPending: true });
  });
  it("MV25 teacher override 9.5: student status complete, no withhold bit, effective 9.5; the target stays reviewRequired historically with its evidence", async () => {
    const { h } = await reviewRequired();
    expect((await h.saveReview({ auto1: { score: 9.5, comment: "" } })).status).toBe(200);
    expect(h.target().state).toBe("reviewRequired");
    const lr = await h.latest();
    expect(lr).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "final", score: 11.5, finalized: true });
    expect(lr.autoGradingPending).toBeUndefined();
    expect(official().legacyAutoGradingWithhold(h.attempt())).toBe(false);
    const ev = await h.evidence();
    expect(ev).toMatchObject({ status: "complete", reviewRequired: true, effectiveScore: 9.5, override: { active: true, score: 9.5 }, outcome: "compile-error" });
    expect(OLD.scoreWithheld(lr)).toBe(false);
    expect(OLD.headline(lr)).toBe("11.5 / 12");
  });
  it("MV26 teacher override 0: also resolves — a REAL, decided 0 is displayed (new and old client), never withheld", async () => {
    const { h } = await reviewRequired();
    expect((await h.saveReview({ auto1: { score: 0, comment: "" } })).status).toBe(200);
    const lr = await h.latest();
    expect(lr).toMatchObject({ autoGradingStatus: "complete", gradingStatus: "final", score: 2, finalized: true });
    expect(lr.autoGradingPending).toBeUndefined();
    expect(OLD.headline(lr)).toBe("2 / 12");
    expect((await h.evidence())).toMatchObject({ effectiveScore: 0, override: { active: true, score: 0 } });
  });
});

describe("RF1-D — ONE canonical review-required derivation (fail safe: corrupt / stale evidence withholds, never fabricates a zero)", () => {
  it("MV27 the helper requires state reviewRequired + a CURRENT result revision + outcome compile-error + the flag; an override resolves the STUDENT status only", async () => {
    const o = official();
    expect(typeof o.reviewRequiredTarget).toBe("function");
    const { h } = await reviewRequired();
    expect(o.reviewRequiredTarget(h.target())).toBe(true);
    const t = h.target();
    expect(o.reviewRequiredTarget({ ...t, state: "complete" })).toBe(false);
    expect(o.reviewRequiredTarget({ ...t, result: { ...t.result, revision: 7 } })).toBe(false);
    expect(o.reviewRequiredTarget({ ...t, result: { ...t.result, outcome: "graded" } })).toBe(false);
    expect(o.reviewRequiredTarget({ ...t, result: { ...t.result, reviewRequired: undefined } })).toBe(false);
    expect(o.reviewRequiredTarget({ ...t, result: undefined })).toBe(false);
  });
  it("MV28 a target in state reviewRequired whose result is stale / malformed is NOT a decided zero: student status withheld (processing), teacher evidence incomplete, never 'complete' with a score", async () => {
    const { h } = await reviewRequired();
    const doc = h.doc(); const t = doc.attempts[0].codingGrading.targets.auto1;
    t.result = { ...t.result, revision: 7 }; h.ctx.setJson(F.SUB, doc);
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("processing");
    expect(official().legacyAutoGradingWithhold(h.attempt())).toBe(true);
    expect(await h.latest()).toMatchObject({ autoGradingStatus: "processing", autoGradingPending: true });
    const ev = await h.evidence();
    expect(ev.incomplete).toBe(true);
    expect(ev.automaticStatus).not.toBe("complete");
    expect(ev.effectiveScore).toBeNull();
    expect(ev.automaticScore).toBeNull();
  });
});
