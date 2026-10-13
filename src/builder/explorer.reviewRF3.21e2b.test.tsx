// @vitest-environment happy-dom
//
// Phase 21E.2 part 2 — Review Fix 3, owner-listed observations about the question explorer «مستكشف الأسئلة»:
//   O-1  (200 %) the explorer is a dialog at ≤ 900 px. When the window narrows (zoom) while focus is inside the INLINE explorer, the
//        explorer turns into the dialog and the focused control leaves the page with the inline panel: the dialog's opener is
//        <body>, and Escape (or «إغلاق») left focus on <body> (measured in Chromium). Focus now goes to «المزيد», the menu that
//        holds the explorer's toggle; the ordinary path (opened from «المزيد» at 200 %) is pinned unchanged.
//   O-2  the explorer showed a matching question's raw table markdown («| العمود أ | العمود ب | | --- | --- | …»): the matching
//        editor keeps its pairs as a markdown table in the question text (buildMatchingPatch). The preview now reads the table by
//        its cells; the question itself is never touched.
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, act, screen, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import ExamQuestionNavigator from "../ExamQuestionNavigator";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { buildMatchingPatch } from "../examBuilderState";
import { indexExamQuestions, filterNavigatorEntries, navigatorPreviewText, EMPTY_NAVIGATOR_FILTERS } from "../structuredExamProductivity";
import { toolbarItem } from "./toolbarTestActions";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

const sq = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks: 2, answer: { text: "-" } } as unknown as BuilderQuestion);
const PAIRS = [{ left: "HTTP", right: "80" }, { left: "DNS", right: "53" }, { left: "HTTPS", right: "443" }];
const matchingQ = (id: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "matching", marks: 3, ...buildMatchingPatch(PAIRS) } as unknown as BuilderQuestion);
const makeExam = (): StructuredExam => ({ examId: "exN", title: "امتحان المستكشف", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [sq("q1", "ما هو الراوتر"), matchingQ("m1"), sq("q2", "ما هو المبدّل")] }] } as unknown as StructuredExam);

function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onExit={() => {}} />
    </div>
  );
}

// A window whose width can change: (max-width: 900px) matches once `narrow` is set (zoom), and the change is announced.
let narrow = false;
const listeners = new Set<() => void>();
const original = { matchMedia: window.matchMedia, scroll: HTMLElement.prototype.scrollIntoView };
beforeEach(() => {
  narrow = false; listeners.clear();
  window.matchMedia = ((q: string) => ({ get matches() { return narrow && q.includes("max-width: 900px"); }, media: q, onchange: null,
    addEventListener: (_: string, l: () => void) => { listeners.add(l); }, removeEventListener: (_: string, l: () => void) => { listeners.delete(l); },
    addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); window.matchMedia = original.matchMedia; HTMLElement.prototype.scrollIntoView = original.scroll; });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const zoomTo200 = async () => { narrow = true; await act(async () => { listeners.forEach(l => l()); }); await tick(); };
const more = () => screen.getByRole("button", { name: "المزيد من أدوات الامتحان" });
const explorerDialog = () => screen.queryByRole("dialog", { name: "مستكشف الأسئلة" });
const escape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape", bubbles: true });

describe("O-1 — closing the explorer's dialog never leaves focus on <body>", () => {
  it("zoomed to 200 % with focus in the INLINE explorer: Escape on the dialog it became returns focus to «المزيد» (not <body>)", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    await tick();
    const search = within(screen.getByRole("complementary", { name: "مستكشف الأسئلة" })).getByRole("searchbox", { name: "بحث في الامتحان" });
    search.focus();
    expect(document.activeElement).toBe(search);
    await zoomTo200();
    expect(screen.queryByRole("complementary", { name: "مستكشف الأسئلة" })).toBeNull();
    const dialog = explorerDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(document.activeElement)).toBe(true);
    escape();
    await tick();
    expect(explorerDialog()).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(more());
    // the next «المزيد» click opens the menu (and its explorer toggle is no longer pressed)
    fireEvent.click(more());
    expect(more().getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(more().getAttribute("aria-controls") || "")!;
    expect(within(panel).getByRole("button", { name: "مستكشف الأسئلة" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("zoomed with focus in the inline explorer: «إغلاق» on the dialog also returns focus to «المزيد»", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    await tick();
    within(screen.getByRole("complementary", { name: "مستكشف الأسئلة" })).getAllByRole("checkbox")[0].focus();
    await zoomTo200();
    fireEvent.click(within(explorerDialog()!).getByRole("button", { name: "إغلاق" }));
    await tick();
    expect(explorerDialog()).toBeNull();
    expect(document.activeElement).toBe(more());
  });

  it("zoomed with focus in the inline explorer: a jump from the dialog focuses the question's card, not «المزيد»", async () => {
    render(<Host />);
    await tick();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    await tick();
    within(screen.getByRole("complementary", { name: "مستكشف الأسئلة" })).getByRole("searchbox").focus();
    await zoomTo200();
    fireEvent.click(within(explorerDialog()!).getByRole("button", { name: /ما هو المبدّل/ }));
    await tick();
    expect(explorerDialog()).toBeNull();
    expect(document.activeElement).toBe(document.getElementById("sb-q-q2"));
  });

  it("pin: at 200 % from the start, «المزيد» → «مستكشف الأسئلة» → Escape returns focus to «المزيد» (its opener)", async () => {
    narrow = true;
    render(<Host />);
    await tick();
    fireEvent.click(toolbarItem("مستكشف الأسئلة"));
    await tick();
    expect(explorerDialog()).not.toBeNull();
    escape();
    await tick();
    expect(explorerDialog()).toBeNull();
    expect(document.activeElement).toBe(more());
  });
});

describe("O-2 — the explorer reads a matching question's table by its words", () => {
  it("navigatorPreviewText: a markdown table becomes its cells; the delimiter row and empty cells go; text without a table is unchanged", () => {
    const table = buildMatchingPatch(PAIRS).text as string;
    expect(table).toContain("| --- | --- |");                           // the graded table path keeps the table (unchanged)
    expect(navigatorPreviewText(table)).toBe("العمود أ، العمود ب · HTTP · DNS · HTTPS");
    expect(navigatorPreviewText("طابق ما يلي:\nكل بروتوكول بمنفذه\n| البروتوكول | المنفذ |\n| :--- | ---: |\n| HTTP | 80 |\n\nبعد الجدول"))
      .toBe("طابق ما يلي: كل بروتوكول بمنفذه · البروتوكول، المنفذ · HTTP، 80 · بعد الجدول");
    expect(navigatorPreviewText("| a \\| b | c |\n|---|---|\n| x | y |")).toBe("a | b، c · x، y");
    for (const plain of ["ما هو الراوتر", "اختر a | b من القائمة", "سطر\nسطر ثانٍ", "| بلا | فاصل |\n| صف | آخر |", "---"]) expect(navigatorPreviewText(plain)).toBe(plain);
  });

  it("the index entry of a matching question carries no table syntax, and search still finds it by its items", () => {
    const entries = indexExamQuestions(makeExam());
    const m = entries.find(e => e.examQuestionId === "m1")!;
    expect(m.text).toBe("العمود أ، العمود ب · HTTP · DNS · HTTPS");
    expect(m.text).not.toMatch(/\||---/);
    expect(filterNavigatorEntries(entries, { ...EMPTY_NAVIGATOR_FILTERS, q: "dns" }).map(e => e.examQuestionId)).toEqual(["m1"]);
    expect(entries.find(e => e.examQuestionId === "q1")!.text).toBe("ما هو الراوتر");   // other questions: unchanged
  });

  it("the explorer shows and names the matching question without pipes or dashes (text and the selection checkbox)", () => {
    const entries = indexExamQuestions(makeExam());
    render(<ExamQuestionNavigator entries={entries} sections={[{ id: "s1", title: "الشبكات" }]} filters={EMPTY_NAVIGATOR_FILTERS} onFilters={() => {}}
      selected={new Set()} onToggle={() => {}} onSelectMany={() => {}} onClearSelection={() => {}} onNavigate={() => {}} />);
    const texts = Array.from(document.querySelectorAll(".sb-nav-text")).map(n => n.textContent);
    expect(texts).toEqual(["ما هو الراوتر", "العمود أ، العمود ب · HTTP · DNS · HTTPS", "ما هو المبدّل"]);
    for (const box of screen.getAllByRole("checkbox")) expect(box.getAttribute("aria-label")).not.toMatch(/\||---/);
  });
});
