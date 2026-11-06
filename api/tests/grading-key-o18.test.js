import { describe, it, expect } from "vitest";
import { gradeExam } from "../src/lib/assignment-grading.js";

// Tadris+ O18 (security review docs/enterprise-security-review-p9b3.md; owner decision «أوافق على إصلاح O18») — the grader read a
// choice key with Number.isInteger(Number(v)), so a key of null / "" / "  " / false counted option 0 (true: option 1) as correct and
// awarded its marks, and in a true/false question a null key blocked the fallback to `answer.correct`. A key is now read by the same
// strict rule as the training review (O16): a non-negative whole number, or its digits as a string (as before). Anything else is
// treated exactly like a MISSING key: the other key forms (correctText, value, label…) and, for true/false, `answer.correct` decide.
// Every whole-number key grades exactly as before. TEST data only.
const choice = (answer, extra = {}) => ({ examQuestionId: "q1", marks: 10, presentationType: "multipleChoice", options: [{ text: "A" }, { text: "B" }, { text: "C" }], answer, ...extra });
const trueFalse = answer => ({ examQuestionId: "q1", marks: 10, presentationType: "trueFalse", answer });
const score = (question, index) => gradeExam({ questions: [question] }, { q1: { kind: "choice", index } }).questions[0].score;

describe("O18 — a missing or malformed key never makes option 0 (or 1) correct", () => {
  it.each([null, "", "  ", false])("multiple choice, key %j: option 0 earns nothing (baseline: 10 marks)", key => {
    expect(score(choice({ correctOptionIndex: key }), 0)).toBe(0);
  });
  it("multiple choice, key true: option 1 earns nothing (baseline: 10 marks)", () => {
    expect(score(choice({ correctOptionIndex: true }), 1)).toBe(0);
  });
  it("a malformed key falls through to the item's other key forms, like a missing one (correctText «B» → option 1)", () => {
    const q = choice({ correctOptionIndex: null, correctText: "B" });
    expect([score(q, 0), score(q, 1), score(q, 2)]).toEqual([0, 10, 0]);   // baseline: [10, 10, 0]
    const missing = choice({ correctText: "B" });
    expect([score(missing, 0), score(missing, 1), score(missing, 2)]).toEqual([0, 10, 0]);   // the same, by construction
  });
  it("true/false with a null key: answer.correct decides (false → «غير صحيح», option 1)", () => {
    const q = trueFalse({ correctOptionIndex: null, correct: false });
    expect([score(q, 0), score(q, 1)]).toEqual([0, 10]);   // baseline: [10, 0]
    const t = trueFalse({ correctOptionIndex: "", correct: true });
    expect([score(t, 0), score(t, 1)]).toEqual([10, 0]);
  });
  it("true/false with key -1 (not an option): answer.correct decides, like a missing key (baseline: nothing was ever correct)", () => {
    const q = trueFalse({ correctOptionIndex: -1, correct: true });
    expect([score(q, 0), score(q, 1)]).toEqual([10, 0]);   // baseline: [0, 0]
  });
});

describe("O18 — every whole-number key grades exactly as before", () => {
  it.each([[0, [10, 0, 0]], [1, [0, 10, 0]], [2, [0, 0, 10]], ["1", [0, 10, 0]], [" 2 ", [0, 0, 10]]])("key %j → %j", (key, expected) => {
    const q = choice({ correctOptionIndex: key });
    expect([score(q, 0), score(q, 1), score(q, 2)]).toEqual(expected);
  });
  it("key -1 (the AI author's «unsure») and 1.5 match nothing, as before", () => {
    for (const key of [-1, 1.5]) { const q = choice({ correctOptionIndex: key }); expect([score(q, 0), score(q, 1), score(q, 2)]).toEqual([0, 0, 0]); }
  });
  it("true/false: a whole-number key wins over answer.correct, as before; no key → answer.correct", () => {
    expect([score(trueFalse({ correctOptionIndex: 1, correct: true }), 0), score(trueFalse({ correctOptionIndex: 1, correct: true }), 1)]).toEqual([0, 10]);
    expect([score(trueFalse({ correct: true }), 0), score(trueFalse({ correct: true }), 1)]).toEqual([10, 0]);
  });
});
