import { describe, it, expect } from "vitest";
import { extractPages, extractLoadDataArray, extractQuestionsFromLoadData, questionToText } from "../src/lib/google-form-extract.js";

// A hand-built approximation of a real Google Form's embedded FB_PUBLIC_LOAD_DATA_ shape (per the
// commonly-documented, UNOFFICIAL structure): loadData[1][1] is the question list; each question
// is [id, title, help, typeCode, [[fieldId, options, required, ...]], ...]. typeCode 2 = multiple
// choice. This is deliberately realistic (nested arrays, a title containing a literal "]" and a
// quote, to exercise the bracket/string-aware scanner) rather than a simplified stand-in.
function buildLoadDataHtml(extraTrailingJs = "") {
  const loadData = [
    null,
    [
      null,
      [
        [123, 'ما مدى صحة العبارة التالية: "192.168.1.10 صالح"؟ [مهم]', null, 2, [[456, [["صحيح"], ["غير صحيح"]], true]]],
        [124, "اشرح الفرق بين TCP و UDP", null, 0, [[457, null, true]]],
        [125, "malformed question with no fields", null, 2, null]
      ]
    ]
  ];
  const json = JSON.stringify(loadData);
  return `<html><head></head><body><script nonce="abc">var FB_PUBLIC_LOAD_DATA_ = ${json};${extraTrailingJs}</script></body></html>`;
}

describe("extractLoadDataArray - bracket/string-aware scanning (not a naive regex)", () => {
  it("extracts the full nested array even when a question title itself contains ']' and quotes", () => {
    const html = buildLoadDataHtml();
    const result = extractLoadDataArray(html);
    expect(result).not.toBeNull();
    expect(result[1][1]).toHaveLength(3);
    expect(result[1][1][0][1]).toContain("[مهم]");
  });

  it("correctly stops at the end of the FB_PUBLIC_LOAD_DATA_ array even with more JS statements after it", () => {
    const html = buildLoadDataHtml('var somethingElse = [1,2,3];');
    const result = extractLoadDataArray(html);
    expect(result).not.toBeNull();
    expect(result[1][1]).toHaveLength(3);
  });

  it("returns null when the variable doesn't exist at all", () => {
    expect(extractLoadDataArray("<html><body>no data here</body></html>")).toBeNull();
  });

  it("returns null (never throws) on a truncated/unterminated array", () => {
    const html = '<script>var FB_PUBLIC_LOAD_DATA_ = [1, [2, 3';
    expect(() => extractLoadDataArray(html)).not.toThrow();
    expect(extractLoadDataArray(html)).toBeNull();
  });
});

describe("extractQuestionsFromLoadData - defensive walk, skips malformed entries", () => {
  it("extracts title and options for a multiple-choice question", () => {
    const loadData = extractLoadDataArray(buildLoadDataHtml());
    const { questions } = extractQuestionsFromLoadData(loadData);
    expect(questions[0].title).toContain("192.168.1.10");
    expect(questions[0].isChoice).toBe(true);
    expect(questions[0].options).toEqual(["صحيح", "غير صحيح"]);
  });

  it("treats a non-choice type (open answer) as isChoice:false with no options", () => {
    const loadData = extractLoadDataArray(buildLoadDataHtml());
    const { questions } = extractQuestionsFromLoadData(loadData);
    expect(questions[1].title).toBe("اشرح الفرق بين TCP و UDP");
    expect(questions[1].isChoice).toBe(false);
  });

  it("skips a structurally malformed question without throwing or losing the others", () => {
    const loadData = extractLoadDataArray(buildLoadDataHtml());
    const { questions } = extractQuestionsFromLoadData(loadData);
    // question 125 has fieldData=null and a title, so it should still appear but as non-choice
    // (options resolve to []) rather than crash the whole batch.
    expect(questions).toHaveLength(3);
    expect(questions[2].isChoice).toBe(false);
  });

  it("reports a clear warning (not a throw) when the question list itself is missing", () => {
    const { questions, warnings } = extractQuestionsFromLoadData([null, [null, "not-an-array"]]);
    expect(questions).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("questionToText - synthesizes lettered أ/ب/ج choices matching how these exams are hand-typed", () => {
  it("renders a numbered question with lettered options", () => {
    const text = questionToText({ title: "أي بروتوكول موثوق؟", isChoice: true, options: ["TCP", "UDP"] }, 3);
    expect(text).toBe("3. أي بروتوكول موثوق؟\nأ. TCP\nب. UDP");
  });

  it("renders an open question with no option lines", () => {
    const text = questionToText({ title: "اشرح", isChoice: false, options: [] }, 1);
    expect(text).toBe("1. اشرح");
  });
});

describe("extractPages - end to end, never throws, always returns {pages, warnings}", () => {
  it("produces one page per detected question", async () => {
    const buffer = Buffer.from(buildLoadDataHtml(), "utf8");
    const result = await extractPages(buffer);
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0].text).toContain("192.168.1.10");
    expect(result.pages[0].images).toEqual([]);
  });

  it("degrades to a clear warning and zero pages when the page has no FB_PUBLIC_LOAD_DATA_ at all (Google changed the format, or the form isn't public)", async () => {
    const buffer = Buffer.from("<html><body>this is not a google form export</body></html>", "utf8");
    const result = await extractPages(buffer);
    expect(result.pages).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/نموذج عام/);
  });
});
