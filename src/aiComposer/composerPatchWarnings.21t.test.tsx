// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within, screen, waitFor } from "@testing-library/react";
import { createRequire } from "node:module";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { reviewPatchWarnings } from "./composerWarningGroups";
import { newQuestion } from "../examBuilderState";
import type { AiExamPatchV1 } from "./composerPatch";
import type { ComposerTransport } from "./composerRun";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 21T — an AI modification's warnings, reviewed per question: the SELECTED operations are dry-run through the real apply, only the
// warnings they introduce are grouped (against the exam AFTER the change: its number, its stem, its preview), the ones they remove are
// counted, warnings the exam already had are not repeated, and nothing reaches the builder before «تطبيق».
afterEach(() => cleanup());
const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const mcqQ = (id: string, text: string, options: string[]) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: 0 } });
const LEAK_A = "يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟";
const baseExam = (): StructuredExam => ({ examId: "E21T", title: "امتحان قائم", status: "draft", schemaVersion: 2, sections: [
  { id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [
    mcqQ("a", "ما البروتوكول الذي يوزّع العناوين على الأجهزة؟", ["DHCP", "DNS", "FTP"]),
    mcqQ("b", "يربط الموجّه الشبكات المختلفة، فأي جهاز يربطها؟", ["الموجّه", "المبدّل", "المكرّر"])
  ] },
  { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [
    mcqQ("c", "يحوّل نظام DNS الأسماء إلى عناوين، فأي نظام يحوّلها؟", ["DNS", "DHCP", "FTP"])
  ] }
] } as unknown as StructuredExam);
// group 0 introduces a leak on «a»; group 1 removes the leak on «b»; the leak on «c» is there before and after
const OPS = [
  F.op("updateQuestionText", { questionId: "a", text: LEAK_A, reason: "صياغة" }),
  F.op("updateQuestionText", { questionId: "b", text: "أي جهاز يربط الشبكات المختلفة؟", reason: "إخفاء الإجابة" })
];
const transportOf = (ops: unknown[]): ComposerTransport => {
  const ai = F.scriptedAi({ ai_exam_patch: [F.patch(ops as Record<string, unknown>[])] });
  return async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21t" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
};
const patchOf = async (exam: StructuredExam, ops: unknown[]): Promise<AiExamPatchV1> => {
  const r = await transportOf(ops)({ stage: "modify", exam, mode: "modifyExam", scope: { kind: "exam" }, instruction: "حسّن الصياغة", nonce: "t21tnonce" });
  expect(r.ok).toBe(true);
  return r.patch as AiExamPatchV1;
};

describe("21T-REVIEW the warnings a modification introduces", () => {
  it("only the new warnings, grouped against the modified exam; removed ones counted; existing ones not repeated", async () => {
    const exam = baseExam();
    const r = reviewPatchWarnings(exam, await patchOf(exam, OPS), { selected: [0, 1] })!;
    expect(r.introduced.examLevel).toEqual([]);
    expect(r.introduced.questions.map(q => [q.questionId, q.number, q.sectionTitle])).toEqual([["a", 1, "القسم الأول"]]);
    expect(r.introduced.questions[0].messages.join(" ")).toContain("«DHCP»");
    expect(r.introduced.questions[0].excerpt).toContain("يوزّع بروتوكول DHCP");
    expect(r.introduced.questions[0].preview.sections.flatMap(s => s.questions.map(q => q.text))).toEqual([LEAK_A]);
    expect(r.introduced.total).toBe(1);
    expect(r.resolved).toBe(1);
  });
  it("follows the selection: group 1 alone introduces nothing and removes one; nothing selected → no review", async () => {
    const exam = baseExam();
    const patch = await patchOf(exam, OPS);
    expect(reviewPatchWarnings(exam, patch, { selected: [1] })).toEqual({ introduced: { examLevel: [], questions: [], total: 0 }, resolved: 1 });
    expect(reviewPatchWarnings(exam, patch, { selected: [] })).toBeNull();
  });
  it("numbers follow the exam after the change (a question moved to another section), and a stale exam gives no review", async () => {
    const exam = baseExam();
    const patch = await patchOf(exam, [F.op("updateQuestionText", { questionId: "a", text: LEAK_A, reason: "صياغة" }), F.op("moveQuestion", { questionId: "a", sectionId: "s2", position: null, reason: "نقل" })]);
    const r = reviewPatchWarnings(exam, patch, { selected: [0, 1] })!;
    expect(r.introduced.questions.map(q => [q.questionId, q.number, q.sectionTitle])).toEqual([["a", 3, "القسم الثاني"]]);
    expect(reviewPatchWarnings({ ...exam, title: "عدّله المعلم" }, patch, { selected: [0, 1] })).toBeNull();
  });
});

describe("21T-UI the proposed modification shows its new warnings per question, with a preview of the modified question", () => {
  it("the new leak appears under question 1 with the modified stem; the selection updates the review; nothing is applied", async () => {
    const exam = baseExam();
    const onPreview = vi.fn(), onApply = vi.fn(() => "ok" as const);
    render(<AiExamComposerDialog open onClose={() => {}} transport={transportOf(OPS)} exam={exam} getLatestExam={() => exam} onApply={onApply} onPreview={onPreview} />);
    const d = screen.getByRole("dialog");
    fireEvent.click(within(d).getByRole("tab", { name: "تعديل الامتحان" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "حسّن الصياغة" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    const box = await within(d).findByTestId("ai-composer-patch-warnings", {}, { timeout: 3000 });
    expect(within(box).getByRole("heading", { name: "تنبيهات جديدة بعد التعديل" })).toBeTruthy();
    expect(box.textContent).toContain("ويزيل 1 من تنبيهات الامتحان الحالية");
    const groups = within(box).getAllByTestId("ai-composer-warn-question");
    expect(groups.map(g => g.getAttribute("data-question-id"))).toEqual(["a"]);
    expect(groups[0].textContent).toContain("السؤال 1");
    expect(groups[0].textContent).toContain("يوزّع بروتوكول DHCP");
    expect(groups[0].textContent).toContain("يحتوي الإجابة «DHCP»");
    expect(box.textContent).not.toContain("DNS»");                                            // «c» had its warning before: not repeated
    fireEvent.click(within(groups[0]).getByRole("button", { name: "معاينة هذا السؤال" }));
    expect((onPreview.mock.calls[0][0] as StructuredExam).sections.flatMap(s => s.questions.map(q => q.text))).toEqual([LEAK_A]);
    const picks = within(d).getAllByRole("checkbox");
    fireEvent.click(picks[0]);                                                                 // drop the change that leaks
    await waitFor(() => expect(within(d).getByTestId("ai-composer-patch-warnings").textContent).toContain("لا يُدخل التعديل المحدد تنبيهات جديدة."));
    expect(within(within(d).getByTestId("ai-composer-patch-warnings")).queryAllByTestId("ai-composer-warn-question")).toEqual([]);
    fireEvent.click(picks[1]);                                                                 // nothing selected → no review
    await waitFor(() => expect(within(d).queryByTestId("ai-composer-patch-warnings")).toBeNull());
    expect(onApply).not.toHaveBeenCalled();
    expect(exam.sections[0].questions[0].text).toBe("ما البروتوكول الذي يوزّع العناوين على الأجهزة؟");
  });
});
