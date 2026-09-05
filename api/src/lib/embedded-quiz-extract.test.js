import { describe, it, expect } from "vitest";
import { parseLiteral, extractEmbeddedQuestionBank, renderQuestionBankAsText } from "./embedded-quiz-extract.js";

describe("parseLiteral - a safe, non-executing subset of JS array/object literal syntax", () => {
  it("parses a simple array of objects with string/number/array values", () => {
    const source = '[{ a: "x", b: 5, c: ["y", "z"] }]';
    expect(parseLiteral(source).value).toEqual([{ a: "x", b: 5, c: ["y", "z"] }]);
  });

  it("handles unquoted keys, single/double-quoted strings, and negative numbers", () => {
    const source = "[{ text: 'hi', answer: -1 }]";
    expect(parseLiteral(source).value).toEqual([{ text: "hi", answer: -1 }]);
  });

  it("skips // and /* */ comments", () => {
    const source = '[\n  // a comment\n  { a: 1 }, /* another */ { b: 2 }\n]';
    expect(parseLiteral(source).value).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles \\u escapes and standard escape sequences inside strings", () => {
    const source = String.raw`["line1\nline2", "A"]`;
    expect(parseLiteral(source).value).toEqual(["line1\nline2", "A"]);
  });

  it("allows a trailing comma before the closing bracket", () => {
    expect(parseLiteral("[1, 2, 3,]").value).toEqual([1, 2, 3]);
  });

  it("parses true/false/null", () => {
    expect(parseLiteral("[true, false, null]").value).toEqual([true, false, null]);
  });

  // Security-critical: this parser must NEVER execute code. Anything outside the narrow literal
  // grammar (function calls, template-literal interpolation, bare identifiers other than
  // true/false/null, ...) must throw rather than silently succeed or execute.
  describe("rejects (throws on) anything that isn't a plain data literal", () => {
    it.each([
      '[require("fs")]',
      "[(function(){return 1})()]",
      "[`${1+1}`]",
      "[globalThis]",
      "[new Date()]",
      "[1 + 1]",
      "[eval('1')]"
    ])("rejects: %s", source => {
      expect(() => parseLiteral(source)).toThrow();
    });
  });
});

describe("extractEmbeddedQuestionBank", () => {
  const html = `
    <html><body></body>
    <script>
    const QUESTIONS = [
      { topic:"شبكات", text:"ما هي الشبكة؟", options:["أ","ب","ج"], answer:1, explain:"لأنها كذلك" },
      { text:"سؤال بلا موضوع", options:["نعم","لا"], answer:0 }
    ];
    </script></html>
  `;

  it("finds and safely parses a const QUESTIONS = [...] array embedded in a <script> tag", () => {
    const questions = extractEmbeddedQuestionBank(html);
    expect(questions).toHaveLength(2);
    expect(questions[0].text).toBe("ما هي الشبكة؟");
    expect(questions[0].options).toEqual(["أ", "ب", "ج"]);
    expect(questions[0].answer).toBe(1);
  });

  it("also recognizes `let` and `var` declarations", () => {
    expect(extractEmbeddedQuestionBank(html.replace("const QUESTIONS", "let QUESTIONS"))).toHaveLength(2);
    expect(extractEmbeddedQuestionBank(html.replace("const QUESTIONS", "var QUESTIONS"))).toHaveLength(2);
  });

  it("returns null when there is no QUESTIONS array at all (an ordinary HTML page)", () => {
    expect(extractEmbeddedQuestionBank("<html><body><p>نص عادي</p></body></html>")).toBeNull();
  });

  it("returns null (never throws) when the array contains unsafe/non-literal syntax", () => {
    const unsafe = "<script>const QUESTIONS = [{ text: require('fs').readFileSync('/etc/passwd') }];</script>";
    expect(() => extractEmbeddedQuestionBank(unsafe)).not.toThrow();
    expect(extractEmbeddedQuestionBank(unsafe)).toBeNull();
  });

  it("drops items that don't match the expected question shape instead of guessing", () => {
    const mixed = `<script>const QUESTIONS = [
      { text:"صالح", options:["أ","ب"], answer:0 },
      { text:"", options:["أ","ب"], answer:0 },
      { text:"بلا خيارات كافية", options:["أ"], answer:0 },
      { text:"إجابة خارج المدى", options:["أ","ب"], answer:5 },
      { options:["أ","ب"], answer:0 }
    ];</script>`;
    const questions = extractEmbeddedQuestionBank(mixed);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe("صالح");
  });

  it("returns null when every item is invalid, rather than an empty-but-truthy array", () => {
    const allInvalid = '<script>const QUESTIONS = [{ text:"" }];</script>';
    expect(extractEmbeddedQuestionBank(allInvalid)).toBeNull();
  });
});

describe("renderQuestionBankAsText", () => {
  it("renders each question with lettered options and an explicit correct-answer line", () => {
    const text = renderQuestionBankAsText([
      { topic: "شبكات", text: "ما هي الشبكة؟", options: ["أ", "ب", "ج"], answer: 1 }
    ]);
    expect(text).toContain("السؤال 1:");
    expect(text).toContain("الموضوع: شبكات");
    expect(text).toContain("ما هي الشبكة؟");
    expect(text).toContain("A) أ");
    expect(text).toContain("B) ب");
    expect(text).toContain("الإجابة الصحيحة: ب");
  });

  it("copies the option text verbatim as the correct answer - never invents or rephrases it", () => {
    const text = renderQuestionBankAsText([
      { text: "س", options: ["Network Address", "Host Part"], answer: 0 }
    ]);
    expect(text).toContain("الإجابة الصحيحة: Network Address");
  });

  it("joins multiple questions with a clear separator", () => {
    const text = renderQuestionBankAsText([
      { text: "س1", options: ["أ", "ب"], answer: 0 },
      { text: "س2", options: ["أ", "ب"], answer: 1 }
    ]);
    expect(text).toContain("السؤال 1:");
    expect(text).toContain("السؤال 2:");
    expect(text.indexOf("السؤال 1:")).toBeLessThan(text.indexOf("السؤال 2:"));
  });
});
