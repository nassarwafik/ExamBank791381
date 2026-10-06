// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { createRequire } from "node:module";
import StructuredExamBuilder from "../StructuredExamBuilder";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { validateStructuredExam } from "../examQuality";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { AiAuthorService } from "../aiAuthoring/aiAuthorService";
import type { ComposerTransport } from "./composerRun";
import * as F from "./testing/composerFakeAi";

// Phase 20F — Review Fix 1, UI findings (independent review of 50fd21f). Fail-first on 470a99b.
//   M2  an AI image request (assetRequest) blocked finalization but nothing in the Builder could resolve it;
//   m2  «فتح في المحرر» over an existing exam silently dropped the cover page, the blueprint and non-composer metadata;
//   m3  an apply whose functional update found a changed exam (queued edit) applied nothing yet reported «تم التطبيق».
const nodeRequire = createRequire(import.meta.url);
const { handler } = nodeRequire("../../api/src/functions/ai-exam-composer.js") as { handler: (req: unknown, deps: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mcqQ = (id: string, text: string) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
function realTransport(script: Record<string, unknown[]>): ComposerTransport {
  const ai = F.scriptedAi(script);
  return async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
}
type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ initial, service, onHistory }: { initial: StructuredExam; service?: AiAuthorService; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  useEffect(() => { onHistory(hist); });
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} aiAuthor={service} />;
}
async function mount(initial: StructuredExam, transport?: ComposerTransport) {
  let hist!: Hist;
  const service: AiAuthorService = { author: vi.fn(async () => ({ ok: false as const, code: "UNUSED" })), ...(transport ? { composeExam: transport } : {}) };
  render(<Host initial={initial} service={service} onHistory={h => { hist = h; }} />);
  await tick(30);
  return () => hist;
}
async function waitFor(fn: () => boolean, label: string, ms = 3000) { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting for " + label); await tick(20); } }

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("20F-RF1 UI findings", () => {
  it("M2: the Builder shows the AI image request and resolves it (finalization no longer blocked)", async () => {
    const q = { ...mcqQ("q1", "سؤال يحتاج صورة"), assetRequest: { v: 1 as const, description: "صورة راوتر بثلاثة منافذ" } };
    const exam: StructuredExam = { examId: "E-RF1", title: "t", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [q] }] };
    const hist = await mount(exam);
    expect(validateStructuredExam(hist().present!).map(i => i.code)).toContain("AI_ASSET_REQUEST_UNRESOLVED");
    const note = await screen.findByTestId("ai-asset-request", {}, { timeout: 3000 });
    expect(note.textContent).toContain("صورة راوتر بثلاثة منافذ");
    fireEvent.click(within(note).getByRole("button", { name: "تم إرفاق الصورة — إزالة الطلب" }));
    await tick(30);
    const after = hist().present!;
    expect(after.sections[0].questions[0].assetRequest).toBeUndefined();
    expect(validateStructuredExam(after).map(i => i.code)).not.toContain("AI_ASSET_REQUEST_UNRESOLVED");
    expect(screen.queryByTestId("ai-asset-request")).toBeNull();
  });

  it("m2: «فتح في المحرر» replaces title / sections / presentation but keeps the cover page, the blueprint and other metadata", async () => {
    const plan = F.plan("امتحان مولّد", "classicPaper", [F.planSection("قسم", [F.planItem("multipleChoice", 2, { topic: "VLAN" })])]);
    const section = { items: [F.item("multipleChoice", { topic: "VLAN", question: F.mcq("ما وظيفة VLAN؟", ["تقسيم الشبكة", "تسريع المعالج"]) })] };
    const coverPage = { schoolName: "مدرسة النور", subject: "الشبكات" };
    const exam: StructuredExam = { examId: "E-RF1", title: "قديم", status: "draft", schemaVersion: 2, coverPage: coverPage as never, metadata: { owner: "dept-7" }, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcqQ("q1", "قديم")] }] };
    const hist = await mount(exam, realTransport({ ai_exam_plan: [plan], ai_exam_section: [section] }));
    fireEvent.click(screen.getByRole("button", { name: "🧠 المؤلف الذكي للامتحان" }));
    const d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
    fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
    expect(within(d).getByText(/تبقى صفحة الغلاف والمخطط/)).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "تأكيد الاستبدال" }));
    await tick(40);
    const after = hist().present!;
    expect(after.title).toBe("امتحان مولّد");
    expect(after.coverPage).toEqual(coverPage);
    expect((after.metadata as Record<string, unknown>).owner).toBe("dept-7");
    expect((after.metadata as Record<string, unknown>).aiComposer).toBeTruthy();
  });

  it("m3 (generate): «فتح في المحرر» whose update finds a changed exam reports STALE and keeps the staged result", async () => {
    const exam: StructuredExam = { examId: "E-RF1", title: "t", status: "draft", schemaVersion: 2, sections: [] };
    const plan = F.plan("امتحان مولّد", "classicPaper", [F.planSection("قسم", [F.planItem("multipleChoice", 2)])]);
    const section = { items: [F.item("multipleChoice", { question: F.mcq("ما وظيفة VLAN؟", ["تقسيم الشبكة", "تسريع المعالج"]) })] };
    let result: StructuredExam | null = null;
    const edited = { ...exam, title: "عدّله المعلم في الأثناء" };
    render(<AiExamComposerDialog open onClose={() => {}} transport={realTransport({ ai_exam_plan: [plan], ai_exam_section: [section] })} exam={exam} getLatestExam={() => exam}
      onApply={upd => { result = upd(edited); return "ok"; }} onPreview={() => {}} onUndo={() => {}} selectedQuestionId={null} disabled={false} />);
    const d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
    fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
    await tick(40);
    expect(result).toBe(edited);
    expect(within(d).queryByRole("heading", { name: "تم التطبيق" })).toBeNull();
    expect(within(d).getByRole("alert").textContent).toContain("تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.");
  });

  it("m3: an apply whose update finds a changed exam reports STALE, never «تم التطبيق»", async () => {
    const exam: StructuredExam = { examId: "E-RF1", title: "t", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [mcqQ("q1", "س")] }] };
    let result: StructuredExam | null = null;
    const edited = { ...exam, title: "عدّله المعلم في الأثناء" };
    render(<AiExamComposerDialog open onClose={() => {}} transport={realTransport({ ai_exam_patch: [F.patch([F.op("updatePresentation", { preset: "classicPaper" })])] })} exam={exam} getLatestExam={() => exam}
      onApply={upd => { result = upd(edited); return "ok"; }} onPreview={() => {}} onUndo={() => {}} selectedQuestionId={null} disabled={false} />);
    const d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("tab", { name: "التصميم" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "تصميم رسمي" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await waitFor(() => !!d.querySelector(".ai-composer-diff"), "diff");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await tick(40);
    expect(result).toBe(edited);                                                         // the updater kept the changed exam
    expect(within(d).queryByRole("heading", { name: "تم التطبيق" })).toBeNull();
    expect(within(d).getByRole("alert").textContent).toContain("تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.");
  });
});
