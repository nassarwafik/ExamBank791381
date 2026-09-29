import { describe, it, expect } from "vitest";
import { toSavedStructuredExam, cloneQuestionWithNewIds } from "./examBuilderState";
import { writeExamBackup, readExamBackup } from "./examAutosave";
import { openExamHistory, updateExamHistory, examDeepEqual } from "./examHistory";
import { evaluateExamFinalization } from "./examFinalization";
import { withBlueprint } from "./assessmentBlueprint";
import { addQualityRule, setQualityPolicyEnabled } from "./assessmentQualityPolicy";
import { networkingBlueprint } from "./assessmentBlueprintFixtures";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
// @ts-expect-error — CommonJS server module without type declarations (the REAL save-path cleaner).
import { cleanExam } from "../api/src/functions/save-exam-artifact.js";

// Phase 13C-C — F10: the quality policy is persisted as part of the canonical Blueprint; gate results are never persisted.
const policy = { schemaVersion: 1 as const, enabled: true, rules: [{ id: "r1", enabled: true, source: { kind: "constraint" as const, constraintId: "c1" }, relations: ["below-min" as const], effect: "block-finalization" as const, note: "ملاحظة للمعلم" }] };
const bp = { ...networkingBlueprint, constraints: [{ id: "c1", dimension: "topic" as const, ref: "IP_ADDRESSING", metric: "marks" as const, unit: "percent" as const, min: 30 }], qualityPolicy: policy };
const q = (id: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text: id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, assessmentMeta: { primaryTopicId: "IP_ADDRESSING" } } as BuilderQuestion);
const exam = (): StructuredExam => ({ examId: "e1", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T00:00:00.000Z", blueprint: bp, sections: [{ id: "s1", title: "A", gradingPolicy: "all", stimuli: {}, questions: [q("q1")] }] } as StructuredExam);
const ANALYTIC = /canFinalize|blockerCount|warningCount|qualityReport|qualityGateReport|finalizationDecision|"triggered"/;

describe("F10 — quality policy persistence and history", () => {
  it("saved-exam round trip (toSavedStructuredExam → cleanExam → JSON) keeps blueprint.qualityPolicy byte-for-byte and stores no gate result", () => {
    const saved = JSON.parse(JSON.stringify(cleanExam(toSavedStructuredExam(exam())))) as StructuredExam;
    expect(saved.blueprint!.qualityPolicy).toEqual(policy);
    expect(JSON.stringify(saved)).not.toMatch(ANALYTIC);
    expect(JSON.stringify(toSavedStructuredExam(exam()))).not.toMatch(ANALYTIC);
  });
  it("autosave backup round trip keeps the policy; history: a policy edit is ONE entry, undo restores it exactly, a no-op edit is no entry", () => {
    const map = new Map<string, string>(); const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
    writeExamBackup(storage, "t1", exam(), "2026-03-01T00:00:00.000Z");
    expect(readExamBackup(storage, "t1", "e1")!.exam.blueprint!.qualityPolicy).toEqual(policy);
    let h = openExamHistory(exam(), "saved");
    const before = h.present!;
    h = updateExamHistory(h, prev => withBlueprint(prev, b => setQualityPolicyEnabled(b, false)));
    expect(h.past).toHaveLength(1); expect(h.present!.blueprint!.qualityPolicy!.enabled).toBe(false);
    h = updateExamHistory(h, prev => withBlueprint(prev, b => setQualityPolicyEnabled(b, false)));           // same value
    expect(h.past).toHaveLength(1);
    h = updateExamHistory(h, prev => withBlueprint(prev, b => addQualityRule(b, { id: "r2", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 0, effect: "warning" })));
    expect(h.past).toHaveLength(2); expect(h.present!.blueprint!.qualityPolicy!.rules).toHaveLength(2);
    expect(examDeepEqual(h.past[0], before)).toBe(true);
  });
  it("copying a question never carries policy or analytics; an exam without a policy keeps no policy; evaluating finalization never writes into the exam", () => {
    const e = exam(); const copy = cloneQuestionWithNewIds(e.sections[0].questions[0]);
    expect(JSON.stringify(copy)).not.toMatch(/qualityPolicy|canFinalize/);
    const plain = { ...exam(), blueprint: networkingBlueprint };
    expect(toSavedStructuredExam(plain).blueprint).not.toHaveProperty("qualityPolicy");
    const snapshot = JSON.stringify(e); evaluateExamFinalization(e); expect(JSON.stringify(e)).toBe(snapshot);
  });
});
