// @vitest-environment happy-dom
// Phase 21E.2 (part 2) — D: inline issues, wired through the REAL StructuredExamBuilder + REAL history hook, inside a replica of
// App's overlay (the same wrapper as toolbarWiring.21e2b). Acceptance criterion D: "issues next to their question with a live
// region; a summary click reveals the question below the sticky toolbar". Pins:
//   - the inline lists show the SAME canonical issues the summary shows (evaluateExamFinalization's structural errors + warnings),
//     regrouped by question / section — never re-validated; a question's list sits in its card (outside the collapsible body),
//     a section-level list in its section header; exam-level issues stay in the summary only;
//   - exactly one polite live region for issues, always mounted, silent on first render and on edits that keep the counts,
//     announcing the settled counts once;
//   - a summary entry that belongs to a question / section is a button naming its target; it reveals the target below the
//     sticky toolbar with the builder's existing alignment, moves focus there (the question's first invalid field), and shows
//     that question's field errors at once (FieldRevealContext) — without touching the selection or the navigator;
//   - fixing the problem removes its inline list and its summary entry.
// Fail-first: run against 68894ae (building blocks shipped, nothing wired) before the wiring existed.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useEffect, useRef, useState } from "react";
import { render, cleanup, fireEvent, act, within } from "@testing-library/react";
import StructuredExamBuilder from "../StructuredExamBuilder";
import { useStructuredExamHistory } from "../useStructuredExamHistory";
import { examSaveState } from "../examHistory";
import { evaluateExamFinalization } from "../examFinalization";
import { indexIssues, issueSummaryText, issueTargets } from "./issueIndex";
import type { StructuredIssue } from "../examQuality";
import type { StructuredExam, BuilderQuestion } from "../examTypes";

const mcq = (id: string, text: string): BuilderQuestion =>
  ({ examQuestionId: id, presentationType: "multipleChoice", text, marks: 2, options: [{ text: "أ" }, { text: "ب" }], answer: { correctOptionIndex: 0 } } as BuilderQuestion);
// q2 has no text (EMPTY_TEXT, a question error); s2 has no questions (EMPTY_SECTION, a section warning); the unsupported
// presentation version is an exam-level error (no section, no question).
const makeExam = (): StructuredExam => ({ examId: "ex1", title: "امتحان الشبكات", status: "draft", schemaVersion: 2, updatedAt: "2026-03-01T10:00:00.000Z",
  presentation: { schemaVersion: 99 },
  sections: [
    { id: "s1", title: "الشبكات", gradingPolicy: "all", stimuli: {}, questions: [mcq("q1", "ما هو الراوتر"), mcq("q2", "")] },
    { id: "s2", title: "فارغ", gradingPolicy: "all", stimuli: {}, questions: [] },
  ] } as unknown as StructuredExam);
const canonical = () => { const d = evaluateExamFinalization(makeExam()); return [...d.structuralErrors, ...d.structuralWarnings]; };
const kind = (s: "error" | "warning") => (s === "error" ? "خطأ:" : "تنبيه:");
const line = (i: { severity: "error" | "warning"; message: string }) => kind(i.severity) + " " + i.message;

const h = {} as { update: (u: (e: StructuredExam) => StructuredExam) => void };
function Host() {
  const hist = useStructuredExamHistory();
  const booted = useRef(false);
  const [saving] = useState(false);
  useEffect(() => { if (!booted.current) { booted.current = true; hist.open(makeExam(), "saved"); } }, [hist]);
  useEffect(() => { Object.assign(h, { update: hist.update }); }, [hist]);
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
const summaryItems = () => Array.from(summary().querySelectorAll<HTMLElement>(".sb-issues-list > li"));
const questionText = (id: string) => within(card(id)).getByLabelText("نص السؤال");
const describedText = (el: Element) => (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || "").join(" | ");
const liveRegions = () => Array.from(document.querySelectorAll<HTMLElement>("[data-issue-live]"));
const EMOJI = /\p{Extended_Pictographic}/u;

describe("D — inline issues next to their question / section", () => {
  it("a question's canonical issues are listed in its card, outside the collapsible body, as «مشكلات السؤال N»; a valid card has none", async () => {
    await mount();
    const expected = canonical().filter(i => i.questionId === "q2").map(line);
    expect(expected.length).toBeGreaterThan(0);
    const group = within(card("q2")).getByRole("group", { name: "مشكلات السؤال 2" });
    expect(within(group).getAllByRole("listitem").map(li => li.textContent)).toEqual(expected);
    expect(group.id).toBe("sb-issues-q-q2");
    expect(group.getAttribute("aria-live")).toBeNull();
    expect(group.closest(".sb-q-body")).toBeNull();                                  // visible while the card is collapsed too
    expect(within(card("q1")).queryByRole("group", { name: /مشكلات السؤال/ })).toBeNull();
    fireEvent.click(within(card("q2")).getByRole("button", { name: "طيّ" }));
    expect(within(card("q2")).queryByLabelText("نص السؤال")).toBeNull();
    expect(within(card("q2")).getByRole("group", { name: "مشكلات السؤال 2" })).toBeTruthy();
  });
  it("a section-level issue is listed in its section header as «مشكلات القسم N»; exam-level issues stay out of every inline list", async () => {
    await mount();
    const expected = canonical().filter(i => i.sectionId === "s2" && !i.questionId).map(line);
    expect(expected.length).toBeGreaterThan(0);
    const group = within(sectionEl("s2")).getByRole("group", { name: "مشكلات القسم 2" });
    expect(group.closest(".sb-section-head")).not.toBeNull();
    expect(within(group).getAllByRole("listitem").map(li => li.textContent)).toEqual(expected);
    expect(within(sectionEl("s1")).queryByRole("group", { name: "مشكلات القسم 1" })).toBeNull();
    const examLevel = canonical().filter(i => !i.questionId && !i.sectionId);
    expect(examLevel.length).toBeGreaterThan(0);
    const inline = Array.from(document.querySelectorAll(".sb-inline-issues")).map(g => g.textContent).join("\n");
    for (const i of examLevel) expect(inline).not.toContain(i.message);
  });
  it("the summary lists exactly the canonical issues, in order, each with a text severity (no emoji)", async () => {
    await mount();
    const items = summaryItems(), want = canonical();
    expect(items).toHaveLength(want.length);
    items.forEach((li, n) => expect((li.textContent || "").startsWith(line(want[n])), li.textContent || "").toBe(true));
    for (const li of items) expect(EMOJI.test(li.textContent || ""), li.textContent || "").toBe(false);
    expect(summary().querySelector("button.sb-issues-head")!.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("D — one polite live region for issues", () => {
  it("is mounted once, silent on first render and on edits that keep the counts, and announces the settled counts once", async () => {
    await mount();
    expect(liveRegions()).toHaveLength(1);
    const live = liveRegions()[0];
    expect(live.getAttribute("role")).toBe("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(document.querySelectorAll(".sb-issues [aria-live], .sb-inline-issues[aria-live], .sb-inline-issues [aria-live]")).toHaveLength(0);
    await tick(1000);
    expect(live.textContent).toBe("");
    act(() => h.update(e => ({ ...e, title: "امتحان معدّل" })));                     // counts unchanged → nothing to announce
    await tick(1000);
    expect(liveRegions()[0].textContent).toBe("");
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q2" ? { ...q, text: "ما هو المبدّل" } : q)) })) })));
    await tick(300);
    expect(liveRegions()[0].textContent).toBe("");                                   // not before the counts settle
    await tick(900);
    const d = evaluateExamFinalization(makeExam());
    expect(liveRegions()).toHaveLength(1);
    expect(liveRegions()[0].textContent).toBe(issueSummaryText(d.structuralErrors.length - 1, d.structuralWarnings.length));
  });
});

describe("D — summary entries reveal their target", () => {
  it("a question issue is a button naming the question; it reveals the question below the toolbar, focuses its invalid field and shows its error — the selection is untouched", async () => {
    await mount();
    const text = questionText("q2");
    expect(text.getAttribute("aria-invalid")).toBeNull();                             // not shown before the teacher asks
    const emptyText = canonical().find(i => i.questionId === "q2")!;
    const btn = within(summary()).getByRole("button", { name: /السؤال 2/ });
    expect(btn.textContent).toContain(emptyText.message);
    expect(btn.textContent).toMatch(/القسم 1/);
    expect(btn.closest(".sb-toolbar")).toBeNull();
    fireEvent.click(btn);
    await tick();
    const field = questionText("q2");
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(field)).toBe("اكتب نص السؤال؛ السؤال بلا نص لا يُعتمد.");
    expect(scrollCalls).toHaveLength(1);                                              // one reveal, by the existing alignment
    expect(card("q2").contains(scrollCalls[0].el)).toBe(true);
    expect(scrollCalls[0].opts).toEqual({ block: "center", behavior: "smooth" });
    expect(scrollCalls[0].margin).toBe(CLEARANCE + "px");
    expect(card("q2").classList.contains("sb-q-flash")).toBe(true);
    expect(within(card("q2")).getByRole("checkbox", { name: "تحديد السؤال" })).toHaveProperty("checked", false);
    expect(document.querySelector(".sb-bulk-bar")).toBeNull();
    expect(document.querySelector(".sb-workspace.has-navigator")).toBeNull();
  });
  it("a collapsed question is opened by the reveal", async () => {
    await mount();
    fireEvent.click(within(card("q2")).getByRole("button", { name: "طيّ" }));
    expect(within(card("q2")).queryByLabelText("نص السؤال")).toBeNull();
    fireEvent.click(within(summary()).getByRole("button", { name: /السؤال 2/ }));
    await tick();
    const field = questionText("q2");
    expect(document.activeElement).toBe(field);
    expect(field.getAttribute("aria-invalid")).toBe("true");
  });
  // K3 A-F4: focus goes to the section's NAMED issue list «مشكلات القسم 2» (the unnamed <section> it used to focus announced nothing).
  it("a section issue is a button naming the section; it reveals the section heading below the toolbar and focuses the section's issue list", async () => {
    await mount();
    const emptySection = canonical().find(i => i.sectionId === "s2" && !i.questionId)!;
    const btn = within(summary()).getByRole("button", { name: /القسم 2/ });
    expect(btn.textContent).toContain(emptySection.message);
    fireEvent.click(btn);
    await tick();
    expect(document.activeElement).toBe(within(sectionEl("s2")).getByRole("group", { name: "مشكلات القسم 2" }));
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0].el).toBe(sectionEl("s2"));
    expect(scrollCalls[0].opts).toEqual({ block: "start", behavior: "smooth" });
    expect(scrollCalls[0].margin).toBe(CLEARANCE + "px");
  });
  it("exam-level issues stay plain list items (no button)", async () => {
    await mount();
    const examLevel = canonical().filter(i => !i.questionId && !i.sectionId);
    for (const i of examLevel) {
      const li = summaryItems().find(x => (x.textContent || "").includes(i.message))!;
      expect(li, i.message).toBeTruthy();
      expect(li.querySelector("button")).toBeNull();
    }
    expect(within(summary()).getAllByRole("button").filter(b => !b.classList.contains("sb-issues-head"))).toHaveLength(canonical().length - examLevel.length);
  });
});

describe("D — summary targets come from the index's own buckets", () => {
  it("names a question by its display number (else its position) and its own section; a section by its position; exam-level → none", () => {
    const I = (id: string, extra: Partial<StructuredIssue>): StructuredIssue => ({ id, severity: "error", code: "X", message: "m" + id, ...extra });
    // "c" comes from s1's rule but names a question that lives in s2 (like SCENARIO_QUESTION_CROSS_SECTION): it leads to that card.
    const issues = [I("a", { sectionId: "s1", questionId: "q1" }), I("b", { sectionId: "s2" }), I("c", { sectionId: "s1", questionId: "r1" }), I("d", {}), I("e", { sectionId: "s1", questionId: "gone" })];
    const sections = [{ id: "s1", questions: [{ examQuestionId: "q0" }, { examQuestionId: "q1", displayNumber: " 3أ " }] }, { id: "s2", questions: [{ examQuestionId: "r1" }] }];
    const idx = indexIssues(issues, { questionIds: new Set(["q0", "q1", "r1"]), sectionIds: new Set(["s1", "s2"]) });
    const t = issueTargets(idx, sections);
    expect(t.get(issues[0])).toEqual({ kind: "question", id: "q1", label: "السؤال 3أ في القسم 1" });
    expect(t.get(issues[1])).toEqual({ kind: "section", id: "s2", label: "القسم 2" });
    expect(t.get(issues[2])).toEqual({ kind: "question", id: "r1", label: "السؤال 1 في القسم 2" });
    expect(t.has(issues[3])).toBe(false);
    expect(t.has(issues[4])).toBe(false);                                            // a vanished target stays a plain summary item
    expect(t.size).toBe(issues.length - idx.exam.length);
  });
});

describe("D — fixing the problem", () => {
  it("removes the question's inline list and its summary entry, and clears the revealed field error", async () => {
    await mount();
    fireEvent.click(within(summary()).getByRole("button", { name: /السؤال 2/ }));
    await tick();
    expect(questionText("q2").getAttribute("aria-invalid")).toBe("true");
    act(() => h.update(e => ({ ...e, sections: e.sections.map(s => ({ ...s, questions: s.questions.map(q => (q.examQuestionId === "q2" ? { ...q, text: "ما هو المبدّل" } : q)) })) })));
    await tick();
    expect(within(card("q2")).queryByRole("group", { name: /مشكلات السؤال/ })).toBeNull();
    expect(within(summary()).queryByRole("button", { name: /السؤال 2/ })).toBeNull();
    expect(questionText("q2").getAttribute("aria-invalid")).toBeNull();
    expect(within(sectionEl("s2")).getByRole("group", { name: "مشكلات القسم 2" })).toBeTruthy();   // the other issues stay
  });
});
