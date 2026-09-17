import { describe, it, expect } from "vitest";
import { handler, buildProposalSchema, buildProposalPrompt, validateProposal, questionHasImage } from "../src/functions/structured-exam-ai-fix.js";

// UX-6d — the structured AI answer-key PROPOSAL endpoint. It never mutates an exam and never returns a whole
// question. These tests prove: the schema can never carry a protected field; every proposal is re-validated
// against the CURRENT question; an out-of-range / off-bank / partial proposal becomes needsManualReview; an
// image-dependent question is never guessed; a provider failure is a per-question status, not a 500.

const auth = () => ({ ok: true, user: { sub: "t1" } });
function call(question, aiResult, extra = {}) {
  const deps = {
    requireBuilderAuth: auth,
    callTextJson: aiResult instanceof Error ? async () => { throw aiResult; } : async () => ({ result: aiResult })
  };
  return handler({ json: async () => ({ question, issueCodes: ["MISSING_ANSWER"], fingerprint: "fp", questionId: "q1", ...extra }) }, deps);
}
const mcq = () => ({ id: "q1", presentationType: "multipleChoice", text: "س", options: [{ text: "A" }, { text: "B" }, { text: "C" }] });
const wb = () => ({ id: "q1", presentationType: "wordBank", text: "اختر ____", wordBank: ["OSPF", "RIP", "BGP"], fields: [{ id: "f1", kind: "select" }] });

describe("schema is enforcement-by-omission", () => {
  it("carries no protected property for any type", () => {
    for (const [type, ids] of [["multipleChoice", []], ["trueFalse", []], ["multiTrueFalse", ["f1"]], ["wordBank", ["f1"]]]) {
      const keys = Object.keys(buildProposalSchema(type, ids).properties);
      expect(keys).not.toEqual(expect.arrayContaining(["marks", "text", "options", "examQuestionId", "section", "displayNumber", "images", "presentationType"]));
      expect(buildProposalSchema(type, ids).additionalProperties).toBe(false);
    }
  });
  it("constrains multiTrueFalse/field ids to the EXISTING field ids via enum", () => {
    const s = buildProposalSchema("wordBank", ["f1", "f2"]);
    expect(s.properties.fieldValues.items.properties.id.enum).toEqual(["f1", "f2"]);
  });
  it("prompt forbids rewriting the question and asks for answer key only", () => {
    const p = buildProposalPrompt(mcq(), ["MISSING_ANSWER"]);
    expect(p).toMatch(/must NOT rewrite/i);
    expect(p).toMatch(/MISSING_ANSWER/);
  });
});

describe("validateProposal against the CURRENT question", () => {
  it("accepts a valid MCQ index; rejects an out-of-range one", () => {
    expect(validateProposal({ correctOptionIndex: 2, explanation: "x" }, mcq())).toEqual({ patch: { correctOptionIndex: 2 }, explanation: "x" });
    expect(validateProposal({ correctOptionIndex: 9 }, mcq()).needsManualReview).toBe(true);
    expect(validateProposal({ correctOptionIndex: -1 }, mcq()).needsManualReview).toBe(true);
  });
  it("wordBank: rejects a value that is not among the existing choices (AI may never add a word)", () => {
    expect(validateProposal({ fieldValues: [{ id: "f1", value: "OSPF" }], explanation: "" }, wb()).patch).toEqual({ fieldValues: { f1: "OSPF" } });
    expect(validateProposal({ fieldValues: [{ id: "f1", value: "EIGRP" }] }, wb()).needsManualReview).toBe(true);
  });
  it("rejects a proposal missing a value for some field", () => {
    const q = { id: "q1", presentationType: "fillBlank", fields: [{ id: "f1", kind: "text" }, { id: "f2", kind: "text" }] };
    expect(validateProposal({ fieldValues: [{ id: "f1", value: "A" }] }, q).needsManualReview).toBe(true);
  });
  it("ignores any unknown field id the AI tries to add (only existing ids are read)", () => {
    const q = { id: "q1", presentationType: "fillBlank", fields: [{ id: "f1", kind: "text" }] };
    const v = validateProposal({ fieldValues: [{ id: "f1", value: "A" }, { id: "ghost", value: "Z" }] }, q);
    expect(v.patch).toEqual({ fieldValues: { f1: "A" } });
  });
});

describe("handler behaviour", () => {
  it("returns a validated proposal for a good AI response", async () => {
    const r = await call(mcq(), { correctOptionIndex: 1, explanation: "لأن..." });
    expect(r.status).toBe(200);
    expect(r.jsonBody.proposal).toMatchObject({ patch: { correctOptionIndex: 1 }, presentationType: "multipleChoice", questionId: "q1", fingerprint: "fp" });
  });
  it("returns needsManualReview (not a bad patch) when the AI index is invalid", async () => {
    const r = await call(mcq(), { correctOptionIndex: 5 });
    expect(r.jsonBody.needsManualReview).toBe(true);
    expect(r.jsonBody.proposal).toBeUndefined();
  });
  it("an image-dependent question is never guessed — needsManualReview without calling the AI", async () => {
    let called = false;
    const deps = { requireBuilderAuth: auth, callTextJson: async () => { called = true; return { result: { correctOptionIndex: 0 } }; } };
    const q = { ...mcq(), image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,AAA" }] } };
    const r = await handler({ json: async () => ({ question: q, issueCodes: ["MISSING_ANSWER"] }) }, deps);
    expect(r.jsonBody.needsManualReview).toBe(true);
    expect(r.jsonBody.reason).toContain("صورة");
    expect(called).toBe(false);
    expect(questionHasImage(q)).toBe(true);
  });
  it("a provider failure becomes a per-question failed status, never a 500", async () => {
    const r = await call(mcq(), new Error("timeout"));
    expect(r.status).toBe(200);
    expect(r.jsonBody.failed).toBe(true);
    expect(r.jsonBody.reason).toMatch(/تعذّر|أعد/);
  });
  it("requires auth", async () => {
    const r = await handler({ json: async () => ({ question: mcq(), issueCodes: ["MISSING_ANSWER"] }) }, { requireBuilderAuth: () => ({ ok: false, response: { status: 401 } }) });
    expect(r.status).toBe(401);
  });
  it("rejects an unsupported type and an empty issue list", async () => {
    expect((await call({ id: "q1", presentationType: "essay" }, {})).status).toBe(400);
    expect((await handler({ json: async () => ({ question: mcq(), issueCodes: [] }) }, { requireBuilderAuth: auth })).status).toBe(400);
  });
  it("never lets the AI change marks/text even if it returns them (they are simply not read)", async () => {
    const r = await call(mcq(), { correctOptionIndex: 0, explanation: "x", marks: 999, text: "HACKED", options: ["z"] });
    expect(r.jsonBody.proposal.patch).toEqual({ correctOptionIndex: 0 });
    expect(JSON.stringify(r.jsonBody.proposal)).not.toContain("HACKED");
    expect(JSON.stringify(r.jsonBody.proposal)).not.toContain("999");
  });
});
