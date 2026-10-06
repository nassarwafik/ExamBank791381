// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { AiAuthorService } from "../aiAuthoring/aiAuthorService";
import type { ComposerTransport } from "./composerRun";
import * as F from "./testing/composerFakeAi";

// Phase 20F — «المؤلف الذكي للامتحان» inside the Structured Exam Builder. The fake transport runs the REAL endpoint handler with a
// scripted deterministic model, so the dialog drives the real staged pipeline (plan → sections → local re-verification; modify → patch +
// diff). Nothing reaches the builder before an explicit apply; an apply is ONE undo step; a stale revision applies nothing; cancel applies
// nothing; selective apply keeps operation groups atomic.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const nodeRequire = createRequire(import.meta.url);
const { handler } = nodeRequire("../../api/src/functions/ai-exam-composer.js") as { handler: (req: unknown, deps: unknown) => Promise<{ status: number; jsonBody: Record<string, unknown> }> };
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const DIALOG = "المؤلف الذكي للامتحان";
const ACTION = "🧠 المؤلف الذكي للامتحان";

const mcqQ = (id: string, text: string) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } });
const baseExam = (): StructuredExam => ({ examId: "EXAM-20F", title: "امتحان قائم", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [mcqQ("q1", "السؤال الأول القائم"), mcqQ("q2", "السؤال الثاني القائم")] }] });

function realTransport(script: Record<string, unknown[]>) {
  const ai = F.scriptedAi(script);
  const bodies: Record<string, unknown>[] = [];
  const t: ComposerTransport = async body => {
    bodies.push(body);
    const deps = { requireBuilderAuth: () => ({ ok: true, user: { sub: "t1" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null };
    return (await handler({ json: async () => body }, deps)).jsonBody;
  };
  return { t, calls: ai.calls, bodies };
}
const GEN_PLAN = F.plan("امتحان الشبكات القصير", "classicPaper", [
  F.planSection("أساسيات الشبكات", [F.planItem("multipleChoice", 2, { topic: "VLAN" }), F.planItem("trueFalse", 1, { topic: "IPv4" })]),
  F.planSection("الخدمات", [F.planItem("multipleChoice", 2, { topic: "DHCP" })])
]);
const GEN_SECTIONS = [
  { items: [F.item("multipleChoice", { topic: "VLAN", question: F.mcq("ما وظيفة الشبكة المحلية الافتراضية VLAN؟", ["تقسيم الشبكة منطقيًا", "تسريع المعالج", "تخزين الملفات"]) }), F.item("trueFalse", { topic: "IPv4", question: F.tf("يتكوّن عنوان IPv4 من 32 بت.", true) })] },
  { items: [F.item("multipleChoice", { topic: "DHCP", question: F.mcq("أي بروتوكول يوزّع عناوين IP تلقائيًا؟", ["DHCP", "DNS", "FTP"]) })] }
];

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ service, onHistory }: { service?: AiAuthorService; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(baseExam(), "saved"); } }, [hist]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} aiAuthor={service} />;
}
async function mount(transport?: ComposerTransport) {
  let hist!: Hist;
  const service: AiAuthorService = { author: vi.fn(async () => ({ ok: false as const, code: "UNUSED" })), ...(transport ? { composeExam: transport } : {}) };
  render(<Host service={service} onHistory={h => { hist = h; }} />);
  await tick(30);
  return { hist: () => hist };
}
async function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: ACTION }));
  return screen.findByRole("dialog", { name: DIALOG }, { timeout: 3000 });
}
async function waitFor(fn: () => boolean, label: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting for " + label); await tick(20); }
}
function fillGenerate(d: HTMLElement, subject: string, marks: string) {
  fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: subject } });
  fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: marks } });
}
async function requestModify(d: HTMLElement, tab: string, instruction: string) {
  fireEvent.click(within(d).getByRole("tab", { name: tab }));
  fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: instruction } });
  fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
  await waitFor(() => !!d.querySelector(".ai-composer-diff") || !!within(d).queryByRole("alert"), "diff");
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("20F AI Full Exam Composer dialog", () => {
  it("is not offered without the App-owned composer transport", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });

  it("a: generates a staged exam (PASS, exact marks); nothing changes before «فتح في المحرر»; apply replaces after confirmation as ONE undo step", async () => {
    const { t, calls } = realTransport({ ai_exam_plan: [GEN_PLAN], ai_exam_section: [...GEN_SECTIONS] });
    const { hist } = await mount(t);
    const before = hist().present!;
    const d = await openDialog();
    fillGenerate(d, "الشبكات", "5");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    const summary = await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    expect(calls.map(c => c.schemaName)).toEqual(["ai_exam_plan", "ai_exam_section", "ai_exam_section"]);
    expect(summary.textContent).toContain("PASS");
    expect(within(d).getByTestId("ai-composer-marks").textContent).toBe("5 / 5 المطلوب");
    expect(summary.textContent).toContain("ورقة امتحان رسمية");                           // preset label, not the raw id
    expect(within(d).getByText("مسودة من الذكاء الاصطناعي — راجعها قبل الاعتماد")).toBeTruthy();
    expect(within(d).getByRole("table").textContent).toContain("VLAN");
    expect(hist().present).toBe(before);                                                  // staged only
    fireEvent.click(within(d).getByRole("button", { name: "معاينة الخطة" }));
    expect(within(d).getByTestId("ai-composer-plan").textContent).toContain("أساسيات الشبكات");
    fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
    expect(within(d).getByText("سيستبدل هذا محتوى الامتحان الحالي (يمكنك التراجع)")).toBeTruthy();
    expect(hist().present).toBe(before);                                                  // confirmation first
    fireEvent.click(within(d).getByRole("button", { name: "تأكيد الاستبدال" }));
    await tick(30);
    const after = hist().present!;
    expect(after.examId).toBe("EXAM-20F");
    expect(after.title).toBe("امتحان الشبكات القصير");
    expect(after.sections.map(s => s.questions.length)).toEqual([2, 1]);
    expect(after.sections.flatMap(s => s.questions.map(q => q.presentationType))).toEqual(["multipleChoice", "trueFalse", "multipleChoice"]);
    expect((after.presentation as { preset?: string }).preset).toBe("classicPaper");
    const history = ((after.metadata as Record<string, unknown>).aiComposer as { history: { mode: string }[] }).history;
    expect(history.map(h => h.mode)).toEqual(["generate"]);
    expect(within(d).getByRole("heading", { name: "تم التطبيق" })).toBeTruthy();
    act(() => hist().undo()); await tick(30);
    expect(hist().present!.sections[0].questions.map(q => q.examQuestionId)).toEqual(["q1", "q2"]);
    expect(hist().present!.title).toBe("امتحان قائم");
  });

  it("b: a plan that keeps violating the requested total (3 attempts) is a validation failure; nothing to open; the builder is unchanged", async () => {
    const wrong = () => F.plan("خطة خاطئة", "default", [F.planSection("قسم", [F.planItem("multipleChoice", 4)])]);
    const { t, calls } = realTransport({ ai_exam_plan: [wrong(), wrong(), wrong()] });
    const { hist } = await mount(t);
    const before = hist().present!;
    const d = await openDialog();
    fillGenerate(d, "الشبكات", "3");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await waitFor(() => !!within(d).queryByRole("alert"), "alert");
    expect(calls.length).toBe(3);
    const alert = within(d).getByRole("alert");
    expect(alert.textContent).toContain("لم يجتز اقتراح الذكاء الاصطناعي الفحوص.");
    expect(alert.textContent).toContain("مجموع علامات الأقسام 4 ويجب أن يساوي 3");
    expect(within(d).queryByRole("button", { name: "فتح في المحرر" })).toBeNull();
    expect(hist().present).toBe(before);
  });

  it("c + h: presentation mode shows a textual before → after diff; applying changes only the presentation (ids, marks, answers unchanged)", async () => {
    const { t } = realTransport({ ai_exam_patch: [F.patch([F.op("updatePresentation", { preset: "classicPaper", reason: "مظهر رسمي" })], "تصميم رسمي")] });
    const { hist } = await mount(t);
    const before = hist().present!;
    const d = await openDialog();
    const tabs = within(d).getAllByRole("tab");
    expect(tabs.map(x => x.textContent)).toEqual(["امتحان جديد", "تعديل الامتحان", "قسم جديد", "السؤال المحدد", "التصميم"]);
    expect(within(d).getByRole("tablist")).toBeTruthy();
    await requestModify(d, "التصميم", "اجعل التصميم رسميًا");
    const diff = d.querySelector(".ai-composer-diff") as HTMLElement;
    expect(diff.textContent).toContain("قالب العرض: الافتراضي → classicPaper");
    expect(diff.textContent).toContain("مظهر رسمي");
    expect(hist().present).toBe(before);
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await tick(30);
    const after = hist().present!;
    expect((after.presentation as { preset?: string }).preset).toBe("classicPaper");
    expect(after.sections).toEqual(before.sections);
    expect(within(d).getByRole("heading", { name: "تم التطبيق" })).toBeTruthy();
    fireEvent.click(within(d).getByRole("button", { name: "تراجع" })); await tick(30);
    expect(hist().present!.presentation).toBeUndefined();
    expect(screen.queryByRole("dialog", { name: DIALOG })).toBeNull();
  });

  it("d: an exam edited in the builder while the patch was staged is STALE — nothing is applied", async () => {
    const { t } = realTransport({ ai_exam_patch: [F.patch([F.op("updatePresentation", { preset: "classicPaper" })])] });
    const { hist } = await mount(t);
    const d = await openDialog();
    await requestModify(d, "التصميم", "تصميم رسمي");
    act(() => hist().update(prev => ({ ...prev, title: "عنوان عدّله المعلم" }))); await tick(30);
    const edited = hist().present!;
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await tick(30);
    expect(within(d).getByRole("alert").textContent).toContain("تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.");
    expect(within(d).getByRole("button", { name: "إعادة الطلب" })).toBeTruthy();
    expect(within(d).getByRole("button", { name: "تجاهل" })).toBeTruthy();
    expect(hist().present).toBe(edited);
    expect(hist().present!.presentation).toBeUndefined();
  });

  it("e + h: cancel during generation aborts the request; the progress line is a polite status; nothing is applied", async () => {
    let aborted = false;
    const t: ComposerTransport = (_body, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => { aborted = true; reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    });
    const { hist } = await mount(t);
    const before = hist().present!;
    const d = await openDialog();
    fillGenerate(d, "الشبكات", "5");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await tick(20);
    const status = within(d).getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("إنشاء خطة الامتحان");
    expect(d.querySelector('[aria-current="step"]')?.textContent).toBe("إنشاء خطة الامتحان");
    fireEvent.click(within(d).getByRole("button", { name: "إلغاء" }));
    await tick(30);
    expect(aborted).toBe(true);
    expect(within(d).getByRole("alert").textContent).toContain("أُلغي الطلب؛ لم يتغيّر الامتحان.");
    expect(within(d).queryByRole("status")).toBeNull();
    expect(hist().present).toBe(before);
  });

  it("f: selective apply keeps a target's operations atomic (two ops on q1 = one group); the unchecked group is not applied", async () => {
    const { t } = realTransport({ ai_exam_patch: [F.patch([
      F.op("updateQuestionText", { questionId: "q1", text: "نص محسّن للسؤال الأول", reason: "وضوح" }),
      F.op("updateQuestionMarks", { questionId: "q1", marks: 3, reason: "وزن" }),
      F.op("updateQuestionText", { questionId: "q2", text: "نص محسّن للسؤال الثاني", reason: "وضوح" })
    ])] });
    const { hist } = await mount(t);
    const d = await openDialog();
    await requestModify(d, "تعديل الامتحان", "حسّن صياغة الأسئلة");
    const groups = within(d).getAllByRole("checkbox");
    expect(groups.length).toBe(2);
    expect(groups.every(g => (g as HTMLInputElement).checked)).toBe(true);
    const diff = d.querySelector(".ai-composer-diff") as HTMLElement;
    expect(diff.textContent).toContain("النص: السؤال الأول القائم → نص محسّن للسؤال الأول");
    expect(diff.textContent).toContain("العلامة: 1 → 3");
    fireEvent.click(groups[1]);                                                           // uncheck the q2 group
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق المحدد" }));
    await tick(30);
    const qs = hist().present!.sections[0].questions;
    expect(qs[0].text).toBe("نص محسّن للسؤال الأول");
    expect(qs[0].marks).toBe(3);
    expect(qs[1].text).toBe("السؤال الثاني القائم");
    expect(qs.map(q => q.examQuestionId)).toEqual(["q1", "q2"]);
    expect((qs[0] as unknown as { answer: unknown }).answer).toEqual({ correctOptionIndex: 0 });
  });

  it("a2: «تعديل بالذكاء الاصطناعي» modifies the STAGED exam (the builder stays untouched) and returns to its re-verified summary", async () => {
    const { t, bodies } = realTransport({ ai_exam_plan: [GEN_PLAN], ai_exam_section: [...GEN_SECTIONS], ai_exam_patch: [F.patch([F.op("updatePresentation", { preset: "cards", reason: "بطاقات" })])] });
    const { hist } = await mount(t);
    const before = hist().present!;
    const d = await openDialog();
    fillGenerate(d, "الشبكات", "5");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: "تعديل بالذكاء الاصطناعي" }));
    expect(within(d).getByText("تعديل المسودة المولّدة (لم تُفتح في المحرر بعد).")).toBeTruthy();
    await requestModify(d, "التصميم", "استخدم البطاقات");
    const modifyBody = bodies[bodies.length - 1];
    expect(modifyBody.stage).toBe("modify");
    expect((modifyBody.exam as StructuredExam).title).toBe("امتحان الشبكات القصير");          // the staged draft, not the builder exam
    expect((d.querySelector(".ai-composer-diff") as HTMLElement).textContent).toContain("قالب العرض: classicPaper → cards");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await tick(30);
    const summary = within(d).getByTestId("ai-composer-summary");
    expect(summary.textContent).toContain("PASS");
    expect(summary.textContent).not.toContain("ورقة امتحان رسمية");
    expect(hist().present).toBe(before);
    fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
    fireEvent.click(within(d).getByRole("button", { name: "تأكيد الاستبدال" }));
    await tick(30);
    const after = hist().present!;
    expect((after.presentation as { preset?: string }).preset).toBe("cards");
    expect(((after.metadata as Record<string, unknown>).aiComposer as { history: { mode: string }[] }).history.map(h => h.mode)).toEqual(["presentation", "generate"]);
  });

  it("a3: a builder edit during generation makes the staged exam STALE — «إعادة التوليد» / «تجاهل», nothing applied", async () => {
    const { t } = realTransport({ ai_exam_plan: [GEN_PLAN], ai_exam_section: [...GEN_SECTIONS] });
    const { hist } = await mount(t);
    const d = await openDialog();
    fillGenerate(d, "الشبكات", "5");
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
    await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
    act(() => hist().update(prev => ({ ...prev, title: "عنوان جديد" }))); await tick(30);
    const edited = hist().present!;
    fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
    await tick(10);
    expect(within(d).getByRole("alert").textContent).toContain("تم تعديل الامتحان أثناء عمل الذكاء الاصطناعي.");
    expect(within(d).getByRole("button", { name: "إعادة التوليد" })).toBeTruthy();
    expect(hist().present).toBe(edited);
    fireEvent.click(within(d).getByRole("button", { name: "تجاهل" }));
    await tick(10);
    expect(within(d).getByRole("button", { name: "إنشاء الامتحان" })).toBeTruthy();
    expect(hist().present).toBe(edited);
  });

  it("g: the dialog is a lazy edge of the builder; no static composer runtime import in the builder or App; App posts to /api/ai-exam-composer", () => {
    const builder = fs.readFileSync(path.join(repo, "src/StructuredExamBuilder.tsx"), "utf8");
    expect(builder).toMatch(/lazy\(\(\) => import\("\.\/aiComposer\/AiExamComposerDialog"\)\)/);
    expect(builder).not.toMatch(/^import(?!\s+type)[^;]*["']\.\/aiComposer\//m);
    const app = fs.readFileSync(path.join(repo, "src/App.tsx"), "utf8");
    expect(app).not.toMatch(/^import(?!\s+type)[^;]*["']\.\/aiComposer\//m);
    expect(app).toMatch(/"\/api\/ai-exam-composer"/);
    expect(app).toMatch(/composeExam:/);
    const service = fs.readFileSync(path.join(repo, "src/aiAuthoring/aiAuthorService.ts"), "utf8");
    expect(service).toMatch(/^import type \{ ComposerTransport \} from "\.\.\/aiComposer\/composerRun";$/m);
  });
});
