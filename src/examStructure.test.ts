import { describe, it, expect } from "vitest";
import {
  normalizeExamStructure,
  distributePartMarks,
  selectGradedUnits,
  calculateSectionProgress,
  getAnswerUnits,
  sectionQuestionId,
  partLabel
} from "./examStructure";
import { optionsFor } from "./StudentQuestionCard";
import type { Answer } from "./StudentQuestionCard";

describe("sectionQuestionId (frontend mirror)", () => {
  it("scopes unlabeled questions per structured section and keeps two number-1 questions distinct", () => {
    const core = normalizeExamStructure({ sections: [{ id: "core", questions: [{ number: 1, text: "", marks: 3 }] }] }).sections[0];
    const spec = normalizeExamStructure({ sections: [{ id: "specialization", questions: [{ number: 1, text: "", marks: 3 }] }] }).sections[0];
    expect(sectionQuestionId(core, core.questions[0], 0)).toBe("core::q1");
    expect(sectionQuestionId(spec, spec.questions[0], 0)).toBe("specialization::q1");
  });
  it("preserves explicit ids and legacy flat fallback", () => {
    const s = normalizeExamStructure({ sections: [{ id: "core", questions: [{ examQuestionId: "x1", text: "", marks: 1 }] }] }).sections[0];
    expect(sectionQuestionId(s, s.questions[0], 0)).toBe("x1");
    const legacy = normalizeExamStructure({ questions: [{ text: "", marks: 1 }] }).sections[0];
    expect(sectionQuestionId(legacy, legacy.questions[0], 0)).toBe("1");
  });
});

describe("partLabel (frontend mirror)", () => {
  it("orders أ ب ج … and preserves explicit labels", () => {
    expect([0, 1, 2].map(i => partLabel({ id: "p", type: "x" }, i))).toEqual(["أ", "ب", "ج"]);
    expect(partLabel({ id: "p", type: "x", label: "خاص" }, 5)).toBe("خاص");
  });
});

describe("optionsFor (trueFalse default options)", () => {
  it("returns صحيح/غير صحيح for a trueFalse with no options and passes stored options through", () => {
    expect(optionsFor({ presentationType: "trueFalse" }).map(o => o.text)).toEqual(["صحيح", "غير صحيح"]);
    expect(optionsFor({ presentationType: "trueFalse", options: [{ text: "نعم" }] }).map(o => o.text)).toEqual(["نعم"]);
    expect(optionsFor({ presentationType: "multipleChoice", options: [{ text: "A" }] }).map(o => o.text)).toEqual(["A"]);
  });
});

// Front-end mirror of api/src/lib/exam-structure.test.js. Both must agree so the live progress and
// the official server score never diverge.

describe("normalizeExamStructure (frontend)", () => {
  it("wraps a legacy flat exam in one implicit 'all' section (structured=false)", () => {
    const norm = normalizeExamStructure({ questions: [{ examQuestionId: "q1", text: "x", marks: 3 }] });
    expect(norm.structured).toBe(false);
    expect(norm.sections).toHaveLength(1);
    expect(norm.sections[0].gradingPolicy).toBe("all");
    expect(norm.sections[0].questions).toHaveLength(1);
  });

  it("passes through structured sections and clamps unknown policies to 'all'", () => {
    const norm = normalizeExamStructure({
      sections: [
        { id: "s1", title: "أساس", maxMarks: 60, gradingPolicy: "capScore", questions: [] },
        { id: "s2", gradingPolicy: "nope" as unknown as "all", questions: [] }
      ]
    });
    expect(norm.structured).toBe(true);
    expect(norm.sections[0].gradingPolicy).toBe("capScore");
    expect(norm.sections[1].gradingPolicy).toBe("all");
  });
});

describe("distributePartMarks (frontend)", () => {
  it("splits equally with no explicit marks and preserves floating-point weights", () => {
    expect(distributePartMarks({ text: "", marks: 5, parts: [{ id: "a", type: "x" }, { id: "b", type: "x" }, { id: "c", type: "x" }, { id: "d", type: "x" }] })).toEqual([1.25, 1.25, 1.25, 1.25]);
  });
});

describe("selectGradedUnits (frontend)", () => {
  it("question level: first N answered in display order, excess ignored, gaps skipped", () => {
    const section = normalizeExamStructure({
      sections: [
        {
          id: "s",
          gradingPolicy: "firstNAnswered",
          requiredAnswers: 2,
          answerUnit: "question",
          questions: [
            { examQuestionId: "q1", text: "", marks: 1 },
            { examQuestionId: "q2", text: "", marks: 1 },
            { examQuestionId: "q3", text: "", marks: 1 }
          ]
        }
      ]
    }).sections[0];
    const answers: Record<string, Answer> = {
      q1: { kind: "text", value: "a" },
      q3: { kind: "text", value: "c" }
    };
    const { countedKeys } = selectGradedUnits(section, answers);
    expect([...countedKeys].sort()).toEqual(["q1", "q3"]);
  });

  it("part level: first N answered PARTS across a compound question in display order", () => {
    const section = normalizeExamStructure({
      sections: [
        {
          id: "s",
          gradingPolicy: "firstNAnswered",
          requiredAnswers: 2,
          answerUnit: "part",
          questions: [{ examQuestionId: "q25", text: "", marks: 15, parts: [{ id: "a", type: "x" }, { id: "b", type: "x" }, { id: "c", type: "x" }] }]
        }
      ]
    }).sections[0];
    const answers: Record<string, Answer> = {
      q25: { kind: "compound", parts: { a: { kind: "text", value: "x" }, c: { kind: "text", value: "z" }, b: { kind: "text", value: "y" } } }
    };
    const { countedKeys } = selectGradedUnits(section, answers);
    expect([...countedKeys].sort()).toEqual(["q25::a", "q25::b"]);
  });
});

describe("calculateSectionProgress (frontend)", () => {
  it("reports required/counted/excess for firstNAnswered", () => {
    const section = normalizeExamStructure({
      sections: [{ id: "s", gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "question", questions: [{ examQuestionId: "q1", text: "", marks: 1 }, { examQuestionId: "q2", text: "", marks: 1 }, { examQuestionId: "q3", text: "", marks: 1 }] }]
    }).sections[0];
    const p = calculateSectionProgress(section, { q1: { kind: "text", value: "a" }, q2: { kind: "text", value: "b" }, q3: { kind: "text", value: "c" } });
    expect(p).toMatchObject({ total: 3, answered: 3, required: 2, counted: 2, excess: 1 });
  });
});

// TEST 10 (draft save/reload for the new answer shapes): a serialized fields/compound answer must
// survive JSON round-trip and still read as "answered" by the same helper the progress bar uses.
describe("draft round-trip for new answer shapes", () => {
  it("fields and compound answers reload and count as answered after JSON serialization", () => {
    const section = normalizeExamStructure({
      sections: [{ id: "s", gradingPolicy: "all", answerUnit: "question", questions: [{ examQuestionId: "qf", text: "", marks: 3, presentationType: "multiTrueFalse", fields: [{ id: "s1" }, { id: "s2" }] }, { examQuestionId: "qc", text: "", marks: 4, parts: [{ id: "a", type: "multipleChoice" }] }] }]
    }).sections[0];
    const draft: Record<string, Answer> = {
      qf: { kind: "fields", values: { s1: "true", s2: "false" } },
      qc: { kind: "compound", parts: { a: { kind: "choice", index: 1 } } }
    };
    const reloaded = JSON.parse(JSON.stringify(draft)) as Record<string, Answer>;
    const units = getAnswerUnits(section, reloaded);
    expect(units.every(u => u.answered)).toBe(true);
  });
});
