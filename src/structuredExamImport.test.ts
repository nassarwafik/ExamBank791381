import { describe, it, expect } from "vitest";
import { gradeExam } from "../api/src/lib/assignment-grading.js";
import { sanitizeExamForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { parseStructuredExamJson } from "./structuredExamImport";
import { toSavedStructuredExam } from "./examBuilderState";
import type { StructuredExam } from "./examTypes";

const twoSection = {
  examId: "791381-2026",
  title: "امتحان 791381",
  status: "final",
  sections: [
    {
      id: "core", title: "القسم الأول - الأساس", gradingPolicy: "capScore", maxMarks: 60, answerUnit: "question", stimuli: {},
      questions: [
        { examQuestionId: "q1", displayNumber: "1", presentationType: "multipleChoice", text: "أي عنوان خاص؟", marks: 3, options: [{ text: "8.8.8.8" }, { text: "172.16.5.10" }], answer: { correctOptionIndex: 1 } }
      ]
    },
    {
      id: "infra", title: "القسم الثاني", gradingPolicy: "firstNAnswered", maxMarks: 40, requiredAnswers: 8, answerUnit: "part", stimuli: {},
      questions: [
        { examQuestionId: "q25", displayNumber: "25", presentationType: "compound", text: "أجب", marks: 40, parts: [
          { id: "p1", label: "أ", type: "multipleChoice", text: "Link-State؟", marks: 5, options: [{ text: "RIP" }, { text: "OSPF" }], answer: { correctOptionIndex: 1 } }
        ] }
      ]
    }
  ]
};

// JSON 1
describe("JSON import", () => {
  it("JSON 1: imports a valid two-section structured exam", () => {
    const r = parseStructuredExamJson(JSON.stringify(twoSection));
    expect(r.canOpen).toBe(true);
    expect(r.exam!.sections).toHaveLength(2);
    expect(r.stats).toMatchObject({ sections: 2, questions: 2, parts: 1 });
    expect(r.parseErrors).toEqual([]);
    expect(r.sourceKind).toBe("json");
  });

  it("JSON 2: generates a fresh examId (never reuses the imported storage id)", () => {
    const r = parseStructuredExamJson(JSON.stringify(twoSection));
    expect(r.exam!.examId).not.toBe("791381-2026");
    expect((r.exam!.metadata as { import: { originalExamId: string } }).import.originalExamId).toBe("791381-2026");
  });

  it("JSON 3: an imported status:final becomes draft", () => {
    const r = parseStructuredExamJson(JSON.stringify(twoSection));
    expect(r.exam!.status).toBe("draft");
  });

  it("JSON 4: missing ids are generated", () => {
    const r = parseStructuredExamJson(JSON.stringify({ sections: [{ questions: [{ presentationType: "shortAnswer", text: "س", marks: 2 }] }] }));
    expect(r.exam!.sections[0].id).toBeTruthy();
    expect(r.exam!.sections[0].questions[0].examQuestionId).toBeTruthy();
    expect(r.generatedIds).toBeGreaterThanOrEqual(2);
  });

  it("JSON 5: displayNumber preserved but never used as identity", () => {
    const r = parseStructuredExamJson(JSON.stringify({ sections: [{ id: "s", questions: [{ displayNumber: "7", presentationType: "shortAnswer", text: "س", marks: 1 }] }] }));
    const q = r.exam!.sections[0].questions[0];
    expect(q.displayNumber).toBe("7");
    expect(q.examQuestionId).not.toBe("7");
  });

  it("JSON 6: a top-level questions[] is removed when sections[] exist", () => {
    const r = parseStructuredExamJson(JSON.stringify({ questions: [{ examQuestionId: "stale" }], sections: [{ id: "s", questions: [{ examQuestionId: "real", presentationType: "shortAnswer", text: "س", marks: 1 }] }] }));
    expect("questions" in r.exam!).toBe(false);
    expect(r.exam!.sections[0].questions[0].examQuestionId).toBe("real");
  });

  it("JSON 7: compound parts import with ids/marks/answers", () => {
    const r = parseStructuredExamJson(JSON.stringify(twoSection));
    const parts = r.exam!.sections[1].questions[0].parts!;
    expect(parts).toHaveLength(1);
    expect(parts[0].label).toBe("أ");
    expect(parts[0].marks).toBe(5);
  });

  it("JSON 8: tableFill with two answer cells in one row imports", () => {
    const exam = { sections: [{ id: "s", questions: [{ examQuestionId: "t", presentationType: "tableFill", text: "أكمل", marks: 2, tableHeaders: ["IP", "Net", "Host"], tableRows: [["192.168.1.10/24", "", ""]], fields: [{ id: "net", row: 0, column: 1, kind: "text", correct: "192.168.1.0" }, { id: "host", row: 0, column: 2, kind: "text", correct: "0.0.0.10" }] }] }] };
    const r = parseStructuredExamJson(JSON.stringify(exam));
    const fields = r.exam!.sections[0].questions[0].fields!;
    expect(fields.filter(f => f.row === 0)).toHaveLength(2);
    const g = gradeExam(r.exam, { [r.exam!.sections[0].questions[0].examQuestionId]: { kind: "fields", values: { net: "192.168.1.0", host: "0.0.0.10" } } });
    expect(g.questions[0].score).toBe(2);
  });

  it("JSON 9: CLI placeholders + fields import and grade", () => {
    const exam = { sections: [{ id: "s", questions: [{ examQuestionId: "c", presentationType: "cliFill", text: "أكمل", marks: 4, cli: "encapsulation dot1Q [[vlan]]\nip address [[ip]] 255.255.255.0", fields: [{ id: "vlan", correct: "20" }, { id: "ip", correct: "192.168.20.1" }] }] }] };
    const r = parseStructuredExamJson(JSON.stringify(exam));
    expect(r.canOpen).toBe(true);
    const g = gradeExam(r.exam, { c: { kind: "fields", values: { vlan: "20", ip: "192.168.20.1" } } });
    expect(g.questions[0].score).toBe(4);
  });

  it("JSON 10: stimulus + groupId preserved", () => {
    const exam = { sections: [{ id: "s", stimuli: { topo: { title: "المخطط", text: "اعتمد", image: { dataUrl: "data:image/png;base64,AAA" } } }, questions: [{ examQuestionId: "q", groupId: "topo", presentationType: "shortAnswer", text: "س", marks: 1 }] }] };
    const r = parseStructuredExamJson(JSON.stringify(exam));
    expect(Object.keys(r.exam!.sections[0].stimuli!)).toEqual(["topo"]);
    expect(r.exam!.sections[0].questions[0].groupId).toBe("topo");
    expect(r.stats.stimuli).toBe(1);
    expect(r.stats.images).toBe(1);
  });

  it("JSON 11: an unknown question type is a parse error (never silently shortAnswer)", () => {
    const r = parseStructuredExamJson(JSON.stringify({ sections: [{ id: "s", questions: [{ examQuestionId: "q", presentationType: "somethingElse", text: "س", marks: 1 }] }] }));
    expect(r.parseErrors.some(e => e.code === "UNSUPPORTED_QUESTION_TYPE")).toBe(true);
    expect(r.exam!.sections[0].questions[0].presentationType).toBe("somethingElse"); // kept, not guessed
    expect(r.canOpen).toBe(true); // still openable as a draft to fix
  });

  it("JSON 12: malformed JSON returns a clean error, no crash", () => {
    const r = parseStructuredExamJson("{ not json ");
    expect(r.exam).toBe(null);
    expect(r.canOpen).toBe(false);
    expect(r.parseErrors.some(e => e.code === "INVALID_JSON")).toBe(true);
  });

  it("type aliases normalize with a warning (mcq→multipleChoice, open→shortAnswer)", () => {
    const r = parseStructuredExamJson(JSON.stringify({ sections: [{ id: "s", questions: [{ examQuestionId: "a", presentationType: "mcq", text: "س", marks: 1, options: [{ text: "x" }, { text: "y" }], answer: { correctOptionIndex: 0 } }, { examQuestionId: "b", presentationType: "open", text: "ب", marks: 1 }] }] }));
    expect(r.exam!.sections[0].questions[0].presentationType).toBe("multipleChoice");
    expect(r.exam!.sections[0].questions[1].presentationType).toBe("shortAnswer");
    expect(r.parseWarnings.filter(w => w.code === "TYPE_ALIAS_NORMALIZED")).toHaveLength(2);
  });

  it("not-an-object / no-sections yields a fatal parse error", () => {
    expect(parseStructuredExamJson("[]").parseErrors.some(e => e.code === "NOT_AN_OBJECT")).toBe(true);
    expect(parseStructuredExamJson(JSON.stringify({ title: "x" })).parseErrors.some(e => e.code === "NO_SECTIONS")).toBe(true);
  });

  it("reuses examQuality validation (missing firstN required is a validation error, not a parse error)", () => {
    const r = parseStructuredExamJson(JSON.stringify({ sections: [{ id: "s", gradingPolicy: "firstNAnswered", maxMarks: 40, questions: [{ examQuestionId: "q", presentationType: "shortAnswer", text: "س", marks: 1 }] }] }));
    expect(r.parseErrors).toEqual([]);
    expect(r.validationErrors.some(i => i.code === "FIRSTN_NO_REQUIRED")).toBe(true);
    expect(r.canOpen).toBe(true); // opens as draft
  });

  it("END-TO-END: import → save → grade → sanitize (JSON)", () => {
    const r = parseStructuredExamJson(JSON.stringify(twoSection));
    const saved = toSavedStructuredExam(r.exam!);
    const reopened = JSON.parse(JSON.stringify(saved)) as StructuredExam;
    const g = gradeExam(reopened, { q1: { kind: "choice", index: 1 }, q25: { kind: "compound", parts: { p1: { kind: "choice", index: 1 } } } });
    expect(g.totalMarks).toBe(100);
    expect(g.score).toBeGreaterThan(0);
    const safe = JSON.stringify(sanitizeExamForStudent(reopened));
    expect(safe).not.toContain("correctOptionIndex");
  });
});
