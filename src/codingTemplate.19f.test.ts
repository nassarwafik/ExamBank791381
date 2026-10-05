import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import * as TPL from "./codingTemplate";
import * as CQ from "./codingQuestion";
import * as STIM from "./codeStimulus";
import * as PRESETS from "./codingPresets";
import * as AUTHOR from "./coding/templateAuthoring";
import { QUESTION_TYPE_CATALOG, currentQuestionTypeVersion, effectiveQuestionTypeVersion } from "./questionTypeCatalog";
import * as CATALOG from "./questionTypeCatalog";
import { validateQuestionTypeNode } from "./questionTypeValidation";
import { hasRegisteredTypeDefaults } from "./questionTypeDefaults";
import { changeQuestionType, newQuestion } from "./examBuilderState";
import { evaluateExamFinalization } from "./examFinalization";
import { answered, type Answer } from "./answerState";

// Phase 19F — the coding@3 LOCKED TEMPLATE contract (pure), the read-only CODE STIMULUS contract, the authoring PRESETS and the template
// AUTHORING operations. Fail-first on 784a59e: ./codingTemplate, ./codeStimulus, ./codingPresets and ./coding/templateAuthoring do not
// exist and coding@3 is an unsupported version.
type R = Record<string, unknown>;
const T = TPL as unknown as R & typeof TPL;
const C = CQ as unknown as R & typeof CQ;
const tpl = () => ({ language: "python", segments: [{ kind: "locked", text: "def f(x):\n" }, { kind: "editable", id: "body", starter: "    return x\n" }, { kind: "locked", text: "\nprint(f(input()))\n" }] });
const ans = (values: R, over: R = {}) => ({ kind: "codeTemplate", language: "python", languageVersion: 1, values, ...over });
const codes = (r: { ok: boolean; issues?: { code: string }[] }) => (r.ok ? [] : (r.issues ?? []).map(i => i.code));
const v3Node = (over: R = {}): R => ({ examQuestionId: "q1", presentationType: "coding", questionTypeVersion: 3, text: "أكمل", marks: 10, coding: { allowedLanguages: ["python"], defaultLanguage: "python", starterCode: {}, taskMode: "program", inputMode: "stdin", outputMode: "stdout", limits: { sourceBytes: 65536, outputBytes: 65536, timeMs: 2000, memoryMb: 256 }, publicTests: [], template: tpl() }, answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {}, compileErrorPolicy: "manualReview" }, ...over });
const exam = (questions: unknown[]) => ({ title: "t", metadata: {}, presentationTheme: "classic", sections: [{ id: "s1", title: "س", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions }] }) as never;

describe("19F-T1 — template validation is strict and never repairs", () => {
  it("T1 a valid template validates to a canonical COPY", () => {
    const raw = tpl(), r = T.validateCodingTemplate(raw);
    expect(r).toEqual({ ok: true, template: raw, issues: [] });
    if (r.ok) { expect(r.template).not.toBe(raw); expect(r.template.segments[0]).not.toBe(raw.segments[0]); }
    expect(T.CODING_TEMPLATE_LIMITS).toEqual({ segments: 100, gaps: 30, gapBytes: 16384 });
  });
  const bad: [string, unknown, string][] = [
    ["not an object", "x", "CODING_TEMPLATE_INVALID"],
    ["extra root key", { ...tpl(), answer: {} }, "CODING_TEMPLATE_INVALID"],
    ["missing segments", { language: "python" }, "CODING_TEMPLATE_INVALID"],
    ["unregistered language", { ...tpl(), language: "javascript" }, "CODING_TEMPLATE_LANGUAGE_INVALID"],
    ["no segments", { language: "python", segments: [] }, "CODING_TEMPLATE_SEGMENTS_COUNT"],
    ["101 segments", { language: "python", segments: Array.from({ length: 101 }, (_, i) => (i % 2 ? { kind: "locked", text: "x" } : { kind: "editable", id: "g" + i, starter: "" })) }, "CODING_TEMPLATE_SEGMENTS_COUNT"],
    ["empty locked text", { language: "python", segments: [{ kind: "locked", text: "" }, { kind: "editable", id: "a", starter: "" }] }, "CODING_TEMPLATE_LOCKED_INVALID"],
    ["locked extra key", { language: "python", segments: [{ kind: "locked", text: "a", editable: true }, { kind: "editable", id: "a", starter: "" }] }, "CODING_TEMPLATE_SEGMENT_INVALID"],
    ["adjacent locked", { language: "python", segments: [{ kind: "locked", text: "a" }, { kind: "locked", text: "b" }, { kind: "editable", id: "a", starter: "" }] }, "CODING_TEMPLATE_ADJACENT_LOCKED"],
    ["gap id starts with a digit", { language: "python", segments: [{ kind: "editable", id: "1a", starter: "" }] }, "CODING_TEMPLATE_GAP_ID_INVALID"],
    ["gap id too long", { language: "python", segments: [{ kind: "editable", id: "a".repeat(33), starter: "" }] }, "CODING_TEMPLATE_GAP_ID_INVALID"],
    ["prototype gap id", { language: "python", segments: [{ kind: "editable", id: "constructor", starter: "" }] }, "CODING_TEMPLATE_GAP_ID_INVALID"],
    ["duplicate gap id", { language: "python", segments: [{ kind: "editable", id: "a", starter: "" }, { kind: "locked", text: "x" }, { kind: "editable", id: "a", starter: "" }] }, "CODING_TEMPLATE_GAP_ID_DUPLICATE"],
    ["non-string starter", { language: "python", segments: [{ kind: "editable", id: "a", starter: 1 }] }, "CODING_TEMPLATE_STARTER_INVALID"],
    ["oversized starter", { language: "python", segments: [{ kind: "editable", id: "a", starter: "x".repeat(16385) }] }, "CODING_TEMPLATE_STARTER_INVALID"],
    ["editable extra key", { language: "python", segments: [{ kind: "editable", id: "a", starter: "", solution: "x" }] }, "CODING_TEMPLATE_SEGMENT_INVALID"],
    ["unknown kind", { language: "python", segments: [{ kind: "hidden", text: "x" }, { kind: "editable", id: "a", starter: "" }] }, "CODING_TEMPLATE_SEGMENT_INVALID"],
    ["no gap", { language: "python", segments: [{ kind: "locked", text: "print(1)" }] }, "CODING_TEMPLATE_GAP_COUNT"],
    ["31 gaps", { language: "python", segments: Array.from({ length: 31 }, (_, i) => ({ kind: "editable", id: "g" + i, starter: "" })) }, "CODING_TEMPLATE_GAP_COUNT"]
  ];
  for (const [name, raw, code] of bad) it("T2 " + name + " → " + code, () => { expect(codes(T.validateCodingTemplate(raw))).toContain(code); });
  it("T3 the starters' program must fit the source limit (the question's own, never above 64 KB)", () => {
    const big = { language: "python", segments: [{ kind: "locked", text: "x".repeat(2000) }, { kind: "editable", id: "a", starter: "" }] };
    expect(T.validateCodingTemplate(big, 2048).ok).toBe(true);
    expect(codes(T.validateCodingTemplate(big, 1999))).toEqual(["CODING_TEMPLATE_TOO_LARGE"]);
    expect(T.validateCodingTemplate(JSON.parse('{"language":"python","segments":[{"kind":"editable","id":"a","starter":""}],"__proto__":{"x":1}}')).ok).toBe(false);
  });
});

describe("19F-T2 — reconstruction is byte-for-byte concatenation (documented newline semantics)", () => {
  it("T4 locked text + gap values in segment order; nothing trimmed, re-indented, normalized or interpreted", () => {
    const t = { language: "python", segments: [{ kind: "locked" as const, text: "A\r\n" }, { kind: "editable" as const, id: "g", starter: "" }, { kind: "locked" as const, text: "\tB" }] };
    for (const v of ["", "  x  \r\n", "${x}", "$&$1", "مرحبا 👋\n", "\\n", "{{g}}"]) expect(T.reconstructTemplateSource(t, { g: v })).toBe("A\r\n" + v + "\tB");
    expect(T.reconstructTemplateSource(t, { g: "z" })).toBe(T.reconstructTemplateSource(t, { g: "z" }));
  });
  it("T5 the implementation uses no regex replacement, eval, Function or template interpolation over student text", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "codingTemplate.ts"), "utf8");
    const body = src.slice(src.indexOf("export function reconstructTemplateSource"), src.indexOf("/** Unbound shape check"));
    expect(body).not.toMatch(/\.replace\(|eval\(|new Function|\$\{/);
    expect(src).not.toMatch(/\beval\(|new Function\(/);
  });
});

describe("19F-T3 — binding a codeTemplate answer to a template (the §23 cases, pure)", () => {
  const t = () => T.validateCodingTemplate(tpl()) as { ok: true; template: TPL.CodingTemplateV1 };
  it("T6 a complete answer binds; extras (a forged source, a score) are dropped; the source is server-reconstructed", () => {
    const r = T.bindCodeTemplateAnswer({ ...ans({ body: "    return x * 2\n" }), source: "import os", score: 10 }, t().template, 65536);
    expect(r).toEqual({ ok: true, answer: ans({ body: "    return x * 2\n" }), source: "def f(x):\n    return x * 2\n\nprint(f(input()))\n" });
  });
  it("T7 missing / unknown / prototype gaps, oversized values, non-strings, forged language or version, wrong kind → refused", () => {
    const b = (a: unknown, limit = 65536) => T.bindCodeTemplateAnswer(a, t().template, limit);
    expect(b(ans({}))).toEqual({ ok: false, code: "CODE_TEMPLATE_GAP_MISSING" });
    expect(b(ans({ body: "x", extra: "y" }))).toEqual({ ok: false, code: "CODE_TEMPLATE_GAP_UNKNOWN" });
    expect(b(JSON.parse('{"kind":"codeTemplate","language":"python","languageVersion":1,"values":{"body":"x","__proto__":"y"}}'))).toEqual({ ok: false, code: "CODE_TEMPLATE_GAP_UNKNOWN" });
    expect(b(ans({ body: "x".repeat(16385) }))).toEqual({ ok: false, code: "CODE_TEMPLATE_GAP_TOO_LARGE" });
    expect(b(ans({ body: 7 }))).toEqual({ ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" });
    expect(b(ans({ body: "x" }, { language: "java" }))).toEqual({ ok: false, code: "CODE_LANGUAGE_NOT_ALLOWED" });
    expect(b(ans({ body: "x" }, { languageVersion: 2 }))).toEqual({ ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" });
    expect(b(ans({ body: "x" }, { kind: "code" }))).toEqual({ ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" });
    expect(b({ kind: "codeTemplate", language: "python", languageVersion: 1, values: ["x"] })).toEqual({ ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" });
    expect(b(ans({ body: "ب".repeat(20) }), 40)).toEqual({ ok: false, code: "CODE_SOURCE_TOO_LARGE" });   // UTF-8 bytes, not characters
    expect(b(ans(Object.fromEntries(Array.from({ length: 31 }, (_, i) => ["g" + i, ""]))))).toEqual({ ok: false, code: "CODE_TEMPLATE_ANSWER_INVALID" });
  });
  it("T8 answered ⇔ some gap holds non-blank text (client + shared predicates agree)", () => {
    expect(T.isCodeTemplateAnswered(ans({ body: "x" }))).toBe(true);
    expect(T.isCodeTemplateAnswered(ans({ body: " \n\t" }))).toBe(false);
    expect(answered(ans({ body: "x" }) as unknown as Answer)).toBe(true);
    expect(answered(ans({ body: "  " }) as unknown as Answer)).toBe(false);
  });
});

describe("19F-T4 — coding@3 in the coding model and the version authority", () => {
  it("T9 a valid coding@3 node passes the ONE canonical validator; the registry resolves every coding@3 seam", () => {
    expect(C.validateCodingQuestion(v3Node())).toEqual([]);
    expect(validateQuestionTypeNode(v3Node(), "coding", 3)).toEqual([]);
    expect(hasRegisteredTypeDefaults("coding", 3)).toBe(true);
    const seeded = newQuestion("coding", { questionTypeVersion: 3 }) as unknown as R;
    expect(seeded.questionTypeVersion).toBe(3);
    expect(C.validateCodingQuestion(seeded)).toEqual([]);
  });
  it("T10 coding@3 rules: template required + strict; ONE language = the template's; no free starter code; explicit compile policy", () => {
    const cfg = v3Node().coding as R;
    const issues = (over: R) => C.validateCodingQuestion(v3Node(over)).map(i => i.code);
    expect(issues({ coding: { ...cfg, template: undefined } })).toContain("CODING_TEMPLATE_INVALID");
    expect(issues({ coding: { ...cfg, template: { ...tpl(), segments: [{ kind: "locked", text: "x" }] } } })).toContain("CODING_TEMPLATE_GAP_COUNT");
    expect(issues({ coding: { ...cfg, allowedLanguages: ["python", "java"] } })).toContain("CODING_TEMPLATE_LANGUAGE_MISMATCH");
    expect(issues({ coding: { ...cfg, template: { ...tpl(), language: "java" } } })).toContain("CODING_TEMPLATE_LANGUAGE_MISMATCH");
    expect(issues({ coding: { ...cfg, starterCode: { python: "print(1)\n" } } })).toContain("CODING_TEMPLATE_STARTER_CONFLICT");
    expect(issues({ answer: { hiddenTests: [], comparator: "trimTrailingWhitespace", referenceSolutions: {} } })).toContain("CODING_COMPILE_ERROR_POLICY_REQUIRED");
  });
  it("T11 coding@1 / coding@2 keep refusing a `template` key (no silent reinterpretation of an older version)", () => {
    for (const v of [1, 2]) expect(C.validateCodingQuestion(v3Node({ questionTypeVersion: v })).map(i => i.code), "v" + v).toContain("CODING_CONFIG_UNKNOWN_KEY");
    expect(C.codingTemplateOf(v3Node({ questionTypeVersion: 2 }))).toBe(null);
    expect(C.bindCodeAnswerToQuestion({ kind: "code", language: "python", languageVersion: 1, source: "print(1)" }, v3Node())).toEqual({ ok: false, code: "CODE_QUESTION_MISMATCH" });
  });
  it("T12 version authority: coding is current version 3, authored at 2; coding@4 unsupported; the catalog stays 23 types", () => {
    expect(QUESTION_TYPE_CATALOG.length).toBe(23);
    expect(currentQuestionTypeVersion("coding")).toBe(3);
    expect((CATALOG as unknown as R).authoringQuestionTypeVersion).toBeTypeOf("function");
    expect(CATALOG.authoringQuestionTypeVersion("coding")).toBe(2);
    expect(CATALOG.authoringQuestionTypeVersion("multipleChoice")).toBe(1);
    expect(effectiveQuestionTypeVersion("coding", 3)).toBe(3);
    expect(effectiveQuestionTypeVersion("coding", 4)).toBeUndefined();
    expect((newQuestion("coding") as unknown as R).questionTypeVersion).toBe(2);
    expect((changeQuestionType(newQuestion("multipleChoice"), "coding" as never) as unknown as R).questionTypeVersion).toBe(2);
    expect(validateQuestionTypeNode(v3Node({ questionTypeVersion: 4 }), "coding", 4).map(i => i.code)).toEqual(["UNSUPPORTED_QUESTION_TYPE_VERSION"]);
  });
  it("T13 the student projection carries ONLY the strict canonical template; a malformed one is dropped", () => {
    const p = C.projectCodingConfigForStudent(v3Node().coding) as R;
    expect(p.template).toEqual(tpl());
    expect((C.projectCodingConfigForStudent({ ...(v3Node().coding as R), template: { ...tpl(), extra: 1 } }) as R).template).toBeUndefined();
  });
  it("T14 finalization accepts a valid coding@3 question and blocks a broken template", () => {
    expect(evaluateExamFinalization(exam([v3Node()])).canFinalize).toBe(true);
    expect(evaluateExamFinalization(exam([v3Node({ coding: { ...(v3Node().coding as R), template: { language: "python", segments: [{ kind: "locked", text: "x" }] } } })])).canFinalize).toBe(false);
  });
});

describe("19F-T5 — the read-only code stimulus contract", () => {
  const S = { language: "python", source: "print(1)\n", label: "البرنامج" };
  it("T15 exact keys, supported language, non-empty source ≤ 16 KB and ≤ 400 lines, label ≤ 120; canonical copy", () => {
    expect(STIM.validateCodeStimulus(S)).toEqual({ ok: true, stimulus: S });
    expect(STIM.validateCodeStimulus({ language: "pseudocode", source: "x ← 1" }).ok).toBe(true);
    const c = (raw: unknown) => { const r = STIM.validateCodeStimulus(raw); return r.ok ? "ok" : r.issues[0].code; };
    expect(c({ ...S, expected: "1" })).toBe("CODE_STIMULUS_INVALID");
    expect(c({ source: "x" })).toBe("CODE_STIMULUS_INVALID");
    expect(c({ ...S, language: "javascript" })).toBe("CODE_STIMULUS_LANGUAGE_INVALID");
    expect(c({ ...S, source: "  \n" })).toBe("CODE_STIMULUS_SOURCE_EMPTY");
    expect(c({ ...S, source: "x".repeat(16385) })).toBe("CODE_STIMULUS_TOO_LARGE");
    expect(c({ ...S, source: "x\n".repeat(400) })).toBe("CODE_STIMULUS_TOO_LARGE");
    expect(c({ ...S, label: "x".repeat(121) })).toBe("CODE_STIMULUS_LABEL_INVALID");
    expect(c(JSON.parse('{"language":"python","source":"x","__proto__":{"a":1}}'))).toBe("CODE_STIMULUS_INVALID");
    expect(STIM.projectCodeStimulusForStudent({ ...S, answer: "1" })).toBe(null);
  });
  it("T16 finalization blocks a malformed stimulus on any type; a part never carries one; a type change carries it", () => {
    const mcq = (codeStimulus: unknown) => ({ ...newQuestion("multipleChoice", { examQuestionId: "m1", text: "ما الناتج؟", marks: 1, options: [{ text: "1" }, { text: "2" }], answer: { correctOptionIndex: 0 } }), codeStimulus });
    expect(evaluateExamFinalization(exam([mcq(S)])).canFinalize).toBe(true);
    expect(evaluateExamFinalization(exam([mcq({ ...S, language: "cobol" })])).canFinalize).toBe(false);
    expect(validateQuestionTypeNode({ type: "shortAnswer", codeStimulus: S }, "shortAnswer", undefined, { part: true }).map(i => i.code)).toContain("CODE_STIMULUS_PART_UNSUPPORTED");
    expect((changeQuestionType(mcq(S) as never, "shortAnswer") as unknown as R).codeStimulus).toEqual(S);
  });
  it("T17 the stimulus languages cover every registered coding language", () => {
    for (const l of CQ.CODING_LANGUAGES) expect(Object.keys(STIM.CODE_STIMULUS_LANGUAGES)).toContain(l.key);
  });
});

describe("19F-T6 — authoring presets create EXISTING types with editable example content", () => {
  const P = PRESETS as unknown as R & typeof PRESETS;
  it("T18 six modes in order, each saying what it creates", () => {
    expect(P.CODING_PRESETS.map(p => p.key)).toEqual(["writeProgram", "fixBug", "completeCode", "lockedTemplate", "predictOutput", "traceExecution"]);
    expect(P.CODING_PRESETS.map(p => p.label)).toEqual(["كتابة برنامج كامل", "إصلاح خطأ", "إكمال كود", "إكمال كود بأجزاء مقفلة", "توقع الناتج", "تتبع التنفيذ"]);
    for (const p of P.CODING_PRESETS) expect(p.creates.length, p.key).toBeGreaterThan(10);
    expect(P.buildCodingPreset("codeTrace")).toBe(null);
  });
  it("T19 each preset, in every language, builds a question that passes the finalization gate; no hidden test anywhere", () => {
    const expected: Record<string, [string, number | undefined]> = { writeProgram: ["coding", 2], fixBug: ["coding", 2], completeCode: ["coding", 2], lockedTemplate: ["coding", 3], predictOutput: ["multipleChoice", undefined], traceExecution: ["tableFill", undefined] };
    for (const p of P.CODING_PRESETS) for (const language of P.CODING_PRESET_LANGUAGES) {
      const q = P.buildCodingPreset(p.key, { language }) as unknown as R;
      expect([q.presentationType, q.questionTypeVersion], p.key + "/" + language).toEqual(expected[p.key]);
      expect(evaluateExamFinalization(exam([q])).canFinalize, p.key + "/" + language).toBe(true);
      if (q.presentationType === "coding") {
        expect((q.answer as R).hiddenTests).toEqual([]);
        expect(CQ.codingGradingMode(q.answer)).toBe("manual");   // absent = manual (the 17C default)
        expect(((q.coding as R).allowedLanguages as string[])).toEqual([language]);
      } else expect((q.codeStimulus as R).language).toBe(language);
    }
    const sa = P.buildCodingPreset("predictOutput", { vehicle: "shortAnswer" }) as unknown as R;
    expect(sa.presentationType).toBe("shortAnswer");
    expect(sa.answer).toEqual({ text: "12" });
    const tr = P.buildCodingPreset("traceExecution") as unknown as R;
    expect((tr.tableRows as string[][]).flat().filter(c => c === "6" || c === "12")).toEqual([]);   // the traced values are answer cells, never shown
  });
  it("T20 every preset returns a NEW identity", () => {
    const a = P.buildCodingPreset("fixBug") as unknown as R, b = P.buildCodingPreset("fixBug") as unknown as R;
    expect(a.examQuestionId).not.toBe(b.examQuestionId);
  });
});

describe("19F-T7 — template authoring operations (no JSON for the teacher)", () => {
  const A = AUTHOR as unknown as R & typeof AUTHOR;
  it("T21 paste a program, mark a span as a gap (its text becomes the starter), mark another, unmark one → canonical form", () => {
    let t = A.templateFromSource("python", "a = 1\nb = 2\nprint(a + b)\n");
    expect(t.segments).toEqual([{ kind: "locked", text: "a = 1\nb = 2\nprint(a + b)\n" }]);
    t = A.markGap(t, 0, 4, 5)!;
    expect(t.segments).toEqual([{ kind: "locked", text: "a = " }, { kind: "editable", id: "gap1", starter: "1" }, { kind: "locked", text: "\nb = 2\nprint(a + b)\n" }]);
    t = A.markGap(t, 2, 5, 6)!;
    expect(t.segments.filter(s => s.kind === "editable").map(s => s.kind === "editable" && s.id)).toEqual(["gap1", "gap2"]);
    expect(TPL.validateCodingTemplate(t).ok).toBe(true);
    const back = A.unmarkGap(t, 1)!;
    expect(back.segments[0]).toEqual({ kind: "locked", text: "a = 1\nb = " });
    expect(A.nextGapId(back)).toBe("gap1");
    expect(TPL.reconstructTemplateSource(back, TPL.templateStarterValues(back))).toBe("a = 1\nb = 2\nprint(a + b)\n");
  });
  it("T22 marking at a caret inserts an empty gap; a gap at the very start / end leaves no empty locked segment; bad ranges refused", () => {
    const t = A.templateFromSource("python", "abc");
    expect(A.markGap(t, 0, 0, 0)!.segments).toEqual([{ kind: "editable", id: "gap1", starter: "" }, { kind: "locked", text: "abc" }]);
    expect(A.markGap(t, 0, 0, 3)!.segments).toEqual([{ kind: "editable", id: "gap1", starter: "abc" }]);
    expect(A.markGap(t, 0, 2, 1)).toBe(null);
    expect(A.markGap(t, 0, 0, 4)).toBe(null);
    expect(A.markGap(t, 5, 0, 0)).toBe(null);
    const edited = A.setSegmentText(A.markGap(t, 0, 1, 2)!, 0, "");
    expect(edited.segments.map(s => s.kind)).toEqual(["editable", "locked"]);
  });
});
