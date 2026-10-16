// @vitest-environment happy-dom
//
// Phase 21F.9 — cutover: the Exam Studio is the default layout (the classic one stays one click away and is remembered), and
// experimental tools (the 3D function lab) are hidden in the Studio's «أدوات» menu until the teacher turns them on.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { readBuilderLayout, DEFAULT_BUILDER_LAYOUT, STUDIO_EXPERIMENTAL_KEY, writeBuilderLayout } from "./studioPreference";
import type { StructuredExam } from "../examTypes";

const exam = (): StructuredExam => ({ examId: "E-C", title: "انتقال", status: "draft", sections: [{ id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {}, questions: [{ examQuestionId: "q1", presentationType: "trueFalse", marks: 1, text: "عبارة", answer: { correct: true } }] }] } as unknown as StructuredExam);
function Host() {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} layout="studio" onSave={() => {}} />;
}
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => cleanup());

const openTools = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "أدوات الامتحان" })); }); };

describe("21F.9 the default layout", () => {
  it("is the Exam Studio; a teacher's classic choice is remembered", () => {
    expect(DEFAULT_BUILDER_LAYOUT).toBe("studio");
    expect(readBuilderLayout("")).toBe("studio");
    writeBuilderLayout("classic");
    expect(readBuilderLayout("")).toBe("classic");
  });
});

describe("21F.9 experimental tools", () => {
  it("the 3D function lab is hidden until «إظهار الأدوات التجريبية», which is remembered", async () => {
    render(<Host />);
    await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
    await openTools();
    expect(screen.queryByRole("button", { name: /مختبر الدوال 3D/ })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إظهار الأدوات التجريبية" })); });
    expect(localStorage.getItem(STUDIO_EXPERIMENTAL_KEY)).toBe("1");
    await openTools();
    expect(screen.getByRole("button", { name: /مختبر الدوال 3D/ })).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إخفاء الأدوات التجريبية" })); });
    expect(localStorage.getItem(STUDIO_EXPERIMENTAL_KEY)).toBeNull();
  });
});
