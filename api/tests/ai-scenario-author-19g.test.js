import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { handler, MAX_REQUEST_CHARS } from "../src/functions/ai-scenario-author.js";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";
import { evaluateServerFinalization } from "../src/lib/server-finalization.js";
import { gradeExam } from "../src/lib/assignment-grading.js";
import { SHARED_ENTRIES } from "../../scripts/build-shared-finalization.mjs";

// Phase 19G — POST /api/ai-scenario-author: a teacher's natural-language request → ONE AI-proposed scenario draft → the deterministic
// shared normalizer → the SAME canonical validators manual authoring uses (source contract, 19A question layer, finalization gate). The
// endpoint never publishes or mutates an exam; it returns a canonical scenario + questions for the teacher to insert as a draft, or a
// refusal with the canonical issues; the inserted section then projects to students with nothing private. New-function suite
// (fail-first on 2aa40da: the endpoint does not exist).
const require_ = createRequire(import.meta.url);
const auth = () => ({ ok: true, user: { sub: "teacher" } });
const deny = () => ({ ok: false, response: { status: 401, jsonBody: { ok: false, error: "unauthorized" } } });
const req = body => ({ json: async () => body });
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
const qBase = over => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "س", marks: 2, ...NONE, ...over });
const MCQ = qBase({ intent: "multipleChoice", text: "ما البروتوكول الذي يوزّع العناوين؟", marks: 2, multipleChoice: { options: ["DHCP", "DNS", "ARP"], correctIndex: 0 } });
const SHORT = qBase({ intent: "shortAnswer", text: "اذكر طبقة DHCP.", marks: 1, shortAnswer: { modelAnswer: "MODEL-SECRET" } });
const src = (over = {}) => ({ kind: "text", title: "النص", text: "بروتوكول DHCP يوزّع عناوين IP تلقائيًا.", headers: [], rows: [], language: "", source: "", ...over });
const DRAFT = { title: "سيناريو DHCP", instructions: "اقرأ النص ثم أجب.", explanation: "", sources: [src(), src({ kind: "code", title: "كود", text: "", language: "python", source: "print(1)\n" })], questions: [MCQ, SHORT] };
const call = async (body, ai, deps = {}) => {
  const calls = [];
  const r = await handler(req(body), { requireBuilderAuth: auth, callTextJson: async args => { calls.push(args); if (ai instanceof Error) throw ai; return { result: typeof ai === "function" ? ai(args) : ai }; }, ...deps });
  return { r, calls };
};

describe("19G /api/ai-scenario-author — boundary", () => {
  it("requires the teacher session (no AI call on an anonymous request)", async () => {
    const { r, calls } = await call({ request: "x" }, DRAFT, { requireBuilderAuth: deny });
    expect(r.status).toBe(401); expect(calls).toEqual([]);
  });
  it("refuses an empty, non-string, over-long or extra-field request before any AI call", async () => {
    for (const body of [{}, { request: "" }, { request: "   " }, { request: 7 }, { request: "x".repeat(MAX_REQUEST_CHARS + 1) }, { request: "x", exam: {} }, null, []]) {
      const { r, calls } = await call(body, DRAFT);
      expect(r.status, JSON.stringify(body)).toBe(400); expect(calls).toEqual([]);
    }
  });
  it("the AI receives the strict scenario schema and the request — never an exam, a key or a token; a provider failure is a generic 502", async () => {
    const { calls } = await call({ request: "سيناريو عن DHCP" }, DRAFT);
    expect(calls.length).toBe(1);
    expect(calls[0].schema.additionalProperties).toBe(false); expect(calls[0].schemaName).toBe("ai_scenario_draft");
    expect(calls[0].schema.properties.sources.items.properties.kind.enum).toEqual(["text", "table", "code"]);
    expect(calls[0].prompt).toContain("سيناريو عن DHCP"); expect(calls[0].prompt).toMatch(/ONE SCENARIO/);
    expect(JSON.stringify(calls[0])).not.toMatch(/BUILDER_SESSION_SECRET|hiddenTests|x-builder-token|Bearer/);
    const { r } = await call({ request: "x" }, new Error("boom"));
    expect(r.status).toBe(502); expect(r.jsonBody.code).toBe("AI_PROVIDER_FAILED"); expect(JSON.stringify(r.jsonBody)).not.toContain("boom");
  });
});

describe("19G /api/ai-scenario-author — the canonical authority decides", () => {
  it("a valid draft → 200 ok with ONE canonical scenario + canonical questions; inserted into a section it finalizes on the SERVER and projects nothing private", async () => {
    const { r } = await call({ request: "سيناريو عن DHCP" }, DRAFT);
    expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(true);
    const { scenario, questions } = r.jsonBody;
    expect(scenario).toMatchObject({ id: "ai-scenario", version: 1, title: "سيناريو DHCP", questionIds: ["ai-scn-q1", "ai-scn-q2"] });
    expect(scenario.sources.map(s => s.kind)).toEqual(["text", "code"]);
    const exam = { examId: "e", title: "t", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "س", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, scenarios: [scenario], questions }] };
    expect(evaluateServerFinalization(exam).canFinalize).toBe(true);
    const student = sanitizeExamForStudent(exam);
    expect(student.sections[0].scenarios).toEqual([scenario]);
    expect(JSON.stringify(student)).not.toMatch(/MODEL-SECRET|correctOptionIndex/);
    expect(gradeExam(exam, { "ai-scn-q1": { kind: "choice", index: 0 } }).score).toBe(2);   // the questions grade through the ordinary engines
    expect(SHARED_ENTRIES).toContain("src/aiScenarioDraft.ts");
  });
  it("an image source, a private field in a source, a refused question or a malformed response → 200 ok:false with a code and NO scenario", async () => {
    for (const [bad, code] of [
      [{ ...DRAFT, sources: [src({ kind: "image" })] }, "AI_SCENARIO_MALFORMED"],
      [{ ...DRAFT, sources: [src({ answer: "x" })] }, "AI_SCENARIO_MALFORMED"],
      [{ ...DRAFT, sources: [src({ text: "" })] }, "AI_SCENARIO_SOURCE_INVALID"],
      [{ ...DRAFT, questions: [MCQ, qBase({ intent: "hotspot", text: "حدّد", marks: 2 })] }, "AI_SCENARIO_QUESTION_INVALID"],
      [{ ...DRAFT, questions: [] }, "AI_SCENARIO_MALFORMED"], ["garbage", "AI_SCENARIO_MALFORMED"]
    ]) {
      const { r } = await call({ request: "x" }, bad);
      expect(r.status).toBe(200); expect(r.jsonBody.ok).toBe(false); expect(r.jsonBody.code).toBe(code);
      expect("scenario" in r.jsonBody).toBe(false); expect("questions" in r.jsonBody).toBe(false);
    }
  });
  it("the committed shared build agrees with the TypeScript source", async () => {
    const shared = require_("../src/lib/shared-finalization/aiScenarioDraft.js");
    const ts = await import("../../src/aiScenarioDraft.ts");
    expect(shared.normalizeAiScenarioDraft(DRAFT, { request: "x" })).toEqual(ts.normalizeAiScenarioDraft(DRAFT, { request: "x" }));
    expect(shared.buildAiScenarioSchema()).toEqual(ts.buildAiScenarioSchema());
  });
});
