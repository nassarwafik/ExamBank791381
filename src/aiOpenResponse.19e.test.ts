import { describe, expect, it } from "vitest";
import { AI_AUTHOR_INTENTS, AI_GENERATED_TYPES, buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft, verifyAiQuestionNode } from "./aiQuestionDraft";
import { validateOpenResponseQuestion } from "./openResponseQuestion";

// Phase 19E — AI authoring of openResponse@1: the AI may PROPOSE a profile, prompt, length bounds, a rubric (criteria, levels, private
// grading guidance) and a private model answer; the proposal becomes a canonical node judged by the SAME validators as manual authoring
// (no repair: a malformed rubric is refused with AI_DRAFT_INVALID). Essay / explain / justify / compare / analyze are profiles of ONE
// type. The AI never grades a student. Fail-first on ef679cc.
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const level = (label: string, score: number, description = "") => ({ label, score, description });
const OR = {
  profile: "compare", instructions: "قارن من حيث الموثوقية والسرعة والاستخدام.", minChars: 0, maxChars: 3000, rubricVisibility: "visible",
  criteria: [
    { title: "دقة المقارنة", description: "صحة الفروق المذكورة", guidance: "TCP موجّه بالاتصال ويضمن التسليم؛ UDP بلا اتصال", maxScore: 4, allowCustomScore: false, levels: [level("كامل", 4), level("جزئي", 2), level("غائب", 0)] },
    { title: "الأمثلة", description: "", guidance: "", maxScore: 2, allowCustomScore: true, levels: [level("مثالان صحيحان", 2), level("لا أمثلة", 0)] }
  ],
  modelAnswer: "TCP موثوق ومرتب؛ UDP أسرع وأخف."
};
const DRAFT = (over: Record<string, unknown> = {}, or: Record<string, unknown> = {}) => ({ intent: "openResponse", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "قارن بين TCP و UDP.", marks: 6, ...NONE, openResponse: { ...OR, ...or }, ...over });
const withCrit = (i: number, over: Record<string, unknown>) => ({ criteria: OR.criteria.map((c, j) => (j === i ? { ...c, ...over } : c)) });

describe("19E AI — the openResponse intent", () => {
  it("is part of the vocabulary, generated, and present in the strict schema (no ids / points / answer keys in the schema)", () => {
    expect(AI_AUTHOR_INTENTS).toContain("openResponse"); expect(AI_GENERATED_TYPES).toContain("openResponse");
    const s = buildAiAuthorSchema();
    expect(s.required).toContain("openResponse");
    expect(JSON.stringify(s)).not.toMatch(/"id":\{"type":"string"|"answer"|"points"|"expected"|"seed"/);
    for (const t of ["essay", "explain", "justify", "compare", "analyze"]) expect(AI_AUTHOR_INTENTS as readonly string[]).not.toContain(t);
  });
  it("Arabic and English essay / explain / justify / compare / analyze requests map to ONE type with an advisory profile", () => {
    const cases: [string, string][] = [
      ["أنشئ سؤالًا مقاليًا مع سلم تقييم", "essay"], ["أنشئ سؤال علّل مع روبرك", "justify"], ["سؤال قارن بين TCP و UDP مع معايير تصحيح", "compare"],
      ["سؤال اشرح عمل DHCP من 10 علامات", "explain"], ["سؤال تحليل شبكة مع تقييم حسب معايير", "analyze"],
      ["Create an essay question with a rubric", "essay"], ["Create a justify question worth 8 marks", "justify"], ["Create a compare question with grading criteria", "compare"],
      ["Create an open response question with a detailed rubric", "general"]
    ];
    for (const [r, profile] of cases) expect(classifyAuthorRequest(r), r).toMatchObject({ suggestedIntent: "openResponse", suggestedProfile: profile });
    expect(classifyAuthorRequest("أنشئ سؤال محاكي سويتش").suggestedIntent).toBe("networkCli");
    expect(classifyAuthorRequest("اكتب فقرة فيها فراغات وقائمة منسدلة").suggestedIntent).toBe("inlineCloze");
    expect(classifyAuthorRequest("أنشئ سؤال رياضيات بأرقام مختلفة لكل طالب").suggestedIntent).toBe("parametricNumeric");
    expect(classifyAuthorRequest("سمِّ أجزاء الرسم التالي").suggestedIntent).toBe("labelDiagram");
  });
  it("the prompt asks for meaningful criteria, a max and a zero level, private guidance, and forbids grading students", () => {
    const p = buildAiAuthorPrompt("سؤال قارن بين TCP و UDP", classifyAuthorRequest("سؤال قارن بين TCP و UDP"));
    for (const s of ["openResponse", "profile", "criteria", "maxScore", "guidance", "modelAnswer", "suggested openResponse profile: compare"]) expect(p).toContain(s);
    expect(p).toMatch(/never grade a student/i); expect(p).toMatch(/never (?:put|include|reveal)/i);
  });
});

describe("19E AI — a valid draft becomes a canonical openResponse@1 node (same validators as manual authoring)", () => {
  it("criteria / levels get deterministic ids; maxScore / score map to maxPoints / points; the node passes finalization", () => {
    const r = normalizeAiQuestionDraft(DRAFT(), { request: "قارن" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = r.question as unknown as Record<string, unknown>;
    expect(Object.keys(q).sort()).toEqual(["answer", "examQuestionId", "marks", "openResponse", "presentationType", "questionTypeVersion", "text"]);
    expect(q.openResponse).toEqual({ v: 1, profile: "compare", instructions: OR.instructions, response: { minChars: 0, maxChars: 3000 }, studentRubricVisibility: "visible" });
    expect(q.answer).toEqual({ rubric: { v: 1, criteria: [
      { id: "c1", title: "دقة المقارنة", description: "صحة الفروق المذكورة", maxPoints: 4, allowCustomPoints: false, guidance: OR.criteria[0].guidance, levels: [{ id: "l1", label: "كامل", points: 4, description: "" }, { id: "l2", label: "جزئي", points: 2, description: "" }, { id: "l3", label: "غائب", points: 0, description: "" }] },
      { id: "c2", title: "الأمثلة", description: "", maxPoints: 2, allowCustomPoints: true, guidance: "", levels: [{ id: "l1", label: "مثالان صحيحان", points: 2, description: "" }, { id: "l2", label: "لا أمثلة", points: 0, description: "" }] }
    ] }, modelAnswer: OR.modelAnswer });
    expect(validateOpenResponseQuestion(q)).toEqual([]);
    expect(verifyAiQuestionNode(q).ok).toBe(true);
  });
  it("a malformed AI rubric is REFUSED (AI_DRAFT_INVALID with the canonical issue) — never repaired", () => {
    const bad: [Record<string, unknown>, string][] = [
      [withCrit(0, { levels: [level("كامل", 3), level("غائب", 0)] }), "RUBRIC_LEVEL_MAX_MISSING"],
      [withCrit(0, { levels: [level("كامل", 4), level("جزئي", 1)] }), "RUBRIC_LEVEL_ZERO_MISSING"],
      [withCrit(0, { levels: [level("كامل", 4), level("أ", 2), level("ب", 2), level("غائب", 0)] }), "RUBRIC_LEVEL_POINTS_DUPLICATE"],
      [withCrit(0, { levels: [level("كامل", 4), level("زائد", 5), level("غائب", 0)] }), "RUBRIC_LEVEL_POINTS_INVALID"],
      [withCrit(0, { maxScore: -1 }), "RUBRIC_POINTS_INVALID"],
      [withCrit(1, { levels: [level("وحيد", 2)] }), "RUBRIC_LEVELS_COUNT"],
      [{ criteria: [] }, "RUBRIC_CRITERIA_COUNT"],
      [{ profile: "essayQuestion" }, "OPEN_RESPONSE_PROFILE_INVALID"],
      [{ rubricVisibility: "afterSubmission" }, "OPEN_RESPONSE_VISIBILITY_INVALID"],
      [{ maxChars: 0 }, "OPEN_RESPONSE_LENGTH_INVALID"],
      [{ minChars: 5000, maxChars: 100 }, "OPEN_RESPONSE_LENGTH_INVALID"]
    ];
    for (const [or, code] of bad) {
      const r = normalizeAiQuestionDraft(DRAFT({}, or), { request: "قارن" });
      expect(r.ok, code).toBe(false);
      if (!r.ok) { expect(r.code, code).toBe("AI_DRAFT_INVALID"); expect(r.issues.map(i => i.code), code).toContain(code); }
    }
  });
  it("smuggled fields, ids, scores or grades in the AI payload are malformed; a missing payload is refused", () => {
    for (const or of [{ ...OR, studentScore: 6 }, { ...OR, criteria: [{ ...OR.criteria[0], id: "x" }] }, { ...OR, criteria: [{ ...OR.criteria[0], levels: [{ ...level("a", 4), points: 4 }] }] }, { ...OR, grade: { score: 6 } }])
      expect(normalizeAiQuestionDraft(DRAFT({ openResponse: or }), { request: "x" })).toMatchObject({ ok: false, code: "AI_DRAFT_MALFORMED" });
    expect(normalizeAiQuestionDraft(DRAFT({ openResponse: null }), { request: "x" })).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
    const forgedNode = { examQuestionId: "ai-draft", presentationType: "openResponse", questionTypeVersion: 1, text: "t", marks: 6, openResponse: { v: 1, profile: "general", instructions: "", response: { minChars: 0, maxChars: 100 }, studentRubricVisibility: "hidden" }, answer: { rubric: { v: 1, criteria: [] }, modelAnswer: "" }, manualScore: 6 };
    expect(verifyAiQuestionNode(forgedNode)).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
  });
  it("19A / 19B-shaped drafts without the openResponse key still parse (optional root key)", () => {
    const legacy = { intent: "multipleChoice", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "اختر", marks: 1, multipleChoice: { options: ["a", "b"], correctIndex: 0 }, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null };
    expect(normalizeAiQuestionDraft(legacy, { request: "x" }).ok).toBe(true);
  });
});
