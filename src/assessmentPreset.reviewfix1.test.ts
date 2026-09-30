import { describe, it, expect } from "vitest";
import { assessmentPresetFromExam, extractAssessmentPresetFromExam, validateAssessmentPreset, instantiateExamFromPreset, type AssessmentPresetV1 } from "./assessmentPreset";
import type { StructuredExam, BuilderSection } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";

// Phase 15A — Independent Review Fix 1: FAIL-CLOSED source design extraction. The source exam's design (sections identity,
// Blueprint, Quality Policy) is validated BEFORE anything is copied; malformed imported / legacy data yields structured
// validation issues — never a runtime exception, never a silently repaired mapping. Fail-first on 0bc6656 (copy-first order).
const mcq = (id: string) => ({ examQuestionId: id, presentationType: "multipleChoice", text: "سؤال " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
function blueprint(sectionIds: string[]): AssessmentBlueprintV1 {
  return {
    schemaVersion: 1, subject: { id: "networking", label: "شبكات الحاسوب" }, course: { id: "791381", label: "مقرر 791381" }, level: { id: "12", label: "ثاني ثانوي" },
    topics: [{ id: "t1", label: "IPv4", order: 0 }, { id: "t2", label: "VLAN", order: 1 }], objectives: [{ id: "o1", label: "يحسب شبكة فرعية", topicId: "t1", order: 0 }],
    targets: { totalQuestions: 20, totalMarks: 60 },
    constraints: [
      { id: "c-top", dimension: "topic", ref: "t1", metric: "count", unit: "absolute", min: 2 },
      ...sectionIds.map((sid, i) => ({ id: "c-sec" + (i + 1), dimension: "section" as const, ref: sid, metric: "count" as const, unit: "absolute" as const, min: 1, max: 10 }))
    ],
    qualityPolicy: { schemaVersion: 1, enabled: true, rules: [
      { id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c-top" }, relations: ["below-min"], effect: "block-finalization", note: "الحد الأدنى" },
      { id: "qr2", enabled: true, source: { kind: "total-questions" }, relations: ["below-min"], effect: "warning" }
    ] }
  } as AssessmentBlueprintV1;
}
function exam(sectionIds = ["sec-1", "sec-2"], bp: unknown = blueprint(sectionIds)): StructuredExam {
  const sections: BuilderSection[] = sectionIds.map((id, i) => ({ id, title: "القسم " + (i + 1), instructions: "", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [mcq("q" + i)] as never }));
  return { schemaVersion: 2, examId: "EXAM-SRC", title: "امتحان المصدر", status: "draft", presentationTheme: "cards", blueprint: bp as AssessmentBlueprintV1, sections, lifecycleState: "published", revisionId: "rev-1" } as unknown as StructuredExam;
}
const snapshot = (e: StructuredExam) => JSON.stringify(e);
const withBlueprint = (patch: (bp: Record<string, unknown>) => void, sectionIds = ["sec-1", "sec-2"]) => { const bp = blueprint(sectionIds) as unknown as Record<string, unknown>; patch(bp); return exam(sectionIds, bp); };
const codes = (r: ReturnType<typeof extractAssessmentPresetFromExam>) => (r.ok ? [] : r.issues.map(i => i.code));

describe("15A RF1 / RF2 — malformed Blueprint collections never throw; they become Blueprint validation issues", () => {
  it("RF1: blueprint.topics = 'broken' → ok:false with BLUEPRINT_INVALID, no exception, source exam untouched, legacy wrapper returns null without throwing", () => {
    const src = withBlueprint(bp => { bp.topics = "broken"; }); const before = snapshot(src);
    let result!: ReturnType<typeof extractAssessmentPresetFromExam>;
    expect(() => { result = extractAssessmentPresetFromExam(src, { title: "قالب" }); }).not.toThrow();
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("BLUEPRINT_INVALID");
    expect(result.ok === false && result.issues.every(i => typeof i.message === "string" && !/is not a function|Cannot read|undefined/.test(i.message))).toBe(true);
    expect(snapshot(src)).toBe(before);
    let legacy: unknown = "unset";
    expect(() => { legacy = assessmentPresetFromExam(src); }).not.toThrow();
    expect(legacy).toBeNull();
  });
  it("RF2: objectives = {} and constraints = null each yield Blueprint issues (no runtime exception, nothing copied)", () => {
    for (const patch of [(bp: Record<string, unknown>) => { bp.objectives = {}; }, (bp: Record<string, unknown>) => { bp.constraints = null; }, (bp: Record<string, unknown>) => { bp.topics = [{ id: 1 }]; bp.constraints = [{}]; }]) {
      const src = withBlueprint(patch); const before = snapshot(src);
      let result!: ReturnType<typeof extractAssessmentPresetFromExam>;
      expect(() => { result = extractAssessmentPresetFromExam(src); }).not.toThrow();
      expect(result.ok).toBe(false); expect(codes(result)).toContain("BLUEPRINT_INVALID");
      expect(snapshot(src)).toBe(before);
      expect(() => assessmentPresetFromExam(src)).not.toThrow();
    }
  });
});

describe("15A RF3 — malformed Quality Policy is validated before it is copied", () => {
  it("rules = null and a rule with source = null produce QUALITY_POLICY_INVALID issues; copyPolicy / copyRule never run on them", () => {
    for (const patch of [(bp: Record<string, unknown>) => { (bp.qualityPolicy as Record<string, unknown>).rules = null; }, (bp: Record<string, unknown>) => { (bp.qualityPolicy as Record<string, unknown>).rules = [{ id: "x", source: null }]; }, (bp: Record<string, unknown>) => { bp.qualityPolicy = "nope"; }]) {
      const src = withBlueprint(patch); const before = snapshot(src);
      let result!: ReturnType<typeof extractAssessmentPresetFromExam>; const generated: number[] = [];
      expect(() => { result = extractAssessmentPresetFromExam(src, { presetSectionIdFor: (_s, i) => { generated.push(i); return "ps-" + i; } }); }).not.toThrow();
      expect(generated).toEqual([]);                                                      // nothing copied / remapped before validation
      expect(result.ok).toBe(false); expect(codes(result)).toContain("QUALITY_POLICY_INVALID");
      expect(result.ok === false && result.issues.every(i => !/is not a function|Cannot read/.test(i.message))).toBe(true);
      expect(snapshot(src)).toBe(before);
      expect(() => assessmentPresetFromExam(src)).not.toThrow();
      expect(assessmentPresetFromExam(src)).toBeNull();
    }
  });
});

describe("15A RF4 / RF5 — source section identity is settled BEFORE remapping", () => {
  it("RF4: two source sections with the same id + a section constraint on that id → refused (DUPLICATE_SOURCE_SECTION_ID); the constraint is never retargeted to one of them", () => {
    const src = exam(["sec-1", "sec-1"], blueprint(["sec-1"]));
    const result = extractAssessmentPresetFromExam(src, { presetSectionIdFor: (_s, i) => "ps-" + i });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("DUPLICATE_SOURCE_SECTION_ID");
    expect(result.ok === false && result.issues.find(i => i.code === "DUPLICATE_SOURCE_SECTION_ID")!.refId).toBe("sec-1");
    expect(assessmentPresetFromExam(src)).toBeNull();
    // the same duplicate WITHOUT any section constraint is still refused — identity must be unambiguous, not merely unused
    const noConstraint = exam(["sec-1", "sec-1"], blueprint([]));
    expect(extractAssessmentPresetFromExam(noConstraint).ok).toBe(false);
  });
  it("RF4b: a source section without a valid non-empty id, a non-object section and a non-array sections list are refused with explicit source codes", () => {
    const bad1 = exam(["sec-1", ""], blueprint(["sec-1"]));
    expect(codes(extractAssessmentPresetFromExam(bad1))).toContain("INVALID_SOURCE_SECTION_ID");
    const bad2 = exam(["sec-1"], blueprint(["sec-1"])); (bad2.sections as unknown as unknown[]).push(null);
    expect(codes(extractAssessmentPresetFromExam(bad2))).toContain("INVALID_SOURCE_SECTION");
    const bad3 = exam(["sec-1"], blueprint(["sec-1"])); (bad3 as unknown as Record<string, unknown>).sections = { id: "sec-1" };
    let r3!: ReturnType<typeof extractAssessmentPresetFromExam>;
    expect(() => { r3 = extractAssessmentPresetFromExam(bad3); }).not.toThrow();
    expect(codes(r3)).toContain("INVALID_SOURCE_SECTIONS");
    const empty = exam([], blueprint([]));
    expect(codes(extractAssessmentPresetFromExam(empty))).toContain("INVALID_SOURCE_SECTIONS");
  });
  it("RF5: a section constraint pointing at an unknown REAL exam section id fails as a Blueprint issue before any remapping (the issue names the broken ref)", () => {
    const src = exam(["sec-1", "sec-2"], blueprint(["sec-1", "sec-GHOST"]));
    const generated: number[] = [];                                                       // remapping would call this
    const result = extractAssessmentPresetFromExam(src, { presetSectionIdFor: (_s, i) => { generated.push(i); return "ps-" + i; } });
    expect(result.ok).toBe(false);
    expect(generated).toEqual([]);                                                        // refused BEFORE any preset section id was minted
    const bi = result.ok === false ? result.issues.filter(i => i.code === "BLUEPRINT_INVALID") : [];
    expect(bi.length).toBeGreaterThan(0);
    expect(JSON.stringify(bi)).toContain("sec-GHOST");
    expect(JSON.stringify(bi)).not.toContain("ps-");
  });
});

describe("15A RF6 / RF7 — valid sources extract exactly as before; the missing-Blueprint case stays distinct", () => {
  it("RF6: the complete fixture → ok:true; sections remapped, topic / objective / constraint / rule ids preserved, Quality Policy and theme copied, no forbidden fields, resulting preset canonically valid and instantiable", () => {
    const src = exam(); const before = snapshot(src);
    const result = extractAssessmentPresetFromExam(src, { title: "قالب شبكات", description: "وصف", presetId: "apr-fixed", presetSectionIdFor: (_s, i) => "ps-" + i });
    expect(result.ok).toBe(true);
    const preset = (result as { ok: true; preset: AssessmentPresetV1 }).preset;
    expect(validateAssessmentPreset(preset)).toEqual([]);
    expect(preset.title).toBe("قالب شبكات"); expect(preset.description).toBe("وصف"); expect(preset.presentationTheme).toBe("cards");
    expect(preset.sections.map(s => s.presetSectionId)).toEqual(["ps-0", "ps-1"]);
    expect(preset.sections[0]).toEqual({ presetSectionId: "ps-0", title: "القسم 1", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" });
    expect(preset.blueprint.constraints.map(c => [c.id, c.ref])).toEqual([["c-top", "t1"], ["c-sec1", "ps-0"], ["c-sec2", "ps-1"]]);
    expect(preset.blueprint.topics.map(t => t.id)).toEqual(["t1", "t2"]); expect(preset.blueprint.objectives[0].id).toBe("o1");
    expect(preset.blueprint.qualityPolicy).toEqual(blueprint([]).qualityPolicy);
    expect(JSON.stringify(preset)).not.toMatch(/"questions"|"stimuli"|correctOptionIndex|سؤال q|EXAM-SRC|"sec-1"|"sec-2"|lifecycleState|revisionId|published/);
    expect(snapshot(src)).toBe(before);
    // legacy wrapper: same preset content
    expect(assessmentPresetFromExam(src, { title: "قالب شبكات", description: "وصف", presetId: "apr-fixed", presetSectionIdFor: (_s, i) => "ps-" + i })).toEqual(preset);
    const inst = instantiateExamFromPreset(preset, { sectionIdFor: (_s, i) => "new-" + i });
    expect(inst.blueprint!.constraints.map(c => c.ref)).toEqual(["t1", "new-0", "new-1"]);
  });
  it("RF7: no Blueprint → the distinct factual outcome (reason 'no-blueprint', BLUEPRINT_REQUIRED) — never a generic malformed-design error; legacy wrapper still returns null", () => {
    for (const bp of [undefined, null]) {
      const src = exam(["sec-1"], bp); delete (src as unknown as Record<string, unknown>).blueprint; if (bp === null) (src as unknown as Record<string, unknown>).blueprint = null;
      const result = extractAssessmentPresetFromExam(src);
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe("no-blueprint");
      expect(codes(result)).toEqual(["BLUEPRINT_REQUIRED"]);
      expect(assessmentPresetFromExam(src)).toBeNull();
    }
    // a malformed Blueprint is NOT the no-blueprint case
    const broken = withBlueprint(bp => { bp.topics = "broken"; });
    const r = extractAssessmentPresetFromExam(broken);
    expect(r.ok === false && r.reason).toBe("invalid-source");
  });
});
