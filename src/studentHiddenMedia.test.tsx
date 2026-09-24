// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { sanitizeExamForStudent } from "../api/src/lib/student-exam-sanitize.js";
import { parseStructuredExamJson } from "./structuredExamImport";
import StudentQuestionCard, { type Question } from "./StudentQuestionCard";
import CompoundQuestion from "./CompoundQuestion";
import { setVisibilityPatch, isImageHidden } from "./questionMedia";
import { toSavedStructuredExam } from "./examBuilderState";
import { toSafePreviewExam } from "./examPreviewModel";
import type { BuilderQuestion, StructuredExam } from "./examTypes";

// Hidden question media, end to end through the REAL paths: JSON import → teacher state → persistence model
// (toSavedStructuredExam + JSON round trip) → the real student sanitizer → the real student renderers; and the
// teacher's full-exam preview model. Invariant: media the teacher has hidden is neither rendered for, nor
// present in the payload of, the student — and the teacher keeps the original bytes to show it again.

afterEach(cleanup);

const HIDDEN = "data:image/png;base64,SElEREVO";
const LEGACY = "data:image/png;base64,TEVHQUNZ";
const SHOWN = "data:image/png;base64,U0hPV04=";
const noop = () => {};
const studentImgs = (q: unknown) => {
  const r = render(<StudentQuestionCard q={q as Question} index={0} id="x" answer={undefined as never} onChoice={noop} onSeq={noop} onTable={noop} onText={noop} onField={noop} />);
  const srcs = Array.from(r.container.querySelectorAll("img.iex-image")).map(i => i.getAttribute("src"));
  r.unmount();
  return srcs;
};
const compoundImgs = (q: unknown) => {
  const r = render(<CompoundQuestion q={q as Question} index={0} id="x" answer={undefined as never} onPart={noop as never} />);
  const n = r.container.querySelectorAll("img.iex-image").length;
  r.unmount();
  return n;
};
const student = (exam: StructuredExam) => sanitizeExamForStudent(JSON.parse(JSON.stringify(exam))) as unknown as StructuredExam;
const firstQ = (exam: { sections: { questions: unknown[] }[] }) => exam.sections[0].questions[0] as BuilderQuestion;

const imported = (question: Record<string, unknown>) => {
  const r = parseStructuredExamJson(JSON.stringify({ examId: "imp", title: "t", schemaVersion: 2, sections: [{ id: "s", title: "S", gradingPolicy: "all",
    questions: [{ examQuestionId: "q", presentationType: "shortAnswer", text: "t", marks: 1, answer: { text: "a" }, ...question }] }] }));
  expect(r.exam).toBeTruthy();
  return r.exam as StructuredExam;
};

describe("hidden canonical image + legacy images[] (real JSON import)", () => {
  it("C: the teacher sees 'hidden'; the student payload carries no image and the student renders 0 images", () => {
    const exam = imported({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] });
    expect(isImageHidden(firstQ(exam))).toBe(true);                            // editor: «مخفية عن الطالب»
    const s = student(exam);
    const json = JSON.stringify(s);
    expect(json).not.toContain(HIDDEN);
    expect(json).not.toContain(LEGACY);
    expect(studentImgs(firstQ(s))).toEqual([]);
  });

  it("C (compound renderer): the same rule holds for a compound question", () => {
    const exam = imported({ presentationType: "compound", parts: [{ id: "p1", type: "shortAnswer", text: "p", marks: 1 }], image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] });
    expect(compoundImgs(firstQ(student(exam)))).toBe(0);
  });

  it("C (teacher preview parity): the full-exam preview shows what the student gets — 0 images", () => {
    const exam = imported({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] }, images: [{ dataUrl: LEGACY }] });
    const preview = toSafePreviewExam(exam) as unknown as StructuredExam;
    expect(studentImgs(firstQ(preview))).toEqual([]);
    expect(JSON.stringify(exam)).toContain(HIDDEN);                          // the source exam is untouched
  });
});

describe("modern and legacy-only media", () => {
  it("A: hidden modern image → no bytes in the payload, 0 images rendered", () => {
    const exam = imported({ image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN }] } });
    const s = student(exam);
    expect(JSON.stringify(s)).not.toContain(HIDDEN);
    expect(studentImgs(firstQ(s))).toEqual([]);
  });
  it("B: visible modern image → present in the payload and rendered", () => {
    const s = student(imported({ image: { exists: true, visible: true, assets: [{ dataUrl: SHOWN }] } }));
    expect(studentImgs(firstQ(s))).toEqual([SHOWN]);
  });
  it("D: legacy-only images[] (no canonical visibility) → still received and rendered, in both renderers", () => {
    for (const extra of [{}, { image: { exists: false, visible: false, assets: [] } }]) {
      const s = student(imported({ ...extra, images: [{ dataUrl: LEGACY }] }));
      expect(studentImgs(firstQ(s))).toEqual([LEGACY]);
      const c = student(imported({ ...extra, presentationType: "compound", parts: [{ id: "p1", type: "shortAnswer", text: "p", marks: 1 }], images: [{ dataUrl: LEGACY }] }));
      expect(compoundImgs(firstQ(c))).toBe(1);
    }
  });
  it("D': a malformed canonical image without an assets array renders exactly as before sanitization (both renderers)", () => {
    const raw = imported({ image: { exists: true, visible: true }, images: [{ dataUrl: LEGACY }] });
    expect(studentImgs(firstQ(student(raw)))).toEqual(studentImgs(firstQ(raw)));
    expect(studentImgs(firstQ(raw))).toEqual([LEGACY]);
    const rawC = imported({ presentationType: "compound", parts: [{ id: "p1", type: "shortAnswer", text: "p", marks: 1 }], image: { exists: true, visible: true }, images: [{ dataUrl: LEGACY }] });
    expect(compoundImgs(firstQ(student(rawC)))).toBe(compoundImgs(firstQ(rawC)));
  });
});

describe("E: hide → save → student → show → save → student", () => {
  const apply = (exam: StructuredExam, patch: Partial<BuilderQuestion>): StructuredExam => ({
    ...exam, sections: exam.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q" ? { ...q, ...patch } : q)) }))
  });
  const save = (exam: StructuredExam): StructuredExam => JSON.parse(JSON.stringify(toSavedStructuredExam(exam)));   // persisted form

  for (const [label, start] of [
    ["canonical image", { image: { exists: true, visible: true, assets: [{ id: "a", dataUrl: SHOWN }] } }],
    ["legacy images[]-only", { images: [{ dataUrl: SHOWN }] }]
  ] as const) {
    it(label + ": hidden bytes never reach the student, the teacher keeps them, and show restores the SAME image", () => {
      let exam = imported(start as Record<string, unknown>);
      expect(studentImgs(firstQ(student(save(exam))))).toEqual([SHOWN]);

      exam = save(apply(exam, setVisibilityPatch(firstQ(exam), false)));    // teacher hides, saves
      expect(JSON.stringify(exam)).toContain(SHOWN);                        // teacher's stored bytes kept
      const hidden = student(exam);
      expect(JSON.stringify(hidden)).not.toContain(SHOWN);
      expect(studentImgs(firstQ(hidden))).toEqual([]);

      exam = save(apply(exam, setVisibilityPatch(firstQ(exam), true)));     // teacher shows again, saves
      expect(studentImgs(firstQ(student(exam)))).toEqual([SHOWN]);
    });
  }
});

describe("F: answer sanitization is unaffected", () => {
  it("answers, options' correct flags and image prompts are still removed from the student payload", () => {
    const exam = imported({ presentationType: "multipleChoice", options: [{ text: "a", correct: true }, { text: "b" }], answer: { correctOptionIndex: 0 },
      image: { exists: true, visible: false, assets: [{ dataUrl: HIDDEN, prompt: "P" }], prompt: "P" } });
    const q = firstQ(student(exam)) as unknown as Record<string, unknown>;
    expect(q.answer).toEqual({});
    expect(JSON.stringify(q)).not.toMatch(/correct|"prompt"/);
  });
});
