// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import { render, cleanup, fireEvent, act } from "@testing-library/react";
import CompoundQuestion from "./CompoundQuestion";
import CompoundQuestionEditor from "./CompoundQuestionEditor";
import type { Question } from "./StudentQuestionCard";
import type { BuilderQuestion, StructuredExam } from "./examTypes";
import { answered } from "./answerState";
import { questionMaxMarks as clientQuestionMaxMarks, distributePartMarks as clientDistribute, selectGradedUnits as clientSelect, normalizeExamStructure as clientNormalize, isCompound as clientIsCompound } from "./examStructure";
import { questionMaxMarks as builderQuestionMaxMarks, computeTotalMarks, toSavedStructuredExam, cloneQuestionWithNewIds } from "./examBuilderState";
import { parseStructuredExamJson } from "./structuredExamImport";
import { validateStructuredExam } from "./examQuality";
import { compoundPartTypeKeys, QUESTION_TYPE_CATALOG } from "./questionTypeCatalog";
import { gradeExam, gradeQuestion, gradeFields } from "../api/src/lib/assignment-grading.js";
import { questionMaxMarks as serverQuestionMaxMarks, examOfficialStats, selectGradedUnits as serverSelect, normalizeExamStructure as serverNormalize, isCompound as serverIsCompound, isResponseAnswered } from "../api/src/lib/exam-structure.js";
import { sanitizeExamForStudent, sanitizePartForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { normalizeDraftAnswers } from "../api/src/lib/draft-answers.js";

// Phase 20D — the compound@1 FREEZE. composite@1 is a NEW family; the legacy `compound` family (rendering, authoring, answers, grading,
// first-N, sanitizer output, marks, Wave-1 children, import / save) must stay byte-for-byte what it was. These are PINS: the SHA-256 digests
// and literal values below were captured on the untouched baseline caac213 (before any 20D code) and must never change. A changed digest
// means compound@1 semantics moved — a release blocker, never a test to "update".
afterEach(cleanup);
const CAPTURE = process.env.CAPTURE_20D_PINS;
const captured: Record<string, unknown> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pin = (name: string, actual: unknown) => { if (CAPTURE) { captured[name] = actual; fs.writeFileSync(CAPTURE, JSON.stringify(captured, null, 1)); return; } expect(actual).toEqual((PIN as Record<string, unknown>)[name]); };
const digest = (v: unknown) => crypto.createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex");

// A mixed compound: legacy children (MCQ, TF, shortAnswer with key, multiTrueFalse, matching), Wave-1 children (multipleSelect, numeric,
// matrix, categorization). Explicit marks on every part (sum 18 ≠ question marks 20 → official 18).
const MIXED = (): BuilderQuestion => ({
  examQuestionId: "cq1", presentationType: "compound", text: "اقرأ ثم أجب", marks: 20,
  parts: [
    { id: "a", type: "multipleChoice", text: "اختر", marks: 2, options: [{ text: "أ" }, { text: "ب" }, { text: "ج" }], answer: { correctOptionIndex: 1 } },
    { id: "b", type: "trueFalse", text: "صح أم خطأ", marks: 1, answer: { correct: false } },
    { id: "c", type: "shortAnswer", text: "العاصمة؟", marks: 2, answer: { text: "عمان" } },
    { id: "d", type: "multiTrueFalse", text: "حدد", marks: 3, fields: [{ id: "r1", statement: "س1", kind: "boolean", correct: true }, { id: "r2", statement: "س2", kind: "boolean", correct: false }, { id: "r3", statement: "س3", kind: "boolean", correct: true }] },
    { id: "e", type: "matching", text: "طابق", marks: 2, fields: [{ id: "m1", label: "قط", kind: "select", options: [{ text: "مواء" }, { text: "نباح" }], correct: "مواء" }, { id: "m2", label: "كلب", kind: "select", options: [{ text: "مواء" }, { text: "نباح" }], correct: "نباح" }], answer: { text: "قط=مواء;كلب=نباح" } },
    { id: "f", type: "multipleSelect", questionTypeVersion: 1, text: "اختر كل الصحيح", marks: 2, options: [{ id: "o1", text: "1" }, { id: "o2", text: "2" }, { id: "o3", text: "3" }], answer: { correctOptionIds: ["o1", "o3"], scoring: "partialNoPenalty" } },
    { id: "g", type: "numericResponse", questionTypeVersion: 1, text: "كم؟", marks: 2, numeric: { unitRequired: false }, answer: { mode: "tolerance", expected: 9.8, tolerance: 0.1 } },
    { id: "h", type: "matrix", questionTypeVersion: 1, text: "مصفوفة", marks: 2, matrix: { rows: [{ id: "x1", label: "X1" }, { id: "x2", label: "X2" }], columns: [{ id: "c1", label: "C1" }, { id: "c2", label: "C2" }] }, answer: { correctColumnByRow: { x1: "c1", x2: "c2" } } },
    { id: "i", type: "categorization", questionTypeVersion: 1, text: "صنف", marks: 2, categorization: { categories: [{ id: "k1", label: "K1" }, { id: "k2", label: "K2" }], items: [{ id: "t1", label: "T1" }, { id: "t2", label: "T2" }] }, answer: { correctCategoryByItem: { t1: "k1", t2: "k2" } } }
  ]
} as unknown as BuilderQuestion);
// Implicit marks (none explicit → split 9 / 3) and mixed (explicit 4 + two implicit splitting the remaining 6).
const IMPLICIT = (): BuilderQuestion => ({ examQuestionId: "cq2", presentationType: "compound", text: "", marks: 9, parts: [{ id: "p1", type: "shortAnswer", text: "1" }, { id: "p2", type: "shortAnswer", text: "2" }, { id: "p3", type: "trueFalse", text: "3", answer: { correct: true } }] } as unknown as BuilderQuestion);
const MIXED_MARKS = (): BuilderQuestion => ({ examQuestionId: "cq3", presentationType: "compound", text: "س", marks: 10, parts: [{ id: "p1", type: "trueFalse", text: "1", marks: 4, answer: { correct: true } }, { id: "p2", type: "trueFalse", text: "2", answer: { correct: true } }, { id: "p3", type: "trueFalse", text: "3", answer: { correct: false } }] } as unknown as BuilderQuestion);

const ANSWER_MIXED = { kind: "compound", parts: {
  a: { kind: "choice", index: 1 }, b: { kind: "choice", index: 0 }, c: { kind: "text", value: " عمان " }, d: { kind: "fields", values: { r1: true, r2: "false", r3: false } },
  e: { kind: "fields", values: { m1: "مواء", m2: "مواء" } }, f: { kind: "multiChoice", optionIds: ["o1", "o2"] }, g: { kind: "numeric", value: "٩٫٨٥" },
  h: { kind: "fields", values: { x1: "c1", x2: "c1" } }, i: { kind: "fields", values: { t1: "k1", t2: "k2" } }
} };

const EXAM = (): StructuredExam => ({
  examId: "FREEZE-20D", title: "freeze", sections: [
    { id: "s1", title: "all", gradingPolicy: "all", questions: [MIXED(), IMPLICIT(), MIXED_MARKS()] },
    { id: "s2", title: "firstN parts", gradingPolicy: "firstNAnswered", answerUnit: "part", requiredAnswers: 2, maxMarks: 4, questions: [MIXED_MARKS(), { ...IMPLICIT(), examQuestionId: "cq4" }] },
    { id: "s3", title: "firstN questions", gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 1, maxMarks: 9, questions: [{ ...IMPLICIT(), examQuestionId: "cq5" }, { ...IMPLICIT(), examQuestionId: "cq6" }] },
    { id: "s4", title: "cap", gradingPolicy: "capScore", maxMarks: 5, questions: [{ ...MIXED_MARKS(), examQuestionId: "cq7" }] }
  ]
} as unknown as StructuredExam);
const ANSWERS = {
  cq1: ANSWER_MIXED,
  cq2: { kind: "compound", parts: { p1: { kind: "text", value: "x" }, p3: { kind: "choice", index: 0 } } },
  cq3: { kind: "compound", parts: { p1: { kind: "choice", index: 0 }, p2: { kind: "choice", index: 1 }, p3: { kind: "choice", index: 1 } } },
  // firstN parts: cq3 in s2 shares the id "cq3"? no — s2's first question is MIXED_MARKS() → examQuestionId cq3 is reused across sections on purpose in old data
  cq4: { kind: "compound", parts: { p1: { kind: "text", value: "y" }, p2: { kind: "text", value: "z" }, p3: { kind: "choice", index: 0 } } },
  cq5: { kind: "compound", parts: { p3: { kind: "choice", index: 0 } } },
  cq6: { kind: "compound", parts: { p3: { kind: "choice", index: 0 } } },
  cq7: { kind: "compound", parts: { p1: { kind: "choice", index: 0 }, p2: { kind: "choice", index: 0 }, p3: { kind: "choice", index: 1 } } }
};

describe("20D compound@1 FREEZE (PINS captured on caac213)", () => {
  it("F-1 catalog identity of compound and its allowed child types", () => {
    const row = QUESTION_TYPE_CATALOG.find(d => d.key === "compound")!;
    expect(row).toEqual({ key: "compound", version: 1, label: "سؤال مركّب", category: "composite", gradingMode: "composed", capabilities: { autoGrading: true, manualGrading: true, hybridGrading: true, partialCredit: true, compoundPart: false, interactive: false, requiresImage: false, offline: true }, responseKinds: ["compound"], legacy: true });
    expect(compoundPartTypeKeys()).toEqual(["multipleChoice", "trueFalse", "multiTrueFalse", "shortAnswer", "fillBlank", "wordBank", "matching", "ordering", "tableFill", "cliFill", "multipleSelect", "numericResponse", "matrix", "categorization"]);
    expect(clientIsCompound(MIXED() as unknown as Question)).toBe(true); expect(serverIsCompound(MIXED())).toBe(true);
    expect(serverIsCompound({ presentationType: "compound", parts: [] })).toBe(false);
  });

  it("F-2 marks: distribution, questionMaxMarks (client / builder / server) and exam totals", () => {
    for (const [q, dist, max] of [[MIXED(), [2, 1, 2, 3, 2, 2, 2, 2, 2], 18], [IMPLICIT(), [3, 3, 3], 9], [MIXED_MARKS(), [4, 3, 3], 10]] as const) {
      expect(clientDistribute(q as unknown as Question)).toEqual(dist);
      expect(clientQuestionMaxMarks(q as unknown as Question)).toBe(max);
      expect(builderQuestionMaxMarks(q)).toBe(max);
      expect(serverQuestionMaxMarks(q)).toBe(max);
    }
    expect(computeTotalMarks(EXAM())).toBe(55);
    expect(examOfficialStats(EXAM())).toEqual({ questionCount: 8, totalMarks: 55, sections: [{ sectionId: "s1", questionCount: 3, totalMarks: 37 }, { sectionId: "s2", questionCount: 2, totalMarks: 4 }, { sectionId: "s3", questionCount: 2, totalMarks: 9 }, { sectionId: "s4", questionCount: 1, totalMarks: 5 }] });
  });

  it("F-3 official grading: mixed parts, manual-review marks, first-N parts / questions, capScore (byte-identical output)", () => {
    const g = gradeExam(EXAM(), ANSWERS);
    pin("gradeExam", digest(g));
    pin("gradeSummary", { score: g.score, totalMarks: g.totalMarks, manualReviewMarks: g.manualReviewMarks, finalized: g.finalized });
    pin("gradeMixed", digest(gradeQuestion(MIXED(), ANSWER_MIXED)));
    pin("gradeMixedEmpty", digest(gradeQuestion(MIXED(), undefined)));
    pin("gradeUnknownPart", digest(gradeQuestion({ ...MIXED(), parts: [...(MIXED().parts || []), { id: "z", type: "nope", marks: 1 }] }, ANSWER_MIXED)));
  });

  it("F-4 matching canonical key behaviour (fields + answer.text pairs) and answered-ness of compound answers", () => {
    const part = MIXED().parts![4];
    expect(gradeFields(part, { kind: "fields", values: { m1: "مواء", m2: "نباح" } }, 2)).toEqual({ score: 2, manualReview: false, parts: { correct: 2, total: 2 } });
    expect(gradeFields(part, { kind: "fields", values: { m1: " مواء ", m2: "" } }, 2)).toEqual({ score: 1, manualReview: false, parts: { correct: 1, total: 2 } });
    expect(answered(ANSWER_MIXED as never)).toBe(true); expect(isResponseAnswered(ANSWER_MIXED)).toBe(true);
    expect(answered({ kind: "compound", parts: { a: { kind: "text", value: "  " } } } as never)).toBe(false);
    expect(isResponseAnswered({ kind: "compound", parts: {} })).toBe(false);
  });

  it("F-5 first-N unit selection (client mirror === server) on part-unit and question-unit sections", () => {
    const sel = (norm: { sections: unknown[] }, select: (s: never, a: never) => { countedKeys: Set<string> }) => norm.sections.map(s => [...select(s as never, ANSWERS as never).countedKeys]);
    const server = sel(serverNormalize(EXAM()), serverSelect as never), client = sel(clientNormalize(EXAM()), clientSelect as never);
    expect(client).toEqual(server);
    pin("firstN", digest(server));
  });

  it("F-6 student sanitizer output for compound questions and parts", () => {
    const smuggled = { ...MIXED(), parts: [...(MIXED().parts || []), { id: "s", type: "shortAnswer", text: "t", marks: 1, hint: "h", explanation: "e", teacherNote: "n", answer: { text: "k" }, assessmentMeta: { bloom: "x" } }] };
    pin("sanitizedExam", digest(sanitizeExamForStudent({ ...EXAM(), sections: [...EXAM().sections, { id: "s5", title: "x", gradingPolicy: "all", questions: [smuggled] }] })));
    pin("sanitizedPart", digest(sanitizePartForStudent(MIXED().parts![5])));
  });

  it("F-7 draft-answer normalization of compound answers (modern kinds inside parts dropped, the rest verbatim)", () => {
    const answers = { cq1: { ...ANSWER_MIXED, parts: { ...ANSWER_MIXED.parts, x: { kind: "code", language: "python", languageVersion: 1, source: "print(1)" }, y: { kind: "smartSim", pluginKey: "p", pluginVersion: 1, actions: [], state: null }, z: { kind: "hotspot", points: [] } }, extra: 1 }, unknownQ: { kind: "text", value: "v" } };
    pin("draftBound", digest(normalizeDraftAnswers(answers, EXAM())));
    pin("draftUnbound", digest(normalizeDraftAnswers(answers)));
  });

  it("F-8 structural validation (finalization issues) of compound questions", () => {
    const exam = EXAM();
    (exam.sections[0].questions as BuilderQuestion[]).push({ examQuestionId: "bad", presentationType: "compound", text: "", marks: 3, parts: [{ id: "x", type: "coding", text: "c", marks: 3 }, { id: "x", type: "trueFalse", text: "t" }] } as unknown as BuilderQuestion);
    pin("validation", digest(validateStructuredExam(exam).map(i => [i.severity, i.code, i.message, i.sectionId, i.questionId])));
  });

  it("F-9 old JSON import and canonical save of compound exams", () => {
    const r = parseStructuredExamJson(JSON.stringify(EXAM()), "old.json");
    expect(r.parseErrors).toEqual([]);
    const exam = r.exam as StructuredExam;
    const stable = { ...exam, examId: "X", metadata: { ...(exam.metadata || {}), import: null } };
    pin("imported", digest({ stable, warnings: r.parseWarnings, validation: r.validationErrors.map(i => [i.code, i.severity]) }));
    pin("saved", digest({ ...toSavedStructuredExam(EXAM()), updatedAt: null, createdAt: null }));
    const clone = cloneQuestionWithNewIds(MIXED());
    expect(clone.parts!.map(p => p.type)).toEqual(MIXED().parts!.map(p => p.type));
    expect(new Set(clone.parts!.map(p => p.id)).size).toBe(9);
    expect(clone.parts!.some(p => MIXED().parts!.some(o => o.id === p.id))).toBe(false);
  });

  it("F-10 student rendering of a compound with legacy + Wave-1 children (DOM digest after the lazy children load)", async () => {
    const onPart = vi.fn();
    const { container } = render(<CompoundQuestion q={MIXED() as unknown as Question} index={0} id="cq1" answer={ANSWER_MIXED as never} onPart={onPart} />);
    for (let i = 0; i < 40 && container.querySelector(".iex-loading"); i++) await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    expect(container.querySelector(".iex-loading")).toBeNull();
    pin("renderMixed", digest(container.innerHTML));
    // answer behaviour: a legacy choice part and a text part bubble their canonical Answer through onPart
    const radios = container.querySelectorAll('input[type="radio"][name="cq1-a"]');
    fireEvent.click(radios[2]);
    expect(onPart).toHaveBeenCalledWith("a", { kind: "choice", index: 2 });
    fireEvent.change(container.querySelector("textarea.iex-open")!, { target: { value: "إربد" } });
    expect(onPart).toHaveBeenCalledWith("c", { kind: "text", value: "إربد" });
  });

  it("F-11 compound part-level excess hints render unchanged", () => {
    const { container } = render(<CompoundQuestion q={MIXED_MARKS() as unknown as Question} index={2} id="cq3" answer={ANSWERS.cq3 as never} onPart={() => {}} excessPartIds={new Set(["p3"])} />);
    pin("renderExcess", digest(container.innerHTML));
  });

  it("F-12 compound authoring editor renders unchanged (DOM digest after the lazy part editors load)", async () => {
    const { container } = render(<CompoundQuestionEditor question={MIXED()} onChange={() => {}} />);
    for (let i = 0; i < 40; i++) await act(async () => { await new Promise(r => setTimeout(r, 25)); });
    pin("editorMixed", digest(container.innerHTML.replace(/id="[^"]*"|for="[^"]*"|aria-labelledby="[^"]*"|aria-describedby="[^"]*"|aria-controls="[^"]*"/g, "")));
  });
});

const PIN = {
  gradeExam: "2d6bdd2818edaedf802ede70fc3bd9b977e7cd5910f0238635fea821f4546d25",
  gradeSummary: {"score": 35, "totalMarks": 55, "manualReviewMarks": 12, "finalized": false},
  gradeMixed: "6b41045e08aafb28d99b59ffbc007005f854b53b99705f0370ed97af91b64d6d",
  gradeMixedEmpty: "e8d0571432517147ab0b7467624828fa17e23b12d224ae7ad6200ef3b87ea0a6",
  gradeUnknownPart: "755330099d82f649d4f6df483811ddb63e51fb5de6a4d7109ffcc710238e5dc0",
  firstN: "1d67cd2cf40e962bf24c76cd219ed710195cb8eb07e4dad84a107649b62b2492",
  sanitizedExam: "6b4cbac4255a8d77f58ed73e11a647236a98d11a2a6c59e4d89984835df1b5dc",
  sanitizedPart: "668b53cff6f9ba7ea035d09ee4f4cc374c0c132b947cb691b90e876fae25940e",
  draftBound: "d48d3f3a85be41666dcebfd92bbbad8d8f1b5817e4b23527b3273bf2057c5500",
  draftUnbound: "2edae12f6c918573ec079b386b215b053b6490f03206811ff2aabf54677b04af",
  validation: "74a9a4283dde31aee7f38c1cbeaa48fe5721d34d2f7b88cddf1479ede3af5010",
  imported: "b8aaba7693c5417784e8563927fbf4171be11f81c0954aed3395a42d68d15ff8",
  saved: "4ae39e7020f1a9b6d39b6517c087337f511043e1d5e28244b38c8bdda3acd85a",
  renderMixed: "66303f5a49e2e3fb123cd104dfdffc93a8c09820d62d9fe10788d96c0cb3c684",
  renderExcess: "ae909bc360bcd1003a104f84e07870b4fe95e18d63641ab9b2c1dd3bfa3669fd",
  editorMixed: "c089255ac1953c1a3374631782bd6ad436c5fd8bb6b58778bdf06e7aff6ce592"
};
