// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import { createRequire } from "node:module";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { toolbarItem } from "./toolbarTestActions";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { AiAuthorService } from "../aiAuthoring/aiAuthorService";
import type { ComposerTransport } from "../aiComposer/composerRun";
import { COMPOSER_LIMITS } from "../aiComposer/composerLimits";
import { editorQualityNotes, fixNotesInstruction, FIX_NOTES_LEAD, type QualityNote } from "./qualityNotes";
import * as F from "../aiComposer/testing/composerFakeAi";

// Phase 21Y — «أصلح بالمؤلف الذكي» in the builder's quality notes: the AI composer opens on «تعديل الامتحان» with a request PREPARED from
// the notes (only the named questions, same type and marks); nothing is sent before «اقتراح التعديل» and nothing reaches the exam before
// «تطبيق»; the 21T review shows the note it removes. Offered only when the composer is available; the prepared request is used once.
const { handler } = createRequire(import.meta.url)("../../api/src/functions/ai-exam-composer.js") as { handler: (r: unknown, d: unknown) => Promise<{ jsonBody: Record<string, unknown> }> };
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
async function waitFor(fn: () => boolean, label: string, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) { if (Date.now() > end) throw new Error("timed out waiting for " + label); await tick(20); }
}
const mcq = (id: string, text: string, options: string[], correct = 0) => newQuestion("multipleChoice", { examQuestionId: id, text, marks: 1, options: options.map(t => ({ text: t })), answer: { correctOptionIndex: correct } });
const LEAK = "يوزّع بروتوكول DHCP العناوين تلقائيًا، فأي بروتوكول يوزّعها؟";
const FIXED = "أي بروتوكول يوزّع العناوين على الأجهزة تلقائيًا؟";
const exam = (): StructuredExam => ({ examId: "E21Y", title: "امتحان يدوي", status: "draft", schemaVersion: 2, sections: [{ id: "s1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [
  mcq("q1", "ما الجهاز الذي يربط الشبكات المختلفة؟", ["المبدّل", "الموجّه", "المكرّر"], 1),
  mcq("q2", LEAK, ["DHCP", "DNS", "FTP"])
] }] } as unknown as StructuredExam);

describe("21Y-INSTR the prepared request", () => {
  it("names each note with its question number (or the exam), asks for the named questions only, and stays within the composer limit", () => {
    const notes = editorQualityNotes(exam());
    const text = fixNotesInstruction(notes);
    expect(text.startsWith(FIX_NOTES_LEAD)).toBe(true);
    expect(FIX_NOTES_LEAD).toContain("الأسئلة المذكورة فقط");
    expect(text).toContain("\n- السؤال 2: ");
    expect(text).toContain("«DHCP»");
    expect(fixNotesInstruction([{ key: "k", code: "X", message: "ملاحظة  عامة\nعلى الامتحان", questionId: null, number: null }])).toBe(FIX_NOTES_LEAD + "\n- الامتحان: ملاحظة عامة على الامتحان");
    const many: QualityNote[] = Array.from({ length: 80 }, (_, i) => ({ key: "k" + i, code: "X", message: "م".repeat(100), questionId: "q" + i, number: i + 1 }));
    expect(fixNotesInstruction(many).length).toBeLessThanOrEqual(COMPOSER_LIMITS.instructionChars);
  });
});

type Hist = ReturnType<typeof useStructuredExamHistory>;
function Host({ service, onHistory }: { service?: AiAuthorService; onHistory: (h: Hist) => void }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(exam(), "saved"); } }, [hist]);
  useEffect(() => { onHistory(hist); });
  const [saving] = useState(false);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo} canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} aiAuthor={service} />;
}
const notesBox = () => screen.queryByTestId("builder-quality-notes");
async function openNotes() {
  await waitFor(() => !!notesBox(), "the quality notes");
  fireEvent.click(within(notesBox()!).getByRole("button", { name: /ملاحظات الجودة/ }));
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("21Y-UI «أصلح بالمؤلف الذكي»", () => {
  it("opens the composer on «تعديل الامتحان» with the prepared request; nothing is sent before «اقتراح التعديل»; the fix is applied only on «تطبيق»", async () => {
    const bodies: Record<string, unknown>[] = [];
    const ai = F.scriptedAi({ ai_exam_patch: [F.patch([F.op("updateQuestionText", { questionId: "q2", text: FIXED, reason: "إخفاء الإجابة" })])] });
    const transport: ComposerTransport = async body => { bodies.push(body as Record<string, unknown>); return (await handler({ json: async () => body }, { requireBuilderAuth: () => ({ ok: true, user: { sub: "t21y" } }), callTextJson: ai.fn, reserveComposerCall: async () => ({ allowed: true, retryAfterSeconds: 0 }), container: null })).jsonBody; };
    let hist!: Hist;
    render(<Host service={{ author: vi.fn(async () => ({ ok: false as const, code: "UNUSED" })), composeExam: transport }} onHistory={h => { hist = h; }} />);
    await openNotes();
    fireEvent.click(within(notesBox()!).getByRole("button", { name: "أصلح بالمؤلف الذكي" }));
    const d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    expect(within(d).getByRole("tab", { name: "تعديل الامتحان" }).getAttribute("aria-selected")).toBe("true");
    const box = within(d).getByRole("textbox", { name: "التعديل المطلوب" }) as HTMLTextAreaElement;
    expect(box.value).toBe(fixNotesInstruction(editorQualityNotes(hist.present!)));
    expect(within(d).getByTestId("ai-composer-fix-notes")).toBeTruthy();
    expect(bodies).toEqual([]);                                                          // nothing sent yet

    fireEvent.click(within(d).getByRole("button", { name: "اقتراح التعديل" }));
    await waitFor(() => !!d.querySelector(".ai-composer-diff"), "diff");
    expect([bodies[0].mode, bodies[0].scope, bodies[0].instruction]).toEqual(["modifyExam", { kind: "exam" }, box.value]);
    expect(within(d).getByTestId("ai-composer-patch-warnings").textContent).toContain("ويزيل 1");
    expect(hist.present!.sections[0].questions[1].text).toBe(LEAK);                     // nothing applied yet

    fireEvent.click(within(d).getByRole("button", { name: "تطبيق الكل" }));
    await within(d).findByRole("heading", { name: "تم التطبيق" }, { timeout: 3000 });
    expect(hist.present!.sections[0].questions[1].text).toBe(FIXED);
    fireEvent.click(within(d).getAllByRole("button", { name: "إغلاق" }).at(-1)!);        // the applied view's own «إغلاق»
    await waitFor(() => !notesBox(), "the notes gone after the fix");
  });

  it("the prepared request is used once: reopening the composer from the toolbar starts empty on «امتحان جديد»", async () => {
    const transport: ComposerTransport = async () => ({ ok: false });
    render(<Host service={{ author: vi.fn(async () => ({ ok: false as const, code: "UNUSED" })), composeExam: transport }} onHistory={() => {}} />);
    await openNotes();
    fireEvent.click(within(notesBox()!).getByRole("button", { name: "أصلح بالمؤلف الذكي" }));
    let d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    fireEvent.click(within(d).getByRole("button", { name: "إغلاق" }));
    await waitFor(() => !screen.queryByRole("dialog", { name: "المؤلف الذكي للامتحان" }), "closed");
    fireEvent.click(toolbarItem("المؤلف الذكي للامتحان"));
    d = await screen.findByRole("dialog", { name: "المؤلف الذكي للامتحان" }, { timeout: 3000 });
    expect(within(d).getByRole("tab", { name: "امتحان جديد" }).getAttribute("aria-selected")).toBe("true");
    expect(within(d).queryByTestId("ai-composer-fix-notes")).toBeNull();
  });

  it("not offered when the AI composer is not available", async () => {
    render(<Host onHistory={() => {}} />);
    await openNotes();
    expect(within(notesBox()!).queryByRole("button", { name: "أصلح بالمؤلف الذكي" })).toBeNull();
  });
});
