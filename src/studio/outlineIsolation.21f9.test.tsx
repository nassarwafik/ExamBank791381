// @vitest-environment happy-dom
//
// Phase 21F.9 — with the Studio as the default layout, typing in one question must not re-render the whole outline or every card: the
// rows are memoized on plain values with one stable events object, the cards get stable handlers, so an edit re-renders its own row
// and card only. Counted through the type
// icon every outline row (size 14) and every collapsed card (size 13) renders.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, screen, act } from "@testing-library/react";

const renders = vi.hoisted(() => ({ icon: 0, bySize: {} as Record<string, number> }));
vi.mock("./StudioTypeIcon", () => ({ default: ({ size }: { size?: number }) => { renders.icon += 1; renders.bySize[String(size)] = (renders.bySize[String(size)] ?? 0) + 1; return null; } }));
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import type { StructuredExam } from "../examTypes";

const N = 40;
const exam = (): StructuredExam => ({ examId: "E-O", title: "عزل", status: "draft", sections: [{ id: "s1", title: "الأول", gradingPolicy: "all", stimuli: {},
  questions: Array.from({ length: N }, (_, i) => ({ examQuestionId: "q" + i, presentationType: "trueFalse", marks: 1, text: "عبارة " + i, answer: { correct: true } })) }] } as unknown as StructuredExam);
const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
function Host() {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} layout="studio" onSave={() => {}} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

describe("21F.9 outline render isolation", () => {
  it("an edit to one question's text re-renders that outline row and that card, not all of them", async () => {
    render(<Host />);
    await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    expect(document.querySelectorAll("[data-outline-question]")).toHaveLength(N);
    renders.icon = 0; renders.bySize = {};
    await act(async () => { hist.current!.update(prev => ({ ...prev, sections: prev.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q7" ? { ...q, text: "عبارة معدّلة" } : q)) })) })); });
    expect(document.querySelector('[data-outline-question="q7"]')?.getAttribute("aria-label")).toMatch(/عبارة معدّلة/);
    // The edited outline row (size 14) and the edited collapsed card (size 13) — never the other rows or cards.
    expect(renders.bySize).toEqual({ "13": 1, "14": 1 });
  });
});
