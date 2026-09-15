// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import ExamCoverEditor from "./ExamCoverEditor";
import ExamSectionEditor from "./ExamSectionEditor";
import type { ExamCoverPage } from "./examCover";
import type { BuilderSection } from "./examTypes";

beforeEach(() => { (window as unknown as { confirm: () => boolean }).confirm = () => true; });
afterEach(cleanup);

// Controlled harness so we can observe the cover state the editor produces after each action.
function CoverHarness({ initial }: { initial: ExamCoverPage | undefined }) {
  const [cover, setCover] = useState<ExamCoverPage | undefined>(initial);
  return <><ExamCoverEditor cover={cover} onChange={setCover} onPreviewCover={() => {}} /><output data-testid="dump">{JSON.stringify(cover)}</output></>;
}
const dump = (r: ReturnType<typeof render>) => JSON.parse(r.getByTestId("dump").textContent || "{}");

describe("R16/R17 cover editor — template application", () => {
  it("O/P: applying a cover template sets template fields and preserves the existing safe banner", () => {
    const r = render(<CoverHarness initial={{ enabled: true, activityType: "exam", banner: { dataUrl: "data:image/png;base64,AAAA" } }} />);
    fireEvent.change(r.getByLabelText("قوالب الغلاف"), { target: { value: "training" } });
    fireEvent.click(r.getByText("تطبيق القالب"));
    const cover = dump(r);
    expect(cover.activityType).toBe("training");
    expect(cover.instructions).toMatch(/تدريب/);
    expect(cover.banner?.dataUrl).toBe("data:image/png;base64,AAAA");   // banner preserved
  });

  it("S: after applying a template the teacher can still edit the cover fields", () => {
    const r = render(<CoverHarness initial={{ enabled: true, activityType: "exam" }} />);
    fireEvent.change(r.getByLabelText("قوالب الغلاف"), { target: { value: "formal-exam" } });
    fireEvent.click(r.getByText("تطبيق القالب"));
    const input = r.getByPlaceholderText("مثال: الحادي عشر 7") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "معدّل يدويًا" } });
    expect(dump(r).subtitle).toBe("معدّل يدويًا");
  });

  it("V: applying a cover instruction template fills the instructions text (editable afterward)", () => {
    const r = render(<CoverHarness initial={{ enabled: true, activityType: "exam" }} />);
    fireEvent.change(r.getByLabelText("قوالب التعليمات"), { target: { value: "computerized" } });
    fireEvent.click(r.getByText("تطبيق التعليمات"));
    expect(dump(r).instructions).toMatch(/حفظ إجاباتك/);
  });
});

// Minimal section for the section editor.
const section = (over: Partial<BuilderSection> = {}): BuilderSection => ({
  id: "s1", title: "القسم", instructions: "", gradingPolicy: "firstNAnswered",
  maxMarks: 20, requiredAnswers: 3, answerUnit: "question", stimuli: {}, questions: [], ...over
} as BuilderSection);

const sectionProps = (patch: (p: Partial<BuilderSection>) => void) => ({
  section: section(), index: 0, total: 1, sectionOptions: [{ id: "s1", title: "القسم" }],
  patch, onDelete: vi.fn(), onMove: vi.fn(), onAddQuestion: vi.fn(), onQuestionChange: vi.fn(),
  onQuestionDelete: vi.fn(), onQuestionMove: vi.fn(), onQuestionDuplicate: vi.fn(),
  onQuestionMoveToSection: vi.fn(), onPreviewQuestion: vi.fn()
});

describe("R17 section instruction template — text only, never grading", () => {
  it("W/X: applying a section instruction template patches ONLY instructions, never grading fields", () => {
    const patch = vi.fn();
    const r = render(<ExamSectionEditor {...sectionProps(patch)} />);
    fireEvent.change(r.getByLabelText("قوالب تعليمات القسم"), { target: { value: "answer-all" } });
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.instructions).toMatch(/جميع الأسئلة/);
    for (const k of ["gradingPolicy", "requiredAnswers", "maxMarks", "answerUnit"]) {
      expect(Object.prototype.hasOwnProperty.call(arg, k)).toBe(false);
    }
  });
});
