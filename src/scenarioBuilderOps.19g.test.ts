import { describe, it, expect } from "vitest";
import * as OPS from "./scenarioBuilderOps";
import { deleteQuestion, duplicateQuestion, moveQuestionToSection, structuredExamCopy, changeQuestionType, newQuestion, newSection, toSavedStructuredExam } from "./examBuilderState";
import { bulkDeleteQuestions, bulkDuplicateQuestions, bulkMoveQuestions } from "./structuredExamProductivity";
import { validateSectionScenarios } from "./scenarioSource";
import { validateStructuredExam } from "./examQuality";
import { parseStructuredExamJson } from "./structuredExamImport";
import { validateAssessmentPreset } from "./assessmentPreset";
import type { BuilderQuestion, BuilderSection, StructuredExam } from "./examTypes";

// Phase 19G — Scenario CRUD is a set of PURE builder operations over the section (the one owner of `scenarios[]`): create / edit /
// delete a scenario, source CRUD + reorder, link an existing same-section question, unlink, reorder linked questions, regroup; and
// the existing question operations keep referential integrity (delete / move away ⇒ stale ref removed; duplicate ⇒ never a member;
// exam copy ⇒ ids remapped; type change ⇒ membership untouched). No operation touches marks, answers, type, version or grading.
// Fail-first on 2aa40da: ./scenarioBuilderOps does not exist (the whole file fails to load) and the question operations ignore
// `scenarios`. PINS (already true on the baseline): B17 (type change carries no scenario key), B19 (toSavedStructuredExam keeps
// section keys), B23 (the preset allow-list refuses unknown section keys).
type R = Record<string, unknown>;
const q = (id: string, over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text: "س " + id, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 1 }, ...over });
const TEXT = { id: "src-1", version: 1 as const, kind: "text" as const, title: "النص", text: "اقرأ." };
const scn = (over: R = {}) => ({ id: "scn-1", version: 1 as const, title: "سيناريو", instructions: "", sources: [TEXT], questionIds: ["q1", "q2"], ...over });
const sec = (over: Partial<BuilderSection> & R = {}): BuilderSection => ({ id: "s1", title: "القسم", instructions: "", maxMarks: null, gradingPolicy: "all", requiredAnswers: null, answerUnit: "question", stimuli: {}, questions: [q("q1"), q("q2"), q("q3"), q("q4")], scenarios: [scn()], ...over } as BuilderSection);
const ids = (s: BuilderSection) => s.questions.map(x => x.examQuestionId);
const members = (s: BuilderSection, id = "scn-1") => (s.scenarios ?? []).find(x => x.id === id)?.questionIds;
const snapshot = (s: BuilderSection) => JSON.stringify(s.questions.map(x => ({ ...x })));

describe("19G-B1 — scenario CRUD never touches canonical questions", () => {
  it("B1 newScenario / newSourceStimulus mint stable ids with version 1 and no answer-like key", () => {
    const s = OPS.newScenario(); const src = OPS.newSourceStimulus("text");
    expect(s.version).toBe(1); expect(s.id).toMatch(/^scn-/); expect(s.sources).toEqual([]); expect(s.questionIds).toEqual([]);
    expect(src.version).toBe(1); expect(src.id).toMatch(/^src-/); expect(src.kind).toBe("text");
    expect(OPS.newSourceStimulus("image").kind).toBe("image"); expect(OPS.newSourceStimulus("table").kind).toBe("table"); expect(OPS.newSourceStimulus("code").kind).toBe("code");
    expect(OPS.newScenario().id).not.toBe(OPS.newScenario().id);
  });
  it("B2 addScenario / updateScenario / deleteScenario — delete leaves every question intact and standalone", () => {
    const before = sec();
    const added = OPS.addScenario(before, OPS.newScenario({ id: "scn-2", title: "ثانٍ" }));
    expect(added.scenarios!.map(s => s.id)).toEqual(["scn-1", "scn-2"]);
    const titled = OPS.updateScenario(added, "scn-2", { title: "عنوان", instructions: "تعليمات" });
    expect(titled.scenarios![1]).toMatchObject({ id: "scn-2", title: "عنوان", instructions: "تعليمات", version: 1 });
    const deleted = OPS.deleteScenario(titled, "scn-1");
    expect(deleted.scenarios!.map(s => s.id)).toEqual(["scn-2"]);
    expect(snapshot(deleted)).toBe(snapshot(before));                       // questions byte-identical: marks, answers, type
    expect(OPS.scenarioOf(deleted, "q1")).toBeUndefined();                  // standalone again
    expect(before.scenarios![0].questionIds).toEqual(["q1", "q2"]);         // immutability: the input is never mutated
  });
  it("B3 source CRUD: add / update / delete / reorder — immutable, bounded to the scenario", () => {
    const s0 = sec();
    const s1 = OPS.addScenarioSource(s0, "scn-1", { id: "src-2", version: 1, kind: "code", language: "python", source: "print(1)" });
    expect(s1.scenarios![0].sources.map(x => x.id)).toEqual(["src-1", "src-2"]);
    const s2 = OPS.updateScenarioSource(s1, "scn-1", "src-2", { title: "البرنامج" });
    expect(s2.scenarios![0].sources[1]).toMatchObject({ id: "src-2", kind: "code", title: "البرنامج" });
    const s3 = OPS.moveScenarioSource(s2, "scn-1", "src-2", -1);
    expect(s3.scenarios![0].sources.map(x => x.id)).toEqual(["src-2", "src-1"]);
    expect(OPS.moveScenarioSource(s3, "scn-1", "src-2", -1)).toBe(s3);      // clamped: same reference when nothing moves
    const s4 = OPS.deleteScenarioSource(s3, "scn-1", "src-1");
    expect(s4.scenarios![0].sources.map(x => x.id)).toEqual(["src-2"]);
    expect(s0.scenarios![0].sources.length).toBe(1);
    expect(OPS.addScenarioSource(s0, "nope", TEXT)).toBe(s0);               // unknown scenario: no-op
  });
  it("B4 replaceScenarioSource swaps the KIND (a type change of a source) keeping id and title", () => {
    const s = OPS.replaceScenarioSource(sec(), "scn-1", "src-1", "table");
    expect(s.scenarios![0].sources[0]).toMatchObject({ id: "src-1", version: 1, kind: "table", title: "النص" });
    expect("text" in s.scenarios![0].sources[0]).toBe(false);
  });
});

describe("19G-B5 — membership: link / unlink / reorder / regroup (same section, one scenario, contiguous)", () => {
  it("B5 linking an existing same-section question appends it and moves it adjacent to the group; marks / answers untouched", () => {
    const s = OPS.linkScenarioQuestion(sec(), "scn-1", "q4");
    expect(members(s)).toEqual(["q1", "q2", "q4"]);
    expect(ids(s)).toEqual(["q1", "q2", "q4", "q3"]);                       // moved next to the group (presentation only)
    expect(s.questions.find(x => x.examQuestionId === "q4")).toEqual(q("q4"));
    expect(validateSectionScenarios(s).ok).toBe(true);
  });
  it("B6 a question already in another scenario, a missing question or a duplicate link is refused (no-op)", () => {
    const two = sec({ scenarios: [scn(), scn({ id: "scn-2", questionIds: ["q3"] })] });
    expect(OPS.linkScenarioQuestion(two, "scn-2", "q1")).toBe(two);
    expect(OPS.linkScenarioQuestion(two, "scn-1", "zz")).toBe(two);
    expect(OPS.linkScenarioQuestion(two, "scn-1", "q2")).toBe(two);
  });
  it("B7 linking into an EMPTY scenario keeps the question where it is (the scenario anchors there)", () => {
    const s = OPS.linkScenarioQuestion(sec({ scenarios: [scn({ questionIds: [] })] }), "scn-1", "q3");
    expect(members(s)).toEqual(["q3"]); expect(ids(s)).toEqual(["q1", "q2", "q3", "q4"]);
  });
  it("B8 unlink removes only the reference; the question stays in place, intact", () => {
    const s = OPS.unlinkScenarioQuestion(sec(), "scn-1", "q1");
    expect(members(s)).toEqual(["q2"]); expect(ids(s)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(s.questions[0]).toEqual(q("q1"));
    expect(OPS.unlinkScenarioQuestion(s, "scn-1", "q9")).toBe(s);
  });
  it("B9 reordering linked questions moves them inside the group only (never past a non-member); canonical order follows", () => {
    const s = OPS.moveScenarioQuestion(sec(), "scn-1", "q2", -1);
    expect(ids(s)).toEqual(["q2", "q1", "q3", "q4"]);
    expect(members(s)).toEqual(["q2", "q1"]);
    expect(OPS.moveScenarioQuestion(s, "scn-1", "q1", +1)).toBe(s);          // q1 is the last member: clamped
    expect(OPS.moveScenarioQuestion(s, "scn-1", "q2", -1)).toBe(s);
  });
  it("B10 regroup makes scattered members contiguous at the first member's position, stable order", () => {
    const scattered = sec({ questions: [q("q1"), q("q3"), q("q2"), q("q4")] });
    expect(validateSectionScenarios(scattered).ok).toBe(false);
    const s = OPS.regroupScenario(scattered, "scn-1");
    expect(ids(s)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(validateSectionScenarios(s).ok).toBe(true);
    expect(OPS.regroupScenario(s, "scn-1")).toBe(s);
  });
  it("B11 scenarioOf / linkableQuestions resolve from the section only", () => {
    const s = sec();
    expect(OPS.scenarioOf(s, "q2")?.id).toBe("scn-1"); expect(OPS.scenarioOf(s, "q3")).toBeUndefined();
    expect(OPS.linkableQuestions(s, "scn-1").map(x => x.examQuestionId)).toEqual(["q3", "q4"]);
  });
  it("B12 createQuestionInScenario adds a NEW canonical question (catalog factory) right after the group and links it", () => {
    const s = OPS.createQuestionInScenario(sec(), "scn-1", newQuestion("shortAnswer", { examQuestionId: "q-new" }));
    expect(ids(s)).toEqual(["q1", "q2", "q-new", "q3", "q4"]);
    expect(members(s)).toEqual(["q1", "q2", "q-new"]);
    expect(s.questions[2].presentationType).toBe("shortAnswer");
  });
});

describe("19G-B13 — the existing question operations keep referential integrity", () => {
  it("B13 deleting a linked question removes the stale reference; the scenario and its sources survive", () => {
    const [s] = deleteQuestion([sec()], "s1", "q2");
    expect(members(s)).toEqual(["q1"]); expect(s.scenarios![0].sources).toEqual([TEXT]);
    expect(ids(s)).toEqual(["q1", "q3", "q4"]);
  });
  it("B14 moving a linked question to another section removes it from the source section's scenarios; the target gets no membership", () => {
    const other: BuilderSection = { ...newSection({ id: "s2", title: "ب" }), questions: [q("z1")] };
    const [a, b] = moveQuestionToSection([sec(), other], "s1", "q1", "s2");
    expect(members(a)).toEqual(["q2"]);
    expect(b.questions.map(x => x.examQuestionId)).toEqual(["z1", "q1"]);
    expect(b.scenarios ?? []).toEqual([]);
  });
  it("B15 duplicating a linked question: the copy is NOT a member and is inserted after the group (contiguity kept)", () => {
    const [s] = duplicateQuestion([sec()], "s1", "q1");
    expect(members(s)).toEqual(["q1", "q2"]);
    expect(ids(s).slice(0, 2)).toEqual(["q1", "q2"]); expect(ids(s)[2]).toMatch(/^q-/); expect(ids(s).slice(3)).toEqual(["q3", "q4"]);
    expect(validateSectionScenarios(s).ok).toBe(true);
  });
  it("B16 bulk delete / bulk move keep integrity too", () => {
    const sections = [sec(), { ...newSection({ id: "s2" }), questions: [] }];
    const del = bulkDeleteQuestions(sections, new Set(["q1", "q3"]));
    expect(members(del[0])).toEqual(["q2"]);
    const mv = bulkMoveQuestions(sections, new Set(["q2"]), "s2");
    expect(members(mv[0])).toEqual(["q1"]); expect(mv[1].scenarios ?? []).toEqual([]);
    const same = bulkMoveQuestions(sections, new Set(["q1"]), "s1");                    // staying in its own section keeps membership
    expect(members(same[0])).toEqual(["q1", "q2"]); expect(ids(same[0])).toEqual(["q2", "q3", "q4", "q1"]);
    const dup = bulkDuplicateQuestions(sections, new Set(["q1"]));                      // the copy lands AFTER the group, never between members
    expect(ids(dup[0]).slice(0, 2)).toEqual(["q1", "q2"]); expect(ids(dup[0])[2]).toMatch(/^q-/); expect(validateSectionScenarios(dup[0]).ok).toBe(true);
    expect(structuredExamCopy({ examId: "e", title: "t", sections: [sec({ scenarios: [null as never, scn()] })] } as StructuredExam).sections[0].scenarios!.length).toBe(2);   // a null entry never crashes the copy
  });
  it("B17 changeQuestionType keeps membership (it is not on the question) and adds no scenario key to the node", () => {
    const changed = changeQuestionType(q("q1"), "shortAnswer");
    expect(changed.examQuestionId).toBe("q1");
    expect(Object.keys(changed)).not.toContain("scenarioId"); expect(Object.keys(changed)).not.toContain("scenario");
  });
  it("B18 structuredExamCopy regenerates scenario / source ids and REMAPS questionIds to the fresh question ids", () => {
    const copy = structuredExamCopy({ examId: "e", title: "t", sections: [sec()] } as StructuredExam);
    const s = copy.sections[0];
    const sc = s.scenarios![0];
    expect(sc.id).not.toBe("scn-1"); expect(sc.sources[0].id).not.toBe("src-1");
    expect(sc.questionIds).toEqual([s.questions[0].examQuestionId, s.questions[1].examQuestionId]);
    expect(sc.questionIds.every(id => id !== "q1" && id !== "q2")).toBe(true);
    expect(validateSectionScenarios(s).ok).toBe(true);
  });
  it("B19 saving keeps scenarios canonical (no stale duplicate elsewhere); a legacy exam has none", () => {
    const saved = toSavedStructuredExam({ examId: "e", title: "t", sections: [sec()] } as StructuredExam);
    expect(saved.sections[0].scenarios).toEqual([scn()]);
    expect("scenarios" in saved).toBe(false);
  });
});

describe("19G-B20 — import / export round-trip and strict rejection", () => {
  const examJson = (sectionOver: R = {}) => JSON.stringify({ examId: "EXAM-1", title: "امتحان", schemaVersion: 2, sections: [{ ...sec(), ...sectionOver }] });
  it("B20 export (saved JSON) → import yields the same canonical scenario semantics", () => {
    const r = parseStructuredExamJson(examJson(), "exam.json");
    expect(r.canOpen).toBe(true); expect(r.parseErrors).toEqual([]);
    const { instructions: _blank, ...canonical } = scn();   // the canonical copy drops a blank optional field
    void _blank;
    expect(r.exam!.sections[0].scenarios).toEqual([canonical]);
    expect(validateStructuredExam(r.exam!).filter(i => i.severity === "error")).toEqual([]);
    expect(r.stats.scenarios).toBe(1);
  });
  const rejected: [string, R, string][] = [
    ["unsupported scenario version", { scenarios: [scn({ version: 2 })] }, "SCENARIO_VERSION_UNSUPPORTED"],
    ["unsupported source version", { scenarios: [scn({ sources: [{ ...TEXT, version: 3 }] })] }, "SOURCE_VERSION_UNSUPPORTED"],
    ["unknown source kind", { scenarios: [scn({ sources: [{ id: "a", version: 1, kind: "pdf", url: "x" }] })] }, "SOURCE_KIND_UNSUPPORTED"],
    ["duplicate scenario id", { scenarios: [scn({ questionIds: ["q1"] }), scn({ questionIds: ["q2"] })] }, "SCENARIO_ID_DUPLICATE"],
    ["duplicate membership", { scenarios: [scn({ id: "a", questionIds: ["q1", "q2"] }), scn({ id: "b", questionIds: ["q2", "q3"] })] }, "SCENARIO_QUESTION_SHARED"],
    ["missing reference", { scenarios: [scn({ questionIds: ["q1", "ghost"] })] }, "SCENARIO_QUESTION_MISSING"],
    ["malformed source (private field)", { scenarios: [scn({ sources: [{ ...TEXT, answer: "x" }] })] }, "SOURCE_INVALID"],
    ["scenarios not an array", { scenarios: { a: 1 } }, "SCENARIOS_INVALID"]
  ];
  for (const [name, over, code] of rejected) it("B21 import rejects " + name + " (fatal parse error, cannot open)", () => {
    const r = parseStructuredExamJson(examJson(over), "exam.json");
    expect(r.canOpen).toBe(false);
    expect(r.parseErrors.map(e => e.code)).toContain(code);
  });
  it("B22 a cross-section reference is rejected at import", () => {
    const json = JSON.stringify({ examId: "E", title: "t", schemaVersion: 2, sections: [{ ...sec(), scenarios: [scn({ questionIds: ["q1", "z1"] })] }, { ...newSection({ id: "s2" }), questions: [q("z1")] }] });
    const r = parseStructuredExamJson(json, "exam.json");
    expect(r.canOpen).toBe(false); expect(r.parseErrors.map(e => e.code)).toContain("SCENARIO_QUESTION_CROSS_SECTION");
  });
  it("B23 presets never carry scenarios (structure templates only): a preset section with `scenarios` is a FORBIDDEN_FIELD", () => {
    const issues = validateAssessmentPreset({ schemaVersion: 1, presetId: "apr-1", title: "قالب", blueprint: {}, sections: [{ presetSectionId: "ps-1", title: "x", gradingPolicy: "all", scenarios: [] }] });
    expect(issues.some(i => i.code === "FORBIDDEN_FIELD" && /scenarios/.test(i.path ?? ""))).toBe(true);
  });
});
