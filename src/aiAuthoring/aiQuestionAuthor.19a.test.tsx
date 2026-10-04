// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import type { StructuredExam } from "../examTypes";
import { newQuestion } from "../examBuilderState";
import type { AiAuthorService } from "./aiAuthorService";

// Phase 19A — «سؤال بالذكاء الاصطناعي» inside the Structured Exam Builder. The App-owned service (token never reaches the builder)
// returns the server's canonical draft; the dialog RE-VALIDATES it with the same shared authority before offering it, shows a
// factual summary, and inserts it as ONE builder update only when the teacher confirms. A refusal shows the canonical issues and
// inserts nothing. Without a service the action is not offered. New-function suite (fail-first on 91b1f3d8: no such dialog).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tick = (ms = 10) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const baseExam = (): StructuredExam => ({ examId: "EXAM-19A", title: "امتحان", status: "draft", schemaVersion: 2, sections: [{ id: "sec-1", title: "القسم الأول", gradingPolicy: "all", stimuli: {}, questions: [newQuestion("multipleChoice", { examQuestionId: "q1", text: "س", options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } })] }, { id: "sec-2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [] }] });
const NET_Q = { examQuestionId: "ai-draft", presentationType: "networkCli", questionTypeVersion: 1, text: "أنشئ VLAN 20 واجعل Fa0/5 فيها.", marks: 4, networkCli: { device: "switch", initialState: { v: 1, device: "switch", hostname: "Switch", vlans: {}, interfaces: {} } }, answer: { targetState: { vlans: { "20": {} }, interfaces: { "f0/5": { mode: "access", accessVlan: 20 } } }, scoring: "proportional" } };
const CLOZE_Q = { examQuestionId: "ai-draft", presentationType: "inlineCloze", questionTypeVersion: 1, text: "أكمل.", marks: 2, inlineCloze: { v: 1, segments: [{ type: "text", text: "بروتوكول " }, { type: "blank", id: "b1", control: "text" }] }, answer: { scoring: "proportional", blanks: { b1: { accepted: ["DHCP"], caseSensitive: false } } } };

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
async function mount(service?: AiAuthorService) { let hist!: Hist; render(<Host service={service} onHistory={h => { hist = h; }} />); await tick(30); return { hist: () => hist }; }
const ACTION = "✨ سؤال بالذكاء الاصطناعي";
async function openAndGenerate(request: string, section = "sec-1") {
  fireEvent.click(screen.getByRole("button", { name: ACTION }));
  const d = await screen.findByRole("dialog", { name: "إنشاء سؤال بالذكاء الاصطناعي" }, { timeout: 3000 });
  fireEvent.change(within(d).getByRole("textbox", { name: "اكتب طلبك" }), { target: { value: request } });
  fireEvent.change(within(d).getByRole("combobox", { name: "القسم الهدف" }), { target: { value: section } });
  fireEvent.click(within(d).getByRole("button", { name: "إنشاء المسودة" }));
  await tick(30);
  return d;
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("19A AI question authoring dialog", () => {
  it("is not offered without the App-owned service", async () => {
    await mount();
    expect(screen.queryByRole("button", { name: ACTION })).toBeNull();
  });
  it("a networkCli draft is re-validated, summarised, and inserted into the chosen section as ONE update with a fresh id (undo removes it)", async () => {
    const author = vi.fn(async () => ({ ok: true as const, intent: "networkCli", question: NET_Q, notes: [] }));
    const { hist } = await mount({ author });
    const d = await openAndGenerate("أنشئ سؤال محاكي سويتش", "sec-2");
    expect(author).toHaveBeenCalledWith({ request: "أنشئ سؤال محاكي سويتش" });
    const summary = within(d).getByTestId("ai-author-summary");
    expect(summary.textContent).toContain("محاكي أوامر الشبكة"); expect(summary.textContent).toMatch(/3 عناصر/);
    expect(hist().present!.sections[1].questions.length).toBe(0);                      // nothing inserted before confirmation
    fireEvent.click(within(d).getByRole("button", { name: "إدراج في الامتحان" })); await tick(30);
    const inserted = hist().present!.sections[1].questions[0] as unknown as Record<string, unknown>;
    expect(inserted.presentationType).toBe("networkCli"); expect(inserted.examQuestionId).not.toBe("ai-draft");
    expect(inserted.networkCli).toEqual(NET_Q.networkCli); expect(inserted.answer).toEqual(NET_Q.answer);
    expect(screen.queryByRole("dialog", { name: "إنشاء سؤال بالذكاء الاصطناعي" })).toBeNull();
    act(() => hist().undo()); await tick(30);
    expect(hist().present!.sections[1].questions.length).toBe(0);
  });
  it("an inlineCloze draft shows the passage with its blanks; the preferred type is sent when chosen", async () => {
    const author = vi.fn(async () => ({ ok: true as const, intent: "inlineCloze", question: CLOZE_Q, notes: [] }));
    await mount({ author });
    fireEvent.click(screen.getByRole("button", { name: ACTION }));
    const d = await screen.findByRole("dialog", { name: "إنشاء سؤال بالذكاء الاصطناعي" }, { timeout: 3000 });
    fireEvent.change(within(d).getByRole("textbox", { name: "اكتب طلبك" }), { target: { value: "اكتب فقرة فيها فراغ" } });
    fireEvent.change(within(d).getByRole("combobox", { name: "نوع السؤال المفضّل" }), { target: { value: "inlineCloze" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء المسودة" })); await tick(30);
    expect(author).toHaveBeenCalledWith({ request: "اكتب فقرة فيها فراغ", preferredType: "inlineCloze" });
    expect(within(d).getByTestId("ai-author-summary").textContent).toMatch(/بروتوكول \[فراغ 1]/);
    expect(within(d).getByTestId("ai-author-summary").textContent).not.toMatch(/DHCP/);
  });
  it("a server refusal shows the code and the canonical issues and inserts nothing", async () => {
    const author = vi.fn(async () => ({ ok: false as const, code: "AI_DRAFT_INVALID", message: "المسودة لا تجتاز التحقق.", issues: [{ code: "NETCLI_TARGET_VLAN_INVALID", message: "رقم VLAN غير صالح." }] }));
    const { hist } = await mount({ author });
    const d = await openAndGenerate("switch");
    const alert = within(d).getByRole("alert");
    expect(alert.textContent).toContain("المسودة لا تجتاز التحقق."); expect(alert.textContent).toContain("رقم VLAN غير صالح.");
    expect(within(d).queryByRole("button", { name: "إدراج في الامتحان" })).toBeNull();
    expect(hist().present!.sections[0].questions.length).toBe(1);
  });
  it("a tampered 'ok' result that fails the SHARED canonical validators is refused client-side (defense in depth) and never inserted", async () => {
    for (const question of [
      { ...NET_Q, answer: { targetState: { vlans: { "4095": {} } }, scoring: "proportional" } },
      { ...NET_Q, teacherNote: "x", networkCli: { ...NET_Q.networkCli, targetState: {} } },
      { ...CLOZE_Q, answer: { scoring: "proportional", blanks: {} } },
      { ...NET_Q, presentationType: "simulation" }
    ]) {
      const author = vi.fn(async () => ({ ok: true as const, intent: "networkCli", question, notes: [] }));
      const { hist } = await mount({ author });
      const d = await openAndGenerate("switch");
      expect(within(d).getByRole("alert").textContent, JSON.stringify(question)).toMatch(/لا تجتاز التحقق|غير صالحة/);
      expect(within(d).queryByRole("button", { name: "إدراج في الامتحان" })).toBeNull();
      expect(hist().present!.sections[0].questions.length).toBe(1);
      cleanup();
    }
  });
  it("a provider / network failure is an explicit error, never a fabricated question; an empty request is not sent", async () => {
    const author = vi.fn(async () => { throw new Error("تعذّر الوصول إلى خدمة الذكاء الاصطناعي."); });
    await mount({ author });
    fireEvent.click(screen.getByRole("button", { name: ACTION }));
    const d = await screen.findByRole("dialog", { name: "إنشاء سؤال بالذكاء الاصطناعي" }, { timeout: 3000 });
    expect((within(d).getByRole("button", { name: "إنشاء المسودة" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(d).getByRole("textbox", { name: "اكتب طلبك" }), { target: { value: "switch" } });
    fireEvent.click(within(d).getByRole("button", { name: "إنشاء المسودة" })); await tick(30);
    expect(within(d).getByRole("alert").textContent).toContain("تعذّر الوصول إلى خدمة الذكاء الاصطناعي.");
  });
  it("the dialog is a lazy edge of the builder; App owns the service through one POST to /api/ai-question-author", () => {
    const builder = fs.readFileSync(path.join(repo, "src/StructuredExamBuilder.tsx"), "utf8");
    expect(builder).toMatch(/lazy\(\(\) => import\("\.\/aiAuthoring\/AiQuestionAuthorDialog"\)\)/);
    expect(builder).not.toMatch(/^import[^;]*AiQuestionAuthorDialog/m);
    const app = fs.readFileSync(path.join(repo, "src/App.tsx"), "utf8");
    expect(app).toMatch(/"\/api\/ai-question-author"/); expect(app).toMatch(/aiAuthor=\{/);
  });
});
