import { describe, it, expect } from "vitest";
import { AI_AUTHOR_INTENTS, AI_GENERATED_TYPES, buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft, verifyAiQuestionNode } from "./aiQuestionDraft";
import { validateParametricNumericQuestion } from "./parametricNumericQuestion";
import type { BuilderQuestion } from "./examTypes";

// Phase 19B — the Phase 19A AI authoring path learns the parametricNumeric intent. The AI only PROPOSES public variable rows, the
// stem template, constraints, the answer expression and the tolerance / range / unit policy; the deterministic normalizer maps
// them to the canonical node and the SAME canonical validators (validateParametricNumericQuestion through the structured-exam
// quality gate) decide. Unknown functions, unsafe expressions, impossible ranges, unknown variable references and malformed
// constraints are REFUSED — never repaired. New-intent suite (fail-first on b8aa6ce: the intent does not exist).
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const draft = (over: Record<string, unknown> = {}) => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "اشرح", marks: 2, ...NONE, ...over });
const P = (over: Record<string, unknown> = {}) => ({ variables: [{ name: "a", min: 2, max: 10, step: 1 }, { name: "b", min: 5, max: 20, step: 1 }], constraints: ["a < b"], answerExpression: "a * b", mode: "tolerance", tolerance: 0, below: 0, above: 0, unitMode: "none", unitLabel: "", unit: "", ...over });
const pDraft = (p: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => draft({ intent: "parametricNumeric", text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 3, parametricNumeric: P(p), ...over });
const okQuestion = (r: ReturnType<typeof normalizeAiQuestionDraft>): BuilderQuestion => { expect(r.ok, JSON.stringify(r)).toBe(true); return (r as { question: BuilderQuestion }).question; };
const refusal = (r: ReturnType<typeof normalizeAiQuestionDraft>) => (r.ok ? "OK" : r.code + ":" + r.issues.map(i => i.code).join(","));

describe("19B AI authoring — the parametricNumeric intent", () => {
  it("is part of the vocabulary, generated, and present in the strict schema (no raw ids / answers in the schema)", () => {
    expect(AI_AUTHOR_INTENTS).toContain("parametricNumeric");
    expect(AI_GENERATED_TYPES).toContain("parametricNumeric");
    const s = buildAiAuthorSchema();
    expect(s.required).toContain("parametricNumeric");
    expect(JSON.stringify(s)).not.toMatch(/"id":\{"type":"string"|"answer"|"expected"|"seed"/);
  });
  it("Arabic and English 'different numbers for each student' requests are recognised (advisory signal) without stealing simulator requests", () => {
    for (const r of ["أنشئ سؤال رياضيات بأرقام مختلفة لكل طالب", "أنشئ سؤال حسابي متغير حيث a بين 2 و10 و b بين 5 و20", "سؤال رقمي يتغير لكل طالب", "Create a parametric numeric question with random integers", "Generate a different numeric version for each student"])
      expect(classifyAuthorRequest(r).suggestedIntent, r).toBe("parametricNumeric");
    expect(classifyAuthorRequest("أنشئ سؤال محاكي سويتش").suggestedIntent).toBe("networkCli");
    expect(classifyAuthorRequest("اكتب فقرة فيها فراغات وقائمة منسدلة").suggestedIntent).toBe("inlineCloze");
    const p = buildAiAuthorPrompt("سؤال رقمي يتغير لكل طالب", classifyAuthorRequest("سؤال رقمي يتغير لكل طالب"));
    for (const s of ["parametricNumeric", "{{", "abs", "round", "floor", "ceil", "min", "max", "tolerance", "range"]) expect(p).toContain(s);
    expect(p).toMatch(/never (?:put|include|reveal)/i);
  });
  it("a valid draft becomes a canonical parametricNumeric@1 node that passes the SAME validators as manual authoring", () => {
    const q = okQuestion(normalizeAiQuestionDraft(pDraft(), { request: "سؤال رقمي يتغير لكل طالب" })) as unknown as Record<string, unknown>;
    expect(q).toEqual({
      examQuestionId: "ai-draft", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "احسب ناتج ضرب {{a}} في {{b}}.", marks: 3,
      parametric: { v: 1, generatorVersion: 1, variables: [{ id: "a", kind: "int", min: 2, max: 10, step: 1 }, { id: "b", kind: "int", min: 5, max: 20, step: 1 }], constraints: ["a < b"], response: { unit: "none" } },
      answer: { expression: "a * b", mode: "tolerance", tolerance: 0 }
    });
    expect(validateParametricNumericQuestion(q)).toEqual([]);
    const range = okQuestion(normalizeAiQuestionDraft(pDraft({ mode: "range", below: 1, above: 2, unitMode: "input", unit: "cm" }), { request: "x" })) as unknown as { answer: unknown; parametric: { response: unknown } };
    expect(range.answer).toEqual({ expression: "a * b", mode: "range", below: 1, above: 2, unit: "cm" });
    expect(range.parametric.response).toEqual({ unit: "input" });
    const label = okQuestion(normalizeAiQuestionDraft(pDraft({ unitMode: "label", unitLabel: "سم" }), { request: "x" })) as unknown as { parametric: { response: unknown } };
    expect(label.parametric.response).toEqual({ unit: "label", label: "سم" });
  });
  it("unknown functions, unsafe expressions, impossible ranges, unknown references and malformed constraints are REFUSED with the canonical issues", () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, string][] = [
      [{ answerExpression: "sqrt(a)" }, {}, "PARAM_ANSWER_EXPRESSION_INVALID"],
      [{ answerExpression: "constructor.constructor('return process')()" }, {}, "PARAM_ANSWER_EXPRESSION_INVALID"],
      [{ answerExpression: "Math.max(a, b)" }, {}, "PARAM_ANSWER_EXPRESSION_INVALID"],
      [{ answerExpression: "a * c" }, {}, "PARAM_ANSWER_UNKNOWN_VARIABLE"],
      [{ variables: [{ name: "a", min: 10, max: 2, step: 1 }, { name: "b", min: 5, max: 20, step: 1 }] }, {}, "PARAM_VAR_RANGE_IMPOSSIBLE"],
      [{ variables: [{ name: "a", min: 2, max: 10, step: 0 }, { name: "b", min: 5, max: 20, step: 1 }] }, {}, "PARAM_VAR_STEP_INVALID"],
      [{ variables: [{ name: "a", min: 2, max: 10, step: 1 }, { name: "a", min: 5, max: 20, step: 1 }] }, {}, "PARAM_VAR_ID_DUPLICATE"],
      [{ variables: [{ name: "__proto__", min: 2, max: 10, step: 1 }, { name: "b", min: 5, max: 20, step: 1 }] }, {}, "PARAM_VAR_ID_INVALID"],
      [{ constraints: ["a <"] }, {}, "PARAM_CONSTRAINT_INVALID"],
      [{ constraints: ["a > b + 100"] }, {}, "PARAM_SAMPLE_GENERATION_FAILED"],
      [{ answerExpression: "a / (b - b)" }, {}, "PARAM_SAMPLE_ANSWER_FAILED"],
      [{ unitMode: "input", unit: "" }, {}, "PARAM_ANSWER_UNIT_INVALID"],
      [{}, { text: "احسب {{a}} × {{z}}" }, "PARAM_TEMPLATE_UNKNOWN_VARIABLE"],
      [{}, { text: "سؤال بلا متغيرات" }, "PARAM_TEMPLATE_NO_VARIABLE"]
    ];
    for (const [p, over, code] of cases) {
      const r = normalizeAiQuestionDraft(pDraft(p, over), { request: "x" });
      expect(refusal(r), JSON.stringify([p, over])).toMatch(new RegExp("^AI_DRAFT_INVALID:.*" + code));
    }
  });
  it("malformed AI output fails closed: wrong types, smuggled keys, a missing payload; the 19A drafts without the new key stay valid", () => {
    expect(refusal(normalizeAiQuestionDraft(pDraft({ tolerance: "0" }), { request: "x" }))).toBe("AI_DRAFT_MALFORMED:");
    expect(refusal(normalizeAiQuestionDraft(pDraft({ expected: 26 }), { request: "x" }))).toBe("AI_DRAFT_MALFORMED:");
    expect(refusal(normalizeAiQuestionDraft(pDraft({ variables: [{ name: "a", min: 2, max: 10, step: 1, seed: 1 }] }), { request: "x" }))).toBe("AI_DRAFT_MALFORMED:");
    expect(refusal(normalizeAiQuestionDraft(pDraft({ tolerance: Number.POSITIVE_INFINITY }), { request: "x" }))).toBe("AI_DRAFT_MALFORMED:");
    expect(refusal(normalizeAiQuestionDraft(draft({ intent: "parametricNumeric" }), { request: "x" }))).toMatch(/^AI_DRAFT_INVALID:AI_TYPE_PAYLOAD_MISSING/);
    const legacyShape = { ...draft({ intent: "trueFalse", trueFalse: { correct: true } }) } as Record<string, unknown>;
    delete legacyShape.parametricNumeric;
    expect(normalizeAiQuestionDraft(legacyShape, { request: "x" }).ok).toBe(true);
  });
  it("defense in depth: a tampered node (extra field, bad expression) fails the client-side re-verification too", () => {
    const q = okQuestion(normalizeAiQuestionDraft(pDraft(), { request: "x" })) as unknown as Record<string, unknown>;
    expect(verifyAiQuestionNode({ ...q, seed: "x" }).ok).toBe(false);
    expect(verifyAiQuestionNode({ ...q, answer: { expression: "eval('1')", mode: "tolerance", tolerance: 0 } }).ok).toBe(false);
    expect(verifyAiQuestionNode(q).ok).toBe(true);
  });
});
