import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler } from "../src/functions/ai-question-author.js";

// Phase 19B — POST /api/ai-question-author with the parametricNumeric intent: the endpoint returns a canonical parametricNumeric@1
// draft only when the shared canonical validators accept it; an unsafe / invalid AI contract is refused with the canonical issues
// (no repair, no question). New-intent suite (fail-first on b8aa6ce: the intent is unknown to the endpoint).
const require_ = createRequire(import.meta.url);
const { validateParametricNumericQuestion } = require_("../src/lib/shared-finalization/parametricNumericQuestion.js");
const auth = () => ({ ok: true, user: { sub: "teacher" } });
const req = body => ({ json: async () => body });
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const P = over => ({ variables: [{ name: "p", min: 24, max: 30, step: 1 }], constraints: [], answerExpression: "2 ^ (32 - p) - 2", mode: "tolerance", tolerance: 0, below: 0, above: 0, unitMode: "none", unitLabel: "", unit: "", ...over });
const DRAFT = over => ({ intent: "parametricNumeric", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "شبكة ببادئة /{{p}}. كم عنوانًا قابلًا للاستخدام؟", marks: 2, ...NONE, parametricNumeric: P(over) });
const call = async (body, ai) => {
  const calls = [];
  const r = await handler(req(body), { requireBuilderAuth: auth, callTextJson: async args => { calls.push(args); return { result: ai }; } });
  return { r, calls };
};

describe("19B /api/ai-question-author — parametricNumeric", () => {
  it("accepts the preferred type, prompts with the parametric rules and returns a canonical draft that passes the shared validator", async () => {
    const { r, calls } = await call({ request: "Generate a different numeric version for each student about subnet hosts", preferredType: "parametricNumeric" }, DRAFT());
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    expect(calls[0].prompt).toContain("Teacher preferred type: parametricNumeric");
    expect(calls[0].schema.required).toContain("parametricNumeric");
    expect(r.jsonBody.question.presentationType).toBe("parametricNumeric");
    expect(validateParametricNumericQuestion(r.jsonBody.question)).toEqual([]);
  });
  it("an unsafe or invalid AI contract is refused with the canonical issues and no question", async () => {
    for (const [over, code] of [[{ answerExpression: "process.exit(1)" }, "PARAM_ANSWER_EXPRESSION_INVALID"], [{ answerExpression: "log2(p)" }, "PARAM_ANSWER_EXPRESSION_INVALID"], [{ variables: [{ name: "p", min: 30, max: 24, step: 1 }] }, "PARAM_VAR_RANGE_IMPOSSIBLE"], [{ constraints: ["p >"] }, "PARAM_CONSTRAINT_INVALID"]]) {
      const { r } = await call({ request: "x" }, DRAFT(over));
      expect(r.status, code).toBe(200); expect(r.jsonBody.ok).toBe(false); expect(r.jsonBody.code).toBe("AI_DRAFT_INVALID");
      expect(r.jsonBody.issues.map(i => i.code)).toContain(code);
      expect(r.jsonBody.question).toBeUndefined();
    }
  });
});
