import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 13C-B — the live Blueprint intelligence is teacher-authoring data. Even if some future code path ever persisted a
// coverage report / evidence index / intelligence cache on the exam, the ONE sanitizer must drop it (defense in depth).
describe("13C-B — no live-intelligence data reaches a student", () => {
  it("exam-level coverage report / evidence index / intelligence keys are stripped alongside the blueprint", () => {
    const exam = { examId: "e1", title: "t", schemaVersion: 2, blueprint: { schemaVersion: 1 }, coverageReport: { totals: [{ relation: "below-target" }] }, blueprintCoverage: { x: 1 }, assessmentIntelligence: { cached: true }, evidenceIndex: { byTopic: { A: ["q1"] } },
      sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "س", marks: 1, answer: { text: "SECRET" }, assessmentMeta: { primaryTopicId: "A" } }] }] };
    const s = sanitizeExamForStudent(exam);
    for (const k of ["blueprint", "coverageReport", "blueprintCoverage", "assessmentIntelligence", "evidenceIndex"]) expect(s).not.toHaveProperty(k);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/relation|below-target|evidence|SECRET|assessmentMeta/);
    expect(s.sections[0].questions[0].text).toBe("س");
  });
});
