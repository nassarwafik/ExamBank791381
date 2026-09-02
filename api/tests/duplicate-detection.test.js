import { describe, it, expect } from "vitest";
import { normalizeQuestionText, computeDuplicateCandidates } from "../src/lib/duplicate-detection.js";

describe("normalizeQuestionText", () => {
  it("strips Arabic diacritics", () => {
    expect(normalizeQuestionText("مَاذَا يَعْنِي")).toBe(normalizeQuestionText("ماذا يعني"));
  });

  it("unifies alef variants and ta-marbuta/alef-maqsura", () => {
    expect(normalizeQuestionText("أحمد إلى آخره")).toBe(normalizeQuestionText("احمد الى اخره"));
    expect(normalizeQuestionText("شبكة")).toBe(normalizeQuestionText("شبكه"));
    expect(normalizeQuestionText("متى")).toBe(normalizeQuestionText("متي"));
  });

  it("strips punctuation and collapses whitespace", () => {
    expect(normalizeQuestionText("ما هو DHCP؟  (اشرح)")).toBe(normalizeQuestionText("ما هو DHCP اشرح"));
  });

  it("lowercases Latin characters", () => {
    expect(normalizeQuestionText("What is DHCP?")).toBe(normalizeQuestionText("what is dhcp"));
  });
});

describe("computeDuplicateCandidates", () => {
  const bank = [
    { sourceId: "791381-2024", questionId: "q17", text: "ما هو نطاق عناوين IP الخاصة من الفئة C؟" },
    { sourceId: "791381-2023", questionId: "q5", text: "اشرح الفرق بين TCP و UDP بالتفصيل." }
  ];

  it("finds an exact match after normalization (diacritics/punctuation differences ignored)", () => {
    const results = computeDuplicateCandidates("ما هو نطاق عناوين IP الخاصة من الفئة C؟", bank);
    expect(results[0]).toMatchObject({ sourceId: "791381-2024", questionId: "q17", matchType: "exact", similarity: 1 });
  });

  it("finds a near-duplicate above the similarity threshold (minor OCR/spacing-style differences)", () => {
    const results = computeDuplicateCandidates("اشرح الفرق بين TCP و UDP بالتفصيل مع مثال", bank, { similarityThreshold: 0.5 });
    expect(results.some(r => r.questionId === "q5")).toBe(true);
  });

  it("returns no false positive for a genuinely different question", () => {
    const results = computeDuplicateCandidates("ما هو عنوان MAC وكيف يُستخدم في طبقة ربط البيانات؟", bank);
    expect(results).toHaveLength(0);
  });

  it("returns an empty array for empty candidate text", () => {
    expect(computeDuplicateCandidates("", bank)).toEqual([]);
  });

  it("caps results at maxResults and sorts by similarity descending", () => {
    const manyBank = Array.from({ length: 10 }, (_, i) => ({
      sourceId: "s" + i, questionId: "q" + i, text: "ما هو نطاق عناوين IP الخاصة من الفئة C؟"
    }));
    const results = computeDuplicateCandidates("ما هو نطاق عناوين IP الخاصة من الفئة C؟", manyBank, { maxResults: 3 });
    expect(results).toHaveLength(3);
    expect(results.every(r => r.similarity === 1)).toBe(true);
  });
});
