// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { createRequire } from "node:module";
import StructuredExamBuilder from "../StructuredExamBuilder";
import AiExamComposerDialog from "./AiExamComposerDialog";
import { toolbarItem } from "../builder/toolbarTestActions";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { AiAuthorService } from "../aiAuthoring/aiAuthorService";
import type { ComposerTransport } from "./composerRun";
import * as F from "./testing/composerFakeAi";

// Phase 21U — from the warning to the editor. After «فتح في المحرر» / «تطبيق», the dialog lists the questions the applied result still
// warns about (generation: every per-question warning of the generated exam; modification: only what that apply introduced), each with
// «تحرير هذا السؤال»: the dialog closes and the builder opens THAT question — its card is focused (classic: re-opened; Studio: the active
// card of the content step). Driven through the REAL endpoint with a scripted model, inside the real builder.
const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function waitFor(fn: () => boolean, label: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting for " + label); await tick(20); }
}
const LEAK = "يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟";
const mcqQ = (id: string, text: string, options: string[]) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: 0 } });
const baseExam = (): StructuredExam => ({ examId: "E21U", title: "امتحان قائم", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [
  mcqQ("q1", "ما الجهاز الذي يربط الشبكات المختلفة؟", ["الموجّه", "المبدّل", "المكرّر"]),
  mcqQ("q2", "ما البروتوكول الذي يوزّع العناوين على الأجهزة؟", ["DHCP", "DNS", "FTP"])
] }] } as unknown as StructuredExam);
const transportOf = (script: Record<string, unknown[]>): ComposerTransport => {
  const ai = F.scriptedAi(script);
  return async body => (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21u" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody;
};
const GEN = {
  ai_exam_plan: [F.plan("امتحان قصير", "default", [F.planSection("أساسيات", [F.planItem("multipleChoice", 1), F.planItem("multipleChoice", 1)])])],
  ai_exam_section: [{ items: [
    F.item("multipleChoice", { question: F.mcq("ما وظيفة VLAN في الشبكة؟", ["تقسيم الشبكة منطقيًا", "تسريع المعالج", "تخزين البيانات"], 1) }),
    F.item("multipleChoice", { question: F.mcq(LEAK, ["DHCP", "DNS", "FTP"]) })
  ] }]
};

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ service, layout, onHistory }: { service: AiAuthorService; layout?: "classic" | "studio"; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(baseExam(), "saved"); } }, [hist]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  const [startTool, setStartTool] = useState<{ examId: string; key: string } | null>(layout === "studio" ? { examId: "E21U", key: "ai-composer" } : null);
  if (!hist.present) return null;
  // the Studio opens the composer as a start tool (its toolbar is not the classic one)
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} aiAuthor={service} layout={layout}
    startTool={startTool} onStartToolConsumed={() => setStartTool(null)} />;
}
async function mount(transport: ComposerTransport, layout?: "classic" | "studio") {
  let hist!: Hist;
  render(<Host service={{ author: vi.fn(async () => ({ ok: false as const, code: "UNUSED" })), composeExam: transport }} layout={layout} onHistory={h => { hist = h; }} />);
  await tick(30);
  if (layout !== "studio") fireEvent.click(toolbarItem("المؤلف الذكي للامتحان"));
  const d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
  return { hist: () => hist, d };
}
const card = (id: string) => document.querySelector<HTMLElement>('.sb-question[data-question-id="' + id + '"], .st-card[data-question-id="' + id + '"]');   // the builder card, not the dialog's group
async function generateAndOpen(d: HTMLElement) {
  fireEvent.change(within(d).getByRole("textbox", { name: "المادة (مطلوب)" }), { target: { value: "الشبكات" } });
  fireEvent.change(within(d).getByRole("spinbutton", { name: "مجموع العلامات (مطلوب)" }), { target: { value: "2" } });
  fireEvent.click(within(d).getByRole("button", { name: "إنشاء الامتحان" }));
  await within(d).findByTestId("ai-composer-summary", {}, { timeout: 3000 });
  fireEvent.click(within(d).getByRole("button", { name: "فتح في المحرر" }));
  fireEvent.click(within(d).getByRole("button", { name: "تأكيد الاستبدال" }));
  return within(d).findByTestId("ai-composer-applied-warnings", {}, { timeout: 3000 });
}

// The Studio canvas is its own lazy chunk; the Studio case holds it back until after the click, so the card is NOT rendered when
// «تحرير هذا السؤال» runs (the condition that left focus on <body> under CI load before the bounded wait). Released by that test only.
const studioGate = vi.hoisted(() => { let release!: () => void; const held = new Promise<void>(r => { release = r; }); return { held, release }; });
vi.mock("../studio/StudioWorkspace", async importOriginal => { await studioGate.held; return importOriginal(); });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21U-GEN after «فتح في المحرر», «تحرير هذا السؤال» opens the generated question in the builder", () => {
  it("classic layout: the question the warning names becomes the focused card; the dialog is closed", async () => {
    const { hist, d } = await mount(transportOf(GEN));
    const box = await generateAndOpen(d);
    const groups = within(box).getAllByTestId("ai-composer-warn-question");
    expect(groups.map(g => g.querySelector(".ai-composer-warn-head strong")!.textContent)).toEqual(["السؤال 2"]);
    expect(groups[0].textContent).toContain("يحتوي الإجابة «DHCP»");
    const id = groups[0].getAttribute("data-question-id")!;
    const inBuilder = hist().present!.sections.flatMap(s => s.questions);
    expect(inBuilder.find(q => q.examQuestionId === id)?.text).toBe(LEAK);             // the id is the builder's own after the apply
    fireEvent.click(within(groups[0]).getByRole("button", { name: "تحرير هذا السؤال" }));
    await tick(30);
    expect(screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeNull();
    expect(document.activeElement).toBe(card(id));
    expect(card(id)!.textContent).toContain("DHCP");
  });

  it("Studio layout: the question becomes the active card of the content step and is focused", async () => {
    const { d } = await mount(transportOf(GEN), "studio");
    const box = await generateAndOpen(d);
    const group = within(box).getAllByTestId("ai-composer-warn-question")[0];
    const id = group.getAttribute("data-question-id")!;
    expect(card(id)).toBeNull();                                                        // the canvas is not rendered yet
    fireEvent.click(within(group).getByRole("button", { name: "تحرير هذا السؤال" }));
    await tick(120);
    studioGate.release();                                                               // the canvas arrives after the click
    await waitFor(() => document.activeElement === card(id), "the studio card focused", 2500);
    expect(card(id)!.getAttribute("data-active")).toBe("true");                       // the ACTIVE card of the content step (its editor)
    expect(card(id)!.getAttribute("aria-label")).toBe("تحرير السؤال 2");
    expect(screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeNull();
  });
});

describe("21U-MOD after «تطبيق الكل», only what that modification introduced is offered", () => {
  it("the leak the patch adds on q1 is listed (question 1, modified stem); q2's existing leak is not; «تحرير هذا السؤال» focuses q1", async () => {
    const leakQ1 = "يربط الموجّه الشبكات المختلفة، فأي جهاز يربطها؟";
    const { hist, d } = await mount(transportOf({ ai_exam_patch: [F.patch([F.op("updateQuestionText", { questionId: "q1", text: leakQ1, reason: "صياغة" })])] }));
    // q2 «ما البروتوكول الذي يوزّع …» has no leak; make the base carry one on q2 so it exists BEFORE the patch
    act(() => hist().update(prev => ({ ...prev, sections: prev.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q2" ? { ...q, text: LEAK } : q)) })) })));
    await tick(30);
    fireEvent.click(within(d).getByRole("tab", { name: "تعديل الامتحان" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "حسّن الصياغة" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await waitFor(() => !!d.querySelector(".ai-composer-diff"), "diff");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    const box = await within(d).findByTestId("ai-composer-applied-warnings", {}, { timeout: 3000 });
    const groups = within(box).getAllByTestId("ai-composer-warn-question");
    expect(groups.map(g => g.getAttribute("data-question-id"))).toEqual(["q1"]);
    expect(groups[0].textContent).toContain("السؤال 1");
    expect(groups[0].textContent).toContain("يحتوي الإجابة «الموجّه»");
    expect(hist().present!.sections[0].questions[0].text).toBe(leakQ1);
    fireEvent.click(within(groups[0]).getByRole("button", { name: "تحرير هذا السؤال" }));
    await tick(30);
    expect(screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" })).toBeNull();
    expect(document.activeElement).toBe(card("q1"));
  });
});

describe("21U-NONE nothing is offered when there is nothing to open", () => {
  it("no host reveal (onRevealQuestion absent) → no list after the apply, only «تم التطبيق»", async () => {
    const exam = baseExam();
    const onApply = vi.fn((fn: (prev: StructuredExam) => StructuredExam) => { fn(exam); return "ok" as const; });
    render(<AiExamComposerDialog open onClose={() => {}} transport={transportOf({ ai_exam_patch: [F.patch([F.op("updateQuestionText", { questionId: "q1", text: "يربط الموجّه الشبكات المختلفة، فأي جهاز يربطها؟", reason: "صياغة" })])] })}
      exam={exam} getLatestExam={() => exam} onApply={onApply} onPreview={() => {}} />);
    const d = screen.getByRole("dialog");
    fireEvent.click(within(d).getByRole("tab", { name: "تعديل الامتحان" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "حسّن الصياغة" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await waitFor(() => !!d.querySelector(".ai-composer-diff"), "diff");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await within(d).findByRole("heading", { name: "تم التطبيق" }, { timeout: 3000 });
    expect(within(d).queryByTestId("ai-composer-applied-warnings")).toBeNull();
  });

  it("a modification that introduces no warning → «تم التطبيق» without the list", async () => {
    const { d } = await mount(transportOf({ ai_exam_patch: [F.patch([F.op("updateQuestionText", { questionId: "q1", text: "أي جهاز يربط الشبكات المختلفة ببعضها؟", reason: "صياغة" })])] }));
    fireEvent.click(within(d).getByRole("tab", { name: "تعديل الامتحان" }));
    fireEvent.change(within(d).getByRole("textbox", { name: "التعديل المطلوب" }), { target: { value: "حسّن الصياغة" } });
    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await waitFor(() => !!d.querySelector(".ai-composer-diff"), "diff");
    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await within(d).findByRole("heading", { name: "تم التطبيق" }, { timeout: 3000 });
    expect(within(d).queryByTestId("ai-composer-applied-warnings")).toBeNull();
  });
});
