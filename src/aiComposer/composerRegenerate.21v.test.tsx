// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent, within, screen } from "@testing-library/react";
import { createRequire } from "node:module";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { regenerateInstruction, REGENERATE_LEAD } from "./composerWarningGroups";
import { COMPOSER_LIMITS } from "./composerLimits";
import type { ComposerTransport } from "./composerRun";
import type { StructuredExam } from "../examTypes";
import * as F from "./testing/composerFakeAi";

// Phase 21V — «أعد توليد هذا السؤال»: a warned question of the generated draft is replaced ALONE (mode replaceQuestion, scope that
// question), asked with its own warnings; the replacement goes through the real endpoint, the patch validator, the diff, the 21T review
// (the warning it removes is counted) and an explicit «تطبيق»; the builder is never touched before «فتح في المحرر».
afterEach(() => cleanup());

describe("21V-INSTR the instruction", () => {
  it("asks for the same idea, type and marks, lists each warning once (whitespace collapsed) and stays within the composer limit", () => {
    expect(regenerateInstruction(["  الإجابة\n مكشوفة ", "الإجابة مكشوفة", "خيار أطول"])).toBe(REGENERATE_LEAD + "\n- الإجابة مكشوفة\n- خيار أطول");
    expect(REGENERATE_LEAD).toContain("بالنوع نفسه والعلامة نفسها");
    const long = regenerateInstruction(Array.from({ length: 80 }, (_, i) => "ملاحظة " + i + " " + "س".repeat(100)));
    expect(long.length).toBeLessThanOrEqual(COMPOSER_LIMITS.instructionChars);
    expect(long.startsWith(REGENERATE_LEAD + "\n- ملاحظة 0 ")).toBe(true);
    expect(regenerateInstruction([])).toBe(REGENERATE_LEAD);
  });
});

const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const LEAK = "يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟";
const FIXED = "أي بروتوكول يوزّع عناوين IP على الأجهزة تلقائيًا؟";
const PLAN = F.plan("امتحان قصير", "default", [F.planSection("أساسيات", [F.planItem("multipleChoice", 1), F.planItem("multipleChoice", 1)])]);
const SECTION = { items: [
  F.item("multipleChoice", { question: F.mcq("ما وظيفة VLAN في الشبكة؟", ["تقسيم الشبكة منطقيًا", "تسريع المعالج", "تخزين البيانات"], 1) }),
  F.item("multipleChoice", { question: F.mcq(LEAK, ["DHCP", "DNS", "FTP"]) })
] };

describe("21V-UI «أعد توليد هذا السؤال» on the generated draft", () => {
  it("replaces only that question with its warnings as the request; the diff, the removed warning and «تطبيق» → the draft is fixed, the builder untouched", async () => {
    const bodies: Record<string, unknown>[] = [];
    let patch: unknown[] = [];
    const transport: ComposerTransport = async body => {
      bodies.push(body as Record<string, unknown>);
      const qid = String(((body as Record<string, unknown>).scope as { questionId?: string } | undefined)?.questionId ?? "");
      patch = [F.patch([F.op("replaceQuestion", { questionId: qid, marks: 1, item: F.item("multipleChoice", { question: F.mcq(FIXED, ["DHCP", "DNS", "FTP"], 0) }), reason: "إخفاء الإجابة" })])];
      const ai = F.scriptedAi({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION], ai_exam_patch: patch });
      return (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21v" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    };
    const empty = { examId: "E21V", title: "t", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
    const onApply = vi.fn(() => "ok" as const);
    render(<AiExamComposerDialog open onClose={() => {}} transport={transport} exam={empty} getLatestExam={() => empty} onApply={onApply} onPreview={() => {}} />);
    const d = screen.getByRole("dialog");
    fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
    fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    const box = await within(d).findByTestId("ai-composer-warnings", {}, { timeout: 3000 });
    const group = within(box).getAllByTestId("ai-composer-warn-question").find(g => (g.textContent || "").includes("«DHCP»"))!;
    const qid = group.getAttribute("data-question-id")!;
    fireEvent.click(within(group).getByRole("button", { name: "أعد توليد هذا السؤال" }));

    const diff = await within(d).findByRole("list", { name: "قائمة التعديلات" }, { timeout: 3000 });
    const req = bodies.find(b => b.stage === "modify")!;
    expect([req.mode, req.scope]).toEqual(["replaceQuestion", { kind: "question", questionId: qid }]);
    expect(String(req.instruction).startsWith(REGENERATE_LEAD)).toBe(true);
    expect(String(req.instruction)).toContain("يحتوي الإجابة «DHCP»");
    expect(diff.textContent).toContain(FIXED);
    expect(within(d).getByTestId("ai-composer-patch-warnings").textContent).toContain("ويزيل 1 من تنبيهات الامتحان الحالية");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    const after = await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    expect(after).toBeTruthy();
    const left = within(d).queryAllByTestId("ai-composer-warn-question").map(g => g.getAttribute("data-question-id"));
    expect(left).not.toContain(qid);                                                   // its warning is gone from the draft
    expect(onApply).not.toHaveBeenCalled();                                            // the builder is untouched until «فتح في المحرر»
  });

  it("is not offered when the dialog is disabled (saving)", async () => {
    const ai = F.scriptedAi({ ai_exam_plan: [PLAN], ai_exam_section: [SECTION] });
    const transport: ComposerTransport = async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21v" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    const empty = { examId: "E21V", title: "t", status: "draft", schemaVersion: 2, sections: [] } as unknown as StructuredExam;
    const { rerender } = render(<AiExamComposerDialog open onClose={() => {}} transport={transport} exam={empty} getLatestExam={() => empty} onApply={() => "ok"} onPreview={() => {}} />);
    const d = screen.getByRole("dialog");
    fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
    fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await within(d).findByTestId("ai-composer-warnings", {}, { timeout: 3000 });
    expect(within(d).getAllByRole("button", { name: "أعد توليد هذا السؤال" }).length).toBeGreaterThan(0);
    rerender(<AiExamComposerDialog open onClose={() => {}} transport={transport} exam={empty} getLatestExam={() => empty} onApply={() => "ok"} onPreview={() => {}} disabled />);
    expect(within(d).queryAllByRole("button", { name: "أعد توليد هذا السؤال" })).toEqual([]);
  });

  it("after «تطبيق» on the builder exam, the listed question can be regenerated against the builder's LATEST exam (not the dialog's copy)", async () => {
    const { newQuestion } = await import("../examBuilderState");
    const q = (id: string, text: string, opts: string[]) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: opts.map(t => ({ text: t })), answer: { correctOptionIndex: 0 } });
    let latest = { examId: "E21V-B", title: "t", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم", gradingPolicy: "all", stimuli: {}, questions: [q("q1", "ما الجهاز الذي يربط الشبكات المختلفة؟", ["الموجّه", "المبدّل", "المكرّر"]), q("q2", "ما وظيفة VLAN؟", ["تقسيم الشبكة", "تسريع", "تخزين"])] }] } as unknown as StructuredExam;
    const bodies: Record<string, unknown>[] = [];
    const scripts = [
      F.patch([F.op("updateQuestionText", { questionId: "q1", text: "يربط الموجّه الشبكات المختلفة، فأي جهاز يربطها؟", reason: "صياغة" })]),
      F.patch([F.op("replaceQuestion", { questionId: "q1", marks: 1, item: F.item("multipleChoice", { question: F.mcq("أي جهاز يربط الشبكات المختلفة ببعضها؟", ["الموجّه", "المبدّل", "المكرّر"], 0) }), reason: "إخفاء الإجابة" })])
    ];
    const transport: ComposerTransport = async body => {
      bodies.push(body as Record<string, unknown>);
      const ai = F.scriptedAi({ ai_exam_patch: [scripts[bodies.length - 1]] });
      return (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21v" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
    };
    const onApply = vi.fn((fn: (prev: StructuredExam) => StructuredExam) => { latest = fn(latest); return "ok" as const; });
    render(<AiExamComposerDialog open onClose={() => {}} transport={transport} exam={latest} getLatestExam={() => latest} onApply={onApply} onPreview={() => {}} onRevealQuestion={() => {}} />);
    const d = screen.getByRole("dialog");
    fireEvent.click(within(d).getByRole("tab", { name: "تعديل الامتحان" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "حسّن الصياغة" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await within(d).findByRole("list", { name: "قائمة التعديلات" }, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    const list = await within(d).findByTestId("ai-composer-applied-warnings", {}, { timeout: 3000 });
    fireEvent.click(within(list).getByRole("button", { name: "أعد توليد هذا السؤال" }));
    await within(d).findByRole("list", { name: "قائمة التعديلات" }, { timeout: 3000 });
    const req = bodies[1];
    expect([req.mode, req.scope]).toEqual(["replaceQuestion", { kind: "question", questionId: "q1" }]);
    expect(((req.exam as StructuredExam).sections[0].questions[0]).text).toBe("يربط الموجّه الشبكات المختلفة، فأي جهاز يربطها؟");   // the applied (latest) exam
    expect(String(req.instruction)).toContain("يحتوي الإجابة «الموجّه»");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await within(d).findByRole("heading", { name: "تم التطبيق" }, { timeout: 3000 });
    expect(latest.sections[0].questions[0].text).toBe("أي جهاز يربط الشبكات المختلفة ببعضها؟");
    expect(within(d).queryByTestId("ai-composer-applied-warnings")).toBeNull();          // the replacement introduced nothing
  });
});
