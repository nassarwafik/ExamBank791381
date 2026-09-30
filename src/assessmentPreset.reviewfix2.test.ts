import { describe, it, expect } from "vitest";
import { assessmentPresetFromExam, extractAssessmentPresetFromExam, validateSourceDesign, validateAssessmentPreset, type AssessmentPresetV1 } from "./assessmentPreset";
import { validateAssessmentQualityPolicy, defaultQualityRule } from "./assessmentQualityPolicy";
import { evaluateExamFinalization } from "./examFinalization";
import type { StructuredExam, BuilderSection } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// Phase 15A — Independent Review Fix 2: Blueprint-safe policy validation. The canonical Quality Policy validator assumes a
// structurally valid Blueprint (constraints collection, targets object); it must run ONLY when validateBlueprint reported zero
// issues. A malformed Blueprint yields Blueprint issues alone — never a runtime exception. Fail-first on 3cb85cf.
const mcq = (id: string) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
type RuleSource = { kind: "constraint"; constraintId: string } | { kind: "total-questions" } | { kind: "total-marks" };
const policy = (source: RuleSource = { kind: "constraint", constraintId: "c-top" }) => ({ schemaVersion: 1, enabled: true, rules: [
  { id: "qr1", enabled: true, source, relations: ["below-min"], effect: "block-finalization", note: "قاعدة" },
  { id: "qr2", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 2, effect: "warning" }
] });
function blueprint(sectionIds: string[], over: Record<string, unknown> = {}): AssessmentBlueprintV1 {
  return {
    schemaVersion: 1, subject: { id: "physics", label: "الفيزياء" }, course: { id: "PHY-1", label: "مقرر PHY-1" }, level: { id: "10", label: "أول ثانوي" },
    topics: [{ id: "t1", label: "الحركة", order: 0 }, { id: "t2", label: "القوى", order: 1 }], objectives: [{ id: "o1", label: "يطبق قوانين نيوتن", topicId: "t1", order: 0 }],
    targets: { totalQuestions: 20, totalMarks: 60 },
    constraints: [
      { id: "c-top", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 },
      ...sectionIds.map((sid, i) => ({ id: "c-sec" + (i + 1), dimension: "section" as const, ref: sid, metric: "count" as const, unit: "absolute" as const, min: 1, max: 10 }))
    ],
    qualityPolicy: policy(),
    ...over
  } as AssessmentBlueprintV1;
}
function exam(sectionIds = ["sec-1", "sec-2"], bp: unknown = blueprint(sectionIds)): StructuredExam {
  const sections: BuilderSection[] = sectionIds.map((id, i) => ({ id, title: "القسم " + (i + 1), instructions: "", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [mcq("q" + i)] as never }));
  return { schemaVersion: 2, examId: "EXAM-SRC-2", title: "امتحان المصدر", status: "draft", presentationTheme: "classic", blueprint: bp as AssessmentBlueprintV1, sections } as unknown as StructuredExam;
}
const snapshot = (e: StructuredExam) => JSON.stringify(e);
const RUNTIME = /is not a function|Cannot read|Cannot use 'in'|undefined/;
function expectFailClosed(src: StructuredExam, label: string) {
  const before = snapshot(src); const minted: number[] = [];
  let result!: ReturnType<typeof extractAssessmentPresetFromExam>;
  expect(() => { result = extractAssessmentPresetFromExam(src, { presetSectionIdFor: (_s, i) => { minted.push(i); return "ps-" + i; } }); }, label).not.toThrow();
  expect(result.ok, label).toBe(false);
  if (result.ok) return result;
  expect(result.reason, label).toBe("invalid-source");
  expect(result.issues.map(i => i.code), label).toContain("BLUEPRINT_INVALID");
  expect(result.issues.map(i => i.code), label).not.toContain("QUALITY_POLICY_INVALID");                 // policy validation is downstream of Blueprint validity
  expect(result.issues.every(i => !RUNTIME.test(i.message)), label).toBe(true);
  expect(minted, label).toEqual([]);                                                                      // no preset section id minted, nothing copied / remapped
  expect(snapshot(src), label).toBe(before);
  let legacy: unknown = "unset";
  expect(() => { legacy = assessmentPresetFromExam(src); }, label).not.toThrow();
  expect(legacy, label).toBeNull();
  // the source validator itself never throws either
  expect(() => validateSourceDesign(src), label).not.toThrow();
  return result;
}

describe("15A RF9 / RF10 — malformed constraints collection with a present Quality Policy", () => {
  it("RF9: blueprint.constraints = {} → invalid-source with BLUEPRINT_INVALID only; no throw; no id minted", () => {
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { constraints: {} })), "constraints {}");
  });
  it("RF10: blueprint.constraints = 'broken' → same fail-closed outcome", () => {
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { constraints: "broken" })), "constraints 'broken'");
  });
});

describe("15A RF11 / RF12 — malformed targets with total-question / total-mark policy rules", () => {
  it("RF11: blueprint.targets = 'broken' + rule source total-questions → Blueprint issue, no `in` / runtime error", () => {
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { targets: "broken", qualityPolicy: policy({ kind: "total-questions" }) })), "targets + total-questions");
  });
  it("RF12: blueprint.targets = 'broken' + rule source total-marks → same", () => {
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { targets: "broken", qualityPolicy: policy({ kind: "total-marks" }) })), "targets + total-marks");
    // other malformed target shapes are equally closed
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { targets: 42, qualityPolicy: policy({ kind: "total-marks" }) })), "targets 42");
    expectFailClosed(exam(["sec-1"], blueprint(["sec-1"], { targets: [1, 2], qualityPolicy: policy({ kind: "total-questions" }) })), "targets array");
  });
});

describe("15A Review Fix 2 — audit outcome: the canonical policy validator and the finalization authority never throw on a malformed Blueprint substructure", () => {
  it("validateAssessmentQualityPolicy reads constraints / targets defensively: malformed shapes yield reference / target issues, never a TypeError; a valid Blueprint is unchanged", () => {
    const valid = blueprint(["sec-1"]);
    expect(validateAssessmentQualityPolicy(valid.qualityPolicy, valid)).toEqual([]);
    for (const bad of [{ ...valid, constraints: {} }, { ...valid, constraints: "broken" }, { ...valid, constraints: [null, 3] }, { ...valid, targets: "broken", qualityPolicy: policy({ kind: "total-questions" }) }, { ...valid, targets: 7, qualityPolicy: policy({ kind: "total-marks" }) }]) {
      let issues: unknown[] = [];
      expect(() => { issues = validateAssessmentQualityPolicy((bad as AssessmentBlueprintV1).qualityPolicy, bad as unknown as AssessmentBlueprintV1); }).not.toThrow();
      expect(issues.length).toBeGreaterThan(0);
      expect(JSON.stringify(issues)).not.toMatch(RUNTIME);
    }
    expect(() => defaultQualityRule({ ...valid, constraints: {} } as unknown as AssessmentBlueprintV1)).not.toThrow();
    expect(defaultQualityRule({ ...valid, constraints: {} } as unknown as AssessmentBlueprintV1).source.kind).toBe("unclassified");
  });
  it("evaluateExamFinalization (Builder render + server finalization) on constraints = {} / targets = 'broken' with a policy present → a decision, not an exception; a valid exam decides as before", () => {
    for (const over of [{ constraints: {} }, { constraints: "broken" }, { targets: "broken", qualityPolicy: policy({ kind: "total-questions" }) }]) {
      const src = exam(["sec-1"], blueprint(["sec-1"], over));
      let decision!: ReturnType<typeof evaluateExamFinalization>;
      expect(() => { decision = evaluateExamFinalization(src); }).not.toThrow();
      expect(decision.policyIssues.length).toBeGreaterThan(0);
    }
    const ok = evaluateExamFinalization(exam(["sec-1"], blueprint(["sec-1"])));
    expect(ok.policyIssues).toEqual([]);
  });
});

describe("15A RF13 / RF14 — policy validation stays authoritative on a valid Blueprint; valid sources unchanged", () => {
  it("RF13: valid Blueprint + qualityPolicy.rules = null / rule source null → QUALITY_POLICY_INVALID (policy validation was not disabled)", () => {
    for (const qp of [{ schemaVersion: 1, enabled: true, rules: null }, { schemaVersion: 1, enabled: true, rules: [{ id: "x", source: null }] }, "nope"]) {
      const src = exam(["sec-1"], blueprint(["sec-1"], { qualityPolicy: qp })); const minted: number[] = [];
      let result!: ReturnType<typeof extractAssessmentPresetFromExam>;
      expect(() => { result = extractAssessmentPresetFromExam(src, { presetSectionIdFor: (_s, i) => { minted.push(i); return "ps-" + i; } }); }).not.toThrow();
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("invalid-source");
      const codes = result.ok ? [] : result.issues.map(i => i.code);
      expect(codes).toContain("QUALITY_POLICY_INVALID"); expect(codes).not.toContain("BLUEPRINT_INVALID");
      expect(minted).toEqual([]);
    }
    // the source validator reports the policy issues directly too
    const direct = validateSourceDesign(exam(["sec-1"], blueprint(["sec-1"], { qualityPolicy: { schemaVersion: 1, enabled: true, rules: null } })));
    expect(direct.issues.map(i => i.code)).toEqual(["QUALITY_POLICY_INVALID"]); expect(direct.sectionIds).toEqual(["sec-1"]);
  });
  it("RF14: a valid source (Blueprint + policy incl. total-questions rule) extracts exactly as before — remap, ids, policy, theme; canonically valid", () => {
    const bp = blueprint(["sec-1", "sec-2"], { qualityPolicy: policy({ kind: "total-questions" }) });
    const src = exam(["sec-1", "sec-2"], bp); const before = snapshot(src);
    const result = extractAssessmentPresetFromExam(src, { title: "قالب فيزياء", presetId: "apr-fixed", presetSectionIdFor: (_s, i) => "ps-" + i });
    expect(result.ok).toBe(true);
    const preset = (result as { ok: true; preset: AssessmentPresetV1 }).preset;
    expect(validateAssessmentPreset(preset)).toEqual([]);
    expect(preset.blueprint.constraints.map(c => [c.id, c.ref])).toEqual([["c-top", "t1"], ["c-sec1", "ps-0"], ["c-sec2", "ps-1"]]);
    expect(preset.blueprint.qualityPolicy).toEqual(bp.qualityPolicy); expect(preset.blueprint.targets).toEqual({ totalQuestions: 20, totalMarks: 60 });
    expect(preset.presentationTheme).toBe("classic"); expect(preset.sections.map(s => s.presetSectionId)).toEqual(["ps-0", "ps-1"]);
    expect(JSON.stringify(preset)).not.toMatch(/"questions"|"stimuli"|correctOptionIndex|EXAM-SRC-2|"sec-1"|"sec-2"/);
    expect(snapshot(src)).toBe(before);
    expect(assessmentPresetFromExam(src, { title: "قالب فيزياء", presetId: "apr-fixed", presetSectionIdFor: (_s, i) => "ps-" + i })).toEqual(preset);
    expect(validateSourceDesign(src).issues).toEqual([]);
  });
  it("Review Fix 1 invariants hold: duplicate source section ids refused, missing Blueprint distinct — with a Quality Policy present", () => {
    const dup = exam(["sec-1", "sec-1"], blueprint(["sec-1"]));
    const r1 = extractAssessmentPresetFromExam(dup);
    expect(r1.ok === false && r1.reason).toBe("invalid-source"); expect(r1.ok ? [] : r1.issues.map(i => i.code)).toContain("DUPLICATE_SOURCE_SECTION_ID");
    const none = exam(["sec-1"], null);
    const r2 = extractAssessmentPresetFromExam(none);
    expect(r2.ok === false && r2.reason).toBe("no-blueprint");
  });
});
