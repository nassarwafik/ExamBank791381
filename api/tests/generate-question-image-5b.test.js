import { describe, it, expect } from "vitest";
import { handler, buildImagePrompt } from "../src/functions/generate-question-image.js";
import { sanitizeExamForStudent, sanitizeQuestionForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 5B — the structured question-media AI endpoint (reused, not rewritten) and the student sanitizer.
const req = body => ({ method: "POST", url: "http://x/generate-question-image", json: async () => body });
const okAuth = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }) };
// A fake OpenAI client whose images.generate returns a base64 png (no real network / model call).
function fakeOpenAI() { return class { constructor() { this.images = { generate: async () => ({ data: [{ b64_json: "QUJD" }] }) }; } }; }

describe("Phase 5B — generate-question-image endpoint", () => {
  it("unauthenticated request is rejected with the auth response", async () => {
    const r = await handler(req({ question: { examQuestionId: "q1", text: "t" } }), { requireBuilderAuth: () => ({ ok: false, response: { status: 401, jsonBody: { ok: false } } }) });
    expect(r.status).toBe(401);
  });
  it("missing question → 400", async () => {
    expect((await handler(req({}), okAuth)).status).toBe(400);
    expect((await handler(req({ question: { examQuestionId: "q1" } }), okAuth)).status).toBe(400); // no text
  });
  it("a safe structured question payload is accepted → 200 with an ai-generated asset", async () => {
    const r = await handler(req({ question: { examQuestionId: "q1", text: "أي جهاز يوجّه الحزم؟", options: [{ text: "Router" }] } }), { ...okAuth, loadOpenAI: async () => fakeOpenAI(), env: { OPENAI_API_KEY: "test-key" } });
    expect(r.status).toBe(200);
    expect(r.jsonBody.ok).toBe(true);
    expect(r.jsonBody.asset.origin).toBe("ai-generated");
    expect(r.jsonBody.asset.dataUrl).toBe("data:image/png;base64,QUJD");
    expect(r.jsonBody.model).toBe("gpt-image-2");
  });
  it("buildImagePrompt uses only topic/text/options — never the answer key", () => {
    const prompt = buildImagePrompt({ examQuestionId: "q1", text: "أي جهاز يوجّه الحزم؟", topic: "Routing", options: [{ text: "Router" }, { text: "Switch" }], answer: { correctOptionIndex: 0, text: "SECRET_ANSWER" } });
    expect(prompt).toContain("Router");
    expect(prompt).toContain("Routing");
    expect(prompt).not.toContain("SECRET_ANSWER");
    expect(prompt).not.toContain("correctOptionIndex");
    expect(prompt).toContain("MUST NOT reveal");
  });
});

describe("Phase 5B — student sanitizer keeps the image, strips answer + AI prompt", () => {
  it("a structured question's image survives sanitization while answer is stripped", () => {
    const out = sanitizeQuestionForStudent({ examQuestionId: "q1", text: "س", answer: { text: "SECRET" }, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,AAA", origin: "ai-generated" }] } });
    expect(out.image.assets[0].dataUrl).toBe("data:image/png;base64,AAA");
    expect(out.answer).toEqual({});
  });
  it("an AI prompt on an image object/asset is stripped (defense in depth) — never reaches the student", () => {
    const exam = { sections: [{ id: "s1", questions: [{ examQuestionId: "q1", text: "س", answer: { text: "SECRET" }, image: { exists: true, visible: true, prompt: "LEAKY PROMPT", assets: [{ dataUrl: "data:image/png;base64,AAA", prompt: "ALSO LEAKY" }] } }] }] };
    const safe = sanitizeExamForStudent(exam);
    const q = safe.sections[0].questions[0];
    expect(q.image.assets[0].dataUrl).toBe("data:image/png;base64,AAA"); // image kept
    expect("prompt" in q.image).toBe(false);                              // object prompt stripped
    expect("prompt" in q.image.assets[0]).toBe(false);                    // asset prompt stripped
    expect(JSON.stringify(safe)).not.toContain("LEAKY");
    expect(JSON.stringify(safe)).not.toContain("SECRET");                 // answer key gone
  });
});
