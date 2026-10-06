import { describe, it, expect } from "vitest";
import { validateAssessmentPreset, extractAssessmentPresetFromExam, instantiateExamFromPreset, type AssessmentPresetV1 } from "./assessmentPreset";
import type { StructuredExam } from "./examTypes";

// Phase 20D.1 — an Assessment Preset is a reusable DESIGN; the enterprise presentation (exam-level ExamPresentationV1 and the
// bounded per-section override) is part of that design, exactly like presentationTheme. It travels only as the canonical
// validated copy (never by reference, never malformed): extraction fails closed on a malformed source presentation, the
// validator refuses a malformed one, instantiation deep-copies it. Absent ⇒ no key anywhere (legacy presets unchanged).

const PRES = { schemaVersion: 1, preset: "networkLab", components: { questionCard: { variant: "elevated" } } };
const SEC_PRES = { schemaVersion: 1, components: { sectionHeader: { variant: "band" } } };
const bp = { schemaVersion: 1, subject: { id: "net", label: "شبكات" }, topics: [], objectives: [], constraints: [] };
function exam(over: Record<string, unknown> = {}, secOver: Record<string, unknown> = {}): StructuredExam {
  return {
    schemaVersion: 2, examId: "EXAM-P", title: "امتحان", status: "draft", blueprint: bp,
    sections: [
      { id: "sA", title: "أ", gradingPolicy: "all", stimuli: {}, questions: [], ...secOver },
      { id: "sB", title: "ب", gradingPolicy: "all", stimuli: {}, questions: [] }
    ],
    ...over
  } as unknown as StructuredExam;
}
const ids = { presetId: "apr-x", presetSectionIdFor: (_s: unknown, i: number) => "ps-" + i };

describe("20D.1 — Assessment Preset carries the enterprise presentation (design, canonical copy only)", () => {
  it("extraction copies a valid exam presentation and section override as canonical copies (not references); the preset validates", () => {
    const src = exam({ presentation: PRES }, { presentation: SEC_PRES });
    const r = extractAssessmentPresetFromExam(src, ids);
    expect(r.ok).toBe(true);
    const preset = (r as { preset: AssessmentPresetV1 }).preset;
    expect(preset.presentation).toEqual(PRES);
    expect(preset.presentation).not.toBe(PRES);
    expect(preset.sections[0].presentation).toEqual(SEC_PRES);
    expect(preset.sections[0].presentation).not.toBe(SEC_PRES);
    expect(preset.sections[1]).not.toHaveProperty("presentation");
    expect(validateAssessmentPreset(preset)).toEqual([]);
  });

  it("extraction FAILS CLOSED on a malformed source presentation (exam or section) — nothing copied, structured issue", () => {
    for (const src of [
      exam({ presentation: { schemaVersion: 1, preset: "networkLab", tokens: { colors: { primary: "url(x)" } } } }),
      exam({ presentation: { schemaVersion: 2, preset: "default" } }),
      exam({}, { presentation: { schemaVersion: 1, css: "body{}" } })
    ]) {
      const r = extractAssessmentPresetFromExam(src, ids);
      expect(r.ok).toBe(false);
      expect((r as { issues: { code: string }[] }).issues.map(i => i.code)).toContain("INVALID_PRESENTATION");
    }
  });

  it("the canonical validator refuses a malformed presentation at preset or section level and accepts a valid one", () => {
    const base = (): AssessmentPresetV1 => ({ schemaVersion: 1, presetId: "apr-v", title: "قالب", blueprint: bp as never, sections: [{ presetSectionId: "ps-0", title: "أ", gradingPolicy: "all" }] });
    expect(validateAssessmentPreset({ ...base(), presentation: PRES })).toEqual([]);
    const okSec = base(); okSec.sections[0].presentation = SEC_PRES as never;
    expect(validateAssessmentPreset(okSec)).toEqual([]);
    expect(validateAssessmentPreset({ ...base(), presentation: { schemaVersion: 1, preset: "nope" } }).map(i => i.code)).toContain("INVALID_PRESENTATION");
    // contrast failure is blocking here too (white text on white)
    expect(validateAssessmentPreset({ ...base(), presentation: { schemaVersion: 1, preset: "default", tokens: { colors: { text: "#FFFFFF", background: "#FFFFFF" } } } }).map(i => i.code)).toContain("INVALID_PRESENTATION");
    const badSec = base(); (badSec.sections[0] as Record<string, unknown>).presentation = { schemaVersion: 1, components: { examHeader: { variant: "hero" } } };
    expect(validateAssessmentPreset(badSec).map(i => i.code)).toContain("INVALID_PRESENTATION");
  });

  it("instantiation deep-copies the presentation and the section overrides onto the new draft", () => {
    const preset = (extractAssessmentPresetFromExam(exam({ presentation: PRES }, { presentation: SEC_PRES }), ids) as { preset: AssessmentPresetV1 }).preset;
    const e = instantiateExamFromPreset(preset, { examId: "EXAM-NEW", sectionIdFor: (_s, i) => "n" + i });
    expect(e.presentation).toEqual(PRES);
    expect(e.presentation).not.toBe(preset.presentation);
    expect(e.sections[0].presentation).toEqual(SEC_PRES);
    expect(e.sections[0].presentation).not.toBe(preset.sections[0].presentation);
    expect(e.sections[1]).not.toHaveProperty("presentation");
  });

  it("legacy: an exam without presentation yields a preset and a new exam with NO presentation key", () => {
    const preset = (extractAssessmentPresetFromExam(exam({ presentationTheme: "cards" }), ids) as { preset: AssessmentPresetV1 }).preset;
    expect(preset).not.toHaveProperty("presentation");
    expect(preset.sections.every(s => !("presentation" in s))).toBe(true);
    const e = instantiateExamFromPreset(preset, { examId: "EXAM-L" });
    expect(e).not.toHaveProperty("presentation");
    expect(e.presentationTheme).toBe("cards");
  });
});
