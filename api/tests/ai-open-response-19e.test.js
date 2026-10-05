import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/ai-question-author.js";

// Phase 19E — POST /api/ai-question-author with the openResponse intent: a valid AI rubric proposal becomes a canonical openResponse@1
// question (the shared validators judge it on the server); a malformed rubric is refused (200, ok:false, AI_DRAFT_INVALID, no question);
// `openResponse` is an accepted preferred type. The AI only authors — nothing here grades a student. Fail-first on ef679cc.
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const lv = (label, score) => ({ label, score, description: "" });
const OR = { profile: "justify", instructions: "", minChars: 0, maxChars: 2000, rubricVisibility: "hidden", criteria: [{ title: "التعليل", description: "", guidance: "يذكر سببين", maxScore: 3, allowCustomScore: false, levels: [lv("كامل", 3), lv("جزئي", 1), lv("غائب", 0)] }], modelAnswer: "لأن ..." };
const DRAFT = over => ({ intent: "openResponse", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "علّل: لماذا نقسم الشبكة إلى VLANs؟", marks: 6, ...NONE, openResponse: OR, ...over });
const call = async (body, ai) => handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), callTextJson: async () => ({ result: ai }) });

describe("19E /api/ai-question-author — openResponse", () => {
  it("a valid rubric proposal becomes a canonical openResponse@1 question; openResponse is an accepted preferred type", async () => {
    const r = await call({ request: "أنشئ سؤال علّل مع روبرك", preferredType: "openResponse" }, DRAFT());
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: true, intent: "openResponse", question: { presentationType: "openResponse", questionTypeVersion: 1, marks: 6, openResponse: { profile: "justify" }, answer: { rubric: { v: 1, criteria: [{ id: "c1", maxPoints: 3 }] }, modelAnswer: "لأن ..." } } });
  });
  it("a malformed AI rubric is refused with the canonical issue and no question (never repaired)", async () => {
    const r = await call({ request: "علّل" }, DRAFT({ openResponse: { ...OR, criteria: [{ ...OR.criteria[0], levels: [lv("كامل", 3), lv("جزئي", 1)] }] } }));
    expect(r.status).toBe(200);
    expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID", intent: "openResponse" });
    expect(r.jsonBody.issues.map(i => i.code)).toContain("RUBRIC_LEVEL_ZERO_MISSING");
    expect(r.jsonBody.question).toBeUndefined();
  });
});
