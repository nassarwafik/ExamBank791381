import { describe, it, expect } from "vitest";
import { gradeExam } from "./assignment-grading.js";

describe("gradeExam", () => {
  it("grades a correct multiple-choice answer as full marks", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 10,
          presentationType: "multiplechoice",
          options: [{ text: "A" }, { text: "B" }],
          answer: { correctOptionIndex: 1 }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "choice", index: 1 } });
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].score).toBe(10);
    expect(result.score).toBe(10);
    expect(result.totalMarks).toBe(10);
    expect(result.percentage).toBe(100);
    expect(result.finalized).toBe(true);
  });

  it("grades a wrong multiple-choice answer as zero", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 10,
          presentationType: "multiplechoice",
          options: [{ text: "A" }, { text: "B" }],
          answer: { correctOptionIndex: 1 }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "choice", index: 0 } });
    expect(result.questions[0].correct).toBe(false);
    expect(result.score).toBe(0);
  });

  it("gives partial credit for a partially correct exact-sequence answer", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 4,
          answer: { mode: "exactSequence", values: ["a", "b", "c", "d"] }
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["a", "b", "x", "x"] } });
    expect(result.questions[0].score).toBeCloseTo(2, 5);
    expect(result.questions[0].correct).toBe(false);
  });

  it("marks an exact-text answer as needing manual review when wrong", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 5, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "text", value: "London" } });
    expect(result.questions[0].correct).toBe(false);
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.finalized).toBe(false);
    expect(result.manualReviewMarks).toBe(5);
  });

  it("matches text answers case-insensitively and ignoring extra whitespace", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 5, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "text", value: "  paris  " } });
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].manualReview).toBe(false);
  });

  it("aggregates totals correctly across multiple questions", () => {
    const exam = {
      questions: [
        { examQuestionId: "q1", marks: 10, presentationType: "multiplechoice", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } },
        { examQuestionId: "q2", marks: 10, answer: { text: "Paris" } }
      ]
    };
    const result = gradeExam(exam, {
      q1: { kind: "choice", index: 0 },
      q2: { kind: "text", value: "Paris" }
    });
    expect(result.score).toBe(20);
    expect(result.totalMarks).toBe(20);
    expect(result.percentage).toBe(100);
    expect(result.finalized).toBe(true);
  });

  it("falls back to manual review when a question type is unrecognized", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 5 }] };
    const result = gradeExam(exam, { q1: {} });
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.questions[0].score).toBe(0);
  });
});

// Table questions are graded purely by response.kind==="table" plus a "rowLabel=value;..." pairMap
// in answer.text - these tests confirm that a per-row dropdown's plain string value (exactly what
// StudentExamPage.tsx's new <select> sends via setTable) grades correctly with zero changes to this
// file, including the two new conventions introduced for the dropdown feature: a shared word/value
// set per row, and a genuinely boolean row using literal "true"/"false" strings.
describe("gradeExam - table questions with dropdown-sourced answers", () => {
  const text =
    "صنّف صلاحية العناوين التالية:\n" +
    "| العنوان | الحالة |\n" +
    "| --- | --- |\n" +
    "| 192.168.1.10 | |\n" +
    "| 169.254.10.20 | |";

  it("gives full marks when every row's selected option matches the pairMap answer", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["صالح", "غير صالح"] } });
    expect(result.questions[0].score).toBe(4);
    expect(result.questions[0].correct).toBe(true);
    expect(result.questions[0].manualReview).toBe(false);
  });

  it("gives partial credit per row when only some dropdown selections are correct", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["صالح", "صالح"] } });
    expect(result.questions[0].score).toBe(2);
  });

  it("grades a genuinely boolean row using the literal true/false strings the boolean <select> submits", () => {
    const boolText = "حدد صحة كل عبارة:\n| العبارة | الحكم |\n| --- | --- |\n| DHCP يعمل على منفذ 67 | |\n| Trunk ينقل VLAN واحد فقط | |";
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, text: boolText, answer: { text: "DHCP يعمل على منفذ 67=true;Trunk ينقل VLAN واحد فقط=false" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["true", "false"] } });
    expect(result.questions[0].score).toBe(2);
    expect(result.questions[0].correct).toBe(true);
  });

  it("still needs manual review when the table can't be parsed or no answer was submitted", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, text, answer: { text: "192.168.1.10=صالح;169.254.10.20=غير صالح" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: [] } });
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.questions[0].score).toBe(0);
  });

  it("legacy checkbox-style table (plain membership answer.text, no '=' pairs) keeps working exactly as before", () => {
    const checkboxText = "ضع علامة أمام الشبكات الخاصة:\n| العنوان | خاص؟ |\n| --- | --- |\n| 192.168.1.10 | |\n| 8.8.8.8 | |";
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, text: checkboxText, answer: { text: "192.168.1.10" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: [true, false] } });
    expect(result.questions[0].score).toBe(2);
  });
});

// The whole premise of adding "matching"/"ordering" as new presentationType values is that
// grading needs ZERO changes, because gradeQuestion never checks presentationType for anything
// other than multipleChoice - it dispatches purely on answer.mode/response.kind. These tests are
// the regression proof: a "matching" question is graded via the exact same table/pairMap path a
// table question already uses, and an "ordering" question via the exact same exactSequence path a
// fillBlank/wordBank question already uses.
describe("gradeExam - matching (طابق) questions reuse the existing table/pairMap grading untouched", () => {
  const text = "طابق كل بروتوكول بالطبقة الصحيحة:\n| البروتوكول | الطبقة |\n| --- | --- |\n| HTTP | |\n| IP | |";

  it("grades a fully correct matching submission as full marks", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, presentationType: "matching", text, answer: { text: "HTTP=طبقة التطبيقات;IP=طبقة الشبكة" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["طبقة التطبيقات", "طبقة الشبكة"] } });
    expect(result.questions[0].score).toBe(4);
    expect(result.questions[0].correct).toBe(true);
  });

  it("gives partial credit for a partially correct matching submission", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 4, presentationType: "matching", text, answer: { text: "HTTP=طبقة التطبيقات;IP=طبقة الشبكة" } }] };
    const result = gradeExam(exam, { q1: { kind: "table", values: ["طبقة التطبيقات", "طبقة التطبيقات"] } });
    expect(result.questions[0].score).toBe(2);
  });
});

describe("gradeExam - ordering (رتّب) questions reuse the existing exactSequence grading untouched", () => {
  it("grades a fully correct ordering submission as full marks", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 3, presentationType: "ordering", answer: { mode: "exactSequence", values: ["2", "1", "3"] } }] };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["2", "1", "3"] } });
    expect(result.questions[0].score).toBe(3);
    expect(result.questions[0].correct).toBe(true);
  });

  it("gives partial credit for a partially correct ordering submission", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 3, presentationType: "ordering", answer: { mode: "exactSequence", values: ["2", "1", "3"] } }] };
    const result = gradeExam(exam, { q1: { kind: "sequence", values: ["2", "1", "1"] } });
    expect(result.questions[0].score).toBeCloseTo(2, 5);
    expect(result.questions[0].correct).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structured exam engine: sections (capScore / firstNAnswered), compound
// questions, generalized fields, partial credit. Legacy tests above prove the
// flat-exam path is unchanged; these prove the new engine on top of it.
// ---------------------------------------------------------------------------

function mcq(id, correctIndex, marks = 3) {
  return { examQuestionId: id, marks, presentationType: "multiplechoice", options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer: { correctOptionIndex: correctIndex } };
}
function mcqAnswer(index) {
  return { kind: "choice", index };
}

describe("gradeExam - capScore section (2026 core: 24x3, cap 60)", () => {
  it("caps a section that would otherwise exceed the cap (21 correct x3 = 63 => 60)", () => {
    const questions = Array.from({ length: 24 }, (_, i) => mcq("q" + i, 0));
    const exam = { sections: [{ id: "core", title: "أساس", maxMarks: 60, gradingPolicy: "capScore", questions }] };
    const answers = {};
    for (let i = 0; i < 21; i++) answers["q" + i] = mcqAnswer(0); // 21 correct, 3 wrong-by-omission
    const result = gradeExam(exam, answers);
    expect(result.score).toBe(60);
    expect(result.totalMarks).toBe(60);
    expect(result.sections[0].score).toBe(60);
  });

  it("gives partial (uncapped) total with partial credit contributing (19x3 + 1.5 = 58.5)", () => {
    // 19 MCQ fully correct + one fields question worth 3 earning 1.5 (half its blanks).
    const questions = Array.from({ length: 19 }, (_, i) => mcq("q" + i, 0));
    questions.push({
      examQuestionId: "qf",
      marks: 3,
      presentationType: "tableFill",
      fields: [{ id: "f1", correct: "x" }, { id: "f2", correct: "y" }]
    });
    const exam = { sections: [{ id: "core", maxMarks: 60, gradingPolicy: "capScore", questions }] };
    const answers = {};
    for (let i = 0; i < 19; i++) answers["q" + i] = mcqAnswer(0);
    answers["qf"] = { kind: "fields", values: { f1: "x", f2: "WRONG" } }; // 1 of 2 blanks => 1.5
    const result = gradeExam(exam, answers);
    expect(result.score).toBeCloseTo(58.5, 5);
    expect(result.totalMarks).toBe(60);
  });
});

describe("gradeExam - firstNAnswered at question level", () => {
  it("grades only the first N answered questions in display order; excess stays saved but scores 0", () => {
    const questions = "ABCDEFGHI".split("").map((c, i) => mcq(c, 0, 4));
    const exam = { sections: [{ id: "net", maxMarks: 40, gradingPolicy: "firstNAnswered", requiredAnswers: 8, answerUnit: "question", questions }] };
    const answers = {};
    "ABCDEFGHI".split("").forEach(c => (answers[c] = mcqAnswer(0))); // all 9 answered, all correct
    const result = gradeExam(exam, answers);
    expect(result.score).toBe(32); // first 8 x 4 = 32 (cap of section maxMarks 40 not reached)
    expect(result.totalMarks).toBe(40);
    const ignored = result.questions.filter(q => q.ignored).map(q => q.questionId);
    expect(ignored).toEqual(["I"]); // the 9th answered (display order) is excess
    expect(result.questions.find(q => q.questionId === "I").score).toBe(0);
  });
});

describe("gradeExam - firstNAnswered at PART level", () => {
  it("grades the first N answered parts (display order) of a compound question", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({
      id: "p" + i,
      type: "multipleChoice",
      marks: 5,
      options: [{ text: "A" }, { text: "B" }],
      answer: { correctOptionIndex: 0 }
    }));
    const exam = { sections: [{ id: "net", maxMarks: 40, gradingPolicy: "firstNAnswered", requiredAnswers: 8, answerUnit: "part", questions: [{ examQuestionId: "q25", marks: 60, parts }] }] };
    // answer 9 parts (p0..p8) all correct
    const partAnswers = {};
    for (let i = 0; i < 9; i++) partAnswers["p" + i] = { kind: "choice", index: 0 };
    const result = gradeExam(exam, { q25: { kind: "compound", parts: partAnswers } });
    expect(result.score).toBe(40); // first 8 answered parts x 5 = 40
    expect(result.totalMarks).toBe(40);
    const q = result.questions[0];
    const counted = q.parts.filter(p => p.counted).map(p => p.partId);
    expect(counted).toEqual(["p0", "p1", "p2", "p3", "p4", "p5", "p6", "p7"]);
    expect(q.parts.find(p => p.partId === "p8").ignored).toBe(true);
  });
});

describe("gradeExam - multiTrueFalse partial credit", () => {
  it("gives 2/3 when 2 of 3 statements are correct", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 3,
          presentationType: "multiTrueFalse",
          fields: [
            { id: "s1", correct: true },
            { id: "s2", correct: false },
            { id: "s3", correct: true }
          ]
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "fields", values: { s1: true, s2: true, s3: true } } });
    expect(result.questions[0].score).toBeCloseTo(2, 5);
    expect(result.questions[0].correct).toBe(false);
    expect(result.questions[0].manualReview).toBe(false);
  });
});

describe("gradeExam - generalized table with two editable cells in one row", () => {
  it("grades each cell independently and gives per-cell partial credit", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 2,
          presentationType: "tableFill",
          fields: [
            { id: "r0-net", row: 0, column: 1, correct: "192.168.1.0" },
            { id: "r0-host", row: 0, column: 2, correct: "0.0.0.10" }
          ]
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "fields", values: { "r0-net": "192.168.1.0", "r0-host": "WRONG" } } });
    expect(result.questions[0].score).toBe(1);
  });
});

describe("gradeExam - CLI fill with several blanks", () => {
  it("splits marks equally across blanks (4 blanks over 5 marks => 1.25 each)", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q1",
          marks: 5,
          presentationType: "cliFill",
          fields: [
            { id: "b1", correct: "20" },
            { id: "b2", correct: "192.168.20.1" },
            { id: "b3", correct: "255.255.255.0" },
            { id: "b4", correct: "no shutdown" }
          ]
        }
      ]
    };
    const result = gradeExam(exam, { q1: { kind: "fields", values: { b1: "20", b2: "192.168.20.1", b3: "255.255.255.0", b4: "WRONG" } } });
    expect(result.questions[0].score).toBeCloseTo(3.75, 5);
  });
});

describe("gradeExam - compound question whose parts use different answer types", () => {
  it("sums a multipleChoice part, a trueFalse part, and a shortAnswer part", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q17",
          marks: 6,
          parts: [
            { id: "a", type: "multipleChoice", marks: 2, options: [{ text: "X" }, { text: "Y" }], answer: { correctOptionIndex: 1 } },
            { id: "b", type: "trueFalse", marks: 2, options: [{ text: "صحيح" }, { text: "غير صحيح" }], answer: { correctOptionIndex: 0 } },
            { id: "c", type: "shortAnswer", marks: 2, answer: { text: "Paris" } }
          ]
        }
      ]
    };
    const result = gradeExam(exam, {
      q17: {
        kind: "compound",
        parts: { a: { kind: "choice", index: 1 }, b: { kind: "choice", index: 0 }, c: { kind: "text", value: "paris" } }
      }
    });
    expect(result.questions[0].score).toBe(6);
    expect(result.questions[0].maxMarks).toBe(6);
    expect(result.questions[0].correct).toBe(true);
  });

  it("keeps an unkeyed short-answer part in manual review without blocking the auto-graded parts", () => {
    const exam = {
      questions: [
        {
          examQuestionId: "q9",
          marks: 4,
          parts: [
            { id: "a", type: "multipleChoice", marks: 2, options: [{ text: "X" }, { text: "Y" }], answer: { correctOptionIndex: 0 } },
            { id: "b", type: "shortAnswer", marks: 2 } // no answer key => manual review
          ]
        }
      ]
    };
    const result = gradeExam(exam, {
      q9: { kind: "compound", parts: { a: { kind: "choice", index: 0 }, b: { kind: "text", value: "free text" } } }
    });
    expect(result.questions[0].score).toBe(2);
    expect(result.questions[0].manualReview).toBe(true);
    expect(result.manualReviewMarks).toBe(2);
    expect(result.finalized).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Review-fix regressions: section-scoped ids, trueFalse defaults, firstN
// countedMaxMarks, manual-override safety.
// ---------------------------------------------------------------------------

describe("gradeExam - section-scoped ids prevent cross-section answer-key collisions", () => {
  it("grades two sections that both contain displayed question number 1 independently", () => {
    const exam = {
      sections: [
        { id: "core", gradingPolicy: "all", questions: [{ number: 1, marks: 3, presentationType: "multipleChoice", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }] },
        { id: "specialization", gradingPolicy: "all", questions: [{ number: 1, marks: 4, presentationType: "multipleChoice", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 1 } }] }
      ]
    };
    // Answer core's q1 correctly and specialization's q1 wrongly, keyed by the section-scoped ids.
    const result = gradeExam(exam, { "core::q1": { kind: "choice", index: 0 }, "specialization::q1": { kind: "choice", index: 0 } });
    const core = result.questions.find(q => q.questionId === "core::q1");
    const spec = result.questions.find(q => q.questionId === "specialization::q1");
    expect(core.score).toBe(3);
    expect(spec.score).toBe(0); // independent — the shared display number "1" did NOT merge them
    expect(result.score).toBe(3);
    expect(result.totalMarks).toBe(7);
  });
});

describe("gradeExam - trueFalse without stored options", () => {
  it("grades a standalone trueFalse using a boolean answer.correct (no options stored)", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, presentationType: "trueFalse", answer: { correct: true } }] };
    expect(gradeExam(exam, { q1: { kind: "choice", index: 0 } }).questions[0].correct).toBe(true); // صحيح
    expect(gradeExam(exam, { q1: { kind: "choice", index: 1 } }).questions[0].correct).toBe(false); // غير صحيح
  });
  it("grades a trueFalse using correctOptionIndex when no options are stored", () => {
    const exam = { questions: [{ examQuestionId: "q1", marks: 2, presentationType: "trueFalse", answer: { correctOptionIndex: 1 } }] };
    expect(gradeExam(exam, { q1: { kind: "choice", index: 1 } }).questions[0].score).toBe(2);
    expect(gradeExam(exam, { q1: { kind: "choice", index: 0 } }).questions[0].score).toBe(0);
  });
  it("grades a trueFalse part inside a compound question with no options stored", () => {
    const exam = { questions: [{ examQuestionId: "q9", marks: 2, parts: [{ id: "a", type: "trueFalse", marks: 2, answer: { correct: false } }] }] };
    const result = gradeExam(exam, { q9: { kind: "compound", parts: { a: { kind: "choice", index: 1 } } } });
    expect(result.questions[0].score).toBe(2);
  });
});

describe("gradeExam - firstN exposes countedMaxMarks for manual-override safety", () => {
  it("question-level: an ignored excess answer reports countedMaxMarks 0", () => {
    const questions = "ABCDEFGHI".split("").map(c => ({ examQuestionId: c, marks: 4, presentationType: "multipleChoice", options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }));
    const exam = { sections: [{ id: "net", maxMarks: 40, gradingPolicy: "firstNAnswered", requiredAnswers: 8, answerUnit: "question", questions }] };
    const answers = {};
    "ABCDEFGHI".split("").forEach(c => (answers[c] = { kind: "choice", index: 0 }));
    const result = gradeExam(exam, answers);
    const ignored = result.questions.find(q => q.questionId === "I");
    expect(ignored.ignored).toBe(true);
    expect(ignored.countedMaxMarks).toBe(0); // teacher override will clamp to 0
  });
  it("part-level: a compound with only two 5-mark parts counted reports countedMaxMarks 10 (not full 60)", () => {
    const parts = Array.from({ length: 12 }, (_, i) => ({ id: "p" + i, type: "multipleChoice", marks: 5, options: [{ text: "A" }, { text: "B" }], answer: { correctOptionIndex: 0 } }));
    const exam = { sections: [{ id: "net", maxMarks: 40, gradingPolicy: "firstNAnswered", requiredAnswers: 2, answerUnit: "part", questions: [{ examQuestionId: "q25", marks: 60, parts }] }] };
    const partAnswers = {};
    for (let i = 0; i < 5; i++) partAnswers["p" + i] = { kind: "choice", index: 0 }; // answer 5, only first 2 counted
    const result = gradeExam(exam, { q25: { kind: "compound", parts: partAnswers } });
    expect(result.questions[0].countedMaxMarks).toBe(10);
    expect(result.questions[0].maxMarks).toBe(60);
  });
});
