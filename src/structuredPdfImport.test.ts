import { describe, it, expect } from "vitest";
import { detectedQuestionsToStructuredExam, type PdfDetectedQuestion } from "./structuredPdfImport";
import { validateStructuredExam } from "./examQuality";

// UX-6d — the PDF-detected-questions → StructuredExam conversion layer. It reuses the JSON normalizer (ids,
// image safety, draft status) and NEVER invents marks / grading policy / correct answers not in the source.

const dq = (over: Partial<PdfDetectedQuestion>): PdfDetectedQuestion => ({
  importedQuestionId: "imp-1-1", pageNumbers: [3], presentationType: "multipleChoice", text: "أي عنوان خاص؟",
  options: [{ text: "8.8.8.8" }, { text: "172.16.5.10" }], hasVisibleAnswer: false, answerText: "", images: [], ...over
});

describe("conversion basics", () => {
  it("produces a single-section DRAFT exam with a stable id per question, preserving text and options", () => {
    const r = detectedQuestionsToStructuredExam([dq({})], { fileName: "امتحان.pdf" });
    expect(r.exam!.status).toBe("draft");
    expect(r.exam!.sections).toHaveLength(1);
    const q = r.exam!.sections[0].questions[0];
    expect(q.examQuestionId).toBe("pdfq-imp-1-1");
    expect(q.text).toBe("أي عنوان خاص؟");
    expect(q.presentationType).toBe("multipleChoice");
    expect((q.options || []).map(o => o.text)).toEqual(["8.8.8.8", "172.16.5.10"]);
  });
  it("preserves source page numbers as import metadata (not on the student-facing body)", () => {
    const r = detectedQuestionsToStructuredExam([dq({ pageNumbers: [3, 4] })], { fileName: "x.pdf" });
    const meta = r.exam!.metadata as { import: { source: string; pdfPages: Record<string, number[]> } };
    expect(meta.import.source).toBe("pdf");
    expect(meta.import.pdfPages["pdfq-imp-1-1"]).toEqual([3, 4]);
  });
  it("excluded (falsely-detected) items are dropped", () => {
    const r = detectedQuestionsToStructuredExam([dq({ importedQuestionId: "a" }), dq({ importedQuestionId: "b", excluded: true })], { fileName: "x.pdf" });
    expect(r.exam!.sections[0].questions).toHaveLength(1);
    expect(r.converted).toBe(1);
  });
});

describe("NEVER invents semantics", () => {
  it("does not invent marks (each question is left with a marks issue for the teacher)", () => {
    const r = detectedQuestionsToStructuredExam([dq({})], { fileName: "x.pdf" });
    expect(r.exam!.sections[0].questions[0].marks).toBeUndefined();
    expect(r.issues.some(i => i.code === "MARKS_PROBLEM")).toBe(true);
  });
  it("does not invent a grading policy (the section reports GRADING_POLICY_REQUIRED)", () => {
    const r = detectedQuestionsToStructuredExam([dq({})], { fileName: "x.pdf" });
    expect(r.issues.some(i => i.code === "GRADING_POLICY_REQUIRED")).toBe(true);
  });
  it("maps a visible answer to correctOptionIndex ONLY when it exactly matches one option", () => {
    const exact = detectedQuestionsToStructuredExam([dq({ hasVisibleAnswer: true, answerText: "172.16.5.10" })], { fileName: "x.pdf" });
    expect(exact.exam!.sections[0].questions[0].answer).toEqual({ correctOptionIndex: 1 });
    const ambiguous = detectedQuestionsToStructuredExam([dq({ hasVisibleAnswer: true, answerText: "شيء آخر" })], { fileName: "x.pdf" });
    expect(ambiguous.exam!.sections[0].questions[0].answer).toEqual({});
  });
  it("an MCQ with fewer than two options falls back to shortAnswer (never invents options)", () => {
    const r = detectedQuestionsToStructuredExam([dq({ options: [{ text: "only" }] })], { fileName: "x.pdf" });
    expect(r.exam!.sections[0].questions[0].presentationType).toBe("shortAnswer");
  });
  it("detected fillBlank/wordBank (no explicit fields) becomes shortAnswer and is recorded as a fallback (never invents fields)", () => {
    const r = detectedQuestionsToStructuredExam([dq({ presentationType: "wordBank", options: [] })], { fileName: "x.pdf" });
    expect(r.exam!.sections[0].questions[0].presentationType).toBe("shortAnswer");
    expect(r.fallbacks).toEqual([{ questionId: "pdfq-imp-1-1", detectedType: "wordBank" }]);
  });
  it("a visible answer on a non-MCQ is kept as a shortAnswer model answer (source-derived)", () => {
    const r = detectedQuestionsToStructuredExam([dq({ presentationType: "open", options: [], hasVisibleAnswer: true, answerText: "شبكة افتراضية" })], { fileName: "x.pdf" });
    expect(r.exam!.sections[0].questions[0].answer).toEqual({ text: "شبكة افتراضية" });
  });
});

describe("image safety is the SAME as JSON import", () => {
  it("keeps a safe embedded raster image and drops an unsafe/external one", () => {
    const safe = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
    const r = detectedQuestionsToStructuredExam([
      dq({ importedQuestionId: "a", images: [{ id: "i1", dataUrl: safe, contentType: "image/png" }] }),
      dq({ importedQuestionId: "b", images: [{ id: "i2", dataUrl: "https://evil.example/x.png", contentType: "image/png" }] })
    ], { fileName: "x.pdf" });
    const q0 = r.exam!.sections[0].questions[0] as { image?: { assets: { dataUrl?: string }[] } };
    const q1 = r.exam!.sections[0].questions[1] as { image?: { assets: { dataUrl?: string }[] } };
    expect(q0.image!.assets[0].dataUrl).toBe(safe);
    expect(q1.image!.assets[0].dataUrl).toBeUndefined(); // external URL stripped, not fetched
  });
});

describe("end-to-end: an all-MCQ text PDF becomes gradable once marks + policy + answers are set", () => {
  it("after conversion the only remaining blockers are the deliberately-unresolved teacher/AI items", () => {
    const r = detectedQuestionsToStructuredExam([dq({ hasVisibleAnswer: true, answerText: "172.16.5.10" })], { fileName: "x.pdf" });
    const codes = new Set(validateStructuredExam(r.exam!).map(i => i.code));
    expect(codes.has("MARKS_PROBLEM")).toBe(true);          // teacher
    expect(codes.has("GRADING_POLICY_REQUIRED")).toBe(true); // teacher
    expect(codes.has("MISSING_ANSWER")).toBe(false);         // resolved from the visible answer
  });
});
