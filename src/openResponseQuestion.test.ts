import { describe, expect, it } from "vitest";
import {
  OPEN_RESPONSE_LIMITS, OPEN_RESPONSE_PROFILES, bindOpenResponseAnswerToQuestion, defaultOpenResponseAnswerKey, defaultOpenResponseConfig,
  gradeOpenResponse, isOpenResponseAnswerAnswered, openResponseReviewModel, projectOpenResponseForStudent, readOpenResponseStudentConfig,
  scoreOpenResponseRubric, validateOpenResponseAnswerKey, validateOpenResponseConfig, validateOpenResponseQuestion
} from "./openResponseQuestion";
import { defaultRubric } from "./rubricEngine";

// Phase 19E — openResponse@1 («إجابة مفتوحة مع سلم تقييم»): ONE family for essay / explain / justify / compare / analyze / sourceBased
// / general (profiles are authoring + presentation hints, never a grading authority).
//   • PUBLIC  `question.openResponse` = { v: 1, profile, instructions, response: { minChars, maxChars }, studentRubricVisibility }.
//   • PRIVATE `question.answer` = { rubric, modelAnswer } — the rubric (incl. private guidance) and the model answer never reach a student;
//     a `visible` rubric is delivered ONLY through the canonical projection as `openResponse.publicRubric`.
//   • The student answer is the existing `{ kind: "text", value }` Answer, bounded by `maxChars`.
//   • The automatic grader NEVER awards marks: score 0, manualReview true. The teacher grades with the rubric; the SERVER computes the
//     official score from the published rubric. Fail-first on ef679cc (no module).
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const CFG = { v: 1, profile: "compare", instructions: "قارن من حيث الموثوقية والسرعة.", response: { minChars: 0, maxChars: 3000 }, studentRubricVisibility: "visible" };
const RUBRIC = {
  v: 1,
  criteria: [
    { id: "accuracy", title: "الدقة", description: "صحة المقارنة", maxPoints: 4, allowCustomPoints: false, guidance: "PRIVATE-GUIDANCE-TCP-ACK", levels: [{ id: "full", label: "كامل", points: 4, description: "" }, { id: "part", label: "جزئي", points: 2, description: "" }, { id: "none", label: "لا شيء", points: 0, description: "" }] },
    { id: "reasoning", title: "التعليل", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [{ id: "full", label: "كامل", points: 2, description: "" }, { id: "none", label: "لا شيء", points: 0, description: "" }] }
  ]
};
const KEY = { rubric: RUBRIC, modelAnswer: "MODEL-ANSWER-TCP-IS-RELIABLE" };
const node = (over: Record<string, unknown> = {}) => ({ examQuestionId: "o1", presentationType: "openResponse", questionTypeVersion: 1, text: "قارن بين TCP و UDP.", marks: 6, openResponse: clone(CFG), answer: clone(KEY), ...over });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));

describe("19E openResponse — public config", () => {
  it("valid config is canonical; the default is valid and the profile vocabulary is bounded", () => {
    const r = validateOpenResponseConfig(CFG);
    expect(r.ok && r.config).toEqual(CFG);
    expect(validateOpenResponseConfig(defaultOpenResponseConfig()).ok).toBe(true);
    expect(defaultOpenResponseConfig().studentRubricVisibility).toBe("hidden");
    expect([...OPEN_RESPONSE_PROFILES]).toEqual(["essay", "explain", "justify", "compare", "analyze", "sourceBased", "general"]);
    for (const profile of OPEN_RESPONSE_PROFILES) expect(validateOpenResponseConfig({ ...CFG, profile }).ok, profile).toBe(true);
  });
  it("refuses unknown / prototype keys, versions, profiles, visibility values and bad bounds (never repaired)", () => {
    expect(codes(validateOpenResponseConfig(null))).toEqual(["OPEN_RESPONSE_CONFIG_INVALID"]);
    expect(codes(validateOpenResponseConfig({ ...CFG, rubric: RUBRIC }))).toContain("OPEN_RESPONSE_CONFIG_INVALID");
    expect(codes(validateOpenResponseConfig({ ...CFG, publicRubric: { totalPoints: 1, criteria: [] } }))).toContain("OPEN_RESPONSE_CONFIG_INVALID");
    expect(codes(validateOpenResponseConfig(JSON.parse('{"v":1,"profile":"essay","instructions":"","response":{"minChars":0,"maxChars":10},"studentRubricVisibility":"hidden","__proto__":{"x":1}}')))).toContain("OPEN_RESPONSE_CONFIG_INVALID");
    expect(codes(validateOpenResponseConfig({ ...CFG, v: 2 }))).toContain("OPEN_RESPONSE_VERSION_UNSUPPORTED");
    expect(codes(validateOpenResponseConfig({ ...CFG, profile: "essayQuestion" }))).toContain("OPEN_RESPONSE_PROFILE_INVALID");
    expect(codes(validateOpenResponseConfig({ ...CFG, studentRubricVisibility: "afterSubmission" }))).toContain("OPEN_RESPONSE_VISIBILITY_INVALID");
    expect(codes(validateOpenResponseConfig({ ...CFG, instructions: "x".repeat(OPEN_RESPONSE_LIMITS.instructionsChars + 1) }))).toContain("OPEN_RESPONSE_INSTRUCTIONS_INVALID");
    for (const response of [{ minChars: 0 }, { minChars: 0, maxChars: 0 }, { minChars: -1, maxChars: 10 }, { minChars: 11, maxChars: 10 }, { minChars: 0, maxChars: 10.5 }, { minChars: 0, maxChars: OPEN_RESPONSE_LIMITS.maxCharsCap + 1 }, { minChars: 0, maxChars: 10, extra: 1 }, { minChars: 0, maxChars: NaN }, { minChars: 0, maxChars: Infinity }, null])
      expect(codes(validateOpenResponseConfig({ ...CFG, response })), JSON.stringify(response)).toContain("OPEN_RESPONSE_LENGTH_INVALID");
  });
});

describe("19E openResponse — private key (rubric + model answer)", () => {
  it("valid key is canonical; modelAnswer optional; the default key carries the useful default rubric", () => {
    expect(validateOpenResponseAnswerKey(KEY)).toMatchObject({ ok: true, key: KEY });
    expect(validateOpenResponseAnswerKey({ rubric: RUBRIC })).toMatchObject({ ok: true, key: { rubric: RUBRIC, modelAnswer: "" } });
    expect(defaultOpenResponseAnswerKey()).toEqual({ rubric: defaultRubric(), modelAnswer: "" });
  });
  it("refuses unknown / prototype keys, missing or malformed rubric, oversized / non-string model answers", () => {
    expect(codes(validateOpenResponseAnswerKey(null))).toEqual(["OPEN_RESPONSE_KEY_INVALID"]);
    expect(codes(validateOpenResponseAnswerKey({ ...KEY, score: 10 }))).toContain("OPEN_RESPONSE_KEY_INVALID");
    expect(codes(validateOpenResponseAnswerKey({ modelAnswer: "x" }))).toContain("RUBRIC_INVALID");
    expect(codes(validateOpenResponseAnswerKey({ ...KEY, rubric: { ...RUBRIC, v: 2 } }))).toContain("RUBRIC_VERSION_UNSUPPORTED");
    expect(codes(validateOpenResponseAnswerKey({ ...KEY, modelAnswer: "m".repeat(OPEN_RESPONSE_LIMITS.modelAnswerChars + 1) }))).toContain("OPEN_RESPONSE_MODEL_ANSWER_INVALID");
    expect(codes(validateOpenResponseAnswerKey({ ...KEY, modelAnswer: 5 }))).toContain("OPEN_RESPONSE_MODEL_ANSWER_INVALID");
  });
});

describe("19E openResponse — question validation (finalization) and the ONE student projection", () => {
  it("a valid question has no issues; unsupported versions and malformed config / key block finalization", () => {
    expect(validateOpenResponseQuestion(node())).toEqual([]);
    expect(validateOpenResponseQuestion(node({ questionTypeVersion: 2 })).map(i => i.code)).toContain("OPEN_RESPONSE_VERSION_UNSUPPORTED");
    expect(validateOpenResponseQuestion(node({ openResponse: undefined })).map(i => i.code)).toContain("OPEN_RESPONSE_CONFIG_INVALID");
    expect(validateOpenResponseQuestion(node({ answer: {} })).map(i => i.code)).toContain("RUBRIC_INVALID");
    expect(validateOpenResponseQuestion(node({ marks: 0 })).map(i => i.code)).toContain("OPEN_RESPONSE_MARKS_INVALID");
  });
  it("visible rubric ⇒ public projection only (no guidance, ids, flags); model answer never; hidden ⇒ no rubric at all", () => {
    const p = projectOpenResponseForStudent(CFG, KEY);
    expect(p).toEqual({ ...CFG, publicRubric: { totalPoints: 6, criteria: [{ title: "الدقة", description: "صحة المقارنة", maxPoints: 4, levels: [{ label: "كامل", points: 4, description: "" }, { label: "جزئي", points: 2, description: "" }, { label: "لا شيء", points: 0, description: "" }] }, { title: "التعليل", description: "", maxPoints: 2, levels: [{ label: "كامل", points: 2, description: "" }, { label: "لا شيء", points: 0, description: "" }] }] } });
    expect(JSON.stringify(p)).not.toMatch(/PRIVATE-GUIDANCE|MODEL-ANSWER|guidance|modelAnswer|allowCustomPoints/);
    expect(projectOpenResponseForStudent({ ...CFG, studentRubricVisibility: "hidden" }, KEY)).toEqual({ ...CFG, studentRubricVisibility: "hidden" });
    // malformed private key: the config is still delivered (the student can answer) but no rubric is projected from bad authority
    expect(projectOpenResponseForStudent(CFG, { rubric: { v: 9 } })).toEqual(CFG);
    // malformed / smuggling public config: withheld entirely
    expect(projectOpenResponseForStudent({ ...CFG, modelAnswer: "x" }, KEY)).toBeNull();
    expect(projectOpenResponseForStudent({ ...CFG, v: 2 }, KEY)).toBeNull();
  });
  it("the client reads ONLY a strict delivered shape (config + optional publicRubric); anything else ⇒ null", () => {
    const delivered = projectOpenResponseForStudent(CFG, KEY);
    expect(readOpenResponseStudentConfig(delivered)).toEqual(delivered);
    expect(readOpenResponseStudentConfig({ ...CFG, studentRubricVisibility: "hidden" })).toEqual({ ...CFG, studentRubricVisibility: "hidden" });
    expect(readOpenResponseStudentConfig({ ...delivered, modelAnswer: "x" })).toBeNull();
    expect(readOpenResponseStudentConfig({ ...CFG, publicRubric: { totalPoints: 6, criteria: [{ title: "t", description: "", maxPoints: 4, levels: [], guidance: "g" }] } })).toBeNull();
    expect(readOpenResponseStudentConfig(null)).toBeNull();
  });
});

describe("19E openResponse — student answer binding (the existing text Answer, bounded)", () => {
  it("rebuilt to exactly { kind: 'text', value }; text kept verbatim (paragraphs, RTL / LTR, no trimming)", () => {
    const value = "  TCP موثوق.\n\nUDP أسرع — no handshake.  ";
    expect(bindOpenResponseAnswerToQuestion({ kind: "text", value, score: 6, rubric: { accuracy: "full" }, modelAnswer: "x", teacherComment: "y", manualScore: 6 }, node())).toEqual({ ok: true, answer: { kind: "text", value } });
    expect(bindOpenResponseAnswerToQuestion({ kind: "text", value: "" }, node())).toEqual({ ok: true, answer: { kind: "text", value: "" } });
  });
  it("oversized (beyond the question's maxChars or the hard cap), non-string and wrong kinds are refused — never truncated", () => {
    expect(bindOpenResponseAnswerToQuestion({ kind: "text", value: "x".repeat(3000) }, node()).ok).toBe(true);
    expect(bindOpenResponseAnswerToQuestion({ kind: "text", value: "x".repeat(3001) }, node())).toEqual({ ok: false, code: "OPEN_RESPONSE_ANSWER_TOO_LONG" });
    expect(bindOpenResponseAnswerToQuestion({ kind: "text", value: "x".repeat(OPEN_RESPONSE_LIMITS.maxCharsCap + 1) }, node({ openResponse: { bad: 1 } }))).toEqual({ ok: false, code: "OPEN_RESPONSE_ANSWER_TOO_LONG" });
    for (const a of [{ kind: "text", value: 5 }, { kind: "text", value: ["a"] }, { kind: "text" }, { kind: "fields", values: {} }, { kind: "choice", index: 0 }, "text", null])
      expect(bindOpenResponseAnswerToQuestion(a, node()), JSON.stringify(a)).toEqual({ ok: false, code: "OPEN_RESPONSE_ANSWER_INVALID" });
  });
  it("answered ⇔ non-blank text", () => {
    expect(isOpenResponseAnswerAnswered({ kind: "text", value: "x" })).toBe(true);
    expect(isOpenResponseAnswerAnswered({ kind: "text", value: " \n " })).toBe(false);
    expect(isOpenResponseAnswerAnswered({ kind: "choice", index: 0 })).toBe(false);
  });
});

describe("19E openResponse — automatic grading never awards marks; the rubric score is server-computed", () => {
  it("the official automatic result is always 0 + manual review (no length / keyword / similarity / model-answer heuristics)", () => {
    for (const response of [{ kind: "text", value: "MODEL-ANSWER-TCP-IS-RELIABLE" }, { kind: "text", value: "x".repeat(3000) }, { kind: "text", value: "" }, { kind: "text", value: "x", score: 6 }, null])
      expect(gradeOpenResponse(node(), response), JSON.stringify(response)).toEqual({ score: 0, correct: false, manualReview: true });
    expect(gradeOpenResponse(node({ answer: { rubric: null } }), { kind: "text", value: "x" })).toEqual({ score: 0, correct: false, manualReview: true });
  });
  it("teacher rubric awards ⇒ server-computed score scaled to the question marks; forged totals and maxima are refused", () => {
    expect(scoreOpenResponseRubric(node(), { accuracy: { levelId: "part" }, reasoning: { levelId: "full" } })).toMatchObject({ ok: true, score: 4, awarded: 4, total: 6 });
    expect(scoreOpenResponseRubric(node({ marks: 10 }), { accuracy: { levelId: "full" }, reasoning: { points: 1 } })).toMatchObject({ ok: true, score: 8.33, awarded: 5 });
    expect(scoreOpenResponseRubric(node(), { accuracy: { levelId: "full", maxPoints: 100 }, reasoning: { levelId: "full" } }).ok).toBe(false);
    expect(scoreOpenResponseRubric(node(), { accuracy: { levelId: "full" }, reasoning: { levelId: "full" }, total: 1 }).ok).toBe(false);
  });
  it("malformed published authority / unsupported version / wrong type ⇒ no official rubric score", () => {
    const AW = { accuracy: { levelId: "full" }, reasoning: { levelId: "full" } };
    for (const q of [node({ questionTypeVersion: 2 }), node({ openResponse: { ...CFG, v: 2 } }), node({ answer: { rubric: { ...RUBRIC, v: 2 } } }), node({ presentationType: "shortAnswer" }), node({ marks: -1 })])
      expect(scoreOpenResponseRubric(q, AW), JSON.stringify(q).slice(0, 90)).toEqual({ ok: false, code: "RUBRIC_AUTHORITY_INVALID" });
  });
  it("teacher review model: full rubric + model answer for the teacher; stored awards re-bound against the CURRENT rubric (stale ⇒ flagged)", () => {
    const m = openResponseReviewModel(node(), { v: 1, awards: { accuracy: { levelId: "part", points: 2 }, reasoning: { levelId: "full", points: 2 } } });
    expect(m).toMatchObject({ ok: true, modelAnswer: KEY.modelAnswer, rubric: RUBRIC, awards: { accuracy: { levelId: "part", points: 2 }, reasoning: { levelId: "full", points: 2 } }, stale: false, score: 4, total: 6 });
    const stale = openResponseReviewModel(node(), { v: 1, awards: { accuracy: { levelId: "gone", points: 4 }, reasoning: { levelId: "full", points: 2 } } });
    expect(stale).toMatchObject({ ok: true, awards: null, stale: true });
    expect(openResponseReviewModel(node(), undefined)).toMatchObject({ ok: true, awards: null, stale: false });
    expect(openResponseReviewModel(node({ answer: { rubric: null } }), undefined)).toEqual({ ok: false, code: "RUBRIC_AUTHORITY_INVALID" });
  });
});
