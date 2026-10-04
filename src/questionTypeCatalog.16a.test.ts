import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUESTION_TYPE_CATALOG, LEGACY_QUESTION_TYPE_KEYS, questionTypeDefinition, resolveQuestionTypeKey, isKnownQuestionType,
  listQuestionTypes, currentQuestionTypeVersion, supportsQuestionTypeVersion, compoundPartTypeKeys, registerQuestionType
} from "./questionTypeCatalog";
import { LEGACY_TYPE_ALIASES, CATEGORY_LABELS, resolveQuestionTypeKeyOrAlias } from "./questionTypeAliases";
import { BUILDER_QUESTION_TYPES, BUILDER_PART_TYPES, QUESTION_TYPE_LABELS, type StructuredExam, type BuilderQuestion } from "./examTypes";
import { newQuestion, newPart, changeQuestionType, changePartType, toSavedStructuredExam } from "./examBuilderState";
import { validateStructuredExam, hasBlockingErrors } from "./examQuality";
import { validateBlueprint } from "./assessmentBlueprint";
import { evaluateBlueprintCoverage } from "./assessmentBlueprintCoverage";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// Phase 16A — A1 canonical catalog · A2 legacy 11-type parity · A4 type version · A15 Blueprint · A20 old exams untouched ·
// five-subject evidence. Fail-first on 6468cc7 (no catalog module).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY = ["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "compound"];
const LEGACY_LABELS: Record<string, string> = { multipleChoice: "اختيار من متعدد", trueFalse: "صح أو خطأ", multiTrueFalse: "صح/خطأ متعدد", shortAnswer: "إجابة قصيرة / مفتوحة", fillBlank: "إكمال فراغات", wordBank: "مخزن كلمات", matching: "مطابقة", ordering: "ترتيب", tableFill: "إكمال جدول", cliFill: "أوامر CLI", compound: "سؤال مركّب" };
const WAVE1 = ["multipleSelect", "numericResponse", "matrix", "categorization"];
const UNIVERSAL = ["simulation", "coding", "networkCli", "inlineCloze"];                            // 16B-A simulation · 17A coding · 18C networkCli · 19A inlineCloze

describe("16A A1 — one canonical, React-free, code-owned Question Type Catalog", () => {
  it("lists the 11 legacy types first (stable order) followed by the four Wave 1 types; frozen; every entry carries identity, version, label, category, grading mode and the capability contract", () => {
    expect(QUESTION_TYPE_CATALOG.map(d => d.key)).toEqual([...LEGACY, ...WAVE1, ...UNIVERSAL]);
    expect(Object.isFrozen(QUESTION_TYPE_CATALOG)).toBe(true);
    for (const d of QUESTION_TYPE_CATALOG) {
      expect(Object.isFrozen(d)).toBe(true);
      expect(d.version).toBe(d.key === "coding" ? 2 : 1); expect(typeof d.label).toBe("string");   // 17F-C2 RF1: coding is current version 2 expect(d.label.length).toBeGreaterThan(0);
      expect(["choice", "response", "structured", "interactive", "composite"]).toContain(d.category);
      expect(["auto", "manual", "hybrid", "composed"]).toContain(d.gradingMode);
      for (const cap of ["autoGrading", "manualGrading", "hybridGrading", "partialCredit", "compoundPart", "interactive", "requiresImage", "offline"]) expect(typeof (d.capabilities as Record<string, unknown>)[cap], d.key + "." + cap).toBe("boolean");
      expect(d.legacy).toBe(LEGACY.includes(d.key));
    }
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual(["choice", "composite", "interactive", "response", "structured"]);
  });
  it("grading modes: MCQ / multipleSelect / numeric / matrix / categorization auto · shortAnswer hybrid (existing manual-review behaviour) · compound composed; compound is never a compound part; the new types are", () => {
    for (const k of ["multipleChoice", "trueFalse", "multiTrueFalse", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", ...WAVE1]) expect(questionTypeDefinition(k)!.gradingMode, k).toBe("auto");
    expect(questionTypeDefinition("shortAnswer")!.gradingMode).toBe("hybrid");
    expect(questionTypeDefinition("compound")!.gradingMode).toBe("composed");
    expect(questionTypeDefinition("compound")!.capabilities.compoundPart).toBe(false);
    for (const k of WAVE1) expect(questionTypeDefinition(k)!.capabilities.compoundPart, k).toBe(true);
    expect(questionTypeDefinition("multipleSelect")!.capabilities.partialCredit).toBe(true);
    expect(questionTypeDefinition("numericResponse")!.capabilities.partialCredit).toBe(false);
    expect(questionTypeDefinition("matrix")!.capabilities.partialCredit).toBe(true);
    expect(questionTypeDefinition("categorization")!.capabilities.partialCredit).toBe(true);
    expect(questionTypeDefinition("multipleSelect")!.label).toBe("اختيار متعدد الإجابات");
    expect(questionTypeDefinition("numericResponse")!.label).toBe("إجابة رقمية");
    expect(questionTypeDefinition("matrix")!.label).toBe("مصفوفة / شبكة اختيارات");
    expect(questionTypeDefinition("categorization")!.label).toBe("تصنيف العناصر");
  });
  it("the catalog module is pure: no React, DOM, student state, API client, governance or bank imports", () => {
    const src = fs.readFileSync(path.join(repo, "src/questionTypeCatalog.ts"), "utf8");
    expect(src).not.toMatch(/from "react|document\.|window\.|fetch\(|localStorage|examGovernance|\/bank\/|StudentExamPage|apiRequest/);
  });
  it("resolves exact keys, case-insensitive spellings and the legacy import aliases to ONE canonical key; unknown stays unknown", () => {
    expect(resolveQuestionTypeKey("multipleChoice")).toBe("multipleChoice");
    expect(resolveQuestionTypeKey("multiplechoice")).toBe("multipleChoice");
    expect(resolveQuestionTypeKeyOrAlias("mcq")).toBe("multipleChoice"); expect(resolveQuestionTypeKeyOrAlias("open")).toBe("shortAnswer"); expect(resolveQuestionTypeKeyOrAlias("cli")).toBe("cliFill");
    expect(resolveQuestionTypeKey("mcq")).toBeUndefined();                                             // aliases are an import / server concern, not the student runtime
    expect(resolveQuestionTypeKey("MultipleSelect")).toBe("multipleSelect");
    expect(resolveQuestionTypeKey("hotspot")).toBeUndefined(); expect(resolveQuestionTypeKey("")).toBeUndefined(); expect(resolveQuestionTypeKey(null)).toBeUndefined();
    expect(isKnownQuestionType("categorization")).toBe(true); expect(isKnownQuestionType("networkSimulation")).toBe(false);
    expect(Object.keys(LEGACY_TYPE_ALIASES)).toEqual(expect.arrayContaining(["mcq", "tf", "open", "essay", "cli", "table"]));
    expect(LEGACY_QUESTION_TYPE_KEYS).toEqual(LEGACY);
  });
});

describe("16A A2 — legacy 11-type parity: public contracts derive from the catalog and are unchanged", () => {
  it("BUILDER_QUESTION_TYPES contains the 11 legacy types in their historical order first and every catalog type once; BUILDER_PART_TYPES = compound-capable catalog types; labels unchanged", () => {
    expect([...BUILDER_QUESTION_TYPES].slice(0, 11)).toEqual(LEGACY);
    expect([...BUILDER_QUESTION_TYPES]).toEqual(listQuestionTypes().map(d => d.key));
    expect([...BUILDER_PART_TYPES]).toEqual(compoundPartTypeKeys());
    expect(BUILDER_PART_TYPES).not.toContain("compound");
    for (const k of WAVE1) expect(BUILDER_PART_TYPES).toContain(k);
    for (const [k, label] of Object.entries(LEGACY_LABELS)) expect(QUESTION_TYPE_LABELS[k as keyof typeof QUESTION_TYPE_LABELS]).toBe(label);
    for (const d of QUESTION_TYPE_CATALOG) expect(QUESTION_TYPE_LABELS[d.key as keyof typeof QUESTION_TYPE_LABELS]).toBe(d.label);
    expect(Object.isFrozen(BUILDER_QUESTION_TYPES)).toBe(true); expect(Object.isFrozen(BUILDER_PART_TYPES)).toBe(true);
  });
  it("legacy factories keep their exact default shapes (no questionTypeVersion is written on a legacy type)", () => {
    const strip = (q: Record<string, unknown>) => { const { examQuestionId: _a, ...rest } = q; void _a; return rest; };
    expect(strip(newQuestion("multipleChoice") as unknown as Record<string, unknown>)).toEqual({ presentationType: "multipleChoice", text: "", marks: 1, options: [{ text: "" }, { text: "" }], answer: { correctOptionIndex: 0 } });
    expect(strip(newQuestion("trueFalse") as unknown as Record<string, unknown>)).toEqual({ presentationType: "trueFalse", text: "", marks: 1, answer: { correct: true } });
    expect(strip(newQuestion("shortAnswer") as unknown as Record<string, unknown>)).toEqual({ presentationType: "shortAnswer", text: "", marks: 1, answer: {} });
    const mtf = newQuestion("multiTrueFalse"); expect(mtf.fields!.length).toBe(1); expect(mtf.fields![0].kind).toBe("boolean"); expect("questionTypeVersion" in mtf).toBe(false);
    const fill = newQuestion("fillBlank"); expect(fill.answer).toEqual({ mode: "exactSequence", values: [] }); expect(fill.wordBank).toEqual([]);
    expect(newQuestion("matching").answer).toEqual({ text: "" }); expect(newQuestion("tableFill").tableHeaders).toEqual(["", ""]); expect(newQuestion("cliFill").cli).toBe("");
    expect(newQuestion("compound").parts!.length).toBe(1); expect(newQuestion("compound").parts![0].type).toBe("multipleChoice");
    for (const k of LEGACY) { expect("questionTypeVersion" in newQuestion(k as never), k).toBe(false); if (k !== "compound") expect("questionTypeVersion" in newPart(k as never), k).toBe(false); }
    const changed = changeQuestionType(newQuestion("multipleChoice", { text: "t", marks: 3 }), "trueFalse");
    expect(changed.text).toBe("t"); expect(changed.marks).toBe(3); expect(changed.answer).toEqual({ correct: true }); expect("options" in changed).toBe(false); expect("questionTypeVersion" in changed).toBe(false);
    expect("questionTypeVersion" in changePartType(newPart("multipleChoice"), "shortAnswer")).toBe(false);
  });
  it("A20 — opening / saving an untouched legacy exam never bulk-writes questionTypeVersion", () => {
    const legacy: StructuredExam = { examId: "OLD", title: "old", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: LEGACY.filter(k => k !== "compound").map((k, i) => newQuestion(k as never, { examQuestionId: "q" + i, text: "t" })) }] };
    const saved = toSavedStructuredExam(legacy);
    for (const q of saved.sections[0].questions) expect("questionTypeVersion" in q, q.presentationType).toBe(false);
    expect(JSON.stringify(saved)).not.toContain("questionTypeVersion");
  });
});

describe("16A A4 — explicit, backward-compatible type versions", () => {
  it("absence = V1 legacy behaviour; the current version is 1 for every type; integers above the current version, non-integers and 0 are unsupported", () => {
    for (const d of QUESTION_TYPE_CATALOG) {
      const current = d.key === "coding" ? 2 : 1;   // 17F-C2 RF1: coding@2 carries the compile-error policy; every other type is still version 1
      expect(currentQuestionTypeVersion(d.key)).toBe(current);
      expect(supportsQuestionTypeVersion(d.key, undefined)).toBe(true); expect(supportsQuestionTypeVersion(d.key, 1)).toBe(true);
      expect(supportsQuestionTypeVersion(d.key, 2)).toBe(current >= 2); expect(supportsQuestionTypeVersion(d.key, current + 1)).toBe(false); expect(supportsQuestionTypeVersion(d.key, 0)).toBe(false); expect(supportsQuestionTypeVersion(d.key, 1.5)).toBe(false); expect(supportsQuestionTypeVersion(d.key, "1")).toBe(false);
    }
    expect(supportsQuestionTypeVersion("hotspot", undefined)).toBe(false);
  });
  it("a new Wave 1 question is created at its current version; an unsupported version or unknown type is a BLOCKING structural issue (finalization) while a legacy question without a version stays valid", () => {
    const ms = newQuestion("multipleSelect"); expect(ms.questionTypeVersion).toBe(1);
    const mcq = newQuestion("multipleChoice", { text: "q" });
    const bad = { ...newQuestion("multipleChoice", { text: "q" }), questionTypeVersion: 2 } as BuilderQuestion;
    const unknown = { examQuestionId: "u1", presentationType: "hotspot", text: "q", marks: 1 } as unknown as BuilderQuestion;
    const exam = (qs: BuilderQuestion[]): StructuredExam => ({ examId: "E", title: "e", sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: qs }] });
    expect(hasBlockingErrors(validateStructuredExam(exam([mcq])))).toBe(false);
    const v = validateStructuredExam(exam([bad])); expect(v.some(i => i.code === "UNSUPPORTED_QUESTION_TYPE_VERSION" && i.severity === "error")).toBe(true);
    const u = validateStructuredExam(exam([unknown])); expect(u.some(i => i.code === "UNKNOWN_QUESTION_TYPE" && i.severity === "error")).toBe(true);
    // a compound part with an unknown / unsupported type blocks too; shortAnswer part keeps its manual-review freedom
    const comp = newQuestion("compound", { text: "c", parts: [{ id: "p1", type: "hotspot", text: "x" } as never, { ...newPart("shortAnswer"), questionTypeVersion: 3 } as never] });
    const c = validateStructuredExam(exam([comp])); expect(c.some(i => i.code === "UNKNOWN_QUESTION_TYPE")).toBe(true); expect(c.some(i => i.code === "UNSUPPORTED_QUESTION_TYPE_VERSION")).toBe(true);
  });
  it("registering a code-owned plugin type is the ONLY way to widen the catalog: duplicate / production keys are refused, registration is reversible, and exam data can never register anything", () => {
    expect(() => registerQuestionType({ key: "multipleChoice", version: 1, label: "x", description: "", category: "choice", gradingMode: "auto", capabilities: questionTypeDefinition("multipleChoice")!.capabilities, responseKinds: ["choice"], legacy: false, icon: "?" })).toThrow();
    const unregister = registerQuestionType({ key: "syntheticInteractive", version: 1, label: "تفاعلي تجريبي", description: "test only", category: "interactive", gradingMode: "auto", capabilities: { autoGrading: true, manualGrading: false, hybridGrading: false, partialCredit: true, compoundPart: true, interactive: true, requiresImage: false, offline: false }, responseKinds: ["fields"], legacy: false, icon: "⚙" });
    try {
      expect(isKnownQuestionType("syntheticInteractive")).toBe(true);
      expect(listQuestionTypes().map(d => d.key)).toContain("syntheticInteractive");
      expect(compoundPartTypeKeys()).toContain("syntheticInteractive");
      expect(QUESTION_TYPE_CATALOG.map(d => d.key)).not.toContain("syntheticInteractive");           // the production constant is immutable
    } finally { unregister(); }
    expect(isKnownQuestionType("syntheticInteractive")).toBe(false);
    expect(() => registerQuestionType({ key: "bad key!", version: 1, label: "x", description: "", category: "choice", gradingMode: "auto", capabilities: questionTypeDefinition("multipleChoice")!.capabilities, responseKinds: [], legacy: false, icon: "?" })).toThrow();
  });
});

describe("16A A15 — Blueprint questionType dimension validates against the catalog (no second list)", () => {
  const bp = (ref: string): AssessmentBlueprintV1 => ({ schemaVersion: 1, subject: { id: "cs", label: "علوم الحاسوب" }, topics: [{ id: "t1", label: "T" }], objectives: [], constraints: [{ id: "c1", dimension: "questionType", ref, metric: "count", unit: "absolute", min: 1 }] });
  it("every legacy and Wave 1 type is a valid questionType reference automatically; an unknown key is INVALID_QUESTION_TYPE", () => {
    for (const d of QUESTION_TYPE_CATALOG) expect(validateBlueprint(bp(d.key), { sectionIds: [] }).filter(i => i.code === "INVALID_QUESTION_TYPE"), d.key).toEqual([]);
    expect(validateBlueprint(bp("hotspot"), { sectionIds: [] }).some(i => i.code === "INVALID_QUESTION_TYPE")).toBe(true);
    const src = fs.readFileSync(path.join(repo, "src/assessmentBlueprint.ts"), "utf8");
    expect(src).not.toMatch(/"multipleChoice",\s*"trueFalse"/);                                     // no stale literal list in Blueprint code
    expect(src).toMatch(/BUILDER_QUESTION_TYPES|questionTypeCatalog/);
  });
  it("coverage classifies a Wave 1 question under its type key like any other", () => {
    const exam: StructuredExam = { examId: "E", title: "e", blueprint: bp("numericResponse"), sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [newQuestion("numericResponse", { examQuestionId: "n1", text: "x", assessmentMeta: { topicIds: ["t1"] } as never })] }] };
    const cov = evaluateBlueprintCoverage(exam);
    const item = cov.constraints.find(c => c.id === "c1");
    expect(item).toBeTruthy(); expect(item!.actual).toBe(1);
  });
});

describe("16A — five-subject evidence: the same engine, subject vocabulary is data", () => {
  const subjects = [
    { subject: "شبكات الحاسوب", type: "multipleSelect", q: () => newQuestion("multipleSelect", { text: "أي البروتوكولات تعمل في طبقة النقل؟", options: [{ id: "o1", text: "TCP" }, { id: "o2", text: "UDP" }, { id: "o3", text: "IP" }], answer: { correctOptionIds: ["o1", "o2"], scoring: "partialWithPenalty" } }) },
    { subject: "علوم الحاسوب", type: "matrix", q: () => newQuestion("matrix", { text: "صنّف تعقيد كل خوارزمية", matrix: { rows: [{ id: "r1", label: "بحث ثنائي" }, { id: "r2", label: "فرز فقاعي" }], columns: [{ id: "c1", label: "O(log n)" }, { id: "c2", label: "O(n²)" }] }, answer: { correctColumnByRow: { r1: "c1", r2: "c2" } } }) },
    { subject: "الرياضيات", type: "numericResponse", q: () => newQuestion("numericResponse", { text: "احسب مشتقة x² عند x = 3", numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 6, tolerance: 0 } }) },
    { subject: "الفيزياء", type: "numericResponse", q: () => newQuestion("numericResponse", { text: "تسارع الجاذبية الأرضية", numeric: { unitRequired: true }, answer: { mode: "range", min: 9.7, max: 9.9, unit: "m/s²" } }) },
    { subject: "الكيمياء", type: "categorization", q: () => newQuestion("categorization", { text: "صنّف كل مادة", categorization: { categories: [{ id: "k1", label: "حمض" }, { id: "k2", label: "قاعدة" }], items: [{ id: "i1", label: "HCl" }, { id: "i2", label: "NaOH" }] }, answer: { correctCategoryByItem: { i1: "k1", i2: "k2" } } }) }
  ];
  it.each(subjects.map(s => [s.subject, s] as const))("%s: a Wave 1 question validates through the one catalog seam with zero blocking issues", (_label, s) => {
    const exam: StructuredExam = { examId: "E", title: s.subject, sections: [{ id: "s1", title: s.subject, gradingPolicy: "all", questions: [s.q()] }] };
    const issues = validateStructuredExam(exam);
    expect(hasBlockingErrors(issues), JSON.stringify(issues)).toBe(false);
    expect(questionTypeDefinition(s.type)!.gradingMode).toBe("auto");
  });
  it("no subject branching exists in the registry / scoring / validation modules", () => {
    for (const f of ["src/questionTypeCatalog.ts", "src/questionTypeAliases.ts", "src/questionTypeScoring.ts", "src/questionTypeValidation.ts", "src/questionTypeDefaults.ts"]) {
      const src = fs.readFileSync(path.join(repo, f), "utf8");
      expect(src, f).not.toMatch(/subject\s*===|networking|physics|chemistry|mathematics|"math"/i);
    }
  });
});
