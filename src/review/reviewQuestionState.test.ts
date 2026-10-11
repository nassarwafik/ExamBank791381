import { describe, it, expect } from "vitest";
import { isAnswered, matchesReviewFilter, mergeUnsavedEdits, nextMatching, reviewCounts, reviewQuestionInfo, MODE_LABEL, STATE_LABEL } from "./reviewQuestionState";

// UX-003 — the grading workspace derives every state from the server projection; these pin the derivation rules.
const q = (over: Partial<Parameters<typeof reviewQuestionInfo>[0]> = {}) => ({ marks: 4, autoGrade: { score: 4, manualReview: false }, manualScore: null, studentAnswer: { kind: "choice", index: 1 }, ...over });

describe("reviewQuestionInfo", () => {
  it("a full automatic score is correct; zero is incorrect; in between is partial", () => {
    expect(reviewQuestionInfo(q()).state).toBe("correct");
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false } })).state).toBe("incorrect");
    expect(reviewQuestionInfo(q({ autoGrade: { score: 2.5, manualReview: false } })).state).toBe("partial");
  });
  it("a pending manual review is NEVER incorrect, whatever the automatic score says", () => {
    const info = reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: { kind: "text", value: "شرح" } }));
    expect(info.state).toBe("pending");
    expect(info.graded).toBe(false);
    expect(STATE_LABEL[info.state]).toBe("بانتظار التصحيح اليدوي");
  });
  it("a stored teacher mark decides over the automatic score and marks the question graded", () => {
    const info = reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false }, manualScore: 4 }));
    expect(info).toMatchObject({ state: "correct", graded: true, draft: false, effective: 4, max: 4 });
    expect(reviewQuestionInfo(q({ autoGrade: { score: 4, manualReview: false }, manualScore: 1 })).state).toBe("partial");
  });
  it("a typed, unsaved mark is a provisional (draft) state and is clamped to the maximum", () => {
    const info = reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: { kind: "text", value: "x" } }), "9");
    expect(info).toMatchObject({ state: "correct", draft: true, graded: false, effective: 4 });
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true } }), "abc").state).toBe("pending");   // not a number → untouched
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true } }), "  ").state).toBe("pending");
  });
  it("an unanswered question is reported as such — not as a wrong answer — unless a teacher graded it or it awaits review", () => {
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false }, studentAnswer: null })).state).toBe("unanswered");
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false }, studentAnswer: { kind: "text", value: "   " } })).state).toBe("unanswered");
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false }, studentAnswer: null, manualScore: 0 })).state).toBe("incorrect");
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: null })).state).toBe("pending");
  });
  it("uses the counted maximum of a composite grade when present", () => {
    expect(reviewQuestionInfo(q({ marks: 10, autoGrade: { score: 6, maxMarks: 10, countedMaxMarks: 6, manualReview: false } })).state).toBe("correct");
  });
  it("isAnswered understands the stored answer shapes", () => {
    expect(isAnswered({ kind: "choice", index: 0 })).toBe(true);
    expect(isAnswered({ kind: "sequence", values: ["", ""] })).toBe(false);
    expect(isAnswered({ kind: "fields", values: { a: "x" } })).toBe(true);
    expect(isAnswered({ kind: "code", source: "int main(){}" })).toBe(true);
    expect(isAnswered("")).toBe(false);
  });
});

describe("filters, counts and navigation", () => {
  const infos = [
    reviewQuestionInfo(q()),                                                                        // correct
    reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: { kind: "text", value: "a" } })), // pending
    reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: false } })),                        // incorrect
    reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false } })),                        // partial
    reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: null })),    // pending
  ];
  it("counts: the modes partition the questions (pending + manual + auto + draft = all); correct / incorrect / partial are exclusive", () => {
    expect(reviewCounts(infos)).toEqual({ all: 5, pending: 2, manual: 0, auto: 3, draft: 0, correct: 1, incorrect: 1, partial: 1 });
  });
  it("«يحتاج إلى تصحيح يدوي» keeps only unresolved manual reviews; «مُصحَّح آليًا» the automatic ones; «تم تصحيحه يدويًا» and «تعديلات غير محفوظة» are empty here", () => {
    expect(infos.map(i => matchesReviewFilter(i, "pending"))).toEqual([false, true, false, false, true]);
    expect(infos.map(i => matchesReviewFilter(i, "auto"))).toEqual([true, false, true, true, false]);
    expect(infos.map(i => matchesReviewFilter(i, "manual"))).toEqual([false, false, false, false, false]);
    expect(infos.map(i => matchesReviewFilter(i, "draft"))).toEqual([false, false, false, false, false]);
    expect(infos.map(i => matchesReviewFilter(i, "all"))).toEqual([true, true, true, true, true]);
  });
  it("nextMatching walks forward / backward with wrap-around and returns -1 when nothing matches", () => {
    expect(nextMatching(infos, 0, "pending")).toBe(1);
    expect(nextMatching(infos, 1, "pending")).toBe(4);
    expect(nextMatching(infos, 4, "pending")).toBe(1);
    expect(nextMatching(infos, 1, "pending", -1)).toBe(4);
    expect(nextMatching(infos, 0, "all")).toBe(1);
    expect(nextMatching(infos.filter(i => i.state !== "pending"), 0, "pending")).toBe(-1);
  });
});

describe("correctOptionIndex (teacher-only key)", () => {
  it("reads correctOptionIndex, the true/false boolean form, and refuses anything else", async () => {
    const { correctOptionIndex } = await import("./reviewQuestionState");
    expect(correctOptionIndex({ correctOptionIndex: 2 }, "multipleChoice")).toBe(2);
    expect(correctOptionIndex({ correctOptionIndex: "1" }, "multipleChoice")).toBe(1);
    expect(correctOptionIndex({ correct: false }, "trueFalse")).toBe(1);
    expect(correctOptionIndex({ correct: true }, "multipleChoice")).toBe(null);
    expect(correctOptionIndex(null, "multipleChoice")).toBe(null);
    expect(correctOptionIndex({ text: "x" }, "shortAnswer")).toBe(null);
  });
});

describe("choiceKeyText", () => {
  it("names the correct option in text for choice keys only", async () => {
    const { choiceKeyText } = await import("./reviewQuestionState");
    expect(choiceKeyText({ correctOptionIndex: 2 }, "multipleChoice", [{ text: "أ" }, { text: "ب" }, { text: "الراوتر" }])).toBe("الخيار 3 — الراوتر");
    expect(choiceKeyText({ correct: false }, "trueFalse", [])).toBe("الخيار 2 — غير صحيح");
    expect(choiceKeyText({ text: "62" }, "shortAnswer", [])).toBe(null);
  });
});

// RF1 — the review MODE is separate from the answer outcome: automatically evaluated vs a STORED teacher override vs an unsaved draft.
describe("review mode (RF1)", () => {
  it("automatic, saved manual override, unsaved draft and pending are told apart; the outcome stays an independent axis", () => {
    const auto = reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false } }));
    expect(auto).toMatchObject({ mode: "auto", graded: false, draft: false, state: "partial" });
    const manual = reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false }, manualScore: 4 }));
    expect(manual).toMatchObject({ mode: "manual", graded: true, draft: false, state: "correct" });
    const echoed = reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false }, manualScore: 4 }), "");     // input untouched (the caller passes "" when local === stored)
    expect(echoed.mode).toBe("manual");
    const draftOverAuto = reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false } }), "3");
    expect(draftOverAuto).toMatchObject({ mode: "draft", graded: false, draft: true, state: "partial" });
    const draftOverManual = reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false }, manualScore: 4 }), "0");
    expect(draftOverManual).toMatchObject({ mode: "draft", graded: true, draft: true, state: "incorrect" });
    const pending = reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true }, studentAnswer: { kind: "text", value: "x" } }));
    expect(pending).toMatchObject({ mode: "pending", state: "pending" });
    expect(reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true } }), "2").mode).toBe("draft");           // grading a pending one → draft until saved
    expect(MODE_LABEL).toEqual({ pending: "بانتظار المعلم", auto: "تصحيح آلي", manual: "تصحيح يدوي محفوظ", draft: "تعديل غير محفوظ" });
  });
  it("counts and filters follow the mode", () => {
    const infos = [
      reviewQuestionInfo(q({ autoGrade: { score: 4, manualReview: false } })),
      reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false }, manualScore: 2 })),
      reviewQuestionInfo(q({ autoGrade: { score: 1, manualReview: false } }), "3"),
      reviewQuestionInfo(q({ autoGrade: { score: 0, manualReview: true } })),
    ];
    expect(reviewCounts(infos)).toEqual({ all: 4, pending: 1, manual: 1, auto: 1, draft: 1, correct: 1, incorrect: 0, partial: 2 });
    expect(infos.map(i => matchesReviewFilter(i, "manual"))).toEqual([false, true, false, false]);
    expect(infos.map(i => matchesReviewFilter(i, "draft"))).toEqual([false, false, true, false]);
    expect(infos.map(i => matchesReviewFilter(i, "auto"))).toEqual([true, false, false, false]);
    expect(nextMatching(infos, 0, "draft")).toBe(2);
  });
});

// RF1 — a same-attempt reload keeps exactly the unsaved edits (local ≠ previous baseline) and takes the server's value elsewhere.
describe("mergeUnsavedEdits", () => {
  it("keeps unsaved edits, takes fresh server values for untouched keys, and drops keys the server no longer has unless edited", () => {
    const prev = { q1: "", q2: "3", q3: "" };
    const local = { q1: "4", q2: "3", q3: "" };                 // q1 edited, q2 / q3 untouched
    const fresh = { q1: "", q2: "5", q3: "1" };                 // server: q2 regraded to 5, q3 now 1
    expect(mergeUnsavedEdits(prev, local, fresh)).toEqual({ q1: "4", q2: "5", q3: "1" });
    expect(mergeUnsavedEdits({ a: { x: 1 } }, { a: { x: 2 } }, { a: { x: 9 } })).toEqual({ a: { x: 2 } });   // deep compare
    expect(mergeUnsavedEdits({}, { a: "1" }, {})).toEqual({ a: "1" });                                     // an edit on a key the baseline never had survives
    expect(mergeUnsavedEdits({ a: "1" }, { a: "1" }, {})).toEqual({});                                     // untouched key gone from the server → gone
  });
});
