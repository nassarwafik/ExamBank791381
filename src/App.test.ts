import { describe, it, expect } from "vitest";
import { buildExamCopy, mergeTemplateIntoGeneratedExam } from "./App";
import type { ExamDraft, ExamPlan, ExamMetadata } from "./App";

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
