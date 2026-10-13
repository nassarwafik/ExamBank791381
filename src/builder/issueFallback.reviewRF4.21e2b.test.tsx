// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 4, audit A-05 (owner-directed behaviour change): a summary entry for an issue that NO Field frame
// shows and that names no part (trueFalse / multiTrueFalse / fillBlank answers, a matching answer that is not among its choices,
// a stale shared stimulus …) must never focus an invalid control whose frame shows a DIFFERENT issue (the marks, the question text,
// another pair). It focuses the card's named issue list «مشكلات السؤال N»; an invalid control whose frame carries no issue code at all
// (a rubric row) may still take focus. Through the REAL StructuredExamBuilder + REAL history hook inside a replica of App's overlay
// (the same wrapper as inlineIssues.reviewRF2.21e2b).
// Fail-first on 1fa3d21: «صح/خطأ بلا إجابة صحيحة» focused «العلامة» (MARKS_PROBLEM), «البند 2 … بلا إجابة صحيحة محددة» focused
// «نص السؤال» (EMPTY_TEXT), «الإجابة الصحيحة للزوج 2 … غير موجودة ضمن الخيارات» focused «العنصر 1» (MATCH_INCOMPLETE_PAIR) and
// «الفراغ 1 … بلا إجابة صحيحة» focused «العلامة»; a rubric issue focused «العلامة» instead of the rubric row it names.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef } from "react";
import { render, cleanup, fireEvent, act, within, waitFor } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { evaluateExamFinalization } from "../examFinalization";
import { newQuestion } from "../examBuilderState";
import type { StructuredIssue } from "../examQuality";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

const choices = [{ text: "80" }, { text: "53" }, { text: "443" }];
const tf = (id: string, marks: number, text = "الشبكة المحلية أسرع من الشبكة الواسعة"): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "trueFalse", text, marks, answer: {} } as unknown as BuilderQuestion);
const mtf = (id: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multiTrueFalse", text: "", marks: 2, fields: [{ id: "f1", statement: "TCP موثوق", kind: "boolean", correct: true }, { id: "f2", statement: "UDP موثوق", kind: "boolean" }] } as unknown as BuilderQuestion);
const matching = (id: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "matching", text: "طابق كل بروتوكول بمنفذه", marks: 2, answer: { text: "DNS=99" },
    fields: [{ id: "m0", label: "", kind: "select", options: choices, correct: "80" }, { id: "m1", label: "DNS", kind: "select", options: choices, correct: "99" }] } as unknown as BuilderQuestion);
const fill = (id: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "fillBlank", text: "بروتوكول ____ موثوق", marks: 0, wordBank: [], fields: [{ id: "b1", label: "", kind: "select", correct: "" }], answer: { mode: "exactSequence", values: [""] } } as unknown as BuilderQuestion);
const open = (id: string): BuilderQuestion => ({
  ...newQuestion("openResponse" as never, { examQuestionId: id, text: "قارن بين TCP و UDP.", marks: 0 }),
  answer: { rubric: { v: 1, criteria: [{ id: "c1", title: "", description: "", maxPoints: 2, allowCustomPoints: false, guidance: "", levels: [{ id: "l1", label: "كامل", points: 2, description: "" }, { id: "l2", label: "غائب", points: 0, description: "" }] }] }, modelAnswer: "" }
} as unknown as BuilderQuestion);
const examWith = (...questions: BuilderQuestion[]): StructuredExam => ({ examId: "exRF4A05", title: "امتحان المراجعة الرابعة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "الأسئلة", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);

const h = {} as { present: StructuredExam };
let initialExam: () => StructuredExam = () => examWith();
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initialExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { present: hist.present }); }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={false} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, false)} backupStorage={null} onRecover={hist.recover}
        autosaveDelayMs={5} onExit={() => {}} />
    </div>
  );
}

// ── controlled layout (happy-dom has no layout): the sticky toolbar is 120 px tall at the top, so the clearance is 132 px ──
const TOOLBAR_H = 120, CLEARANCE = TOOLBAR_H + 12;
let scrollCalls: { el: HTMLElement; margin: string }[] = [];
const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = this.classList.contains("sb-toolbar") ? { top: 0, height: TOOLBAR_H } : { top: 0, height: 0 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) { scrollCalls.push({ el: this, margin: this.style.scrollMarginBlockStart }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.scrollIntoView = originalScroll; });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async (exam: () => StructuredExam) => { initialExam = exam; render(<Host />); await tick(); scrollCalls = []; };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const summary = () => document.querySelector<HTMLElement>(".sb-issues")!;
const issuesOf = (questionId: string) => { const d = evaluateExamFinalization(h.present); return [...d.structuralErrors, ...d.structuralWarnings].filter(i => i.questionId === questionId); };
const issueOf = (questionId: string, code: string, nth = 1) => { const i = issuesOf(questionId).filter(x => x.code === code)[nth - 1]; if (!i) throw new Error("no " + code + " #" + nth + " on " + questionId); return i; };
/** The summary entry for one canonical issue: its own message, and — when two questions share a message (a question with no label
 *  is named «») — the question it leads to («السؤال N في …»). */
const entryFor = (i: StructuredIssue, n?: number) => {
  const hits = within(summary()).getAllByRole("button").filter(b => b.classList.contains("sb-issue-link") && (b.textContent || "").includes(i.message) &&
    (n === undefined || (b.querySelector(".sb-issue-target")?.textContent || "").startsWith("السؤال " + n + " ")));
  expect(hits, i.code + " entry").toHaveLength(1);
  return hits[0];
};
const focused = () => { const a = document.activeElement as HTMLElement | null; const label = a?.id ? document.querySelector(`label[for="${a.id}"]`)?.textContent : null; return "focused: " + (label || a?.getAttribute("aria-label") || (a?.textContent || a?.tagName || "").trim().slice(0, 40)); };
const expectFocus = (el: Element) => expect(document.activeElement, focused()).toBe(el);
const activate = async (i: StructuredIssue, n?: number) => { fireEvent.click(entryFor(i, n)); await tick(); };
/** The card's named issue list, and the focus it took is the list itself (not a control inside the card). */
const expectNamedList = (id: string, n: number) => {
  const list = within(card(id)).getByRole("group", { name: "مشكلات السؤال " + n });
  expectFocus(list);
  expect(list.classList.contains("sb-inline-issues")).toBe(true);
  expect(scrollCalls.at(-1)!.el).toBe(card(id));                                   // the card aligned below the toolbar
  expect(scrollCalls.at(-1)!.margin).toBe(CLEARANCE + "px");
};
/** The invalid control that a fallback to "the first invalid field" would have taken — shown, framed with ANOTHER code. */
const expectInvalidWithOtherCode = (control: HTMLElement, code: string) => {
  expect(control.getAttribute("aria-invalid")).toBe("true");
  expect(control.closest("[data-issue-codes]")?.getAttribute("data-issue-codes")).toBe(code);
  expect(document.activeElement).not.toBe(control);
};

describe("RF4 A-05 — an issue no frame shows never focuses another issue's field", () => {
  it("trueFalse without an answer, marks 0: «صح/خطأ بلا إجابة صحيحة» → «مشكلات السؤال 1», never «العلامة» (MARKS_PROBLEM)", async () => {
    await mount(() => examWith(tf("tf1", 0)));
    expect(issuesOf("tf1").map(i => i.code)).toEqual(["MARKS_PROBLEM", "MISSING_ANSWER"]);
    await activate(issueOf("tf1", "MISSING_ANSWER"));
    expectNamedList("tf1", 1);
    expectInvalidWithOtherCode(within(card("tf1")).getByLabelText("العلامة"), "MARKS_PROBLEM");
    await activate(issueOf("tf1", "MARKS_PROBLEM"));                                 // the marks' own issue still focuses them
    expectFocus(within(card("tf1")).getByLabelText("العلامة"));
  });

  it("multiTrueFalse with an empty text and an item without its answer: «البند 2 …» → «مشكلات السؤال 1», never «نص السؤال» (EMPTY_TEXT)", async () => {
    await mount(() => examWith(mtf("mtf1")));
    expect(issuesOf("mtf1").map(i => i.code)).toEqual(["EMPTY_TEXT", "FIELD_NO_CORRECT"]);
    expect(issueOf("mtf1", "FIELD_NO_CORRECT").message).toMatch(/^البند 2 /);
    await activate(issueOf("mtf1", "FIELD_NO_CORRECT"));
    expectNamedList("mtf1", 1);
    expectInvalidWithOtherCode(within(card("mtf1")).getByLabelText("نص السؤال"), "EMPTY_TEXT");
    await activate(issueOf("mtf1", "EMPTY_TEXT"));
    expectFocus(within(card("mtf1")).getByLabelText("نص السؤال"));
  });

  it("matching whose pair 2 answer is not among its choices: «الإجابة الصحيحة للزوج 2 …» → «مشكلات السؤال 1», never pair 1's «العنصر 1» (MATCH_INCOMPLETE_PAIR)", async () => {
    await mount(() => examWith(matching("m2")));
    expect(issuesOf("m2").map(i => i.code)).toEqual(["MATCH_INCOMPLETE_PAIR", "CORRECT_NOT_IN_CHOICES"]);
    await activate(issueOf("m2", "CORRECT_NOT_IN_CHOICES"));
    expectNamedList("m2", 1);
    expectInvalidWithOtherCode(within(card("m2")).getByLabelText("العنصر 1"), "MATCH_INCOMPLETE_PAIR");
    await activate(issueOf("m2", "MATCH_INCOMPLETE_PAIR"));
    expectFocus(within(card("m2")).getByLabelText("العنصر 1"));
  });

  it("fillBlank with a blank without its answer, marks 0: «الفراغ 1 …» → «مشكلات السؤال 1», never «العلامة»", async () => {
    await mount(() => examWith(fill("fb1")));
    expect(issuesOf("fb1").map(i => i.code)).toEqual(["MARKS_PROBLEM", "FIELD_NO_CORRECT"]);
    await activate(issueOf("fb1", "FIELD_NO_CORRECT"));
    expectNamedList("fb1", 1);
    expectInvalidWithOtherCode(within(card("fb1")).getByLabelText("العلامة"), "MARKS_PROBLEM");
  });

  it("the audit's E20 section: each card's frameless entry goes to ITS named list (numbered by its place), never to a field", async () => {
    await mount(() => examWith(tf("tf1", 0), mtf("mtf1"), matching("m2"), fill("fb1"), tf("tf2", 1, "المبدّل يعمل في الطبقة الثانية")));
    const cases: [string, string, number][] = [["tf1", "MISSING_ANSWER", 1], ["mtf1", "FIELD_NO_CORRECT", 2], ["m2", "CORRECT_NOT_IN_CHOICES", 3], ["fb1", "FIELD_NO_CORRECT", 4], ["tf2", "MISSING_ANSWER", 5]];
    for (const [id, code, n] of cases) {
      await activate(issueOf(id, code), n);
      expectNamedList(id, n);
      expect((document.activeElement as HTMLElement).matches("input, select, textarea")).toBe(false);
    }
  });

  it("an invalid control whose frame carries NO issue code (a rubric row) may still take focus — the marks (MARKS_PROBLEM) before it are skipped", async () => {
    await mount(() => examWith(open("or1")));
    const editor = await waitFor(() => { const e = card("or1").querySelector<HTMLElement>("[data-testid=rubric-editor]"); expect(e).not.toBeNull(); return e!; }, { timeout: 3000 });
    const title = within(editor).getByRole("textbox", { name: "عنوان المعيار 1" });
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.closest("[data-issue-codes]")).toBeNull();                          // no frame names an issue for it
    const codes = issuesOf("or1").map(i => i.code);
    expect(codes[0]).toBe("MARKS_PROBLEM");
    const rubric = issuesOf("or1").find(i => i.code !== "MARKS_PROBLEM" && !Array.from(card("or1").querySelectorAll<HTMLElement>("[data-issue-codes]")).some(f => f.dataset.issueCodes!.split(" ").includes(i.code)));
    expect(rubric, JSON.stringify(issuesOf("or1").map(i => i.code + ": " + i.message))).toBeDefined();
    await activate(rubric!);
    expectFocus(title);
    expectInvalidWithOtherCode(within(card("or1")).getByLabelText("العلامة"), "MARKS_PROBLEM");
  });
});
