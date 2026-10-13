// @vitest-environment happy-dom
// Phase 21E.3 — assessment integrity: a question that could not be DISPLAYED is never presented to the student as a question
// they «did not answer». Fail-first on 593fd47 (the review screen and navigator knew only مُجاب / غير مُجاب, and the submit
// confirmation said nothing).
//   RU-1  pageStatus distinguishes «تعذّر عرضه» (failed renderer, no answer) from «غير مُجاب»; an answer always wins
//   RU-2  the review screen counts the unavailable questions separately, with a clear note, and the shared list labels them
//   RU-3  the navigator dialog carries the same distinction
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createRef } from "react";
import { buildQuestionPages, pageStatus, countAnsweredPages, PAGE_STATUS_LABELS } from "./questionPager";
import ExamReviewScreen from "./ExamReviewScreen";
import QuestionNavigatorDialog from "./QuestionNavigatorDialog";
import { normalizeExamStructure } from "../../examStructure";
import type { Question, Answer } from "../../StudentQuestionCard";

afterEach(cleanup);
const Q = (id: string): Question => ({ examQuestionId: id, presentationType: "multipleChoice", text: "س " + id, marks: 1, options: [{ text: "أ" }, { text: "ب" }] } as unknown as Question);
const exam = { questions: [Q("q1"), Q("q2"), Q("q3")] };
const pages = buildQuestionPages(normalizeExamStructure(exam), exam.questions);
const answers: Record<string, Answer> = { q1: { kind: "choice", index: 0 } };
const unavailable = new Set(["q2"]);

describe("RU-1 — page status", () => {
  it("a failed, unanswered question is «تعذّر عرضه»; a failed but answered one stays «مُجاب»; plain blanks stay «غير مُجاب»", () => {
    expect(pageStatus(pages[1], answers, null, unavailable)).toBe("unavailable");
    expect(pageStatus(pages[0], answers, null, new Set(["q1"]))).toBe("answered");
    expect(pageStatus(pages[2], answers, null, unavailable)).toBe("unanswered");
    expect(pageStatus(pages[1], answers, 1, unavailable)).toBe("current");
    expect(PAGE_STATUS_LABELS.unavailable).toBe("تعذّر عرضه");
    expect(countAnsweredPages(pages, answers)).toBe(1);
  });
});

describe("RU-2 — the review screen", () => {
  it("shows a separate «تعذّر عرضه» count, keeps «غير مُجاب» for genuine blanks, and explains that such a question is not treated as a wrong answer", () => {
    render(<ExamReviewScreen title="امتحان" pages={pages} answers={answers} sections={[]} headingRef={createRef<HTMLHeadingElement>()} onJump={() => {}} onBackToAnswering={() => {}} onSubmit={() => {}} submitBusy={false} submitDisabled={false} unavailable={unavailable} />);
    const stats = document.querySelector(".iex-review-stats")!;
    const cell = (label: string) => Array.from(stats.querySelectorAll("div")).find(d => d.querySelector("dt")?.textContent === label)?.querySelector("dd")?.textContent;
    expect(cell("مُجاب")).toBe("1");
    expect(cell("غير مُجاب")).toBe("1");
    expect(cell("تعذّر عرضه")).toBe("1");
    const note = screen.getByTestId("review-unavailable-note");
    expect(note.textContent).toContain("تعذّر عرض");
    expect(note.textContent).toContain("لن يُحتسب");
    expect(screen.getByRole("button", { name: "السؤال 2 — تعذّر عرضه" }).className).toContain("is-unavailable");
    expect(screen.getByRole("button", { name: "السؤال 3 — غير مُجاب" })).toBeTruthy();
  });
  it("without failures nothing new is shown", () => {
    render(<ExamReviewScreen title="امتحان" pages={pages} answers={answers} sections={[]} headingRef={createRef<HTMLHeadingElement>()} onJump={() => {}} onBackToAnswering={() => {}} onSubmit={() => {}} submitBusy={false} submitDisabled={false} />);
    expect(screen.queryByTestId("review-unavailable-note")).toBeNull();
    expect(document.querySelector(".iex-review-stats")!.textContent).not.toContain("تعذّر عرضه");
  });
});

describe("RU-3 — the navigator dialog", () => {
  it("labels the unavailable question in the same words", () => {
    render(<QuestionNavigatorDialog open onClose={() => {}} pages={pages} answers={answers} currentIndex={0} onJump={() => {}} answeredCount={1} unavailable={unavailable} />);
    expect(screen.getByRole("button", { name: "السؤال 2 — تعذّر عرضه" })).toBeTruthy();
  });
});
