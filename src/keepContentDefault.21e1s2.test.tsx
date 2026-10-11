// @vitest-environment happy-dom
// Phase 21E.1 (slice 2) — a template that would REPLACE text the teacher already wrote asks first, and that dialog now opens on the
// action that KEEPS the teacher's content («إبقاء …»), so a reflexive Enter / Space never overwrites their work. Opt-in per call
// (`initialFocus: "cancel"`): every other default-tone confirmation keeps its focus on the confirm button exactly as before.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, within, act } from "@testing-library/react";
import ExamCoverEditor from "./ExamCoverEditor";
import ExamSectionEditor from "./ExamSectionEditor";
import { useConfirm } from "./ui/useConfirm";
import type { ConfirmOptions } from "./ui/ConfirmDialog";
import type { ExamCoverPage } from "./examCover";
import type { BuilderSection } from "./examTypes";

afterEach(cleanup);

function CoverHarness({ initial }: { initial: ExamCoverPage }) {
  const [cover, setCover] = useState<ExamCoverPage | undefined>(initial);
  return <><ExamCoverEditor cover={cover} onChange={setCover} onPreviewCover={() => {}} /><pre data-testid="dump">{JSON.stringify(cover)}</pre></>;
}
const dump = () => JSON.parse(screen.getByTestId("dump").textContent || "{}");
const section = (over: Partial<BuilderSection> = {}): BuilderSection => ({
  id: "s1", title: "القسم", instructions: "تعليمات كتبها المعلم", gradingPolicy: "all", stimuli: {}, questions: [], ...over,
} as BuilderSection);
const sectionProps = (patch: (p: Partial<BuilderSection>) => void) => ({
  section: section(), index: 0, total: 1, sectionOptions: [{ id: "s1", title: "القسم" }],
  patch, onDelete: vi.fn(), onMove: vi.fn(), onAddQuestion: vi.fn(), onQuestionChange: vi.fn(),
  onQuestionDelete: vi.fn(), onQuestionMove: vi.fn(), onQuestionDuplicate: vi.fn(),
  onQuestionMoveToSection: vi.fn(), onPreviewQuestion: vi.fn(),
});

describe("21E.1 slice 2 — template replacement dialogs open on «إبقاء …»", () => {
  it("section instructions: focus starts on «إبقاء التعليمات»; keeping changes nothing", async () => {
    const patch = vi.fn();
    render(<ExamSectionEditor {...sectionProps(patch)} />);
    await act(async () => { fireEvent.change(screen.getByLabelText("قوالب تعليمات القسم"), { target: { value: "answer-all" } }); });
    const d = await screen.findByRole("dialog", { name: "استبدال تعليمات القسم" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إبقاء التعليمات" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "إبقاء التعليمات" })); });
    expect(patch).not.toHaveBeenCalled();
  });

  it("cover template over existing cover text: focus starts on «إبقاء الحقول»; keeping preserves the fields", async () => {
    render(<CoverHarness initial={{ enabled: true, activityType: "exam", subtitle: "الصف العاشر", instructions: "تعليماتي" }} />);
    fireEvent.change(screen.getByLabelText("قوالب الغلاف"), { target: { value: "training" } });
    await act(async () => { fireEvent.click(screen.getByText("تطبيق القالب")); });
    const d = await screen.findByRole("dialog", { name: "استبدال حقول الغلاف" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إبقاء الحقول" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "إبقاء الحقول" })); });
    expect(dump()).toMatchObject({ subtitle: "الصف العاشر", instructions: "تعليماتي", activityType: "exam" });
  });

  it("cover instructions template over existing text: focus starts on «إبقاء التعليمات»; replacing is still one deliberate click", async () => {
    render(<CoverHarness initial={{ enabled: true, activityType: "exam", instructions: "تعليماتي" }} />);
    fireEvent.change(screen.getByLabelText("قوالب التعليمات"), { target: { value: "computerized" } });
    await act(async () => { fireEvent.click(screen.getByText("تطبيق التعليمات")); });
    let d = await screen.findByRole("dialog", { name: "استبدال نص التعليمات" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إبقاء التعليمات" }));
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "إبقاء التعليمات" })); });
    expect(dump().instructions).toBe("تعليماتي");
    await act(async () => { fireEvent.click(screen.getByText("تطبيق التعليمات")); });
    d = await screen.findByRole("dialog", { name: "استبدال نص التعليمات" });
    await act(async () => { fireEvent.click(within(d).getByRole("button", { name: "استبدال التعليمات" })); });
    expect(dump().instructions).toMatch(/حفظ إجاباتك/);
  });
});

describe("21E.1 slice 2 — ConfirmDialog initialFocus is opt-in and leaves every existing default unchanged", () => {
  function Host({ options }: { options: ConfirmOptions }) {
    const { confirm, confirmDialog } = useConfirm();
    return <><button type="button" onClick={() => { void confirm(options); }}>ask</button>{confirmDialog}</>;
  }
  const open = async (options: ConfirmOptions) => {
    render(<Host options={options} />);
    await act(async () => { fireEvent.click(screen.getByText("ask")); });
    return screen.findByRole("dialog");
  };
  it("default tone without the option → the confirm button (unchanged)", async () => {
    const d = await open({ message: "م", confirmLabel: "متابعة", cancelLabel: "رجوع" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "متابعة" }));
  });
  it("danger tone without the option → «إلغاء» side (unchanged)", async () => {
    const d = await open({ message: "م", tone: "danger", confirmLabel: "حذف", cancelLabel: "إبقاء" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إبقاء" }));
  });
  it("default tone with initialFocus: \"cancel\" → the keep button", async () => {
    const d = await open({ message: "م", confirmLabel: "استبدال", cancelLabel: "إبقاء", initialFocus: "cancel" });
    expect(document.activeElement).toBe(within(d).getByRole("button", { name: "إبقاء" }));
  });
});
