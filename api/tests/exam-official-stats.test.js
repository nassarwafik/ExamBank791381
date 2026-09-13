import { describe, it, expect } from "vitest";
import {
  questionMaxMarks,
  sectionOfficialMaxMarks,
  examOfficialStats
} from "../src/lib/exam-structure.js";
import { gradeExam } from "../src/lib/assignment-grading.js";

// The whole point of the authoritative helper: for a deterministic structure, examOfficialStats()
// MUST equal gradeExam().totalMarks. Grading is authoritative; the helper only re-derives the same
// structural total so an assignment/cover can display it without trusting a stale exam.totalMarks.
function gradeTotal(exam) {
  return gradeExam(exam, {}).totalMarks;
}

describe("questionMaxMarks — matches the grader's per-question maximum", () => {
  it("normal question: max(0, marks) / points fallback", () => {
    expect(questionMaxMarks({ marks: 5 })).toBe(5);
    expect(questionMaxMarks({ points: 7 })).toBe(7);
    expect(questionMaxMarks({ marks: -3 })).toBe(0); // grader clamps at 0
    expect(questionMaxMarks({})).toBe(0);
  });
  it("compound, no explicit part marks: equal split summing to question marks (=10)", () => {
    const q = { marks: 10, parts: [{}, {}, {}, {}, {}] };
    expect(questionMaxMarks(q)).toBe(10);
  });
  it("compound, ALL explicit parts: SUM of part marks even when != question marks (3+3+2=8, marks 10)", () => {
    const q = { marks: 10, parts: [{ marks: 3 }, { marks: 3 }, { marks: 2 }] };
    expect(questionMaxMarks(q)).toBe(8);
  });
  it("compound, MIXED explicit/unset parts: distributePartMarks fills to question marks (=12)", () => {
    const q = { marks: 12, parts: [{ marks: 4 }, {}, {}] }; // 4 + (8/2)+(8/2) = 12
    expect(questionMaxMarks(q)).toBe(12);
  });
});

describe("sectionOfficialMaxMarks — matches gradeExam secMax per policy", () => {
  it("A) all: sum of question marks, IGNORING a stale section.maxMarks", () => {
    const s = { gradingPolicy: "all", maxMarks: 60, questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] };
    expect(sectionOfficialMaxMarks(s)).toBe(80); // NOT 60
  });
  it("B) capScore: cap when present", () => {
    const s = { gradingPolicy: "capScore", maxMarks: 60, questions: Array.from({ length: 21 }, () => ({ marks: 3 })) };
    expect(sectionOfficialMaxMarks(s)).toBe(60); // raw 63 -> cap 60
  });
  it("C) capScore without cap: sum of question marks (legacy fallback)", () => {
    const s = { gradingPolicy: "capScore", questions: [{ marks: 10 }, { marks: 15 }] };
    expect(sectionOfficialMaxMarks(s)).toBe(25);
  });
  it("D) firstNAnswered with cap: the cap", () => {
    const s = { gradingPolicy: "firstNAnswered", requiredAnswers: 2, maxMarks: 40, questions: [{ marks: 30 }, { marks: 30 }, { marks: 30 }] };
    expect(sectionOfficialMaxMarks(s)).toBe(40);
  });
});

describe("examOfficialStats — structural total EQUALS gradeExam().totalMarks", () => {
  it("STALE exam.totalMarks (100) is ignored; structure (80) wins", () => {
    const exam = {
      totalMarks: 100,
      sections: [{ gradingPolicy: "all", questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }]
    };
    const stats = examOfficialStats(exam);
    expect(stats.totalMarks).toBe(80);
    expect(stats.totalMarks).toBe(gradeTotal(exam));
    expect(stats.questionCount).toBe(4);
  });

  it("all with stale section cap (60) vs structure (80): 80 everywhere", () => {
    const exam = { totalMarks: 60, sections: [{ gradingPolicy: "all", maxMarks: 60, questions: [{ marks: 20 }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }] };
    expect(examOfficialStats(exam).totalMarks).toBe(80);
    expect(gradeTotal(exam)).toBe(80);
  });

  it("capScore: raw 63 -> official 60, helper == grader", () => {
    const exam = { sections: [{ gradingPolicy: "capScore", maxMarks: 60, questions: Array.from({ length: 21 }, () => ({ marks: 3 })) }] };
    expect(examOfficialStats(exam).totalMarks).toBe(60);
    expect(gradeTotal(exam)).toBe(60);
  });

  it("multi-section: A(all,40) + B(capScore raw45 cap40) = 80, helper == grader", () => {
    const exam = {
      sections: [
        { gradingPolicy: "all", questions: [{ marks: 10 }, { marks: 10 }, { marks: 20 }] },       // 40
        { gradingPolicy: "capScore", maxMarks: 40, questions: [{ marks: 15 }, { marks: 15 }, { marks: 15 }] } // raw 45 -> 40
      ]
    };
    const stats = examOfficialStats(exam);
    expect(stats.totalMarks).toBe(80);
    expect(stats.totalMarks).toBe(gradeTotal(exam));
    expect(stats.sections.map(s => s.totalMarks)).toEqual([40, 40]);
    expect(stats.questionCount).toBe(6);
  });

  it("firstNAnswered WITH cap: official total == cap == grader total (answer-independent)", () => {
    const exam = {
      sections: [{ gradingPolicy: "firstNAnswered", answerUnit: "question", requiredAnswers: 2, maxMarks: 40, questions: [{ marks: 30 }, { marks: 30 }, { marks: 30 }] }]
    };
    expect(examOfficialStats(exam).totalMarks).toBe(40);
    expect(gradeTotal(exam)).toBe(40); // grader uses the cap, not the answered set
  });

  it("legacy FLAT exam normalizes to one 'all' section; structure wins over stale totalMarks", () => {
    const exam = { totalMarks: 999, questions: [{ marks: 5 }, { marks: 5 }, { marks: 5 }] };
    const stats = examOfficialStats(exam);
    expect(stats.totalMarks).toBe(15);
    expect(stats.totalMarks).toBe(gradeTotal(exam));
    expect(stats.questionCount).toBe(3);
  });

  it("COMPOUND explicit parts (3+3+2=8): helper == grader (not the stale marks 10)", () => {
    const exam = { sections: [{ gradingPolicy: "all", questions: [{ marks: 10, parts: [{ marks: 3 }, { marks: 3 }, { marks: 2 }] }] }] };
    expect(examOfficialStats(exam).totalMarks).toBe(8);
    expect(gradeTotal(exam)).toBe(8);
  });

  it("COMPOUND equal-split (no part marks): helper == grader == question marks", () => {
    const exam = { sections: [{ gradingPolicy: "all", questions: [{ marks: 10, parts: [{}, {}, {}, {}, {}] }] }] };
    expect(examOfficialStats(exam).totalMarks).toBe(10);
    expect(gradeTotal(exam)).toBe(10);
  });

  it("percentage consistency: score/officialTotal aligns with the displayed total", () => {
    const exam = { sections: [{ gradingPolicy: "all", questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 20, answer: { correct: true } }, { marks: 20 }, { marks: 20 }, { marks: 20 }] }] };
    const official = examOfficialStats(exam).totalMarks; // 80
    const g = gradeExam(exam, { q1: { kind: "choice", index: 0 } });
    expect(g.totalMarks).toBe(official);
    expect(g.percentage).toBe(Number((g.score / official * 100).toFixed(2)));
  });
});
