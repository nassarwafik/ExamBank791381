// 791381s Phase 2 — the validator's rules for REVEAL questions and the "practice" page layout («تدريبات الوحدة»).
import { describe, it, expect } from "vitest";
import { validateLearningCourseContent, type ContentIssueCode } from "./validation";
import { cloneCourse } from "./content.fixtures";
import type { ContentBlock, ContentPage, LearningCourseContent } from "./types";

const codes = (c: LearningCourseContent): ContentIssueCode[] => validateLearningCourseContent(c).map(i => i.code);
const SRC = cloneCourse().modules[0].lessons[0].pages[0].source;
const MC: ContentBlock = {
  id: "rv-q1", type: "practice", origin: "teacher-enrichment", reveal: true,
  question: { kind: "multipleChoice", prompt: "؟", options: [{ id: "a", text: "أ", correct: true }, { id: "b", text: "ب" }], feedback: { explanation: "لأن…" } },
};
const TF: ContentBlock = { id: "rv-q2", type: "practice", origin: "teacher-enrichment", reveal: true, question: { kind: "trueFalse", prompt: "؟", answer: false, feedback: { explanation: "لأن…" } } };
function withPage(blocks: ContentBlock[], layout?: ContentPage["layout"] | "weird"): LearningCourseContent {
  const c = cloneCourse();
  c.modules[0].lessons.push({ id: "f-m01-l09", title: "تدريبات الوحدة", order: 9, pages: [{ id: "f-m01-l09-p01", title: "تدريبات", order: 1, source: SRC, blocks, ...(layout ? { layout: layout as ContentPage["layout"] } : {}) }] });
  return c;
}

describe("reveal questions", () => {
  it("a keyed multipleChoice / trueFalse with an explanation is valid", () => {
    expect(validateLearningCourseContent(withPage([MC, TF], "practice"))).toEqual([]);
  });
  it("reveal must be exactly true, on multipleChoice / trueFalse only", () => {
    expect(codes(withPage([{ ...MC, reveal: "yes" } as unknown as ContentBlock]))).toContain("invalid-reveal");
    expect(codes(withPage([{ id: "rv-q3", type: "practice", origin: "teacher-enrichment", reveal: true, question: { kind: "shortInput", prompt: "؟", answer: "x", feedback: { explanation: "…" } } }]))).toContain("invalid-reveal");
  });
  it("an authored reveal question needs its key and its explanation", () => {
    const noKey = structuredClone(MC) as Extract<ContentBlock, { type: "practice" }>;
    if (noKey.question.kind === "multipleChoice") noKey.question.options = noKey.question.options.map(o => ({ id: o.id, text: o.text }));
    expect(codes(withPage([noKey]))).toContain("invalid-reveal");
    const noExplain = structuredClone(TF) as Extract<ContentBlock, { type: "practice" }>;
    noExplain.question.feedback = {};
    expect(codes(withPage([noExplain]))).toContain("invalid-reveal");
  });
  it("a SERVED reveal block (serverCheck, no key, no explanation) is valid — the server holds them", () => {
    const served = { id: "rv-q1", type: "practice", origin: "teacher-enrichment", reveal: true, serverCheck: true, question: { kind: "multipleChoice", prompt: "؟", options: [{ id: "a", text: "أ" }, { id: "b", text: "ب" }] } } as ContentBlock;
    expect(codes(withPage([served]))).not.toContain("invalid-reveal");
  });
});

describe("page layouts", () => {
  it("an unknown layout is reported", () => {
    expect(codes(withPage([MC], "weird"))).toContain("invalid-page-layout");
  });
  it("a practice page holds only teacher-enrichment blocks and at least one exercise", () => {
    expect(codes(withPage([{ id: "rv-t", type: "text", origin: "book", spans: [{ text: "نص من الكتاب" }] }, MC], "practice"))).toContain("invalid-page-layout");
    expect(codes(withPage([{ id: "rv-v", type: "visual", origin: "teacher-enrichment", visualId: "x", alt: "رسم" }], "practice"))).toContain("invalid-page-layout");
  });
});

// 791381s Phase 3 — the structured kinds (wordBank / matching / ordering / classify).
describe("structured questions", () => {
  const q = (question: unknown, extra: Record<string, unknown> = {}): ContentBlock => ({ id: "st-q", type: "practice", origin: "teacher-enrichment", question, ...extra } as ContentBlock);
  const WB = { kind: "wordBank", prompt: "أكمل", segments: ["أ ", { blank: "b1" }, " ب ", { blank: "b2" }], bank: ["x", "y", "z"], answers: { b1: "x", b2: "y" }, feedback: { explanation: "…" } };
  const MT = { kind: "matching", prompt: "صِل", left: [{ id: "l1", text: "أ" }, { id: "l2", text: "ب" }], right: [{ id: "r1", text: "1" }, { id: "r2", text: "2" }], pairs: { l1: "r2", l2: "r1" }, feedback: { explanation: "…" } };
  const OR = { kind: "ordering", prompt: "رتّب", items: [{ id: "c", text: "ج" }, { id: "a", text: "أ" }, { id: "b", text: "ب" }], order: ["a", "b", "c"], feedback: { explanation: "…" } };
  const CL = { kind: "classify", prompt: "صنّف", groups: [{ id: "g1", text: "1" }, { id: "g2", text: "2" }], items: [{ id: "i1", text: "أ" }, { id: "i2", text: "ب" }], assign: { i1: "g1", i2: "g2" }, feedback: { explanation: "…" } };

  it("well-formed questions of each kind are valid, plain and in reveal mode", () => {
    for (const x of [WB, MT, OR, CL]) {
      expect(validateLearningCourseContent(withPage([q(x)])), x.kind).toEqual([]);
      expect(validateLearningCourseContent(withPage([q(x, { reveal: true })], "practice")), x.kind).toEqual([]);
    }
  });
  it("wordBank: a blank is needed, ids unique, a word per blank, the key covers every blank with a bank word", () => {
    expect(codes(withPage([q({ ...WB, segments: ["بلا فراغ"] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...WB, segments: [{ blank: "b1" }, { blank: "b1" }] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...WB, bank: ["x"] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...WB, answers: { b1: "x" } })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...WB, answers: { b1: "x", b2: "not-in-bank" } })]))).toContain("invalid-structured-question");
  });
  it("matching: two items per side, enough right items, a one-to-one key", () => {
    expect(codes(withPage([q({ ...MT, left: [{ id: "l1", text: "أ" }] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...MT, pairs: { l1: "r1", l2: "r1" } })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...MT, pairs: { l1: "r9", l2: "r1" } })]))).toContain("invalid-structured-question");
  });
  it("ordering: three items, the key a permutation, and the items not authored in the answer order", () => {
    expect(codes(withPage([q({ ...OR, items: OR.items.slice(0, 2), order: ["a", "c"] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...OR, order: ["a", "b"] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...OR, order: ["c", "a", "b"] })]))).toContain("invalid-structured-question");
  });
  it("classify: two groups, every item assigned to an offered group", () => {
    expect(codes(withPage([q({ ...CL, groups: [{ id: "g1", text: "1" }] })]))).toContain("invalid-structured-question");
    expect(codes(withPage([q({ ...CL, assign: { i1: "g1", i2: "g9" } })]))).toContain("invalid-structured-question");
  });
  it("a served structured block (no key) is valid; reveal still needs the key and the explanation in authored content", () => {
    const { answers: _a, feedback: _f, ...servedWB } = WB;
    expect(codes(withPage([q(servedWB, { serverCheck: true, reveal: true })]))).toEqual([]);
    expect(codes(withPage([q({ ...CL, assign: undefined }, { reveal: true })]))).toContain("invalid-reveal");
    expect(codes(withPage([q({ ...OR, feedback: {} }, { reveal: true })]))).toContain("invalid-reveal");
  });
});
