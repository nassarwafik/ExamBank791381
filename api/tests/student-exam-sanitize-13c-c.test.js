import { describe, it, expect } from "vitest";
import { sanitizeExamForStudent } from "../src/lib/student-exam-sanitize.js";

// Phase 13C-C — quality policy / gate results / finalization data are teacher governance data and never reach a student.
describe("13C-C — no quality policy or finalization data reaches a student", () => {
  it("blueprint (with its qualityPolicy) and any root-level policy / gate / finalization keys are stripped; question content and existing rules intact", () => {
    const exam = { examId: "e1", title: "t", schemaVersion: 2, status: "final",
      blueprint: { schemaVersion: 1, subject: { id: "s", label: "S" }, topics: [], objectives: [], constraints: [], qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "r", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "block-finalization", note: "ملاحظة سرية للمعلم" }] } },
      qualityPolicy: { enabled: true }, qualityGateReport: { canFinalize: false, blockers: [{ ruleId: "r" }] }, finalizationDecision: { canFinalize: false }, qualityBlockers: ["r"], qualityWarnings: ["w"],
      sections: [{ id: "s1", title: "S", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "shortAnswer", text: "س", marks: 1, answer: { text: "SECRET" }, assessmentMeta: { primaryTopicId: "A" }, image: { exists: true, visible: true, assets: [{ id: "a", origin: "bank", blobName: "bank/x.png", contentType: "image/png" }] } }] }] };
    const s = sanitizeExamForStudent(exam);
    for (const k of ["blueprint", "qualityPolicy", "qualityGateReport", "finalizationDecision", "qualityBlockers", "qualityWarnings"]) expect(s).not.toHaveProperty(k);
    const text = JSON.stringify(s);
    expect(text).not.toMatch(/canFinalize|block-finalization|ملاحظة سرية|SECRET|assessmentMeta|blockers/);
    expect(s.sections[0].questions[0].text).toBe("س"); expect(s.sections[0].questions[0].image.assets[0].blobName).toBe("bank/x.png"); expect(s.status).toBe("final");
  });
});
