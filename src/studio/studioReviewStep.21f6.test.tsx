// @vitest-environment happy-dom
//
// Phase 21F.6 — the Studio's review step through the REAL builder + history hook: the readiness ring and state come from the ONE
// finalization decision, every blocker is listed, «إصلاح» opens the issue in its card (content step, that card active, focus on its
// issues), fixing it clears the blocker, and the distributions are the assessment profile's official marks.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import type { StructuredExam } from "../examTypes";

const tf = (id: string, text: string, marks: number, cognitiveLevel?: string) => ({ examQuestionId: id, presentationType: "trueFalse", marks, text, answer: { correct: true }, ...(cognitiveLevel ? { assessmentMeta: { cognitiveLevel } } : {}) });
const exam = (): StructuredExam => ({ examId: "E-R", title: "مراجعة", status: "draft", sections: [
  { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [tf("q1", "عبارة DNS", 2, "remember"), tf("q2", "", 1)] },
  { id: "s2", title: "الأمن", gradingPolicy: "all", stimuli: {}, questions: [tf("q3", "عبارة TLS", 3, "apply")] }
] } as unknown as StructuredExam);

const hist: { current: ReturnType<typeof useStructuredExamHistory> | null } = { current: null };
function Host() {
  const h = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; h.open(exam(), "saved"); } }, [h]);
  useEffect(() => { hist.current = h; });
  if (!h.present) return null;
  return <StructuredExamBuilder exam={h.present} onChange={h.update} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo} layout="studio" onSave={() => {}} />;
}
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia; });
afterEach(() => cleanup());

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 20)); });
async function openReview() {
  render(<Host />);
  await screen.findByRole("tree", { name: "الأقسام والأسئلة" });
  await act(async () => { fireEvent.click(document.querySelector('.st-topbar [data-step="review"]')!); });
  await screen.findByRole("heading", { name: "مراجعة الامتحان" });
  await settle();
}
const rows = (name: string) => within(screen.getByRole("list", { name })).getAllByRole("listitem").map(li => li.querySelector(".st-bar-label")!.textContent + " " + li.querySelector("b")!.textContent);

describe("21F.6 the review step", () => {
  it("shows the readiness of the questions and the blocker that refuses finalization", async () => {
    await openReview();
    expect(screen.getByRole("img", { name: "الأسئلة السليمة 2 من 3 (67%)" })).toBeTruthy();
    expect(document.querySelector("[data-readiness]")?.getAttribute("data-readiness")).toBe("blocked");
    const list = screen.getByRole("list", { name: "العوائق والتنبيهات" });
    const blockers = list.querySelectorAll('[data-review-level="blocker"]');
    expect(blockers).toHaveLength(1);
    expect(blockers[0].textContent).toMatch(/بلا نص/);
  });

  it("«إصلاح» opens the question in the content step, active, with focus on its issues", async () => {
    await openReview();
    const fix = within(screen.getByRole("list", { name: "العوائق والتنبيهات" })).getByRole("button", { name: "إصلاح" });
    await act(async () => { fireEvent.click(fix); });
    await settle(); await settle();
    expect(document.querySelector('.st-topbar [data-step="content"]')?.getAttribute("aria-current")).toBe("step");
    const card = document.getElementById("sb-q-q2")!;
    expect(card.classList.contains("is-active")).toBe(true);
    expect(card.contains(document.activeElement)).toBe(true);
  });

  it("fixing the question clears the blocker: the exam is no longer blocked", async () => {
    await openReview();
    await act(async () => { hist.current!.update(prev => ({ ...prev, sections: prev.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q2" ? { ...q, text: "عبارة DHCP" } : q)) })) })); });
    await settle();
    expect(document.querySelector("[data-readiness]")?.getAttribute("data-readiness")).not.toBe("blocked");
    expect(document.querySelectorAll('[data-review-level="blocker"]')).toHaveLength(0);
    expect(screen.getByRole("img", { name: "الأسئلة السليمة 3 من 3 (100%)" })).toBeTruthy();
  });

  it("distributes the official marks over sections, types and the declared cognitive levels", async () => {
    await openReview();
    expect(rows("العلامات حسب الأقسام")).toEqual(["القسم 1: الشبكات 50%", "القسم 2: الأمن 50%"]);
    expect(rows("أنواع الأسئلة")).toEqual(["صح أو خطأ 100%"]);
    expect(rows("المستويات المعرفية")).toEqual(["تذكّر 33%", "فهم 0%", "تطبيق 50%", "تحليل 0%", "تقويم 0%", "إبداع 0%", "غير مصنّف 17%"]);
    expect(screen.getByText("لم تُحدَّد صعوبة الأسئلة بعد.")).toBeTruthy();
  });

  it("«الانتقال إلى النشر» moves to the publish step", async () => {
    await openReview();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "الانتقال إلى النشر" })); });
    expect(document.querySelector('.st-topbar [data-step="publish"]')?.getAttribute("aria-current")).toBe("step");
  });
});
