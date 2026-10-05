import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler } from "../src/functions/ai-question-author.js";

// Phase 19C — POST /api/ai-question-author with a v2 parametric draft: accepted only when the shared canonical validators accept
// it; a cyclic / non-finite / malformed-format draft is refused with the canonical issues and no question. Fail-first on 751003f.
const require_ = createRequire(import.meta.url);
const { validateParametricNumericQuestion } = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const fmt = (kind = "plain", decimals = 0) => ({ kind, decimals });
const P = over => ({ variables: [{ name: "total", kind: "integer", min: 10, max: 40, step: 1, format: fmt() }, { name: "correct", kind: "integer", min: 0, max: 40, step: 1, format: fmt() }], derivedVariables: [], constraints: ["correct <= total"], answerExpression: "100 * correct / total", mode: "tolerance", tolerance: 0.05, below: 0, above: 0, unitMode: "label", unitLabel: "%", unit: "", ...over });
const DRAFT = over => ({ intent: "parametricNumeric", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "أجاب طالب عن {{correct}} من {{total}} سؤالًا إجابة صحيحة. ما النسبة المئوية؟", marks: 2, ...NONE, parametricNumeric: P(over) });
const call = async (body, ai) => handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), callTextJson: async () => ({ result: ai }) });

describe("19C /api/ai-question-author — v2 parametric drafts", () => {
  it("a percentage draft becomes a canonical v2 question", async () => {
    const r = await call({ request: "نسبة مئوية مختلفة لكل طالب", preferredType: "parametricNumeric" }, DRAFT());
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.question.parametric.v).toBe(2);
    expect(validateParametricNumericQuestion(r.jsonBody.question)).toEqual([]);
  });
  it("cyclic derived values, non-finite answers and malformed formats are refused with no question", async () => {
    for (const [over, code] of [[{ derivedVariables: [{ name: "x", expression: "y", format: fmt() }, { name: "y", expression: "x", format: fmt() }] }, "PARAM_DERIVED_CYCLE"], [{ answerExpression: "log(correct - correct)" }, "PARAM_SAMPLE_ANSWER_FAILED"], [{ variables: [{ name: "total", kind: "integer", min: 10, max: 40, step: 1, format: fmt("percentage", 42) }, { name: "correct", kind: "integer", min: 0, max: 40, step: 1, format: fmt() }] }, "PARAM_FORMAT_INVALID"]]) {
      const r = await call({ request: "x" }, DRAFT(over));
      expect(r.jsonBody.ok, code).toBe(false); expect(r.jsonBody.code).toBe("AI_DRAFT_INVALID");
      expect(r.jsonBody.issues.map(i => i.code)).toContain(code); expect(r.jsonBody.question).toBeUndefined();
    }
  });
});
