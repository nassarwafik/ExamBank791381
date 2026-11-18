// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import ExamPreview from "./ExamPreview";

// Phase T3 — the teacher tries the allowed tools in the exam preview: the same dock the student gets, fed the SAME projection
// (toSafePreviewExam → canonical spec or nothing).

afterEach(cleanup);
const exam = (extra: Record<string, unknown>) => ({
  title: "امتحان",
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [{ examQuestionId: "a", text: "سؤال أ", marks: 1, presentationType: "open" }] }],
  ...extra
});

describe("T3 — student tools in the teacher preview", () => {
  it("shows the tool bar for an exam with tools, and the tools work", async () => {
    render(<ExamPreview exam={exam({ studentTools: { version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }] } })} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("student-tools-button"));
    fireEvent.click(within(screen.getByRole("group", { name: "الأدوات المسموحة" })).getByRole("button", { name: "آلة حاسبة" }));
    const panel = screen.getByRole("dialog", { name: "آلة حاسبة" });
    const input = within(panel).getByLabelText("العملية");
    fireEvent.change(input, { target: { value: "6*7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(panel).getByTestId("calc-result").textContent).toBe("= 42");
  });
  it("no tool bar without tools, or for a value the student would not receive", async () => {
    const a = render(<ExamPreview exam={exam({})} onClose={() => {}} />);
    await a.findByText("سؤال أ");
    expect(a.queryByTestId("student-tools-button")).toBeNull();
    a.unmount();
    const b = render(<ExamPreview exam={exam({ studentTools: { version: 1, tools: [{ id: "calculator", variant: "basic", angleUnit: "deg" }], extra: 1 } })} onClose={() => {}} />);
    await b.findByText("سؤال أ");
    expect(b.queryByTestId("student-tools-button")).toBeNull();
  });
});
