import { describe, it, expect } from "vitest";
import { cloneQuestionWithNewIds, duplicateQuestion, moveQuestionToSection, legacyToStructured, toSavedStructuredExam, updateQuestion } from "./examBuilderState";
import { bulkMoveQuestions, bulkDuplicateQuestions, bulkSetMarks, bankExamQuestionToBuilderQuestion } from "./structuredExamProductivity";
import { examDeepEqual, openExamHistory, updateExamHistory } from "./examHistory";
import { writeExamBackup, readExamBackup } from "./examAutosave";
import { effectiveAssessmentMeta, withBlueprint } from "./assessmentBlueprint";
import { networkingBlueprint, chemistryBlueprint } from "./assessmentBlueprintFixtures";
import { statefulDescriptor } from "./assessmentActivityFixtures";
import type { StructuredExam, BuilderQuestion } from "./examTypes";
// @ts-expect-error — CommonJS server module without type declarations (the REAL save-path cleaner).
import { cleanExam } from "../api/src/functions/save-exam-artifact.js";

// Phase 13C-A — F3 persistence: blueprint (exam level), assessmentMeta + activity (question level) and stimulus activity
// (section level) survive every existing round trip WITHOUT touching bank provenance or image identity, and an exam
// without any of them is not changed by opening / saving.

const meta = { primaryTopicId: "SUBNET_CIDR", secondaryTopicIds: ["OSI_TCPIP"], objectiveIds: ["obj-subnet"], difficulty: 3, cognitiveLevel: "apply", capabilities: ["cli"] };
const bankQ = (): BuilderQuestion => ({
  examQuestionId: "q-b", presentationType: "fillBlank", text: "أكمل", marks: 2, fields: [{ id: "f1", label: "الفراغ", correct: "x" }], answer: { mode: "exactSequence", values: ["x"] },
  image: { exists: true, visible: true, assets: [{ id: "img-2", origin: "bank", blobName: "bank/q2.png", contentType: "image/png" }] },
  origin: "bank", bankQuestionId: "BANK-2", sourceId: "official", topic: "SUBNET_CIDR", secondaryTopics: ["DHCP"], difficulty: 4, hasCLI: true, assessmentMeta: meta, activity: statefulDescriptor
} as unknown as BuilderQuestion);
const makeExam = (): StructuredExam => ({
  examId: "e1", title: "t", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T00:00:00.000Z", blueprint: networkingBlueprint,
  sections: [
    { id: "s1", title: "A", gradingPolicy: "all", stimuli: { g1: { title: "مشترك", text: "نص", activity: { ...statefulDescriptor, id: "act-stim" } } }, questions: [bankQ(), { examQuestionId: "q-plain", presentationType: "shortAnswer", text: "عادي", marks: 1, groupId: "g1", answer: { text: "y" } }] },
    { id: "s2", title: "B", gradingPolicy: "all", stimuli: {}, questions: [] }
  ]
} as StructuredExam);
const bq = (e: StructuredExam, sec = 0, i = 0) => e.sections[sec].questions[i] as BuilderQuestion & Record<string, unknown>;

describe("F3 — persisted assessmentMeta / activity / blueprint", () => {
  it("M6 — saved-exam round trip (toSavedStructuredExam → cleanExam → JSON) keeps blueprint, assessmentMeta, question activity and stimulus activity; no top-level questions[]", () => {
    const saved = JSON.parse(JSON.stringify(cleanExam(toSavedStructuredExam(makeExam()))));
    expect(saved.blueprint).toEqual(networkingBlueprint);
    expect(bq(saved).assessmentMeta).toEqual(meta);
    expect(bq(saved).activity).toEqual(statefulDescriptor);
    expect(saved.sections[0].stimuli.g1.activity).toMatchObject({ id: "act-stim", key: "demo-stateful" });
    expect(saved).not.toHaveProperty("questions");
    expect(bq(saved)).toMatchObject({ bankQuestionId: "BANK-2", sourceId: "official", topic: "SUBNET_CIDR", difficulty: 4 });
    expect(bq(saved).image).toEqual({ exists: true, visible: true, assets: [{ id: "img-2", origin: "bank", blobName: "bank/q2.png", contentType: "image/png" }] });
  });
  it("M7 — duplicate / clone keeps assessmentMeta and activity while regenerating question / field ids", () => {
    const copy = cloneQuestionWithNewIds(bankQ());
    expect(copy.examQuestionId).not.toBe("q-b"); expect(copy.fields![0].id).not.toBe("f1");
    expect((copy as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
    expect((copy as unknown as Record<string, unknown>).activity).toEqual(statefulDescriptor);
    const dup = duplicateQuestion(makeExam().sections, "s1", "q-b");
    expect((dup[0].questions[1] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
    const bulk = bulkDuplicateQuestions(makeExam().sections, ["q-b"]);
    expect((bulk[0].questions[1] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
  });
  it("move / bulk move / bulk marks / legacyToStructured / updateQuestion keep metadata and provenance", () => {
    const moved = moveQuestionToSection(makeExam().sections, "s1", "q-b", "s2");
    expect((moved[1].questions[0] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
    const bulkMoved = bulkMoveQuestions(makeExam().sections, ["q-b", "q-plain"], "s2");
    expect(bulkMoved[1].questions.map(q => (q as unknown as Record<string, unknown>).assessmentMeta)).toEqual([meta, undefined]);
    const marked = bulkSetMarks(makeExam().sections, ["q-b"], 7);
    expect(marked[0].questions[0].marks).toBe(7); expect((marked[0].questions[0] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
    const legacy = legacyToStructured({ examId: "L", title: "قديم", blueprint: chemistryBlueprint, questions: [{ examQuestionId: "l1", presentationType: "shortAnswer", text: "x", marks: 1, assessmentMeta: meta }] });
    expect(legacy.blueprint).toEqual(chemistryBlueprint); expect((legacy.sections[0].questions[0] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
    const patched = updateQuestion(makeExam().sections, "s1", "q-b", { text: "جديد" });
    expect((patched[0].questions[0] as unknown as Record<string, unknown>).assessmentMeta).toEqual(meta);
  });
  it("bank insertion keeps provenance and yields effective metadata from bank evidence; explicit teacher classification then becomes authoritative", () => {
    const canonical = { examQuestionId: "", origin: "bank", bankQuestionId: "BANK-9", sourceId: "official", presentationType: "multipleChoice", text: "س", marks: 0, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, topic: "IP_ADDRESSING", secondaryTopics: ["SUBNET_CIDR"], difficulty: 2, hasCLI: false, requiresCalculation: true, image: { exists: false, visible: false, assets: [] } };
    const inserted = bankExamQuestionToBuilderQuestion(canonical as never, 3);
    const eff = effectiveAssessmentMeta(inserted, networkingBlueprint);
    expect(eff).toMatchObject({ primaryTopicId: "IP_ADDRESSING", secondaryTopicIds: ["SUBNET_CIDR"], difficulty: 2, capabilities: ["calculation"], unmappedBankTopics: [] });
    expect((inserted as unknown as Record<string, unknown>).bankQuestionId).toBe("BANK-9");
    const classifiedQ = { ...inserted, assessmentMeta: { primaryTopicId: "OSI_TCPIP" } } as BuilderQuestion;
    expect(effectiveAssessmentMeta(classifiedQ, networkingBlueprint).primaryTopicId).toBe("OSI_TCPIP");
    expect((classifiedQ as unknown as Record<string, unknown>).topic).toBe("IP_ADDRESSING");                 // bank evidence untouched
  });
  it("history: a blueprint edit is ONE ordinary entry and undo restores the exact previous exam; an untouched exam is not dirty", () => {
    const e = makeExam();
    const h0 = openExamHistory(e, "saved");
    const h1 = updateExamHistory(h0, prev => withBlueprint(prev, bp => ({ ...bp, subject: { id: "physics", label: "الفيزياء" } })));
    expect(h1.past).toHaveLength(1); expect(h1.present?.blueprint?.subject.id).toBe("physics");
    expect(examDeepEqual(h1.past[0], e)).toBe(true);
    const noop = updateExamHistory(h1, prev => withBlueprint(prev, bp => ({ ...bp })));
    expect(noop).toBe(h1);                                                                                  // structurally equal → no entry
    const legacy: StructuredExam = { ...makeExam(), blueprint: undefined };
    expect(updateExamHistory(openExamHistory(legacy, "saved"), prev => prev)).toEqual(openExamHistory(legacy, "saved"));
    expect(legacy.blueprint).toBeUndefined();
  });
  it("autosave backup round trip keeps the blueprint and activity descriptors", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
    expect(writeExamBackup(storage, "t1", makeExam(), "2026-03-01T10:00:00.000Z")).toBe(true);
    const back = readExamBackup(storage, "t1", "e1");
    expect(back).toBeTruthy();
    expect(back!.exam.blueprint).toEqual(networkingBlueprint);
    expect((back!.exam.sections[0].questions[0] as unknown as Record<string, unknown>).activity).toEqual(statefulDescriptor);
  });
});
