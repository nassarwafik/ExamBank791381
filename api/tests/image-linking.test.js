import { describe, it, expect } from "vitest";
import {
  makeImageToken,
  inlineImageTokensIntoHtml,
  extractImageTokenIds,
  stripImageTokens,
  linkImagesToQuestions
} from "../src/lib/image-linking.js";

describe("makeImageToken / extractImageTokenIds", () => {
  it("round-trips an id through the token format", () => {
    expect(extractImageTokenIds(makeImageToken("docx-img-1"))).toEqual(["docx-img-1"]);
  });

  it("extracts multiple distinct tokens from one string", () => {
    const text = `before ${makeImageToken("a")} middle ${makeImageToken("b")} after`;
    expect(extractImageTokenIds(text)).toEqual(["a", "b"]);
  });

  it("returns an empty array when there are no tokens", () => {
    expect(extractImageTokenIds("plain text with no images")).toEqual([]);
  });
});

describe("inlineImageTokensIntoHtml", () => {
  it("converts an <img alt=token> tag into plain text at that position (DOCX image handling)", () => {
    const html = `<p>before</p><img src="" alt="${makeImageToken("docx-img-1")}"/><p>after</p>`;
    const result = inlineImageTokensIntoHtml(html);
    expect(result).toContain(makeImageToken("docx-img-1"));
    expect(result).not.toContain("<img");
  });
});

describe("stripImageTokens", () => {
  it("removes tokens and collapses the resulting whitespace", () => {
    const text = `Question text ${makeImageToken("x")} continues here.`;
    expect(stripImageTokens(text)).toBe("Question text  continues here.".replace(/ {2,}/g, " "));
  });

  // Regression coverage for the explicit requirement: a placeholder must NEVER show up as raw
  // text anywhere it gets rendered (Review / Exam Draft / Student Exam / Question Bank), even in
  // the imperfect case where an LLM doesn't reproduce the exact token byte-for-byte.
  it("still removes a token even if the AI reproduced it with only one bracket on each side", () => {
    expect(stripImageTokens("before [IMG:docx-img-1] after")).toBe("before after");
  });

  it("still removes a token even if the AI dropped the closing brackets", () => {
    expect(stripImageTokens("before [[IMG:docx-img-1 after")).toBe("before after");
  });

  it("never leaves any bracketed IMG: fragment visible in the final text under any of these variants", () => {
    for (const mangled of ["[[IMG:x]]", "[IMG:x]", "[IMG:x", "IMG:x]]"]) {
      const cleaned = stripImageTokens(`prefix ${mangled} suffix`);
      expect(cleaned).not.toMatch(/IMG:/);
    }
  });
});

describe("linkImagesToQuestions", () => {
  it("links an image whose token survived inside a question's own text (DOCX: same block stays linked)", () => {
    const questions = [{ importedQuestionId: "q1", text: `See this diagram: ${makeImageToken("docx-img-1")}` }];
    const images = [{ id: "docx-img-1" }];
    const { questions: linked, unassignedImageIds } = linkImagesToQuestions(questions, images);
    expect(linked[0].imageIds).toEqual(["docx-img-1"]);
    expect(linked[0].text).toBe("See this diagram:");
    expect(unassignedImageIds).toEqual([]);
  });

  it("links an HTML image the same way once its token is inside a question's verbatim text", () => {
    const questions = [{ importedQuestionId: "q1", text: `Question 1: see diagram ${makeImageToken("html-img-1")}` }];
    const images = [{ id: "html-img-1" }];
    const { questions: linked } = linkImagesToQuestions(questions, images);
    expect(linked[0].imageIds).toEqual(["html-img-1"]);
  });

  it("puts an image whose token never made it into any question's text into unassignedImageIds, without losing it", () => {
    const questions = [{ importedQuestionId: "q1", text: "Question 1 with no image reference." }];
    const images = [{ id: "orphan-img-1" }];
    const { questions: linked, unassignedImageIds } = linkImagesToQuestions(questions, images);
    expect(linked[0].imageIds).toEqual([]);
    expect(unassignedImageIds).toEqual(["orphan-img-1"]);
  });

  it("never links an image to a question purely because it is numerically/positionally close - only a literal token match counts", () => {
    const questions = [
      { importedQuestionId: "q1", text: "Question 1, no image here." },
      { importedQuestionId: "q2", text: `Question 2 has the image: ${makeImageToken("img-1")}` }
    ];
    const images = [{ id: "img-1" }];
    const { questions: linked } = linkImagesToQuestions(questions, images);
    expect(linked[0].imageIds).toEqual([]);
    expect(linked[1].imageIds).toEqual(["img-1"]);
  });

  it("ignores a token referencing an image id that doesn't actually exist in allImages", () => {
    const questions = [{ importedQuestionId: "q1", text: `text ${makeImageToken("missing-id")}` }];
    const { questions: linked, unassignedImageIds } = linkImagesToQuestions(questions, []);
    expect(linked[0].imageIds).toEqual([]);
    expect(unassignedImageIds).toEqual([]);
  });
});
