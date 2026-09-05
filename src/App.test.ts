import { describe, it, expect } from "vitest";
import { buildExamCopy, mergeTemplateIntoGeneratedExam, buildQualityIssues } from "./App";
import type { ExamDraft, ExamPlan, ExamMetadata, ExamQuestion } from "./App";

function plan(): ExamPlan {
  return {
    title: "امتحان شبكات",
    originalRequest: "",
    totalQuestions: 1,
    requestedQuestionCount: 1,
    totalMarks: 100,
    sectionTargets: { BASIC: 1, INFRASTRUCTURE: 0 },
    difficultyTargets: { "1": 0, "2": 1, "3": 0, "4": 0, "5": 0 },
    topicTargets: [],
    excludedTopics: [],
    typeTargets: { multipleChoice: 1, fillBlank: 0, wordBank: 0, open: 0 },
    minimums: { images: 0, cli: 0, calculations: 0 },
    rules: {
      excludeNeedsReview: false,
      avoidSameFamily: false,
      preferOfficialSources: false,
      avoidPreviouslyUsed: false,
      recentExamCount: 0
    },
    explanation: ""
  };
}

function metadata(overrides: Partial<ExamMetadata> = {}): ExamMetadata {
  return {
    school: "", subject: "شبكات الاتصال", grade: "", className: "",
    teacherName: "", date: "", duration: "", semester: "", generalInstructions: "",
    ...overrides
  };
}

function examDraft(overrides: Partial<ExamDraft> = {}): ExamDraft {
  return {
    schemaVersion: 1,
    examId: "EXAM-1",
    title: "امتحان تجريبي",
    originalRequest: "",
    plan: plan(),
    totalMarks: 100,
    status: "draft",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    metadata: metadata(),
    questions: [],
    summary: { sections: {}, difficulty: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 }, topics: {}, types: {}, images: 0, cli: 0, calculations: 0 },
    warnings: [],
    revisionHistory: [],
    ...overrides
  };
}

function examQuestion(overrides: Partial<ExamQuestion> = {}): ExamQuestion {
  return {
    examQuestionId: "q1",
    origin: "imported",
    section: "BASIC",
    topic: "OTHER_NETWORKING",
    secondaryTopics: [],
    difficulty: 2,
    difficultyLabel: "",
    familyKey: "F1",
    hasCLI: false,
    requiresCalculation: false,
    presentationType: "open",
    marks: 10,
    locked: false,
    text: "نص السؤال",
    options: [],
    fields: [],
    parts: [],
    answer: {},
    teacherNote: "",
    aiInstruction: "",
    wasModified: false,
    image: { exists: false, visible: false, origin: null, assets: [], prompt: null },
    history: [],
    redoStack: [],
    ...overrides
  };
}

function examWithQuestion(question: ExamQuestion): ExamDraft {
  return examDraft({ questions: [question], totalMarks: question.marks });
}

describe("buildQualityIssues - matching (طابق) question checks", () => {
  it("flags a matching question whose text has no table at all", () => {
    const issues = buildQualityIssues(examWithQuestion(examQuestion({ presentationType: "matching", text: "طابق بلا جدول", answer: { text: "x=y" } })));
    expect(issues.some(i => i.code === "MISSING_FIELDS")).toBe(true);
  });

  it("reuses the existing generic table checks for a matching question missing per-row options", () => {
    const text = "طابق:\n| HTTP | -- |\n| --- | --- |\n| IP | -- |";
    const q = examQuestion({ presentationType: "matching", text, fields: [{ id: "f1", label: "HTTP", order: 0, kind: "select", options: [] }], answer: { text: "HTTP=x" } });
    const issues = buildQualityIssues(examWithQuestion(q));
    expect(issues.some(i => i.code === "TABLE_MISSING_OPTIONS")).toBe(true);
  });

  it("reports no issue for a complete matching question", () => {
    const text = "طابق:\n| HTTP | -- |\n| --- | --- |\n| IP | -- |";
    const q = examQuestion({
      presentationType: "matching",
      text,
      fields: [
        { id: "f1", label: "HTTP", order: 0, kind: "select", options: [{ value: "طبقة التطبيقات" }, { value: "طبقة الشبكة" }] }
      ],
      answer: { text: "HTTP=طبقة التطبيقات" }
    });
    const issues = buildQualityIssues(examWithQuestion(q));
    expect(issues.filter(i => i.questionId === "q1")).toEqual([]);
  });
});

describe("buildQualityIssues - ordering (رتّب) question checks", () => {
  it("flags an ordering question with no fields at all", () => {
    const issues = buildQualityIssues(examWithQuestion(examQuestion({ presentationType: "ordering", fields: [], answer: { mode: "exactSequence", values: ["1"] } })));
    expect(issues.some(i => i.code === "MISSING_FIELDS")).toBe(true);
  });

  it("flags an ordering question with fields but no position word bank", () => {
    const q = examQuestion({ presentationType: "ordering", fields: [{ id: "f1", label: "Step 1", order: 0 }], wordBank: [], answer: { mode: "exactSequence", values: ["1"] } });
    const issues = buildQualityIssues(examWithQuestion(q));
    expect(issues.some(i => i.code === "MISSING_OPTIONS")).toBe(true);
  });

  it("reports no issue for a complete ordering question", () => {
    const q = examQuestion({
      presentationType: "ordering",
      fields: [{ id: "f1", label: "DHCP Discover", order: 0 }, { id: "f2", label: "DHCP Offer", order: 1 }],
      wordBank: ["1", "2"],
      answer: { mode: "exactSequence", values: ["1", "2"] }
    });
    const issues = buildQualityIssues(examWithQuestion(q));
    expect(issues.filter(i => i.questionId === "q1")).toEqual([]);
  });
});

describe("buildExamCopy - Save As Copy preserves the exam's theme", () => {
  it("carries the source exam's presentationTheme into the copy", () => {
    const source = examDraft({ presentationTheme: "cards" });
    const copy = buildExamCopy(source);
    expect(copy.presentationTheme).toBe("cards");
  });

  it("assigns a new examId and a ' - نسخة' suffixed title", () => {
    const source = examDraft({ examId: "EXAM-ORIGINAL", title: "امتحاني" });
    const copy = buildExamCopy(source);
    expect(copy.examId).not.toBe("EXAM-ORIGINAL");
    expect(copy.title).toBe("امتحاني - نسخة");
  });

  it("deep-clones - mutating the copy's questions never affects the original", () => {
    const source = examDraft({ questions: [{ examQuestionId: "q1" } as ExamDraft["questions"][number]] });
    const copy = buildExamCopy(source);
    (copy.questions[0] as { examQuestionId: string }).examQuestionId = "mutated";
    expect(source.questions[0].examQuestionId).toBe("q1");
  });

  it("leaves presentationTheme undefined when the source exam never had one (legacy exam)", () => {
    const source = examDraft();
    delete source.presentationTheme;
    const copy = buildExamCopy(source);
    expect(copy.presentationTheme).toBeUndefined();
  });
});

describe("mergeTemplateIntoGeneratedExam - template-to-draft round trip restores the theme", () => {
  it("carries the template's presentationTheme into the freshly generated draft", () => {
    const generated = examDraft();
    const merged = mergeTemplateIntoGeneratedExam(generated, { presentationTheme: "modern" });
    expect(merged.presentationTheme).toBe("modern");
  });

  it("merges template metadata over the defaults, exactly as before this feature", () => {
    const generated = examDraft();
    const merged = mergeTemplateIntoGeneratedExam(generated, { metadata: { school: "مدرستي" } as ExamMetadata });
    expect(merged.metadata?.school).toBe("مدرستي");
  });

  it("leaves presentationTheme undefined (safe default) when the template predates this feature", () => {
    const generated = examDraft();
    const merged = mergeTemplateIntoGeneratedExam(generated, {});
    expect(merged.presentationTheme).toBeUndefined();
  });
});
