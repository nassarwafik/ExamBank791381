// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import ExamPreview from "./ExamPreview";

afterEach(cleanup);

const q = (id: string, text: string, over: Record<string, unknown> = {}) => ({ examQuestionId: id, text, marks: 5, presentationType: "open", ...over });
const flat = (over: Record<string, unknown> = {}) => ({ title: "امتحان", presentationTheme: "classic", questions: [q("q1", "سؤال أول"), q("q2", "سؤال ثاني"), q("q3", "سؤال ثالث")], ...over });
const structured = (over: Record<string, unknown> = {}) => ({
  title: "امتحان",
  sections: [
    { id: "s1", title: "القسم الأول", instructions: "تعليمات القسم الأول", gradingPolicy: "all", questions: [q("a", "سؤال أ")] },
    { id: "s2", title: "القسم الثاني", instructions: "تعليمات القسم الثاني", gradingPolicy: "all", questions: [q("b", "سؤال ب")] }
  ], ...over
});
const order = (txt: string, ...needles: string[]) => needles.map(n => txt.indexOf(n));
const R = (exam: Record<string, unknown>) => render(<ExamPreview exam={exam} onClose={() => {}} />);

describe("R15 ExamPreview — faithful, safe, isolated", () => {
  it("A: a flat exam renders questions in order, with no section header", () => {
    const { container } = R(flat());
    const t = container.textContent || "";
    const [a, b, c] = order(t, "سؤال أول", "سؤال ثاني", "سؤال ثالث");
    expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(b); expect(b).toBeLessThan(c);
    expect(t).not.toContain("القسم 1");
  });

  it("B: a structured exam preserves section titles, section instructions and cross-section order", () => {
    const { container } = R(structured());
    const t = container.textContent || "";
    expect(t).toContain("القسم الأول"); expect(t).toContain("تعليمات القسم الأول");
    expect(t).toContain("القسم الثاني"); expect(t).toContain("تعليمات القسم الثاني");
    const [a, b] = order(t, "سؤال أ", "سؤال ب");
    expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(b);
  });

  it("C+D: a cover-enabled exam opens on the cover; starting reveals the body with NO network call", () => {
    const fetchSpy = vi.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchSpy;
    const { container, getByText } = R(structured({ coverPage: { enabled: true, activityType: "exam" } }));
    expect(container.textContent).toContain("ابدأ الامتحان");
    expect(container.textContent).not.toContain("سؤال أ");   // body hidden behind cover
    fireEvent.click(getByText("ابدأ الامتحان"));
    expect(container.textContent).toContain("سؤال أ");        // body now shown
    expect(fetchSpy).not.toHaveBeenCalled();                  // preview never starts a real attempt
  });

  it("E: cover disabled opens directly on the body", () => {
    const { container } = R(structured({ coverPage: { enabled: false } }));
    expect(container.textContent).toContain("سؤال أ");
    expect(container.textContent).not.toContain("ابدأ الامتحان");
  });

  it("F+G: focus theme (flat) shows focus navigation and advances", () => {
    const { container, getByText } = R(flat({ presentationTheme: "focus", questions: [q("q1", "سؤال أول"), q("q2", "سؤال ثاني")] }));
    expect(container.querySelector(".exam-theme-focus")).toBeTruthy();
    expect(container.textContent).toContain("السؤال 1 من 2");
    fireEvent.click(getByText("التالي ▶"));
    expect(container.textContent).toContain("السؤال 2 من 2");
  });

  it("L: cover marks distribution matches the authoritative structure total", () => {
    // two sections × one 5-mark question = 10.
    const { container } = R(structured({ coverPage: { enabled: true, showMarksDistribution: true, showTotalMarks: true } }));
    expect(container.textContent).toContain("10 علامة");
  });

  it("J: grading secrets never reach the preview DOM", () => {
    const { container } = R(structured({
      sections: [{ id: "s", title: "ق", gradingPolicy: "all", questions: [
        { examQuestionId: "q", text: "سؤال", marks: 5, presentationType: "multipleChoice",
          answer: { correctOptionIndex: 1, note: "SECRET_ANSWER_XYZ" },
          options: [{ text: "أ", correct: false }, { text: "ب", correct: true }] }
      ] }]
    }));
    expect(container.textContent).toContain("سؤال");
    expect(container.innerHTML).not.toContain("SECRET_ANSWER_XYZ");
    expect(container.innerHTML).not.toContain("correctOptionIndex");
  });

  it("B(general): exam-level general instructions render as a labeled bullet block for a structured exam", () => {
    const { container } = R(structured({ metadata: { generalInstructions: "اقرأ جيدًا\nراجع إجاباتك" } }));
    expect(container.textContent).toContain("التعليمات العامة");
    expect(container.textContent).toContain("اقرأ جيدًا");
    expect(container.textContent).toContain("راجع إجاباتك");
  });

  it("C(general): general instructions render for a legacy flat exam", () => {
    const { container } = R(flat({ metadata: { generalInstructions: "تعليمات عامة للطالب" } }));
    expect(container.textContent).toContain("التعليمات العامة");
    expect(container.textContent).toContain("تعليمات عامة للطالب");
  });

  it("D(general): general and section instructions are separate coexisting layers", () => {
    const { container } = R(structured({ metadata: { generalInstructions: "تعليمات عامة" } }));
    const t = container.textContent || "";
    expect(t).toContain("التعليمات العامة"); expect(t).toContain("تعليمات عامة");   // exam-level
    expect(t).toContain("تعليمات القسم الأول"); expect(t).toContain("تعليمات القسم الثاني"); // section-level
    // exam-level general instructions appear before the first section instruction
    expect(t.indexOf("تعليمات عامة")).toBeLessThan(t.indexOf("تعليمات القسم الأول"));
  });

  it("E(general): HTML-like general-instruction text renders as text, not HTML", () => {
    const { container } = R(structured({ metadata: { generalInstructions: "<b>خطر</b>" } }));
    const block = container.querySelector(".iex-general-instructions") as HTMLElement;
    expect(block).toBeTruthy();
    expect(block.querySelector("b")).toBeNull();                 // not parsed as HTML
    expect(block.textContent).toContain("<b>خطر</b>");           // shown literally
  });

  it("I+M: changing the source exam (legacy flat) shows only the new exam, no stale question", () => {
    const { container, rerender } = render(<ExamPreview exam={flat({ questions: [q("q1", "سؤال قديم")] })} onClose={() => {}} />);
    expect(container.textContent).toContain("سؤال قديم");
    rerender(<ExamPreview exam={flat({ questions: [q("q9", "سؤال جديد")] })} onClose={() => {}} />);
    expect(container.textContent).toContain("سؤال جديد");
    expect(container.textContent).not.toContain("سؤال قديم");
  });
});
