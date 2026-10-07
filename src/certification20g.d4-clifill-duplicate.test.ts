import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { duplicateQuestion, duplicatePart, structuredExamCopy, cliPlaceholders, cloneQuestionWithNewIds } from "./examBuilderState";
import { validateStructuredExam } from "./examQuality";
import type { BuilderPart, BuilderQuestion, StructuredExam } from "./examTypes";

// Phase 20G — DEFECT D4 (fail-first on f16ac8f): duplicating a cliFill question (the Builder's «تكرار»), duplicating a cliFill compound part,
// or copying an exam that contains one gave every field a fresh id but left the `cli` template's [[fieldId]] placeholders pointing at the OLD
// ids: the copy failed finalization with CLI_PLACEHOLDER_NO_FIELD (one per blank) and its blanks no longer matched its answer fields — a
// question the teacher never edited became broken. Fixed: the clone remaps every placeholder to the field's new id (same order, same text).
const require_ = createRequire(import.meta.url);
const { gradeExam } = require_("../api/src/lib/assignment-grading.js");
const cli = (): BuilderQuestion => ({ examQuestionId: "c1", presentationType: "cliFill", text: "أكمل", marks: 4, cli: "R1(config)# interface g0/0.[[vlan]]\nR1(config-subif)# encapsulation dot1Q [[vlan]]\nR1(config-subif)# ip address [[ip]] 255.255.255.0", fields: [{ id: "vlan", label: "VLAN", correct: "20" }, { id: "ip", label: "IP", correct: "192.168.20.1" }] } as unknown as BuilderQuestion);
const exam = (q: BuilderQuestion = cli()): StructuredExam => ({ examId: "D4", title: "d4", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "s", gradingPolicy: "all", questions: [q] }] } as unknown as StructuredExam);
const errors = (e: StructuredExam) => validateStructuredExam(e).filter(i => i.severity === "error").map(i => i.code);

describe("20G D4 — cliFill placeholders follow their fields through duplicate / copy", () => {
  it("duplicateQuestion: the copy is finalizable, its placeholders name ITS fields (same order and multiplicity), and it grades like the original", () => {
    const sections = duplicateQuestion(exam().sections, "s1", "c1");
    const [orig, copy] = sections[0].questions as unknown as { examQuestionId: string; cli: string; fields: { id: string }[] }[];
    expect(errors({ ...exam(), sections })).toEqual([]);
    expect(cliPlaceholders(copy.cli)).toEqual([copy.fields[0].id, copy.fields[0].id, copy.fields[1].id]);
    expect(copy.cli.replace(/\[\[[^\]]+\]\]/g, "[[]]")).toBe(orig.cli.replace(/\[\[[^\]]+\]\]/g, "[[]]"));
    const answers = { [orig.examQuestionId]: { kind: "fields", values: { vlan: "20", ip: "192.168.20.1" } }, [copy.examQuestionId]: { kind: "fields", values: { [copy.fields[0].id]: "20", [copy.fields[1].id]: "192.168.20.1" } } };
    expect(gradeExam({ ...exam(), sections }, answers).questions.map((g: { score: number }) => g.score)).toEqual([4, 4]);
  });
  it("cloneQuestionWithNewIds and structuredExamCopy: same guarantee (the copy of a whole exam stays finalizable)", () => {
    const c = cloneQuestionWithNewIds(cli()) as unknown as { cli: string; fields: { id: string }[] };
    expect(cliPlaceholders(c.cli)).toEqual([c.fields[0].id, c.fields[0].id, c.fields[1].id]);
    expect(errors(structuredExamCopy(exam()))).toEqual([]);
  });
  it("a cliFill PART of a legacy compound: duplicatePart and the question clone remap the part's placeholders too", () => {
    const part = { id: "p1", label: "أ", type: "cliFill", text: "أكمل", marks: 2, cli: "Switch(config)# vlan [[v]]", fields: [{ id: "v", label: "VLAN", correct: "10" }] } as unknown as BuilderPart;
    const parts = duplicatePart([part], "p1") as unknown as { cli: string; fields: { id: string }[] }[];
    expect(cliPlaceholders(parts[1].cli)).toEqual([parts[1].fields[0].id]);
    const compound = { examQuestionId: "k1", presentationType: "compound", text: "مركّب", marks: 2, parts: [part] } as unknown as BuilderQuestion;
    const cloned = cloneQuestionWithNewIds(compound) as unknown as { parts: { cli: string; fields: { id: string }[] }[] };
    expect(cliPlaceholders(cloned.parts[0].cli)).toEqual([cloned.parts[0].fields[0].id]);
    expect(errors(exam(cloned as unknown as BuilderQuestion))).toEqual([]);
  });
});
