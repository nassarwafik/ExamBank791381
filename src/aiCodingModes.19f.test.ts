import { describe, expect, it } from "vitest";
import * as AI from "./aiQuestionDraft";

// Phase 19F — AI authoring of the advanced coding modes. The AI may PROPOSE: a predict-output question (multipleChoice / shortAnswer +
// a read-only `codeStimulus`), a trace-execution table (tableFill + `codeStimulus`) and a coding@2 question's PUBLIC material (mode,
// language, starter code — a shell, a buggy program, an incomplete program — and public examples). It must NOT create trusted grading
// material: no hidden test, no reference solution, no automatic grading — a coding draft is manual-graded until the teacher writes and
// verifies hidden tests. Everything is judged by the canonical validators (no repair). Fail-first on 784a59e: the stimulus / tableFill /
// coding payloads do not exist and a coding intent is refused as "never generated".
const A = AI as unknown as Record<string, unknown> & typeof AI;
const NONE = { multipleChoice: null, trueFalse: null, shortAnswer: null, fillBlank: null, inlineCloze: null, networkCli: null, parametricNumeric: null, openResponse: null, codeStimulus: null, tableFill: null, coding: null };
const PROG = "x = 3\nfor i in range(2):\n    x = x * 2\nprint(x)\n";
const STIM = { language: "python", source: PROG, label: "البرنامج" };
const draft = (over: Record<string, unknown>) => ({ intent: "multipleChoice", confidence: "clear", unsupportedCapabilities: [], explanation: "", text: "ما الناتج الذي يطبعه البرنامج؟", marks: 2, ...NONE, ...over });
const ok = (r: ReturnType<typeof AI.normalizeAiQuestionDraft>) => { if (!r.ok) throw new Error(r.code + " " + JSON.stringify(r.issues)); return r.question as unknown as Record<string, any>; };
const CODING = { mode: "fixBug", language: "python", starterCode: "n = int(input())\nprint(sum(range(1, n)))\n", publicExamples: [{ input: "4\n", sampleOutput: "10\n" }] };

describe("19F AI-1 — schema and prompt", () => {
  it("A1 the strict schema requires the three new payloads; tableFill is an intent; coding / tableFill are generated types", () => {
    const s = A.buildAiAuthorSchema() as { properties: Record<string, any>; required: string[] };
    for (const k of ["codeStimulus", "tableFill", "coding"]) expect(s.required).toContain(k);
    expect(s.properties.codeStimulus.anyOf[1].properties.language.enum).toEqual(["python", "java", "csharp", "pseudocode"]);
    expect(Object.keys(s.properties.coding.anyOf[1].properties).sort()).toEqual(["language", "mode", "publicExamples", "starterCode"]);
    expect(JSON.stringify(s.properties.coding)).not.toMatch(/hidden|reference|expected|gradingMode|weight/i);
    expect(A.AI_AUTHOR_INTENTS).toContain("tableFill");
    expect(A.AI_GENERATED_TYPES).toContain("coding"); expect(A.AI_GENERATED_TYPES).toContain("tableFill");
    expect(A.AI_GENERATED_TYPES).not.toContain("simulation");
  });
  it("A2 the prompt forbids hidden tests / solutions and explains predict-output and trace", () => {
    const p = A.buildAiAuthorPrompt("x", { suggestedIntent: null, unsupportedCapabilities: [] });
    expect(p).toMatch(/cannot create hidden tests/i); expect(p).toMatch(/NEVER put the full correct solution/); expect(p).toMatch(/codeStimulus/); expect(p).toMatch(/answerCells/);
  });
  it("A3 advisory signals: tracing a program ⇒ tableFill; predicting what it prints ⇒ multipleChoice; writing one ⇒ coding", () => {
    expect(A.classifyAuthorRequest("سؤال تتبع تنفيذ برنامج بايثون فيه حلقة").suggestedIntent).toBe("tableFill");
    expect(A.classifyAuthorRequest("ما ناتج هذا البرنامج بلغة جافا؟").suggestedIntent).toBe("multipleChoice");
    expect(A.classifyAuthorRequest("predict the output of this python code").suggestedIntent).toBe("multipleChoice");
    expect(A.classifyAuthorRequest("اكتب برنامج بايثون يحسب المجموع").suggestedIntent).toBe("coding");
  });
});

describe("19F AI-2 — predict output and trace execution", () => {
  it("A4 multipleChoice + stimulus → a canonical MCQ carrying the strict stimulus; shortAnswer likewise", () => {
    const q = ok(A.normalizeAiQuestionDraft(draft({ multipleChoice: { options: ["12", "6", "8"], correctIndex: 0 }, codeStimulus: STIM }), { request: "ما ناتج البرنامج" }));
    expect(q).toMatchObject({ presentationType: "multipleChoice", codeStimulus: STIM, answer: { correctOptionIndex: 0 } });
    const sa = ok(A.normalizeAiQuestionDraft(draft({ intent: "shortAnswer", shortAnswer: { modelAnswer: "12" }, codeStimulus: { ...STIM, label: "" } }), { request: "x" }));
    expect(sa).toMatchObject({ presentationType: "shortAnswer", codeStimulus: { language: "python", source: PROG }, answer: { text: "12" } });
    expect(sa.codeStimulus.label).toBeUndefined();
  });
  it("A5 tableFill trace → canonical table; answer cells are EMPTY in the visible grid even if the AI filled them", () => {
    const q = ok(A.normalizeAiQuestionDraft(draft({ intent: "tableFill", text: "تتبع قيمة x", marks: 2, codeStimulus: STIM, tableFill: { headers: ["i", "x"], rows: [["0", "6"], ["1", "12"]], answerCells: [{ row: 0, column: 1, correct: "6" }, { row: 1, column: 1, correct: "12" }] } }), { request: "تتبع" }));
    expect(q.presentationType).toBe("tableFill");
    expect(q.tableRows).toEqual([["0", ""], ["1", ""]]);
    expect(q.fields).toEqual([{ id: "f1", kind: "text", row: 0, column: 1, correct: "6" }, { id: "f2", kind: "text", row: 1, column: 1, correct: "12" }]);
    expect(q.codeStimulus).toEqual(STIM);
  });
  it("A6 invalid content is refused by the canonical validators, never repaired", () => {
    const r1 = A.normalizeAiQuestionDraft(draft({ intent: "tableFill", tableFill: { headers: ["i"], rows: [["0"]], answerCells: [{ row: 3, column: 0, correct: "1" }] } }), { request: "x" });
    expect(r1).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
    const r2 = A.normalizeAiQuestionDraft(draft({ multipleChoice: { options: ["1", "2"], correctIndex: 0 }, codeStimulus: { ...STIM, language: "pseudocode", source: "" } }), { request: "x" });
    expect(r2).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
    const r3 = A.normalizeAiQuestionDraft(draft({ multipleChoice: { options: ["1", "2"], correctIndex: 0 }, codeStimulus: { ...STIM, language: "brainfuck" } }), { request: "x" });
    expect(r3).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID" });
  });
  it("A7 a stimulus on any other intent is refused (it is a reading aid for MCQ / shortAnswer / trace only)", () => {
    const r = A.normalizeAiQuestionDraft(draft({ intent: "trueFalse", trueFalse: { correct: true }, codeStimulus: STIM }), { request: "x" });
    expect(r).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID", issues: [{ code: "AI_CODE_STIMULUS_UNSUPPORTED" }] });
  });
});

describe("19F AI-3 — coding: public material only, never trusted grading material", () => {
  it("A8 a fixBug / completeCode / writeProgram draft → coding@2, manual grading, NO hidden test, NO reference solution; a note says so", () => {
    for (const mode of ["fixBug", "completeCode", "writeProgram"]) {
      const r = A.normalizeAiQuestionDraft(draft({ intent: "coding", text: "أصلح الخطأ", marks: 10, coding: { ...CODING, mode } }), { request: "python" });
      const q = ok(r);
      expect(q).toMatchObject({ presentationType: "coding", questionTypeVersion: 2 });
      expect(q.answer).toEqual({ hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, gradingMode: "manual", compileErrorPolicy: "manualReview" });
      expect(q.coding.starterCode).toEqual({ python: CODING.starterCode });
      expect(q.coding.publicTests).toEqual([{ id: "pub1", title: "مثال 1", input: "4\n", sampleOutput: "10\n" }]);
      if (r.ok) expect(r.notes).toContain(A.AI_CODING_NOTE);
    }
    const java = ok(A.normalizeAiQuestionDraft(draft({ intent: "coding", text: "اكتب برنامجًا", marks: 5, coding: { mode: "writeProgram", language: "java", starterCode: "", publicExamples: [] } }), { request: "java" }));
    expect(java.coding.starterCode.java).toContain("public class Main");
  });
  it("A9 hidden tests / reference solutions / grading smuggled into the payload or the root → malformed (fail closed)", () => {
    for (const bad of [
      draft({ intent: "coding", coding: { ...CODING, hiddenTests: [{ input: "1", expectedOutput: "1" }] } }),
      draft({ intent: "coding", coding: { ...CODING, referenceSolution: "print(10)" } }),
      draft({ intent: "coding", coding: CODING, answer: { hiddenTests: [] } }),
      draft({ intent: "coding", coding: { ...CODING, publicExamples: [{ input: "1", sampleOutput: "1", hidden: true }] } }),
      draft({ intent: "coding", coding: { ...CODING, gradingMode: "hiddenTests" } })
    ]) expect(A.normalizeAiQuestionDraft(bad, { request: "x" })).toMatchObject({ ok: false, code: "AI_DRAFT_MALFORMED" });
  });
  it("A10 the Builder's re-verification refuses an AI coding node carrying ANY trusted material or another version", () => {
    const good = ok(A.normalizeAiQuestionDraft(draft({ intent: "coding", coding: CODING, text: "أصلح", marks: 10 }), { request: "x" }));
    expect(A.verifyAiQuestionNode(good).ok).toBe(true);
    const variants = [
      { ...good, answer: { ...good.answer, hiddenTests: [{ id: "h1", input: "4\n", expectedOutput: "10\n", weight: 1 }] } },
      { ...good, answer: { ...good.answer, referenceSolutions: { python: "print(10)" } } },
      { ...good, answer: { ...good.answer, gradingMode: "hiddenTests" } },
      { ...good, answer: { ...good.answer, scoringPolicy: "allOrNothing" } },
      { ...good, questionTypeVersion: 3 }
    ];
    for (const v of variants) expect(A.verifyAiQuestionNode(v)).toMatchObject({ ok: false, code: "AI_DRAFT_INVALID", issues: [{ code: "AI_CODING_TRUSTED_MATERIAL_FORBIDDEN" }] });
  });
  it("A11 fixBug / completeCode need a starter; an unknown mode or language is refused", () => {
    expect(A.normalizeAiQuestionDraft(draft({ intent: "coding", coding: { ...CODING, starterCode: "  " } }), { request: "x" })).toMatchObject({ ok: false, issues: [{ code: "AI_CODING_STARTER_REQUIRED" }] });
    expect(A.normalizeAiQuestionDraft(draft({ intent: "coding", coding: { ...CODING, mode: "lockedTemplate" } }), { request: "x" })).toMatchObject({ ok: false, issues: [{ code: "AI_CODING_INVALID" }] });
    expect(A.normalizeAiQuestionDraft(draft({ intent: "coding", coding: { ...CODING, language: "cobol" } }), { request: "x" })).toMatchObject({ ok: false, issues: [{ code: "AI_CODING_INVALID" }] });
  });
});
