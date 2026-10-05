import { describe, it, expect } from "vitest";
import { buildAiAuthorPrompt, buildAiAuthorSchema, classifyAuthorRequest, normalizeAiQuestionDraft } from "./aiQuestionDraft";
import { validateParametricNumericQuestion } from "./parametricNumericQuestion";

// Phase 19C — the AI builder proposes v2 parametric drafts (integer / decimal variables, derived values, the language-2 functions,
// constraints, display formats). AI output is untrusted: the normalizer maps it field by field (name → id) and the SAME canonical
// validators as manual authoring decide (validateParametricNumericQuestion through the structured-exam quality gate). Nothing is
// repaired. A 19B-shaped draft (no derivedVariables key) still maps to the v1 contract exactly as before. Fail-first on 751003f.
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const fmt = (kind = "plain", decimals = 0) => ({ kind, decimals });
const V = (name: string, kind: string, min: number, max: number, step: number, format = fmt()) => ({ name, kind, min, max, step, format });
const P2 = (over: Record<string, unknown> = {}) => ({
  variables: [V("d", "decimal", 10, 50, 0.5), V("t", "decimal", 2, 8, 0.25)],
  derivedVariables: [{ name: "speed", expression: "d / t", format: fmt("fixed", 2) }],
  constraints: [], answerExpression: "speed", mode: "tolerance", tolerance: 0.01, below: 0, above: 0, unitMode: "label", unitLabel: "م/ث", unit: "", ...over
});
const draft = (p: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({ intent: "parametricNumeric", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3, ...NONE, parametricNumeric: P2(p), ...over });
const refusal = (r: ReturnType<typeof normalizeAiQuestionDraft>) => (r.ok ? "OK" : r.code + ":" + r.issues.map(i => i.code).join(","));

describe("19C AI authoring — v2 parametric drafts", () => {
  it("the strict schema offers explicit kinds, derived values and formats; the prompt teaches the v2 rules (no raw ids / answers)", () => {
    const s = JSON.stringify(buildAiAuthorSchema());
    for (const k of ["derivedVariables", "\"decimal\"", "\"integer\"", "\"percentage\"", "\"fixed\""]) expect(s).toContain(k);
    expect(s).not.toMatch(/"id":\{"type":"string"|"answer"|"expected"|"seed"/);
    const p = buildAiAuthorPrompt("سؤال فيزياء بقيم عشرية مختلفة لكل طالب", classifyAuthorRequest("سؤال فيزياء بقيم عشرية مختلفة لكل طالب"));
    for (const k of ["derivedVariables", "decimal", "sqrt", "log10", "exp", "pow", "percentage", "fixed", "100 *"]) expect(p).toContain(k);
    expect(classifyAuthorRequest("سؤال فيزياء بقيم عشرية مختلفة لكل طالب").suggestedIntent).toBe("parametricNumeric");
  });
  it("a valid v2 draft becomes a canonical v2 node that passes the same validators as manual authoring", () => {
    const r = normalizeAiQuestionDraft(draft(), { request: "x" });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const q = (r as { question: Record<string, unknown> }).question;
    expect(q).toEqual({
      examQuestionId: "ai-draft", presentationType: "parametricNumeric", questionTypeVersion: 1, text: "قطع جسم {{d}} مترًا في {{t}} ثانية. ما متوسط سرعته؟", marks: 3,
      parametric: { v: 2, generatorVersion: 2, variables: [{ id: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }, { id: "t", kind: "decimal", min: 2, max: 8, step: 0.25 }], derivedVariables: [{ id: "speed", expression: "d / t", format: { kind: "fixed", decimals: 2 } }], constraints: [], response: { unit: "label", label: "م/ث" } },
      answer: { expression: "speed", mode: "tolerance", tolerance: 0.01 }
    });
    expect(validateParametricNumericQuestion(q)).toEqual([]);
    const rect = normalizeAiQuestionDraft(draft({ variables: [V("a", "integer", 2, 10, 1), V("b", "integer", 3, 12, 1)], derivedVariables: [{ name: "area", expression: "a * b", format: fmt() }], constraints: ["a != b", "sqrt(area) < 12"], answerExpression: "area", tolerance: 0, unitMode: "none", unitLabel: "" }, { text: "مستطيل {{a}} × {{b}} سم. احسب مساحته." }), { request: "x" });
    expect(rect.ok, JSON.stringify(rect)).toBe(true);
    expect((rect as { question: { parametric: unknown } }).question.parametric).toEqual({ v: 2, generatorVersion: 2, variables: [{ id: "a", kind: "integer", min: 2, max: 10, step: 1 }, { id: "b", kind: "integer", min: 3, max: 12, step: 1 }], derivedVariables: [{ id: "area", expression: "a * b" }], constraints: ["a != b", "sqrt(area) < 12"], response: { unit: "none" } });
  });
  it("refuses every unsafe or invalid v2 contract with the canonical issues — no repair", () => {
    const deep = Array.from({ length: 90 }, () => "d").join(" + ");
    const cases: [Record<string, unknown>, string][] = [
      [{ answerExpression: "cbrt(speed)" }, "PARAM_ANSWER_EXPRESSION_INVALID"],
      [{ variables: [V("d", "decimal", 10, 50, 0), V("t", "decimal", 2, 8, 0.25)] }, "PARAM_VAR_STEP_INVALID"],
      [{ variables: [V("d", "decimal", 10, 50, 0.3), V("t", "decimal", 2, 8, 0.25)] }, "PARAM_VAR_STEP_MISALIGNED"],
      [{ derivedVariables: [{ name: "x", expression: "y + 1", format: fmt() }, { name: "y", expression: "x * 2", format: fmt() }], answerExpression: "x" }, "PARAM_DERIVED_CYCLE"],
      [{ derivedVariables: [{ name: "speed", expression: "d / time", format: fmt() }] }, "PARAM_DERIVED_UNKNOWN_REFERENCE"],
      [{ constraints: ["speed > 1000"] }, "PARAM_SAMPLE_GENERATION_FAILED"],
      [{ answerExpression: "constructor.constructor('return process')()" }, "PARAM_ANSWER_EXPRESSION_INVALID"],
      [{ derivedVariables: [{ name: "speed", expression: "Math.sqrt(d)", format: fmt() }] }, "PARAM_DERIVED_EXPRESSION_INVALID"],
      [{ answerExpression: "log(d - d)" }, "PARAM_SAMPLE_ANSWER_FAILED"],
      [{ answerExpression: "sqrt(t - 100)" }, "PARAM_SAMPLE_ANSWER_FAILED"],
      [{ derivedVariables: [{ name: "speed", expression: "d / t", format: fmt("fixed", 99) }] }, "PARAM_FORMAT_INVALID"],
      [{ derivedVariables: [{ name: "speed", expression: "d / t", format: fmt("ipv4", 0) }] }, "PARAM_FORMAT_INVALID"],
      [{ answerExpression: deep }, "PARAM_ANSWER_EXPRESSION_INVALID"]
    ];
    for (const [p, code] of cases) expect(refusal(normalizeAiQuestionDraft(draft(p), { request: "x" })), JSON.stringify(p).slice(0, 90)).toMatch(new RegExp("^AI_DRAFT_INVALID:.*" + code));
  });
  it("malformed v2 AI output fails closed (wrong types, smuggled keys, non-finite numbers)", () => {
    for (const p of [{ variables: [{ ...V("d", "decimal", 10, 50, 0.5), seed: 1 }] }, { derivedVariables: [{ name: "speed", expression: "d / t", format: fmt(), value: 9 }] }, { variables: [V("d", "decimal", 10, Number.POSITIVE_INFINITY, 0.5)] }, { derivedVariables: "speed = d / t" }, { variables: [{ name: "d", kind: "decimal", min: 10, max: 50, step: 0.5 }] }])
      expect(refusal(normalizeAiQuestionDraft(draft(p), { request: "x" })), JSON.stringify(p).slice(0, 80)).toBe("AI_DRAFT_MALFORMED:");
  });
});
