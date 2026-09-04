import { describe, it, expect } from "vitest";
import { cleanExam, buildTemplateDocument } from "../src/functions/save-exam-artifact.js";

describe("cleanExam - the regular exam save path already preserves any top-level field", () => {
  it("preserves presentationTheme via its full-object spread (no code change needed there)", () => {
    const exam = { examId: "EXAM-1", presentationTheme: "focus", questions: [] };
    expect(cleanExam(exam).presentationTheme).toBe("focus");
  });

  it("still clears history/redoStack on every question as before", () => {
    const exam = { examId: "EXAM-1", questions: [{ examQuestionId: "q1", history: ["x"], redoStack: ["y"] }] };
    const cleaned = cleanExam(exam);
    expect(cleaned.questions[0].history).toEqual([]);
    expect(cleaned.questions[0].redoStack).toEqual([]);
  });
});

describe("buildTemplateDocument - the one write path that used to silently drop new top-level fields", () => {
  it("includes presentationTheme in the saved template document", () => {
    const exam = { title: "امتحان", plan: {}, totalMarks: 100, metadata: {}, presentationTheme: "classic" };
    const doc = buildTemplateDocument(exam, "2026-01-01T00:00:00.000Z");
    expect(doc.presentationTheme).toBe("classic");
  });

  it("omits presentationTheme (undefined) for a legacy exam that never had one - no corruption", () => {
    const exam = { title: "امتحان قديم", plan: {}, totalMarks: 100, metadata: {} };
    const doc = buildTemplateDocument(exam, "2026-01-01T00:00:00.000Z");
    expect(doc.presentationTheme).toBeUndefined();
    // JSON.stringify drops undefined-valued keys entirely - the stored blob has no stray key at all.
    expect(JSON.parse(JSON.stringify(doc))).not.toHaveProperty("presentationTheme");
  });

  it("still only carries the same pre-existing allowlisted fields otherwise", () => {
    const exam = { title: "امتحان", originalRequest: "طلب", plan: { title: "خطة" }, totalMarks: 80, metadata: { school: "مدرستي" }, presentationTheme: "modern", answer: { shouldNotAppear: true } };
    const doc = buildTemplateDocument(exam, "2026-01-01T00:00:00.000Z");
    expect(Object.keys(doc).sort()).toEqual(["metadata", "kind", "originalRequest", "plan", "presentationTheme", "savedAt", "schemaVersion", "templateId", "title", "totalMarks"].sort());
  });
});
