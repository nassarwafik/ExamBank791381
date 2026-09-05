import { describe, it, expect } from "vitest";
import { mapF03Question, mapF06Question, extractF03ImagesByQid } from "./library-json-map.js";

describe("mapF03Question", () => {
  it("maps mcq using the numeric answer index directly", () => {
    const raw = { id: "s1q1", type: "mcq", text: "س", options: ["TCP", "IP", "DHCP"], answer: "0" };
    const q = mapF03Question(raw, { examId: "LIB-F03", ordinal: 1, marks: 4 });
    expect(q.presentationType).toBe("multipleChoice");
    expect(q.answer).toEqual({ correctOptionIndex: 0 });
  });

  it("maps a text question with a single answer to open+answer.text", () => {
    const raw = { id: "s1q11", type: "text", text: "___ يترجم الأسماء", answers: ["dns"] };
    const q = mapF03Question(raw, { examId: "LIB-F03", ordinal: 1, marks: 4 });
    expect(q.presentationType).toBe("open");
    expect(q.answer).toEqual({ text: "dns" });
  });

  it("maps tf statements to a boolean matching table", () => {
    const raw = { id: "s1q20", type: "tf2", text: "صح/خطأ", statements: ["قول 1", "قول 2"], answers: ["صحيح", "غير صحيح"] };
    const q = mapF03Question(raw, { examId: "LIB-F03", ordinal: 1, marks: 4 });
    expect(q.presentationType).toBe("matching");
    expect(q.answer.text).toBe("قول 1=صحيح؛ قول 2=غير صحيح");
    expect(q.fields[0].options.map(o => o.value)).toEqual(["صحيح", "غير صحيح"]);
  });

  it("attaches an image linked by data-qid, when present", () => {
    const raw = { id: "s1q6", type: "mcq_img", text: "تمعّن", options: ["a", "b", "c"], answer: "2" };
    const imagesByQid = new Map([["s1q6", { contentType: "image/png", base64: "AAAA" }]]);
    const q = mapF03Question(raw, { examId: "LIB-F03", ordinal: 1, marks: 4, imagesByQid });
    expect(q.image.exists).toBe(true);
    expect(q.image.assets[0].dataUrl).toBe("data:image/png;base64,AAAA");
  });
});

describe("mapF06Question", () => {
  it("maps radio using the `correct` option value", () => {
    const raw = { id: "b3", type: "radio", text: "س", options: [{ v: "a", t: "A" }, { v: "c", t: "C" }], correct: "c" };
    const q = mapF06Question(raw, { examId: "LIB-F06", ordinal: 1, marks: 3, imagesMap: {} });
    expect(q.answer).toEqual({ correctOptionIndex: 1 });
  });

  it("flags a text question with several accepted answers for review (grading compares one only)", () => {
    const raw = { id: "b2", type: "text", text: "س", field: "b2", acceptAny: ["11111111", "255"] };
    const q = mapF06Question(raw, { examId: "LIB-F06", ordinal: 1, marks: 3, imagesMap: {} });
    expect(q.presentationType).toBe("open");
    expect(q.requiresManualReview).toBe(true);
  });

  it("maps multiText fields to a matching table graded per field", () => {
    const raw = { id: "b1", type: "multiText", text: "س", fields: [{ id: "b1a", label: "عشري" }, { id: "b1b", label: "ثنائي" }], accept: ["205", "11001101"] };
    const q = mapF06Question(raw, { examId: "LIB-F06", ordinal: 1, marks: 3, imagesMap: {} });
    expect(q.presentationType).toBe("matching");
    expect(q.answer.text).toBe("عشري=205؛ ثنائي=11001101");
  });

  it("keeps heterogeneous combo questions as open + manual review, never a wrong single unit", () => {
    const raw = { id: "i8", type: "combo", text: "س", parts: [{ kind: "radio" }, { kind: "text" }], accept: ["x"] };
    const q = mapF06Question(raw, { examId: "LIB-F06", ordinal: 1, marks: 4, imagesMap: {} });
    expect(q.presentationType).toBe("open");
    expect(q.requiresManualReview).toBe(true);
  });

  it("attaches base64 images from the images map by key", () => {
    const raw = { id: "b16", type: "textImage", text: "س", field: "b16", image: "p08", acceptAny: ["15.0.0.0"] };
    const q = mapF06Question(raw, { examId: "LIB-F06", ordinal: 1, marks: 3, imagesMap: { p08: "ZZZZ" } });
    expect(q.image.exists).toBe(true);
    expect(q.image.assets[0].dataUrl).toBe("data:image/png;base64,ZZZZ");
  });
});

describe("extractF03ImagesByQid", () => {
  it("links inline data-uri images to their card's data-qid", () => {
    const html = `<div class='q-card' id='card_s1q6' data-qid='s1q6'><div class='q-text'>س</div><img src='data:image/png;base64,ABC'></div>`;
    const map = extractF03ImagesByQid(html);
    expect(map.get("s1q6")).toEqual({ contentType: "image/png", base64: "ABC" });
  });
});
