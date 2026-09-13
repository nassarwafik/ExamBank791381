import { describe, it, expect } from "vitest";
import {
  normalizeCoverPage,
  defaultCoverPage,
  validateBannerDataUrl,
  isSafeBannerDataUrl,
  examMarksDistribution,
  instructionLines,
  activityStartLabel,
  activityInstructionsTitle,
  sanitizeCoverForStudent
} from "./examCover";
import { normalizeExamStructure } from "./examStructure";
import { computeTotalMarks, toSavedStructuredExam } from "./examBuilderState";
import type { StructuredExam } from "./examTypes";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAA";

describe("examCover — model & normalization", () => {
  it("no cover object → undefined (exams without a cover are unchanged)", () => {
    expect(normalizeCoverPage(undefined)).toBeUndefined();
    expect(normalizeCoverPage(null)).toBeUndefined();
  });

  it("normalizes flags with sensible defaults; showDuration defaults off", () => {
    const c = normalizeCoverPage({ enabled: true })!;
    expect(c.enabled).toBe(true);
    expect(c.showStudentName).toBe(true);
    expect(c.showClassName).toBe(true);
    expect(c.showTotalMarks).toBe(true);
    expect(c.showMarksDistribution).toBe(true);
    expect(c.showDuration).toBe(false);
  });

  it("keeps a safe raster banner, drops an unsafe/external one", () => {
    expect(normalizeCoverPage({ enabled: true, banner: { dataUrl: PNG } })!.banner!.dataUrl).toBe(PNG);
    expect(normalizeCoverPage({ enabled: true, banner: { dataUrl: "https://x/y.png" } })!.banner).toBeUndefined();
    expect(normalizeCoverPage({ enabled: true, banner: { dataUrl: "data:image/svg+xml,<svg onload=alert(1)>" } })!.banner).toBeUndefined();
  });

  it("activityType is constrained to exam|training", () => {
    expect(normalizeCoverPage({ enabled: true, activityType: "training" })!.activityType).toBe("training");
    expect(normalizeCoverPage({ enabled: true, activityType: "hacked" })!.activityType).toBeUndefined();
  });

  it("defaultCoverPage is enabled with the requested activity type", () => {
    expect(defaultCoverPage("training")).toMatchObject({ enabled: true, activityType: "training" });
  });
});

describe("examCover — banner validation (safe raster + size)", () => {
  it("accepts png/jpeg/webp/gif data URLs", () => {
    for (const t of ["png", "jpeg", "jpg", "webp", "gif"]) {
      expect(isSafeBannerDataUrl("data:image/" + t + ";base64,AAAA")).toBe(true);
    }
  });
  it("rejects svg, data:text/html, external and blob URLs", () => {
    expect(validateBannerDataUrl("data:image/svg+xml,<svg>").ok).toBe(false);
    expect(validateBannerDataUrl("data:text/html,<b>x</b>").ok).toBe(false);
    expect(validateBannerDataUrl("https://ex.com/a.png").ok).toBe(false);
    expect(validateBannerDataUrl("blob:abc").ok).toBe(false);
  });
  it("rejects an oversized banner", () => {
    const huge = "data:image/png;base64," + "A".repeat(6 * 1024 * 1024); // ~4.5MB decoded > 4MB limit
    expect(validateBannerDataUrl(huge).ok).toBe(false);
  });
});

// Build an exam that totals 100: section 1 = 10×2 (all), section 2 = capScore cap 80.
const exam100 = (): StructuredExam => ({
  examId: "E", title: "امتحان", status: "draft",
  sections: [
    { id: "s1", title: "القسم الأول", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {},
      questions: Array.from({ length: 10 }, (_, i) => ({ examQuestionId: "a" + i, presentationType: "shortAnswer", text: "س", marks: 2 })) },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "capScore", maxMarks: 80, requiredAnswers: null, answerUnit: "question", stimuli: {},
      questions: Array.from({ length: 20 }, (_, i) => ({ examQuestionId: "b" + i, presentationType: "shortAnswer", text: "س", marks: 4 })) }
  ]
} as unknown as StructuredExam);

describe("examCover — marks distribution (computed, single source of truth)", () => {
  it("derives per-section marks + total from the normalized structure", () => {
    const dist = examMarksDistribution(normalizeExamStructure(exam100() as never));
    expect(dist.rows.map(r => r.marks)).toEqual([20, 80]);
    expect(dist.rows.map(r => r.title)).toEqual(["القسم الأول", "القسم الثاني"]);
    expect(dist.total).toBe(100);
  });

  it("distribution total EQUALS computeTotalMarks (no second grading formula)", () => {
    const exam = exam100();
    expect(examMarksDistribution(normalizeExamStructure(exam as never)).total).toBe(computeTotalMarks(exam));
  });

  it("COMPOUND explicit parts (3+3+2=8): cover uses the part-sum, not the stale question marks (10)", () => {
    // A compound question whose parts sum to 8 while its own marks say 10. The cover total and
    // computeTotalMarks must both report 8 (matching the backend grader), never 10.
    const exam = {
      examId: "E", title: "امتحان", status: "draft",
      sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {},
        questions: [{ examQuestionId: "q1", presentationType: "compound", text: "س", marks: 10,
          parts: [{ id: "p1", type: "shortAnswer", text: "أ", marks: 3 }, { id: "p2", type: "shortAnswer", text: "ب", marks: 3 }, { id: "p3", type: "shortAnswer", text: "ج", marks: 2 }] }] }]
    } as unknown as StructuredExam;
    expect(examMarksDistribution(normalizeExamStructure(exam as never)).total).toBe(8);
    expect(computeTotalMarks(exam)).toBe(8);
  });

  it("N: changing a section's marks changes the distribution automatically", () => {
    const exam = exam100();
    exam.sections[0].questions.forEach(q => { (q as { marks: number }).marks = 3; }); // 10×3 = 30
    const dist = examMarksDistribution(normalizeExamStructure(exam as never));
    expect(dist.rows[0].marks).toBe(30);
    expect(dist.total).toBe(110);
  });
});

describe("examCover — instructions & wording", () => {
  it("splits instructions into clean non-empty lines", () => {
    expect(instructionLines("أجب عن جميع الأسئلة.\n\n  اقرأ جيدًا \nتأكد قبل التسليم")).toEqual([
      "أجب عن جميع الأسئلة.", "اقرأ جيدًا", "تأكد قبل التسليم"
    ]);
  });
  it("uses exam vs training wording", () => {
    expect(activityStartLabel("exam")).toBe("ابدأ الامتحان");
    expect(activityStartLabel("training")).toBe("ابدأ التدريب");
    expect(activityInstructionsTitle("training")).toBe("تعليمات التدريب");
  });
});

describe("examCover — persistence (O)", () => {
  it("cover config survives a toSavedStructuredExam save round-trip (and re-normalizes on reopen)", () => {
    const exam = exam100();
    exam.coverPage = normalizeCoverPage({ enabled: true, banner: { dataUrl: PNG }, instructions: "أجب عن جميع الأسئلة.", activityType: "exam" });
    const saved = JSON.parse(JSON.stringify(toSavedStructuredExam(exam))) as StructuredExam;
    expect(saved.coverPage!.enabled).toBe(true);
    expect(saved.coverPage!.banner!.dataUrl).toBe(PNG);
    expect(saved.totalMarks).toBe(100); // save still computes totals as before
    const reopened = normalizeCoverPage(saved.coverPage);
    expect(reopened!.instructions).toBe("أجب عن جميع الأسئلة.");
    expect(reopened!.activityType).toBe("exam");
  });
});

describe("examCover — sanitizeCoverForStudent (defense in depth)", () => {
  it("keeps safe fields, drops unsafe banner and any foreign key", () => {
    const dirty = { enabled: true, banner: { dataUrl: "https://ex/a.png" }, instructions: "x", teacherSecret: "NOPE", allowedMaterials: "آلة حاسبة" } as unknown;
    const clean = sanitizeCoverForStudent(dirty)!;
    expect(clean.banner).toBeUndefined();
    expect(clean.instructions).toBe("x");
    expect(clean.allowedMaterials).toBe("آلة حاسبة");
    expect((clean as Record<string, unknown>).teacherSecret).toBeUndefined();
  });
});
