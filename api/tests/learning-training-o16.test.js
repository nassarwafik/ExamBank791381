import { describe, it, expect } from "vitest";
import { createRequire } from "module";
import { handler } from "../src/functions/learning-training.js";
import { createMemoryContainer } from "./fixtures/memory-container.js";

// Tadris+ O16 (security review docs/enterprise-security-review-p9b3.md) — after a training submission, the review reveals each
// question's key. `Number(null) === 0` (and Number("") / Number("  ") / Number(false) === 0, Number(true) === 1) made a MISSING or
// malformed key read as option 0 (or 1): the student was shown a wrong «correct answer», and the item's own answer text was hidden.
// Only a non-negative whole number (or its digits as a string, as before) is a key now; anything else reveals no index and lets the
// item's answer text through. PRESENTATION of the post-submit review only: grading (gradeExam) is untouched. TEST data only.
const req_ = createRequire(import.meta.url);
const T01 = req_("../src/data/exam-library/items/T01.json");
const BUILDER_OK = { requireBuilderAuth: () => ({ ok: true, user: { sub: "teacher-1" } }) };
const KEYS = [null, "", "  ", false, true, 1.5, -1, "2", 3, undefined];

function itemWithKeys() {
  const item = JSON.parse(JSON.stringify(T01));
  item.examSnapshot.questions.forEach((q, i) => {
    if (i >= KEYS.length) return;
    q.answer = KEYS[i] === undefined ? { text: "إجابة نصية " + i } : { correctOptionIndex: KEYS[i], text: "إجابة نصية " + i };
  });
  return item;
}
const submit = deps => handler({ method: "POST", url: "https://x/api/learning-training", headers: { get: () => null }, params: { trainingId: "T01", action: "submit" }, json: async () => ({ answers: {} }) }, deps);

describe("O16 — a missing or malformed key is never revealed as option 0", () => {
  it("only a non-negative whole number (or its digits) is revealed as the key; otherwise no index and the item's answer text", async () => {
    const { container } = createMemoryContainer();
    const r = await submit({ ...BUILDER_OK, container, getContainer: () => container, readLibraryItem: () => itemWithKeys() });
    expect(r.status).toBe(200);
    const review = r.jsonBody.result.review.slice(0, KEYS.length).map(q => [q.correctOptionIndex, q.correctText]);
    expect(review).toEqual([
      [null, "إجابة نصية 0"],   // null       (baseline: 0, and the text hidden)
      [null, "إجابة نصية 1"],   // ""         (baseline: 0)
      [null, "إجابة نصية 2"],   // "  "       (baseline: 0)
      [null, "إجابة نصية 3"],   // false      (baseline: 0)
      [null, "إجابة نصية 4"],   // true       (baseline: 1)
      [null, "إجابة نصية 5"],   // 1.5        (baseline: null — unchanged)
      [null, "إجابة نصية 6"],   // -1         (baseline: -1)
      [2, ""],                  // "2"        (unchanged: digits are a key, as before)
      [3, ""],                  // 3          (unchanged)
      [null, "إجابة نصية 9"]    // no key     (unchanged)
    ]);
  });

  it("the real library items are unaffected: every reveal is the item's own whole-number key", async () => {
    const { container } = createMemoryContainer();
    const r = await submit({ ...BUILDER_OK, container, getContainer: () => container });
    expect(r.jsonBody.result.review.map(q => q.correctOptionIndex)).toEqual(T01.examSnapshot.questions.map(q => q.answer.correctOptionIndex));
    expect(r.jsonBody.result.review.every(q => Number.isInteger(q.correctOptionIndex) && q.correctOptionIndex >= 0)).toBe(true);
  });
});
