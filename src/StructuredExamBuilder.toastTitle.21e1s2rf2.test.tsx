// @vitest-environment happy-dom
// PR #300 SELF-REVIEW (not an independent approval) — adversarial tests for Review Fix 1 (V1): the section title SHOWN in a toast
// is cut to ≤ 40 characters + «…» while the live region announces the full title. Attack: Arabic diacritics (combining marks),
// emoji ZWJ sequences and flags (multi-code-point graphemes), whitespace-only titles. Expectation: the visible title is ≤ 40
// graphemes + «…», it is a prefix of the title made of WHOLE graphemes (a letter never loses its harakat, an emoji is never cut in
// half), it is never empty, and the announcement carries the full title. Focus never falls to <body>.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, screen, act, within } from "@testing-library/react";
import StructuredExamBuilder from "./StructuredExamBuilder";
import { useStructuredExamHistory } from "./useStructuredExamHistory";
import { examSaveState } from "./examHistory";
import type { StructuredExam } from "./examTypes";

const Q = (id: string) => ({ examQuestionId: id, presentationType: "shortAnswer", text: "نص " + id, marks: 1, answer: { text: "x" } });
const examWithTitle = (title: string): StructuredExam => ({
  examId: "ex1", title: "امتحان", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title, gradingPolicy: "all", stimuli: {}, questions: [Q("q1"), Q("q2"), Q("q3")] },
    { id: "s2", title: "القسم الثاني", gradingPolicy: "all", stimuli: {}, questions: [Q("r1")] },
  ],
} as unknown as StructuredExam);

function Host({ initial }: { initial: StructuredExam }) {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initial, "saved"); } }, [hist, initial]);
  if (!hist.present) return null;
  return <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo}
    canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} />;
}

beforeEach(() => { HTMLElement.prototype.scrollIntoView = function () {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const seg = new Intl.Segmenter("ar", { granularity: "grapheme" });
const graphemes = (s: string) => Array.from(seg.segment(s), x => x.segment);
const toastMessage = () => document.querySelector(".eb-toast .eb-toast-message")!.textContent!;
const live = () => (document.querySelector(".eb-toast-layer [role='status']") as HTMLElement).textContent;
const shownTitle = () => /«([\s\S]*)»/.exec(toastMessage())![1];
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector(`[data-section-id="${id}"]`) as HTMLElement;
const focusOk = () => { const a = document.activeElement; return !!a && a !== document.body && a.isConnected && !!a.closest(".sb-builder"); };

/** What is wrong with `shown` as the toast's version of `full` ("" when nothing). */
function titleProblem(full: string, shown: string): string {
  const title = full.trim();
  if (!shown.trim()) return "the visible title is empty";
  if (shown === title) return graphemes(title).length <= 40 ? "" : "a title over 40 graphemes is shown in full";
  if (!shown.endsWith("…")) return "a shortened title has no «…»";
  const body = shown.slice(0, -1);
  const g = graphemes(body), t = graphemes(title);
  if (g.length > 40) return "more than 40 graphemes are shown: " + g.length;
  for (let i = 0; i < g.length; i++) if (g[i] !== t[i]) return "grapheme " + (i + 1) + " is cut: shown " + JSON.stringify(g[i]) + " instead of " + JSON.stringify(t[i]);
  return "";
}

const deleteQ2 = () => fireEvent.click(within(card("q2")).getByRole("button", { name: "حذف" }));

const CASES: { name: string; title: string }[] = [
  { name: "fully vocalised Arabic with spaces and an emoji", title: "القِسْمُ الأَوَّلُ: الأَسْئِلَةُ المَوْضُوعِيَّةُ ذَاتُ الاخْتِيَارِ مِنْ مُتَعَدِّدٍ 📘 وَالصَّوَابِ وَالخَطَأِ فِي الشَّبَكَاتِ" },
  { name: "vocalised Arabic with NO space after the 7th character (the 40-code-point cut lands between a letter and its fatha)", title: "القسم: " + "بَ".repeat(30) },
  { name: "shadda + kasra stacks with no space", title: "مراجعة: " + "دِّ".repeat(25) },
  { name: "emoji ZWJ sequences with no space", title: "القسم " + "👨‍👩‍👧‍👦".repeat(8) },
  { name: "flag emoji (regional-indicator pairs) with no space", title: "الدول: " + "🇸🇦🇯🇴🇪🇬".repeat(8) },
];

describe("SELF-REVIEW — V1 toast title shortening with diacritics and emoji", () => {
  for (const c of CASES) {
    it(`question deletion · ${c.name}: ≤ 40 whole graphemes + «…» shown; the full title announced`, async () => {
      render(<Host initial={examWithTitle(c.title)} />);
      await wait(5);
      deleteQ2();
      expect(focusOk()).toBe(true);
      const shown = shownTitle();
      expect(graphemes(shown.replace(/…$/, "")).length).toBeLessThanOrEqual(40);
      await wait(80);
      expect(live()).toBe("تم حذف السؤال 2 من «" + c.title + "». للتراجع اضغط Ctrl+Z (أو ⌘Z) أو استخدم زر «تراجع».");
      expect(titleProblem(c.title, shown)).toBe("");
    });
  }

  it("section deletion and its restore toast · emoji ZWJ title: whole graphemes, full announcement", async () => {
    const title = "القسم " + "👩🏽‍💻".repeat(12);
    render(<Host initial={examWithTitle(title)} />);
    await wait(5);
    fireEvent.click(within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" }));
    expect(focusOk()).toBe(true);
    const shownDelete = shownTitle();
    fireEvent.click(screen.getByRole("button", { name: "تراجع عن حذف القسم" }));
    await wait(80);
    expect(live()).toBe("تمت استعادة «" + title + "».");
    expect(focusOk()).toBe(true);
    expect(titleProblem(title, shownDelete)).toBe("");
    expect(titleProblem(title, shownTitle())).toBe("");
  });

  it("a whitespace-only section title never produces an empty «» in the toast (falls back like an empty title)", async () => {
    render(<Host initial={examWithTitle("   ")} />);
    await wait(5);
    fireEvent.click(within(sectionEl("s1")).getByRole("button", { name: "حذف القسم" }));
    expect(focusOk()).toBe(true);
    expect(toastMessage()).not.toContain("«»");
    expect(toastMessage()).toBe("تم حذف «القسم 1» مع 3 أسئلة.");
  });

  it("a whitespace-only section title in a QUESTION deletion toast never shows «من «»»", async () => {
    render(<Host initial={examWithTitle("   ")} />);
    await wait(5);
    deleteQ2();
    expect(toastMessage()).not.toContain("«»");
  });
});
