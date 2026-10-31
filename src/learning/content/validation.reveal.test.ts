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
