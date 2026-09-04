import { describe, it, expect } from "vitest";
import { studentExam } from "../src/functions/student-assignment.js";

describe("studentExam - the new theme field survives while the correct answer is still blanked", () => {
  it("preserves presentationTheme at the top level", () => {
    const snapshot = { presentationTheme: "compact", questions: [] };
    expect(studentExam(snapshot).presentationTheme).toBe("compact");
  });

  it("still blanks answer/hint/teacherNote/aiInstruction/history/redoStack per question, unaffected by the new field", () => {
    const snapshot = {
      presentationTheme: "compact",
      questions: [{
        examQuestionId: "q1",
        text: "نص",
        answer: { correctOptionIndex: 1 },
        hint: "تلميح",
        teacherNote: "ملاحظة",
        aiInstruction: "تعليمة",
        history: ["x"],
        redoStack: ["y"]
      }]
    };
    const result = studentExam(snapshot);
    expect(result.presentationTheme).toBe("compact");
    expect(result.questions[0]).toMatchObject({
      answer: {}, hint: "", teacherNote: "", aiInstruction: "", history: [], redoStack: []
    });
    expect(result.questions[0].text).toBe("نص");
  });

  it("leaves presentationTheme undefined for a legacy exam snapshot with no theme - no crash", () => {
    const snapshot = { questions: [] };
    expect(() => studentExam(snapshot)).not.toThrow();
    expect(studentExam(snapshot).presentationTheme).toBeUndefined();
  });
});
