// @vitest-environment happy-dom
// Phase 21E.2 part 2 — Review Fix 2: three re-review findings on where a summary entry puts focus, through the REAL
// StructuredExamBuilder + REAL history hook inside a replica of App's overlay (the same wrapper as inlineIssues.reviewK3.21e2b).
//   RF2-1  a code a question shows more than once (one MATCH_INCOMPLETE_PAIR per incomplete pair) is focused by INSTANCE: each
//          summary entry focuses its own pair — numbered by the same per-row mapping that produces the pair's field error — never
//          the first pair that carries the code;
//   RF2-2  an issue a Field frame shows without an invalid control in that frame (a multiple-choice question without options)
//          focuses the frame's first enabled control («+ إضافة خيار»), else the card's named issue list — never an unrelated
//          invalid field (the marks, the question text). The first invalid field in DOM order stays only for issues no frame shows;
//   RF2-3  the summary's reveal lasts while the question still has an ERROR: a warning it keeps (STIMULUS_MISSING — a stale shared
//          stimulus reference) does not keep a row added later red before the teacher visits it (the C-F3 symptom).
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { evaluateExamFinalization } from "../examFinalization";
import { validateStructuredExam } from "../examQuality";
import { buildMatchingPatch, newQuestion, newSection, type MatchPair } from "../examBuilderState";
import { matchingFieldIssues } from "../teacher/questionFieldIssues";
import type { StructuredIssue } from "../examQuality";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

// The re-review's own examples.
const PAIRS: MatchPair[] = [{ left: "", right: "80" }, { left: "DNS", right: "53" }, { left: "", right: "443" }];
const matching = (id: string, pairs: MatchPair[], extra: Partial<BuilderQuestion> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "matching", marks: 2, ...buildMatchingPatch(pairs), text: "طابق كل بروتوكول بمنفذه", ...extra } as BuilderQuestion);
const mcq = (id: string, text: string, marks: number, extra: Partial<BuilderQuestion> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks, options: [], answer: {}, ...extra } as BuilderQuestion);
const sa = (id: string, text: string, marks = 2, extra: Partial<BuilderQuestion> = {}): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "shortAnswer", text, marks, answer: { text: "-" }, ...extra } as BuilderQuestion);
const examWith = (...questions: BuilderQuestion[]): StructuredExam => ({ examId: "exRF2", title: "امتحان المراجعة الثانية", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  sections: [{ id: "s1", title: "الأسئلة", gradingPolicy: "all", stimuli: {}, questions }] } as unknown as StructuredExam);

const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void; setSaving: (v: boolean) => void; present: StructuredExam };
let initialExam: () => StructuredExam = () => examWith();
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(initialExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { update: hist.update, setSaving, present: hist.present }); }, [hist]);
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
const summary = () => document.querySelector<HTMLElement>(".sb-issues")!;
/** The canonical issues of one question, in the order the finalization decision holds them (errors, then warnings). */
const issuesOf = (questionId: string, exam: StructuredExam = h.present) => { const d = evaluateExamFinalization(exam); return [...d.structuralErrors, ...d.structuralWarnings].filter(i => i.questionId === questionId); };
const issueOf = (questionId: string, code: string) => { const i = issuesOf(questionId).find(x => x.code === code); if (!i) throw new Error("no " + code + " on " + questionId); return i; };
/** The summary entry (a button) for one canonical issue, found by that issue's own message. */
const entryFor = (i: StructuredIssue) => {
  const hits = within(summary()).getAllByRole("button").filter(b => b.classList.contains("sb-issue-link") && (b.textContent || "").includes(i.message));
  expect(hits, i.code + " entry").toHaveLength(1);
  return hits[0];
};
/** What the focused element is called (its label / name / text), for a failure message that says where focus went. */
const focused = () => { const a = document.activeElement as HTMLElement | null; const label = a?.id ? document.querySelector(`label[for="${a.id}"]`)?.textContent : null; return "focused: " + (label || a?.getAttribute("aria-label") || (a?.textContent || a?.tagName || "").trim().slice(0, 40)); };
/** Focus is exactly this element (the failure names where it went instead). */
const expectFocus = (el: Element) => expect(document.activeElement, focused()).toBe(el);
const open = async (i: StructuredIssue) => { fireEvent.click(entryFor(i)); await tick(); };

describe("RF2-1 — a repeated code is focused by its instance", () => {
  it("two incomplete pairs: «الزوج 3» focuses pair 3 and «الزوج 1» pair 1", async () => {
    await mount(() => examWith(matching("m1", PAIRS)));
    const pairs = issuesOf("m1");
    expect(pairs.map(i => i.code)).toEqual(["MATCH_INCOMPLETE_PAIR", "MATCH_INCOMPLETE_PAIR"]);
    expect(pairs[0].message).toMatch(/^الزوج 1 /);
    expect(pairs[1].message).toMatch(/^الزوج 3 /);
    await open(pairs[1]);
    const left3 = within(card("m1")).getByLabelText("العنصر 3");
    expectFocus(left3);
    expect(scrollCalls.at(-1)!.el).toBe(left3.closest(".eb-field"));                      // its own frame aligned below the toolbar
    expect(scrollCalls.at(-1)!.margin).toBe(CLEARANCE + "px");
    await open(pairs[0]);
    expectFocus(within(card("m1")).getByLabelText("العنصر 1"));
    await open(pairs[1]);
    expectFocus(within(card("m1")).getByLabelText("العنصر 3"));
  });
  it("the instance's own invalid control: a pair missing both sides focuses its item, a pair missing its answer focuses the answer", async () => {
    await mount(() => examWith(matching("m2", [{ left: "HTTP", right: "80" }, { left: "", right: "" }, { left: "SSH", right: "" }])));
    const [two, three] = issuesOf("m2");
    expect(two.message).toMatch(/^الزوج 2 /);
    expect(three.message).toMatch(/^الزوج 3 /);
    await open(three);
    expectFocus(within(card("m2")).getByLabelText("الإجابة الصحيحة للعنصر 3"));
    await open(two);
    expectFocus(within(card("m2")).getByLabelText("العنصر 2"));
  });
  it("the per-row mapping numbers each incomplete pair as its canonical instance (the k-th MATCH_INCOMPLETE_PAIR names that pair)", () => {
    const sets: MatchPair[][] = [PAIRS, [{ left: "", right: "" }, { left: "a", right: "1" }, { left: "b", right: " " }, { left: " ", right: "2" }], [{ left: "a", right: "1" }], [{ left: "", right: "1" }]];
    for (const pairs of sets) {
      const q = newQuestion("matching", { text: "س", ...buildMatchingPatch(pairs) });
      const exam = { examId: "e", title: "t", sections: [{ ...newSection({ title: "ق" }), id: "s", questions: [q] }] } as unknown as StructuredExam;
      const instances = validateStructuredExam(exam).filter(i => i.questionId === q.examQuestionId && i.code === "MATCH_INCOMPLETE_PAIR");
      const rows = Object.entries(matchingFieldIssues(q).pairs) as [string, { nth?: number }][];
      expect(rows.length, JSON.stringify(pairs)).toBe(instances.length);
      for (const [row, entry] of rows) expect(instances[(entry.nth ?? 0) - 1]?.message, JSON.stringify(pairs) + " row " + row).toMatch(new RegExp("^الزوج " + (Number(row) + 1) + " "));
    }
  });
  it("every (code, instance) a revealed card's frames carry is one of its canonical issues, and every shown instance is carried", async () => {
    await mount(() => examWith(matching("m1", PAIRS)));
    await open(issuesOf("m1")[0]);
    const canonicalInstances = new Set<string>(), seen = new Map<string, number>();
    for (const i of issuesOf("m1")) { const n = (seen.get(i.code) ?? 0) + 1; seen.set(i.code, n); canonicalInstances.add(i.code + "#" + n); }
    const carried = new Set(Array.from(card("m1").querySelectorAll<HTMLElement>("[data-issue-codes]")).flatMap(f => f.dataset.issueCodes!.split(" ").map(c => c + "#" + (f.dataset.issueNth ?? "1"))));
    expect([...carried].sort()).toEqual([...canonicalInstances].sort());
  });
});

describe("RF2-2 — an issue a frame shows is focused in that frame", () => {
  it("options [] and marks 0: MISSING_OPTIONS / MISSING_ANSWER focus «+ إضافة خيار», never the (invalid) marks", async () => {
    await mount(() => examWith(mcq("c1", "اختر البروتوكول", 0)));
    expect(issuesOf("c1").map(i => i.code)).toEqual(["MARKS_PROBLEM", "MISSING_OPTIONS", "MISSING_ANSWER"]);
    await open(issueOf("c1", "MISSING_OPTIONS"));
    const frame = within(card("c1")).getByRole("group", { name: "الخيارات والإجابة الصحيحة" });
    const addOption = within(frame).getByRole("button", { name: "+ إضافة خيار" });            // the accessible name of the focused control
    expectFocus(addOption);
    expect(within(card("c1")).getByLabelText("العلامة").getAttribute("aria-invalid")).toBe("true");   // invalid, revealed — and not where focus went
    expect(scrollCalls.at(-1)!.el).toBe(frame);                                                       // the frame showing the issue, below the toolbar
    expect(scrollCalls.at(-1)!.margin).toBe(CLEARANCE + "px");
    expect(card("c1").classList.contains("sb-q-flash")).toBe(true);
    await open(issueOf("c1", "MISSING_ANSWER"));
    expectFocus(addOption);
    await open(issueOf("c1", "MARKS_PROBLEM"));                                                       // the marks' own issue still focuses them
    expectFocus(within(card("c1")).getByLabelText("العلامة"));
  });
  it("text '', options [], answer {}: MISSING_OPTIONS / MISSING_ANSWER focus «+ إضافة خيار», never the (invalid) question text", async () => {
    await mount(() => examWith(mcq("c2", "", 2)));
    expect(issuesOf("c2").map(i => i.code)).toEqual(["EMPTY_TEXT", "MISSING_OPTIONS", "MISSING_ANSWER"]);
    const addOption = within(card("c2")).getByRole("button", { name: "+ إضافة خيار" });
    await open(issueOf("c2", "MISSING_OPTIONS"));
    expectFocus(addOption);
    await open(issueOf("c2", "MISSING_ANSWER"));
    expectFocus(addOption);
    expect(within(card("c2")).getByLabelText("نص السؤال").getAttribute("aria-invalid")).toBe("true");
    await open(issueOf("c2", "EMPTY_TEXT"));
    expectFocus(within(card("c2")).getByLabelText("نص السؤال"));
  });
  it("pin (A-F4 path): while a save is in flight the frame has no enabled control — the card's named issue list «مشكلات السؤال 1»", async () => {
    await mount(() => examWith(mcq("c1", "اختر البروتوكول", 0)));
    act(() => h.setSaving(true));
    await tick();
    expect(within(card("c1")).getByRole("button", { name: "+ إضافة خيار" }).hasAttribute("disabled")).toBe(true);
    await open(issueOf("c1", "MISSING_OPTIONS"));
    expectFocus(within(card("c1")).getByRole("group", { name: "مشكلات السؤال 1" }));
    expect(scrollCalls.at(-1)!.el).toBe(card("c1"));
  });
  it("pin: an issue no frame shows (STIMULUS_MISSING) keeps the first invalid field in DOM order", async () => {
    await mount(() => examWith(sa("w1", "ما هو المبدّل", 0, { groupId: "g-gone" })));
    expect(issuesOf("w1").map(i => i.code)).toEqual(["MARKS_PROBLEM", "STIMULUS_MISSING"]);
    await open(issueOf("w1", "STIMULUS_MISSING"));
    expectFocus(within(card("w1")).getByLabelText("العلامة"));
  });
});

describe("RF2-3 — the reveal lasts while the question has an error", () => {
  it("a question that keeps only a STIMULUS_MISSING warning: a pair added later is not invalid before the teacher visits it", async () => {
    await mount(() => examWith(matching("r1", [{ left: "HTTP", right: "80" }], { text: "", groupId: "g-gone" })));
    expect(issuesOf("r1").map(i => i.severity + ":" + i.code)).toEqual(["error:EMPTY_TEXT", "warning:STIMULUS_MISSING"]);
    await open(issueOf("r1", "EMPTY_TEXT"));
    const text = within(card("r1")).getByLabelText("نص السؤال");
    expectFocus(text);
    expect(text.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(text, { target: { value: "طابق كل بروتوكول بمنفذه" } });
    await tick();
    expect(issuesOf("r1").map(i => i.severity + ":" + i.code)).toEqual(["warning:STIMULUS_MISSING"]);  // only the warning is left …
    expect(within(card("r1")).getByRole("group", { name: /مشكلات السؤال/ })).toBeTruthy();            // … and still listed in the card
    fireEvent.click(within(card("r1")).getByRole("button", { name: "+ إضافة زوج" }));
    await tick();
    expect(issuesOf("r1").map(i => i.code)).toContain("MATCH_INCOMPLETE_PAIR");                      // the new, empty pair IS an issue
    const left2 = within(card("r1")).getByLabelText("العنصر 2"), right2 = within(card("r1")).getByLabelText("الإجابة الصحيحة للعنصر 2");
    expect(left2.getAttribute("aria-invalid")).toBeNull();
    expect(right2.getAttribute("aria-invalid")).toBeNull();
    fireEvent.blur(right2);                                                                          // … and the touched rule still works
    expect(within(card("r1")).getByLabelText("الإجابة الصحيحة للعنصر 2").getAttribute("aria-invalid")).toBe("true");
  });
  it("pin: a question with only a warning is never revealed — its summary entry still focuses the card's named issue list", async () => {
    await mount(() => examWith(sa("w2", "ما هو المبدّل", 0), sa("w3", "ما هو الموجّه", 2, { groupId: "g-gone" })));
    expect(issuesOf("w3").map(i => i.severity + ":" + i.code)).toEqual(["warning:STIMULUS_MISSING"]);
    await open(issueOf("w3", "STIMULUS_MISSING"));
    expectFocus(within(card("w3")).getByRole("group", { name: "مشكلات السؤال 2" }));
    expect(card("w3").querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
    expect(within(card("w2")).getByLabelText("العلامة").getAttribute("aria-invalid")).toBeNull();     // another question is not revealed
  });
  it("re-review RF2R-1: a summary click still re-opens a COLLAPSED warning-only card (opening is not pruned with the field reveal)", async () => {
    await mount(() => examWith(sa("w2", "ما هو المبدّل", 0), sa("w3", "ما هو الموجّه", 2, { groupId: "g-gone" })));
    fireEvent.click(within(card("w3")).getByRole("button", { name: "طيّ" }));
    await tick();
    expect(within(card("w3")).getByRole("button", { name: "فتح" }).getAttribute("aria-expanded")).toBe("false");
    await open(issueOf("w3", "STIMULUS_MISSING"));
    expect(within(card("w3")).getByRole("button", { name: "طيّ" }).getAttribute("aria-expanded")).toBe("true");   // re-opened
    expect(card("w3").querySelector(".sb-q-body")).not.toBeNull();
    expect(card("w3").querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);                                 // but not revealed
    expectFocus(within(card("w3")).getByRole("group", { name: "مشكلات السؤال 2" }));
  });
  it("pin: while an error is left the reveal stays (a warning beside it changes nothing)", async () => {
    await mount(() => examWith(sa("r2", "", 0, { groupId: "g-gone" })));
    await open(issueOf("r2", "EMPTY_TEXT"));
    fireEvent.change(within(card("r2")).getByLabelText("نص السؤال"), { target: { value: "ما هو المبدّل" } });
    await tick();
    expect(within(card("r2")).getByLabelText("العلامة").getAttribute("aria-invalid")).toBe("true");
  });
});
