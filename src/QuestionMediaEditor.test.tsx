// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, screen } from "@testing-library/react";
import QuestionMediaEditor from "./QuestionMediaEditor";
import type { BuilderQuestion, BuilderImageAsset } from "./examTypes";

const baseQ = (over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({
  examQuestionId: "qA", presentationType: "multipleChoice", text: "أي جهاز يوجّه الحزم؟", marks: 2,
  options: [{ text: "Router" }, { text: "Switch" }], answer: { correctOptionIndex: 0 }, ...over,
});
const withImage = (over: Partial<BuilderQuestion> = {}) => baseQ({ image: { exists: true, visible: true, assets: [{ dataUrl: "data:image/png;base64,OLD", origin: "uploaded" }] }, ...over });
const png = () => new File([new Uint8Array([137, 80, 78, 71])], "d.png", { type: "image/png" });

beforeEach(() => { window.confirm = vi.fn(() => true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("QuestionMediaEditor — upload / state", () => {
  it("no image: offers upload + AI; hides AI when no callback", () => {
    const { rerender } = render(<QuestionMediaEditor question={baseQ()} onChange={() => {}} requestQuestionImage={async () => ({})} />);
    expect(screen.getByRole("button", { name: "⬆ رفع صورة" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "✨ إنشاء صورة بالذكاء الاصطناعي" })).toBeTruthy();
    rerender(<QuestionMediaEditor question={baseQ()} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /إنشاء صورة/ })).toBeNull();
  });

  it("uploading a PNG attaches the image to THIS question (canonical image, images[] cleared)", async () => {
    const onChange = vi.fn();
    render(<QuestionMediaEditor question={baseQ()} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("رفع صورة السؤال"), { target: { files: [png()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const patch = onChange.mock.calls[0][0];
    expect(patch.image.exists).toBe(true);
    expect(patch.image.assets[0].dataUrl.startsWith("data:image/png")).toBe(true);
    expect(patch.image.assets[0].origin).toBe("uploaded");
    expect(patch.images).toEqual([]);
  });

  it("question isolation: two editors, an op on A never calls B's onChange", async () => {
    const onA = vi.fn(), onB = vi.fn();
    render(<><QuestionMediaEditor question={baseQ({ examQuestionId: "qA" })} onChange={onA} /><QuestionMediaEditor question={baseQ({ examQuestionId: "qB" })} onChange={onB} /></>);
    const inputs = screen.getAllByLabelText("رفع صورة السؤال");
    fireEvent.change(inputs[0], { target: { files: [png()] } });
    await waitFor(() => expect(onA).toHaveBeenCalled());
    expect(onB).not.toHaveBeenCalled();
  });

  it("replace: with an image present, uploading replaces it (canonical + images[] cleared)", async () => {
    const onChange = vi.fn();
    render(<QuestionMediaEditor question={withImage({ images: [{ dataUrl: "data:image/png;base64,LEG" }] })} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "🔄 استبدال صورة" }));
    fireEvent.change(screen.getByLabelText("رفع صورة السؤال"), { target: { files: [png()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].images).toEqual([]);
  });

  it("remove: confirms then clears canonical image AND the legacy fallback", () => {
    const onChange = vi.fn();
    render(<QuestionMediaEditor question={withImage({ images: [{ dataUrl: "data:image/png;base64,LEG" }] })} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "🗑 إزالة الصورة" }));
    expect(onChange).toHaveBeenCalledWith({ image: { exists: false, visible: false, assets: [] }, images: [] });
  });
});

describe("QuestionMediaEditor — AI generation", () => {
  it("AI button calls the callback with an answer-free payload; success attaches to this question", async () => {
    const onChange = vi.fn();
    const requestQuestionImage = vi.fn(async (_q: unknown) => ({ id: "ai-1", origin: "ai-generated", contentType: "image/png", dataUrl: "data:image/png;base64,AI" } as BuilderImageAsset));
    render(<QuestionMediaEditor question={baseQ()} onChange={onChange} requestQuestionImage={requestQuestionImage} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ إنشاء صورة بالذكاء الاصطناعي" }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const sent = requestQuestionImage.mock.calls[0][0];
    expect(sent).toEqual({ examQuestionId: "qA", text: "أي جهاز يوجّه الحزم؟", options: [{ text: "Router", value: undefined, label: undefined }, { text: "Switch", value: undefined, label: undefined }] });
    expect(JSON.stringify(sent)).not.toContain("answer");
    expect(JSON.stringify(sent)).not.toContain("correctOptionIndex");
    expect(onChange.mock.calls[0][0].image.assets[0].dataUrl).toBe("data:image/png;base64,AI");
  });

  it("AI failure leaves the previous image intact (no onChange) and shows an error", async () => {
    const onChange = vi.fn();
    const requestQuestionImage = vi.fn(async () => { throw new Error("boom"); });
    render(<QuestionMediaEditor question={withImage()} onChange={onChange} requestQuestionImage={requestQuestionImage} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ إنشاء صورة جديدة" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an existing image requires explicit replace intent (confirm=false → no request)", () => {
    const requestQuestionImage = vi.fn(async () => ({} as BuilderImageAsset));
    window.confirm = vi.fn(() => false);
    render(<QuestionMediaEditor question={withImage()} onChange={() => {}} requestQuestionImage={requestQuestionImage} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ إنشاء صورة جديدة" }));
    expect(requestQuestionImage).not.toHaveBeenCalled();
  });

  it("single-flight: a rapid double-click sends only ONE request", async () => {
    let resolve!: (a: BuilderImageAsset) => void;
    const requestQuestionImage = vi.fn(() => new Promise<BuilderImageAsset>(r => { resolve = r; }));
    render(<QuestionMediaEditor question={baseQ()} onChange={() => {}} requestQuestionImage={requestQuestionImage} />);
    const btn = screen.getByRole("button", { name: "✨ إنشاء صورة بالذكاء الاصطناعي" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(requestQuestionImage).toHaveBeenCalledTimes(1);
    resolve({ dataUrl: "data:image/png;base64,AI" });
    await waitFor(() => {});
  });

  it("stale AI result cannot overwrite a newer explicit remove", async () => {
    let resolve!: (a: BuilderImageAsset) => void;
    const requestQuestionImage = vi.fn(() => new Promise<BuilderImageAsset>(r => { resolve = r; }));
    const onChange = vi.fn();
    render(<QuestionMediaEditor question={withImage()} onChange={onChange} requestQuestionImage={requestQuestionImage} />);
    fireEvent.click(screen.getByRole("button", { name: "✨ إنشاء صورة جديدة" }));   // AI pending
    fireEvent.click(screen.getByRole("button", { name: "🗑 إزالة الصورة" }));       // newer explicit remove
    expect(onChange).toHaveBeenCalledWith({ image: { exists: false, visible: false, assets: [] }, images: [] });
    onChange.mockClear();
    resolve({ dataUrl: "data:image/png;base64,STALE" });                          // stale AI resolves
    await waitFor(() => {});
    expect(onChange).not.toHaveBeenCalled(); // the stale AI result was discarded
  });
});
