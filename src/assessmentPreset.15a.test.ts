import { describe, it, expect } from "vitest";
import {
  ASSESSMENT_PRESET_SCHEMA_VERSION, validateAssessmentPreset, assessmentPresetFromExam, instantiateExamFromPreset, presetSummary,
  type AssessmentPresetV1
} from "./assessmentPreset";
import type { StructuredExam, BuilderSection } from "./examTypes";
import type { AssessmentBlueprintV1 } from "./assessmentTypes";
import { validateBlueprintForExam } from "./assessmentBlueprint";
import { validateAssessmentQualityPolicy } from "./assessmentQualityPolicy";

// Phase 15A — the pure Assessment Preset authority (P1 canonical model · P2 safe allow-list extraction · P3 section-reference
// remapping · P4 new-exam instantiation) + the five-subject evidence. Fail-first on 79b2f9e (module absent).

// ── fixtures: five domain-neutral subjects, each with its own vocabulary — the engine must treat all of them as data ──
type Subj = { id: string; label: string; course: string; level: string; topics: string[]; objectives: string[]; cognitive?: { id: string; label: string }[]; difficulty?: { min: number; max: number } };
const SUBJECTS: Subj[] = [
  { id: "networking", label: "شبكات الحاسوب", course: "791381", level: "ثاني ثانوي", topics: ["IPv4", "VLAN", "Routing"], objectives: ["يحسب شبكة فرعية", "يضبط VLAN"] },
  { id: "cs", label: "علوم الحاسوب", course: "CS-101", level: "أول جامعي", topics: ["Recursion", "Sorting"], objectives: ["يحلل تعقيد خوارزمية"] },
  { id: "math", label: "الرياضيات", course: "M-2", level: "ثالث ثانوي", topics: ["المشتقات", "التكامل"], objectives: ["يشتق دالة مركبة"], cognitive: [{ id: "procedural", label: "إجرائي" }, { id: "conceptual", label: "مفاهيمي" }, { id: "problem-solving", label: "حل مشكلات" }], difficulty: { min: 1, max: 3 } },
  { id: "physics", label: "الفيزياء", course: "PHY-1", level: "أول ثانوي", topics: ["الحركة", "القوى"], objectives: ["يطبق قوانين نيوتن"], difficulty: { min: 1, max: 4 } },
  { id: "chemistry", label: "الكيمياء", course: "CHM-1", level: "ثاني ثانوي", topics: ["الروابط", "التفاعلات"], objectives: ["يوازن معادلة كيميائية"] }
];
function blueprintFor(s: Subj, sectionIds: string[]): AssessmentBlueprintV1 {
  const topics = s.topics.map((label, i) => ({ id: "t" + (i + 1), label, order: i }));
  const objectives = s.objectives.map((label, i) => ({ id: "o" + (i + 1), label, topicId: "t1", order: i }));
  const constraints = [
    { id: "c-top", dimension: "topic" as const, ref: "t1", metric: "count" as const, unit: "absolute" as const, min: 2 },
    { id: "c-obj", dimension: "objective" as const, ref: "o1", metric: "marks" as const, unit: "percent" as const, target: 40, tolerance: 10 },
    ...sectionIds.map((sid, i) => ({ id: "c-sec" + (i + 1), dimension: "section" as const, ref: sid, metric: "count" as const, unit: "absolute" as const, min: 1, max: 10 }))
  ];
  return {
    schemaVersion: 1, subject: { id: s.id, label: s.label }, curriculum: { id: "national", label: "المنهاج الوطني" }, course: { id: s.course, label: "مقرر " + s.course }, level: { id: s.level, label: s.level },
    topics, objectives, targets: { totalQuestions: 20, totalMarks: 60 }, constraints,
    ...(s.cognitive ? { cognitiveLevels: s.cognitive } : {}), ...(s.difficulty ? { difficultyScale: s.difficulty } : {}),
    notes: "ملاحظات " + s.label,
    qualityPolicy: { schemaVersion: 1, enabled: true, rules: [
      { id: "qr1", enabled: true, source: { kind: "constraint", constraintId: "c-top" }, relations: ["below-min"], effect: "block-finalization", note: "الحد الأدنى للموضوع الأول" },
      { id: "qr2", enabled: false, source: { kind: "constraint", constraintId: "c-sec1" }, relations: ["above-max"], effect: "warning" },
      { id: "qr3", enabled: true, source: { kind: "total-questions" }, relations: ["below-min"], effect: "warning" },
      { id: "qr4", enabled: true, source: { kind: "unclassified" }, metric: "count", max: 2, effect: "block-finalization" }
    ] }
  } as AssessmentBlueprintV1;
}
const mcq = (id: string, text: string, marks = 2) => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: [{ text: "أ" }, { text: "ب" }, { text: "ج" }], answer: { correctOptionIndex: 1 }, assessmentMeta: { topicIds: ["t1"], objectiveIds: ["o1"], difficulty: 2 }, image: { dataUrl: "data:image/png;base64,QUJD" }, bankQuestionId: "bank-q-77", bankAsset: { blobName: "bank/images/secret-img.png" }, history: [{ text: "old" }], redo: [] });
function realExam(s: Subj = SUBJECTS[0]): StructuredExam {
  const sections: BuilderSection[] = [
    { id: "sec-real-A", title: "القسم الأول", instructions: "أجب عن جميع الأسئلة", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: { st1: { title: "نص", text: "نص القطعة مع الإجابة النموذجية", image: { dataUrl: "data:image/png;base64,U1RJ" } } }, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "طبقات OSI", 4)] as never },
    { id: "sec-real-B", title: "القسم الثاني", gradingPolicy: "capScore", maxMarks: 8, requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [mcq("q3", "عنونة IPv4", 3)] as never },
    { id: "sec-real-C", title: "القسم الثالث", gradingPolicy: "firstNAnswered", maxMarks: null, requiredAnswers: 2, answerUnit: "part", stimuli: {}, questions: [mcq("q4", "VLAN trunking"), mcq("q5", "STP")] as never }
  ];
  return {
    schemaVersion: 2, examId: "EXAM-REAL-1", title: "امتحان شبكات — الفصل الأول", status: "final", presentationTheme: "cards", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z",
    coverPage: { enabled: true, examDate: "2026-03-01", className: "2/ب", instructions: "امتحان يوم الأحد" } as never,
    metadata: { grade: "12" }, totalMarks: 60,
    blueprint: blueprintFor(s, ["sec-real-A", "sec-real-B", "sec-real-C"]),
    sections,
    // governance-looking / runtime fields that must never reach a preset
    governance: { lifecycleState: "published" }, lifecycleState: "published", stateVersion: 7, revisionId: "rev-123", revisionNumber: 3, reviewRevisionId: "rev-122", approvedRevisionId: "rev-123", publishedRevisionId: "rev-123",
    reviewWorkflow: { cycleId: "cyc-1", reviewerId: "teacher-reviewer", approverId: "teacher-approver", publisherId: "teacher-publisher" }, publishedBy: "teacher-publisher",
    history: [{ examId: "EXAM-REAL-1" }], autosave: { key: "backup" }, qualityGateReport: { blockers: 0 }, finalizationDecision: { canFinalize: true }, coverageReport: { ok: true }
  } as unknown as StructuredExam;
}
const presetIds = (i: number) => "ps-" + ["A", "B", "C", "D", "E"][i];
const extract = (exam: StructuredExam, title?: string) => assessmentPresetFromExam(exam, { title, presetSectionIdFor: (_s, i) => presetIds(i) });
const FORBIDDEN_TEXT = /ما هو الراوتر|طبقات OSI|correctOptionIndex|bank-q-77|secret-img|data:image|نص القطعة|EXAM-REAL-1|sec-real-|rev-12|published|cyc-1|teacher-reviewer|teacher-publisher|qualityGateReport|finalizationDecision|coverageReport|canFinalize|examDate|2\/ب|امتحان يوم الأحد|stateVersion|lifecycleState|history|autosave|redo/;

describe("15A P1 — canonical AssessmentPreset model + validator", () => {
  const minimal = (): AssessmentPresetV1 => ({ schemaVersion: 1, presetId: "apr-min", title: "قالب أدنى", sections: [{ presetSectionId: "ps-1", title: "قسم", gradingPolicy: "all" }], blueprint: { schemaVersion: 1, subject: { id: "s", label: "مادة" }, topics: [], objectives: [], constraints: [] } });
  it("accepts a minimal valid preset and a complete one (Blueprint + Quality Policy + three grading policies + theme); reports the schema version", () => {
    expect(ASSESSMENT_PRESET_SCHEMA_VERSION).toBe(1);
    expect(validateAssessmentPreset(minimal())).toEqual([]);
    const full = extract(realExam(), "قالب كامل")!;
    expect(validateAssessmentPreset(full)).toEqual([]);
    expect(full.sections.map(s => s.gradingPolicy)).toEqual(["all", "capScore", "firstNAnswered"]);
    expect(full.sections[1]).toMatchObject({ maxMarks: 8 }); expect(full.sections[2]).toMatchObject({ requiredAnswers: 2, answerUnit: "part" });
    expect(full.presentationTheme).toBe("cards");
  });
  it("rejects: unsupported schema · empty title · duplicate presetSectionId · unknown grading policy · bad maxMarks / requiredAnswers · bad theme", () => {
    const codes = (p: unknown) => validateAssessmentPreset(p).map(i => i.code);
    expect(codes({ ...minimal(), schemaVersion: 2 })).toContain("UNSUPPORTED_SCHEMA_VERSION");
    expect(codes({ ...minimal(), title: "   " })).toContain("TITLE_REQUIRED");
    expect(codes({ ...minimal(), sections: [{ presetSectionId: "ps-1", title: "أ", gradingPolicy: "all" }, { presetSectionId: "ps-1", title: "ب", gradingPolicy: "all" }] })).toContain("DUPLICATE_SECTION_ID");
    expect(codes({ ...minimal(), sections: [{ presetSectionId: "ps-1", title: "أ", gradingPolicy: "bestOf" }] })).toContain("INVALID_GRADING_POLICY");
    expect(codes({ ...minimal(), sections: [{ presetSectionId: "ps-1", title: "أ", gradingPolicy: "capScore", maxMarks: -3 }] })).toContain("INVALID_SECTION_NUMBER");
    expect(codes({ ...minimal(), sections: [{ presetSectionId: "ps-1", title: "أ", gradingPolicy: "firstNAnswered", requiredAnswers: 1.5 }] })).toContain("INVALID_SECTION_NUMBER");
    expect(codes({ ...minimal(), presentationTheme: "neon" })).toContain("INVALID_THEME");
    expect(codes({ ...minimal(), sections: [] })).toContain("SECTIONS_REQUIRED");
    expect(codes(null)).toContain("UNSUPPORTED_SCHEMA_VERSION");
  });
  it("rejects a broken section constraint reference, a malformed Blueprint and a malformed Quality Policy (reusing the canonical validators)", () => {
    const p = extract(realExam())!;
    const broken = { ...p, blueprint: { ...p.blueprint, constraints: p.blueprint.constraints.map(c => (c.id === "c-sec1" ? { ...c, ref: "sec-real-A" } : c)) } };
    expect(validateAssessmentPreset(broken).some(i => i.code === "BLUEPRINT_INVALID" && /c-sec1|sec-real-A/.test(i.message + (i.path ?? "") + (i.refId ?? "")))).toBe(true);
    const badBp = { ...p, blueprint: { ...p.blueprint, topics: "nope" } };
    expect(validateAssessmentPreset(badBp).map(i => i.code)).toContain("BLUEPRINT_INVALID");
    const badPolicy = { ...p, blueprint: { ...p.blueprint, qualityPolicy: { schemaVersion: 1, enabled: true, rules: [{ id: "x", enabled: true, source: { kind: "constraint", constraintId: "ghost" }, relations: ["below-min"], effect: "warning" }] } } };
    expect(validateAssessmentPreset(badPolicy).map(i => i.code)).toContain("QUALITY_POLICY_INVALID");
    expect(validateAssessmentPreset({ ...p, blueprint: undefined }).map(i => i.code)).toContain("BLUEPRINT_REQUIRED");
  });
  it("forbids questions, stimuli, answers and every runtime / governance field on the preset and on its sections", () => {
    const p = extract(realExam())!;
    const codes = (x: unknown) => validateAssessmentPreset(x).map(i => i.code);
    expect(codes({ ...p, sections: [{ ...p.sections[0], questions: [] }] })).toContain("FORBIDDEN_FIELD");
    expect(codes({ ...p, sections: [{ ...p.sections[0], questions: [mcq("q", "x")] }] })).toContain("FORBIDDEN_FIELD");
    expect(codes({ ...p, sections: [{ ...p.sections[0], stimuli: {} }] })).toContain("FORBIDDEN_FIELD");
    for (const key of ["questions", "examId", "governance", "lifecycleState", "stateVersion", "revisionId", "reviewWorkflow", "ownerId", "coverPage", "history", "answerKey"]) {
      expect(codes({ ...p, [key]: "x" }), key).toContain("FORBIDDEN_FIELD");
    }
  });
});

describe("15A P2 — allow-list extraction from a real exam", () => {
  it("extracts ONLY the academic design: identity, taxonomy, objectives, constraints (section refs rewritten), targets, vocabulary, Quality Policy, section structure, theme — nothing else", () => {
    const exam = realExam();
    const p = extract(exam, "قالب شبكات")!;
    expect(p).toBeTruthy();
    expect(Object.keys(p).sort()).toEqual(["blueprint", "description", "presentationTheme", "presetId", "schemaVersion", "sections", "title"].filter(k => k !== "description" || p.description !== undefined));
    expect(p.title).toBe("قالب شبكات"); expect(p.presetId).toMatch(/^apr-/);
    expect(p.sections).toEqual([
      { presetSectionId: "ps-A", title: "القسم الأول", instructions: "أجب عن جميع الأسئلة", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question" },
      { presetSectionId: "ps-B", title: "القسم الثاني", gradingPolicy: "capScore", maxMarks: 8, requiredAnswers: null, answerUnit: "question" },
      { presetSectionId: "ps-C", title: "القسم الثالث", gradingPolicy: "firstNAnswered", maxMarks: null, requiredAnswers: 2, answerUnit: "part" }
    ]);
    // section-dimension constraints now reference preset section identities; everything else is preserved verbatim
    expect(p.blueprint.constraints.filter(c => c.dimension === "section").map(c => c.ref)).toEqual(["ps-A", "ps-B", "ps-C"]);
    expect(p.blueprint.constraints.filter(c => c.dimension !== "section")).toEqual(exam.blueprint!.constraints.filter(c => c.dimension !== "section"));
    expect(p.blueprint.topics).toEqual(exam.blueprint!.topics); expect(p.blueprint.objectives).toEqual(exam.blueprint!.objectives);
    expect(p.blueprint.targets).toEqual({ totalQuestions: 20, totalMarks: 60 }); expect(p.blueprint.subject).toEqual({ id: "networking", label: "شبكات الحاسوب" });
    expect(p.blueprint.qualityPolicy).toEqual(exam.blueprint!.qualityPolicy);
    expect(p.blueprint.qualityPolicy).not.toBe(exam.blueprint!.qualityPolicy);                 // deep copy, no shared mutable reference
    expect(p.presentationTheme).toBe("cards");
    const text = JSON.stringify(p);
    expect(text).not.toMatch(FORBIDDEN_TEXT);
    expect(text).not.toMatch(/"questions"|"stimuli"|"answer"|"image"|"bank|"coverPage"|"metadata"|"totalMarks":60,"status"|"governance"/);
    expect(validateAssessmentPreset(p)).toEqual([]);
    // the source exam is untouched
    expect(exam.sections[0].questions).toHaveLength(2); expect(exam.blueprint!.constraints[2].ref).toBe("sec-real-A");
  });
  it("requires a Blueprint: an exam without one yields null (nothing is invented); the default title derives from the exam title", () => {
    const exam = realExam(); delete (exam as { blueprint?: unknown }).blueprint;
    expect(assessmentPresetFromExam(exam)).toBeNull();
    const p = assessmentPresetFromExam(realExam())!;
    expect(p.title).toBe("امتحان شبكات — الفصل الأول");
    expect(p.sections.every(s => /^ps-/.test(s.presetSectionId))).toBe(true);
    expect(new Set(p.sections.map(s => s.presetSectionId)).size).toBe(3);
  });
});

describe("15A P3 / P4 — instantiation with section-reference remapping", () => {
  it("creates a NEW draft: fresh examId, fresh section ids, zero questions, empty stimuli, structural config copied, section constraints remapped, Blueprint + policy preserved, theme copied, no governance / owner / history", () => {
    const p = extract(realExam())!;
    const exam = instantiateExamFromPreset(p);
    expect(exam.examId).toMatch(/^EXAM-/); expect(exam.examId).not.toBe("EXAM-REAL-1");
    expect(exam.status).toBe("draft"); expect(exam.title).toBe("امتحان شبكات — الفصل الأول"); expect(exam.presentationTheme).toBe("cards");
    expect(exam.sections).toHaveLength(3);
    for (const [i, s] of exam.sections.entries()) {
      expect(s.id).toMatch(/^sec-/); expect(s.id).not.toBe(presetIds(i)); expect(s.id).not.toMatch(/sec-real/);
      expect(s.questions).toEqual([]); expect(s.stimuli).toEqual({});
      expect(s.title).toBe(p.sections[i].title); expect(s.gradingPolicy).toBe(p.sections[i].gradingPolicy);
    }
    expect(exam.sections[1].maxMarks).toBe(8); expect(exam.sections[2]).toMatchObject({ requiredAnswers: 2, answerUnit: "part" });
    const secRefs = exam.blueprint!.constraints.filter(c => c.dimension === "section").map(c => c.ref);
    expect(secRefs).toEqual(exam.sections.map(s => s.id));                                   // each constraint → the matching new section, in order
    expect(JSON.stringify(exam)).not.toMatch(/ps-[A-E]\b/);                                   // no preset identity remains
    expect(exam.blueprint!.qualityPolicy).toEqual(p.blueprint.qualityPolicy); expect(exam.blueprint!.qualityPolicy).not.toBe(p.blueprint.qualityPolicy);
    expect(exam.blueprint!.topics).toEqual(p.blueprint.topics); expect(exam.blueprint!.constraints.filter(c => c.dimension !== "section")).toEqual(p.blueprint.constraints.filter(c => c.dimension !== "section"));
    expect(validateBlueprintForExam(exam.blueprint, exam)).toEqual([]);
    expect(validateAssessmentQualityPolicy(exam.blueprint!.qualityPolicy, exam.blueprint)).toEqual([]);
    for (const k of ["governance", "lifecycleState", "stateVersion", "revisionId", "reviewWorkflow", "publishedRevisionId", "ownerId", "presetId", "version", "createdBy", "history", "coverPage"]) expect(k in exam, k).toBe(false);
    expect(Object.keys(exam).sort()).toEqual(["blueprint", "examId", "presentationTheme", "schemaVersion", "sections", "status", "title"]);
  });
  it("two instantiations of one preset: equal academic design, independent identity — no shared section id, no shared examId, no shared object references", () => {
    const p = extract(realExam())!;
    const a = instantiateExamFromPreset(p), b = instantiateExamFromPreset(p);
    expect(a.examId).not.toBe(b.examId);
    const aIds = a.sections.map(s => s.id), bIds = b.sections.map(s => s.id);
    expect(new Set([...aIds, ...bIds]).size).toBe(6);
    expect(a.blueprint!.constraints.filter(c => c.dimension === "section").map(c => c.ref)).toEqual(aIds);
    expect(b.blueprint!.constraints.filter(c => c.dimension === "section").map(c => c.ref)).toEqual(bIds);
    const design = (e: StructuredExam) => ({ subject: e.blueprint!.subject, course: e.blueprint!.course, topics: e.blueprint!.topics, objectives: e.blueprint!.objectives, policy: e.blueprint!.qualityPolicy, targets: e.blueprint!.targets, nonSection: e.blueprint!.constraints.filter(c => c.dimension !== "section"), sections: e.sections.map(s => ({ title: s.title, gradingPolicy: s.gradingPolicy, maxMarks: s.maxMarks, requiredAnswers: s.requiredAnswers, answerUnit: s.answerUnit })) });
    expect(design(a)).toEqual(design(b));
    expect(a.blueprint).not.toBe(b.blueprint); expect(a.sections[0]).not.toBe(b.sections[0]);
    // mutating exam A never touches exam B or the preset (factory, not a shared reference)
    a.blueprint!.topics.push({ id: "t9", label: "extra" }); a.sections[0].questions.push(mcq("qz", "z") as never);
    expect(b.blueprint!.topics).toHaveLength(3); expect(b.sections[0].questions).toEqual([]); expect(p.blueprint.topics).toHaveLength(3);
  });
  it("Quality Policy references survive extraction → serialization → instantiation: rules still point to the intended constraints; enabled / effect / relations unchanged", () => {
    const p = JSON.parse(JSON.stringify(extract(realExam()))) as AssessmentPresetV1;    // storage round-trip
    const exam = instantiateExamFromPreset(p);
    const policy = exam.blueprint!.qualityPolicy!;
    expect(policy.enabled).toBe(true);
    expect(policy.rules.map(r => [r.id, r.enabled, r.effect])).toEqual([["qr1", true, "block-finalization"], ["qr2", false, "warning"], ["qr3", true, "warning"], ["qr4", true, "block-finalization"]]);
    const secRule = policy.rules[1] as { source: { kind: string; constraintId?: string } };
    expect(secRule.source.constraintId).toBe("c-sec1");
    const target = exam.blueprint!.constraints.find(c => c.id === "c-sec1")!;
    expect(target.dimension).toBe("section"); expect(target.ref).toBe(exam.sections[0].id);   // the rule's constraint now names the real new section
    expect(validateAssessmentQualityPolicy(policy, exam.blueprint)).toEqual([]);
  });
  it("a preset title never binds the exam: renaming the instantiated exam leaves the preset alone and vice versa", () => {
    const p = extract(realExam(), "قالب")!;
    const exam = instantiateExamFromPreset(p);
    exam.title = "امتحان الفصل الثاني"; expect(p.title).toBe("قالب");
    const p2 = { ...p, title: "قالب جديد" }; expect(exam.title).toBe("امتحان الفصل الثاني"); expect(instantiateExamFromPreset(p2).title).toBe("قالب جديد");
  });
});

describe("15A — five-subject evidence (one engine, no subject branch)", () => {
  it.each(SUBJECTS.map(s => [s.label, s] as const))("%s: extract → validate → instantiate twice preserves the subject's own vocabulary and remaps only section ids", (_label, s) => {
    const exam = realExam(s);
    const p = extract(exam, "قالب " + s.label)!;
    expect(validateAssessmentPreset(p)).toEqual([]);
    expect(p.blueprint.subject.id).toBe(s.id); expect(p.blueprint.course!.id).toBe(s.course);
    if (s.cognitive) expect(p.blueprint.cognitiveLevels).toEqual(s.cognitive); else expect(p.blueprint.cognitiveLevels).toBeUndefined();
    if (s.difficulty) expect(p.blueprint.difficultyScale).toEqual(s.difficulty);
    const a = instantiateExamFromPreset(p), b = instantiateExamFromPreset(p);
    expect(a.blueprint!.cognitiveLevels).toEqual(s.cognitive); expect(b.blueprint!.difficultyScale).toEqual(s.difficulty);
    expect(a.sections.map(x => x.id)).not.toEqual(b.sections.map(x => x.id));
    expect(validateBlueprintForExam(a.blueprint, a)).toEqual([]); expect(validateBlueprintForExam(b.blueprint, b)).toEqual([]);
    const summary = presetSummary({ schemaVersion: 1, presetId: p.presetId, ownerId: "t", version: 1, createdAt: "", updatedAt: "", preset: p });
    expect(summary).toMatchObject({ title: "قالب " + s.label, subject: s.label, course: "مقرر " + s.course, level: s.level, sectionCount: 3, topicCount: s.topics.length, objectiveCount: s.objectives.length, constraintCount: 2 + 3, qualityRuleCount: 4 });
    expect(JSON.stringify(summary)).not.toMatch(/questionCount|score/);
  });
});
