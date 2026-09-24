// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { toSavedStructuredExam, duplicateQuestion } from "./examBuilderState";
import { replaceImagePatch, removeImagePatch } from "./questionMedia";
import type { StructuredExam, BuilderQuestion } from "./examTypes";

const IMG_A = "data:image/png;base64,AAAA";
const IMG_B = "data:image/png;base64,BBBB";
const SVG_URL = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

const q = (id: string, text: string, over: Partial<BuilderQuestion> = {}): BuilderQuestion => ({
  examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "SECRET_" + id }, ...over,
});
const examWith = (questions: BuilderQuestion[]): StructuredExam => ({
  examId: "ex1", title: "امتحان الوسائط", schemaVersion: 2,
  sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions }],
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Phase 5B — preview shows the question image", () => {
  it("single-question preview shows ONLY that question with its image (no other question, no answer key)", () => {
    const exam = examWith([
      q("qA", "سؤال ألف", { image: { exists: true, visible: true, assets: [{ dataUrl: IMG_A }] } }),
      q("qB", "سؤال باء", { image: { exists: true, visible: true, assets: [{ dataUrl: IMG_B }] } }),
    ]);
    render(<StructuredExamBuilder exam={exam} onChange={() => {}} />);
    // Each question editor exposes a student-preview 👁 (title "معاينة الطالب"); click the FIRST (qA).
    const previewButtons = screen.getAllByTitle("معاينة الطالب");
    fireEvent.click(previewButtons[0]);
    const dlg = screen.getByRole("dialog"); // the student-preview portal only (not the builder editor)
    const srcs = (Array.from(dlg.querySelectorAll("img.iex-image")) as HTMLImageElement[]).map(i => i.getAttribute("src"));
    expect(srcs).toEqual([IMG_A]);
    expect(srcs).not.toContain(IMG_B);
    expect(dlg.textContent).toContain("سؤال ألف");
    expect(dlg.textContent).not.toContain("سؤال باء");
    expect(dlg.textContent).not.toContain("SECRET_qA"); // answer key never in preview
  });

  it("full-exam preview shows every question and every image", () => {
    const exam = examWith([
      q("qA", "سؤال ألف", { image: { exists: true, visible: true, assets: [{ dataUrl: IMG_A }] } }),
      q("qB", "سؤال باء", { image: { exists: true, visible: true, assets: [{ dataUrl: SVG_URL }] } }),
    ]);
    render(<StructuredExamBuilder exam={exam} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "👁 معاينة الامتحان" }));
    const srcs = (Array.from(document.querySelectorAll("img.iex-image")) as HTMLImageElement[]).map(i => i.getAttribute("src"));
    expect(srcs).toContain(IMG_A);
    expect(srcs).toContain(SVG_URL);      // SVG rendered through <img>, not inline
    expect(document.body.textContent).toContain("سؤال ألف");
    expect(document.body.textContent).toContain("سؤال باء");
  });

  it("an image-less question renders exactly as before (no img element)", () => {
    render(<StructuredExamBuilder exam={examWith([q("qA", "سؤال بلا صورة")])} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "👁 معاينة الامتحان" }));
    expect(document.querySelectorAll("img.iex-image").length).toBe(0);
    expect(document.body.textContent).toContain("سؤال بلا صورة");
  });
});

describe("Phase 5B — save/reload round-trip (real toSavedStructuredExam)", () => {
  const roundTrip = (exam: StructuredExam) => JSON.parse(JSON.stringify(toSavedStructuredExam(exam))) as StructuredExam;
  const firstQ = (e: StructuredExam) => e.sections[0].questions[0];

  it("A: raster upload survives save→reload", () => {
    const patch = replaceImagePatch({ dataUrl: IMG_A, origin: "uploaded", contentType: "image/png" });
    const out = roundTrip(examWith([{ ...q("qA", "س"), ...patch }]));
    expect(firstQ(out).image?.assets?.[0].dataUrl).toBe(IMG_A);
    expect(firstQ(out).images).toEqual([]);
  });
  it("B: safe SVG survives save→reload", () => {
    const out = roundTrip(examWith([{ ...q("qA", "س"), ...replaceImagePatch({ dataUrl: SVG_URL, origin: "uploaded", contentType: "image/svg+xml" }) }]));
    expect(firstQ(out).image?.assets?.[0].dataUrl).toBe(SVG_URL);
  });
  it("C: AI image survives save→reload", () => {
    const out = roundTrip(examWith([{ ...q("qA", "س"), ...replaceImagePatch({ dataUrl: IMG_B, origin: "ai-generated", contentType: "image/png" }) }]));
    expect(firstQ(out).image?.assets?.[0].origin).toBe("ai-generated");
    expect(firstQ(out).image?.assets?.[0].dataUrl).toBe(IMG_B);
  });
  it("D: removal survives save→reload (image absent, fallback cleared)", () => {
    const out = roundTrip(examWith([{ ...q("qA", "س", { images: [{ dataUrl: IMG_A }] }), ...removeImagePatch() }]));
    expect(firstQ(out).image?.exists).toBe(false);
    expect(firstQ(out).images).toEqual([]);
  });
  it("E: an old exam with no image is unchanged", () => {
    const out = roundTrip(examWith([q("qA", "س")]));
    expect(firstQ(out).image).toBeUndefined();
    expect(firstQ(out).images).toBeUndefined();
  });
  it("F: legacy imported images[] fallback remains readable", () => {
    const out = roundTrip(examWith([q("qA", "س", { images: [{ dataUrl: IMG_A }] })]));
    expect(firstQ(out).images?.[0].dataUrl).toBe(IMG_A);
  });
});

describe("Phase 5B — builder-level question isolation (attach by examQuestionId)", () => {
  const png = () => new File([new Uint8Array([137, 80, 78, 71])], "d.png", { type: "image/png" });
  it("uploading to question B sets B's image and leaves question A byte-equivalent", async () => {
    const exam = examWith([q("qA", "سؤال ألف"), q("qB", "سؤال باء")]);
    const onChange = vi.fn();
    render(<StructuredExamBuilder exam={exam} onChange={onChange} />);
    const inputs = screen.getAllByLabelText("رفع صورة السؤال"); // [qA, qB]
    fireEvent.change(inputs[1], { target: { files: [png()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[onChange.mock.calls.length - 1][0] as StructuredExam;
    const [a, b] = next.sections[0].questions;
    expect(a.examQuestionId).toBe("qA");
    expect(a.image).toBeUndefined();                         // A untouched
    expect(JSON.stringify(a)).toBe(JSON.stringify(exam.sections[0].questions[0]));
    expect(b.examQuestionId).toBe("qB");
    expect(b.image?.assets?.[0].dataUrl?.startsWith("data:image/png")).toBe(true); // B got the image
  });
});

describe("Phase 5B — duplicate question carries the image without aliasing", () => {
  it("a duplicated question keeps its image, with a fresh id and a distinct assets array", () => {
    const original = { ...q("qA", "س"), ...replaceImagePatch({ dataUrl: IMG_A, origin: "uploaded" }) };
    const sections = [{ id: "s1", title: "ق", gradingPolicy: "all" as const, stimuli: {}, questions: [original] }];
    const next = duplicateQuestion(sections, "s1", "qA");
    const [a, b] = next[0].questions;
    expect(b.image?.assets?.[0].dataUrl).toBe(IMG_A);         // image followed the duplicate
    expect(b.examQuestionId).not.toBe(a.examQuestionId);      // fresh identity
    expect(b.image!.assets).not.toBe(a.image!.assets);        // distinct array (deep clone, no aliasing)
  });
});
