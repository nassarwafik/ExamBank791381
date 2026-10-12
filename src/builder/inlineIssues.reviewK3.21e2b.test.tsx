// @vitest-environment happy-dom
// Phase 21E.2 part 2 — review cluster K3: the inline issues of c932f31, through the REAL StructuredExamBuilder + REAL history hook
// inside a replica of App's overlay (the same wrapper as inlineIssuesWiring.21e2b). Findings:
//   C-F3  the reveal a summary click turns on ends once that question has no canonical issue left: a row added later (matching
//         «إضافة زوج») is not shown as invalid before the teacher visits it (Field's touchKey decides again);
//   C-F5  App reuses the builder instance when another exam opens: that exam's counts are its baseline (never announced), and the
//         previous exam's announcement leaves with it;
//   A-F4  an issue with no invalid control to focus (a multiple-choice question without options; a section) focuses the card's /
//         section's NAMED issue list «مشكلات السؤال N» / «مشكلات القسم N», with the alignment the card / section already uses;
//   A-F6  the clicked issue's own field takes focus (the Field frame showing that code: data-issue-codes), not the first invalid
//         field in DOM order;
//   A-F7  the summary toggle's name is its counts (the disclosure chevron is aria-hidden; aria-expanded carries the state), and the
//         save-state status keeps its exact visible text with its glyph hidden from assistive technology.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, act, within, screen } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { evaluateExamFinalization } from "../examFinalization";
import { buildMatchingPatch, newQuestion, newSection } from "../examBuilderState";
import StructuredQuestionEditor from "../StructuredQuestionEditor";
import { FieldRevealContext } from "../ui/fieldContext";
import { validateStructuredExam } from "../examQuality";
import { HEADER_FIELD_CODES, MULTIPLE_CHOICE_FIELD_CODES, MATCHING_FIELD_CODES } from "../teacher/questionFieldIssues";
import { issueSummaryText } from "./issueIndex";
import { useIssueAnnouncer } from "./useIssueAnnouncer";
import type { StructuredIssue } from "../examQuality";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

const sa = (id: string, text: string, marks = 2): BuilderQuestion => ({ examQuestionId: id, presentationType: "shortAnswer", text, marks, answer: { text: "-" } } as BuilderQuestion);
const mcq = (id: string, text: string, options: { text: string }[]): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options, answer: options.length ? { correctOptionIndex: 0 } : {} } as BuilderQuestion);
const matching = (id: string, text: string): BuilderQuestion => ({ examQuestionId: id, presentationType: "matching", marks: 2, ...buildMatchingPatch([{ left: "HTTP", right: "80" }]), text } as BuilderQuestion);
// s1: q2 has no text AND marks 0 (EMPTY_TEXT + MARKS_PROBLEM; its marks field comes BEFORE its text field in the card);
//     q3 is a multiple-choice question without options (MISSING_OPTIONS + MISSING_ANSWER: no radio, no option input to focus).
// s2: m1 is a complete matching question without its text (EMPTY_TEXT only).
// s3: an empty section (a section-level EMPTY_SECTION warning).
const makeExam = (): StructuredExam => ({ examId: "exK3", title: "امتحان المراجعة", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [
    { id: "s1", title: "الأسئلة", gradingPolicy: "all", stimuli: {}, questions: [sa("q1", "ما هو الراوتر"), sa("q2", "", 0), mcq("q3", "اختر البروتوكول", [])] },
    { id: "s2", title: "المطابقة", gradingPolicy: "all", stimuli: {}, questions: [matching("m1", "")] },
    { id: "s3", title: "فارغ", gradingPolicy: "all", stimuli: {}, questions: [] },
  ] } as unknown as StructuredExam);
// Another exam (C-F5): different id, different counts (one question error, nothing else).
const otherExam = (): StructuredExam => ({ examId: "exK3-other", title: "امتحان آخر", status: "draft", schemaVersion: 2, updatedAt: "2026-03-02T10:00:00.000Z",
  sections: [{ id: "o1", title: "قسم", gradingPolicy: "all", stimuli: {}, questions: [sa("o1q1", ""), sa("o1q2", "سؤال")] }] } as unknown as StructuredExam);
const canonical = (exam = makeExam()): StructuredIssue[] => { const d = evaluateExamFinalization(exam); return [...d.structuralErrors, ...d.structuralWarnings]; };
const issueOf = (questionId: string, code: string) => { const i = canonical().find(x => x.questionId === questionId && x.code === code); if (!i) throw new Error("no " + code + " on " + questionId); return i; };

const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void; open: (e: StructuredExam, source?: "saved" | "unsaved") => void };
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  const [saving] = useState(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { update: hist.update, open: hist.open }); }, [hist]);
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
const mount = async () => { render(<Host />); await tick(); scrollCalls = []; };
const card = (id: string) => document.getElementById("sb-q-" + id) as HTMLElement;
const sectionEl = (id: string) => document.querySelector<HTMLElement>(`[data-section-id="${id}"]`)!;
const summary = () => document.querySelector<HTMLElement>(".sb-issues")!;
const liveRegion = () => document.querySelector<HTMLElement>("[data-issue-live]")!;
/** The summary entry (a button) for one canonical issue, found by that issue's own message. */
const entryFor = (i: StructuredIssue) => {
  const hits = within(summary()).getAllByRole("button").filter(b => b.classList.contains("sb-issue-link") && (b.textContent || "").includes(i.message));
  expect(hits, i.code + " entry").toHaveLength(1);
  return hits[0];
};
/** What assistive technology reads for an element: its text without aria-hidden parts, whitespace collapsed. */
const spokenText = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove()); return (c.textContent || "").replace(/\s+/g, " ").trim(); };
const nameOf = (el: HTMLElement, role: string) => { let name = ""; screen.getByRole(role, { name: (n: string, e: Element) => (e === el ? ((name = n), true) : false) }); return name; };
const GLYPHS = /[▾▸◂▴▹◃▶◀✓●⏳↺]/u;

describe("K3 C-F3 — the summary's reveal ends with the question's issues", () => {
  it("a pair added after the question was fixed is not marked invalid before the teacher visits it", async () => {
    await mount();
    expect(canonical().filter(i => i.questionId === "m1").map(i => i.code)).toEqual(["EMPTY_TEXT"]);
    fireEvent.click(entryFor(issueOf("m1", "EMPTY_TEXT")));
    await tick();
    const text = within(card("m1")).getByLabelText("نص السؤال");
    expect(document.activeElement).toBe(text);
    expect(text.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(text, { target: { value: "طابق كل بروتوكول بمنفذه" } });
    await tick();
    expect(within(card("m1")).queryByRole("group", { name: /مشكلات السؤال/ })).toBeNull();      // m1 has no issue left
    fireEvent.click(within(card("m1")).getByRole("button", { name: "+ إضافة زوج" }));
    await tick();
    // The new, empty pair IS an issue (MATCH_INCOMPLETE_PAIR) — listed in the card and the summary — but its fields are not red
    // before the teacher has left them: the old reveal no longer applies.
    expect(within(card("m1")).getByRole("group", { name: /مشكلات السؤال/ })).toBeTruthy();
    const left2 = within(card("m1")).getByLabelText("العنصر 2"), right2 = within(card("m1")).getByLabelText("الإجابة الصحيحة للعنصر 2");
    expect(left2.getAttribute("aria-invalid")).toBeNull();
    expect(right2.getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(right2);                                                                  // … and the touched rule still works
    expect(within(card("m1")).getByLabelText("الإجابة الصحيحة للعنصر 2").getAttribute("aria-invalid")).toBe("true");
  });
  it("pin: while the question still has another issue, the reveal stays (its marks keep showing their error)", async () => {
    await mount();
    fireEvent.click(entryFor(issueOf("q2", "EMPTY_TEXT")));
    await tick();
    fireEvent.change(within(card("q2")).getByLabelText("نص السؤال"), { target: { value: "ما هو المبدّل" } });
    await tick();
    expect(within(card("q2")).getByLabelText("العلامة").getAttribute("aria-invalid")).toBe("true");
  });
});

describe("K3 C-F5 — another exam opened in the same builder instance", () => {
  it("is not announced when it opens (its counts are its baseline)", async () => {
    await mount();
    const region = liveRegion();
    await tick(1000);
    expect(region.textContent).toBe("");
    act(() => h.open(otherExam(), "saved"));                                                // App's preset path: no key, no remount
    await tick();
    expect(liveRegion()).toBe(region);                                                       // the same builder instance
    expect(document.querySelectorAll(".sb-issue-link")).toHaveLength(canonical(otherExam()).length);
    await tick(1000);
    expect(region.textContent).toBe("");
  });
  it("the previous exam's announcement leaves with it; the new exam's own changes are announced", async () => {
    await mount();
    const region = liveRegion();
    await tick(1000);
    expect(region.textContent).toBe("");
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "m1" ? { ...q, text: "طابق" } : q)) })) })));
    await tick(1000);
    const d = evaluateExamFinalization(makeExam());
    expect(region.textContent).toBe(issueSummaryText(d.structuralErrors.length - 1, d.structuralWarnings.length));
    act(() => h.open(otherExam(), "saved"));                                                // App's preset path: no key, no remount
    await tick();
    expect(document.querySelector(".sb-builder")).toBeTruthy();
    expect(liveRegion()).toBe(region);                                                       // the same builder instance
    expect(region.textContent).toBe("");                                                     // the old exam's sentence is gone
    await tick(1000);
    expect(region.textContent).toBe("");                                                     // the new exam's counts are its baseline
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => ({ ...q, text: q.text || "سؤال" })) })) })));
    await tick(1000);
    expect(region.textContent).toBe(issueSummaryText(0, 0));                                 // and its own changes are announced
  });
  it("useIssueAnnouncer: a new identity resets the baseline and the text", async () => {
    function Announcer({ e, w, id }: { e: number; w: number; id: string }) { return <div data-testid="a">{useIssueAnnouncer(e, w, 50, id)}</div>; }
    const r = render(<Announcer e={1} w={0} id="A" />);
    r.rerender(<Announcer e={2} w={0} id="A" />);
    await tick(80);
    expect(screen.getByTestId("a").textContent).toBe(issueSummaryText(2, 0));
    r.rerender(<Announcer e={5} w={3} id="B" />);
    expect(screen.getByTestId("a").textContent).toBe("");
    await tick(80);
    expect(screen.getByTestId("a").textContent).toBe("");
    r.rerender(<Announcer e={4} w={3} id="B" />);
    await tick(80);
    expect(screen.getByTestId("a").textContent).toBe(issueSummaryText(4, 3));
    r.rerender(<Announcer e={2} w={0} id="A" />);                                            // back to the first exam: nothing
    await tick(80);                                                                          // of its old sentence comes back
    expect(screen.getByTestId("a").textContent).toBe("");
  });
});

describe("K3 A-F4 — an issue without an invalid control focuses its named issue list", () => {
  it("a multiple-choice question without options: «مشكلات السؤال 3», its card aligned below the toolbar", async () => {
    await mount();
    expect(within(card("q3")).queryAllByRole("radio")).toHaveLength(0);
    fireEvent.click(entryFor(issueOf("q3", "MISSING_OPTIONS")));
    await tick();
    const group = within(card("q3")).getByRole("group", { name: "مشكلات السؤال 3" });
    expect(document.activeElement).toBe(group);
    expect(nameOf(group, "group")).toBe("مشكلات السؤال 3");
    expect(group.getAttribute("tabindex")).toBe("-1");                                       // focusable by script, never a Tab stop
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].el).toBe(card("q3"));
    expect(scrollCalls[0].margin).toBe(CLEARANCE + "px");
    expect(card("q3").classList.contains("sb-q-flash")).toBe(true);
  });
  it("a section: «مشكلات القسم 3», the section heading aligned below the toolbar", async () => {
    await mount();
    const empty = canonical().find(i => i.sectionId === "s3" && !i.questionId)!;
    fireEvent.click(entryFor(empty));
    await tick();
    const group = within(sectionEl("s3")).getByRole("group", { name: "مشكلات القسم 3" });
    expect(document.activeElement).toBe(group);
    expect(nameOf(group, "group")).toBe("مشكلات القسم 3");
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].el).toBe(sectionEl("s3"));
    expect(scrollCalls[0].opts).toEqual({ block: "start", behavior: "smooth" });
    expect(scrollCalls[0].margin).toBe(CLEARANCE + "px");
  });
});

describe("K3 A-F6 — the clicked issue's own field takes focus", () => {
  it("EMPTY_TEXT focuses the question text and MARKS_PROBLEM the marks, although the marks come first in the card", async () => {
    await mount();
    const marks = within(card("q2")).getByLabelText("العلامة"), text = within(card("q2")).getByLabelText("نص السؤال");
    expect(marks.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(entryFor(issueOf("q2", "EMPTY_TEXT")));
    await tick();
    expect(document.activeElement).toBe(within(card("q2")).getByLabelText("نص السؤال"));
    expect(scrollCalls.at(-1)!.el).toBe(within(card("q2")).getByLabelText("نص السؤال").closest(".eb-field"));
    fireEvent.click(entryFor(issueOf("q2", "MARKS_PROBLEM")));
    await tick();
    expect(document.activeElement).toBe(within(card("q2")).getByLabelText("العلامة"));
    fireEvent.click(entryFor(issueOf("q2", "EMPTY_TEXT")));
    await tick();
    expect(document.activeElement).toBe(within(card("q2")).getByLabelText("نص السؤال"));
  });
  it("a Field frame that shows an error carries the canonical codes of its question's issues (one mapping, no second rule)", async () => {
    await mount();
    for (const [qid, code] of [["q2", "EMPTY_TEXT"], ["q3", "MISSING_OPTIONS"], ["m1", "EMPTY_TEXT"]] as const) { fireEvent.click(entryFor(issueOf(qid, code))); await tick(); }
    const seen: string[] = [];
    for (const qid of ["q2", "q3", "m1"]) {
      const own = new Set(canonical().filter(i => i.questionId === qid).map(i => i.code));
      for (const frame of Array.from(card(qid).querySelectorAll<HTMLElement>("[data-issue-codes]"))) {
        expect(frame.matches(".eb-field, .eb-field-group"), qid).toBe(true);
        expect(frame.classList.contains("is-invalid"), qid).toBe(true);
        for (const code of frame.dataset.issueCodes!.split(" ")) { expect(own.has(code), qid + " " + code).toBe(true); seen.push(qid + ":" + code); }
      }
    }
    expect(seen.sort()).toEqual(["m1:EMPTY_TEXT", "q2:EMPTY_TEXT", "q2:MARKS_PROBLEM", "q3:MISSING_ANSWER", "q3:MISSING_OPTIONS"]);
    expect(within(card("q2")).getByLabelText("نص السؤال").closest("[data-issue-codes]")!.getAttribute("data-issue-codes")).toBe("EMPTY_TEXT");
    expect(within(card("q2")).getByLabelText("العلامة").closest("[data-issue-codes]")!.getAttribute("data-issue-codes")).toBe("MARKS_PROBLEM");
    expect(card("q1").querySelectorAll("[data-issue-codes]")).toHaveLength(0);              // a valid question carries none
  });
});

describe("K3 A-F6 — every framed editor labels its errors with the canonical codes (both ways)", () => {
  // Rendered revealed (as after a summary click): the codes carried by the card's frames must be exactly the question's canonical
  // codes that a field shows — none invented, none dropped (header, multiple choice, matching list / pair, numeric response).
  // Read when a test runs (not while the file is collected), so a source without these tables fails its tests instead of the file.
  const shown = (code: string) => code.startsWith("NUM_") || [HEADER_FIELD_CODES, MULTIPLE_CHOICE_FIELD_CODES, MATCHING_FIELD_CODES].some(t => Object.values(t ?? {}).includes(code as never));
  const examOf = (q: BuilderQuestion): StructuredExam => ({ examId: "e", title: "t", sections: [{ ...newSection({ title: "ق" }), id: "s", questions: [q] }] } as unknown as StructuredExam);
  const props = (q: BuilderQuestion) => ({ question: q, index: 0, total: 1, sectionOptions: [{ id: "s", title: "ق" }], currentSectionId: "s", groupOptions: [], onChange: vi.fn(), onDelete: vi.fn(), onMove: vi.fn(), onDuplicate: vi.fn(), onMoveToSection: vi.fn(), onPreview: vi.fn() });
  const cases: [string, BuilderQuestion][] = [
    ["header", newQuestion("shortAnswer", { text: "", marks: 0 })],
    ["mcq no options", newQuestion("multipleChoice", { text: "س", options: [], answer: {} as never })],
    ["mcq no answer", newQuestion("multipleChoice", { text: "س", options: [{ text: "أ" }, { text: "ب" }], answer: {} as never })],
    ["matching empty", { ...newQuestion("matching", { text: "س" }), fields: [] } as BuilderQuestion],
    ["matching incomplete", newQuestion("matching", { ...buildMatchingPatch([{ left: "HTTP", right: "80" }, { left: "DNS", right: "" }]) })],
    ["numeric reversed + unit", newQuestion("numericResponse", { text: "س", answer: { mode: "range", min: 3, max: 2 } as never, numeric: { unitRequired: true } } as Partial<BuilderQuestion>)],
    ["numeric bad expected", newQuestion("numericResponse", { text: "س", answer: { mode: "tolerance", expected: "x", tolerance: -1 } as never } as Partial<BuilderQuestion>)],
  ];
  it.each(cases)("%s", async (_name, q) => {
    const canonicalCodes = new Set(validateStructuredExam(examOf(q)).filter(i => i.questionId === q.examQuestionId).map(i => i.code));
    render(<FieldRevealContext.Provider value><StructuredQuestionEditor {...props(q)} /></FieldRevealContext.Provider>);
    if (q.presentationType === "numericResponse") await screen.findByTestId("qt-editor-numericResponse");   // a lazily loaded editor
    const carried = new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-issue-codes]")).flatMap(f => f.dataset.issueCodes!.split(" ")));
    expect(carried.size, "frames carry codes").toBeGreaterThan(0);
    for (const c of carried) expect(canonicalCodes.has(c), "invented " + c).toBe(true);
    for (const c of canonicalCodes) if (shown(c)) expect(carried.has(c), "dropped " + c).toBe(true);
  });
});

describe("K3 A-F7 — glyphs are shown, never spoken", () => {
  it("the summary toggle is named by its counts; the chevron is aria-hidden and follows aria-expanded", async () => {
    await mount();
    const head = summary().querySelector<HTMLButtonElement>("button.sb-issues-head")!;
    const d = evaluateExamFinalization(makeExam());
    const counts = d.structuralErrors.length + " خطأ • " + d.structuralWarnings.length + " تنبيه";
    const open = nameOf(head, "button");
    expect(open).not.toMatch(GLYPHS);
    expect(open.startsWith(counts), open).toBe(true);
    const chevron = head.querySelector<SVGElement>("svg.eb-disclosure-chevron")!;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(chevron.classList.contains("is-open")).toBe(true);
    expect(GLYPHS.test(head.textContent || ""), head.textContent || "").toBe(false);
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(head.querySelector("svg.eb-disclosure-chevron")!.classList.contains("is-open")).toBe(false);
    expect(nameOf(head, "button")).toBe(open);
  });
  it("the save-state status keeps its exact visible text; its glyph is aria-hidden", async () => {
    await mount();
    const chip = () => document.querySelector<HTMLElement>(".sb-save-state")!;
    expect(chip().textContent).toBe("✓ محفوظ");
    expect(spokenText(chip())).toBe("محفوظ");
    expect(chip().querySelector('[aria-hidden="true"]')!.textContent).toBe("✓");
    act(() => h.update(e => ({ ...e, title: "عنوان جديد" })));
    await tick();
    expect(chip().textContent).toBe("● تغييرات غير محفوظة");
    expect(spokenText(chip())).toBe("تغييرات غير محفوظة");
  });
});
