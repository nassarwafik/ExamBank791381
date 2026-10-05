import { describe, it, expect } from "vitest";
import { handler } from "../src/functions/ai-question-author.js";

// Phase 19D — POST /api/ai-question-author never returns a visual question: a hotspot / labelDiagram draft is refused with
// AI_VISUAL_GEOMETRY_REQUIRED (the teacher places targets / zones on an attached image); no coordinates are ever invented. Fail-first on e0ec8e2.
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null };
const DRAFT = over => ({ intent: "hotspot", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "انقر على الموجّه في المخطط.", marks: 2, ...NONE, ...over });
const call = async (body, ai) => handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t" } }), callTextJson: async () => ({ result: ai }) });

describe("19D /api/ai-question-author — visual intents", () => {
  it("hotspot and labelDiagram drafts are refused (200, ok:false) with no question and no coordinates", async () => {
    for (const intent of ["hotspot", "labelDiagram"]) {
      const r = await call({ request: "انقر على الموجّه في الصورة", preferredType: intent }, DRAFT({ intent }));
      expect(r.status).toBe(200);
      expect(r.jsonBody).toMatchObject({ ok: false, code: "AI_VISUAL_GEOMETRY_REQUIRED", intent });
      expect(r.jsonBody.question).toBeUndefined();
      expect(JSON.stringify(r.jsonBody)).not.toMatch(/"regions"|"zones"|"shape"/);
    }
  });
});
