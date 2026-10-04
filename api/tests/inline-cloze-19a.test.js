import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { isResponseAnswered } from "../src/lib/exam-structure.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19A — inlineCloze@1 on the SERVER: the registered grader re-validates the published public config AND the private key
// through the ONE strict authority before grading (malformed authority ⇒ 0 + manual review; malformed student input ⇒ ordinary
// incorrect), the draft / submit ingest binds every cloze answer to the published question (only that question's blank ids,
// bounded strings), the student sanitizer never leaks accepted answers or the correct dropdown option, the real submission handler
// round-trips, the teacher review payload carries the public config, and the committed shared build behaves like the source.
// New-function suite (fail-first on 91b1f3d8: no inlineCloze grader / no shared module).
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const CFG = {
  v: 1,
  segments: [
    { type: "text", text: "يعمل البروتوكول " },
    { type: "blank", id: "b1", control: "text" },
    { type: "text", text: " في الطبقة الثالثة، وعنوان MAC يعمل في " },
    { type: "blank", id: "b2", control: "dropdown", options: [{ id: "o1", label: "Physical" }, { id: "o2", label: "Data Link" }, { id: "o3", label: "Network" }] },
    { type: "text", text: "، والأمر " },
    { type: "blank", id: "b3", control: "text" }
  ]
};
const KEY = { scoring: "proportional", blanks: { b1: { accepted: ["IP", "Internet Protocol"], caseSensitive: false }, b2: { correctOptionId: "o2" }, b3: { accepted: ["show vlan brief"], caseSensitive: true } } };
const CANARIES = /Internet Protocol|show vlan brief|correctOptionId|"accepted"|caseSensitive|"o2"\b.*correct/;
const q = (over = {}) => ({ examQuestionId: "c1", presentationType: "inlineCloze", questionTypeVersion: 1, text: "أكمل الفقرة", marks: 6, inlineCloze: JSON.parse(JSON.stringify(CFG)), answer: JSON.parse(JSON.stringify(KEY)), ...over });
const exam = questions => ({ examId: "E19A", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id = "c1") => r.questions.find(x => x.questionId === id);
const fields = values => ({ kind: "fields", values });

describe("19A — the registered inlineCloze@1 grader", () => {
  it("is registered at exactly version 1; full / partial / zero; decimals rounded by gradeExam to 2 places", () => {
    expect(typeof resolveGrader("inlineCloze", 1)).toBe("function");
    expect(resolveGrader("inlineCloze", 2)).toBeUndefined();
    const full = g(gradeExam(exam([q()]), { c1: fields({ b1: "internet protocol", b2: "o2", b3: "show   vlan brief" }) }));
    expect(full.score).toBe(6); expect(full.correct).toBe(true); expect(full.manualReview).toBe(false); expect(full.parts).toEqual({ correct: 3, total: 3 });
    const partial = g(gradeExam(exam([q({ marks: 1 })]), { c1: fields({ b1: "IP", b2: "o2", b3: "SHOW VLAN BRIEF" }) }));
    expect(partial.score).toBe(0.67); expect(partial.parts).toEqual({ correct: 2, total: 3 }); expect(partial.correct).toBe(false);
    expect(g(gradeExam(exam([q()]), { c1: fields({}) })).score).toBe(0);
    expect(g(gradeExam(exam([q()]), {})).score).toBe(0);
  });
  it("allOrNothing: all blanks right or zero", () => {
    const aon = q({ answer: { ...JSON.parse(JSON.stringify(KEY)), scoring: "allOrNothing" } });
    expect(g(gradeExam(exam([aon]), { c1: fields({ b1: "IP", b2: "o2", b3: "x" }) })).score).toBe(0);
    expect(g(gradeExam(exam([aon]), { c1: fields({ b1: "IP", b2: "o2", b3: "show vlan brief" }) })).score).toBe(6);
  });
  it("malformed PRIVATE authority ⇒ 0 + manual review (never partial credit); malformed STUDENT input ⇒ ordinary 0 without manual review", () => {
    for (const bad of [{ answer: { ...KEY, scoring: "nope" } }, { answer: { scoring: "proportional", blanks: { b1: { accepted: ["IP"] } } } }, { answer: { ...KEY, rubric: "x" } }, { inlineCloze: { ...CFG, hiddenKey: 1 } }, { questionTypeVersion: 2 }]) {
      const r = g(gradeExam(exam([q(bad)]), { c1: fields({ b1: "IP", b2: "o2", b3: "show vlan brief" }) }));
      expect(r.score, JSON.stringify(bad)).toBe(0); expect(r.manualReview).toBe(true); expect(r.correct).toBe(false);
    }
    for (const resp of [{ kind: "text", value: "IP" }, { kind: "fields", values: { b1: 7, b2: ["o2"] } }, { kind: "choice", index: 1 }]) {
      const r = g(gradeExam(exam([q()]), { c1: resp }));
      expect(r.score).toBe(0); expect(r.manualReview).toBe(false);
    }
    expect(g(gradeExam(exam([q()]), { c1: fields({ b2: "Data Link" }) })).parts).toEqual({ correct: 0, total: 3 });
  });
});

describe("19A — ingest binding, answered state, legacy fillBlank untouched", () => {
  it("bound: only the question's blank ids survive as bounded strings; extra client keys dropped; a non-fields kind is rejected", () => {
    const { answers, rejected } = normalizeDraftAnswers({ c1: { kind: "fields", values: { b1: "IP", b2: "o2", b3: 5, ghost: "x" }, score: 6 } }, exam([q()]));
    expect(rejected).toEqual([]);
    expect(answers.c1).toEqual({ kind: "fields", values: { b1: "IP", b2: "o2" } });
    const r2 = normalizeDraftAnswers({ c1: { kind: "text", value: "IP" } }, exam([q()]));
    expect(r2.answers.c1).toBeUndefined(); expect(r2.rejected).toEqual([{ id: "c1", code: "CLOZE_ANSWER_INVALID" }]);
  });
  it("a legacy fillBlank fields answer is never touched by the cloze binding", () => {
    const legacy = { examQuestionId: "f1", presentationType: "fillBlank", text: "x", marks: 1, fields: [{ id: "a", kind: "text", correct: "x" }], answer: { mode: "exactSequence", values: ["x"] } };
    const ans = { kind: "fields", values: { a: "x", extra: "kept-as-before" } };
    expect(normalizeDraftAnswers({ f1: ans }, exam([legacy])).answers.f1).toEqual(ans);
    expect(g(gradeExam(exam([legacy]), { f1: { kind: "fields", values: { a: "x" } } }), "f1").score).toBe(1);
  });
  it("answered ⇔ at least one non-empty blank (the existing fields semantics)", () => {
    expect(isResponseAnswered(fields({ b1: "IP" }))).toBe(true);
    expect(isResponseAnswered(fields({ b1: "  " }))).toBe(false);
  });
});

describe("19A — student sanitizer secrecy", () => {
  it("accepted answers, case policy, the correct dropdown option and the scoring policy never reach a student; the public passage does", () => {
    const out = sanitizeExamForStudent(exam([q()]));
    const s = JSON.stringify(out);
    expect(s).not.toMatch(CANARIES);
    expect(s).toContain("Data Link"); expect(s).toContain("يعمل البروتوكول");
    const node = out.sections[0].questions[0];
    expect(node.inlineCloze).toEqual(CFG);
  });
  it("a smuggled private field in the public config is never projected: the whole malformed config is withheld (fail closed)", () => {
    const smuggled = JSON.parse(JSON.stringify(CFG)); smuggled.segments[3].correctOptionId = "o2"; smuggled.segments[1].accepted = ["IP"];
    const s = JSON.stringify(sanitizeExamForStudent(exam([q({ inlineCloze: smuggled })])));
    expect(s).not.toMatch(/correctOptionId|accepted/);
    expect(sanitizeExamForStudent(exam([q({ inlineCloze: smuggled })])).sections[0].questions[0].inlineCloze).toBeUndefined();
  });
});

describe("19A — end to end through the REAL submission handler", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const assignment = (question = q()) => F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [question, { examQuestionId: "sa1", presentationType: "shortAnswer", text: "x", marks: 2, answer: { text: "x" } }] }] }, totalMarks: 8, questionCount: 2 });
  const obsInto = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  it("saveDraft then submit: the bound answer is stored, graded per blank, and nothing private reaches the response or logs", async () => {
    const ctx = F.seed({ a: assignment() });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const logs = [];
    const d = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { c1: fields({ b1: "IP", b2: "o1", junk: "x" }) }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps, obsInto(logs));
    expect(d.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.c1).toEqual({ kind: "fields", values: { b1: "IP", b2: "o1" } });
    const r = await submission().handler(F.studentRequest(F.submitBody({ c1: fields({ b1: "Internet Protocol", b2: "o2", b3: "show vlan brief" }), sa1: { kind: "text", value: "x" } })), deps, obsInto(logs));
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.answers.c1).toEqual(fields({ b1: "Internet Protocol", b2: "o2", b3: "show vlan brief" }));
    expect(attempt.score).toBe(6 + 2);
    expect(JSON.stringify(r.jsonBody)).not.toMatch(CANARIES);
    expect(JSON.stringify(logs)).not.toMatch(CANARIES);
  });
  it("a snapshot with a corrupted private key yields 0 automatic marks for the cloze and leaves its marks pending manual review", async () => {
    const ctx = F.seed({ a: assignment(q({ answer: { ...KEY, scoring: "bonus" } })) });
    const deps = { container: ctx.container, requireStudentAuth: studentAuth, env: F.ENV, fetch: F.runnerFetch() };
    const r = await submission().handler(F.studentRequest(F.submitBody({ c1: fields({ b1: "IP", b2: "o2", b3: "show vlan brief" }), sa1: { kind: "text", value: "x" } })), deps, obsInto([]));
    expect(r.status).toBe(200);
    const attempt = ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
    expect(attempt.score).toBe(2); expect(attempt.manualReviewMarks).toBe(6); expect(attempt.finalized).toBe(false);
  });
});

describe("19A — teacher review payload and shared build parity", () => {
  it("assignment-review hands the public config to the teacher review (with the private key as expectedAnswer, teachers only)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("../src/functions/assignment-review.js", import.meta.url), "utf8");
    expect(src).toMatch(/q\.inlineCloze!==undefined\?\{inlineCloze:q\.inlineCloze\}/);
  });
  it("the committed CommonJS mirror is in the shared build and agrees with the source on validation and scoring", async () => {
    expect(SHARED_ENTRIES).toContain("src/inlineClozeQuestion.ts");
    const shared = require_("../src/lib/shared-finalization/inlineClozeQuestion.js");
    const ts = await import("../../src/inlineClozeQuestion.ts");
    for (const [cfg, key, values] of [[CFG, KEY, { b1: "IP", b2: "o2", b3: "x" }], [CFG, { ...KEY, scoring: "allOrNothing" }, { b1: "IP" }], [{ ...CFG, v: 2 }, KEY, {}], [CFG, { ...KEY, blanks: {} }, {}]]) {
      const input = { config: cfg, answerKey: key, response: fields(values), maxMarks: 6 };
      expect(shared.scoreInlineCloze(input)).toEqual(ts.scoreInlineCloze(input));
      expect(shared.validateInlineClozeAnswerKey(key, cfg)).toEqual(ts.validateInlineClozeAnswerKey(key, cfg));
    }
  });
});
