import { describe, it, expect, afterEach, vi } from "vitest";
import { createRequire } from "node:module";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { resolveGrader } from "../src/lib/question-type-graders.js";
import { normalizeDraftAnswers } from "../src/lib/draft-answers.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19E — openResponse@1 + the rubric engine on the SERVER (the grading authority):
//   • the registered grader never awards marks (0 + manual review; an unsupported version never reaches the V1 grader);
//   • draft / submit ingest binds every answer on an openResponse question to exactly { kind: "text", value } within maxChars;
//   • the REAL student delivery never carries the private rubric guidance, the model answer, rubric awards or teacher data — a
//     `visible` rubric arrives only as the canonical public projection;
//   • the REAL teacher review save validates rubric awards against the PUBLISHED rubric, computes the official score itself (client
//     scores / totals / maxima are ignored or refused), persists through the existing override + CAS + rebuild authority, and refuses
//     (writing nothing) any malformed, partial, forged, wrong-question or score-only rubric grade; legacy overrides are unchanged.
// Fail-first on ef679cc.
const require_ = createRequire(import.meta.url);
const F = require_("./fixtures/coding-17c.js");
const clone = x => JSON.parse(JSON.stringify(x));
const GUIDE = "PRIVATE-GUIDANCE-19E-CANARY", MODEL = "MODEL-ANSWER-19E-CANARY";
const lv = (id, label, points, description = "") => ({ id, label, points, description });
const RUBRIC = {
  v: 1,
  criteria: [
    { id: "accuracy", title: "الدقة العلمية", description: "صحة المقارنة", maxPoints: 4, allowCustomPoints: false, guidance: GUIDE, levels: [lv("full", "كامل", 4), lv("part", "جزئي", 2), lv("none", "لا شيء", 0)] },
    { id: "reasoning", title: "التعليل", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [lv("full", "كامل", 2), lv("none", "لا شيء", 0)] }
  ]
};
const RUBRIC_B = { v: 1, criteria: [{ id: "structure", title: "البنية", description: "", maxPoints: 5, allowCustomPoints: false, guidance: "", levels: [lv("good", "جيد", 5), lv("none", "لا شيء", 0)] }] };
const CFG = { v: 1, profile: "compare", instructions: "قارن من حيث الموثوقية.", response: { minChars: 0, maxChars: 500 }, studentRubricVisibility: "visible" };
const PUBLIC_RUBRIC = { totalPoints: 6, criteria: [{ title: "الدقة العلمية", description: "صحة المقارنة", maxPoints: 4, levels: [{ label: "كامل", points: 4, description: "" }, { label: "جزئي", points: 2, description: "" }, { label: "لا شيء", points: 0, description: "" }] }, { title: "التعليل", description: "", maxPoints: 2, levels: [{ label: "كامل", points: 2, description: "" }, { label: "لا شيء", points: 0, description: "" }] }] };
const oq = (over = {}) => ({ examQuestionId: "o1", presentationType: "openResponse", questionTypeVersion: 1, text: "قارن بين TCP و UDP.", marks: 6, openResponse: clone(CFG), answer: { rubric: clone(RUBRIC), modelAnswer: MODEL }, ...over });
const ob = (over = {}) => oq({ examQuestionId: "o2", text: "صف بنية الإطار.", marks: 5, openResponse: { ...clone(CFG), studentRubricVisibility: "hidden" }, answer: { rubric: clone(RUBRIC_B), modelAnswer: "" }, ...over });
const shortQ = () => ({ examQuestionId: "sa1", presentationType: "shortAnswer", text: "اكتب x", marks: 2, answer: { text: "x" } });
const exam = questions => ({ examId: "E19E", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] });
const g = (r, id) => r.questions.find(x => x.questionId === id);
const text = value => ({ kind: "text", value });
const SECRETS = new RegExp([GUIDE, MODEL, '"guidance"', '"modelAnswer"', '"rubricAwards"', '"allowCustomPoints"'].join("|"));

describe("19E — catalog identity and the registered grader", () => {
  it("23 production types; openResponse@1 is manual, partial-credit, offline, never a compound part, never auto-graded", () => {
    const catalog = require_("../src/lib/shared-finalization/questionTypeCatalog.js");
    expect(catalog.QUESTION_TYPE_CATALOG.length).toBe(24);
    expect(catalog.QUESTION_TYPE_CATALOG.slice(-2, -1).map(d => [d.key, d.version, d.label, d.legacy])).toEqual([["openResponse", 1, "إجابة مفتوحة مع سلم تقييم", false]]);
    const d = catalog.questionTypeDefinition("openResponse");
    expect(d).toMatchObject({ key: "openResponse", version: 1, gradingMode: "manual", responseKinds: ["text"] });
    expect(d.capabilities).toMatchObject({ autoGrading: false, manualGrading: true, partialCredit: true, compoundPart: false, offline: true });
    expect(catalog.compoundPartTypeKeys()).not.toContain("openResponse");
  });
  it("openResponse@1 is registered at exactly version 1 and NEVER awards marks automatically (no heuristics, forged fields ignored)", () => {
    expect(typeof resolveGrader("openResponse", 1)).toBe("function"); expect(resolveGrader("openResponse", 2)).toBeUndefined();
    for (const a of [text(MODEL), text("x".repeat(500)), text(""), { ...text("x"), score: 6, correct: true }])
      expect(g(gradeExam(exam([oq()]), { o1: a }), "o1"), JSON.stringify(a).slice(0, 40)).toMatchObject({ score: 0, correct: false, manualReview: true });
    const r = gradeExam(exam([oq(), shortQ()]), { o1: text("TCP"), sa1: text("x") });
    expect(r.manualReviewMarks).toBe(6); expect(r.finalized).toBe(false); expect(g(r, "sa1").score).toBe(2);
  });
  it("an unsupported stored version is refused (unsupported ⇒ manual review), never graded by V1", () => {
    const r = g(gradeExam(exam([oq({ questionTypeVersion: 2 })]), { o1: text("x") }), "o1");
    expect(r.score).toBe(0); expect(r.manualReview).toBe(true);
  });
});

describe("19E — ingest binding (draft / submit)", () => {
  it("bound to exactly { kind: 'text', value } (verbatim); forged score / rubric / model answer / comments dropped", () => {
    const value = "  TCP موثوق.\n\nUDP faster.  ";
    const r = normalizeDraftAnswers({ o1: { kind: "text", value, score: 6, rubricAwards: { accuracy: { levelId: "full" } }, modelAnswer: "x", teacherComment: "y", manualScore: 6 } }, exam([oq()]));
    expect(r).toEqual({ answers: { o1: text(value) }, rejected: [] });
  });
  it("over-long, non-string and non-text answers on an openResponse question are rejected (never truncated)", () => {
    expect(normalizeDraftAnswers({ o1: text("x".repeat(500)) }, exam([oq()])).answers.o1).toEqual(text("x".repeat(500)));
    expect(normalizeDraftAnswers({ o1: text("x".repeat(501)) }, exam([oq()]))).toEqual({ answers: {}, rejected: [{ id: "o1", code: "OPEN_RESPONSE_ANSWER_TOO_LONG" }] });
    for (const a of [{ kind: "text", value: 5 }, { kind: "choice", index: 0 }, { kind: "fields", values: { a: "b" } }, "text"])
      expect(normalizeDraftAnswers({ o1: a }, exam([oq()])).rejected, JSON.stringify(a)).toEqual([{ id: "o1", code: "OPEN_RESPONSE_ANSWER_INVALID" }]);
  });
  it("legacy text answers on other questions are untouched", () => {
    expect(normalizeDraftAnswers({ sa1: { kind: "text", value: "x", extra: 1 } }, exam([shortQ()])).answers.sa1).toEqual({ kind: "text", value: "x", extra: 1 });
  });
});

describe("19E — student sanitizer secrecy", () => {
  it("visible: the canonical public rubric only (no guidance / ids / flags); the private key blanked; no model answer anywhere", () => {
    const out = sanitizeExamForStudent(exam([oq()]));
    const n = out.sections[0].questions[0];
    expect(n.openResponse).toEqual({ ...CFG, publicRubric: PUBLIC_RUBRIC });
    expect(n.answer).toEqual({});
    expect(JSON.stringify(out)).not.toMatch(SECRETS);
    expect(JSON.stringify(out)).not.toMatch(/"accuracy"|"reasoning"|"part"/);
  });
  it("hidden: no rubric at all reaches the student", () => {
    const n = sanitizeExamForStudent(exam([ob()])).sections[0].questions[0];
    expect(n.openResponse).toEqual({ ...CFG, studentRubricVisibility: "hidden" });
    expect(JSON.stringify(n)).not.toMatch(/البنية|"publicRubric"|"criteria"/);
  });
  it("a config smuggling a rubric, a public rubric or a model answer is withheld entirely; top-level private fields are stripped", () => {
    for (const bad of [{ ...CFG, rubric: RUBRIC }, { ...CFG, publicRubric: { totalPoints: 1, criteria: [] } }, { ...CFG, modelAnswer: MODEL }, { ...CFG, v: 2 }]) {
      const n = sanitizeExamForStudent(exam([oq({ openResponse: bad })])).sections[0].questions[0];
      expect(n.openResponse, JSON.stringify(bad).slice(0, 60)).toBeUndefined();
      expect(JSON.stringify(n)).not.toMatch(SECRETS);
    }
    const n = sanitizeExamForStudent(exam([oq({ modelAnswer: MODEL, rubric: RUBRIC })])).sections[0].questions[0];
    expect(n.modelAnswer).toBeUndefined(); expect(n.rubric).toBeUndefined(); expect(JSON.stringify(n)).not.toMatch(SECRETS);
  });
  it("a malformed private rubric never projects a public rubric (the student can still answer)", () => {
    const n = sanitizeExamForStudent(exam([oq({ answer: { rubric: { ...clone(RUBRIC), v: 9 }, modelAnswer: MODEL } })])).sections[0].questions[0];
    expect(n.openResponse).toEqual(CFG);
  });
});

describe("19E — end to end through the REAL handlers", () => {
  const submission = () => require_("../src/functions/student-submission.js");
  const studentAssignment = () => require_("../src/functions/student-assignment.js");
  const review = () => require_("../src/functions/assignment-review.js");
  const studentAuth = () => ({ ok: true, user: { sub: F.S1, sv: 1, role: "student" } });
  const teacherAuth = () => ({ ok: true, user: { sub: "teacher-19e", role: "teacher" } });
  const assignment = (questions = [oq(), ob(), shortQ()]) => F.assignment({ examSnapshot: { title: "exam", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions }] }, totalMarks: 13, questionCount: questions.length });
  const deps = (ctx, over = {}) => ({ container: ctx.container, requireStudentAuth: studentAuth, requireBuilderAuth: teacherAuth, getContainer: () => ctx.container, env: F.ENV, fetch: F.runnerFetch(), ...over });
  const obsInto = logs => ({ logInfo: (e, f) => logs.push([e, f]), logWarn: (e, f) => logs.push([e, f]), logError: (e, f) => logs.push([e, String(f)]) });
  const AW = { accuracy: { levelId: "part" }, reasoning: { levelId: "full" } };
  const save = (ctx, overrides, extra = {}, d) => review().handler(F.teacherRequest("/api/assignment-review", { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides, teacherFeedback: "عمل جيد", ...extra }), d || deps(ctx), obsInto([]));
  const reviewGet = ctx => review().handler(F.teacherRequest("/api/assignment-review?assignmentId=" + F.AID + "&studentId=" + F.S1 + "&attemptNumber=1", undefined, "GET"), deps(ctx));
  async function submitted(questions) {
    const ctx = F.seed({ a: assignment(questions) });
    const s = await submission().handler(F.studentRequest(F.submitBody({ o1: text("TCP موثوق و UDP أسرع."), o2: text("رأس ثم بيانات."), sa1: text("x") })), deps(ctx), obsInto([]));
    expect(s.status).toBe(200);
    return ctx;
  }
  const attemptOf = ctx => ctx.getJson(F.SUB).attempts.find(a => a.attemptNumber === 1);
  afterEach(() => { vi.unstubAllEnvs(); });

  it("delivery: the student receives the public config (+ visible rubric projection) and never guidance, model answer or awards", async () => {
    const ctx = F.seed({ a: assignment() });
    const r = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(r.status).toBe(200);
    const [o1, o2] = r.jsonBody.assignment.exam.sections[0].questions;
    expect(o1.openResponse).toEqual({ ...CFG, publicRubric: PUBLIC_RUBRIC });
    expect(o2.openResponse).toEqual({ ...CFG, studentRubricVisibility: "hidden" });
    expect(JSON.stringify(r.jsonBody)).not.toMatch(SECRETS);
  });
  it("saveDraft then submit: bound text stored, 0 + manual review (never a false zero), nothing private in responses or logs", async () => {
    const ctx = F.seed({ a: assignment() });
    const logs = [];
    const d = await submission().handler(F.studentRequest({ action: "saveDraft", answers: { o1: { kind: "text", value: "مسودة", score: 6, rubricAwards: AW } }, expectedAttemptNumber: 1, expectedStartedAt: F.STARTED, expectedAttemptEpoch: 1 }), deps(ctx), obsInto(logs));
    expect(d.status).toBe(200);
    expect(ctx.getJson(F.SUB).draftAnswers.o1).toEqual(text("مسودة"));
    const s = await submission().handler(F.studentRequest(F.submitBody({ o1: { kind: "text", value: "TCP موثوق.", score: 6 }, o2: text("x"), sa1: text("x") })), deps(ctx), obsInto(logs));
    expect(s.status).toBe(200);
    const attempt = attemptOf(ctx);
    expect(attempt.answers.o1).toEqual(text("TCP موثوق."));
    expect(attempt.questionGrades.find(q => q.questionId === "o1")).toMatchObject({ score: 0, manualReview: true });
    expect(attempt.score).toBe(2); expect(attempt.manualReviewMarks).toBe(11); expect(attempt.finalized).toBe(false);
    expect(JSON.stringify(s.jsonBody)).not.toMatch(SECRETS); expect(JSON.stringify(logs)).not.toMatch(SECRETS);
  });
  it("teacher review GET: public config, private rubric + model answer (teacher only), student text; no rubric review yet", async () => {
    const ctx = await submitted();
    const rv = await reviewGet(ctx);
    expect(rv.status).toBe(200);
    const q = rv.jsonBody.questions.find(x => x.questionId === "o1");
    expect(q.openResponse).toEqual(CFG); expect(q.expectedAnswer).toEqual({ rubric: RUBRIC, modelAnswer: MODEL });
    expect(q.studentAnswer).toEqual(text("TCP موثوق و UDP أسرع.")); expect(q.rubricReview).toBeNull();
  });
  it("rubric grading: the SERVER computes the score from the published rubric; forged score / totals / maxima never count; persisted through the existing override + rebuild", async () => {
    const ctx = await submitted();
    const r = await save(ctx, { o1: { rubricAwards: AW, score: 100, maxMarks: 100, total: 1, comment: "  أحسنت  " } });
    expect(r.status).toBe(200);
    const o = attemptOf(ctx).manualOverrides.o1;
    expect(o).toEqual({ score: 4, comment: "أحسنت", reviewedAt: o.reviewedAt, rubric: { v: 1, awards: { accuracy: { levelId: "part", points: 2 }, reasoning: { levelId: "full", points: 2 } }, awarded: 4, total: 6 } });
    expect(attemptOf(ctx).score).toBe(2 + 4);
    expect(r.jsonBody.result).toMatchObject({ score: 6, manualReviewMarks: 5, finalized: false });
    // same selections, different client score ⇒ the identical official score (idempotent)
    const again = await save(ctx, { o1: { rubricAwards: AW, score: 0, comment: "أحسنت" } });
    expect(again.status).toBe(200); expect(attemptOf(ctx).manualOverrides.o1.score).toBe(4); expect(attemptOf(ctx).score).toBe(6);
    // custom points where the criterion allows them; the second rubric question finalizes the attempt
    const both = await save(ctx, { o1: { rubricAwards: { accuracy: { levelId: "full" }, reasoning: { points: 1.5 } }, comment: "" }, o2: { rubricAwards: { structure: { levelId: "good" } }, comment: "" } });
    expect(both.status).toBe(200);
    expect(attemptOf(ctx).manualOverrides.o1).toMatchObject({ score: 5.5, rubric: { awarded: 5.5, total: 6 } });
    expect(attemptOf(ctx).manualOverrides.o2).toMatchObject({ score: 5, rubric: { awards: { structure: { levelId: "good", points: 5 } } } });
    expect(both.jsonBody.result).toMatchObject({ score: 12.5, manualReviewMarks: 0, finalized: true });
    // reload: the teacher sees the stored selections
    const rv = await reviewGet(ctx);
    expect(rv.jsonBody.questions.find(x => x.questionId === "o1").rubricReview).toEqual({ v: 1, awards: { accuracy: { levelId: "full", points: 4 }, reasoning: { levelId: null, points: 1.5 } }, awarded: 5.5, total: 6 });
  });
  it("malformed / partial / forged / wrong-question / score-only rubric grades are refused with 400 and NOTHING changes", async () => {
    const ctx = await submitted();
    const before = clone(ctx.getJson(F.SUB));
    const cases = [
      [{ o1: { score: 5, comment: "x" } }, "RUBRIC_GRADE_REQUIRED"],
      [{ o1: { rubricAwards: { accuracy: { levelId: "part" } } } }, "RUBRIC_AWARD_INCOMPLETE"],
      [{ o1: { rubricAwards: { ...AW, ghost: { levelId: "full" } } } }, "RUBRIC_AWARD_UNKNOWN_CRITERION"],
      [{ o1: { rubricAwards: { ...AW, accuracy: { levelId: "legendary" } } } }, "RUBRIC_AWARD_UNKNOWN_LEVEL"],
      [{ o1: { rubricAwards: { ...AW, accuracy: { points: 3 } } } }, "RUBRIC_AWARD_CUSTOM_NOT_ALLOWED"],
      [{ o1: { rubricAwards: { ...AW, reasoning: { points: 2.5 } } } }, "RUBRIC_AWARD_POINTS_INVALID"],
      [{ o1: { rubricAwards: { ...AW, reasoning: { points: -0.5 } } } }, "RUBRIC_AWARD_POINTS_INVALID"],     // negative custom points
      [{ o1: { rubricAwards: { ...AW, accuracy: { levelId: "full", maxPoints: 100 } } } }, "RUBRIC_AWARD_INVALID"],
      [{ o1: { rubricAwards: JSON.parse('{"__proto__":{"levelId":"full"},"accuracy":{"levelId":"full"},"reasoning":{"levelId":"full"}}') } }, "RUBRIC_AWARD_UNKNOWN_CRITERION"],
      [{ o2: { rubricAwards: AW } }, "RUBRIC_AWARD_UNKNOWN_CRITERION"],                 // o1's rubric selections cannot grade o2
      [{ o1: { rubricAwards: "full" } }, "RUBRIC_AWARDS_INVALID"],
      [{ o1: { rubricAwards: AW }, sa1: { score: 2 }, o2: { score: 5 } }, "RUBRIC_GRADE_REQUIRED"]   // one bad entry rejects the whole save
    ];
    for (const [overrides, code] of cases) {
      const r = await save(ctx, overrides);
      expect(r.status, JSON.stringify(overrides).slice(0, 80)).toBe(400);
      expect(r.jsonBody).toMatchObject({ ok: false, code });
      expect(ctx.getJson(F.SUB), code).toEqual(before);
    }
  });
  it("a malformed PUBLISHED rubric can never produce an official score: 400, nothing written, the question stays pending review", async () => {
    const ctx = await submitted([oq({ answer: { rubric: { ...clone(RUBRIC), v: 2 }, modelAnswer: MODEL } }), ob(), shortQ()]);
    const before = clone(ctx.getJson(F.SUB));
    for (const overrides of [{ o1: { rubricAwards: AW } }, { o1: { score: 6 } }]) {
      const r = await save(ctx, overrides);
      expect(r.status).toBe(400); expect(r.jsonBody.code).toBe("RUBRIC_AUTHORITY_INVALID");
      expect(ctx.getJson(F.SUB)).toEqual(before);
    }
    expect(attemptOf(ctx).questionGrades.find(q => q.questionId === "o1")).toMatchObject({ score: 0, manualReview: true });
    expect(attemptOf(ctx).finalized).toBe(false);
  });
  it("an unsupported published version or a published rubric with a negative level never grades on the server (400, nothing written); finalization refuses both", async () => {
    const shared = require_("../src/lib/shared-finalization/openResponseQuestion.js");
    const negative = { rubric: { ...clone(RUBRIC), criteria: [{ ...clone(RUBRIC.criteria[0]), levels: [lv("full", "كامل", 4), lv("neg", "سالب", -1), lv("none", "لا شيء", 0)] }, clone(RUBRIC.criteria[1])] }, modelAnswer: "" };
    expect(shared.validateOpenResponseQuestion(oq({ questionTypeVersion: 2 })).map(i => i.code)).toContain("OPEN_RESPONSE_VERSION_UNSUPPORTED");
    expect(shared.validateOpenResponseQuestion(oq({ answer: negative })).map(i => i.code)).toContain("RUBRIC_LEVEL_POINTS_INVALID");
    for (const bad of [oq({ questionTypeVersion: 2 }), oq({ answer: negative })]) {
      const ctx = await submitted([bad, ob(), shortQ()]);
      const before = clone(ctx.getJson(F.SUB));
      const r = await save(ctx, { o1: { rubricAwards: AW } });
      expect(r.status).toBe(400); expect(r.jsonBody.code).toBe("RUBRIC_AUTHORITY_INVALID");
      expect(ctx.getJson(F.SUB)).toEqual(before);
    }
  });
  it("legacy manual overrides are unchanged: { score, comment } on other types (a stray rubric field is inert)", async () => {
    const ctx = await submitted();
    const r = await save(ctx, { sa1: { score: 1.5, comment: "c", rubricAwards: AW } });
    expect(r.status).toBe(200);
    const o = attemptOf(ctx).manualOverrides.sa1;
    expect(o).toEqual({ score: 1.5, comment: "c", reviewedAt: o.reviewedAt });
  });
  it("storage CAS is preserved: a concurrent writer's override survives (no stale overwrite); persistent conflicts ⇒ 503, nothing written", async () => {
    let fired = false;
    const ctx = F.seed({ a: assignment(), hooks: { beforeConditionalUpload(name, api) {
      if (fired || name !== F.SUB) return; fired = true;
      const doc = api.getJson(F.SUB); const a = doc.attempts.find(x => x.attemptNumber === 1);
      if (!a) { fired = false; return; }
      a.manualOverrides = { ...(a.manualOverrides || {}), sa1: { score: 1, comment: "concurrent", reviewedAt: "2026-01-01T00:00:00.000Z" } };
      api.setJson(F.SUB, doc);
    } } });
    const s = await submission().handler(F.studentRequest(F.submitBody({ o1: text("t"), o2: text("t"), sa1: text("y") })), deps(ctx), obsInto([]));
    expect(s.status).toBe(200);
    fired = false;
    const r = await save(ctx, { o1: { rubricAwards: AW, comment: "" } });
    expect(r.status).toBe(200); expect(fired).toBe(true);
    expect(attemptOf(ctx).manualOverrides.sa1).toMatchObject({ score: 1, comment: "concurrent" });
    expect(attemptOf(ctx).manualOverrides.o1).toMatchObject({ score: 4 });

    const busy = F.seed({ a: assignment(), hooks: { beforeConditionalUpload(name, api) { if (name === F.SUB && api.getJson(F.SUB).attempts.length) { const d = api.getJson(F.SUB); d.touch = (d.touch || 0) + 1; api.setJson(F.SUB, d); } } } });
    await submission().handler(F.studentRequest(F.submitBody({ o1: text("t"), o2: text("t"), sa1: text("y") })), deps(busy), obsInto([]));
    const pre = clone(busy.getJson(F.SUB)); delete pre.touch;
    const rb = await save(busy, { o1: { rubricAwards: AW } });
    expect(rb.status).toBe(503);
    const post = clone(busy.getJson(F.SUB)); delete post.touch;
    expect(post).toEqual(pre);
  });
  it("teacher authorization is the existing one: a student token or no token never reaches the grading path (401), nothing written", async () => {
    vi.stubEnv("BUILDER_SESSION_SECRET", "builder-secret-19e-test-only-0123456789");
    vi.stubEnv("STUDENT_SESSION_SECRET", "student-secret-19e-test-only-0123456789");
    const ctx = await submitted();
    const before = clone(ctx.getJson(F.SUB));
    const { createStudentToken } = require_("../src/lib/student-auth.js");
    const studentToken = createStudentToken({ userId: F.S1, authVersion: 1, code: "s", displayName: "s", classId: "c" });
    const body = { action: "saveReview", assignmentId: F.AID, studentId: F.S1, attemptNumber: 1, overrides: { o1: { rubricAwards: AW } } };
    const withAuth = h => ({ ...F.teacherRequest("/api/assignment-review", body), headers: new Headers({ "content-type": "application/json", ...h }) });
    const realDeps = { getContainer: () => ctx.container };
    for (const h of [{}, { authorization: "Bearer " + studentToken }]) {
      const r = await review().handler(withAuth(h), realDeps, obsInto([]));
      expect(r.status).toBe(401);
    }
    expect(ctx.getJson(F.SUB)).toEqual(before);
  });
  it("forged attempt / assignment / student identities never reach another record", async () => {
    const ctx = await submitted();
    const before = clone(ctx.getJson(F.SUB));
    expect((await save(ctx, { o1: { rubricAwards: AW } }, { attemptNumber: 7 })).status).toBe(404);
    expect((await save(ctx, { o1: { rubricAwards: AW } }, { attemptNumber: "1;drop" })).status).toBe(400);
    expect((await save(ctx, { o1: { rubricAwards: AW } }, { assignmentId: "../" + F.AID })).status).toBe(400);
    expect((await save(ctx, { o1: { rubricAwards: AW } }, { studentId: "someone-else" })).status).toBe(404);
    expect(ctx.getJson(F.SUB)).toEqual(before);
  });
  it("after grading, the student's own result view carries no rubric awards, guidance, model answer or per-question teacher data", async () => {
    const ctx = await submitted();
    expect((await save(ctx, { o1: { rubricAwards: AW, comment: "TEACHER-COMMENT-19E" } })).status).toBe(200);
    const st = await submission().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(st.status).toBe(200);
    expect(JSON.stringify(st.jsonBody)).not.toMatch(SECRETS);
    expect(JSON.stringify(st.jsonBody)).not.toMatch(/TEACHER-COMMENT-19E|"awards"|"levelId"/);
    const ga = await studentAssignment().handler(F.studentRequest(undefined, "GET"), deps(ctx));
    expect(JSON.stringify(ga.jsonBody)).not.toMatch(SECRETS);
    expect(JSON.stringify(ga.jsonBody)).not.toMatch(/TEACHER-COMMENT-19E|"awards"|"levelId"/);
  });
});

describe("19E — shared build parity", () => {
  it("the rubric engine and the openResponse model are in the shared build and the committed mirror agrees with the source", async () => {
    expect(SHARED_ENTRIES).toEqual(expect.arrayContaining(["src/rubricEngine.ts", "src/openResponseQuestion.ts"]));
    const shared = require_("../src/lib/shared-finalization/openResponseQuestion.js");
    const src = await import("../../src/openResponseQuestion.ts");
    const q = oq();
    for (const awards of [{ accuracy: { levelId: "part" }, reasoning: { levelId: "full" } }, { accuracy: { levelId: "x" } }, { accuracy: { levelId: "full" }, reasoning: { points: 1.25 } }])
      expect(shared.scoreOpenResponseRubric(q, awards)).toEqual(src.scoreOpenResponseRubric(q, awards));
    expect(shared.projectOpenResponseForStudent(CFG, q.answer)).toEqual(src.projectOpenResponseForStudent(CFG, q.answer));
    expect(shared.validateOpenResponseQuestion(q)).toEqual(src.validateOpenResponseQuestion(q));
  });
});
