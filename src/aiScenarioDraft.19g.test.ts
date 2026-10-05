import { describe, it, expect } from "vitest";
import * as D from "./aiScenarioDraft";
import { validateStructuredExam } from "./examQuality";
import { evaluateExamFinalization } from "./examFinalization";

// Phase 19G — AI scenario authoring (pure layer): the strict schema and prompt, the deterministic mapping of PUBLIC sources (text / table /
// code — never an image) through the canonical source contract, every question through the 19A single-question layer (its refusals
// inherited), the whole section through the canonical finalization gate, all-or-nothing refusals, and the client-side re-verification.
// Fail-first on 2aa40da: ./aiScenarioDraft does not exist.
type R = Record<string, unknown>;
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
const qBase = (over: R = {}): R => ({ intent: "shortAnswer", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "س", marks: 2, ...NONE, ...over });
const MCQ = qBase({ intent: "multipleChoice", text: "ما البروتوكول الذي يوزّع العناوين؟", marks: 2, multipleChoice: { options: ["DHCP", "DNS", "ARP"], correctIndex: 0 } });
const SHORT = qBase({ intent: "shortAnswer", text: "اذكر طبقة DHCP.", marks: 1, shortAnswer: { modelAnswer: "التطبيقات" } });
const OPEN = qBase({ intent: "openResponse", text: "قارن بين DHCP والتعيين اليدوي.", marks: 6, openResponse: { profile: "compare", instructions: "قارن.", minChars: 0, maxChars: 500, rubricVisibility: "visible", criteria: [{ title: "الدقة", description: "", guidance: "G", maxScore: 4, allowCustomScore: false, levels: [{ label: "كامل", score: 4, description: "" }, { label: "لا", score: 0, description: "" }] }, { title: "التعليل", description: "", guidance: "", maxScore: 2, allowCustomScore: true, levels: [{ label: "كامل", score: 2, description: "" }, { label: "لا", score: 0, description: "" }] }], modelAnswer: "M" } });
const src = (over: R = {}): R => ({ kind: "text", title: "النص", text: "بروتوكول DHCP يوزّع عناوين IP تلقائيًا.", headers: [], rows: [], language: "", source: "", ...over });
const TABLE = src({ kind: "table", title: "جدول", text: "", headers: ["الجهاز", "العنوان"], rows: [["PC1", "10.0.0.5"], ["PC2", "10.0.0.6"]] });
const CODE = src({ kind: "code", title: "البرنامج", text: "", language: "python", source: "print('hi')\n" });
const draft = (over: R = {}): R => ({ title: "سيناريو DHCP", instructions: "اقرأ النص ثم أجب.", explanation: "", sources: [src(), TABLE, CODE], questions: [MCQ, SHORT, OPEN], ...over });
const CTX = { request: "سيناريو عن DHCP مع ثلاثة أسئلة" };
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));

describe("19G-A1 — schema and prompt", () => {
  it("A1 the schema is strict (additionalProperties false everywhere, every property required), has NO image kind, and nests the 19A question schema", () => {
    const s = D.buildAiScenarioSchema() as unknown as { additionalProperties: boolean; required: string[]; properties: R };
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(["title", "instructions", "explanation", "sources", "questions"]);
    const sources = s.properties.sources as { maxItems: number; items: { additionalProperties: boolean; properties: { kind: { enum: string[] } } } };
    expect(sources.maxItems).toBe(4); expect(sources.items.additionalProperties).toBe(false);
    expect(sources.items.properties.kind.enum).toEqual(["text", "table", "code"]);
    const questions = s.properties.questions as { maxItems: number; items: { properties: { intent: unknown; coding: unknown } } };
    expect(questions.maxItems).toBe(6); expect(questions.items.properties.intent).toBeTruthy(); expect(questions.items.properties.coding).toBeTruthy();
    expect(JSON.stringify(s)).not.toMatch(/dataUrl|blobName|image|hiddenTests|referenceSolution/);
    expect(D.AI_SCENARIO_SOURCE_KINDS).toEqual(["text", "table", "code"]);
  });
  it("A2 the prompt carries the scenario rules (public sources, no answers in a source, no images) and the per-question rules, and the request once", () => {
    const p = D.buildAiScenarioPrompt(CTX.request, D.classifyAuthorRequest(CTX.request));
    expect(p).toMatch(/ONE SCENARIO/); expect(p).toMatch(/NEVER contains an answer/); expect(p).toMatch(/Never propose an image/);
    expect(p).toMatch(/Per-question rules/); expect(p).toMatch(/inlineCloze/); expect(p).toMatch(/hidden tests/i);
    expect(p.split(CTX.request).length - 1).toBe(1);
  });
});

describe("19G-A3 — normalization through the canonical authorities", () => {
  it("A3 a valid draft becomes ONE canonical scenario (text / table / code sources, ids ai-src-N) + canonical questions (ids ai-scn-qN) that finalize", () => {
    const r = D.normalizeAiScenarioDraft(draft(), CTX);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenario).toMatchObject({ id: "ai-scenario", version: 1, title: "سيناريو DHCP", instructions: "اقرأ النص ثم أجب.", questionIds: ["ai-scn-q1", "ai-scn-q2", "ai-scn-q3"] });
    expect(r.scenario.sources.map(s => [s.id, s.kind])).toEqual([["ai-src-1", "text"], ["ai-src-2", "table"], ["ai-src-3", "code"]]);
    expect(r.scenario.sources[1]).toMatchObject({ columnHeaders: ["الجهاز", "العنوان"], rows: [["PC1", "10.0.0.5"], ["PC2", "10.0.0.6"]] });
    expect(r.questions.map(q => q.presentationType)).toEqual(["multipleChoice", "shortAnswer", "openResponse"]);
    expect(r.questions.map(q => q.examQuestionId)).toEqual(["ai-scn-q1", "ai-scn-q2", "ai-scn-q3"]);
    const exam = { examId: "e", title: "t", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "س", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, scenarios: [r.scenario], questions: r.questions }] } as never;
    expect(validateStructuredExam(exam).filter(i => i.severity === "error")).toEqual([]);
    expect(evaluateExamFinalization(exam).canFinalize).toBe(true);
    expect(JSON.stringify(r.scenario)).not.toMatch(/answer|modelAnswer|guidance|correctIndex/);   // the scenario carries nothing private
  });
  const malformed: [string, unknown][] = [
    ["not an object", "x"], ["unknown root key", draft({ answer: "x" })], ["missing sources", (() => { const d = draft(); delete d.sources; return d; })()],
    ["no sources", draft({ sources: [] })], ["5 sources", draft({ sources: [src(), src(), src(), src(), src()] })],
    ["no questions", draft({ questions: [] })], ["7 questions", draft({ questions: [MCQ, MCQ, MCQ, MCQ, MCQ, MCQ, MCQ] })],
    ["image kind", draft({ sources: [src({ kind: "image" })] })], ["source with extra key", draft({ sources: [src({ answer: "x" })] })],
    ["source with dataUrl", draft({ sources: [src({ dataUrl: "data:image/png;base64,AA" })] })],
    ["unknown language", draft({ sources: [src({ kind: "code", language: "javascript", source: "x" })] })],
    ["title too long", draft({ title: "x".repeat(201) })], ["prototype key", JSON.parse(JSON.stringify(draft()).replace('"explanation"', '"__proto__"'))]
  ];
  for (const [name, raw] of malformed) it("A4 malformed: " + name + " → AI_SCENARIO_MALFORMED, nothing produced", () => {
    const r = D.normalizeAiScenarioDraft(raw, CTX);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("AI_SCENARIO_MALFORMED");
  });
  it("A5 a source that fails the canonical source contract refuses the whole scenario with the source's issue", () => {
    for (const [bad, code] of [[src({ text: "" }), "SOURCE_TEXT_INVALID"], [src({ kind: "table", text: "", headers: ["a", "b"], rows: [["1"]] }), "SOURCE_TABLE_INVALID"], [src({ kind: "code", text: "", language: "python", source: "   " }), "CODE_STIMULUS_SOURCE_EMPTY"]] as [R, string][]) {
      const r = D.normalizeAiScenarioDraft(draft({ sources: [bad] }), CTX);
      expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe("AI_SCENARIO_SOURCE_INVALID"); expect(codes(r)).toContain(code); }
    }
  });
  it("A6 ALL OR NOTHING: one refused question (a hotspot intent, a simulation, hidden coding tests, an unknown intent) refuses the scenario with the 19A reason", () => {
    const hotspot = qBase({ intent: "hotspot", text: "حدّد", marks: 2 });
    const sim = qBase({ intent: "simulation", text: "محاكاة", marks: 2 });
    const unknown = qBase({ intent: "weird", text: "x", marks: 2 });
    for (const [bad, code] of [[hotspot, "AI_VISUAL_GEOMETRY_REQUIRED"], [sim, "AI_TYPE_NOT_GENERATED"], [unknown, "AI_INTENT_UNKNOWN"]] as [R, string][]) {
      const r = D.normalizeAiScenarioDraft(draft({ questions: [MCQ, bad] }), CTX);
      expect(r.ok).toBe(false); if (!r.ok) { expect(r.code).toBe("AI_SCENARIO_QUESTION_INVALID"); expect(codes(r)).toContain(code); expect(r.issues[0].message).toMatch(/^السؤال 2/); }
    }
    const coding = qBase({ intent: "coding", text: "اكتب", marks: 5, coding: { mode: "writeProgram", language: "python", starterCode: "", publicExamples: [] } });
    const r = D.normalizeAiScenarioDraft(draft({ questions: [MCQ, coding] }), CTX);
    expect(r.ok).toBe(true);
    if (r.ok) { const c = r.questions[1] as unknown as { answer: { hiddenTests: unknown[]; gradingMode: string } }; expect(c.answer.hiddenTests).toEqual([]); expect(c.answer.gradingMode).toBe("manual"); expect(r.notes.join(" ")).toMatch(/بلا اختبارات مخفية/); }
  });
  it("A7 an invalid question payload (MCQ without a correct option) refuses the whole scenario", () => {
    const r = D.normalizeAiScenarioDraft(draft({ questions: [MCQ, qBase({ intent: "multipleChoice", text: "س", marks: 1, multipleChoice: { options: ["أ"], correctIndex: -1 } })] }), CTX);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe("AI_SCENARIO_QUESTION_INVALID");
  });
});

describe("19G-A8 — the Builder's re-verification refuses tampering", () => {
  const good = () => { const r = D.normalizeAiScenarioDraft(draft(), CTX); if (!r.ok) throw new Error("fixture"); return { scenario: r.scenario, questions: r.questions }; };
  it("A8 the server result passes; a smuggled private field, an image source, a foreign question, hidden tests or a membership mismatch is refused", () => {
    expect(D.verifyAiScenarioDraft(good()).ok).toBe(true);
    const tamper = (fn: (g: ReturnType<typeof good>) => unknown) => D.verifyAiScenarioDraft(fn(good()));
    expect(tamper(g => ({ ...g, scenario: { ...g.scenario, sources: [{ ...g.scenario.sources[0], answer: "x" }] } })).ok).toBe(false);
    expect(codes(tamper(g => ({ ...g, scenario: { ...g.scenario, sources: [{ id: "i", version: 1, kind: "image", alt: "a", image: { dataUrl: "data:image/png;base64,AA" } }] } })))).toContain("AI_SCENARIO_SOURCE_KIND_FORBIDDEN");
    expect(tamper(g => ({ ...g, questions: [...g.questions, { examQuestionId: "x", presentationType: "hotspot", text: "x", marks: 1 }] })).ok).toBe(false);
    expect(tamper(g => ({ ...g, questions: g.questions.map(q => (q.presentationType === "shortAnswer" ? { ...q, hiddenTests: [] } : q)) })).ok).toBe(false);
    expect(codes(tamper(g => ({ ...g, scenario: { ...g.scenario, questionIds: g.scenario.questionIds.slice(0, 1) } })))).toContain("AI_SCENARIO_MEMBERSHIP");
    expect(tamper(g => ({ ...g, scenario: { ...g.scenario, version: 2 } })).ok).toBe(false);
    expect(tamper(g => ({ ...g, extra: 1 })).ok).toBe(false);
  });
});
