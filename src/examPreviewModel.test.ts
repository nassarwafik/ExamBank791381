import { describe, it, expect } from "vitest";
import { toSafePreviewExam, generalInstructionLines } from "./examPreviewModel";

// Roadmap #15 — the single safe preview model must strip EVERY grading secret, recursively, from both
// structured (sections[].questions[]) and legacy flat (questions[]) exams, without mutating the source.
const jsonHas = (obj: unknown, key: string): boolean => JSON.stringify(obj).includes("\"" + key + "\"");

describe("toSafePreviewExam — recursive answer-key stripping", () => {
  it("J: strips question.answer, option.correct/isCorrect and field.correct from a structured exam", () => {
    const exam = {
      title: "x", sections: [{ id: "s1", title: "ق", questions: [
        { examQuestionId: "q1", text: "t", marks: 5, answer: { correctOptionIndex: 1 },
          options: [{ text: "A", correct: false }, { text: "B", correct: true, isCorrect: true }] },
        { examQuestionId: "q2", text: "t2", marks: 5,
          fields: [{ id: "f1", label: "L", correct: "42", options: [{ value: "A", correct: true }] }] }
      ] }]
    };
    const safe = toSafePreviewExam(exam);
    expect(jsonHas(safe, "answer")).toBe(false);
    expect(jsonHas(safe, "correct")).toBe(false);
    expect(jsonHas(safe, "isCorrect")).toBe(false);
    // Display data survives.
    expect(jsonHas(safe, "text")).toBe(true);
    expect(jsonHas(safe, "marks")).toBe(true);
    // Source is never mutated.
    expect(exam.sections[0].questions[0].answer).toEqual({ correctOptionIndex: 1 });
  });

  it("K: strips grading secrets recursively inside compound parts and nested part fields/options", () => {
    const exam = { sections: [{ id: "s", title: "", questions: [
      { examQuestionId: "cq", text: "compound", marks: 10, parts: [
        { id: "p1", text: "part1", answer: { text: "secret" }, options: [{ text: "o", correct: true }] },
        { id: "p2", text: "part2", fields: [{ id: "pf", correct: "z", expectedAnswer: "z" }] }
      ] }
    ] }] };
    const safe = toSafePreviewExam(exam);
    expect(jsonHas(safe, "answer")).toBe(false);
    expect(jsonHas(safe, "correct")).toBe(false);
    expect(jsonHas(safe, "expectedAnswer")).toBe(false);
    // Parts and their display text remain.
    expect(jsonHas(safe, "parts")).toBe(true);
    expect(jsonHas(safe, "part1")).toBe(true);
  });

  it("strips secrets from a LEGACY FLAT exam (top-level questions[])", () => {
    const exam = { title: "flat", presentationTheme: "classic", questions: [
      { examQuestionId: "q1", text: "t", marks: 3, answer: { text: "a" }, correctAnswer: "a",
        options: [{ text: "A", correct: true }] }
    ] };
    const safe = toSafePreviewExam(exam);
    expect(jsonHas(safe, "answer")).toBe(false);
    expect(jsonHas(safe, "correctAnswer")).toBe(false);
    expect(jsonHas(safe, "correct")).toBe(false);
    expect((safe.questions as unknown[]).length).toBe(1);
  });

  it("strips teacher-only metadata (teacherNote/aiInstruction/hint/solution/rubric)", () => {
    const exam = { sections: [{ id: "s", title: "", questions: [
      { examQuestionId: "q", text: "t", marks: 1, teacherNote: "n", aiInstruction: "ai", hint: "h", solution: "sol", rubric: "r" }
    ] }] };
    const safe = toSafePreviewExam(exam);
    for (const k of ["teacherNote", "aiInstruction", "hint", "solution", "rubric"]) expect(jsonHas(safe, k)).toBe(false);
  });

  it("security parity: strips EVERY key the real student sanitizer removes, nested everywhere", () => {
    // Fixture places each secret key at question / option / field / part / image-asset / stimulus-image
    // level, plus top-level revisionHistory and metadata.import.
    const secret = {
      correctText: "S", correctOptionValue: "S", correctOptionLabel: "S", history: ["S"], redoStack: ["S"],
      explanation: "S", rationale: "S", externalUrl: "http://evil/x.png"
    };
    const exam = {
      title: "t", presentationTheme: "classic",
      metadata: { generalInstructions: "keep", import: { sourceFile: "SECRET_IMPORT", examId: "old" } },
      revisionHistory: [{ at: "SECRET_REV" }],
      sections: [{
        id: "s", title: "ق", stimuli: { g1: { title: "stim", image: { dataUrl: "data:image/png;base64,AAAA", ...secret } } },
        questions: [{
          examQuestionId: "q1", text: "keepQ", marks: 5, ...secret,
          image: { dataUrl: "data:image/png;base64,AAAA", assets: [{ dataUrl: "data:image/png;base64,BBBB", ...secret }], ...secret },
          options: [{ text: "keepOpt", ...secret }],
          fields: [{ id: "f", label: "keepField", options: [{ value: "v", ...secret }], ...secret }],
          parts: [{ id: "p", text: "keepPart", ...secret, options: [{ text: "o", ...secret }], fields: [{ id: "pf", ...secret }] }]
        }]
      }]
    };
    const safe = toSafePreviewExam(exam);
    const s = JSON.stringify(safe);
    for (const k of ["correctText", "correctOptionValue", "correctOptionLabel", "history", "redoStack",
                     "explanation", "rationale", "externalUrl", "revisionHistory"]) {
      expect(s.includes("\"" + k + "\"")).toBe(false);
    }
    expect(s).not.toContain("SECRET_IMPORT");   // metadata.import removed
    expect(s).not.toContain("SECRET_REV");      // revisionHistory removed
    expect(safe.metadata && (safe.metadata as Record<string, unknown>).import).toBeUndefined();
    // Display data survives.
    for (const keep of ["keepQ", "keepOpt", "keepField", "keepPart", "keep"]) expect(s).toContain(keep);
    // Source not mutated.
    expect((exam.metadata as Record<string, unknown>).import).toBeDefined();
  });

  it("cover parity A/B/C/D/E: allowlists cover fields, drops unknown/unsafe, keeps safe banner, no mutation", () => {
    const SAFE_PNG = "data:image/png;base64,AAAABBBB";
    const src = {
      title: "t",
      coverPage: {
        enabled: true, activityType: "training", subtitle: "sub", instructions: "line1\nline2",
        allowedMaterials: "calc", showStudentName: true, showClassName: false, showExamDate: true,
        showDuration: true, showTotalMarks: false, showMarksDistribution: true,
        // foreign / secret cover fields that must NOT survive
        teacherPrivateValue: "SECRET_COVER", foreignMetadata: { hidden: "SECRET_META" },
        banner: { dataUrl: "https://evil.example/banner.svg", otherSecret: "SECRET_BANNER" }
      },
      sections: [{ id: "s", title: "", questions: [{ examQuestionId: "q", text: "x", marks: 1 }] }]
    };
    const safe = toSafePreviewExam(src);
    const s = JSON.stringify(safe);
    // A: unknown cover keys gone
    expect(s).not.toContain("SECRET_COVER");
    expect(s).not.toContain("SECRET_META");
    expect(s).not.toContain("teacherPrivateValue");
    expect(s).not.toContain("foreignMetadata");
    // B: unsafe/external/SVG banner produces no renderable banner
    expect(s).not.toContain("evil.example");
    expect(s).not.toContain("SECRET_BANNER");
    expect((safe.coverPage as { banner?: unknown }).banner).toBeUndefined();
    // D: known display fields survive with correct values
    const cover = safe.coverPage as Record<string, unknown>;
    expect(cover.enabled).toBe(true);
    expect(cover.activityType).toBe("training");
    expect(cover.subtitle).toBe("sub");
    expect(cover.instructions).toBe("line1\nline2");
    expect(cover.allowedMaterials).toBe("calc");
    for (const [k, v] of [["showStudentName", true], ["showClassName", false], ["showExamDate", true],
                          ["showDuration", true], ["showTotalMarks", false], ["showMarksDistribution", true]] as [string, boolean][]) {
      expect(cover[k]).toBe(v);
    }
    // E: source object never mutated
    expect((src.coverPage as Record<string, unknown>).teacherPrivateValue).toBe("SECRET_COVER");
    expect((src.coverPage.banner as Record<string, unknown>).dataUrl).toBe("https://evil.example/banner.svg");

    // C: a SAFE embedded raster banner survives.
    const safe2 = toSafePreviewExam({ coverPage: { enabled: true, banner: { dataUrl: SAFE_PNG } } });
    expect((safe2.coverPage as { banner?: { dataUrl?: string } }).banner?.dataUrl).toBe(SAFE_PNG);
  });

  it("generalInstructionLines splits plain text into trimmed non-empty bullet lines", () => {
    expect(generalInstructionLines({ metadata: { generalInstructions: "أولاً\n\n  ثانياً  \nثالثاً" } }))
      .toEqual(["أولاً", "ثانياً", "ثالثاً"]);
    expect(generalInstructionLines({})).toEqual([]);
    expect(generalInstructionLines(null)).toEqual([]);
  });
});
