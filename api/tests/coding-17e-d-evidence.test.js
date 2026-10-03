import { describe, it, expect, afterAll } from "vitest";
import { createRequire } from "node:module";

// Phase 17E-D — the TEACHER coding evidence (server). ONE projection (official-grading.js teacherCodingEvidence) turns the
// published-snapshot question + the stored completed attempt into a teacher-safe evidence object; AssignmentReview is the only
// detailed consumer (lazy, one student / attempt); the gradebook gets a compact per-attempt summary only. Authority hierarchy:
//   runner → raw evidence · server → compares / scores / rebuilds · teacher → manual override wins · frontend → displays.
// Suites: TE (projection contract), RV (real review handler), AUTH (attacks), O (override authority), F3 (17E-C finding: an
// override never shows a final mark next to "automatic grading in progress"), REC (recovery), R (server races), AU (audit),
// GB / PAY (gradebook summary and payload separation), STU (student exposure canaries).
// Fail-first on 0fd6487b: some 17C behaviours already exist (snapshot authority, testId matching, manual-mode / non-coding
// absence, stale callbacks, override-wins rebuild) — those tests are written against `teacherCodingEvidence ?? codingAutoGradeView`
// and the review field `codingEvidence ?? codingAutoGrade` so a pre-existing behaviour is reported as such, not as a failure.
process.env.BANK_SETUP_KEY = process.env.BANK_SETUP_KEY || "e17d-test-only-secret";
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = () => require_("../src/functions/student-submission.js");
const dashboard = () => require_("../src/functions/student-dashboard.js");
const results = () => require_("../src/functions/assignment-results.js");
const review = () => require_("../src/functions/assignment-review.js");
const grading = () => require_("../src/functions/coding-grading.js");
const recovery = () => require_("../src/functions/coding-grading-recovery.js");
const official = () => require_("../src/lib/coding/official-grading.js");
const rebuild = () => require_("../src/lib/attempt-grade-rebuild.js");
const contract = () => require_("../src/lib/shared-finalization/codingContract.js");
afterAll(() => { if (process.env.BANK_SETUP_KEY === "e17d-test-only-secret") delete process.env.BANK_SETUP_KEY; });

const project = (q, a) => (official().teacherCodingEvidence || official().codingAutoGradeView)(q, a);
const evOf = q => (q ? (q.codingEvidence !== undefined ? q.codingEvidence : q.codingAutoGrade) : undefined);
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const teacherAuth = () => ({ ok: true, user: { sub: F.CANARY.teacherId } });
const quiet = { logInfo() {}, logWarn() {}, logError() {} };

function harness({ ctx = F.seed(), env = F.ENV, fetch = F.runnerFetch(), auth = teacherAuth } = {}) {
  const sDeps = { container: ctx.container, requireStudentAuth: studentAuth, env, fetch };
  const tDeps = { requireBuilderAuth: auth, getContainer: () => ctx.container, env, fetch };
  const cDeps = { getContainer: () => ctx.container, env };
  const reviewUrl = (n = 1, aid = F.AID, sid = F.S1) => "/api/assignment-review?assignmentId=" + encodeURIComponent(aid) + "&studentId=" + encodeURIComponent(sid) + "&attemptNumber=" + n;
  return {
    ctx, fetch, env,
    submit: answers => submission().handler(F.studentRequest(F.submitBody(answers)), sDeps, quiet),
    studentGet: () => submission().handler(F.studentRequest(null, "GET"), sDeps, quiet),
    dashboard: () => dashboard().handler({ method: "GET", url: "https://app.example.test/api/student-dashboard", params: {}, headers: new Headers({}), query: new URLSearchParams() }, { container: ctx.container, requireStudentAuth: studentAuth }, quiet),
    results: () => results().handler(F.teacherRequest("/api/assignment-results?assignmentId=" + F.AID, null, "GET"), tDeps, quiet),
    reviewGet: (n = 1, aid, sid) => review().handler(F.teacherRequest(reviewUrl(n, aid, sid), null, "GET"), tDeps, quiet),
    saveReview: (overrides, attemptNumber = 1) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber, overrides, teacherFeedback: "" }), tDeps, quiet),
    regrade: (body, deps = tDeps) => grading().regradeHandler(F.teacherRequest("/api/coding/regrade", body), deps, quiet),
    bulk: body => recovery().bulkRetryHandler(F.teacherRequest("/api/coding/bulk-retry", body), tDeps, quiet),
    callback: body => grading().callbackHandler(F.callbackRequest(body), cDeps, quiet),
    doc: () => ctx.getJson(F.SUB),
    setDoc: d => ctx.setJson(F.SUB, d),
    attempt: (n = 1) => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n),
    target: (n = 1, q = "auto1") => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === n).codingGrading.targets[q],
    patchTarget(fn, n = 1, q = "auto1") { const d = ctx.getJson(F.SUB); fn(d.attempts.find(a => a.attemptNumber === n).codingGrading.targets[q], d.attempts.find(a => a.attemptNumber === n)); ctx.setJson(F.SUB, d); },
    jobs: () => fetch.jobs(),
    audits: () => ctx.names("platform/audit/").map(n => ctx.getJson(n)),
    question: async (q = "auto1", n = 1) => (await this_reviewQuestions(ctx, tDeps, n)).find(x => x.questionId === q)
  };
}
async function this_reviewQuestions(ctx, tDeps, n) {
  const r = await review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=" + n, null, "GET"), tDeps, quiet);
  expect(r.status).toBe(200);
  return r.jsonBody.questions;
}
const SOURCE = "a,b=map(int,input().split());print('SUM='+str(a+b))\n";
const ANSWERS = { auto1: F.code(SOURCE), sa1: { kind: "text", value: "x" } };
const WRONG = "SUM=WRONG\n";
const regradeBody = (action, over = {}) => ({ action, assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, questionId: "auto1", ...over });
async function submitAndDispatch(h, answers = ANSWERS) { const r = await h.submit(answers); expect(r.status).toBe(200); return h.jobs()[h.jobs().length - 1]; }

// ── Pure projection fixtures ──────────────────────────────────────────────────────────────────────────────────────────
const CANARIES = { jobId: "cg_CANARYJOBID17D0000000000", gradingKey: "CANARY-GRADING-KEY-17D", answerHash: "CANARY-ANSWER-HASH-17D", questionFingerprint: "CANARY-FINGERPRINT-17D", targetRef: "tr_CANARYTARGETREF17D", leaseOwner: "dl_CANARYLEASEOWNER17D", engine: "CANARY-ENGINE-17D", delivery: "CANARY-DELIVERY-17D", callback: "CANARY-CALLBACK-SECRET-17D", hmac: "CANARY-RUNNER-HMAC-17D" };
const Q = (over = {}) => ({ questionId: "auto1", node: F.autoQ(over) });
const grade = (over = {}) => ({ questionId: "auto1", score: 0, maxMarks: 10, manualReview: false, ...over });
const okCase = (testId, over = {}) => ({ testId, status: "success", passed: true, durationMs: 5, ...over });
const result = (over = {}) => ({ revision: 1, jobId: CANARIES.jobId, engine: CANARIES.engine, automaticScore: 6.67, maxMarks: 10, passedWeight: 4, totalWeight: 6, testCount: 3, passedCount: 2, outcome: "graded", cases: [okCase("h-small"), { testId: "h-neg", status: "success", passed: false, durationMs: 7, actualPreview: "SUM=-4\n", stderrPreview: "warn" }, okCase("h-ten")], completedAt: "2026-03-01T10:00:00.000Z", ...over });
const target = (over = {}) => ({ mode: "hiddenTests", state: "complete", revision: 1, jobId: CANARIES.jobId, gradingKey: CANARIES.gradingKey, answerHash: CANARIES.answerHash, questionFingerprint: CANARIES.questionFingerprint, targetRef: CANARIES.targetRef, createdAt: "2026-03-01T09:59:00.000Z", updatedAt: "2026-03-01T10:00:00.000Z", delivery: { leaseOwner: CANARIES.leaseOwner, note: CANARIES.delivery }, recovery: { automaticAttempts: 0, exhausted: false }, result: result(), ...over });
const attemptOf = (t, over = {}) => ({ attemptNumber: 1, submittedAt: "2026-03-01T09:58:00.000Z", answers: { auto1: F.code(SOURCE) }, questionGrades: [grade({ score: 6.67 })], manualOverrides: {}, codingGrading: { version: 1, targets: { auto1: t } }, callbackSecret: CANARIES.callback, runnerHmac: CANARIES.hmac, ...over });

const EVIDENCE_KEYS = ["contract", "status", "automaticStatus", "revision", "resultRevision", "resultCurrent", "gradingMode", "language", "languageVersion", "scoringPolicy", "comparator", "testCount", "maxMarks", "automaticScore", "passedCount", "passedWeight", "totalWeight", "outcome", "completedAt", "compilePreview", "reviewRequired", "override", "effectiveScore", "recovery", "technicalCode", "incomplete", "cases"];   // 17F-C2 adds reviewRequired
const CASE_KEYS = ["testId", "title", "weight", "outcome", "durationMs", "expectedOutput", "actualPreview", "stderrPreview"];
const INTERNAL = /cg_CANARY|CANARY-GRADING-KEY|CANARY-ANSWER-HASH|CANARY-FINGERPRINT|tr_CANARY|dl_CANARY|CANARY-ENGINE|CANARY-DELIVERY|CANARY-CALLBACK|CANARY-RUNNER-HMAC|"jobId"|"gradingKey"|"answerHash"|"questionFingerprint"|"targetRef"|"leaseOwner"|"leaseExpiresAt"|"delivery"|"engine"|"automaticAttempts"|"lastAutomaticAttemptAt"|"manualRetryAt"|"exhausted"/;

describe("17E-D TE — teacherCodingEvidence: ONE strict, teacher-safe projection", () => {
  it("TE1a no internal identifier / secret / recovery internal reaches the projection (canaries planted everywhere)", () => {
    const v = project(Q(), attemptOf(target({ recovery: { automaticAttempts: 7, exhausted: false, lastAutomaticAttemptAt: "2026-03-01T10:00:00.000Z", manualRetryAt: "2026-03-01T10:01:00.000Z" } })));
    expect(JSON.stringify(v)).not.toMatch(INTERNAL);
  });
  it("TE1b the projection is a formal contract: exact evidence keys and exact case keys (never a spread of the stored target)", () => {
    const v = project(Q(), attemptOf(target()));
    expect(Object.keys(v).sort()).toEqual(EVIDENCE_KEYS.filter(k => k !== "compilePreview").sort());
    expect(v.contract).toBe(1);
    for (const c of v.cases) for (const k of Object.keys(c)) expect(CASE_KEYS, k).toContain(k);
  });
  it("TE2 complete CURRENT revision: status complete only when state complete AND result.revision === target.revision", () => {
    const v = project(Q(), attemptOf(target()));
    expect(v).toMatchObject({ status: "complete", automaticStatus: "complete", revision: 1, resultRevision: 1, resultCurrent: true, automaticScore: 6.67, maxMarks: 10, passedCount: 2, testCount: 3, outcome: "graded" });
  });
  it("TE3 an OLDER result while a newer revision runs is historical, never 'complete'", () => {
    const v = project(Q(), attemptOf(target({ state: "dispatched", revision: 2, result: result({ revision: 1 }) })));
    expect(v).toMatchObject({ status: "processing", revision: 2, resultRevision: 1, resultCurrent: false, automaticScore: 6.67 });
    // a "complete" target whose result belongs to another revision is inconsistent → never called complete
    const w = project(Q(), attemptOf(target({ state: "complete", revision: 2, result: result({ revision: 1 }) })));
    expect(w.status).not.toBe("complete");
    expect(w.incomplete).toBe(true);
  });
  it("TE4 a retryable TECHNICAL state: retrying, safe technical code, no automatic score, never a zero", () => {
    const v = project(Q(), attemptOf(target({ state: "retryable", technicalCode: "RUNNER_BUSY", result: undefined, recovery: { automaticAttempts: 2, exhausted: false } }), { questionGrades: [grade({ score: 0, manualReview: true })] }));
    expect(v).toMatchObject({ status: "retrying", technicalCode: "RUNNER_BUSY", automaticScore: null, effectiveScore: null, recovery: { state: "automatic" } });
  });
  it("TE5 recovery exhausted → delayed; a teacher retry (manualRetryAt, exhaustion reset) → manual recovery", () => {
    const d = project(Q(), attemptOf(target({ state: "retryable", technicalCode: "EXECUTION_FAILED", result: undefined, recovery: { automaticAttempts: 8, exhausted: true } })));
    expect(d).toMatchObject({ status: "delayed", recovery: { state: "delayed" } });
    const m = project(Q(), attemptOf(target({ state: "dispatched", result: undefined, recovery: { automaticAttempts: 0, exhausted: false, manualRetryAt: "2026-03-01T10:05:00.000Z" } })));
    expect(m).toMatchObject({ status: "processing", recovery: { state: "manual" } });
  });
  it("TE6 no answer: outcome no-answer, automatic 0 / max, no fabricated cases or runner evidence", () => {
    const v = project(Q(), attemptOf(target({ result: { revision: 1, automaticScore: 0, maxMarks: 10, passedWeight: 0, totalWeight: 6, testCount: 3, passedCount: 0, outcome: "no-answer", cases: [], completedAt: "2026-03-01T10:00:00.000Z" } }), { answers: {}, questionGrades: [grade({ score: 0 })] }));
    expect(v).toMatchObject({ status: "complete", outcome: "no-answer", automaticScore: 0, maxMarks: 10, language: null });
    expect(v.cases).toEqual([]);
  });
  it("TE7 a genuine compile error is grading evidence: compile-error, automatic 0, bounded compile preview", () => {
    const v = project(Q(), attemptOf(target({ result: result({ automaticScore: 0, passedWeight: 0, passedCount: 0, outcome: "compile-error", compilePreview: "Main.java:1: error: ';' expected", cases: [{ testId: "h-small", status: "compile-error", passed: false }, { testId: "h-neg", status: "compile-error", passed: false }, { testId: "h-ten", status: "compile-error", passed: false }] }) }), { answers: { auto1: F.code("class Main {", "java") } }));
    expect(v).toMatchObject({ status: "complete", outcome: "compile-error", automaticScore: 0, compilePreview: "Main.java:1: error: ';' expected", language: "java" });
    expect(v.cases.every(c => c.outcome === "compile-error")).toBe(true);
  });
  it("TE8–TE10 runtime error / timeout / output limit are STUDENT execution evidence with their own outcome", () => {
    const v = project(Q(), attemptOf(target({ result: result({ passedCount: 0, passedWeight: 0, automaticScore: 0, cases: [{ testId: "h-small", status: "runtime-error", passed: false, stderrPreview: "ZeroDivisionError" }, { testId: "h-neg", status: "timeout", passed: false }, { testId: "h-ten", status: "output-limit", passed: false, actualPreview: "y\ny\n" }] }) })));
    expect(v.cases.map(c => c.outcome)).toEqual(["runtime-error", "timeout", "output-limit"]);
    expect(v.cases[0].stderrPreview).toBe("ZeroDivisionError");
    const w = project(Q(), attemptOf(target()));
    expect(w.cases.map(c => c.outcome)).toEqual(["passed", "wrong-output", "passed"]);
  });
  it("TE11 proportional metadata (weights) / TE12 all-or-nothing metadata", () => {
    expect(project(Q(), attemptOf(target()))).toMatchObject({ scoringPolicy: "proportional", passedWeight: 4, totalWeight: 6, comparator: "trimTrailingWhitespace" });
    const aon = Q(); aon.node.answer.scoringPolicy = "allOrNothing";
    expect(project(aon, attemptOf(target({ result: result({ scoringPolicy: "allOrNothing", automaticScore: 0 }) })))).toMatchObject({ scoringPolicy: "allOrNothing", automaticScore: 0 });
  });
  it("TE13 a teacher override is the effective authority: automatic score kept as evidence, effective score from the server grade", () => {
    const a = attemptOf(target(), { manualOverrides: { auto1: { score: 8, comment: "", reviewedAt: "2026-03-01T11:00:00.000Z" } } });
    rebuild().rebuildAttemptGrades(a);
    const v = project(Q(), a);
    expect(v).toMatchObject({ status: "complete", automaticScore: 6.67, override: { active: true, score: 8 }, effectiveScore: 8 });
    const plain = project(Q(), attemptOf(target()));
    expect(plain).toMatchObject({ override: { active: false, score: null }, effectiveScore: 6.67 });
  });
  it("TE14 unknown / malformed stored data never throws and is flagged incomplete (bounded safe fallback)", () => {
    const shapes = [
      target({ state: "weird" }),
      target({ result: "garbage" }),
      target({ result: result({ cases: "x" }) }),
      target({ result: result({ revision: undefined }) }),
      target({ result: result({ passedCount: -3, automaticScore: "9", durationMs: "x" }) }),
      target({ result: result({ cases: [{ testId: "h-small", status: "success", passed: true, durationMs: -5 }] }) }),
      target({ state: "retryable", technicalCode: "<script>alert(1)</script>", result: undefined }),
      target({ revision: "two" })
    ];
    for (const t of shapes) {
      let v;
      expect(() => { v = project(Q(), attemptOf(t)); }).not.toThrow();
      expect(v).toBeTruthy();
      expect(JSON.stringify(v)).not.toMatch(/<script>/);
    }
    expect(project(Q(), attemptOf(target({ state: "weird" })))).toMatchObject({ status: "unknown", incomplete: true });
    expect(project(Q(), attemptOf(target({ result: result({ passedCount: -3 }) })))).toMatchObject({ incomplete: true, passedCount: null });
    expect(project(Q(), attemptOf(target({ state: "retryable", technicalCode: "<script>", result: undefined }))).technicalCode).toBe(null);
  });
  it("TE15 cases are correlated by the stable test id (snapshot order), an unknown id is ignored, a missing one is 'not run' — never fabricated", () => {
    const r = result({ cases: [{ testId: "h-ten", status: "success", passed: true }, { testId: "GHOST", status: "success", passed: false, actualPreview: "GHOST-OUTPUT" }, { testId: "h-small", status: "success", passed: false, actualPreview: "SUM=9\n" }] });
    const v = project(Q(), attemptOf(target({ result: r })));
    expect(v.cases.map(c => c.testId)).toEqual(["h-small", "h-neg", "h-ten"]);
    expect(v.cases.map(c => c.outcome)).toEqual(["wrong-output", "not-run", "passed"]);
    expect(v.cases[0].actualPreview).toBe("SUM=9\n");
    expect(v.cases[1].actualPreview).toBeUndefined();
    expect(JSON.stringify(v)).not.toMatch(/GHOST/);
  });
  it("TE17 manual-mode coding never shows automatic evidence, even with a stray stored target", () => {
    const manual = { questionId: "auto1", node: F.manualQ() };
    expect(project(manual, attemptOf(target()))).toBeNull();
  });
  it("TE18 non-coding questions return no automatic evidence", () => {
    expect(project({ questionId: "auto1", node: F.shortQ() }, attemptOf(target()))).toBeNull();
    expect(project(Q(), attemptOf(target(), { codingGrading: undefined }))).toBeNull();
  });
  it("TE19 every preview / expected output / case list is BOUNDED even when stored data is corrupt", () => {
    const max = contract().OFFICIAL_PREVIEW_BYTES;
    const huge = "X".repeat(100 * 1024);
    const many = Array.from({ length: 80 }, (_, i) => ({ testId: "h-small", status: "success", passed: false, actualPreview: huge + i }));
    const q = Q(); q.node.answer.hiddenTests[1].expectedOutput = "E".repeat(200 * 1024);
    const v = project(q, attemptOf(target({ result: result({ compilePreview: huge, outcome: "compile-error", cases: [{ testId: "h-small", status: "success", passed: false, actualPreview: huge, stderrPreview: huge }, ...many] }) })));
    expect(Buffer.byteLength(v.compilePreview, "utf8")).toBeLessThanOrEqual(max);
    for (const c of v.cases) {
      if (c.actualPreview !== undefined) expect(Buffer.byteLength(c.actualPreview, "utf8")).toBeLessThanOrEqual(max);
      if (c.stderrPreview !== undefined) expect(Buffer.byteLength(c.stderrPreview, "utf8")).toBeLessThanOrEqual(max);
      expect(Buffer.byteLength(c.expectedOutput, "utf8")).toBeLessThanOrEqual(contract().OFFICIAL_STDOUT_CAPTURE_BYTES);
    }
    expect(v.cases.length).toBe(3);
    expect(JSON.stringify(v).length).toBeLessThan(64 * 1024);
  });
  it("TE20 language + version come from the BOUND stored answer (canonical registry key), never a client value", () => {
    expect(project(Q(), attemptOf(target(), { answers: { auto1: F.code("class Main{}", "java") } }))).toMatchObject({ language: "java", languageVersion: 1 });
    expect(project(Q(), attemptOf(target(), { answers: { auto1: { kind: "code", language: "cobol", languageVersion: 1, source: "x" } } }))).toMatchObject({ language: null, languageVersion: null });
  });
  it("TE21 an unsupported question version (coding@2) is never interpreted with coding@1 semantics", () => {
    const v = project(Q({ questionTypeVersion: 2 }), attemptOf(target()));
    expect(v).toMatchObject({ status: "unsupported", cases: [], automaticScore: null });
  });
  it("TE22 F3 (teacher): a valid override while the automatic target is still OPEN → superseded (background evidence)", () => {
    const a = attemptOf(target({ state: "retryable", technicalCode: "RUNNER_BUSY", result: undefined }), { manualOverrides: { auto1: { score: 7, comment: "" } }, questionGrades: [grade({ score: 0, manualReview: true })] });
    rebuild().rebuildAttemptGrades(a);
    expect(project(Q(), a)).toMatchObject({ status: "superseded", automaticStatus: "retrying", override: { active: true, score: 7 }, effectiveScore: 7 });
  });
});

describe("17E-D RV / TE16 — the real review handler serves the projection from the PUBLISHED snapshot", () => {
  it("RV1 review GET carries codingEvidence (no legacy raw view) and no internal identifiers anywhere in the response", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    expect((await h.callback(F.callbackBody(job, [F.CANARY.expected[0], WRONG, F.CANARY.expected[2]]))).status).toBe(200);
    const r = await h.reviewGet();
    const q = r.jsonBody.questions.find(x => x.questionId === "auto1");
    expect(q.codingEvidence).toMatchObject({ status: "complete", resultCurrent: true, automaticScore: 6.67, language: "python" });
    expect(q.codingAutoGrade).toBeUndefined();
    const text = JSON.stringify(r.jsonBody);
    expect(text).not.toContain(job.jobId);
    expect(text).not.toMatch(/"gradingKey"|"answerHash"|"questionFingerprint"|"targetRef"|"leaseOwner"|"delivery"|tr_[0-9a-f]{20}/);
    expect(text).not.toContain(h.target().gradingKey);
  });
  it("TE16 evidence uses the exact published examSnapshot even after the teacher's Builder copy changed", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    // the teacher edits the Builder exam afterwards (different expected output / weight / title): never the review authority
    h.ctx.setJson("platform/exams/builder-copy.json", { title: "edited", questions: [{ examQuestionId: "auto1", answer: { hiddenTests: [{ id: "h-small", title: "EDITED-TITLE", input: "1 2\n", expectedOutput: "EDITED-EXPECTED\n", weight: 99 }] } }] });
    await h.callback(F.callbackBody(job, [WRONG, WRONG, WRONG]));
    const ev = evOf((await h.reviewGet()).jsonBody.questions.find(x => x.questionId === "auto1"));
    expect(JSON.stringify(ev)).not.toMatch(/EDITED/);
    expect(ev.cases[0].expectedOutput).toBe(F.CANARY.expected[0]);
    expect(ev.cases[0].title).toBe(F.CANARY.title);
  });
  it("RV2 the source shown is the immutable submitted attempt answer, byte-for-byte (not a draft / later attempt / practice)", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const d = h.doc(); d.draftAnswers = { auto1: F.code("DRAFT-SOURCE-AFTER-SUBMIT") }; h.setDoc(d);
    const q = (await h.reviewGet()).jsonBody.questions.find(x => x.questionId === "auto1");
    expect(q.studentAnswer.source).toBe(SOURCE);
  });
  it("RV3 manual-mode coding and non-coding questions carry no automatic evidence", async () => {
    const ctx = F.seed({ a: F.assignment({}, { manual: true }) });
    const h = harness({ ctx });
    await h.submit({ ...ANSWERS, manual1: F.code("print(1)") });
    const qs = (await h.reviewGet()).jsonBody.questions;
    expect(evOf(qs.find(x => x.questionId === "manual1"))).toBeUndefined();
    expect(evOf(qs.find(x => x.questionId === "sa1"))).toBeUndefined();
  });
});

describe("17E-D AUTH — teacher review / regrade / bulk retry attacks (real handlers)", () => {
  const realDeps = ctx => ({ getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch() });
  const req = (url, body, method, headers = {}) => ({ method, url: "https://app.example.test" + url, params: {}, headers: new Headers({ "content-type": "application/json", ...headers }), json: async () => body, text: async () => JSON.stringify(body) });
  it("AUTH1 anonymous → 401 on review GET, review save, regrade and bulk retry", async () => {
    const ctx = F.seed();
    expect((await review().handler(req("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1, null, "GET"), realDeps(ctx), quiet)).status).toBe(401);
    expect((await review().handler(req("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides: {} }, "POST"), realDeps(ctx), quiet)).status).toBe(401);
    expect((await grading().regradeHandler(req("/api/coding/regrade", regradeBody("force"), "POST"), realDeps(ctx), quiet)).status).toBe(401);
    expect((await recovery().bulkRetryHandler(req("/api/coding/bulk-retry", { assignmentId: F.AID }, "POST"), realDeps(ctx), quiet)).status).toBe(401);
  });
  it("AUTH2 a STUDENT token is refused by every teacher route; AUTH3 a forged / tampered teacher token is refused", async () => {
    const { createStudentToken } = require_("../src/lib/student-auth.js");
    const { createBuilderToken } = require_("../src/lib/builder-auth.js");
    const ctx = F.seed();
    const st = createStudentToken({ userId: F.S1, authVersion: 1, code: "S", displayName: "S", classId: F.CLASS_ID });
    const forged = createBuilderToken("teacher").replace(/.$/, c => (c === "A" ? "B" : "A"));
    for (const token of [st, forged, "not-a-token"]) {
      const H = { authorization: "Bearer " + token, "x-builder-token": token };
      expect((await review().handler(req("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1, null, "GET", H), realDeps(ctx), quiet)).status).toBe(401);
      expect((await grading().regradeHandler(req("/api/coding/regrade", regradeBody("retry"), "POST", H), realDeps(ctx), quiet)).status).toBe(401);
      expect((await recovery().bulkRetryHandler(req("/api/coding/bulk-retry", { assignmentId: F.AID }, "POST", H), realDeps(ctx), quiet)).status).toBe(401);
    }
  });
  it("AUTH4–AUTH7 wrong assignment / student / attempt / question → refused, nothing dispatched or written", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const before = JSON.stringify(h.doc()), dispatched = h.jobs().length;
    expect((await h.reviewGet(1, "asg-other")).status).toBe(404);
    expect((await h.reviewGet(1, F.AID, "22222222-2222-2222-2222-222222222222")).status).toBe(404);
    expect((await h.reviewGet(9)).status).toBe(404);
    for (const over of [{ assignmentId: "asg-other" }, { studentId: "22222222-2222-2222-2222-222222222222" }, { attemptNumber: 9 }, { questionId: "nope" }, { questionId: "sa1" }]) {
      for (const action of ["retry", "force"]) expect((await h.regrade(regradeBody(action, over))).status, JSON.stringify(over)).toBe(404);
    }
    expect(JSON.stringify(h.doc())).toBe(before);
    expect(h.jobs().length).toBe(dispatched);
  });
  it("AUTH5b a student of ANOTHER class whose submission names a different class is refused (403)", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const u = h.ctx.getJson("platform/users/" + F.S1 + ".json"); u.classId = "cls-elsewhere"; h.ctx.setJson("platform/users/" + F.S1 + ".json", u);
    const d = h.doc(); d.classId = "cls-elsewhere"; h.setDoc(d);
    expect((await h.reviewGet()).status).toBe(403);
  });
  it("AUTH8 / AUTH9 manual-mode coding and non-coding questions cannot be regraded", async () => {
    const ctx = F.seed({ a: F.assignment({}, { manual: true }) });
    const h = harness({ ctx });
    await h.submit({ ...ANSWERS, manual1: F.code("print(1)") });
    for (const action of ["retry", "force"]) {
      expect((await h.regrade(regradeBody(action, { questionId: "manual1" }))).status).toBe(404);
      expect((await h.regrade(regradeBody(action, { questionId: "sa1" }))).status).toBe(404);
    }
  });
  it("AUTH10 forged source / tests / score / revision / job id fields are refused before any work", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const before = JSON.stringify(h.doc()), dispatched = h.jobs().length;
    for (const extra of [{ source: "print('FORGED')" }, { hiddenTests: [] }, { expectedOutput: "x" }, { score: 10 }, { revision: 7 }, { jobId: "cg_FORGEDFORGEDFORGED00" }, { gradingKey: "k" }, { limits: { timeMs: 1 } }]) {
      expect((await h.regrade({ ...regradeBody("force"), ...extra })).status, Object.keys(extra)[0]).toBe(400);
    }
    expect(JSON.stringify(h.doc())).toBe(before);
    expect(h.jobs().length).toBe(dispatched);
    expect(JSON.stringify(h.jobs())).not.toMatch(/FORGED/);
  });
  it("AUTH11 malformed review identifiers are refused with 400 (never used as a storage path)", async () => {
    const h = harness();
    await submitAndDispatch(h);
    for (const [aid, sid, n] of [["../platform/users/x", F.S1, "1"], [F.AID, "../../x", "1"], [F.AID, F.S1, "abc"], [F.AID, F.S1, "1.5"], [F.AID, F.S1, "-2"]]) {
      const url = "/api/assignment-review?assignmentId=" + encodeURIComponent(aid) + "&studentId=" + encodeURIComponent(sid) + "&attemptNumber=" + n;
      expect((await review().handler(F.teacherRequest(url, null, "GET"), { requireBuilderAuth: teacherAuth, getContainer: () => h.ctx.container }, quiet)).status, aid + sid + n).toBe(400);
    }
  });
  it("AUTH12 a question whose authority cannot be validated (unsupported version) is never regraded", async () => {
    const a = F.assignment();
    a.examSnapshot.sections[0].questions[0].questionTypeVersion = 2;
    const h = harness({ ctx: F.seed({ a }) });
    await h.submit(ANSWERS);
    const before = JSON.stringify(h.doc()), dispatched = h.jobs().length;
    for (const action of ["retry", "force"]) {
      const r = await h.regrade(regradeBody(action));
      expect(r.status).toBe(409);
      expect(r.jsonBody.code).toBe("QUESTION_UNSUPPORTED");
    }
    expect(JSON.stringify(h.doc())).toBe(before);
    expect(h.jobs().length).toBe(dispatched);
  });
});

describe("17E-D O — automatic score vs teacher override (the canonical rebuild decides)", () => {
  async function graded(h, outputs = [F.CANARY.expected[0], WRONG, F.CANARY.expected[2]]) { const job = await submitAndDispatch(h); expect((await h.callback(F.callbackBody(job, outputs))).status).toBe(200); return job; }
  it("O1 automatic complete without override: effective = automatic, no override", async () => {
    const h = harness();
    await graded(h);
    const ev = evOf(await h.question());
    expect(ev).toMatchObject({ automaticScore: 6.67, effectiveScore: 6.67, override: { active: false } });
  });
  it("O2 a teacher override wins; the automatic score stays visible as evidence", async () => {
    const h = harness();
    await graded(h);
    expect((await h.saveReview({ auto1: { score: 8, comment: "" } })).status).toBe(200);
    expect(evOf(await h.question())).toMatchObject({ automaticScore: 6.67, override: { active: true, score: 8 }, effectiveScore: 8, status: "complete" });
  });
  it("O3 an automatic callback AFTER the override updates evidence only — the override is never erased", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    expect((await h.saveReview({ auto1: { score: 8, comment: "" } })).status).toBe(200);
    expect((await h.callback(F.callbackBody(job, F.CANARY.expected))).status).toBe(200);
    expect(h.attempt().manualOverrides.auto1.score).toBe(8);
    expect(evOf(await h.question())).toMatchObject({ automaticScore: 10, override: { active: true, score: 8 }, effectiveScore: 8 });
  });
  it("O4 / O5 force regrade after an override: new revision, new automatic result = evidence only; override stays authoritative", async () => {
    const h = harness();
    await graded(h, [WRONG, WRONG, F.CANARY.expected[2]]);                      // 3/6 weight → 5
    expect((await h.saveReview({ auto1: { score: 8, comment: "" } })).status).toBe(200);
    const r = await h.regrade(regradeBody("force"));
    expect(r.status).toBe(200);
    expect(r.jsonBody.revision).toBe(2);
    const job2 = h.jobs()[h.jobs().length - 1];
    expect((await h.callback(F.callbackBody(job2, F.CANARY.expected))).status).toBe(200);
    const a = h.attempt();
    expect(a.manualOverrides.auto1.score).toBe(8);
    expect(a.questionGrades.find(g => g.questionId === "auto1").score).toBe(8);
    expect(evOf(await h.question())).toMatchObject({ revision: 2, resultRevision: 2, resultCurrent: true, automaticScore: 10, override: { active: true, score: 8 }, effectiveScore: 8 });
  });
  it("O6 finality wording stays canonical: gradingStatus is deriveGradingStatus (final) — the evidence never decides it", async () => {
    const h = harness();
    await graded(h);
    const r = await h.reviewGet();
    expect(r.jsonBody.attempt.gradingStatus).toBe("final");
    expect(r.jsonBody.attempt.finalized).toBe(true);
  });
});

describe("17E-D F3 — an override never shows a final mark next to 'automatic grading in progress' for the STUDENT", () => {
  it("F3a override while the only target is still open: the student gets no open automatic status (field omitted), the mark is final", async () => {
    const h = harness({ fetch: F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })) });
    await h.submit(ANSWERS);
    expect(h.target().state).toBe("retryable");
    expect((await h.saveReview({ auto1: { score: 9, comment: "" } })).status).toBe(200);
    const st = (await h.studentGet()).jsonBody.state;
    expect(st.latestResult.gradingStatus).toBe("final");
    expect(st.latestResult.autoGradingStatus).toBeUndefined();
    expect(st.latestResult.autoGradingPending).toBeUndefined();
    const dash = JSON.stringify((await h.dashboard()).jsonBody);
    expect(dash).not.toMatch(/"autoGradingStatus":"(queued|processing|retrying|delayed)"|"autoGradingPending":true/);
    expect(h.target().state).toBe("retryable");                                  // backend state preserved (never silently resolved)
  });
  it("F3b two coding questions: one overridden open target + one complete target → complete; un-overridden open target still reported", async () => {
    const a = F.assignment();
    a.examSnapshot.sections[0].questions.push(F.autoQ({ examQuestionId: "auto2" }));
    const h = harness({ ctx: F.seed({ a }) });
    await h.submit({ ...ANSWERS, auto2: F.code(SOURCE) });
    const jobs = h.jobs(), j1 = jobs.find(j => h.target(1, "auto1").jobId === j.jobId);
    expect((await h.callback(F.callbackBody(j1, F.CANARY.expected))).status).toBe(200);
    let st = (await h.studentGet()).jsonBody.state;
    expect(st.latestResult.autoGradingStatus).toBe("processing");                // auto2 still open, no override
    expect((await h.saveReview({ auto2: { score: 4, comment: "" } })).status).toBe(200);
    st = (await h.studentGet()).jsonBody.state;
    expect(st.latestResult.autoGradingStatus).toBe("complete");
  });
});

describe("17E-D REC — recovery states in the teacher evidence", () => {
  const busy = () => F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } }));
  it("REC1 / REC6 runner down → retrying with a safe technical code; NEVER a zero (no automatic score, effective score null)", async () => {
    const h = harness({ fetch: busy() });
    await h.submit(ANSWERS);
    const ev = evOf(await h.question());
    expect(ev).toMatchObject({ status: "retrying", technicalCode: "RUNNER_BUSY", automaticScore: null, effectiveScore: null });
    expect(JSON.stringify(ev)).not.toMatch(/"automaticScore":0/);
  });
  it("REC2 exhaustion → delayed; REC3 a teacher retry resets exhaustion (manual recovery); REC5 the callback completes it", async () => {
    const fetch = F.runnerFetch();
    const h = harness({ fetch });
    await h.submit(ANSWERS);
    h.patchTarget(t => { t.state = "retryable"; t.technicalCode = "EXECUTION_FAILED"; t.recovery = { automaticAttempts: 8, exhausted: true, lastAutomaticAttemptAt: new Date(Date.now() - 3600e3).toISOString() }; });
    expect(evOf(await h.question())).toMatchObject({ status: "delayed", recovery: { state: "delayed" } });
    expect((await h.regrade(regradeBody("retry"))).status).toBe(200);
    expect(h.target().recovery.exhausted).toBe(false);
    expect(evOf(await h.question())).toMatchObject({ status: "processing", recovery: { state: "manual" }, revision: 1 });
    const job = fetch.jobs()[fetch.jobs().length - 1];
    expect((await h.callback(F.callbackBody(job, F.CANARY.expected))).status).toBe(200);
    expect(evOf(await h.question())).toMatchObject({ status: "complete", resultCurrent: true, automaticScore: 10, recovery: { state: "none" } });
  });
  it("REC4 a bulk retry is reflected by the NEXT detailed review read (no stale cached evidence)", async () => {
    const fetch = F.runnerFetch();
    const h = harness({ fetch });
    await h.submit(ANSWERS);
    h.patchTarget(t => { t.state = "retryable"; t.technicalCode = "RUNNER_BUSY"; t.updatedAt = new Date(Date.now() - 3600e3).toISOString(); t.recovery = { automaticAttempts: 8, exhausted: true }; });
    expect(evOf(await h.question()).status).toBe("delayed");
    const b = await h.bulk({ assignmentId: F.AID });
    expect(b.status).toBe(200);
    expect(b.jsonBody.scheduled).toBe(1);
    expect(evOf(await h.question())).toMatchObject({ status: "processing", recovery: { state: "manual" } });
  });
  it("REC7 force regrade during an outage keeps the revision context: revision 2 retrying, older result still shown as historical", async () => {
    let down = false;
    const fetch = F.runnerFetch(() => (down ? { status: 503, json: { ok: false, code: "RUNNER_BUSY" } } : { status: 202, json: { ok: true, accepted: true, duplicate: false } }));
    const h = harness({ fetch });
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, [F.CANARY.expected[0], WRONG, F.CANARY.expected[2]]));
    down = true;
    expect((await h.regrade(regradeBody("force"))).status).toBe(200);
    expect(evOf(await h.question())).toMatchObject({ status: "retrying", revision: 2, resultRevision: 1, resultCurrent: false, automaticScore: 6.67 });
    down = false;
    expect((await h.regrade(regradeBody("retry"))).status).toBe(200);
    const job2 = fetch.jobs()[fetch.jobs().length - 1];
    expect((await h.callback(F.callbackBody(job2, F.CANARY.expected))).status).toBe(200);
    expect(evOf(await h.question())).toMatchObject({ status: "complete", revision: 2, resultRevision: 2, resultCurrent: true, automaticScore: 10 });
  });
});

describe("17E-D R — server-side races", () => {
  it("R6 a manual override save and an automatic callback landing concurrently: both applied, the override stays authoritative", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    const [s, c] = await Promise.all([h.saveReview({ auto1: { score: 8, comment: "" } }), h.callback(F.callbackBody(job, F.CANARY.expected))]);
    expect(s.status).toBe(200); expect(c.status).toBe(200);
    const a = h.attempt();
    expect(a.manualOverrides.auto1.score).toBe(8);
    expect(a.codingGrading.targets.auto1.state).toBe("complete");
    expect(a.questionGrades.find(g => g.questionId === "auto1").score).toBe(8);
    expect(evOf(await h.question())).toMatchObject({ automaticScore: 10, effectiveScore: 8, override: { active: true } });
  });
  it("R7 a revision-1 callback arriving after a force regrade is stale and can never regress revision-2 evidence", async () => {
    const h = harness();
    const job1 = await submitAndDispatch(h);
    expect((await h.regrade(regradeBody("force"))).status).toBe(200);
    const job2 = h.jobs()[h.jobs().length - 1];
    expect(job2.jobId).not.toBe(job1.jobId);
    expect((await h.callback(F.callbackBody(job2, F.CANARY.expected))).status).toBe(200);
    const late = await h.callback(F.callbackBody(job1, [WRONG, WRONG, WRONG]));
    expect(late.status).toBe(409);
    expect(evOf(await h.question())).toMatchObject({ status: "complete", revision: 2, resultRevision: 2, automaticScore: 10 });
  });
  it("R8 two concurrent force regrades produce consecutive revisions; only the newest revision's result can land", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const [a, b] = await Promise.all([h.regrade(regradeBody("force")), h.regrade(regradeBody("force"))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.target().revision).toBe(3);
    const stale = h.jobs().filter(j => j.revision === 2);
    for (const j of stale) expect((await h.callback(F.callbackBody(j, F.CANARY.expected))).status).toBe(409);
  });
});

describe("17E-D AU — audit trail of teacher actions (identifiers only)", () => {
  it("AU1 force regrade and AU2 retry are each audited with actor, action, student, assignment, attempt, question, revision, mode, timestamp", async () => {
    const h = harness({ fetch: F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })) });
    await h.submit(ANSWERS);
    expect((await h.regrade(regradeBody("retry"))).status).toBe(200);
    expect((await h.regrade(regradeBody("force"))).status).toBe(200);
    const teacher = h.audits().filter(a => a.actor === F.CANARY.teacherId);
    const retry = teacher.find(a => a.details && a.details.mode === "retry"), force = teacher.find(a => a.details && a.details.mode === "force");
    expect(retry).toBeTruthy(); expect(force).toBeTruthy();
    for (const [e, rev] of [[retry, 1], [force, 2]]) {
      expect(e).toMatchObject({ targetType: "student", targetId: F.S1, details: { assignmentId: F.AID, attemptNumber: 1, questionId: "auto1", revision: rev } });
      expect(typeof e.timestamp).toBe("string");
    }
    const all = JSON.stringify(h.audits());
    expect(all).not.toContain(SOURCE.trim());
    expect(all).not.toMatch(/SUM=CANARY|CANARY-HIDDEN-TITLE|CANARY-REFERENCE|gradingKey|answerHash/);
  });
  it("AU3 a manual review save is audited with the overridden question ids (identifiers only, no source / outputs)", async () => {
    const h = harness();
    await submitAndDispatch(h);
    expect((await h.saveReview({ auto1: { score: 8, comment: "تعليق" } })).status).toBe(200);
    const e = h.audits().find(a => a.action === "assignment.manualGradeOverride");
    expect(e).toMatchObject({ actor: F.CANARY.teacherId, details: { assignmentId: F.AID, attemptNumber: 1, overriddenQuestions: 1, questionIds: ["auto1"] } });
    expect(JSON.stringify(e)).not.toContain(SOURCE.trim());
  });
});

describe("17E-D GB / PAY — compact gradebook summary, detailed evidence stays lazy", () => {
  it("GB1 each attempt row carries a compact codingEvidenceSummary; the assignment carries delayed / superseded totals", async () => {
    const h = harness({ fetch: F.runnerFetch(() => ({ status: 503, json: { ok: false, code: "RUNNER_BUSY" } })) });
    await h.submit(ANSWERS);
    let body = (await h.results()).jsonBody;
    let row = body.students.find(s => s.studentId === F.S1);
    expect(row.latestResult.codingEvidenceSummary).toEqual({ status: "retrying", openTargets: 1, delayedTargets: 0, supersededTargets: 0 });
    expect(row.latestResult.codingGrading).toEqual({ pending: 0, retryable: 1, stale: 0 });       // 17D-A shape unchanged
    h.patchTarget(t => { t.recovery = { automaticAttempts: 8, exhausted: true }; });
    body = (await h.results()).jsonBody;
    row = body.students.find(s => s.studentId === F.S1);
    expect(row.latestResult.codingEvidenceSummary).toEqual({ status: "delayed", openTargets: 1, delayedTargets: 1, supersededTargets: 0 });
    expect(body.codingEvidenceTotals).toEqual({ open: 1, delayed: 1, superseded: 0 });
    expect(body.codingSummary).toEqual({ pending: 0, retryable: 1, stale: 0 });                     // 17D-A shape unchanged
    expect((await h.saveReview({ auto1: { score: 5, comment: "" } })).status).toBe(200);
    body = (await h.results()).jsonBody;
    row = body.students.find(s => s.studentId === F.S1);
    expect(row.latestResult.codingEvidenceSummary).toEqual({ status: "superseded", openTargets: 0, delayedTargets: 0, supersededTargets: 1 });
    expect(body.codingEvidenceTotals).toEqual({ open: 0, delayed: 0, superseded: 1 });
  });
  it("GB2 a complete attempt summarises as complete; an attempt without coding targets carries no summary", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, F.CANARY.expected));
    const row = (await h.results()).jsonBody.students.find(s => s.studentId === F.S1);
    expect(row.latestResult.codingEvidenceSummary).toEqual({ status: "complete", openTargets: 0, delayedTargets: 0, supersededTargets: 0 });
    const ctx = F.seed({ a: F.assignment({}, { auto: F.shortQ() }) });
    const h2 = harness({ ctx });
    await h2.submit({ sa1: { kind: "text", value: "x" } });
    const row2 = (await h2.results()).jsonBody.students.find(s => s.studentId === F.S1);
    expect(row2.latestResult.codingEvidenceSummary).toBeUndefined();
  });
  it("PAY1 the bulk gradebook response never carries per-case evidence, expected outputs, previews or source", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, [WRONG, "PREVIEW-CANARY-17D\n", WRONG]));
    const text = JSON.stringify((await h.results()).jsonBody);
    expect(text).not.toMatch(/"cases"|expectedOutput|actualPreview|stderrPreview|compilePreview|PREVIEW-CANARY-17D|SUM=CANARY|CANARY-HIDDEN-TITLE|"codingEvidence"/);
    expect(text).not.toContain(SOURCE.trim());
    const detail = JSON.stringify((await h.reviewGet()).jsonBody);
    expect(detail).toMatch(/PREVIEW-CANARY-17D/);                                // the detail view is where evidence lives
  });
});

describe("17E-D STU — no teacher evidence ever reaches a student payload", () => {
  it("STU1 after grading, override and a force regrade, the student submission GET and dashboard carry no teacher evidence", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, [F.CANARY.expected[0], "STUDENT-LEAK-CANARY\n", F.CANARY.expected[2]]));
    await h.saveReview({ auto1: { score: 8, comment: "" } });
    await h.regrade(regradeBody("force"));
    const texts = [JSON.stringify((await h.studentGet()).jsonBody), JSON.stringify((await h.dashboard()).jsonBody)];
    for (const t of texts) expect(t).not.toMatch(/codingEvidence|codingEvidenceSummary|codingEvidenceTotals|effectiveScore|resultRevision|resultCurrent|automaticStatus|"override"|expectedOutput|actualPreview|stderrPreview|STUDENT-LEAK-CANARY|SUM=CANARY|technicalCode|"revision"/);
  });
});

describe("17E-D MIX / XA / FS — mixed exams, several coding questions, cross-attempt evidence, regrade source authority", () => {
  it("MIX1 coding automatic complete while a manual question still awaits review: evidence complete, attempt pendingReview", async () => {
    const h = harness();
    const job = await submitAndDispatch(h, { auto1: F.code(SOURCE) });                            // short answer left blank → manual review
    await h.callback(F.callbackBody(job, F.CANARY.expected));
    const r = (await h.reviewGet()).jsonBody;
    expect(evOf(r.questions.find(q => q.questionId === "auto1"))).toMatchObject({ status: "complete", automaticScore: 10, effectiveScore: 10 });
    expect(r.attempt.gradingStatus).toBe("pendingReview");
  });
  it("MIX2 each coding question has its OWN evidence; cases are never merged across questions", async () => {
    const a = F.assignment();
    a.examSnapshot.sections[0].questions.push(F.autoQ({ examQuestionId: "auto2", answer: { gradingMode: "hiddenTests", comparator: "exact", hiddenTests: [{ id: "q2-only", title: "Q2-TITLE", input: "9\n", expectedOutput: "Q2-EXPECTED\n", weight: 1 }] } }));
    const h = harness({ ctx: F.seed({ a }) });
    await h.submit({ ...ANSWERS, auto2: F.code("print('x')") });
    const j1 = h.jobs().find(j => j.jobId === h.target(1, "auto1").jobId), j2 = h.jobs().find(j => j.jobId === h.target(1, "auto2").jobId);
    await h.callback(F.callbackBody(j1, F.CANARY.expected));
    await h.callback(F.callbackBody(j2, ["nope\n"]));
    const qs = (await h.reviewGet()).jsonBody.questions;
    const e1 = evOf(qs.find(q => q.questionId === "auto1")), e2 = evOf(qs.find(q => q.questionId === "auto2"));
    expect(e1.cases.map(c => c.testId)).toEqual(["h-small", "h-neg", "h-ten"]);
    expect(e2.cases.map(c => c.testId)).toEqual(["q2-only"]);
    expect(e2).toMatchObject({ comparator: "exact", automaticScore: 0, testCount: 1 });
    expect(JSON.stringify(e1)).not.toMatch(/Q2-/);
  });
  it("XA1 attempt 1 (Python, 6.67) and attempt 2 (Java, 10) never mix: each review read carries its own source and evidence", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, [F.CANARY.expected[0], WRONG, F.CANARY.expected[2]]));
    const d = h.doc(), a1 = d.attempts[0];
    const a2 = JSON.parse(JSON.stringify(a1));
    a2.attemptNumber = 2; a2.submittedAt = new Date().toISOString();
    a2.answers.auto1 = F.code("class Main { public static void main(String[] a) {} }", "java");
    a2.codingGrading.targets.auto1.result = { ...a2.codingGrading.targets.auto1.result, automaticScore: 10, passedCount: 3, passedWeight: 6, cases: a2.codingGrading.targets.auto1.result.cases.map(c => ({ testId: c.testId, status: "success", passed: true })) };
    a2.questionGrades.find(g => g.questionId === "auto1").score = 10;
    d.attempts.push(a2); h.setDoc(d);
    const q1 = (await h.reviewGet(1)).jsonBody.questions.find(q => q.questionId === "auto1"), q2 = (await h.reviewGet(2)).jsonBody.questions.find(q => q.questionId === "auto1");
    expect(q1.studentAnswer.source).toBe(SOURCE);
    expect(evOf(q1)).toMatchObject({ language: "python", automaticScore: 6.67 });
    expect(q2.studentAnswer.language).toBe("java");
    expect(evOf(q2)).toMatchObject({ language: "java", automaticScore: 10 });
  });
  it("FS1 a force regrade grades the source STORED in the completed attempt — never a later draft / editor / practice source", async () => {
    const h = harness();
    await submitAndDispatch(h);
    const d = h.doc(); d.draftAnswers = { auto1: F.code("print('DRAFT-CANARY')") }; d.activeAttempt = null; h.setDoc(d);
    expect((await h.regrade(regradeBody("force"))).status).toBe(200);
    const job2 = h.jobs()[h.jobs().length - 1];
    expect(job2.source).toBe(SOURCE);
    expect(JSON.stringify(h.jobs())).not.toMatch(/DRAFT-CANARY/);
  });
  it("PR1 official evidence never mentions practice runs / public examples", async () => {
    const h = harness();
    const job = await submitAndDispatch(h);
    await h.callback(F.callbackBody(job, F.CANARY.expected));
    const ev = JSON.stringify(evOf(await h.question()));
    expect(ev).not.toMatch(/practice|publicTests|pub-1|sampleOutput|SUM=5/);
  });
});
