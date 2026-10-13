// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 3 (owner-listed I-1 … I-3): where a summary entry puts focus, through the REAL
// StructuredExamBuilder + REAL history hook inside a replica of App's overlay (the same wrapper as inlineIssues.reviewRF2.21e2b).
//   I-1  an issue of a compound PART (rendered without Field frames: the compound@1 editor markup is frozen, compoundFreeze.20d F-12)
//        focuses that part's own control — its first enabled body control («+ إضافة خيار» for a multiple-choice part without
//        options), else the part's type select — and never an unrelated invalid field of the card (the question's «العلامة»); the
//        same for a composite part (located by its existing data-part-id). A part that cannot be told apart (two parts with the same
//        label) leads to the card's NAMED issue list «مشكلات السؤال N»;
//   I-2  the control a summary entry focuses carries a transient `data-issue-focus` marker (removed on blur) that builder-issues.css
//        draws with the focus ring: programmatic focus after a POINTER click does not match :focus-visible in Chromium, so without it
//        the teacher would not see where the click led (measured in real Chromium by the builder harness, RF3 checks);
//   RR3  inside a part, an issue that names a ROW («الزوج 3 في «البند 2 من …»», «البند 2 في …», «الفراغ 2 في …») focuses THAT row
//        (its empty control; its correct-answer control for a missing / unreachable answer), never the part's first row (a complete,
//        valid pair a screen reader would announce for the wrong issue); a row that cannot be located (a table cell) leads to the
//        named list; a composite part's rich-content issue focuses that part's rich-content control and an unsupported child version
//        its type select — never the invalid question text (RR3-1);
//   I-3  with a duplicated question id (DUPLICATE_ID — a blocking error validateStructuredExam already raises) the occurrence of a
//        repeated code is counted among the issues of the card the summary leads to (the LAST card carrying the id: after the last
//        DUPLICATE_ID), so the last card's «الزوج 1» focuses its own pair 1, not its pair 3.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { evaluateExamFinalization } from "../examFinalization";
import { buildMatchingPatch, type MatchPair } from "../examBuilderState";
import { compositeArabicExam } from "../composite/compositeFixtures";
import type { StructuredIssue } from "../examQuality";
import type { StructuredExam, BuilderQuestion, BuilderPart } from "../examTypes";

const mcPart = (id: string, extra: Partial<BuilderPart> = {}): BuilderPart => ({ id, type: "multipleChoice", text: "اختر", options: [], answer: {}, ...extra } as BuilderPart);
const okPart = (id: string, extra: Partial<BuilderPart> = {}): BuilderPart => mcPart(id, { options: [{ text: "TCP" }, { text: "UDP" }], answer: { correctOptionIndex: 0 }, ...extra });
const compound = (id: string, parts: BuilderPart[], extra: Partial<BuilderQuestion> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "compound", text: "اقرأ ثم أجب", marks: 0, parts, ...extra } as BuilderQuestion);
const mcq = (id: string, text: string, marks: number): BuilderQuestion => ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: [], answer: {} } as BuilderQuestion);
const matching = (id: string, pairs: MatchPair[], extra: Partial<BuilderQuestion> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "matching", marks: 2, ...buildMatchingPatch(pairs), text: "طابق كل بروتوكول بمنفذه", ...extra } as BuilderQuestion);
const examWith = (...questions: BuilderQuestion[]): StructuredExam => ({ examId: "exRF3", title: "امتحان المراجعة الثالثة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "الأسئلة", gradingPolicy: "all", stimuli: {}, questions }, { id: "s2", title: "سقف", gradingPolicy: "capScore", stimuli: {}, questions: [] }] } as unknown as StructuredExam);

const h = {} as { setSaving: (v: boolean) => void; present: StructuredExam };
let initialExam: () => StructuredExam = () => examWith();
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initialExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { setSaving, present: hist.present }); }, [hist]);
  if (!hist.present) return null;
  return (
    <div className="structured-builder-overlay" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="sb-builder-title" tabIndex={-1}>
      <StructuredExamBuilder exam={hist.present} onChange={hist.update} onSave={() => {}} saving={saving} onUndo={hist.undo} onRedo={hist.redo}
        canUndo={hist.canUndo} canRedo={hist.canRedo} saveState={examSaveState(hist.history, saving)} backupStorage={null} onRecover={hist.recover}
        autosaveDelayMs={5} onExit={() => {}} />
    </div>
  );
}

// ── controlled layout (happy-dom has no layout): the sticky toolbar is 120 px tall at the top, so the clearance is 132 px ──
const TOOLBAR_H = 120, CLEARANCE = TOOLBAR_H + 12;
let scrollCalls: { el: HTMLElement; opts: unknown; margin: string }[] = [];
const originalScroll = HTMLElement.prototype.scrollIntoView;
beforeEach(() => {
  scrollCalls = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const b = this.classList.contains("sb-toolbar") ? { top: 0, height: TOOLBAR_H } : { top: 0, height: 0 };
    return { top: b.top, bottom: b.top + b.height, height: b.height, left: 0, right: 640, width: 640, x: 0, y: b.top, toJSON() {} } as DOMRect;
  });
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, opts?: boolean | ScrollIntoViewOptions) { scrollCalls.push({ el: this, opts, margin: this.style.scrollMarginBlockStart }); };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); HTMLElement.prototype.scrollIntoView = originalScroll; });

const tick = (ms = 5) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const mount = async (exam: () => StructuredExam) => { initialExam = exam; render(<Host />); await tick(); scrollCalls = []; };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
/** The parts of a compound card, in the order of `question.parts` (the frozen markup: `.sb-compound-editor > .sb-part`). */
const parts = (id: string) => Array.from(card(id).querySelectorAll<HTMLElement>(".sb-compound-editor > .sb-part"));
const summary = () => document.querySelector<HTMLElement>(".sb-issues")!;
const issuesOf = (questionId: string, exam: StructuredExam = h.present) => { const d = evaluateExamFinalization(exam); return [...d.structuralErrors, ...d.structuralWarnings].filter(i => i.questionId === questionId); };
const entriesFor = (i: StructuredIssue) => within(summary()).getAllByRole("button").filter(b => b.classList.contains("sb-issue-link") && (b.textContent || "").includes(i.message));
const entryFor = (i: StructuredIssue) => { const hits = entriesFor(i); expect(hits, i.code + " entry").toHaveLength(1); return hits[0]; };
const focused = () => { const a = document.activeElement as HTMLElement | null; const label = a?.id ? document.querySelector(`label[for="${a.id}"]`)?.textContent : null; return "focused: " + (label || a?.getAttribute("aria-label") || (a?.textContent || a?.tagName || "").trim().slice(0, 40)) + (a?.closest(".sb-part") ? " (in part " + (Array.from(a.closest(".sb-part")!.parentElement!.children).indexOf(a.closest(".sb-part")!) + 1) + ")" : ""); };
const expectFocus = (el: Element) => expect(document.activeElement, focused()).toBe(el);
const click = async (entry: HTMLElement) => { fireEvent.click(entry); await tick(); };
const open = (i: StructuredIssue) => click(entryFor(i));

describe("I-1 — an issue of a compound / composite part focuses that part, never an unrelated field", () => {
  it("marks 0 + a multiple-choice part with options [] / answer {}: «… بأقل من خيارين» focuses the part's «+ إضافة خيار», never «العلامة»", async () => {
    await mount(() => examWith(compound("k1", [mcPart("p1")])));
    const issues = issuesOf("k1");
    expect(issues.map(i => i.code)).toEqual(["MARKS_PROBLEM", "MISSING_OPTIONS", "MISSING_ANSWER"]);
    const [marksIssue, optionsIssue, answerIssue] = issues;
    expect(optionsIssue.message).toContain("بأقل من خيارين");
    const addOption = within(parts("k1")[0]).getByRole("button", { name: "+ إضافة خيار" });
    await open(optionsIssue);
    expectFocus(addOption);
    expect(within(card("k1")).getByLabelText("العلامة").getAttribute("aria-invalid")).toBe("true");   // invalid, revealed — and not where focus went
    expect(parts("k1")[0].contains(scrollCalls.at(-1)!.el), "the part showing the issue is aligned").toBe(true);
    expect(scrollCalls.at(-1)!.margin).toBe(CLEARANCE + "px");
    expect(card("k1").classList.contains("sb-q-flash")).toBe(true);
    await open(answerIssue);
    expectFocus(addOption);
    await open(marksIssue);                                                                           // the marks' own issue still focuses them
    expectFocus(within(card("k1")).getByLabelText("العلامة"));
  });
  it("three parts: each part's entry focuses ITS part (part 2 / part 3), never part 1's control or the marks", async () => {
    await mount(() => examWith(compound("k2", [okPart("p1"), mcPart("p2"), mcPart("p3")])));
    const options = issuesOf("k2").filter(i => i.code === "MISSING_OPTIONS");
    expect(options.map(i => i.message.slice(0, 12))).toEqual(["«البند 2 من ", "«البند 3 من "]);
    await open(options[1]);
    expectFocus(within(parts("k2")[2]).getByRole("button", { name: "+ إضافة خيار" }));
    await open(options[0]);
    expectFocus(within(parts("k2")[1]).getByRole("button", { name: "+ إضافة خيار" }));
    const answers = issuesOf("k2").filter(i => i.code === "MISSING_ANSWER");
    await open(answers[1]);
    expectFocus(within(parts("k2")[2]).getByRole("button", { name: "+ إضافة خيار" }));
  });
  it("a part with options but no correct answer: MISSING_ANSWER focuses that part's first «الصحيح» radio", async () => {
    await mount(() => examWith(compound("k3", [okPart("p1"), okPart("p2", { answer: {} })])));
    const [answer] = issuesOf("k3").filter(i => i.code === "MISSING_ANSWER");
    await open(answer);
    expectFocus(parts("k3")[1].querySelector('input[type="radio"]')!);
  });
  it("a part whose body has no control (an unknown part type): the part's own type select", async () => {
    await mount(() => examWith(compound("k4", [okPart("p1"), { id: "p2", type: "legacyGizmo", text: "؟" } as unknown as BuilderPart])));
    const unknown = issuesOf("k4").find(i => i.code === "UNKNOWN_QUESTION_TYPE");
    expect(unknown, JSON.stringify(issuesOf("k4").map(i => i.code))).toBeTruthy();
    await open(unknown!);
    expectFocus(parts("k4")[1].querySelector(".sb-part-head select")!);
  });
  it("two parts with the same label cannot be told apart: the card's named issue list «مشكلات السؤال 1», never «العلامة»", async () => {
    await mount(() => examWith(compound("k5", [mcPart("p1", { label: "أ" }), mcPart("p2", { label: "أ" })])));
    const [first] = issuesOf("k5").filter(i => i.code === "MISSING_OPTIONS");
    const entries = entriesFor(first);
    expect(entries).toHaveLength(2);                                                                  // the canonical messages are identical
    await click(entries[1]);
    expectFocus(within(card("k5")).getByRole("group", { name: "مشكلات السؤال 1" }));
  });
  it("a composite part (data-part-id): its «… بأقل من خيارين» focuses that part's «+ إضافة خيار», never the (invalid) question text", async () => {
    await import("../questionTypes/editors/CompositeEditor");                                        // the lazy editor, loaded before the render
    const fixture = () => {
      const q = compositeArabicExam().sections[0].questions[0] as unknown as BuilderQuestion & { composite: { groups: { parts: Record<string, unknown>[] }[] } };
      Object.assign(q.composite.groups[0].parts[1], { type: "multipleChoice", options: [], answer: {} });   // part «ب» (pA2): no options
      delete q.composite.groups[0].parts[1].fields;
      return examWith({ ...q, text: "" } as BuilderQuestion);                                          // EMPTY_TEXT: an invalid field before the part
    };
    await mount(fixture);
    await tick(20);
    const issues = issuesOf("q4");
    const options = issues.find(i => i.code === "MISSING_OPTIONS")!;
    expect(options, JSON.stringify(issues.map(i => i.code + " " + i.message))).toBeTruthy();
    expect(options.message).toMatch(/^«البند ب من «4»» /);
    expect(issues.some(i => i.code === "EMPTY_TEXT")).toBe(true);
    const part = card("q4").querySelector<HTMLElement>('.sb-part[data-part-id="pA2"]')!;
    await open(options);
    expectFocus(within(part).getByRole("button", { name: "+ إضافة خيار" }));
    expect(within(card("q4")).getByLabelText("نص السؤال").getAttribute("aria-invalid")).toBe("true");   // invalid, revealed — not where focus went
  });
  it("pin: while a save is in flight no part control is enabled — the card's named issue list", async () => {
    await mount(() => examWith(compound("k1", [mcPart("p1")])));
    act(() => h.setSaving(true));
    await tick();
    await open(issuesOf("k1").find(i => i.code === "MISSING_OPTIONS")!);
    expectFocus(within(card("k1")).getByRole("group", { name: "مشكلات السؤال 1" }));
  });
});

describe("RR3 — a row issue inside a part focuses that row; what cannot be located goes to the named list", () => {
  const opts = [{ text: "80" }, { text: "53" }, { text: "443" }];
  const matchingPart = { id: "pm", type: "matching", text: "طابق", answer: { text: "HTTP=80" }, fields: [
    { id: "m1", label: "HTTP", kind: "select", options: opts, correct: "80" }, { id: "m2", label: "DNS", kind: "select", options: opts, correct: "53" },
    { id: "m3", label: "", kind: "select", options: opts, correct: "443" }, { id: "m4", label: "SSH", kind: "select", options: opts, correct: "22" }] } as unknown as BuilderPart;
  const statementsPart = { id: "pt", type: "multiTrueFalse", text: "حدد", fields: [{ id: "t1", statement: "س", kind: "boolean", correct: true }, { id: "t2", statement: "ص", kind: "boolean" }] } as unknown as BuilderPart;
  const blanksPart = { id: "pf", type: "fillBlank", text: "أكمل", wordBank: ["أ", "ب"], fields: [{ id: "f1", label: "x", kind: "select", correct: "أ" }, { id: "f2", label: "y", kind: "select", correct: "" }], answer: { mode: "exactSequence", values: ["أ", ""] } } as unknown as BuilderPart;
  const tablePart = { id: "pb", type: "tableFill", text: "أكمل الجدول", tableHeaders: ["أ", "ب"], tableRows: [["x", ""]], fields: [{ id: "c1", row: 5, column: 0, kind: "text", correct: "1" }] } as unknown as BuilderPart;
  const rows = (id: string, part: number) => Array.from(parts(id)[part].querySelectorAll<HTMLElement>(".sb-field-row"));
  const controls = (row: HTMLElement) => Array.from(row.querySelectorAll<HTMLElement>("input, select"));
  it("valid marks + a matching part: «الزوج 3 … غير مكتمل» focuses pair 3's EMPTY «العنصر», «الإجابة الصحيحة للزوج 4» pair 4's answer — never pair 1 («HTTP»)", async () => {
    await mount(() => examWith(compound("r1", [okPart("p0"), matchingPart], { marks: 2 })));
    const issues = issuesOf("r1");
    expect(issues.some(i => i.code === "MARKS_PROBLEM")).toBe(false);                               // nothing invalid outside the part
    const incomplete = issues.find(i => i.code === "MATCH_INCOMPLETE_PAIR")!;
    const unreachable = issues.find(i => i.code === "CORRECT_NOT_IN_CHOICES")!;
    expect(incomplete.message).toMatch(/^الزوج 3 في «البند 2 من »/);
    expect(unreachable.message).toMatch(/^الإجابة الصحيحة للزوج 4 في «البند 2 من »/);
    const pairs = rows("r1", 1);
    expect(pairs).toHaveLength(4);
    await open(incomplete);
    expectFocus(controls(pairs[2])[0]);
    expect((document.activeElement as HTMLInputElement).value).toBe("");
    expect(scrollCalls.at(-1)!.el, "the row is aligned").toBe(pairs[2]);
    await open(unreachable);
    expectFocus(controls(pairs[3]).at(-1)!);
    expect((document.activeElement as HTMLInputElement).value).toBe("22");
    expect(document.activeElement!.hasAttribute("data-issue-focus")).toBe(true);
  });
  it("a statement without its answer («البند 2 في «البند 2 من …»») and a blank without its answer: that row's answer control", async () => {
    await mount(() => examWith(compound("r2", [okPart("p0"), statementsPart, blanksPart], { marks: 3 })));
    const [statement, blank] = issuesOf("r2").filter(i => i.code === "FIELD_NO_CORRECT");
    expect(statement.message).toMatch(/^البند 2 في «البند 2 من »/);
    expect(blank.message).toMatch(/^الفراغ 2 في «البند 3 من »/);
    await open(statement);
    expectFocus(controls(rows("r2", 1)[1]).at(-1)!);
    expect(document.activeElement!.tagName).toBe("SELECT");
    await open(blank);
    expectFocus(controls(rows("r2", 2)[1]).at(-1)!);
  });
  it("a table cell the editor cannot point to (TABLE_BAD_CELL): the card's named issue list, never the table's first control", async () => {
    await mount(() => examWith(compound("r3", [okPart("p0"), tablePart], { marks: 2 })));
    const cell = issuesOf("r3").find(i => i.code === "TABLE_BAD_CELL")!;
    expect(cell, JSON.stringify(issuesOf("r3").map(i => i.code))).toBeTruthy();
    await open(cell);
    expectFocus(within(card("r3")).getByRole("group", { name: "مشكلات السؤال 1" }));
  });
  it("composite: a part's rich-content issue focuses that part's «محتوى منسق لـ…», an unsupported child version its type select — never «نص السؤال»", async () => {
    await import("../questionTypes/editors/CompositeEditor");
    const fixture = (patch: Record<string, unknown>) => () => {
      const q = compositeArabicExam().sections[0].questions[0] as unknown as BuilderQuestion & { composite: { groups: { parts: Record<string, unknown>[] }[] } };
      Object.assign(q.composite.groups[0].parts[1], patch);                                          // part «ب» (pA2)
      return examWith({ ...q, text: "" } as BuilderQuestion);                                          // EMPTY_TEXT: an invalid field before the part
    };
    await mount(fixture({ richContent: { v: 1, blocks: [42] } }));
    await tick(20);
    const rich = issuesOf("q4").find(i => i.message.startsWith("البند ب من «4» — المحتوى المنسق: "))!;
    expect(rich, JSON.stringify(issuesOf("q4").map(i => i.code + " " + i.message))).toBeTruthy();
    const part = () => card("q4").querySelector<HTMLElement>('.sb-part[data-part-id="pA2"]')!;
    await open(rich);
    expectFocus(within(part()).getByRole("button", { name: /^محتوى منسق لـ/ }));
    expect(within(card("q4")).getByLabelText("نص السؤال").getAttribute("aria-invalid")).toBe("true");
    cleanup();
    await mount(fixture({ questionTypeVersion: 99 }));
    await tick(20);
    const unsupported = issuesOf("q4").find(i => i.code === "COMPOSITE_CHILD_TYPE_UNSUPPORTED")!;
    expect(unsupported, JSON.stringify(issuesOf("q4").map(i => i.code + " " + i.message))).toBeTruthy();
    await open(unsupported);
    expectFocus(part().querySelector(".sb-part-head select")!);
  });
});

describe("I-2 — the control a summary entry focuses shows focus whatever moved it there", () => {
  const marked = () => Array.from(document.querySelectorAll("[data-issue-focus]"));
  it("the focused control carries data-issue-focus; it leaves on blur and is never on two elements", async () => {
    await mount(() => examWith(mcq("c1", "اختر البروتوكول", 0)));
    const [marksIssue, optionsIssue] = issuesOf("c1");
    await open(optionsIssue);
    const addOption = within(card("c1")).getByRole("button", { name: "+ إضافة خيار" });
    expectFocus(addOption);
    expect(addOption.hasAttribute("data-issue-focus")).toBe(true);
    await open(marksIssue);
    const marks = within(card("c1")).getByLabelText("العلامة");
    expectFocus(marks);
    expect(marks.hasAttribute("data-issue-focus")).toBe(true);
    expect(marked()).toEqual([marks]);                                                                // the previous control lost it with its focus
    act(() => { marks.blur(); });
    expect(marked()).toEqual([]);
  });
  it("a compound part's control, a card's named list and a section's named list carry it too", async () => {
    await mount(() => examWith(compound("k1", [mcPart("p1")])));
    await open(issuesOf("k1").find(i => i.code === "MISSING_OPTIONS")!);
    expect(marked()).toEqual([within(parts("k1")[0]).getByRole("button", { name: "+ إضافة خيار" })]);
    act(() => h.setSaving(true));
    await tick();
    await open(issuesOf("k1").find(i => i.code === "MISSING_ANSWER")!);
    expect(marked()).toEqual([within(card("k1")).getByRole("group", { name: "مشكلات السؤال 1" })]);
    const section = evaluateExamFinalization(h.present).structuralErrors.find(i => i.sectionId === "s2" && !i.questionId)!;
    await open(section);
    const sectionList = within(document.querySelector<HTMLElement>('[data-section-id="s2"]')!).getByRole("group", { name: "مشكلات القسم 2" });
    expectFocus(sectionList);
    expect(marked()).toEqual([sectionList]);
  });
  it("builder-issues.css draws the marker with the focus ring token, above the inputs' own :focus rule (no premium sheet edit)", () => {
    const css = readFileSync(resolve(__dirname, "builder-issues.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");   // comments out
    const rule = css.match(/([^{}]*\[data-issue-focus\][^{}]*)\{([^}]*)\}/);
    expect(rule, "a [data-issue-focus] rule").toBeTruthy();
    expect(rule![2]).toMatch(/outline:\s*var\(--eb-focus-ring\)/);
    expect(rule![2]).toMatch(/outline-offset:\s*var\(--eb-focus-offset\)/);
    // `.sb-builder .sb-input:focus` (builder-premium.css) is 0-3-0: every selector of the marker rule must out-rank it.
    for (const sel of rule![1].split(",")) {
      const s = sel.trim();
      const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
      expect(classes, s).toBeGreaterThan(3);
    }
  });
});

describe("I-3 — a duplicated question id: the occurrence is counted in the card the summary leads to", () => {
  // Card A (displayed «1») has ONE incomplete pair (pair 1); card B (displayed «2», the SAME examQuestionId) has pairs 1 and 3
  // incomplete. The node map — and the entries' label — hold the LAST card (B).
  const A = () => matching("dup", [{ left: "", right: "80" }, { left: "DNS", right: "53" }, { left: "SSH", right: "22" }], { displayNumber: "1" });
  const B = () => matching("dup", [{ left: "", right: "80" }, { left: "DNS", right: "53" }, { left: "", right: "443" }], { displayNumber: "2" });
  const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".sb-question"));
  it("the last card's «الزوج 1» focuses its pair 1 and «الزوج 3» its pair 3 (DUPLICATE_ID raised, counting starts after it)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});   // React's duplicate-key warning (the data IS duplicated)
    await mount(() => examWith(A(), B()));
    const issues = issuesOf("dup");
    expect(issues.map(i => i.code)).toEqual(["MATCH_INCOMPLETE_PAIR", "DUPLICATE_ID", "MATCH_INCOMPLETE_PAIR", "MATCH_INCOMPLETE_PAIR"]);
    const [aPair1, , bPair1, bPair3] = issues;
    expect(aPair1.message).toMatch(/^الزوج 1 في ««1»»/);
    expect(bPair1.message).toMatch(/^الزوج 1 في ««2»»/);
    expect(bPair3.message).toMatch(/^الزوج 3 في ««2»»/);
    const last = cards()[1];
    await open(bPair1);
    expectFocus(within(last).getByLabelText("العنصر 1"));
    await open(bPair3);
    expectFocus(within(last).getByLabelText("العنصر 3"));
    await open(bPair1);
    expectFocus(within(last).getByLabelText("العنصر 1"));
    // An issue of the EARLIER card (its entry is labelled with the last card, the one the builder can reach): code-only matching —
    // the first frame of the last card showing the code.
    await open(aPair1);
    expectFocus(within(last).getByLabelText("العنصر 1"));
    errSpy.mockRestore();
  });
});
