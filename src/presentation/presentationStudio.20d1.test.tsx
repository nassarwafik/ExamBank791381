// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, cleanup, act, fireEvent, screen, within } from "@testing-library/react";
import PresentationStudio from "./PresentationStudio";
import QuestionComposer from "../QuestionComposer";
import { newQuestion } from "../examBuilderState";
import type { BuilderQuestion } from "../examTypes";
import { validatePresentation, validateQuestionPresentation, validateSectionPresentation } from "./presentationModel";

// Phase 20D.1 — Presentation Studio behaviour beyond the authoring contract: every control writes ONLY vocabulary values through the
// updater, every written exam presentation / section override passes the strict validators, invalid colours are refused, malformed
// stored values are reported (never silently rewritten), and the per-question override control in the composer stays bounded.
afterEach(cleanup);
const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };
type Obj = Record<string, unknown>;
const EXAM = (extra: Obj = {}): Obj => ({ examId: "e1", title: "امتحان", sections: [
  { id: "s1", title: "الشبكات", gradingPolicy: "all", questions: [
    { examQuestionId: "q1", presentationType: "multipleChoice", text: "سؤال أول", marks: 2, options: [{ text: "أ" }, { text: "ب" }] },
    { examQuestionId: "q2", presentationType: "shortAnswer", text: "سؤال ثانٍ", marks: 1 }
  ] }
], ...extra });

type Box = { exam: Obj; writes: Obj[] };
function StudioHost({ initial, box, onClose = () => {} }: { initial: Obj; box: Box; onClose?: () => void }) {
  const [exam, setExam] = useState<Obj>(initial);
  return <PresentationStudio exam={exam} onClose={onClose} onChange={up => setExam(prev => { const next = up(prev) as Obj; box.exam = next; box.writes.push(next); return next; })} />;
}
const mount = async (initial: Obj, onClose?: () => void) => {
  const box: Box = { exam: initial, writes: [] };
  render(<StudioHost initial={initial} box={box} onClose={onClose} />);
  await settle();
  return box;
};
const openTab = async (name: string) => { fireEvent.click(screen.getByRole("tab", { name })); await settle(); };
const pick = async (label: string, value: string, root: HTMLElement = document.body) => { fireEvent.change(within(root).getByLabelText(label), { target: { value } }); await settle(); };
const confirmTop = async () => { const d = screen.getAllByRole("dialog").at(-1)!; fireEvent.click(within(d).getByRole("button", { name: /إعادة الضبط|تطبيق القالب|تأكيد/ })); await settle(); };
const cancelTop = async () => { const d = screen.getAllByRole("dialog").at(-1)!; fireEvent.click(within(d).getByRole("button", { name: "إلغاء" })); await settle(); };
const pres = (box: Box) => box.exam.presentation as Obj | undefined;
const allWritesValid = (box: Box) => {
  for (const w of box.writes) {
    if (w.presentation !== undefined) expect(validatePresentation(w.presentation).issues).toEqual([]);
    for (const s of (w.sections as Obj[]) || []) if (s.presentation !== undefined) expect(validateSectionPresentation(s.presentation).issues).toEqual([]);
  }
};

describe("20D1-S1 Presentation Studio — colours", () => {
  it("writes normalized #RRGGBB colours, refuses invalid hex with an inline error, and the per-token reset removes the override", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "default" } }));
    await openTab("الألوان");
    const text = screen.getByLabelText("النص") as HTMLInputElement;
    fireEvent.change(text, { target: { value: "#0b0b0b" } });
    fireEvent.blur(text);
    await settle();
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default", tokens: { colors: { text: "#0B0B0B" } } });
    const primary = screen.getByLabelText("اللون الأساسي") as HTMLInputElement;
    fireEvent.change(primary, { target: { value: "#123" } });
    fireEvent.keyDown(primary, { key: "Enter" });
    await settle();
    expect((pres(box)!.tokens as Obj).colors).toEqual({ text: "#0B0B0B", primary: "#112233" });
    const writes = box.writes.length;
    const accent = screen.getByLabelText("لون التمييز") as HTMLInputElement;
    for (const bad of ["red", "#12345", "rgb(0,0,0)", "url(x)"]) {
      fireEvent.change(accent, { target: { value: bad } });
      fireEvent.blur(accent);
      await settle();
      expect(accent.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText(/صيغة اللون غير صحيحة/)).toBeTruthy();
    }
    expect(box.writes.length).toBe(writes);
    fireEvent.change(screen.getByLabelText("اختيار لون التمييز"), { target: { value: "#0a5c36" } });
    await settle();
    expect(((pres(box)!.tokens as Obj).colors as Obj).accent).toBe("#0A5C36");
    for (const label of ["النص", "اللون الأساسي", "لون التمييز"]) fireEvent.click(screen.getByRole("button", { name: "استخدام لون القالب لـ" + label }));
    await settle();
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default" });
    allWritesValid(box);
  });

  it("a low-contrast colour is written (so it can be fixed) but warned with every failing pair, and the report lists every policy row", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "default" } }));
    expect(document.querySelector("[data-testid=xp-contrast-warning]")).toBeNull();
    await openTab("الألوان");
    const text = screen.getByLabelText("النص");
    fireEvent.change(text, { target: { value: "#DDDDDD" } });
    fireEvent.blur(text);
    await settle();
    const warning = document.querySelector("[data-testid=xp-contrast-warning]")!;
    expect(warning.getAttribute("role")).toBe("alert");
    expect(warning.textContent).toContain("لا يمكن اعتماد الامتحان نهائيًا");
    expect(warning.querySelectorAll("li").length).toBe(3);
    expect(validatePresentation(pres(box)).issues.map(i => i.code)).toEqual(["PRESENTATION_CONTRAST", "PRESENTATION_CONTRAST", "PRESENTATION_CONTRAST"]);
    await openTab("إمكانية الوصول");
    const rows = document.querySelectorAll(".xp-studio-contrast tbody tr");
    expect(rows.length).toBe(6);
    expect(document.querySelectorAll(".xp-studio-contrast tr.is-fail").length).toBe(3);
  });
});

describe("20D1-S2 Presentation Studio — components, question types, sections", () => {
  it("a component variant is written as { variant } and the preset default removes it (empty objects pruned)", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "cards" } }));
    await openTab("المكوّنات");
    await pick("بطاقة السؤال", "paper");
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "cards", components: { questionCard: { variant: "paper" } } });
    expect(document.querySelector("[data-testid=xp-studio-preview] article.iex-q")!.getAttribute("data-xp-card")).toBe("paper");
    await pick("بطاقة السؤال", "");
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "cards" });
    allWritesValid(box);
  });

  it("a question-type variant is written and removed; typography / layout / print / accessibility write vocabulary words only", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "default" } }));
    await openTab("أنواع الأسئلة");
    await pick("برمجة / كتابة كود", "laboratory");
    await pick("اختيار من متعدد", "writingPaper");
    expect(pres(box)!.questionTypeVariants).toEqual({ coding: "laboratory", multipleChoice: "writingPaper" });
    expect(document.querySelector("[data-testid=xp-studio-preview] article.iex-q")!.getAttribute("data-xp-variant")).toBe("writingPaper");
    await pick("برمجة / كتابة كود", "");
    await pick("اختيار من متعدد", "");
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default" });
    await openTab("الخطوط");
    await pick("عائلة الخط", "academicSerif");
    await openTab("التخطيط");
    await pick("عرض الصفحة", "narrow");
    await pick("الظلال", "strong");
    // review fix 1: the lifecycle top bar is never JSON-controlled — the Studio offers no "sticky top bar" switch
    expect(screen.queryByLabelText(/تثبيت الشريط العلوي/)).toBeNull();
    await openTab("الطباعة");
    await pick("نمط الطباعة", "compact");
    await openTab("إمكانية الوصول");
    await pick("الحركة والانتقالات", "none");
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default", tokens: { typography: { family: "academicSerif" }, shadow: "strong" }, layout: { pageWidth: "narrow" }, print: { mode: "compact" }, motion: { level: "none" } });
    const root = document.querySelector("[data-testid=xp-studio-preview] .exam-presentation")!;
    expect(root.getAttribute("data-xp-width")).toBe("narrow");
    expect(root.getAttribute("data-xp-print")).toBe("compact");
    // A per-tab reset is confirmed; cancelling keeps the values.
    await openTab("التخطيط");
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط التخطيط" }));
    await settle();
    await cancelTop();
    expect(pres(box)!.layout).toEqual({ pageWidth: "narrow" });
    fireEvent.click(screen.getByRole("button", { name: "إعادة ضبط التخطيط" }));
    await settle();
    await confirmTop();
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default", tokens: { typography: { family: "academicSerif" } }, print: { mode: "compact" }, motion: { level: "none" } });
    allWritesValid(box);
  });

  it("a section override is bounded, written through the updater, reflected in the preview, and removed only after confirmation", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "default" } }));
    await openTab("الأقسام");
    const group = screen.getByRole("group", { name: "القسم 1: الشبكات" });
    await pick("ترويسة القسم", "band", group);
    await pick("المسافة بين الأسئلة", "spacious", group);
    const s0 = () => (box.exam.sections as Obj[])[0];
    expect(s0().presentation).toEqual({ schemaVersion: 1, components: { sectionHeader: { variant: "band" } }, layout: { questionSpacing: "spacious" } });
    expect(validateSectionPresentation(s0().presentation).ok).toBe(true);
    expect(document.querySelector("[data-testid=xp-studio-preview] .xp-section-header")!.getAttribute("data-xp-variant")).toBe("band");
    expect(within(group).queryByLabelText("عائلة الخط")).toBeNull();
    await pick("المسافة بين الأسئلة", "", group);
    expect(s0().presentation).toEqual({ schemaVersion: 1, components: { sectionHeader: { variant: "band" } } });
    fireEvent.click(within(group).getByRole("button", { name: "إزالة تخصيص القسم 1: الشبكات" }));
    await settle();
    await confirmTop();
    expect("presentation" in s0()).toBe(false);
    expect((s0().questions as unknown[]).length).toBe(2);
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "default" });
    allWritesValid(box);
  });
});

describe("20D1-S3 Presentation Studio — dialog, tabs, viewport, malformed values", () => {
  it("is a labelled modal: focus starts inside, arrow keys move between tabs, Escape closes", async () => {
    const onClose = vi.fn();
    await mount(EXAM(), onClose);
    const dialog = screen.getByRole("dialog", { name: "استوديو العرض" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.classList.contains("xp-studio")).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    const presets = screen.getByRole("tab", { name: "القوالب" });
    expect(presets.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(presets.id);
    presets.focus();
    fireEvent.keyDown(presets, { key: "ArrowLeft" });
    await settle();
    const colors = screen.getByRole("tab", { name: "الألوان" });
    expect(colors.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(colors);
    fireEvent.keyDown(colors, { key: "End" });
    await settle();
    expect(screen.getByRole("tab", { name: "إمكانية الوصول" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("viewport buttons constrain the preview frame; an exam without questions previews a built-in sample with a rich table", async () => {
    await mount({ examId: "e2", title: "فارغ", sections: [] });
    const frame = document.querySelector("[data-testid=xp-studio-preview]")!;
    expect(frame.querySelectorAll("article.iex-q").length).toBe(2);
    expect(frame.querySelector(".exam-presentation[data-xp-preset=default]")).toBeTruthy();
    await settle();
    expect(frame.querySelector("article.iex-q table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "سطح المكتب" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "هاتف" }));
    await settle();
    expect(frame.getAttribute("data-xp-viewport")).toBe("phone");
    expect(screen.getByRole("button", { name: "هاتف" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "سطح المكتب" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "جهاز لوحي" }));
    await settle();
    expect(frame.getAttribute("data-xp-viewport")).toBe("tablet");
  });

  it("a malformed stored presentation is reported, never rewritten silently, and only a confirmed reset to a preset repairs it", async () => {
    const bad = { schemaVersion: 1, preset: "networkLab", tokens: { colors: { text: "red" } }, css: "body{}" };
    const box = await mount(EXAM({ presentation: bad }));
    const notice = document.querySelector("[data-testid=xp-malformed-notice]")!;
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    expect(box.writes).toEqual([]);
    await openTab("الألوان");
    expect((document.querySelector(".xp-studio-fieldset") as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(within(notice as HTMLElement).getByRole("button", { name: /إعادة الضبط إلى قالب/ }));
    await settle();
    await cancelTop();
    expect(box.writes).toEqual([]);
    fireEvent.click(within(document.querySelector("[data-testid=xp-malformed-notice]") as HTMLElement).getByRole("button", { name: /إعادة الضبط إلى قالب/ }));
    await settle();
    await confirmTop();
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "networkLab" });
    expect(document.querySelector("[data-testid=xp-malformed-notice]")).toBeNull();
    allWritesValid(box);
  });

  it("choosing a preset over customizations asks first; the same preset without customizations writes nothing", async () => {
    const box = await mount(EXAM({ presentation: { schemaVersion: 1, preset: "default", components: { table: { variant: "plain" } } } }));
    fireEvent.click(screen.getByRole("button", { name: /بطاقات/ }));
    await settle();
    await cancelTop();
    expect(pres(box)!.components).toEqual({ table: { variant: "plain" } });
    fireEvent.click(screen.getByRole("button", { name: /بطاقات/ }));
    await settle();
    await confirmTop();
    expect(pres(box)).toEqual({ schemaVersion: 1, preset: "cards" });
    const n = box.writes.length;
    fireEvent.click(screen.getByRole("button", { name: /بطاقات/ }));
    await settle();
    expect(box.writes.length).toBe(n);
    expect(screen.getByRole("button", { name: /بطاقات/ }).getAttribute("aria-pressed")).toBe("true");
    allWritesValid(box);
  });
});

describe("20D1-S4 QuestionComposer — per-question presentation override", () => {
  function ComposerHost({ box }: { box: { q: BuilderQuestion; patches: Obj[] } }) {
    const [q, setQ] = useState<BuilderQuestion>(box.q);
    return <QuestionComposer question={q} onChange={patch => { box.patches.push(patch as Obj); setQ(prev => { const next = { ...prev, ...patch }; box.q = next; return next; }); }} />;
  }
  it("is collapsed by default, writes bounded vocabulary keys, removes keys on «الافتراضي» and the whole object when empty", async () => {
    const box = { q: newQuestion("multipleChoice") as BuilderQuestion, patches: [] as Obj[] };
    render(<ComposerHost box={box} />);
    await settle();
    expect(screen.queryByLabelText("اتساع السؤال")).toBeNull();
    const toggle = screen.getByRole("button", { name: "عرض السؤال" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    await settle();
    await pick("اتساع السؤال", "wide");
    await pick("مساحة العرض", "writingPaper");
    await pick("بطاقة السؤال", "paper");
    expect(box.q.presentation).toEqual({ schemaVersion: 1, width: "wide", variant: "writingPaper", card: "paper" });
    await pick("اتساع السؤال", "");
    await pick("بطاقة السؤال", "");
    expect(box.q.presentation).toEqual({ schemaVersion: 1, variant: "writingPaper" });
    await pick("مساحة العرض", "");
    expect(box.q.presentation).toBeUndefined();
    for (const p of box.patches) if (p.presentation !== undefined) expect(validateQuestionPresentation(p.presentation).ok).toBe(true);
    expect(box.patches.every(p => Object.keys(p).join() === "presentation")).toBe(true);
  });
  it("a malformed stored override is reported and can only be removed explicitly", async () => {
    const box = { q: { ...newQuestion("multipleChoice"), presentation: { schemaVersion: 1, width: "huge" } } as unknown as BuilderQuestion, patches: [] as Obj[] };
    render(<ComposerHost box={box} />);
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("غير صالح");
    fireEvent.click(screen.getByRole("button", { name: "عرض السؤال" }));
    await settle();
    expect(screen.queryByLabelText("اتساع السؤال")).toBeNull();
    expect(box.patches).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "إزالة تخصيص العرض" }));
    await settle();
    expect(box.q.presentation).toBeUndefined();
  });
});
