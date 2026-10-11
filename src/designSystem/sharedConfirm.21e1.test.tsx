// @vitest-environment happy-dom
// Phase 21E.1 (slice 1) — the builder's confirmations are the SHARED accessible ConfirmDialog, never window.confirm:
// RTL, Arabic labels, aria-modal, Escape / «إبقاء…» keep the data and restore focus, the confirm button applies the change,
// and a destructive confirmation (image removal) starts with focus on the safe choice so a stray Enter cannot destroy data.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import ExamCoverEditor from "../ExamCoverEditor";
import ExamSectionEditor from "../ExamSectionEditor";
import QuestionMediaEditor from "../QuestionMediaEditor";
import { useDeferredConfirm } from "../ui/useDeferredConfirm";
import type { ExamCoverPage } from "../examCover";
import type { BuilderSection, BuilderQuestion } from "../examTypes";

afterEach(cleanup);
const press = async (label: string) => { const b = await screen.findByRole("button", { name: label }); await act(async () => { fireEvent.click(b); }); };
const escape = async () => { await act(async () => { fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" }); }); };

function CoverHarness({ initial }: { initial: ExamCoverPage }) {
  const [cover, setCover] = useState<ExamCoverPage | undefined>(initial);
  return <><ExamCoverEditor cover={cover} onChange={setCover} onPreviewCover={() => {}} /><output data-testid="dump">{JSON.stringify(cover)}</output></>;
}
const dump = () => JSON.parse(screen.getByTestId("dump").textContent || "{}");
const section = (over: Partial<BuilderSection> = {}): BuilderSection => ({ id: "s1", title: "القسم", instructions: "", gradingPolicy: "firstNAnswered", maxMarks: 20, requiredAnswers: 3, answerUnit: "question", stimuli: {}, questions: [], ...over } as BuilderSection);
const sectionProps = (patch: (p: Partial<BuilderSection>) => void, over: Partial<BuilderSection> = {}) => ({
  section: section(over), index: 0, total: 1, sectionOptions: [{ id: "s1", title: "القسم" }],
  patch, onDelete: vi.fn(), onMove: vi.fn(), onAddQuestion: vi.fn(), onQuestionChange: vi.fn(),
  onQuestionDelete: vi.fn(), onQuestionMove: vi.fn(), onQuestionDuplicate: vi.fn(), onQuestionMoveToSection: vi.fn(), onPreviewQuestion: vi.fn()
});
const withImage = (): BuilderQuestion => ({ examQuestionId: "qA", presentationType: "multipleChoice", text: "س", marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 }, image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,OLD", origin: "uploaded" }] } } as BuilderQuestion);

describe("21E.1 — cover editor: template over existing text asks through the shared dialog", () => {
  it("the dialog is modal, RTL and Arabic; Escape keeps the fields and restores focus; confirming applies the template", async () => {
    render(<CoverHarness initial={{ enabled: true, activityType: "exam", subtitle: "الحادي عشر 7", instructions: "نص قائم" }} />);
    fireEvent.change(screen.getByLabelText("قوالب الغلاف"), { target: { value: "training" } });
    const apply = screen.getByText("تطبيق القالب");
    apply.focus();
    fireEvent.click(apply);
    const dialog = await screen.findByRole("dialog", { name: "استبدال حقول الغلاف" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.closest("[dir='rtl']")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إبقاء الحقول" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "استبدال حقول الغلاف" })).toBeTruthy();           // the dialog's own confirm label (distinct from the editor button)
    expect(document.body.textContent).not.toMatch(/OK|Cancel/);
    await escape();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dump().subtitle).toBe("الحادي عشر 7");                                                 // nothing changed
    expect(dump().instructions).toBe("نص قائم");
    expect(document.activeElement).toBe(apply);                                                     // focus restored to the opener
    fireEvent.click(apply);
    await screen.findByRole("dialog", { name: "استبدال حقول الغلاف" });
    await press("استبدال حقول الغلاف");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dump().activityType).toBe("training");
    expect(dump().instructions).toMatch(/تدريب/);
  });

  it("the cover instruction template asks only when text exists; «إبقاء التعليمات» keeps it", async () => {
    render(<CoverHarness initial={{ enabled: true, activityType: "exam", instructions: "تعليمات قائمة" }} />);
    fireEvent.change(screen.getByLabelText("قوالب التعليمات"), { target: { value: "computerized" } });
    fireEvent.click(screen.getByText("تطبيق التعليمات"));
    await screen.findByRole("dialog", { name: "استبدال نص التعليمات" });
    await press("إبقاء التعليمات");
    expect(dump().instructions).toBe("تعليمات قائمة");
    fireEvent.click(screen.getByText("تطبيق التعليمات"));
    await press("استبدال التعليمات");
    expect(dump().instructions).toMatch(/حفظ إجاباتك/);
  });
});

describe("21E.1 — section editor: instruction template over existing text asks through the shared dialog", () => {
  it("cancel patches nothing; confirm patches ONLY the instructions (grading untouched); no text → no dialog", async () => {
    const patch = vi.fn();
    render(<ExamSectionEditor {...sectionProps(patch, { instructions: "تعليمات القسم القائمة" })} />);
    fireEvent.change(screen.getByLabelText("قوالب تعليمات القسم"), { target: { value: "answer-all" } });
    await screen.findByRole("dialog", { name: "استبدال تعليمات القسم" });
    await press("إبقاء التعليمات");
    expect(patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("قوالب تعليمات القسم"), { target: { value: "answer-all" } });
    await press("استبدال التعليمات");
    expect(patch).toHaveBeenCalledTimes(1);
    const arg = patch.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.instructions).toMatch(/جميع الأسئلة/);
    for (const k of ["gradingPolicy", "requiredAnswers", "maxMarks", "answerUnit"]) expect(Object.prototype.hasOwnProperty.call(arg, k)).toBe(false);
    cleanup();
    const patch2 = vi.fn();
    render(<ExamSectionEditor {...sectionProps(patch2)} />);
    fireEvent.change(screen.getByLabelText("قوالب تعليمات القسم"), { target: { value: "answer-all" } });
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();                                                // empty instructions → applied directly
    expect(patch2).toHaveBeenCalledTimes(1);
  });
});

describe("21E.1 — media editor: removing an image is a DANGER confirmation", () => {
  it("focus starts on «إبقاء الصورة», Enter there keeps the image, the confirm button removes it", async () => {
    const onChange = vi.fn();
    render(<QuestionMediaEditor question={withImage()} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "🗑 إزالة الصورة" }));
    const dialog = await screen.findByRole("dialog", { name: "إزالة صورة السؤال" });
    expect(dialog.className).toMatch(/danger/);
    expect(document.activeElement?.textContent).toBe("إبقاء الصورة");
    await act(async () => { fireEvent.click(document.activeElement as HTMLElement); });              // what Enter on the focused button does
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "🗑 إزالة الصورة" }));
    await press("إزالة الصورة");
    expect(onChange).toHaveBeenCalledWith({ image: { exists: false, visible: false, assets: [] }, images: [] });
  });
});

// The startup module (App.tsx) confirms through useDeferredConfirm so the dialog layer stays out of the initial bundle. Same
// contract as useConfirm: nothing is rendered before the first confirm; afterwards the dialog is the shared ConfirmDialog
// (danger tone starts on the safe choice), Escape resolves false and returns focus to the opener, a newer confirm replaces an
// older one (which resolves false), and unmounting resolves a pending confirmation false.
function Deferred({ onResult }: { onResult: (r: boolean) => void }) {
  const { confirm, confirmDialog } = useDeferredConfirm();
  return <><button type="button" onClick={async () => onResult(await confirm({ title: "حذف امتحان محفوظ", message: "هل تريد حذف الامتحان؟", tone: "danger", confirmLabel: "حذف الامتحان", cancelLabel: "إبقاء الامتحان" }))}>حذف</button>{confirmDialog}</>;
}
describe("21E.1 — useDeferredConfirm (App.tsx): the shared dialog, loaded on first use", () => {
  it("renders nothing before the first confirm; then the danger dialog starts on «إبقاء الامتحان»; Escape → false + focus back", async () => {
    const results: boolean[] = [];
    const { container } = render(<Deferred onResult={r => results.push(r)} />);
    expect(container.querySelector(".eb-dialog-root, [role='dialog']")).toBeNull();
    const opener = screen.getByRole("button", { name: "حذف" });
    opener.focus();
    await act(async () => { fireEvent.click(opener); });
    const dialog = await screen.findByRole("dialog", { name: "حذف امتحان محفوظ" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement?.textContent).toBe("إبقاء الامتحان");
    await escape();
    expect(results).toEqual([false]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    await act(async () => { fireEvent.click(opener); });
    await press("حذف الامتحان");
    expect(results).toEqual([false, true]);
  });
  it("a newer confirm replaces an older one (false); unmount resolves a pending confirmation false", async () => {
    let first: Promise<boolean> | null = null, second: Promise<boolean> | null = null;
    function Replace() { const { confirm, confirmDialog } = useDeferredConfirm(); return <><button type="button" onClick={() => { first = confirm("أول"); second = confirm("ثانٍ"); }}>go</button>{confirmDialog}</>; }
    const { unmount } = render(<Replace />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "go" })); });
    await expect(first!).resolves.toBe(false);
    expect((await screen.findByRole("dialog")).textContent).toContain("ثانٍ");
    unmount();
    await expect(second!).resolves.toBe(false);
  });
});
