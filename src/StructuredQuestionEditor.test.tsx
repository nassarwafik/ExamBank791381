// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";
import StructuredQuestionEditor from "./StructuredQuestionEditor";
import { newQuestion } from "./examBuilderState";

afterEach(cleanup);

const baseProps = (over = {}) => ({
  question: newQuestion("multipleChoice"),
  index: 0,
  total: 2,
  sectionOptions: [{ id: "s1", title: "القسم الأول" }, { id: "s2", title: "القسم الثاني" }],
  currentSectionId: "s1",
  groupOptions: [{ id: "g1", label: "مادة مشتركة" }],
  onChange: vi.fn(),
  onDelete: vi.fn(),
  onMove: vi.fn(),
  onDuplicate: vi.fn(),
  onMoveToSection: vi.fn(),
  onPreview: vi.fn(),
  ...over,
});

describe("StructuredQuestionEditor — exam chrome after extraction", () => {
  it("still renders the number badge, exam-only metadata, and the delegated composer content", () => {
    const { container } = render(<StructuredQuestionEditor {...baseProps()} />);
    const head = container.querySelector(".sb-q-head") as HTMLElement;
    expect(within(head).getByText("1")).toBeTruthy();                            // display-number badge (index+1)
    expect(screen.getByPlaceholderText("1")).toBeTruthy();                        // display-number input
    // group + move-to-section selects (exam-only chrome) present
    expect(screen.getByText("المادة المشتركة")).toBeTruthy();
    expect(screen.getByText("نقل إلى قسم")).toBeTruthy();
    // composer content is delegated in
    expect(container.querySelector(".sb-composer")).toBeTruthy();
    expect(screen.getByLabelText("نوع السؤال")).toBeTruthy();
    expect(container.querySelector(".sb-options")).toBeTruthy();
  });

  it("all 11 question types remain selectable through the composer", () => {
    render(<StructuredQuestionEditor {...baseProps()} />);
    expect((screen.getByLabelText("نوع السؤال") as HTMLSelectElement).querySelectorAll("option").length).toBe(11);
  });

  it("preview / move / duplicate / delete callbacks still fire", () => {
    const p = baseProps();
    const { container } = render(<StructuredQuestionEditor {...p} />);
    const head = within(container.querySelector(".sb-q-head") as HTMLElement);   // scope to the question row (not option rows)
    fireEvent.click(head.getByTitle("معاينة الطالب")); expect(p.onPreview).toHaveBeenCalledTimes(1);
    fireEvent.click(head.getByTitle("أسفل")); expect(p.onMove).toHaveBeenCalledWith(1);
    fireEvent.click(head.getByTitle("تكرار")); expect(p.onDuplicate).toHaveBeenCalledTimes(1);
    fireEvent.click(head.getByTitle("حذف")); expect(p.onDelete).toHaveBeenCalledTimes(1);
  });

  it("display-number and marks edits reach onChange (exam-only metadata still wired)", () => {
    const p = baseProps();
    render(<StructuredQuestionEditor {...p} />);
    fireEvent.change(screen.getByPlaceholderText("1"), { target: { value: "3أ" } });
    expect(p.onChange).toHaveBeenCalledWith({ displayNumber: "3أ" });
  });

  it("content edits from the composer reach the same onChange", () => {
    const p = baseProps();
    render(<StructuredQuestionEditor {...p} />);
    fireEvent.change(screen.getByPlaceholderText("نص السؤال"), { target: { value: "سؤال جديد" } });
    expect(p.onChange).toHaveBeenCalledWith({ text: "سؤال جديد" });
  });

  it("propagates disabled to chrome actions and composer", () => {
    const { container } = render(<StructuredQuestionEditor {...baseProps({ disabled: true })} />);
    const head = within(container.querySelector(".sb-q-head") as HTMLElement);
    expect((head.getByTitle("حذف") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("نوع السؤال") as HTMLSelectElement).disabled).toBe(true);
  });
});
