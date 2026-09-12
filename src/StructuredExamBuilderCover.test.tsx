// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { ExamPreview } from "./StructuredExamBuilder";
import type { StructuredExam } from "./examTypes";

afterEach(cleanup);

const WORD_BANK = ["DNS", "DHCP"];
const examWithCover = (coverPage: unknown): StructuredExam => ({
  examId: "E", title: "امتحان شهري", status: "draft", coverPage,
  sections: [{ id: "s", title: "القسم الأول", gradingPolicy: "all", maxMarks: null, requiredAnswers: null, answerUnit: "question", stimuli: {},
    questions: [{ examQuestionId: "wb", presentationType: "wordBank", text: "طابق", marks: 2, wordBank: WORD_BANK, fields: [{ id: "f1", label: "L1" }] }] }]
} as unknown as StructuredExam);

const selects = (c: HTMLElement) => Array.from(c.querySelectorAll("select")) as HTMLSelectElement[];

describe("ExamPreview cover gate", () => {
  it("B & C: cover enabled → cover shown first, questions NOT rendered behind it", () => {
    const { container } = render(<ExamPreview exam={examWithCover({ enabled: true, activityType: "exam" })} onClose={() => {}} />);
    expect(container.querySelector(".iex-cover-start")).toBeTruthy();
    expect(selects(container)).toHaveLength(0); // no question controls yet
    expect(container.querySelector(".sb-preview-note")).toBeNull();
  });

  it("D & R: pressing Start reveals the existing INTERACTIVE questions (PR #54 preview still works)", () => {
    const { container } = render(<ExamPreview exam={examWithCover({ enabled: true })} onClose={() => {}} />);
    fireEvent.click(container.querySelector(".iex-cover-start") as HTMLButtonElement);
    expect(container.querySelector(".iex-cover-start")).toBeNull(); // cover dismissed
    const ss = selects(container);
    expect(ss).toHaveLength(1);
    expect(ss[0].disabled).toBe(false);
    fireEvent.change(ss[0], { target: { value: "DNS" } });
    expect(ss[0].value).toBe("DNS"); // still interactive after Start
  });

  it("T: cover disabled → questions render directly (no cover)", () => {
    const { container } = render(<ExamPreview exam={examWithCover({ enabled: false })} onClose={() => {}} />);
    expect(container.querySelector(".iex-cover-start")).toBeNull();
    expect(selects(container)).toHaveLength(1);
  });

  it("no coverPage at all → behaves exactly as before (questions directly)", () => {
    const { container } = render(<ExamPreview exam={examWithCover(undefined)} onClose={() => {}} />);
    expect(container.querySelector(".iex-cover-start")).toBeNull();
    expect(selects(container)).toHaveLength(1);
  });

  it("S: closing (unmount) then reopening resets the cover Start state (cover shows again)", () => {
    const first = render(<ExamPreview exam={examWithCover({ enabled: true })} onClose={() => {}} />);
    fireEvent.click(first.container.querySelector(".iex-cover-start") as HTMLButtonElement);
    expect(selects(first.container)).toHaveLength(1); // questions showing
    first.unmount();
    const second = render(<ExamPreview exam={examWithCover({ enabled: true })} onClose={() => {}} />);
    expect(second.container.querySelector(".iex-cover-start")).toBeTruthy(); // cover again
    expect(selects(second.container)).toHaveLength(0);
  });

  it("preview cover shows placeholder identity, banner-free cover renders fine", () => {
    const { container } = render(<ExamPreview exam={examWithCover({ enabled: true, showStudentName: true })} onClose={() => {}} />);
    expect(container.textContent).toContain("طالب تجريبي");
  });
});
