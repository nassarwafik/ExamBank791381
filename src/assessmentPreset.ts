// Phase 15A — Assessment Preset («قالب أكاديمي»): a reusable ASSESSMENT DESIGN, never an exam copy.
//
// A preset carries the academic design of an exam — Blueprint (subject / curriculum / course / level, topics, objectives,
// cognitive vocabulary, difficulty scale, targets, constraints, Quality Policy), the section STRUCTURE (title, instructions,
// grading policy, caps), the presentation theme and (Phase 20D.1) the canonical enterprise presentation — and nothing else: no questions, no answer keys, no stimuli, no bank
// identities or assets, no cover-page sitting data, no governance / revision / audit / history / autosave state.
//
// Three pure authorities live here and are compiled unchanged into the server build (scripts/build-shared-finalization.mjs)
// so browser and API validate presets with the SAME code:
//   • validateAssessmentPreset(input)      — canonical validation, reusing validateBlueprint / validateAssessmentQualityPolicy
//                                            with the preset section identities as the section context;
//   • extractAssessmentPresetFromExam(exam) — FAIL-CLOSED, ALLOW-LIST extraction (Independent Review Fix 1): the SOURCE design
//                                            is validated first (section identity unique and stable → canonical Blueprint →
//                                            canonical Quality Policy) and nothing is copied until that passes; then the
//                                            preset is constructed from permitted fields (never copied-then-stripped),
//                                            section ids → stable presetSectionIds, every section-dimension constraint
//                                            rewritten to the preset identity, and the result is validated again. Malformed
//                                            imported / legacy data yields structured issues — never a runtime exception,
//                                            never a silently repaired mapping. assessmentPresetFromExam() is the
//                                            null-on-failure wrapper kept for callers that only need "preset or nothing";
//   • instantiateExamFromPreset(preset)    — a NEW draft StructuredExam: fresh examId, fresh section ids, empty questions /
//                                            stimuli, section constraints remapped to the new real ids, Blueprint + Quality
//                                            Policy deep-copied, theme copied; no governance, owner or history fields.
// Topic / objective / constraint / quality-rule ids are academic identities and stay stable across extraction and
// instantiation (Quality Policy rules reference constraintId — preserving them keeps every reference valid without a second
// remapping step). Section ids are runtime identities and are ALWAYS regenerated.
import type { StructuredExam, BuilderSection, GradingPolicy, AnswerUnit } from "./examTypes";
import type { AssessmentBlueprintV1, AssessmentQualityPolicyV1, AssessmentQualityRule, BlueprintConstraint } from "./assessmentTypes";
import { ASSESSMENT_BLUEPRINT_SCHEMA_VERSION } from "./assessmentTypes";
import { validateBlueprint } from "./assessmentBlueprint";
import { validateAssessmentQualityPolicy } from "./assessmentQualityPolicy";
import { EXAM_THEMES, type ExamTheme } from "./examTheme";
import { genId } from "./examBuilderState";
import { validatePresentation, validateSectionPresentation, type ExamPresentationV1, type SectionPresentationV1 } from "./presentation/presentationModel";

export const ASSESSMENT_PRESET_SCHEMA_VERSION = 1 as const;
export const PRESET_LABEL = "قالب أكاديمي";
export const PRESET_TITLE_MAX = 120;
export const PRESET_DESCRIPTION_MAX = 500;
export const PRESET_SECTIONS_MAX = 50;
const GRADING_POLICIES: readonly GradingPolicy[] = ["all", "capScore", "firstNAnswered"];
const ANSWER_UNITS: readonly AnswerUnit[] = ["question", "part"];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type AssessmentPresetSection = {
  presetSectionId: string;
  title: string;
  instructions?: string;
  gradingPolicy: GradingPolicy;
  maxMarks?: number | null;
  requiredAnswers?: number | null;
  answerUnit?: AnswerUnit;
  /** Phase 20D.1 — bounded section presentation override (canonical validated copy only). */
  presentation?: SectionPresentationV1;
};
export type AssessmentPresetV1 = {
  schemaVersion: typeof ASSESSMENT_PRESET_SCHEMA_VERSION;
  presetId: string;
  title: string;
  description?: string;
  blueprint: AssessmentBlueprintV1;
  sections: AssessmentPresetSection[];
  presentationTheme?: ExamTheme;
  /** Phase 20D.1 — enterprise ExamPresentationV1 (canonical validated copy only; absent on legacy presets). */
  presentation?: ExamPresentationV1;
};
/** Server-owned envelope (owner, version, timestamps are minted by the API, never by the client). */
export type AssessmentPresetRecordV1 = { schemaVersion: 1; presetId: string; ownerId: string; version: number; createdAt: string; updatedAt: string; preset: AssessmentPresetV1 };
/** List metadata — enough for the library cards; never the Blueprint / sections bodies, never a quality score. */
export type AssessmentPresetSummary = {
  presetId: string; version: number; title: string; description?: string; subject: string; course?: string; level?: string;
  sectionCount: number; topicCount: number; objectiveCount: number; constraintCount: number; qualityRuleCount: number; updatedAt: string; presentationTheme?: ExamTheme;
};
export type PresetIssueCode = "UNSUPPORTED_SCHEMA_VERSION" | "TITLE_REQUIRED" | "TITLE_TOO_LONG" | "DESCRIPTION_TOO_LONG" | "INVALID_PRESET_ID" | "SECTIONS_REQUIRED" | "TOO_MANY_SECTIONS" | "INVALID_SECTION" | "INVALID_SECTION_ID" | "DUPLICATE_SECTION_ID" | "SECTION_TITLE_INVALID" | "INVALID_GRADING_POLICY" | "INVALID_SECTION_NUMBER" | "INVALID_ANSWER_UNIT" | "FORBIDDEN_FIELD" | "BLUEPRINT_REQUIRED" | "BLUEPRINT_INVALID" | "QUALITY_POLICY_INVALID" | "INVALID_THEME" | "INVALID_PRESENTATION"
  | "INVALID_SOURCE_SECTIONS" | "INVALID_SOURCE_SECTION" | "INVALID_SOURCE_SECTION_ID" | "DUPLICATE_SOURCE_SECTION_ID";
export type PresetIssue = { code: PresetIssueCode; message: string; path?: string; refId?: string };

// Every key a preset (root) or a preset section may carry. Anything else is FORBIDDEN — questions, stimuli, answers, exam /
// governance / revision / history / autosave / owner fields can never ride along, now or when new exam fields appear.
const PRESET_KEYS: ReadonlySet<string> = new Set(["schemaVersion", "presetId", "title", "description", "blueprint", "sections", "presentationTheme", "presentation"]);
const SECTION_KEYS: ReadonlySet<string> = new Set(["presetSectionId", "title", "instructions", "gradingPolicy", "maxMarks", "requiredAnswers", "answerUnit", "presentation"]);
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNullableCount = (v: unknown) => v === undefined || v === null || (typeof v === "number" && Number.isInteger(v) && v >= 0);
const isNullableMarks = (v: unknown) => v === undefined || v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const text = (v: unknown) => (typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim() : "");

export function validateAssessmentPreset(input: unknown): PresetIssue[] {
  const issues: PresetIssue[] = [];
  const add = (code: PresetIssueCode, message: string, path?: string, refId?: string) => issues.push({ code, message, path, refId });
  if (!isPlainObject(input) || input.schemaVersion !== ASSESSMENT_PRESET_SCHEMA_VERSION) { add("UNSUPPORTED_SCHEMA_VERSION", "إصدار قالب غير مدعوم.", "schemaVersion"); return issues; }
  for (const key of Object.keys(input)) if (!PRESET_KEYS.has(key)) add("FORBIDDEN_FIELD", "حقل غير مسموح في القالب الأكاديمي: " + key, key);
  if (typeof input.presetId !== "string" || !SAFE_ID.test(input.presetId)) add("INVALID_PRESET_ID", "معرّف القالب غير صالح.", "presetId");
  const title = text(input.title);
  if (!title) add("TITLE_REQUIRED", "عنوان القالب مطلوب.", "title");
  else if (title.length > PRESET_TITLE_MAX) add("TITLE_TOO_LONG", "عنوان القالب أطول من " + PRESET_TITLE_MAX + " حرفًا.", "title");
  if (input.description !== undefined && (typeof input.description !== "string" || input.description.length > PRESET_DESCRIPTION_MAX)) add("DESCRIPTION_TOO_LONG", "وصف القالب أطول من " + PRESET_DESCRIPTION_MAX + " حرفًا.", "description");
  if (input.presentationTheme !== undefined && !(EXAM_THEMES as string[]).includes(input.presentationTheme as string)) add("INVALID_THEME", "مظهر العرض غير معروف.", "presentationTheme");
  if (input.presentation !== undefined) for (const pi of presentationIssues(input.presentation, "presentation")) add("INVALID_PRESENTATION", pi.message, pi.path);
  const sections = input.sections;
  const sectionIds: string[] = [];
  if (!Array.isArray(sections) || sections.length === 0) add("SECTIONS_REQUIRED", "يجب أن يحوي القالب قسمًا واحدًا على الأقل.", "sections");
  else {
    if (sections.length > PRESET_SECTIONS_MAX) add("TOO_MANY_SECTIONS", "عدد الأقسام يتجاوز الحد المسموح (" + PRESET_SECTIONS_MAX + ").", "sections");
    const seen = new Set<string>();
    sections.forEach((s, i) => {
      const path = "sections[" + i + "]";
      if (!isPlainObject(s)) { add("INVALID_SECTION", "قسم غير صالح.", path); return; }
      for (const key of Object.keys(s)) if (!SECTION_KEYS.has(key)) add("FORBIDDEN_FIELD", "حقل غير مسموح في قسم القالب: " + key, path + "." + key);
      if (typeof s.presetSectionId !== "string" || !SAFE_ID.test(s.presetSectionId)) add("INVALID_SECTION_ID", "معرّف قسم القالب غير صالح.", path + ".presetSectionId");
      else if (seen.has(s.presetSectionId)) add("DUPLICATE_SECTION_ID", "معرّف قسم مكرر داخل القالب.", path + ".presetSectionId", s.presetSectionId);
      else { seen.add(s.presetSectionId); sectionIds.push(s.presetSectionId); }
      if (typeof s.title !== "string" || s.title.length > PRESET_TITLE_MAX) add("SECTION_TITLE_INVALID", "عنوان القسم غير صالح.", path + ".title");
      if (s.instructions !== undefined && (typeof s.instructions !== "string" || s.instructions.length > 2000)) add("SECTION_TITLE_INVALID", "تعليمات القسم غير صالحة.", path + ".instructions");
      if (!GRADING_POLICIES.includes(s.gradingPolicy as GradingPolicy)) add("INVALID_GRADING_POLICY", "سياسة التصحيح غير معروفة.", path + ".gradingPolicy");
      if (!isNullableMarks(s.maxMarks)) add("INVALID_SECTION_NUMBER", "الحد الأعلى لعلامات القسم غير صالح.", path + ".maxMarks");
      if (!isNullableCount(s.requiredAnswers)) add("INVALID_SECTION_NUMBER", "عدد الإجابات المطلوبة غير صالح.", path + ".requiredAnswers");
      if (s.answerUnit !== undefined && !ANSWER_UNITS.includes(s.answerUnit as AnswerUnit)) add("INVALID_ANSWER_UNIT", "وحدة الإجابة غير معروفة.", path + ".answerUnit");
      if (s.presentation !== undefined) for (const pi of presentationIssues(s.presentation, path + ".presentation", true)) add("INVALID_PRESENTATION", pi.message, pi.path);
    });
  }
  if (input.blueprint === undefined || input.blueprint === null) add("BLUEPRINT_REQUIRED", "يحتاج القالب الأكاديمي إلى مخطط امتحان.", "blueprint");
  else {
    // The canonical validators judge the Blueprint with the PRESET section identities as the section context.
    for (const bi of validateBlueprint(input.blueprint, { sectionIds })) add("BLUEPRINT_INVALID", bi.message, "blueprint." + (bi.path ?? ""), bi.refId);
    const bp = input.blueprint as Record<string, unknown>;
    if (isPlainObject(bp) && bp.qualityPolicy !== undefined) {
      for (const qi of validateAssessmentQualityPolicy(bp.qualityPolicy, bp as unknown as AssessmentBlueprintV1)) add("QUALITY_POLICY_INVALID", qi.message, "blueprint.qualityPolicy." + (qi.path ?? ""), qi.ruleId);
    }
  }
  return issues;
}

// Phase 20D.1 — the canonical presentation authorities judge a preset's presentation (structure, vocabulary, blocking contrast);
// only their canonical output is ever copied, so a preset never carries a reference into the source exam.
function presentationIssues(raw: unknown, path: string, section = false): { message: string; path?: string }[] {
  const r = section ? validateSectionPresentation(raw, path) : validatePresentation(raw, path);
  return r.ok ? [] : r.issues.length ? r.issues : [{ message: "إعدادات العرض غير صالحة.", path }];
}
function canonicalPresentation(raw: unknown): ExamPresentationV1 | undefined { const r = validatePresentation(raw); return r.ok ? r.value : undefined; }
function canonicalSectionPresentation(raw: unknown): SectionPresentationV1 | undefined { const r = validateSectionPresentation(raw); return r.ok ? r.value : undefined; }

// ── allow-list copies (no spreading of unknown fields) ────────────────────────────────────────────────────────────────
function copyIdentity(v: { id: string; label: string } | undefined) { return v ? { id: v.id, label: v.label } : undefined; }
function copyConstraint(c: BlueprintConstraint, ref = c.ref): BlueprintConstraint {
  const out: BlueprintConstraint = { id: c.id, dimension: c.dimension, ref, metric: c.metric, unit: c.unit };
  if (c.min !== undefined) out.min = c.min; if (c.target !== undefined) out.target = c.target; if (c.max !== undefined) out.max = c.max; if (c.tolerance !== undefined) out.tolerance = c.tolerance;
  return out;
}
function copyRule(r: AssessmentQualityRule): AssessmentQualityRule {
  const note = r.note !== undefined ? { note: r.note } : {};
  if ("relations" in r) {
    const source = r.source.kind === "constraint" ? { kind: "constraint" as const, constraintId: r.source.constraintId } : { kind: r.source.kind };
    return { id: r.id, enabled: r.enabled, source, relations: [...r.relations], effect: r.effect, ...note };
  }
  return { id: r.id, enabled: r.enabled, source: { kind: r.source.kind }, metric: r.metric, max: r.max, effect: r.effect, ...note };
}
function copyPolicy(p: AssessmentQualityPolicyV1 | undefined): AssessmentQualityPolicyV1 | undefined {
  if (!p) return undefined;
  return { schemaVersion: p.schemaVersion, enabled: p.enabled, rules: (p.rules ?? []).map(copyRule) };
}
/** Deep allow-list copy of a Blueprint; `sectionRef` rewrites every section-dimension constraint reference. */
export function copyBlueprintWithSectionRefs(bp: AssessmentBlueprintV1, sectionRef: (ref: string) => string): AssessmentBlueprintV1 {
  const out: AssessmentBlueprintV1 = {
    schemaVersion: ASSESSMENT_BLUEPRINT_SCHEMA_VERSION,
    subject: copyIdentity(bp.subject)!,
    topics: (bp.topics ?? []).map(t => ({ id: t.id, label: t.label, ...(t.parentId !== undefined ? { parentId: t.parentId } : {}), ...(t.order !== undefined ? { order: t.order } : {}), ...(t.description !== undefined ? { description: t.description } : {}) })),
    objectives: (bp.objectives ?? []).map(o => ({ id: o.id, label: o.label, ...(o.topicId !== undefined ? { topicId: o.topicId } : {}), ...(o.order !== undefined ? { order: o.order } : {}), ...(o.description !== undefined ? { description: o.description } : {}) })),
    constraints: (bp.constraints ?? []).map(c => copyConstraint(c, c.dimension === "section" ? sectionRef(c.ref) : c.ref))
  };
  const curriculum = copyIdentity(bp.curriculum), course = copyIdentity(bp.course), level = copyIdentity(bp.level);
  if (curriculum) out.curriculum = curriculum; if (course) out.course = course; if (level) out.level = level;
  if (bp.targets) out.targets = { ...(bp.targets.totalQuestions !== undefined ? { totalQuestions: bp.targets.totalQuestions } : {}), ...(bp.targets.totalMarks !== undefined ? { totalMarks: bp.targets.totalMarks } : {}) };
  if (bp.cognitiveLevels) out.cognitiveLevels = bp.cognitiveLevels.map(l => ({ id: l.id, label: l.label, ...(l.order !== undefined ? { order: l.order } : {}) }));
  if (bp.difficultyScale) {
    out.difficultyScale = { min: bp.difficultyScale.min, max: bp.difficultyScale.max };
    if (bp.difficultyScale.labels) out.difficultyScale.labels = Object.fromEntries(Object.entries(bp.difficultyScale.labels).map(([k, v]) => [k, String(v)]));
  }
  if (bp.notes !== undefined) out.notes = bp.notes;
  const policy = copyPolicy(bp.qualityPolicy);
  if (policy) out.qualityPolicy = policy;
  return out;
}
function presetSectionOf(s: BuilderSection, presetSectionId: string): AssessmentPresetSection {
  const out: AssessmentPresetSection = { presetSectionId, title: String(s.title ?? ""), gradingPolicy: s.gradingPolicy };
  if (typeof s.instructions === "string" && s.instructions.trim()) out.instructions = s.instructions;
  out.maxMarks = s.maxMarks === undefined ? null : s.maxMarks;
  out.requiredAnswers = s.requiredAnswers === undefined ? null : s.requiredAnswers;
  out.answerUnit = s.answerUnit ?? "question";
  const presentation = s.presentation === undefined ? undefined : canonicalSectionPresentation(s.presentation);
  if (presentation) out.presentation = presentation;
  return out;
}
export const newPresetId = () => genId("apr");
export const newPresetSectionId = () => genId("ps");

export type ExtractOptions = { title?: string; description?: string; presetId?: string; presetSectionIdFor?: (section: BuilderSection, index: number) => string };
export type PresetExtractionResult =
  | { ok: true; preset: AssessmentPresetV1 }
  | { ok: false; reason: "no-blueprint"; issues: PresetIssue[] }        // the distinct factual case: nothing to extract yet
  | { ok: false; reason: "invalid-source"; issues: PresetIssue[] };     // malformed design: structured issues, nothing copied

/**
 * Source-design validation (pure, copies NOTHING). Order: source section identity (array, ≥ 1 section, every section a plain
 * object with a stable non-empty string id, ids unique — a duplicate is refused, never repaired or "first wins") → canonical
 * Blueprint validation with the REAL source section ids as the section context → canonical Quality Policy validation ONLY
 * when the Blueprint is structurally valid (Review Fix 2: policy semantics are downstream of Blueprint validity).
 * Any issue makes extraction impossible: copyBlueprintWithSectionRefs / copyPolicy assume runtime-valid collections.
 */
export function validateSourceDesign(exam: unknown): { issues: PresetIssue[]; sectionIds: string[] } {
  const issues: PresetIssue[] = [];
  const add = (code: PresetIssueCode, message: string, path?: string, refId?: string) => issues.push({ code, message, path, refId });
  const sectionIds: string[] = [];
  if (!isPlainObject(exam)) { add("INVALID_SOURCE_SECTIONS", "الامتحان المصدر غير صالح.", ""); return { issues, sectionIds }; }
  const sections = exam.sections;
  if (!Array.isArray(sections) || sections.length === 0) add("INVALID_SOURCE_SECTIONS", "يجب أن يحوي الامتحان المصدر قائمة أقسام تضم قسمًا واحدًا على الأقل.", "sections");
  else {
    const seen = new Set<string>();
    sections.forEach((s, i) => {
      const path = "sections[" + i + "]";
      if (!isPlainObject(s)) { add("INVALID_SOURCE_SECTION", "قسم غير صالح في الامتحان المصدر.", path); return; }
      const id = typeof s.id === "string" ? s.id : "";
      if (!id.trim() || id !== id.trim()) { add("INVALID_SOURCE_SECTION_ID", "معرّف قسم مفقود أو غير صالح في الامتحان المصدر.", path + ".id"); return; }
      if (seen.has(id)) { add("DUPLICATE_SOURCE_SECTION_ID", "معرّف قسم مكرر في الامتحان المصدر؛ لا يمكن تحديد القسم الذي تقصده قيود المخطط.", path + ".id", id); return; }
      seen.add(id); sectionIds.push(id);
    });
  }
  if (exam.blueprint === undefined || exam.blueprint === null) add("BLUEPRINT_REQUIRED", "يحتاج القالب الأكاديمي إلى مخطط امتحان.", "blueprint");
  else {
    const blueprintIssues = validateBlueprint(exam.blueprint, { sectionIds });
    for (const bi of blueprintIssues) add("BLUEPRINT_INVALID", bi.message, "blueprint." + (bi.path ?? ""), bi.refId);
    // Independent Review Fix 2 — a Quality Policy is defined AGAINST a Blueprint: the canonical policy validator assumes a
    // structurally valid Blueprint (constraints collection, targets object). It runs ONLY when the Blueprint reported zero
    // issues; a malformed Blueprint yields its Blueprint issues alone (fail closed) — never a downstream runtime exception.
    const bp = exam.blueprint;
    if (blueprintIssues.length === 0 && isPlainObject(bp) && bp.qualityPolicy !== undefined) {
      for (const qi of validateAssessmentQualityPolicy(bp.qualityPolicy, bp as unknown as AssessmentBlueprintV1)) add("QUALITY_POLICY_INVALID", qi.message, "blueprint.qualityPolicy." + (qi.path ?? ""), qi.ruleId);
    }
  }
  if (exam.presentation !== undefined) for (const pi of presentationIssues(exam.presentation, "presentation")) add("INVALID_PRESENTATION", pi.message, pi.path);
  if (Array.isArray(sections)) sections.forEach((s, i) => {
    if (isPlainObject(s) && s.presentation !== undefined) for (const pi of presentationIssues(s.presentation, "sections[" + i + "].presentation", true)) add("INVALID_PRESENTATION", pi.message, pi.path);
  });
  return { issues, sectionIds };
}

/**
 * FAIL-CLOSED allow-list extraction: inspect source shape → validate source section identity → canonical Blueprint validation
 * → canonical Quality Policy validation → construct the allow-listed preset → validate the resulting preset. No Blueprint /
 * Policy / section remapping happens before the source has been proven safe to copy. The source exam is never mutated.
 */
export function extractAssessmentPresetFromExam(exam: StructuredExam, options: ExtractOptions = {}): PresetExtractionResult {
  const source = validateSourceDesign(exam);
  if (source.issues.length) return { ok: false, reason: source.issues.some(i => i.code === "BLUEPRINT_REQUIRED") ? "no-blueprint" : "invalid-source", issues: source.issues };
  const idFor = options.presetSectionIdFor ?? (() => newPresetSectionId());
  const map = new Map<string, string>();
  const sections = exam.sections.map((s, i) => { const pid = idFor(s, i); map.set(s.id, pid); return presetSectionOf(s, pid); });
  const preset: AssessmentPresetV1 = {
    schemaVersion: ASSESSMENT_PRESET_SCHEMA_VERSION,
    presetId: options.presetId ?? newPresetId(),
    title: text(options.title ?? exam.title).slice(0, PRESET_TITLE_MAX) || PRESET_LABEL,
    blueprint: copyBlueprintWithSectionRefs(exam.blueprint as AssessmentBlueprintV1, ref => map.get(ref) ?? ref),
    sections
  };
  const description = text(options.description);
  if (description) preset.description = description.slice(0, PRESET_DESCRIPTION_MAX);
  if (exam.presentationTheme && (EXAM_THEMES as string[]).includes(exam.presentationTheme)) preset.presentationTheme = exam.presentationTheme;
  const presentation = exam.presentation === undefined ? undefined : canonicalPresentation(exam.presentation);
  if (presentation) preset.presentation = presentation;
  const check = validateAssessmentPreset(preset);
  if (check.length) return { ok: false, reason: "invalid-source", issues: check };
  return { ok: true, preset };
}
/** Preset-or-null wrapper over extractAssessmentPresetFromExam: null for a missing Blueprint AND for a malformed source (never throws). */
export function assessmentPresetFromExam(exam: StructuredExam, options: ExtractOptions = {}): AssessmentPresetV1 | null {
  const result = extractAssessmentPresetFromExam(exam, options);
  return result.ok ? result.preset : null;
}

export type InstantiateOptions = { examId?: string; title?: string; sectionIdFor?: (section: AssessmentPresetSection, index: number) => string };
export const newInstantiatedExamId = () => "EXAM-" + Date.now() + "-" + genId("").replace(/^-/, "").slice(0, 8);
/** A NEW draft exam from the design: fresh identities, empty content, remapped section constraints, deep-copied Blueprint. */
export function instantiateExamFromPreset(preset: AssessmentPresetV1, options: InstantiateOptions = {}): StructuredExam {
  const sectionIdFor = options.sectionIdFor ?? (() => genId("sec"));
  const map = new Map<string, string>();
  const sections: BuilderSection[] = preset.sections.map((s, i) => {
    const id = sectionIdFor(s, i); map.set(s.presetSectionId, id);
    const section: BuilderSection = { id, title: s.title, instructions: s.instructions ?? "", maxMarks: s.maxMarks ?? null, gradingPolicy: s.gradingPolicy, requiredAnswers: s.requiredAnswers ?? null, answerUnit: s.answerUnit ?? "question", stimuli: {}, questions: [] };
    const presentation = s.presentation === undefined ? undefined : canonicalSectionPresentation(s.presentation);
    if (presentation) section.presentation = presentation;
    return section;
  });
  const exam: StructuredExam = {
    schemaVersion: 2,
    examId: options.examId ?? newInstantiatedExamId(),
    title: text(options.title ?? preset.title) || PRESET_LABEL,
    status: "draft",
    blueprint: copyBlueprintWithSectionRefs(preset.blueprint, ref => map.get(ref) ?? ref),
    sections
  };
  if (preset.presentationTheme) exam.presentationTheme = preset.presentationTheme;
  const presentation = preset.presentation === undefined ? undefined : canonicalPresentation(preset.presentation);
  if (presentation) exam.presentation = presentation;
  return exam;
}

export function presetSummary(record: AssessmentPresetRecordV1): AssessmentPresetSummary {
  const p = record.preset; const bp = p.blueprint;
  const out: AssessmentPresetSummary = {
    presetId: record.presetId, version: record.version, title: p.title, subject: bp?.subject?.label ?? "",
    sectionCount: Array.isArray(p.sections) ? p.sections.length : 0, topicCount: bp?.topics?.length ?? 0, objectiveCount: bp?.objectives?.length ?? 0,
    constraintCount: bp?.constraints?.length ?? 0, qualityRuleCount: bp?.qualityPolicy?.rules?.length ?? 0, updatedAt: record.updatedAt
  };
  if (p.description) out.description = p.description;
  if (bp?.course?.label) out.course = bp.course.label;
  if (bp?.level?.label) out.level = bp.level.label;
  if (p.presentationTheme) out.presentationTheme = p.presentationTheme;
  return out;
}
