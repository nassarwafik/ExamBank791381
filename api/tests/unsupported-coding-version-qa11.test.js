import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

// QA-11 — a student's code on a coding question of a type version this server does not support.
//
// Fail-first (QA on main c244cbab; fail-first run on 46ba9297): during a rollback window (a newer coding version published,
// then the API rolled back), normalizeDraftAnswers could not bind the answer to an unknown contract and DROPPED it — on every
// autosave (200) and on submit. Grading already sent the question to the teacher, but the teacher saw «لا إجابة»: the code the
// student wrote no longer existed anywhere. The answer is now kept in its bounded canonical shape; it is never executed (no
// runner job), and the question stays under teacher review.
//
// Real submission handler on the shared 17C fixtures.

const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const submission = require_("../src/functions/student-submission.js");
const { normalizeDraftAnswers } = require_("../src/lib/draft-answers.js");

const quiet = { logInfo() {}, logWarn() {}, logError() {} };
const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
const CODE = F.code("print(1)\n");
const unsupported = () => F.autoQ({ questionTypeVersion: 99 });
const deps = (ctx, fetch) => ({ container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch });
const identity = { expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 };

describe("QA-11 code on an unsupported coding version is kept for the teacher, never silently dropped", () => {
  it("submit: the code is in the attempt, the question is under review, nothing is sent to the Runner", async () => {
    const ctx = F.seed({ a: F.assignment({}, { auto: unsupported() }) });
    const fetch = F.runnerFetch();
    const r = await submission.handler(F.studentRequest(F.submitBody({ auto1: CODE, sa1: { kind: "text", value: "x" } })), deps(ctx, fetch), quiet);
    expect(r.status).toBe(200);
    const a = ctx.getJson(F.SUB).attempts[0];
    expect(a.answers.auto1).toEqual(CODE);
    expect(a.questionGrades.find(g => g.questionId === "auto1")).toMatchObject({ manualReview: true });
    expect(a.finalized).toBe(false);
    expect(fetch.jobs()).toHaveLength(0);
  });

  it("autosave: the server draft keeps the code (a reload shows it)", async () => {
    const ctx = F.seed({ a: F.assignment({}, { auto: unsupported() }) });
    const r = await submission.handler(F.studentRequest({ action: "saveDraft", answers: { auto1: CODE }, ...identity }), deps(ctx, F.runnerFetch()), quiet);
    expect(r.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.auto1).toEqual(CODE);
  });

  it("a codeTemplate answer on an unsupported version is kept the same way (bounded shape)", () => {
    const exam = F.exam({ auto: unsupported() });
    const answer = { kind: "codeTemplate", language: "python", languageVersion: CODE.languageVersion, values: { g1: "1" } };
    const out = normalizeDraftAnswers({ auto1: answer }, exam).answers;
    expect(out.auto1).toMatchObject({ kind: "codeTemplate", language: "python" });
  });

  it("the kept answer is bounded: an oversized or malformed code answer is still refused", () => {
    const exam = F.exam({ auto: unsupported() });
    expect(normalizeDraftAnswers({ auto1: { kind: "code", language: "python", languageVersion: CODE.languageVersion, source: "x".repeat(70000) } }, exam).answers.auto1).toBeUndefined();
    expect(normalizeDraftAnswers({ auto1: { kind: "code", language: "nope", source: "x" } }, exam).answers.auto1).toBeUndefined();
  });

  it("unchanged: on a SUPPORTED coding question the binding still applies (a language the question does not allow is refused)", () => {
    const exam = F.exam({ auto: F.autoQ({ coding: { ...F.CFG, allowedLanguages: ["python"] } }) });
    const other = { kind: "code", language: "java", languageVersion: 1, source: "class A {}" };   // a registered language, valid shape — only the question forbids it
    expect(normalizeDraftAnswers({ auto1: other }, exam).answers.auto1).toBeUndefined();
    expect(normalizeDraftAnswers({ auto1: CODE }, exam).answers.auto1).toEqual(CODE);
  });

  it("unchanged: a code answer on a NON-coding question is still dropped", () => {
    expect(normalizeDraftAnswers({ sa1: CODE }, F.exam()).answers.sa1).toBeUndefined();
  });
});
