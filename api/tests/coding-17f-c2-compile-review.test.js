import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import crypto from "node:crypto";

// Phase 17F-C2 — Pedagogical compile-error review policy (server + shared model), driven through the REAL handlers against the
// in-memory container (fixture: ./fixtures/coding-17c.js). ONE teacher-owned policy on the PRIVATE key, `answer.compileErrorPolicy`:
//   "zero"         (the historical behaviour, and the LEGACY RESOLUTION when the field is absent) — a compile error is an automatic 0;
//   "manualReview" (the NEW-AUTHORING default) — the compiler's verdict is complete evidence, but NO authoritative automatic zero is
//                  applied: the question stays under teacher review (manualReview = true, manualReviewMarks += marks, attempt not
//                  final, student headline withheld, student status "reviewRequired") until the teacher's existing manual override.
// SmartAssess never decides that a syntax error is "minor" and never deducts a fixed amount: the teacher decides the mark.
// Fail-first on d2ae703b: PED1 (legacy compatibility pin) PASSES; everything that needs the policy fails.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const dashboard = () => require_("../src/functions/student-dashboard.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const sq = () => require_("../src/lib/shared-finalization/codingQuestion.js");
const sc = () => require_("../src/lib/shared-finalization/codingContract.js");
const { stableStringify } = require_("../src/lib/exam-canonical.js");

const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const sha256 = text => crypto.createHash("sha256").update(text, "utf8").digest("hex");

function harness({ ctx = F.seed(), env = F.ENV, fetch = F.runnerFetch() } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  const tDeps = { requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env, fetch };
  const cDeps = { getContainer: () => ctx.container, env };
  return {
    ctx, fetch,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    studentGet: () => submission().handler(F.studentRequest(null, "GET"), sDeps, quiet),
    dashboard: () => dashboard().handler({ method: "GET", url: "https://app.example.test/api/student-dashboard", params: {}, headers: new Headers({}), query: new URLSearchParams() }, { container: ctx.container, requireStudentAuth: studentAuth }, quiet),
    reviewGet: (n = 1) => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=" + n, null, "GET"), tDeps, quiet),
    saveReview: (overrides, attemptNumber = 1) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber, overrides, teacherFeedback: "" }), tDeps, quiet),
    regrade: body => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), tDeps, quiet),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, quiet),
    doc: () => ctx.getJson(F.SUB),
    attempt: (n = 1) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n),
    target: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).codingGrading.targets[q],
    grade: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).questionGrades.find(g => g.questionId === q),
    jobs: () => fetch.jobs(),
    events: () => ctx.names("platform/notifications/student/" + F.S1 + "/").map(n => ctx.getJson(n)).filter(e => e && e.type),
    audits: () => ctx.names("platform/audit/").map(n => ctx.getJson(n)).filter(e => String(e.action).startsWith("coding.autoGrade")),
    async evidence(q = "auto1", n = 1) { const r = await this.reviewGet(n); expect(r.status).toBe(200); return r.jsonBody.questions.find(x => x.questionId === q).codingEvidence; }
  };
}
const JAVA_MISSING_SEMICOLON = "public class Main {\n    public static void main(String[] args) {\n        int x = 5\n        System.out.println(x);\n    }\n}\n";
const JAVAC_STDERR = "Main.java:3: error: ';' expected\n        int x = 5\n                 ^\n1 error\n";
const CSHARP_SOURCE = "using System;\nclass Program { static void Main() { int x = 5 Console.WriteLine(x); } }\n";
const CSC_STDERR = "Program.cs(2,47): error CS1002: ; expected\n";
const ANSWERS = (source = JAVA_MISSING_SEMICOLON, language = "java") => ({ auto1: F.code(source, language), sa1: { kind: "text", value: "x" } });
const PY = "a,b=map(int,input().split());print('SUM='+str(a+b))\n";
// Review Fix 1 — "manualReview" is a coding@2 semantic: a question carrying it is authored at version 2; absent / "zero" / an unknown
// value stay on the historical coding@1 node (an unknown value must fail closed on BOTH versions — PED26 covers coding@2 too).
const policyQ = (compileErrorPolicy, over = {}) => F.autoQ({ questionTypeVersion: compileErrorPolicy === "manualReview" ? 2 : 1, answer: { gradingMode: "hiddenTests", comparator: "trimTrailingWhitespace", hiddenTests: JSON.parse(JSON.stringify(F.HIDDEN)), referenceSolutions: { python: F.CANARY.reference }, ...(compileErrorPolicy === undefined ? {} : { compileErrorPolicy }), ...over } });
const seeded = (compileErrorPolicy, over) => harness({ ctx: F.seed({ a: F.assignment({}, { auto: policyQ(compileErrorPolicy, over) }) }) });
const compileErrorCallback = (job, stderr = JAVAC_STDERR) => ({ jobId: job.jobId, outcome: "completed", compile: { status: "compile-error", stderr }, cases: [] });
const compiledCallback = (job, outputs) => ({ ...F.callbackBody(job, outputs), compile: { status: "compiled", durationMs: 900 } });
async function submitted(h, answers = ANSWERS()) { const r = await h.submit(answers); expect(r.status).toBe(200); return h.jobs()[h.jobs().length - 1]; }
/** The pre-C2 (17E-A) fingerprint formula, written out independently (limits are the server's normalized official limits — the
 *  17C contract, unchanged): the compatibility pin for every legacy question. Nothing about a compile-error policy appears here. */
const legacyFingerprint = (q, maxMarks) => sha256(stableStringify({ v: 1, questionId: q.examQuestionId, type: "coding", questionTypeVersion: 1, mode: "hiddenTests", comparator: q.answer.comparator, tests: q.answer.hiddenTests.map(t => ({ id: t.id, input: t.input, expectedOutput: t.expectedOutput, weight: t.weight })), limits: official().officialLimits(q.coding), allowedLanguages: q.coding.allowedLanguages, maxMarks, counted: maxMarks > 0, ...(q.answer.scoringPolicy === "allOrNothing" ? { scoringPolicy: "allOrNothing" } : {}) }));

describe("17F-C2 PED1 / PED22 / PED28 — the historical behaviour is PINNED: absent or explicit 'zero' ⇒ compile error = automatic 0, same fingerprint", () => {
  it("PED1 legacy question WITHOUT compileErrorPolicy: compile error → automatic 0, manualReview false, attempt final (compatibility pin — passes on the baseline)", async () => {
    const h = seeded(undefined);
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "compile-error", automaticScore: 0 }) });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(h.attempt()).toMatchObject({ finalized: true, manualReviewMarks: 0, score: 2 });
    expect(h.target().result.reviewRequired).toBeUndefined();
  });
  it("PED22 explicit compileErrorPolicy 'zero' behaves exactly like the legacy question", async () => {
    const h = seeded("zero");
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(h.attempt()).toMatchObject({ finalized: true, manualReviewMarks: 0 });
    expect(h.target().result.automaticScore).toBe(0);
    expect(h.target().result.reviewRequired).toBeUndefined();
  });
  it("PED28 / PED27 the legacy (absent) fingerprint is byte-identical to the pre-C2 formula, and an explicit 'zero' shares it — nothing about the policy is added for the historical value", async () => {
    const legacy = seeded(undefined), zero = seeded("zero");
    await submitted(legacy); await submitted(zero);
    const expected = legacyFingerprint(policyQ(undefined), 10);
    expect(legacy.target().questionFingerprint).toBe(expected);
    expect(zero.target().questionFingerprint).toBe(expected);
    expect(zero.target().answerHash).toBe(legacy.target().answerHash);                // same bound answer; the grading key itself also binds submittedAt (per attempt)
  });
  it("PED29 an in-flight job created under the pre-C2 fingerprint / grading key still applies after C2 (the legacy authority is unchanged)", async () => {
    const h = seeded(undefined);
    const job = await submitted(h);
    // the stored key is the legacy formula's key — exactly what a pre-C2 deployment wrote for this job
    const ids = { assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, submittedAt: h.attempt().submittedAt, targetKey: "auto1", revision: 1 };
    const legacyKey = sha256(stableStringify({ v: 1, ...ids, mode: "hiddenTests", questionFingerprint: legacyFingerprint(policyQ(undefined), 10), answerHash: sha256(stableStringify({ language: "java", languageVersion: 1, source: JAVA_MISSING_SEMICOLON })) }));
    expect(h.target().gradingKey).toBe(legacyKey);
    expect(h.ctx.getJson("platform/coding-grading-jobs/" + job.jobId + ".json").gradingKey).toBe(legacyKey);
    const r = await h.callback(compileErrorCallback(job));
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: true, applied: true, state: "complete" });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
  });
});

describe("17F-C2 PED2 / PED26 / PED27 / PED30 — the policy model: one shared authority, legacy resolution ≠ new-authoring default, unknown values fail closed", () => {
  it("PED2 defaultCodingAnswerKey() (NEW authoring) carries compileErrorPolicy 'manualReview'; the legacy RESOLUTION of an absent field is 'zero'", () => {
    expect(sq().CODING_COMPILE_ERROR_POLICIES).toEqual(["zero", "manualReview"]);
    expect(sq().defaultCodingAnswerKey().compileErrorPolicy).toBe("manualReview");
    expect(sq().codingCompileErrorPolicy({})).toBe("zero");
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: undefined })).toBe("zero");
    expect(sq().codingCompileErrorPolicy(null)).toBe("zero");
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "zero" })).toBe("zero");
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 2)).toBe("manualReview");   // RF1: manualReview is coding@2
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "manualReview" }, 1)).toBeUndefined();        // RF1: never a coding@1 semantic
    // an unknown value is NOT silently resolved to either policy by the resolver's callers: validation refuses it (PED26)
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "halfCredit" })).not.toBe("manualReview");
    expect(sq().codingCompileErrorPolicy({ compileErrorPolicy: "halfCredit" }, 2)).toBeUndefined();
  });
  it("PED26 validation (RF1, versioned): coding@1 — undefined / 'zero' valid, 'manualReview' needs the explicit coding@2 upgrade; coding@2 — 'zero' / 'manualReview' valid, absent fails; every other explicit value blocks finalization on both (never normalized)", () => {
    const codes = (version, answerOver) => sq().validateCodingQuestion({ ...policyQ(undefined), questionTypeVersion: version, answer: { ...policyQ(undefined).answer, ...answerOver } }).map(i => i.code);
    expect(codes(1, {})).toEqual([]);
    expect(codes(1, { compileErrorPolicy: "zero" })).toEqual([]);
    expect(codes(1, { compileErrorPolicy: "manualReview" })).toEqual(["CODING_COMPILE_ERROR_POLICY_REQUIRES_V2"]);
    expect(codes(2, { compileErrorPolicy: "zero" })).toEqual([]);
    expect(codes(2, { compileErrorPolicy: "manualReview" })).toEqual([]);
    expect(codes(2, {})).toEqual(["CODING_COMPILE_ERROR_POLICY_REQUIRED"]);
    for (const bad of ["half", "autoPartial", "ai", "halfCredit", "", null, 0, 1, true, {}, [], ["zero"], "ZERO", "manualreview"]) {
      expect(codes(1, { compileErrorPolicy: bad }), JSON.stringify(bad)).toContain("CODING_COMPILE_ERROR_POLICY_UNKNOWN");
      expect(codes(2, { compileErrorPolicy: bad }), JSON.stringify(bad)).toContain("CODING_COMPILE_ERROR_POLICY_UNKNOWN");
    }
  });
  it("PED26b the server grading authority fails CLOSED on an unknown policy: not gradeable, no zero committed, no runner call", async () => {
    const h = seeded("halfCredit");
    const r = await h.submit(ANSWERS());
    expect(r.status).toBe(200);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "QUESTION_INVALID" });
    expect(h.grade()).toMatchObject({ manualReview: true });
    expect(h.fetch.calls).toHaveLength(0);
  });
  it("PED30 'manualReview' changes the question fingerprint and grading key; 'zero' / absent do not (PED28)", async () => {
    const legacy = seeded(undefined), manual = seeded("manualReview");
    await submitted(legacy); await submitted(manual);
    expect(manual.target().questionFingerprint).not.toBe(legacy.target().questionFingerprint);
    expect(manual.target().gradingKey).not.toBe(legacy.target().gradingKey);
    const auth = official().targetAuthority(F.assignment({}, { auto: policyQ("manualReview") }).examSnapshot, manual.attempt(), "auto1", { assignmentId: F.AID, studentId: F.S1, revision: 1 });
    expect(auth.ok).toBe(true);
    expect(auth.compileErrorPolicy).toBe("manualReview");
    expect(auth.questionFingerprint).toBe(manual.target().questionFingerprint);
  });
});

describe("17F-C2 PED3–PED10 — manualReview policy: a compile error is COMPLETE evidence but never an authoritative automatic zero", () => {
  async function reviewRequired(h = seeded("manualReview"), stderr = JAVAC_STDERR) {
    const job = await submitted(h);
    const r = await h.callback(compileErrorCallback(job, stderr));
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: true, applied: true, state: "complete" });
    return { h, job };
  }
  it("PED3 / PED4 the target is TERMINAL in its own state reviewRequired (RF1-C — NOT retryable, NOT technical, never an overloaded 'complete') with outcome compile-error + reviewRequired; the grade stays manualReview = true and no automatic score is stored", async () => {
    const { h } = await reviewRequired();
    const t = h.target();
    expect(t.state).toBe("reviewRequired");
    expect(t.technicalCode).toBeUndefined();
    expect(t.result).toMatchObject({ outcome: "compile-error", reviewRequired: true, revision: 1, maxMarks: 10, testCount: 3, passedCount: 0, passedWeight: 0, totalWeight: 6 });
    expect(t.result.automaticScore).toBeUndefined();                                      // PED7: no misleading automaticScore: 0
    expect(t.result.completedAt).toBeTruthy();
    expect(h.grade()).toMatchObject({ manualReview: true, score: 0, reviewed: false });   // provisional base — not an awarded zero
  });
  it("PED5 / PED6 / PED7 manualReviewMarks includes the question's full marks, the attempt is not finalized, gradingStatus is pendingReview", async () => {
    const { h } = await reviewRequired();
    expect(h.attempt()).toMatchObject({ finalized: false, manualReviewMarks: 10, score: 2, totalMarks: 12 });
    const s = await h.studentGet();
    expect(s.status).toBe(200);
    expect(s.jsonBody.state.latestResult.gradingStatus).toBe("pendingReview");
  });
  it("PED8 / PED9 teacher evidence: outcome compile-error, reviewRequired true, automaticScore null, effectiveScore null, bounded compile preview, status complete, NOT incomplete", async () => {
    const { h } = await reviewRequired();
    const ev = await h.evidence();
    expect(ev).toMatchObject({ status: "complete", automaticStatus: "complete", outcome: "compile-error", reviewRequired: true, automaticScore: null, effectiveScore: null, incomplete: false, resultCurrent: true, language: "java", maxMarks: 10, override: { active: false, score: null } });
    expect(ev.compilePreview).toBe(JAVAC_STDERR);
    expect(ev.cases.every(c => c.outcome === "compile-error")).toBe(true);
  });
  it("PED34 a huge compiler diagnostic is bounded in the stored result AND in the evidence (OFFICIAL_PREVIEW_BYTES)", async () => {
    // the largest diagnostic the callback validator accepts (the Runner caps compile stderr at 32 KiB; anything larger is a 400,
    // not stored) — far above the 4 KiB evidence preview, with a canary at the tail that must NOT survive into the stored result
    const line = "Main.java:3: error: ';' expected\n", tail = "TAIL-CANARY-17FC2";
    const huge = line.repeat(Math.floor((32 * 1024 - tail.length) / line.length)) + tail;
    expect(Buffer.byteLength(huge, "utf8")).toBeLessThanOrEqual(32 * 1024);
    const { h } = await reviewRequired(seeded("manualReview"), huge);
    const max = sc().OFFICIAL_PREVIEW_BYTES;
    expect(Buffer.byteLength(huge, "utf8")).toBeGreaterThan(max);
    expect(Buffer.byteLength(h.target().result.compilePreview, "utf8")).toBeLessThanOrEqual(max);
    const ev = await h.evidence();
    expect(Buffer.byteLength(ev.compilePreview, "utf8")).toBeLessThanOrEqual(max);
    expect(ev.compilePreview).not.toContain("TAIL-CANARY-17FC2");
    expect(JSON.stringify(h.doc()).length).toBeLessThan(huge.length);
  });
  it("PED10 the student-safe status is 'reviewRequired' (server-derived), on the result and on the dashboard; the modern pending boolean is false while the PUBLIC legacy field carries the RF1 score-withhold bit", async () => {
    const { h } = await reviewRequired();
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("reviewRequired");
    expect(official().autoGradingPending(h.attempt())).toBe(false);
    const s = await h.studentGet();
    expect(s.jsonBody.state.latestResult.autoGradingStatus).toBe("reviewRequired");
    expect(s.jsonBody.state.latestResult.autoGradingPending).toBe(true);   // RF1-A: a cached pre-C2 client must still withhold the score
    const d = await h.dashboard();
    expect(d.status).toBe(200);
    const item = d.jsonBody.assignments.find(a => a.assignmentId === F.AID);
    expect(item.latestResult.autoGradingStatus).toBe("reviewRequired");
    expect(item.latestResult.gradingStatus).toBe("pendingReview");
  });
  it("PED20 no 'assignment_reviewed' / final automatic notification is emitted while the question awaits the teacher; the audit records the review-required completion", async () => {
    const { h } = await reviewRequired();
    expect(h.events().filter(e => e.type === "assignment_reviewed")).toHaveLength(0);
    const done = h.audits().filter(a => a.action === "coding.autoGrade.completed");
    expect(done).toHaveLength(1);
    expect(done[0].details).toMatchObject({ outcome: "compile-error", reviewRequired: true });
    expect(JSON.stringify(done)).not.toMatch(/int x = 5|expected|SUM=/);
  });
  it("PED31 / PED32 the student payload leaks nothing beyond the aggregate status: no policy, no compiler text, no evidence, no hidden tests, no identifiers", async () => {
    const { h } = await reviewRequired();
    for (const r of [await h.studentGet(), await h.dashboard()]) {
      const text = JSON.stringify(r.jsonBody).replace(/"autoGradingStatus":"reviewRequired"/g, "");
      expect(text).not.toMatch(/reviewRequired|compileErrorPolicy|manualReview"|compilePreview|';' expected|Main\.java|hiddenTests|expectedOutput|SUM=CANARY|CANARY-REFERENCE|CANARY-HIDDEN-TITLE|codingGrading|gradingKey|jobId|cg_|answerHash|questionFingerprint|scoringPolicy/);
    }
  });
  it("PED27 realistic C# compile error under manualReview: same semantics (review required, no zero, bounded diagnostic)", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h, ANSWERS(CSHARP_SOURCE, "csharp"));
    expect((await h.callback(compileErrorCallback(job, CSC_STDERR))).status).toBe(200);
    expect(h.grade()).toMatchObject({ manualReview: true });
    expect(h.attempt().finalized).toBe(false);
    const ev = await h.evidence();
    expect(ev).toMatchObject({ outcome: "compile-error", reviewRequired: true, automaticScore: null, effectiveScore: null, language: "csharp", compilePreview: CSC_STDERR });
  });
});

describe("17F-C2 PED15–PED19 — the EXISTING teacher override is the only marking authority; regrade and duplicates", () => {
  async function reviewRequired(h = seeded("manualReview")) { const job = await submitted(h); expect((await h.callback(compileErrorCallback(job))).status).toBe(200); return { h, job }; }
  it("PED15 / PED16 / PED27 the teacher awards 9.5 / 10 through the existing review: effective 9.5, review resolved, totals rebuilt, attempt final, student status complete", async () => {
    const { h } = await reviewRequired();
    const r = await h.saveReview({ auto1: { score: 9.5, comment: "" } });
    expect(r.status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 9.5, manualReview: false, reviewed: true });
    expect(h.attempt()).toMatchObject({ score: 11.5, manualReviewMarks: 0, finalized: true });
    expect((await h.studentGet()).jsonBody.state.latestResult).toMatchObject({ gradingStatus: "final", autoGradingStatus: "complete", score: 11.5 });
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("complete");
    const ev = await h.evidence();
    expect(ev).toMatchObject({ outcome: "compile-error", reviewRequired: true, automaticScore: null, override: { active: true, score: 9.5 }, effectiveScore: 9.5, status: "complete" });
    // the compile evidence stays available to the teacher after the override
    expect(ev.compilePreview).toBe(JAVAC_STDERR);
  });
  it("PED17 a duplicate compile-error callback is idempotent: no second mutation, no second audit, no notification, totals unchanged", async () => {
    const { h, job } = await reviewRequired();
    const before = JSON.stringify(h.doc()), audits = h.audits().length;
    const r = await h.callback(compileErrorCallback(job));
    expect(r.status).toBe(200); expect(r.jsonBody).toMatchObject({ ok: true, alreadyApplied: true });
    expect(JSON.stringify(h.doc())).toBe(before);
    expect(h.audits().length).toBe(audits);
    expect(h.events().filter(e => e.type === "assignment_reviewed")).toHaveLength(0);
  });
  it("PED18 a manual override saved BEFORE the compile callback is never replaced: the teacher score stays, the student never regresses to reviewRequired", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h);
    expect((await h.saveReview({ auto1: { score: 9.5, comment: "" } })).status).toBe(200);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    expect(h.attempt().manualOverrides.auto1.score).toBe(9.5);
    expect(h.grade()).toMatchObject({ score: 9.5, manualReview: false });
    expect(h.attempt()).toMatchObject({ finalized: true, manualReviewMarks: 0 });
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("complete");
    expect(await h.evidence()).toMatchObject({ reviewRequired: true, automaticScore: null, override: { active: true, score: 9.5 }, effectiveScore: 9.5 });
  });
  it("PED19 force regrade: a previous automatic score is NOT presented as the current effective score once the new revision compile-errors under manualReview", async () => {
    const h = seeded("manualReview");
    const job1 = await submitted(h, { auto1: F.code(PY), sa1: { kind: "text", value: "x" } });
    expect((await h.callback(compiledCallback(job1, F.CANARY.expected))).status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 10, manualReview: false });
    expect(h.attempt().finalized).toBe(true);
    const r = await h.regrade({ action: "force", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1" });
    expect(r.status).toBe(200); expect(r.jsonBody.revision).toBe(2);
    const job2 = h.jobs()[h.jobs().length - 1];
    expect((await h.callback(compileErrorCallback(job2, "<string>: compile-error-canary"))).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "reviewRequired", revision: 2, result: expect.objectContaining({ revision: 2, outcome: "compile-error", reviewRequired: true }) });
    expect(h.grade()).toMatchObject({ manualReview: true, score: 0 });
    expect(h.attempt()).toMatchObject({ finalized: false, manualReviewMarks: 10 });
    const ev = await h.evidence();
    expect(ev).toMatchObject({ revision: 2, resultRevision: 2, resultCurrent: true, automaticScore: null, effectiveScore: null, reviewRequired: true, override: { active: false } });
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("reviewRequired");
    expect((await h.studentGet()).jsonBody.state.latestResult.gradingStatus).toBe("pendingReview");
  });
});

describe("17F-C2 PED20–PED25 — every other outcome is unchanged under the manualReview policy", () => {
  it("PED20 compile succeeds → proportional scoring exactly as before (6.67 for 4/6 weight)", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h, { auto1: F.code(PY), sa1: { kind: "text", value: "x" } });
    expect((await h.callback(compiledCallback(job, [F.CANARY.expected[0], "SUM=WRONG\n", F.CANARY.expected[2]]))).status).toBe(200);
    expect(h.grade()).toMatchObject({ score: 6.67, manualReview: false });
    expect(h.target().result).toMatchObject({ automaticScore: 6.67, outcome: "graded" });
    expect(h.target().result.reviewRequired).toBeUndefined();
    expect(h.attempt().finalized).toBe(true);
  });
  it("PED21 compile succeeds → allOrNothing unchanged (partial pass = 0, full pass = 10)", async () => {
    const partial = seeded("manualReview", { scoringPolicy: "allOrNothing" });
    const j1 = await submitted(partial, { auto1: F.code(PY), sa1: { kind: "text", value: "x" } });
    expect((await partial.callback(compiledCallback(j1, [F.CANARY.expected[0], "SUM=WRONG\n", F.CANARY.expected[2]]))).status).toBe(200);
    expect(partial.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(partial.target().result).toMatchObject({ automaticScore: 0, outcome: "graded", scoringPolicy: "allOrNothing" });
    const full = seeded("manualReview", { scoringPolicy: "allOrNothing" });
    const j2 = await submitted(full, { auto1: F.code(PY), sa1: { kind: "text", value: "x" } });
    expect((await full.callback(compiledCallback(j2, F.CANARY.expected))).status).toBe(200);
    expect(full.grade()).toMatchObject({ score: 10, manualReview: false });
  });
  it("PED16b compileErrorPolicy is orthogonal to scoringPolicy: allOrNothing + manualReview + compile error ⇒ review required, not an automatic 0", async () => {
    const h = seeded("manualReview", { scoringPolicy: "allOrNothing" });
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    expect(h.grade()).toMatchObject({ manualReview: true });
    expect(h.target().result.automaticScore).toBeUndefined();
    expect(h.target().result.scoringPolicy).toBe("allOrNothing");
  });
  it("PED23 no answer remains an immediate automatic 0 (complete, no runner) — the policy only answers a real compile error", async () => {
    const h = seeded("manualReview");
    expect((await h.submit({ sa1: { kind: "text", value: "x" } })).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "complete", result: expect.objectContaining({ outcome: "no-answer", automaticScore: 0 }) });
    expect(h.grade()).toMatchObject({ score: 0, manualReview: false });
    expect(h.attempt().finalized).toBe(true);
    expect(h.fetch.calls).toHaveLength(0);
  });
  it("PED24 a Runner infrastructure failure stays retryable / technical — never manual review, never a zero", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h);
    expect((await h.callback({ jobId: job.jobId, outcome: "failed", technicalCode: "RUNNER_FAILED", cases: [] })).status).toBe(200);
    expect(h.target()).toMatchObject({ state: "retryable", technicalCode: "RUNNER_FAILED" });
    expect(h.target().result).toBeUndefined();
    expect(h.grade()).toMatchObject({ manualReview: true });
    expect(official().studentCodingGradingStatus(h.attempt())).toBe("retrying");
    // an invalid compile block is technical evidence, not a compile error
    const h2 = seeded("manualReview");
    const job2 = await submitted(h2);
    expect((await h2.callback({ jobId: job2.jobId, outcome: "completed", compile: { status: "exploded" }, cases: [] })).status).toBe(400);
    expect(h2.target().state).toBe("dispatched");
  });
  it("PED25 runtime-error semantics are unchanged: compiled program, failing cases → graded by the cases, no review flag", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h, { auto1: F.code(PY), sa1: { kind: "text", value: "x" } });
    const body = compiledCallback(job, [F.CANARY.expected[0], { status: "runtime-error", stdout: "", stderr: "Traceback", exitCode: 1 }, { status: "timeout", stdout: "" }]);
    expect((await h.callback(body)).status).toBe(200);
    expect(h.target().result).toMatchObject({ outcome: "graded", automaticScore: 1.67, passedCount: 1 });
    expect(h.target().result.reviewRequired).toBeUndefined();
    expect(h.grade()).toMatchObject({ score: 1.67, manualReview: false });
  });
  it("PED35 mixed exam: the other automatically marked question scores, the compile-review question withholds — the attempt stays provisional", async () => {
    const h = seeded("manualReview");
    const job = await submitted(h);
    expect((await h.callback(compileErrorCallback(job))).status).toBe(200);
    const res = (await h.studentGet()).jsonBody.state.latestResult;
    expect(res).toMatchObject({ score: 2, totalMarks: 12, manualReviewMarks: 10, gradingStatus: "pendingReview", autoGradingStatus: "reviewRequired" });
  });
});

describe("17F-C2 — studentCodingGradingStatus aggregation with reviewRequired", () => {
  const T = (state, over = {}) => ({ mode: "hiddenTests", state, revision: 1, jobId: "cg_x", gradingKey: "k", answerHash: "a", questionFingerprint: "f", ...over });
  const RR = T("reviewRequired", { result: { revision: 1, outcome: "compile-error", reviewRequired: true } });   // RF1-C: its own terminal state
  const DONE = T("complete", { result: { revision: 1, outcome: "graded", automaticScore: 5 } });
  const att = (targets, overrides = {}) => ({ attemptNumber: 1, questionGrades: Object.keys(targets).map(q => ({ questionId: q, score: 0, maxMarks: 10, manualReview: true })), manualOverrides: overrides, codingGrading: { version: 1, targets } });
  const s = a => official().studentCodingGradingStatus(a);
  it("precedence: automatic work still progressing wins (retrying > processing > queued), then delayed, then reviewRequired, then complete", () => {
    expect(s(att({ a: RR }))).toBe("reviewRequired");
    expect(s(att({ a: RR, b: DONE }))).toBe("reviewRequired");
    expect(s(att({ a: RR, b: T("pending") }))).toBe("queued");
    expect(s(att({ a: RR, b: T("dispatched") }))).toBe("processing");
    expect(s(att({ a: RR, b: T("retryable") }))).toBe("retrying");
    expect(s(att({ a: RR, b: T("retryable", { recovery: { exhausted: true } }) }))).toBe("delayed");
    expect(s(att({ a: DONE }))).toBe("complete");
  });
  it("a teacher override on the review-required question resolves it: complete (the stored compile evidence remains)", () => {
    expect(s(att({ a: RR }, { a: { score: 9.5 } }))).toBe("complete");
    expect(s(att({ a: RR, b: RR }, { a: { score: 9.5 } }))).toBe("reviewRequired");
    expect(s(att({ a: RR, b: RR }, { a: { score: 9.5 }, b: { score: 7 } }))).toBe("complete");
  });
  it("the legacy boolean stays false for a review-required target (automatic execution is complete) and the teacher summary stays bounded", () => {
    expect(official().autoGradingPending(att({ a: RR }))).toBe(false);
    expect(official().teacherCodingSummary(att({ a: RR }))).toMatchObject({ status: "complete", openTargets: 0 });
  });
});
