// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import { createRequire } from "node:module";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { groupComposerWarnings, EXCERPT_CHARS } from "./composerWarningGroups";
import type { ComposerTransport } from "./composerRun";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 21S — the composer's warnings, grouped for review: per question in exam order (number, section, the start of the stem, a preview
// of that question alone), the rest at exam level; identical messages once; an id the exam does not hold never becomes a question group.
afterEach(() => cleanup());
type Json = Record<string, unknown>;
const q = (id: string, text: string): Json => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 1, answer: {} });
const exam = (): StructuredExam => ({ examId: "E21S", title: "t", sections: [
  { id: "s1", title: "القسم الأول", gradingPolicy: "all", questions: [q("a", "السؤال الأول"), q("b", "السؤال الثاني " + "ن".repeat(120))] },
  { id: "s2", title: "القسم الثاني", gradingPolicy: "all", questions: [q("c", "السؤال الثالث")] }
] } as unknown as StructuredExam);

describe("21S-GROUP grouping rules", () => {
  it("per question in exam order with number, section and excerpt; exam level for the rest; duplicates once; unknown ids stay at exam level", () => {
    const g = groupComposerWarnings(exam(), [
      { message: "خطة: تنبيه عام" },
      { message: "تنبيه على الثالث", questionId: "c" },
      { message: "تنبيه على الأول", questionId: "a" },
      { message: "تنبيه على الأول", questionId: "a" },
      { message: "تنبيه آخر على الأول", questionId: "a" },
      { message: "سؤال غير موجود", questionId: "zzz" }
    ]);
    expect(g.examLevel).toEqual(["خطة: تنبيه عام", "سؤال غير موجود"]);
    expect(g.questions.map(x => [x.questionId, x.number, x.sectionTitle, x.messages])).toEqual([
      ["a", 1, "القسم الأول", ["تنبيه على الأول", "تنبيه آخر على الأول"]],
      ["c", 3, "القسم الثاني", ["تنبيه على الثالث"]]
    ]);
    expect(g.total).toBe(5);
  });
  it("the excerpt is bounded and the preview holds exactly that question in its own section", () => {
    const g = groupComposerWarnings(exam(), [{ message: "x", questionId: "b" }]);
    const b = g.questions[0];
    expect(b.number).toBe(2);
    expect(b.excerpt.length).toBe(EXCERPT_CHARS);
    expect(b.excerpt.endsWith("…")).toBe(true);
    expect(b.preview.sections.map(s => [s.id, s.questions.map(x => x.examQuestionId)])).toEqual([["s1", ["b"]]]);
    expect(b.preview.examId).toBe("E21S");
  });
  it("no warnings → nothing to show", () => {
    expect(groupComposerWarnings(exam(), [])).toEqual({ examLevel: [], questions: [], total: 0 });
  });
});

// ── the dialog, driven through the REAL endpoint with a scripted model ─────────────────────────────────────────────────────────────────
const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const PLAN = F.plan("امتحان قصير", "default", [F.planSection("أساسيات", [1, 2, 3, 4].map(() => F.planItem("multipleChoice", 1)))]);
const SECTION = { items: [
  F.item("multipleChoice", { question: F.mcq("ما وظيفة VLAN في الشبكة؟", ["تقسيم الشبكة منطقيًا", "تسريع المعالج", "تخزين البيانات"]) }),
  F.item("multipleChoice", { question: F.mcq("يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟", ["DHCP", "DNS", "FTP"]) }),
  F.item("multipleChoice", { question: F.mcq("أي جهاز يربط الشبكات المختلفة؟", ["الموجّه", "المبدّل", "المكرّر"]) }),
  F.item("multipleChoice", { question: F.mcq("كم بتًا في عنوان IPv4؟", ["32", "64", "128"]) })
] };
const transport = (): ComposerTransport => {
  const ai = F.scriptedAi({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION] });
  return async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21s" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
};

describe("21S-UI the dialog shows the warnings per question with a preview of each", () => {
  it("position bias on question 1 and an answer leak on question 2 appear under those questions; «معاينة هذا السؤال» previews that question alone", async () => {
    const empty = { examId: "E21S", title: "t", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
    const onPreview = vi.fn();
    render(<AiExamComposerDialog open onClose={() => {}} transport={transport()} exam={empty} getLatestExam={() => empty} onApply={() => "ok"} onPreview={onPreview} />);
    const d = screen.getByRole("dialog");
    fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
    fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "4" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    const box = await within(d).findByTestId("ai-composer-warnings", {}, { timeout: 3000 });
    const groups = within(box).getAllByTestId("ai-composer-warn-question");
    expect(groups.map(g => g.querySelector(".ai-composer-warn-head strong")!.textContent)).toEqual(["السؤال 1", "السؤال 2"]);
    expect(groups[0].textContent).toContain("ما وظيفة VLAN");
    expect(groups[0].textContent).toContain("الخيار رقم 1");
    expect(groups[1].textContent).toContain("يحتوي الإجابة «DHCP»");
    expect(within(groups[1]).getByRole("list", { name: "تنبيهات السؤال 2" })).toBeTruthy();
    fireEvent.click(within(groups[1]).getByRole("button", { name: "معاينة هذا السؤال" }));
    expect(onPreview).toHaveBeenCalledTimes(1);
    const shown = onPreview.mock.calls[0][0] as StructuredExam;
    expect(shown.sections.flatMap(s => s.questions.map(x => x.text))).toEqual(["يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟"]);
    expect(within(d).getByTestId("ai-composer-summary").textContent).toContain("PASS");
  });
});
