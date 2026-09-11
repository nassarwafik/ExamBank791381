import { describe, it, expect } from "vitest";
import {
  normalizeExamStructure,
  distributePartMarks,
  isResponseAnswered,
  getAnswerUnits,
  selectGradedUnits,
  calculateSectionProgress,
  flattenQuestions,
  sectionCappedScore,
  sectionQuestionId,
  partLabel,
  effectiveMaxMarks,
  countExamQuestions
} from "./exam-structure.js";

describe("countExamQuestions (saved-exams list count for both shapes)", () => {
  it("sums section questions for a structured exam and counts questions[] for a legacy exam", () => {
    expect(countExamQuestions({ sections: [{ questions: [{}, {}, {}] }, { questions: [{}, {}, {}, {}, {}] }] })).toBe(8); // 3 + 5
    expect(countExamQuestions({ questions: [{}, {}] })).toBe(2);
    expect(countExamQuestions({})).toBe(0);
    expect(countExamQuestions(null)).toBe(0);
  });
});

describe("normalizeExamStructure", () => {
  it("wraps a legacy flat exam in a single implicit 'all' section", () => {
    const norm = normalizeExamStructure({ questions: [{ examQuestionId: "q1", marks: 3 }] });
    expect(norm.structured).toBe(false);
    expect(norm.sections).toHaveLength(1);
    expect(norm.sections[0].gradingPolicy).toBe("all");
    expect(norm.sections[0].maxMarks).toBe(null);
    expect(norm.sections[0].questions).toHaveLength(1);
  });

  it("passes through a structured exam and defaults unknown policies to 'all'", () => {
    const norm = normalizeExamStructure({
      sections: [
        { id: "s1", title: "أساس", maxMarks: 60, gradingPolicy: "capScore", questions: [] },
        { id: "s2", gradingPolicy: "bogus", questions: [] }
      ]
    });
    expect(norm.structured).toBe(true);
    expect(norm.sections[0].gradingPolicy).toBe("capScore");
    expect(norm.sections[0].maxMarks).toBe(60);
    expect(norm.sections[1].gradingPolicy).toBe("all");
  });
});

describe("distributePartMarks", () => {
  it("uses explicit part marks when all are supplied", () => {
    expect(distributePartMarks({ marks: 10, parts: [{ marks: 3 }, { marks: 7 }] })).toEqual([3, 7]);
  });
  it("splits question marks equally when no part marks are supplied", () => {
    expect(distributePartMarks({ marks: 5, parts: [{}, {}, {}, {}] })).toEqual([1.25, 1.25, 1.25, 1.25]);
  });
  it("honours explicit marks and splits the remainder among the rest", () => {
    expect(distributePartMarks({ marks: 10, parts: [{ marks: 4 }, {}, {}] })).toEqual([4, 3, 3]);
  });
});

describe("isResponseAnswered", () => {
  it("handles new fields and compound shapes", () => {
    expect(isResponseAnswered({ kind: "fields", values: { a: "", b: "x" } })).toBe(true);
    expect(isResponseAnswered({ kind: "fields", values: { a: "", b: false } })).toBe(false);
    expect(isResponseAnswered({ kind: "fields", values: { a: true } })).toBe(true);
    expect(isResponseAnswered({ kind: "compound", parts: { A: { kind: "choice", index: 1 } } })).toBe(true);
    expect(isResponseAnswered({ kind: "compound", parts: { A: { kind: "text", value: " " } } })).toBe(false);
  });
});

describe("getAnswerUnits + selectGradedUnits", () => {
  const partSection = {
    answerUnit: "part",
    gradingPolicy: "firstNAnswered",
    requiredAnswers: 2,
    questions: [
      {
        examQuestionId: "q1",
        parts: [{ id: "a" }, { id: "b" }, { id: "c" }]
      }
    ]
  };

  it("flattens compound parts into part-level units in display order", () => {
    const units = getAnswerUnits(partSection, {
      q1: { kind: "compound", parts: { a: { kind: "text", value: "x" }, c: { kind: "text", value: "z" } } }
    });
    expect(units.map(u => u.partId)).toEqual(["a", "b", "c"]);
    expect(units.map(u => u.answered)).toEqual([true, false, true]);
  });

  it("selects the first N ANSWERED units in display order (unanswered do not consume a slot)", () => {
    const answers = {
      q1: {
        kind: "compound",
        parts: { a: { kind: "text", value: "x" }, c: { kind: "text", value: "z" }, b: { kind: "text", value: "y" } }
      }
    };
    const { countedKeys } = selectGradedUnits(partSection, answers);
    // first two answered in DISPLAY order are a and b (c is display-3rd), so a + b are counted.
    expect([...countedKeys].sort()).toEqual(["q1::a", "q1::b"]);
  });
});

describe("calculateSectionProgress", () => {
  it("reports excess answers for firstNAnswered sections", () => {
    const section = {
      answerUnit: "question",
      gradingPolicy: "firstNAnswered",
      requiredAnswers: 2,
      questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }]
    };
    const p = calculateSectionProgress(section, {
      q1: { kind: "text", value: "a" },
      q2: { kind: "text", value: "b" },
      q3: { kind: "text", value: "c" }
    });
    expect(p).toMatchObject({ total: 3, answered: 3, required: 2, counted: 2, excess: 1 });
  });
});

describe("sectionQuestionId (section-scoped identity)", () => {
  it("scopes an unlabeled question to its structured section so two sections' number-1 questions differ", () => {
    const core = normalizeExamStructure({ sections: [{ id: "core", questions: [{ number: 1, text: "" }] }] }).sections[0];
    const spec = normalizeExamStructure({ sections: [{ id: "specialization", questions: [{ number: 1, text: "" }] }] }).sections[0];
    expect(sectionQuestionId(core, core.questions[0], 0)).toBe("core::q1");
    expect(sectionQuestionId(spec, spec.questions[0], 0)).toBe("specialization::q1");
    expect(sectionQuestionId(core, core.questions[0], 0)).not.toBe(sectionQuestionId(spec, spec.questions[0], 0));
  });
  it("preserves an explicit examQuestionId/id verbatim even inside a structured section", () => {
    const s = normalizeExamStructure({ sections: [{ id: "core", questions: [{ examQuestionId: "core-q7", text: "" }] }] }).sections[0];
    expect(sectionQuestionId(s, s.questions[0], 0)).toBe("core-q7");
  });
  it("keeps the legacy flat-exam fallback (number, then 1-based index) unchanged", () => {
    const legacy = normalizeExamStructure({ questions: [{ number: 4, text: "" }, { text: "" }] }).sections[0];
    expect(legacy.id).toBe("__default__");
    expect(sectionQuestionId(legacy, legacy.questions[0], 0)).toBe("4");
    expect(sectionQuestionId(legacy, legacy.questions[1], 1)).toBe("2");
  });
});

describe("partLabel", () => {
  it("generates Arabic ordinals by order and preserves explicit labels", () => {
    expect([0, 1, 2, 3, 4].map(i => partLabel({}, i))).toEqual(["أ", "ب", "ج", "د", "هـ"]);
    expect(partLabel({ label: "س1" }, 0)).toBe("س1");
    expect(partLabel({}, 99)).toBe("100");
  });
});

describe("effectiveMaxMarks", () => {
  it("uses countedMaxMarks when present (0 for an ignored excess answer)", () => {
    expect(effectiveMaxMarks({ maxMarks: 4, countedMaxMarks: 0 })).toBe(0);
    expect(effectiveMaxMarks({ maxMarks: 20, countedMaxMarks: 10 })).toBe(10);
  });
  it("falls back to maxMarks for legacy grades with no countedMaxMarks", () => {
    expect(effectiveMaxMarks({ maxMarks: 5 })).toBe(5);
  });
});

describe("normalizeExamStructure - stimuli passthrough", () => {
  it("carries a section's shared-stimulus lookup through normalization", () => {
    const norm = normalizeExamStructure({ sections: [{ id: "s", stimuli: { g1: { title: "الطوبولوجيا", text: "..." } }, questions: [] }] });
    expect(norm.sections[0].stimuli).toEqual({ g1: { title: "الطوبولوجيا", text: "..." } });
    expect(normalizeExamStructure({ questions: [] }).sections[0].stimuli).toBe(null);
  });
});

// TEST 11: manual-review reconciliation still honours a section cap after a teacher override — the
// same helper assignment-review.js uses when rebuilding a graded attempt.
describe("sectionCappedScore (manual-review reconciliation)", () => {
  const sections = [
    { id: "core", gradingPolicy: "capScore", maxMarks: 60, questionIds: ["q1", "q2", "q3"] },
    { id: "open", gradingPolicy: "all", maxMarks: null, questionIds: ["q4"] }
  ];
  it("caps a capScore section even when overrides push the raw sum past the cap", () => {
    const scores = { q1: 30, q2: 30, q3: 30, q4: 8 }; // core raw = 90 -> capped 60
    const total = sectionCappedScore(sections, id => scores[id]);
    expect(total).toBe(68); // 60 (capped) + 8
  });
  it("leaves an uncapped 'all' section summed as-is", () => {
    const scores = { q1: 10, q2: 10, q3: 10, q4: 8 };
    expect(sectionCappedScore(sections, id => scores[id])).toBe(38);
  });
});

describe("flattenQuestions", () => {
  it("returns every question across sections with a global display number", () => {
    const flat = flattenQuestions({
      sections: [
        { id: "s1", questions: [{ id: "q1" }, { id: "q2" }] },
        { id: "s2", questions: [{ id: "q3" }] }
      ]
    });
    expect(flat.map(f => f.displayNumber)).toEqual([1, 2, 3]);
    expect(flat.map(f => f.sectionId)).toEqual(["s1", "s1", "s2"]);
  });
});
